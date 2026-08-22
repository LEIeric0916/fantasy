import { describe, expect, it } from "vitest";
import { applyAction } from "../../src/game/engine/gameEngine";
import { mainState, putCard } from "../helpers";

describe("联盟后期主牌", () => {
  it("皇家战士按本回合召唤次数每次减2；检索主牌并在协作10时召唤衍生皇家战士", () => {
    let state = mainState();
    state.players.P1.hand = [];
    state.players.P1.summonedThisTurn = 2;
    state.players.P1.summonedThisGame = 9;
    const searched = putCard(state, "P1", "ALLIANCE_010", "HAND", "deck-copy");
    state.players.P1.hand.splice(state.players.P1.hand.indexOf(searched), 1);
    searched.zone = "DECK";
    state.players.P1.deck.unshift(searched);
    const warrior = putCard(state, "P1", "ALLIANCE_010", "HAND", "played");
    state = applyAction(state, { type: "PLAY_CARD", playerId: "P1", instanceId: warrior.instanceId }).state;
    expect(state.players.P1.mana).toBe(7);
    state = applyAction(state, { type: "SELECT_EFFECT_CARDS", playerId: "P1", instanceIds: [searched.instanceId] }).state;
    expect(state.players.P1.minions.some((card) => card.definitionId === "TOKEN_ALLIANCE_ROYAL_WARRIOR")).toBe(true);
  });

  it("爆袭莱恩在战吼开始记录敌方数量，伤害离场不改变自身-X/-X", () => {
    let state = mainState();
    state.players.P1.hand = [];
    for (let index = 0; index < 3; index += 1) putCard(state, "P2", "TOKEN_ALLIANCE_ROYAL_GUARD", "MINION", `enemy-${index}`);
    const ryan = putCard(state, "P1", "ALLIANCE_011", "HAND", "ryan");
    state = applyAction(state, { type: "PLAY_CARD", playerId: "P1", instanceId: ryan.instanceId }).state;
    const played = state.players.P1.minions.find((card) => card.instanceId === ryan.instanceId)!;
    expect(state.players.P2.minions).toHaveLength(0);
    expect(state.players.P2.heroHp).toBe(27);
    expect(played.currentAttack).toBe(4);
    expect(played.currentHealth).toBe(4);
  });

  it("加拉德必须指定3个不同目标；协作15伤害为句号式独立效果", () => {
    let state = mainState();
    state.players.P1.hand = [];
    state.players.P1.summonedThisGame = 14;
    const first = putCard(state, "P2", "TOKEN_MACHINE_DESTROYER", "MINION", "first");
    const second = putCard(state, "P2", "TOKEN_MACHINE_DESTROYER", "MINION", "second");
    const third = putCard(state, "P2", "TOKEN_MACHINE_DESTROYER", "MINION", "third");
    const gallard = putCard(state, "P1", "ALLIANCE_012", "HAND", "gallard");
    state = applyAction(state, { type: "PLAY_CARD", playerId: "P1", instanceId: gallard.instanceId }).state;
    expect(state.pendingChoice).toMatchObject({ type: "EFFECT_CARDS", count: 3 });
    state = applyAction(state, { type: "SELECT_EFFECT_CARDS", playerId: "P1", instanceIds: [first.instanceId, second.instanceId, third.instanceId] }).state;
    expect(state.players.P2.minions).toHaveLength(0);
    expect(state.players.P2.heroHp).toBe(26);
  });
});
