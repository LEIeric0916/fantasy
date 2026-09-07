export type PlayerId = "P1" | "P2";
export type Faction = "DRAGON" | "UNDEAD" | "MACHINE" | "ALLIANCE" | "NEUTRAL";
export type CardType = "MINION" | "SPELL" | "FIELD";
export type Zone = "DECK" | "HAND" | "MINION" | "FIELD" | "GRAVEYARD" | "REMOVED" | "EXTRA_DECK";

export type Keyword =
  | "TAUNT"
  | "RUSH"
  | "CHARGE"
  | "DIVINE_SHIELD"
  | "BATTLECRY"
  | "DEATHRATTLE"
  | "ENTER_FIELD"
  | "LAST_WORDS"
  | "STEALTH"
  | "DETERRENCE"
  | "WARD"
  | "DISCIPLINE"
  | "SANCTUARY"
  | "INVINCIBLE"
  | "LETHAL"
  | "WINDFURY"
  | "ON_KILL"
  | "AURA"
  | "COUNTDOWN"
  | "GROWTH"
  | "DISCOVER"
  | "EFFECT_SUMMON"
  | "ALT_COST"
  | "RECYCLE"
  | "ON_REVIVE"
  | "ON_DISCARD"
  | "NECRO_REVIVE_4"
  | "NECRO_REVIVE_5"
  | "NECRO_REVIVE_6"
  | "HEADHUNT"
  | "CAN_ONLY_ATTACK_HERO"
  | "CANNOT_COUNTERATTACK"
  | "IMMUNE_EFFECT_DAMAGE"
  | "CANNOT_ATTACK_HERO";

export type ConditionDefinition =
  | { type: "OPPONENT_HAS_MINION" }
  | { type: "NO_OTHER_FRIENDLY_MINIONS" }
  | { type: "MAX_MANA_EQUALS"; value: number }
  | { type: "MAX_MANA_AT_LEAST"; value: number }
  | { type: "FRIENDLY_ORIGINAL_COST_AT_LEAST"; value: number }
  | { type: "FRIENDLY_FIELD_SUBTYPE"; subtype: string }
  | { type: "FRIENDLY_MINION_SUBTYPE"; subtype: string; excludeSource?: boolean }
  | { type: "FRIENDLY_SAME_FIELD_COUNT_AT_LEAST"; value: number }
  | { type: "HERO_HP_BELOW"; value: number }
  | { type: "SUMMONED_THIS_GAME_AT_LEAST"; value: number }
  | { type: "SUMMONED_THIS_GAME_BELOW"; value: number }
  | { type: "FRIENDLY_MINION_COUNT_LESS_THAN_OPPONENT" }
  | { type: "FRIENDLY_MINION_COUNT_AT_LEAST"; value: number }
  | { type: "ALL"; conditions: ConditionDefinition[] };

export type EffectDefinition =
  | { type: "GAIN_MANA"; value: number }
  | { type: "DRAW"; value: number }
  | { type: "HEAL_HERO"; value: number }
  | { type: "HEAL_ALL_FRIENDLY_MINIONS"; value: number }
  | { type: "MODIFY_SELF_HEALTH"; value: number }
  | { type: "MODIFY_SELF_ATTACK"; value: number }
  | { type: "MODIFY_SELF_ATTACK_UNTIL_LEAVES"; value: number }
  | { type: "MODIFY_SELF_STATS"; attack: number; health: number }
  | { type: "INCREASE_MAX_MANA"; value: number }
  | { type: "SUMMON"; definitionId: string; count: number }
  | { type: "SUMMON_FIELD"; definitionId: string; count: number }
  | { type: "CHOOSE_GENERATED_FIELD"; definitionIds: string[] }
  | { type: "CHOOSE_DISTINCT_GENERATED_FIELDS"; definitionIds: string[]; count: number }
  | { type: "CHOOSE_DISTINCT_GENERATED_MINIONS"; definitionIds: string[]; count: number; upTo?: boolean }
  | { type: "SUMMON_PER_FRIENDLY_FIELD_SUBTYPE"; definitionId: string; subtype: string }
  | { type: "SUMMON_WITH_KEYWORD_IF_FIELD"; definitionId: string; count: number; fieldDefinitionId: string; keyword: Keyword; additionalKeywords?: Keyword[] }
  | { type: "DAMAGE_ALL_ENEMY_MINIONS"; value: number }
  | { type: "DAMAGE_ALL_OTHER_MINIONS"; value: number }
  | { type: "DAMAGE_TARGET_ENEMY_MINION"; value: number }
  | { type: "DAMAGE_TARGET_ENEMY_MINION_OR_HERO"; value: number; heroValue?: number }
  | { type: "DAMAGE_ALL_ENEMY_MINIONS_BY_FRIENDLY_FIELD_SUBTYPE"; subtype: string }
  | { type: "SNAPSHOT_FIELD_COUNT_DAMAGE_AND_SUMMON"; subtype: string; summonDefinitionId: string }
  | { type: "SNAPSHOT_ENEMY_COUNT_AOE_HERO_DRAW_SELF_DEBUFF"; aoeDamage: number; heroDamage: number; draw: number }
  | { type: "REPEAT_DAMAGE_TARGET_ENEMY_MINION_BY_FRIENDLY_FIELD_SUBTYPE"; value: number; subtype: string }
  | { type: "DAMAGE_DISTINCT_ENEMY_MINIONS_REWARD_KILLS"; count: number; value: number; drawPerKill: number; healPerKill: number }
  | { type: "REPEAT_DAMAGE_ENEMY_MINION_OR_HERO"; count: number; value: number; heroMaxHits: number }
  | { type: "DESTROY_TARGET_ENEMY_MINION" }
  | { type: "DESTROY_UP_TO_ENEMY_MINIONS"; maxCount: number }
  | { type: "DESTROY_DISTINCT_ENEMY_MINIONS"; count: number; minCount?: number }
  | { type: "DESTROY_ALL_ENEMY_MINIONS" }
  | { type: "VANISH_ENEMY_MINIONS"; count: number }
  | { type: "TRANSFORM_ENEMY_MINIONS"; count: number; definitionId: string; maxHealth?: number }
  | { type: "TRANSFORM_UP_TO_ENEMY_MINIONS"; maxCount: number; definitionId: string; maxHealth?: number }
  | { type: "REVIVE_FRIENDLY_GRAVE_MINION"; maxOriginalCost?: number; minOriginalCost?: number }
  | { type: "VANISH_OLD_SAME_FIELD_AND_DRAW"; silentIfNone?: boolean }
  | { type: "DRAW_AND_VANISH_SELF_IF_SAME_FIELD" }
  | { type: "VANISH_OTHER_SAME_FIELDS"; count: number }
  | { type: "TRANSFORM_SELF_FIELD"; definitionId: string }
  | { type: "VANISH_SELF_IF_NO_FRIENDLY_FIELD"; definitionId: string }
  | { type: "REDUCE_SELF_COUNTDOWN_BY_OWN_TURN_COUNT" }
  | { type: "DAMAGE_ENEMY_HERO"; value: number }
  | { type: "GRANT_ALL_FRIENDLY_KEYWORD"; keyword: Keyword; subtypes?: string[] }
  | { type: "GRANT_TARGET_FRIENDLY_MINION_KEYWORD"; keyword: Keyword; subtypes?: string[]; excludeSource?: boolean }
  | { type: "MODIFY_TARGET_FRIENDLY_MINION_STATS"; attack: number; health: number; excludeSource?: boolean }
  | { type: "GAIN_SELF_KEYWORD"; keyword: Keyword }
  | { type: "RETURN_HAND_MINION_TO_DECK_SHUFFLE_DRAW_BY_COST"; subtype: string; threshold: number; low: number; high: number }
  | { type: "SEARCH_DECK"; cardType?: CardType; definitionId?: string }
  | { type: "DISCOVER_TOP"; bonusReveal?: number; count: number; cardType?: CardType; subtype?: string; temporaryCostReduction?: number; discardFromSelected?: number; fallbackEffects?: EffectDefinition[] }
  | { type: "ADD_GENERATED_TO_HAND"; definitionId: string; count: number }
  | { type: "RESTORE_MANA" }
  | { type: "RESTORE_MANA_VALUE"; value: number }
  | { type: "RETURN_SELF_TO_HAND" }
  | { type: "RETURN_SELF_TO_DECK_SHUFFLE" }
  | { type: "SUMMON_SELF_FROM_HAND" }
  | { type: "CHOOSE_EFFECT_SUMMON_COPY"; definitionId: string; candidateInstanceIds: string[] }
  | { type: "COPY_HAND_SPELL_EFFECT" }
  | { type: "SCALED_END_TURN_CHOICE"; maxManaThreshold: number; bonus: number }
  | { type: "CATASTROPHE_FLOOD"; transformDefinitionId: string; doomFieldDefinitionId: string; bonusSummonDefinitionId: string; bonusSummonCount: number }
  | { type: "DISCARD_HAND"; count: number }
  | { type: "SEAL_TARGET_ENEMY_MINION" }
  | { type: "GAIN_NECROMANCY"; value: number }
  | { type: "GAIN_RECYCLE_CHARGE"; value: number }
  | { type: "GAIN_RECYCLE_CHARGE_BY_FRIENDLY_FIELD_SUBTYPE"; subtype: string }
  | { type: "GRANT_NEXT_HERO_DAMAGE_ZERO"; count: number }
  | { type: "GRANT_NEXT_MINION_TEMPORARY_COST_REDUCTION"; value: number }
  | { type: "GRANT_NEXT_LOW_COST_DRAGON_ZERO"; maxOriginalCost: number }
  | { type: "GRANT_NEXT_HIGH_COST_DRAGON_REDUCTION"; minOriginalCost: number; value: number }
  | { type: "GRANT_ALL_FRIENDLY_DAMAGE_CAP"; value: number }
  | { type: "GRANT_HERO_DIVINE_SHIELD" }
  | { type: "CHOOSE_ONE"; prompt: string; options: { id: string; label: string; effects: EffectDefinition[] }[] }
  | { type: "HEROIC_GLORY"; heroDefinitionIds: string[]; historyKey: string }
  | { type: "CHOOSE_UNACQUIRED_GENERATED_TO_HAND"; definitionIds: string[]; historyKey: string }
  | { type: "RECORD_CHOICE_ADD_GENERATED_TO_HAND"; definitionId: string; historyKey: string; fixedCost?: number }
  | { type: "MECHANICAL_TECHNIQUE"; cost: number; effects: EffectDefinition[] }
  | { type: "NECROMANCY"; cost: number; effects: EffectDefinition[]; silentIfInsufficient?: boolean }
  | { type: "RETURN_HAND_TO_DECK_MACHINE_DISCOUNT"; maxCount: number; reductionPerCard: number }
  | { type: "SET_HAND_CARD_COST_ZERO"; count: number; cardType?: CardType; subtype?: string; subtypes?: string[] }
  | { type: "NECRO_REVIVE_SELF"; value: number }
  | { type: "SEGMENT_BREAK" }
  | { type: "CONDITIONAL"; condition: ConditionDefinition; effects: EffectDefinition[]; silentOnFailure?: boolean }
  | { type: "RULE_UNDEFINED"; ruleId: string };

export interface CardDefinition {
  id: string;
  name: string;
  faction: Faction;
  cardType: CardType;
  subtype: string[];
  originalCost: number | null;
  attack: number | null;
  health: number | null;
  deckCount: number;
  keywords: Keyword[];
  effectsText: string;
  generatedOnly: boolean;
  notes: string;
  initialCounters?: Record<string, number>;
  effects?: EffectDefinition[];
  triggeredEffects?: Partial<Record<"DEATHRATTLE" | "LAST_WORDS" | "ON_DISCARD" | "ON_REVIVE" | "END_TURN" | "GROWTH" | "ON_FRIENDLY_COMBAT_KILL" | "ON_ATTACK" | "ON_SELF_COMBAT_START" | "ON_KILL", EffectDefinition[]>>;
  maxFriendlyCombatKillTriggersPerTurn?: number;
  dynamicCost?:
    | { type: "ENEMY_MINION_COUNT" }
    | { type: "FRIENDLY_GRAVE_DRAGON_COUNT" }
    | { type: "RECYCLE_CHARGE" }
    | { type: "FRIENDLY_FIELD_SUBTYPE_COUNT"; subtype: string }
    | { type: "TURN_AND_EXISTING_FRIENDLY_MINIONS"; turnAtLeast: number; minExistingMinions: number; reduction: number }
    | { type: "SUMMONED_THIS_TURN_MULTIPLIER"; multiplier: number; turnAtLeast: number }
    | { type: "SUMMONED_THIS_GAME_AT_LEAST_FIXED"; value: number; cost: number }
    | { type: "FRIENDLY_MINION_COUNT" }
    | { type: "TURN_SUMMONED_DRAGON_COST_AT_LEAST"; threshold: number; reduction: number };
  alternatePlay?: { cost: number; effects: EffectDefinition[] };
  effectSummon?:
    | { event: "SPELL_PLAYED_ORIGINAL_COST_AT_LEAST"; value: number }
    | { event: "START_TURN_MAX_MANA_AT_LEAST"; value: number }
    | { event: "NECROMANCY_AT_LEAST"; value: number }
    | { event: "RECYCLE_CHARGE_AT_LEAST"; value: number }
    | { event: "SUMMONED_THIS_GAME_AT_LEAST"; value: number }
    | { event: "NON_NORMAL_HAND_ENTRY_SUMMONED_THIS_GAME_AT_LEAST"; value: number };
  enterFieldEffects?: EffectDefinition[];
  activatedEffect?: {
    resource: "NECROMANCY" | "RECYCLE_CHARGE";
    cost: number;
    effects: EffectDefinition[];
  };
  transformAura?: {
    transformedDefinitionId: string;
    counter: string;
    threshold: number;
    transformSelfDefinitionId: string;
  };
  grantOnFriendlyEnterAura?: { subtypes: string[]; keyword: Keyword };
  damageCapAura?: { subtypes: string[]; value: number };
  friendlySummonAura?: { effects: EffectDefinition[]; maxPerTurn: number };
  friendlyMinionDestroyedCountdownAura?: { amount: number; maxPerTurn: number };
  maxCopiesOnField?: number;
  friendlyEffectDamageImmunityAura?: { excludeSelf: boolean };
  selfKeywordWhileOtherFriendlySubtypes?: { subtypes: string[]; keyword: Keyword };
  fieldWinCondition?: { count: number; loseReason: "DOOMSDAY_BOOK" };
}

export interface CardInstance {
  instanceId: string;
  originalDefinitionId: string;
  definitionId: string;
  ownerId: PlayerId;
  controllerId: PlayerId;
  zone: Zone;
  currentCost: number | null;
  currentAttack: number | null;
  currentHealth: number | null;
  maxHealth: number | null;
  damageTaken: number;
  keywords: Keyword[];
  counters: Record<string, number>;
  flags: Record<string, boolean>;
  attacksUsedThisTurn: number;
  summonedOnTurn: number | null;
  necroRevivedTurn?: number;
  silenced: boolean;
  sealed: boolean;
}
