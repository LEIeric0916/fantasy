import { describe, expect, it } from "vitest";
import { applyAction } from "../../src/game/engine/gameEngine";
import { resolvePendingEffects } from "../../src/game/engine/effectEngine";
import { destroyMinion, moveCard } from "../../src/game/engine/zoneEngine";
import { mainState, putCard } from "../helpers";

describe("蓋德爾斯戰吼", () => {
  it("由玩家指定棄堆原始費用5以上手下復活", () => {
    let state = mainState();
    state.players.P1.hand = [];
    const target = putCard(state, "P1", "DRAGON_005", "MINION", "high-cost");
    moveCard(state, target, "GRAVEYARD", "TEST_SETUP");
    const source = putCard(state, "P1", "UNDEAD_009", "HAND", "battlecry");
    state = applyAction(state, { type: "PLAY_CARD", playerId: "P1", instanceId: source.instanceId }).state;
    state = applyAction(state, { type: "SELECT_EFFECT_CARDS", playerId: "P1", instanceIds: [target.instanceId] }).state;
    expect(state.players.P1.minions.some((card) => card.instanceId === target.instanceId)).toBe(true);
  });

  it("死靈復活屬於自身復活，復活後仍觸發戰吼", () => {
    let state = mainState();
    state.players.P1.resources.necromancy = 4;
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

describe("進擊死靈進場效果", () => {
  it("從手牌正常進入場上時召喚兩名不朽者巨靈", () => {
    let state = mainState();
    state.players.P1.hand = [];
    const source = putCard(state, "P1", "UNDEAD_011", "HAND", "normal-enter");
    state = applyAction(state, { type: "PLAY_CARD", playerId: "P1", instanceId: source.instanceId }).state;
    const giants = state.players.P1.minions.filter((card) => card.definitionId === "TOKEN_UNDEAD_GIANT");
    expect(giants).toHaveLength(2);
    expect(giants.every((card) => card.currentAttack === 2 && card.currentHealth === 6)).toBe(true);
    expect(giants.every((card) => card.keywords.includes("SANCTUARY"))).toBe(true);
  });

  it("我方有末日之書時，新召喚的兩名巨靈獲得聖盾術與衝鋒", () => {
    let state = mainState();
    state.players.P1.hand = [];
    putCard(state, "P1", "TOKEN_UNDEAD_DOOMSDAY_BOOK", "FIELD", "doom-book");
    const source = putCard(state, "P1", "UNDEAD_011", "HAND", "shield-enter");
    state = applyAction(state, { type: "PLAY_CARD", playerId: "P1", instanceId: source.instanceId }).state;
    const giants = state.players.P1.minions.filter((card) => card.definitionId === "TOKEN_UNDEAD_GIANT");
    expect(giants).toHaveLength(2);
    expect(giants.every((card) => card.keywords.includes("DIVINE_SHIELD"))).toBe(true);
    expect(giants.every((card) => card.keywords.includes("CHARGE"))).toBe(true);
    expect(giants.every((card) => card.keywords.includes("SANCTUARY"))).toBe(true);
  });

  it("死靈復活進入場上時同樣觸發進場效果", () => {
    const state = mainState();
    state.players.P1.resources.necromancy = 5;
    const source = putCard(state, "P1", "UNDEAD_011", "MINION", "necro-enter");
    destroyMinion(state, source, "TEST");
    resolvePendingEffects(state);
    expect(state.players.P1.minions.some((card) => card.instanceId === source.instanceId)).toBe(true);
    expect(state.players.P1.minions.filter((card) => card.definitionId === "TOKEN_UNDEAD_GIANT")).toHaveLength(2);
  });
});
