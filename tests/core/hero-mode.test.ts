import { describe, expect, it } from "vitest";
import { getLegalActions } from "../../src/game/ai/legalActionEngine";
import type { HeroId } from "../../src/game/heroes/heroDefinitions";
import { applyAction } from "../../src/game/engine/gameEngine";
import { getCardDefinition } from "../../src/game/cards/cardRegistry";
import { mainState, putCard } from "../helpers";

function heroState(heroId: HeroId, turnsStarted: number, mana = 10) {
  const state = mainState();
  state.players.P1.hero = { id: heroId, skillUses: 0, skillUsedThisTurn: false };
  state.players.P1.turnsStarted = turnsStarted;
  state.players.P1.mana = mana;
  return state;
}

describe("英雄模式", () => {
  it("以玩家自己的回合數限制解鎖，且每回合只能使用一次", () => {
    let state = heroState("PALADIN", 2);
    const target = putCard(state, "P1", "NEUTRAL_002", "MINION", "paladin-target");
    let result = applyAction(state, { type: "ACTIVATE_HERO_SKILL", playerId: "P1", targetInstanceId: target.instanceId });
    expect(result.error?.message).toContain("第3回合");

    state.players.P1.turnsStarted = 3;
    result = applyAction(state, { type: "ACTIVATE_HERO_SKILL", playerId: "P1", targetInstanceId: target.instanceId });
    expect(result.error).toBeUndefined();
    state = result.state;
    expect(state.players.P1.minions[0].keywords).toContain("TAUNT");
    expect(state.players.P1.hero).toMatchObject({ skillUses: 1, skillUsedThisTurn: true });
    result = applyAction(state, { type: "ACTIVATE_HERO_SKILL", playerId: "P1", targetInstanceId: target.instanceId });
    expect(result.error?.message).toContain("本回合已使用");
  });

  it("勇者給予+1/+1與衝刺", () => {
    const state = heroState("BRAVE", 4);
    const target = putCard(state, "P1", "NEUTRAL_002", "MINION", "brave-target");
    const result = applyAction(state, { type: "ACTIVATE_HERO_SKILL", playerId: "P1", targetInstanceId: target.instanceId });
    const changed = result.state.players.P1.minions[0];
    expect([changed.currentAttack, changed.currentHealth, changed.maxHealth]).toEqual([3, 4, 4]);
    expect(changed.keywords).toContain("RUSH");
  });

  it("魔術師抽1張牌", () => {
    const state = heroState("MAGICIAN", 2);
    const handBefore = state.players.P1.hand.length;
    const deckBefore = state.players.P1.deck.length;
    const result = applyAction(state, { type: "ACTIVATE_HERO_SKILL", playerId: "P1" });
    expect(result.error).toBeUndefined();
    expect(result.state.players.P1.hand).toHaveLength(handBefore + 1);
    expect(result.state.players.P1.deck).toHaveLength(deckBefore - 1);
  });

  it("騎士消耗1水晶並召喚2/2嘲諷騎士護衛", () => {
    const state = heroState("KNIGHT", 2, 1);
    const result = applyAction(state, { type: "ACTIVATE_HERO_SKILL", playerId: "P1" });
    expect(result.error).toBeUndefined();
    expect(result.state.players.P1.mana).toBe(0);
    const guard = result.state.players.P1.minions[0];
    expect(getCardDefinition(guard.definitionId).name).toBe("騎士護衛");
    expect([guard.currentAttack, guard.currentHealth]).toEqual([2, 2]);
    expect(guard.keywords).toContain("TAUNT");
  });

  it("指揮官消耗1水晶並給予敵方手下4點傷害", () => {
    const state = heroState("COMMANDER", 4, 1);
    const target = putCard(state, "P2", "NEUTRAL_008", "MINION", "commander-target");
    const result = applyAction(state, { type: "ACTIVATE_HERO_SKILL", playerId: "P1", targetInstanceId: target.instanceId });
    expect(result.error).toBeUndefined();
    expect(result.state.players.P1.mana).toBe(0);
    expect(result.state.players.P2.minions[0].currentHealth).toBe(1);
  });

  it("達到總次數或水晶不足時不列為合法行動", () => {
    const capped = heroState("PALADIN", 8);
    capped.players.P1.hero!.skillUses = 3;
    putCard(capped, "P1", "NEUTRAL_002", "MINION", "capped-target");
    expect(getLegalActions(capped, "P1").some((action) => action.type === "ACTIVATE_HERO_SKILL")).toBe(false);

    const noMana = heroState("COMMANDER", 8, 0);
    putCard(noMana, "P2", "NEUTRAL_002", "MINION", "no-mana-target");
    expect(getLegalActions(noMana, "P1").some((action) => action.type === "ACTIVATE_HERO_SKILL")).toBe(false);
  });

  it("合法行動為每個可指定目標各建立一個英雄技能行動", () => {
    const state = heroState("COMMANDER", 4, 1);
    const first = putCard(state, "P2", "NEUTRAL_002", "MINION", "first-target");
    const second = putCard(state, "P2", "NEUTRAL_004", "MINION", "second-target");
    const skills = getLegalActions(state, "P1").filter((action) => action.type === "ACTIVATE_HERO_SKILL");
    expect(skills).toEqual(expect.arrayContaining([
      { type: "ACTIVATE_HERO_SKILL", playerId: "P1", targetInstanceId: first.instanceId },
      { type: "ACTIVATE_HERO_SKILL", playerId: "P1", targetInstanceId: second.instanceId },
    ]));
  });
});
