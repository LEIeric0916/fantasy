import { describe, expect, it } from "vitest";
import { applyAction } from "../../src/game/engine/gameEngine";
import { refreshCardCost } from "../../src/game/engine/costEngine";
import { summonGeneratedMinion } from "../../src/game/engine/summonEngine";
import { beginTurn } from "../../src/game/engine/turnEngine";
import { destroyMinion } from "../../src/game/engine/zoneEngine";
import { resolvePendingEffects } from "../../src/game/engine/effectEngine";
import { mainState, putCard } from "../helpers";

describe("睿智神龍伊爾多斯", () => {
  it("本回合召喚龍族手下的原始費用合計達到20時減費10，最低為0", () => {
    const state = mainState();
    state.players.P1.hand = [];
    for (let index = 0; index < 4; index += 1) summonGeneratedMinion(state, "P1", "TOKEN_DRAGON_HELLFIRE");
    expect(state.players.P1.summonedDragonOriginalCostThisTurn).toBe(20);
    const wise = putCard(state, "P1", "DRAGON_011", "HAND", "discount");
    refreshCardCost(state, "P1", wise);
    expect(wise.currentCost).toBe(0);
  });

  it("實際打出龍族手下後會立即重算手中的減費", () => {
    let state = mainState();
    state.players.P1.hand = [];
    const wise = putCard(state, "P1", "DRAGON_011", "HAND", "discount-after-actions");
    const dragons = Array.from({ length: 4 }, (_, index) =>
      putCard(state, "P1", "TOKEN_DRAGON_HELLFIRE", "HAND", `summoned-dragon-${index}`));

    for (const dragon of dragons) {
      state.players.P1.mana = 10;
      const result = applyAction(state, { type: "PLAY_CARD", playerId: "P1", instanceId: dragon.instanceId });
      expect(result.error).toBeUndefined();
      state = result.state;
    }

    expect(state.players.P1.summonedDragonOriginalCostThisTurn).toBe(20);
    expect(state.players.P1.hand.find((card) => card.instanceId === wise.instanceId)?.currentCost).toBe(0);
  });

  it("回合開始重置本回合龍族原始費用合計", () => {
    const state = mainState();
    summonGeneratedMinion(state, "P1", "TOKEN_DRAGON_HELLFIRE");
    state.phase = "END";
    beginTurn(state);
    expect(state.players.P1.summonedDragonOriginalCostThisTurn).toBe(0);
  });

  it("戰吼對其他所有手下造成5傷，之後賦予仍在場的合法友方手下圣盾", () => {
    let state = mainState();
    state.players.P1.hand = [];
    state.players.P1.mana = 20;
    state.players.P1.maxMana = 20;
    const friendly = putCard(state, "P1", "TOKEN_DRAGON_HELLFIRE", "MINION", "friendly");
    const disciplined = putCard(state, "P1", "TOKEN_MACHINE_DIVINE_GABRIEL", "MINION", "discipline");
    const enemy = putCard(state, "P2", "DRAGON_012", "MINION", "enemy");
    const wise = putCard(state, "P1", "DRAGON_011", "HAND", "battlecry");

    state = applyAction(state, { type: "PLAY_CARD", playerId: "P1", instanceId: wise.instanceId }).state;
    expect(state.players.P1.extraDeck.some((card) => card.instanceId === friendly.instanceId)).toBe(true);
    expect(state.players.P2.minions.find((card) => card.instanceId === enemy.instanceId)?.currentHealth).toBe(7);
    expect(state.players.P1.minions.find((card) => card.instanceId === wise.instanceId)?.keywords).toContain("DIVINE_SHIELD");
    const disciplineAfter = state.players.P1.minions.find((card) => card.instanceId === disciplined.instanceId)!;
    expect(disciplineAfter.currentHealth).toBe(5);
    expect(disciplineAfter.keywords).toContain("DIVINE_SHIELD");
  });

  it("死亡之聲使下一張原始費用10以上龍族手下費用-5", () => {
    const state = mainState();
    const wise = putCard(state, "P1", "DRAGON_011", "MINION", "wise-death");
    const expensive = putCard(state, "P1", "DRAGON_011", "HAND", "wise-discount-target");
    destroyMinion(state, wise, "TEST");
    resolvePendingEffects(state);
    refreshCardCost(state, "P1", expensive);
    expect(expensive.currentCost).toBe(5);
  });

  it("死亡之聲結算後立即更新手牌費用，且多次發動會累加", () => {
    const state = mainState();
    const firstWise = putCard(state, "P1", "DRAGON_011", "MINION", "wise-death-first");
    const secondWise = putCard(state, "P1", "DRAGON_011", "MINION", "wise-death-second");
    const expensive = putCard(state, "P1", "DRAGON_011", "HAND", "wise-stacked-discount-target");

    destroyMinion(state, firstWise, "TEST");
    resolvePendingEffects(state);
    expect(expensive.currentCost).toBe(5);

    destroyMinion(state, secondWise, "TEST");
    resolvePendingEffects(state);
    expect(state.players.P1.nextHighCostDragonReduction).toBe(10);
    expect(expensive.currentCost).toBe(0);
  });
});
