import { describe, expect, it } from "vitest";
import { applyAction } from "../../src/game/engine/gameEngine";
import { resolvePendingEffects } from "../../src/game/engine/effectEngine";
import { destroyMinion } from "../../src/game/engine/zoneEngine";
import { mainState, putCard } from "../helpers";

describe("死靈數與死靈復活", () => {
  it("我方手下從場上被消滅時死靈數+1，即使是衍生牌", () => {
    const state = mainState();
    const minion = putCard(state, "P1", "TOKEN_UNDEAD_SPIRIT", "MINION", "destroyed");
    destroyMinion(state, minion, "TEST");
    expect(state.players.P1.resources.necromancy).toBe(1);
    resolvePendingEffects(state);
    expect(state.players.P1.resources.necromancy).toBe(1);
    expect(state.players.P1.extraDeck.some((card) => card.instanceId === minion.instanceId)).toBe(true);
  });

  it("我方回合蓋德爾斯被消滅時先獲得+1，達到5後扣5並立即復活", () => {
    const state = mainState();
    state.players.P1.resources.necromancy = 4;
    const minion = putCard(state, "P1", "UNDEAD_009", "MINION", "self-revive");
    destroyMinion(state, minion, "TEST");
    resolvePendingEffects(state);
    expect(state.players.P1.resources.necromancy).toBe(0);
    expect(state.players.P1.minions.some((card) => card.instanceId === minion.instanceId)).toBe(true);
    expect(minion.necroRevivedTurn).toBe(state.turnNumber);
  });

  it("同一實例同一回合死靈復活最多一次", () => {
    const state = mainState();
    state.players.P1.resources.necromancy = 10;
    const minion = putCard(state, "P1", "UNDEAD_009", "MINION", "once");
    destroyMinion(state, minion, "FIRST");
    resolvePendingEffects(state);
    expect(minion.zone).toBe("MINION");
    destroyMinion(state, minion, "SECOND");
    resolvePendingEffects(state);
    expect(minion.zone).toBe("GRAVEYARD");
    expect(state.players.P1.resources.necromancy).toBe(7);
  });

  it("由手牌被效果送入棄堆不獲得死亡+1，但已有5死靈數時仍可復活", () => {
    let state = mainState();
    state.players.P1.hand = [];
    state.players.P1.resources.necromancy = 5;
    const silencer = putCard(state, "P1", "UNDEAD_002", "HAND", "discard-source");
    const revived = putCard(state, "P1", "UNDEAD_009", "HAND", "discarded-revive");
    state = applyAction(state, { type: "PLAY_CARD", playerId: "P1", instanceId: silencer.instanceId }).state;
    state = applyAction(state, { type: "SELECT_EFFECT_CARDS", playerId: "P1", instanceIds: [revived.instanceId] }).state;
    expect(state.players.P1.resources.necromancy).toBe(0);
    expect(state.players.P1.minions.some((card) => card.instanceId === revived.instanceId)).toBe(true);
  });

  it("對手沒有手下時，沉默者略過傷害仍讓被捨棄的進擊死靈獨立復活", () => {
    let state = mainState();
    state.players.P1.hand = [];
    state.players.P1.resources.necromancy = 7;
    for (let index = 0; index < 3; index += 1) {
      putCard(state, "P1", "TOKEN_UNDEAD_SPIRIT", "MINION", `occupied-${index}`);
    }
    const silencer = putCard(state, "P1", "UNDEAD_002", "HAND", "silencer");
    const advanceNecro = putCard(state, "P1", "UNDEAD_011", "HAND", "advance-necro");

    state = applyAction(state, { type: "PLAY_CARD", playerId: "P1", instanceId: silencer.instanceId }).state;
    state = applyAction(state, { type: "SELECT_EFFECT_CARDS", playerId: "P1", instanceIds: [advanceNecro.instanceId] }).state;
    expect(state.players.P1.resources.necromancy).toBe(1);
    const revivedAdvanceNecro = state.players.P1.minions.find((card) => card.instanceId === advanceNecro.instanceId);
    expect(revivedAdvanceNecro).toBeDefined();
    expect(revivedAdvanceNecro?.necroRevivedTurn).toBe(state.turnNumber);
    expect(state.players.P1.minions.filter((card) => card.definitionId === "TOKEN_UNDEAD_GIANT")).toHaveLength(2);
    expect(state.effectNotices.some((notice) => notice.sourceName === "沉默者" && notice.reason.includes("沒有可指定"))).toBe(true);
  });

  it("沉默者捨棄進擊死靈但手下區已滿時，明確提示不能死靈復活的原因", () => {
    let state = mainState();
    state.players.P1.hand = [];
    state.players.P1.resources.necromancy = 7;
    for (let index = 0; index < state.rulesConfig.minionLimit - 1; index += 1) {
      putCard(state, "P1", "TOKEN_UNDEAD_SPIRIT", "MINION", `full-${index}`);
    }
    const silencer = putCard(state, "P1", "UNDEAD_002", "HAND", "full-silencer");
    const advanceNecro = putCard(state, "P1", "UNDEAD_011", "HAND", "full-advance-necro");

    state = applyAction(state, { type: "PLAY_CARD", playerId: "P1", instanceId: silencer.instanceId }).state;
    state = applyAction(state, { type: "SELECT_EFFECT_CARDS", playerId: "P1", instanceIds: [advanceNecro.instanceId] }).state;

    expect(state.players.P1.graveyard.some((card) => card.instanceId === advanceNecro.instanceId)).toBe(true);
    expect(state.players.P1.resources.necromancy).toBe(7);
    expect(state.effectNotices.some((notice) => notice.sourceName === "進擊死靈" && notice.reason.includes("手下區已滿"))).toBe(true);
  });

  it("非該玩家回合時進入棄堆不會發動死靈復活", () => {
    const state = mainState();
    state.players.P2.resources.necromancy = 10;
    const minion = putCard(state, "P2", "UNDEAD_009", "MINION", "opponent-turn");
    destroyMinion(state, minion, "TEST");
    resolvePendingEffects(state);
    expect(state.players.P2.resources.necromancy).toBe(11);
    expect(minion.zone).toBe("GRAVEYARD");
  });
});
