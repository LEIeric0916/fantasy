import { getCardDefinition, getMainDeckDefinitions } from "../cards/cardRegistry";
import type { CardDefinition, CardInstance, EffectDefinition, Keyword, PlayerId } from "../cards/cardTypes";
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

/** 僅根據公開的場面資訊，衡量敵方手下若留到下回合的危險程度。 */
export function evaluatePublicMinionThreat(card: CardInstance): number {
  const definition = getCardDefinition(card.definitionId);
  const attack = Math.max(0, card.currentAttack ?? 0);
  const recurringEffects = card.sealed ? 0 : Object.keys(definition.triggeredEffects ?? {})
    .filter((timing) => timing === "END_TURN" || timing === "GROWTH" || timing === "ON_ATTACK" || timing === "ON_FRIENDLY_COMBAT_KILL")
    .length;
  const protection = card.sealed ? 0
    : (card.keywords.includes("DIVINE_SHIELD") ? 4 : 0)
      + (card.keywords.includes("LETHAL") ? 5 : 0)
      + (card.keywords.includes("AURA") ? 5 : 0)
      + (card.keywords.includes("TAUNT") ? 1 : 0);
  return evaluatePublicCardValue(card) + attack * 1.8 + recurringEffects * 5 + protection;
}

function effectReplyThreat(effect: EffectDefinition, exposedMinions: number, heroHp: number): number {
  switch (effect.type) {
    case "DAMAGE_ENEMY_HERO": return effect.value * (heroHp <= effect.value + 5 ? 4 : 1.8);
    case "DAMAGE_ALL_ENEMY_MINIONS": return effect.value * Math.max(1, exposedMinions) * 0.9;
    case "DAMAGE_ALL_OTHER_MINIONS": return effect.value * Math.max(1, exposedMinions) * 0.65;
    case "SNAPSHOT_ENEMY_COUNT_AOE_HERO_DRAW_SELF_DEBUFF":
      return effect.aoeDamage * exposedMinions * 0.8 + effect.heroDamage * 1.8 + effect.draw * 2;
    case "DESTROY_ALL_ENEMY_MINIONS": return exposedMinions * 9;
    case "DESTROY_TARGET_ENEMY_MINION": return exposedMinions > 0 ? 10 : 0;
    case "DESTROY_UP_TO_ENEMY_MINIONS": return Math.min(exposedMinions, effect.maxCount) * 8;
    case "DESTROY_DISTINCT_ENEMY_MINIONS": return Math.min(exposedMinions, effect.count) * 8;
    case "VANISH_ENEMY_MINIONS": return Math.min(exposedMinions, effect.count) * 9;
    case "SUMMON": return effect.count * 3;
    case "SUMMON_FIELD": return effect.count * 2.5;
    case "DRAW": return effect.value * 1.6;
    case "CONDITIONAL": return effect.effects.reduce((sum, nested) => sum + effectReplyThreat(nested, exposedMinions, heroHp), 0) * 0.55;
    case "CHOOSE_ONE": return Math.max(0, ...effect.options.map((option) => option.effects.reduce((sum, nested) => sum + effectReplyThreat(nested, exposedMinions, heroHp), 0)));
    case "NECROMANCY":
    case "MECHANICAL_TECHNIQUE": return effect.effects.reduce((sum, nested) => sum + effectReplyThreat(nested, exposedMinions, heroHp), 0) * 0.6;
    default: return 0;
  }
}

function definitionReplyThreat(definition: CardDefinition, exposedMinions: number, heroHp: number): number {
  const body = definition.cardType === "MINION"
    ? Math.max(0, definition.attack ?? 0) * 1.2 + Math.max(0, definition.health ?? 0) * 0.45
      + (definition.keywords.includes("CHARGE") ? Math.max(0, definition.attack ?? 0) * 1.8 : 0)
      + (definition.keywords.includes("RUSH") ? Math.max(0, definition.attack ?? 0) * 0.65 : 0)
    : 0;
  const effects = [...(definition.effects ?? []), ...(definition.enterFieldEffects ?? [])];
  return body + effects.reduce((sum, effect) => sum + effectReplyThreat(effect, exposedMinions, heroHp), 0);
}

function publicSeenCopies(player: PlayerState, definitionId: string): number {
  return [player.minions, player.fields, player.graveyard, player.removed]
    .flat()
    .filter((card) => card.originalDefinitionId === definitionId).length;
}

/**
 * 從公開陣營、已公開卡牌、手牌張數與下回合水晶估計最多五種可能回應。
 * 刻意不讀取對手手牌身分或牌庫順序。
 */
export function estimateOpponentDeckTempoRisk(player: PlayerState, opponent: PlayerState): number {
  if (opponent.hand.length === 0) return 0;
  const factions = opponent.deckFactions?.length ? opponent.deckFactions : [opponent.faction];
  const nextMana = Math.min(10, opponent.maxMana + 1);
  const candidates = factions.flatMap((faction) => getMainDeckDefinitions(faction))
    .map((definition) => ({
      definition,
      remaining: Math.max(0, definition.deckCount - publicSeenCopies(opponent, definition.id)),
    }))
    .filter(({ definition, remaining }) => remaining > 0 && (definition.originalCost ?? Number.POSITIVE_INFINITY) <= nextMana);
  const unknownCards = Math.max(1, candidates.reduce((sum, candidate) => sum + candidate.remaining, 0));
  return candidates
    .map(({ definition, remaining }) => {
      const drawProbability = Math.min(1, opponent.hand.length * remaining / unknownCards);
      return definitionReplyThreat(definition, player.minions.length, player.heroHp) * drawProbability;
    })
    .sort((left, right) => right - left)
    .slice(0, 5)
    .reduce((sum, risk) => sum + risk, 0) * 0.1;
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
  const deckTempoRisk = estimateOpponentDeckTempoRisk(player, opponent);
  if (incoming >= player.heroHp) return 300 + (incoming - player.heroHp) * 12 + deckTempoRisk;
  return incoming * (player.heroHp <= 15 ? 4 : 1.4) + futurePressure + deckTempoRisk;
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
