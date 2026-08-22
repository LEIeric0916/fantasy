import { describe, expect, it } from "vitest";
import { applyAction } from "../../src/game/engine/gameEngine";
import { mainState, putCard } from "../helpers";

describe("已确认返回后洗牌的转费", () => {
  it("赤焰龙皇兵转费2：最大水晶+1，返回牌组并洗牌", () => {
    let state = mainState();
    state.players.P1.hand = [];
    const card = putCard(state, "P1", "DRAGON_010", "HAND", "alternate");
    const deckBefore = state.players.P1.deck.length;
    const seedBefore = state.rngSeed;
    state = applyAction(state, { type: "PLAY_ALTERNATE", playerId: "P1", instanceId: card.instanceId }).state;
    expect(state.players.P1.mana).toBe(8);
    expect(state.players.P1.maxMana).toBe(11);
    expect(state.players.P1.deck).toHaveLength(deckBefore + 1);
    expect(state.players.P1.deck.some((item) => item.instanceId === card.instanceId)).toBe(true);
    expect(state.rngSeed).not.toBe(seedBefore);
  });

  it("巴哈姆特转费3：指定3伤、抽1，再返回牌组并洗牌", () => {
    let state = mainState();
    state.players.P1.hand = [];
    const card = putCard(state, "P1", "DRAGON_012", "HAND", "alternate");
    const target = putCard(state, "P2", "UNDEAD_001", "MINION", "target");
    const deckBefore = state.players.P1.deck.length;
    state = applyAction(state, { type: "PLAY_ALTERNATE", playerId: "P1", instanceId: card.instanceId }).state;
    expect(state.pendingChoice?.type).toBe("EFFECT_CARDS");
    state = applyAction(state, { type: "SELECT_EFFECT_CARDS", playerId: "P1", instanceIds: [target.instanceId] }).state;
    expect(state.players.P2.graveyard.some((item) => item.instanceId === target.instanceId)).toBe(true);
    expect(state.players.P1.deck).toHaveLength(deckBefore);
    expect(state.players.P1.deck.some((item) => item.instanceId === card.instanceId)).toBe(true);
    expect(state.players.P1.mana).toBe(7);
  });
});
