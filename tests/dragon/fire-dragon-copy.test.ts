import { describe, expect, it } from "vitest";
import { applyAction } from "../../src/game/engine/gameEngine";
import { mainState, putCard } from "../helpers";

describe("炎火之龍", () => {
  it("由玩家指定手牌法術，復制發動效果但原法術留在手牌", () => {
    let state = mainState();
    state.players.P1.hand = [];
    const fireDragon = putCard(state, "P1", "DRAGON_008", "HAND", "copy");
    const spell = putCard(state, "P1", "DRAGON_013", "HAND", "copied-spell");
    const enemy = putCard(state, "P2", "UNDEAD_001", "MINION", "enemy");
    state = applyAction(state, { type: "PLAY_CARD", playerId: "P1", instanceId: fireDragon.instanceId }).state;
    state = applyAction(state, { type: "SELECT_EFFECT_CARDS", playerId: "P1", instanceIds: [spell.instanceId] }).state;
    expect(state.players.P1.hand.some((card) => card.instanceId === spell.instanceId)).toBe(true);
    expect(state.players.P1.minions.some((card) => card.definitionId === "TOKEN_DRAGON_HELLFIRE")).toBe(true);
    expect(state.players.P2.graveyard.some((card) => card.instanceId === enemy.instanceId)).toBe(true);
  });

  it("復制發動不視為使用法術，因此不觸發魔導戰龍效果召喚", () => {
    let state = mainState();
    state.players.P1.hand = [];
    const fireDragon = putCard(state, "P1", "DRAGON_008", "HAND", "source");
    const warDragon = putCard(state, "P1", "DRAGON_004", "HAND", "must-stay");
    const spell = putCard(state, "P1", "DRAGON_013", "HAND", "copied");
    state = applyAction(state, { type: "PLAY_CARD", playerId: "P1", instanceId: fireDragon.instanceId }).state;
    state = applyAction(state, { type: "SELECT_EFFECT_CARDS", playerId: "P1", instanceIds: [spell.instanceId] }).state;
    expect(state.players.P1.hand.some((card) => card.instanceId === warDragon.instanceId)).toBe(true);
    expect(state.players.P1.minions.some((card) => card.instanceId === warDragon.instanceId)).toBe(false);
    expect(state.players.P1.effectSummonUsedThisTurn).not.toContain("DRAGON_004");
  });
});
