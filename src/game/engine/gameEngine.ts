import { getCardDefinition, isCardImplemented } from "../cards/cardRegistry";
import type { PlayerId } from "../cards/cardTypes";
import type { EngineResult, GameState, RuleUndefined } from "../state/GameState";
import { addLog } from "../utils/gameLog";
import { resolveAttack, type AttackTarget } from "./combatEngine";
import { InvalidActionError, NotImplementedError, RuleUndefinedError } from "./errors";
import { continueAfterCountdown, continueAfterEndTurnEffects, continueAfterGrowthEffects, continueAfterStartTurnEffects, discardForHandLimit, performMulligan, requestEndTurn } from "./turnEngine";
import { findCard, moveCard } from "./zoneEngine";
import { applyFriendlyEnterAuras, enqueueFriendlySummonAuras, recordMinionSummoned, summonGeneratedMinion } from "./summonEngine";
import { confirmEffectSummon, resolveEffects, resolvePendingEffects, selectEffectCards, selectEffectOption, selectTriggerOrder } from "./effectEngine";
import { selectCountdownOrder } from "./countdownEngine";
import { refreshHandCosts } from "./costEngine";
import { enqueueSpellPlayedEffectSummons } from "./effectSummonEngine";

export type GameAction =
  | { type: "MULLIGAN"; playerId: PlayerId; instanceIds: string[] }
  | { type: "PLAY_CARD"; playerId: PlayerId; instanceId: string }
  | { type: "PLAY_ALTERNATE"; playerId: PlayerId; instanceId: string }
  | { type: "ACTIVATE_FIELD"; playerId: PlayerId; instanceId: string }
  | { type: "ATTACK"; playerId: PlayerId; attackerId: string; target: AttackTarget }
  | { type: "END_TURN"; playerId: PlayerId }
  | { type: "SELECT_DISCARD"; playerId: PlayerId; instanceIds: string[] }
  | { type: "SELECT_TRIGGER_ORDER"; playerId: PlayerId; instanceIds: string[] }
  | { type: "SELECT_COUNTDOWN_ORDER"; playerId: PlayerId; instanceIds: string[] }
  | { type: "SELECT_EFFECT_CARDS"; playerId: PlayerId; instanceIds: string[] }
  | { type: "SELECT_EFFECT_OPTION"; playerId: PlayerId; optionId: string }
  | { type: "CONFIRM_EFFECT_SUMMON"; playerId: PlayerId }
  | { type: "DEBUG_SUMMON"; playerId: PlayerId; definitionId: string };

export function validatePendingChoiceIntegrity(state: GameState): void {
  const choice = state.pendingChoice;
  if (!choice) return;
  const duplicateIds = (ids: string[]) => new Set(ids).size !== ids.length;
  if (choice.type === "HAND_LIMIT") {
    if (choice.count < 0 || choice.count > state.players[choice.playerId].hand.length) {
      throw new InvalidActionError("效果選擇狀態異常：棄牌數量超出手牌範圍");
    }
    return;
  }
  if (choice.type === "EFFECT_SUMMON_CONFIRM") {
    if (!state.players[choice.playerId].hand.some((card) => card.instanceId === choice.sourceInstanceId)) {
      throw new InvalidActionError("效果選擇狀態異常：待確認的效果召喚來源不在手牌");
    }
    return;
  }
  if (choice.type === "TRIGGER_ORDER") {
    const queuedIds = state.pendingEffects.filter((effect) => effect.timingId === choice.timingId && effect.controllerId === choice.playerId).map((effect) => effect.sourceInstanceId);
    if (choice.instanceIds.length === 0 || duplicateIds(choice.instanceIds) || choice.instanceIds.some((id) => !queuedIds.includes(id))) {
      throw new InvalidActionError("效果選擇狀態異常：觸發順序來源遺失或重複");
    }
    return;
  }
  if (choice.type === "COUNTDOWN_ORDER") {
    if (choice.instanceIds.length === 0 || duplicateIds(choice.instanceIds) || choice.instanceIds.some((id) => !state.players[choice.playerId].fields.some((field) => field.instanceId === id))) {
      throw new InvalidActionError("效果選擇狀態異常：倒數順序來源遺失或重複");
    }
    return;
  }
  if (!findCard(state, choice.sourceInstanceId)) {
    throw new InvalidActionError("效果選擇狀態異常：效果來源已不存在");
  }
  if (choice.type === "EFFECT_OPTION") {
    if (choice.options.length === 0 || duplicateIds(choice.options.map((option) => option.id))) {
      throw new InvalidActionError("效果選擇狀態異常：沒有可選選項或選項重複");
    }
    return;
  }
  const minCount = choice.minCount ?? choice.count;
  if (minCount < 0 || choice.count < minCount || choice.count > choice.candidateInstanceIds.length || duplicateIds(choice.candidateInstanceIds) || choice.candidateInstanceIds.some((id) => !findCard(state, id))) {
    throw new InvalidActionError("效果選擇狀態異常：候選卡牌不足、遺失或重複");
  }
}

function playCard(state: GameState, playerId: PlayerId, instanceId: string): void {
  if (state.phase !== "MAIN" || state.activePlayerId !== playerId) throw new InvalidActionError("目前不能出牌");
  const player = state.players[playerId];
  const card = player.hand.find((candidate) => candidate.instanceId === instanceId);
  if (!card) throw new InvalidActionError("卡牌不在我方手牌");
  const definition = getCardDefinition(card.definitionId);
  if (!isCardImplemented(definition)) {
    const reason = definition.originalCost === null
      ? "卡牌關鍵數值為 null，不能猜測"
      : "此卡效果尚未實現，不能忽略效果後打出";
    if (definition.originalCost === null) throw new RuleUndefinedError("NULL_CARD_COST", reason, definition.id);
    throw new NotImplementedError(reason, definition.id);
  }
  if (card.currentCost === null) throw new RuleUndefinedError("NULL_CARD_COST", "卡牌費用為 null", definition.id);
  if (player.mana < card.currentCost) throw new InvalidActionError("水晶不足");
  if (definition.cardType === "MINION" && player.minions.length >= state.rulesConfig.minionLimit) {
    throw new InvalidActionError("手下區已滿（7/7），召喚失敗");
  }
  if (definition.cardType === "FIELD") {
    const limit = state.rulesConfig.fieldLimits[player.faction];
    if (limit === undefined) throw new RuleUndefinedError("FIELD_LIMIT", `${player.faction} 的立場上限尚未定義`);
    if (limit !== null && player.fields.length >= limit) throw new InvalidActionError(`立場區已滿（${limit}/${limit}）`);
  }
  player.mana -= card.currentCost;
  if (definition.cardType === "MINION" && player.nextMinionTemporaryCostReduction > 0) {
    addLog(state, "RESOURCE", `${definition.name} 使用下一張手下減費 ${player.nextMinionTemporaryCostReduction}`, { instanceId: card.instanceId });
    player.nextMinionTemporaryCostReduction = 0;
  }
  if (definition.cardType === "MINION" && definition.subtype.includes("MACHINE") && player.nextMachineCostReduction > 0) {
    addLog(state, "RESOURCE", `${definition.name} 使用下一張機械手下減費 ${player.nextMachineCostReduction}`, { instanceId: card.instanceId });
    player.nextMachineCostReduction = 0;
  }
  if (definition.cardType === "MINION" && definition.subtype.includes("DRAGON")
    && definition.originalCost !== null
    && player.nextLowCostDragonZeroMaxCost !== null
    && definition.originalCost <= player.nextLowCostDragonZeroMaxCost) {
    addLog(state, "RESOURCE", `${definition.name} 使用海潮皇龍的費用歸零效果`, { instanceId: card.instanceId });
    player.nextLowCostDragonZeroMaxCost = null;
  }
  if (definition.cardType === "MINION" && definition.subtype.includes("DRAGON")
    && definition.originalCost !== null
    && player.nextHighCostDragonReductionMinCost !== null
    && definition.originalCost >= player.nextHighCostDragonReductionMinCost) {
    addLog(state, "RESOURCE", `${definition.name} 使用睿智神龍的費用減免 ${player.nextHighCostDragonReduction}`, { instanceId: card.instanceId });
    player.nextHighCostDragonReductionMinCost = null;
    player.nextHighCostDragonReduction = 0;
  }
  player.cardsPlayedThisTurn += 1;
  addLog(state, "ACTION", `${playerId} 打出 ${definition.name}`, { cardId: definition.id, cost: card.currentCost });
  if (definition.cardType === "MINION") {
    moveCard(state, card, "MINION", "PLAY_MINION");
    refreshHandCosts(state);
    card.summonedOnTurn = state.turnNumber;
    recordMinionSummoned(state, playerId, card);
    applyFriendlyEnterAuras(state, playerId, card);
    enqueueFriendlySummonAuras(state, playerId, card);
    resolveEffects(state, playerId, card, [...(definition.effects ?? []), ...(definition.enterFieldEffects ?? [])]);
    return;
  }
  if (definition.cardType === "FIELD") {
    moveCard(state, card, "FIELD", "PLAY_FIELD");
    resolveEffects(state, playerId, card, definition.effects ?? []);
    return;
  }
  enqueueSpellPlayedEffectSummons(state, playerId, card.currentCost);
  resolveEffects(state, playerId, card, definition.effects ?? [], false);
  moveCard(state, card, definition.generatedOnly ? "EXTRA_DECK" : "GRAVEYARD", definition.generatedOnly ? "GENERATED_SPELL_LEAVES" : "PLAY_SPELL");
  if (!state.pendingChoice) resolvePendingEffects(state);
}

function playAlternate(state: GameState, playerId: PlayerId, instanceId: string): void {
  if (state.phase !== "MAIN" || state.activePlayerId !== playerId) throw new InvalidActionError("目前不能轉費打出");
  const player = state.players[playerId];
  const card = player.hand.find((candidate) => candidate.instanceId === instanceId);
  if (!card) throw new InvalidActionError("卡牌不在我方手牌");
  const definition = getCardDefinition(card.definitionId);
  if (!card.keywords.includes("ALT_COST") || !definition.alternatePlay) {
    throw new NotImplementedError("此卡的轉費效果尚未實現", definition.id);
  }
  if (player.mana < definition.alternatePlay.cost) throw new InvalidActionError("水晶不足");
  player.mana -= definition.alternatePlay.cost;
  player.cardsPlayedThisTurn += 1;
  addLog(state, "ACTION", `${playerId} 以轉費 ${definition.alternatePlay.cost} 打出 ${definition.name}`, {
    cardId: definition.id,
    alternateCost: definition.alternatePlay.cost,
  });
  resolveEffects(state, playerId, card, definition.alternatePlay.effects);
}

function activateField(state: GameState, playerId: PlayerId, instanceId: string): void {
  if (state.phase !== "MAIN" || state.activePlayerId !== playerId) throw new InvalidActionError("目前不能發動立場效果");
  const player = state.players[playerId];
  const card = player.fields.find((candidate) => candidate.instanceId === instanceId);
  if (!card) throw new InvalidActionError("立場不在我方場上");
  if (card.sealed) throw new InvalidActionError("封印中的立場效果失效");
  const activated = getCardDefinition(card.definitionId).activatedEffect;
  if (!activated) throw new InvalidActionError("此立場沒有可主動發動的效果");
  const resourceKey = activated.resource === "NECROMANCY" ? "necromancy" : "recycleCharge";
  if (player.resources[resourceKey] < activated.cost) throw new InvalidActionError(`${activated.resource === "NECROMANCY" ? "死靈數" : "回收充能"}不足`);
  player.resources[resourceKey] -= activated.cost;
  addLog(state, "RESOURCE", `${playerId} 消耗 ${activated.cost} ${activated.resource === "NECROMANCY" ? "死靈數" : "回收充能"}`, {
    sourceInstanceId: instanceId,
    remaining: player.resources[resourceKey],
  });
  resolveEffects(state, playerId, card, activated.effects);
}

function executeMutable(state: GameState, action: GameAction): void {
  state.effectNotices = [];
  refreshHandCosts(state);
  if (state.pendingChoice) {
    const expected = state.pendingChoice.type;
    const matches = (expected === "HAND_LIMIT" && action.type === "SELECT_DISCARD")
      || (expected === "TRIGGER_ORDER" && action.type === "SELECT_TRIGGER_ORDER")
      || (expected === "COUNTDOWN_ORDER" && action.type === "SELECT_COUNTDOWN_ORDER")
      || (expected === "EFFECT_CARDS" && action.type === "SELECT_EFFECT_CARDS")
      || (expected === "EFFECT_OPTION" && action.type === "SELECT_EFFECT_OPTION")
      || (expected === "EFFECT_SUMMON_CONFIRM" && action.type === "CONFIRM_EFFECT_SUMMON");
    if (!matches) throw new InvalidActionError("必須先完成目前的選擇");
  }
  switch (action.type) {
    case "MULLIGAN": return performMulligan(state, action.playerId, action.instanceIds);
    case "PLAY_CARD": return playCard(state, action.playerId, action.instanceId);
    case "PLAY_ALTERNATE": return playAlternate(state, action.playerId, action.instanceId);
    case "ACTIVATE_FIELD": return activateField(state, action.playerId, action.instanceId);
    case "ATTACK": return resolveAttack(state, action.playerId, action.attackerId, action.target);
    case "END_TURN": return requestEndTurn(state, action.playerId);
    case "SELECT_DISCARD": return discardForHandLimit(state, action.playerId, action.instanceIds);
    case "SELECT_TRIGGER_ORDER": {
      selectTriggerOrder(state, action.playerId, action.instanceIds);
      if (state.phase === "DRAW" && state.startTurnEffectsPending && !state.pendingChoice && state.pendingEffects.length === 0) {
        continueAfterStartTurnEffects(state);
        return;
      }
      if (state.phase === "END" && state.endTurnEffectsPending && !state.pendingChoice && state.pendingEffects.length === 0) {
        continueAfterEndTurnEffects(state);
        return;
      }
      if (state.phase === "GROWTH" && state.growthEffectsPending && !state.pendingChoice && state.pendingEffects.length === 0) {
        continueAfterGrowthEffects(state);
        return;
      }
      if (state.phase === "COUNTDOWN" && !state.pendingChoice && state.pendingEffects.length === 0) continueAfterCountdown(state);
      return;
    }
    case "SELECT_COUNTDOWN_ORDER": {
      selectCountdownOrder(state, action.playerId, action.instanceIds);
      if (!state.pendingChoice && state.pendingEffects.length === 0) continueAfterCountdown(state);
      return;
    }
    case "SELECT_EFFECT_CARDS": {
      selectEffectCards(state, action.playerId, action.instanceIds);
      if (state.phase === "DRAW" && state.startTurnEffectsPending && !state.pendingChoice && state.pendingEffects.length === 0) {
        continueAfterStartTurnEffects(state);
      }
      if (state.phase === "END" && state.endTurnEffectsPending && !state.pendingChoice && state.pendingEffects.length === 0) {
        continueAfterEndTurnEffects(state);
      }
      if (state.phase === "GROWTH" && state.growthEffectsPending && !state.pendingChoice && state.pendingEffects.length === 0) {
        continueAfterGrowthEffects(state);
      }
      return;
    }
    case "SELECT_EFFECT_OPTION": {
      selectEffectOption(state, action.playerId, action.optionId);
      if (state.phase === "END" && state.endTurnEffectsPending && !state.pendingChoice && state.pendingEffects.length === 0) {
        continueAfterEndTurnEffects(state);
      }
      if (state.phase === "GROWTH" && state.growthEffectsPending && !state.pendingChoice && state.pendingEffects.length === 0) {
        continueAfterGrowthEffects(state);
      }
      return;
    }
    case "CONFIRM_EFFECT_SUMMON": {
      confirmEffectSummon(state, action.playerId);
      if (state.phase === "DRAW" && state.startTurnEffectsPending && !state.pendingChoice && state.pendingEffects.length === 0) continueAfterStartTurnEffects(state);
      if (state.phase === "END" && state.endTurnEffectsPending && !state.pendingChoice && state.pendingEffects.length === 0) continueAfterEndTurnEffects(state);
      if (state.phase === "GROWTH" && state.growthEffectsPending && !state.pendingChoice && state.pendingEffects.length === 0) continueAfterGrowthEffects(state);
      return;
    }
    case "DEBUG_SUMMON": {
      if (state.phase !== "MAIN") throw new InvalidActionError("Debug 召喚只可在主要階段使用");
      summonGeneratedMinion(state, action.playerId, action.definitionId);
      return;
    }
  }
}

export function applyAction(source: GameState, action: GameAction): EngineResult {
  if (source.phase === "GAME_OVER") return { state: source, error: { code: "INVALID_ACTION", message: "對局已結束" } };
  const state = structuredClone(source);
  try {
    executeMutable(state, action);
    validatePendingChoiceIntegrity(state);
    // Board and resource changes can alter dynamic costs. Recalculate again
    // after the action so the UI never keeps the pre-action value.
    refreshHandCosts(state);
    return { state };
  } catch (error) {
    if (error instanceof RuleUndefinedError) {
      const original = structuredClone(source);
      addLog(original, "RULE", `RULE_UNDEFINED: ${error.issue.ruleId}`, error.issue as unknown as Record<string, unknown>);
      return { state: original, error: error.issue };
    }
    if (error instanceof NotImplementedError) {
      return { state: source, error: { code: "NOT_IMPLEMENTED", message: error.message, cardId: error.cardId } };
    }
    const message = error instanceof Error ? error.message : String(error);
    return { state: source, error: { code: "INVALID_ACTION", message } };
  }
}

export function ruleUndefined(ruleId: string, message: string, cardId?: string): RuleUndefined {
  return { code: "RULE_UNDEFINED", ruleId, message, cardId };
}
