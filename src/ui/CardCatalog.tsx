import { useMemo, useState } from "react";
import { cardDefinitions } from "../game/cards/cardRegistry";
import type { CardDefinition, CardType, Faction } from "../game/cards/cardTypes";
import { getKeywordText } from "../game/cards/keywordText";

const factionLabels: Record<Faction, string> = {
  DRAGON: "龍族",
  UNDEAD: "不朽者",
  MACHINE: "機械",
  ALLIANCE: "聯盟",
  NEUTRAL: "中立／衍生",
};

const cardTypeLabels: Record<CardType, string> = {
  MINION: "手下",
  SPELL: "法術",
  FIELD: "立場",
};

const deckFactions: Faction[] = ["DRAGON", "UNDEAD", "MACHINE", "ALLIANCE"];

interface Props {
  onBack: () => void;
}

export function CardCatalog({ onBack }: Props) {
  const [faction, setFaction] = useState<Faction>();
  const [cardType, setCardType] = useState<CardType | "ALL">("ALL");
  const [query, setQuery] = useState("");
  const [inspectedCard, setInspectedCard] = useState<CardDefinition>();

  const cards = useMemo(() => cardDefinitions
    .filter((card) => Boolean(faction) && !card.generatedOnly && card.faction === faction && card.deckCount > 0)
    .filter((card) => cardType === "ALL" || card.cardType === cardType)
    .filter((card) => {
      const normalizedQuery = query.trim().toLocaleLowerCase("zh-Hant");
      if (!normalizedQuery) return true;
      return [card.name, card.effectsText, card.subtype.join(" "), ...card.keywords.map((keyword) => getKeywordText(keyword).label)]
        .join(" ")
        .toLocaleLowerCase("zh-Hant")
        .includes(normalizedQuery);
    })
    .sort((left, right) => {
      const costDifference = (left.originalCost ?? Number.MAX_SAFE_INTEGER) - (right.originalCost ?? Number.MAX_SAFE_INTEGER);
      return costDifference || left.name.localeCompare(right.name, "zh-Hant");
    }), [cardType, faction, query]);

  return <main className="card-catalog">
    <header className="catalog-header">
      <div><p className="eyebrow">戰記 · CARD LIBRARY</p><h1>卡表</h1></div>
      <button className="quiet" onClick={onBack}>返回起始頁面</button>
    </header>

    <section className="deck-menu" aria-label="選擇牌組">
      {deckFactions.map((item) => {
        const definitions = cardDefinitions.filter((card) => card.faction === item && !card.generatedOnly && card.deckCount > 0);
        const deckSize = definitions.reduce((total, card) => total + card.deckCount, 0);
        return <button className={`deck-menu-item deck-${item.toLowerCase()} ${faction === item ? "selected" : ""}`} aria-label={`查看${factionLabels[item]}牌組`} aria-pressed={faction === item} onClick={() => {
          setFaction(item);
          setCardType("ALL");
          setQuery("");
        }} key={item}>
          <small>牌組選單</small>
          <strong>{factionLabels[item]}</strong>
          <span>{deckSize} 張 · {definitions.length} 種卡牌</span>
        </button>;
      })}
    </section>

    {!faction ? <section className="catalog-welcome">
      <p className="eyebrow">SELECT A DECK</p>
      <h2>選擇一副牌查看卡表</h2>
      <p>上方四個選單分別對應目前遊戲中的四副牌。</p>
    </section> : <>
      <section className="catalog-controls" aria-label="卡表篩選">
        <label>搜尋卡牌<input aria-label="搜尋卡牌" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="名稱、效果或關鍵字" /></label>
        <label>類型<select aria-label="卡牌類型" value={cardType} onChange={(event) => setCardType(event.target.value as CardType | "ALL")}>
          <option value="ALL">全部類型</option>
          {(Object.keys(cardTypeLabels) as CardType[]).map((item) => <option value={item} key={item}>{cardTypeLabels[item]}</option>)}
        </select></label>
      </section>
      <p className="catalog-summary"><strong>{factionLabels[faction]}</strong>牌組 · 顯示 {cards.length} 種卡牌</p>
    {cards.length === 0 ? <p className="empty-zone-message">沒有符合條件的卡牌。</p> : <section className="catalog-grid">
      {cards.map((card) => <button className={`catalog-card faction-${card.faction.toLowerCase()}`} key={card.id} onClick={() => setInspectedCard(card)} aria-label={`檢視 ${card.name}`}>
        <span className="catalog-cost">{card.originalCost ?? "?"}</span>
        <small>{factionLabels[card.faction]} · {cardTypeLabels[card.cardType]}</small>
        <strong>{card.name}</strong>
        <span className="catalog-subtype">{card.subtype.join(" · ") || "無種族"}</span>
        {card.cardType === "MINION" && <span className="catalog-stats"><b>⚔ {card.attack ?? "?"}</b><b>♥ {card.health ?? "?"}</b></span>}
        <span className="catalog-keywords">{card.keywords.map((keyword) => getKeywordText(keyword).label).join(" · ") || "無關鍵字"}</span>
        <span className="catalog-effect">{card.effectsText || "無卡牌效果"}</span>
        <small className="catalog-count">{card.generatedOnly ? "衍生卡" : `牌組放入 ${card.deckCount} 張`}</small>
      </button>)}
    </section>}</>}
    {inspectedCard && <CatalogCardModal card={inspectedCard} onClose={() => setInspectedCard(undefined)} />}
  </main>;
}

function CatalogCardModal({ card, onClose }: { card: CardDefinition; onClose: () => void }) {
  const keywords = card.keywords.map(getKeywordText);
  return <div className="card-modal-backdrop" role="presentation" onClick={onClose}>
    <section className="card-modal" role="dialog" aria-modal="true" aria-label={`${card.name} 卡牌資訊`} onClick={(event) => event.stopPropagation()}>
      <button className="modal-close" onClick={onClose} aria-label="關閉卡牌資訊">×</button>
      <p className="eyebrow">{factionLabels[card.faction]} · {cardTypeLabels[card.cardType]} · {card.subtype.join(" · ") || "無種族"}</p>
      <h2>{card.name}</h2>
      <div className="card-modal-stats">
        <span>費用 <strong>{card.originalCost ?? "?"}</strong></span>
        {card.cardType === "MINION" && <><span>攻擊 <strong>{card.attack ?? "?"}</strong></span><span>生命 <strong>{card.health ?? "?"}</strong></span></>}
      </div>
      <div className="card-modal-effect">
        <strong>效果：</strong>
        <div className="effect-keyword-list">
          {card.keywords.map((keyword, index) => <span className={`effect-keyword keyword-${keyword.toLowerCase().replaceAll("_", "-")}`} title={keywords[index].description} key={`${keyword}-${index}`}>{keywords[index].label}</span>)}
        </div>
        {card.effectsText ? <p className="printed-effect">{card.effectsText}</p> : <p>無卡牌效果</p>}
      </div>
      {card.notes && <p className="catalog-notes"><strong>資料備註：</strong>{card.notes}</p>}
    </section>
  </div>;
}
