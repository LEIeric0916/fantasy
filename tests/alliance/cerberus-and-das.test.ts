import { describe, expect, it } from "vitest";
import { applyAction } from "../../src/game/engine/gameEngine";
import { getCardDefinition } from "../../src/game/cards/cardRegistry";
import { mainState, putCard } from "../helpers";

describe("银翼刻柏斯与革命军刀达斯", () => {
  it("刻柏斯使本回合下一张实际打出的手下费用-4，使用后清除", () => {
    let state = mainState();
    state.players.P1.hand = [];
    const cerberus = putCard(state, "P1", "ALLIANCE_006", "HAND", "cerberus");
    const next = putCard(state, "P1", "MACHINE_006", "HAND", "next");
    state = applyAction(state, { type: "PLAY_CARD", playerId: "P1", instanceId: cerberus.instanceId }).state;
    expect(state.players.P1.nextMinionTemporaryCostReduction).toBe(4);
    const manaBefore = state.players.P1.mana;
    state = applyAction(state, { type: "PLAY_CARD", playerId: "P1", instanceId: next.instanceId }).state;
    expect(state.players.P1.mana).toBe(manaBefore);
    expect(state.players.P1.nextMinionTemporaryCostReduction).toBe(0);
  });

  it("达斯按敌方手下数减费，发现牌组上方手下并使其本回合费用-2", () => {
    let state = mainState();
    state.players.P1.hand = [];
    putCard(state, "P2", "TOKEN_ALLIANCE_ROYAL_GUARD", "MINION", "enemy-1");
    putCard(state, "P2", "TOKEN_ALLIANCE_ROYAL_GUARD", "MINION", "enemy-2");
    const candidate = putCard(state, "P1", "DRAGON_001", "HAND", "discover-candidate");
    state.players.P1.hand.splice(state.players.P1.hand.indexOf(candidate), 1);
    candidate.zone = "DECK";
    state.players.P1.deck.push(candidate);
    const das = putCard(state, "P1", "ALLIANCE_007", "HAND", "das");
    state = applyAction(state, { type: "PLAY_CARD", playerId: "P1", instanceId: das.instanceId }).state;
    expect(state.players.P1.mana).toBe(8);
    expect(state.pendingChoice).toMatchObject({ type: "EFFECT_CARDS" });
    if (state.pendingChoice?.type !== "EFFECT_CARDS") throw new Error("expected discover choice");
    const chosen = state.pendingChoice.candidateInstanceIds[0];
    state = applyAction(state, { type: "SELECT_EFFECT_CARDS", playerId: "P1", instanceIds: [chosen] }).state;
    const originalCost = getCardDefinition(state.players.P1.hand.find((card) => card.instanceId === chosen)!.definitionId).originalCost!;
    expect(state.players.P1.hand.find((card) => card.instanceId === chosen)?.currentCost).toBe(Math.max(0, originalCost - 2));
  });
});
