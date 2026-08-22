import type { CardInstance, PlayerId } from "../cards/cardTypes";
import type { GameState } from "../state/GameState";
import { hasActiveKeyword } from "../keywords/keywordRules";
import { addLog } from "../utils/gameLog";
import { InvalidActionError } from "./errors";
import { getCardDefinition } from "../cards/cardRegistry";

export type DamageKind = "COMBAT" | "EFFECT";

function revealStealthDamageSource(state: GameState, source: string, actualDamage: number): void {
  if (actualDamage < 1) return;
  const sourceCard = [...state.players.P1.minions, ...state.players.P2.minions]
    .find((card) => card.instanceId === source);
  if (!sourceCard || !hasActiveKeyword(sourceCard, "STEALTH")) return;
  sourceCard.keywords = sourceCard.keywords.filter((keyword) => keyword !== "STEALTH");
  addLog(state, "ACTION", `${sourceCard.definitionId} 造成伤害并解除潜行`, { instanceId: sourceCard.instanceId });
}

export function dealDamageToMinion(
  state: GameState,
  card: CardInstance,
  amount: number,
  source: string,
  kind: DamageKind,
): number {
  if (amount < 1) return 0;
  if (hasActiveKeyword(card, "INVINCIBLE")) {
    addLog(state, "PROTECTION", `${card.definitionId} 的无敌使 ${amount} 点伤害变为 0`, { source, kind });
    return 0;
  }
  if (kind === "EFFECT" && hasActiveKeyword(card, "IMMUNE_EFFECT_DAMAGE")) {
    addLog(state, "PROTECTION", `${card.definitionId} 的能力伤害免疫使 ${amount} 点伤害变为 0`, { source, kind });
    return 0;
  }
  if (kind === "EFFECT" && state.players[card.controllerId].minions.some((sourceCard) => {
    if (sourceCard.sealed) return false;
    const aura = getCardDefinition(sourceCard.definitionId).friendlyEffectDamageImmunityAura;
    return Boolean(aura && (!aura.excludeSelf || sourceCard.instanceId !== card.instanceId));
  })) {
    addLog(state, "PROTECTION", `${card.definitionId} 受到的${amount}点效果伤害因友方光环变为0`, { source, kind });
    return 0;
  }
  if (hasActiveKeyword(card, "DIVINE_SHIELD")) {
    card.keywords = card.keywords.filter((keyword) => keyword !== "DIVINE_SHIELD");
    addLog(state, "PROTECTION", `${card.definitionId} 的聖盾術使 ${amount} 点伤害变为 0`, { source, kind });
    return 0;
  }
  if (card.currentHealth === null) throw new InvalidActionError("生命为 null 的卡牌不可受到伤害");
  const auraCaps = state.players[card.controllerId].minions.flatMap((source) => {
    if (source.sealed) return [];
    const aura = getCardDefinition(source.definitionId).damageCapAura;
    const targetDefinition = getCardDefinition(card.definitionId);
    return aura && aura.subtypes.every((subtype) => targetDefinition.subtype.includes(subtype)) ? [aura.value] : [];
  });
  const damageCap = [card.counters.damageCap, ...auraCaps].filter((value): value is number => value !== undefined)
    .reduce<number | undefined>((lowest, value) => lowest === undefined ? value : Math.min(lowest, value), undefined);
  const actual = damageCap === undefined ? amount : Math.min(amount, damageCap);
  card.damageTaken += actual;
  card.currentHealth -= actual;
  revealStealthDamageSource(state, source, actual);
  addLog(state, "COMBAT", `${card.definitionId} 受到 ${actual} 点${kind === "COMBAT" ? "战斗" : "效果"}伤害`, {
    source,
    kind,
    requested: amount,
    damageCap,
  });
  return actual;
}

export function grantDamageCap(card: CardInstance, value: number): number {
  const current = card.counters.damageCap;
  card.counters.damageCap = current === undefined ? value : Math.min(current, value);
  return card.counters.damageCap;
}

export function dealDamageToHero(state: GameState, targetId: PlayerId, amount: number, source: string, kind: DamageKind = "EFFECT"): number {
  if (amount < 1 || state.phase === "GAME_OVER") return 0;
  const player = state.players[targetId];
  if (player.heroDivineShield) {
    player.heroDivineShield = false;
    addLog(state, "PROTECTION", `${targetId} 玩家的圣盾术使${amount}点伤害变为0`, { source, kind });
    return 0;
  }
  if (player.heroDamageNullifiers > 0) {
    player.heroDamageNullifiers -= 1;
    addLog(state, "PROTECTION", `${targetId} 玩家下一次受到的${amount}点伤害变为0`, { source, kind });
    return 0;
  }
  player.heroHp -= amount;
  revealStealthDamageSource(state, source, amount);
  addLog(state, "COMBAT", `${targetId} 玩家受到 ${amount} 点${kind === "COMBAT" ? "战斗" : "效果"}伤害`, { source, amount, kind });
  if (player.heroHp <= 0) {
    state.phase = "GAME_OVER";
    state.winner = targetId === "P1" ? "P2" : "P1";
    state.loseReason = "HP_ZERO";
    addLog(state, "RESULT", `${state.winner} 获胜`, { reason: "HP_ZERO" });
  }
  return amount;
}
