import { getCardDefinition } from "../cards/cardRegistry";
import type { CardInstance, PlayerId } from "../cards/cardTypes";
import type { GameState } from "../state/GameState";
import { addLog } from "../utils/gameLog";
import { hasActiveKeyword } from "../keywords/keywordRules";
import { InvalidActionError } from "./errors";
import { dealDamageToHero, dealDamageToMinion } from "./damageEngine";
import { opponentOf } from "./turnEngine";
import { destroyMinion } from "./zoneEngine";
import { createTimingContext } from "./simultaneousEngine";
import { resolvePendingEffects } from "./effectEngine";
import { enqueueTriggeredEffects } from "./triggerEngine";

export type AttackTarget = { type: "HERO"; playerId: PlayerId } | { type: "MINION"; instanceId: string };

function gameHasEnded(state: GameState): boolean {
  return state.phase === "GAME_OVER";
}

function canAttackThisTurn(state: GameState, attacker: CardInstance, targetType: AttackTarget["type"]): boolean {
  const limit = hasActiveKeyword(attacker, "WINDFURY") ? 2 : 1;
  if (attacker.attacksUsedThisTurn >= limit || attacker.sealed) return false;
  if (attacker.summonedOnTurn !== state.turnNumber) return true;
  if (hasActiveKeyword(attacker, "CHARGE")) return true;
  return hasActiveKeyword(attacker, "RUSH") && targetType === "MINION";
}

function attackableEnemyMinions(state: GameState, playerId: PlayerId): CardInstance[] {
  return state.players[opponentOf(playerId)].minions.filter((card) => {
    const conditional = !card.sealed ? getCardDefinition(card.definitionId).selfKeywordWhileOtherFriendlySubtypes : undefined;
    const conditionalDeterrence = conditional?.keyword === "DETERRENCE" && state.players[card.controllerId].minions.some((other) => {
      if (other.instanceId === card.instanceId) return false;
      const definition = getCardDefinition(other.definitionId);
      return conditional.subtypes.every((subtype) => definition.subtype.includes(subtype));
    });
    return !hasActiveKeyword(card, "STEALTH") && !hasActiveKeyword(card, "DETERRENCE") && !conditionalDeterrence;
  });
}

export function getLegalAttackTargets(state: GameState, attackerId: string): AttackTarget[] {
  if (state.phase !== "MAIN") return [];
  const player = state.players[state.activePlayerId];
  const attacker = player.minions.find((card) => card.instanceId === attackerId);
  if (!attacker) return [];
  const enemies = attackableEnemyMinions(state, player.id);
  const ignoresTaunt = hasActiveKeyword(attacker, "HEADHUNT");
  const onlyHero = hasActiveKeyword(attacker, "CAN_ONLY_ATTACK_HERO");
  const taunts = ignoresTaunt ? [] : enemies.filter((card) => hasActiveKeyword(card, "TAUNT"));
  const minionTargets = (onlyHero ? [] : (taunts.length ? taunts : enemies))
    .filter(() => canAttackThisTurn(state, attacker, "MINION"))
    .map((card) => ({ type: "MINION" as const, instanceId: card.instanceId }));
  if (taunts.length || hasActiveKeyword(attacker, "CANNOT_ATTACK_HERO") || !canAttackThisTurn(state, attacker, "HERO")) {
    return minionTargets;
  }
  return [...minionTargets, { type: "HERO", playerId: opponentOf(player.id) }];
}

export function resolveAttack(state: GameState, playerId: PlayerId, attackerId: string, target: AttackTarget): void {
  if (state.phase !== "MAIN" || state.activePlayerId !== playerId) throw new InvalidActionError("目前不能攻擊");
  const attacker = state.players[playerId].minions.find((card) => card.instanceId === attackerId);
  if (!attacker) throw new InvalidActionError("攻擊者不在我方手下區");
  const legal = getLegalAttackTargets(state, attackerId).some((candidate) =>
    candidate.type === target.type &&
    (candidate.type === "HERO" ? candidate.playerId === (target as { playerId: PlayerId }).playerId : candidate.instanceId === (target as { instanceId: string }).instanceId),
  );
  if (!legal) throw new InvalidActionError("攻擊目標不合法（請檢查嘲諷與進場回合限制）");
  attacker.attacksUsedThisTurn += 1;

  const attackTiming = createTimingContext(state, `ATTACK:${attacker.instanceId}:${target.type === "HERO" ? target.playerId : target.instanceId}`);
  const attackerAttackEffects = !attacker.sealed ? getCardDefinition(attacker.definitionId).triggeredEffects?.ON_ATTACK : undefined;
  if (attackerAttackEffects) {
    enqueueTriggeredEffects(state, attacker, attackerAttackEffects, "ON_ATTACK", attackTiming);
    resolvePendingEffects(state);
    if (gameHasEnded(state)) return;
    if (attacker.zone !== "MINION") return;
  }

  if (target.type === "HERO") {
    const damage = attacker.currentAttack ?? 0;
    dealDamageToHero(state, target.playerId, damage, attacker.instanceId, "COMBAT");
    addLog(state, "COMBAT", `${attacker.definitionId} 對 ${target.playerId} 造成 ${damage} 點傷害`);
    return;
  }

  const defender = state.players[opponentOf(playerId)].minions.find((card) => card.instanceId === target.instanceId);
  if (!defender) return;
  const preCombatTiming = createTimingContext(state, `PRE_COMBAT:${attacker.instanceId}:${defender.instanceId}`);
  const attackerPreCombatEffects = !attacker.sealed ? getCardDefinition(attacker.definitionId).triggeredEffects?.ON_SELF_COMBAT_START : undefined;
  const defenderPreCombatEffects = !defender.sealed ? getCardDefinition(defender.definitionId).triggeredEffects?.ON_SELF_COMBAT_START : undefined;
  if (attackerPreCombatEffects) {
    enqueueTriggeredEffects(state, attacker, attackerPreCombatEffects, "ON_SELF_COMBAT_START", preCombatTiming);
  }
  if (defenderPreCombatEffects) {
    enqueueTriggeredEffects(state, defender, defenderPreCombatEffects, "ON_SELF_COMBAT_START", preCombatTiming);
  }
  if (attackerPreCombatEffects || defenderPreCombatEffects) {
    resolvePendingEffects(state);
    if (gameHasEnded(state)) return;
    if (attacker.zone !== "MINION" || defender.zone !== "MINION") return;
  }
  const attackerKillEffects = !attacker.sealed ? getCardDefinition(attacker.definitionId).triggeredEffects?.ON_KILL : undefined;
  const combatKillAuras = state.players[playerId].minions.filter((card) =>
    !card.sealed && Boolean(getCardDefinition(card.definitionId).triggeredEffects?.ON_FRIENDLY_COMBAT_KILL?.length),
  );
  const attackDamage = attacker.currentAttack ?? 0;
  const counterDamage = defender.sealed || hasActiveKeyword(defender, "CANNOT_COUNTERATTACK") ? 0 : defender.currentAttack ?? 0;
  const dealt = dealDamageToMinion(state, defender, attackDamage, attacker.instanceId, "COMBAT");
  const countered = dealDamageToMinion(state, attacker, counterDamage, defender.instanceId, "COMBAT");
  addLog(state, "COMBAT", `${getCardDefinition(attacker.definitionId).name} 與 ${getCardDefinition(defender.definitionId).name} 交戰`, {
    attackerDamage: dealt,
    defenderDamage: countered,
  });
  const attackerProtectedFromLethal = hasActiveKeyword(attacker, "SANCTUARY") || hasActiveKeyword(attacker, "INVINCIBLE");
  const defenderProtectedFromLethal = hasActiveKeyword(defender, "SANCTUARY") || hasActiveKeyword(defender, "INVINCIBLE");
  const attackerDead = (attacker.currentHealth ?? 1) <= 0 || (hasActiveKeyword(defender, "LETHAL") && !attackerProtectedFromLethal);
  const defenderDead = (defender.currentHealth ?? 1) <= 0 || (hasActiveKeyword(attacker, "LETHAL") && !defenderProtectedFromLethal);
  const timingContext = createTimingContext(state, `COMBAT:${attacker.instanceId}:${defender.instanceId}`);
  if (attackerDead) destroyMinion(state, attacker, "COMBAT_DEATH", timingContext);
  if (defenderDead) destroyMinion(state, defender, "COMBAT_DEATH", timingContext);
  if (defenderDead) {
    for (const aura of combatKillAuras) {
      const definition = getCardDefinition(aura.definitionId);
      const effects = definition.triggeredEffects?.ON_FRIENDLY_COMBAT_KILL;
      if (!effects) continue;
      if (aura.counters.friendlyCombatKillTriggerTurn !== state.turnNumber) {
        aura.counters.friendlyCombatKillTriggerTurn = state.turnNumber;
        aura.counters.friendlyCombatKillTriggerUses = 0;
      }
      const triggerUses = aura.counters.friendlyCombatKillTriggerUses ?? 0;
      const triggerLimit = definition.maxFriendlyCombatKillTriggersPerTurn ?? Number.POSITIVE_INFINITY;
      if (triggerUses >= triggerLimit) continue;
      aura.counters.friendlyCombatKillTriggerUses = triggerUses + 1;
      enqueueTriggeredEffects(state, aura, effects, "AURA:FRIENDLY_COMBAT_KILL", timingContext, true);
    }
    if (!attackerDead && attacker.zone === "MINION" && attackerKillEffects) {
      enqueueTriggeredEffects(state, attacker, attackerKillEffects, "ON_KILL", timingContext, true);
    }
  }
  resolvePendingEffects(state);
}
