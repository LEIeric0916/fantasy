import { describe, expect, it } from "vitest";
import { getCardDefinition } from "../../src/game/cards/cardRegistry";
import { applyAction } from "../../src/game/engine/gameEngine";
import { createCardInstance } from "../../src/game/state/CardInstance";
import { mainState, putCard } from "../helpers";

describe("黑暗祭儀", () => {
  it("頂部翻5，指定3張手下加入手牌，再只能從這3張中指定丟棄1張", () => {
    let state = mainState();
    state.players.P1.hand = [];
    state.players.P1.heroHp = 25;
    putCard(state, "P1", "TOKEN_UNDEAD_BOOK_IMMORTAL", "FIELD", "book");
    const spell = putCard(state, "P1", "UNDEAD_013", "HAND", "ritual");

    const first = state.players.P1.deck.find((card) => getCardDefinition(card.definitionId).cardType === "MINION")!;
    const second = state.players.P1.deck.find((card) => card.instanceId !== first.instanceId && getCardDefinition(card.definitionId).cardType === "MINION")!;
    const onDiscard = createCardInstance(getCardDefinition("UNDEAD_008"), "P1", "DECK", "ritual-on-discard");
    const filler = state.players.P1.deck.filter((card) => getCardDefinition(card.definitionId).cardType === "SPELL").slice(0, 2);
    const topIds = new Set([first.instanceId, second.instanceId, ...filler.map((card) => card.instanceId)]);
    state.players.P1.deck = state.players.P1.deck.filter((card) => !topIds.has(card.instanceId));
    state.players.P1.deck.push(...filler, first, second, onDiscard);

    state = applyAction(state, { type: "PLAY_CARD", playerId: "P1", instanceId: spell.instanceId }).state;
    const selected = [first.instanceId, second.instanceId, onDiscard.instanceId];
    state = applyAction(state, { type: "SELECT_EFFECT_CARDS", playerId: "P1", instanceIds: selected }).state;
    expect(state.pendingChoice).toMatchObject({ type: "EFFECT_CARDS", candidateInstanceIds: selected, count: 1 });

    state = applyAction(state, { type: "SELECT_EFFECT_CARDS", playerId: "P1", instanceIds: [onDiscard.instanceId] }).state;
    expect(state.players.P1.graveyard.some((card) => card.instanceId === onDiscard.instanceId)).toBe(true);
    expect(state.players.P1.heroHp).toBe(27);
    expect(state.players.P1.resources.necromancy).toBe(2);
    const healIndex = state.log.findIndex((entry) => entry.message.includes("恢復 2 HP"));
    const discardTriggerIndex = state.log.findIndex((entry) => entry.message.includes("死靈數 +2"));
    expect(healIndex).toBeLessThan(discardTriggerIndex);
  });
});
