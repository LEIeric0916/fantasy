import { describe, expect, it } from "vitest";
import { applyAction } from "../../src/game/engine/gameEngine";
import { mainState, putCard } from "../helpers";

describe("神威焰龍回合結束二選一", () => {
  it("最大水晶10以上時，選擇畫面直接顯示5傷並對敵方全體與玩家造成5傷", () => {
    let state = mainState();
    const dragon = putCard(state, "P1", "DRAGON_005", "MINION", "damage-choice");
    const enemy = putCard(state, "P2", "DRAGON_012", "MINION", "enemy");
    state = applyAction(state, { type: "END_TURN", playerId: "P1" }).state;
    expect(state.phase).toBe("END");
    expect(state.pendingChoice).toMatchObject({ type: "EFFECT_OPTION", sourceInstanceId: dragon.instanceId });
    const choice = state.pendingChoice as Extract<typeof state.pendingChoice, { type: "EFFECT_OPTION" }>;
    expect(choice.options.find((option) => option.id === "DAMAGE")?.label).toContain("5 點傷害");

    state = applyAction(state, { type: "SELECT_EFFECT_OPTION", playerId: "P1", optionId: "DAMAGE" }).state;
    expect(state.players.P2.minions.find((card) => card.instanceId === enemy.instanceId)?.currentHealth).toBe(7);
    expect(state.players.P2.heroHp).toBe(25);
    expect(state.activePlayerId).toBe("P2");
    expect(state.phase).toBe("MAIN");
  });

  it("最大水晶未達10時，防御選項獲得嘲諷、+0/+5並恢復1HP", () => {
    let state = mainState();
    state.players.P1.maxMana = 9;
    state.players.P1.heroHp = 25;
    const dragon = putCard(state, "P1", "DRAGON_005", "MINION", "defend-normal");
    state = applyAction(state, { type: "END_TURN", playerId: "P1" }).state;
    state = applyAction(state, { type: "SELECT_EFFECT_OPTION", playerId: "P1", optionId: "DEFEND" }).state;
    const after = state.players.P1.minions.find((card) => card.instanceId === dragon.instanceId)!;
    expect(after.keywords).toContain("TAUNT");
    expect(after.currentHealth).toBe(10);
    expect(after.maxHealth).toBe(10);
    expect(state.players.P1.heroHp).toBe(26);
  });

  it("最大水晶10以上時，防御選項直接使用+0/+7並恢復3HP", () => {
    let state = mainState();
    state.players.P1.heroHp = 20;
    const dragon = putCard(state, "P1", "DRAGON_005", "MINION", "defend-boosted");
    state = applyAction(state, { type: "END_TURN", playerId: "P1" }).state;
    state = applyAction(state, { type: "SELECT_EFFECT_OPTION", playerId: "P1", optionId: "DEFEND" }).state;
    const after = state.players.P1.minions.find((card) => card.instanceId === dragon.instanceId)!;
    expect(after.currentHealth).toBe(12);
    expect(state.players.P1.heroHp).toBe(23);
  });
});
