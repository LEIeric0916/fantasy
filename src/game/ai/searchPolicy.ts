import type { PlayerId } from "../cards/cardTypes";
import { applyAction, type GameAction } from "../engine/gameEngine";
import type { GameState } from "../state/GameState";
import { getActingPlayerId, getLegalActions } from "./legalActionEngine";
import { nextAiRandom, type RandomDecision } from "./randomPolicy";
import { evaluatePublicState } from "./stateEvaluator";

interface SearchCandidate { action: GameAction; state: GameState; score: number; hiddenInfoRevealed: boolean }
interface SearchBudget { remaining: number }

function revealsUnknownDeckCard(before: GameState, after: GameState, playerId: PlayerId): boolean {
  const unknownIds = new Set(before.players[playerId].deck.map((card) => card.instanceId));
  if (after.players[playerId].hand.some((card) => unknownIds.has(card.instanceId))) return true;
  const choice = after.pendingChoice;
  return choice?.type === "EFFECT_CARDS" && choice.candidateInstanceIds.some((id) => unknownIds.has(id));
}

function candidates(state: GameState, playerId: PlayerId, budget: SearchBudget): SearchCandidate[] {
  const result: SearchCandidate[] = [];
  for (const action of getLegalActions(state, playerId)) {
    if (budget.remaining <= 0) break;
    budget.remaining -= 1;
    const applied = applyAction(state, action);
    if (applied.error) continue;
    result.push({
      action,
      state: applied.state,
      score: evaluatePublicState(applied.state, playerId),
      hiddenInfoRevealed: revealsUnknownDeckCard(state, applied.state, playerId),
    });
  }
  return result;
}

function search(state: GameState, playerId: PlayerId, depth: number, beamWidth: number, budget: SearchBudget): number {
  const base = evaluatePublicState(state, playerId);
  if (depth <= 0 || state.phase === "GAME_OVER" || getActingPlayerId(state) !== playerId) return base;
  const next = candidates(state, playerId, budget).sort((a, b) => b.score - a.score).slice(0, beamWidth);
  if (next.length === 0) return base;
  return Math.max(...next.map((candidate) => candidate.hiddenInfoRevealed
    ? candidate.score
    : search(candidate.state, playerId, depth - 1, beamWidth, budget)));
}

/** 有限搜尋只展開 AI 當前的連續決策；輪到對手或翻出未知牌時便停止。 */
export function chooseSearchAction(state: GameState, playerId: PlayerId, seed: number, depth = 4, beamWidth = 10, nodeBudget = 180): RandomDecision {
  const budget: SearchBudget = { remaining: nodeBudget };
  const roots = candidates(state, playerId, budget);
  if (roots.length === 0) return { seed };
  const perRootBudget = Math.floor(budget.remaining / roots.length);
  let bestScore = Number.NEGATIVE_INFINITY;
  let bestActions: GameAction[] = [];
  for (const candidate of roots) {
    const branchBudget: SearchBudget = { remaining: perRootBudget };
    const score = candidate.state.phase === "GAME_OVER"
      ? candidate.score + 1_000
      : candidate.hiddenInfoRevealed
        ? candidate.score
        : search(candidate.state, playerId, depth - 1, beamWidth, branchBudget);
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
