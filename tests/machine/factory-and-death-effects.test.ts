import { describe, expect, it } from "vitest";
import { applyAction } from "../../src/game/engine/gameEngine";
import { resolvePendingEffects } from "../../src/game/engine/effectEngine";
import { beginTurn } from "../../src/game/engine/turnEngine";
import { destroyMinion } from "../../src/game/engine/zoneEngine";
import { mainState, putCard } from "../helpers";

describe("機械兵工廠與機械衍生手下", () => {
  it("兵工廠入場及成長各召喚1名士兵，倒數結束後回收", () => {
    let state = mainState();
    state.players.P1.faction = "MACHINE";
    const factory = putCard(state, "P1", "MACHINE_008", "HAND", "factory");
    state = applyAction(state, { type: "PLAY_CARD", playerId: "P1", instanceId: factory.instanceId }).state;
    expect(state.players.P1.minions.filter((card) => card.definitionId === "TOKEN_MACHINE_EMPIRE_SOLDIER")).toHaveLength(1);

    const field = state.players.P1.fields.find((card) => card.instanceId === factory.instanceId)!;
    field.counters.countdown = 2;
    state.phase = "END";
    beginTurn(state);
    expect(state.players.P1.minions.filter((card) => card.definitionId === "TOKEN_MACHINE_EMPIRE_SOLDIER")).toHaveLength(2);

    field.counters.countdown = 1;
    state.phase = "END";
    beginTurn(state);
    expect(state.players.P1.deck[0].instanceId).toBe(factory.instanceId);
    expect(state.players.P1.resources.recycleCharge).toBe(1);
  });

  it("機械士兵死亡增加1充能並返回額外區", () => {
    const state = mainState();
    const soldier = putCard(state, "P1", "TOKEN_MACHINE_EMPIRE_SOLDIER", "MINION", "death");
    destroyMinion(state, soldier, "TEST");
    resolvePendingEffects(state);
    expect(state.players.P1.resources.recycleCharge).toBe(1);
    expect(state.players.P1.extraDeck.some((card) => card.instanceId === soldier.instanceId)).toBe(true);
  });

  it("機械毀滅者死亡增加1充能並僅恢復至最大生命", () => {
    const state = mainState();
    state.players.P1.heroHp = 30;
    const destroyer = putCard(state, "P1", "TOKEN_MACHINE_DESTROYER", "MINION", "destroyer");
    destroyMinion(state, destroyer, "TEST");
    resolvePendingEffects(state);
    expect(state.players.P1.resources.recycleCharge).toBe(1);
    expect(state.players.P1.heroHp).toBe(30);
  });

  it("收割者與目標同時死亡時，殺意與死亡之聲都正常結算且不產生攻擊錯誤", () => {
    let state = mainState();
    state.players.P1.faction = "MACHINE";
    const reaper = putCard(state, "P1", "TOKEN_MACHINE_EMPIRE_REAPER", "MINION", "reaper-mutual-kill");
    const defender = putCard(state, "P2", "TOKEN_MACHINE_EMPIRE_REAPER", "MINION", "reaper-target");

    const result = applyAction(state, {
      type: "ATTACK",
      playerId: "P1",
      attackerId: reaper.instanceId,
      target: { type: "MINION", instanceId: defender.instanceId },
    });
    state = result.state;

    expect(result.error).toBeUndefined();
    expect(state.pendingChoice).toBeUndefined();
    expect(state.players.P1.resources.recycleCharge).toBe(3);
    expect(state.players.P2.resources.recycleCharge).toBe(3);
    expect(state.players.P1.extraDeck.some((card) => card.instanceId === reaper.instanceId)).toBe(true);
  });
});
