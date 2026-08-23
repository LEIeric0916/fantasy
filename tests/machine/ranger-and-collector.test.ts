import { describe, expect, it } from "vitest";
import { applyAction } from "../../src/game/engine/gameEngine";
import { beginTurn } from "../../src/game/engine/turnEngine";
import { mainState, putCard } from "../helpers";

describe("機械帝國游騎兵與機械收集者", () => {
  it("游騎兵檢索同名牌後洗牌，並在充能足夠時發動機械術1召喚制造艙", () => {
    let state = mainState();
    state.players.P1.faction = "MACHINE";
    state.players.P1.resources.recycleCharge = 1;
    state.players.P1.mana = 5;
    state.players.P1.deck = state.players.P1.deck.filter((card) => card.definitionId !== "MACHINE_004");
    const searched = putCard(state, "P1", "MACHINE_004", "HAND", "deck-copy");
    state.players.P1.hand.splice(state.players.P1.hand.indexOf(searched), 1);
    searched.zone = "DECK";
    state.players.P1.deck.push(searched);
    const ranger = putCard(state, "P1", "MACHINE_004", "HAND", "played");

    state = applyAction(state, { type: "PLAY_CARD", playerId: "P1", instanceId: ranger.instanceId }).state;
    expect(state.pendingChoice).toMatchObject({ type: "EFFECT_CARDS", candidateInstanceIds: [searched.instanceId] });
    state = applyAction(state, { type: "SELECT_EFFECT_CARDS", playerId: "P1", instanceIds: [searched.instanceId] }).state;

    expect(state.players.P1.hand.some((card) => card.instanceId === searched.instanceId)).toBe(true);
    expect(state.players.P1.fields.some((card) => card.definitionId === "TOKEN_MACHINE_SOLDIER_BAY")).toBe(true);
    expect(state.players.P1.resources.recycleCharge).toBe(0);
    expect(state.players.P1.mana).toBe(4);
  });

  it("立場已滿時仍可依部分執行規則消耗充能並恢復1水晶", () => {
    let state = mainState();
    state.players.P1.faction = "MACHINE";
    state.players.P1.resources.recycleCharge = 1;
    for (let index = 0; index < 6; index += 1) putCard(state, "P1", "TOKEN_MACHINE_ARTIFACT_BOX", "FIELD", `full-${index}`);
    state.players.P1.deck = state.players.P1.deck.filter((card) => card.definitionId !== "MACHINE_004");
    const ranger = putCard(state, "P1", "MACHINE_004", "HAND", "blocked");

    state = applyAction(state, { type: "PLAY_CARD", playerId: "P1", instanceId: ranger.instanceId }).state;
    expect(state.players.P1.resources.recycleCharge).toBe(0);
    expect(state.players.P1.mana).toBe(9);
    expect(state.players.P1.fields).toHaveLength(6);
  });

  it("立場已滿且水晶全滿時，機械術全部無法執行而不消耗充能", () => {
    let state = mainState();
    state.players.P1.faction = "MACHINE";
    state.players.P1.resources.recycleCharge = 1;
    for (let index = 0; index < 6; index += 1) putCard(state, "P1", "TOKEN_MACHINE_ARTIFACT_BOX", "FIELD", `full-free-${index}`);
    state.players.P1.deck = state.players.P1.deck.filter((card) => card.definitionId !== "MACHINE_004");
    const ranger = putCard(state, "P1", "MACHINE_004", "HAND", "blocked-free");
    ranger.counters.fixedCost = 0;

    state = applyAction(state, { type: "PLAY_CARD", playerId: "P1", instanceId: ranger.instanceId }).state;
    expect(state.players.P1.resources.recycleCharge).toBe(1);
    expect(state.players.P1.mana).toBe(state.players.P1.maxMana);
    expect(state.players.P1.fields).toHaveLength(6);
  });

  it("機械收集者入場加充能，成長抽牌，倒數結束後回收至牌組底", () => {
    let state = mainState();
    state.players.P1.faction = "MACHINE";
    const collector = putCard(state, "P1", "MACHINE_005", "HAND", "collector");
    state = applyAction(state, { type: "PLAY_CARD", playerId: "P1", instanceId: collector.instanceId }).state;
    expect(state.players.P1.resources.recycleCharge).toBe(1);

    const field = state.players.P1.fields.find((card) => card.instanceId === collector.instanceId)!;
    field.counters.countdown = 2;
    const beforeGrowth = state.players.P1.deck.length;
    state.phase = "END";
    beginTurn(state);
    expect(state.players.P1.deck).toHaveLength(beforeGrowth - 2);

    field.counters.countdown = 1;
    state.phase = "END";
    beginTurn(state);
    expect(state.players.P1.deck[0].instanceId).toBe(collector.instanceId);
    expect(state.players.P1.resources.recycleCharge).toBe(2);
  });
});
