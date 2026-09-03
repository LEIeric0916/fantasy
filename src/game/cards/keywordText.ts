import type { CardInstance, Keyword } from "./cardTypes";

export interface KeywordText {
  label: string;
  description: string;
}

export const KEYWORD_TEXT: Record<Keyword, KeywordText> = {
  TAUNT: { label: "嘲諷", description: "對手以手下攻擊時，必須優先攻擊可被攻擊的嘲諷手下。" },
  RUSH: { label: "衝刺", description: "進場回合即可攻擊敵方手下，但不能攻擊敵方玩家。" },
  CHARGE: { label: "衝鋒", description: "進場回合即可攻擊敵方手下或玩家。" },
  DIVINE_SHIELD: { label: "聖盾術", description: "下一次受到至少1點傷害時，使該次傷害變為0，然後失去聖盾術。" },
  BATTLECRY: { label: "戰吼", description: "由手牌打出或以符合規則的方式召喚進場時，發動牌面記載的戰吼效果。" },
  DEATHRATTLE: { label: "死亡之聲", description: "此手下從場上被消滅時，發動牌面記載的死亡之聲。" },
  ENTER_FIELD: { label: "入場曲", description: "此立場進場時，發動牌面記載的入場曲。" },
  LAST_WORDS: { label: "謝幕曲", description: "此立場從場上被消滅時，發動牌面記載的謝幕曲。" },
  STEALTH: { label: "潛行", description: "不能被對手能力指定或手下攻擊；主動攻擊或以自身能力造成傷害後解除。" },
  DETERRENCE: { label: "威懾", description: "不能被對手手下攻擊，但仍可被效果指定。" },
  WARD: { label: "光紋", description: "在場時不能被對手效果指定；我方效果仍可指定，不指定目標的範圍效果仍可影響它。" },
  DISCIPLINE: { label: "紀律", description: "在場時不受對手效果造成的攻擊／生命改值、轉變、沉默與封印；仍會受到效果傷害，我方與自身效果也可影響它。" },
  SANCTUARY: { label: "庇護", description: "在場時不能被效果或必殺直接消滅；仍可能因生命歸零或消失而離場。" },
  INVINCIBLE: { label: "無敵", description: "不受攻擊與效果傷害、改值、轉變、沉默、封印、直接消滅及消失。" },
  LETHAL: { label: "必殺", description: "與此手下交戰的敵方手下，在交戰傷害結算後被消滅。" },
  WINDFURY: { label: "風怒", description: "每回合可攻擊2次。" },
  ON_KILL: { label: "殺意", description: "此手下透過戰鬥消滅手下且自身仍在場時，發動牌面記載的效果。" },
  AURA: { label: "光環", description: "來源在場期間，牌面記載的持續效果生效；來源離場時停止。" },
  COUNTDOWN: { label: "倒數", description: "控制者回合開始時倒數值減1；降至0時此牌被消滅。" },
  GROWTH: { label: "生長", description: "控制者回合開始的生長時機，發動牌面記載的效果。" },
  DISCOVER: { label: "發現", description: "從牌組上方翻開指定張數，選擇符合條件的牌加入手牌。" },
  EFFECT_SUMMON: { label: "效果召喚", description: "此手下在手牌中滿足牌面條件時，確認後召喚到場上。" },
  ALT_COST: { label: "轉費", description: "可改付牌面記載的費用打出，並只執行該轉費記載的替代效果。" },
  RECYCLE: { label: "回收", description: "從場上被消滅時返回牌組底部，並使回收充能+1。" },
  ON_REVIVE: { label: "復活效果", description: "此手下從棄堆被復活到場上時，發動牌面記載的效果。" },
  ON_DISCARD: { label: "棄牌效果", description: "此牌從手牌被捨棄時，發動牌面記載的效果。" },
  NECRO_REVIVE_4: { label: "死靈復活4", description: "符合死靈復活規則且支付4點死靈數時，使此手下從棄堆復活。" },
  NECRO_REVIVE_5: { label: "死靈復活5", description: "符合死靈復活規則且支付5點死靈數時，使此手下從棄堆復活。" },
  NECRO_REVIVE_6: { label: "死靈復活6", description: "符合死靈復活規則且支付6點死靈數時，使此手下從棄堆復活。" },
  HEADHUNT: { label: "取首", description: "攻擊時無視嘲諷，可選擇其他合法目標。" },
  CAN_ONLY_ATTACK_HERO: { label: "只能攻擊玩家", description: "此手下主動攻擊時只能選擇敵方玩家。" },
  CANNOT_COUNTERATTACK: { label: "不能反擊", description: "此手下被其他手下攻擊時，不會造成規則反擊傷害。" },
  IMMUNE_EFFECT_DAMAGE: { label: "免疫效果傷害", description: "不會受到卡牌能力造成的傷害。" },
  CANNOT_ATTACK_HERO: { label: "不能攻擊玩家", description: "此手下不能以敵方玩家為攻擊目標。" },
};

export function getKeywordText(keyword: Keyword): KeywordText {
  return KEYWORD_TEXT[keyword];
}

export function getCardKeywordText(card: CardInstance): KeywordText[] {
  return card.keywords.map(getKeywordText);
}
