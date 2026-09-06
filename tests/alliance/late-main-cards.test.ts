import { describe, expect, it } from "vitest";
import { applyAction } from "../../src/game/engine/gameEngine";
import { mainState, putCard } from "../helpers";

describe("聯盟後期主牌", () => {
  it("爆襲萊恩的原始費用為8", () => {
    expect(putCard(mainState(), "P1", "ALLIANCE_011", "HAND", "cost").currentCost).toBe(8);
  });

  it("皇家戰士第5回合以上按本回合召喚次數每次減2；協作15同時檢索主牌並召喚衍生皇家戰士", () => {
    let state = mainState();
    state.players.P1.hand = [];
    state.players.P1.turnsStarted = 5;
    state.players.P1.summonedThisTurn = 2;
    state.players.P1.summonedThisGame = 14;
    const searched = putCard(state, "P1", "ALLIANCE_010", "HAND", "deck-copy");
    state.players.P1.hand.splice(state.players.P1.hand.indexOf(searched), 1);
    searched.zone = "DECK";
    state.players.P1.deck.unshift(searched);
    const warrior = putCard(state, "P1", "ALLIANCE_010", "HAND", "played");
    state = applyAction(state, { type: "PLAY_CARD", playerId: "P1", instanceId: warrior.instanceId }).state;
    expect(state.players.P1.mana).toBe(5);
    state = applyAction(state, { type: "SELECT_EFFECT_CARDS", playerId: "P1", instanceIds: [searched.instanceId] }).state;
    expect(state.players.P1.minions.some((card) => card.definitionId === "TOKEN_ALLIANCE_ROYAL_WARRIOR")).toBe(true);
  });

  it("皇家戰士只在協作10後檢索，未達協作15時不召喚衍生皇家戰士", () => {
    let state = mainState();
    state.players.P1.hand = [];
    state.players.P1.summonedThisGame = 9;
    const searched = putCard(state, "P1", "ALLIANCE_010", "HAND", "rally-ten-copy");
    state.players.P1.hand.splice(state.players.P1.hand.indexOf(searched), 1);
    searched.zone = "DECK";
    state.players.P1.deck.unshift(searched);
    const warrior = putCard(state, "P1", "ALLIANCE_010", "HAND", "rally-ten-played");

    state = applyAction(state, { type: "PLAY_CARD", playerId: "P1", instanceId: warrior.instanceId }).state;

    expect(state.pendingChoice).toMatchObject({ type: "EFFECT_CARDS" });
    expect(state.players.P1.minions.some((card) => card.definitionId === "TOKEN_ALLIANCE_ROYAL_WARRIOR")).toBe(false);
    state = applyAction(state, { type: "SELECT_EFFECT_CARDS", playerId: "P1", instanceIds: [searched.instanceId] }).state;
    expect(state.players.P1.hand.some((card) => card.instanceId === searched.instanceId)).toBe(true);
    expect(state.players.P1.minions.some((card) => card.definitionId === "TOKEN_ALLIANCE_ROYAL_WARRIOR")).toBe(false);
  });

  it("皇家戰士未達協作10時不會檢索或召喚衍生牌", () => {
    let state = mainState();
    state.players.P1.hand = [];
    state.players.P1.summonedThisGame = 8;
    const searched = putCard(state, "P1", "ALLIANCE_010", "HAND", "below-ten-copy");
    state.players.P1.hand.splice(state.players.P1.hand.indexOf(searched), 1);
    searched.zone = "DECK";
    state.players.P1.deck.unshift(searched);
    const warrior = putCard(state, "P1", "ALLIANCE_010", "HAND", "below-ten-played");

    state = applyAction(state, { type: "PLAY_CARD", playerId: "P1", instanceId: warrior.instanceId }).state;

    expect(state.pendingChoice).toBeUndefined();
    expect(state.players.P1.deck.some((card) => card.instanceId === searched.instanceId)).toBe(true);
    expect(state.players.P1.minions.some((card) => card.definitionId === "TOKEN_ALLIANCE_ROYAL_WARRIOR")).toBe(false);
  });

  it("皇家戰士在自己的第4回合不會因本回合召喚次數減費", () => {
    let state = mainState();
    state.players.P1.hand = [];
    state.players.P1.turnsStarted = 4;
    state.players.P1.summonedThisTurn = 3;
    const warrior = putCard(state, "P1", "ALLIANCE_010", "HAND", "before-turn-five");

    state = applyAction(state, { type: "PLAY_CARD", playerId: "P1", instanceId: warrior.instanceId }).state;

    expect(state.players.P1.mana).toBe(1);
  });

  it("爆襲萊恩在戰吼開始記錄敵方數量，傷害離場不改變自身-X/-X", () => {
    let state = mainState();
    state.players.P1.hand = [];
    for (let index = 0; index < 3; index += 1) putCard(state, "P2", "TOKEN_ALLIANCE_ROYAL_GUARD", "MINION", `enemy-${index}`);
    const ryan = putCard(state, "P1", "ALLIANCE_011", "HAND", "ryan");
    const deckSizeBeforePlay = state.players.P1.deck.length;
    state = applyAction(state, { type: "PLAY_CARD", playerId: "P1", instanceId: ryan.instanceId }).state;
    const played = state.players.P1.minions.find((card) => card.instanceId === ryan.instanceId)!;
    expect(state.players.P2.minions).toHaveLength(0);
    expect(state.players.P2.heroHp).toBe(27);
    expect(played.currentAttack).toBe(4);
    expect(played.currentHealth).toBe(4);
    expect(state.players.P1.hand).toHaveLength(1);
    expect(state.players.P1.deck).toHaveLength(deckSizeBeforePlay - 1);
  });

  it("爆襲萊恩減值致死時生命停在0，不會留下負數", () => {
    let state = mainState();
    state.players.P1.hand = [];
    for (let index = 0; index < 7; index += 1) putCard(state, "P2", "TOKEN_ALLIANCE_ROYAL_GUARD", "MINION", `lethal-enemy-${index}`);
    const ryan = putCard(state, "P1", "ALLIANCE_011", "HAND", "zero-health");
    state = applyAction(state, { type: "PLAY_CARD", playerId: "P1", instanceId: ryan.instanceId }).state;
    const destroyed = state.players.P1.graveyard.find((card) => card.instanceId === ryan.instanceId);
    expect(destroyed).toMatchObject({ zone: "GRAVEYARD", currentHealth: 0, maxHealth: 0 });
  });

  it("加拉德可指定最多3個不同目標；協作20傷害為句號式獨立效果", () => {
    let state = mainState();
    state.players.P1.hand = [];
    state.players.P1.summonedThisGame = 19;
    const first = putCard(state, "P2", "TOKEN_MACHINE_DESTROYER", "MINION", "first");
    const second = putCard(state, "P2", "TOKEN_MACHINE_DESTROYER", "MINION", "second");
    const third = putCard(state, "P2", "TOKEN_MACHINE_DESTROYER", "MINION", "third");
    const gallard = putCard(state, "P1", "ALLIANCE_012", "HAND", "gallard");
    state = applyAction(state, { type: "PLAY_CARD", playerId: "P1", instanceId: gallard.instanceId }).state;
    expect(state.pendingChoice).toMatchObject({ type: "EFFECT_CARDS", count: 3, minCount: 0 });
    state = applyAction(state, { type: "SELECT_EFFECT_CARDS", playerId: "P1", instanceIds: [first.instanceId, second.instanceId, third.instanceId] }).state;
    expect(state.players.P2.minions).toHaveLength(0);
    // 三名毀滅者的死亡之聲現在依場上順序自動結算，各恢復 1 HP。
    expect(state.players.P2.heroHp).toBe(29);
  });

  it("加拉德可以少於3個目標時只消滅已選目標", () => {
    let state = mainState();
    state.players.P1.hand = [];
    const first = putCard(state, "P2", "TOKEN_MACHINE_DESTROYER", "MINION", "first");
    const second = putCard(state, "P2", "TOKEN_MACHINE_DESTROYER", "MINION", "second");
    const third = putCard(state, "P2", "TOKEN_MACHINE_DESTROYER", "MINION", "third");
    const gallard = putCard(state, "P1", "ALLIANCE_012", "HAND", "gallard-up-to");
    state = applyAction(state, { type: "PLAY_CARD", playerId: "P1", instanceId: gallard.instanceId }).state;
    state = applyAction(state, { type: "SELECT_EFFECT_CARDS", playerId: "P1", instanceIds: [first.instanceId, second.instanceId] }).state;
    expect(state.players.P2.minions.map((card) => card.instanceId)).toEqual([third.instanceId]);
  });
});
