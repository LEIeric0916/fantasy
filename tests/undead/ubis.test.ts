import { describe, expect, it } from "vitest";
import { resolvePendingEffects } from "../../src/game/engine/effectEngine";
import { reviveMinion } from "../../src/game/engine/reviveEngine";
import { destroyMinion } from "../../src/game/engine/zoneEngine";
import { mainState, putCard } from "../helpers";

describe("迅疾黑暗骑士 乌比斯", () => {
  it("死亡之声召唤两名不朽者之灵", () => {
    const state = mainState();
    const ubis = putCard(state, "P1", "UNDEAD_003", "MINION", "death");
    destroyMinion(state, ubis, "TEST");
    resolvePendingEffects(state);
    expect(state.players.P1.minions.map((card) => card.definitionId)).toEqual([
      "TOKEN_UNDEAD_SPIRIT",
      "TOKEN_UNDEAD_SPIRIT",
    ]);
  });

  it("从弃堆复活时清除伤害并触发 +2/+0", () => {
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
});
