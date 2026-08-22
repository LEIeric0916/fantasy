import { describe, expect, it } from "vitest";
import { getCardDefinition } from "../../src/game/cards/cardRegistry";
import { applyAction } from "../../src/game/engine/gameEngine";
import { mainState, putCard } from "../helpers";

describe("资料驱动 Effect：聖印白龍", () => {
  it("战吼抽 1、恢复 1 HP，并在条件成立时 +0/+2", () => {
    let state = mainState();
    state.players.P1.heroHp = 25;
    putCard(state, "P2", "UNDEAD_001", "MINION", "enemy");
    const whiteDragon = putCard(state, "P1", "DRAGON_001", "HAND", "battlecry");
    const handBefore = state.players.P1.hand.length;
    const deckBefore = state.players.P1.deck.length;
    state = applyAction(state, { type: "PLAY_CARD", playerId: "P1", instanceId: whiteDragon.instanceId }).state;
    const summoned = state.players.P1.minions.find((card) => card.instanceId === whiteDragon.instanceId)!;
    expect(state.players.P1.heroHp).toBe(26);
    expect(state.players.P1.hand).toHaveLength(handBefore);
    expect(state.players.P1.deck).toHaveLength(deckBefore - 1);
    expect(summoned.currentHealth).toBe(4);
    expect(summoned.maxHealth).toBe(4);
  });

  it("已有其他我方手下时不获得 +0/+2", () => {
    let state = mainState();
    state.players.P1.heroHp = 25;
    putCard(state, "P1", "TOKEN_DRAGON_HELLFIRE", "MINION", "friendly");
    putCard(state, "P2", "UNDEAD_001", "MINION", "enemy");
    const whiteDragon = putCard(state, "P1", "DRAGON_001", "HAND", "no-buff");
    state = applyAction(state, { type: "PLAY_CARD", playerId: "P1", instanceId: whiteDragon.instanceId }).state;
    expect(state.players.P1.minions.find((card) => card.instanceId === whiteDragon.instanceId)?.currentHealth).toBe(2);
  });

  it("恢复量超过已损失生命时只恢复至最大生命", () => {
    let state = mainState();
    state.players.P1.heroHp = 30;
    const whiteDragon = putCard(state, "P1", "DRAGON_001", "HAND", "heal-cap");
    const deckBefore = state.players.P1.deck.length;
    const result = applyAction(state, { type: "PLAY_CARD", playerId: "P1", instanceId: whiteDragon.instanceId });
    state = result.state;
    expect(result.error).toBeUndefined();
    expect(state.players.P1.heroHp).toBe(30);
    expect(state.players.P1.heroMaxHp).toBe(30);
    expect(state.players.P1.deck).toHaveLength(deckBefore - 1);
  });
});

describe("资料驱动 Effect：炎龍召喚", () => {
  it("G01｜召唤 5/5 嘲讽地獄炎龍，再对敌方所有手下造成 4 伤", () => {
    let state = mainState();
    const firstEnemy = putCard(state, "P2", "UNDEAD_001", "MINION", "enemy-1");
    const secondEnemy = putCard(state, "P2", "DRAGON_001", "MINION", "enemy-2");
    const spell = putCard(state, "P1", "DRAGON_013", "HAND", "spell");
    state = applyAction(state, { type: "PLAY_CARD", playerId: "P1", instanceId: spell.instanceId }).state;
    const hellfire = state.players.P1.minions.find((card) => card.definitionId === "TOKEN_DRAGON_HELLFIRE")!;
    expect(getCardDefinition(hellfire.definitionId)).toMatchObject({ originalCost: 5, attack: 5, health: 5 });
    expect(hellfire.keywords).toContain("TAUNT");
    expect(state.players.P2.graveyard.map((card) => card.instanceId)).toEqual(expect.arrayContaining([firstEnemy.instanceId, secondEnemy.instanceId]));
    expect(state.players.P1.graveyard.some((card) => card.instanceId === spell.instanceId)).toBe(true);
    expect(state.players.P1.mana).toBe(5);
  });

  it("满场时略过召唤，但后续敌方全体 4 伤仍执行", () => {
    let state = mainState();
    for (let index = 0; index < 7; index += 1) putCard(state, "P1", "TOKEN_DRAGON_HELLFIRE", "MINION", `full-${index}`);
    const enemy = putCard(state, "P2", "UNDEAD_001", "MINION", "enemy");
    const spell = putCard(state, "P1", "DRAGON_013", "HAND", "full-board-spell");
    state = applyAction(state, { type: "PLAY_CARD", playerId: "P1", instanceId: spell.instanceId }).state;
    expect(state.players.P1.minions).toHaveLength(7);
    expect(state.players.P2.graveyard.some((card) => card.instanceId === enemy.instanceId)).toBe(true);
  });

  it("敌方圣盾会阻挡本次 4 点效果伤害并失去圣盾", () => {
    let state = mainState();
    const shielded = putCard(state, "P2", "ALLIANCE_005", "MINION", "shielded");
    const spell = putCard(state, "P1", "DRAGON_013", "HAND", "shield-spell");
    state = applyAction(state, { type: "PLAY_CARD", playerId: "P1", instanceId: spell.instanceId }).state;
    const after = state.players.P2.minions.find((card) => card.instanceId === shielded.instanceId)!;
    expect(after.currentHealth).toBe(1);
    expect(after.keywords).not.toContain("DIVINE_SHIELD");
  });
});
