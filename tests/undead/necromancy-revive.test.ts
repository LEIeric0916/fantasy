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

  it("我方回合蓋德爾斯被消滅時先獲得+1，達到4後扣4並立即復活", () => {
    const state = mainState();
    state.players.P1.resources.necromancy = 3;
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
    expect(state.players.P1.resources.necromancy).toBe(8);
  });

  it("由手牌被效果送入棄堆不獲得死亡+1，但已有4死靈數時仍可復活", () => {
    let state = mainState();
    state.players.P1.hand = [];
    state.players.P1.resources.necromancy = 4;
    const silencer = putCard(state, "P1", "UNDEAD_002", "HAND", "discard-source");
    const revived = putCard(state, "P1", "UNDEAD_009", "HAND", "discarded-revive");
    state = applyAction(state, { type: "PLAY_CARD", playerId: "P1", instanceId: silencer.instanceId }).state;
    state = applyAction(state, { type: "SELECT_EFFECT_CARDS", playerId: "P1", instanceIds: [revived.instanceId] }).state;
    expect(state.players.P1.resources.necromancy).toBe(0);
    expect(state.players.P1.minions.some((card) => card.instanceId === revived.instanceId)).toBe(true);
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
