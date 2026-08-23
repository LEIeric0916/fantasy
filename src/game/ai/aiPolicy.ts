import type { PlayerId } from "../cards/cardTypes";
import type { GameState } from "../state/GameState";
import { chooseHeuristicAction } from "./heuristicPolicy";
import { chooseRandomAction, type RandomDecision } from "./randomPolicy";
import { chooseSearchAction } from "./searchPolicy";

export type AiDifficulty = "RANDOM" | "HEURISTIC" | "SEARCH";

export function chooseAiAction(state: GameState, playerId: PlayerId, seed: number, difficulty: AiDifficulty): RandomDecision {
  if (difficulty === "HEURISTIC") return chooseHeuristicAction(state, playerId, seed);
  if (difficulty === "SEARCH") return chooseSearchAction(state, playerId, seed);
  return chooseRandomAction(state, playerId, seed);
}
