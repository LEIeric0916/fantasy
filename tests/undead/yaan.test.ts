import { describe, expect, it } from "vitest";
import { getCardDefinition } from "../../src/game/cards/cardRegistry";
import { applyAction } from "../../src/game/engine/gameEngine";
import { mainState, putCard } from "../helpers";

describe("殘光渡扉者 亞恩", () => {
  it("卡面為4費3/7，具有衝刺、嘲諷、戰吼與光環", () => {
    const definition = getCardDefinition("UNDEAD_008");
    expect(definition).toMatchObject({
      name: "殘光渡扉者 亞恩",
      originalCost: 4,
      attack: 3,
      health: 7,
    });
    expect(definition.keywords).toEqual(expect.arrayContaining(["RUSH", "TAUNT", "BATTLECRY", "AURA"]));
  });

  it("戰吼捨棄1張手牌後召喚兩種不同的黑暗之書", () => {
    let state = mainState();
    state.players.P1.hand = [];
    const yaan = putCard(state, "P1", "UNDEAD_008", "HAND", "battlecry");
    const discard = putCard(state, "P1", "DRAGON_001", "HAND", "discard");

    state = applyAction(state, { type: "PLAY_CARD", playerId: "P1", instanceId: yaan.instanceId }).state;
    expect(state.pendingChoice).toMatchObject({ type: "EFFECT_CARDS", count: 1 });
    state = applyAction(state, { type: "SELECT_EFFECT_CARDS", playerId: "P1", instanceIds: [discard.instanceId] }).state;

    state = applyAction(state, {
      type: "SELECT_EFFECT_OPTION",
      playerId: "P1",
      optionId: "TOKEN_UNDEAD_BOOK_PLAGUE",
    }).state;
    if (state.pendingChoice?.type !== "EFFECT_OPTION") throw new Error("亞恩應要求選擇第二種黑暗之書");
    expect(state.pendingChoice.options.map((option) => option.id)).not.toContain("TOKEN_UNDEAD_BOOK_PLAGUE");

    state = applyAction(state, {
      type: "SELECT_EFFECT_OPTION",
      playerId: "P1",
      optionId: "TOKEN_UNDEAD_BOOK_REVENGE",
    }).state;
    expect(state.players.P1.fields.map((card) => card.definitionId)).toEqual([
      "TOKEN_UNDEAD_BOOK_PLAGUE",
      "TOKEN_UNDEAD_BOOK_REVENGE",
    ]);
  });

  it("捨棄闇黑帝王當下死靈數不足時，復仇典錄後來增加的5點不會倒回觸發復活", () => {
    let state = mainState();
    state.players.P1.hand = [];
    state.players.P1.resources.necromancy = 0;
    const yaan = putCard(state, "P1", "UNDEAD_008", "HAND", "discard-emperor");
    const emperor = putCard(state, "P1", "UNDEAD_009", "HAND", "discarded-emperor");

    state = applyAction(state, { type: "PLAY_CARD", playerId: "P1", instanceId: yaan.instanceId }).state;
    state = applyAction(state, { type: "SELECT_EFFECT_CARDS", playerId: "P1", instanceIds: [emperor.instanceId] }).state;
    expect(state.players.P1.graveyard.some((card) => card.instanceId === emperor.instanceId)).toBe(true);

    state = applyAction(state, {
      type: "SELECT_EFFECT_OPTION",
      playerId: "P1",
      optionId: "TOKEN_UNDEAD_BOOK_REVENGE",
    }).state;
    expect(state.players.P1.resources.necromancy).toBe(0);
    expect(state.players.P1.graveyard.some((card) => card.instanceId === emperor.instanceId)).toBe(true);

    state = applyAction(state, {
      type: "SELECT_EFFECT_OPTION",
      playerId: "P1",
      optionId: "TOKEN_UNDEAD_BOOK_PLAGUE",
    }).state;
    expect(state.players.P1.resources.necromancy).toBe(5);
    expect(state.players.P1.graveyard.some((card) => card.instanceId === emperor.instanceId)).toBe(true);
  });

  it("捨棄闇黑帝王當下已有5死靈數時，會支付5點並正常復活", () => {
    let state = mainState();
    state.players.P1.hand = [];
    state.players.P1.resources.necromancy = 5;
    const yaan = putCard(state, "P1", "UNDEAD_008", "HAND", "revive-emperor");
    const emperor = putCard(state, "P1", "UNDEAD_009", "HAND", "revived-emperor");

    state = applyAction(state, { type: "PLAY_CARD", playerId: "P1", instanceId: yaan.instanceId }).state;
    state = applyAction(state, { type: "SELECT_EFFECT_CARDS", playerId: "P1", instanceIds: [emperor.instanceId] }).state;
    state = applyAction(state, {
      type: "SELECT_EFFECT_OPTION",
      playerId: "P1",
      optionId: "TOKEN_UNDEAD_BOOK_REVENGE",
    }).state;
    state = applyAction(state, {
      type: "SELECT_EFFECT_OPTION",
      playerId: "P1",
      optionId: "TOKEN_UNDEAD_BOOK_PLAGUE",
    }).state;

    expect(state.players.P1.resources.necromancy).toBe(5);
    expect(state.players.P1.minions.some((card) => card.instanceId === emperor.instanceId)).toBe(true);
    expect(state.log.some((entry) => entry.message.includes("UNDEAD_009 消耗 5 死靈數發動死靈復活"))).toBe(true);
  });

  it("回合結束恢復玩家3HP，並使選擇的我方手下獲得聖盾術", () => {
    let state = mainState();
    state.players.P1.heroHp = 20;
    putCard(state, "P1", "UNDEAD_008", "MINION", "aura-source");
    const target = putCard(state, "P1", "UNDEAD_001", "MINION", "aura-target");

    state = applyAction(state, { type: "END_TURN", playerId: "P1" }).state;
    expect(state.players.P1.heroHp).toBe(23);
    expect(state.pendingChoice).toMatchObject({ type: "EFFECT_CARDS", count: 1 });

    state = applyAction(state, { type: "SELECT_EFFECT_CARDS", playerId: "P1", instanceIds: [target.instanceId] }).state;
    expect(state.players.P1.minions.find((card) => card.instanceId === target.instanceId)?.keywords).toContain("DIVINE_SHIELD");
  });
});
