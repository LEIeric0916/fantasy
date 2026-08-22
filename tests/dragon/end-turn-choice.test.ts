import { describe, expect, it } from "vitest";
import { applyAction } from "../../src/game/engine/gameEngine";
import { mainState, putCard } from "../helpers";

describe("神威焰龙回合结束二选一", () => {
  it("最大水晶10以上时，选择画面直接显示5伤并对敌方全体与玩家造成5伤", () => {
    let state = mainState();
    const dragon = putCard(state, "P1", "DRAGON_005", "MINION", "damage-choice");
    const enemy = putCard(state, "P2", "DRAGON_012", "MINION", "enemy");
    state = applyAction(state, { type: "END_TURN", playerId: "P1" }).state;
    expect(state.phase).toBe("END");
    expect(state.pendingChoice).toMatchObject({ type: "EFFECT_OPTION", sourceInstanceId: dragon.instanceId });
    const choice = state.pendingChoice as Extract<typeof state.pendingChoice, { type: "EFFECT_OPTION" }>;
    expect(choice.options.find((option) => option.id === "DAMAGE")?.label).toContain("5 点伤害");

    state = applyAction(state, { type: "SELECT_EFFECT_OPTION", playerId: "P1", optionId: "DAMAGE" }).state;
    expect(state.players.P2.minions.find((card) => card.instanceId === enemy.instanceId)?.currentHealth).toBe(7);
    expect(state.players.P2.heroHp).toBe(25);
    expect(state.activePlayerId).toBe("P2");
    expect(state.phase).toBe("MAIN");
  });

  it("最大水晶未达10时，防御选项获得嘲讽、+0/+5并恢复1HP", () => {
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

  it("最大水晶10以上时，防御选项直接使用+0/+7并恢复3HP", () => {
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
