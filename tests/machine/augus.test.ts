import { describe, expect, it } from "vitest";
import { applyAction } from "../../src/game/engine/gameEngine";
import { mainState, putCard } from "../helpers";

describe("机械法师 奥古斯", () => {
  it("战吼召唤收割者与毁灭者；机械术15选择两种不同神造物并按选择顺序触发战吼", () => {
    let state = mainState();
    state.players.P1.faction = "MACHINE";
    state.players.P1.hand = [];
    state.players.P1.resources.recycleCharge = 15;
    const augus = putCard(state, "P1", "MACHINE_013", "HAND", "augus");

    state = applyAction(state, { type: "PLAY_CARD", playerId: "P1", instanceId: augus.instanceId }).state;
    expect(state.players.P1.minions.some((card) => card.definitionId === "TOKEN_MACHINE_EMPIRE_REAPER")).toBe(true);
    expect(state.players.P1.minions.some((card) => card.definitionId === "TOKEN_MACHINE_DESTROYER")).toBe(true);
    expect(state.players.P1.resources.recycleCharge).toBe(0);
    expect(state.pendingChoice).toMatchObject({ type: "EFFECT_OPTION" });

    state = applyAction(state, { type: "SELECT_EFFECT_OPTION", playerId: "P1", optionId: "TOKEN_MACHINE_DIVINE_DATE_MASAMUNE" }).state;
    expect(state.pendingChoice).toMatchObject({ type: "EFFECT_OPTION" });
    if (state.pendingChoice?.type !== "EFFECT_OPTION") throw new Error("expected second divine choice");
    expect(state.pendingChoice.options.map((option) => option.id)).not.toContain("TOKEN_MACHINE_DIVINE_DATE_MASAMUNE");

    state = applyAction(state, { type: "SELECT_EFFECT_OPTION", playerId: "P1", optionId: "TOKEN_MACHINE_DIVINE_GABRIEL" }).state;
    expect(state.players.P1.minions.filter((card) => card.definitionId === "TOKEN_MACHINE_DIVINE_DATE_MASAMUNE")).toHaveLength(1);
    expect(state.players.P1.minions.filter((card) => card.definitionId === "TOKEN_MACHINE_DIVINE_GABRIEL")).toHaveLength(1);
    expect(state.players.P1.minions).toHaveLength(7);
    const reapers = state.players.P1.minions.filter((card) => card.definitionId === "TOKEN_MACHINE_EMPIRE_REAPER");
    expect(reapers).toHaveLength(3);
    expect(reapers.every((card) => card.keywords.includes("CHARGE") && card.keywords.includes("TAUNT"))).toBe(true);
    expect(reapers.filter((card) => card.keywords.includes("DIVINE_SHIELD"))).toHaveLength(2);
  });

  it("充能不足15时只执行战吼，不出现神造物选择", () => {
    let state = mainState();
    state.players.P1.faction = "MACHINE";
    state.players.P1.hand = [];
    state.players.P1.resources.recycleCharge = 14;
    const augus = putCard(state, "P1", "MACHINE_013", "HAND", "no-technique");
    state = applyAction(state, { type: "PLAY_CARD", playerId: "P1", instanceId: augus.instanceId }).state;
    expect(state.pendingChoice).toBeUndefined();
    expect(state.players.P1.resources.recycleCharge).toBe(14);
    expect(state.players.P1.minions).toHaveLength(3);
  });
});
