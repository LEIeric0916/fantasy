import type { CardInstance, PlayerId } from "../cards/cardTypes";
import { getHeroDefinition } from "../heroes/heroDefinitions";
import type { GameState } from "../state/GameState";
import { addLog } from "../utils/gameLog";
import { dealDamageToMinion } from "./damageEngine";
import { InvalidActionError } from "./errors";
import { resolvePendingEffects } from "./effectEngine";
import { summonGeneratedMinion } from "./summonEngine";
import { drawCard } from "./turnEngine";
import { destroyZeroHealthMinions } from "./zoneEngine";

export function getHeroSkillTargets(state: GameState, playerId: PlayerId): CardInstance[] {
  const hero = state.players[playerId].hero;
  if (!hero) return [];
  const definition = getHeroDefinition(hero.id);
  if (definition.target === "FRIENDLY_MINION") return state.players[playerId].minions;
  if (definition.target === "ENEMY_MINION") {
    const opponentId: PlayerId = playerId === "P1" ? "P2" : "P1";
    return state.players[opponentId].minions;
  }
  return [];
}

export function heroSkillUnavailableReason(state: GameState, playerId: PlayerId): string | undefined {
  const player = state.players[playerId];
  const hero = player.hero;
  if (!hero) return "目前不是英雄模式";
  const definition = getHeroDefinition(hero.id);
  if (state.phase !== "MAIN" || state.activePlayerId !== playerId || state.pendingChoice) return "目前不能使用英雄技能";
  if (player.turnsStarted < definition.unlockTurn) return `需到我方第${definition.unlockTurn}回合才可使用`;
  if (hero.skillUsedThisTurn) return "本回合已使用過英雄技能";
  if (hero.skillUses >= definition.maxUses) return "本場英雄技能次數已用完";
  if (player.mana < definition.cost) return `需要${definition.cost}顆水晶`;
  if (hero.id === "KNIGHT" && player.minions.length >= state.rulesConfig.minionLimit) return "手下區已滿";
  if (definition.target !== "NONE" && getHeroSkillTargets(state, playerId).length === 0) return "沒有合法目標";
  return undefined;
}

export function activateHeroSkill(state: GameState, playerId: PlayerId, targetInstanceId?: string): void {
  const unavailable = heroSkillUnavailableReason(state, playerId);
  if (unavailable) throw new InvalidActionError(unavailable);
  const player = state.players[playerId];
  const hero = player.hero!;
  const definition = getHeroDefinition(hero.id);
  const targets = getHeroSkillTargets(state, playerId);
  const target = targetInstanceId ? targets.find((card) => card.instanceId === targetInstanceId) : undefined;
  if (definition.target !== "NONE" && !target) throw new InvalidActionError("英雄技能指定的目標不合法");
  if (definition.target === "NONE" && targetInstanceId) throw new InvalidActionError("此英雄技能不需要指定目標");

  player.mana -= definition.cost;
  hero.skillUses += 1;
  hero.skillUsedThisTurn = true;
  addLog(state, "ACTION", `${playerId} 發動${definition.name}英雄技能「${definition.skillName}」`, {
    heroId: hero.id,
    targetInstanceId,
    cost: definition.cost,
    remainingUses: definition.maxUses - hero.skillUses,
  });

  switch (hero.id) {
    case "PALADIN":
      if (!target!.keywords.includes("TAUNT")) target!.keywords.push("TAUNT");
      break;
    case "BRAVE":
      if (target!.currentAttack === null || target!.currentHealth === null || target!.maxHealth === null) {
        throw new InvalidActionError("目標手下沒有可修改的攻擊或生命");
      }
      target!.currentAttack += 1;
      target!.currentHealth += 1;
      target!.maxHealth += 1;
      if (!target!.keywords.includes("RUSH")) target!.keywords.push("RUSH");
      break;
    case "MAGICIAN":
      drawCard(state, playerId, "HERO_SKILL");
      break;
    case "KNIGHT":
      summonGeneratedMinion(state, playerId, "TOKEN_HERO_KNIGHT_GUARD");
      resolvePendingEffects(state);
      break;
    case "COMMANDER":
      dealDamageToMinion(state, target!, 4, `HERO_SKILL:${hero.id}`, "EFFECT");
      destroyZeroHealthMinions(state, "HERO_SKILL_DAMAGE");
      resolvePendingEffects(state);
      break;
  }
}
