import { describe, expect, it } from "vitest";
import { applyAction } from "../../src/game/engine/gameEngine";
import { getLegalAttackTargets } from "../../src/game/engine/combatEngine";
import { dealDamageToMinion } from "../../src/game/engine/damageEngine";
import { mainState, putCard } from "../helpers";

describe("皇家圣騎槍衛與戰爭兵器先鋒號", () => {
  it("槍衛進場時聯合3恢復2水晶，並召喚皇家親衛隊", () => {
    let state = mainState();
    state.players.P1.hand = [];
    putCard(state, "P1", "TOKEN_ALLIANCE_ROYAL_GUARD", "MINION", "ally-1");
    putCard(state, "P1", "TOKEN_ALLIANCE_ROYAL_GUARD", "MINION", "ally-2");
    const lancer = putCard(state, "P1", "ALLIANCE_008", "HAND", "lancer");
    state = applyAction(state, { type: "PLAY_CARD", playerId: "P1", instanceId: lancer.instanceId }).state;
    expect(state.players.P1.mana).toBe(8);
    expect(state.players.P1.minions.some((card) => card.definitionId === "TOKEN_ALLIANCE_ROYAL_HONOR_GUARD")).toBe(true);
  });

  it("皇家親衛隊使其他友方受到的效果傷害為0，但不保護自己", () => {
    const state = mainState();
    const guard = putCard(state, "P1", "TOKEN_ALLIANCE_ROYAL_HONOR_GUARD", "MINION", "guard");
    const ally = putCard(state, "P1", "TOKEN_ALLIANCE_ROYAL_GUARD", "MINION", "ally");
    expect(dealDamageToMinion(state, ally, 5, "effect", "EFFECT")).toBe(0);
    expect(dealDamageToMinion(state, guard, 2, "effect", "EFFECT")).toBe(2);
  });

  it("先鋒號第5回合以上且已有2名友軍時費用降至1；有其他人類軍隊時獲得動態威懾", () => {
    let state = mainState();
    state.turnNumber = 5;
    state.players.P1.hand = [];
    putCard(state, "P1", "TOKEN_ALLIANCE_ROYAL_GUARD", "MINION", "ally-1");
    putCard(state, "P1", "TOKEN_ALLIANCE_ROYAL_GUARD", "MINION", "ally-2");
    const vanguard = putCard(state, "P1", "ALLIANCE_009", "HAND", "vanguard");
    state = applyAction(state, { type: "PLAY_CARD", playerId: "P1", instanceId: vanguard.instanceId }).state;
    expect(state.players.P1.mana).toBe(9);

    const enemy = putCard(state, "P2", "TOKEN_MACHINE_DESTROYER", "MINION", "enemy-attacker");
    state.activePlayerId = "P2";
    const targets = getLegalAttackTargets(state, enemy.instanceId);
    expect(targets.some((target) => target.type === "MINION" && target.instanceId === vanguard.instanceId)).toBe(false);
  });
});
