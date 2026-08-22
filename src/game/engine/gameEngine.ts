import { getCardDefinition, isCardImplemented } from "../cards/cardRegistry";
import type { PlayerId } from "../cards/cardTypes";
import type { EngineResult, GameState, RuleUndefined } from "../state/GameState";
import { addLog } from "../utils/gameLog";
import { resolveAttack, type AttackTarget } from "./combatEngine";
import { InvalidActionError, NotImplementedError, RuleUndefinedError } from "./errors";
import { continueAfterCountdown, continueAfterEndTurnEffects, continueAfterGrowthEffects, continueAfterStartTurnEffects, discardForHandLimit, performMulligan, requestEndTurn } from "./turnEngine";
import { moveCard } from "./zoneEngine";
import { applyFriendlyEnterAuras, enqueueFriendlySummonAuras, recordMinionSummoned, summonGeneratedMinion } from "./summonEngine";
import { resolveEffects, resolvePendingEffects, selectEffectCards, selectEffectOption, selectTriggerOrder } from "./effectEngine";
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
  | { type: "DEBUG_SUMMON"; playerId: PlayerId; definitionId: string };

function playCard(state: GameState, playerId: PlayerId, instanceId: string): void {
  if (state.phase !== "MAIN" || state.activePlayerId !== playerId) throw new InvalidActionError("目前不能出牌");
  const player = state.players[playerId];
  const card = player.hand.find((candidate) => candidate.instanceId === instanceId);
  if (!card) throw new InvalidActionError("卡牌不在我方手牌");
  const definition = getCardDefinition(card.definitionId);
  if (!isCardImplemented(definition)) {
    const reason = definition.originalCost === null
      ? "卡牌关键数值为 null，不能猜测"
      : "此卡效果尚未实现，不能忽略效果后打出";
    if (definition.originalCost === null) throw new RuleUndefinedError("NULL_CARD_COST", reason, definition.id);
    throw new NotImplementedError(reason, definition.id);
  }
  if (card.currentCost === null) throw new RuleUndefinedError("NULL_CARD_COST", "卡牌费用为 null", definition.id);
  if (player.mana < card.currentCost) throw new InvalidActionError("水晶不足");
  if (definition.cardType === "MINION" && player.minions.length >= state.rulesConfig.minionLimit) {
    throw new InvalidActionError("手下区已满（7/7），召唤失败");
  }
  if (definition.cardType === "FIELD") {
    const limit = state.rulesConfig.fieldLimits[player.faction];
    if (limit === undefined) throw new RuleUndefinedError("FIELD_LIMIT", `${player.faction} 的立场上限尚未定义`);
    if (limit !== null && player.fields.length >= limit) throw new InvalidActionError(`立场区已满（${limit}/${limit}）`);
  }
  player.mana -= card.currentCost;
  if (definition.cardType === "MINION" && player.nextMinionTemporaryCostReduction > 0) {
    addLog(state, "RESOURCE", `${definition.name} 使用下一张手下减费 ${player.nextMinionTemporaryCostReduction}`, { instanceId: card.instanceId });
    player.nextMinionTemporaryCostReduction = 0;
  }
  if (definition.cardType === "MINION" && definition.subtype.includes("MACHINE") && player.nextMachineCostReduction > 0) {
    addLog(state, "RESOURCE", `${definition.name} 使用下一张机械手下减费 ${player.nextMachineCostReduction}`, { instanceId: card.instanceId });
    player.nextMachineCostReduction = 0;
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
  if (state.phase !== "MAIN" || state.activePlayerId !== playerId) throw new InvalidActionError("目前不能转费打出");
  const player = state.players[playerId];
  const card = player.hand.find((candidate) => candidate.instanceId === instanceId);
  if (!card) throw new InvalidActionError("卡牌不在我方手牌");
  const definition = getCardDefinition(card.definitionId);
  if (!card.keywords.includes("ALT_COST") || !definition.alternatePlay) {
    throw new NotImplementedError("此卡的转费效果尚未实现", definition.id);
  }
  if (player.mana < definition.alternatePlay.cost) throw new InvalidActionError("水晶不足");
  player.mana -= definition.alternatePlay.cost;
  player.cardsPlayedThisTurn += 1;
  addLog(state, "ACTION", `${playerId} 以转费 ${definition.alternatePlay.cost} 打出 ${definition.name}`, {
    cardId: definition.id,
    alternateCost: definition.alternatePlay.cost,
  });
  resolveEffects(state, playerId, card, definition.alternatePlay.effects);
}

function activateField(state: GameState, playerId: PlayerId, instanceId: string): void {
  if (state.phase !== "MAIN" || state.activePlayerId !== playerId) throw new InvalidActionError("目前不能发动立场效果");
  const player = state.players[playerId];
  const card = player.fields.find((candidate) => candidate.instanceId === instanceId);
  if (!card) throw new InvalidActionError("立场不在我方场上");
  if (card.sealed) throw new InvalidActionError("封印中的立场效果失效");
  const activated = getCardDefinition(card.definitionId).activatedEffect;
  if (!activated) throw new InvalidActionError("此立场没有可主动发动的效果");
  const resourceKey = activated.resource === "NECROMANCY" ? "necromancy" : "recycleCharge";
  if (player.resources[resourceKey] < activated.cost) throw new InvalidActionError(`${activated.resource === "NECROMANCY" ? "死灵数" : "回收充能"}不足`);
  player.resources[resourceKey] -= activated.cost;
  addLog(state, "RESOURCE", `${playerId} 消耗 ${activated.cost} ${activated.resource === "NECROMANCY" ? "死灵数" : "回收充能"}`, {
    sourceInstanceId: instanceId,
    remaining: player.resources[resourceKey],
  });
  resolveEffects(state, playerId, card, activated.effects);
}

function executeMutable(state: GameState, action: GameAction): void {
  refreshHandCosts(state);
  if (state.pendingChoice) {
    const expected = state.pendingChoice.type;
    const matches = (expected === "HAND_LIMIT" && action.type === "SELECT_DISCARD")
      || (expected === "TRIGGER_ORDER" && action.type === "SELECT_TRIGGER_ORDER")
      || (expected === "COUNTDOWN_ORDER" && action.type === "SELECT_COUNTDOWN_ORDER")
      || (expected === "EFFECT_CARDS" && action.type === "SELECT_EFFECT_CARDS")
      || (expected === "EFFECT_OPTION" && action.type === "SELECT_EFFECT_OPTION");
    if (!matches) throw new InvalidActionError("必须先完成目前的选择");
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
    case "DEBUG_SUMMON": {
      if (state.phase !== "MAIN") throw new InvalidActionError("Debug 召唤只可在主要阶段使用");
      summonGeneratedMinion(state, action.playerId, action.definitionId);
      return;
    }
  }
}

export function applyAction(source: GameState, action: GameAction): EngineResult {
  if (source.phase === "GAME_OVER") return { state: source, error: { code: "INVALID_ACTION", message: "对局已结束" } };
  const state = structuredClone(source);
  try {
    executeMutable(state, action);
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
