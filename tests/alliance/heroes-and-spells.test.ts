import { describe, expect, it } from "vitest";
import { applyAction } from "../../src/game/engine/gameEngine";
import { dealDamageToHero, dealDamageToMinion } from "../../src/game/engine/damageEngine";
import { resolvePendingEffects } from "../../src/game/engine/effectEngine";
import { destroyMinion } from "../../src/game/engine/zoneEngine";
import { mainState, putCard } from "../helpers";

describe("絕杰榮耀與聯盟絕杰", () => {
  it("絕杰榮耀未達協作20時，加入手牌的絕杰維持原費用", () => {
    let state = mainState();
    state.players.P1.hand = [];
    state.players.P1.summonedThisGame = 19;
    const glory = putCard(state, "P1", "TOKEN_ALLIANCE_HEROIC_GLORY", "HAND", "below-rally");
    state = applyAction(state, { type: "PLAY_CARD", playerId: "P1", instanceId: glory.instanceId }).state;
    state = applyAction(state, { type: "SELECT_EFFECT_OPTION", playerId: "P1", optionId: "DRAW" }).state;
    state = applyAction(state, { type: "SELECT_EFFECT_OPTION", playerId: "P1", optionId: "TOKEN_ALLIANCE_HERO_AUGUSTIN" }).state;
    const acquired = state.players.P1.hand.find((card) => card.definitionId === "TOKEN_ALLIANCE_HERO_AUGUSTIN");
    expect(acquired?.currentCost).toBe(5);
    expect(acquired?.counters.fixedCost).toBeUndefined();
  });

  it("絕杰榮耀在協作20時不使自身減費，而是讓加入手牌的絕杰費用為0", () => {
    let state = mainState();
    state.players.P1.hand = [];
    state.players.P1.summonedThisGame = 20;
    const first = putCard(state, "P1", "TOKEN_ALLIANCE_HEROIC_GLORY", "HAND", "first");
    state = applyAction(state, { type: "PLAY_CARD", playerId: "P1", instanceId: first.instanceId }).state;
    expect(state.players.P1.mana).toBe(9);
    state = applyAction(state, { type: "SELECT_EFFECT_OPTION", playerId: "P1", optionId: "DRAW" }).state;
    expect(state.pendingChoice).toMatchObject({ type: "EFFECT_OPTION" });
    state = applyAction(state, { type: "SELECT_EFFECT_OPTION", playerId: "P1", optionId: "TOKEN_ALLIANCE_HERO_AUGUSTIN" }).state;
    expect(state.players.P1.choiceHistory.HEROIC_GLORY_ACQUIRED).toEqual(["TOKEN_ALLIANCE_HERO_AUGUSTIN"]);
    expect(state.players.P1.hand.find((card) => card.definitionId === "TOKEN_ALLIANCE_HERO_AUGUSTIN")?.currentCost).toBe(0);

    const second = putCard(state, "P1", "TOKEN_ALLIANCE_HEROIC_GLORY", "HAND", "second");
    state = applyAction(state, { type: "PLAY_CARD", playerId: "P1", instanceId: second.instanceId }).state;
    state = applyAction(state, { type: "SELECT_EFFECT_OPTION", playerId: "P1", optionId: "DRAW" }).state;
    if (state.pendingChoice?.type !== "EFFECT_OPTION") throw new Error("expected hero choice");
    expect(state.pendingChoice.options.map((option) => option.id)).not.toContain("TOKEN_ALLIANCE_HERO_AUGUSTIN");
  });

  it("奧斯但丁死亡之聲從額外區返回手牌", () => {
    const state = mainState();
    const hero = putCard(state, "P1", "TOKEN_ALLIANCE_HERO_AUGUSTIN", "MINION", "return");
    destroyMinion(state, hero, "TEST");
    resolvePendingEffects(state);
    expect(state.players.P1.hand.some((card) => card.instanceId === hero.instanceId)).toBe(true);
    expect(state.players.P1.extraDeck.some((card) => card.instanceId === hero.instanceId)).toBe(false);
  });

  it("瓦倫泰回合結束永久賦予場上手下傷害上限4，並給予玩家圣盾", () => {
    let state = mainState();
    putCard(state, "P1", "TOKEN_ALLIANCE_HERO_VALENTINE", "MINION", "valentine");
    const ally = putCard(state, "P1", "TOKEN_MACHINE_DESTROYER", "MINION", "ally");
    state = applyAction(state, { type: "END_TURN", playerId: "P1" }).state;
    const currentAlly = state.players.P1.minions.find((card) => card.instanceId === ally.instanceId)!;
    expect(dealDamageToMinion(state, currentAlly, 12, "test", "EFFECT")).toBe(4);
    expect(dealDamageToHero(state, "P1", 8, "shield")).toBe(0);
    expect(dealDamageToHero(state, "P1", 2, "after")).toBe(2);
  });

  it("狄翁攻擊玩家時也會先觸發攻擊時效果與協作15恢復3水晶", () => {
    let state = mainState();
    state.players.P1.summonedThisGame = 15;
    state.players.P1.mana = 0;
    const dion = putCard(state, "P1", "TOKEN_ALLIANCE_HERO_DION", "MINION", "dion");
    const enemy = putCard(state, "P2", "TOKEN_UNDEAD_GENERIC", "MINION", "enemy");

    state = applyAction(state, { type: "ATTACK", playerId: "P1", attackerId: dion.instanceId, target: { type: "HERO", playerId: "P2" } }).state;

    expect(state.players.P1.mana).toBe(3);
    expect(state.players.P2.minions.some((card) => card.instanceId === enemy.instanceId)).toBe(false);
    expect(state.players.P2.heroHp).toBe(27);
  });

  it("狄翁被其他手下攻擊時不會發動攻擊時效果", () => {
    let state = mainState();
    state.players.P2.summonedThisGame = 15;
    state.players.P2.mana = 0;
    const attacker = putCard(state, "P1", "TOKEN_UNDEAD_GENERIC", "MINION", "attacker");
    const ally = putCard(state, "P1", "TOKEN_UNDEAD_GENERIC", "MINION", "bystander");
    const dion = putCard(state, "P2", "TOKEN_ALLIANCE_HERO_DION", "MINION", "defending-dion");
    state = applyAction(state, { type: "ATTACK", playerId: "P1", attackerId: attacker.instanceId, target: { type: "MINION", instanceId: dion.instanceId } }).state;
    expect(state.players.P2.mana).toBe(0);
    expect(state.players.P1.minions.some((card) => card.instanceId === ally.instanceId)).toBe(true);
  });

  it("空襲選擇完成後返回額外區且仍作為法術使用", () => {
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
