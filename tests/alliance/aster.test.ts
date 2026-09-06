import { describe, expect, it } from "vitest";
import { applyAction } from "../../src/game/engine/gameEngine";
import { getCardDefinition } from "../../src/game/cards/cardRegistry";
import { mainState, putCard } from "../helpers";

describe("共和軍戰術調律者 亞斯特", () => {
  it("是聯盟牌組中的3張4費2/5人類指揮官，並具有紀律", () => {
    expect(getCardDefinition("ALLIANCE_014")).toMatchObject({
      name: "共和軍戰術調律者 亞斯特",
      faction: "ALLIANCE",
      originalCost: 4,
      attack: 2,
      health: 5,
      deckCount: 3,
      subtype: ["HUMAN", "COMMANDER"],
    });
    expect(getCardDefinition("ALLIANCE_014").keywords).toContain("DISCIPLINE");
    expect(getCardDefinition("ALLIANCE_013").deckCount).toBe(2);
  });

  it("戰吼恢復我方玩家4HP", () => {
    let state = mainState();
    state.players.P1.hand = [];
    state.players.P1.heroHp = 20;
    const aster = putCard(state, "P1", "ALLIANCE_014", "HAND", "battlecry");

    state = applyAction(state, { type: "PLAY_CARD", playerId: "P1", instanceId: aster.instanceId }).state;

    expect(state.players.P1.heroHp).toBe(24);
    expect(state.players.P1.minions.find((card) => card.instanceId === aster.instanceId)?.keywords).not.toContain("DIVINE_SHIELD");
  });

  it("協作15時，戰吼使自身獲得聖盾術", () => {
    let state = mainState();
    state.players.P1.hand = [];
    state.players.P1.summonedThisGame = 14;
    const aster = putCard(state, "P1", "ALLIANCE_014", "HAND", "collaboration-shield");

    state = applyAction(state, { type: "PLAY_CARD", playerId: "P1", instanceId: aster.instanceId }).state;

    expect(state.players.P1.minions.find((card) => card.instanceId === aster.instanceId)?.keywords).toContain("DIVINE_SHIELD");
  });

  it("回合結束時，軍隊恢復全體手下3HP，指揮官指定敵方手下造成5點傷害", () => {
    let state = mainState();
    const aster = putCard(state, "P1", "ALLIANCE_014", "MINION", "end-turn");
    const army = putCard(state, "P1", "ALLIANCE_001", "MINION", "army");
    const otherCommander = putCard(state, "P1", "ALLIANCE_005", "MINION", "other-commander");
    otherCommander.sealed = true;
    const enemy = putCard(state, "P2", "ALLIANCE_012", "MINION", "enemy");
    aster.currentHealth = 1;
    aster.damageTaken = 4;
    army.currentHealth = 1;
    army.damageTaken = 1;

    state = applyAction(state, { type: "END_TURN", playerId: "P1" }).state;
    expect(state.players.P1.minions.find((card) => card.instanceId === aster.instanceId)?.currentHealth).toBe(4);
    expect(state.players.P1.minions.find((card) => card.instanceId === army.instanceId)?.currentHealth).toBe(2);
    expect(state.pendingChoice).toMatchObject({
      type: "EFFECT_CARDS",
      candidateInstanceIds: [enemy.instanceId],
    });

    state = applyAction(state, { type: "SELECT_EFFECT_CARDS", playerId: "P1", instanceIds: [enemy.instanceId] }).state;
    expect(state.players.P2.minions.find((card) => card.instanceId === enemy.instanceId)?.currentHealth).toBe(3);
  });

  it("只看其他手下類型，場上只有亞斯特時兩種回合結束效果都不發動", () => {
    let state = mainState();
    const aster = putCard(state, "P1", "ALLIANCE_014", "MINION", "commander-only");
    const enemy = putCard(state, "P2", "ALLIANCE_012", "MINION", "enemy");
    aster.currentHealth = 1;
    aster.damageTaken = 4;

    state = applyAction(state, { type: "END_TURN", playerId: "P1" }).state;

    expect(state.players.P1.minions.find((card) => card.instanceId === aster.instanceId)?.currentHealth).toBe(1);
    expect(state.pendingChoice).toBeUndefined();
    expect(state.players.P2.minions.find((card) => card.instanceId === enemy.instanceId)?.currentHealth).toBe(8);
  });
});
