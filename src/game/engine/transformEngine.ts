import { getCardDefinition } from "../cards/cardRegistry";
import type { CardInstance } from "../cards/cardTypes";
import type { GameState } from "../state/GameState";
import { addLog } from "../utils/gameLog";
import { hasActiveKeyword } from "../keywords/keywordRules";
import { InvalidActionError, RuleUndefinedError } from "./errors";

export function transformMinion(state: GameState, card: CardInstance, definitionId: string): boolean {
  if (card.zone !== "MINION") throw new InvalidActionError("只有场上的手下可以转变");
  if (hasActiveKeyword(card, "DISCIPLINE") || hasActiveKeyword(card, "INVINCIBLE")) return false;
  const definition = getCardDefinition(definitionId);
  if (definition.cardType !== "MINION") throw new InvalidActionError("转变目标定义必须是手下");
  if (definition.attack === null || definition.health === null) {
    throw new RuleUndefinedError("NULL_MINION_STATS", "转变后的手下数值为 null", definitionId);
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
  addLog(state, "ZONE", `${previousDefinitionId} 转变为 ${definition.id}`, {
    instanceId: card.instanceId,
    originalDefinitionId: card.originalDefinitionId,
  });
  for (const player of Object.values(state.players)) {
    for (const field of [...player.fields]) {
      const aura = !field.sealed ? getCardDefinition(field.definitionId).transformAura : undefined;
      if (!aura || aura.transformedDefinitionId !== definition.id) continue;
      field.counters[aura.counter] = (field.counters[aura.counter] ?? 0) + 1;
      addLog(state, "RESOURCE", `${field.definitionId} 放置1个标记`, {
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
  const count = state.players[playerId].fields.filter((field) => field.definitionId === "TOKEN_UNDEAD_DOOMSDAY_BOOK").length;
  if (count < 4) return false;
  state.phase = "GAME_OVER";
  state.winner = playerId;
  state.loseReason = "DOOMSDAY_BOOK";
  addLog(state, "RESULT", `${playerId} 集齐4张末日之书，立即获胜`, { reason: "DOOMSDAY_BOOK" });
  return true;
}

export function transformField(state: GameState, card: CardInstance, definitionId: string): boolean {
  if (card.zone !== "FIELD") throw new InvalidActionError("只有场上的立场可以转变");
  if (hasActiveKeyword(card, "DISCIPLINE") || hasActiveKeyword(card, "INVINCIBLE")) return false;
  const definition = getCardDefinition(definitionId);
  if (definition.cardType !== "FIELD") throw new InvalidActionError("转变目标定义必须是立场");
  const previousDefinitionId = card.definitionId;
  card.definitionId = definition.id;
  card.currentCost = definition.originalCost;
  card.keywords = [...definition.keywords];
  card.counters = { ...definition.initialCounters };
  card.flags = {};
  card.silenced = false;
  addLog(state, "ZONE", `${previousDefinitionId} 转变为 ${definition.id}`, {
    instanceId: card.instanceId,
    originalDefinitionId: card.originalDefinitionId,
  });
  checkDoomsdayWin(state, card.controllerId);
  return true;
}
