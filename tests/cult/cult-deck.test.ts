import { describe, expect, it } from "vitest";
import { getCardDefinition, getMainDeckDefinitions } from "../../src/game/cards/cardRegistry";
import { dealDamageToHero } from "../../src/game/engine/damageEngine";
import { resolveEffects, resolvePendingEffects } from "../../src/game/engine/effectEngine";
import { refreshCardCost } from "../../src/game/engine/costEngine";
import { destroyMinion, moveCard } from "../../src/game/engine/zoneEngine";
import { createCardInstance } from "../../src/game/state/CardInstance";
import { mainState, putCard } from "../helpers";
import { applyAction } from "../../src/game/engine/gameEngine";
import { continueAfterCountdown } from "../../src/game/engine/turnEngine";

function graveCards(state: ReturnType<typeof mainState>, count: number): void {
  for (let index = 0; index < count; index += 1) {
    const card = createCardInstance(getCardDefinition("NEUTRAL_002"), "P1", "GRAVEYARD", `grave-${index}`);
    state.players.P1.graveyard.push(card);
  }
}

describe("邪神教牌組", () => {
  it("貪婪的代價0費直接扣1血再抽1，不要求捨棄手牌", () => {
    let state = mainState();
    state.players.P1.hand = [];
    state.players.P1.mana = 0;
    state.players.P1.heroHp = 20;
    state.players.P1.heroDivineShield = true;
    const source = putCard(state, "P1", "CULT_012", "HAND", "normal");
    const top = createCardInstance(getCardDefinition("NEUTRAL_002"), "P1", "DECK", "normal-draw");
    state.players.P1.deck = [top];
    const result = applyAction(state, { type: "PLAY_CARD", playerId: "P1", instanceId: source.instanceId });
    expect(result.error).toBeUndefined();
    state = result.state;
    expect(state.players.P1.heroHp).toBe(19);
    expect(state.players.P1.heroDivineShield).toBe(true);
    expect(state.players.P1.hand.map((card) => card.instanceId)).toEqual([top.instanceId]);
    expect(state.pendingChoice).toBeUndefined();
  });

  it("貪婪的代價轉費2先棄牌頂2張，再抽接下來的1張，不扣生命", () => {
    let state = mainState();
    state.players.P1.hand = [];
    state.players.P1.mana = 2;
    const source = putCard(state, "P1", "CULT_012", "HAND", "alternate");
    const deck = Array.from({ length: 3 }, (_, i) => createCardInstance(getCardDefinition("NEUTRAL_002"), "P1", "DECK", `alternate-${i}`));
    state.players.P1.deck = deck;
    const result = applyAction(state, { type: "PLAY_ALTERNATE", playerId: "P1", instanceId: source.instanceId });
    expect(result.error).toBeUndefined();
    state = result.state;
    expect(state.players.P1.mana).toBe(0);
    expect(state.players.P1.heroHp).toBe(30);
    expect(state.players.P1.hand.map((card) => card.instanceId)).toEqual([deck[0].instanceId]);
    expect(state.players.P1.graveyard.map((card) => card.instanceId)).toEqual(expect.arrayContaining([deck[1].instanceId, deck[2].instanceId]));
    expect(state.players.P1.deck).toHaveLength(0);
    expect(state.pendingChoice).toBeUndefined();
  });

  it("貪婪的代價轉費不足2顆水晶時不能使用", () => {
    const state = mainState();
    state.players.P1.mana = 1;
    const source = putCard(state, "P1", "CULT_012", "HAND", "insufficient");
    const result = applyAction(state, { type: "PLAY_ALTERNATE", playerId: "P1", instanceId: source.instanceId });
    expect(result.error).toBeDefined();
    expect(result.state.players.P1.hand.some((card) => card.instanceId === source.instanceId)).toBe(true);
    expect(result.state.players.P1.mana).toBe(1);
  });

  it("貪婪的代價扣血歸零立即落敗，不繼續抽牌", () => {
    const state = mainState();
    state.players.P1.heroHp = 1;
    const source = putCard(state, "P1", "CULT_012", "HAND", "lethal");
    const top = createCardInstance(getCardDefinition("NEUTRAL_002"), "P1", "DECK", "not-drawn");
    state.players.P1.deck = [top];
    const result = applyAction(state, { type: "PLAY_CARD", playerId: "P1", instanceId: source.instanceId });
    expect(result.error).toBeUndefined();
    expect(result.state.winner).toBe("P2");
    expect(result.state.players.P1.heroHp).toBe(0);
    expect(result.state.players.P1.deck[0].instanceId).toBe(top.instanceId);
  });

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
    expect(ritual.counters.countdown).toBe(20);
    for (let index = 0; index < 20; index += 1) {
      const milled = createCardInstance(getCardDefinition("NEUTRAL_002"), "P1", "DECK", `milled-${index}`);
      state.players.P1.deck.push(milled);
      moveCard(state, milled, "GRAVEYARD", "TEST_MILL");
      resolvePendingEffects(state);
      if (index < 19) {
        expect(ritual.counters.countdown).toBe(19 - index);
        expect(state.players.P1.minions.some((card) => card.definitionId === "TOKEN_CULT_GOD")).toBe(false);
      }
    }
    expect(state.players.P1.minions.some((card) => card.definitionId === "TOKEN_CULT_GOD")).toBe(true);
  });

  it("神之祭祀生長抽1張牌，不把牌頂送入棄堆", () => {
    const state = mainState();
    putCard(state, "P1", "CULT_009", "FIELD", "sacrifice");
    const top = createCardInstance(getCardDefinition("NEUTRAL_002"), "P1", "DECK", "growth-top");
    state.players.P1.deck = [top];
    const handCount = state.players.P1.hand.length;
    continueAfterCountdown(state);
    expect(state.players.P1.hand).toHaveLength(handCount + 1);
    expect(top.zone).toBe("HAND");
    expect(state.players.P1.graveyard).toHaveLength(0);
  });

  for (const zone of ["MINION", "FIELD"] as const) {
    for (const edge of ["LEFT", "RIGHT"] as const) {
      it(`教會的暗面可選擇${zone}區的${edge}端，不影響另一區`, () => {
        let state = mainState();
        const source = putCard(state, "P1", "CULT_016", "HAND", "dark-side");
        const minions = [putCard(state, "P2", "NEUTRAL_002", "MINION", "left"), putCard(state, "P2", "NEUTRAL_002", "MINION", "right")];
        const fields = [putCard(state, "P2", "CULT_009", "FIELD", "left"), putCard(state, "P2", "CULT_009", "FIELD", "right")];
        fields.forEach((card) => { card.keywords = []; });
        resolveEffects(state, "P1", source, getCardDefinition("CULT_016").effects!);
        expect(state.pendingChoice?.type).toBe("EFFECT_OPTION");
        const chosen = (zone === "MINION" ? minions : fields)[edge === "LEFT" ? 0 : 1];
        const result = applyAction(state, { type: "SELECT_EFFECT_OPTION", playerId: "P1", optionId: `${zone}_${edge}` });
        expect(result.error).toBeUndefined();
        state = result.state;
        expect(state.players.P2.removed.some((card) => card.instanceId === chosen.instanceId)).toBe(true);
        expect(zone === "MINION" ? state.players.P2.fields : state.players.P2.minions).toHaveLength(2);
        expect(zone === "MINION" ? state.players.P2.minions : state.players.P2.fields).toHaveLength(1);
      });
    }
  }

  it("教會的暗面被送入棄堆也可選擇立場區，無敵仍可阻擋", () => {
    let state = mainState();
    const field = putCard(state, "P2", "CULT_009", "FIELD", "protected");
    const source = putCard(state, "P1", "CULT_016", "HAND", "discarded");
    moveCard(state, source, "GRAVEYARD", "DISCARD");
    resolvePendingEffects(state);
    expect(state.pendingChoice?.type).toBe("EFFECT_OPTION");
    state = applyAction(state, { type: "SELECT_EFFECT_OPTION", playerId: "P1", optionId: "FIELD_LEFT" }).state;
    expect(state.players.P2.fields.some((card) => card.instanceId === field.instanceId)).toBe(true);
  });

  for (const from of ["HAND", "DECK", "MINION"] as const) {
    for (const graveCount of [18, 19]) {
      it(`掠奪者從${from}送入棄堆，原有${graveCount}張時依20門檻觸發`, () => {
        const state = mainState();
        graveCards(state, graveCount);
        const source = from === "DECK"
          ? createCardInstance(getCardDefinition("CULT_005"), "P1", "DECK", "plunderer")
          : putCard(state, "P1", "CULT_005", from, "plunderer");
        const top = createCardInstance(getCardDefinition("NEUTRAL_002"), "P1", "DECK", "milled-top");
        state.players.P1.deck = from === "DECK" ? [top, source] : [top];
        moveCard(state, source, "GRAVEYARD", "DISCARD_OR_MILL");
        resolvePendingEffects(state);
        const triggers = from !== "MINION" && graveCount === 19;
        expect(top.zone).toBe(triggers ? "GRAVEYARD" : "DECK");
        expect(state.pendingChoice?.type).toBe(triggers ? "EFFECT_CARDS" : undefined);
        expect(state.players.P1.minions.some((card) => card.instanceId === source.instanceId)).toBe(false);
      });
    }
  }

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
