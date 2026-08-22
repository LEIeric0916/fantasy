import { getCardDefinition } from "../game/cards/cardRegistry";
import type { CardInstance } from "../game/cards/cardTypes";

interface Props {
  card: CardInstance;
  selected?: boolean;
  disabled?: boolean;
  onClick?: () => void;
}

export function CardView({ card, selected, disabled, onClick }: Props) {
  const definition = getCardDefinition(card.definitionId);
  return (
    <button className={`card ${selected ? "selected" : ""}`} disabled={disabled} onClick={onClick} title={definition.effectsText}>
      <span className="cost">{card.currentCost ?? "?"}</span>
      <strong>{definition.name}</strong>
      <small>{definition.subtype.join(" · ") || definition.cardType}</small>
      {definition.cardType === "MINION" && <span className="stats">{card.currentAttack ?? "?"} / {card.currentHealth ?? "?"}</span>}
      <small>{card.keywords.join(" · ") || "—"}</small>
      {Object.keys(card.counters).length > 0 && <small>{Object.entries(card.counters).map(([key, value]) => `${key} ${value}`).join(" · ")}</small>}
      <span className="effect">{definition.effectsText || "无卡牌效果"}</span>
    </button>
  );
}
