import { describe, expect, it } from "vitest";
import { applyAction } from "../../src/game/engine/gameEngine";
import { mainState, putCard } from "../helpers";

describe("機械神機圣徒 阿卡德", () => {
  it("機械術3指定兩張神器費用變0並召喚士兵", () => {
    let state = mainState();
    state.players.P1.faction = "MACHINE";
    state.players.P1.resources.recycleCharge = 3;
    state.players.P1.hand = [];
    const arcade = putCard(state, "P1", "MACHINE_009", "HAND", "arcade");
    const first = putCard(state, "P1", "TOKEN_MACHINE_ARTIFACT_BOX", "HAND", "first");
    const second = putCard(state, "P1", "TOKEN_MACHINE_CUBE", "HAND", "second");

    state = applyAction(state, { type: "PLAY_CARD", playerId: "P1", instanceId: arcade.instanceId }).state;
    expect(state.players.P1.resources.recycleCharge).toBe(0);
    expect(state.pendingChoice).toMatchObject({ type: "EFFECT_CARDS", count: 2 });
    state = applyAction(state, { type: "SELECT_EFFECT_CARDS", playerId: "P1", instanceIds: [first.instanceId, second.instanceId] }).state;
    expect(state.players.P1.hand.find((card) => card.instanceId === first.instanceId)?.currentCost).toBe(0);
    expect(state.players.P1.hand.find((card) => card.instanceId === second.instanceId)?.currentCost).toBe(0);
    expect(state.players.P1.minions.some((card) => card.definitionId === "TOKEN_MACHINE_EMPIRE_SOLDIER")).toBe(true);
  });

  it("手中只有一張神器時仍可選擇使其費用變0", () => {
    let state = mainState();
    state.players.P1.faction = "MACHINE";
    state.players.P1.resources.recycleCharge = 3;
    state.players.P1.hand = [];
    const arcade = putCard(state, "P1", "MACHINE_009", "HAND", "partial");
    const artifact = putCard(state, "P1", "TOKEN_MACHINE_ARTIFACT_BOX", "HAND", "only-one");
    state = applyAction(state, { type: "PLAY_CARD", playerId: "P1", instanceId: arcade.instanceId }).state;
    expect(state.players.P1.resources.recycleCharge).toBe(0);
    expect(state.pendingChoice).toMatchObject({ type: "EFFECT_CARDS", count: 1, minCount: 0 });
    state = applyAction(state, { type: "SELECT_EFFECT_CARDS", playerId: "P1", instanceIds: [artifact.instanceId] }).state;
    expect(state.players.P1.hand.find((card) => card.instanceId === artifact.instanceId)?.currentCost).toBe(0);
    expect(state.players.P1.minions.some((card) => card.definitionId === "TOKEN_MACHINE_EMPIRE_SOLDIER")).toBe(true);
  });

  it("機械降神術屬於神器法術，可被阿卡德指定變為0費", () => {
    let state = mainState();
    state.players.P1.faction = "MACHINE";
    state.players.P1.resources.recycleCharge = 3;
    state.players.P1.hand = [];
    const arcade = putCard(state, "P1", "MACHINE_009", "HAND", "artifact-spell-source");
    const descent = putCard(state, "P1", "MACHINE_007", "HAND", "artifact-spell");
    const artifact = putCard(state, "P1", "TOKEN_MACHINE_ARTIFACT_BOX", "HAND", "artifact-field");
    const ordinarySpell = putCard(state, "P1", "DRAGON_002", "HAND", "ordinary-spell");

    state = applyAction(state, { type: "PLAY_CARD", playerId: "P1", instanceId: arcade.instanceId }).state;
    expect(state.pendingChoice).toMatchObject({
      type: "EFFECT_CARDS",
      count: 2,
      candidateInstanceIds: expect.arrayContaining([descent.instanceId, artifact.instanceId]),
    });
    expect((state.pendingChoice as { candidateInstanceIds: string[] }).candidateInstanceIds).not.toContain(ordinarySpell.instanceId);

    state = applyAction(state, { type: "SELECT_EFFECT_CARDS", playerId: "P1", instanceIds: [descent.instanceId, artifact.instanceId] }).state;
    expect(state.players.P1.hand.find((card) => card.instanceId === descent.instanceId)?.currentCost).toBe(0);
    expect(state.players.P1.hand.find((card) => card.instanceId === artifact.instanceId)?.currentCost).toBe(0);
  });

  it("改費與召喚都無法執行時不扣充能", () => {
    let state = mainState();
    state.players.P1.faction = "MACHINE";
    state.players.P1.resources.recycleCharge = 3;
    state.players.P1.hand = [];
    for (let index = 0; index < 6; index += 1) putCard(state, "P1", "TOKEN_MACHINE_EMPIRE_SOLDIER", "MINION", `full-${index}`);
    const arcade = putCard(state, "P1", "MACHINE_009", "HAND", "none");
    const result = applyAction(state, { type: "PLAY_CARD", playerId: "P1", instanceId: arcade.instanceId });
    expect(result.error).toBeUndefined();
    expect(result.state.players.P1.resources.recycleCharge).toBe(3);
  });
});
