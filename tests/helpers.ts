import { createCardInstance } from "../src/game/state/CardInstance";
import { getCardDefinition } from "../src/game/cards/cardRegistry";
import type { PlayerId } from "../src/game/cards/cardTypes";
import type { GameState } from "../src/game/state/GameState";
import { createInitialGame } from "../src/game/state/createInitialGame";

export function mainState(): GameState {
  const state = createInitialGame({
    seed: 7,
    shuffle: false,
  });
  state.phase = "MAIN";
  state.turnNumber = 1;
  state.activePlayerId = "P1";
  state.players.P1.maxMana = 10;
  state.players.P1.mana = 10;
  return state;
}

export function putCard(
  state: GameState,
  playerId: PlayerId,
  definitionId: string,
  zone: "HAND" | "MINION" | "FIELD",
  suffix: string,
) {
  const card = createCardInstance(getCardDefinition(definitionId), playerId, zone, `${playerId}-${definitionId}-${suffix}`);
  if (zone === "MINION") {
    card.summonedOnTurn = 0;
    state.players[playerId].minions.push(card);
  } else if (zone === "FIELD") {
    state.players[playerId].fields.push(card);
  } else {
    state.players[playerId].hand.push(card);
  }
  return card;
}
