import { describe, expect, it } from "vitest";
import { applyAction } from "../../src/game/engine/gameEngine";
import { resolvePendingEffects } from "../../src/game/engine/effectEngine";
import { destroyMinion, moveCard } from "../../src/game/engine/zoneEngine";
import { mainState, putCard } from "../helpers";

describe("盖德尔斯战吼", () => {
  it("由玩家指定弃堆原始费用5以上手下复活", () => {
    let state = mainState();
    state.players.P1.hand = [];
    const target = putCard(state, "P1", "DRAGON_005", "MINION", "high-cost");
    moveCard(state, target, "GRAVEYARD", "TEST_SETUP");
    const source = putCard(state, "P1", "UNDEAD_009", "HAND", "battlecry");
    state = applyAction(state, { type: "PLAY_CARD", playerId: "P1", instanceId: source.instanceId }).state;
    state = applyAction(state, { type: "SELECT_EFFECT_CARDS", playerId: "P1", instanceIds: [target.instanceId] }).state;
    expect(state.players.P1.minions.some((card) => card.instanceId === target.instanceId)).toBe(true);
  });

  it("死灵复活属于自身复活，复活后仍触发战吼", () => {
    let state = mainState();
    state.players.P1.resources.necromancy = 3;
    const target = putCard(state, "P1", "DRAGON_005", "MINION", "necro-battlecry-target");
    moveCard(state, target, "GRAVEYARD", "TEST_SETUP");
    const source = putCard(state, "P1", "UNDEAD_009", "MINION", "necro-battlecry-source");

    destroyMinion(state, source, "TEST");
    resolvePendingEffects(state);

    expect(state.players.P1.minions.some((card) => card.instanceId === source.instanceId)).toBe(true);
    expect(state.pendingChoice).toMatchObject({ type: "EFFECT_CARDS", candidateInstanceIds: [target.instanceId] });
    state = applyAction(state, { type: "SELECT_EFFECT_CARDS", playerId: "P1", instanceIds: [target.instanceId] }).state;
    expect(state.players.P1.minions.some((card) => card.instanceId === target.instanceId)).toBe(true);
  });
});

describe("进击死灵进场效果", () => {
  it("从手牌正常进入场上时召唤两名不朽者巨灵", () => {
    let state = mainState();
    state.players.P1.hand = [];
    const source = putCard(state, "P1", "UNDEAD_011", "HAND", "normal-enter");
    state = applyAction(state, { type: "PLAY_CARD", playerId: "P1", instanceId: source.instanceId }).state;
    expect(state.players.P1.minions.filter((card) => card.definitionId === "TOKEN_UNDEAD_GIANT")).toHaveLength(2);
  });

  it("我方有末日之书时，新召唤的两名巨灵获得冲锋", () => {
    let state = mainState();
    state.players.P1.hand = [];
    putCard(state, "P1", "TOKEN_UNDEAD_DOOMSDAY_BOOK", "FIELD", "doom-book");
    const source = putCard(state, "P1", "UNDEAD_011", "HAND", "charge-enter");
    state = applyAction(state, { type: "PLAY_CARD", playerId: "P1", instanceId: source.instanceId }).state;
    const giants = state.players.P1.minions.filter((card) => card.definitionId === "TOKEN_UNDEAD_GIANT");
    expect(giants).toHaveLength(2);
    expect(giants.every((card) => card.keywords.includes("CHARGE"))).toBe(true);
  });

  it("死灵复活进入场上时同样触发进场效果", () => {
    const state = mainState();
    state.players.P1.resources.necromancy = 4;
    const source = putCard(state, "P1", "UNDEAD_011", "MINION", "necro-enter");
    destroyMinion(state, source, "TEST");
    resolvePendingEffects(state);
    expect(state.players.P1.minions.some((card) => card.instanceId === source.instanceId)).toBe(true);
    expect(state.players.P1.minions.filter((card) => card.definitionId === "TOKEN_UNDEAD_GIANT")).toHaveLength(2);
  });
});
