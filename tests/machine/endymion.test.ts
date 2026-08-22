import { describe, expect, it } from "vitest";
import { applyAction } from "../../src/game/engine/gameEngine";
import { resolvePendingEffects } from "../../src/game/engine/effectEngine";
import { destroyMinion } from "../../src/game/engine/zoneEngine";
import { mainState, putCard } from "../helpers";

describe("机械神造物 安迪米翁", () => {
  it("战吼开始按神器数锁定次数，每次重新指定且可连续指定仍存活目标", () => {
    let state = mainState();
    state.players.P1.faction = "MACHINE";
    state.players.P1.hand = [];
    putCard(state, "P1", "TOKEN_MACHINE_GEAR", "FIELD", "one");
    putCard(state, "P1", "TOKEN_MACHINE_ARTIFACT_BOX", "FIELD", "two");
    const target = putCard(state, "P2", "TOKEN_MACHINE_DESTROYER", "MINION", "target");
    const endymion = putCard(state, "P1", "TOKEN_MACHINE_DIVINE_ENDYMION", "HAND", "endymion");

    state = applyAction(state, { type: "PLAY_CARD", playerId: "P1", instanceId: endymion.instanceId }).state;
    expect(state.pendingChoice).toMatchObject({ type: "EFFECT_CARDS", resolution: { remainingHits: 2 } });
    state = applyAction(state, { type: "SELECT_EFFECT_CARDS", playerId: "P1", instanceIds: [target.instanceId] }).state;
    expect(state.players.P2.minions[0].currentHealth).toBe(2);
    expect(state.pendingChoice).toMatchObject({ type: "EFFECT_CARDS", resolution: { remainingHits: 1 } });
    state = applyAction(state, { type: "SELECT_EFFECT_CARDS", playerId: "P1", instanceIds: [target.instanceId] }).state;
    expect(state.players.P2.minions).toHaveLength(0);
  });

  it("死亡之声开始结算时按仍在场神器数增加回收充能", () => {
    const state = mainState();
    putCard(state, "P1", "TOKEN_MACHINE_GEAR", "FIELD", "one");
    putCard(state, "P1", "TOKEN_MACHINE_ARTIFACT_BOX", "FIELD", "two");
    const endymion = putCard(state, "P1", "TOKEN_MACHINE_DIVINE_ENDYMION", "MINION", "death");
    destroyMinion(state, endymion, "TEST");
    resolvePendingEffects(state);
    expect(state.players.P1.resources.recycleCharge).toBe(2);
  });
});
