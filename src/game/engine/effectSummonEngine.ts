import { getCardDefinition } from "../cards/cardRegistry";
import type { CardInstance, PlayerId } from "../cards/cardTypes";
import type { GameState } from "../state/GameState";
import { createTimingContext } from "./simultaneousEngine";
import { enqueueTriggeredEffects } from "./triggerEngine";

function enqueueGroups(state: GameState, playerId: PlayerId, sources: GameState["players"][PlayerId]["hand"], cause: string): void {
  if (sources.length === 0) return;
  const timing = createTimingContext(state, cause);
  for (const source of sources) {
    source.flags[`effectSummonQueuedTurn:${state.turnNumber}`] = true;
    delete source.flags.effectSummonEligibleFromNonNormalHandEntry;
  }
  const groups = new Map<string, typeof sources>();
  for (const source of sources) {
    const group = groups.get(source.definitionId) ?? [];
    group.push(source);
    groups.set(source.definitionId, group);
  }
  for (const [definitionId, group] of groups) {
    if (group.length === 1) {
      enqueueTriggeredEffects(state, group[0], [{ type: "SUMMON_SELF_FROM_HAND" }], cause, timing);
    } else {
      enqueueTriggeredEffects(state, group[0], [{
        type: "CHOOSE_EFFECT_SUMMON_COPY",
        definitionId,
        candidateInstanceIds: group.map((card) => card.instanceId),
      }], cause, timing);
    }
  }
}

export function enqueueStateBasedEffectSummons(state: GameState, playerId: PlayerId): void {
  if (state.activePlayerId !== playerId) return;
  const player = state.players[playerId];
  if (player.minions.length >= state.rulesConfig.minionLimit) return;
  const sources = player.hand.filter((card) => {
    const rule = getCardDefinition(card.definitionId).effectSummon;
    return !player.effectSummonUsedThisTurn.includes(card.definitionId)
      && card.flags[`effectSummonQueuedTurn:${state.turnNumber}`] !== true
      && ((rule?.event === "NECROMANCY_AT_LEAST" && player.resources.necromancy >= rule.value)
        || (rule?.event === "RECYCLE_CHARGE_AT_LEAST" && player.resources.recycleCharge >= rule.value)
        || (rule?.event === "SUMMONED_THIS_GAME_AT_LEAST" && player.summonedThisGame >= rule.value)
        || (rule?.event === "NON_NORMAL_HAND_ENTRY_SUMMONED_THIS_GAME_AT_LEAST" && card.flags.effectSummonEligibleFromNonNormalHandEntry === true));
  });
  enqueueGroups(state, playerId, sources, `EFFECT_SUMMON:STATE_BASED:${state.turnNumber}:${state.log.length}`);
}

export function markHandEntryForEffectSummon(state: GameState, playerId: PlayerId, card: CardInstance, reason: string): void {
  delete card.flags.effectSummonEligibleFromNonNormalHandEntry;
  const rule = getCardDefinition(card.definitionId).effectSummon;
  if (rule?.event !== "NON_NORMAL_HAND_ENTRY_SUMMONED_THIS_GAME_AT_LEAST") return;
  if (reason === "NORMAL_DRAW" || reason === "MULLIGAN_REPLACEMENT") return;
  if (state.players[playerId].summonedThisGame < rule.value) return;
  card.flags.effectSummonEligibleFromNonNormalHandEntry = true;
}

export function enqueueSpellPlayedEffectSummons(state: GameState, playerId: PlayerId, originalCost: number): void {
  const player = state.players[playerId];
  if (player.minions.length >= state.rulesConfig.minionLimit) return;
  const sources = player.hand.filter((card) => {
    const rule = getCardDefinition(card.definitionId).effectSummon;
    return !player.effectSummonUsedThisTurn.includes(card.definitionId)
      && rule?.event === "SPELL_PLAYED_ORIGINAL_COST_AT_LEAST" && originalCost >= rule.value;
  });
  enqueueGroups(state, playerId, sources, `EFFECT_SUMMON:SPELL_PLAYED:${player.cardsPlayedThisTurn}`);
}

export function enqueueStartTurnEffectSummons(state: GameState, playerId: PlayerId): void {
  const player = state.players[playerId];
  if (player.minions.length >= state.rulesConfig.minionLimit) return;
  const sources = player.hand.filter((card) => {
    const rule = getCardDefinition(card.definitionId).effectSummon;
    return !player.effectSummonUsedThisTurn.includes(card.definitionId)
      && rule?.event === "START_TURN_MAX_MANA_AT_LEAST" && player.maxMana >= rule.value;
  });
  enqueueGroups(state, playerId, sources, `EFFECT_SUMMON:START_TURN:${state.turnNumber}`);
}
