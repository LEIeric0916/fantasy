import { describe, expect, it } from "vitest";
import { applyAction } from "../../src/game/engine/gameEngine";
import { mainState, putCard } from "../helpers";

describe("哈洛德与焰骑士长", () => {
  it("哈洛德先召唤第一名革命士兵，再比较人数决定是否召唤第二名", () => {
    let state = mainState();
    state.players.P1.hand = [];
    for (let index = 0; index < 4; index += 1) putCard(state, "P2", "TOKEN_ALLIANCE_ROYAL_GUARD", "MINION", `enemy-${index}`);
    const harold = putCard(state, "P1", "ALLIANCE_004", "HAND", "harold");
    state = applyAction(state, { type: "PLAY_CARD", playerId: "P1", instanceId: harold.instanceId }).state;
    expect(state.players.P1.minions.filter((card) => card.definitionId === "TOKEN_ALLIANCE_REVOLUTIONARY_SOLDIER")).toHaveLength(2);
  });

  it("协作10时攻击前先对全部敌方手下造成2伤；因此死亡的目标不再进入战斗", () => {
    let state = mainState();
    state.players.P1.summonedThisGame = 10;
    const harold = putCard(state, "P1", "ALLIANCE_004", "MINION", "attacker");
    const target = putCard(state, "P2", "TOKEN_UNDEAD_GENERIC", "MINION", "target");
    state = applyAction(state, { type: "ATTACK", playerId: "P1", attackerId: harold.instanceId, target: { type: "MINION", instanceId: target.instanceId } }).state;
    expect(state.players.P2.minions.some((card) => card.instanceId === target.instanceId)).toBe(false);
    expect(state.players.P1.minions.find((card) => card.instanceId === harold.instanceId)?.currentHealth).toBe(2);
  });

  it("未达协作15时指定1名友方获得圣盾并对玩家2伤", () => {
    let state = mainState();
    const captain = putCard(state, "P1", "ALLIANCE_005", "MINION", "normal");
    state = applyAction(state, { type: "END_TURN", playerId: "P1" }).state;
    expect(state.pendingChoice).toMatchObject({ type: "EFFECT_CARDS", candidateInstanceIds: [captain.instanceId] });
    state = applyAction(state, { type: "SELECT_EFFECT_CARDS", playerId: "P1", instanceIds: [captain.instanceId] }).state;
    expect(state.players.P1.minions[0].keywords).toContain("DIVINE_SHIELD");
    expect(state.players.P2.heroHp).toBe(28);
  });

  it("协作15时使全部合法友方获得圣盾并对玩家4伤", () => {
    let state = mainState();
    state.players.P1.summonedThisGame = 15;
    putCard(state, "P1", "ALLIANCE_005", "MINION", "collaboration");
    putCard(state, "P1", "TOKEN_ALLIANCE_ROYAL_GUARD", "MINION", "ally");
    state = applyAction(state, { type: "END_TURN", playerId: "P1" }).state;
    expect(state.players.P1.minions.every((card) => card.keywords.includes("DIVINE_SHIELD"))).toBe(true);
    expect(state.players.P2.heroHp).toBe(26);
  });
});
