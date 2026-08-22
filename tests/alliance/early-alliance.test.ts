import { describe, expect, it } from "vitest";
import { applyAction } from "../../src/game/engine/gameEngine";
import { mainState, putCard } from "../helpers";

describe("联盟前期卡", () => {
  it("皇家兵团依次获得绝杰荣耀、抽1、检索同名牌并洗牌", () => {
    let state = mainState();
    state.players.P1.hand = [];
    const searched = putCard(state, "P1", "ALLIANCE_001", "HAND", "deck-copy");
    state.players.P1.hand.splice(state.players.P1.hand.indexOf(searched), 1);
    searched.zone = "DECK";
    state.players.P1.deck.unshift(searched);
    const legion = putCard(state, "P1", "ALLIANCE_001", "HAND", "played");

    state = applyAction(state, { type: "PLAY_CARD", playerId: "P1", instanceId: legion.instanceId }).state;
    expect(state.players.P1.hand.some((card) => card.definitionId === "TOKEN_ALLIANCE_HEROIC_GLORY")).toBe(true);
    expect(state.pendingChoice).toMatchObject({ type: "EFFECT_CARDS", candidateInstanceIds: [searched.instanceId] });
    state = applyAction(state, { type: "SELECT_EFFECT_CARDS", playerId: "P1", instanceIds: [searched.instanceId] }).state;
    expect(state.players.P1.hand.some((card) => card.instanceId === searched.instanceId)).toBe(true);
  });

  it("皇家匕首先召唤卫兵；协作15时自身获得冲锋与+2攻击", () => {
    let state = mainState();
    state.players.P1.summonedThisGame = 14;
    const dagger = putCard(state, "P1", "ALLIANCE_002", "HAND", "dagger");
    state = applyAction(state, { type: "PLAY_CARD", playerId: "P1", instanceId: dagger.instanceId }).state;
    const played = state.players.P1.minions.find((card) => card.instanceId === dagger.instanceId)!;
    expect(state.players.P1.minions.some((card) => card.definitionId === "TOKEN_ALLIANCE_ROYAL_GUARD")).toBe(true);
    expect(played.currentAttack).toBe(3);
    expect(played.keywords).toContain("CHARGE");
  });

  it("贾维斯战吼召唤民兵触发自身光环，加上战吼抽牌合计抽2；每回合最多触发光环2次", () => {
    let state = mainState();
    state.players.P1.hand = [];
    const jarvis = putCard(state, "P1", "ALLIANCE_003", "HAND", "jarvis");
    const deckSize = state.players.P1.deck.length;
    state = applyAction(state, { type: "PLAY_CARD", playerId: "P1", instanceId: jarvis.instanceId }).state;
    expect(state.players.P1.deck).toHaveLength(deckSize - 2);

    const first = putCard(state, "P1", "TOKEN_ALLIANCE_ROYAL_GUARD", "HAND", "first");
    state = applyAction(state, { type: "PLAY_CARD", playerId: "P1", instanceId: first.instanceId }).state;
    expect(state.players.P1.deck).toHaveLength(deckSize - 3);
    const second = putCard(state, "P1", "TOKEN_ALLIANCE_ROYAL_GUARD", "HAND", "second");
    state = applyAction(state, { type: "PLAY_CARD", playerId: "P1", instanceId: second.instanceId }).state;
    expect(state.players.P1.deck).toHaveLength(deckSize - 3);
  });
});
