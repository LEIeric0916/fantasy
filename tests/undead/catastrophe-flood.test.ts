import { describe, expect, it } from "vitest";
import { applyAction } from "../../src/game/engine/gameEngine";
import { resolvePendingEffects } from "../../src/game/engine/effectEngine";
import { destroyMinion } from "../../src/game/engine/zoneEngine";
import { mainState, putCard } from "../helpers";

describe("災厄洪流", () => {
  it("X只計算實際轉變數；紀律擋轉變但仍受到後續范圍傷害", () => {
    let state = mainState();
    state.players.P1.hand = [];
    state.players.P1.heroHp = 25;
    const first = putCard(state, "P2", "DRAGON_001", "MINION", "first");
    const second = putCard(state, "P2", "UNDEAD_002", "MINION", "second");
    const discipline = putCard(state, "P2", "TOKEN_MACHINE_DIVINE_GABRIEL", "MINION", "discipline");
    const spell = putCard(state, "P1", "UNDEAD_014", "HAND", "spell");
    state = applyAction(state, { type: "PLAY_CARD", playerId: "P1", instanceId: spell.instanceId }).state;

    expect(state.pendingChoice).toBeUndefined();

    expect(state.players.P2.extraDeck.map((card) => card.instanceId)).toEqual(expect.arrayContaining([first.instanceId, second.instanceId]));
    expect(state.players.P2.minions.find((card) => card.instanceId === discipline.instanceId)).toMatchObject({
      definitionId: "TOKEN_MACHINE_DIVINE_GABRIEL",
      currentHealth: 8,
    });
    expect(state.players.P1.heroHp).toBe(27);
    expect(state.players.P2.resources.necromancy).toBe(2);
  });

  it("我方有末日之書時，在主效果後召喚兩名災厄騎士", () => {
    let state = mainState();
    state.players.P1.hand = [];
    putCard(state, "P1", "TOKEN_UNDEAD_DOOMSDAY_BOOK", "FIELD", "doom");
    putCard(state, "P2", "UNDEAD_001", "MINION", "target");
    const spell = putCard(state, "P1", "UNDEAD_014", "HAND", "bonus");
    state = applyAction(state, { type: "PLAY_CARD", playerId: "P1", instanceId: spell.instanceId }).state;
    const knights = state.players.P1.minions.filter((card) => card.definitionId === "TOKEN_UNDEAD_CATASTROPHE_KNIGHT");
    expect(knights).toHaveLength(2);
    expect(knights.every((card) => card.currentAttack === 5 && card.currentHealth === 3)).toBe(true);
  });

  it("災厄騎士死亡之聲給予對手玩家3點傷害", () => {
    const state = mainState();
    const knight = putCard(state, "P1", "TOKEN_UNDEAD_CATASTROPHE_KNIGHT", "MINION", "knight-death");
    destroyMinion(state, knight, "TEST");
    resolvePendingEffects(state);
    expect(state.players.P2.heroHp).toBe(27);
  });
});
