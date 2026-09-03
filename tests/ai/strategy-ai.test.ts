import { describe, expect, it } from "vitest";
import { chooseAiAction, type AiDifficulty } from "../../src/game/ai/aiPolicy";
import { evaluateFactionStrategy, FACTION_STRATEGY_PROFILES } from "../../src/game/ai/factionStrategy";
import { chooseHeuristicAction } from "../../src/game/ai/heuristicPolicy";
import { getActingPlayerId } from "../../src/game/ai/legalActionEngine";
import { chooseSearchAction } from "../../src/game/ai/searchPolicy";
import { evaluatePublicState } from "../../src/game/ai/stateEvaluator";
import { refreshHandCosts } from "../../src/game/engine/costEngine";
import { applyAction } from "../../src/game/engine/gameEngine";
import { createInitialGame } from "../../src/game/state/createInitialGame";
import { createCardInstance } from "../../src/game/state/CardInstance";
import { getCardDefinition } from "../../src/game/cards/cardRegistry";
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

  it("困難聯盟 AI 會先打出減費連動牌，不會急著裸下皇家戰士", () => {
    const state = mainState();
    state.players.P1.faction = "ALLIANCE";
    state.players.P1.hand = [];
    state.players.P1.deck = [];
    state.players.P1.mana = 9;
    state.players.P1.maxMana = 9;
    state.players.P1.summonedThisTurn = 0;
    state.players.P1.summonedThisGame = 8;

    const das = putCard(state, "P1", "ALLIANCE_007", "HAND", "discount-enabler");
    putCard(state, "P1", "ALLIANCE_010", "HAND", "expensive-warrior");
    putCard(state, "P1", "ALLIANCE_002", "HAND", "extra-minion");
    for (let index = 0; index < 5; index += 1) {
      const enemy = putCard(state, "P2", "TOKEN_ALLIANCE_ROYAL_GUARD", "MINION", `minor-enemy-${index}`);
      enemy.currentAttack = 0;
    }
    for (const definitionId of ["ALLIANCE_002", "ALLIANCE_004", "ALLIANCE_006"]) {
      state.players.P1.deck.push(createCardInstance(getCardDefinition(definitionId), "P1", "DECK", `P1-${definitionId}-deck`));
    }
    refreshHandCosts(state);

    expect(das.currentCost).toBe(0);
    const decision = chooseSearchAction(state, "P1", 123);
    expect(decision.action).toEqual({
      type: "PLAY_CARD",
      playerId: "P1",
      instanceId: das.instanceId,
    });
  });

  it("困難聯盟 AI 滿血且我方手下生命都不超過4時，不會優先打出瓦倫泰", () => {
    const state = mainState();
    state.players.P1.faction = "ALLIANCE";
    state.players.P1.hand = [];
    state.players.P1.heroHp = state.players.P1.heroMaxHp;
    state.players.P1.mana = 10;
    state.players.P1.maxMana = 10;
    const lowHealthAlly = putCard(state, "P1", "ALLIANCE_002", "MINION", "low-health-ally");
    lowHealthAlly.currentHealth = 4;
    const highDamageThreat = putCard(state, "P2", "UNDEAD_012", "MINION", "high-damage-threat");
    highDamageThreat.currentAttack = 6;
    putCard(state, "P1", "TOKEN_ALLIANCE_HERO_VALENTINE", "HAND", "low-value-valentine");
    const useful = putCard(state, "P1", "ALLIANCE_002", "HAND", "useful-development");
    refreshHandCosts(state);

    const decision = chooseSearchAction(state, "P1", 222);
    expect(decision.action).toEqual({
      type: "PLAY_CARD",
      playerId: "P1",
      instanceId: useful.instanceId,
    });
  });

  it("困難不朽 AI 會把亞恩的聖盾術給高價值手下而不是普通不朽者", () => {
    let state = mainState();
    state.players.P1.heroHp = 20;
    const yaan = putCard(state, "P1", "UNDEAD_008", "MINION", "shield-source");
    putCard(state, "P1", "TOKEN_UNDEAD_GENERIC", "MINION", "weak-target");

    state = applyAction(state, { type: "END_TURN", playerId: "P1" }).state;
    expect(chooseSearchAction(state, "P1", 303).action).toEqual({
      type: "SELECT_EFFECT_CARDS",
      playerId: "P1",
      instanceIds: [yaan.instanceId],
    });
  });

  it("困難聯盟 AI 會把焰騎士長的聖盾術給高價值手下而不是1/1皇家衛兵", () => {
    let state = mainState();
    const captain = putCard(state, "P1", "ALLIANCE_005", "MINION", "shield-captain");
    captain.keywords = captain.keywords.filter((keyword) => keyword !== "DIVINE_SHIELD");
    putCard(state, "P1", "TOKEN_ALLIANCE_ROYAL_GUARD", "MINION", "weak-guard");

    state = applyAction(state, { type: "END_TURN", playerId: "P1" }).state;
    expect(chooseSearchAction(state, "P1", 304).action).toEqual({
      type: "SELECT_EFFECT_CARDS",
      playerId: "P1",
      instanceIds: [captain.instanceId],
    });
  });

  it("困難不朽 AI 不會在對手空場時花幸運幣打出沉默者浪費戰吼", () => {
    const state = mainState();
    state.players.P1.faction = "UNDEAD";
    state.players.P1.hand = [];
    state.players.P1.mana = 1;
    state.players.P1.maxMana = 1;
    putCard(state, "P1", "TOKEN_COIN", "HAND", "coin");
    putCard(state, "P1", "UNDEAD_002", "HAND", "silencer");
    putCard(state, "P1", "DRAGON_012", "HAND", "discard-cost");
    refreshHandCosts(state);

    expect(chooseSearchAction(state, "P1", 305).action).toEqual({ type: "END_TURN", playerId: "P1" });
  });

  it("困難機械 AI 會先建立神器再打出依賴神器的機械神教徒", () => {
    const state = mainState();
    state.players.P1.faction = "MACHINE";
    state.players.P1.hand = [];
    state.players.P1.mana = 2;
    state.players.P1.maxMana = 2;
    const artifact = putCard(state, "P1", "MACHINE_005", "HAND", "artifact-first");
    putCard(state, "P1", "MACHINE_002", "HAND", "cultist-second");
    refreshHandCosts(state);

    expect(chooseSearchAction(state, "P1", 306).action).toEqual({
      type: "PLAY_CARD",
      playerId: "P1",
      instanceId: artifact.instanceId,
    });
  });

  it("困難機械 AI 前期可直接打考爾時不會浪費降神術把考爾降為0費", () => {
    const state = mainState();
    state.players.P1.faction = "MACHINE";
    state.players.P1.hand = [];
    state.players.P1.mana = 3;
    state.players.P1.maxMana = 3;
    state.players.P1.turnsStarted = 3;
    const kaor = putCard(state, "P1", "MACHINE_006", "HAND", "direct-kaor");
    putCard(state, "P1", "MACHINE_007", "HAND", "wasteful-descent");
    putCard(state, "P1", "MACHINE_009", "HAND", "valuable-card-one");
    putCard(state, "P1", "MACHINE_010", "HAND", "valuable-card-two");
    refreshHandCosts(state);

    expect(chooseSearchAction(state, "P1", 307).action).toEqual({
      type: "PLAY_CARD",
      playerId: "P1",
      instanceId: kaor.instanceId,
    });
  });

  it("困難機械 AI 前期已打出降神術時不會為減費洗回兩張高價值牌", () => {
    let state = mainState();
    state.players.P1.faction = "MACHINE";
    state.players.P1.hand = [];
    state.players.P1.mana = 3;
    state.players.P1.maxMana = 3;
    state.players.P1.turnsStarted = 3;
    const descent = putCard(state, "P1", "MACHINE_007", "HAND", "played-descent");
    putCard(state, "P1", "MACHINE_006", "HAND", "kept-kaor");
    putCard(state, "P1", "MACHINE_009", "HAND", "kept-value-one");
    putCard(state, "P1", "MACHINE_010", "HAND", "kept-value-two");
    refreshHandCosts(state);

    state = applyAction(state, { type: "PLAY_CARD", playerId: "P1", instanceId: descent.instanceId }).state;
    expect(chooseSearchAction(state, "P1", 308).action).toEqual({
      type: "SELECT_EFFECT_CARDS",
      playerId: "P1",
      instanceIds: [],
    });
  });

  it("困難機械 AI 能同回合打出神器與慕留斯時會先建立神器", () => {
    let state = mainState();
    state.players.P1.faction = "MACHINE";
    state.players.P1.hand = [];
    state.players.P1.mana = 10;
    state.players.P1.maxMana = 10;
    for (let index = 0; index < 4; index += 1) {
      putCard(state, "P1", "TOKEN_MACHINE_ARTIFACT_BOX", "FIELD", `existing-artifact-${index}`);
    }
    const collector = putCard(state, "P1", "MACHINE_005", "HAND", "collector-before-mulius");
    const mulius = putCard(state, "P1", "MACHINE_014", "HAND", "delayed-mulius");
    putCard(state, "P2", "TOKEN_MACHINE_DESTROYER", "MINION", "mulius-target");
    refreshHandCosts(state);

    expect(chooseSearchAction(state, "P1", 312).action).toEqual({
      type: "PLAY_CARD",
      playerId: "P1",
      instanceId: collector.instanceId,
    });
    state = applyAction(state, { type: "PLAY_CARD", playerId: "P1", instanceId: collector.instanceId }).state;
    expect(chooseSearchAction(state, "P1", 315).action).toEqual({
      type: "PLAY_CARD",
      playerId: "P1",
      instanceId: mulius.instanceId,
    });
  });

  it("困難機械 AI 後期不會用降神術只為了把3費考爾降成0費", () => {
    let state = mainState();
    state.players.P1.faction = "MACHINE";
    state.players.P1.hand = [];
    state.players.P1.mana = 10;
    state.players.P1.maxMana = 10;
    state.players.P1.turnsStarted = 8;
    const kaor = putCard(state, "P1", "MACHINE_006", "HAND", "late-kaor");
    const descent = putCard(state, "P1", "MACHINE_007", "HAND", "late-wasteful-descent");
    putCard(state, "P1", "DRAGON_001", "HAND", "late-return-one");
    putCard(state, "P1", "DRAGON_002", "HAND", "late-return-two");
    refreshHandCosts(state);

    expect(chooseSearchAction(state, "P1", 313).action).not.toEqual({
      type: "PLAY_CARD",
      playerId: "P1",
      instanceId: descent.instanceId,
    });

    state = applyAction(state, { type: "PLAY_CARD", playerId: "P1", instanceId: descent.instanceId }).state;
    expect(chooseSearchAction(state, "P1", 314).action).toEqual({
      type: "SELECT_EFFECT_CARDS",
      playerId: "P1",
      instanceIds: [],
    });
  });

  it("困難龍族 AI 前期會優先使用轉費提升水晶，而不是打聖印白龍或幸運幣", () => {
    const state = mainState();
    state.players.P1.faction = "DRAGON";
    state.players.P1.hand = [];
    state.players.P1.mana = 2;
    state.players.P1.maxMana = 2;
    putCard(state, "P1", "TOKEN_COIN", "HAND", "saved-coin");
    putCard(state, "P1", "DRAGON_001", "HAND", "white-dragon");
    const ramp = putCard(state, "P1", "DRAGON_010", "HAND", "ramp-first");
    const minorEnemy = putCard(state, "P2", "TOKEN_ALLIANCE_ROYAL_GUARD", "MINION", "minor-pressure");
    minorEnemy.currentAttack = 1;
    refreshHandCosts(state);

    expect(chooseSearchAction(state, "P1", 316).action).toEqual({
      type: "PLAY_ALTERNATE",
      playerId: "P1",
      instanceId: ramp.instanceId,
    });
  });

  it("困難龍族 AI 不會只為了前期召喚聖印白龍而過早使用幸運幣", () => {
    const state = mainState();
    state.players.P1.faction = "DRAGON";
    state.players.P1.hand = [];
    state.players.P1.mana = 1;
    state.players.P1.maxMana = 1;
    putCard(state, "P1", "TOKEN_COIN", "HAND", "early-coin");
    putCard(state, "P1", "DRAGON_001", "HAND", "early-white-dragon");
    const minorEnemy = putCard(state, "P2", "TOKEN_ALLIANCE_ROYAL_GUARD", "MINION", "minor-enemy");
    minorEnemy.currentAttack = 1;
    refreshHandCosts(state);

    expect(chooseSearchAction(state, "P1", 317).action).toEqual({ type: "END_TURN", playerId: "P1" });
  });

  it("困難龍族 AI 的效果傷害會優先真正消滅手下，不會打在聖盾上做無效解場", () => {
    let state = mainState();
    state.players.P1.faction = "DRAGON";
    state.players.P1.hand = [];
    state.players.P1.mana = 4;
    state.players.P1.maxMana = 4;
    const reveler = putCard(state, "P1", "DRAGON_003", "HAND", "effective-clear");
    const shielded = putCard(state, "P2", "TOKEN_MACHINE_DESTROYER", "MINION", "shielded-target");
    shielded.keywords.push("DIVINE_SHIELD");
    const killable = putCard(state, "P2", "DRAGON_002", "MINION", "killable-target");
    killable.keywords = killable.keywords.filter((keyword) => keyword !== "DIVINE_SHIELD");
    refreshHandCosts(state);

    state = applyAction(state, { type: "PLAY_CARD", playerId: "P1", instanceId: reveler.instanceId }).state;
    expect(chooseSearchAction(state, "P1", 318).action).toEqual({
      type: "SELECT_EFFECT_CARDS",
      playerId: "P1",
      instanceIds: [killable.instanceId],
    });
  });

  it.each([
    ["普通", chooseHeuristicAction],
    ["困難", chooseSearchAction],
  ] as const)("%s 機械 AI 不會讓0攻且持有聖盾術的機械帝國牧師進行無效攻擊", (_label, choose) => {
    const state = mainState();
    state.players.P1.faction = "MACHINE";
    state.players.P1.hand = [];
    const priest = putCard(state, "P1", "TOKEN_MACHINE_PRIEST", "MINION", "protected-priest");
    priest.keywords.push("DIVINE_SHIELD");
    putCard(state, "P2", "TOKEN_MACHINE_DESTROYER", "MINION", "counterattacker");

    expect(choose(state, "P1", 319).action).toEqual({ type: "END_TURN", playerId: "P1" });
  });

  it.each([
    ["普通", chooseHeuristicAction],
    ["困難", chooseSearchAction],
  ] as const)("%s 不朽者 AI 會優先捨棄具有被捨棄效果的烏比斯", (_label, choose) => {
    const state = mainState();
    state.players.P1.faction = "UNDEAD";
    state.players.P1.hand = [];
    const source = putCard(state, "P1", "UNDEAD_002", "MINION", "discard-source");
    const ubis = putCard(state, "P1", "UNDEAD_003", "HAND", "discard-payoff");
    const ordinary = putCard(state, "P1", "UNDEAD_001", "HAND", "ordinary-discard");
    state.pendingChoice = {
      type: "EFFECT_CARDS",
      playerId: "P1",
      sourceInstanceId: source.instanceId,
      prompt: "指定捨棄1張手牌",
      count: 1,
      candidateInstanceIds: [ordinary.instanceId, ubis.instanceId],
      resolution: { type: "DISCARD_HAND" },
      remainingEffects: [],
    };

    expect(choose(state, "P1", 320).action).toEqual({
      type: "SELECT_EFFECT_CARDS",
      playerId: "P1",
      instanceIds: [ubis.instanceId],
    });
  });

  it.each([
    ["普通", chooseHeuristicAction],
    ["困難", chooseSearchAction],
  ] as const)("%s 不朽者 AI 在死靈數足夠時會優先捨棄可立即死靈復活的手下", (_label, choose) => {
    const state = mainState();
    state.players.P1.faction = "UNDEAD";
    state.players.P1.hand = [];
    state.players.P1.resources.necromancy = 5;
    const source = putCard(state, "P1", "UNDEAD_002", "MINION", "revive-discard-source");
    const emperor = putCard(state, "P1", "UNDEAD_009", "HAND", "revive-discard");
    const ordinary = putCard(state, "P1", "UNDEAD_001", "HAND", "ordinary-option");
    state.pendingChoice = {
      type: "EFFECT_CARDS",
      playerId: "P1",
      sourceInstanceId: source.instanceId,
      prompt: "指定捨棄1張手牌",
      count: 1,
      candidateInstanceIds: [ordinary.instanceId, emperor.instanceId],
      resolution: { type: "DISCARD_HAND" },
      remainingEffects: [],
    };

    expect(choose(state, "P1", 321).action).toEqual({
      type: "SELECT_EFFECT_CARDS",
      playerId: "P1",
      instanceIds: [emperor.instanceId],
    });
  });

  it("困難 AI 場地接近滿且互換能保留額外召喚時會先攻擊騰出空位", () => {
    const state = mainState();
    state.players.P1.faction = "ALLIANCE";
    state.players.P1.hand = [];
    state.players.P1.deck = [];
    state.players.P1.mana = 9;
    state.players.P1.maxMana = 9;
    state.players.P1.turnsStarted = 5;
    state.players.P1.summonedThisGame = 15;
    state.players.P1.summonedThisTurn = 0;

    const attacker = putCard(state, "P1", "ALLIANCE_004", "MINION", "space-trader");
    attacker.currentAttack = 8;
    attacker.currentHealth = 8;
    attacker.maxHealth = 8;
    for (let index = 0; index < 5; index += 1) {
      putCard(state, "P1", "TOKEN_ALLIANCE_ROYAL_GUARD", "MINION", `occupied-${index}`);
    }
    const threat = putCard(state, "P2", "TOKEN_MACHINE_DESTROYER", "MINION", "large-threat");
    threat.currentAttack = 8;
    threat.currentHealth = 8;
    threat.maxHealth = 8;
    putCard(state, "P1", "ALLIANCE_010", "HAND", "board-expander");
    refreshHandCosts(state);

    const tradeAction = {
      type: "ATTACK" as const,
      playerId: "P1" as const,
      attackerId: attacker.instanceId,
      target: { type: "MINION" as const, instanceId: threat.instanceId },
    };
    expect(chooseSearchAction(state, "P1", 309).action).toEqual(tradeAction);
  });

  it("困難聯盟 AI 局面安全且本回合能補足協作15時會先累積協作再打皇家戰士", () => {
    const state = mainState();
    state.players.P1.faction = "ALLIANCE";
    state.players.P1.hand = [];
    state.players.P1.deck = [];
    state.players.P1.mana = 10;
    state.players.P1.maxMana = 10;
    state.players.P1.turnsStarted = 5;
    state.players.P1.summonedThisGame = 13;
    const setup = putCard(state, "P1", "TOKEN_ALLIANCE_ROYAL_GUARD", "HAND", "collaboration-setup");
    putCard(state, "P1", "ALLIANCE_010", "HAND", "waiting-warrior");
    refreshHandCosts(state);

    expect(chooseSearchAction(state, "P1", 310).action).toEqual({
      type: "PLAY_CARD",
      playerId: "P1",
      instanceId: setup.instanceId,
    });
  });

  it("困難聯盟 AI 場面壓力高時即使協作未達15仍會直接召喚皇家戰士", () => {
    const state = mainState();
    state.players.P1.faction = "ALLIANCE";
    state.players.P1.hand = [];
    state.players.P1.deck = [];
    state.players.P1.mana = 9;
    state.players.P1.maxMana = 9;
    state.players.P1.turnsStarted = 5;
    state.players.P1.summonedThisGame = 7;
    const warrior = putCard(state, "P1", "ALLIANCE_010", "HAND", "pressure-warrior");
    putCard(state, "P2", "TOKEN_MACHINE_DESTROYER", "MINION", "pressure-one");
    putCard(state, "P2", "TOKEN_MACHINE_DESTROYER", "MINION", "pressure-two");
    refreshHandCosts(state);

    expect(chooseSearchAction(state, "P1", 311).action).toEqual({
      type: "PLAY_CARD",
      playerId: "P1",
      instanceId: warrior.instanceId,
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
  }, 90_000);
});
