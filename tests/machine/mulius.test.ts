import { describe, expect, it } from "vitest";
import { applyAction } from "../../src/game/engine/gameEngine";
import { refreshHandCosts } from "../../src/game/engine/costEngine";
import { mainState, putCard } from "../helpers";

describe("機械神皇機 慕留斯", () => {
  it("費用按神器立場數降低；戰吼開始鎖定同一X用於傷害與召喚", () => {
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

  it("機械手下不會被慕留斯誤算成神器立場", () => {
    const state = mainState();
    state.players.P1.faction = "MACHINE";
    state.players.P1.hand = [];
    putCard(state, "P1", "TOKEN_MACHINE_EMPIRE_SOLDIER", "MINION", "machine-only");
    const mulius = putCard(state, "P1", "MACHINE_014", "HAND", "mulius-no-artifact");
    refreshHandCosts(state);
    expect(mulius.currentCost).toBe(10);
  });
});
