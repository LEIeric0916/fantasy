import { describe, expect, it } from "vitest";
import { applyAction } from "../../src/game/engine/gameEngine";
import { resolvePendingEffects } from "../../src/game/engine/effectEngine";
import { destroyCardOnField } from "../../src/game/engine/zoneEngine";
import { mainState, putCard } from "../helpers";

describe("机械神器 命运之轮", () => {
  it("费用按当前回收充能降低且最低为0，入场抽2", () => {
    let state = mainState();
    state.players.P1.faction = "MACHINE";
    state.players.P1.resources.recycleCharge = 4;
    const wheel = putCard(state, "P1", "MACHINE_012", "HAND", "wheel");
    const deckSize = state.players.P1.deck.length;
    state = applyAction(state, { type: "PLAY_CARD", playerId: "P1", instanceId: wheel.instanceId }).state;
    expect(state.players.P1.mana).toBe(8);
    expect(state.players.P1.deck).toHaveLength(deckSize - 2);
  });

  it("被消灭时谢幕召唤毁灭者，并因回收回到牌组底增加1充能", () => {
    const state = mainState();
    state.players.P1.resources.recycleCharge = 2;
    const wheel = putCard(state, "P1", "MACHINE_012", "FIELD", "destroyed");
    destroyCardOnField(state, wheel, "TEST");
    resolvePendingEffects(state);
    expect(state.players.P1.minions.some((card) => card.definitionId === "TOKEN_MACHINE_DESTROYER")).toBe(true);
    expect(state.players.P1.deck[0].instanceId).toBe(wheel.instanceId);
    expect(state.players.P1.resources.recycleCharge).toBe(3);
  });
});
