import { describe, expect, it } from "vitest";
import { applyAction } from "../../src/game/engine/gameEngine";
import { enqueueStateBasedEffectSummons } from "../../src/game/engine/effectSummonEngine";
import { resolvePendingEffects } from "../../src/game/engine/effectEngine";
import { searchDeckCard } from "../../src/game/engine/searchEngine";
import { drawCard } from "../../src/game/engine/turnEngine";
import { destroyMinion, moveCard } from "../../src/game/engine/zoneEngine";
import { getCardDefinition } from "../../src/game/cards/cardRegistry";
import { mainState, putCard } from "../helpers";

function putInDeck(state: ReturnType<typeof mainState>, suffix: string) {
  const card = putCard(state, "P1", "ALLIANCE_013", "HAND", suffix);
  moveCard(state, card, "DECK", "TEST_SETUP");
  return card;
}

describe("革命戰線 銀彈克加魯", () => {
  it("是聯盟牌組中的3張3費3/3人類軍隊手下", () => {
    expect(getCardDefinition("ALLIANCE_013")).toMatchObject({
      name: "革命戰線 銀彈克加魯",
      faction: "ALLIANCE",
      originalCost: 3,
      attack: 3,
      health: 3,
      deckCount: 3,
      subtype: ["HUMAN", "ARMY"],
    });
  });

  it("協作10時經檢索上手會提示效果召喚，確認後戰吼只指定敵方手下造成3點傷害", () => {
    let state = mainState();
    state.players.P1.hand = [];
    state.players.P1.deck = [];
    state.players.P1.summonedThisGame = 10;
    const kangaroo = putInDeck(state, "searched");
    const enemy = putCard(state, "P2", "DRAGON_001", "MINION", "enemy");
    const friendly = putCard(state, "P1", "DRAGON_001", "MINION", "friendly");

    searchDeckCard(state, "P1", kangaroo.instanceId);
    enqueueStateBasedEffectSummons(state, "P1");
    resolvePendingEffects(state);
    expect(state.pendingChoice).toMatchObject({ type: "EFFECT_SUMMON_CONFIRM", sourceInstanceId: kangaroo.instanceId });

    state = applyAction(state, { type: "CONFIRM_EFFECT_SUMMON", playerId: "P1" }).state;
    expect(state.players.P1.minions.some((card) => card.instanceId === kangaroo.instanceId)).toBe(true);
    expect(state.pendingChoice).toMatchObject({ type: "EFFECT_CARDS", candidateInstanceIds: [enemy.instanceId] });
    expect(state.pendingChoice?.type === "EFFECT_CARDS" && state.pendingChoice.candidateInstanceIds).not.toContain(friendly.instanceId);

    state = applyAction(state, { type: "SELECT_EFFECT_CARDS", playerId: "P1", instanceIds: [enemy.instanceId] }).state;
    expect(enemy.currentHealth).toBe(2);
  });

  it("通常抽牌不觸發；協作未達10時以其他方式上手也不觸發", () => {
    for (const [collaboration, reason] of [[10, "NORMAL_DRAW"], [9, "EFFECT:TEST"]] as const) {
      const state = mainState();
      state.players.P1.hand = [];
      state.players.P1.deck = [];
      state.players.P1.summonedThisGame = collaboration;
      const kangaroo = putInDeck(state, `${collaboration}-${reason}`);
      drawCard(state, "P1", reason);
      enqueueStateBasedEffectSummons(state, "P1");
      resolvePendingEffects(state);
      expect(state.players.P1.hand.some((card) => card.instanceId === kangaroo.instanceId)).toBe(true);
      expect(state.pendingChoice).toBeUndefined();
    }
  });

  it("協作10時由效果抽牌上手也會效果召喚，死亡之聲抽1張牌", () => {
    let state = mainState();
    state.players.P1.hand = [];
    state.players.P1.deck = [];
    state.players.P1.summonedThisGame = 10;
    const filler = putCard(state, "P1", "ALLIANCE_001", "HAND", "deathrattle-draw");
    moveCard(state, filler, "DECK", "TEST_SETUP");
    const kangaroo = putInDeck(state, "effect-draw");

    drawCard(state, "P1", "EFFECT:TEST");
    enqueueStateBasedEffectSummons(state, "P1");
    resolvePendingEffects(state);
    expect(state.pendingChoice).toMatchObject({ type: "EFFECT_SUMMON_CONFIRM", sourceInstanceId: kangaroo.instanceId });
    state = applyAction(state, { type: "CONFIRM_EFFECT_SUMMON", playerId: "P1" }).state;
    expect(state.players.P1.minions.some((card) => card.instanceId === kangaroo.instanceId)).toBe(true);
    expect(state.pendingChoice).toBeUndefined();

    const summonedKangaroo = state.players.P1.minions.find((card) => card.instanceId === kangaroo.instanceId);
    expect(summonedKangaroo).toBeDefined();
    destroyMinion(state, summonedKangaroo!, "TEST_DESTROY");
    resolvePendingEffects(state);
    expect(state.players.P1.hand.some((card) => card.instanceId === filler.instanceId)).toBe(true);
  });
});
