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
): void {
  if (effects.length === 0 || (source.sealed && !allowSealed)) return;
  state.pendingEffects.push({
    sourceInstanceId: source.instanceId,
    controllerId: source.controllerId,
    effects: [...effects],
    cause,
    timingId: timingContext.id,
    eligibleTargetInstanceIds: [...timingContext.eligibleTargetInstanceIds],
  });
  addLog(state, "ACTION", `${source.definitionId} 的触发效果进入等待队列`, {
    sourceInstanceId: source.instanceId,
    cause,
    queueLength: state.pendingEffects.length,
  });
}
