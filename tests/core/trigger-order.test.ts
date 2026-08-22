import { describe, expect, it } from "vitest";
import { resolveEffects } from "../../src/game/engine/effectEngine";
import { enqueueTriggeredEffects } from "../../src/game/engine/triggerEngine";
import { mainState, putCard } from "../helpers";
import { applyAction, validatePendingChoiceIntegrity } from "../../src/game/engine/gameEngine";

describe("連鎖觸發結算隊列", () => {
  it("先完整結算牌 A，再結算由 A 引發的牌 B 效果", () => {
    const state = mainState();
    state.players.P1.heroHp = 20;
    const cardA = putCard(state, "P1", "DRAGON_001", "MINION", "source-a");
    const cardB = putCard(state, "P1", "DRAGON_001", "MINION", "trigger-b");
    const deckBefore = state.players.P1.deck.length;

    enqueueTriggeredEffects(state, cardB, [{ type: "DRAW", value: 1 }], `EFFECT:${cardA.instanceId}`);
    resolveEffects(state, "P1", cardA, [
      { type: "HEAL_HERO", value: 1 },
      { type: "MODIFY_SELF_HEALTH", value: 2 },
    ]);

    expect(state.players.P1.heroHp).toBe(21);
    expect(cardA.maxHealth).toBe(4);
    expect(state.players.P1.deck).toHaveLength(deckBefore - 1);
    expect(state.pendingEffects).toEqual([]);

    const healIndex = state.log.findIndex((entry) => entry.message.includes("恢復 1 HP"));
    const buffIndex = state.log.findIndex((entry) => entry.message.includes("+0/+2"));
    const triggerIndex = state.log.findIndex((entry) => entry.message.includes("結算延後觸發效果"));
    const drawIndex = state.log.findIndex((entry) => entry.data?.reason === `EFFECT:${cardB.definitionId}`);
    expect(healIndex).toBeLessThan(buffIndex);
    expect(buffIndex).toBeLessThan(triggerIndex);
    expect(triggerIndex).toBeLessThan(drawIndex);
  });

  it("實戰離場觸發：炎龍召喚完整執行後才結算革命士兵死亡之聲", () => {
    let state = mainState();
    const soldier = putCard(state, "P2", "TOKEN_ALLIANCE_REVOLUTIONARY_SOLDIER", "MINION", "deathrattle");
    const spell = putCard(state, "P1", "DRAGON_013", "HAND", "trigger-source");
    const defenderDeckBefore = state.players.P2.deck.length;

    state = applyAction(state, { type: "PLAY_CARD", playerId: "P1", instanceId: spell.instanceId }).state;

    expect(state.players.P2.extraDeck.some((card) => card.instanceId === soldier.instanceId)).toBe(true);
    expect(state.players.P2.deck).toHaveLength(defenderDeckBefore - 1);
    expect(state.pendingEffects).toEqual([]);
    const damageIndex = state.log.findIndex(
      (entry) => entry.data?.source === spell.instanceId && entry.data?.kind === "EFFECT",
    );
    const triggerIndex = state.log.findIndex(
      (entry) => entry.message.includes("結算延後觸發效果") && entry.data?.sourceInstanceId === soldier.instanceId,
    );
    const drawIndex = state.log.findIndex(
      (entry) => entry.data?.reason === `EFFECT:${soldier.definitionId}`,
    );
    expect(damageIndex).toBeLessThan(triggerIndex);
    expect(triggerIndex).toBeLessThan(drawIndex);
  });

  it("同一玩家的同一時機觸發暫停，並依玩家選擇的順序處理", () => {
    let state = mainState();
    const first = putCard(state, "P2", "TOKEN_ALLIANCE_REVOLUTIONARY_SOLDIER", "MINION", "batch-first");
    const second = putCard(state, "P2", "TOKEN_ALLIANCE_REVOLUTIONARY_SOLDIER", "MINION", "batch-second");
    const spell = putCard(state, "P1", "DRAGON_013", "HAND", "batch-source");
    const deckBefore = state.players.P2.deck.length;

    state = applyAction(state, { type: "PLAY_CARD", playerId: "P1", instanceId: spell.instanceId }).state;
    expect(state.pendingChoice).toMatchObject({
      type: "TRIGGER_ORDER",
      playerId: "P2",
      instanceIds: [first.instanceId, second.instanceId],
    });
    expect(state.players.P2.deck).toHaveLength(deckBefore);

    state = applyAction(state, {
      type: "SELECT_TRIGGER_ORDER",
      playerId: "P2",
      instanceIds: [second.instanceId, first.instanceId],
    }).state;
    expect(state.pendingChoice).toBeUndefined();
    expect(state.pendingEffects).toEqual([]);
    expect(state.players.P2.deck).toHaveLength(deckBefore - 2);
    const resolved = state.log
      .filter((entry) => entry.message.includes("結算延後觸發效果"))
      .slice(-2)
      .map((entry) => entry.data?.sourceInstanceId);
    expect(resolved).toEqual([second.instanceId, first.instanceId]);
  });

  it("雙方同一時機各自成批，當前回合玩家整批先處理", () => {
    let state = mainState();
    const activeSoldier = putCard(state, "P1", "TOKEN_ALLIANCE_REVOLUTIONARY_SOLDIER", "MINION", "active-batch");
    const defendingSoldier = putCard(state, "P2", "TOKEN_ALLIANCE_REVOLUTIONARY_SOLDIER", "MINION", "opponent-batch");
    state = applyAction(state, {
      type: "ATTACK",
      playerId: "P1",
      attackerId: activeSoldier.instanceId,
      target: { type: "MINION", instanceId: defendingSoldier.instanceId },
    }).state;

    expect(state.pendingChoice).toBeUndefined();
    expect(state.pendingEffects).toEqual([]);
    const resolved = state.log
      .filter((entry) => entry.message.includes("結算延後觸發效果"))
      .slice(-2)
      .map((entry) => entry.data?.sourceInstanceId);
    expect(resolved).toEqual([activeSoldier.instanceId, defendingSoldier.instanceId]);
  });

  it("拒絕候選不足的效果選擇狀態，避免介面進入無法完成的卡死畫面", () => {
    const state = mainState();
    const source = putCard(state, "P1", "MACHINE_009", "MINION", "choice-guard-source");
    const candidate = putCard(state, "P1", "MACHINE_005", "HAND", "choice-guard-candidate");
    state.pendingChoice = {
      type: "EFFECT_CARDS",
      playerId: "P1",
      sourceInstanceId: source.instanceId,
      prompt: "錯誤的測試選擇",
      count: 2,
      candidateInstanceIds: [candidate.instanceId],
      resolution: { type: "SET_CARD_COST_ZERO" },
      remainingEffects: [],
    };
    expect(() => validatePendingChoiceIntegrity(state)).toThrow("候選卡牌不足、遺失或重複");
  });
});
