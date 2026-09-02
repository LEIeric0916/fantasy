import { getCardDefinition } from "../cards/cardRegistry";
import type { CardInstance, PlayerId } from "../cards/cardTypes";
import type { GameState } from "../state/GameState";
import { RuleUndefinedError } from "./errors";

export function setCurrentCost(state: GameState, card: CardInstance, value: number): number {
  if (card.currentCost === null) {
    throw new RuleUndefinedError("NULL_CARD_COST", "卡牌費用為 null，不能改值", card.definitionId);
  }
  card.currentCost = Math.max(state.rulesConfig.minCardCost, value);
  return card.currentCost;
}

export function modifyCurrentCost(state: GameState, card: CardInstance, amount: number): number {
  if (card.currentCost === null) {
    throw new RuleUndefinedError("NULL_CARD_COST", "卡牌費用為 null，不能改值", card.definitionId);
  }
  return setCurrentCost(state, card, card.currentCost + amount);
}

export function refreshCardCost(state: GameState, playerId: PlayerId, card: CardInstance): number {
  const definition = getCardDefinition(card.definitionId);
  if (definition.originalCost === null) throw new RuleUndefinedError("NULL_CARD_COST", "卡牌費用為 null，不能計算", definition.id);
  let value = definition.originalCost + (card.counters.temporaryCostAdjustment ?? 0);
  if (definition.cardType === "MINION") value -= state.players[playerId].nextMinionTemporaryCostReduction;
  if (definition.cardType === "MINION" && definition.faction === "MACHINE") {
    value -= state.players[playerId].nextMachineCostReduction;
  }
  if (definition.dynamicCost?.type === "ENEMY_MINION_COUNT") {
    const opponentId = playerId === "P1" ? "P2" : "P1";
    value -= state.players[opponentId].minions.length;
  } else if (definition.dynamicCost?.type === "FRIENDLY_GRAVE_DRAGON_COUNT") {
    value -= state.players[playerId].graveyard.filter((candidate) => {
      const candidateDefinition = getCardDefinition(candidate.definitionId);
      return candidateDefinition.cardType === "MINION" && candidateDefinition.subtype.includes("DRAGON");
    }).length;
  } else if (definition.dynamicCost?.type === "RECYCLE_CHARGE") {
    value -= state.players[playerId].resources.recycleCharge;
  } else if (definition.dynamicCost?.type === "FRIENDLY_FIELD_SUBTYPE_COUNT") {
    const subtype = definition.dynamicCost.subtype;
    value -= state.players[playerId].fields.filter((field) =>
      getCardDefinition(field.definitionId).subtype.includes(subtype),
    ).length;
  } else if (definition.dynamicCost?.type === "TURN_AND_EXISTING_FRIENDLY_MINIONS") {
    if (state.players[playerId].turnsStarted >= definition.dynamicCost.turnAtLeast
      && state.players[playerId].minions.length >= definition.dynamicCost.minExistingMinions) {
      value -= definition.dynamicCost.reduction;
    }
  } else if (definition.dynamicCost?.type === "SUMMONED_THIS_TURN_MULTIPLIER") {
    if (state.players[playerId].turnsStarted >= definition.dynamicCost.turnAtLeast) {
      value -= state.players[playerId].summonedThisTurn * definition.dynamicCost.multiplier;
    }
  } else if (definition.dynamicCost?.type === "SUMMONED_THIS_GAME_AT_LEAST_FIXED") {
    if (state.players[playerId].summonedThisGame >= definition.dynamicCost.value) value = definition.dynamicCost.cost;
  } else if (definition.dynamicCost?.type === "FRIENDLY_MINION_COUNT") {
    value -= state.players[playerId].minions.length;
  } else if (definition.dynamicCost?.type === "TURN_SUMMONED_DRAGON_COST_AT_LEAST"
    && state.players[playerId].summonedDragonOriginalCostThisTurn >= definition.dynamicCost.threshold) {
    value -= definition.dynamicCost.reduction;
  }
  const dragonZeroMaxCost = state.players[playerId].nextLowCostDragonZeroMaxCost;
  if (definition.cardType === "MINION" && definition.subtype.includes("DRAGON")
    && definition.originalCost <= (dragonZeroMaxCost ?? -1)) value = 0;
  const highCostDragonThreshold = state.players[playerId].nextHighCostDragonReductionMinCost;
  if (definition.cardType === "MINION" && definition.subtype.includes("DRAGON")
    && definition.originalCost >= (highCostDragonThreshold ?? Number.POSITIVE_INFINITY)) {
    value -= state.players[playerId].nextHighCostDragonReduction;
  }
  if (card.counters.fixedCost !== undefined) value = card.counters.fixedCost;
  return setCurrentCost(state, card, value);
}

export function refreshHandCosts(state: GameState): void {
  for (const playerId of ["P1", "P2"] as const) {
    for (const card of state.players[playerId].hand) refreshCardCost(state, playerId, card);
  }
}

export function grantTemporaryCostReduction(state: GameState, playerId: PlayerId, card: CardInstance, value: number): void {
  card.counters.temporaryCostAdjustment = (card.counters.temporaryCostAdjustment ?? 0) - value;
  refreshCardCost(state, playerId, card);
}

export function clearTemporaryHandCosts(state: GameState, playerId: PlayerId): void {
  for (const card of state.players[playerId].hand) {
    delete card.counters.temporaryCostAdjustment;
    refreshCardCost(state, playerId, card);
  }
}
