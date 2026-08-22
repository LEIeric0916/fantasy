import { describe, expect, it } from "vitest";
import { applyAction } from "../../src/game/engine/gameEngine";
import { mainState, putCard } from "../helpers";

describe("不朽者戰吼", () => {
  it("頂部3張沒有發現目標時結束發現，不查看牌組深處；黑暗之書的獨立效果仍會結算", () => {
    let state = mainState();
    state.players.P1.hand = [];
    putCard(state, "P1", "TOKEN_UNDEAD_BOOK_IMMORTAL", "FIELD", "book");
    const deeperTarget = state.players.P2.deck.find((card) => card.definitionId === "UNDEAD_003")!;
    state.players.P2.deck.splice(state.players.P2.deck.indexOf(deeperTarget), 1);
    deeperTarget.ownerId = "P1";
    deeperTarget.controllerId = "P1";
    state.players.P1.deck.unshift(deeperTarget);
    const nonTargets = state.players.P1.deck.filter((card) => card.definitionId.startsWith("DRAGON_")).slice(0, 3);
    for (const card of nonTargets) {
      state.players.P1.deck.splice(state.players.P1.deck.indexOf(card), 1);
      state.players.P1.deck.push(card);
    }
    const source = putCard(state, "P1", "UNDEAD_001", "HAND", "fallback");
    const deckBefore = state.players.P1.deck.length;
    state = applyAction(state, { type: "PLAY_CARD", playerId: "P1", instanceId: source.instanceId }).state;
    expect(state.pendingChoice).toBeUndefined();
    expect(state.players.P1.deck).toHaveLength(deckBefore);
    expect(state.players.P1.deck.some((card) => card.instanceId === deeperTarget.instanceId)).toBe(true);
    expect(state.players.P1.minions.some((card) => card.definitionId === "TOKEN_UNDEAD_GENERIC")).toBe(true);
  });

  it("牌庫頂部3張有合法不朽者手下時由玩家發現，不執行否則抽牌", () => {
    let state = mainState();
    state.players.P1.hand = [];
    const candidate = state.players.P2.deck.find((card) => card.definitionId === "UNDEAD_003")!;
    state.players.P2.deck = state.players.P2.deck.filter((card) => card.instanceId !== candidate.instanceId);
    candidate.ownerId = "P1";
    candidate.controllerId = "P1";
    state.players.P1.deck.push(candidate);
    const source = putCard(state, "P1", "UNDEAD_001", "HAND", "discover");
    const deckBefore = state.players.P1.deck.length;
    state = applyAction(state, { type: "PLAY_CARD", playerId: "P1", instanceId: source.instanceId }).state;
    state = applyAction(state, { type: "SELECT_EFFECT_CARDS", playerId: "P1", instanceIds: [candidate.instanceId] }).state;
    expect(state.players.P1.hand.some((card) => card.instanceId === candidate.instanceId)).toBe(true);
    expect(state.players.P1.deck).toHaveLength(deckBefore - 1);
  });
});
