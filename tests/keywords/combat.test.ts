import { describe, expect, it } from "vitest";
import { getLegalAttackTargets } from "../../src/game/engine/combatEngine";
import { applyAction } from "../../src/game/engine/gameEngine";
import { mainState, putCard } from "../helpers";

describe("基本战斗、嘲讽、冲刺与冲锋", () => {
  it("嘲讽存在时不能攻击其他手下或玩家", () => {
    const state = mainState();
    const attacker = putCard(state, "P1", "TOKEN_DRAGON_HELLFIRE", "MINION", "attacker");
    const taunt = putCard(state, "P2", "DRAGON_001", "MINION", "taunt");
    putCard(state, "P2", "UNDEAD_001", "MINION", "other");
    expect(getLegalAttackTargets(state, attacker.instanceId)).toEqual([{ type: "MINION", instanceId: taunt.instanceId }]);
  });

  it("一般手下进场回合不能攻击", () => {
    const state = mainState();
    const attacker = putCard(state, "P1", "TOKEN_DRAGON_HELLFIRE", "MINION", "new");
    attacker.summonedOnTurn = state.turnNumber;
    putCard(state, "P2", "UNDEAD_001", "MINION", "target");
    expect(getLegalAttackTargets(state, attacker.instanceId)).toEqual([]);
  });

  it("冲刺进场回合能攻击手下但不能攻击玩家", () => {
    const state = mainState();
    const attacker = putCard(state, "P1", "TOKEN_ALLIANCE_ROYAL_WARRIOR", "MINION", "rush");
    attacker.summonedOnTurn = state.turnNumber;
    const target = putCard(state, "P2", "UNDEAD_001", "MINION", "target");
    expect(getLegalAttackTargets(state, attacker.instanceId)).toEqual([{ type: "MINION", instanceId: target.instanceId }]);
  });

  it("冲锋进场回合可以攻击玩家", () => {
    const state = mainState();
    const attacker = putCard(state, "P1", "TOKEN_UNDEAD_SPIRIT", "MINION", "charge");
    attacker.summonedOnTurn = state.turnNumber;
    expect(getLegalAttackTargets(state, attacker.instanceId)).toContainEqual({ type: "HERO", playerId: "P2" });
  });

  it("攻击手下时同时造成伤害，死亡主牌进入弃堆", () => {
    let state = mainState();
    const attacker = putCard(state, "P1", "UNDEAD_001", "MINION", "a");
    const defender = putCard(state, "P2", "UNDEAD_001", "MINION", "d");
    state = applyAction(state, { type: "ATTACK", playerId: "P1", attackerId: attacker.instanceId, target: { type: "MINION", instanceId: defender.instanceId } }).state;
    expect(state.players.P1.graveyard.some((card) => card.instanceId === attacker.instanceId)).toBe(true);
    expect(state.players.P2.graveyard.some((card) => card.instanceId === defender.instanceId)).toBe(true);
  });
});

describe("聖盾術", () => {
  it("第一次至少 1 点伤害变为 0 并失去盾，第二次正常受伤", () => {
    let state = mainState();
    const shielded = putCard(state, "P2", "ALLIANCE_005", "MINION", "shield");
    const first = putCard(state, "P1", "DRAGON_012", "MINION", "first");
    state = applyAction(state, { type: "ATTACK", playerId: "P1", attackerId: first.instanceId, target: { type: "MINION", instanceId: shielded.instanceId } }).state;
    let current = state.players.P2.minions.find((card) => card.instanceId === shielded.instanceId)!;
    expect(current.currentHealth).toBe(1);
    expect(current.keywords).not.toContain("DIVINE_SHIELD");
    const second = putCard(state, "P1", "DRAGON_012", "MINION", "second");
    state = applyAction(state, { type: "ATTACK", playerId: "P1", attackerId: second.instanceId, target: { type: "MINION", instanceId: shielded.instanceId } }).state;
    expect(state.players.P2.graveyard.some((card) => card.instanceId === shielded.instanceId)).toBe(true);
  });

  it("重复获得时仍只有一个聖盾術关键字", () => {
    const state = mainState();
    const card = putCard(state, "P1", "ALLIANCE_005", "MINION", "one-layer");
    if (!card.keywords.includes("DIVINE_SHIELD")) card.keywords.push("DIVINE_SHIELD");
    expect(card.keywords.filter((keyword) => keyword === "DIVINE_SHIELD")).toHaveLength(1);
  });
});
