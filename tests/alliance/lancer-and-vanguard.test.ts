import { describe, expect, it } from "vitest";
import { applyAction } from "../../src/game/engine/gameEngine";
import { getLegalAttackTargets } from "../../src/game/engine/combatEngine";
import { dealDamageToMinion } from "../../src/game/engine/damageEngine";
import { mainState, putCard } from "../helpers";

describe("皇家圣騎槍衛與戰爭兵器先鋒號", () => {
  it("槍衛進場時只召喚皇家親衛隊，不再恢復2水晶", () => {
    let state = mainState();
    state.players.P1.hand = [];
    putCard(state, "P1", "TOKEN_ALLIANCE_ROYAL_GUARD", "MINION", "ally-1");
    putCard(state, "P1", "TOKEN_ALLIANCE_ROYAL_GUARD", "MINION", "ally-2");
    const lancer = putCard(state, "P1", "ALLIANCE_008", "HAND", "lancer");
    state = applyAction(state, { type: "PLAY_CARD", playerId: "P1", instanceId: lancer.instanceId }).state;
    expect(state.players.P1.mana).toBe(6);
    expect(state.players.P1.minions.some((card) => card.definitionId === "TOKEN_ALLIANCE_ROYAL_HONOR_GUARD")).toBe(true);
  });

  it("槍衛回合結束光環指定對手1手下並對對手玩家造成2點傷害", () => {
    let state = mainState();
    const lancer = putCard(state, "P1", "ALLIANCE_008", "MINION", "lancer-aura");
    const enemy = putCard(state, "P2", "TOKEN_UNDEAD_GENERIC", "MINION", "enemy");
    state = applyAction(state, { type: "END_TURN", playerId: "P1" }).state;
    expect(state.pendingChoice).toMatchObject({ type: "EFFECT_CARDS", sourceInstanceId: lancer.instanceId, candidateInstanceIds: [enemy.instanceId] });

    state = applyAction(state, { type: "SELECT_EFFECT_CARDS", playerId: "P1", instanceIds: [enemy.instanceId] }).state;
    expect(state.players.P2.minions.some((card) => card.instanceId === enemy.instanceId)).toBe(false);
    expect(state.players.P2.heroHp).toBe(28);
  });

  it("皇家親衛隊使其他友方受到的效果傷害為0，但不保護自己", () => {
    const state = mainState();
    const guard = putCard(state, "P1", "TOKEN_ALLIANCE_ROYAL_HONOR_GUARD", "MINION", "guard");
    expect(guard.currentAttack).toBe(3);
    expect(guard.currentHealth).toBe(4);
    const ally = putCard(state, "P1", "TOKEN_ALLIANCE_ROYAL_GUARD", "MINION", "ally");
    expect(dealDamageToMinion(state, ally, 5, "effect", "EFFECT")).toBe(0);
    expect(dealDamageToMinion(state, guard, 2, "effect", "EFFECT")).toBe(2);
  });

  it("先鋒號第5回合以上且已有3名友軍時費用降至1；有其他人類軍隊時獲得動態威懾", () => {
    let state = mainState();
    state.turnNumber = 5;
    state.players.P1.turnsStarted = 5;
    state.players.P1.hand = [];
    putCard(state, "P1", "TOKEN_ALLIANCE_ROYAL_GUARD", "MINION", "ally-1");
    putCard(state, "P1", "TOKEN_ALLIANCE_ROYAL_GUARD", "MINION", "ally-2");
    putCard(state, "P1", "TOKEN_ALLIANCE_ROYAL_GUARD", "MINION", "ally-3");
    const vanguard = putCard(state, "P1", "ALLIANCE_009", "HAND", "vanguard");
    state = applyAction(state, { type: "PLAY_CARD", playerId: "P1", instanceId: vanguard.instanceId }).state;
    expect(state.players.P1.mana).toBe(9);

    const enemy = putCard(state, "P2", "TOKEN_MACHINE_DESTROYER", "MINION", "enemy-attacker");
    state.activePlayerId = "P2";
    const targets = getLegalAttackTargets(state, enemy.instanceId);
    expect(targets.some((target) => target.type === "MINION" && target.instanceId === vanguard.instanceId)).toBe(false);
  });

  it("先鋒號第5回合以上但我方場上只有2名手下時不會減費", () => {
    let state = mainState();
    state.turnNumber = 5;
    state.players.P1.turnsStarted = 5;
    state.players.P1.hand = [];
    putCard(state, "P1", "TOKEN_ALLIANCE_ROYAL_GUARD", "MINION", "ally-1");
    putCard(state, "P1", "TOKEN_ALLIANCE_ROYAL_GUARD", "MINION", "ally-2");
    const vanguard = putCard(state, "P1", "ALLIANCE_009", "HAND", "vanguard-no-discount");
    state = applyAction(state, { type: "PLAY_CARD", playerId: "P1", instanceId: vanguard.instanceId }).state;
    expect(state.players.P1.mana).toBe(4);
  });

  it("先鋒號以持有者自己的回合數判斷，第4回合即使全場回合數已超過5也不減費", () => {
    let state = mainState();
    state.turnNumber = 7;
    state.players.P1.turnsStarted = 4;
    state.players.P1.hand = [];
    putCard(state, "P1", "TOKEN_ALLIANCE_ROYAL_GUARD", "MINION", "turn-four-ally-1");
    putCard(state, "P1", "TOKEN_ALLIANCE_ROYAL_GUARD", "MINION", "turn-four-ally-2");
    putCard(state, "P1", "TOKEN_ALLIANCE_ROYAL_GUARD", "MINION", "turn-four-ally-3");
    const vanguard = putCard(state, "P1", "ALLIANCE_009", "HAND", "turn-four-vanguard");
    state = applyAction(state, { type: "PLAY_CARD", playerId: "P1", instanceId: vanguard.instanceId }).state;
    expect(state.players.P1.mana).toBe(4);
  });
});
