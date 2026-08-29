import { describe, expect, it } from "vitest";
import { applyAction } from "../../src/game/engine/gameEngine";
import { resolvePendingEffects } from "../../src/game/engine/effectEngine";
import { destroyMinion } from "../../src/game/engine/zoneEngine";
import { mainState, putCard } from "../helpers";

describe("不朽者法師 末日宣告者", () => {
  it("指定兩個不同且當前生命5以下的合法敵方手下轉變為衍生不朽者", () => {
    let state = mainState();
    state.players.P1.hand = [];
    const source = putCard(state, "P1", "UNDEAD_004", "HAND", "battlecry");
    const first = putCard(state, "P2", "UNDEAD_002", "MINION", "first");
    const second = putCard(state, "P2", "DRAGON_003", "MINION", "second");
    const tooHealthy = putCard(state, "P2", "TOKEN_MACHINE_DESTROYER", "MINION", "too-healthy");
    first.currentHealth = 1;
    first.damageTaken = 1;
    second.currentHealth = 5;
    second.maxHealth = 5;
    tooHealthy.currentHealth = 6;
    state = applyAction(state, { type: "PLAY_CARD", playerId: "P1", instanceId: source.instanceId }).state;
    expect(state.pendingChoice).toMatchObject({
      candidateInstanceIds: [first.instanceId, second.instanceId],
    });
    state = applyAction(state, { type: "SELECT_EFFECT_CARDS", playerId: "P1", instanceIds: [first.instanceId, second.instanceId] }).state;
    for (const target of state.players.P2.minions.filter((card) => card.instanceId !== tooHealthy.instanceId)) {
      expect(target.definitionId).toBe("TOKEN_UNDEAD_GENERIC");
      expect(target).toMatchObject({ currentAttack: 2, currentHealth: 2, maxHealth: 2, damageTaken: 0 });
    }
    expect(state.players.P2.minions.find((card) => card.instanceId === tooHealthy.instanceId)?.definitionId).toBe("TOKEN_MACHINE_DESTROYER");
    expect(first.originalDefinitionId).toBe("UNDEAD_002");
    expect(state.players.P2.deck.length).toBeGreaterThan(0);
  });

  it("紀律目標不進入轉變候選；只有一個合法目標時仍可指定並轉變", () => {
    let state = mainState();
    state.players.P1.hand = [];
    const source = putCard(state, "P1", "UNDEAD_004", "HAND", "discipline");
    const legal = putCard(state, "P2", "UNDEAD_001", "MINION", "legal");
    const discipline = putCard(state, "P2", "DRAGON_006", "MINION", "blocked");
    state = applyAction(state, { type: "PLAY_CARD", playerId: "P1", instanceId: source.instanceId }).state;
    expect(state.pendingChoice).toMatchObject({
      type: "EFFECT_CARDS",
      count: 1,
      minCount: 0,
      candidateInstanceIds: [legal.instanceId],
    });
    state = applyAction(state, { type: "SELECT_EFFECT_CARDS", playerId: "P1", instanceIds: [legal.instanceId] }).state;
    expect(state.players.P2.minions.find((card) => card.instanceId === legal.instanceId)?.definitionId).toBe("TOKEN_UNDEAD_GENERIC");
    expect(state.players.P2.minions.find((card) => card.instanceId === discipline.instanceId)?.definitionId).toBe("DRAGON_006");
  });

  it("最多兩個目標允許選擇0個", () => {
    let state = mainState();
    state.players.P1.hand = [];
    const source = putCard(state, "P1", "UNDEAD_004", "HAND", "choose-none");
    const target = putCard(state, "P2", "UNDEAD_001", "MINION", "optional-target");
    state = applyAction(state, { type: "PLAY_CARD", playerId: "P1", instanceId: source.instanceId }).state;
    state = applyAction(state, { type: "SELECT_EFFECT_CARDS", playerId: "P1", instanceIds: [] }).state;
    expect(state.players.P2.minions.find((card) => card.instanceId === target.instanceId)?.definitionId).toBe("UNDEAD_001");
  });

  it("沒有合法目標時記錄可顯示於介面的未發動原因", () => {
    let state = mainState();
    state.players.P1.hand = [];
    const source = putCard(state, "P1", "UNDEAD_004", "HAND", "no-target");
    state = applyAction(state, { type: "PLAY_CARD", playerId: "P1", instanceId: source.instanceId }).state;
    expect(state.effectNotices).toEqual([
      expect.objectContaining({
        playerId: "P1",
        sourceName: "不朽者法師 末日宣告者",
        reason: "對手場上沒有符合轉變條件且不受紀律阻擋的手下",
      }),
    ]);
  });

  it("死亡之聲召喚黑暗之書末日序曲立場", () => {
    const state = mainState();
    const source = putCard(state, "P1", "UNDEAD_004", "MINION", "deathrattle");
    destroyMinion(state, source, "TEST");
    resolvePendingEffects(state);
    expect(state.players.P1.fields.map((card) => card.definitionId)).toContain("TOKEN_UNDEAD_BOOK_DOOM_PRELUDE");
  });
});
