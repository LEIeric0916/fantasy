import type { CardDefinition, CardInstance, PlayerId, Zone } from "../cards/cardTypes";

export function createCardInstance(
  definition: CardDefinition,
  ownerId: PlayerId,
  zone: Zone,
  instanceId: string,
): CardInstance {
  return {
    instanceId,
    originalDefinitionId: definition.id,
    definitionId: definition.id,
    ownerId,
    controllerId: ownerId,
    zone,
    currentCost: definition.originalCost,
    currentAttack: definition.attack,
    currentHealth: definition.health,
    maxHealth: definition.health,
    damageTaken: 0,
    keywords: [...definition.keywords],
    counters: { ...definition.initialCounters },
    flags: {},
    attacksUsedThisTurn: 0,
    summonedOnTurn: null,
    silenced: false,
    sealed: false,
  };
}
