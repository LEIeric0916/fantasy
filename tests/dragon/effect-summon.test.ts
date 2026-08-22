import { describe, expect, it } from "vitest";
import { applyAction } from "../../src/game/engine/gameEngine";
import { beginTurn } from "../../src/game/engine/turnEngine";
import { mainState, putCard } from "../helpers";

describe("效果召唤", () => {
  it("使用费用5以上法术并完整结算后，从手牌强制召唤魔导战龙", () => {
    let state = mainState();
    state.players.P1.hand = [];
    const warDragon = putCard(state, "P1", "DRAGON_004", "HAND", "trigger");
    const spell = putCard(state, "P1", "DRAGON_013", "HAND", "spell");
    state = applyAction(state, { type: "PLAY_CARD", playerId: "P1", instanceId: spell.instanceId }).state;

    expect(state.players.P1.minions.some((card) => card.instanceId === warDragon.instanceId)).toBe(true);
    const spellLeaves = state.log.findIndex((entry) => entry.data?.instanceId === spell.instanceId && entry.data?.reason === "PLAY_SPELL");
    const dragonSummons = state.log.findIndex((entry) => entry.data?.instanceId === warDragon.instanceId && entry.data?.reason === "EFFECT_SUMMON_FROM_HAND");
    expect(spellLeaves).toBeLessThan(dragonSummons);
  });

  it("使用法术时已经满场，则效果召唤不触发且卡牌留在手牌", () => {
    let state = mainState();
    state.players.P1.hand = [];
    for (let index = 0; index < 7; index += 1) putCard(state, "P1", "TOKEN_UNDEAD_SPIRIT", "MINION", `full-${index}`);
    const warDragon = putCard(state, "P1", "DRAGON_004", "HAND", "blocked");
    const spell = putCard(state, "P1", "DRAGON_013", "HAND", "spell");
    state = applyAction(state, { type: "PLAY_CARD", playerId: "P1", instanceId: spell.instanceId }).state;
    expect(state.players.P1.hand.some((card) => card.instanceId === warDragon.instanceId)).toBe(true);
    expect(state.pendingEffects).toHaveLength(0);
  });

  it("多张同名卡同时满足时只选择1张发动，其余同名卡本回合不再触发", () => {
    let state = mainState();
    state.players.P1.hand = [];
    const first = putCard(state, "P1", "DRAGON_004", "HAND", "first");
    const second = putCard(state, "P1", "DRAGON_004", "HAND", "second");
    const spell = putCard(state, "P1", "DRAGON_013", "HAND", "spell");
    const laterSpell = putCard(state, "P1", "DRAGON_013", "HAND", "later-spell");
    state = applyAction(state, { type: "PLAY_CARD", playerId: "P1", instanceId: spell.instanceId }).state;
    expect(state.pendingChoice).toMatchObject({ type: "EFFECT_CARDS", candidateInstanceIds: [first.instanceId, second.instanceId] });
    state = applyAction(state, { type: "SELECT_EFFECT_CARDS", playerId: "P1", instanceIds: [second.instanceId] }).state;
    expect(state.players.P1.minions.some((card) => card.instanceId === second.instanceId)).toBe(true);
    expect(state.players.P1.hand.some((card) => card.instanceId === first.instanceId)).toBe(true);
    expect(state.players.P1.effectSummonUsedThisTurn).toContain("DRAGON_004");
    expect(state.pendingChoice).toBeUndefined();

    state = applyAction(state, { type: "PLAY_CARD", playerId: "P1", instanceId: laterSpell.instanceId }).state;
    expect(state.players.P1.hand.some((card) => card.instanceId === first.instanceId)).toBe(true);
    expect(state.pendingChoice).toBeUndefined();
  });

  it("回合开始最大水晶达到8时，赤焰龙皇兵从当时时点的手牌效果召唤", () => {
    const state = mainState();
    state.players.P1.maxMana = 7;
    state.players.P1.mana = 0;
    state.phase = "END";
    const soldier = putCard(state, "P1", "DRAGON_010", "HAND", "start-turn");
    beginTurn(state);
    expect(state.players.P1.maxMana).toBe(8);
    expect(state.players.P1.minions.some((card) => card.instanceId === soldier.instanceId)).toBe(true);
    expect(state.phase).toBe("MAIN");
  });

  it("回合开始时满场，赤焰龙皇兵不触发且之后仍留在手牌", () => {
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
