import { getCardDefinition } from "../cards/cardRegistry";
import type { CardInstance, PlayerId, Zone } from "../cards/cardTypes";
import type { GameState, PlayerState } from "../state/GameState";
import { addLog } from "../utils/gameLog";
import { NotImplementedError } from "./errors";
import { enqueueTriggeredEffects } from "./triggerEngine";
import type { TimingContext } from "./simultaneousEngine";

const zoneKey: Record<Zone, keyof Pick<PlayerState, "deck" | "hand" | "minions" | "fields" | "graveyard" | "removed" | "extraDeck">> = {
  DECK: "deck",
  HAND: "hand",
  MINION: "minions",
  FIELD: "fields",
  GRAVEYARD: "graveyard",
  REMOVED: "removed",
  EXTRA_DECK: "extraDeck",
};

export function findCard(state: GameState, instanceId: string): CardInstance | undefined {
  for (const player of Object.values(state.players)) {
    for (const key of Object.values(zoneKey)) {
      const card = player[key].find((candidate) => candidate.instanceId === instanceId);
      if (card) return card;
    }
  }
  return undefined;
}

export function moveCard(
  state: GameState,
  card: CardInstance,
  destination: Zone,
  reason: string,
  destinationPlayerId: PlayerId = card.controllerId,
): void {
  const sourcePlayer = state.players[card.controllerId];
  const source = sourcePlayer[zoneKey[card.zone]];
  const index = source.findIndex((candidate) => candidate.instanceId === card.instanceId);
  if (index < 0) throw new Error(`Card ${card.instanceId} is not present in ${card.zone}`);
  source.splice(index, 1);
  const from = card.zone;
  card.zone = destination;
  if ((from === "MINION" || from === "FIELD") && destination !== "MINION" && destination !== "FIELD") {
    card.sealed = false;
  }
  card.controllerId = destinationPlayerId;
  state.players[destinationPlayerId][zoneKey[destination]].push(card);
  addLog(state, "ZONE", `${card.definitionId}: ${from} → ${destination}`, { instanceId: card.instanceId, reason });
}

export function destroyMinion(state: GameState, card: CardInstance, reason = "DESTROY", timingContext?: TimingContext): void {
  if (card.zone !== "MINION") throw new Error(`${card.instanceId} is not in the minion zone`);
  destroyCardOnField(state, card, reason, timingContext);
}

export function destroyCardOnField(state: GameState, card: CardInstance, reason = "DESTROY", timingContext?: TimingContext): void {
  const definition = getCardDefinition(card.definitionId);
  if (card.zone !== "MINION" && card.zone !== "FIELD") throw new Error(`${card.instanceId} is not on the field`);
  const triggeredKeyword = card.zone === "MINION" ? "DEATHRATTLE" : "LAST_WORDS";
  const effects = [];
  if (card.zone === "MINION") effects.push({ type: "GAIN_NECROMANCY" as const, value: 1 });
  if (!card.sealed && card.keywords.includes(triggeredKeyword)) {
    const cardEffects = definition.triggeredEffects?.[triggeredKeyword];
    if (!cardEffects) {
      throw new NotImplementedError(`此阶段尚未实现该${triggeredKeyword === "DEATHRATTLE" ? "死亡之声" : "谢幕曲"}`, definition.id);
    }
    effects.push(...cardEffects);
  }
  if (!card.sealed && card.zone === "MINION") {
    if (card.keywords.includes("NECRO_REVIVE_4")) effects.push({ type: "NECRO_REVIVE_SELF" as const, value: 4 });
    if (card.keywords.includes("NECRO_REVIVE_5")) effects.push({ type: "NECRO_REVIVE_SELF" as const, value: 5 });
  }
  if (!card.sealed && card.keywords.includes("RECYCLE")) effects.push({ type: "GAIN_RECYCLE_CHARGE" as const, value: 1 });
  if (effects.length > 0) enqueueTriggeredEffects(state, card, effects, `${reason}:${triggeredKeyword}`, timingContext, true);
  if (!card.sealed && card.keywords.includes("RECYCLE")) {
    moveCard(state, card, "DECK", `${reason}:RECYCLE`);
    const deck = state.players[card.controllerId].deck;
    const returned = deck.pop();
    if (returned) deck.unshift(returned);
    addLog(state, "ZONE", `${definition.name} 回收到牌组底部`, { instanceId: card.instanceId });
    return;
  }
  if (definition.generatedOnly) {
    moveCard(state, card, "EXTRA_DECK", reason);
    return;
  }
  moveCard(state, card, "GRAVEYARD", reason);
}
