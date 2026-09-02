import { getCardDefinition } from "../cards/cardRegistry";
import type { CardInstance, Keyword, PlayerId } from "../cards/cardTypes";
import type { GameState, PlayerState } from "../state/GameState";
import { evaluateFactionStrategy } from "./factionStrategy";

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

export function evaluatePublicCardValue(card: CardInstance): number {
  const definition = getCardDefinition(card.definitionId);
  const attack = card.currentAttack ?? 0;
  const health = card.currentHealth ?? 0;
  const keywordScore = card.sealed ? 0 : card.keywords.reduce((sum, keyword) => sum + (keywordValues[keyword] ?? 0), 0);
  const effectScore = card.sealed ? 0 : (definition.triggeredEffects ? Object.keys(definition.triggeredEffects).length * 0.75 : 0);
  return attack * 3.2 + health * 2.2 + keywordScore + effectScore;
}

function projectedHeroDamage(attacker: PlayerState, defender: PlayerState): number {
  const attackPower = attacker.minions
    .filter((card) => !card.sealed)
    .reduce((sum, card) => sum + Math.max(0, card.currentAttack ?? 0) * (card.keywords.includes("WINDFURY") ? 2 : 1), 0);
  const guardHealth = defender.minions
    .filter((card) => !card.sealed && card.keywords.includes("TAUNT"))
    .reduce((sum, card) => sum + Math.max(0, card.currentHealth ?? 0), 0);
  let projected = Math.max(0, attackPower - guardHealth);
  const blockedHits = defender.heroDamageNullifiers + (defender.heroDivineShield ? 1 : 0);
  if (blockedHits > 0 && projected > 0) {
    const largestHit = Math.max(0, ...attacker.minions.map((card) => card.currentAttack ?? 0));
    projected = Math.max(0, projected - largestHit * blockedHits);
  }
  return projected;
}

function threatPenalty(player: PlayerState, opponent: PlayerState): number {
  const incoming = projectedHeroDamage(opponent, player);
  const nextTurnDevelopment = Math.min(opponent.hand.length, Math.max(1, Math.floor((opponent.maxMana + 1) / 2)));
  const boardDeficit = Math.max(0, opponent.minions.length - player.minions.length);
  const futurePressure = nextTurnDevelopment * (opponent.maxMana >= 6 ? 2.1 : 1.1) + boardDeficit * 2.6;
  if (incoming >= player.heroHp) return 300 + (incoming - player.heroHp) * 12;
  return incoming * (player.heroHp <= 15 ? 4 : 1.4) + futurePressure;
}

function publicPlayerValue(player: PlayerState, opponent: PlayerState): number {
  const board = player.minions.reduce((sum, card) => sum + evaluatePublicCardValue(card), 0);
  const fields = player.fields.reduce((sum, card) => sum + 3 + evaluatePublicCardValue(card) * 0.2, 0);
  return player.heroHp * 5
    + (player.heroDivineShield ? 5 : 0)
    + board
    + fields
    + player.hand.length * 2
    + player.maxMana * 1.25
    + player.mana * 0.15
    + player.resources.necromancy * 0.2
    + player.resources.recycleCharge * 0.3
    + player.summonedThisGame * 0.05
    - threatPenalty(player, opponent);
}

/**
 * 僅使用雙方都能觀察到的資料評分。刻意不讀手牌內容與牌庫順序，
 * 因此替換任一方尚未公開的卡牌身分不會改變分數。
 */
export function evaluatePublicState(state: GameState, playerId: PlayerId): number {
  if (state.phase === "GAME_OVER") return state.winner === playerId ? 1_000_000_000 : -1_000_000_000;
  const opponentId: PlayerId = playerId === "P1" ? "P2" : "P1";
  const player = state.players[playerId];
  const opponent = state.players[opponentId];
  return publicPlayerValue(player, opponent)
    - publicPlayerValue(opponent, player)
    + evaluateFactionStrategy(state, playerId)
    - evaluateFactionStrategy(state, opponentId);
}
