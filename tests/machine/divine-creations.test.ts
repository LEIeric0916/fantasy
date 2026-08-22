import { describe, expect, it } from "vitest";
import { applyAction } from "../../src/game/engine/gameEngine";
import { dealDamageToHero, dealDamageToMinion } from "../../src/game/engine/damageEngine";
import { summonGeneratedMinion } from "../../src/game/engine/summonEngine";
import { mainState, putCard } from "../helpers";

describe("机械神造物光环与战吼", () => {
  it("伊达政宗光环使后续进场的机械军队获得冲锋", () => {
    const state = mainState();
    putCard(state, "P1", "TOKEN_MACHINE_DIVINE_DATE_MASAMUNE", "MINION", "masamune");
    summonGeneratedMinion(state, "P1", "TOKEN_MACHINE_EMPIRE_SOLDIER");
    const soldier = state.players.P1.minions.find((card) => card.definitionId === "TOKEN_MACHINE_EMPIRE_SOLDIER")!;
    expect(soldier.keywords).toContain("CHARGE");
  });

  it("加百列光环使后续进场的机械军队获得圣盾术", () => {
    const state = mainState();
    putCard(state, "P1", "TOKEN_MACHINE_DIVINE_GABRIEL", "MINION", "gabriel");
    summonGeneratedMinion(state, "P1", "TOKEN_MACHINE_EMPIRE_REAPER");
    const reaper = state.players.P1.minions.find((card) => card.definitionId === "TOKEN_MACHINE_EMPIRE_REAPER")!;
    expect(reaper.keywords).toContain("DIVINE_SHIELD");
  });

  it("伊利亚斯最多指定4名敌人消灭，且在场时机械军队单次伤害上限为3", () => {
    let state = mainState();
    state.players.P1.hand = [];
    const elias = putCard(state, "P1", "TOKEN_MACHINE_DIVINE_ELIAS", "HAND", "elias");
    const enemy = putCard(state, "P2", "TOKEN_MACHINE_DESTROYER", "MINION", "enemy");
    state = applyAction(state, { type: "PLAY_CARD", playerId: "P1", instanceId: elias.instanceId }).state;
    expect(state.pendingChoice).toMatchObject({ type: "EFFECT_CARDS", minCount: 0, candidateInstanceIds: [enemy.instanceId] });
    state = applyAction(state, { type: "SELECT_EFFECT_CARDS", playerId: "P1", instanceIds: [] }).state;

    const ally = putCard(state, "P1", "TOKEN_MACHINE_EMPIRE_SOLDIER", "MINION", "ally");
    expect(dealDamageToMinion(state, ally, 12, "test", "EFFECT")).toBe(3);
  });

  it("路西法恢复不超过最大生命，并使下一次玩家伤害变为0", () => {
    let state = mainState();
    state.players.P1.heroHp = 29;
    state.players.P1.hand = [];
    const lucifer = putCard(state, "P1", "TOKEN_MACHINE_DIVINE_LUCIFER", "HAND", "lucifer");
    state = applyAction(state, { type: "PLAY_CARD", playerId: "P1", instanceId: lucifer.instanceId }).state;
    expect(state.players.P1.heroHp).toBe(30);
    expect(dealDamageToHero(state, "P1", 8, "first")).toBe(0);
    expect(dealDamageToHero(state, "P1", 2, "second")).toBe(2);
    expect(state.players.P1.heroHp).toBe(28);
  });
});
