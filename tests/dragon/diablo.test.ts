import { describe, expect, it } from "vitest";
import { applyAction } from "../../src/game/engine/gameEngine";
import { resolvePendingEffects } from "../../src/game/engine/effectEngine";
import { destroyMinion } from "../../src/game/engine/zoneEngine";
import { refreshCardCost } from "../../src/game/engine/costEngine";
import { mainState, putCard } from "../helpers";

describe("三皇龍迪亞布羅", () => {
  it("正常打出時召喚熾焰皇龍與海潮皇龍", () => {
    let state = mainState();
    state.players.P1.hand = [];
    const diablo = putCard(state, "P1", "DRAGON_009", "HAND", "normal");
    state = applyAction(state, { type: "PLAY_CARD", playerId: "P1", instanceId: diablo.instanceId }).state;
    expect(state.players.P1.mana).toBe(2);
    expect(state.players.P1.minions.map((card) => card.definitionId)).toEqual([
      "DRAGON_009",
      "TOKEN_DRAGON_BLAZING_EMPEROR",
      "TOKEN_DRAGON_TIDAL_EMPEROR",
    ]);
  });

  it("死亡之聲抽1張牌", () => {
    const state = mainState();
    const diablo = putCard(state, "P1", "DRAGON_009", "MINION", "death");
    const deckBefore = state.players.P1.deck.length;
    destroyMinion(state, diablo, "TEST");
    resolvePendingEffects(state);
    expect(state.players.P1.deck).toHaveLength(deckBefore - 1);
  });

  it("轉費3依序增加空水晶、抽牌、返回牌組並洗牌，不召喚手下", () => {
    let state = mainState();
    state.players.P1.hand = [];
    const diablo = putCard(state, "P1", "DRAGON_009", "HAND", "alternate");
    const deckBefore = state.players.P1.deck.length;
    const oldSeed = state.rngSeed;
    state = applyAction(state, { type: "PLAY_ALTERNATE", playerId: "P1", instanceId: diablo.instanceId }).state;

    expect(state.players.P1.mana).toBe(7);
    expect(state.players.P1.maxMana).toBe(10);
    expect(state.players.P1.deck).toHaveLength(deckBefore);
    expect(state.players.P1.deck.some((card) => card.instanceId === diablo.instanceId)).toBe(true);
    expect(state.players.P1.minions).toHaveLength(0);
    expect(state.rngSeed).not.toBe(oldSeed);
    const drawIndex = state.log.findIndex((entry) => entry.data?.reason === "EFFECT:DRAGON_009");
    const returnIndex = state.log.findIndex((entry) => entry.data?.reason === "ALTERNATE_RETURN_TO_DECK");
    const shuffleIndex = state.log.findIndex((entry) => entry.message.includes("轉費卡返回牌組並洗牌"));
    expect(drawIndex).toBeLessThan(returnIndex);
    expect(returnIndex).toBeLessThan(shuffleIndex);
  });

  it("熾焰皇龍在我方回合結束時連續指定3次並各造成4點傷害", () => {
    let state = mainState();
    const blazing = putCard(state, "P1", "TOKEN_DRAGON_BLAZING_EMPEROR", "MINION", "blazing-trigger");
    const target = putCard(state, "P2", "DRAGON_012", "MINION", "blazing-target");
    state = applyAction(state, { type: "END_TURN", playerId: "P1" }).state;
    expect(state.pendingChoice).toMatchObject({ type: "EFFECT_CARDS", sourceInstanceId: blazing.instanceId });
    for (let hit = 0; hit < 3; hit += 1) {
      state = applyAction(state, { type: "SELECT_EFFECT_CARDS", playerId: "P1", instanceIds: [target.instanceId] }).state;
    }
    expect(state.players.P2.graveyard.some((card) => card.instanceId === target.instanceId)).toBe(true);
    expect(state.players.P2.heroHp).toBe(30);
  });

  it("熾焰皇龍失去手下目標後只會傷害玩家1次", () => {
    let state = mainState();
    putCard(state, "P1", "TOKEN_DRAGON_BLAZING_EMPEROR", "MINION", "blazing-fallback");
    const target = putCard(state, "P2", "TOKEN_UNDEAD_SPIRIT", "MINION", "fallback-target");
    target.currentHealth = 3;
    state = applyAction(state, { type: "END_TURN", playerId: "P1" }).state;
    state = applyAction(state, { type: "SELECT_EFFECT_CARDS", playerId: "P1", instanceIds: [target.instanceId] }).state;
    expect(state.players.P2.heroHp).toBe(26);
  });

  it("海潮皇龍死亡之聲恢復2HP，並使下一張原始費用7以下龍族手下費用變為0", () => {
    let state = mainState();
    state.players.P1.heroHp = 25;
    const tidal = putCard(state, "P1", "TOKEN_DRAGON_TIDAL_EMPEROR", "MINION", "tidal-death");
    const lowCostDragon = putCard(state, "P1", "DRAGON_001", "HAND", "tidal-free");
    destroyMinion(state, tidal, "TEST");
    resolvePendingEffects(state);
    refreshCardCost(state, "P1", lowCostDragon);

    expect(state.players.P1.heroHp).toBe(27);
    expect(lowCostDragon.currentCost).toBe(0);
    state = applyAction(state, { type: "PLAY_CARD", playerId: "P1", instanceId: lowCostDragon.instanceId }).state;
    expect(state.players.P1.nextLowCostDragonZeroMaxCost).toBeNull();
  });
});
