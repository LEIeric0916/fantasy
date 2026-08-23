import type { PlayerId } from "../cards/cardTypes";
import type { GameAction } from "../engine/gameEngine";
import type { GameState } from "../state/GameState";
import { getLegalActions } from "./legalActionEngine";

export interface RandomDecision {
  action?: GameAction;
  seed: number;
}

export function nextAiRandom(seed: number): { value: number; seed: number } {
  const nextSeed = (seed * 1664525 + 1013904223) >>> 0;
  return { value: nextSeed / 0x1_0000_0000, seed: nextSeed };
}

export function chooseRandomAction(state: GameState, playerId: PlayerId, seed: number): RandomDecision {
  const actions = getLegalActions(state, playerId);
  if (actions.length === 0) return { seed };
  const roll = nextAiRandom(seed);
  return { action: actions[Math.floor(roll.value * actions.length)], seed: roll.seed };
}
