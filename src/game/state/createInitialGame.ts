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
  deckFactions?: Partial<Record<PlayerId, readonly Faction[]>>;
  startingPlayerId?: PlayerId;
  seed?: number;
  rulesConfig?: Partial<RulesConfig>;
  shuffle?: boolean;
}

function createRandomSeed(): number {
  return Math.floor(Math.random() * 0x1_0000_0000) >>> 0;
}

function buildDeck(factions: readonly Faction[], ownerId: PlayerId): CardInstance[] {
  let serial = 0;
  return factions.flatMap((faction) => getMainDeckDefinitions(faction)).flatMap((definition) =>
    Array.from({ length: definition.deckCount }, () =>
      createCardInstance(definition, ownerId, "DECK", `${ownerId}-${definition.id}-${serial++}`),
    ),
  );
}

function createPlayer(id: PlayerId, deckFactions: readonly Faction[], deck: CardInstance[]): PlayerState {
  const faction = deckFactions[0];
  if (!faction) throw new Error(`${id} 至少需要一個牌組陣營`);
  return {
    id,
    faction,
    deckFactions: [...deckFactions],
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
  const deckFactions = {
    P1: [...new Set(options.deckFactions?.P1 ?? [factions.P1])],
    P2: [...new Set(options.deckFactions?.P2 ?? [factions.P2])],
  } satisfies Record<PlayerId, Faction[]>;
  const startingPlayerId = options.startingPlayerId ?? "P1";
  const initialSeed = options.seed ?? createRandomSeed();
  let seed = initialSeed;
  const decks = { P1: buildDeck(deckFactions.P1, "P1"), P2: buildDeck(deckFactions.P2, "P2") };
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
      P1: createPlayer("P1", deckFactions.P1, decks.P1),
      P2: createPlayer("P2", deckFactions.P2, decks.P2),
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

export function createSecondTutorialGame(): GameState {
  const state = createInitialGame({
    factions: { P1: "ALLIANCE", P2: "ALLIANCE" },
    startingPlayerId: "P1",
    seed: 2,
    shuffle: false,
  });

  for (const playerId of ["P1", "P2"] as const) {
    const player = state.players[playerId];
    player.deck = [];
    player.hand = [];
    player.minions = [];
    player.fields = [];
    player.graveyard = [];
    player.removed = [];
    player.extraDeck = [];
    player.mulliganDone = true;
    player.normalDraws = 1;
    player.coinGranted = true;
  }

  state.players.P1.hand.push(createTestCard("NEUTRAL_002", "P1", "HAND", "tutorial-warrior-apprentice"));
  state.players.P1.deck.push(
    createTestCard("NEUTRAL_005", "P1", "DECK", "tutorial-assassin-apprentice"),
    createTestCard("NEUTRAL_004", "P1", "DECK", "tutorial-knight-apprentice"),
  );
  state.players.P2.hand.push(createTestCard("NEUTRAL_003", "P2", "HAND", "tutorial-guard-apprentice"));
  state.players.P2.deck.push(
    createTestCard("NEUTRAL_004", "P2", "DECK", "tutorial-opponent-knight-apprentice"),
    createTestCard("NEUTRAL_001", "P2", "DECK", "tutorial-opponent-draw-filler"),
  );
  state.players.P1.heroHp = 2;
  state.players.P2.heroHp = 6;
  state.players.P1.mana = 2;
  state.players.P1.maxMana = 2;
  state.players.P1.turnsStarted = 1;
  state.players.P2.mana = 1;
  state.players.P2.maxMana = 1;
  state.phase = "MAIN";
  state.turnNumber = 1;
  state.log = [];
  state.effectNotices = [];
  return state;
}

export function createThirdTutorialGame(): GameState {
  const state = createInitialGame({
    factions: { P1: "MACHINE", P2: "MACHINE" },
    startingPlayerId: "P1",
    seed: 2,
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

  const tutorialSpell = createTestCard("NEUTRAL_001", "P1", "HAND", "tutorial-magic-knowledge");
  state.players.P1.hand.push(tutorialSpell);
  const arsenalIndex = state.players.P1.deck.findIndex((card) => card.definitionId === "MACHINE_008");
  if (arsenalIndex < 0) throw new Error("Tutorial deck is missing MACHINE_008");
  const [arsenal] = state.players.P1.deck.splice(arsenalIndex, 1);
  state.players.P1.deck.push(arsenal);
  state.players.P1.mana = 4;
  state.players.P1.maxMana = 4;
  state.players.P1.turnsStarted = 1;
  state.phase = "MAIN";
  state.turnNumber = 1;
  state.log = [];
  state.effectNotices = [];
  return state;
}

function clearTutorialZones(state: GameState): void {
  for (const playerId of ["P1", "P2"] as const) {
    const player = state.players[playerId];
    player.deck = [];
    player.hand = [];
    player.minions = [];
    player.fields = [];
    player.graveyard = [];
    player.removed = [];
    player.extraDeck = [];
    player.mulliganDone = true;
    player.normalDraws = 1;
    player.coinGranted = true;
  }
  state.phase = "MAIN";
  state.turnNumber = 1;
  state.log = [];
  state.effectNotices = [];
}

export function createFourthTutorialGame(): GameState {
  const state = createInitialGame({ factions: { P1: "ALLIANCE", P2: "ALLIANCE" }, startingPlayerId: "P1", seed: 4, shuffle: false });
  clearTutorialZones(state);
  state.players.P1.hand.push(createTestCard("NEUTRAL_006", "P1", "HAND", "tutorial-shield-apprentice"));
  const enemy = createTestCard("NEUTRAL_002", "P2", "MINION", "tutorial-shield-target");
  enemy.summonedOnTurn = 0;
  state.players.P2.minions.push(enemy);
  state.players.P2.deck.push(createTestCard("NEUTRAL_001", "P2", "DECK", "tutorial-shield-opponent-draw"));
  state.players.P1.mana = 2;
  state.players.P1.maxMana = 2;
  state.players.P1.turnsStarted = 1;
  state.players.P2.maxMana = 1;
  return state;
}

export function createFifthTutorialGame(): GameState {
  const state = createInitialGame({ factions: { P1: "ALLIANCE", P2: "ALLIANCE" }, startingPlayerId: "P1", seed: 5, shuffle: false });
  clearTutorialZones(state);
  state.players.P1.hand.push(createTestCard("NEUTRAL_008", "P1", "HAND", "tutorial-kill-apprentice"));
  state.players.P1.deck.push(createTestCard("NEUTRAL_002", "P1", "DECK", "tutorial-kill-draw-warrior"));
  const enemy = createTestCard("NEUTRAL_002", "P2", "MINION", "tutorial-kill-target");
  enemy.summonedOnTurn = 0;
  state.players.P2.minions.push(enemy);
  state.players.P1.mana = 4;
  state.players.P1.maxMana = 4;
  state.players.P1.turnsStarted = 1;
  return state;
}

export function createSixthTutorialGame(): GameState {
  const state = createInitialGame({ factions: { P1: "ALLIANCE", P2: "ALLIANCE" }, startingPlayerId: "P1", seed: 6, shuffle: false });
  clearTutorialZones(state);
  state.players.P1.hand.push(createTestCard("NEUTRAL_007", "P1", "HAND", "tutorial-windfury-apprentice"));
  state.players.P2.deck.push(createTestCard("NEUTRAL_001", "P2", "DECK", "tutorial-windfury-opponent-draw"));
  state.players.P1.deck.push(createTestCard("NEUTRAL_002", "P1", "DECK", "tutorial-windfury-turn-draw"));
  state.players.P1.mana = 2;
  state.players.P1.maxMana = 2;
  state.players.P1.turnsStarted = 1;
  state.players.P2.maxMana = 1;
  return state;
}

export function createSeventhTutorialGame(): GameState {
  const state = createInitialGame({ factions: { P1: "ALLIANCE", P2: "ALLIANCE" }, startingPlayerId: "P1", seed: 7, shuffle: false });
  clearTutorialZones(state);
  state.players.P1.hand.push(createTestCard("NEUTRAL_009", "P1", "HAND", "tutorial-deathrattle-apprentice"));
  state.players.P1.deck.push(createTestCard("NEUTRAL_002", "P1", "DECK", "tutorial-deathrattle-draw-warrior"));
  const enemy = createTestCard("NEUTRAL_002", "P2", "MINION", "tutorial-effect-enemy-warrior");
  enemy.summonedOnTurn = 0;
  state.players.P2.minions.push(enemy);
  state.players.P2.deck.push(createTestCard("NEUTRAL_001", "P2", "DECK", "tutorial-effect-opponent-draw"));
  state.players.P1.mana = 2;
  state.players.P1.maxMana = 2;
  state.players.P1.turnsStarted = 1;
  state.players.P2.maxMana = 1;
  return state;
}

export function createEighthTutorialGame(): GameState {
  const state = createInitialGame({ factions: { P1: "ALLIANCE", P2: "ALLIANCE" }, startingPlayerId: "P1", seed: 8, shuffle: false });
  clearTutorialZones(state);
  state.players.P1.hand.push(createTestCard("NEUTRAL_010", "P1", "HAND", "tutorial-battlecry-apprentice"));
  state.players.P1.deck.push(createTestCard("NEUTRAL_002", "P1", "DECK", "tutorial-battlecry-draw-warrior"));
  state.players.P2.minions.push(createTestCard("NEUTRAL_002", "P2", "MINION", "tutorial-effect-enemy-warrior"));
  state.players.P1.mana = 2;
  state.players.P1.maxMana = 2;
  state.players.P1.turnsStarted = 1;
  return state;
}
