import { describe, expect, it } from "vitest";
import { applyAction } from "../../src/game/engine/gameEngine";
import { dealDamageToHero, dealDamageToMinion } from "../../src/game/engine/damageEngine";
import { summonGeneratedMinion } from "../../src/game/engine/summonEngine";
import { mainState, putCard } from "../helpers";

describe("機械神造物光環與戰吼", () => {
  it("伊達政宗光環使後續進場的機械軍隊獲得沖鋒", () => {
    const state = mainState();
    putCard(state, "P1", "TOKEN_MACHINE_DIVINE_DATE_MASAMUNE", "MINION", "masamune");
    summonGeneratedMinion(state, "P1", "TOKEN_MACHINE_EMPIRE_SOLDIER");
    const soldier = state.players.P1.minions.find((card) => card.definitionId === "TOKEN_MACHINE_EMPIRE_SOLDIER")!;
    expect(soldier.keywords).toContain("CHARGE");
  });

  it("加百列光環使後續進場的機械軍隊獲得圣盾術", () => {
    const state = mainState();
    putCard(state, "P1", "TOKEN_MACHINE_DIVINE_GABRIEL", "MINION", "gabriel");
    summonGeneratedMinion(state, "P1", "TOKEN_MACHINE_EMPIRE_REAPER");
    const reaper = state.players.P1.minions.find((card) => card.definitionId === "TOKEN_MACHINE_EMPIRE_REAPER")!;
    expect(reaper.keywords).toContain("DIVINE_SHIELD");
  });

  it("伊利亞斯最多指定4名敵人消滅，且在場時機械軍隊單次傷害上限為3", () => {
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

  it("路西法恢復不超過最大生命，並使下一次玩家傷害變為0", () => {
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
