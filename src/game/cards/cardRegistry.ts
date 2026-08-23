import dragonData from "../../../data/dragon-cards.json";
import undeadData from "../../../data/undead-cards.json";
import machineData from "../../../data/machine-cards.json";
import allianceData from "../../../data/alliance-cards.json";
import tokenData from "../../../data/token-cards.json";
import type { CardDefinition, EffectDefinition, Faction, Keyword } from "./cardTypes";
import type { RuleUndefined } from "../state/GameState";

type RawCard = Omit<CardDefinition, "keywords" | "effects"> & { keywords: string[] };
type CardFile = { cards: RawCard[] };

const implementedEffects: Record<string, EffectDefinition[]> = {
  TOKEN_COIN: [{ type: "GAIN_MANA", value: 1 }],
  MACHINE_001: [{ type: "ADD_GENERATED_TO_HAND", definitionId: "TOKEN_MACHINE_ARTIFACT_BOX", count: 2 }],
  MACHINE_002: [
    { type: "GAIN_RECYCLE_CHARGE", value: 1 },
    {
      type: "CONDITIONAL",
      condition: { type: "FRIENDLY_FIELD_SUBTYPE", subtype: "ARTIFACT" },
      effects: [{ type: "SUMMON", definitionId: "TOKEN_MACHINE_PRIEST", count: 1 }],
    },
  ],
  MACHINE_003: [
    { type: "GAIN_RECYCLE_CHARGE", value: 2 },
    {
      type: "CONDITIONAL",
      condition: { type: "FRIENDLY_FIELD_SUBTYPE", subtype: "ARTIFACT" },
      effects: [{ type: "SUMMON_FIELD", definitionId: "TOKEN_MACHINE_GEAR", count: 1 }],
    },
  ],
  MACHINE_004: [
    { type: "SEARCH_DECK", definitionId: "MACHINE_004" },
    { type: "SEGMENT_BREAK" },
    {
      type: "MECHANICAL_TECHNIQUE",
      cost: 1,
      effects: [
        { type: "SUMMON_FIELD", definitionId: "TOKEN_MACHINE_SOLDIER_BAY", count: 1 },
        { type: "RESTORE_MANA_VALUE", value: 1 },
      ],
    },
  ],
  MACHINE_005: [{ type: "GAIN_RECYCLE_CHARGE", value: 1 }],
  MACHINE_006: [
    { type: "GAIN_RECYCLE_CHARGE", value: 1 },
    { type: "SUMMON_FIELD", definitionId: "TOKEN_MACHINE_CUBE", count: 1 },
  ],
  MACHINE_007: [
    { type: "RETURN_HAND_TO_DECK_MACHINE_DISCOUNT", maxCount: 2, reductionPerCard: 2 },
    { type: "GAIN_RECYCLE_CHARGE", value: 1 },
  ],
  MACHINE_008: [{ type: "SUMMON", definitionId: "TOKEN_MACHINE_EMPIRE_SOLDIER", count: 1 }],
  MACHINE_009: [
    { type: "DRAW", value: 2 },
    { type: "SEGMENT_BREAK" },
    {
      type: "MECHANICAL_TECHNIQUE",
      cost: 3,
      effects: [
        { type: "SET_HAND_CARD_COST_ZERO", count: 2, cardType: "FIELD", subtype: "ARTIFACT" },
        { type: "SUMMON", definitionId: "TOKEN_MACHINE_EMPIRE_SOLDIER", count: 1 },
      ],
    },
  ],
  MACHINE_010: [
    { type: "SUMMON_FIELD", definitionId: "TOKEN_MACHINE_ATTACK_SHIP", count: 2 },
    { type: "DAMAGE_ALL_ENEMY_MINIONS_BY_FRIENDLY_FIELD_SUBTYPE", subtype: "ARTIFACT" },
  ],
  MACHINE_011: [
    { type: "DAMAGE_ENEMY_HERO", value: 3 },
    { type: "SUMMON_FIELD", definitionId: "TOKEN_MACHINE_GEAR", count: 1 },
    { type: "DRAW", value: 1 },
  ],
  MACHINE_012: [{ type: "DRAW", value: 2 }],
  MACHINE_013: [
    { type: "SUMMON", definitionId: "TOKEN_MACHINE_EMPIRE_REAPER", count: 1 },
    { type: "SUMMON", definitionId: "TOKEN_MACHINE_DESTROYER", count: 1 },
    { type: "SEGMENT_BREAK" },
    {
      type: "MECHANICAL_TECHNIQUE",
      cost: 15,
      effects: [{
        type: "CHOOSE_DISTINCT_GENERATED_MINIONS",
        definitionIds: [
          "TOKEN_MACHINE_DIVINE_DATE_MASAMUNE",
          "TOKEN_MACHINE_DIVINE_GABRIEL",
          "TOKEN_MACHINE_DIVINE_ELIAS",
          "TOKEN_MACHINE_DIVINE_LUCIFER",
          "TOKEN_MACHINE_DIVINE_ENDYMION",
        ],
        count: 2,
      }],
    },
  ],
  TOKEN_MACHINE_DIVINE_DATE_MASAMUNE: [
    { type: "GRANT_ALL_FRIENDLY_KEYWORD", keyword: "CHARGE", subtypes: ["MACHINE", "ARMY"] },
  ],
  TOKEN_MACHINE_DIVINE_GABRIEL: [
    { type: "SUMMON", definitionId: "TOKEN_MACHINE_EMPIRE_REAPER", count: 2 },
    { type: "GRANT_ALL_FRIENDLY_KEYWORD", keyword: "TAUNT", subtypes: ["MACHINE"] },
  ],
  TOKEN_MACHINE_DIVINE_ELIAS: [{ type: "DESTROY_UP_TO_ENEMY_MINIONS", maxCount: 4 }],
  TOKEN_MACHINE_DIVINE_LUCIFER: [
    { type: "HEAL_HERO", value: 4 },
    { type: "SEGMENT_BREAK" },
    { type: "GRANT_NEXT_HERO_DAMAGE_ZERO", count: 1 },
  ],
  TOKEN_MACHINE_DIVINE_ENDYMION: [{
    type: "REPEAT_DAMAGE_TARGET_ENEMY_MINION_BY_FRIENDLY_FIELD_SUBTYPE",
    value: 5,
    subtype: "ARTIFACT",
  }],
  MACHINE_014: [{
    type: "SNAPSHOT_FIELD_COUNT_DAMAGE_AND_SUMMON",
    subtype: "ARTIFACT",
    summonDefinitionId: "TOKEN_MACHINE_EMPIRE_SOLDIER",
  }],
  ALLIANCE_001: [
    { type: "ADD_GENERATED_TO_HAND", definitionId: "TOKEN_ALLIANCE_HEROIC_GLORY", count: 1 },
    { type: "SEGMENT_BREAK" },
    { type: "DRAW", value: 1 },
    { type: "SEGMENT_BREAK" },
    { type: "SEARCH_DECK", definitionId: "ALLIANCE_001" },
  ],
  ALLIANCE_002: [
    { type: "SUMMON", definitionId: "TOKEN_ALLIANCE_ROYAL_GUARD", count: 1 },
    { type: "SEGMENT_BREAK" },
    {
      type: "CONDITIONAL",
      condition: { type: "SUMMONED_THIS_GAME_AT_LEAST", value: 15 },
      effects: [{ type: "GAIN_SELF_KEYWORD", keyword: "CHARGE" }, { type: "MODIFY_SELF_ATTACK", value: 2 }],
    },
  ],
  ALLIANCE_003: [
    { type: "SUMMON", definitionId: "TOKEN_ALLIANCE_MILITIA", count: 1 },
    { type: "DRAW", value: 1 },
  ],
  ALLIANCE_004: [
    { type: "SUMMON", definitionId: "TOKEN_ALLIANCE_REVOLUTIONARY_SOLDIER", count: 1 },
    {
      type: "CONDITIONAL",
      condition: { type: "FRIENDLY_MINION_COUNT_LESS_THAN_OPPONENT" },
      effects: [{ type: "SUMMON", definitionId: "TOKEN_ALLIANCE_REVOLUTIONARY_SOLDIER", count: 1 }],
    },
  ],
  ALLIANCE_006: [{ type: "GRANT_NEXT_MINION_TEMPORARY_COST_REDUCTION", value: 4 }],
  ALLIANCE_007: [{ type: "DISCOVER_TOP", count: 1, cardType: "MINION", temporaryCostReduction: 2 }],
  ALLIANCE_008: [
    {
      type: "CONDITIONAL",
      condition: { type: "FRIENDLY_MINION_COUNT_AT_LEAST", value: 3 },
      effects: [{ type: "GAIN_MANA", value: 2 }],
    },
    { type: "SUMMON", definitionId: "TOKEN_ALLIANCE_ROYAL_HONOR_GUARD", count: 1 },
  ],
  ALLIANCE_010: [
    { type: "SEARCH_DECK", definitionId: "ALLIANCE_010" },
    { type: "SEGMENT_BREAK" },
    {
      type: "CONDITIONAL",
      condition: { type: "SUMMONED_THIS_GAME_AT_LEAST", value: 10 },
      effects: [{ type: "SUMMON", definitionId: "TOKEN_ALLIANCE_ROYAL_WARRIOR", count: 1 }],
    },
  ],
  ALLIANCE_011: [{ type: "SNAPSHOT_ENEMY_COUNT_AOE_HERO_DRAW_SELF_DEBUFF", aoeDamage: 4, heroDamage: 3, draw: 2 }],
  ALLIANCE_012: [
    { type: "DESTROY_DISTINCT_ENEMY_MINIONS", count: 3 },
    { type: "SEGMENT_BREAK" },
    {
      type: "CONDITIONAL",
      condition: { type: "SUMMONED_THIS_GAME_AT_LEAST", value: 15 },
      effects: [{ type: "DAMAGE_ENEMY_HERO", value: 4 }],
    },
  ],
  TOKEN_ALLIANCE_HEROIC_GLORY: [{
    type: "HEROIC_GLORY",
    heroDefinitionIds: ["TOKEN_ALLIANCE_HERO_AUGUSTIN", "TOKEN_ALLIANCE_HERO_DION", "TOKEN_ALLIANCE_HERO_VALENTINE"],
    historyKey: "HEROIC_GLORY_ACQUIRED",
  }],
  TOKEN_ALLIANCE_HERO_AUGUSTIN: [
    { type: "DRAW", value: 1 },
    { type: "DAMAGE_TARGET_ENEMY_MINION", value: 5 },
    { type: "SEGMENT_BREAK" },
    {
      type: "CONDITIONAL",
      condition: { type: "SUMMONED_THIS_GAME_AT_LEAST", value: 10 },
      effects: [{ type: "DAMAGE_ENEMY_HERO", value: 3 }],
    },
  ],
  TOKEN_ALLIANCE_HERO_VALENTINE: [
    { type: "ADD_GENERATED_TO_HAND", definitionId: "TOKEN_ALLIANCE_AIRSTRIKE", count: 1 },
    { type: "HEAL_HERO", value: 4 },
  ],
  TOKEN_ALLIANCE_AIRSTRIKE: [{
    type: "CHOOSE_ONE",
    prompt: "選擇空襲效果",
    options: [
      { id: "MINIONS", label: "給予對手所有手下2點傷害", effects: [{ type: "DAMAGE_ALL_ENEMY_MINIONS", value: 2 }] },
      { id: "HERO", label: "給予對手玩家2點傷害", effects: [{ type: "DAMAGE_ENEMY_HERO", value: 2 }] },
    ],
  }],
  TOKEN_MACHINE_CUBE: [{ type: "SUMMON", definitionId: "TOKEN_MACHINE_EMPIRE_SOLDIER", count: 1 }],
  TOKEN_DRAGON_JUDGMENT: [
    { type: "DESTROY_TARGET_ENEMY_MINION" },
    { type: "SEGMENT_BREAK" },
    {
      type: "CONDITIONAL",
      condition: { type: "FRIENDLY_ORIGINAL_COST_AT_LEAST", value: 7 },
      effects: [{ type: "DAMAGE_ALL_ENEMY_MINIONS", value: 5 }],
    },
  ],
  TOKEN_UNDEAD_BOOK_IMMORTAL: [{ type: "VANISH_OLD_SAME_FIELD_AND_DRAW", silentIfNone: true }],
  TOKEN_UNDEAD_BOOK_PLAGUE: [{ type: "VANISH_OLD_SAME_FIELD_AND_DRAW", silentIfNone: true }],
  TOKEN_UNDEAD_BOOK_REVENGE: [
    { type: "VANISH_OLD_SAME_FIELD_AND_DRAW", silentIfNone: true },
    { type: "SEGMENT_BREAK" },
    { type: "GAIN_NECROMANCY", value: 5 },
  ],
  TOKEN_UNDEAD_BOOK_DOOM_PRELUDE: [{
    type: "CONDITIONAL",
    condition: { type: "FRIENDLY_SAME_FIELD_COUNT_AT_LEAST", value: 3 },
    silentOnFailure: true,
    effects: [
      { type: "VANISH_OTHER_SAME_FIELDS", count: 2 },
      { type: "DRAW", value: 2 },
      { type: "TRANSFORM_SELF_FIELD", definitionId: "TOKEN_UNDEAD_DOOMSDAY_BOOK" },
    ],
  }],
  DRAGON_001: [
    { type: "DRAW", value: 1 },
    { type: "HEAL_HERO", value: 1 },
    {
      type: "CONDITIONAL",
      condition: {
        type: "ALL",
        conditions: [{ type: "OPPONENT_HAS_MINION" }, { type: "NO_OTHER_FRIENDLY_MINIONS" }],
      },
      effects: [{ type: "MODIFY_SELF_HEALTH", value: 2 }],
    },
  ],
  DRAGON_002: [
    { type: "RETURN_HAND_MINION_TO_DECK_SHUFFLE_DRAW_BY_COST", subtype: "DRAGON", threshold: 7, low: 1, high: 2 },
    { type: "SEGMENT_BREAK" },
    { type: "INCREASE_MAX_MANA", value: 1 },
  ],
  DRAGON_003: [
    { type: "DRAW", value: 1 },
    { type: "DAMAGE_TARGET_ENEMY_MINION", value: 4 },
    { type: "INCREASE_MAX_MANA", value: 1 },
    { type: "SEGMENT_BREAK" },
    {
      type: "CONDITIONAL",
      condition: { type: "MAX_MANA_AT_LEAST", value: 8 },
      effects: [{ type: "MODIFY_SELF_STATS", attack: 2, health: 2 }],
    },
  ],
  DRAGON_006: [{ type: "SEARCH_DECK", cardType: "SPELL" }],
  DRAGON_007: [
    { type: "ADD_GENERATED_TO_HAND", definitionId: "TOKEN_DRAGON_JUDGMENT", count: 1 },
    { type: "SEARCH_DECK", cardType: "SPELL" },
  ],
  DRAGON_008: [{ type: "COPY_HAND_SPELL_EFFECT" }],
  DRAGON_009: [
    { type: "SUMMON", definitionId: "TOKEN_DRAGON_BLAZING_EMPEROR", count: 1 },
    { type: "SUMMON", definitionId: "TOKEN_DRAGON_TIDAL_EMPEROR", count: 1 },
  ],
  DRAGON_010: [{ type: "DAMAGE_DISTINCT_ENEMY_MINIONS_REWARD_KILLS", count: 2, value: 4, drawPerKill: 1, healPerKill: 1 }],
  DRAGON_011: [
    { type: "DAMAGE_ALL_OTHER_MINIONS", value: 5 },
    { type: "GRANT_ALL_FRIENDLY_KEYWORD", keyword: "DIVINE_SHIELD" },
  ],
  DRAGON_012: [
    { type: "VANISH_ENEMY_MINIONS", count: 2 },
    { type: "SEGMENT_BREAK" },
    { type: "DAMAGE_ENEMY_HERO", value: 12 },
  ],
  DRAGON_014: [{ type: "DISCOVER_TOP", bonusReveal: 1, count: 1, cardType: "MINION", subtype: "DRAGON", temporaryCostReduction: 4 }],
  DRAGON_015: [
    { type: "DISCOVER_TOP", bonusReveal: 5, count: 1, cardType: "MINION", subtype: "DRAGON" },
    { type: "SEGMENT_BREAK" },
    { type: "RESTORE_MANA" },
  ],
  UNDEAD_001: [
    { type: "DISCOVER_TOP", count: 1, cardType: "MINION", subtype: "UNDEAD" },
    { type: "SEGMENT_BREAK" },
    {
      type: "CONDITIONAL",
      condition: { type: "FRIENDLY_FIELD_SUBTYPE", subtype: "DARK_MAGIC" },
      effects: [{ type: "SUMMON", definitionId: "TOKEN_UNDEAD_GENERIC", count: 1 }],
    },
  ],
  DRAGON_013: [
    { type: "SUMMON", definitionId: "TOKEN_DRAGON_HELLFIRE", count: 1 },
    { type: "DAMAGE_ALL_ENEMY_MINIONS", value: 4 },
  ],
  UNDEAD_002: [
    { type: "DISCARD_HAND", count: 1 },
    { type: "DAMAGE_TARGET_ENEMY_MINION", value: 3 },
  ],
  UNDEAD_004: [{ type: "TRANSFORM_UP_TO_ENEMY_MINIONS", maxCount: 2, definitionId: "TOKEN_UNDEAD_GENERIC", maxHealth: 5 }],
  UNDEAD_005: [{ type: "REVIVE_FRIENDLY_GRAVE_MINION", maxOriginalCost: 3 }],
  UNDEAD_006: [{
    type: "CHOOSE_GENERATED_FIELD",
    definitionIds: [
      "TOKEN_UNDEAD_BOOK_IMMORTAL",
      "TOKEN_UNDEAD_BOOK_PLAGUE",
      "TOKEN_UNDEAD_BOOK_REVENGE",
      "TOKEN_UNDEAD_BOOK_DOOM_PRELUDE",
    ],
  }],
  UNDEAD_007: [
    {
      type: "CHOOSE_GENERATED_FIELD",
      definitionIds: [
        "TOKEN_UNDEAD_BOOK_IMMORTAL",
        "TOKEN_UNDEAD_BOOK_PLAGUE",
        "TOKEN_UNDEAD_BOOK_REVENGE",
        "TOKEN_UNDEAD_BOOK_DOOM_PRELUDE",
      ],
    },
    { type: "SUMMON_PER_FRIENDLY_FIELD_SUBTYPE", definitionId: "TOKEN_UNDEAD_DOOM_KNIGHT", subtype: "DARK_MAGIC" },
  ],
  UNDEAD_008: [
    { type: "DISCARD_HAND", count: 1 },
    { type: "DRAW", value: 2 },
    { type: "SEAL_TARGET_ENEMY_MINION" },
  ],
  UNDEAD_009: [{ type: "REVIVE_FRIENDLY_GRAVE_MINION", minOriginalCost: 5 }],
  UNDEAD_010: [{ type: "SUMMON", definitionId: "TOKEN_UNDEAD_PREACHER", count: 1 }],
  TOKEN_UNDEAD_PREACHER: [{ type: "GAIN_NECROMANCY", value: 3 }],
  UNDEAD_012: [{ type: "DESTROY_ALL_ENEMY_MINIONS" }],
  UNDEAD_013: [
    { type: "DISCOVER_TOP", bonusReveal: 2, count: 3, cardType: "MINION", discardFromSelected: 1 },
    { type: "SEGMENT_BREAK" },
    {
      type: "CONDITIONAL",
      condition: { type: "FRIENDLY_FIELD_SUBTYPE", subtype: "DARK_MAGIC" },
      effects: [{ type: "HEAL_HERO", value: 2 }],
    },
  ],
  UNDEAD_014: [{
    type: "CATASTROPHE_FLOOD",
    transformDefinitionId: "TOKEN_UNDEAD_GENERIC",
    doomFieldDefinitionId: "TOKEN_UNDEAD_DOOMSDAY_BOOK",
    bonusSummonDefinitionId: "TOKEN_UNDEAD_CATASTROPHE_KNIGHT",
    bonusSummonCount: 2,
  }],
};

const enterFieldEffects: Record<string, EffectDefinition[]> = {
  UNDEAD_011: [{
    type: "SUMMON_WITH_KEYWORD_IF_FIELD",
    definitionId: "TOKEN_UNDEAD_GIANT",
    count: 2,
    fieldDefinitionId: "TOKEN_UNDEAD_DOOMSDAY_BOOK",
    keyword: "CHARGE",
  }],
};

const implementedTriggeredEffects: Record<string, CardDefinition["triggeredEffects"]> = {
  TOKEN_MACHINE_ARTIFACT_BOX: {
    LAST_WORDS: [{ type: "DRAW", value: 1 }, { type: "GAIN_RECYCLE_CHARGE", value: 1 }],
  },
  TOKEN_MACHINE_CUBE: {
    LAST_WORDS: [{ type: "SUMMON", definitionId: "TOKEN_MACHINE_EMPIRE_REAPER", count: 1 }],
  },
  TOKEN_MACHINE_GEAR: {
    GROWTH: [{ type: "GAIN_RECYCLE_CHARGE", value: 1 }],
  },
  TOKEN_MACHINE_PRIEST: {
    END_TURN: [
      { type: "GAIN_RECYCLE_CHARGE", value: 1 },
      { type: "GRANT_ALL_FRIENDLY_KEYWORD", keyword: "DIVINE_SHIELD", subtypes: ["MACHINE", "ARMY"] },
    ],
  },
  MACHINE_006: {
    END_TURN: [{ type: "GRANT_TARGET_FRIENDLY_MINION_KEYWORD", keyword: "TAUNT", subtypes: ["MACHINE", "ARMY"] }],
  },
  MACHINE_004: {
    DEATHRATTLE: [{ type: "GAIN_RECYCLE_CHARGE", value: 1 }],
  },
  MACHINE_005: {
    GROWTH: [{ type: "DRAW", value: 1 }],
  },
  MACHINE_008: {
    GROWTH: [{ type: "SUMMON", definitionId: "TOKEN_MACHINE_EMPIRE_SOLDIER", count: 1 }],
  },
  TOKEN_MACHINE_EMPIRE_SOLDIER: {
    DEATHRATTLE: [{ type: "GAIN_RECYCLE_CHARGE", value: 1 }],
  },
  TOKEN_MACHINE_EMPIRE_REAPER: {
    ON_KILL: [{ type: "GAIN_RECYCLE_CHARGE", value: 2 }],
    DEATHRATTLE: [{ type: "GAIN_RECYCLE_CHARGE", value: 1 }],
  },
  TOKEN_MACHINE_DESTROYER: {
    DEATHRATTLE: [{ type: "GAIN_RECYCLE_CHARGE", value: 1 }, { type: "HEAL_HERO", value: 1 }],
  },
  TOKEN_MACHINE_ATTACK_SHIP: {
    END_TURN: [{ type: "DAMAGE_TARGET_ENEMY_MINION_OR_HERO", value: 2, heroValue: 1 }],
  },
  MACHINE_012: {
    LAST_WORDS: [{ type: "SUMMON", definitionId: "TOKEN_MACHINE_DESTROYER", count: 1 }],
  },
  TOKEN_MACHINE_DIVINE_LUCIFER: {
    DEATHRATTLE: [{ type: "SUMMON", definitionId: "TOKEN_MACHINE_DESTROYER", count: 1 }],
  },
  TOKEN_MACHINE_DIVINE_ENDYMION: {
    DEATHRATTLE: [{ type: "GAIN_RECYCLE_CHARGE_BY_FRIENDLY_FIELD_SUBTYPE", subtype: "ARTIFACT" }],
  },
  TOKEN_ALLIANCE_REVOLUTIONARY_SOLDIER: {
    DEATHRATTLE: [{ type: "DRAW", value: 1 }],
  },
  ALLIANCE_004: {
    ON_SELF_COMBAT_START: [{
      type: "CONDITIONAL",
      condition: { type: "SUMMONED_THIS_GAME_AT_LEAST", value: 10 },
      effects: [{ type: "DAMAGE_ALL_ENEMY_MINIONS", value: 2 }],
    }],
  },
  ALLIANCE_005: {
    END_TURN: [
      {
        type: "CONDITIONAL",
        condition: { type: "SUMMONED_THIS_GAME_AT_LEAST", value: 15 },
        effects: [
          { type: "GRANT_ALL_FRIENDLY_KEYWORD", keyword: "DIVINE_SHIELD" },
          { type: "DAMAGE_ENEMY_HERO", value: 4 },
        ],
      },
      {
        type: "CONDITIONAL",
        condition: { type: "SUMMONED_THIS_GAME_BELOW", value: 15 },
        effects: [
          { type: "GRANT_TARGET_FRIENDLY_MINION_KEYWORD", keyword: "DIVINE_SHIELD" },
          { type: "DAMAGE_ENEMY_HERO", value: 2 },
        ],
      },
    ],
  },
  ALLIANCE_006: {
    DEATHRATTLE: [{ type: "DRAW", value: 1 }],
  },
  ALLIANCE_012: {
    DEATHRATTLE: [{ type: "SUMMON", definitionId: "TOKEN_ALLIANCE_ROYAL_PALADIN", count: 2 }],
  },
  TOKEN_ALLIANCE_HERO_AUGUSTIN: {
    DEATHRATTLE: [{ type: "RETURN_SELF_TO_HAND" }],
  },
  TOKEN_ALLIANCE_HERO_DION: {
    ON_SELF_COMBAT_START: [
      { type: "DAMAGE_ALL_ENEMY_MINIONS", value: 7 },
      {
        type: "CONDITIONAL",
        condition: { type: "SUMMONED_THIS_GAME_AT_LEAST", value: 15 },
        effects: [{ type: "RESTORE_MANA_VALUE", value: 6 }],
      },
    ],
  },
  TOKEN_ALLIANCE_HERO_VALENTINE: {
    END_TURN: [{ type: "GRANT_ALL_FRIENDLY_DAMAGE_CAP", value: 4 }, { type: "GRANT_HERO_DIVINE_SHIELD" }],
  },
  TOKEN_MACHINE_SOLDIER_BAY: {
    LAST_WORDS: [{ type: "SUMMON", definitionId: "TOKEN_MACHINE_EMPIRE_SOLDIER", count: 1 }],
  },
  UNDEAD_002: {
    DEATHRATTLE: [{ type: "DRAW", value: 2 }],
  },
  DRAGON_009: {
    DEATHRATTLE: [{ type: "DRAW", value: 1 }],
  },
  DRAGON_011: {
    DEATHRATTLE: [{ type: "GRANT_NEXT_HIGH_COST_DRAGON_REDUCTION", minOriginalCost: 10, value: 5 }],
  },
  DRAGON_005: {
    END_TURN: [{ type: "SCALED_END_TURN_CHOICE", maxManaThreshold: 10, bonus: 2 }],
  },
  TOKEN_DRAGON_BLAZING_EMPEROR: {
    END_TURN: [{ type: "REPEAT_DAMAGE_ENEMY_MINION_OR_HERO", count: 3, value: 4, heroMaxHits: 1 }],
  },
  TOKEN_DRAGON_TIDAL_EMPEROR: {
    DEATHRATTLE: [{ type: "GRANT_NEXT_LOW_COST_DRAGON_ZERO", maxOriginalCost: 7 }, { type: "HEAL_HERO", value: 2 }],
  },
  TOKEN_UNDEAD_CATASTROPHE_KNIGHT: {
    DEATHRATTLE: [{ type: "DAMAGE_ENEMY_HERO", value: 3 }],
  },
  UNDEAD_003: {
    DEATHRATTLE: [{ type: "SUMMON", definitionId: "TOKEN_UNDEAD_SPIRIT", count: 2 }],
    ON_REVIVE: [{ type: "MODIFY_SELF_ATTACK_UNTIL_LEAVES", value: 2 }],
  },
  UNDEAD_004: {
    DEATHRATTLE: [{ type: "SUMMON_FIELD", definitionId: "TOKEN_UNDEAD_BOOK_DOOM_PRELUDE", count: 1 }],
  },
  UNDEAD_005: {
    DEATHRATTLE: [{
      type: "CONDITIONAL",
      condition: { type: "FRIENDLY_FIELD_SUBTYPE", subtype: "DARK_MAGIC" },
      effects: [{ type: "DRAW", value: 1 }],
    }],
  },
  UNDEAD_006: {
    ON_REVIVE: [{ type: "SUMMON_FIELD", definitionId: "TOKEN_UNDEAD_BOOK_IMMORTAL", count: 1 }],
  },
  UNDEAD_010: {
    ON_FRIENDLY_COMBAT_KILL: [{ type: "DAMAGE_ENEMY_HERO", value: 2 }],
  },
  UNDEAD_012: {
    ON_SELF_COMBAT_START: [{ type: "DAMAGE_ENEMY_HERO", value: 3 }],
    ON_KILL: [{
      type: "CHOOSE_GENERATED_FIELD",
      definitionIds: [
        "TOKEN_UNDEAD_BOOK_IMMORTAL",
        "TOKEN_UNDEAD_BOOK_PLAGUE",
        "TOKEN_UNDEAD_BOOK_REVENGE",
        "TOKEN_UNDEAD_BOOK_DOOM_PRELUDE",
      ],
    }],
  },
  TOKEN_UNDEAD_PREACHER: {
    DEATHRATTLE: [{ type: "DRAW", value: 1 }],
  },
  TOKEN_UNDEAD_BOOK_IMMORTAL: {
    GROWTH: [{ type: "SUMMON", definitionId: "TOKEN_UNDEAD_GENERIC", count: 1 }],
  },
  TOKEN_UNDEAD_BOOK_REVENGE: {
    END_TURN: [{
      type: "CONDITIONAL",
      condition: { type: "HERO_HP_BELOW", value: 10 },
      silentOnFailure: true,
      effects: [{ type: "TRANSFORM_SELF_FIELD", definitionId: "TOKEN_UNDEAD_DOOMSDAY_BOOK" }],
    }],
  },
  TOKEN_UNDEAD_BOOK_PLAGUE: {
    END_TURN: [{ type: "TRANSFORM_ENEMY_MINIONS", count: 1, definitionId: "TOKEN_UNDEAD_GENERIC", maxHealth: 3 }],
  },
  UNDEAD_008: {
    ON_DISCARD: [{ type: "GAIN_NECROMANCY", value: 2 }, { type: "DRAW", value: 1 }],
  },
};

const initialCounters: Record<string, Record<string, number>> = {
  TOKEN_UNDEAD_BOOK_PLAGUE: { plagueMarks: 0 },
  MACHINE_005: { countdown: 3 },
  MACHINE_008: { countdown: 3 },
  MACHINE_012: { countdown: 2 },
  TOKEN_MACHINE_ARTIFACT_BOX: { countdown: 2 },
  TOKEN_MACHINE_CUBE: { countdown: 2 },
  TOKEN_MACHINE_ATTACK_SHIP: { countdown: 3 },
  TOKEN_MACHINE_SOLDIER_BAY: { countdown: 2 },
  TOKEN_MACHINE_GEAR: { countdown: 3 },
};

const dynamicCosts: Record<string, CardDefinition["dynamicCost"]> = {
  DRAGON_006: { type: "ENEMY_MINION_COUNT" },
  DRAGON_014: { type: "ENEMY_MINION_COUNT" },
  DRAGON_012: { type: "FRIENDLY_GRAVE_DRAGON_COUNT" },
  DRAGON_011: { type: "TURN_SUMMONED_DRAGON_COST_AT_LEAST", threshold: 20, reduction: 10 },
  MACHINE_012: { type: "RECYCLE_CHARGE" },
  MACHINE_014: { type: "FRIENDLY_FIELD_SUBTYPE_COUNT", subtype: "ARTIFACT" },
  ALLIANCE_007: { type: "ENEMY_MINION_COUNT" },
  ALLIANCE_009: { type: "TURN_AND_EXISTING_FRIENDLY_MINIONS", turnAtLeast: 5, minExistingMinions: 2, reduction: 5 },
  ALLIANCE_010: { type: "SUMMONED_THIS_TURN_MULTIPLIER", multiplier: 2 },
  ALLIANCE_011: { type: "ENEMY_MINION_COUNT" },
  TOKEN_ALLIANCE_HEROIC_GLORY: { type: "SUMMONED_THIS_GAME_AT_LEAST_FIXED", value: 20, cost: 0 },
  TOKEN_ALLIANCE_HERO_AUGUSTIN: { type: "ENEMY_MINION_COUNT" },
  TOKEN_ALLIANCE_HERO_VALENTINE: { type: "FRIENDLY_MINION_COUNT" },
};

const alternatePlays: Record<string, CardDefinition["alternatePlay"]> = {
  DRAGON_009: {
    cost: 3,
    effects: [
      { type: "INCREASE_MAX_MANA", value: 1 },
      { type: "DRAW", value: 1 },
      { type: "RETURN_SELF_TO_DECK_SHUFFLE" },
    ],
  },
  DRAGON_010: {
    cost: 2,
    effects: [
      { type: "INCREASE_MAX_MANA", value: 1 },
      { type: "RETURN_SELF_TO_DECK_SHUFFLE" },
    ],
  },
  DRAGON_012: {
    cost: 3,
    effects: [
      { type: "DAMAGE_TARGET_ENEMY_MINION", value: 3 },
      { type: "DRAW", value: 1 },
      { type: "RETURN_SELF_TO_DECK_SHUFFLE" },
    ],
  },
};

const effectSummons: Record<string, CardDefinition["effectSummon"]> = {
  DRAGON_004: { event: "SPELL_PLAYED_ORIGINAL_COST_AT_LEAST", value: 5 },
  DRAGON_010: { event: "START_TURN_MAX_MANA_AT_LEAST", value: 8 },
  UNDEAD_010: { event: "NECROMANCY_AT_LEAST", value: 10 },
  MACHINE_011: { event: "RECYCLE_CHARGE_AT_LEAST", value: 6 },
};

const activatedEffects: Record<string, CardDefinition["activatedEffect"]> = {
  TOKEN_UNDEAD_BOOK_IMMORTAL: {
    resource: "NECROMANCY",
    cost: 20,
    effects: [{ type: "TRANSFORM_SELF_FIELD", definitionId: "TOKEN_UNDEAD_DOOMSDAY_BOOK" }],
  },
};

const transformAuras: Record<string, CardDefinition["transformAura"]> = {
  TOKEN_UNDEAD_BOOK_PLAGUE: {
    transformedDefinitionId: "TOKEN_UNDEAD_GENERIC",
    counter: "plagueMarks",
    threshold: 6,
    transformSelfDefinitionId: "TOKEN_UNDEAD_DOOMSDAY_BOOK",
  },
};

const grantOnFriendlyEnterAuras: Record<string, CardDefinition["grantOnFriendlyEnterAura"]> = {
  TOKEN_MACHINE_DIVINE_DATE_MASAMUNE: { subtypes: ["MACHINE", "ARMY"], keyword: "CHARGE" },
  TOKEN_MACHINE_DIVINE_GABRIEL: { subtypes: ["MACHINE", "ARMY"], keyword: "DIVINE_SHIELD" },
};

const damageCapAuras: Record<string, CardDefinition["damageCapAura"]> = {
  TOKEN_MACHINE_DIVINE_ELIAS: { subtypes: ["MACHINE", "ARMY"], value: 3 },
};

const friendlySummonAuras: Record<string, CardDefinition["friendlySummonAura"]> = {
  ALLIANCE_003: { effects: [{ type: "DRAW", value: 1 }], maxPerTurn: 2 },
};

const friendlyEffectDamageImmunityAuras: Record<string, CardDefinition["friendlyEffectDamageImmunityAura"]> = {
  TOKEN_ALLIANCE_ROYAL_HONOR_GUARD: { excludeSelf: true },
};

const selfKeywordWhileOtherFriendlySubtypes: Record<string, CardDefinition["selfKeywordWhileOtherFriendlySubtypes"]> = {
  ALLIANCE_009: { subtypes: ["HUMAN", "ARMY"], keyword: "DETERRENCE" },
};

const fieldWinConditions: Record<string, CardDefinition["fieldWinCondition"]> = {
  TOKEN_UNDEAD_DOOMSDAY_BOOK: { count: 4, loseReason: "DOOMSDAY_BOOK" },
};

const maxFriendlyCombatKillTriggersPerTurn: Record<string, number> = {
  UNDEAD_010: 3,
};

const rawFiles = [dragonData, undeadData, machineData, allianceData, tokenData] as unknown as CardFile[];

export const cardDefinitions: CardDefinition[] = rawFiles.flatMap((file) =>
  file.cards.map((card) => ({
    ...card,
    subtype: [...card.subtype],
    keywords: [...card.keywords] as Keyword[],
    initialCounters: initialCounters[card.id],
    dynamicCost: dynamicCosts[card.id],
    alternatePlay: alternatePlays[card.id],
    effectSummon: effectSummons[card.id],
    activatedEffect: activatedEffects[card.id],
    transformAura: transformAuras[card.id],
    grantOnFriendlyEnterAura: grantOnFriendlyEnterAuras[card.id],
    damageCapAura: damageCapAuras[card.id],
    friendlySummonAura: friendlySummonAuras[card.id],
    friendlyEffectDamageImmunityAura: friendlyEffectDamageImmunityAuras[card.id],
    selfKeywordWhileOtherFriendlySubtypes: selfKeywordWhileOtherFriendlySubtypes[card.id],
    fieldWinCondition: fieldWinConditions[card.id],
    enterFieldEffects: enterFieldEffects[card.id],
    effects: implementedEffects[card.id],
    triggeredEffects: implementedTriggeredEffects[card.id],
    maxFriendlyCombatKillTriggersPerTurn: maxFriendlyCombatKillTriggersPerTurn[card.id],
  })),
);

export const cardRegistry = new Map(cardDefinitions.map((card) => [card.id, card]));

export function getCardDefinition(id: string): CardDefinition {
  const definition = cardRegistry.get(id);
  if (!definition) throw new Error(`Unknown card definition: ${id}`);
  return definition;
}

export function getMainDeckDefinitions(faction: Faction): CardDefinition[] {
  return cardDefinitions.filter((card) => card.faction === faction && !card.generatedOnly && card.deckCount > 0);
}

export interface CardDataIssue {
  code: "DUPLICATE_ID" | "NULL_REQUIRED_VALUE" | "NOTES_PRESENT" | "DECK_SIZE_MISMATCH" | "MISSING_EFFECT_IMPLEMENTATION";
  cardId?: string;
  message: string;
}

export function validateCardData(): CardDataIssue[] {
  const issues: CardDataIssue[] = [];
  const seen = new Set<string>();
  for (const card of cardDefinitions) {
    if (seen.has(card.id)) issues.push({ code: "DUPLICATE_ID", cardId: card.id, message: `重復 ID：${card.id}` });
    seen.add(card.id);
    if (card.originalCost === null || (card.cardType === "MINION" && (card.attack === null || card.health === null))) {
      issues.push({ code: "NULL_REQUIRED_VALUE", cardId: card.id, message: `${card.id} 含未提供的可玩數值` });
    }
    if (card.notes.trim()) issues.push({ code: "NOTES_PRESENT", cardId: card.id, message: card.notes });
    const requiredTriggers: Array<[boolean, keyof NonNullable<CardDefinition["triggeredEffects"]>, string]> = [
      [card.keywords.includes("DEATHRATTLE"), "DEATHRATTLE", "死亡之聲"],
      [card.keywords.includes("LAST_WORDS"), "LAST_WORDS", "謝幕曲"],
      [card.keywords.includes("GROWTH"), "GROWTH", "生長效果"],
      [card.keywords.includes("ON_DISCARD"), "ON_DISCARD", "棄牌觸發效果"],
      [card.keywords.includes("ON_REVIVE"), "ON_REVIVE", "復活觸發效果"],
      [card.effectsText.includes("回合結束時"), "END_TURN", "回合結束效果"],
    ];
    for (const [required, timing, label] of requiredTriggers) {
      if (required && !card.triggeredEffects?.[timing]?.length) {
        issues.push({ code: "MISSING_EFFECT_IMPLEMENTATION", cardId: card.id, message: `${label}只有文字，尚未連接可執行效果` });
      }
    }
    if (card.keywords.includes("BATTLECRY") && !card.effects?.length) {
      issues.push({ code: "MISSING_EFFECT_IMPLEMENTATION", cardId: card.id, message: "戰吼只有文字，尚未連接可執行效果" });
    }
    if (card.keywords.includes("ENTER_FIELD") && !card.effects?.length && !card.enterFieldEffects?.length) {
      issues.push({ code: "MISSING_EFFECT_IMPLEMENTATION", cardId: card.id, message: "入場曲只有文字，尚未連接可執行效果" });
    }
    if (card.keywords.includes("EFFECT_SUMMON") && !card.effectSummon) {
      issues.push({ code: "MISSING_EFFECT_IMPLEMENTATION", cardId: card.id, message: "效果召喚只有文字，尚未連接發動條件" });
    }
    if (card.keywords.includes("COUNTDOWN") && card.initialCounters?.countdown === undefined) {
      issues.push({ code: "MISSING_EFFECT_IMPLEMENTATION", cardId: card.id, message: "倒數只有文字，尚未設定初始倒數" });
    }
    const hasAuraImplementation = Boolean(
      card.transformAura
      || card.grantOnFriendlyEnterAura
      || card.damageCapAura
      || card.friendlySummonAura
      || card.friendlyEffectDamageImmunityAura
      || card.selfKeywordWhileOtherFriendlySubtypes
      || card.triggeredEffects?.ON_FRIENDLY_COMBAT_KILL?.length
      || card.triggeredEffects?.ON_SELF_COMBAT_START?.length
      || card.triggeredEffects?.END_TURN?.length,
    );
    if ((card.keywords.includes("AURA") || card.effectsText.includes("光環")) && !hasAuraImplementation) {
      issues.push({ code: "MISSING_EFFECT_IMPLEMENTATION", cardId: card.id, message: "光環只有文字，尚未連接持續或觸發效果" });
    }
  }
  const expected: Partial<Record<Faction, number>> = { DRAGON: 40, UNDEAD: 40, MACHINE: 40, ALLIANCE: 35 };
  for (const [faction, count] of Object.entries(expected) as [Faction, number][]) {
    const actual = getMainDeckDefinitions(faction).reduce((sum, card) => sum + card.deckCount, 0);
    if (actual !== count) issues.push({ code: "DECK_SIZE_MISMATCH", message: `${faction}: expected ${count}, got ${actual}` });
  }
  return issues;
}

export function getRuleUndefinedInventory(): RuleUndefined[] {
  return cardDefinitions.flatMap((card) => {
    const entries: RuleUndefined[] = [];
    if (card.originalCost === null || (card.cardType === "MINION" && (card.attack === null || card.health === null))) {
      entries.push({ code: "RULE_UNDEFINED", ruleId: "CARD_DATA_NULL", cardId: card.id, message: "資料含 null；來源未提供，禁止轉為 0" });
    }
    if (card.notes.trim()) entries.push({ code: "RULE_UNDEFINED", ruleId: "CARD_DATA_NOTE", cardId: card.id, message: card.notes });
    return entries;
  });
}

export function isCardImplemented(definition: CardDefinition): boolean {
  if (definition.originalCost === null) return false;
  if (definition.cardType === "MINION") {
    if (definition.attack === null || definition.health === null) return false;
    if (definition.keywords.includes("BATTLECRY") && !definition.effects?.length) return false;
    const structuralOnly = definition.effectsText
      .split(/[、，,。.\s]+/)
      .filter(Boolean)
      .every((text) => ["嘲諷", "衝刺", "衝鋒", "聖盾術"].includes(text));
    return Boolean(definition.effects?.length)
      || Boolean(definition.enterFieldEffects?.length)
      || Boolean(definition.triggeredEffects)
      || Boolean(definition.effectSummon)
      || Boolean(definition.selfKeywordWhileOtherFriendlySubtypes)
      || Boolean(definition.grantOnFriendlyEnterAura)
      || Boolean(definition.damageCapAura)
      || Boolean(definition.friendlySummonAura)
      || Boolean(definition.friendlyEffectDamageImmunityAura)
      || definition.effectsText.trim() === ""
      || structuralOnly;
  }
  return Boolean(definition.effects?.length)
    || Boolean(definition.triggeredEffects && Object.keys(definition.triggeredEffects).length > 0)
    || Boolean(definition.activatedEffect)
    || Boolean(definition.transformAura)
    || Boolean(definition.grantOnFriendlyEnterAura)
    || Boolean(definition.damageCapAura)
    || Boolean(definition.friendlySummonAura)
    || Boolean(definition.friendlyEffectDamageImmunityAura)
    || Boolean(definition.fieldWinCondition);
}
