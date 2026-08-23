import { describe, expect, it } from "vitest";
import { applyAction } from "../../src/game/engine/gameEngine";
import { resolvePendingEffects } from "../../src/game/engine/effectEngine";
import { reviveMinion } from "../../src/game/engine/reviveEngine";
import { moveCard } from "../../src/game/engine/zoneEngine";
import { mainState, putCard } from "../helpers";

describe("黑暗魔人 瑞瑟特", () => {
  it("由玩家從棄堆指定原始費用3以下手下復活", () => {
    let state = mainState();
    state.players.P1.hand = [];
    const target = putCard(state, "P1", "UNDEAD_002", "MINION", "grave-target");
    moveCard(state, target, "GRAVEYARD", "TEST_SETUP");
    const source = putCard(state, "P1", "UNDEAD_005", "HAND", "reviver");
    state = applyAction(state, { type: "PLAY_CARD", playerId: "P1", instanceId: source.instanceId }).state;
    state = applyAction(state, { type: "SELECT_EFFECT_CARDS", playerId: "P1", instanceIds: [target.instanceId] }).state;
    expect(state.players.P1.minions.some((card) => card.instanceId === target.instanceId)).toBe(true);
    expect(target.currentHealth).toBe(target.maxHealth);
  });
});

describe("黑暗之書選擇與入場", () => {
  it("第一張不朽典錄進場時不提示尚無舊同名卡", () => {
    let state = mainState();
    state.players.P1.hand = [];
    const source = putCard(state, "P1", "UNDEAD_006", "HAND", "silent-immortal-book");
    state = applyAction(state, { type: "PLAY_CARD", playerId: "P1", instanceId: source.instanceId }).state;
    state = applyAction(state, { type: "SELECT_EFFECT_OPTION", playerId: "P1", optionId: "TOKEN_UNDEAD_BOOK_IMMORTAL" }).state;
    expect(state.effectNotices).toEqual([]);
  });

  it("達克斯特由玩家選擇書種；復仇典錄入場使死靈數+5", () => {
    let state = mainState();
    state.players.P1.hand = [];
    const source = putCard(state, "P1", "UNDEAD_006", "HAND", "choose-book");
    state = applyAction(state, { type: "PLAY_CARD", playerId: "P1", instanceId: source.instanceId }).state;
    expect(state.pendingChoice).toMatchObject({ type: "EFFECT_OPTION" });
    state = applyAction(state, { type: "SELECT_EFFECT_OPTION", playerId: "P1", optionId: "TOKEN_UNDEAD_BOOK_REVENGE" }).state;
    expect(state.players.P1.fields.map((card) => card.definitionId)).toContain("TOKEN_UNDEAD_BOOK_REVENGE");
    expect(state.players.P1.resources.necromancy).toBe(5);
  });

  it("再次生成同種書時舊書消失並抽1張，新書仍正常執行入場效果", () => {
    let state = mainState();
    state.players.P1.hand = [];
    const old = putCard(state, "P1", "TOKEN_UNDEAD_BOOK_REVENGE", "FIELD", "old");
    const source = putCard(state, "P1", "UNDEAD_006", "HAND", "replace-book");
    const deckBefore = state.players.P1.deck.length;
    state = applyAction(state, { type: "PLAY_CARD", playerId: "P1", instanceId: source.instanceId }).state;
    state = applyAction(state, { type: "SELECT_EFFECT_OPTION", playerId: "P1", optionId: "TOKEN_UNDEAD_BOOK_REVENGE" }).state;
    expect(state.players.P1.extraDeck.some((card) => card.instanceId === old.instanceId)).toBe(true);
    expect(state.players.P1.deck).toHaveLength(deckBefore - 1);
    expect(state.players.P1.resources.necromancy).toBe(5);
    expect(state.players.P1.fields.filter((card) => card.definitionId === "TOKEN_UNDEAD_BOOK_REVENGE")).toHaveLength(1);
  });

  it("達克斯特被其他卡牌復活時不觸發戰吼，只觸發復活效果", () => {
    const state = mainState();
    const source = putCard(state, "P1", "UNDEAD_006", "MINION", "revive-trigger");
    moveCard(state, source, "GRAVEYARD", "TEST_SETUP");
    reviveMinion(state, "P1", source);
    resolvePendingEffects(state);
    expect(state.pendingChoice).toBeUndefined();
    expect(state.players.P1.fields.map((card) => card.definitionId)).toContain("TOKEN_UNDEAD_BOOK_IMMORTAL");
    expect(state.players.P1.fields).toHaveLength(1);
  });

  it("阿爾德先召喚所選書，再把新書計入總數召喚等量末日騎士", () => {
    let state = mainState();
    state.players.P1.hand = [];
    putCard(state, "P1", "TOKEN_UNDEAD_BOOK_DOOM_PRELUDE", "FIELD", "existing");
    const source = putCard(state, "P1", "UNDEAD_007", "HAND", "count-books");
    state = applyAction(state, { type: "PLAY_CARD", playerId: "P1", instanceId: source.instanceId }).state;
    state = applyAction(state, { type: "SELECT_EFFECT_OPTION", playerId: "P1", optionId: "TOKEN_UNDEAD_BOOK_IMMORTAL" }).state;
    expect(state.players.P1.fields).toHaveLength(2);
    expect(state.players.P1.minions.filter((card) => card.definitionId === "TOKEN_UNDEAD_DOOM_KNIGHT")).toHaveLength(2);
  });
});
