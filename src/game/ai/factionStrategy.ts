import { getCardDefinition } from "../cards/cardRegistry";
import type { Faction, PlayerId } from "../cards/cardTypes";
import type { GameState, PlayerState } from "../state/GameState";

export interface FactionStrategyProfile {
  faction: Faction;
  name: string;
  primaryPlan: string;
  expectedOpponentPlan: string;
}

/**
 * 這是少量、可閱讀的牌組知識，不是訓練資料。AI 只用公開陣營推測常見戰術，
 * 不讀取對手手牌身分或牌庫順序。
 */
export const FACTION_STRATEGY_PROFILES: Record<Faction, FactionStrategyProfile> = {
  DRAGON: { faction: "DRAGON", name: "龍族成長", primaryPlan: "提升最大水晶、利用高費龍與減費連動", expectedOpponentPlan: "中後期高費龍、範圍傷害與效果召喚" },
  UNDEAD: { faction: "UNDEAD", name: "不朽雙軸", primaryPlan: "死靈復活與黑暗之書特殊勝利並行", expectedOpponentPlan: "棄堆復活、死靈資源與末日之書" },
  MACHINE: { faction: "MACHINE", name: "機械建設", primaryPlan: "累積回收充能、神器立場與軍隊協同", expectedOpponentPlan: "神器倒數、回收循環與機械軍隊鋪場" },
  ALLIANCE: { faction: "ALLIANCE", name: "聯盟協作", primaryPlan: "累積召喚數並在協作門檻取得額外效果", expectedOpponentPlan: "大量召喚、協作10／15／20門檻與英雄牌" },
  NEUTRAL: { faction: "NEUTRAL", name: "通用", primaryPlan: "維持生命與場面優勢", expectedOpponentPlan: "通用場面交換" },
};

function subtypeCount(cards: PlayerState["minions"] | PlayerState["fields"], subtype: string): number {
  return cards.filter((card) => getCardDefinition(card.definitionId).subtype.includes(subtype)).length;
}

function boardAttack(player: PlayerState): number {
  return player.minions.reduce((sum, card) => sum + Math.max(0, card.currentAttack ?? 0), 0);
}

function dragonScore(player: PlayerState): number {
  const dragons = player.minions.filter((card) => getCardDefinition(card.definitionId).subtype.includes("DRAGON"));
  const highCostDragons = dragons.filter((card) => (getCardDefinition(card.definitionId).originalCost ?? 0) >= 7).length;
  const graveDragons = player.graveyard.filter((card) => {
    const definition = getCardDefinition(card.definitionId);
    return definition.cardType === "MINION" && definition.subtype.includes("DRAGON");
  }).length;
  return player.maxMana * 2.2
    + (player.maxMana >= 8 ? 10 : 0)
    + highCostDragons * 3
    + graveDragons * 0.7
    + player.summonedDragonOriginalCostThisTurn * 0.25;
}

function undeadScore(player: PlayerState, opponent: PlayerState): number {
  const doomBooks = player.fields.filter((card) => card.definitionId === "TOKEN_UNDEAD_DOOMSDAY_BOOK").length;
  const preludes = player.fields.filter((card) => card.definitionId === "TOKEN_UNDEAD_BOOK_DOOM_PRELUDE").length;
  const immortalBooks = player.fields.filter((card) => card.definitionId === "TOKEN_UNDEAD_BOOK_IMMORTAL").length;
  const plagueProgress = player.fields
    .filter((card) => card.definitionId === "TOKEN_UNDEAD_BOOK_PLAGUE")
    .reduce((sum, card) => sum + (card.counters.plagueMarks ?? 0), 0);
  const directDisadvantage = boardAttack(opponent) > boardAttack(player) || opponent.heroHp - player.heroHp >= 8;
  const fallbackWeight = directDisadvantage ? 1.55 : 1;
  const doomPlan = doomBooks * 70
    + (preludes === 2 ? 48 : preludes * 14)
    + plagueProgress * 4
    + immortalBooks * (player.resources.necromancy >= 15 ? 18 : 6);
  return player.resources.necromancy * 0.8
    + player.graveyard.filter((card) => getCardDefinition(card.definitionId).cardType === "MINION").length * 0.45
    + doomPlan * fallbackWeight;
}

function machineScore(player: PlayerState): number {
  const artifacts = subtypeCount(player.fields, "ARTIFACT");
  const army = subtypeCount(player.minions, "ARMY");
  const charge = player.resources.recycleCharge;
  return charge * 1.3
    + (charge >= 3 ? 4 : 0)
    + (charge >= 6 ? 7 : 0)
    + (charge >= 15 ? 12 : 0)
    + artifacts * 5
    + player.fields.length * 1.5
    + army * (artifacts > 0 ? 3 : 1.5);
}

function allianceScore(player: PlayerState): number {
  const collaboration = player.summonedThisGame;
  return collaboration * 0.65
    + (collaboration >= 10 ? 10 : 0)
    + (collaboration >= 15 ? 16 : 0)
    + (collaboration >= 20 ? 24 : 0)
    + player.minions.length * 1.5;
}

/** 評估一方如何接近其公開陣營的主要勝利計畫。 */
export function evaluateFactionStrategy(state: GameState, playerId: PlayerId): number {
  const player = state.players[playerId];
  const opponent = state.players[playerId === "P1" ? "P2" : "P1"];
  const factions = player.deckFactions?.length > 1 ? player.deckFactions : [player.faction];
  return factions.reduce((score, faction) => {
    switch (faction) {
      case "DRAGON": return score + dragonScore(player);
      case "UNDEAD": return score + undeadScore(player, opponent);
      case "MACHINE": return score + machineScore(player);
      case "ALLIANCE": return score + allianceScore(player);
      case "NEUTRAL": return score;
    }
  }, 0);
}
