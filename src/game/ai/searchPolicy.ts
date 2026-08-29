import { getCardDefinition } from "../cards/cardRegistry";
import type { PlayerId } from "../cards/cardTypes";
import { applyAction, type GameAction } from "../engine/gameEngine";
import type { GameState } from "../state/GameState";
import { getActingPlayerId, getLegalActions } from "./legalActionEngine";
import { nextAiRandom, type RandomDecision } from "./randomPolicy";
import { evaluatePublicState } from "./stateEvaluator";

interface SearchCandidate { action: GameAction; state: GameState; score: number }
interface SearchBudget { remaining: number }

function actionPlanningPriority(state: GameState, playerId: PlayerId, action: GameAction): number {
  if (action.type === "SELECT_EFFECT_CARDS" || action.type === "SELECT_EFFECT_OPTION" || action.type === "CONFIRM_EFFECT_SUMMON") return 80;
  if (action.type === "ATTACK" && action.target.type === "MINION") return 35;
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
    });
  }
  return result;
}

function search(state: GameState, playerId: PlayerId, depth: number, beamWidth: number, budget: SearchBudget): number {
  const base = evaluatePublicState(state, playerId);
  if (depth <= 0 || state.phase === "GAME_OVER" || getActingPlayerId(state) !== playerId) return base;
  const next = candidates(state, playerId, budget).sort((a, b) => b.score - a.score).slice(0, beamWidth);
  if (next.length === 0) return base;
  return Math.max(...next.map((candidate) => search(candidate.state, playerId, depth - 1, beamWidth, budget)));
}

/** 有限搜尋會展開 AI 當前回合的連續決策；輪到對手時停止，用公開局面估算下回合威脅。 */
export function chooseSearchAction(state: GameState, playerId: PlayerId, seed: number, depth = 7, beamWidth = 14, nodeBudget = 650): RandomDecision {
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
      ? candidate.score + 1_000
      : search(candidate.state, playerId, depth - 1, beamWidth, branchBudget) + planningTiebreak;
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
