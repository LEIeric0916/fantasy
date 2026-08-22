import { describe, expect, it } from "vitest";
import { applyAction } from "../../src/game/engine/gameEngine";
import { mainState, putCard } from "../helpers";

describe("灾厄洪流", () => {
  it("X只计算实际转变数；纪律挡转变但仍受到后续X点范围伤害", () => {
    let state = mainState();
    state.players.P1.hand = [];
    state.players.P1.heroHp = 25;
    const first = putCard(state, "P2", "DRAGON_001", "MINION", "first");
    const second = putCard(state, "P2", "UNDEAD_002", "MINION", "second");
    const discipline = putCard(state, "P2", "TOKEN_MACHINE_DIVINE_GABRIEL", "MINION", "discipline");
    const spell = putCard(state, "P1", "UNDEAD_014", "HAND", "spell");
    state = applyAction(state, { type: "PLAY_CARD", playerId: "P1", instanceId: spell.instanceId }).state;

    expect(state.pendingChoice).toMatchObject({ type: "TRIGGER_ORDER", playerId: "P2" });
    state = applyAction(state, {
      type: "SELECT_TRIGGER_ORDER",
      playerId: "P2",
      instanceIds: [first.instanceId, second.instanceId],
    }).state;

    expect(state.players.P2.extraDeck.map((card) => card.instanceId)).toEqual(expect.arrayContaining([first.instanceId, second.instanceId]));
    expect(state.players.P2.minions.find((card) => card.instanceId === discipline.instanceId)).toMatchObject({
      definitionId: "TOKEN_MACHINE_DIVINE_GABRIEL",
      currentHealth: 8,
    });
    expect(state.players.P1.heroHp).toBe(27);
    expect(state.players.P2.resources.necromancy).toBe(2);
  });

  it("我方有末日之书时，在主效果后召唤两名灾厄骑士", () => {
    let state = mainState();
    state.players.P1.hand = [];
    putCard(state, "P1", "TOKEN_UNDEAD_DOOMSDAY_BOOK", "FIELD", "doom");
    putCard(state, "P2", "UNDEAD_001", "MINION", "target");
    const spell = putCard(state, "P1", "UNDEAD_014", "HAND", "bonus");
    state = applyAction(state, { type: "PLAY_CARD", playerId: "P1", instanceId: spell.instanceId }).state;
    expect(state.players.P1.minions.filter((card) => card.definitionId === "TOKEN_UNDEAD_CATASTROPHE_KNIGHT")).toHaveLength(2);
  });
});
