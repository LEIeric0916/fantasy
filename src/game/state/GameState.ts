import type { CardInstance, EffectDefinition, Faction, PlayerId } from "../cards/cardTypes";

export type GamePhase =
  | "MULLIGAN"
  | "DRAW"
  | "COUNTDOWN"
  | "GROWTH"
  | "MAIN"
  | "END"
  | "HAND_LIMIT"
  | "GAME_OVER";

export interface RulesConfig {
  minionLimit: number;
  handLimitAtEnd: number;
  normalMaxMana: number;
  minCardCost: number;
  fieldLimits: Partial<Record<Faction, number | null>>;
  discoverRemainderPolicy: "RETURN_KEEP_ORDER";
}

export interface PlayerState {
  id: PlayerId;
  faction: Faction;
  heroHp: number;
  heroMaxHp: number;
  mana: number;
  maxMana: number;
  deck: CardInstance[];
  hand: CardInstance[];
  minions: CardInstance[];
  fields: CardInstance[];
  graveyard: CardInstance[];
  removed: CardInstance[];
  extraDeck: CardInstance[];
  resources: { necromancy: number; recycleCharge: number };
  choiceHistory: Record<string, string[]>;
  summonedThisTurn: number;
  summonedThisGame: number;
  cardsPlayedThisTurn: number;
  mulliganDone: boolean;
  normalDraws: number;
  coinGranted: boolean;
  effectSummonUsedThisTurn: string[];
  summonedDragonOriginalCostThisTurn: number;
  nextMachineCostReduction: number;
  heroDamageNullifiers: number;
  nextMinionTemporaryCostReduction: number;
  nextLowCostDragonZeroMaxCost: number | null;
  nextHighCostDragonReductionMinCost: number | null;
  nextHighCostDragonReduction: number;
  heroDivineShield: boolean;
}

export interface GameLogEntry {
  index: number;
  turn: number;
  type: "ACTION" | "PHASE" | "ZONE" | "RESOURCE" | "COMBAT" | "PROTECTION" | "RESULT" | "RULE" | "RNG";
  message: string;
  data?: Record<string, unknown>;
}

export interface EffectNotice {
  id: number;
  playerId: PlayerId;
  sourceInstanceId: string;
  sourceName: string;
  reason: string;
}

export type PendingChoice =
  | { type: "HAND_LIMIT"; playerId: PlayerId; count: number }
  | { type: "EFFECT_SUMMON_CONFIRM"; playerId: PlayerId; sourceInstanceId: string; remainingEffects: EffectDefinition[] }
  | { type: "TRIGGER_ORDER"; playerId: PlayerId; timingId: string; instanceIds: string[] }
  | { type: "COUNTDOWN_ORDER"; playerId: PlayerId; instanceIds: string[] }
  | {
      type: "EFFECT_OPTION";
      playerId: PlayerId;
      sourceInstanceId: string;
      prompt: string;
      options: { id: string; label: string; effects: EffectDefinition[] }[];
      remainingEffects: EffectDefinition[];
    }
  | {
      type: "EFFECT_CARDS";
      playerId: PlayerId;
      sourceInstanceId: string;
      prompt: string;
      count: number;
      minCount?: number;
      candidateInstanceIds: string[];
      resolution:
        | { type: "DISCARD_HAND" }
        | { type: "DAMAGE_MINION"; value: number }
        | { type: "REPEAT_DAMAGE_MINION"; value: number; remainingHits: number }
        | { type: "REPEAT_DAMAGE_MINION_OR_HERO"; value: number; remainingHits: number; heroHitsRemaining: number }
        | { type: "DAMAGE_MINIONS_REWARD_KILLS"; value: number; drawPerKill: number; healPerKill: number }
        | { type: "DESTROY_MINION" }
        | { type: "DESTROY_MINIONS" }
        | { type: "VANISH_MINIONS" }
        | { type: "TRANSFORM_MINIONS"; definitionId: string }
        | { type: "REVIVE_MINION" }
        | { type: "SEAL_MINION" }
        | { type: "GRANT_MINION_KEYWORD"; keyword: import("../cards/cardTypes").Keyword }
        | { type: "RETURN_HAND_TO_DECK_MACHINE_DISCOUNT"; reductionPerCard: number }
        | { type: "SET_CARD_COST_ZERO" }
        | { type: "RETURN_HAND_MINION_TO_DECK_SHUFFLE_DRAW_BY_COST"; threshold: number; low: number; high: number }
        | { type: "SEARCH_DECK" }
        | { type: "DISCOVER_TO_HAND"; temporaryCostReduction?: number; discardFromSelected?: number }
        | { type: "SUMMON_EFFECT_COPY"; definitionId: string }
        | { type: "COPY_SPELL_EFFECT" };
      remainingEffects: EffectDefinition[];
    };

export interface PendingEffect {
  sourceInstanceId: string;
  controllerId: PlayerId;
  effects: EffectDefinition[];
  cause: string;
  timingId: string;
  eligibleTargetInstanceIds: string[];
  orderConfirmed?: boolean;
}

export interface RuleUndefined {
  code: "RULE_UNDEFINED";
  ruleId: string;
  message: string;
  cardId?: string;
}

export interface GameState {
  gameId: string;
  turnNumber: number;
  activePlayerId: PlayerId;
  startingPlayerId: PlayerId;
  phase: GamePhase;
  players: Record<PlayerId, PlayerState>;
  pendingEffects: PendingEffect[];
  pendingChoice?: PendingChoice;
  log: GameLogEntry[];
  effectNotices: EffectNotice[];
  winner?: PlayerId;
  loseReason?: "HP_ZERO" | "DECK_OUT" | "DOOMSDAY_BOOK";
  rngSeed: number;
  rulesConfig: RulesConfig;
  startTurnEffectsPending?: boolean;
  endTurnEffectsPending?: boolean;
  growthEffectsPending?: boolean;
}

export interface EngineResult {
  state: GameState;
  error?: RuleUndefined | { code: "INVALID_ACTION"; message: string } | { code: "NOT_IMPLEMENTED"; message: string; cardId?: string };
}

export const DEFAULT_RULES_CONFIG: RulesConfig = {
  minionLimit: 7,
  handLimitAtEnd: 10,
  normalMaxMana: 10,
  minCardCost: 0,
  fieldLimits: { DRAGON: 7, UNDEAD: 7, MACHINE: 6, ALLIANCE: 7, NEUTRAL: 7 },
  discoverRemainderPolicy: "RETURN_KEEP_ORDER",
};
