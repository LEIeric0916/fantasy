import { getCardDefinition } from "../cards/cardRegistry";
import type { CardInstance, PlayerId } from "../cards/cardTypes";
import type { GameState } from "../state/GameState";
import { createCardInstance } from "../state/CardInstance";
import { addLog } from "../utils/gameLog";
import { shuffleSeeded } from "../utils/rng";
import { InvalidActionError } from "./errors";
import { moveCard } from "./zoneEngine";
import { processCountdownPhase } from "./countdownEngine";
import { clearTemporaryHandCosts } from "./costEngine";
import { enqueueStartTurnEffectSummons, enqueueStateBasedEffectSummons, markHandEntryForEffectSummon } from "./effectSummonEngine";
import { resolvePendingEffects, shouldEnqueueTriggeredEffectList } from "./effectEngine";
import { createTimingContext } from "./simultaneousEngine";
import { enqueueTriggeredEffects } from "./triggerEngine";

export function opponentOf(playerId: PlayerId): PlayerId {
  return playerId === "P1" ? "P2" : "P1";
}

function gameHasEnded(state: GameState): boolean {
  return state.phase === "GAME_OVER";
}

export function drawCard(state: GameState, playerId: PlayerId, reason = "NORMAL_DRAW"): CardInstance | undefined {
  const player = state.players[playerId];
  const card = player.deck.pop();
  if (!card) {
    state.phase = "GAME_OVER";
    state.winner = opponentOf(playerId);
    state.loseReason = "DECK_OUT";
    addLog(state, "RESULT", `${playerId} 牌庫為空且需要抽牌，立即敗北`, { reason: "DECK_OUT" });
    return undefined;
  }
  card.zone = "HAND";
  player.hand.push(card);
  markHandEntryForEffectSummon(state, playerId, card, reason);
  addLog(state, "ZONE", `${playerId} 抽 1 張牌`, { instanceId: card.instanceId, reason });
  return card;
}

function grantCoin(state: GameState, playerId: PlayerId): void {
  const player = state.players[playerId];
  if (player.coinGranted) return;
  const coin = createCardInstance(getCardDefinition("TOKEN_COIN"), playerId, "HAND", `${playerId}-TOKEN_COIN-${state.turnNumber}`);
  player.hand.push(coin);
  player.coinGranted = true;
  addLog(state, "ZONE", `${playerId} 獲得幸運幣`, { instanceId: coin.instanceId, reason: "SECOND_PLAYER_BONUS" });
}

export function beginTurn(state: GameState): void {
  const player = state.players[state.activePlayerId];
  state.turnNumber += 1;
  player.turnsStarted += 1;
  state.pendingChoice = undefined;
  player.summonedThisTurn = 0;
  player.cardsPlayedThisTurn = 0;
  player.effectSummonUsedThisTurn = [];
  player.summonedDragonOriginalCostThisTurn = 0;
  for (const minion of player.minions) minion.attacksUsedThisTurn = 0;
  if (player.maxMana < state.rulesConfig.normalMaxMana) player.maxMana += 1;
  player.mana = player.maxMana;
  addLog(state, "RESOURCE", `${player.id} 水晶恢復為 ${player.mana}/${player.maxMana}`);

  state.phase = "DRAW";
  addLog(state, "PHASE", "DRAW");
  state.startTurnEffectsPending = true;
  enqueueStartTurnEffectSummons(state, player.id);
  enqueueStateBasedEffectSummons(state, player.id);
  resolvePendingEffects(state);
  if (gameHasEnded(state)) return;
  if (state.pendingChoice || state.pendingEffects.length > 0) return;
  continueAfterStartTurnEffects(state);
}

export function continueAfterStartTurnEffects(state: GameState): void {
  if (gameHasEnded(state)) return;
  const player = state.players[state.activePlayerId];
  state.startTurnEffectsPending = false;
  const isPlayersFirstTurn = player.normalDraws === 0;
  const drawCount = isPlayersFirstTurn && player.id !== state.startingPlayerId ? 2 : 1;
  player.normalDraws += 1;
  for (let index = 0; index < drawCount && !state.winner; index += 1) drawCard(state, player.id);
  if (isPlayersFirstTurn && player.id !== state.startingPlayerId && !state.winner) grantCoin(state, player.id);
  if (state.winner) return;
  state.phase = "COUNTDOWN";
  addLog(state, "PHASE", "COUNTDOWN");
  if (!processCountdownPhase(state, player.id)) return;
  continueAfterCountdown(state);
}

export function continueAfterCountdown(state: GameState): void {
  if (gameHasEnded(state)) return;
  state.phase = "GROWTH";
  addLog(state, "PHASE", "GROWTH");
  state.growthEffectsPending = true;
  const playerId = state.activePlayerId;
  const timing = createTimingContext(state, `GROWTH:${state.turnNumber}`);
  for (const source of state.players[playerId].fields) {
    const effects = getCardDefinition(source.definitionId).triggeredEffects?.GROWTH;
    if (!source.sealed && effects?.length && shouldEnqueueTriggeredEffectList(state, playerId, source, effects)) {
      enqueueTriggeredEffects(state, source, effects, "GROWTH", timing);
    }
  }
  resolvePendingEffects(state);
  if (gameHasEnded(state)) return;
  if (state.pendingChoice || state.pendingEffects.length > 0) return;
  continueAfterGrowthEffects(state);
}

export function continueAfterGrowthEffects(state: GameState): void {
  if (gameHasEnded(state)) return;
  state.growthEffectsPending = false;
  state.phase = "MAIN";
  addLog(state, "PHASE", "MAIN");
}

export function performMulligan(state: GameState, playerId: PlayerId, instanceIds: string[]): void {
  if (state.phase !== "MULLIGAN") throw new InvalidActionError("目前不是換牌階段");
  const player = state.players[playerId];
  if (player.mulliganDone) throw new InvalidActionError(`${playerId} 已完成換牌`);
  if (instanceIds.length > 4) throw new InvalidActionError("換牌只能選擇 0～4 張起始手牌");
  if (new Set(instanceIds).size !== instanceIds.length) throw new InvalidActionError("換牌實例不可重復");
  const selected = instanceIds.map((id) => {
    const card = player.hand.find((candidate) => candidate.instanceId === id);
    if (!card) throw new InvalidActionError("只能選擇自己的手牌換牌");
    return card;
  });
  for (let count = 0; count < selected.length; count += 1) drawCard(state, playerId, "MULLIGAN_REPLACEMENT");
  for (const card of selected) moveCard(state, card, "DECK", "MULLIGAN_RETURN");
  const shuffled = shuffleSeeded(player.deck, state.rngSeed);
  player.deck = shuffled.value;
  state.rngSeed = shuffled.seed;
  addLog(state, "RNG", `${playerId} 將換出牌加入牌組並洗牌`, { count: selected.length, resultingSeed: state.rngSeed });
  player.mulliganDone = true;
  addLog(state, "ACTION", `${playerId} 完成換牌`, { count: selected.length });
  if (state.players.P1.mulliganDone && state.players.P2.mulliganDone) beginTurn(state);
}

export function requestEndTurn(state: GameState, playerId: PlayerId): void {
  if (state.phase !== "MAIN" || state.activePlayerId !== playerId) throw new InvalidActionError("目前不能結束此玩家的回合");
  state.phase = "END";
  addLog(state, "PHASE", "END");
  state.endTurnEffectsPending = true;
  const timing = createTimingContext(state, `END_TURN:${state.turnNumber}`);
  for (const source of [...state.players[playerId].minions, ...state.players[playerId].fields]) {
    const effects = getCardDefinition(source.definitionId).triggeredEffects?.END_TURN;
    if (!source.sealed && effects?.length && shouldEnqueueTriggeredEffectList(state, playerId, source, effects)) {
      enqueueTriggeredEffects(state, source, effects, "END_TURN", timing);
    }
  }
  resolvePendingEffects(state);
  if (gameHasEnded(state)) return;
  if (state.pendingChoice || state.pendingEffects.length > 0) return;
  continueAfterEndTurnEffects(state);
}

export function continueAfterEndTurnEffects(state: GameState): void {
  if (gameHasEnded(state)) return;
  const playerId = state.activePlayerId;
  state.endTurnEffectsPending = false;
  state.phase = "HAND_LIMIT";
  addLog(state, "PHASE", "HAND_LIMIT");
  const excess = state.players[playerId].hand.length - state.rulesConfig.handLimitAtEnd;
  if (excess > 0) {
    state.pendingChoice = { type: "HAND_LIMIT", playerId, count: excess };
    addLog(state, "ACTION", `${playerId} 必須選擇棄掉 ${excess} 張手牌`);
    return;
  }
  finishTurn(state);
}

export function discardForHandLimit(state: GameState, playerId: PlayerId, instanceIds: string[]): void {
  const choice = state.pendingChoice;
  if (state.phase !== "HAND_LIMIT" || !choice || choice.type !== "HAND_LIMIT" || choice.playerId !== playerId) {
    throw new InvalidActionError("目前沒有此棄牌選擇");
  }
  if (instanceIds.length !== choice.count || new Set(instanceIds).size !== instanceIds.length) {
    throw new InvalidActionError(`必須選擇恰好 ${choice.count} 張不同的手牌`);
  }
  const player = state.players[playerId];
  const selected = instanceIds.map((id) => {
    const card = player.hand.find((candidate) => candidate.instanceId === id);
    if (!card) throw new InvalidActionError("只能棄掉自己的手牌");
    return card;
  });
  for (const card of selected) moveCard(state, card, "GRAVEYARD", "HAND_LIMIT_DISCARD");
  state.pendingChoice = undefined;
  finishTurn(state);
}

function finishTurn(state: GameState): void {
  clearTemporaryHandCosts(state, state.activePlayerId);
  state.players[state.activePlayerId].nextMinionTemporaryCostReduction = 0;
  state.activePlayerId = opponentOf(state.activePlayerId);
  beginTurn(state);
}
