import { getCardDefinition } from "../cards/cardRegistry";
import type { CardInstance, PlayerId, Zone } from "../cards/cardTypes";
import type { GameState, PlayerState } from "../state/GameState";
import { addLog } from "../utils/gameLog";
import { NotImplementedError, RuleUndefinedError } from "./errors";
import { enqueueTriggeredEffects } from "./triggerEngine";
import type { TimingContext } from "./simultaneousEngine";
import { enqueueStateBasedEffectSummons, markHandEntryForEffectSummon } from "./effectSummonEngine";

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
    const leaveAttackBonus = card.counters.leaveAttackBonus ?? 0;
    if (leaveAttackBonus !== 0 && card.currentAttack !== null) {
      card.currentAttack -= leaveAttackBonus;
      delete card.counters.leaveAttackBonus;
    }
    card.sealed = false;
  }
  card.controllerId = destinationPlayerId;
  state.players[destinationPlayerId][zoneKey[destination]].push(card);
  if (destination === "HAND") markHandEntryForEffectSummon(state, destinationPlayerId, card, reason);
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
  if (card.zone === "MINION") {
    state.players[card.controllerId].resources.necromancy += 1;
    addLog(state, "RESOURCE", `${card.controllerId} 死靈數 +1`, { sourceInstanceId: card.instanceId, reason });
    enqueueStateBasedEffectSummons(state, card.controllerId);
  }
  if (!card.sealed && card.keywords.includes(triggeredKeyword)) {
    const cardEffects = definition.triggeredEffects?.[triggeredKeyword];
    if (!cardEffects) {
      throw new NotImplementedError(`此階段尚未實現該${triggeredKeyword === "DEATHRATTLE" ? "死亡之聲" : "謝幕曲"}`, definition.id);
    }
    effects.push(...cardEffects);
  }
  if (!card.sealed && card.zone === "MINION") {
    if (card.keywords.includes("NECRO_REVIVE_4")) effects.push({ type: "NECRO_REVIVE_SELF" as const, value: 4 });
    if (card.keywords.includes("NECRO_REVIVE_5")) effects.push({ type: "NECRO_REVIVE_SELF" as const, value: 5 });
    if (card.keywords.includes("NECRO_REVIVE_6")) effects.push({ type: "NECRO_REVIVE_SELF" as const, value: 6 });
  }
  if (!card.sealed && card.keywords.includes("RECYCLE")) effects.push({ type: "GAIN_RECYCLE_CHARGE" as const, value: 1 });
  // 同時離場一律依場上原順序自動進入結算隊列，不要求玩家排列棄堆順序。
  if (effects.length > 0) enqueueTriggeredEffects(state, card, effects, `${reason}:${triggeredKeyword}`, timingContext, true, true);
  if (card.zone === "MINION") {
    for (const field of [...state.players[card.controllerId].fields]) {
      if (field.sealed) continue;
      const aura = getCardDefinition(field.definitionId).friendlyMinionDestroyedCountdownAura;
      if (!aura) continue;
      if (field.counters.friendlyDestroyedCountdownTurn !== state.turnNumber) {
        field.counters.friendlyDestroyedCountdownTurn = state.turnNumber;
        field.counters.friendlyDestroyedCountdownUses = 0;
      }
      if ((field.counters.friendlyDestroyedCountdownUses ?? 0) >= aura.maxPerTurn) continue;
      const current = field.counters.countdown;
      if (current === undefined) {
        throw new RuleUndefinedError("COUNTDOWN_INITIAL_VALUE", "手下被消滅時要減少倒數，但光環來源缺少倒數初值", field.definitionId);
      }
      field.counters.friendlyDestroyedCountdownUses = (field.counters.friendlyDestroyedCountdownUses ?? 0) + 1;
      field.counters.countdown = current - aura.amount;
      addLog(state, "RESOURCE", `${field.definitionId} 因我方手下被消滅，倒數 ${current} → ${field.counters.countdown}`, {
        sourceInstanceId: card.instanceId,
        fieldInstanceId: field.instanceId,
      });
      if (field.counters.countdown <= 0) {
        destroyCardOnField(state, field, "AURA_COUNTDOWN_FINISHED", timingContext);
      }
    }
  }
  if (!card.sealed && card.keywords.includes("RECYCLE")) {
    moveCard(state, card, "DECK", `${reason}:RECYCLE`);
    const resetDefinition = getCardDefinition(card.originalDefinitionId);
    card.definitionId = card.originalDefinitionId;
    card.currentCost = resetDefinition.originalCost;
    card.currentAttack = resetDefinition.attack;
    card.currentHealth = resetDefinition.health;
    card.maxHealth = resetDefinition.health;
    card.damageTaken = 0;
    card.keywords = [...resetDefinition.keywords];
    card.counters = { ...resetDefinition.initialCounters };
    card.flags = {};
    card.attacksUsedThisTurn = 0;
    card.summonedOnTurn = null;
    delete card.necroRevivedTurn;
    card.silenced = false;
    card.sealed = false;
    const deck = state.players[card.controllerId].deck;
    const returned = deck.pop();
    if (returned) deck.unshift(returned);
    addLog(state, "ZONE", `${definition.name} 回收到牌組底部`, { instanceId: card.instanceId });
    return;
  }
  if (definition.generatedOnly) {
    moveCard(state, card, "EXTRA_DECK", reason);
    return;
  }
  moveCard(state, card, "GRAVEYARD", reason);
}
