import { getCardDefinition } from "../cards/cardRegistry";
import type { ConditionDefinition, EffectDefinition, PlayerId } from "../cards/cardTypes";
import { applyAction, type GameAction } from "../engine/gameEngine";
import type { GameState } from "../state/GameState";
import { getActingPlayerId, getLegalActions } from "./legalActionEngine";
import { nextAiRandom, type RandomDecision } from "./randomPolicy";
import { evaluatePublicCardValue, evaluatePublicState } from "./stateEvaluator";

interface SearchCandidate { action: GameAction; state: GameState; score: number; tacticalScore: number }
interface SearchBudget { remaining: number }

function valentineTimingAdjustment(state: GameState, playerId: PlayerId): number {
  const player = state.players[playerId];
  const opponent = state.players[playerId === "P1" ? "P2" : "P1"];
  const missingHeroHp = Math.max(0, player.heroMaxHp - player.heroHp);
  const hasHighDamageThreat = opponent.minions.some((card) => !card.sealed && (card.currentAttack ?? 0) > 4);
  const hasProtectableBoard = player.minions.some((card) =>
    (card.currentHealth ?? 0) > 4
    && (card.counters.damageCap === undefined || card.counters.damageCap > 4),
  );

  if (hasHighDamageThreat && hasProtectableBoard) return 14;
  if (missingHeroHp >= 3) return 4;
  if (!hasProtectableBoard && missingHeroHp === 0) return -48;
  if (!hasProtectableBoard && missingHeroHp <= 2) return -34;
  if (!hasHighDamageThreat && missingHeroHp === 0) return -44;
  if (!hasHighDamageThreat && missingHeroHp <= 2) return -30;
  return -10;
}

function targetedBattlecryWaste(state: GameState, playerId: PlayerId, definitionId: string): number {
  const definition = getCardDefinition(definitionId);
  if (!definition.keywords.includes("BATTLECRY") || state.players[playerId === "P1" ? "P2" : "P1"].minions.length > 0) return 0;
  const wastesEnemyTarget = definition.effects?.some((effect) =>
    effect.type === "DAMAGE_TARGET_ENEMY_MINION"
    || effect.type === "DESTROY_TARGET_ENEMY_MINION"
    || effect.type === "SEAL_TARGET_ENEMY_MINION"
    || effect.type === "TRANSFORM_ENEMY_MINIONS"
    || effect.type === "TRANSFORM_UP_TO_ENEMY_MINIONS",
  ) ?? false;
  if (!wastesEnemyTarget) return 0;
  const alsoDiscards = definition.effects?.some((effect) => effect.type === "DISCARD_HAND") ?? false;
  return alsoDiscards ? -34 : -14;
}

function coinTimingWaste(state: GameState, playerId: PlayerId, coinInstanceId: string): number {
  const player = state.players[playerId];
  const coin = player.hand.find((card) => card.instanceId === coinInstanceId);
  if (!coin || coin.definitionId !== "TOKEN_COIN") return 0;
  const manaGain = getCardDefinition(coin.definitionId).effects
    ?.filter((effect) => effect.type === "GAIN_MANA")
    .reduce((sum, effect) => sum + effect.value, 0) ?? 0;
  const followUps = player.hand.filter((card) =>
    card.instanceId !== coinInstanceId
    && card.currentCost !== null
    && card.currentCost <= player.mana + manaGain,
  );
  const hasWorthwhileFollowUp = followUps.some((card) => targetedBattlecryWaste(state, playerId, card.definitionId) === 0);
  return hasWorthwhileFollowUp ? 0 : -24;
}

function isArtifact(definitionId: string): boolean {
  const definition = getCardDefinition(definitionId);
  return definition.cardType === "FIELD" && definition.subtype.includes("ARTIFACT");
}

function machinePlayTimingScore(state: GameState, playerId: PlayerId, instanceId: string): number {
  const player = state.players[playerId];
  if (player.faction !== "MACHINE") return 0;
  const card = player.hand.find((candidate) => candidate.instanceId === instanceId);
  if (!card) return 0;

  const hasArtifact = player.fields.some((field) => isArtifact(field.definitionId));
  const hasPlayableArtifact = player.hand.some((candidate) =>
    candidate.instanceId !== instanceId
    && isArtifact(candidate.definitionId)
    && candidate.currentCost !== null
    && candidate.currentCost <= player.mana,
  );
  const hasArtifactPayoff = player.hand.some((candidate) =>
    candidate.instanceId !== instanceId
    && (candidate.definitionId === "MACHINE_002" || candidate.definitionId === "MACHINE_003"),
  );
  const mulius = player.hand.find((candidate) => candidate.definitionId === "MACHINE_014" && candidate.currentCost !== null);
  const artifactBeforeMulius = mulius ? player.hand.find((candidate) =>
    candidate.instanceId !== mulius.instanceId
    && isArtifact(candidate.definitionId)
    && candidate.currentCost !== null
    && mulius.currentCost !== null
    && candidate.currentCost + Math.max(0, mulius.currentCost - 1) <= player.mana,
  ) : undefined;

  if (card.definitionId === "MACHINE_002" || card.definitionId === "MACHINE_003") {
    if (hasArtifact) return card.definitionId === "MACHINE_002" ? 16 : 12;
    if (hasPlayableArtifact) return card.definitionId === "MACHINE_002" ? -38 : -28;
    return card.definitionId === "MACHINE_002" ? -12 : -7;
  }
  if (isArtifact(card.definitionId) && !hasArtifact && hasArtifactPayoff) return 20;
  if (card.definitionId === "MACHINE_014" && artifactBeforeMulius) return -72;
  if (isArtifact(card.definitionId) && mulius && artifactBeforeMulius?.instanceId === card.instanceId) return 58;

  if (card.definitionId === "MACHINE_007") {
    const machineMinions = player.hand.filter((candidate) => {
      if (candidate.instanceId === instanceId) return false;
      const definition = getCardDefinition(candidate.definitionId);
      return definition.faction === "MACHINE" && definition.cardType === "MINION";
    });
    const onlyCheapTargets = machineMinions.length > 0 && machineMinions.every((candidate) =>
      (getCardDefinition(candidate.definitionId).originalCost ?? Number.POSITIVE_INFINITY) <= 3,
    );
    if (onlyCheapTargets) return -70;
    const hasDirectMachinePlay = machineMinions.some((candidate) => {
      if (candidate.instanceId === instanceId || candidate.currentCost === null || candidate.currentCost > player.mana) return false;
      return true;
    });
    if (player.maxMana <= 4 && hasDirectMachinePlay) return -42;
  }
  return 0;
}

function machineDescentChoiceScore(state: GameState, playerId: PlayerId, action: GameAction): number {
  if (action.type !== "SELECT_EFFECT_CARDS" || state.pendingChoice?.type !== "EFFECT_CARDS"
    || state.pendingChoice.resolution.type !== "RETURN_HAND_TO_DECK_MACHINE_DISCOUNT") return 0;

  const player = state.players[playerId];
  const selected = action.instanceIds
    .map((instanceId) => player.hand.find((card) => card.instanceId === instanceId))
    .filter((card) => card !== undefined);
  const selectedIds = new Set(action.instanceIds);
  const nextMachine = player.hand
    .filter((card) => !selectedIds.has(card.instanceId))
    .filter((card) => {
      const definition = getCardDefinition(card.definitionId);
      return definition.faction === "MACHINE" && definition.cardType === "MINION" && card.currentCost !== null;
    })
    .sort((a, b) => (b.currentCost ?? 0) - (a.currentCost ?? 0))[0];
  const reduction = selected.length * state.pendingChoice.resolution.reductionPerCard;
  const usefulReduction = nextMachine ? Math.min(reduction, nextMachine.currentCost ?? 0) : 0;
  const selectedValue = selected.reduce((sum, card) => sum + evaluatePublicCardValue(card), 0);
  const earlyGame = player.maxMana <= 4 || player.turnsStarted <= 3;

  if (selected.length === 0) return earlyGame ? 8 : 0;
  if (nextMachine && (getCardDefinition(nextMachine.definitionId).originalCost ?? Number.POSITIVE_INFINITY) <= 3) {
    return -90 - selected.length * 12 - selectedValue * 0.2;
  }
  if (earlyGame) {
    return usefulReduction * 2
      - selected.length * 30
      - selectedValue * 0.25
      - (nextMachine ? 0 : 20);
  }
  return usefulReduction * 2.5
    - selected.length * 5
    - selectedValue * 0.08
    - (nextMachine ? 0 : 20);
}

function planningConditionMatches(state: GameState, playerId: PlayerId, condition: ConditionDefinition): boolean {
  const player = state.players[playerId];
  const opponent = state.players[playerId === "P1" ? "P2" : "P1"];
  switch (condition.type) {
    case "SUMMONED_THIS_GAME_AT_LEAST": return player.summonedThisGame + 1 >= condition.value;
    case "SUMMONED_THIS_GAME_BELOW": return player.summonedThisGame + 1 < condition.value;
    case "FRIENDLY_MINION_COUNT_AT_LEAST": return player.minions.length + 1 >= condition.value;
    case "FRIENDLY_MINION_COUNT_LESS_THAN_OPPONENT": return player.minions.length + 1 < opponent.minions.length;
    case "OPPONENT_HAS_MINION": return opponent.minions.length > 0;
    case "MAX_MANA_EQUALS": return player.maxMana === condition.value;
    case "MAX_MANA_AT_LEAST": return player.maxMana >= condition.value;
    case "ALL": return condition.conditions.every((nested) => planningConditionMatches(state, playerId, nested));
    default: return true;
  }
}

function plannedExtraMinions(state: GameState, playerId: PlayerId, effects: readonly EffectDefinition[] | undefined): number {
  if (!effects) return 0;
  return effects.reduce((sum, effect) => {
    if (effect.type === "SUMMON") return sum + effect.count;
    if (effect.type === "CHOOSE_DISTINCT_GENERATED_MINIONS") return sum + effect.count;
    if (effect.type === "CONDITIONAL" && planningConditionMatches(state, playerId, effect.condition)) {
      return sum + plannedExtraMinions(state, playerId, effect.effects);
    }
    if (effect.type === "MECHANICAL_TECHNIQUE" && state.players[playerId].resources.recycleCharge >= effect.cost) {
      return sum + plannedExtraMinions(state, playerId, effect.effects);
    }
    if (effect.type === "NECROMANCY" && state.players[playerId].resources.necromancy >= effect.cost) {
      return sum + plannedExtraMinions(state, playerId, effect.effects);
    }
    return sum;
  }, 0);
}

function needsBoardSpaceForHand(state: GameState, playerId: PlayerId): boolean {
  const player = state.players[playerId];
  const availableSlots = state.rulesConfig.minionLimit - player.minions.length;
  return player.hand.some((card) => {
    if (card.currentCost === null || card.currentCost > player.mana) return false;
    const definition = getCardDefinition(card.definitionId);
    if (definition.cardType !== "MINION") return false;
    return 1 + plannedExtraMinions(state, playerId, definition.effects) > availableSlots;
  });
}

function boardSpaceActionScore(state: GameState, playerId: PlayerId, action: GameAction): number {
  const player = state.players[playerId];
  if (action.type === "PLAY_CARD" || action.type === "PLAY_ALTERNATE") {
    const card = player.hand.find((candidate) => candidate.instanceId === action.instanceId);
    if (!card) return 0;
    const definition = getCardDefinition(card.definitionId);
    if (definition.cardType !== "MINION") return 0;
    const availableSlots = state.rulesConfig.minionLimit - player.minions.length;
    const lostSummons = Math.max(0, 1 + plannedExtraMinions(state, playerId, definition.effects) - availableSlots);
    return lostSummons > 0 ? -32 * lostSummons : 0;
  }
  if (action.type !== "ATTACK" || action.target.type !== "MINION" || !needsBoardSpaceForHand(state, playerId)) return 0;
  const attacker = player.minions.find((card) => card.instanceId === action.attackerId);
  const opponent = state.players[playerId === "P1" ? "P2" : "P1"];
  const targetInstanceId = action.target.instanceId;
  const defender = opponent.minions.find((card) => card.instanceId === targetInstanceId);
  if (!attacker || !defender) return 0;
  const attackerDies = !attacker.keywords.includes("DIVINE_SHIELD")
    && !attacker.keywords.includes("INVINCIBLE")
    && !defender.keywords.includes("CANNOT_COUNTERATTACK")
    && ((defender.currentAttack ?? 0) >= (attacker.currentHealth ?? Number.POSITIVE_INFINITY)
      || defender.keywords.includes("LETHAL"));
  const defenderDies = !defender.keywords.includes("DIVINE_SHIELD")
    && !defender.keywords.includes("INVINCIBLE")
    && ((attacker.currentAttack ?? 0) >= (defender.currentHealth ?? Number.POSITIVE_INFINITY)
      || attacker.keywords.includes("LETHAL"));
  if (attackerDies && defenderDies) return 120;
  if (attackerDies && !defenderDies) return -100;
  return 0;
}

function royalWarriorTimingScore(state: GameState, playerId: PlayerId, instanceId: string): number {
  const player = state.players[playerId];
  const card = player.hand.find((candidate) => candidate.instanceId === instanceId);
  if (!card || card.definitionId !== "ALLIANCE_010") return 0;
  if (player.summonedThisGame + 1 >= 15) return 18;

  const opponent = state.players[playerId === "P1" ? "P2" : "P1"];
  const incomingAttack = opponent.minions.reduce((sum, minion) => sum + Math.max(0, minion.currentAttack ?? 0), 0);
  const underPressure = player.heroHp <= 15
    || incomingAttack >= player.heroHp
    || (opponent.minions.length >= player.minions.length + 2 && incomingAttack >= 6);
  if (underPressure) return 12;

  let remainingMana = player.mana;
  let projectedSummons = 0;
  const setupMinions = player.hand
    .filter((candidate) => candidate.instanceId !== instanceId && candidate.currentCost !== null)
    .filter((candidate) => getCardDefinition(candidate.definitionId).cardType === "MINION")
    .sort((a, b) => (a.currentCost ?? 0) - (b.currentCost ?? 0));
  for (const setup of setupMinions) {
    const cost = setup.currentCost ?? Number.POSITIVE_INFINITY;
    if (cost > remainingMana) continue;
    remainingMana -= cost;
    projectedSummons += 1 + plannedExtraMinions(state, playerId, getCardDefinition(setup.definitionId).effects);
  }
  if (player.summonedThisGame + projectedSummons + 1 >= 15) return -44;
  return 15 - player.summonedThisGame <= 3 ? -20 : 0;
}

function lowCostSetupScore(state: GameState, playerId: PlayerId, instanceId: string): number {
  const card = state.players[playerId].hand.find((candidate) => candidate.instanceId === instanceId);
  if (!card || card.currentCost === null || card.currentCost > 1) return 0;
  const effects = getCardDefinition(card.definitionId).effects;
  const enablesFollowUp = effects?.some((effect) =>
    effect.type === "SEARCH_DECK"
    || effect.type === "DISCOVER_TOP"
    || effect.type === "GRANT_NEXT_MINION_TEMPORARY_COST_REDUCTION",
  ) ?? false;
  return enablesFollowUp ? 45 : 0;
}

function tacticalActionScore(state: GameState, playerId: PlayerId, action: GameAction): number {
  const descentChoiceScore = machineDescentChoiceScore(state, playerId, action);
  if (descentChoiceScore !== 0) return descentChoiceScore;
  if (action.type === "SELECT_EFFECT_CARDS" && state.pendingChoice?.type === "EFFECT_CARDS"
    && state.pendingChoice.resolution.type === "GRANT_MINION_KEYWORD") {
    const grantedKeyword = state.pendingChoice.resolution.keyword;
    const targets = action.instanceIds
      .map((instanceId) => state.players[playerId].minions.find((card) => card.instanceId === instanceId))
      .filter((card) => card !== undefined);
    return targets.reduce((sum, card) => {
      if (card.keywords.includes(grantedKeyword)) return sum - 40;
      return sum + evaluatePublicCardValue(card) * 0.22;
    }, 0);
  }
  if (action.type === "ATTACK") return boardSpaceActionScore(state, playerId, action);
  if (action.type !== "PLAY_CARD" && action.type !== "PLAY_ALTERNATE") return 0;
  const card = state.players[playerId].hand.find((candidate) => candidate.instanceId === action.instanceId);
  if (!card) return 0;
  return targetedBattlecryWaste(state, playerId, card.definitionId)
    + coinTimingWaste(state, playerId, card.instanceId)
    + machinePlayTimingScore(state, playerId, card.instanceId)
    + lowCostSetupScore(state, playerId, card.instanceId)
    + royalWarriorTimingScore(state, playerId, card.instanceId)
    + boardSpaceActionScore(state, playerId, action);
}

function actionPlanningPriority(state: GameState, playerId: PlayerId, action: GameAction): number {
  if (action.type === "SELECT_EFFECT_CARDS" || action.type === "SELECT_EFFECT_OPTION" || action.type === "CONFIRM_EFFECT_SUMMON") return 80;
  if (action.type === "ATTACK" && action.target.type === "MINION") return 35 + boardSpaceActionScore(state, playerId, action);
  if (action.type === "ATTACK") return 20;
  if (action.type === "ACTIVATE_FIELD") return 28;
  if (action.type === "END_TURN") return -100;
  if (action.type !== "PLAY_CARD" && action.type !== "PLAY_ALTERNATE") return 0;

  const player = state.players[playerId];
  const card = player.hand.find((candidate) => candidate.instanceId === action.instanceId);
  if (!card) return 0;
  const definition = getCardDefinition(card.definitionId);
  const cost = card.currentCost ?? definition.originalCost ?? 10;
  let priority = 50 - cost;
  if (definition.cardType === "MINION") priority += 8;
  if (definition.keywords.includes("BATTLECRY")) priority += 4;
  const opensFollowUp = definition.effects?.some((effect) =>
    effect.type === "SEARCH_DECK"
    || effect.type === "DISCOVER_TOP"
    || effect.type === "GRANT_NEXT_MINION_TEMPORARY_COST_REDUCTION",
  ) ?? false;
  if (definition.effects?.some((effect) => effect.type === "SUMMON" || opensFollowUp)) priority += 9;
  if (opensFollowUp && cost <= 1) priority += 36;
  if (player.faction === "ALLIANCE" && definition.cardType === "MINION") priority += 5;
  if (definition.id === "TOKEN_ALLIANCE_HERO_VALENTINE") priority += valentineTimingAdjustment(state, playerId);
  priority += machinePlayTimingScore(state, playerId, card.instanceId);
  priority += royalWarriorTimingScore(state, playerId, card.instanceId);
  if (definition.dynamicCost?.type === "SUMMONED_THIS_TURN_MULTIPLIER" && player.hand.some((candidate) => {
    if (candidate.instanceId === card.instanceId || candidate.currentCost === null || candidate.currentCost > player.mana) return false;
    return getCardDefinition(candidate.definitionId).cardType === "MINION";
  })) {
    priority -= Math.max(18, 28 - player.summonedThisTurn * 5);
  }
  return priority;
}

function candidates(state: GameState, playerId: PlayerId, budget: SearchBudget): SearchCandidate[] {
  const result: SearchCandidate[] = [];
  const orderedActions = getLegalActions(state, playerId)
    .sort((a, b) => actionPlanningPriority(state, playerId, b) - actionPlanningPriority(state, playerId, a));
  for (const action of orderedActions) {
    if (budget.remaining <= 0) break;
    budget.remaining -= 1;
    const applied = applyAction(state, action);
    if (applied.error) continue;
    result.push({
      action,
      state: applied.state,
      score: evaluatePublicState(applied.state, playerId),
      tacticalScore: tacticalActionScore(state, playerId, action),
    });
  }
  return result;
}

function search(state: GameState, playerId: PlayerId, depth: number, beamWidth: number, budget: SearchBudget): number {
  const base = evaluatePublicState(state, playerId);
  if (depth <= 0 || state.phase === "GAME_OVER" || getActingPlayerId(state) !== playerId) return base;
  const next = candidates(state, playerId, budget)
    .sort((a, b) => (b.score + b.tacticalScore) - (a.score + a.tacticalScore))
    .slice(0, beamWidth);
  if (next.length === 0) return base;
  return Math.max(...next.map((candidate) =>
    candidate.tacticalScore + search(candidate.state, playerId, depth - 1, beamWidth, budget),
  ));
}

/** 有限搜尋會展開 AI 當前回合的連續決策；輪到對手時停止，用公開局面估算下回合威脅。 */
export function chooseSearchAction(state: GameState, playerId: PlayerId, seed: number, depth = 7, beamWidth = 14, nodeBudget = 650): RandomDecision {
  const legalActions = getLegalActions(state, playerId);
  const hasImmediateLethal = legalActions.some((action) => {
    if (action.type !== "ATTACK" || action.target.type !== "HERO") return false;
    const attacker = state.players[playerId].minions.find((card) => card.instanceId === action.attackerId);
    return (attacker?.currentAttack ?? 0) >= state.players[action.target.playerId].heroHp;
  });
  if (!hasImmediateLethal) {
    const spaceTrades = legalActions
      .filter((action) => action.type === "ATTACK" && action.target.type === "MINION")
      .map((action) => ({ action, score: boardSpaceActionScore(state, playerId, action) }))
      .filter((candidate) => candidate.score >= 100);
    if (spaceTrades.length > 0) {
      const bestScore = Math.max(...spaceTrades.map((candidate) => candidate.score));
      const best = spaceTrades.filter((candidate) => candidate.score === bestScore);
      const roll = nextAiRandom(seed);
      return { action: best[Math.floor(roll.value * best.length)].action, seed: roll.seed };
    }
  }
  const budget: SearchBudget = { remaining: nodeBudget };
  const roots = candidates(state, playerId, budget);
  if (roots.length === 0) return { seed };
  const perRootBudget = Math.floor(budget.remaining / roots.length);
  let bestScore = Number.NEGATIVE_INFINITY;
  let bestActions: GameAction[] = [];
  for (const candidate of roots) {
    const branchBudget: SearchBudget = { remaining: perRootBudget };
    const planningTiebreak = actionPlanningPriority(state, playerId, candidate.action) * 0.12;
    const score = candidate.state.phase === "GAME_OVER"
      ? candidate.score + candidate.tacticalScore + 1_000
      : candidate.tacticalScore + search(candidate.state, playerId, depth - 1, beamWidth, branchBudget) + planningTiebreak;
    if (score > bestScore + Number.EPSILON) {
      bestScore = score;
      bestActions = [candidate.action];
    } else if (Math.abs(score - bestScore) <= Number.EPSILON) {
      bestActions.push(candidate.action);
    }
  }
  const roll = nextAiRandom(seed);
  return { action: bestActions[Math.floor(roll.value * bestActions.length)], seed: roll.seed };
}
