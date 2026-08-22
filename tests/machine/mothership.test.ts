import { describe, expect, it } from "vitest";
import { applyAction } from "../../src/game/engine/gameEngine";
import { mainState, putCard } from "../helpers";

describe("機械神教母星艦與機械進攻艦", () => {
  it("先召喚2艘進攻艦，再按包含新進攻艦的神器數造成范圍傷害", () => {
    let state = mainState();
    state.players.P1.faction = "MACHINE";
    putCard(state, "P1", "TOKEN_MACHINE_GEAR", "FIELD", "existing");
    const enemy = putCard(state, "P2", "TOKEN_MACHINE_DESTROYER", "MINION", "enemy");
    const mothership = putCard(state, "P1", "MACHINE_010", "HAND", "mothership");

    state = applyAction(state, { type: "PLAY_CARD", playerId: "P1", instanceId: mothership.instanceId }).state;
    expect(state.players.P1.fields.filter((card) => card.definitionId === "TOKEN_MACHINE_ATTACK_SHIP")).toHaveLength(2);
    expect(state.players.P2.minions.find((card) => card.instanceId === enemy.instanceId)?.currentHealth).toBe(4);
  });

  it("進攻艦有敵方手下時由玩家指定造成2傷", () => {
    let state = mainState();
    putCard(state, "P1", "TOKEN_MACHINE_ATTACK_SHIP", "FIELD", "ship");
    const enemy = putCard(state, "P2", "TOKEN_MACHINE_DESTROYER", "MINION", "target");
    state = applyAction(state, { type: "END_TURN", playerId: "P1" }).state;
    expect(state.pendingChoice).toMatchObject({ type: "EFFECT_CARDS", candidateInstanceIds: [enemy.instanceId] });
    state = applyAction(state, { type: "SELECT_EFFECT_CARDS", playerId: "P1", instanceIds: [enemy.instanceId] }).state;
    expect(state.players.P2.minions[0].currentHealth).toBe(5);
  });

  it("進攻艦沒有敵方手下時改為給予對手玩家1傷", () => {
    let state = mainState();
    putCard(state, "P1", "TOKEN_MACHINE_ATTACK_SHIP", "FIELD", "ship-hero");
    state = applyAction(state, { type: "END_TURN", playerId: "P1" }).state;
    expect(state.players.P2.heroHp).toBe(29);
  });
});
