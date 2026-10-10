import heroData from "../../../data/heroes.json";

export type HeroId = "PALADIN" | "BRAVE" | "MAGICIAN" | "KNIGHT" | "COMMANDER";
export type HeroSkillTarget = "NONE" | "FRIENDLY_MINION" | "ENEMY_MINION";

export interface HeroDefinition {
  id: HeroId;
  name: string;
  skillName: string;
  cost: number;
  unlockTurn: number;
  maxUses: number;
  target: HeroSkillTarget;
  description: string;
}

export const heroDefinitions = heroData.heroes as HeroDefinition[];

export function getHeroDefinition(id: HeroId): HeroDefinition {
  const definition = heroDefinitions.find((hero) => hero.id === id);
  if (!definition) throw new Error(`Unknown hero: ${id}`);
  return definition;
}
