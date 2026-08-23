import { describe, expect, it } from "vitest";
import { applyAction } from "../../src/game/engine/gameEngine";
import { beginTurn } from "../../src/game/engine/turnEngine";
import { mainState, putCard } from "../helpers";

describe("效果召喚", () => {
  it("龍的誕生減費至4後仍以原始費用6觸發魔導戰龍", () => {
    let state = mainState();
    state.players.P1.hand = [];
    state.players.P1.mana = 4;
    putCard(state, "P2", "UNDEAD_001", "MINION", "discount-one");
    putCard(state, "P2", "UNDEAD_001", "MINION", "discount-two");
    const warDragon = putCard(state, "P1", "DRAGON_004", "HAND", "original-cost-trigger");
    const spell = putCard(state, "P1", "DRAGON_014", "HAND", "discounted-birth");

    state = applyAction(state, { type: "PLAY_CARD", playerId: "P1", instanceId: spell.instanceId }).state;
    expect(state.pendingChoice).toMatchObject({ type: "EFFECT_SUMMON_CONFIRM", sourceInstanceId: warDragon.instanceId });
    state = applyAction(state, { type: "CONFIRM_EFFECT_SUMMON", playerId: "P1" }).state;
    expect(state.players.P1.minions.some((card) => card.instanceId === warDragon.instanceId)).toBe(true);
  });

  it("使用費用5以上法術並完整結算後，從手牌強制召喚魔導戰龍", () => {
    let state = mainState();
    state.players.P1.hand = [];
    const warDragon = putCard(state, "P1", "DRAGON_004", "HAND", "trigger");
    const spell = putCard(state, "P1", "DRAGON_013", "HAND", "spell");
    state = applyAction(state, { type: "PLAY_CARD", playerId: "P1", instanceId: spell.instanceId }).state;
    expect(state.pendingChoice).toMatchObject({ type: "EFFECT_SUMMON_CONFIRM", sourceInstanceId: warDragon.instanceId });
    expect(state.players.P1.hand.some((card) => card.instanceId === warDragon.instanceId)).toBe(true);
    state = applyAction(state, { type: "CONFIRM_EFFECT_SUMMON", playerId: "P1" }).state;
    expect(state.players.P1.minions.some((card) => card.instanceId === warDragon.instanceId)).toBe(true);
    const spellLeaves = state.log.findIndex((entry) => entry.data?.instanceId === spell.instanceId && entry.data?.reason === "PLAY_SPELL");
    const dragonSummons = state.log.findIndex((entry) => entry.data?.instanceId === warDragon.instanceId && entry.data?.reason === "EFFECT_SUMMON_FROM_HAND");
    expect(spellLeaves).toBeLessThan(dragonSummons);
  });

  it("使用法術時已經滿場，則效果召喚不觸發且卡牌留在手牌", () => {
    let state = mainState();
    state.players.P1.hand = [];
    for (let index = 0; index < 7; index += 1) putCard(state, "P1", "TOKEN_UNDEAD_SPIRIT", "MINION", `full-${index}`);
    const warDragon = putCard(state, "P1", "DRAGON_004", "HAND", "blocked");
    const spell = putCard(state, "P1", "DRAGON_013", "HAND", "spell");
    state = applyAction(state, { type: "PLAY_CARD", playerId: "P1", instanceId: spell.instanceId }).state;
    expect(state.players.P1.hand.some((card) => card.instanceId === warDragon.instanceId)).toBe(true);
    expect(state.pendingEffects).toHaveLength(0);
  });

  it("多張同名卡同時滿足時只選擇1張發動，其余同名卡本回合不再觸發", () => {
    let state = mainState();
    state.players.P1.hand = [];
    const first = putCard(state, "P1", "DRAGON_004", "HAND", "first");
    const second = putCard(state, "P1", "DRAGON_004", "HAND", "second");
    const spell = putCard(state, "P1", "DRAGON_013", "HAND", "spell");
    const laterSpell = putCard(state, "P1", "DRAGON_013", "HAND", "later-spell");
    state = applyAction(state, { type: "PLAY_CARD", playerId: "P1", instanceId: spell.instanceId }).state;
    expect(state.pendingChoice).toMatchObject({ type: "EFFECT_CARDS", candidateInstanceIds: [first.instanceId, second.instanceId] });
    state = applyAction(state, { type: "SELECT_EFFECT_CARDS", playerId: "P1", instanceIds: [second.instanceId] }).state;
    expect(state.pendingChoice).toMatchObject({ type: "EFFECT_SUMMON_CONFIRM", sourceInstanceId: second.instanceId });
    state = applyAction(state, { type: "CONFIRM_EFFECT_SUMMON", playerId: "P1" }).state;
    expect(state.players.P1.minions.some((card) => card.instanceId === second.instanceId)).toBe(true);
    expect(state.players.P1.hand.some((card) => card.instanceId === first.instanceId)).toBe(true);
    expect(state.players.P1.effectSummonUsedThisTurn).toContain("DRAGON_004");
    expect(state.pendingChoice).toBeUndefined();

    state = applyAction(state, { type: "PLAY_CARD", playerId: "P1", instanceId: laterSpell.instanceId }).state;
    expect(state.players.P1.hand.some((card) => card.instanceId === first.instanceId)).toBe(true);
    expect(state.pendingChoice).toBeUndefined();
  });

  it("回合開始最大水晶達到8時，赤焰龍皇兵從當時時點的手牌效果召喚", () => {
    const state = mainState();
    state.players.P1.maxMana = 7;
    state.players.P1.mana = 0;
    state.phase = "END";
    const soldier = putCard(state, "P1", "DRAGON_010", "HAND", "start-turn");
    beginTurn(state);
    expect(state.players.P1.maxMana).toBe(8);
    expect(state.pendingChoice).toMatchObject({ type: "EFFECT_SUMMON_CONFIRM", sourceInstanceId: soldier.instanceId });
    expect(soldier.keywords).toContain("RUSH");
    const confirmed = applyAction(state, { type: "CONFIRM_EFFECT_SUMMON", playerId: "P1" }).state;
    expect(confirmed.players.P1.minions.some((card) => card.instanceId === soldier.instanceId)).toBe(true);
    expect(confirmed.phase).toBe("MAIN");
  });

  it("回合開始時滿場，赤焰龍皇兵不觸發且之後仍留在手牌", () => {
    const state = mainState();
    state.players.P1.maxMana = 7;
    state.phase = "END";
    for (let index = 0; index < 7; index += 1) putCard(state, "P1", "TOKEN_UNDEAD_SPIRIT", "MINION", `full-start-${index}`);
    const soldier = putCard(state, "P1", "DRAGON_010", "HAND", "blocked-start");
    beginTurn(state);
    expect(state.players.P1.hand.some((card) => card.instanceId === soldier.instanceId)).toBe(true);
    expect(state.players.P1.minions).toHaveLength(7);
  });
});
