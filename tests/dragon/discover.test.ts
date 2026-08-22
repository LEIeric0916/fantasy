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

describe("發現與回合限定減費", () => {
  it("龍的誕生翻開頂部4張並選擇龍族手下，使其本回合費用-4", () => {
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

  it("動態減費最低為0", () => {
    let state = mainState();
    state.players.P1.hand = [];
    for (let index = 0; index < 7; index += 1) putCard(state, "P2", "UNDEAD_001", "MINION", `enemy-${index}`);
    state.players.P1.mana = 0;
    const spell = putCard(state, "P1", "DRAGON_014", "HAND", "free");
    const result = applyAction(state, { type: "PLAY_CARD", playerId: "P1", instanceId: spell.instanceId });
    expect(result.error).toBeUndefined();
    expect(result.state.players.P1.mana).toBe(0);
  });

  it("聖印龍與龍的誕生只計算敵方手下，且場面變動後立即刷新費用", () => {
    let state = mainState();
    state.players.P1.hand = [];
    const sealDragon = putCard(state, "P1", "DRAGON_006", "HAND", "seal-cost");
    const birth = putCard(state, "P1", "DRAGON_014", "HAND", "birth-cost");
    putCard(state, "P2", "TOKEN_UNDEAD_BOOK_IMMORTAL", "FIELD", "enemy-field");

    state = applyAction(state, { type: "DEBUG_SUMMON", playerId: "P2", definitionId: "TOKEN_UNDEAD_SPIRIT" }).state;
    expect(state.players.P1.hand.find((card) => card.instanceId === sealDragon.instanceId)?.currentCost).toBe(6);
    expect(state.players.P1.hand.find((card) => card.instanceId === birth.instanceId)?.currentCost).toBe(5);

    state = applyAction(state, { type: "DEBUG_SUMMON", playerId: "P2", definitionId: "TOKEN_UNDEAD_SPIRIT" }).state;
    expect(state.players.P1.hand.find((card) => card.instanceId === sealDragon.instanceId)?.currentCost).toBe(5);
    expect(state.players.P1.hand.find((card) => card.instanceId === birth.instanceId)?.currentCost).toBe(4);
  });

  it("龍之吟翻開頂部8張；未選牌保持順序，並在選擇後恢復所有水晶", () => {
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
