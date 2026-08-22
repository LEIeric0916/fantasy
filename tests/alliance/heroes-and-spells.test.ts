import { describe, expect, it } from "vitest";
import { applyAction } from "../../src/game/engine/gameEngine";
import { dealDamageToHero, dealDamageToMinion } from "../../src/game/engine/damageEngine";
import { resolvePendingEffects } from "../../src/game/engine/effectEngine";
import { destroyMinion } from "../../src/game/engine/zoneEngine";
import { mainState, putCard } from "../helpers";

describe("绝杰荣耀与联盟绝杰", () => {
  it("绝杰荣耀在协作20时费用为0，并以玩家整场记录排除已取得绝杰", () => {
    let state = mainState();
    state.players.P1.hand = [];
    state.players.P1.summonedThisGame = 20;
    const first = putCard(state, "P1", "TOKEN_ALLIANCE_HEROIC_GLORY", "HAND", "first");
    state = applyAction(state, { type: "PLAY_CARD", playerId: "P1", instanceId: first.instanceId }).state;
    expect(state.players.P1.mana).toBe(10);
    state = applyAction(state, { type: "SELECT_EFFECT_OPTION", playerId: "P1", optionId: "DRAW" }).state;
    expect(state.pendingChoice).toMatchObject({ type: "EFFECT_OPTION" });
    state = applyAction(state, { type: "SELECT_EFFECT_OPTION", playerId: "P1", optionId: "TOKEN_ALLIANCE_HERO_AUGUSTIN" }).state;
    expect(state.players.P1.choiceHistory.HEROIC_GLORY_ACQUIRED).toEqual(["TOKEN_ALLIANCE_HERO_AUGUSTIN"]);

    const second = putCard(state, "P1", "TOKEN_ALLIANCE_HEROIC_GLORY", "HAND", "second");
    state = applyAction(state, { type: "PLAY_CARD", playerId: "P1", instanceId: second.instanceId }).state;
    state = applyAction(state, { type: "SELECT_EFFECT_OPTION", playerId: "P1", optionId: "DRAW" }).state;
    if (state.pendingChoice?.type !== "EFFECT_OPTION") throw new Error("expected hero choice");
    expect(state.pendingChoice.options.map((option) => option.id)).not.toContain("TOKEN_ALLIANCE_HERO_AUGUSTIN");
  });

  it("奥斯但丁死亡之声从额外区返回手牌", () => {
    const state = mainState();
    const hero = putCard(state, "P1", "TOKEN_ALLIANCE_HERO_AUGUSTIN", "MINION", "return");
    destroyMinion(state, hero, "TEST");
    resolvePendingEffects(state);
    expect(state.players.P1.hand.some((card) => card.instanceId === hero.instanceId)).toBe(true);
    expect(state.players.P1.extraDeck.some((card) => card.instanceId === hero.instanceId)).toBe(false);
  });

  it("瓦伦泰回合结束永久赋予场上手下伤害上限4，并给予玩家圣盾", () => {
    let state = mainState();
    putCard(state, "P1", "TOKEN_ALLIANCE_HERO_VALENTINE", "MINION", "valentine");
    const ally = putCard(state, "P1", "TOKEN_MACHINE_DESTROYER", "MINION", "ally");
    state = applyAction(state, { type: "END_TURN", playerId: "P1" }).state;
    const currentAlly = state.players.P1.minions.find((card) => card.instanceId === ally.instanceId)!;
    expect(dealDamageToMinion(state, currentAlly, 12, "test", "EFFECT")).toBe(4);
    expect(dealDamageToHero(state, "P1", 8, "shield")).toBe(0);
    expect(dealDamageToHero(state, "P1", 2, "after")).toBe(2);
  });

  it("空袭选择完成后返回额外区且仍作为法术使用", () => {
    let state = mainState();
    state.players.P1.hand = [];
    const airstrike = putCard(state, "P1", "TOKEN_ALLIANCE_AIRSTRIKE", "HAND", "airstrike");
    state = applyAction(state, { type: "PLAY_CARD", playerId: "P1", instanceId: airstrike.instanceId }).state;
    expect(state.players.P1.cardsPlayedThisTurn).toBe(1);
    state = applyAction(state, { type: "SELECT_EFFECT_OPTION", playerId: "P1", optionId: "HERO" }).state;
    expect(state.players.P2.heroHp).toBe(28);
    expect(state.players.P1.extraDeck.some((card) => card.instanceId === airstrike.instanceId)).toBe(true);
  });
});
