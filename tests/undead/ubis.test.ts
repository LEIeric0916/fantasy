import { describe, expect, it } from "vitest";
import { resolvePendingEffects } from "../../src/game/engine/effectEngine";
import { reviveMinion } from "../../src/game/engine/reviveEngine";
import { destroyMinion } from "../../src/game/engine/zoneEngine";
import { mainState, putCard } from "../helpers";

describe("迅疾黑暗騎士 烏比斯", () => {
  it("死亡之聲召喚兩名不朽者之靈", () => {
    const state = mainState();
    const ubis = putCard(state, "P1", "UNDEAD_003", "MINION", "death");
    destroyMinion(state, ubis, "TEST");
    resolvePendingEffects(state);
    expect(state.players.P1.minions.map((card) => card.definitionId)).toEqual([
      "TOKEN_UNDEAD_SPIRIT",
      "TOKEN_UNDEAD_SPIRIT",
    ]);
  });

  it("從棄堆復活時清除傷害並觸發 +2/+0", () => {
    const state = mainState();
    const ubis = putCard(state, "P1", "UNDEAD_003", "MINION", "revive");
    ubis.currentHealth = 0;
    ubis.damageTaken = 1;
    destroyMinion(state, ubis, "TEST");
    resolvePendingEffects(state);
    expect(reviveMinion(state, "P1", ubis)).toBe(true);
    resolvePendingEffects(state);
    expect(ubis).toMatchObject({ zone: "MINION", currentAttack: 3, currentHealth: 1, damageTaken: 0, attacksUsedThisTurn: 0 });
  });

  it("復活獲得的攻擊力會在離場時還原，下一次復活不會重複累積", () => {
    const state = mainState();
    const ubis = putCard(state, "P1", "UNDEAD_003", "MINION", "reset-revive-bonus");
    destroyMinion(state, ubis, "FIRST_DEATH");
    resolvePendingEffects(state);
    expect(reviveMinion(state, "P1", ubis)).toBe(true);
    resolvePendingEffects(state);
    expect(ubis.currentAttack).toBe(3);

    destroyMinion(state, ubis, "SECOND_DEATH");
    expect(ubis.currentAttack).toBe(1);
    expect(ubis.counters.leaveAttackBonus).toBeUndefined();
    resolvePendingEffects(state);
    expect(reviveMinion(state, "P1", ubis)).toBe(true);
    resolvePendingEffects(state);
    expect(ubis.currentAttack).toBe(3);
  });
});
