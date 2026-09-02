import { getCardDefinition, getMainDeckDefinitions } from "../cards/cardRegistry";
import type { CardInstance, Faction, PlayerId } from "../cards/cardTypes";
import { shuffleSeeded } from "../utils/rng";
import { addLog } from "../utils/gameLog";
import { createCardInstance } from "./CardInstance";
import {
  DEFAULT_RULES_CONFIG,
  type GameState,
  type PlayerState,
  type RulesConfig,
} from "./GameState";

export interface CreateGameOptions {
  factions?: Record<PlayerId, Faction>;
  startingPlayerId?: PlayerId;
  seed?: number;
  rulesConfig?: Partial<RulesConfig>;
  shuffle?: boolean;
}

function createRandomSeed(): number {
  return Math.floor(Math.random() * 0x1_0000_0000) >>> 0;
}

function buildDeck(faction: Faction, ownerId: PlayerId): CardInstance[] {
  let serial = 0;
  return getMainDeckDefinitions(faction).flatMap((definition) =>
    Array.from({ length: definition.deckCount }, () =>
      createCardInstance(definition, ownerId, "DECK", `${ownerId}-${definition.id}-${serial++}`),
    ),
  );
}

function createPlayer(id: PlayerId, faction: Faction, deck: CardInstance[]): PlayerState {
  return {
    id,
    faction,
    heroHp: 30,
    heroMaxHp: 30,
    mana: 0,
    maxMana: 0,
    deck,
    hand: [],
    minions: [],
    fields: [],
    graveyard: [],
    removed: [],
    extraDeck: [],
    resources: { necromancy: 0, recycleCharge: 0 },
    choiceHistory: {},
    summonedThisTurn: 0,
    summonedThisGame: 0,
    cardsPlayedThisTurn: 0,
    turnsStarted: 0,
    mulliganDone: false,
    normalDraws: 0,
    coinGranted: false,
    effectSummonUsedThisTurn: [],
    summonedDragonOriginalCostThisTurn: 0,
    nextMachineCostReduction: 0,
    heroDamageNullifiers: 0,
    nextMinionTemporaryCostReduction: 0,
    nextLowCostDragonZeroMaxCost: null,
    nextHighCostDragonReductionMinCost: null,
    nextHighCostDragonReduction: 0,
    heroDivineShield: false,
  };
}

export function createInitialGame(options: CreateGameOptions = {}): GameState {
  const factions = options.factions ?? { P1: "DRAGON", P2: "UNDEAD" };
  const startingPlayerId = options.startingPlayerId ?? "P1";
  const initialSeed = options.seed ?? createRandomSeed();
  let seed = initialSeed;
  const decks = { P1: buildDeck(factions.P1, "P1"), P2: buildDeck(factions.P2, "P2") };
  if (options.shuffle !== false) {
    const p1 = shuffleSeeded(decks.P1, seed);
    decks.P1 = p1.value;
    seed = p1.seed;
    const p2 = shuffleSeeded(decks.P2, seed);
    decks.P2 = p2.value;
    seed = p2.seed;
  }
  const state: GameState = {
    gameId: `game-${initialSeed}`,
    turnNumber: 0,
    activePlayerId: startingPlayerId,
    startingPlayerId,
    phase: "MULLIGAN",
    players: {
      P1: createPlayer("P1", factions.P1, decks.P1),
      P2: createPlayer("P2", factions.P2, decks.P2),
    },
    pendingEffects: [],
    log: [],
    effectNotices: [],
    rngSeed: seed,
    rulesConfig: {
      ...DEFAULT_RULES_CONFIG,
      ...options.rulesConfig,
      fieldLimits: { ...DEFAULT_RULES_CONFIG.fieldLimits, ...options.rulesConfig?.fieldLimits },
    },
  };
  for (const playerId of ["P1", "P2"] as const) {
    const player = state.players[playerId];
    for (let count = 0; count < 4; count += 1) {
      const card = player.deck.pop();
      if (!card) throw new Error(`${playerId} deck cannot provide the confirmed four-card opening hand`);
      card.zone = "HAND";
      player.hand.push(card);
    }
  }
  addLog(state, "RNG", "建立隨機牌組與起始手牌", { seed: initialSeed, resultingSeed: seed });
  addLog(state, "PHASE", "雙方各抽取 4 張起始手牌，進入換牌階段");
  return state;
}

export function createTestCard(definitionId: string, ownerId: PlayerId, zone: CardInstance["zone"], id: string): CardInstance {
  return createCardInstance(getCardDefinition(definitionId), ownerId, zone, id);
}

export function createFirstTutorialGame(): GameState {
  const state = createInitialGame({
    factions: { P1: "ALLIANCE", P2: "ALLIANCE" },
    startingPlayerId: "P1",
    seed: 1,
    shuffle: false,
  });

  for (const playerId of ["P1", "P2"] as const) {
    const player = state.players[playerId];
    for (const card of player.hand) {
      card.zone = "DECK";
      player.deck.push(card);
    }
    player.hand = [];
    player.mulliganDone = true;
  }

  const tutorialCard = createTestCard("TOKEN_ALLIANCE_ROYAL_GUARD", "P1", "HAND", "tutorial-royal-guard");
  state.players.P1.hand.push(tutorialCard);
  state.players.P1.mana = 1;
  state.players.P1.maxMana = 1;
  state.players.P1.turnsStarted = 1;
  state.phase = "MAIN";
  state.turnNumber = 1;
  state.log = [];
  state.effectNotices = [];
  return state;
}
