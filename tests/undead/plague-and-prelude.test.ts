import { describe, expect, it } from "vitest";
import { applyAction } from "../../src/game/engine/gameEngine";
import { resolvePendingEffects } from "../../src/game/engine/effectEngine";
import { summonGeneratedField } from "../../src/game/engine/summonEngine";
import { mainState, putCard } from "../helpers";

describe("瘟疫典錄與末日序曲", () => {
  it("瘟疫典錄回合結束指定生命小於4的敵方手下；轉變僅由光環取得1個標記", () => {
    let state = mainState();
    const book = putCard(state, "P1", "TOKEN_UNDEAD_BOOK_PLAGUE", "FIELD", "plague");
    const target = putCard(state, "P2", "TOKEN_UNDEAD_SPIRIT", "MINION", "target");
    target.currentHealth = 3;

    state = applyAction(state, { type: "END_TURN", playerId: "P1" }).state;
    expect(state.pendingChoice).toMatchObject({ type: "EFFECT_CARDS", count: 1 });
    state = applyAction(state, { type: "SELECT_EFFECT_CARDS", playerId: "P1", instanceIds: [target.instanceId] }).state;

    expect(state.players.P2.minions[0].definitionId).toBe("TOKEN_UNDEAD_GENERIC");
    expect(state.players.P1.fields.find((card) => card.instanceId === book.instanceId)?.counters.plagueMarks).toBe(1);
  });

  it("瘟疫標記達到6時立即轉為末日之書", () => {
    let state = mainState();
    const book = putCard(state, "P1", "TOKEN_UNDEAD_BOOK_PLAGUE", "FIELD", "threshold");
    book.counters.plagueMarks = 5;
    const target = putCard(state, "P2", "TOKEN_UNDEAD_SPIRIT", "MINION", "threshold-target");
    target.currentHealth = 3;

    state = applyAction(state, { type: "END_TURN", playerId: "P1" }).state;
    state = applyAction(state, { type: "SELECT_EFFECT_CARDS", playerId: "P1", instanceIds: [target.instanceId] }).state;
    expect(state.players.P1.fields.find((card) => card.instanceId === book.instanceId)?.definitionId).toBe("TOKEN_UNDEAD_DOOMSDAY_BOOK");
    expect(state.players.P1.minions.filter((card) => card.definitionId === "TOKEN_UNDEAD_DOOM_KNIGHT")).toHaveLength(1);
  });

  it("瘟疫標記恰好為5時不會因其他行動提前轉變", () => {
    let state = mainState();
    const book = putCard(state, "P1", "TOKEN_UNDEAD_BOOK_PLAGUE", "FIELD", "six-marks");
    book.counters.plagueMarks = 5;

    state = applyAction(state, { type: "DEBUG_SUMMON", playerId: "P2", definitionId: "TOKEN_UNDEAD_SPIRIT" }).state;
    const after = state.players.P1.fields.find((card) => card.instanceId === book.instanceId);
    expect(after?.definitionId).toBe("TOKEN_UNDEAD_BOOK_PLAGUE");
    expect(after?.counters.plagueMarks).toBe(5);
  });

  it("不朽的追憶者明確具有聖盾術與衝刺", () => {
    const state = mainState();
    const recollector = putCard(state, "P1", "UNDEAD_008", "MINION", "recollector-keywords");
    expect(recollector.keywords).toEqual(expect.arrayContaining(["DIVINE_SHIELD", "RUSH"]));
  });

  it("只有進入場上的第3張末日序曲發動入場曲並保留為末日之書", () => {
    const state = mainState();
    const initialDeckSize = state.players.P1.deck.length;
    const ids: string[] = [];
    for (let index = 0; index < 3; index += 1) {
      expect(summonGeneratedField(state, "P1", "TOKEN_UNDEAD_BOOK_DOOM_PRELUDE")).toBe(true);
      ids.push(state.players.P1.fields.at(-1)!.instanceId);
      resolvePendingEffects(state);
    }

    expect(state.players.P1.fields).toHaveLength(1);
    expect(state.players.P1.fields[0].instanceId).toBe(ids[2]);
    expect(state.players.P1.fields[0].definitionId).toBe("TOKEN_UNDEAD_DOOMSDAY_BOOK");
    expect(state.players.P1.minions.filter((card) => card.definitionId === "TOKEN_UNDEAD_DOOM_KNIGHT")).toHaveLength(1);
    expect(state.players.P1.extraDeck.filter((card) => card.definitionId === "TOKEN_UNDEAD_BOOK_DOOM_PRELUDE")).toHaveLength(2);
    expect(state.players.P1.deck).toHaveLength(initialDeckSize - 2);
  });

  it("直接召喚末日之書時會以入場曲召喚衍生末日騎士", () => {
    const state = mainState();
    expect(summonGeneratedField(state, "P1", "TOKEN_UNDEAD_DOOMSDAY_BOOK")).toBe(true);
    resolvePendingEffects(state);

    expect(state.players.P1.fields.map((card) => card.definitionId)).toContain("TOKEN_UNDEAD_DOOMSDAY_BOOK");
    expect(state.players.P1.minions.filter((card) => card.definitionId === "TOKEN_UNDEAD_DOOM_KNIGHT")).toHaveLength(1);
  });
});
