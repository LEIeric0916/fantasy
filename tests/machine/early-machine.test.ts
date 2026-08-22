import { describe, expect, it } from "vitest";
import { applyAction } from "../../src/game/engine/gameEngine";
import { resolvePendingEffects } from "../../src/game/engine/effectEngine";
import { destroyCardOnField } from "../../src/game/engine/zoneEngine";
import { mainState, putCard } from "../helpers";

describe("机械前期卡与回收", () => {
  it("机械神器创造者将2张神器箱加入手牌", () => {
    let state = mainState();
    const creator = putCard(state, "P1", "MACHINE_001", "HAND", "creator");
    state = applyAction(state, { type: "PLAY_CARD", playerId: "P1", instanceId: creator.instanceId }).state;
    expect(state.players.P1.hand.filter((card) => card.definitionId === "TOKEN_MACHINE_ARTIFACT_BOX")).toHaveLength(2);
  });

  it("机械神教徒增加充能，有神器时召唤牧师；被消灭后回收至牌组底并再加1充能", () => {
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

  it("机械军技师增加2充能，有神器时召唤齿轮", () => {
    let state = mainState();
    putCard(state, "P1", "TOKEN_MACHINE_ARTIFACT_BOX", "FIELD", "artifact");
    const engineer = putCard(state, "P1", "MACHINE_003", "HAND", "engineer");
    state = applyAction(state, { type: "PLAY_CARD", playerId: "P1", instanceId: engineer.instanceId }).state;
    expect(state.players.P1.resources.recycleCharge).toBe(2);
    expect(state.players.P1.fields.some((card) => card.definitionId === "TOKEN_MACHINE_GEAR")).toBe(true);
  });
});
