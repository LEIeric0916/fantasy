import { describe, expect, it } from "vitest";
import { applyAction } from "../../src/game/engine/gameEngine";
import { mainState, putCard } from "../helpers";

describe("审判者裁决", () => {
  it("消灭指定目标；我方有原始费用7以上手下时，再对其余敌方手下造成5伤", () => {
    let state = mainState();
    state.players.P1.hand = [];
    putCard(state, "P1", "DRAGON_007", "MINION", "condition");
    const spell = putCard(state, "P1", "TOKEN_DRAGON_JUDGMENT", "HAND", "spell");
    const destroyed = putCard(state, "P2", "DRAGON_012", "MINION", "destroy");
    const damaged = putCard(state, "P2", "UNDEAD_006", "MINION", "aoe");

    state = applyAction(state, { type: "PLAY_CARD", playerId: "P1", instanceId: spell.instanceId }).state;
    state = applyAction(state, { type: "SELECT_EFFECT_CARDS", playerId: "P1", instanceIds: [destroyed.instanceId] }).state;
    expect(state.players.P2.graveyard.some((card) => card.instanceId === destroyed.instanceId)).toBe(true);
    expect(state.players.P2.graveyard.some((card) => card.instanceId === damaged.instanceId)).toBe(true);
    expect(state.players.P1.extraDeck.some((card) => card.instanceId === spell.instanceId)).toBe(true);
  });

  it("光纹手下不进入可指定清单", () => {
    let state = mainState();
    state.players.P1.hand = [];
    const spell = putCard(state, "P1", "TOKEN_DRAGON_JUDGMENT", "HAND", "ward");
    const ward = putCard(state, "P2", "TOKEN_MACHINE_DIVINE_LUCIFER", "MINION", "ward-target");
    const legal = putCard(state, "P2", "UNDEAD_001", "MINION", "legal-target");
    state = applyAction(state, { type: "PLAY_CARD", playerId: "P1", instanceId: spell.instanceId }).state;
    expect(state.pendingChoice).toMatchObject({ type: "EFFECT_CARDS", candidateInstanceIds: [legal.instanceId] });
    expect((state.pendingChoice as { candidateInstanceIds: string[] }).candidateInstanceIds).not.toContain(ward.instanceId);
  });

  it("庇护阻挡直接消灭，但不阻挡句号后的范围伤害", () => {
    let state = mainState();
    state.players.P1.hand = [];
    putCard(state, "P1", "DRAGON_007", "MINION", "condition");
    const spell = putCard(state, "P1", "TOKEN_DRAGON_JUDGMENT", "HAND", "sanctuary");
    const sanctuary = putCard(state, "P2", "DRAGON_006", "MINION", "target");
    state = applyAction(state, { type: "PLAY_CARD", playerId: "P1", instanceId: spell.instanceId }).state;
    state = applyAction(state, { type: "SELECT_EFFECT_CARDS", playerId: "P1", instanceIds: [sanctuary.instanceId] }).state;
    const after = state.players.P2.minions.find((card) => card.instanceId === sanctuary.instanceId)!;
    expect(after).toBeDefined();
    expect(after.keywords).not.toContain("DIVINE_SHIELD");
    expect(state.log.some((entry) => entry.type === "PROTECTION" && entry.message.includes("阻挡效果直接消灭"))).toBe(true);
  });
});
