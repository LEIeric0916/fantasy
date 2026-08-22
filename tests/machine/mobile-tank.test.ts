import { describe, expect, it } from "vitest";
import { applyAction } from "../../src/game/engine/gameEngine";
import { resolvePendingEffects } from "../../src/game/engine/effectEngine";
import { destroyMinion } from "../../src/game/engine/zoneEngine";
import { mainState, putCard } from "../helpers";

describe("机械机动战车", () => {
  it("回收充能从5达到6时从手牌效果召唤，并在原触发完成后发动战吼", () => {
    const state = mainState();
    state.players.P1.resources.recycleCharge = 5;
    const tank = putCard(state, "P1", "MACHINE_011", "HAND", "effect-summon");
    const soldier = putCard(state, "P1", "TOKEN_MACHINE_EMPIRE_SOLDIER", "MINION", "charge-source");
    const enemyHp = state.players.P2.heroHp;
    const deckSize = state.players.P1.deck.length;

    destroyMinion(state, soldier, "TEST");
    resolvePendingEffects(state);

    expect(state.players.P1.resources.recycleCharge).toBe(6);
    expect(state.players.P1.minions.some((card) => card.instanceId === tank.instanceId)).toBe(true);
    expect(state.players.P2.heroHp).toBe(enemyHp - 3);
    expect(state.players.P1.deck).toHaveLength(deckSize - 1);
    expect(state.players.P1.fields.some((card) => card.definitionId === "TOKEN_MACHINE_GEAR")).toBe(true);
  });

  it("正常打出时对玩家造成3伤、召唤齿轮并抽1", () => {
    let state = mainState();
    state.players.P1.faction = "MACHINE";
    const tank = putCard(state, "P1", "MACHINE_011", "HAND", "normal");
    const deckSize = state.players.P1.deck.length;
    state = applyAction(state, { type: "PLAY_CARD", playerId: "P1", instanceId: tank.instanceId }).state;
    expect(state.players.P2.heroHp).toBe(27);
    expect(state.players.P1.fields.some((card) => card.definitionId === "TOKEN_MACHINE_GEAR")).toBe(true);
    expect(state.players.P1.deck).toHaveLength(deckSize - 1);
  });
});
