import { describe, expect, it } from "vitest";
import { applyAction } from "../../src/game/engine/gameEngine";
import { summonGeneratedMinion } from "../../src/game/engine/summonEngine";
import { mainState, putCard } from "../helpers";

describe("基本召喚與 7 格上限", () => {
  it("支付費用從手牌召喚基礎手下", () => {
    let state = mainState();
    const minion = putCard(state, "P1", "TOKEN_DRAGON_HELLFIRE", "HAND", "play");
    state = applyAction(state, { type: "PLAY_CARD", playerId: "P1", instanceId: minion.instanceId }).state;
    expect(state.players.P1.mana).toBe(5);
    expect(state.players.P1.minions.map((card) => card.instanceId)).toContain(minion.instanceId);
    expect(state.players.P1.summonedThisGame).toBe(1);
  });

  it("已有 7 張時額外效果召喚失敗且不生成第 8 個實例", () => {
    const state = mainState();
    for (let index = 0; index < 7; index += 1) expect(summonGeneratedMinion(state, "P1", "TOKEN_DRAGON_HELLFIRE")).toBe(true);
    expect(summonGeneratedMinion(state, "P1", "TOKEN_DRAGON_HELLFIRE")).toBe(false);
    expect(state.players.P1.minions).toHaveLength(7);
  });

  it("滿場時從手牌打出被拒絕，不扣費也不移動卡牌", () => {
    let state = mainState();
    for (let index = 0; index < 7; index += 1) summonGeneratedMinion(state, "P1", "TOKEN_DRAGON_HELLFIRE");
    const card = putCard(state, "P1", "TOKEN_DRAGON_HELLFIRE", "HAND", "blocked");
    const result = applyAction(state, { type: "PLAY_CARD", playerId: "P1", instanceId: card.instanceId });
    expect(result.error?.code).toBe("INVALID_ACTION");
    expect(result.state.players.P1.mana).toBe(10);
    expect(result.state.players.P1.hand.some((item) => item.instanceId === card.instanceId)).toBe(true);
  });

});
