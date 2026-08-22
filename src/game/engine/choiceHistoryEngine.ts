import type { PlayerState } from "../state/GameState";
import { InvalidActionError } from "./errors";

export function getRemainingUniqueChoices(player: PlayerState, key: string, options: readonly string[]): string[] {
  const used = new Set(player.choiceHistory[key] ?? []);
  return options.filter((option) => !used.has(option));
}

export function recordUniqueChoice(player: PlayerState, key: string, choice: string, options: readonly string[]): void {
  const remaining = getRemainingUniqueChoices(player, key, options);
  if (!remaining.includes(choice)) throw new InvalidActionError("此選項已取得或不在合法候選中");
  player.choiceHistory[key] = [...(player.choiceHistory[key] ?? []), choice];
}
