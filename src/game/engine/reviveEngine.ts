import { getCardDefinition } from "../cards/cardRegistry";
import type { CardInstance, PlayerId } from "../cards/cardTypes";
import type { GameState } from "../state/GameState";
import { addLog } from "../utils/gameLog";
import { InvalidActionError } from "./errors";
import { createTimingContext } from "./simultaneousEngine";
import { enqueueTriggeredEffects } from "./triggerEngine";
import { moveCard } from "./zoneEngine";
import { applyFriendlyEnterAuras, enqueueBattlecryAfterSummon, enqueueFriendlySummonAuras, recordMinionSummoned } from "./summonEngine";

export type ReviveCause = "CARD_EFFECT" | "NECRO_REVIVE";

export function reviveMinion(
  state: GameState,
  playerId: PlayerId,
  card: CardInstance,
  cause: ReviveCause = "CARD_EFFECT",
): boolean {
  if (card.zone !== "GRAVEYARD" || card.ownerId !== playerId) throw new InvalidActionError("复活目标不在我方弃堆");
  if (state.players[playerId].minions.length >= state.rulesConfig.minionLimit) {
    addLog(state, "ACTION", `${card.definitionId} 复活失败：手下区已满`, { instanceId: card.instanceId });
    return false;
  }
  const definition = getCardDefinition(card.definitionId);
  if (definition.cardType !== "MINION" || card.maxHealth === null) throw new InvalidActionError("复活目标不是具有合法面板的手下");
  moveCard(state, card, "MINION", cause, playerId);
  card.currentHealth = card.maxHealth;
  card.damageTaken = 0;
  card.attacksUsedThisTurn = 0;
  card.summonedOnTurn = state.turnNumber;
  if (cause === "NECRO_REVIVE") card.necroRevivedTurn = state.turnNumber;
  recordMinionSummoned(state, playerId, card);
  applyFriendlyEnterAuras(state, playerId, card);
  enqueueFriendlySummonAuras(state, playerId, card);
  addLog(state, "ZONE", `${definition.name} 被复活`, { instanceId: card.instanceId, cause });

  if (cause === "NECRO_REVIVE") {
    enqueueBattlecryAfterSummon(state, card, "NECRO_REVIVE:BATTLECRY");
  }

  const effects = definition.triggeredEffects?.ON_REVIVE;
  if (card.keywords.includes("ON_REVIVE") && effects) {
    enqueueTriggeredEffects(state, card, effects, "REVIVE:ON_REVIVE", createTimingContext(state, `REVIVE:${card.instanceId}`));
  }
  if (definition.enterFieldEffects?.length) {
    enqueueTriggeredEffects(state, card, definition.enterFieldEffects, "REVIVE:ENTER_FIELD", createTimingContext(state, `REVIVE_ENTER:${card.instanceId}`));
  }
  return true;
}
