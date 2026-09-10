import { describe, expect, it } from "vitest";
import { applyAction } from "../../src/game/engine/gameEngine";
import { resolvePendingEffects } from "../../src/game/engine/effectEngine";
import { destroyMinion } from "../../src/game/engine/zoneEngine";
import { mainState, putCard } from "../helpers";

describe("悼念的騎士 卡戎", () => {
  it("我方回合死靈數達到10時，從當時手牌效果召喚且佈道者不再發動戰吼", () => {
    let state = mainState();
    state.players.P1.resources.necromancy = 9;
    const charon = putCard(state, "P1", "UNDEAD_010", "HAND", "effect-summon");
    const sacrifice = putCard(state, "P1", "TOKEN_UNDEAD_SPIRIT", "MINION", "sacrifice");
    destroyMinion(state, sacrifice, "TEST");
    resolvePendingEffects(state);
    expect(state.pendingChoice).toMatchObject({ type: "EFFECT_SUMMON_CONFIRM", sourceInstanceId: charon.instanceId });
    state = applyAction(state, { type: "CONFIRM_EFFECT_SUMMON", playerId: "P1" }).state;
    expect(state.players.P1.resources.necromancy).toBe(10);
    expect(state.players.P1.minions.some((card) => card.instanceId === charon.instanceId)).toBe(true);
    expect(state.players.P1.minions.some((card) => card.definitionId === "TOKEN_UNDEAD_PREACHER")).toBe(true);
  });

  it("正常從手牌打出時，戰吼召喚哀慟的佈道者但不增加死靈數", () => {
    let state = mainState();
    state.players.P1.hand = [];
    const charon = putCard(state, "P1", "UNDEAD_010", "HAND", "normal");
    state = applyAction(state, { type: "PLAY_CARD", playerId: "P1", instanceId: charon.instanceId }).state;
    expect(state.players.P1.minions.some((card) => card.definitionId === "TOKEN_UNDEAD_PREACHER")).toBe(true);
    expect(state.players.P1.resources.necromancy).toBe(0);
  });

  it("哀慟的佈道者被消滅時依通用規則+1，並以死亡之聲額外增加3死靈數", () => {
    const state = mainState();
    state.players.P1.hand = [];
    const preacher = putCard(state, "P1", "TOKEN_UNDEAD_PREACHER", "MINION", "preacher-death");
    destroyMinion(state, preacher, "TEST");
    resolvePendingEffects(state);
    expect(state.players.P1.resources.necromancy).toBe(4);
    expect(state.players.P1.hand).toHaveLength(0);
  });

  it("友方手下因交戰消滅敵方手下時，每張在場卡戎給予對手玩家2傷", () => {
    let state = mainState();
    const charon = putCard(state, "P1", "UNDEAD_010", "MINION", "aura");
    const attacker = putCard(state, "P1", "DRAGON_012", "MINION", "attacker");
    const defender = putCard(state, "P2", "UNDEAD_001", "MINION", "defender");
    state = applyAction(state, {
      type: "ATTACK",
      playerId: "P1",
      attackerId: attacker.instanceId,
      target: { type: "MINION", instanceId: defender.instanceId },
    }).state;
    expect(state.players.P2.heroHp).toBe(28);
    expect(state.players.P1.minions.some((card) => card.instanceId === charon.instanceId)).toBe(true);
  });

  it("每張卡戎的光環每回合最多造成2次效果傷害，新回合重置", () => {
    let state = mainState();
    const charon = putCard(state, "P1", "UNDEAD_010", "MINION", "limited-aura");
    const attackers = Array.from({ length: 4 }, (_, index) =>
      putCard(state, "P1", "DRAGON_012", "MINION", `attacker-${index}`));
    const defenders = Array.from({ length: 4 }, (_, index) =>
      putCard(state, "P2", "UNDEAD_001", "MINION", `defender-${index}`));

    for (let index = 0; index < 4; index += 1) {
      state = applyAction(state, {
        type: "ATTACK",
        playerId: "P1",
        attackerId: attackers[index].instanceId,
        target: { type: "MINION", instanceId: defenders[index].instanceId },
      }).state;
    }

    expect(state.players.P2.heroHp).toBe(26);
    expect(state.players.P1.minions.find((card) => card.instanceId === charon.instanceId)?.counters.friendlyCombatKillTriggerUses).toBe(2);

    state.turnNumber += 1;
    const nextAttacker = putCard(state, "P1", "DRAGON_012", "MINION", "next-turn-attacker");
    const nextDefender = putCard(state, "P2", "UNDEAD_001", "MINION", "next-turn-defender");
    state = applyAction(state, {
      type: "ATTACK",
      playerId: "P1",
      attackerId: nextAttacker.instanceId,
      target: { type: "MINION", instanceId: nextDefender.instanceId },
    }).state;

    expect(state.players.P2.heroHp).toBe(24);
  });
});
