import { describe, expect, it } from "vitest";
import { applyAction } from "../../src/game/engine/gameEngine";
import { mainState, putCard } from "../helpers";

describe("机械神机圣徒 阿卡德", () => {
  it("机械术3指定两张神器费用变0并召唤士兵", () => {
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

  it("手中不足两张神器时跳过改费，但士兵可召唤则仍扣3并召唤", () => {
    let state = mainState();
    state.players.P1.faction = "MACHINE";
    state.players.P1.resources.recycleCharge = 3;
    state.players.P1.hand = [];
    const arcade = putCard(state, "P1", "MACHINE_009", "HAND", "partial");
    putCard(state, "P1", "TOKEN_MACHINE_ARTIFACT_BOX", "HAND", "only-one");
    state = applyAction(state, { type: "PLAY_CARD", playerId: "P1", instanceId: arcade.instanceId }).state;
    expect(state.pendingChoice).toBeUndefined();
    expect(state.players.P1.resources.recycleCharge).toBe(0);
    expect(state.players.P1.minions.some((card) => card.definitionId === "TOKEN_MACHINE_EMPIRE_SOLDIER")).toBe(true);
  });

  it("改费与召唤都无法执行时不扣充能", () => {
    let state = mainState();
    state.players.P1.faction = "MACHINE";
    state.players.P1.resources.recycleCharge = 3;
    state.players.P1.hand = [];
    for (let index = 0; index < 6; index += 1) putCard(state, "P1", "TOKEN_MACHINE_EMPIRE_SOLDIER", "MINION", `full-${index}`);
    const arcade = putCard(state, "P1", "MACHINE_009", "HAND", "none");
    putCard(state, "P1", "TOKEN_MACHINE_ARTIFACT_BOX", "HAND", "only-one");
    const result = applyAction(state, { type: "PLAY_CARD", playerId: "P1", instanceId: arcade.instanceId });
    expect(result.error).toBeUndefined();
    expect(result.state.players.P1.resources.recycleCharge).toBe(3);
  });
});
