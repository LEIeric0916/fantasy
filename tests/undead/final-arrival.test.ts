import { describe, expect, it } from "vitest";
import { getCardDefinition } from "../../src/game/cards/cardRegistry";
import { resolvePendingEffects } from "../../src/game/engine/effectEngine";
import { summonGeneratedField, summonGeneratedMinion } from "../../src/game/engine/summonEngine";
import { destroyMinion } from "../../src/game/engine/zoneEngine";
import { mainState, putCard } from "../helpers";

describe("黑暗之書 終末降臨", () => {
  it("載入兩張衍生牌及完整效果資料", () => {
    const book = getCardDefinition("TOKEN_UNDEAD_BOOK_FINAL_ARRIVAL");
    expect(book).toMatchObject({
      name: "黑暗之書 終末降臨",
      cardType: "FIELD",
      initialCounters: { countdown: 15 },
      maxCopiesOnField: 1,
      friendlyMinionDestroyedCountdownAura: { amount: 1, maxPerTurn: 1 },
    });
    expect(book.keywords).toEqual(expect.arrayContaining(["WARD", "SANCTUARY", "COUNTDOWN", "LAST_WORDS"]));

    const king = getCardDefinition("TOKEN_UNDEAD_FINAL_KING_HACHIGOKU");
    expect(king).toMatchObject({ name: "終末之王 八獄", originalCost: 10, attack: 10, health: 10 });
    expect(king.subtype).toContain("SPELLBEING");
    expect(king.keywords).toContain("TAUNT");
  });

  it("我方沒有末日之書時，入場後立即消失", () => {
    const state = mainState();
    expect(summonGeneratedField(state, "P1", "TOKEN_UNDEAD_BOOK_FINAL_ARRIVAL")).toBe(true);
    resolvePendingEffects(state);
    expect(state.players.P1.fields.some((card) => card.definitionId === "TOKEN_UNDEAD_BOOK_FINAL_ARRIVAL")).toBe(false);
    expect(state.players.P1.extraDeck.some((card) => card.definitionId === "TOKEN_UNDEAD_BOOK_FINAL_ARRIVAL")).toBe(true);
  });

  it("有末日之書時依當前回合數減少倒數，且同名卡最多存在1張", () => {
    const state = mainState();
    state.turnNumber = 4;
    putCard(state, "P1", "TOKEN_UNDEAD_DOOMSDAY_BOOK", "FIELD", "required-doom");
    expect(summonGeneratedField(state, "P1", "TOKEN_UNDEAD_BOOK_FINAL_ARRIVAL")).toBe(true);
    resolvePendingEffects(state);
    const book = state.players.P1.fields.find((card) => card.definitionId === "TOKEN_UNDEAD_BOOK_FINAL_ARRIVAL");
    expect(book?.counters.countdown).toBe(11);
    expect(summonGeneratedField(state, "P1", "TOKEN_UNDEAD_BOOK_FINAL_ARRIVAL")).toBe(false);
  });

  it("每回合只因我方手下被消滅減少1次倒數，歸零後召喚八獄並由原卡轉變", () => {
    const state = mainState();
    putCard(state, "P1", "TOKEN_UNDEAD_DOOMSDAY_BOOK", "FIELD", "required-doom");
    summonGeneratedField(state, "P1", "TOKEN_UNDEAD_BOOK_FINAL_ARRIVAL");
    resolvePendingEffects(state);
    const book = state.players.P1.fields.find((card) => card.definitionId === "TOKEN_UNDEAD_BOOK_FINAL_ARRIVAL")!;
    book.counters.countdown = 2;

    destroyMinion(state, putCard(state, "P1", "TOKEN_UNDEAD_SPIRIT", "MINION", "first"));
    expect(book.counters.countdown).toBe(1);
    destroyMinion(state, putCard(state, "P1", "TOKEN_UNDEAD_SPIRIT", "MINION", "second"));
    expect(book.counters.countdown).toBe(1);

    state.turnNumber += 1;
    destroyMinion(state, putCard(state, "P1", "TOKEN_UNDEAD_SPIRIT", "MINION", "third"));
    resolvePendingEffects(state);

    expect(state.players.P1.minions.some((card) => card.definitionId === "TOKEN_UNDEAD_FINAL_KING_HACHIGOKU")).toBe(true);
    expect(state.players.P1.fields.find((card) => card.instanceId === book.instanceId)?.definitionId).toBe("TOKEN_UNDEAD_DOOMSDAY_BOOK");
  });
});

describe("終末之王 八獄", () => {
  it("進場造成敵方全體5點傷害、恢復3HP，並以死靈術10傷害對手玩家", () => {
    const state = mainState();
    state.players.P1.heroHp = 20;
    state.players.P1.heroMaxHp = 30;
    state.players.P2.heroHp = 20;
    state.players.P1.resources.necromancy = 10;
    const survivor = putCard(state, "P2", "TOKEN_UNDEAD_PREACHER", "MINION", "survivor");
    putCard(state, "P2", "TOKEN_UNDEAD_GENERIC", "MINION", "destroyed");

    expect(summonGeneratedMinion(state, "P1", "TOKEN_UNDEAD_FINAL_KING_HACHIGOKU")).toBe(true);
    resolvePendingEffects(state);

    expect(survivor.currentHealth).toBe(1);
    expect(state.players.P2.minions).toHaveLength(1);
    expect(state.players.P1.heroHp).toBe(23);
    expect(state.players.P2.heroHp).toBe(15);
    expect(state.players.P1.resources.necromancy).toBe(0);
  });
});
