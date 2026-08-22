import type { PlayerId } from "../cards/cardTypes";
import type { GameState } from "../state/GameState";
import { addLog } from "../utils/gameLog";
import { shuffleSeeded } from "../utils/rng";
import { InvalidActionError } from "./errors";
import { moveCard } from "./zoneEngine";

export function searchDeckCard(state: GameState, playerId: PlayerId, instanceId: string): void {
  const player = state.players[playerId];
  const card = player.deck.find((candidate) => candidate.instanceId === instanceId);
  if (!card) throw new InvalidActionError("檢索目標必須位於自己的牌庫中");
  moveCard(state, card, "HAND", "SEARCH");
  const shuffled = shuffleSeeded(player.deck, state.rngSeed);
  player.deck = shuffled.value;
  state.rngSeed = shuffled.seed;
  addLog(state, "RNG", `${playerId} 完成檢索後洗牌`, { instanceId, resultingSeed: state.rngSeed });
}
