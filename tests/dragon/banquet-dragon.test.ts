import { describe, expect, it } from "vitest";
import { applyAction } from "../../src/game/engine/gameEngine";
import { mainState, putCard } from "../helpers";

describe("宴樂之龍", () => {
  it("依序抽牌、指定4傷、最大水晶+1，再於最大值8時獲得+2/+2", () => {
    let state = mainState();
    state.players.P1.maxMana = 7;
    state.players.P1.mana = 7;
    state.players.P1.hand = [];
    const dragon = putCard(state, "P1", "DRAGON_003", "HAND", "play");
    const target = putCard(state, "P2", "DRAGON_012", "MINION", "target");
    const deckBefore = state.players.P1.deck.length;

    state = applyAction(state, { type: "PLAY_CARD", playerId: "P1", instanceId: dragon.instanceId }).state;
    expect(state.players.P1.deck).toHaveLength(deckBefore - 1);
    expect(state.players.P1.maxMana).toBe(7);
    expect(state.pendingChoice?.type).toBe("EFFECT_CARDS");

    state = applyAction(state, { type: "SELECT_EFFECT_CARDS", playerId: "P1", instanceIds: [target.instanceId] }).state;
    const after = state.players.P1.minions.find((card) => card.instanceId === dragon.instanceId)!;
    expect(state.players.P2.minions.find((card) => card.instanceId === target.instanceId)?.currentHealth).toBe(8);
    expect(state.players.P1.maxMana).toBe(8);
    expect(after.currentAttack).toBe(6);
    expect(after.currentHealth).toBe(6);
  });

  it("沒有合法傷害目標時，逗號後的增加最大水晶與強化均不執行", () => {
    let state = mainState();
    state.players.P1.maxMana = 7;
    state.players.P1.mana = 7;
    state.players.P1.hand = [];
    const dragon = putCard(state, "P1", "DRAGON_003", "HAND", "no-target");
    state = applyAction(state, { type: "PLAY_CARD", playerId: "P1", instanceId: dragon.instanceId }).state;
    expect(state.pendingChoice).toBeUndefined();
    expect(state.players.P1.maxMana).toBe(7);
    expect(state.players.P1.minions[0]).toMatchObject({ currentAttack: 4, currentHealth: 4 });
  });

  it("句號後的8以上條件仍獨立執行", () => {
    let state = mainState();
    state.players.P1.maxMana = 9;
    state.players.P1.mana = 9;
    state.players.P1.hand = [];
    const dragon = putCard(state, "P1", "DRAGON_003", "HAND", "period");
    state = applyAction(state, { type: "PLAY_CARD", playerId: "P1", instanceId: dragon.instanceId }).state;
    expect(state.players.P1.maxMana).toBe(9);
    expect(state.players.P1.minions[0]).toMatchObject({ currentAttack: 6, currentHealth: 6 });
  });
});
