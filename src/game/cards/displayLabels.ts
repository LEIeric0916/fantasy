import type { CardType, Faction } from "./cardTypes";

export const factionLabels: Record<Faction, string> = {
  DRAGON: "龍族",
  UNDEAD: "不朽",
  MACHINE: "機械",
  ALLIANCE: "聯盟",
  NEUTRAL: "中立",
};

export const cardTypeLabels: Record<CardType, string> = {
  MINION: "手下",
  SPELL: "法術",
  FIELD: "立場",
};

const subtypeLabels: Record<string, string> = {
  ARMY: "軍隊",
  ARTIFACT: "神器",
  ARTIFACT_SPELL: "神器法術",
  COMMANDER: "指揮官",
  DARK_MAGIC: "黑魔法",
  DRAGON: "龍族",
  HUMAN: "人類",
  MACHINE: "機械",
  SPELLBEING: "咒文物",
  TACTIC: "戰術",
  UNDEAD: "不朽者",
};

export function getSubtypeLabel(subtype: string): string {
  return subtypeLabels[subtype] ?? subtype;
}

export function formatSubtypeLabels(subtypes: readonly string[], fallback = "無類型"): string {
  return subtypes.length > 0 ? subtypes.map(getSubtypeLabel).join("・") : fallback;
}
