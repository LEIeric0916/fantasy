import { describe, expect, it } from "vitest";
import { applyAction } from "../../src/game/engine/gameEngine";
import { resolvePendingEffects } from "../../src/game/engine/effectEngine";
import { destroyMinion } from "../../src/game/engine/zoneEngine";
import { mainState, putCard } from "../helpers";

describe("悼念的骑士 卡戎", () => {
  it("我方回合死灵数达到10时，从当时手牌效果召唤并在原触发完成后发动战吼", () => {
    const state = mainState();
    state.players.P1.resources.necromancy = 9;
    const charon = putCard(state, "P1", "UNDEAD_010", "HAND", "effect-summon");
    const sacrifice = putCard(state, "P1", "TOKEN_UNDEAD_SPIRIT", "MINION", "sacrifice");
    destroyMinion(state, sacrifice, "TEST");
    resolvePendingEffects(state);
    expect(state.players.P1.resources.necromancy).toBe(13);
    expect(state.players.P1.minions.some((card) => card.instanceId === charon.instanceId)).toBe(true);
    expect(state.players.P1.minions.some((card) => card.definitionId === "TOKEN_UNDEAD_PREACHER")).toBe(true);
  });

  it("正常从手牌打出时，战吼召唤哀恸的布道者", () => {
    let state = mainState();
    state.players.P1.hand = [];
    const charon = putCard(state, "P1", "UNDEAD_010", "HAND", "normal");
    state = applyAction(state, { type: "PLAY_CARD", playerId: "P1", instanceId: charon.instanceId }).state;
    expect(state.players.P1.minions.some((card) => card.definitionId === "TOKEN_UNDEAD_PREACHER")).toBe(true);
    expect(state.players.P1.resources.necromancy).toBe(3);
  });

  it("友方手下因交战消灭敌方手下时，每张在场卡戎给予对手玩家2伤", () => {
    let state = mainState();
    const charon = putCard(state, "P1", "UNDEAD_010", "MINION", "aura");
    const attacker = putCard(state, "P1", "DRAGON_012", "MINION", "attacker");
    const defender = putCard(state, "P2", "UNDEAD_001", "MINION", "defender");
    state = applyAction(state, {
      type: "ATTACK",
      playerId: "P1",
      attackerId: attacker.instanceId,
      target: { type: "MINION", instanceId: defender.instanceId },
    }).state;
    expect(state.players.P2.heroHp).toBe(28);
    expect(state.players.P1.minions.some((card) => card.instanceId === charon.instanceId)).toBe(true);
  });
});
