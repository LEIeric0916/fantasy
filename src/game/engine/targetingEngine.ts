import type { CardInstance, PlayerId } from "../cards/cardTypes";
import type { GameState } from "../state/GameState";
import { hasActiveKeyword } from "../keywords/keywordRules";
import { opponentOf } from "./turnEngine";

export function getLegalEnemyEffectTargets(
  state: GameState,
  playerId: PlayerId,
  interference = false,
): CardInstance[] {
  return state.players[opponentOf(playerId)].minions.filter((card) => {
    if (hasActiveKeyword(card, "STEALTH") || hasActiveKeyword(card, "WARD")) return false;
    if (interference && (hasActiveKeyword(card, "DISCIPLINE") || hasActiveKeyword(card, "INVINCIBLE"))) return false;
    return true;
  });
}
