import { getCardDefinition } from "../cards/cardRegistry";
import type { CardInstance, Keyword, PlayerId } from "../cards/cardTypes";
import type { GameState, PlayerState } from "../state/GameState";

const keywordValues: Partial<Record<Keyword, number>> = {
  TAUNT: 2,
  RUSH: 0.5,
  CHARGE: 1,
  DIVINE_SHIELD: 3,
  STEALTH: 1.5,
  DETERRENCE: 1,
  WARD: 1.5,
  DISCIPLINE: 2,
  INVINCIBLE: 5,
  LETHAL: 2.5,
  WINDFURY: 2,
};

function publicCardValue(card: CardInstance): number {
  const definition = getCardDefinition(card.definitionId);
  const attack = card.currentAttack ?? 0;
  const health = card.currentHealth ?? 0;
  const keywordScore = card.sealed ? 0 : card.keywords.reduce((sum, keyword) => sum + (keywordValues[keyword] ?? 0), 0);
  const effectScore = card.sealed ? 0 : (definition.triggeredEffects ? Object.keys(definition.triggeredEffects).length * 0.75 : 0);
  return attack * 2.8 + health * 2 + keywordScore + effectScore;
}

function publicPlayerValue(player: PlayerState): number {
  const board = player.minions.reduce((sum, card) => sum + publicCardValue(card), 0);
  const fields = player.fields.reduce((sum, card) => sum + 3 + publicCardValue(card) * 0.2, 0);
  return player.heroHp * 12
    + (player.heroDivineShield ? 5 : 0)
    + board
    + fields
    + player.hand.length * 2
    + player.maxMana * 1.25
    + player.mana * 0.15
    + player.resources.necromancy * 0.2
    + player.resources.recycleCharge * 0.3
    + player.summonedThisGame * 0.05;
}

/**
 * 僅使用雙方都能觀察到的資料評分。刻意不讀手牌內容與牌庫順序，
 * 因此替換任一方尚未公開的卡牌身分不會改變分數。
 */
export function evaluatePublicState(state: GameState, playerId: PlayerId): number {
  if (state.phase === "GAME_OVER") return state.winner === playerId ? 1_000_000_000 : -1_000_000_000;
  const opponentId: PlayerId = playerId === "P1" ? "P2" : "P1";
  return publicPlayerValue(state.players[playerId]) - publicPlayerValue(state.players[opponentId]);
}
