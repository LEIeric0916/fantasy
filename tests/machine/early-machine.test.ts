import { describe, expect, it } from "vitest";
import { applyAction } from "../../src/game/engine/gameEngine";
import { resolvePendingEffects } from "../../src/game/engine/effectEngine";
import { destroyCardOnField } from "../../src/game/engine/zoneEngine";
import { mainState, putCard } from "../helpers";

describe("機械前期卡與回收", () => {
  it("機械神器創造者將2張神器箱加入手牌", () => {
    let state = mainState();
    const creator = putCard(state, "P1", "MACHINE_001", "HAND", "creator");
    state = applyAction(state, { type: "PLAY_CARD", playerId: "P1", instanceId: creator.instanceId }).state;
    expect(state.players.P1.hand.filter((card) => card.definitionId === "TOKEN_MACHINE_ARTIFACT_BOX")).toHaveLength(2);
  });

  it("機械神教徒增加充能，有神器時召喚牧師；被消滅後回收至牌組底並再加1充能", () => {
    let state = mainState();
    putCard(state, "P1", "TOKEN_MACHINE_ARTIFACT_BOX", "FIELD", "artifact");
    const cultist = putCard(state, "P1", "MACHINE_002", "HAND", "cultist");
    state = applyAction(state, { type: "PLAY_CARD", playerId: "P1", instanceId: cultist.instanceId }).state;
    expect(state.players.P1.resources.recycleCharge).toBe(1);
    expect(state.players.P1.minions.some((card) => card.definitionId === "TOKEN_MACHINE_PRIEST")).toBe(true);

    const played = state.players.P1.minions.find((card) => card.instanceId === cultist.instanceId)!;
    destroyCardOnField(state, played, "TEST_RECYCLE");
    resolvePendingEffects(state);
    expect(state.players.P1.deck[0].instanceId).toBe(cultist.instanceId);
    expect(state.players.P1.resources.recycleCharge).toBe(2);
  });

  it("機械帝國牧師回合結束光環增加回收充能並賦予機械軍隊聖盾術", () => {
    let state = mainState();
    putCard(state, "P1", "TOKEN_MACHINE_PRIEST", "MINION", "priest");
    const soldier = putCard(state, "P1", "TOKEN_MACHINE_EMPIRE_SOLDIER", "MINION", "soldier");

    state = applyAction(state, { type: "END_TURN", playerId: "P1" }).state;

    expect(state.players.P1.resources.recycleCharge).toBe(1);
    expect(state.players.P1.minions.find((card) => card.instanceId === soldier.instanceId)?.keywords).toContain("DIVINE_SHIELD");
  });

  it("機械軍技師增加2充能，有神器時召喚齒輪", () => {
    let state = mainState();
    putCard(state, "P1", "TOKEN_MACHINE_ARTIFACT_BOX", "FIELD", "artifact");
    const engineer = putCard(state, "P1", "MACHINE_003", "HAND", "engineer");
    state = applyAction(state, { type: "PLAY_CARD", playerId: "P1", instanceId: engineer.instanceId }).state;
    expect(state.players.P1.resources.recycleCharge).toBe(2);
    expect(state.players.P1.fields.some((card) => card.definitionId === "TOKEN_MACHINE_GEAR")).toBe(true);
  });

  it("只有機械手下而沒有神器立場時，不會誤判神器條件", () => {
    let state = mainState();
    putCard(state, "P1", "TOKEN_MACHINE_EMPIRE_SOLDIER", "MINION", "machine-is-not-artifact");
    const cultist = putCard(state, "P1", "MACHINE_002", "HAND", "cultist-no-artifact");
    state = applyAction(state, { type: "PLAY_CARD", playerId: "P1", instanceId: cultist.instanceId }).state;
    expect(state.players.P1.minions.some((card) => card.definitionId === "TOKEN_MACHINE_PRIEST")).toBe(false);
    expect(state.effectNotices.some((notice) => notice.sourceName === "機械神教徒" && notice.reason.includes("神器"))).toBe(true);
  });
});
