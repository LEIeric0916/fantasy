import { describe, expect, it } from "vitest";
import {
  continueAfterMissingLegalTarget,
  isValidTargetSelection,
  shouldExecuteNextRepeatedTargeting,
} from "../../src/game/engine/effectFlow";
import { hasActiveKeyword } from "../../src/game/keywords/keywordRules";
import { aggregateSimultaneousDamage, createTimingContext, wasEligibleAtTimingStart } from "../../src/game/engine/simultaneousEngine";
import { mainState, putCard } from "../helpers";

describe("指定目标不足时的卡文流程", () => {
  it("逗号连接的后续效果停止，句号与分号后的效果继续", () => {
    expect(continueAfterMissingLegalTarget("COMMA")).toBe(false);
    expect(continueAfterMissingLegalTarget("PERIOD")).toBe(true);
    expect(continueAfterMissingLegalTarget("SEMICOLON")).toBe(true);
  });

  it("同一次多目标指定不可重复 CardInstance，除非卡文明写允许", () => {
    expect(isValidTargetSelection(["a", "b"], { minimum: 2, maximum: 2 })).toBe(true);
    expect(isValidTargetSelection(["a", "a"], { minimum: 2, maximum: 2 })).toBe(false);
    expect(isValidTargetSelection(["a", "a"], { minimum: 2, maximum: 2, allowRepeatedInstance: true })).toBe(true);
    expect(isValidTargetSelection(["a", "b", "c", "d"], { minimum: 0, maximum: 4 })).toBe(true);
    expect(isValidTargetSelection(["a", "a"], { minimum: 0, maximum: 4 })).toBe(false);
  });

  it("重复执行每次重新指定，中途无合法手下时停止剩余次数", () => {
    expect(shouldExecuteNextRepeatedTargeting(true)).toBe(true);
    expect(shouldExecuteNextRepeatedTargeting(false)).toBe(false);
  });
});

describe("抗性生效区域", () => {
  it("光纹、纪律等抗性只在场上生效", () => {
    const state = mainState();
    const ward = putCard(state, "P1", "TOKEN_MACHINE_DIVINE_ENDYMION", "HAND", "ward-hand");
    expect(ward.keywords).toContain("WARD");
    expect(ward.keywords).toContain("DISCIPLINE");
    expect(hasActiveKeyword(ward, "WARD")).toBe(false);
    expect(hasActiveKeyword(ward, "DISCIPLINE")).toBe(false);

    state.players.P1.hand.splice(state.players.P1.hand.indexOf(ward), 1);
    ward.zone = "MINION";
    state.players.P1.minions.push(ward);
    expect(hasActiveKeyword(ward, "WARD")).toBe(true);
    expect(hasActiveKeyword(ward, "DISCIPLINE")).toBe(true);

    ward.zone = "GRAVEYARD";
    expect(hasActiveKeyword(ward, "WARD")).toBe(false);
    expect(hasActiveKeyword(ward, "DISCIPLINE")).toBe(false);
  });
});

describe("同一时机快照", () => {
  it("同批次新召唤对象不进入旧快照，重复伤害先合计", () => {
    const state = mainState();
    const existing = putCard(state, "P2", "UNDEAD_001", "MINION", "timing-existing");
    const timing = createTimingContext(state, "TEST");
    const createdLater = putCard(state, "P2", "TOKEN_UNDEAD_SPIRIT", "MINION", "timing-new");
    expect(wasEligibleAtTimingStart(timing, existing.instanceId)).toBe(true);
    expect(wasEligibleAtTimingStart(timing, createdLater.instanceId)).toBe(false);
    expect(aggregateSimultaneousDamage([
      { targetInstanceId: existing.instanceId, amount: 2 },
      { targetInstanceId: existing.instanceId, amount: 3 },
    ]).get(existing.instanceId)).toBe(5);
  });
});
