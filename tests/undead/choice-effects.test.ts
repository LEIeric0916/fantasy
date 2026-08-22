import { describe, expect, it } from "vitest";
import { applyAction } from "../../src/game/engine/gameEngine";
import { resolvePendingEffects } from "../../src/game/engine/effectEngine";
import { destroyMinion } from "../../src/game/engine/zoneEngine";
import { mainState, putCard } from "../helpers";

describe("亡灵指定与延后触发", () => {
  it("沉默者先由玩家弃牌，再指定敌方手下造成伤害", () => {
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

  it("沉默者无手牌可弃时，逗号后的伤害不执行", () => {
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

  it("沉默者死亡之声抽两张牌", () => {
    const state = mainState();
    const silencer = putCard(state, "P1", "UNDEAD_002", "MINION", "deathrattle");
    const deckBefore = state.players.P1.deck.length;
    destroyMinion(state, silencer, "TEST");
    resolvePendingEffects(state);
    expect(state.players.P1.deck).toHaveLength(deckBefore - 2);
  });

  it("追忆者完整结算战吼后，才执行被弃追忆者的触发效果", () => {
    let state = mainState();
    state.players.P1.hand = [];
    const played = putCard(state, "P1", "UNDEAD_008", "HAND", "played");
    const discarded = putCard(state, "P1", "UNDEAD_008", "HAND", "discarded");
    const target = putCard(state, "P2", "DRAGON_012", "MINION", "seal-target");
    const deckBefore = state.players.P1.deck.length;

    state = applyAction(state, { type: "PLAY_CARD", playerId: "P1", instanceId: played.instanceId }).state;
    state = applyAction(state, { type: "SELECT_EFFECT_CARDS", playerId: "P1", instanceIds: [discarded.instanceId] }).state;

    expect(state.players.P1.resources.necromancy).toBe(0);
    expect(state.players.P1.deck).toHaveLength(deckBefore - 2);
    expect(state.pendingEffects).toHaveLength(1);
    expect(state.pendingChoice?.type).toBe("EFFECT_CARDS");

    state = applyAction(state, { type: "SELECT_EFFECT_CARDS", playerId: "P1", instanceIds: [target.instanceId] }).state;
    expect(state.players.P2.minions.find((card) => card.instanceId === target.instanceId)?.sealed).toBe(true);
    expect(state.players.P1.resources.necromancy).toBe(2);
    expect(state.players.P1.deck).toHaveLength(deckBefore - 3);
    expect(state.pendingEffects).toHaveLength(0);
  });
});
