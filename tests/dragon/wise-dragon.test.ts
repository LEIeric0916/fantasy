import { describe, expect, it } from "vitest";
import { applyAction } from "../../src/game/engine/gameEngine";
import { refreshCardCost } from "../../src/game/engine/costEngine";
import { summonGeneratedMinion } from "../../src/game/engine/summonEngine";
import { beginTurn } from "../../src/game/engine/turnEngine";
import { mainState, putCard } from "../helpers";

describe("睿智神龙伊尔多斯", () => {
  it("本回合召唤龙族手下的原始费用合计达到20时减费10，最低为0", () => {
    const state = mainState();
    state.players.P1.hand = [];
    for (let index = 0; index < 4; index += 1) summonGeneratedMinion(state, "P1", "TOKEN_DRAGON_HELLFIRE");
    expect(state.players.P1.summonedDragonOriginalCostThisTurn).toBe(20);
    const wise = putCard(state, "P1", "DRAGON_011", "HAND", "discount");
    refreshCardCost(state, "P1", wise);
    expect(wise.currentCost).toBe(0);
  });

  it("回合开始重置本回合龙族原始费用合计", () => {
    const state = mainState();
    summonGeneratedMinion(state, "P1", "TOKEN_DRAGON_HELLFIRE");
    state.phase = "END";
    beginTurn(state);
    expect(state.players.P1.summonedDragonOriginalCostThisTurn).toBe(0);
  });

  it("战吼对其他所有手下造成5伤，之后赋予仍在场的合法友方手下圣盾", () => {
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
    expect(disciplineAfter.keywords).not.toContain("DIVINE_SHIELD");
  });
});
