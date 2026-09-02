import { describe, expect, it } from "vitest";
import { applyAction } from "../../src/game/engine/gameEngine";
import { resolvePendingEffects } from "../../src/game/engine/effectEngine";
import { destroyMinion } from "../../src/game/engine/zoneEngine";
import { mainState, putCard } from "../helpers";

describe("亡靈指定與延後觸發", () => {
  it("沉默者先由玩家棄牌，再指定敵方手下造成傷害", () => {
    let state = mainState();
    state.players.P1.hand = [];
    const silencer = putCard(state, "P1", "UNDEAD_002", "HAND", "play");
    const discarded = putCard(state, "P1", "DRAGON_002", "HAND", "discard");
    const target = putCard(state, "P2", "DRAGON_001", "MINION", "target");

    state = applyAction(state, { type: "PLAY_CARD", playerId: "P1", instanceId: silencer.instanceId }).state;
    expect(state.pendingChoice?.type).toBe("EFFECT_CARDS");

    state = applyAction(state, { type: "SELECT_EFFECT_CARDS", playerId: "P1", instanceIds: [discarded.instanceId] }).state;
    expect(state.players.P1.graveyard.some((card) => card.instanceId === discarded.instanceId)).toBe(true);
    expect(state.pendingChoice?.type).toBe("EFFECT_CARDS");

    state = applyAction(state, { type: "SELECT_EFFECT_CARDS", playerId: "P1", instanceIds: [target.instanceId] }).state;
    expect(state.players.P2.graveyard.some((card) => card.instanceId === target.instanceId)).toBe(true);
    expect(state.pendingChoice).toBeUndefined();
  });

  it("沉默者無手牌可棄時，逗號後的傷害不執行", () => {
    let state = mainState();
    state.players.P1.hand = [];
    const silencer = putCard(state, "P1", "UNDEAD_002", "HAND", "only-card");
    const target = putCard(state, "P2", "DRAGON_012", "MINION", "target");
    const hp = target.currentHealth;

    const result = applyAction(state, { type: "PLAY_CARD", playerId: "P1", instanceId: silencer.instanceId });
    expect(result.error).toBeUndefined();
    expect(result.state.pendingChoice).toBeUndefined();
    expect(result.state.players.P2.minions[0].currentHealth).toBe(hp);
  });

  it("沉默者死亡之聲抽兩張牌", () => {
    const state = mainState();
    const silencer = putCard(state, "P1", "UNDEAD_002", "MINION", "deathrattle");
    const deckBefore = state.players.P1.deck.length;
    destroyMinion(state, silencer, "TEST");
    resolvePendingEffects(state);
    expect(state.players.P1.deck).toHaveLength(deckBefore - 2);
  });

  it("亞恩選完兩種黑暗之書後，才執行被棄烏比斯的觸發效果", () => {
    let state = mainState();
    state.players.P1.hand = [];
    const played = putCard(state, "P1", "UNDEAD_008", "HAND", "played");
    const discarded = putCard(state, "P1", "UNDEAD_003", "HAND", "discarded");
    const deckBefore = state.players.P1.deck.length;

    state = applyAction(state, { type: "PLAY_CARD", playerId: "P1", instanceId: played.instanceId }).state;
    state = applyAction(state, { type: "SELECT_EFFECT_CARDS", playerId: "P1", instanceIds: [discarded.instanceId] }).state;

    expect(state.players.P1.resources.necromancy).toBe(0);
    expect(state.players.P1.deck).toHaveLength(deckBefore);
    expect(state.pendingEffects).toHaveLength(1);
    expect(state.pendingChoice?.type).toBe("EFFECT_OPTION");

    state = applyAction(state, { type: "SELECT_EFFECT_OPTION", playerId: "P1", optionId: "TOKEN_UNDEAD_BOOK_IMMORTAL" }).state;
    expect(state.pendingChoice?.type).toBe("EFFECT_OPTION");
    if (state.pendingChoice?.type === "EFFECT_OPTION") {
      expect(state.pendingChoice.options.map((option) => option.id)).not.toContain("TOKEN_UNDEAD_BOOK_IMMORTAL");
    }

    state = applyAction(state, { type: "SELECT_EFFECT_OPTION", playerId: "P1", optionId: "TOKEN_UNDEAD_BOOK_PLAGUE" }).state;
    expect(state.players.P1.fields.map((card) => card.definitionId)).toEqual([
      "TOKEN_UNDEAD_BOOK_IMMORTAL",
      "TOKEN_UNDEAD_BOOK_PLAGUE",
    ]);
    expect(state.players.P1.resources.necromancy).toBe(2);
    expect(state.players.P1.deck).toHaveLength(deckBefore - 1);
    expect(state.pendingEffects).toHaveLength(0);
  });
});
