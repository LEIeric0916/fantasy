import { getCardDefinition } from "../cards/cardRegistry";
import type { ConditionDefinition, EffectDefinition, Keyword, PlayerId } from "../cards/cardTypes";
import { applyAction, type GameAction } from "../engine/gameEngine";
import { playerHasFaction, type GameState } from "../state/GameState";
import { getActingPlayerId, getLegalActions } from "./legalActionEngine";
import { nextAiRandom, type RandomDecision } from "./randomPolicy";
import { evaluatePublicCardValue, evaluatePublicMinionThreat, evaluatePublicState } from "./stateEvaluator";

interface SearchCandidate { action: GameAction; state: GameState; score: number; tacticalScore: number }
interface SearchBudget { remaining: number }

const ROYAL_HONOR_GUARD_ID = "TOKEN_ALLIANCE_ROYAL_HONOR_GUARD";
const CATASTROPHE_FLOOD_ID = "UNDEAD_014";

function valentineTimingAdjustment(state: GameState, playerId: PlayerId): number {
  const player = state.players[playerId];
  const opponent = state.players[playerId === "P1" ? "P2" : "P1"];
  const missingHeroHp = Math.max(0, player.heroMaxHp - player.heroHp);
  const hasHighDamageThreat = opponent.minions.some((card) => !card.sealed && (card.currentAttack ?? 0) > 4);
  const hasProtectableBoard = player.minions.some((card) =>
    (card.currentHealth ?? 0) > 4
    && (card.counters.damageCap === undefined || card.counters.damageCap > 4),
  );

  if (hasHighDamageThreat && hasProtectableBoard) return 14;
  if (missingHeroHp >= 3) return 4;
  if (!hasProtectableBoard && missingHeroHp === 0) return -48;
  if (!hasProtectableBoard && missingHeroHp <= 2) return -34;
  if (!hasHighDamageThreat && missingHeroHp === 0) return -44;
  if (!hasHighDamageThreat && missingHeroHp <= 2) return -30;
  return -10;
}

function targetedBattlecryWaste(state: GameState, playerId: PlayerId, definitionId: string): number {
  const definition = getCardDefinition(definitionId);
  if (!definition.keywords.includes("BATTLECRY") || state.players[playerId === "P1" ? "P2" : "P1"].minions.length > 0) return 0;
  const wastesEnemyTarget = definition.effects?.some((effect) =>
    effect.type === "DAMAGE_TARGET_ENEMY_MINION"
    || effect.type === "DESTROY_TARGET_ENEMY_MINION"
    || effect.type === "SEAL_TARGET_ENEMY_MINION"
    || effect.type === "TRANSFORM_ENEMY_MINIONS"
    || effect.type === "TRANSFORM_UP_TO_ENEMY_MINIONS",
  ) ?? false;
  if (!wastesEnemyTarget) return 0;
  const alsoDiscards = definition.effects?.some((effect) => effect.type === "DISCARD_HAND") ?? false;
  return alsoDiscards ? -34 : -14;
}

function effectsIncreaseMaxMana(effects: readonly EffectDefinition[] | undefined): boolean {
  return effects?.some((effect) => {
    if (effect.type === "INCREASE_MAX_MANA") return true;
    if (effect.type === "CONDITIONAL" || effect.type === "MECHANICAL_TECHNIQUE" || effect.type === "NECROMANCY") {
      return effectsIncreaseMaxMana(effect.effects);
    }
    return false;
  }) ?? false;
}

function cardActionIncreasesMaxMana(state: GameState, playerId: PlayerId, action: GameAction): boolean {
  if (action.type !== "PLAY_CARD" && action.type !== "PLAY_ALTERNATE") return false;
  const card = state.players[playerId].hand.find((candidate) => candidate.instanceId === action.instanceId);
  if (!card) return false;
  const definition = getCardDefinition(card.definitionId);
  return effectsIncreaseMaxMana(action.type === "PLAY_ALTERNATE" ? definition.alternatePlay?.effects : definition.effects);
}

function dragonRampTimingScore(state: GameState, playerId: PlayerId, action: GameAction): number {
  const player = state.players[playerId];
  if (!playerHasFaction(player, "DRAGON") || player.maxMana >= state.rulesConfig.normalMaxMana || !cardActionIncreasesMaxMana(state, playerId, action)) return 0;
  const opponent = state.players[playerId === "P1" ? "P2" : "P1"];
  const incomingAttack = opponent.minions.reduce((sum, card) => sum + Math.max(0, card.currentAttack ?? 0), 0);
  const emergency = player.heroHp <= 10 || incomingAttack >= player.heroHp || (opponent.minions.length >= 3 && incomingAttack >= 8);
  if (emergency) return 6;
  const remainingGrowth = state.rulesConfig.normalMaxMana - player.maxMana;
  return 28 + remainingGrowth * 3 + (action.type === "PLAY_ALTERNATE" ? 8 : 0);
}

function coinTimingWaste(state: GameState, playerId: PlayerId, coinInstanceId: string): number {
  const player = state.players[playerId];
  const coin = player.hand.find((card) => card.instanceId === coinInstanceId);
  if (!coin || coin.definitionId !== "TOKEN_COIN") return 0;
  const manaGain = getCardDefinition(coin.definitionId).effects
    ?.filter((effect) => effect.type === "GAIN_MANA")
    .reduce((sum, effect) => sum + effect.value, 0) ?? 0;
  const followUps = player.hand.filter((card) =>
    card.instanceId !== coinInstanceId
    && card.currentCost !== null
    && card.currentCost > player.mana
    && card.currentCost <= player.mana + manaGain,
  );
  const hasWorthwhileFollowUp = followUps.some((card) => targetedBattlecryWaste(state, playerId, card.definitionId) === 0);
  if (!hasWorthwhileFollowUp) return -32;
  if (!playerHasFaction(player, "DRAGON") || player.maxMana > 3) return 0;
  const enablesRamp = followUps.some((card) => effectsIncreaseMaxMana(getCardDefinition(card.definitionId).effects));
  if (enablesRamp) return 10;
  const opponent = state.players[playerId === "P1" ? "P2" : "P1"];
  const incomingAttack = opponent.minions.reduce((sum, card) => sum + Math.max(0, card.currentAttack ?? 0), 0);
  const emergency = player.heroHp <= 10 || incomingAttack >= 6 || opponent.minions.length >= 3;
  if (followUps.some((card) => card.definitionId === "DRAGON_001")) return emergency ? -8 : -58;
  return emergency ? -4 : -36;
}

function findMinion(state: GameState, instanceId: string) {
  return state.players.P1.minions.find((card) => card.instanceId === instanceId)
    ?? state.players.P2.minions.find((card) => card.instanceId === instanceId);
}

function boardAttack(cards: readonly { currentAttack: number | null; sealed: boolean; keywords: readonly string[] }[]): number {
  return cards
    .filter((card) => !card.sealed)
    .reduce((sum, card) => sum + Math.max(0, card.currentAttack ?? 0) * (card.keywords.includes("WINDFURY") ? 2 : 1), 0);
}

function projectedOpponentBurstRisk(state: GameState, playerId: PlayerId): number {
  const player = state.players[playerId];
  const opponent = state.players[playerId === "P1" ? "P2" : "P1"];
  const boardPressure = boardAttack(opponent.minions);
  const handPressureEstimate = Math.min(opponent.hand.length, Math.max(1, Math.floor((opponent.maxMana + 1) / 3))) * 2;
  return boardPressure + handPressureEstimate - player.heroHp;
}

function minionCanKill(attacker: { currentAttack: number | null; sealed: boolean; keywords: readonly string[] }, defender: { currentHealth: number | null; sealed: boolean; keywords: readonly string[] }): boolean {
  const defenderHas = (keyword: Keyword) => !defender.sealed && defender.keywords.includes(keyword);
  if (defenderHas("INVINCIBLE")) return false;
  if (!attacker.sealed && attacker.keywords.includes("LETHAL") && !defenderHas("SANCTUARY")) return true;
  if (defenderHas("DIVINE_SHIELD")) return false;
  return (attacker.currentAttack ?? 0) >= (defender.currentHealth ?? Number.POSITIVE_INFINITY);
}

function canAttackMinionThisTurn(state: GameState, card: GameState["players"][PlayerId]["minions"][number]): boolean {
  if (card.sealed) return false;
  const attackLimit = card.keywords.includes("WINDFURY") ? 2 : 1;
  if (card.attacksUsedThisTurn >= attackLimit) return false;
  if (card.summonedOnTurn !== state.turnNumber) return true;
  return card.keywords.includes("CHARGE") || card.keywords.includes("RUSH");
}

function playableCatastropheFlood(state: GameState, playerId: PlayerId): boolean {
  return state.players[playerId].hand.some((card) =>
    card.definitionId === CATASTROPHE_FLOOD_ID
    && card.currentCost !== null
    && card.currentCost <= state.players[playerId].mana,
  );
}

function activeRoyalHonorGuardProtection(state: GameState, playerId: PlayerId) {
  const opponent = state.players[playerId === "P1" ? "P2" : "P1"];
  const guard = opponent.minions.find((card) => card.definitionId === ROYAL_HONOR_GUARD_ID && !card.sealed);
  if (!guard) return undefined;
  const protectedMinions = opponent.minions.filter((card) => card.instanceId !== guard.instanceId);
  if (protectedMinions.length === 0) return undefined;
  return { guard, protectedMinions };
}

function catastropheFloodTimingScore(state: GameState, resultingState: GameState, playerId: PlayerId, action: GameAction): number {
  const protection = activeRoyalHonorGuardProtection(state, playerId);
  if (!protection) return 0;
  if (action.type === "PLAY_CARD" || action.type === "PLAY_ALTERNATE") {
    const card = state.players[playerId].hand.find((candidate) => candidate.instanceId === action.instanceId);
    if (card?.definitionId === CATASTROPHE_FLOOD_ID) return -140 - protection.protectedMinions.length * 26;
    return 0;
  }
  if (action.type !== "ATTACK" || action.target.type !== "MINION" || action.target.instanceId !== protection.guard.instanceId) return 0;
  if (!playableCatastropheFlood(resultingState, playerId)) return 0;
  const guardStillActive = activeRoyalHonorGuardProtection(resultingState, playerId);
  return guardStillActive ? 0 : 115 + protection.protectedMinions.length * 20;
}

function attackOutcomeScore(state: GameState, resultingState: GameState, playerId: PlayerId, action: GameAction): number {
  if (action.type !== "ATTACK") return 0;
  const attacker = state.players[playerId].minions.find((card) => card.instanceId === action.attackerId);
  if (!attacker) return 0;
  const attack = Math.max(0, attacker.currentAttack ?? 0);
  const attackEffects = !attacker.sealed
    ? getCardDefinition(attacker.definitionId).triggeredEffects?.ON_ATTACK
    : undefined;
  const clearsBoardOnAttack = attackEffects?.some((effect) => effect.type === "DAMAGE_ALL_ENEMY_MINIONS") ?? false;
  const hasAttackTrigger = !attacker.sealed && Boolean(
    attackEffects?.length
    || getCardDefinition(attacker.definitionId).triggeredEffects?.ON_SELF_COMBAT_START?.length,
  );
  if (attack === 0 && !hasAttackTrigger) return -120;
  if (action.target.type === "HERO") {
    if (attack === 0) return -120;
    const opponent = state.players[playerId === "P1" ? "P2" : "P1"];
    if (clearsBoardOnAttack) {
      const opponentAfter = resultingState.players[opponent.id];
      const removedMinions = Math.max(0, opponent.minions.length - opponentAfter.minions.length);
      const removedAttack = Math.max(0, boardAttack(opponent.minions) - boardAttack(opponentAfter.minions));
      return 80 + attack * 5 + removedMinions * 12 + removedAttack * 4;
    }
    const risk = projectedOpponentBurstRisk(state, playerId);
    const killableThreat = opponent.minions
      .filter((card) => minionCanKill(attacker, card))
      .sort((a, b) => evaluatePublicMinionThreat(b) - evaluatePublicMinionThreat(a))[0];
    if (!killableThreat) return 0;
    const threatAttack = Math.max(0, killableThreat.currentAttack ?? 0);
    if (risk >= -4 || state.players[playerId].heroHp <= 15) {
      return -18 - threatAttack * 5 - evaluatePublicCardValue(killableThreat) * 0.25;
    }
    return threatAttack >= 5 ? -12 : 0;
  }

  const defender = findMinion(state, action.target.instanceId);
  if (!defender) return 0;
  const resultingAttacker = findMinion(resultingState, attacker.instanceId);
  const resultingDefender = findMinion(resultingState, defender.instanceId);
  const defenderHealthLost = resultingDefender ? Math.max(0, (defender.currentHealth ?? 0) - (resultingDefender.currentHealth ?? 0)) : defender.currentHealth ?? 0;
  const defenderShieldBroken = !defender.sealed && defender.keywords.includes("DIVINE_SHIELD")
    && !(resultingDefender && !resultingDefender.sealed && resultingDefender.keywords.includes("DIVINE_SHIELD"));
  const attackerShieldConsumed = !attacker.sealed && attacker.keywords.includes("DIVINE_SHIELD")
    && !(resultingAttacker && !resultingAttacker.sealed && resultingAttacker.keywords.includes("DIVINE_SHIELD"));
  const incomingBefore = boardAttack(state.players[playerId === "P1" ? "P2" : "P1"].minions);
  const incomingAfter = boardAttack(resultingState.players[playerId === "P1" ? "P2" : "P1"].minions);
  const pressureRelief = Math.max(0, incomingBefore - incomingAfter);
  const risk = projectedOpponentBurstRisk(state, playerId);
  const defenderThreat = evaluatePublicMinionThreat(defender);
  let score = resultingDefender ? defenderHealthLost * 1.5 + (defenderShieldBroken ? 3 : 0) : 24 + defenderThreat * 0.3;
  score += pressureRelief * (risk >= -4 || state.players[playerId].heroHp <= 15 ? 9 : 3.2);
  if (resultingDefender && (defenderHealthLost > 0 || defenderShieldBroken)) {
    const followUpAttackers = resultingState.players[playerId].minions.filter((card) => canAttackMinionThisTurn(resultingState, card));
    const followUpCanFinish = followUpAttackers.some((card) => !card.sealed && card.keywords.includes("LETHAL") && !resultingDefender.keywords.includes("SANCTUARY"))
      || followUpAttackers.reduce((sum, card) => sum + Math.max(0, card.currentAttack ?? 0), 0) >= (resultingDefender.currentHealth ?? Number.POSITIVE_INFINITY);
    if (followUpCanFinish) score += Math.min(42, 8 + defenderThreat * 0.55);
  }
  if (defenderHealthLost === 0 && !defenderShieldBroken && resultingDefender) score -= 80;
  if (attackerShieldConsumed && resultingDefender && defenderHealthLost < Math.max(1, (defender.currentHealth ?? 1) / 2)) score -= 24;
  if (!resultingAttacker) score -= 8;
  return score;
}

function effectDamageChoiceScore(state: GameState, resultingState: GameState, playerId: PlayerId, action: GameAction): number {
  if (action.type !== "SELECT_EFFECT_CARDS" || state.pendingChoice?.type !== "EFFECT_CARDS") return 0;
  const resolution = state.pendingChoice.resolution;
  if (resolution.type !== "DAMAGE_MINION" && resolution.type !== "REPEAT_DAMAGE_MINION"
    && resolution.type !== "REPEAT_DAMAGE_MINION_OR_HERO" && resolution.type !== "DAMAGE_MINIONS_REWARD_KILLS") return 0;
  const value = resolution.value;
  const targets = action.instanceIds.map((id) => findMinion(state, id)).filter((card) => card !== undefined);
  let kills = 0;
  let actualImpact = 0;
  for (const target of targets) {
    const after = findMinion(resultingState, target.instanceId);
    if (!after) {
      kills += 1;
      actualImpact += evaluatePublicCardValue(target);
      continue;
    }
    actualImpact += Math.max(0, (target.currentHealth ?? 0) - (after.currentHealth ?? 0)) * 2;
    if (!target.sealed && target.keywords.includes("DIVINE_SHIELD") && (after.sealed || !after.keywords.includes("DIVINE_SHIELD"))) actualImpact += 3;
  }
  const killWasAvailable = state.pendingChoice.candidateInstanceIds.some((id) => {
    const candidate = findMinion(state, id);
    if (!candidate || candidate.sealed) return Boolean(candidate && (candidate.currentHealth ?? Number.POSITIVE_INFINITY) <= value);
    return !candidate.keywords.includes("DIVINE_SHIELD")
      && !candidate.keywords.includes("INVINCIBLE")
      && (candidate.currentHealth ?? Number.POSITIVE_INFINITY) <= value;
  });
  if (actualImpact === 0) return -100;
  return actualImpact * 0.45 + kills * 22 - (killWasAvailable && kills === 0 ? 48 : 0);
}

function necroReviveCost(keywords: readonly string[]): number | undefined {
  const keyword = keywords.find((candidate) => candidate.startsWith("NECRO_REVIVE_"));
  if (!keyword) return undefined;
  const cost = Number(keyword.slice("NECRO_REVIVE_".length));
  return Number.isFinite(cost) ? cost : undefined;
}

function undeadDiscardChoiceScore(state: GameState, playerId: PlayerId, action: GameAction): number {
  if (action.type !== "SELECT_EFFECT_CARDS" || state.pendingChoice?.type !== "EFFECT_CARDS"
    || state.pendingChoice.resolution.type !== "DISCARD_HAND" || !playerHasFaction(state.players[playerId], "UNDEAD")) return 0;
  const player = state.players[playerId];
  const opponent = state.players[playerId === "P1" ? "P2" : "P1"];
  const incomingAttack = opponent.minions.reduce((sum, card) => sum + Math.max(0, card.currentAttack ?? 0), 0);
  const underPressure = player.heroHp <= 12 || incomingAttack >= player.heroHp
    || (opponent.minions.length >= player.minions.length + 2 && incomingAttack >= 7);

  return action.instanceIds.reduce((score, instanceId) => {
    const card = player.hand.find((candidate) => candidate.instanceId === instanceId);
    if (!card) return score;
    const definition = getCardDefinition(card.definitionId);
    const hasDiscardEffect = !card.sealed && card.keywords.includes("ON_DISCARD")
      && Boolean(definition.triggeredEffects?.ON_DISCARD?.length);
    const reviveCost = card.sealed ? undefined : necroReviveCost(card.keywords);
    const canReviveNow = reviveCost !== undefined
      && player.resources.necromancy >= reviveCost
      && player.minions.length < state.rulesConfig.minionLimit;
    let cardScore = hasDiscardEffect ? 52 : 0;
    cardScore += canReviveNow ? 64 : reviveCost !== undefined ? 8 : 0;
    cardScore -= evaluatePublicCardValue(card) * (hasDiscardEffect || canReviveNow ? 0.05 : 0.22);
    if (underPressure && !canReviveNow && definition.cardType === "MINION"
      && card.keywords.some((keyword) => keyword === "TAUNT" || keyword === "RUSH" || keyword === "CHARGE")) cardScore -= 22;
    return score + cardScore;
  }, 0);
}

function undeadBookChoiceScore(state: GameState, playerId: PlayerId, action: GameAction): number {
  if (action.type !== "SELECT_EFFECT_OPTION" || state.pendingChoice?.type !== "EFFECT_OPTION"
    || !playerHasFaction(state.players[playerId], "UNDEAD")) return 0;
  const bookIds = new Set([
    "TOKEN_UNDEAD_BOOK_IMMORTAL",
    "TOKEN_UNDEAD_BOOK_PLAGUE",
    "TOKEN_UNDEAD_BOOK_REVENGE",
    "TOKEN_UNDEAD_BOOK_DOOM_PRELUDE",
    "TOKEN_UNDEAD_BOOK_FINAL_ARRIVAL",
  ]);
  if (!bookIds.has(action.optionId) || !state.pendingChoice.options.some((option) => option.id === action.optionId)) return 0;

  const player = state.players[playerId];
  const opponent = state.players[playerId === "P1" ? "P2" : "P1"];
  const incomingAttack = boardAttack(opponent.minions);
  const underPressure = player.heroHp <= 12 || incomingAttack >= player.heroHp - 5 || opponent.minions.length >= player.minions.length + 2;
  const darkBookCount = player.fields.filter((field) => getCardDefinition(field.definitionId).subtype.includes("DARK_MAGIC")).length;
  const doomsdayCount = player.fields.filter((field) => field.definitionId === "TOKEN_UNDEAD_DOOMSDAY_BOOK").length;
  const preludeCount = player.fields.filter((field) => field.definitionId === "TOKEN_UNDEAD_BOOK_DOOM_PRELUDE").length;
  const hasDoomsayerOrFlood = player.hand.some((card) => card.definitionId === "UNDEAD_004" || card.definitionId === "UNDEAD_014");
  const lowHealthTargets = opponent.minions.filter((card) => (card.currentHealth ?? 99) <= 3);
  const hardLowHealthTarget = lowHealthTargets.some((card) =>
    evaluatePublicCardValue(card) >= 15 || card.keywords.includes("TAUNT") || card.keywords.includes("DIVINE_SHIELD"),
  );
  const likelyLowHpSoon = player.heroHp <= 13 || incomingAttack >= Math.max(4, player.heroHp - 10);

  switch (action.optionId) {
    case "TOKEN_UNDEAD_BOOK_IMMORTAL":
      return (player.resources.necromancy < 20 ? 20 : 8)
        + (player.minions.length < state.rulesConfig.minionLimit ? 14 : -10)
        + (underPressure ? 10 : 4)
        + darkBookCount * 2;
    case "TOKEN_UNDEAD_BOOK_PLAGUE":
      return (lowHealthTargets.length > 0 ? 18 + lowHealthTargets.length * 5 : -6)
        + (hardLowHealthTarget ? 18 : 0)
        + (hasDoomsayerOrFlood ? 16 : 0)
        + (underPressure ? 8 : 0);
    case "TOKEN_UNDEAD_BOOK_REVENGE":
      return 8
        + (player.resources.necromancy < 10 ? 18 : 7)
        + (player.heroHp < 10 ? 48 : 0)
        + (likelyLowHpSoon ? 20 : 0)
        + (underPressure ? 8 : 0);
    case "TOKEN_UNDEAD_BOOK_DOOM_PRELUDE":
      return preludeCount >= 2
        ? 78
        : 8 + preludeCount * 20 + (darkBookCount >= 2 ? 8 : 0) - (underPressure && preludeCount === 0 ? 10 : 0);
    case "TOKEN_UNDEAD_BOOK_FINAL_ARRIVAL":
      return doomsdayCount > 0
        ? 30 + (underPressure ? 24 : 0) + Math.min(20, incomingAttack * 2) + doomsdayCount * 7
        : -44;
    default:
      return 0;
  }
}

function isArtifact(definitionId: string): boolean {
  const definition = getCardDefinition(definitionId);
  return definition.cardType === "FIELD" && definition.subtype.includes("ARTIFACT");
}

function machinePlayTimingScore(state: GameState, playerId: PlayerId, instanceId: string): number {
  const player = state.players[playerId];
  if (!playerHasFaction(player, "MACHINE")) return 0;
  const card = player.hand.find((candidate) => candidate.instanceId === instanceId);
  if (!card) return 0;

  const hasArtifact = player.fields.some((field) => isArtifact(field.definitionId));
  const hasPlayableArtifact = player.hand.some((candidate) =>
    candidate.instanceId !== instanceId
    && isArtifact(candidate.definitionId)
    && candidate.currentCost !== null
    && candidate.currentCost <= player.mana,
  );
  const hasArtifactPayoff = player.hand.some((candidate) =>
    candidate.instanceId !== instanceId
    && (candidate.definitionId === "MACHINE_002" || candidate.definitionId === "MACHINE_003"),
  );
  const mulius = player.hand.find((candidate) => candidate.definitionId === "MACHINE_014" && candidate.currentCost !== null);
  const artifactBeforeMulius = mulius ? player.hand.find((candidate) =>
    candidate.instanceId !== mulius.instanceId
    && isArtifact(candidate.definitionId)
    && candidate.currentCost !== null
    && mulius.currentCost !== null
    && candidate.currentCost + Math.max(0, mulius.currentCost - 1) <= player.mana,
  ) : undefined;

  if (card.definitionId === "MACHINE_002" || card.definitionId === "MACHINE_003") {
    if (hasArtifact) return card.definitionId === "MACHINE_002" ? 16 : 12;
    if (hasPlayableArtifact) return card.definitionId === "MACHINE_002" ? -38 : -28;
    return card.definitionId === "MACHINE_002" ? -12 : -7;
  }
  if (isArtifact(card.definitionId) && !hasArtifact && hasArtifactPayoff) return 20;
  if (card.definitionId === "MACHINE_014" && artifactBeforeMulius) return -72;
  if (isArtifact(card.definitionId) && mulius && artifactBeforeMulius?.instanceId === card.instanceId) return 58;

  if (card.definitionId === "MACHINE_007") {
    const machineMinions = player.hand.filter((candidate) => {
      if (candidate.instanceId === instanceId) return false;
      const definition = getCardDefinition(candidate.definitionId);
      return definition.faction === "MACHINE" && definition.cardType === "MINION";
    });
    const onlyCheapTargets = machineMinions.length > 0 && machineMinions.every((candidate) =>
      (getCardDefinition(candidate.definitionId).originalCost ?? Number.POSITIVE_INFINITY) <= 3,
    );
    if (onlyCheapTargets) return -70;
    const hasDirectMachinePlay = machineMinions.some((candidate) => {
      if (candidate.instanceId === instanceId || candidate.currentCost === null || candidate.currentCost > player.mana) return false;
      return true;
    });
    if (player.maxMana <= 4 && hasDirectMachinePlay) return -42;
  }
  return 0;
}

function machineDescentChoiceScore(state: GameState, playerId: PlayerId, action: GameAction): number {
  if (action.type !== "SELECT_EFFECT_CARDS" || state.pendingChoice?.type !== "EFFECT_CARDS"
    || state.pendingChoice.resolution.type !== "RETURN_HAND_TO_DECK_MACHINE_DISCOUNT") return 0;

  const player = state.players[playerId];
  const selected = action.instanceIds
    .map((instanceId) => player.hand.find((card) => card.instanceId === instanceId))
    .filter((card) => card !== undefined);
  const selectedIds = new Set(action.instanceIds);
  const nextMachine = player.hand
    .filter((card) => !selectedIds.has(card.instanceId))
    .filter((card) => {
      const definition = getCardDefinition(card.definitionId);
      return definition.faction === "MACHINE" && definition.cardType === "MINION" && card.currentCost !== null;
    })
    .sort((a, b) => (b.currentCost ?? 0) - (a.currentCost ?? 0))[0];
  const reduction = selected.length * state.pendingChoice.resolution.reductionPerCard;
  const usefulReduction = nextMachine ? Math.min(reduction, nextMachine.currentCost ?? 0) : 0;
  const selectedValue = selected.reduce((sum, card) => sum + evaluatePublicCardValue(card), 0);
  const earlyGame = player.maxMana <= 4 || player.turnsStarted <= 3;

  if (selected.length === 0) return earlyGame ? 8 : 0;
  if (nextMachine && (getCardDefinition(nextMachine.definitionId).originalCost ?? Number.POSITIVE_INFINITY) <= 3) {
    return -90 - selected.length * 12 - selectedValue * 0.2;
  }
  if (earlyGame) {
    return usefulReduction * 2
      - selected.length * 30
      - selectedValue * 0.25
      - (nextMachine ? 0 : 20);
  }
  return usefulReduction * 2.5
    - selected.length * 5
    - selectedValue * 0.08
    - (nextMachine ? 0 : 20);
}

function planningConditionMatches(state: GameState, playerId: PlayerId, condition: ConditionDefinition): boolean {
  const player = state.players[playerId];
  const opponent = state.players[playerId === "P1" ? "P2" : "P1"];
  switch (condition.type) {
    case "SUMMONED_THIS_GAME_AT_LEAST": return player.summonedThisGame + 1 >= condition.value;
    case "SUMMONED_THIS_GAME_BELOW": return player.summonedThisGame + 1 < condition.value;
    case "FRIENDLY_MINION_COUNT_AT_LEAST": return player.minions.length + 1 >= condition.value;
    case "FRIENDLY_MINION_COUNT_LESS_THAN_OPPONENT": return player.minions.length + 1 < opponent.minions.length;
    case "OPPONENT_HAS_MINION": return opponent.minions.length > 0;
    case "MAX_MANA_EQUALS": return player.maxMana === condition.value;
    case "MAX_MANA_AT_LEAST": return player.maxMana >= condition.value;
    case "ALL": return condition.conditions.every((nested) => planningConditionMatches(state, playerId, nested));
    default: return true;
  }
}

function plannedExtraMinions(state: GameState, playerId: PlayerId, effects: readonly EffectDefinition[] | undefined): number {
  if (!effects) return 0;
  return effects.reduce((sum, effect) => {
    if (effect.type === "SUMMON") return sum + effect.count;
    if (effect.type === "CHOOSE_DISTINCT_GENERATED_MINIONS") return sum + effect.count;
    if (effect.type === "CONDITIONAL" && planningConditionMatches(state, playerId, effect.condition)) {
      return sum + plannedExtraMinions(state, playerId, effect.effects);
    }
    if (effect.type === "MECHANICAL_TECHNIQUE" && state.players[playerId].resources.recycleCharge >= effect.cost) {
      return sum + plannedExtraMinions(state, playerId, effect.effects);
    }
    if (effect.type === "NECROMANCY" && state.players[playerId].resources.necromancy >= effect.cost) {
      return sum + plannedExtraMinions(state, playerId, effect.effects);
    }
    return sum;
  }, 0);
}

function needsBoardSpaceForHand(state: GameState, playerId: PlayerId): boolean {
  const player = state.players[playerId];
  const availableSlots = state.rulesConfig.minionLimit - player.minions.length;
  return player.hand.some((card) => {
    if (card.currentCost === null || card.currentCost > player.mana) return false;
    const definition = getCardDefinition(card.definitionId);
    if (definition.cardType !== "MINION") return false;
    return 1 + plannedExtraMinions(state, playerId, definition.effects) > availableSlots;
  });
}

function boardSpaceActionScore(state: GameState, playerId: PlayerId, action: GameAction): number {
  const player = state.players[playerId];
  if (action.type === "PLAY_CARD" || action.type === "PLAY_ALTERNATE") {
    const card = player.hand.find((candidate) => candidate.instanceId === action.instanceId);
    if (!card) return 0;
    const definition = getCardDefinition(card.definitionId);
    if (definition.cardType !== "MINION") return 0;
    const availableSlots = state.rulesConfig.minionLimit - player.minions.length;
    const lostSummons = Math.max(0, 1 + plannedExtraMinions(state, playerId, definition.effects) - availableSlots);
    return lostSummons > 0 ? -32 * lostSummons : 0;
  }
  if (action.type !== "ATTACK" || action.target.type !== "MINION" || !needsBoardSpaceForHand(state, playerId)) return 0;
  const attacker = player.minions.find((card) => card.instanceId === action.attackerId);
  const opponent = state.players[playerId === "P1" ? "P2" : "P1"];
  const targetInstanceId = action.target.instanceId;
  const defender = opponent.minions.find((card) => card.instanceId === targetInstanceId);
  if (!attacker || !defender) return 0;
  const attackerHas = (keyword: Keyword) => !attacker.sealed && attacker.keywords.includes(keyword);
  const defenderHas = (keyword: Keyword) => !defender.sealed && defender.keywords.includes(keyword);
  const attackerDies = !attackerHas("INVINCIBLE") && (
    (defenderHas("LETHAL") && !attackerHas("SANCTUARY"))
    || (!attackerHas("DIVINE_SHIELD") && !defenderHas("CANNOT_COUNTERATTACK")
      && (defender.currentAttack ?? 0) >= (attacker.currentHealth ?? Number.POSITIVE_INFINITY))
  );
  const defenderDies = !defenderHas("INVINCIBLE") && (
    (attackerHas("LETHAL") && !defenderHas("SANCTUARY"))
    || (!defenderHas("DIVINE_SHIELD")
      && (attacker.currentAttack ?? 0) >= (defender.currentHealth ?? Number.POSITIVE_INFINITY))
  );
  if (attackerDies && defenderDies) return 120;
  if (attackerDies && !defenderDies) return -100;
  return 0;
}

function royalWarriorTimingScore(state: GameState, playerId: PlayerId, instanceId: string): number {
  const player = state.players[playerId];
  const card = player.hand.find((candidate) => candidate.instanceId === instanceId);
  if (!card || card.definitionId !== "ALLIANCE_010") return 0;
  if (player.summonedThisGame + 1 >= 15) return 18;

  const opponent = state.players[playerId === "P1" ? "P2" : "P1"];
  const incomingAttack = opponent.minions.reduce((sum, minion) => sum + Math.max(0, minion.currentAttack ?? 0), 0);
  const underPressure = player.heroHp <= 15
    || incomingAttack >= player.heroHp
    || (opponent.minions.length >= player.minions.length + 2 && incomingAttack >= 6);
  if (underPressure) return 12;

  let remainingMana = player.mana;
  let projectedSummons = 0;
  const setupMinions = player.hand
    .filter((candidate) => candidate.instanceId !== instanceId && candidate.currentCost !== null)
    .filter((candidate) => getCardDefinition(candidate.definitionId).cardType === "MINION")
    .sort((a, b) => (a.currentCost ?? 0) - (b.currentCost ?? 0));
  for (const setup of setupMinions) {
    const cost = setup.currentCost ?? Number.POSITIVE_INFINITY;
    if (cost > remainingMana) continue;
    remainingMana -= cost;
    projectedSummons += 1 + plannedExtraMinions(state, playerId, getCardDefinition(setup.definitionId).effects);
  }
  if (player.summonedThisGame + projectedSummons + 1 >= 15) return -44;
  return 15 - player.summonedThisGame <= 3 ? -20 : 0;
}

function lowCostSetupScore(state: GameState, playerId: PlayerId, instanceId: string): number {
  const card = state.players[playerId].hand.find((candidate) => candidate.instanceId === instanceId);
  if (!card || card.currentCost === null || card.currentCost > 1) return 0;
  const effects = getCardDefinition(card.definitionId).effects;
  const enablesFollowUp = effects?.some((effect) =>
    effect.type === "SEARCH_DECK"
    || effect.type === "DISCOVER_TOP"
    || effect.type === "GRANT_NEXT_MINION_TEMPORARY_COST_REDUCTION",
  ) ?? false;
  return enablesFollowUp ? 45 : 0;
}

export function tacticalActionScore(state: GameState, playerId: PlayerId, action: GameAction, resultingState: GameState): number {
  const floodTimingScore = catastropheFloodTimingScore(state, resultingState, playerId, action);
  if (floodTimingScore !== 0) return floodTimingScore;
  const bookChoiceScore = undeadBookChoiceScore(state, playerId, action);
  if (bookChoiceScore !== 0) return bookChoiceScore;
  const descentChoiceScore = machineDescentChoiceScore(state, playerId, action);
  if (descentChoiceScore !== 0) return descentChoiceScore;
  const discardChoiceScore = undeadDiscardChoiceScore(state, playerId, action);
  if (discardChoiceScore !== 0) return discardChoiceScore;
  const damageChoiceScore = effectDamageChoiceScore(state, resultingState, playerId, action);
  if (damageChoiceScore !== 0) return damageChoiceScore;
  if (action.type === "SELECT_EFFECT_CARDS" && state.pendingChoice?.type === "EFFECT_CARDS"
    && state.pendingChoice.resolution.type === "GRANT_MINION_KEYWORD") {
    const grantedKeyword = state.pendingChoice.resolution.keyword;
    const targets = action.instanceIds
      .map((instanceId) => state.players[playerId].minions.find((card) => card.instanceId === instanceId))
      .filter((card) => card !== undefined);
    return targets.reduce((sum, card) => {
      if (card.keywords.includes(grantedKeyword)) return sum - 40;
      return sum + evaluatePublicCardValue(card) * 0.22;
    }, 0);
  }
  if (action.type === "ATTACK") return boardSpaceActionScore(state, playerId, action) + attackOutcomeScore(state, resultingState, playerId, action);
  if (action.type !== "PLAY_CARD" && action.type !== "PLAY_ALTERNATE") return 0;
  const card = state.players[playerId].hand.find((candidate) => candidate.instanceId === action.instanceId);
  if (!card) return 0;
  return targetedBattlecryWaste(state, playerId, card.definitionId)
    + coinTimingWaste(state, playerId, card.instanceId)
    + machinePlayTimingScore(state, playerId, card.instanceId)
    + lowCostSetupScore(state, playerId, card.instanceId)
    + royalWarriorTimingScore(state, playerId, card.instanceId)
    + dragonRampTimingScore(state, playerId, action)
    + boardSpaceActionScore(state, playerId, action);
}

function actionPlanningPriority(state: GameState, playerId: PlayerId, action: GameAction): number {
  if (action.type === "SELECT_EFFECT_CARDS" || action.type === "SELECT_EFFECT_OPTION" || action.type === "CONFIRM_EFFECT_SUMMON") return 80;
  if (action.type === "ATTACK" && action.target.type === "MINION") {
    const protection = activeRoyalHonorGuardProtection(state, playerId);
    const floodSetup = protection && action.target.instanceId === protection.guard.instanceId && playableCatastropheFlood(state, playerId)
      ? 55
      : 0;
    return 35 + boardSpaceActionScore(state, playerId, action) + floodSetup;
  }
  if (action.type === "ATTACK") return 20;
  if (action.type === "ACTIVATE_FIELD") return 28;
  if (action.type === "END_TURN") return -100;
  if (action.type !== "PLAY_CARD" && action.type !== "PLAY_ALTERNATE") return 0;

  const player = state.players[playerId];
  const card = player.hand.find((candidate) => candidate.instanceId === action.instanceId);
  if (!card) return 0;
  const definition = getCardDefinition(card.definitionId);
  const cost = card.currentCost ?? definition.originalCost ?? 10;
  let priority = 50 - cost;
  if (definition.id === CATASTROPHE_FLOOD_ID && activeRoyalHonorGuardProtection(state, playerId)) priority -= 70;
  if (definition.cardType === "MINION") priority += 8;
  if (definition.keywords.includes("BATTLECRY")) priority += 4;
  const opensFollowUp = definition.effects?.some((effect) =>
    effect.type === "SEARCH_DECK"
    || effect.type === "DISCOVER_TOP"
    || effect.type === "GRANT_NEXT_MINION_TEMPORARY_COST_REDUCTION",
  ) ?? false;
  if (definition.effects?.some((effect) => effect.type === "SUMMON" || opensFollowUp)) priority += 9;
  if (opensFollowUp && cost <= 1) priority += 36;
  if (playerHasFaction(player, "ALLIANCE") && definition.cardType === "MINION") priority += 5;
  if (definition.id === "TOKEN_ALLIANCE_HERO_VALENTINE") priority += valentineTimingAdjustment(state, playerId);
  if (cardActionIncreasesMaxMana(state, playerId, action)) priority += 22;
  priority += machinePlayTimingScore(state, playerId, card.instanceId);
  priority += royalWarriorTimingScore(state, playerId, card.instanceId);
  if (definition.dynamicCost?.type === "SUMMONED_THIS_TURN_MULTIPLIER" && player.hand.some((candidate) => {
    if (candidate.instanceId === card.instanceId || candidate.currentCost === null || candidate.currentCost > player.mana) return false;
    return getCardDefinition(candidate.definitionId).cardType === "MINION";
  })) {
    priority -= Math.max(18, 28 - player.summonedThisTurn * 5);
  }
  return priority;
}

function candidates(state: GameState, playerId: PlayerId, budget: SearchBudget): SearchCandidate[] {
  const result: SearchCandidate[] = [];
  const orderedActions = getLegalActions(state, playerId)
    .sort((a, b) => actionPlanningPriority(state, playerId, b) - actionPlanningPriority(state, playerId, a));
  for (const action of orderedActions) {
    if (budget.remaining <= 0) break;
    budget.remaining -= 1;
    const applied = applyAction(state, action);
    if (applied.error) continue;
    result.push({
      action,
      state: applied.state,
      score: evaluatePublicState(applied.state, playerId),
      tacticalScore: tacticalActionScore(state, playerId, action, applied.state),
    });
  }
  return result;
}

function search(state: GameState, playerId: PlayerId, depth: number, beamWidth: number, budget: SearchBudget): number {
  const base = evaluatePublicState(state, playerId);
  if (depth <= 0 || state.phase === "GAME_OVER" || getActingPlayerId(state) !== playerId) return base;
  const next = candidates(state, playerId, budget)
    .sort((a, b) => (b.score + b.tacticalScore) - (a.score + a.tacticalScore))
    .slice(0, beamWidth);
  if (next.length === 0) return base;
  return Math.max(...next.map((candidate) =>
    candidate.tacticalScore + search(candidate.state, playerId, depth - 1, beamWidth, budget),
  ));
}

/** 有限搜尋會展開 AI 當前回合的連續決策；輪到對手時停止，用公開局面估算下回合威脅。 */
export function chooseSearchAction(state: GameState, playerId: PlayerId, seed: number, depth = 7, beamWidth = 14, nodeBudget = 650): RandomDecision {
  const legalActions = getLegalActions(state, playerId);
  const hasImmediateLethal = legalActions.some((action) => {
    if (action.type !== "ATTACK" || action.target.type !== "HERO") return false;
    const attacker = state.players[playerId].minions.find((card) => card.instanceId === action.attackerId);
    return (attacker?.currentAttack ?? 0) >= state.players[action.target.playerId].heroHp;
  });
  if (!hasImmediateLethal) {
    const spaceTrades = legalActions
      .filter((action) => action.type === "ATTACK" && action.target.type === "MINION")
      .map((action) => ({ action, score: boardSpaceActionScore(state, playerId, action) }))
      .filter((candidate) => candidate.score >= 100);
    if (spaceTrades.length > 0) {
      const bestScore = Math.max(...spaceTrades.map((candidate) => candidate.score));
      const best = spaceTrades.filter((candidate) => candidate.score === bestScore);
      const roll = nextAiRandom(seed);
      return { action: best[Math.floor(roll.value * best.length)].action, seed: roll.seed };
    }
  }
  const budget: SearchBudget = { remaining: nodeBudget };
  const roots = candidates(state, playerId, budget);
  if (roots.length === 0) return { seed };
  const perRootBudget = Math.floor(budget.remaining / roots.length);
  let bestScore = Number.NEGATIVE_INFINITY;
  let bestActions: GameAction[] = [];
  for (const candidate of roots) {
    const branchBudget: SearchBudget = { remaining: perRootBudget };
    const planningTiebreak = actionPlanningPriority(state, playerId, candidate.action) * 0.12;
    const score = candidate.state.phase === "GAME_OVER"
      ? candidate.score + candidate.tacticalScore + 1_000
      : candidate.tacticalScore + search(candidate.state, playerId, depth - 1, beamWidth, branchBudget) + planningTiebreak;
    if (score > bestScore + Number.EPSILON) {
      bestScore = score;
      bestActions = [candidate.action];
    } else if (Math.abs(score - bestScore) <= Number.EPSILON) {
      bestActions.push(candidate.action);
    }
  }
  const roll = nextAiRandom(seed);
  return { action: bestActions[Math.floor(roll.value * bestActions.length)], seed: roll.seed };
}
