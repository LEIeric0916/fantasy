import { describe, expect, it } from "vitest";
import { applyAction } from "../../src/game/engine/gameEngine";
import { resolvePendingEffects } from "../../src/game/engine/effectEngine";
import { destroyMinion } from "../../src/game/engine/zoneEngine";
import { mainState, putCard } from "../helpers";

describe("三皇龙迪亚布罗", () => {
  it("正常打出时召唤炽焰皇龙与海潮皇龙", () => {
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

  it("死亡之声抽1张牌", () => {
    const state = mainState();
    const diablo = putCard(state, "P1", "DRAGON_009", "MINION", "death");
    const deckBefore = state.players.P1.deck.length;
    destroyMinion(state, diablo, "TEST");
    resolvePendingEffects(state);
    expect(state.players.P1.deck).toHaveLength(deckBefore - 1);
  });

  it("转费3依序增加空水晶、抽牌、返回牌组并洗牌，不召唤手下", () => {
    let state = mainState();
    state.players.P1.hand = [];
    const diablo = putCard(state, "P1", "DRAGON_009", "HAND", "alternate");
    const deckBefore = state.players.P1.deck.length;
    const oldSeed = state.rngSeed;
    state = applyAction(state, { type: "PLAY_ALTERNATE", playerId: "P1", instanceId: diablo.instanceId }).state;

    expect(state.players.P1.mana).toBe(7);
    expect(state.players.P1.maxMana).toBe(11);
    expect(state.players.P1.deck).toHaveLength(deckBefore);
    expect(state.players.P1.deck.some((card) => card.instanceId === diablo.instanceId)).toBe(true);
    expect(state.players.P1.minions).toHaveLength(0);
    expect(state.rngSeed).not.toBe(oldSeed);
    const drawIndex = state.log.findIndex((entry) => entry.data?.reason === "EFFECT:DRAGON_009");
    const returnIndex = state.log.findIndex((entry) => entry.data?.reason === "ALTERNATE_RETURN_TO_DECK");
    const shuffleIndex = state.log.findIndex((entry) => entry.message.includes("转费卡返回牌组并洗牌"));
    expect(drawIndex).toBeLessThan(returnIndex);
    expect(returnIndex).toBeLessThan(shuffleIndex);
  });
});
