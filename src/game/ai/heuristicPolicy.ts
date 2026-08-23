import type { PlayerId } from "../cards/cardTypes";
import { applyAction, type GameAction } from "../engine/gameEngine";
import type { GameState } from "../state/GameState";
import { getLegalActions } from "./legalActionEngine";
import { nextAiRandom, type RandomDecision } from "./randomPolicy";
import { evaluatePublicState } from "./stateEvaluator";

function actionBias(action: GameAction, hasAlternative: boolean): number {
  if (action.type === "END_TURN" && hasAlternative) return -0.2;
  if (action.type === "ATTACK" && action.target.type === "HERO") return 0.05;
  return 0;
}

export function chooseHeuristicAction(state: GameState, playerId: PlayerId, seed: number): RandomDecision {
  const actions = getLegalActions(state, playerId);
  if (actions.length === 0) return { seed };
  let bestScore = Number.NEGATIVE_INFINITY;
  let bestActions: GameAction[] = [];
  for (const action of actions) {
    const result = applyAction(state, action);
    if (result.error) continue;
    const score = evaluatePublicState(result.state, playerId) + actionBias(action, actions.length > 1);
    if (score > bestScore + Number.EPSILON) {
      bestScore = score;
      bestActions = [action];
    } else if (Math.abs(score - bestScore) <= Number.EPSILON) {
      bestActions.push(action);
    }
  }
  if (bestActions.length === 0) return { seed };
  const roll = nextAiRandom(seed);
  return { action: bestActions[Math.floor(roll.value * bestActions.length)], seed: roll.seed };
}
