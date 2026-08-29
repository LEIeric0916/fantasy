import { describe, expect, it } from "vitest";
import { applyAction } from "../../src/game/engine/gameEngine";
import { mainState, putCard } from "../helpers";

describe("不朽的懲戒魔龍 奧迪菲斯", () => {
  it("戰吼消滅敵方所有可被效果直接消滅的手下，庇護者保留", () => {
    let state = mainState();
    state.players.P1.hand = [];
    const source = putCard(state, "P1", "UNDEAD_012", "HAND", "battlecry");
    const destroyed = putCard(state, "P2", "UNDEAD_001", "MINION", "destroyed");
    const sanctuary = putCard(state, "P2", "DRAGON_006", "MINION", "sanctuary");
    state = applyAction(state, { type: "PLAY_CARD", playerId: "P1", instanceId: source.instanceId }).state;
    expect(state.players.P2.graveyard.some((card) => card.instanceId === destroyed.instanceId)).toBe(true);
    expect(state.players.P2.minions.some((card) => card.instanceId === sanctuary.instanceId)).toBe(true);
  });

  it("交戰時先給予對手玩家3傷，再進行戰斗傷害結算", () => {
    let state = mainState();
    const source = putCard(state, "P1", "UNDEAD_012", "MINION", "combat-aura");
    const enemy = putCard(state, "P2", "DRAGON_012", "MINION", "enemy");
    state = applyAction(state, {
      type: "ATTACK",
      playerId: "P1",
      attackerId: source.instanceId,
      target: { type: "MINION", instanceId: enemy.instanceId },
    }).state;
    expect(state.players.P2.heroHp).toBe(27);
    const auraIndex = state.log.findIndex((entry) => entry.message === "P2 玩家受到 3 點效果傷害");
    const combatIndex = state.log.findIndex((entry) => entry.message.includes("交戰"));
    expect(auraIndex).toBeLessThan(combatIndex);
  });

  it("攻擊玩家不屬於交戰，不發動交戰時效果", () => {
    let state = mainState();
    const source = putCard(state, "P1", "UNDEAD_012", "MINION", "attack-hero");
    state = applyAction(state, {
      type: "ATTACK",
      playerId: "P1",
      attackerId: source.instanceId,
      target: { type: "HERO", playerId: "P2" },
    }).state;
    expect(state.players.P2.heroHp).toBe(24);
  });

  it("殺意在完整戰斗後由玩家選擇召喚一種黑暗之書", () => {
    let state = mainState();
    const source = putCard(state, "P1", "UNDEAD_012", "MINION", "on-kill");
    const enemy = putCard(state, "P2", "UNDEAD_001", "MINION", "victim");
    state = applyAction(state, {
      type: "ATTACK",
      playerId: "P1",
      attackerId: source.instanceId,
      target: { type: "MINION", instanceId: enemy.instanceId },
    }).state;
    expect(state.pendingChoice).toMatchObject({ type: "EFFECT_OPTION" });
    state = applyAction(state, { type: "SELECT_EFFECT_OPTION", playerId: "P1", optionId: "TOKEN_UNDEAD_BOOK_IMMORTAL" }).state;
    expect(state.players.P1.fields.map((card) => card.definitionId)).toContain("TOKEN_UNDEAD_BOOK_IMMORTAL");
  });
});
