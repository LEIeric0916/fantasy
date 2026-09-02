import { useEffect, useRef, useState } from "react";
import { getCardDefinition } from "../game/cards/cardRegistry";
import { getCardKeywordText } from "../game/cards/keywordText";
import type { CardInstance } from "../game/cards/cardTypes";

interface Props {
  card: CardInstance;
  selected?: boolean;
  disabled?: boolean;
  playable?: boolean;
  actionable?: boolean;
  dropTarget?: boolean;
  draggable?: boolean;
  handSummary?: boolean;
  entering?: boolean;
  onClick?: () => void;
  onInspect?: () => void;
  onDragStart?: () => void;
  onDragEnd?: () => void;
  onDrop?: () => void;
}

export function CardView({
  card,
  selected,
  disabled,
  playable,
  actionable,
  dropTarget,
  draggable,
  handSummary,
  entering,
  onClick,
  onInspect,
  onDragStart,
  onDragEnd,
  onDrop,
}: Props) {
  const definition = getCardDefinition(card.definitionId);
  const keywordText = getCardKeywordText(card);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const longPressTriggered = useRef(false);
  const previousStats = useRef({ attack: card.currentAttack, health: card.currentHealth });
  const [statChange, setStatChange] = useState<{ attack?: number; health?: number; key: number }>();
  const [entranceActive, setEntranceActive] = useState(Boolean(entering));
  const plagueMarks = card.counters.plagueMarks;
  const plagueThreshold = definition.transformAura?.counter === "plagueMarks" ? definition.transformAura.threshold : 6;
  const boardStatuses = card.zone === "MINION" || card.zone === "FIELD" ? [
    ...(card.sealed ? [{ key: "sealed", label: "封印" }] : []),
    ...(card.keywords.includes("TAUNT") && !card.sealed ? [{ key: "taunt", label: "嘲諷" }] : []),
    ...(card.keywords.includes("DIVINE_SHIELD") && !card.sealed ? [{ key: "divine-shield", label: "聖盾術" }] : []),
    ...(card.keywords.includes("STEALTH") && !card.sealed ? [{ key: "stealth", label: "潛行" }] : []),
    ...(card.keywords.includes("DETERRENCE") && !card.sealed ? [{ key: "deterrence", label: "威懾" }] : []),
    ...(card.keywords.includes("WARD") && !card.sealed ? [{ key: "ward", label: "光紋" }] : []),
    ...(card.keywords.includes("DISCIPLINE") && !card.sealed ? [{ key: "discipline", label: "紀律" }] : []),
    ...(card.keywords.includes("AURA") && !card.sealed ? [{ key: "aura", label: "光環" }] : []),
    ...(card.keywords.includes("SANCTUARY") && !card.sealed ? [{ key: "sanctuary", label: "庇護", description: "不會被卡牌效果直接消滅；仍會受到傷害與消失" }] : []),
    ...(card.keywords.includes("INVINCIBLE") && !card.sealed ? [{ key: "invincible", label: "無敵" }] : []),
    ...(card.counters.damageCap !== undefined ? [{ key: "damage-cap", label: `減傷≤${card.counters.damageCap}` }] : []),
  ] : [];
  const statusClasses = boardStatuses.map((status) => `status-${status.key}`).join(" ");
  const protectionEmblems = card.sealed || (card.zone !== "MINION" && card.zone !== "FIELD") ? [] : [
    ...(card.keywords.includes("TAUNT") ? [{ key: "taunt", label: "嘲諷盾牌" }] : []),
    ...(card.keywords.includes("DISCIPLINE") ? [{ key: "discipline", label: "紀律徽章" }] : []),
    ...(card.keywords.includes("SANCTUARY") ? [{ key: "sanctuary", label: "庇護白盾" }] : []),
  ];
  const isBattleMinion = card.zone === "MINION" && definition.cardType === "MINION";

  useEffect(() => {
    const previous = previousStats.current;
    const attack = card.currentAttack !== null && previous.attack !== null ? card.currentAttack - previous.attack : 0;
    const health = card.currentHealth !== null && previous.health !== null ? card.currentHealth - previous.health : 0;
    previousStats.current = { attack: card.currentAttack, health: card.currentHealth };
    if (!attack && !health) return;
    setStatChange({ attack: attack || undefined, health: health || undefined, key: Date.now() });
    const timer = setTimeout(() => setStatChange(undefined), 950);
    return () => clearTimeout(timer);
  }, [card.currentAttack, card.currentHealth]);

  useEffect(() => {
    if (!entranceActive) return;
    const timer = setTimeout(() => setEntranceActive(false), 720);
    return () => clearTimeout(timer);
  }, [entranceActive]);

  function clearLongPress() {
    if (longPressTimer.current) clearTimeout(longPressTimer.current);
    longPressTimer.current = undefined;
  }

  function startLongPress() {
    if (!onInspect) return;
    clearLongPress();
    longPressTriggered.current = false;
    longPressTimer.current = setTimeout(() => {
      longPressTriggered.current = true;
      onInspect();
    }, 550);
  }

  return (
    <article
      className={`card ${statusClasses} ${protectionEmblems.length ? "has-protection-emblems" : ""} ${handSummary ? "hand-card" : ""} ${entranceActive ? "minion-entering" : ""} ${selected ? "selected" : ""} ${playable ? "playable" : ""} ${actionable ? "actionable" : ""} ${dropTarget ? "drop-target" : ""}`}
      draggable={draggable}
      onDragStart={(event) => {
        clearLongPress();
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", card.instanceId);
        onDragStart?.();
      }}
      onDragEnd={onDragEnd}
      onDragOver={(event) => {
        if (!dropTarget) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
      }}
      onDrop={(event) => {
        if (!dropTarget) return;
        event.preventDefault();
        onDrop?.();
      }}
      data-instance-id={card.instanceId}
      onPointerDown={startLongPress}
      onPointerUp={clearLongPress}
      onPointerCancel={clearLongPress}
      onPointerLeave={clearLongPress}
      onContextMenu={(event) => event.preventDefault()}
    >
      {protectionEmblems.length > 0 && <span className="protection-emblems" aria-label={`防護效果：${protectionEmblems.map((emblem) => emblem.label).join("、")}`}>
        {protectionEmblems.map((emblem) => <span className={`status-emblem ${emblem.key}-emblem`} aria-label={emblem.label} title={emblem.label} key={emblem.key} />)}
      </span>}
      {boardStatuses.length > 0 && <span className="status-strip" aria-label={`狀態：${boardStatuses.map((status) => status.label).join("、")}`}>{boardStatuses.map((status) => <small className={`status-badge ${status.key}`} title={status.description} key={status.key}>{status.label}</small>)}</span>}
      {plagueMarks !== undefined && <span className="counter-badge plague-counter" aria-label={`瘟疫標記 ${plagueMarks}`}><small>瘟疫</small><strong>{plagueMarks}</strong><small>/ {plagueThreshold}</small></span>}
      <button className="card-surface" disabled={disabled} onClick={() => {
        if (longPressTriggered.current) {
          longPressTriggered.current = false;
          return;
        }
        onClick?.();
      }} title={handSummary ? undefined : definition.effectsText}>
        <span className="cost">{card.currentCost ?? "?"}</span>
        <strong>{definition.name}</strong>
        {!handSummary && <small>{definition.subtype.join(" · ") || definition.cardType}</small>}
        {definition.cardType === "MINION" && !isBattleMinion && <span className="stats">{card.currentAttack ?? "?"} / {card.currentHealth ?? "?"}</span>}
        {!handSummary && <small>{keywordText.map((keyword) => keyword.label).join(" · ") || "—"}</small>}
        {!handSummary && card.counters.countdown !== undefined && <small className="countdown-counter">倒數 {card.counters.countdown}</small>}
        {!handSummary && <span className="effect">{definition.effectsText || "無卡牌效果"}</span>}
      </button>
      {isBattleMinion && <span className="battle-stats" aria-label={`攻擊 ${card.currentAttack ?? "未知"}，生命 ${card.currentHealth ?? "未知"}`}>
        <span className="attack-stat"><i aria-hidden="true">⚔</i><b>{card.currentAttack ?? "?"}</b>{statChange?.attack && <em key={`a-${statChange.key}`} className={statChange.attack > 0 ? "positive" : "negative"}>{statChange.attack > 0 ? "+" : ""}{statChange.attack}</em>}</span>
        <span className="health-stat"><i aria-hidden="true">♥</i><b>{card.currentHealth ?? "?"}</b>{statChange?.health && <em key={`h-${statChange.key}`} className={statChange.health > 0 ? "positive" : "negative"}>{statChange.health > 0 ? "+" : ""}{statChange.health}</em>}</span>
      </span>}
      {onInspect && <button className="inspect-card" onClick={onInspect} aria-label={`檢視 ${definition.name} 卡牌資訊`}>詳細</button>}
    </article>
  );
}
