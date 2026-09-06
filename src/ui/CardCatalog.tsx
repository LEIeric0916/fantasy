import { useMemo, useState } from "react";
import { cardDefinitions, cardRegistry } from "../game/cards/cardRegistry";
import type { CardDefinition, CardType, Faction } from "../game/cards/cardTypes";
import { getKeywordText } from "../game/cards/keywordText";
import { GlossaryText, KeywordGlossaryButton } from "./GlossaryTerm";
import { cardTypeLabels, factionLabels, formatSubtypeLabels } from "../game/cards/displayLabels";

const deckFactions: Faction[] = ["DRAGON", "UNDEAD", "MACHINE", "ALLIANCE"];
type CatalogSectionKind = "DECK" | "RESERVE" | "GENERATED";

type RelationKind = "GENERATED" | "SEARCH" | "TRANSFORM" | "REFERENCE";

interface CardRelation {
  card: CardDefinition;
  labels: string[];
}

function relationKind(effectType: string, key: string, target: CardDefinition): RelationKind {
  if (effectType.includes("SEARCH")) return "SEARCH";
  if (effectType.includes("TRANSFORM") || key.toLocaleLowerCase().includes("transform")) return "TRANSFORM";
  if (target.generatedOnly || effectType.includes("SUMMON") || effectType.includes("GENERATED")) return "GENERATED";
  return "REFERENCE";
}

function collectCardReferences(card: CardDefinition): Map<string, Set<RelationKind>> {
  const references = new Map<string, Set<RelationKind>>();
  const roots = [card.effects, card.triggeredEffects, card.enterFieldEffects, card.alternatePlay, card.activatedEffect, card.transformAura, card.friendlySummonAura];
  const visit = (value: unknown, key = "", inheritedType = "") => {
    if (typeof value === "string") {
      if (!/definitionIds?$/i.test(key) || value === card.id) return;
      const target = cardRegistry.get(value);
      if (!target) return;
      const kinds = references.get(value) ?? new Set<RelationKind>();
      kinds.add(relationKind(inheritedType, key, target));
      references.set(value, kinds);
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((item) => visit(item, key, inheritedType));
      return;
    }
    if (!value || typeof value !== "object") return;
    const record = value as Record<string, unknown>;
    const effectType = typeof record.type === "string" ? record.type : inheritedType;
    Object.entries(record).forEach(([childKey, child]) => visit(child, childKey, effectType));
  };
  roots.forEach((root) => visit(root));
  return references;
}

const cardReferences = new Map(cardDefinitions.map((card) => [card.id, collectCardReferences(card)]));

function relationLabel(kind: RelationKind, direction: "OUTGOING" | "INCOMING"): string {
  if (direction === "OUTGOING") {
    if (kind === "GENERATED") return "衍生／召喚對象";
    if (kind === "SEARCH") return "檢索對象";
    if (kind === "TRANSFORM") return "轉變對象";
    return "效果指定";
  }
  if (kind === "GENERATED") return "產生此牌";
  if (kind === "SEARCH") return "檢索此牌";
  if (kind === "TRANSFORM") return "轉變為此牌";
  return "指定此牌";
}

function getCardRelations(card: CardDefinition, direction: "OUTGOING" | "INCOMING"): CardRelation[] {
  const relations = new Map<string, Set<string>>();
  if (direction === "OUTGOING") {
    for (const [targetId, kinds] of cardReferences.get(card.id) ?? []) {
      relations.set(targetId, new Set([...kinds].map((kind) => relationLabel(kind, direction))));
    }
  } else {
    for (const source of cardDefinitions) {
      const kinds = cardReferences.get(source.id)?.get(card.id);
      if (source.id === card.id || !kinds) continue;
      relations.set(source.id, new Set([...kinds].map((kind) => relationLabel(kind, direction))));
    }
  }
  return [...relations].map(([id, labels]) => ({ card: cardRegistry.get(id)!, labels: [...labels] }))
    .sort((left, right) => left.card.name.localeCompare(right.card.name, "zh-Hant"));
}

interface Props {
  onBack: () => void;
}

export function CardCatalog({ onBack }: Props) {
  const [faction, setFaction] = useState<Faction>();
  const [cardType, setCardType] = useState<CardType | "ALL">("ALL");
  const [query, setQuery] = useState("");
  const [inspectedCard, setInspectedCard] = useState<CardDefinition>();

  const normalizedQuery = query.trim().toLocaleLowerCase("zh-Hant");
  const filterVisibleCards = (cards: CardDefinition[]) => cards
    .filter((card) => cardType === "ALL" || card.cardType === cardType)
    .filter((card) => {
      if (!normalizedQuery) return true;
      return [card.name, card.effectsText, card.subtype.join(" "), formatSubtypeLabels(card.subtype), ...card.keywords.map((keyword) => getKeywordText(keyword).label)]
        .join(" ")
        .toLocaleLowerCase("zh-Hant")
        .includes(normalizedQuery);
    })
    .sort((left, right) => {
      const costDifference = (left.originalCost ?? Number.MAX_SAFE_INTEGER) - (right.originalCost ?? Number.MAX_SAFE_INTEGER);
      return costDifference || left.name.localeCompare(right.name, "zh-Hant");
    });
  const deckCards = useMemo(() => filterVisibleCards(cardDefinitions
    .filter((card) => Boolean(faction) && !card.generatedOnly && card.faction === faction && card.deckCount > 0)), [cardType, faction, normalizedQuery]);
  const reserveCards = useMemo(() => filterVisibleCards(cardDefinitions
    .filter((card) => Boolean(faction) && !card.generatedOnly && card.faction === faction && card.deckCount === 0)), [cardType, faction, normalizedQuery]);
  const generatedCards = useMemo(() => filterVisibleCards(cardDefinitions
    .filter((card) => Boolean(faction) && card.generatedOnly && card.faction === faction)), [cardType, faction, normalizedQuery]);

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
      <p className="catalog-summary"><strong>{factionLabels[faction]}</strong>牌組 · {deckCards.length} 種牌組卡 · {reserveCards.length} 種預備卡 · {generatedCards.length} 種衍生卡</p>
      <CatalogSection title="牌組卡" description="目前編入這副牌的卡牌" cards={deckCards} onInspect={setInspectedCard} kind="DECK" />
      <CatalogSection title="預備卡表" description="暫時從主牌組下放的卡牌；不計入正式牌組張數" cards={reserveCards} onInspect={setInspectedCard} kind="RESERVE" />
      <CatalogSection title="衍生卡" description="由這副牌的效果產生、召喚或轉變而來的卡牌" cards={generatedCards} onInspect={setInspectedCard} kind="GENERATED" />
    </>}
    {inspectedCard && <CatalogCardModal card={inspectedCard} onInspect={setInspectedCard} onClose={() => setInspectedCard(undefined)} />}
  </main>;
}

function CatalogSection({ title, description, cards, kind, onInspect }: { title: string; description: string; cards: CardDefinition[]; kind: CatalogSectionKind; onInspect: (card: CardDefinition) => void }) {
  const eyebrow = kind === "GENERATED" ? "EXTRA CARDS" : kind === "RESERVE" ? "RESERVE CARDS" : "DECK CARDS";
  return <section className={`catalog-section ${kind.toLocaleLowerCase()}-section`} aria-label={title}>
    <div className="catalog-section-heading"><div><p className="eyebrow">{eyebrow}</p><h2>{title}</h2></div><span>{description} · {cards.length} 種</span></div>
    {cards.length === 0 ? <p className="empty-zone-message">沒有符合條件的卡牌。</p> : <section className="catalog-grid">
      {cards.map((card) => <CatalogCardButton card={card} kind={kind} onInspect={onInspect} key={card.id} />)}
    </section>}
  </section>;
}

function CatalogCardButton({ card, kind, onInspect }: { card: CardDefinition; kind: CatalogSectionKind; onInspect: (card: CardDefinition) => void }) {
  return <button className={`catalog-card faction-${card.faction.toLowerCase()}`} onClick={() => onInspect(card)} aria-label={`檢視 ${card.name}`}>
    <span className="catalog-cost">{card.originalCost ?? "?"}</span>
    <small>{factionLabels[card.faction]} · {cardTypeLabels[card.cardType]}</small>
    <strong>{card.name}</strong>
    <span className="catalog-subtype">{formatSubtypeLabels(card.subtype)}</span>
    {card.cardType === "MINION" && <span className="catalog-stats"><b>⚔ {card.attack ?? "?"}</b><b>♥ {card.health ?? "?"}</b></span>}
    <span className="catalog-keywords">{card.keywords.map((keyword) => getKeywordText(keyword).label).join(" · ") || "無關鍵字"}</span>
    <span className="catalog-effect">{card.effectsText || "無卡牌效果"}</span>
    <small className="catalog-count">{kind === "GENERATED" ? "衍生卡" : kind === "RESERVE" ? "預備卡" : `牌組放入 ${card.deckCount} 張`}</small>
  </button>;
}

function CatalogCardModal({ card, onInspect, onClose }: { card: CardDefinition; onInspect: (card: CardDefinition) => void; onClose: () => void }) {
  const outgoingRelations = getCardRelations(card, "OUTGOING");
  const incomingRelations = getCardRelations(card, "INCOMING");
  return <div className="card-modal-backdrop" role="presentation" onClick={onClose}>
    <section className="card-modal" role="dialog" aria-modal="true" aria-label={`${card.name} 卡牌資訊`} onClick={(event) => event.stopPropagation()}>
      <button className="modal-close" onClick={onClose} aria-label="關閉卡牌資訊">×</button>
      <p className="eyebrow">{factionLabels[card.faction]} · {cardTypeLabels[card.cardType]} · {formatSubtypeLabels(card.subtype)}</p>
      <h2>{card.name}</h2>
      <div className="card-modal-stats">
        <span>費用 <strong>{card.originalCost ?? "?"}</strong></span>
        {card.cardType === "MINION" && <><span>攻擊 <strong>{card.attack ?? "?"}</strong></span><span>生命 <strong>{card.health ?? "?"}</strong></span></>}
      </div>
      <div className="card-modal-effect">
        <strong>效果：</strong>
        <div className="effect-keyword-list">
          {card.keywords.map((keyword, index) => <KeywordGlossaryButton keyword={keyword} key={`${keyword}-${index}`} />)}
        </div>
        {card.effectsText ? <p className="printed-effect"><GlossaryText text={card.effectsText} /></p> : <p>無卡牌效果</p>}
      </div>
      {card.notes && <p className="catalog-notes"><strong>資料備註：</strong>{card.notes}</p>}
      <section className="card-relations" aria-label="相關卡牌">
        <h3>相關卡牌</h3>
        <RelationGroup title="這張牌會關聯" relations={outgoingRelations} onInspect={onInspect} />
        <RelationGroup title="關聯到這張牌" relations={incomingRelations} onInspect={onInspect} />
        {outgoingRelations.length === 0 && incomingRelations.length === 0 && <p className="empty-relation">目前沒有直接指名的相關卡牌。</p>}
      </section>
    </section>
  </div>;
}

function RelationGroup({ title, relations, onInspect }: { title: string; relations: CardRelation[]; onInspect: (card: CardDefinition) => void }) {
  if (relations.length === 0) return null;
  return <section className="relation-group"><h4>{title}</h4><div className="relation-list">
    {relations.map(({ card, labels }) => <button key={card.id} onClick={() => onInspect(card)} aria-label={`查看關聯卡 ${card.name}`}>
      <span className="relation-cost">{card.originalCost ?? "?"}</span>
      <span><strong>{card.name}</strong><small>{labels.join(" · ")} · {cardTypeLabels[card.cardType]}</small></span>
      {card.cardType === "MINION" && <em>⚔ {card.attack ?? "?"}　♥ {card.health ?? "?"}</em>}
    </button>)}
  </div></section>;
}
