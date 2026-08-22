import { describe, expect, it } from "vitest";
import { applyAction } from "../../src/game/engine/gameEngine";
import { resolvePendingEffects } from "../../src/game/engine/effectEngine";
import { destroyMinion } from "../../src/game/engine/zoneEngine";
import { mainState, putCard } from "../helpers";

describe("不朽者法师 末日宣告者", () => {
  it("指定两个不同且当前生命5以下的合法敌方手下转变为衍生不朽者", () => {
    let state = mainState();
    state.players.P1.hand = [];
    const source = putCard(state, "P1", "UNDEAD_004", "HAND", "battlecry");
    const first = putCard(state, "P2", "UNDEAD_002", "MINION", "first");
    const second = putCard(state, "P2", "DRAGON_003", "MINION", "second");
    first.currentHealth = 1;
    first.damageTaken = 1;
    state = applyAction(state, { type: "PLAY_CARD", playerId: "P1", instanceId: source.instanceId }).state;
    state = applyAction(state, { type: "SELECT_EFFECT_CARDS", playerId: "P1", instanceIds: [first.instanceId, second.instanceId] }).state;
    for (const target of state.players.P2.minions) {
      expect(target.definitionId).toBe("TOKEN_UNDEAD_GENERIC");
      expect(target).toMatchObject({ currentAttack: 2, currentHealth: 2, maxHealth: 2, damageTaken: 0 });
    }
    expect(first.originalDefinitionId).toBe("UNDEAD_002");
    expect(state.players.P2.deck.length).toBeGreaterThan(0);
  });

  it("纪律目标不进入转变候选；不足两个合法目标时不执行", () => {
    let state = mainState();
    state.players.P1.hand = [];
    const source = putCard(state, "P1", "UNDEAD_004", "HAND", "discipline");
    const legal = putCard(state, "P2", "UNDEAD_001", "MINION", "legal");
    const discipline = putCard(state, "P2", "DRAGON_006", "MINION", "blocked");
    state = applyAction(state, { type: "PLAY_CARD", playerId: "P1", instanceId: source.instanceId }).state;
    expect(state.pendingChoice).toBeUndefined();
    expect(legal.definitionId).toBe("UNDEAD_001");
    expect(discipline.definitionId).toBe("DRAGON_006");
  });

  it("死亡之声召唤黑暗之书末日序曲立场", () => {
    const state = mainState();
    const source = putCard(state, "P1", "UNDEAD_004", "MINION", "deathrattle");
    destroyMinion(state, source, "TEST");
    resolvePendingEffects(state);
    expect(state.players.P1.fields.map((card) => card.definitionId)).toContain("TOKEN_UNDEAD_BOOK_DOOM_PRELUDE");
  });
});
