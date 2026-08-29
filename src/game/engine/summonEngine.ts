import { getCardDefinition } from "../cards/cardRegistry";
import type { PlayerId } from "../cards/cardTypes";
import type { GameState } from "../state/GameState";
import { createCardInstance } from "../state/CardInstance";
import { addLog } from "../utils/gameLog";
import { InvalidActionError, RuleUndefinedError } from "./errors";
import type { CardInstance } from "../cards/cardTypes";
import { moveCard } from "./zoneEngine";
import { enqueueTriggeredEffects } from "./triggerEngine";
import { createTimingContext } from "./simultaneousEngine";

export function canTriggerEffectSummonFromHand(state: GameState, playerId: PlayerId): boolean {
  return state.players[playerId].minions.length < state.rulesConfig.minionLimit;
}

export function recordMinionSummoned(state: GameState, playerId: PlayerId, card: CardInstance): void {
  const player = state.players[playerId];
  player.summonedThisTurn += 1;
  player.summonedThisGame += 1;
  const definition = getCardDefinition(card.definitionId);
  if (definition.subtype.includes("DRAGON") && definition.originalCost !== null) {
    player.summonedDragonOriginalCostThisTurn += definition.originalCost;
  }
}

export function applyFriendlyEnterAuras(state: GameState, playerId: PlayerId, card: CardInstance): void {
  const targetDefinition = getCardDefinition(card.definitionId);
  for (const source of state.players[playerId].minions) {
    if (source.sealed) continue;
    const aura = getCardDefinition(source.definitionId).grantOnFriendlyEnterAura;
    if (!aura || !aura.subtypes.every((subtype) => targetDefinition.subtype.includes(subtype))) continue;
    if (!card.keywords.includes(aura.keyword)) card.keywords.push(aura.keyword);
    addLog(state, "ACTION", `${source.definitionId} 光環使 ${card.definitionId} 獲得 ${aura.keyword}`, { source: source.instanceId, target: card.instanceId });
  }
}

export function enqueueFriendlySummonAuras(state: GameState, playerId: PlayerId, summoned: CardInstance): void {
  const timing = createTimingContext(state, `FRIENDLY_SUMMON:${summoned.instanceId}`);
  for (const source of state.players[playerId].minions) {
    if (source.instanceId === summoned.instanceId || source.sealed) continue;
    const aura = getCardDefinition(source.definitionId).friendlySummonAura;
    if (!aura) continue;
    if (source.counters.friendlySummonAuraTurn !== state.turnNumber) {
      source.counters.friendlySummonAuraTurn = state.turnNumber;
      source.counters.friendlySummonAuraUses = 0;
    }
    if ((source.counters.friendlySummonAuraUses ?? 0) >= aura.maxPerTurn) continue;
    source.counters.friendlySummonAuraUses = (source.counters.friendlySummonAuraUses ?? 0) + 1;
    enqueueTriggeredEffects(state, source, aura.effects, "AURA:FRIENDLY_SUMMON", timing);
  }
}

export function enqueueBattlecryAfterSummon(state: GameState, card: CardInstance, cause: string): void {
  const definition = getCardDefinition(card.definitionId);
  if (!card.sealed && card.keywords.includes("BATTLECRY") && definition.effects?.length) {
    enqueueTriggeredEffects(state, card, definition.effects, cause, createTimingContext(state, `${cause}:${card.instanceId}`));
  }
}

export function summonGeneratedMinion(state: GameState, playerId: PlayerId, definitionId: string): boolean {
  const player = state.players[playerId];
  if (player.minions.length >= state.rulesConfig.minionLimit) {
    addLog(state, "ACTION", `${definitionId} 召喚失敗：手下區已滿`, { reason: "MINION_LIMIT" });
    return false;
  }
  const definition = getCardDefinition(definitionId);
  if (definition.cardType !== "MINION") throw new Error(`${definitionId} is not a minion`);
  if (definition.attack === null || definition.health === null) {
    throw new RuleUndefinedError("NULL_MINION_STATS", "攻擊或生命為 null，不能召喚", definitionId);
  }
  const serial = player.summonedThisGame + 1;
  const card = createCardInstance(definition, playerId, "MINION", `${playerId}-${definitionId}-generated-${state.turnNumber}-${serial}`);
  card.summonedOnTurn = state.turnNumber;
  player.minions.push(card);
  recordMinionSummoned(state, playerId, card);
  applyFriendlyEnterAuras(state, playerId, card);
  enqueueFriendlySummonAuras(state, playerId, card);
  addLog(state, "ZONE", `召喚 ${definition.name}`, { instanceId: card.instanceId, reason: "EFFECT_SUMMON" });
  enqueueBattlecryAfterSummon(state, card, "EFFECT_SUMMON:BATTLECRY");
  if (definition.enterFieldEffects?.length) {
    enqueueTriggeredEffects(state, card, definition.enterFieldEffects, "ENTER_FIELD", createTimingContext(state, `ENTER_FIELD:${card.instanceId}`));
  }
  return true;
}

export function summonFromHandByEffect(state: GameState, card: CardInstance): boolean {
  const player = state.players[card.controllerId];
  if (card.zone !== "HAND") return false;
  if (player.minions.length >= state.rulesConfig.minionLimit) {
    addLog(state, "ACTION", `${card.definitionId} 效果召喚結算失敗：手下區已滿`, { instanceId: card.instanceId });
    return false;
  }
  const definition = getCardDefinition(card.definitionId);
  if (definition.cardType !== "MINION") return false;
  moveCard(state, card, "MINION", "EFFECT_SUMMON_FROM_HAND");
  card.summonedOnTurn = state.turnNumber;
  recordMinionSummoned(state, player.id, card);
  applyFriendlyEnterAuras(state, player.id, card);
  enqueueFriendlySummonAuras(state, player.id, card);
  addLog(state, "ACTION", `${definition.name} 從手牌效果召喚`, { instanceId: card.instanceId });
  enqueueBattlecryAfterSummon(state, card, "SELF_EFFECT_SUMMON:BATTLECRY");
  if (definition.enterFieldEffects?.length) {
    enqueueTriggeredEffects(state, card, definition.enterFieldEffects, "ENTER_FIELD", createTimingContext(state, `ENTER_FIELD:${card.instanceId}`));
  }
  return true;
}

export function summonGeneratedField(state: GameState, playerId: PlayerId, definitionId: string): boolean {
  const player = state.players[playerId];
  const limit = state.rulesConfig.fieldLimits[player.faction];
  if (limit !== null && limit !== undefined && player.fields.length >= limit) {
    addLog(state, "ACTION", `${definitionId} 召喚失敗：立場區已滿`, { reason: "FIELD_LIMIT" });
    return false;
  }
  const definition = getCardDefinition(definitionId);
  if (definition.cardType !== "FIELD") throw new InvalidActionError(`${definitionId} 不是立場`);
  const card = createCardInstance(definition, playerId, "FIELD", `${playerId}-${definitionId}-generated-${state.turnNumber}-${state.log.length}`);
  player.fields.push(card);
  addLog(state, "ZONE", `召喚立場 ${definition.name}`, { instanceId: card.instanceId, reason: "EFFECT_SUMMON_FIELD" });
  const enterEffects = [...(definition.effects ?? []), ...(definition.enterFieldEffects ?? [])];
  if (enterEffects.length) {
    enqueueTriggeredEffects(state, card, enterEffects, "ENTER_FIELD", createTimingContext(state, `ENTER_FIELD:${card.instanceId}`));
  }
  return true;
}
