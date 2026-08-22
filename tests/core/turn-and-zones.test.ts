import { describe, expect, it } from "vitest";
import { applyAction } from "../../src/game/engine/gameEngine";
import { drawCard } from "../../src/game/engine/turnEngine";
import { createInitialGame } from "../../src/game/state/createInitialGame";
import { mainState, putCard } from "../helpers";

describe("换牌与回合", () => {
  it("换牌 0 张不需要实验配置", () => {
    const state = createInitialGame({ shuffle: false });
    const result = applyAction(state, { type: "MULLIGAN", playerId: "P1", instanceIds: [] });
    expect(result.error).toBeUndefined();
    expect(result.state.players.P1.mulliganDone).toBe(true);
  });

  it("先抽等量替换牌，再将换出牌加入牌库并洗牌", () => {
    let state = createInitialGame({ shuffle: false });
    const returnedId = state.players.P1.hand[0].instanceId;
    state = applyAction(state, { type: "MULLIGAN", playerId: "P1", instanceIds: [returnedId] }).state;
    const returnLog = state.log.findIndex((entry) => entry.data?.instanceId === returnedId && entry.data?.reason === "MULLIGAN_RETURN");
    const replacementLog = state.log.findIndex((entry) => entry.data?.reason === "MULLIGAN_REPLACEMENT");
    expect(returnLog).toBeGreaterThan(-1);
    expect(replacementLog).toBeLessThan(returnLog);
    expect(state.players.P1.hand.some((card) => card.instanceId === returnedId)).toBe(false);
    state = applyAction(state, { type: "MULLIGAN", playerId: "P2", instanceIds: [] }).state;
    expect(state.phase).toBe("MAIN");
    expect(state.turnNumber).toBe(1);
    expect(state.players.P1).toMatchObject({ maxMana: 1, mana: 1 });
    expect(state.players.P1.hand).toHaveLength(5);
    expect(state.log.filter((entry) => entry.type === "PHASE").slice(-4).map((entry) => entry.message)).toEqual(["DRAW", "COUNTDOWN", "GROWTH", "MAIN"]);
  });

  it("后攻第一次正常抽牌抽 2 并获得幸運幣", () => {
    let state = createInitialGame({ shuffle: false });
    state = applyAction(state, { type: "MULLIGAN", playerId: "P1", instanceIds: [] }).state;
    state = applyAction(state, { type: "MULLIGAN", playerId: "P2", instanceIds: [] }).state;
    const before = state.players.P2.hand.length;
    state = applyAction(state, { type: "END_TURN", playerId: "P1" }).state;
    expect(state.activePlayerId).toBe("P2");
    expect(state.players.P2.hand.length).toBe(before + 3);
    expect(state.players.P2.hand.some((card) => card.definitionId === "TOKEN_COIN")).toBe(true);
    expect(state.players.P2.maxMana).toBe(1);
    const p1BeforeSecondTurn = state.players.P1.hand.length;
    state = applyAction(state, { type: "END_TURN", playerId: "P2" }).state;
    expect(state.players.P1.hand.length).toBe(p1BeforeSecondTurn + 1);
  });

  it("换牌只能选择 0～4 张", () => {
    const state = createInitialGame({ shuffle: false });
    const fifth = state.players.P1.deck.pop()!;
    fifth.zone = "HAND";
    state.players.P1.hand.push(fifth);
    const result = applyAction(state, { type: "MULLIGAN", playerId: "P1", instanceIds: state.players.P1.hand.map((card) => card.instanceId) });
    expect(result.error).toMatchObject({ code: "INVALID_ACTION", message: "换牌只能选择 0～4 张起始手牌" });
  });
});

describe("抽牌与手牌上限", () => {
  it("回合中可保留第 11 张牌，回合末才要求选择弃牌", () => {
    let state = mainState();
    while (state.players.P1.hand.length < 10) drawCard(state, "P1", "TEST");
    drawCard(state, "P1", "TEST");
    expect(state.players.P1.hand).toHaveLength(11);
    state = applyAction(state, { type: "END_TURN", playerId: "P1" }).state;
    expect(state.phase).toBe("HAND_LIMIT");
    expect(state.pendingChoice).toMatchObject({ playerId: "P1", count: 1 });
    const discardId = state.players.P1.hand[0].instanceId;
    state = applyAction(state, { type: "SELECT_DISCARD", playerId: "P1", instanceIds: [discardId] }).state;
    expect(state.players.P1.hand).toHaveLength(10);
    expect(state.players.P1.graveyard.some((card) => card.instanceId === discardId)).toBe(true);
  });

  it("空牌库再次抽牌立即败北且没有疲劳伤害", () => {
    const state = mainState();
    state.players.P1.deck = [];
    const hp = state.players.P1.heroHp;
    drawCard(state, "P1");
    expect(state.phase).toBe("GAME_OVER");
    expect(state.winner).toBe("P2");
    expect(state.loseReason).toBe("DECK_OUT");
    expect(state.players.P1.heroHp).toBe(hp);
  });

  it("幸運幣只增加可用水晶，不增加最大水晶", () => {
    let state = mainState();
    const coin = putCard(state, "P1", "TOKEN_COIN", "HAND", "coin");
    state.players.P1.mana = 2;
    state.players.P1.maxMana = 2;
    state = applyAction(state, { type: "PLAY_CARD", playerId: "P1", instanceId: coin.instanceId }).state;
    expect(state.players.P1.mana).toBe(3);
    expect(state.players.P1.maxMana).toBe(2);
    expect(state.players.P1.extraDeck.some((card) => card.instanceId === coin.instanceId)).toBe(true);
  });
});
