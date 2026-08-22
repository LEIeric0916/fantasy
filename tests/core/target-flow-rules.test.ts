import { describe, expect, it } from "vitest";
import {
  continueAfterMissingLegalTarget,
  isValidTargetSelection,
  shouldExecuteNextRepeatedTargeting,
} from "../../src/game/engine/effectFlow";
import { hasActiveKeyword } from "../../src/game/keywords/keywordRules";
import { aggregateSimultaneousDamage, createTimingContext, wasEligibleAtTimingStart } from "../../src/game/engine/simultaneousEngine";
import { mainState, putCard } from "../helpers";

describe("指定目標不足時的卡文流程", () => {
  it("逗號連接的後續效果停止，句號與分號後的效果繼續", () => {
    expect(continueAfterMissingLegalTarget("COMMA")).toBe(false);
    expect(continueAfterMissingLegalTarget("PERIOD")).toBe(true);
    expect(continueAfterMissingLegalTarget("SEMICOLON")).toBe(true);
  });

  it("同一次多目標指定不可重復 CardInstance，除非卡文明寫允許", () => {
    expect(isValidTargetSelection(["a", "b"], { minimum: 2, maximum: 2 })).toBe(true);
    expect(isValidTargetSelection(["a", "a"], { minimum: 2, maximum: 2 })).toBe(false);
    expect(isValidTargetSelection(["a", "a"], { minimum: 2, maximum: 2, allowRepeatedInstance: true })).toBe(true);
    expect(isValidTargetSelection(["a", "b", "c", "d"], { minimum: 0, maximum: 4 })).toBe(true);
    expect(isValidTargetSelection(["a", "a"], { minimum: 0, maximum: 4 })).toBe(false);
  });

  it("重復執行每次重新指定，中途無合法手下時停止剩余次數", () => {
    expect(shouldExecuteNextRepeatedTargeting(true)).toBe(true);
    expect(shouldExecuteNextRepeatedTargeting(false)).toBe(false);
  });
});

describe("抗性生效區域", () => {
  it("光紋、紀律等抗性只在場上生效", () => {
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

describe("同一時機快照", () => {
  it("同批次新召喚對象不進入舊快照，重復傷害先合計", () => {
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
