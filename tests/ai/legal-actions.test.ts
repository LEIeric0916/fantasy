import { describe, expect, it } from "vitest";
import { getActingPlayerId, getLegalActions } from "../../src/game/ai/legalActionEngine";
import { chooseRandomAction } from "../../src/game/ai/randomPolicy";
import { applyAction } from "../../src/game/engine/gameEngine";
import { createInitialGame } from "../../src/game/state/createInitialGame";
import { mainState, putCard } from "../helpers";

describe("AI 合法行動產生器", () => {
  it("產生的主要階段行動都能由正式引擎接受", () => {
    const state = mainState();
    putCard(state, "P1", "TOKEN_MACHINE_EMPIRE_REAPER", "MINION", "ai-attacker");
    putCard(state, "P2", "DRAGON_001", "MINION", "ai-target");
    for (const action of getLegalActions(state, "P1")) {
      expect(applyAction(state, action).error, JSON.stringify(action)).toBeUndefined();
    }
  });

  it("效果指定只產生符合最少與最多數量的組合", () => {
    const state = mainState();
    const source = putCard(state, "P1", "MACHINE_007", "HAND", "ai-choice-source");
    const first = putCard(state, "P1", "DRAGON_001", "HAND", "ai-choice-1");
    const second = putCard(state, "P1", "DRAGON_002", "HAND", "ai-choice-2");
    state.pendingChoice = {
      type: "EFFECT_CARDS",
      playerId: "P1",
      sourceInstanceId: source.instanceId,
      prompt: "選擇0～2張",
      count: 2,
      minCount: 0,
      candidateInstanceIds: [first.instanceId, second.instanceId],
      resolution: { type: "RETURN_HAND_TO_DECK_MACHINE_DISCOUNT", reductionPerCard: 2 },
      remainingEffects: [],
    };
    const actions = getLegalActions(state, "P1");
    expect(actions).toHaveLength(4);
    expect(actions.every((action) => action.type === "SELECT_EFFECT_CARDS" && action.instanceIds.length <= 2)).toBe(true);
    expect(actions.every((action) => applyAction(state, action).error === undefined)).toBe(true);
  });

  it("相同狀態與種子會選擇相同隨機行動", () => {
    const state = mainState();
    expect(chooseRandomAction(state, "P1", 123)).toEqual(chooseRandomAction(state, "P1", 123));
  });
});

describe("隨機 AI 自動對局", () => {
  it.each([
    ["DRAGON", "MACHINE"],
    ["UNDEAD", "ALLIANCE"],
  ] as const)("%s 對 %s 能在行動上限內完成且不產生非法行動", (firstFaction, secondFaction) => {
    let state = createInitialGame({ factions: { P1: firstFaction, P2: secondFaction }, seed: 41 });
    let aiSeed = 991;
    let steps = 0;
    while (state.phase !== "GAME_OVER" && steps < 3000) {
      const playerId = getActingPlayerId(state);
      expect(playerId).toBeDefined();
      const decision = chooseRandomAction(state, playerId!, aiSeed);
      aiSeed = decision.seed;
      expect(decision.action, `第 ${steps} 步沒有合法行動：${JSON.stringify({ phase: state.phase, activePlayerId: state.activePlayerId, pendingChoice: state.pendingChoice, pendingEffects: state.pendingEffects })}`).toBeDefined();
      const result = applyAction(state, decision.action!);
      expect(result.error, `第 ${steps} 步 ${JSON.stringify(decision.action)}`).toBeUndefined();
      state = result.state;
      steps += 1;
    }
    expect(state.phase, `超過 ${steps} 步仍未結束`).toBe("GAME_OVER");
  });
});
