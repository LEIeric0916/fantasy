import { describe, expect, it } from "vitest";
import { chooseAiAction, type AiDifficulty } from "../../src/game/ai/aiPolicy";
import { evaluateFactionStrategy, FACTION_STRATEGY_PROFILES } from "../../src/game/ai/factionStrategy";
import { chooseHeuristicAction } from "../../src/game/ai/heuristicPolicy";
import { getActingPlayerId } from "../../src/game/ai/legalActionEngine";
import { chooseSearchAction } from "../../src/game/ai/searchPolicy";
import { evaluatePublicState } from "../../src/game/ai/stateEvaluator";
import { applyAction } from "../../src/game/engine/gameEngine";
import { createInitialGame } from "../../src/game/state/createInitialGame";
import { mainState, putCard } from "../helpers";

describe("AI 公開局面評分", () => {
  it("不會因對手相同數量的隱藏手牌換成其他卡而改變", () => {
    const first = mainState();
    const second = structuredClone(first);
    expect(second.players.P2.hand.length).toBeGreaterThan(0);
    for (const card of second.players.P2.hand) {
      card.definitionId = "TOKEN_COIN";
      card.originalDefinitionId = "TOKEN_COIN";
      card.currentCost = 0;
    }
    expect(evaluatePublicState(second, "P1")).toBe(evaluatePublicState(first, "P1"));
  });

  it.each([
    ["普通", chooseHeuristicAction],
    ["困難", chooseSearchAction],
  ] as const)("%s AI 看到斬殺時會攻擊英雄", (_label, choose) => {
    const state = mainState();
    const attacker = putCard(state, "P1", "TOKEN_DRAGON_HELLFIRE", "MINION", "lethal");
    state.players.P2.heroHp = attacker.currentAttack ?? 1;
    const decision = choose(state, "P1", 73);
    expect(decision.action).toEqual({
      type: "ATTACK",
      playerId: "P1",
      attackerId: attacker.instanceId,
      target: { type: "HERO", playerId: "P2" },
    });
  });

  it("困難 AI 面對對方下回合斬殺場攻時會優先解場", () => {
    const state = mainState();
    state.players.P1.hand = [];
    state.players.P1.heroHp = 4;
    const attacker = putCard(state, "P1", "TOKEN_DRAGON_HELLFIRE", "MINION", "clear-threat");
    attacker.keywords = [];
    const threat = putCard(state, "P2", "UNDEAD_007", "MINION", "lethal-threat");
    state.players.P2.heroHp = 30;
    const decision = chooseSearchAction(state, "P1", 91);
    expect(decision.action).toEqual({
      type: "ATTACK",
      playerId: "P1",
      attackerId: attacker.instanceId,
      target: { type: "MINION", instanceId: threat.instanceId },
    });
  });

  it("四個陣營都有可閱讀的主要戰術與對手預測資料", () => {
    for (const faction of ["DRAGON", "UNDEAD", "MACHINE", "ALLIANCE"] as const) {
      expect(FACTION_STRATEGY_PROFILES[faction].primaryPlan.length).toBeGreaterThan(0);
      expect(FACTION_STRATEGY_PROFILES[faction].expectedOpponentPlan.length).toBeGreaterThan(0);
    }
  });

  it("不朽 AI 在直接戰力落後時會提高末日之書路線權重", () => {
    const stable = mainState();
    stable.players.P1.faction = "UNDEAD";
    stable.players.P2.faction = "DRAGON";
    putCard(stable, "P1", "TOKEN_UNDEAD_BOOK_DOOM_PRELUDE", "FIELD", "fallback-plan");
    const threatened = structuredClone(stable);
    putCard(threatened, "P2", "TOKEN_DRAGON_HELLFIRE", "MINION", "large-opponent-board");
    expect(evaluateFactionStrategy(threatened, "P1")).toBeGreaterThan(evaluateFactionStrategy(stable, "P1"));
  });

  it("困難不朽 AI 會推進已接近完成的末日序曲路線", () => {
    const state = mainState();
    state.players.P1.faction = "UNDEAD";
    state.players.P1.hand = [];
    putCard(state, "P1", "TOKEN_UNDEAD_BOOK_DOOM_PRELUDE", "FIELD", "prelude-one");
    putCard(state, "P1", "TOKEN_UNDEAD_BOOK_DOOM_PRELUDE", "FIELD", "prelude-two");
    const third = putCard(state, "P1", "TOKEN_UNDEAD_BOOK_DOOM_PRELUDE", "HAND", "prelude-three");
    expect(chooseSearchAction(state, "P1", 123).action).toEqual({
      type: "PLAY_CARD",
      playerId: "P1",
      instanceId: third.instanceId,
    });
  });
});

describe("AI 難度自動對局", () => {
  it.each([
    ["RANDOM", "HEURISTIC"],
    ["HEURISTIC", "SEARCH"],
  ] as const)("%s 對 %s 的所有決策都能被正式引擎接受", (p1Difficulty, p2Difficulty) => {
    let state = createInitialGame({ factions: { P1: "DRAGON", P2: "MACHINE" }, seed: 67 });
    const seeds = { P1: 101, P2: 202 };
    const difficulties: Record<"P1" | "P2", AiDifficulty> = { P1: p1Difficulty, P2: p2Difficulty };
    let steps = 0;
    while (state.phase !== "GAME_OVER" && steps < 3000) {
      const playerId = getActingPlayerId(state);
      expect(playerId).toBeDefined();
      const decision = chooseAiAction(state, playerId!, seeds[playerId!], difficulties[playerId!]);
      seeds[playerId!] = decision.seed;
      expect(decision.action, `第 ${steps} 步沒有合法行動`).toBeDefined();
      const result = applyAction(state, decision.action!);
      expect(result.error, `第 ${steps} 步 ${JSON.stringify(decision.action)}`).toBeUndefined();
      state = result.state;
      steps += 1;
    }
    expect(state.phase, `超過 ${steps} 步仍未結束`).toBe("GAME_OVER");
  }, 30_000);
});
