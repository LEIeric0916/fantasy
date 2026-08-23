import type { PlayerId } from "../cards/cardTypes";
import { applyAction, type GameAction } from "../engine/gameEngine";
import type { GameState } from "../state/GameState";
import { getActingPlayerId, getLegalActions } from "./legalActionEngine";
import { nextAiRandom, type RandomDecision } from "./randomPolicy";
import { evaluatePublicState } from "./stateEvaluator";

interface SearchCandidate { action: GameAction; state: GameState; score: number; hiddenInfoRevealed: boolean }

function revealsUnknownDeckCard(before: GameState, after: GameState, playerId: PlayerId): boolean {
  const unknownIds = new Set(before.players[playerId].deck.map((card) => card.instanceId));
  if (after.players[playerId].hand.some((card) => unknownIds.has(card.instanceId))) return true;
  const choice = after.pendingChoice;
  return choice?.type === "EFFECT_CARDS" && choice.candidateInstanceIds.some((id) => unknownIds.has(id));
}

function candidates(state: GameState, playerId: PlayerId): SearchCandidate[] {
  return getLegalActions(state, playerId).flatMap((action) => {
    const result = applyAction(state, action);
    if (result.error) return [];
    return [{
      action,
      state: result.state,
      score: evaluatePublicState(result.state, playerId),
      hiddenInfoRevealed: revealsUnknownDeckCard(state, result.state, playerId),
    }];
  });
}

function search(state: GameState, playerId: PlayerId, depth: number, beamWidth: number): number {
  const base = evaluatePublicState(state, playerId);
  if (depth <= 0 || state.phase === "GAME_OVER" || getActingPlayerId(state) !== playerId) return base;
  const next = candidates(state, playerId).sort((a, b) => b.score - a.score).slice(0, beamWidth);
  if (next.length === 0) return base;
  return Math.max(...next.map((candidate) => candidate.hiddenInfoRevealed
    ? candidate.score
    : search(candidate.state, playerId, depth - 1, beamWidth)));
}

/** 有限搜尋只展開 AI 當前的連續決策；輪到對手或翻出未知牌時便停止。 */
export function chooseSearchAction(state: GameState, playerId: PlayerId, seed: number, depth = 3, beamWidth = 8): RandomDecision {
  const roots = candidates(state, playerId);
  if (roots.length === 0) return { seed };
  let bestScore = Number.NEGATIVE_INFINITY;
  let bestActions: GameAction[] = [];
  for (const candidate of roots) {
    const score = candidate.state.phase === "GAME_OVER"
      ? candidate.score + 1_000
      : candidate.hiddenInfoRevealed
        ? candidate.score
        : search(candidate.state, playerId, depth - 1, beamWidth);
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
