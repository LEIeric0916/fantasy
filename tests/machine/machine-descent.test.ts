import { describe, expect, it } from "vitest";
import { applyAction } from "../../src/game/engine/gameEngine";
import { mainState, putCard } from "../helpers";

describe("机械降神术", () => {
  it("可选择1张返回后洗牌抽1，下一张机械手下减2并消耗减费", () => {
    let state = mainState();
    state.players.P1.faction = "MACHINE";
    state.players.P1.hand = [];
    const spell = putCard(state, "P1", "MACHINE_007", "HAND", "spell");
    const returned = putCard(state, "P1", "DRAGON_001", "HAND", "returned");
    const machine = putCard(state, "P1", "MACHINE_006", "HAND", "machine");

    state = applyAction(state, { type: "PLAY_CARD", playerId: "P1", instanceId: spell.instanceId }).state;
    expect(state.pendingChoice).toMatchObject({ type: "EFFECT_CARDS", minCount: 0, count: 2 });
    state = applyAction(state, { type: "SELECT_EFFECT_CARDS", playerId: "P1", instanceIds: [returned.instanceId] }).state;
    expect(state.players.P1.nextMachineCostReduction).toBe(2);
    expect(state.players.P1.resources.recycleCharge).toBe(1);

    const manaBefore = state.players.P1.mana;
    state = applyAction(state, { type: "PLAY_CARD", playerId: "P1", instanceId: machine.instanceId }).state;
    expect(state.players.P1.mana).toBe(manaBefore - 1);
    expect(state.players.P1.nextMachineCostReduction).toBe(0);
  });

  it("选择0张仍洗牌抽1，且下一张机械手下没有减费", () => {
    let state = mainState();
    state.players.P1.faction = "MACHINE";
    state.players.P1.hand = [];
    const spell = putCard(state, "P1", "MACHINE_007", "HAND", "zero");
    const seedBefore = state.rngSeed;
    state = applyAction(state, { type: "PLAY_CARD", playerId: "P1", instanceId: spell.instanceId }).state;
    state = applyAction(state, { type: "SELECT_EFFECT_CARDS", playerId: "P1", instanceIds: [] }).state;
    expect(state.rngSeed).not.toBe(seedBefore);
    expect(state.players.P1.nextMachineCostReduction).toBe(0);
    expect(state.players.P1.resources.recycleCharge).toBe(1);
  });
});
