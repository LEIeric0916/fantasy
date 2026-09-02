import { getCardDefinition } from "../cards/cardRegistry";
import type { CardInstance } from "../cards/cardTypes";
import type { GameState } from "../state/GameState";
import { addLog } from "../utils/gameLog";
import { hasActiveKeyword } from "../keywords/keywordRules";
import { InvalidActionError, RuleUndefinedError } from "./errors";
import { createTimingContext } from "./simultaneousEngine";
import { enqueueTriggeredEffects } from "./triggerEngine";

export function transformMinion(state: GameState, card: CardInstance, definitionId: string): boolean {
  if (card.zone !== "MINION") throw new InvalidActionError("只有場上的手下可以轉變");
  if (hasActiveKeyword(card, "INVINCIBLE")) return false;
  const definition = getCardDefinition(definitionId);
  if (definition.cardType !== "MINION") throw new InvalidActionError("轉變目標定義必須是手下");
  if (definition.attack === null || definition.health === null) {
    throw new RuleUndefinedError("NULL_MINION_STATS", "轉變後的手下數值為 null", definitionId);
  }
  const previousDefinitionId = card.definitionId;
  card.definitionId = definition.id;
  card.currentCost = definition.originalCost;
  card.currentAttack = definition.attack;
  card.currentHealth = definition.health;
  card.maxHealth = definition.health;
  card.damageTaken = 0;
  card.keywords = [...definition.keywords];
  card.counters = { ...definition.initialCounters };
  card.flags = {};
  card.attacksUsedThisTurn = 0;
  card.summonedOnTurn = null;
  card.silenced = false;
  addLog(state, "ZONE", `${previousDefinitionId} 轉變為 ${definition.id}`, {
    instanceId: card.instanceId,
    originalDefinitionId: card.originalDefinitionId,
  });
  for (const player of Object.values(state.players)) {
    for (const field of [...player.fields]) {
      const aura = !field.sealed ? getCardDefinition(field.definitionId).transformAura : undefined;
      if (!aura || aura.transformedDefinitionId !== definition.id) continue;
      field.counters[aura.counter] = (field.counters[aura.counter] ?? 0) + 1;
      addLog(state, "RESOURCE", `${field.definitionId} 放置1個標記`, {
        instanceId: field.instanceId,
        counter: aura.counter,
        value: field.counters[aura.counter],
      });
      if (field.counters[aura.counter] >= aura.threshold) transformField(state, field, aura.transformSelfDefinitionId);
    }
  }
  return true;
}

export function checkDoomsdayWin(state: GameState, playerId: CardInstance["controllerId"]): boolean {
  const winningField = state.players[playerId].fields.find((field) => {
    const condition = getCardDefinition(field.definitionId).fieldWinCondition;
    if (!condition) return false;
    return state.players[playerId].fields.filter((candidate) => candidate.definitionId === field.definitionId).length >= condition.count;
  });
  if (!winningField) return false;
  const condition = getCardDefinition(winningField.definitionId).fieldWinCondition!;
  state.phase = "GAME_OVER";
  state.winner = playerId;
  state.loseReason = condition.loseReason;
  addLog(state, "RESULT", `${playerId} 集齊${condition.count}張${getCardDefinition(winningField.definitionId).name}，立即獲勝`, { reason: condition.loseReason });
  return true;
}

export function transformField(state: GameState, card: CardInstance, definitionId: string): boolean {
  if (card.zone !== "FIELD") throw new InvalidActionError("只有場上的立場可以轉變");
  if (hasActiveKeyword(card, "INVINCIBLE")) return false;
  const definition = getCardDefinition(definitionId);
  if (definition.cardType !== "FIELD") throw new InvalidActionError("轉變目標定義必須是立場");
  const previousDefinitionId = card.definitionId;
  card.definitionId = definition.id;
  card.currentCost = definition.originalCost;
  card.keywords = [...definition.keywords];
  card.counters = { ...definition.initialCounters };
  card.flags = {};
  card.silenced = false;
  addLog(state, "ZONE", `${previousDefinitionId} 轉變為 ${definition.id}`, {
    instanceId: card.instanceId,
    originalDefinitionId: card.originalDefinitionId,
  });
  if (definition.enterFieldEffects?.length) {
    enqueueTriggeredEffects(state, card, definition.enterFieldEffects, "TRANSFORM_FIELD:ENTER_FIELD", createTimingContext(state, `TRANSFORM_FIELD_ENTER:${card.instanceId}`));
  }
  checkDoomsdayWin(state, card.controllerId);
  return true;
}
