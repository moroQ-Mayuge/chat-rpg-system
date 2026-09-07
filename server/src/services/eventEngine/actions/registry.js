import { executeCharacterJoin } from './characterJoin.js';
import { executeCharacterLeave } from './characterLeave.js';
import { executeInsertDialogue } from './insertDialogue.js';
import { executeGenerateImage } from './generateImage.js';
import { executeSetFlag } from './setFlag.js';
import { executeChangeRelationship } from './changeRelationship.js';
import { executeChangeOutfit } from './changeOutfit.js';
import { executeAdvanceTime } from './advanceTime.js';
import { executeGrantItem } from './grantItem.js';
import { executeRemoveItem } from './removeItem.js';
import { executeChangeStatus } from './changeStatus.js';
import { executeSetAddress } from './setAddress.js';
import { executeSpendMoney } from './spendMoney.js';
import { executeSetSceneSituation } from './setSceneSituation.js';
import { executeGrantRandomItem } from './grantRandomItem.js';
import { executeSetCharacterImpression } from './setCharacterImpression.js';
import { executeAddCharacterMemory } from './addCharacterMemory.js';
import { executeMakeItemAvailable } from './makeItemAvailable.js';
import { executeConceive } from './conceive.js';
import { executeEndPregnancy } from './endPregnancy.js';
import { executeSetTimer } from './setTimer.js';
import { executeClearTimer } from './clearTimer.js';
import { executeTimeSkip } from './timeSkip.js';
import { executeTransformCharacter } from './transformCharacter.js';
import { executeForceRoomTransfer } from './forceRoomTransfer.js';
import { executeSetPose } from './setPose.js';
import { executeEndSession } from './endSession.js';
import { executeSetAccompanying } from './setAccompanying.js';

export const actionRegistry = {
  character_join: executeCharacterJoin,
  character_leave: executeCharacterLeave,
  insert_dialogue: executeInsertDialogue,
  generate_image: executeGenerateImage,
  set_flag: executeSetFlag,
  change_relationship: executeChangeRelationship,
  change_outfit: executeChangeOutfit,
  advance_time: executeAdvanceTime,
  grant_item: executeGrantItem,
  remove_item: executeRemoveItem,
  change_status: executeChangeStatus,
  set_address: executeSetAddress,
  spend_money: executeSpendMoney,
  set_scene_situation: executeSetSceneSituation,
  grant_random_item: executeGrantRandomItem,
  set_character_impression: executeSetCharacterImpression,
  add_character_memory: executeAddCharacterMemory,
  make_item_available: executeMakeItemAvailable,
  conceive: executeConceive,
  end_pregnancy: executeEndPregnancy,
  set_timer: executeSetTimer,
  clear_timer: executeClearTimer,
  time_skip: executeTimeSkip,
  transform_character: executeTransformCharacter,
  force_room_transfer: executeForceRoomTransfer,
  set_pose: executeSetPose,
  end_session: executeEndSession,
  set_accompanying: executeSetAccompanying,
};

export async function executeAction(action, execCtx) {
  const executor = actionRegistry[action.action_type];
  if (!executor) {
    console.warn(`Unknown event action_type: ${action.action_type}`);
    return { skipped: true, reason: 'unknown_action_type' };
  }
  return executor(action.params, execCtx);
}
