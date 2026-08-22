import { describe, expect, it } from "vitest";
import { applyAction } from "../../src/game/engine/gameEngine";
import { mainState, putCard } from "../helpers";

describe("黑暗之書 不朽典錄", () => {
  it("死靈數至少20時消耗20並轉為末日之書", () => {
    const state = mainState();
    state.players.P1.resources.necromancy = 23;
    const book = putCard(state, "P1", "TOKEN_UNDEAD_BOOK_IMMORTAL", "FIELD", "activate");

    const result = applyAction(state, { type: "ACTIVATE_FIELD", playerId: "P1", instanceId: book.instanceId });

    expect(result.error).toBeUndefined();
    expect(result.state.players.P1.resources.necromancy).toBe(3);
    expect(result.state.players.P1.fields[0].definitionId).toBe("TOKEN_UNDEAD_DOOMSDAY_BOOK");
  });

  it("死靈不足或書被封印時不消耗資源也不轉變", () => {
    const insufficient = mainState();
    insufficient.players.P1.resources.necromancy = 19;
    const firstBook = putCard(insufficient, "P1", "TOKEN_UNDEAD_BOOK_IMMORTAL", "FIELD", "low");
    const lowResult = applyAction(insufficient, { type: "ACTIVATE_FIELD", playerId: "P1", instanceId: firstBook.instanceId });
    expect(lowResult.error?.code).toBe("INVALID_ACTION");
    expect(lowResult.state.players.P1.resources.necromancy).toBe(19);

    const sealed = mainState();
    sealed.players.P1.resources.necromancy = 20;
    const secondBook = putCard(sealed, "P1", "TOKEN_UNDEAD_BOOK_IMMORTAL", "FIELD", "sealed");
    secondBook.sealed = true;
    const sealedResult = applyAction(sealed, { type: "ACTIVATE_FIELD", playerId: "P1", instanceId: secondBook.instanceId });
    expect(sealedResult.error?.code).toBe("INVALID_ACTION");
    expect(sealedResult.state.players.P1.resources.necromancy).toBe(20);
  });
});
