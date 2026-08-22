import { describe, expect, it } from "vitest";
import { applyAction } from "../../src/game/engine/gameEngine";
import { resolvePendingEffects } from "../../src/game/engine/effectEngine";
import { summonGeneratedField } from "../../src/game/engine/summonEngine";
import { mainState, putCard } from "../helpers";

describe("瘟疫典录与末日序曲", () => {
  it("瘟疫典录回合结束指定生命小于4的敌方手下；转变仅由光环取得1个标记", () => {
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

  it("瘟疫标记达到7时立即转为末日之书", () => {
    let state = mainState();
    const book = putCard(state, "P1", "TOKEN_UNDEAD_BOOK_PLAGUE", "FIELD", "threshold");
    book.counters.plagueMarks = 6;
    const target = putCard(state, "P2", "TOKEN_UNDEAD_SPIRIT", "MINION", "threshold-target");
    target.currentHealth = 3;

    state = applyAction(state, { type: "END_TURN", playerId: "P1" }).state;
    state = applyAction(state, { type: "SELECT_EFFECT_CARDS", playerId: "P1", instanceIds: [target.instanceId] }).state;
    expect(state.players.P1.fields.find((card) => card.instanceId === book.instanceId)?.definitionId).toBe("TOKEN_UNDEAD_DOOMSDAY_BOOK");
  });

  it("只有进入场上的第4张末日序曲发动入场曲并保留为末日之书", () => {
    const state = mainState();
    const initialDeckSize = state.players.P1.deck.length;
    const ids: string[] = [];
    for (let index = 0; index < 4; index += 1) {
      expect(summonGeneratedField(state, "P1", "TOKEN_UNDEAD_BOOK_DOOM_PRELUDE")).toBe(true);
      ids.push(state.players.P1.fields.at(-1)!.instanceId);
      resolvePendingEffects(state);
    }

    expect(state.players.P1.fields).toHaveLength(1);
    expect(state.players.P1.fields[0].instanceId).toBe(ids[3]);
    expect(state.players.P1.fields[0].definitionId).toBe("TOKEN_UNDEAD_DOOMSDAY_BOOK");
    expect(state.players.P1.extraDeck.filter((card) => card.definitionId === "TOKEN_UNDEAD_BOOK_DOOM_PRELUDE")).toHaveLength(3);
    expect(state.players.P1.deck).toHaveLength(initialDeckSize - 2);
  });
});
