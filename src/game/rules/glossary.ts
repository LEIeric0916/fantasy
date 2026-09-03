import type { Keyword } from "../cards/cardTypes";
import { KEYWORD_TEXT } from "../cards/keywordText";

export type GlossaryCategory = "戰鬥" | "卡牌效果" | "區域與資源" | "牌組機制";

export interface GlossaryTerm {
  id: string;
  label: string;
  category: GlossaryCategory;
  summary: string;
  rules: string;
  keyword?: Keyword;
  aliases?: string[];
  inlineOnCard?: boolean;
}

const keywordCategories: Record<Keyword, GlossaryCategory> = {
  TAUNT: "戰鬥", RUSH: "戰鬥", CHARGE: "戰鬥", DIVINE_SHIELD: "戰鬥", BATTLECRY: "卡牌效果",
  DEATHRATTLE: "卡牌效果", ENTER_FIELD: "卡牌效果", LAST_WORDS: "卡牌效果", STEALTH: "戰鬥",
  DETERRENCE: "戰鬥", WARD: "戰鬥", DISCIPLINE: "戰鬥", SANCTUARY: "戰鬥", INVINCIBLE: "戰鬥",
  LETHAL: "戰鬥", WINDFURY: "戰鬥", ON_KILL: "戰鬥", AURA: "卡牌效果", COUNTDOWN: "卡牌效果",
  GROWTH: "卡牌效果", DISCOVER: "卡牌效果", EFFECT_SUMMON: "卡牌效果", ALT_COST: "卡牌效果",
  RECYCLE: "牌組機制", ON_REVIVE: "卡牌效果", ON_DISCARD: "卡牌效果", NECRO_REVIVE_4: "牌組機制",
  NECRO_REVIVE_5: "牌組機制", NECRO_REVIVE_6: "牌組機制", HEADHUNT: "戰鬥", CAN_ONLY_ATTACK_HERO: "戰鬥",
  CANNOT_COUNTERATTACK: "戰鬥", IMMUNE_EFFECT_DAMAGE: "戰鬥", CANNOT_ATTACK_HERO: "戰鬥",
};

const keywordDetails: Partial<Record<Keyword, string>> = {
  TAUNT: "只限制手下的主動攻擊。若嘲諷手下同時因潛行或威懾而不能被攻擊，該嘲諷暫時不會阻擋其他合法目標。",
  RUSH: "進場當回合不能攻擊玩家；從下一個自己的回合開始，若沒有其他限制即可正常攻擊任何合法目標。",
  CHARGE: "不受召喚回合不能攻擊的限制，進場後即可攻擊手下或玩家。",
  DIVINE_SHIELD: "只有原本會造成至少1點的傷害才會打破聖盾術。傷害被改為0後不會再扣除生命；同一角色不能疊加多層。",
  BATTLECRY: "支付費用從手牌打出、自身效果召喚、死靈復活及衍生牌效果召喚都可觸發。由其他卡牌復活的普通主牌不觸發戰吼。",
  DEATHRATTLE: "必須是從場上被消滅。消失、轉變或被封印後離場不會發動。",
  ENTER_FIELD: "立場進場後立即發動；召喚來源效果會先完成，再處理新產生的入場觸發。",
  LAST_WORDS: "立場從場上被消滅時發動。消失、轉變或被封印後離場不會發動。",
  STEALTH: "不會被對手效果指定或手下攻擊；範圍效果仍可影響。主動攻擊或以自身效果造成傷害後解除。",
  DETERRENCE: "不能被對手手下攻擊，但仍可被對手效果指定；不會像嘲諷一樣保護其他目標。",
  WARD: "只阻止對手的指定效果。我方效果與不指定目標的範圍效果仍可影響它。",
  DISCIPLINE: "阻止對手效果造成的攻擊／生命改值、轉變、沉默與封印，但不阻止效果傷害；我方與自身效果仍可影響。",
  SANCTUARY: "阻止效果直接消滅及必殺。若戰鬥或效果傷害使生命降至0，或受到消失，仍會離場。",
  INVINCIBLE: "包含紀律與庇護，並額外免疫攻擊傷害、效果傷害及消失。只在此牌位於場上時生效。",
  LETHAL: "必須實際完成一次造成正值交戰傷害的戰鬥。聖盾可令該次傷害為0；庇護與無敵可阻止必殺直接消滅。",
  WINDFURY: "每個自己的回合最多攻擊2次；仍需分別符合合法目標、召喚回合與其他攻擊限制。",
  ON_KILL: "必須由這張手下的戰鬥消滅敵方手下，且自身在戰鬥結算後仍留在場上。",
  AURA: "來源在場且未被封印時持續生效；來源離場或失效後，光環提供的非永久效果立即消失。",
  COUNTDOWN: "控制者回合開始先處理倒數，再處理生長。降至0會被消滅並正常觸發謝幕曲；剛打出的回合不會立刻倒數。",
  GROWTH: "在控制者回合開始的生長階段觸發，時機晚於倒數。若來源已在倒數階段離場，就不會發動。",
  DISCOVER: "一般翻開牌組上方3張；發現+X翻開3+X張。只可從翻開範圍選擇，沒有合法目標就結束，未選牌保持原相對順序。",
  EFFECT_SUMMON: "卡牌位於手牌且條件成立時先提示玩家，再召喚。手下區已滿則不觸發；同名效果召喚每回合最多一次。",
  ALT_COST: "可改付指定費用打出；使用轉費時只執行轉費段落的替代效果，不同時執行原本效果。",
  RECYCLE: "從場上被消滅時返回牌組底部並使回收充能+1。消失不觸發；衍生牌依額外區規則處理。",
  ON_REVIVE: "卡牌確實從棄堆返回場上後發動；不是單純召喚，也不因從其他區域進場而發動。",
  ON_DISCARD: "卡牌必須從手牌被效果捨棄；正常打出、返回牌組或從其他區域進棄堆不算棄牌。",
  NECRO_REVIVE_4: "我方回合中進入棄堆且死靈數至少4時，消耗4並立即復活；同一張實例每回合最多一次。",
  NECRO_REVIVE_5: "我方回合中進入棄堆且死靈數至少5時，消耗5並立即復活；同一張實例每回合最多一次。",
  NECRO_REVIVE_6: "我方回合中進入棄堆且死靈數至少6時，消耗6並立即復活；同一張實例每回合最多一次。",
  HEADHUNT: "主動攻擊時可略過敵方嘲諷，直接選擇其他原本合法的手下或玩家。",
  CANNOT_COUNTERATTACK: "被攻擊時不會造成規則反擊傷害；主動攻擊時仍會造成自己的攻擊傷害。",
  IMMUNE_EFFECT_DAMAGE: "卡牌能力造成的指定與範圍傷害都變為0；戰鬥傷害與規則反擊傷害仍成立。",
};

const keywordTerms: GlossaryTerm[] = (Object.keys(KEYWORD_TEXT) as Keyword[]).map((keyword) => ({
  id: `keyword-${keyword.toLocaleLowerCase()}`,
  label: KEYWORD_TEXT[keyword].label,
  category: keywordCategories[keyword],
  summary: KEYWORD_TEXT[keyword].description,
  rules: keywordDetails[keyword] ?? KEYWORD_TEXT[keyword].description,
  keyword,
  inlineOnCard: true,
}));

const mechanicTerms: GlossaryTerm[] = [
  { id: "attack", label: "攻擊力", category: "戰鬥", summary: "手下攻擊時造成的戰鬥傷害數值。", rules: "主動攻擊時對目標造成等同目前攻擊力的傷害；攻擊手下時，通常也會同時受到目標攻擊力的反擊傷害。" },
  { id: "health", label: "生命值", category: "戰鬥", summary: "手下可以承受傷害的數值。", rules: "目前生命降至0或以下時，手下會被消滅。恢復生命不能超過目前生命上限，除非效果明確增加生命上限。", aliases: ["生命"] },
  { id: "counterattack", label: "反擊", category: "戰鬥", summary: "手下受到另一名手下攻擊時，同時造成的戰鬥傷害。", rules: "防守手下對攻擊者造成等同自身攻擊力的傷害。不能反擊或攻擊力為0時不造成反擊傷害；攻擊玩家不會受到反擊。" },
  { id: "effect-damage", label: "效果傷害", category: "戰鬥", summary: "由卡牌效果直接造成的傷害。", rules: "效果傷害不是戰鬥傷害，不會觸發反擊。紀律不能阻止效果傷害，但免疫效果傷害與無敵可以。" },
  { id: "cost", label: "費用", category: "區域與資源", summary: "打出卡牌時需要支付的水晶數量。", rules: "一般需有足夠可用水晶才能打出。費用受到增加或降低後最低通常為0；判斷原始費用的效果不受目前費用改變影響。" },
  { id: "original-cost", label: "原始費用", category: "區域與資源", summary: "卡牌資料印製的基礎費用。", rules: "不計算減費、增費、費用變為0或轉費。寫明『原費用』或『原始費用』的條件一律使用此數值。" },
  { id: "mana", label: "水晶", category: "區域與資源", summary: "打出卡牌及支付能力的當回合資源。", rules: "回合開始時恢復至水晶最大值。花費只扣除可用水晶；單純恢復水晶不會提高最大值。" },
  { id: "max-mana", label: "水晶最大值", category: "區域與資源", summary: "每回合可恢復的水晶上限。", rules: "通常每個自己的回合開始時+1，硬性上限為10。增加最大值不一定同時補充可用水晶，依卡文為準。" },
  { id: "deck", label: "牌組", category: "區域與資源", summary: "尚未抽到的卡牌所在區域。", rules: "抽牌通常從牌組頂取得。檢索或部分返回牌組效果完成後會洗牌；牌組耗盡且需要抽牌時會依規則敗北。" },
  { id: "hand", label: "手牌", category: "區域與資源", summary: "玩家目前持有並可打出的卡牌。", rules: "回合結束時手牌超過10張需棄至10張。效果召喚、轉費及多數減費只在卡牌位於手牌時檢查。" },
  { id: "minion-zone", label: "手下區", category: "區域與資源", summary: "雙方手下所在的場上區域。", rules: "一般上限為7張。區域已滿時，額外手下召喚失敗，不會擠掉既有手下。" },
  { id: "field-zone", label: "立場區", category: "區域與資源", summary: "放置立場卡的專用區域。", rules: "一般牌組上限為7格；機械牌組目前使用6格。立場可具有入場曲、倒數、生長、光環與謝幕曲。" },
  { id: "graveyard", label: "棄堆", category: "區域與資源", summary: "一般卡牌使用或被消滅後所在區域。", rules: "玩家可隨時查看雙方棄堆。衍生牌離場後通常返回額外區而不進棄堆；回收卡被消滅時返回牌組。" },
  { id: "extra-deck", label: "衍生牌庫", category: "區域與資源", summary: "存放不能直接放入主牌組之衍生牌的額外區域。", rules: "衍生牌可由效果召喚或加入手牌。所有衍生牌離場後返回衍生牌庫／額外區，不進棄堆或移除區。", aliases: ["額外區", "衍生卡"] },
  { id: "destroy", label: "消滅", category: "卡牌效果", summary: "使場上卡牌依正常離場規則離開。", rules: "會觸發死亡之聲、謝幕曲及相關被消滅紀錄；具有庇護或無敵的卡牌不能被效果直接消滅。" },
  { id: "vanish", label: "消失", category: "卡牌效果", summary: "使場上卡牌離場，但不視為被消滅。", rules: "不觸發死亡之聲、謝幕曲、回收或死靈數增加；一般離場效果仍可依卡文發動。" },
  { id: "summon", label: "召喚", category: "卡牌效果", summary: "將手下放置到手下區。", rules: "未寫明來源時通常從衍生牌庫產生。手下區已滿則召喚失敗；召喚進場的手下通常當回合不能攻擊。" },
  { id: "transform", label: "轉變", category: "卡牌效果", summary: "將場上的卡牌直接改成另一張卡。", rules: "不觸發原牌的死亡之聲或離場效果；保留同一實例與控制權，但改用新卡數值、效果、種族及關鍵字並清除受傷與進場狀態。" },
  { id: "seal", label: "封印", category: "卡牌效果", summary: "使場上卡牌的能力與行動失效。", rules: "被封印後效果、光環及觸發能力失效，也不能攻擊或反擊。未寫持續時間時會維持到該牌離場。" },
  { id: "draw", label: "抽牌", category: "卡牌效果", summary: "從自己的牌組頂將卡牌加入手牌。", rules: "沒有牌可抽時依空牌組敗北規則處理。抽牌不同於檢索或發現。" },
  { id: "discard", label: "棄牌", category: "卡牌效果", summary: "將卡牌從手牌送入棄堆。", rules: "只有明確從手牌捨棄才算棄牌並觸發棄牌效果；正常打出或返回牌組都不算。" },
  { id: "search", label: "檢索", category: "卡牌效果", summary: "從牌組中選擇符合條件的卡牌加入手牌。", rules: "不是隨機，也不是只查看牌組頂。完成檢索後洗牌；沒有合法目標時效果結束並提示原因。" },
  { id: "discount", label: "減費", category: "卡牌效果", summary: "依卡牌條件降低目前費用。", rules: "通常只在手牌中生效，未寫其他下限時最低降至0。寫明原始費用的條件仍使用減費前的印製費用。" },
  { id: "rally", label: "協作", category: "牌組機制", summary: "聯盟牌組本場累積召喚的手下數量。", rules: "每次我方成功召喚手下便累積；手下離場不會使數字下降。協作X表示累積值達到X時後續效果成立。" },
  { id: "union", label: "聯合", category: "卡牌效果", summary: "依手下召喚進場時的我方場上數量判斷效果。", rules: "聯合X在該手下召喚完成時檢查；若當下我方場上手下數量達到X，發動後續效果。這不是整場累積值，與協作不同。" },
  { id: "recycle-charge", label: "回收充能", category: "牌組機制", summary: "機械牌組用來支付機械術的資源。", rules: "主要由回收及卡牌效果增加。支付機械術後扣除指定數量，不會隨回合自動恢復。" },
  { id: "mechanical-technique", label: "機械術", category: "牌組機制", summary: "支付回收充能發動的機械牌組能力。", rules: "機械術X需要至少X點回收充能。全部後續效果都不能執行時不消耗；至少一部分可執行時會消耗並執行合法部分。" },
  { id: "necromancy-count", label: "死靈數", category: "牌組機制", summary: "不朽者牌組使用的累積資源。", rules: "我方手下從場上被消滅時+1，即使該牌最後返回額外區；消失與轉變不會增加。也可由卡牌效果直接增加。" },
  { id: "gain-necromancy", label: "死靈數+X", category: "牌組機制", summary: "直接增加指定數量的死靈數。", rules: "這是資源增加效果，不是死靈術，不需要先支付死靈數，也不會套用死靈術的發動條件。" },
  { id: "necromancy", label: "死靈術", category: "牌組機制", summary: "消耗死靈數發動的能力。", rules: "死靈術X需要至少X點死靈數。只有在所屬效果的合法發動時機與條件成立時才會出現或消耗資源。" },
  { id: "revive-trigger", label: "復活", category: "卡牌效果", summary: "使手下從棄堆返回場上。", rules: "必須實際由棄堆移動到場上；從手牌、牌組或額外區召喚不算復活。具有『復活：』效果的手下會在成功復活進場後發動後續效果。" },
  { id: "discover-plus", label: "發現+X", category: "卡牌效果", summary: "增加發現時翻開的牌數。", rules: "一般發現翻開3張，發現+X翻開3+X張；選擇數量仍依卡文，不代表多取得X張。" },
  { id: "alliance-artifact", label: "神器", category: "牌組機制", summary: "機械牌組的特殊立場或神器法術分類。", rules: "ARTIFACT立場與ARTIFACT_SPELL法術都屬於神器。若效果限定『神器立場』，則只計算或指定立場區中的神器。" },
];

const inlineMechanicTermIds = new Set([
  "counterattack", "effect-damage", "original-cost", "destroy", "vanish", "summon", "transform", "seal", "draw", "discard", "search", "discount",
  "rally", "union", "recycle-charge", "mechanical-technique", "necromancy-count", "gain-necromancy", "necromancy", "revive-trigger", "discover-plus", "alliance-artifact",
]);

export const GLOSSARY_TERMS: GlossaryTerm[] = [...keywordTerms, ...mechanicTerms.map((term) => ({
  ...term,
  inlineOnCard: inlineMechanicTermIds.has(term.id),
}))]
  .sort((left, right) => left.label.localeCompare(right.label, "zh-Hant"));

export const GLOSSARY_CATEGORIES: GlossaryCategory[] = ["戰鬥", "卡牌效果", "區域與資源", "牌組機制"];

export function getGlossaryTermByKeyword(keyword: Keyword): GlossaryTerm {
  return GLOSSARY_TERMS.find((term) => term.keyword === keyword)!;
}

export function findGlossaryTerm(label: string): GlossaryTerm | undefined {
  return GLOSSARY_TERMS.find((term) => term.label === label || term.aliases?.includes(label));
}

export const GLOSSARY_MATCH_LABELS = [...new Set(GLOSSARY_TERMS.filter((term) => term.inlineOnCard).flatMap((term) => [term.label, ...(term.aliases ?? [])]))]
  .sort((left, right) => right.length - left.length);
