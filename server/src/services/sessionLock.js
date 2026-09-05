// 同一room_sessionに対する非同期の後処理(会話生成の事後フック・/move・/exit)が
// 互いを追い越さないようにする直列化ロック。better-sqlite3自体は同期・単一接続
// だが、これらの処理は「チェックポイント値を読む→LLM呼び出し(非同期)→書き戻す」
// という形のため、その間に同じセッションへの別リクエストが割り込むと両方が
// 同じ古い値を読んでしまう(TOCTOU)。実際に観測した実害: 記憶抽出の準重複、
// 時間帯境界での兄弟セッションの二重生成(いずれもcontinuous_room_sessions.md参照)。
// 単一Nodeプロセス内で完結するFIFOキューで十分なので、DBロック等は導入しない。
const chains = new Map();

export function withSessionLock(sessionId, fn) {
  const previous = chains.get(sessionId) ?? Promise.resolve();
  const run = previous.then(fn, fn);
  // 成否に関わらず後続の待ち手を進める(前段の失敗を引きずって以降が全滅しない
  // ようにする)。呼び出し元へは`run`自体を返すので、失敗は呼び出し元に伝わる。
  const settled = run.then(
    () => {},
    () => {},
  );
  chains.set(sessionId, settled);
  settled.then(() => {
    // 誰も新しい処理を積んでいなければエントリを掃除する(セッションIDは
    // アプリ寿命の間ずっと使われ得るため、無限に溜まらないようにする)。
    if (chains.get(sessionId) === settled) chains.delete(sessionId);
  });
  return run;
}
