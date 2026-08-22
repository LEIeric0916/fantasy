import { describe, expect, it } from "vitest";
import { getCardDefinition } from "../../src/game/cards/cardRegistry";
import { applyAction } from "../../src/game/engine/gameEngine";
import { mainState, putCard } from "../helpers";

describe("龙魂骑士", () => {
  it("返回原始费用7以上龙族时抽2张，之后独立增加最大水晶", () => {
    let state = mainState();
    state.players.P1.hand = [];
    const knight = putCard(state, "P1", "DRAGON_002", "HAND", "play");
    const returned = putCard(state, "P1", "DRAGON_012", "MINION", "return");
    const deckBefore = state.players.P1.deck.length;

    state = applyAction(state, { type: "PLAY_CARD", playerId: "P1", instanceId: knight.instanceId }).state;
    expect(state.pendingChoice?.type).toBe("EFFECT_CARDS");
    state = applyAction(state, { type: "SELECT_EFFECT_CARDS", playerId: "P1", instanceIds: [returned.instanceId] }).state;

    expect(state.players.P1.hand.some((card) => card.instanceId === returned.instanceId)).toBe(true);
    expect(state.players.P1.deck).toHaveLength(deckBefore - 2);
    expect(state.players.P1.maxMana).toBe(11);
  });

  it("卡文没有写其他手下，因此可以指定自己；原始费用低于7时抽1张", () => {
    let state = mainState();
    state.players.P1.hand = [];
    const knight = putCard(state, "P1", "DRAGON_002", "HAND", "self");
    const deckBefore = state.players.P1.deck.length;
    state = applyAction(state, { type: "PLAY_CARD", playerId: "P1", instanceId: knight.instanceId }).state;
    state = applyAction(state, { type: "SELECT_EFFECT_CARDS", playerId: "P1", instanceIds: [knight.instanceId] }).state;
    expect(state.players.P1.minions).toHaveLength(0);
    expect(state.players.P1.hand.some((card) => card.instanceId === knight.instanceId)).toBe(true);
    expect(state.players.P1.deck).toHaveLength(deckBefore - 1);
    expect(state.players.P1.maxMana).toBe(11);
  });
});

describe("资料驱动检索", () => {
  it("圣印龙由玩家指定牌库法术，加入手牌后洗牌", () => {
    let state = mainState();
    state.players.P1.hand = [];
    const dragon = putCard(state, "P1", "DRAGON_006", "HAND", "search");
    const spell = state.players.P1.deck.find((card) => getCardDefinition(card.definitionId).cardType === "SPELL")!;
    state = applyAction(state, { type: "PLAY_CARD", playerId: "P1", instanceId: dragon.instanceId }).state;
    state = applyAction(state, { type: "SELECT_EFFECT_CARDS", playerId: "P1", instanceIds: [spell.instanceId] }).state;
    expect(state.players.P1.hand.some((card) => card.instanceId === spell.instanceId)).toBe(true);
    expect(state.log.some((entry) => entry.message === "P1 完成检索后洗牌")).toBe(true);
  });

  it("玛格诺利亚先获得审判者裁决，再检索法术", () => {
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
