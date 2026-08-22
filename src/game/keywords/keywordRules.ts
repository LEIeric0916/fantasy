import type { CardInstance, Keyword } from "../cards/cardTypes";

const BOARD_ONLY_RESISTANCES = new Set<Keyword>(["WARD", "DISCIPLINE", "SANCTUARY", "INVINCIBLE", "IMMUNE_EFFECT_DAMAGE"]);

export function isOnField(card: CardInstance): boolean {
  return card.zone === "MINION" || card.zone === "FIELD";
}

export function hasActiveKeyword(card: CardInstance, keyword: Keyword): boolean {
  if (card.sealed || !card.keywords.includes(keyword)) return false;
  if (BOARD_ONLY_RESISTANCES.has(keyword)) return isOnField(card);
  return true;
}

export function canResolveCardEffects(card: CardInstance): boolean {
  return !card.sealed;
}
