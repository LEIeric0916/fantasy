import { describe, expect, it } from "vitest";
import { getCardDefinition, getMainDeckDefinitions } from "../../src/game/cards/cardRegistry";
import { dealDamageToHero } from "../../src/game/engine/damageEngine";
import { resolveEffects, resolvePendingEffects } from "../../src/game/engine/effectEngine";
import { refreshCardCost } from "../../src/game/engine/costEngine";
import { destroyMinion, moveCard } from "../../src/game/engine/zoneEngine";
import { createCardInstance } from "../../src/game/state/CardInstance";
import { mainState, putCard } from "../helpers";

function graveCards(state: ReturnType<typeof mainState>, count: number): void {
  for (let index = 0; index < count; index += 1) {
    const card = createCardInstance(getCardDefinition("NEUTRAL_002"), "P1", "GRAVEYARD", `grave-${index}`);
    state.players.P1.graveyard.push(card);
  }
}

describe("邪神教牌組", () => {
  it("載入40張主牌及3張衍生牌", () => {
    expect(getMainDeckDefinitions("CULT").reduce((sum, card) => sum + card.deckCount, 0)).toBe(40);
    expect(getCardDefinition("CULT_007").deckCount).toBe(2);
    expect(["TOKEN_CULT_GOD", "TOKEN_CULT_HEART", "TOKEN_CULT_BRAIN"].map((id) => getCardDefinition(id).generatedOnly)).toEqual([true, true, true]);
    expect(getCardDefinition("TOKEN_CULT_HEART")).toMatchObject({ cardType: "MINION", attack: 0, health: 2 });
  });

  it("邪神與召集者依棄堆正確減費", () => {
    const state = mainState();
    graveCards(state, 7);
    const god = putCard(state, "P1", "CULT_006", "HAND", "god");
    const summoner = putCard(state, "P1", "CULT_008", "HAND", "summoner");
    state.players.P1.graveyard[0].definitionId = "CULT_010";
    expect(refreshCardCost(state, "P1", god)).toBe(18);
    expect(refreshCardCost(state, "P1", summoner)).toBe(6);
  });

  it("卡牌進棄堆會減少神降之儀倒數，歸零召喚神", () => {
    const state = mainState();
    const ritual = putCard(state, "P1", "CULT_015", "FIELD", "ritual");
    ritual.counters.countdown = 1;
    const milled = createCardInstance(getCardDefinition("CULT_001"), "P1", "DECK", "milled");
    state.players.P1.deck.push(milled);
    moveCard(state, milled, "GRAVEYARD", "TEST_MILL");
    resolvePendingEffects(state);
    expect(state.players.P1.minions.some((card) => card.definitionId === "TOKEN_CULT_GOD")).toBe(true);
  });

  it("被遺忘的存在從場外送入棄堆後召喚並恢復4點生命", () => {
    const state = mainState();
    state.players.P1.heroHp = 20;
    const forgotten = createCardInstance(getCardDefinition("CULT_004"), "P1", "DECK", "forgotten");
    state.players.P1.deck.push(forgotten);
    moveCard(state, forgotten, "GRAVEYARD", "TEST_MILL");
    resolvePendingEffects(state);
    expect(forgotten.zone).toBe("MINION");
    expect(state.players.P1.heroHp).toBe(24);
  });

  it("邪神離場時召喚0/2心臟與大腦", () => {
    const state = mainState();
    const evilGod = putCard(state, "P1", "CULT_006", "MINION", "evil-god");
    destroyMinion(state, evilGod);
    resolvePendingEffects(state);
    expect(state.players.P1.minions.filter((card) => ["TOKEN_CULT_HEART", "TOKEN_CULT_BRAIN"].includes(card.definitionId))).toHaveLength(2);
  });

  it("神降使牌組清空成為勝利條件", () => {
    const state = mainState();
    state.players.P1.deck = [createCardInstance(getCardDefinition("CULT_001"), "P1", "DECK", "last")];
    const source = putCard(state, "P1", "CULT_010", "HAND", "descent");
    resolveEffects(state, "P1", source, getCardDefinition("CULT_010").effects!);
    resolveEffects(state, "P1", source, [{ type: "MILL_DECK", count: 1 }]);
    expect(state.winner).toBe("P1");
    expect(state.loseReason).toBe("DECK_EMPTY_WIN");
  });

  it("神的加護可把致命傷害替代為1血，第三次後離場", () => {
    const state = mainState();
    const protection = putCard(state, "P1", "CULT_018", "FIELD", "protection");
    state.players.P1.heroHp = 2;
    for (let index = 0; index < 15; index += 1) state.players.P1.deck.push(createCardInstance(getCardDefinition("CULT_001"), "P1", "DECK", `deck-${index}`));
    for (let use = 0; use < 3; use += 1) {
      dealDamageToHero(state, "P1", 9, "test");
      expect(state.players.P1.heroHp).toBe(1);
    }
    expect(protection.zone).toBe("GRAVEYARD");
    expect(state.phase).not.toBe("GAME_OVER");
  });
});
