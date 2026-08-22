import { describe, expect, it } from "vitest";
import { getCardDefinition } from "../../src/game/cards/cardRegistry";
import { applyAction } from "../../src/game/engine/gameEngine";
import { mainState, putCard } from "../helpers";

function moveToDeckTop(state: ReturnType<typeof mainState>, instanceId: string) {
  const deck = state.players.P1.deck;
  const index = deck.findIndex((card) => card.instanceId === instanceId);
  const [card] = deck.splice(index, 1);
  deck.push(card);
}

describe("发现与回合限定减费", () => {
  it("龙的诞生翻开顶部4张并选择龙族手下，使其本回合费用-4", () => {
    let state = mainState();
    state.players.P1.hand = [];
    putCard(state, "P2", "UNDEAD_001", "MINION", "cost-1");
    putCard(state, "P2", "UNDEAD_001", "MINION", "cost-2");
    state.players.P1.mana = 4;
    const spell = putCard(state, "P1", "DRAGON_014", "HAND", "discover");
    const candidate = state.players.P1.deck.find((card) => card.definitionId === "DRAGON_012")!;
    moveToDeckTop(state, candidate.instanceId);

    state = applyAction(state, { type: "PLAY_CARD", playerId: "P1", instanceId: spell.instanceId }).state;
    expect(state.players.P1.mana).toBe(0);
    expect(state.pendingChoice).toMatchObject({ type: "EFFECT_CARDS" });
    state = applyAction(state, { type: "SELECT_EFFECT_CARDS", playerId: "P1", instanceIds: [candidate.instanceId] }).state;
    expect(state.players.P1.hand.find((card) => card.instanceId === candidate.instanceId)?.currentCost).toBe(16);

    state = applyAction(state, { type: "END_TURN", playerId: "P1" }).state;
    expect(state.players.P1.hand.find((card) => card.instanceId === candidate.instanceId)?.currentCost).toBe(20);
  });

  it("动态减费最低为0", () => {
    let state = mainState();
    state.players.P1.hand = [];
    for (let index = 0; index < 7; index += 1) putCard(state, "P2", "UNDEAD_001", "MINION", `enemy-${index}`);
    state.players.P1.mana = 0;
    const spell = putCard(state, "P1", "DRAGON_014", "HAND", "free");
    const result = applyAction(state, { type: "PLAY_CARD", playerId: "P1", instanceId: spell.instanceId });
    expect(result.error).toBeUndefined();
    expect(result.state.players.P1.mana).toBe(0);
  });

  it("龙之吟翻开顶部8张；未选牌保持顺序，并在选择后恢复所有水晶", () => {
    let state = mainState();
    state.players.P1.hand = [];
    const spell = putCard(state, "P1", "DRAGON_015", "HAND", "song");
    const candidate = state.players.P1.deck.find((card) => {
      const definition = getCardDefinition(card.definitionId);
      return definition.cardType === "MINION" && definition.subtype.includes("DRAGON");
    })!;
    moveToDeckTop(state, candidate.instanceId);
    state = applyAction(state, { type: "PLAY_CARD", playerId: "P1", instanceId: spell.instanceId }).state;
    const beforeChoice = state.players.P1.deck.map((card) => card.instanceId);
    expect(state.players.P1.mana).toBe(1);
    state = applyAction(state, { type: "SELECT_EFFECT_CARDS", playerId: "P1", instanceIds: [candidate.instanceId] }).state;
    expect(state.players.P1.deck.map((card) => card.instanceId)).toEqual(beforeChoice.filter((id) => id !== candidate.instanceId));
    expect(state.players.P1.mana).toBe(state.players.P1.maxMana);
  });
});
