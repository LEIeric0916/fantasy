import type { GameLogEntry, GameState } from "../state/GameState";

export function addLog(
  state: GameState,
  type: GameLogEntry["type"],
  message: string,
  data?: Record<string, unknown>,
): void {
  state.log.push({ index: state.log.length, turn: state.turnNumber, type, message, data });
}
