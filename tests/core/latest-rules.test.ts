import { describe, expect, it } from "vitest";
import { getLegalAttackTargets } from "../../src/game/engine/combatEngine";
import { resolveFinishedCountdown } from "../../src/game/engine/countdownEngine";
import { applyAction } from "../../src/game/engine/gameEngine";
import { searchDeckCard } from "../../src/game/engine/searchEngine";
import { beginTurn } from "../../src/game/engine/turnEngine";
import { mainState, putCard } from "../helpers";

describe("最新修正：衍生牌离场", () => {
  it("任何阵营的衍生手下被消灭后回到额外区", () => {
    let state = mainState();
    const attacker = putCard(state, "P1", "DRAGON_012", "MINION", "token-remover");
    const token = putCard(state, "P2", "TOKEN_UNDEAD_SPIRIT", "MINION", "undead-token");
    state = applyAction(state, {
      type: "ATTACK",
      playerId: "P1",
      attackerId: attacker.instanceId,
      target: { type: "MINION", instanceId: token.instanceId },
    }).state;
    expect(state.players.P2.extraDeck.some((card) => card.instanceId === token.instanceId && card.zone === "EXTRA_DECK")).toBe(true);
    expect(state.players.P2.graveyard.some((card) => card.instanceId === token.instanceId)).toBe(false);
    expect(state.players.P2.removed.some((card) => card.instanceId === token.instanceId)).toBe(false);
  });

  it("衍生立场因倒数结束被消灭后回到额外区", () => {
    const state = mainState();
    const field = putCard(state, "P1", "TOKEN_MACHINE_ATTACK_SHIP", "FIELD", "countdown-token");
    field.counters.countdown = 0;
    expect(resolveFinishedCountdown(state, field)).toBe(true);
    expect(state.players.P1.extraDeck.some((card) => card.instanceId === field.instanceId)).toBe(true);
  });
});

describe("最新修正：封印", () => {
  it("封印手下不能攻击或反击", () => {
    let state = mainState();
    const sealed = putCard(state, "P1", "DRAGON_012", "MINION", "sealed-attacker");
    sealed.sealed = true;
    putCard(state, "P2", "UNDEAD_001", "MINION", "target");
    expect(getLegalAttackTargets(state, sealed.instanceId)).toEqual([]);

    const attacker = putCard(state, "P1", "DRAGON_001", "MINION", "normal-attacker");
    const defender = putCard(state, "P2", "DRAGON_012", "MINION", "sealed-defender");
    defender.sealed = true;
    state = applyAction(state, {
      type: "ATTACK",
      playerId: "P1",
      attackerId: attacker.instanceId,
      target: { type: "MINION", instanceId: defender.instanceId },
    }).state;
    expect(state.players.P1.minions.find((card) => card.instanceId === attacker.instanceId)?.currentHealth).toBe(2);
  });

  it("封印令嘲讽、圣盾术与死亡之声失效", () => {
    let state = mainState();
    const attacker = putCard(state, "P1", "DRAGON_012", "MINION", "attacker");
    const sealed = putCard(state, "P2", "UNDEAD_003", "MINION", "sealed-effects");
    sealed.keywords.push("TAUNT", "DIVINE_SHIELD");
    sealed.sealed = true;
    const other = putCard(state, "P2", "UNDEAD_001", "MINION", "other");
    expect(getLegalAttackTargets(state, attacker.instanceId)).toContainEqual({ type: "MINION", instanceId: other.instanceId });
    const result = applyAction(state, {
      type: "ATTACK",
      playerId: "P1",
      attackerId: attacker.instanceId,
      target: { type: "MINION", instanceId: sealed.instanceId },
    });
    expect(result.error).toBeUndefined();
    state = result.state;
    expect(state.players.P2.graveyard.some((card) => card.instanceId === sealed.instanceId)).toBe(true);
  });

  it("封印令倒数效果失效", () => {
    const state = mainState();
    const field = putCard(state, "P1", "TOKEN_MACHINE_ATTACK_SHIP", "FIELD", "sealed-countdown");
    field.counters.countdown = 0;
    field.sealed = true;
    expect(resolveFinishedCountdown(state, field)).toBe(false);
    expect(state.players.P1.fields.some((card) => card.instanceId === field.instanceId)).toBe(true);
  });
});

describe("最新修正：倒数与检索", () => {
  it("倒数初值来自资料，并在控制者回合开始的倒数阶段 -1", () => {
    const state = mainState();
    const field = putCard(state, "P1", "TOKEN_MACHINE_ATTACK_SHIP", "FIELD", "timed-field");
    expect(field.counters.countdown).toBe(3);
    state.phase = "END";
    beginTurn(state);
    expect(field.counters.countdown).toBe(2);
    expect(state.log.some((entry) => entry.message.includes("倒数 3 → 2"))).toBe(true);
  });

  it("本回合打出的倒数牌不会在同一回合减值", () => {
    let state = mainState();
    const field = putCard(state, "P1", "TOKEN_MACHINE_ATTACK_SHIP", "FIELD", "played-after-countdown");
    expect(field.counters.countdown).toBe(3);
    state = applyAction(state, { type: "END_TURN", playerId: "P1" }).state;
    expect(field.counters.countdown).toBe(3);
    state = applyAction(state, { type: "END_TURN", playerId: "P2" }).state;
    expect(state.players.P1.fields.find((card) => card.instanceId === field.instanceId)?.counters.countdown).toBe(2);
  });

  it("倒数从 1 降至 0 后先被消灭，不进入随后生长", () => {
    const state = mainState();
    const field = putCard(state, "P1", "TOKEN_MACHINE_ATTACK_SHIP", "FIELD", "countdown-growth");
    field.keywords.push("GROWTH");
    field.counters.countdown = 1;
    state.phase = "END";
    beginTurn(state);
    expect(state.players.P1.fields.some((card) => card.instanceId === field.instanceId)).toBe(false);
    expect(state.players.P1.extraDeck.some((card) => card.instanceId === field.instanceId)).toBe(true);
    const destroyedIndex = state.log.findIndex((entry) => entry.data?.reason === "COUNTDOWN_FINISHED");
    const growthIndex = state.log.findIndex((entry) => entry.turn === state.turnNumber && entry.message === "GROWTH");
    expect(destroyedIndex).toBeLessThan(growthIndex);
  });

  it("多个倒数同时结束时由玩家选择处理顺序", () => {
    let state = mainState();
    const first = putCard(state, "P1", "TOKEN_MACHINE_ATTACK_SHIP", "FIELD", "countdown-order-1");
    const second = putCard(state, "P1", "TOKEN_MACHINE_GEAR", "FIELD", "countdown-order-2");
    first.counters.countdown = 1;
    second.counters.countdown = 1;
    state.phase = "END";
    beginTurn(state);
    expect(state.phase).toBe("COUNTDOWN");
    expect(state.pendingChoice).toMatchObject({ type: "COUNTDOWN_ORDER", playerId: "P1" });
    state = applyAction(state, {
      type: "SELECT_COUNTDOWN_ORDER",
      playerId: "P1",
      instanceIds: [second.instanceId, first.instanceId],
    }).state;
    expect(state.phase).toBe("MAIN");
    const departures = state.log
      .filter((entry) => entry.type === "ZONE" && entry.data?.reason === "COUNTDOWN_FINISHED")
      .slice(-2)
      .map((entry) => entry.data?.instanceId);
    expect(departures).toEqual([second.instanceId, first.instanceId]);
  });

  it("检索目标进入手牌后洗牌", () => {
    const state = mainState();
    const target = state.players.P1.deck[0];
    const oldSeed = state.rngSeed;
    const oldLength = state.players.P1.deck.length;
    searchDeckCard(state, "P1", target.instanceId);
    expect(state.players.P1.hand.some((card) => card.instanceId === target.instanceId)).toBe(true);
    expect(state.players.P1.deck).toHaveLength(oldLength - 1);
    expect(state.rngSeed).not.toBe(oldSeed);
    expect(state.log.at(-1)?.message).toBe("P1 完成检索后洗牌");
  });
});
