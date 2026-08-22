import { describe, expect, it } from "vitest";
import { getCardDefinition } from "../../src/game/cards/cardRegistry";
import { applyAction } from "../../src/game/engine/gameEngine";
import { mainState, putCard } from "../helpers";

describe("龍魂騎士", () => {
  it("返回原始費用7以上龍族時抽2張，之後獨立增加最大水晶", () => {
    let state = mainState();
    state.players.P1.hand = [];
    const knight = putCard(state, "P1", "DRAGON_002", "HAND", "play");
    const returned = putCard(state, "P1", "DRAGON_012", "HAND", "return");
    const deckBefore = state.players.P1.deck.length;
    const seedBefore = state.rngSeed;

    state = applyAction(state, { type: "PLAY_CARD", playerId: "P1", instanceId: knight.instanceId }).state;
    expect(state.pendingChoice?.type).toBe("EFFECT_CARDS");
    if (state.pendingChoice?.type !== "EFFECT_CARDS") throw new Error("expected return choice");
    expect(state.pendingChoice.candidateInstanceIds).toEqual([returned.instanceId]);
    state = applyAction(state, { type: "SELECT_EFFECT_CARDS", playerId: "P1", instanceIds: [returned.instanceId] }).state;

    expect(state.players.P1.hand.some((card) => card.instanceId === returned.instanceId)).toBe(false);
    expect(state.players.P1.deck.some((card) => card.instanceId === returned.instanceId)).toBe(true);
    expect(state.players.P1.deck).toHaveLength(deckBefore - 1);
    expect(state.rngSeed).not.toBe(seedBefore);
    expect(state.players.P1.maxMana).toBe(10);
  });

  it("返回原始費用低於7的其他龍族時只抽1張", () => {
    let state = mainState();
    state.players.P1.hand = [];
    const knight = putCard(state, "P1", "DRAGON_002", "HAND", "play-low");
    const returned = putCard(state, "P1", "DRAGON_003", "HAND", "return-low");
    const deckBefore = state.players.P1.deck.length;
    const seedBefore = state.rngSeed;

    state = applyAction(state, { type: "PLAY_CARD", playerId: "P1", instanceId: knight.instanceId }).state;
    state = applyAction(state, { type: "SELECT_EFFECT_CARDS", playerId: "P1", instanceIds: [returned.instanceId] }).state;

    expect(state.players.P1.hand.some((card) => card.instanceId === returned.instanceId)).toBe(false);
    expect(state.players.P1.deck.some((card) => card.instanceId === returned.instanceId)).toBe(true);
    expect(state.players.P1.deck).toHaveLength(deckBefore);
    expect(state.rngSeed).not.toBe(seedBefore);
    expect(state.players.P1.maxMana).toBe(10);
  });

  it("手牌沒有其他龍族手下時跳過返回及抽牌，但仍增加最大水晶", () => {
    let state = mainState();
    state.players.P1.hand = [];
    const knight = putCard(state, "P1", "DRAGON_002", "HAND", "self");
    const deckBefore = state.players.P1.deck.length;
    state = applyAction(state, { type: "PLAY_CARD", playerId: "P1", instanceId: knight.instanceId }).state;
    expect(state.pendingChoice).toBeUndefined();
    expect(state.players.P1.minions.some((card) => card.instanceId === knight.instanceId)).toBe(true);
    expect(state.players.P1.hand.some((card) => card.instanceId === knight.instanceId)).toBe(false);
    expect(state.players.P1.deck).toHaveLength(deckBefore);
    expect(state.players.P1.maxMana).toBe(10);
  });
});

describe("資料驅動檢索", () => {
  it("圣印龍由玩家指定牌庫法術，加入手牌後洗牌", () => {
    let state = mainState();
    state.players.P1.hand = [];
    const dragon = putCard(state, "P1", "DRAGON_006", "HAND", "search");
    const spell = state.players.P1.deck.find((card) => getCardDefinition(card.definitionId).cardType === "SPELL")!;
    state = applyAction(state, { type: "PLAY_CARD", playerId: "P1", instanceId: dragon.instanceId }).state;
    state = applyAction(state, { type: "SELECT_EFFECT_CARDS", playerId: "P1", instanceIds: [spell.instanceId] }).state;
    expect(state.players.P1.hand.some((card) => card.instanceId === spell.instanceId)).toBe(true);
    expect(state.log.some((entry) => entry.message === "P1 完成檢索後洗牌")).toBe(true);
  });

  it("瑪格諾利亞先獲得審判者裁決，再檢索法術", () => {
    let state = mainState();
    state.players.P1.hand = [];
    const dragon = putCard(state, "P1", "DRAGON_007", "HAND", "judgment");
    const spell = state.players.P1.deck.find((card) => getCardDefinition(card.definitionId).cardType === "SPELL")!;
    state = applyAction(state, { type: "PLAY_CARD", playerId: "P1", instanceId: dragon.instanceId }).state;
    expect(state.players.P1.hand.some((card) => card.definitionId === "TOKEN_DRAGON_JUDGMENT")).toBe(true);
    state = applyAction(state, { type: "SELECT_EFFECT_CARDS", playerId: "P1", instanceIds: [spell.instanceId] }).state;
    expect(state.players.P1.hand.some((card) => card.instanceId === spell.instanceId)).toBe(true);
  });
});
