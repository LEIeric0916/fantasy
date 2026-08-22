import { describe, expect, it } from "vitest";
import { applyAction } from "../../src/game/engine/gameEngine";
import { mainState, putCard } from "../helpers";

describe("机械神皇机 慕留斯", () => {
  it("费用按神器立场数降低；战吼开始锁定同一X用于伤害与召唤", () => {
    let state = mainState();
    state.players.P1.faction = "MACHINE";
    state.players.P1.hand = [];
    for (let index = 0; index < 3; index += 1) putCard(state, "P1", "TOKEN_MACHINE_ARTIFACT_BOX", "FIELD", `artifact-${index}`);
    const enemy = putCard(state, "P2", "TOKEN_MACHINE_DESTROYER", "MINION", "enemy");
    const mulius = putCard(state, "P1", "MACHINE_014", "HAND", "mulius");

    state = applyAction(state, { type: "PLAY_CARD", playerId: "P1", instanceId: mulius.instanceId }).state;

    expect(state.players.P1.mana).toBe(3);
    expect(state.players.P2.heroHp).toBe(27);
    expect(state.players.P2.minions.find((card) => card.instanceId === enemy.instanceId)?.currentHealth).toBe(4);
    expect(state.players.P1.minions.filter((card) => card.definitionId === "TOKEN_MACHINE_EMPIRE_SOLDIER")).toHaveLength(3);
  });
});
