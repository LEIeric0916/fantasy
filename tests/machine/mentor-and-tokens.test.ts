import { describe, expect, it } from "vitest";
import { applyAction } from "../../src/game/engine/gameEngine";
import { resolveEffects, resolvePendingEffects } from "../../src/game/engine/effectEngine";
import { getCardDefinition } from "../../src/game/cards/cardRegistry";
import { destroyCardOnField } from "../../src/game/engine/zoneEngine";
import { mainState, putCard } from "../helpers";

describe("機械大導師與機械衍生物", () => {
  it("考爾戰吼加1充能並召喚立方體，立方體入場召喚士兵", () => {
    let state = mainState();
    state.players.P1.faction = "MACHINE";
    const mentor = putCard(state, "P1", "MACHINE_006", "HAND", "mentor");
    state = applyAction(state, { type: "PLAY_CARD", playerId: "P1", instanceId: mentor.instanceId }).state;
    expect(state.players.P1.resources.recycleCharge).toBe(1);
    expect(state.players.P1.fields.some((card) => card.definitionId === "TOKEN_MACHINE_CUBE")).toBe(true);
    expect(state.players.P1.minions.some((card) => card.definitionId === "TOKEN_MACHINE_EMPIRE_SOLDIER")).toBe(true);
  });

  it("考爾回合結束指定機械軍隊獲得嘲諷", () => {
    let state = mainState();
    putCard(state, "P1", "MACHINE_006", "MINION", "mentor-end");
    const soldier = putCard(state, "P1", "TOKEN_MACHINE_EMPIRE_SOLDIER", "MINION", "soldier");
    state = applyAction(state, { type: "END_TURN", playerId: "P1" }).state;
    expect(state.pendingChoice).toMatchObject({ type: "EFFECT_CARDS", candidateInstanceIds: [soldier.instanceId] });
    state = applyAction(state, { type: "SELECT_EFFECT_CARDS", playerId: "P1", instanceIds: [soldier.instanceId] }).state;
    expect(state.players.P1.minions.find((card) => card.instanceId === soldier.instanceId)?.keywords).toContain("TAUNT");
  });

  it("立方體謝幕召喚收割者；齒輪成長增加充能", () => {
    const state = mainState();
    const cube = putCard(state, "P1", "TOKEN_MACHINE_CUBE", "FIELD", "cube");
    destroyCardOnField(state, cube, "TEST");
    resolvePendingEffects(state);
    expect(state.players.P1.minions.some((card) => card.definitionId === "TOKEN_MACHINE_EMPIRE_REAPER")).toBe(true);

    putCard(state, "P1", "TOKEN_MACHINE_GEAR", "FIELD", "gear");
    state.phase = "GROWTH";
    const gear = state.players.P1.fields.find((card) => card.definitionId === "TOKEN_MACHINE_GEAR")!;
    const effects = getCardDefinition(gear.definitionId).triggeredEffects!.GROWTH!;
    resolveEffects(state, "P1", gear, effects);
    expect(state.players.P1.resources.recycleCharge).toBe(1);
  });
});
