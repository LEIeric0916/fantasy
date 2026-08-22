import { describe, expect, it } from "vitest";
import { applyAction } from "../../src/game/engine/gameEngine";
import { mainState, putCard } from "../helpers";

describe("哈洛德與焰騎士長", () => {
  it("哈洛德先召喚第一名革命士兵，再比較人數決定是否召喚第二名", () => {
    let state = mainState();
    state.players.P1.hand = [];
    for (let index = 0; index < 4; index += 1) putCard(state, "P2", "TOKEN_ALLIANCE_ROYAL_GUARD", "MINION", `enemy-${index}`);
    const harold = putCard(state, "P1", "ALLIANCE_004", "HAND", "harold");
    state = applyAction(state, { type: "PLAY_CARD", playerId: "P1", instanceId: harold.instanceId }).state;
    expect(state.players.P1.minions.filter((card) => card.definitionId === "TOKEN_ALLIANCE_REVOLUTIONARY_SOLDIER")).toHaveLength(2);
  });

  it("協作10時攻擊前先對全部敵方手下造成2傷；因此死亡的目標不再進入戰斗", () => {
    let state = mainState();
    state.players.P1.summonedThisGame = 10;
    const harold = putCard(state, "P1", "ALLIANCE_004", "MINION", "attacker");
    const target = putCard(state, "P2", "TOKEN_UNDEAD_GENERIC", "MINION", "target");
    state = applyAction(state, { type: "ATTACK", playerId: "P1", attackerId: harold.instanceId, target: { type: "MINION", instanceId: target.instanceId } }).state;
    expect(state.players.P2.minions.some((card) => card.instanceId === target.instanceId)).toBe(false);
    expect(state.players.P1.minions.find((card) => card.instanceId === harold.instanceId)?.currentHealth).toBe(2);
  });

  it("未達協作15時指定1名友方獲得圣盾並對玩家2傷", () => {
    let state = mainState();
    const captain = putCard(state, "P1", "ALLIANCE_005", "MINION", "normal");
    state = applyAction(state, { type: "END_TURN", playerId: "P1" }).state;
    expect(state.pendingChoice).toMatchObject({ type: "EFFECT_CARDS", candidateInstanceIds: [captain.instanceId] });
    state = applyAction(state, { type: "SELECT_EFFECT_CARDS", playerId: "P1", instanceIds: [captain.instanceId] }).state;
    expect(state.players.P1.minions[0].keywords).toContain("DIVINE_SHIELD");
    expect(state.players.P2.heroHp).toBe(28);
  });

  it("協作15時使全部合法友方獲得圣盾並對玩家4傷", () => {
    let state = mainState();
    state.players.P1.summonedThisGame = 15;
    putCard(state, "P1", "ALLIANCE_005", "MINION", "collaboration");
    putCard(state, "P1", "TOKEN_ALLIANCE_ROYAL_GUARD", "MINION", "ally");
    state = applyAction(state, { type: "END_TURN", playerId: "P1" }).state;
    expect(state.players.P1.minions.every((card) => card.keywords.includes("DIVINE_SHIELD"))).toBe(true);
    expect(state.players.P2.heroHp).toBe(26);
  });
});
