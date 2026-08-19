// モデル評価の実行エンジン。
//
// 本番と同じプロンプト経路(buildMultiCharacterMessages)と同じ解釈経路
// (parseScriptLine)を通すのが要点——「このアプリのシステムにどれだけ適応
// できるか」を測るのが目的なので、評価専用の簡易プロンプトを作ってしまうと
// 測りたいものが測れなくなる。
//
// 一方で本番のgenerateReply()が行うDB書き込み(アイテム付与・関係値変動・
// イベントエンジン・画像生成)は一切通さない。評価は採点のための生成であって、
// ゲーム状態を進める行為ではないため。
import { db } from '../../db/connection.js';
import { generateChatCompletion, getModelStatus, countTokens, invalidateContextLengthCache } from '../koboldClient.js';
import { launchKoboldcpp, stopKoboldcpp } from '../koboldcppLauncher.js';
import { getLaunchSettings, updateLaunchSettings } from '../../db/repositories/koboldcppLaunchSettingsRepo.js';
import { getGenerationSettings } from '../../db/repositories/llmGenerationSettingsRepo.js';
import { buildMultiCharacterMessages } from '../promptBuilder.js';
import { parseScriptLine } from '../responseParser.js';
import { buildParticipantResolver } from '../participantNaming.js';
import { composeCharacterIdentity } from '../characterIdentity.js';
import { getCharacter } from '../../db/repositories/charactersRepo.js';
import { getTransformation } from '../../db/repositories/characterTransformationsRepo.js';
import { getCurrentAddress } from '../../db/repositories/characterAddressStatesRepo.js';
import { createPlaythrough, deletePlaythrough, resolveProtagonist } from '../../db/repositories/playthroughsRepo.js';
import { createRoomSession, addParticipant, getRoomSession } from '../../db/repositories/roomSessionsRepo.js';
import { createMessage } from '../../db/repositories/messagesRepo.js';
import { getWorld } from '../../db/repositories/worldsRepo.js';
import { scoreAll } from './scorers.js';
import {
  getScenario, createRun, getRun, updateRunProgress, finishRun, createResult,
} from '../../db/repositories/modelEvalRepo.js';

// 実行中のrunは1本だけ。並行実行を許すとモデル切替が競合して壊れる。
let activeRun = null;

export function getActiveRunId() {
  return activeRun?.runId ?? null;
}

export function cancelActiveRun() {
  if (!activeRun) return { cancelled: false, reason: 'not_running' };
  activeRun.cancelRequested = true;
  return { cancelled: true, run_id: activeRun.runId };
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// launchKoboldcpp()はロード完了を待たずに返るため、モデルがロードし終わるまで
// 自前で待つ必要がある(このアプリで初めてのサーバ側待機処理)。
// getModelStatus()はポートが死んでいる間は例外を投げるので、その間は「まだ
// 起動していない」として飲み込む。
export async function waitForModelReady({ timeoutMs = 10 * 60_000, intervalMs = 3000, isCancelled } = {}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (isCancelled?.()) throw new Error('cancelled');
    try {
      const status = await getModelStatus();
      if (status?.result) {
        // 別モデルで再起動した直後は前モデルのコンテキスト長がキャッシュに
        // 残っており、プロンプトのサイズ計算がずれる。
        invalidateContextLengthCache();
        return status.result;
      }
    } catch {
      // 起動途中でポートがまだ開いていない。待ち続ける。
    }
    await sleep(intervalMs);
  }
  throw new Error(`モデルのロードが${Math.round(timeoutMs / 1000)}秒以内に完了しませんでした`);
}

async function switchModel(filename, isCancelled) {
  await stopKoboldcpp();
  // 停止直後にすぐ起動するとポートの解放と競合するため少し置く
  await sleep(2000);
  const current = getLaunchSettings();
  // llm_model_pathはkoboldcpp/からの相対で保存する(koboldcppLauncher.jsの
  // resolveModelPathがconfig.koboldcppDirを基準に解決するため)
  updateLaunchSettings({ ...current, llm_model_path: `models/llm/${filename}` });
  launchKoboldcpp();
  return waitForModelReady({ isCancelled });
}

// promptBuilder.jsが人物カードを作る時と同じ「実効キャラ」を組み立てる。
// 変身中は名前や口調が変わり、呼び方はルート内の進行(getCurrentAddress)で
// 上書きされるため、素のcharactersの行と照合すると誤判定になる。
function buildEffectiveCharacters(session, playthroughId) {
  const map = new Map();
  for (const p of session.participants) {
    const character = getCharacter(p.character_id);
    if (!character) continue;
    const transformation = p.current_transformation_id ? getTransformation(p.current_transformation_id) : null;
    const identity = composeCharacterIdentity(character, transformation);
    const address = getCurrentAddress(playthroughId, p.character_id);
    map.set(p.character_id, {
      ...identity,
      name: p.name,
      ...(address ? { call_user_as: address } : {}),
    });
  }
  return map;
}

// シナリオが指定した配役だけを場に残す。部屋の自動出現に任せると時間帯や
// 乱数で顔ぶれが変わり、モデル間の比較が成立しなくなる。
function enforceCast(sessionId, characterIds) {
  const wanted = new Set(characterIds);
  const present = db
    .prepare('SELECT character_id FROM room_session_characters WHERE room_session_id = ? AND is_active = 1')
    .all(sessionId)
    .map((r) => r.character_id);
  for (const characterId of present) {
    if (!wanted.has(characterId)) {
      db.prepare('UPDATE room_session_characters SET is_active = 0 WHERE room_session_id = ? AND character_id = ?').run(
        sessionId,
        characterId,
      );
    }
  }
  for (const characterId of characterIds) {
    if (!present.includes(characterId)) addParticipant(sessionId, characterId);
  }
}

// 1シナリオ1試行。使い捨てのルートを作り、終わったら必ず消す。
async function runScenarioOnce({ scenario, modelName, runId, repetition, sampler, isCancelled, onTurnDone }) {
  const world = getWorld(scenario.world_id);
  if (!world) throw new Error(`シナリオ「${scenario.name}」のWorldが存在しません`);

  let playthrough = null;
  try {
    playthrough = createPlaythrough(scenario.world_id, `__model_eval__${runId}_${scenario.id}_${repetition}`);
    const created = createRoomSession(playthrough.id, scenario.room_template_id);
    enforceCast(created.id, scenario.character_ids);

    const protagonist = resolveProtagonist(playthrough.id);
    const validEmotionKeys = new Set(db.prepare('SELECT llm_tag_key FROM expression_types').all().map((r) => r.llm_tag_key));
    const validPoseKeys = new Set(db.prepare('SELECT llm_tag_key FROM pose_masters').all().map((r) => r.llm_tag_key));

    let prevOutput = null;
    for (const [turnIndex, turn] of scenario.turns.entries()) {
      if (isCancelled()) throw new Error('cancelled');

      // ユーザー発言を本番同様に履歴へ積む。ネガティブ文脈の「ターンを継続
      // しても拒絶が維持されるか」は履歴が積まれて初めて測れるため必須。
      createMessage(created.id, { sender_type: 'user', content: turn.user_message });

      const session = getRoomSession(created.id);
      const built = await buildMultiCharacterMessages(session, {
        responseTokenReserve: world.max_response_tokens ?? undefined,
      });
      if (!built) throw new Error('プロンプトを構築できませんでした（参加者が居ない可能性）');

      const startedAt = Date.now();
      // サンプラー6項目を明示的に渡す。省略するとkoboldClientが
      // llm_generation_settingsを都度読むため、実行中に設定が変わると
      // モデル間の条件が揃わなくなる。
      const rawText = await generateChatCompletion({
        messages: built.messages,
        stop: ['ユーザー:', 'User:'],
        stream: false,
        ...(world.max_response_tokens ? { maxTokens: world.max_response_tokens } : {}),
        ...sampler,
      });
      const latencyMs = Date.now() - startedAt;

      const lines = rawText.split('\n').map(parseScriptLine).filter(Boolean);
      const resolver = buildParticipantResolver(session.participants);
      const scores = scoreAll({
        rawText,
        lines,
        resolver,
        participants: session.participants,
        protagonist,
        characters: buildEffectiveCharacters(session, playthrough.id),
        assertion: turn,
        prevOutput,
        latencyMs,
        validEmotionKeys,
        validPoseKeys,
        departedNames: new Set(
          (session.all_participants ?? []).filter((p) => !p.is_active).map((p) => p.name),
        ),
      });

      const promptTokens = await countTokens(built.messages.map((m) => m.content).join('\n'));
      createResult({
        run_id: runId,
        model_name: modelName,
        scenario_id: scenario.id,
        scenario_name: scenario.name,
        repetition,
        turn_index: turnIndex,
        user_message: turn.user_message,
        raw_output: rawText,
        scores,
        latency_ms: latencyMs,
        prompt_tokens: promptTokens,
        output_chars: rawText.length,
      });

      // モデルの出力も履歴へ積む。ここを飛ばすと2ターン目以降が「前の応答が
      // 無かった」文脈になり、多ターンのシナリオが意味を失う。
      for (const line of lines) {
        if (line.type === 'character') {
          const p = resolver.resolve(line.characterName);
          if (p) {
            createMessage(created.id, {
              sender_type: 'character',
              character_id: p.character_id,
              content: line.text,
              emotion_tag: line.emotionKey ?? null,
            });
          }
        } else if (line.type === 'narration') {
          createMessage(created.id, { sender_type: 'narration', content: line.text });
        }
      }

      prevOutput = rawText;
      onTurnDone();
    }
  } finally {
    // 例外・中断のどちらでも使い捨てルートを残さない。deletePlaythroughは
    // room_sessions→messages等を1トランザクションで連鎖削除する。
    if (playthrough) {
      try {
        deletePlaythrough(playthrough.id);
      } catch (err) {
        console.error('model eval: 使い捨てルートの削除に失敗:', err);
      }
    }
  }
}

// 実行本体。呼び出し側は待たずに返し、進捗はDBのrun行を見てもらう。
export function startRun({ scenarioIds, modelFilenames, repetitions = 1, mode = 'auto', weights }) {
  if (activeRun) throw new Error('既に評価を実行中です');

  const scenarios = scenarioIds.map(getScenario).filter(Boolean);
  if (scenarios.length === 0) throw new Error('有効なシナリオがありません');
  const models = mode === 'current' ? ['__current__'] : modelFilenames;
  if (models.length === 0) throw new Error('評価対象のモデルが指定されていません');

  const turnsPerRepetition = scenarios.reduce((sum, s) => sum + s.turns.length, 0);
  const progressTotal = models.length * repetitions * turnsPerRepetition;

  // 実行中はサンプラーを固定する。全モデルを同条件で比べるため。
  const gen = getGenerationSettings();
  const sampler = {
    temperature: gen.temperature,
    repPen: gen.rep_pen,
    repPenRange: gen.rep_pen_range,
    topP: gen.top_p,
    topK: gen.top_k,
    minP: gen.min_p,
  };

  const run = createRun({
    mode,
    model_names: mode === 'current' ? [] : modelFilenames,
    repetitions,
    sampler_settings: sampler,
    weights: weights ?? {},
    progress_total: progressTotal,
  });

  activeRun = { runId: run.id, cancelRequested: false };
  const isCancelled = () => activeRun?.cancelRequested === true;

  (async () => {
    let done = 0;
    try {
      for (const model of models) {
        if (isCancelled()) throw new Error('cancelled');

        let modelName = model;
        if (mode === 'current') {
          const status = await getModelStatus();
          modelName = status?.result ?? '(不明なモデル)';
        } else {
          updateRunProgress(run.id, { progress_done: done, current_label: `${model} をロード中…` });
          modelName = await switchModel(model, isCancelled);
        }

        for (const scenario of scenarios) {
          for (let rep = 1; rep <= repetitions; rep += 1) {
            if (isCancelled()) throw new Error('cancelled');
            updateRunProgress(run.id, {
              progress_done: done,
              current_label: `${modelName} / ${scenario.name}（${rep}/${repetitions}回目）`,
            });
            await runScenarioOnce({
              scenario,
              modelName,
              runId: run.id,
              repetition: rep,
              sampler,
              isCancelled,
              onTurnDone: () => {
                done += 1;
                updateRunProgress(run.id, {
                  progress_done: done,
                  current_label: `${modelName} / ${scenario.name}（${rep}/${repetitions}回目）`,
                });
              },
            });
          }
        }
      }
      finishRun(run.id, { status: 'completed' });
    } catch (err) {
      const cancelled = err.message === 'cancelled' || isCancelled();
      finishRun(run.id, { status: cancelled ? 'cancelled' : 'failed', error: cancelled ? '' : err.message });
    } finally {
      activeRun = null;
    }
  })();

  return getRun(run.id);
}
