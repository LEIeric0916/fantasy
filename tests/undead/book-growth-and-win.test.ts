import { describe, expect, it } from "vitest";
import { applyAction } from "../../src/game/engine/gameEngine";
import { beginTurn } from "../../src/game/engine/turnEngine";
import { mainState, putCard } from "../helpers";

describe("黑暗之書成長與末日勝利", () => {
  it("不朽典錄在我方回合生長階段召喚1名衍生不朽者", () => {
    const state = mainState();
    putCard(state, "P1", "TOKEN_UNDEAD_BOOK_IMMORTAL", "FIELD", "growth");
    state.phase = "END";
    beginTurn(state);
    expect(state.players.P1.minions.filter((card) => card.definitionId === "TOKEN_UNDEAD_GENERIC")).toHaveLength(1);
    expect(state.phase).toBe("MAIN");
  });

  it("復仇典錄僅在我方玩家HP低於10時轉為末日之書；HP等於10不成立", () => {
    let lowState = mainState();
    lowState.players.P1.heroHp = 9;
    const low = putCard(lowState, "P1", "TOKEN_UNDEAD_BOOK_REVENGE", "FIELD", "low");
    lowState = applyAction(lowState, { type: "END_TURN", playerId: "P1" }).state;
    expect(lowState.players.P1.fields.find((card) => card.instanceId === low.instanceId)?.definitionId).toBe("TOKEN_UNDEAD_DOOMSDAY_BOOK");

    let equalState = mainState();
    equalState.players.P1.heroHp = 10;
    const equal = putCard(equalState, "P1", "TOKEN_UNDEAD_BOOK_REVENGE", "FIELD", "equal");
    equalState = applyAction(equalState, { type: "END_TURN", playerId: "P1" }).state;
    expect(equalState.players.P1.fields.find((card) => card.instanceId === equal.instanceId)?.definitionId).toBe("TOKEN_UNDEAD_BOOK_REVENGE");
    expect(equalState.effectNotices).toEqual([]);
  });

  it("場上出現第4張末日之書時立即獲勝", () => {
    let state = mainState();
    state.players.P1.heroHp = 9;
    for (let index = 0; index < 3; index += 1) putCard(state, "P1", "TOKEN_UNDEAD_DOOMSDAY_BOOK", "FIELD", `doom-${index}`);
    putCard(state, "P1", "TOKEN_UNDEAD_BOOK_REVENGE", "FIELD", "fourth-source");
    state = applyAction(state, { type: "END_TURN", playerId: "P1" }).state;
    expect(state.phase).toBe("GAME_OVER");
    expect(state.winner).toBe("P1");
    expect(state.loseReason).toBe("DOOMSDAY_BOOK");
  });
});
