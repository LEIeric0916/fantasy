import { getCardDefinition, isCardImplemented } from "../cards/cardRegistry";
import type { CardInstance, PlayerId } from "../cards/cardTypes";
import { getLegalAttackTargets } from "../engine/combatEngine";
import type { GameAction } from "../engine/gameEngine";
import type { GameState } from "../state/GameState";

function combinations<T>(items: readonly T[], minCount: number, maxCount: number): T[][] {
  const result: T[][] = [];
  function visit(index: number, selected: T[]) {
    if (selected.length >= minCount) result.push([...selected]);
    if (selected.length >= maxCount) return;
    for (let cursor = index; cursor < items.length; cursor += 1) {
      selected.push(items[cursor]);
      visit(cursor + 1, selected);
      selected.pop();
    }
  }
  visit(0, []);
  return result;
}

function permutations<T>(items: readonly T[]): T[][] {
  if (items.length <= 1) return [[...items]];
  return items.flatMap((item, index) => permutations([...items.slice(0, index), ...items.slice(index + 1)]).map((tail) => [item, ...tail]));
}

export function getActingPlayerId(state: GameState): PlayerId | undefined {
  if (state.phase === "GAME_OVER") return undefined;
  if (state.phase === "MULLIGAN") return !state.players.P1.mulliganDone ? "P1" : !state.players.P2.mulliganDone ? "P2" : undefined;
  return state.pendingChoice?.playerId ?? state.activePlayerId;
}

function canPlayCard(state: GameState, playerId: PlayerId, card: CardInstance): boolean {
  if (state.phase !== "MAIN" || state.activePlayerId !== playerId || state.pendingChoice) return false;
  const player = state.players[playerId];
  const definition = getCardDefinition(card.definitionId);
  if (!isCardImplemented(definition) || card.currentCost === null || card.currentCost > player.mana) return false;
  if (definition.cardType === "MINION" && player.minions.length >= state.rulesConfig.minionLimit) return false;
  if (definition.cardType === "FIELD") {
    const limit = state.rulesConfig.fieldLimits[player.faction];
    if (limit === undefined || (limit !== null && player.fields.length >= limit)) return false;
  }
  return true;
}

export function getLegalActions(state: GameState, playerId: PlayerId): GameAction[] {
  if (getActingPlayerId(state) !== playerId) return [];
  if (state.phase === "MULLIGAN") {
    return combinations(state.players[playerId].hand.map((card) => card.instanceId), 0, 4)
      .map((instanceIds) => ({ type: "MULLIGAN", playerId, instanceIds }));
  }

  const choice = state.pendingChoice;
  if (choice) {
    if (choice.type === "HAND_LIMIT") {
      return combinations(state.players[playerId].hand.map((card) => card.instanceId), choice.count, choice.count)
        .map((instanceIds) => ({ type: "SELECT_DISCARD", playerId, instanceIds }));
    }
    if (choice.type === "EFFECT_SUMMON_CONFIRM") return [{ type: "CONFIRM_EFFECT_SUMMON", playerId }];
    if (choice.type === "TRIGGER_ORDER") {
      return permutations(choice.instanceIds).map((instanceIds) => ({ type: "SELECT_TRIGGER_ORDER", playerId, instanceIds }));
    }
    if (choice.type === "COUNTDOWN_ORDER") {
      return permutations(choice.instanceIds).map((instanceIds) => ({ type: "SELECT_COUNTDOWN_ORDER", playerId, instanceIds }));
    }
    if (choice.type === "EFFECT_OPTION") {
      return choice.options.map((option) => ({ type: "SELECT_EFFECT_OPTION", playerId, optionId: option.id }));
    }
    const minCount = choice.minCount ?? choice.count;
    return combinations(choice.candidateInstanceIds, minCount, choice.count)
      .map((instanceIds) => ({ type: "SELECT_EFFECT_CARDS", playerId, instanceIds }));
  }

  if (state.phase !== "MAIN" || state.activePlayerId !== playerId) return [];
  const player = state.players[playerId];
  const actions: GameAction[] = [];
  for (const card of player.hand) {
    if (canPlayCard(state, playerId, card)) actions.push({ type: "PLAY_CARD", playerId, instanceId: card.instanceId });
    const definition = getCardDefinition(card.definitionId);
    if (card.keywords.includes("ALT_COST") && definition.alternatePlay && player.mana >= definition.alternatePlay.cost) {
      actions.push({ type: "PLAY_ALTERNATE", playerId, instanceId: card.instanceId });
    }
  }
  for (const field of player.fields) {
    const activated = !field.sealed ? getCardDefinition(field.definitionId).activatedEffect : undefined;
    if (!activated) continue;
    const available = activated.resource === "NECROMANCY" ? player.resources.necromancy : player.resources.recycleCharge;
    if (available >= activated.cost) actions.push({ type: "ACTIVATE_FIELD", playerId, instanceId: field.instanceId });
  }
  for (const attacker of player.minions) {
    for (const target of getLegalAttackTargets(state, attacker.instanceId)) {
      actions.push({ type: "ATTACK", playerId, attackerId: attacker.instanceId, target });
    }
  }
  actions.push({ type: "END_TURN", playerId });
  return actions;
}
