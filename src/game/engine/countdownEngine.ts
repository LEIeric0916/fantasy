import type { CardInstance, PlayerId } from "../cards/cardTypes";
import type { GameState } from "../state/GameState";
import { addLog } from "../utils/gameLog";
import { InvalidActionError, RuleUndefinedError } from "./errors";
import { destroyCardOnField } from "./zoneEngine";
import { hasActiveKeyword } from "../keywords/keywordRules";
import { createTimingContext } from "./simultaneousEngine";
import { resolvePendingEffects } from "./effectEngine";

export function processCountdownPhase(state: GameState, playerId: PlayerId): boolean {
  const countdownCards = [...state.players[playerId].fields].filter((card) => hasActiveKeyword(card, "COUNTDOWN"));
  for (const card of countdownCards) {
    const current = card.counters.countdown;
    if (current === undefined) {
      throw new RuleUndefinedError("COUNTDOWN_INITIAL_VALUE", "具有倒數的牌缺少資料化倒數初值", card.definitionId);
    }
    card.counters.countdown = current - 1;
    addLog(state, "RESOURCE", `${card.definitionId} 倒數 ${current} → ${card.counters.countdown}`);
  }
  const finished = countdownCards.filter((card) => card.counters.countdown <= 0);
  if (finished.length > 1) {
    state.pendingChoice = { type: "COUNTDOWN_ORDER", playerId, instanceIds: finished.map((card) => card.instanceId) };
    addLog(state, "ACTION", `${playerId} 選擇同一時機倒數結束的處理順序`, { instanceIds: finished.map((card) => card.instanceId) });
    return false;
  }
  if (finished[0]) resolveFinishedCountdown(state, finished[0]);
  resolvePendingEffects(state);
  return state.pendingChoice === undefined;
}

export function selectCountdownOrder(state: GameState, playerId: PlayerId, instanceIds: string[]): void {
  const choice = state.pendingChoice;
  if (!choice || choice.type !== "COUNTDOWN_ORDER" || choice.playerId !== playerId) {
    throw new InvalidActionError("目前沒有此倒數排序選擇");
  }
  if (instanceIds.length !== choice.instanceIds.length || new Set(instanceIds).size !== instanceIds.length) {
    throw new InvalidActionError("必須排列全部且不重復的倒數牌");
  }
  if (instanceIds.some((id) => !choice.instanceIds.includes(id))) throw new InvalidActionError("倒數牌選擇不合法");
  const timingContext = createTimingContext(state, `COUNTDOWN:${playerId}`);
  state.pendingChoice = undefined;
  for (const instanceId of instanceIds) {
    const card = state.players[playerId].fields.find((candidate) => candidate.instanceId === instanceId);
    if (card) resolveFinishedCountdown(state, card, timingContext);
  }
  resolvePendingEffects(state);
}

export function resolveFinishedCountdown(state: GameState, card: CardInstance, timingContext = createTimingContext(state, `COUNTDOWN:${card.instanceId}`)): boolean {
  if (card.zone !== "FIELD" || !card.keywords.includes("COUNTDOWN")) {
    throw new InvalidActionError("只有立場區中具有倒數的牌可以結算倒數結束");
  }
  if (card.sealed) {
    addLog(state, "RULE", `${card.definitionId} 已被封印，倒數效果失效`);
    return false;
  }
  if ((card.counters.countdown ?? 0) > 0) return false;
  addLog(state, "ACTION", `${card.definitionId} 倒數結束，被消滅`, { reason: "COUNTDOWN_FINISHED" });
  destroyCardOnField(state, card, "COUNTDOWN_FINISHED", timingContext);
  return true;
}
