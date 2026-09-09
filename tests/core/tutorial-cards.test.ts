import { describe, expect, it } from "vitest";
import { applyAction, type GameAction } from "../../src/game/engine/gameEngine";
import { createEighthTutorialGame, createFifthTutorialGame, createFourthTutorialGame, createSeventhTutorialGame, createSixthTutorialGame } from "../../src/game/state/createInitialGame";
import type { GameState } from "../../src/game/state/GameState";

function act(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.error).toBeUndefined();
  return result.state;
}

describe("新手教學專用卡", () => {
  it("聖盾術小關能實際示範抵擋傷害", () => {
    let state = createFourthTutorialGame();
    state = act(state, { type: "PLAY_CARD", playerId: "P1", instanceId: "tutorial-shield-apprentice" });
    state = act(state, { type: "END_TURN", playerId: "P1" });
    state = act(state, { type: "ATTACK", playerId: "P2", attackerId: "tutorial-shield-target", target: { type: "MINION", instanceId: "tutorial-shield-apprentice" } });
    const shield = state.players.P1.minions.find((card) => card.instanceId === "tutorial-shield-apprentice")!;
    expect(shield.currentHealth).toBe(1);
    expect(shield.keywords).not.toContain("DIVINE_SHIELD");

  });

  it("殺意小關能在主動消滅敵方手下且存活後抽牌", () => {
    let state = createFifthTutorialGame();
    state = act(state, { type: "PLAY_CARD", playerId: "P1", instanceId: "tutorial-kill-apprentice" });
    state = act(state, { type: "ATTACK", playerId: "P1", attackerId: "tutorial-kill-apprentice", target: { type: "MINION", instanceId: "tutorial-kill-target" } });
    expect(state.players.P1.hand).toHaveLength(1);
    expect(state.players.P1.hand.at(-1)?.definitionId).toBe("NEUTRAL_002");
  });

  it("風怒小關能在度過召喚回合後攻擊兩次", () => {
    let state = createSixthTutorialGame();
    state = act(state, { type: "PLAY_CARD", playerId: "P1", instanceId: "tutorial-windfury-apprentice" });
    state = act(state, { type: "END_TURN", playerId: "P1" });
    state = act(state, { type: "END_TURN", playerId: "P2" });
    state = act(state, { type: "ATTACK", playerId: "P1", attackerId: "tutorial-windfury-apprentice", target: { type: "HERO", playerId: "P2" } });
    state = act(state, { type: "ATTACK", playerId: "P1", attackerId: "tutorial-windfury-apprentice", target: { type: "HERO", playerId: "P2" } });
    expect(state.players.P2.heroHp).toBe(28);
  });

  it("死亡之聲小關會在手下被消滅後抽牌", () => {
    let state = createSeventhTutorialGame();
    state = act(state, { type: "PLAY_CARD", playerId: "P1", instanceId: "tutorial-deathrattle-apprentice" });
    expect(state.players.P1.hand.some((card) => card.instanceId === "tutorial-deathrattle-draw-warrior")).toBe(false);

    state = act(state, { type: "END_TURN", playerId: "P1" });
    state = act(state, { type: "ATTACK", playerId: "P2", attackerId: "tutorial-effect-enemy-warrior", target: { type: "MINION", instanceId: "tutorial-deathrattle-apprentice" } });
    expect(state.players.P1.minions.some((card) => card.instanceId === "tutorial-deathrattle-apprentice")).toBe(false);
    expect(state.players.P1.hand.some((card) => card.instanceId === "tutorial-deathrattle-draw-warrior")).toBe(true);
  });

  it("戰吼小關會在從手牌打出時立刻抽牌", () => {
    let state = createEighthTutorialGame();
    state = act(state, { type: "PLAY_CARD", playerId: "P1", instanceId: "tutorial-battlecry-apprentice" });
    expect(state.players.P1.hand.some((card) => card.instanceId === "tutorial-battlecry-draw-warrior")).toBe(true);
  });
});
