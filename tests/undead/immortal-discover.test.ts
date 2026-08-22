import { describe, expect, it } from "vitest";
import { applyAction } from "../../src/game/engine/gameEngine";
import { mainState, putCard } from "../helpers";

describe("不朽者战吼", () => {
  it("整副牌库没有符合发现条件的不朽者手下时改为抽1张；黑暗之书条件独立召唤衍生不朽者", () => {
    let state = mainState();
    state.players.P1.hand = [];
    putCard(state, "P1", "TOKEN_UNDEAD_BOOK_IMMORTAL", "FIELD", "book");
    const source = putCard(state, "P1", "UNDEAD_001", "HAND", "fallback");
    const deckBefore = state.players.P1.deck.length;
    state = applyAction(state, { type: "PLAY_CARD", playerId: "P1", instanceId: source.instanceId }).state;
    expect(state.pendingChoice).toBeUndefined();
    expect(state.players.P1.deck).toHaveLength(deckBefore - 1);
    expect(state.players.P1.minions.some((card) => card.definitionId === "TOKEN_UNDEAD_GENERIC")).toBe(true);
  });

  it("牌库顶部3张有合法不朽者手下时由玩家发现，不执行否则抽牌", () => {
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
