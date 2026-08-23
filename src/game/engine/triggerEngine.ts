import type { CardInstance, EffectDefinition } from "../cards/cardTypes";
import type { GameState } from "../state/GameState";
import { addLog } from "../utils/gameLog";
import { createTimingContext, type TimingContext } from "./simultaneousEngine";

export function enqueueTriggeredEffects(
  state: GameState,
  source: CardInstance,
  effects: readonly EffectDefinition[],
  cause: string,
  timingContext: TimingContext = createTimingContext(state, cause),
  allowSealed = false,
  orderConfirmed = false,
): void {
  if (effects.length === 0 || (source.sealed && !allowSealed)) return;
  state.pendingEffects.push({
    sourceInstanceId: source.instanceId,
    controllerId: source.controllerId,
    effects: [...effects],
    cause,
    timingId: timingContext.id,
    eligibleTargetInstanceIds: [...timingContext.eligibleTargetInstanceIds],
    orderConfirmed,
  });
  addLog(state, "ACTION", `${source.definitionId} 的觸發效果進入等待隊列`, {
    sourceInstanceId: source.instanceId,
    cause,
    queueLength: state.pendingEffects.length,
  });
}
