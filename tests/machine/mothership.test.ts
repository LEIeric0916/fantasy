import { describe, expect, it } from "vitest";
import { applyAction } from "../../src/game/engine/gameEngine";
import { mainState, putCard } from "../helpers";

describe("机械神教母星舰与机械进攻舰", () => {
  it("先召唤2艘进攻舰，再按包含新进攻舰的神器数造成范围伤害", () => {
    let state = mainState();
    state.players.P1.faction = "MACHINE";
    putCard(state, "P1", "TOKEN_MACHINE_GEAR", "FIELD", "existing");
    const enemy = putCard(state, "P2", "TOKEN_MACHINE_DESTROYER", "MINION", "enemy");
    const mothership = putCard(state, "P1", "MACHINE_010", "HAND", "mothership");

    state = applyAction(state, { type: "PLAY_CARD", playerId: "P1", instanceId: mothership.instanceId }).state;
    expect(state.players.P1.fields.filter((card) => card.definitionId === "TOKEN_MACHINE_ATTACK_SHIP")).toHaveLength(2);
    expect(state.players.P2.minions.find((card) => card.instanceId === enemy.instanceId)?.currentHealth).toBe(4);
  });

  it("进攻舰有敌方手下时由玩家指定造成2伤", () => {
    let state = mainState();
    putCard(state, "P1", "TOKEN_MACHINE_ATTACK_SHIP", "FIELD", "ship");
    const enemy = putCard(state, "P2", "TOKEN_MACHINE_DESTROYER", "MINION", "target");
    state = applyAction(state, { type: "END_TURN", playerId: "P1" }).state;
    expect(state.pendingChoice).toMatchObject({ type: "EFFECT_CARDS", candidateInstanceIds: [enemy.instanceId] });
    state = applyAction(state, { type: "SELECT_EFFECT_CARDS", playerId: "P1", instanceIds: [enemy.instanceId] }).state;
    expect(state.players.P2.minions[0].currentHealth).toBe(5);
  });

  it("进攻舰没有敌方手下时改为给予对手玩家1伤", () => {
    let state = mainState();
    putCard(state, "P1", "TOKEN_MACHINE_ATTACK_SHIP", "FIELD", "ship-hero");
    state = applyAction(state, { type: "END_TURN", playerId: "P1" }).state;
    expect(state.players.P2.heroHp).toBe(29);
  });
});
