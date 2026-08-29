import { describe, expect, it } from "vitest";
import { beginTurn } from "../../src/game/engine/turnEngine";
import { mainState, putCard } from "../helpers";

describe("黑暗之書 不朽典錄", () => {
  it("生長階段死靈數至少20時消耗20並轉為末日之書", () => {
    const state = mainState();
    state.players.P1.resources.necromancy = 23;
    putCard(state, "P1", "TOKEN_UNDEAD_BOOK_IMMORTAL", "FIELD", "growth");

    state.phase = "END";
    beginTurn(state);

    expect(state.players.P1.resources.necromancy).toBe(3);
    expect(state.players.P1.fields[0].definitionId).toBe("TOKEN_UNDEAD_DOOMSDAY_BOOK");
  });

  it("生長階段死靈不足或書被封印時不消耗資源也不轉變", () => {
    const insufficient = mainState();
    insufficient.players.P1.resources.necromancy = 19;
    putCard(insufficient, "P1", "TOKEN_UNDEAD_BOOK_IMMORTAL", "FIELD", "low");
    insufficient.phase = "END";
    beginTurn(insufficient);
    expect(insufficient.players.P1.resources.necromancy).toBe(19);
    expect(insufficient.players.P1.fields[0].definitionId).toBe("TOKEN_UNDEAD_BOOK_IMMORTAL");
    expect(insufficient.effectNotices).toEqual([]);

    const sealed = mainState();
    sealed.players.P1.resources.necromancy = 20;
    const secondBook = putCard(sealed, "P1", "TOKEN_UNDEAD_BOOK_IMMORTAL", "FIELD", "sealed");
    secondBook.sealed = true;
    sealed.phase = "END";
    beginTurn(sealed);
    expect(sealed.players.P1.resources.necromancy).toBe(20);
    expect(sealed.players.P1.fields[0].definitionId).toBe("TOKEN_UNDEAD_BOOK_IMMORTAL");
  });
});
