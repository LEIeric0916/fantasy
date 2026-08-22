import type { GameState } from "../state/GameState";

export interface TimingContext {
  id: string;
  eligibleTargetInstanceIds: string[];
}

export function createTimingContext(state: GameState, label: string): TimingContext {
  return {
    id: `${state.turnNumber}:${state.log.length}:${label}`,
    eligibleTargetInstanceIds: Object.values(state.players).flatMap((player) => [
      ...player.minions.map((card) => card.instanceId),
      ...player.fields.map((card) => card.instanceId),
    ]),
  };
}

export function wasEligibleAtTimingStart(context: TimingContext, instanceId: string): boolean {
  return context.eligibleTargetInstanceIds.includes(instanceId);
}

export function aggregateSimultaneousDamage(entries: readonly { targetInstanceId: string; amount: number }[]): Map<string, number> {
  const totals = new Map<string, number>();
  for (const entry of entries) totals.set(entry.targetInstanceId, (totals.get(entry.targetInstanceId) ?? 0) + entry.amount);
  return totals;
}
