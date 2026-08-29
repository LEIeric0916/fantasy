import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { chooseAiAction, type AiDifficulty } from "../game/ai/aiPolicy";
import { getActingPlayerId } from "../game/ai/legalActionEngine";
import { cardDefinitions, getCardDefinition, isCardImplemented } from "../game/cards/cardRegistry";
import { getCardKeywordText } from "../game/cards/keywordText";
import type { CardInstance, PlayerId } from "../game/cards/cardTypes";
import { getLegalAttackTargets } from "../game/engine/combatEngine";
import { refreshHandCosts } from "../game/engine/costEngine";
import { applyAction, type GameAction } from "../game/engine/gameEngine";
import type { GameState } from "../game/state/GameState";
import { CardView } from "./CardView";

const AI_ACTION_DELAY_MS = 2_000;
const ACTION_ANIMATION_MS = 900;

type ActionAnimation = {
  key: number;
  type: "PLAY" | "ATTACK";
  playerId: PlayerId;
  label: string;
  from: { x: number; y: number };
  to: { x: number; y: number };
};

type ActionAnimationLabel = Omit<ActionAnimation, "key" | "from" | "to">;

function opponentOf(playerId: PlayerId): PlayerId {
  return playerId === "P1" ? "P2" : "P1";
}

export function formatLogMessage(message: string): string {
  return cardDefinitions.reduce((formatted, definition) => formatted.replaceAll(definition.id, definition.name), message);
}

export function describeAiAction(state: GameState, action: GameAction): string {
  if (action.type === "PLAY_CARD" || action.type === "PLAY_ALTERNATE") {
    const card = state.players[action.playerId].hand.find((candidate) => candidate.instanceId === action.instanceId);
    const name = card ? getCardDefinition(card.definitionId).name : "未知卡牌";
    if (action.type === "PLAY_ALTERNATE") return `${action.playerId} AI 使用「${name}」的轉費效果`;
    const type = card ? getCardDefinition(card.definitionId).cardType : undefined;
    return type === "SPELL" ? `${action.playerId} AI 施放法術「${name}」` : `${action.playerId} AI 打出「${name}」`;
  }
  if (action.type === "ACTIVATE_FIELD") {
    const card = state.players[action.playerId].fields.find((candidate) => candidate.instanceId === action.instanceId);
    return `${action.playerId} AI 發動「${card ? getCardDefinition(card.definitionId).name : "立場"}」`;
  }
  if (action.type === "ATTACK") return `${action.playerId} AI 發動攻擊`;
  if (action.type === "END_TURN") return `${action.playerId} AI 結束回合`;
  return `${action.playerId} AI 正在處理效果`;
}

function describeActionAnimation(state: GameState, action: GameAction): ActionAnimationLabel | undefined {
  if (action.type === "PLAY_CARD" || action.type === "PLAY_ALTERNATE") {
    const card = state.players[action.playerId].hand.find((candidate) => candidate.instanceId === action.instanceId);
    const name = card ? getCardDefinition(card.definitionId).name : "未知卡牌";
    return { type: "PLAY", playerId: action.playerId, label: name };
  }
  if (action.type === "ATTACK") {
    const attacker = state.players[action.playerId].minions.find((candidate) => candidate.instanceId === action.attackerId);
    const attackerName = attacker ? getCardDefinition(attacker.definitionId).name : "手下";
    let targetName: string;
    if (action.target.type === "HERO") {
      targetName = `${action.target.playerId} 玩家`;
    } else {
      const targetInstanceId = action.target.instanceId;
      const target = (["P1", "P2"] as const).flatMap((playerId) => state.players[playerId].minions).find((candidate) => candidate.instanceId === targetInstanceId);
      targetName = target ? getCardDefinition(target.definitionId).name : "目標";
    }
    return { type: "ATTACK", playerId: action.playerId, label: `${attackerName} → ${targetName}` };
  }
  return undefined;
}

interface Props {
  initialState: GameState;
  onRestart: () => void;
  aiPlayerId?: PlayerId;
  aiDifficulty?: AiDifficulty;
  aiPlayers?: Partial<Record<PlayerId, AiDifficulty>>;
  spectatorViewMode?: "FOLLOW_ACTION" | "FIXED";
}

export function GameBoard({ initialState, onRestart, aiPlayerId, aiDifficulty = "RANDOM", aiPlayers, spectatorViewMode = "FOLLOW_ACTION" }: Props) {
  const [state, setState] = useState(() => {
    const readyState = structuredClone(initialState);
    refreshHandCosts(readyState);
    return readyState;
  });
  const [message, setMessage] = useState("");
  const [aiAnnouncement, setAiAnnouncement] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [attackerId, setAttackerId] = useState<string>();
  const [inspectedCard, setInspectedCard] = useState<CardInstance>();
  const [viewedGraveyardPlayerId, setViewedGraveyardPlayerId] = useState<PlayerId>();
  const [privacyGate, setPrivacyGate] = useState(false);
  const [aiPaused, setAiPaused] = useState(false);
  const [fixedSpectatorPlayerId, setFixedSpectatorPlayerId] = useState<PlayerId>("P1");
  const [draggedHandCardId, setDraggedHandCardId] = useState<string>();
  const [actionAnimation, setActionAnimation] = useState<ActionAnimation>();
  const aiSeed = useRef((initialState.rngSeed ^ 0xa17a17) >>> 0);
  const aiStepCount = useRef(0);
  const actingPlayerId = getActingPlayerId(state);
  const aiDifficulties: Partial<Record<PlayerId, AiDifficulty>> = aiPlayers ?? (aiPlayerId ? { [aiPlayerId]: aiDifficulty } : {});
  const actingAiDifficulty = actingPlayerId ? aiDifficulties[actingPlayerId] : undefined;
  const aiActing = Boolean(actingPlayerId && actingAiDifficulty);
  const aiVsAi = Boolean(aiDifficulties.P1 && aiDifficulties.P2);
  const fixedSpectatorView = aiVsAi && spectatorViewMode === "FIXED";
  const perspectivePlayerId: PlayerId = aiVsAi
    ? fixedSpectatorView ? fixedSpectatorPlayerId : (actingPlayerId ?? state.activePlayerId)
    : aiPlayerId
      ? (aiPlayerId === "P1" ? "P2" : "P1")
      : state.activePlayerId;
  const active = state.players[perspectivePlayerId];
  const opponentId: PlayerId = perspectivePlayerId === "P1" ? "P2" : "P1";
  const opponent = state.players[opponentId];
  const activeFieldSlots = state.rulesConfig.fieldLimits[active.faction] ?? 7;
  const opponentFieldSlots = state.rulesConfig.fieldLimits[opponent.faction] ?? 7;
  const allCards = useMemo(() => (["P1", "P2"] as const).flatMap((playerId) => {
    const player = state.players[playerId];
    return [...player.deck, ...player.hand, ...player.minions, ...player.fields, ...player.graveyard, ...player.removed, ...player.extraDeck];
  }), [state]);
  const cardName = (instanceId: string) => {
    const card = allCards.find((candidate) => candidate.instanceId === instanceId);
    return card ? getCardDefinition(card.definitionId).name : "未知卡牌";
  };
  const legalTargets = useMemo(() => attackerId ? getLegalAttackTargets(state, attackerId) : [], [state, attackerId]);

  function centerOfElement(element: Element | null): { x: number; y: number } | undefined {
    if (!element) return undefined;
    const rect = element.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  }

  function centerOfSelector(selector: string): { x: number; y: number } | undefined {
    return centerOfElement(document.querySelector(selector));
  }

  function playerSideSelector(playerId: PlayerId): ".active-side" | ".opponent-side" {
    return playerId === perspectivePlayerId ? ".active-side" : ".opponent-side";
  }

  function fallbackCenter(playerId: PlayerId): { x: number; y: number } {
    return centerOfSelector(playerSideSelector(playerId)) ?? { x: window.innerWidth / 2, y: window.innerHeight / 2 };
  }

  function actionEndpoints(action: GameAction): { from: { x: number; y: number }; to: { x: number; y: number } } | undefined {
    if (action.type === "PLAY_CARD" || action.type === "PLAY_ALTERNATE") {
      const card = state.players[action.playerId].hand.find((candidate) => candidate.instanceId === action.instanceId);
      const definition = card ? getCardDefinition(card.definitionId) : undefined;
      const side = playerSideSelector(action.playerId);
      const zoneSelector = definition?.cardType === "FIELD" ? `${side} .field-zone` : definition?.cardType === "MINION" ? `${side} .minion-zone` : side;
      return {
        from: centerOfSelector(`[data-instance-id="${action.instanceId}"]`) ?? fallbackCenter(action.playerId),
        to: centerOfSelector(zoneSelector) ?? fallbackCenter(action.playerId),
      };
    }
    if (action.type === "ATTACK") {
      const from = centerOfSelector(`[data-instance-id="${action.attackerId}"]`) ?? fallbackCenter(action.playerId);
      if (action.target.type === "HERO") {
        return { from, to: centerOfSelector(`${playerSideSelector(action.target.playerId)} .player-panel`) ?? fallbackCenter(action.target.playerId) };
      }
      return { from, to: centerOfSelector(`[data-instance-id="${action.target.instanceId}"]`) ?? fallbackCenter(opponentOf(action.playerId)) };
    }
    return undefined;
  }

  function showActionAnimation(action: GameAction) {
    const label = describeActionAnimation(state, action);
    const endpoints = actionEndpoints(action);
    if (label && endpoints) setActionAnimation({ ...label, ...endpoints, key: Date.now() });
  }

  useEffect(() => {
    if (!actionAnimation) return;
    const timer = window.setTimeout(() => setActionAnimation(undefined), ACTION_ANIMATION_MS);
    return () => window.clearTimeout(timer);
  }, [actionAnimation]);

  useEffect(() => {
    if (aiPaused || !actingPlayerId || !actingAiDifficulty || !aiActing || state.phase === "GAME_OVER") return;
    const timer = window.setTimeout(() => {
      if (aiStepCount.current >= 5000) {
        setMessage("AI_ERROR：AI 對局超過安全行動上限，已停止自動操作");
        return;
      }
      const decision = chooseAiAction(state, actingPlayerId, aiSeed.current, actingAiDifficulty);
      aiSeed.current = decision.seed;
      if (!decision.action) {
        setMessage("AI_ERROR：AI 目前沒有合法行動");
        return;
      }
      const result = applyAction(state, decision.action);
      if (result.error) {
        setMessage(`AI_${result.error.code}：${result.error.message}`);
        return;
      }
      aiStepCount.current += 1;
      setAiAnnouncement(describeAiAction(state, decision.action));
      showActionAnimation(decision.action);
      setSelected([]);
      setAttackerId(undefined);
      setMessage("");
      setState(result.state);
    }, AI_ACTION_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [actingAiDifficulty, actingPlayerId, aiActing, aiPaused, state]);

  function canPlay(card: CardInstance): boolean {
    if (aiActing || state.activePlayerId !== active.id || state.phase !== "MAIN" || state.pendingChoice || card.currentCost === null || card.currentCost > active.mana) return false;
    const definition = getCardDefinition(card.definitionId);
    if (!isCardImplemented(definition)) return false;
    if (definition.cardType === "MINION" && active.minions.length >= state.rulesConfig.minionLimit) return false;
    if (definition.cardType === "FIELD") {
      const limit = state.rulesConfig.fieldLimits[active.faction];
      if (limit !== null && limit !== undefined && active.fields.length >= limit) return false;
    }
    return true;
  }

  function canUseAlternate(card: CardInstance): boolean {
    const alternate = getCardDefinition(card.definitionId).alternatePlay;
    return Boolean(!aiActing && state.activePlayerId === active.id && state.phase === "MAIN" && !state.pendingChoice && alternate && active.mana >= alternate.cost);
  }

  function canActivateField(card: CardInstance): boolean {
    if (aiActing || state.activePlayerId !== active.id || state.phase !== "MAIN" || state.pendingChoice || card.sealed) return false;
    const activated = getCardDefinition(card.definitionId).activatedEffect;
    if (!activated) return false;
    const available = activated.resource === "NECROMANCY"
      ? active.resources.necromancy
      : active.resources.recycleCharge;
    return available >= activated.cost;
  }

  function canAttack(card: CardInstance): boolean {
    return !aiActing && !state.pendingChoice && getLegalAttackTargets(state, card.instanceId).length > 0;
  }

  function playDraggedHandCard() {
    if (!draggedHandCardId) return;
    const card = active.hand.find((candidate) => candidate.instanceId === draggedHandCardId);
    setDraggedHandCardId(undefined);
    if (!card) return;
    if (canPlay(card)) {
      dispatch({ type: "PLAY_CARD", playerId: active.id, instanceId: card.instanceId });
      return;
    }
    if (canUseAlternate(card)) dispatch({ type: "PLAY_ALTERNATE", playerId: active.id, instanceId: card.instanceId });
  }

  function dispatch(action: GameAction, gateAfter = false) {
    const result = applyAction(state, action);
    const activePlayerChanged = result.state.activePlayerId !== state.activePlayerId;
    setState(result.state);
    setMessage(result.error ? `${result.error.code}：${result.error.message}` : "");
    setAiAnnouncement("");
    if (!result.error) {
      showActionAnimation(action);
      setSelected([]);
      setAttackerId(undefined);
      if (Object.keys(aiDifficulties).length === 0 && (gateAfter || activePlayerChanged)) setPrivacyGate(true);
    }
  }

  const mulliganPlayer: PlayerId = !state.players.P1.mulliganDone ? "P1" : "P2";
  const toggleFixedSpectator = () => setFixedSpectatorPlayerId((playerId) => playerId === "P1" ? "P2" : "P1");
  if (state.phase === "MULLIGAN" && aiActing) {
    return <main className="privacy">
      <h1>{aiPaused ? "AI 已暫停" : "AI 正在選擇起始手牌"}</h1>
      <p>{actingAiDifficulty === "RANDOM" ? "簡單" : actingAiDifficulty === "HEURISTIC" ? "普通" : "困難"} AI · {actingPlayerId}</p>
      {fixedSpectatorView && <p>目前固定視角：{fixedSpectatorPlayerId}</p>}
      {fixedSpectatorView && <button className="quiet" onClick={toggleFixedSpectator}>切換到{fixedSpectatorPlayerId === "P1" ? "P2" : "P1"}視角</button>}
      <button onClick={() => setAiPaused((paused) => !paused)}>{aiPaused ? "開始AI" : "暫停AI"}</button>
    </main>;
  }
  if (privacyGate) {
    return <main className="privacy"><h1>請交給 {state.phase === "MULLIGAN" ? mulliganPlayer : state.activePlayerId}</h1><button onClick={() => setPrivacyGate(false)}>已交接，顯示畫面</button></main>;
  }

  if (state.phase === "MULLIGAN") {
    const player = state.players[mulliganPlayer];
    return (
      <main className="mulligan-screen">
        <header><div><p className="eyebrow">MULLIGAN · {mulliganPlayer}</p><h1>選擇要更換的起始手牌</h1></div><button className="quiet" onClick={onRestart}>重新設定</button></header>
        <p className="notice">先抽取等量替換牌，再把換出的 0～4 張加入牌庫並洗牌。</p>
        <section className="hand open">{player.hand.map((card) => <CardView key={card.instanceId} card={card} selected={selected.includes(card.instanceId)} onInspect={() => setInspectedCard(card)} onClick={() => setSelected((items) => items.includes(card.instanceId) ? items.filter((id) => id !== card.instanceId) : [...items, card.instanceId])} />)}</section>
        {message && <p className="error">{message}</p>}
        <button onClick={() => dispatch({ type: "MULLIGAN", playerId: mulliganPlayer, instanceIds: selected }, true)}>確認換牌（{selected.length}）</button>
        {inspectedCard && <CardDetailModal card={inspectedCard} onClose={() => setInspectedCard(undefined)} />}
      </main>
    );
  }

  function isLegalMinion(id: string) { return legalTargets.some((target) => target.type === "MINION" && target.instanceId === id); }
  const heroLegal = legalTargets.some((target) => target.type === "HERO" && target.playerId === opponentId);
  const handLimitChoice = !aiActing && state.pendingChoice?.type === "HAND_LIMIT" ? state.pendingChoice : undefined;
  const handLimit = Boolean(handLimitChoice);
  const orderChoice = !aiActing && (state.pendingChoice?.type === "TRIGGER_ORDER" || state.pendingChoice?.type === "COUNTDOWN_ORDER")
    ? state.pendingChoice
    : undefined;
  const effectChoice = !aiActing && state.pendingChoice?.type === "EFFECT_CARDS" ? state.pendingChoice : undefined;
  const optionChoice = !aiActing && state.pendingChoice?.type === "EFFECT_OPTION" ? state.pendingChoice : undefined;
  const effectSummonConfirm = !aiActing && state.pendingChoice?.type === "EFFECT_SUMMON_CONFIRM" ? state.pendingChoice : undefined;
  const actionLineStyle: CSSProperties | undefined = actionAnimation ? {
    left: actionAnimation.from.x,
    top: actionAnimation.from.y,
    width: Math.hypot(actionAnimation.to.x - actionAnimation.from.x, actionAnimation.to.y - actionAnimation.from.y),
    transform: `rotate(${Math.atan2(actionAnimation.to.y - actionAnimation.from.y, actionAnimation.to.x - actionAnimation.from.x)}rad)`,
  } : undefined;
  const actionLabelStyle: CSSProperties | undefined = actionAnimation ? {
    left: (actionAnimation.from.x + actionAnimation.to.x) / 2,
    top: (actionAnimation.from.y + actionAnimation.to.y) / 2,
  } : undefined;

  return (
    <main className="game-board">
      <header className="game-header">
        <div><p className="eyebrow">TURN {state.turnNumber} · {state.phase}</p><h1>戰記 <span>規則驗證臺</span></h1></div>
        <div className="actions"><button className="quiet" onClick={onRestart}>重新開始</button>{fixedSpectatorView && <button className="quiet" onClick={toggleFixedSpectator}>切換到{fixedSpectatorPlayerId === "P1" ? "P2" : "P1"}視角</button>}{Object.keys(aiDifficulties).length > 0 && <button className="quiet" onClick={() => setAiPaused((paused) => !paused)}>{aiPaused ? "開始AI" : "暫停AI"}</button>}{fixedSpectatorView && <span className="ai-thinking">固定視角：{fixedSpectatorPlayerId}</span>}{aiActing && <span className="ai-thinking">{aiPaused ? "AI 已暫停" : "AI 思考中…"}</span>}{!aiActing && state.activePlayerId === active.id && state.phase === "MAIN" && !state.pendingChoice && <button onClick={() => dispatch({ type: "END_TURN", playerId: active.id })}>結束回合</button>}</div>
      </header>
      {actionAnimation && <div className={`action-animation ${actionAnimation.type === "PLAY" ? "play-animation" : "attack-animation"}`} role="status" aria-live="polite">
        <span className="action-trajectory" style={actionLineStyle} aria-hidden="true"><i /></span>
        <span className="action-card-label" style={actionLabelStyle}>{actionAnimation.playerId} · {actionAnimation.label}</span>
      </div>}
      {aiAnnouncement && <p className="ai-action-notice" role="status" aria-live="polite">{aiAnnouncement}</p>}
      {state.phase === "GAME_OVER" && <section className="result"><strong>{state.winner} 獲勝</strong><span>{state.loseReason}</span></section>}
      {message && <p className="error">{message}</p>}
      {state.effectNotices.length > 0 && <section className="effect-notices" role="status" aria-live="polite">
        <strong>效果未發動</strong>
        {state.effectNotices.map((notice) => <p key={`${notice.id}-${notice.sourceInstanceId}`}><b>{notice.sourceName}</b>：{notice.reason}</p>)}
      </section>}
      {orderChoice && <section className="notice">
        <strong>選擇同一時機的處理順序</strong>
        <p>依次點擊來源；同批次新生成的卡不進入本次合法目標范圍。</p>
        <p>目前順序：{selected.map(cardName).join(" → ") || "尚未選擇"}</p>
        {orderChoice.instanceIds.filter((id) => !selected.includes(id)).map((id) => {
          const card = allCards.find((candidate) => candidate.instanceId === id);
          return <span className="choice-card-option" key={id}><button onClick={() => setSelected((items) => [...items, id])}>{cardName(id)}</button>{card && <button className="quiet" onClick={() => setInspectedCard(card)}>詳細</button>}</span>;
        })}
        <button disabled={selected.length !== orderChoice.instanceIds.length} onClick={() => dispatch({
          type: orderChoice.type === "TRIGGER_ORDER" ? "SELECT_TRIGGER_ORDER" : "SELECT_COUNTDOWN_ORDER",
          playerId: orderChoice.playerId,
          instanceIds: selected,
        })}>確認順序</button>
      </section>}
      {effectChoice && <section className="notice">
        <strong>{effectChoice.prompt}</strong>
        <p>已選擇 {selected.length}/{effectChoice.count}；{effectChoice.minCount === 0 ? "可選擇0張。" : "同一次指定不可重復選擇同一卡牌實例。"}</p>
        {effectChoice.candidateInstanceIds.map((id) => {
          const card = allCards.find((candidate) => candidate.instanceId === id);
          const chosen = selected.includes(id);
          return <span className="choice-card-option" key={id}><button className={chosen ? "selected" : "quiet"} onClick={() => setSelected((items) => chosen ? items.filter((item) => item !== id) : items.length < effectChoice.count ? [...items, id] : items)}>{card ? getCardDefinition(card.definitionId).name : "未知卡牌"}</button>{card && <button className="quiet" onClick={() => setInspectedCard(card)}>詳細</button>}</span>;
        })}
        <button disabled={selected.length < (effectChoice.minCount ?? effectChoice.count) || selected.length > effectChoice.count} onClick={() => dispatch({ type: "SELECT_EFFECT_CARDS", playerId: effectChoice.playerId, instanceIds: selected })}>確認指定</button>
      </section>}
      {optionChoice && <section className="notice">
        <strong>{optionChoice.prompt}</strong>
        <p>選擇畫面已經按當前條件顯示最終數值。</p>
        {optionChoice.options.map((option) => <button key={option.id} onClick={() => dispatch({ type: "SELECT_EFFECT_OPTION", playerId: optionChoice.playerId, optionId: option.id })}>{option.label}</button>)}
      </section>}
      {effectSummonConfirm && <section className="notice effect-summon-confirm">
        <strong>效果召喚即將發動</strong>
        <p><b>{cardName(effectSummonConfirm.sourceInstanceId)}</b> 已達成條件，確認後將從手牌召喚到場上並繼續結算。</p>
        <button onClick={() => dispatch({ type: "CONFIRM_EFFECT_SUMMON", playerId: effectSummonConfirm.playerId })}>確認召喚</button>
        {allCards.find((card) => card.instanceId === effectSummonConfirm.sourceInstanceId) && <button className="quiet" onClick={() => setInspectedCard(allCards.find((card) => card.instanceId === effectSummonConfirm.sourceInstanceId))}>查看卡牌</button>}
      </section>}

      <section className="battlefield" aria-label="完整對戰區域">
        {attackerId && <div className="attack-drag-indicator" role="status" aria-live="polite"><span aria-hidden="true">➤</span><b>拖曳至攻擊目標</b></div>}
        <div className="board-side opponent-side">
          <section
            className={`player-panel hero-drop-zone ${heroLegal ? "legal" : ""}`}
            onDragOver={(event) => { if (heroLegal) event.preventDefault(); }}
            onDrop={(event) => {
              event.preventDefault();
              if (attackerId && heroLegal) dispatch({ type: "ATTACK", playerId: state.activePlayerId, attackerId, target: { type: "HERO", playerId: opponentId } });
            }}
            onClick={() => attackerId && heroLegal && dispatch({ type: "ATTACK", playerId: state.activePlayerId, attackerId, target: { type: "HERO", playerId: opponentId } })}
          >
            <div className="player-identity"><small>對手玩家</small><strong>{opponentId}</strong><span> · {opponent.faction}</span></div>
            <div className="hero-resource-row"><span className={`hero-health ${opponent.heroHp <= 10 ? "critical" : ""}`} data-testid={`player-health-${opponentId}`}><small>生命</small><b>{opponent.heroHp}</b><small>/{opponent.heroMaxHp}</small></span><span className="mana-display"><small>水晶</small><b>{opponent.mana}<i>/</i>{opponent.maxMana}</b><em>上限 {state.rulesConfig.normalMaxMana}</em></span></div>
            <div className="player-stats"><span><small>手牌</small><b>{opponent.hand.length}</b></span><span><small>牌庫</small><b>{opponent.deck.length}</b></span><button className="zone-count" onClick={() => setViewedGraveyardPlayerId(opponentId)}><small>棄堆</small><b>{opponent.graveyard.length}</b></button><span className="special-record"><small>{specialRecord(opponent).label}</small><b>{specialRecord(opponent).value}</b></span></div>
          </section>
          <Zone compact kind="FIELD" slotCount={opponentFieldSlots} title={`對手立場區 · ${opponentFieldSlots} 格`} cards={opponent.fields} onInspect={setInspectedCard} />
          <Zone
            compact
            title="對手手下區 · 7 格"
            cards={opponent.minions}
            legal={isLegalMinion}
            dropTarget={isLegalMinion}
            onInspect={setInspectedCard}
            onCard={(id) => attackerId && isLegalMinion(id) && dispatch({ type: "ATTACK", playerId: state.activePlayerId, attackerId, target: { type: "MINION", instanceId: id } })}
            onDropCard={(id) => attackerId && isLegalMinion(id) && dispatch({ type: "ATTACK", playerId: state.activePlayerId, attackerId, target: { type: "MINION", instanceId: id } })}
          />
        </div>
        <div className="board-divider"><span>拖曳可行動手下至敵方手下或玩家區域以攻擊</span></div>
        <div
          className={`board-side active-side ${draggedHandCardId ? "hand-play-drop-zone" : ""}`}
          onDragOver={(event) => {
            if (!draggedHandCardId) return;
            event.preventDefault();
            event.dataTransfer.dropEffect = "move";
          }}
          onDrop={(event) => {
            if (!draggedHandCardId) return;
            event.preventDefault();
            playDraggedHandCard();
          }}
        >
          <Zone
            compact
            title="我方手下區 · 7 格"
            cards={active.minions}
            selected={(id) => id === attackerId}
            actionable={(id) => canAttack(active.minions.find((card) => card.instanceId === id)!)}
            draggable={(id) => canAttack(active.minions.find((card) => card.instanceId === id)!)}
            onInspect={setInspectedCard}
            onDragStart={setAttackerId}
            onDragEnd={() => setAttackerId(undefined)}
            onCard={(id) => { if (!aiActing && state.activePlayerId === active.id && canAttack(active.minions.find((card) => card.instanceId === id)!)) setAttackerId(id === attackerId ? undefined : id); }}
          />
          <Zone compact kind="FIELD" slotCount={activeFieldSlots} title={`我方立場區 · ${activeFieldSlots} 格`} cards={active.fields} onInspect={setInspectedCard} />
          <section className="player-panel">
            <div className="player-identity"><small>目前玩家</small><strong>{active.id}</strong><span> · {active.faction}</span></div>
            <div className="hero-resource-row"><span className={`hero-health ${active.heroHp <= 10 ? "critical" : ""}`} data-testid={`player-health-${active.id}`}><small>生命</small><b>{active.heroHp}</b><small>/{active.heroMaxHp}</small></span><span className="mana-display"><small>水晶</small><b>{active.mana}<i>/</i>{active.maxMana}</b><em>上限 {state.rulesConfig.normalMaxMana}</em></span></div>
            <div className="player-stats"><span><small>手牌</small><b>{active.hand.length}</b></span><span><small>牌庫</small><b>{active.deck.length}</b></span><button className="zone-count" onClick={() => setViewedGraveyardPlayerId(active.id)}><small>棄堆</small><b>{active.graveyard.length}</b></button><span className="special-record"><small>{specialRecord(active).label}</small><b>{specialRecord(active).value}</b></span></div>
          </section>
        </div>
      </section>

      <section className="hand-panel">
        <h2>我方手牌 <small>{active.hand.length} 張</small><span>拖曳發光手牌到我方場地即可出牌；點擊卡牌只會查看詳細</span></h2>
        <section className="hand">{active.hand.map((card) => <CardView
          key={card.instanceId}
          card={card}
          handSummary
          selected={selected.includes(card.instanceId)}
          playable={canPlay(card) || canUseAlternate(card)}
          draggable={!handLimit && (canPlay(card) || canUseAlternate(card))}
          onInspect={() => setInspectedCard(card)}
          onDragStart={() => setDraggedHandCardId(card.instanceId)}
          onDragEnd={() => setDraggedHandCardId(undefined)}
          onClick={() => handLimit ? setSelected((items) => items.includes(card.instanceId) ? items.filter((id) => id !== card.instanceId) : [...items, card.instanceId]) : setInspectedCard(card)}
        />)}</section>
      </section>
      {!state.pendingChoice && state.phase === "MAIN" && active.hand.some(canUseAlternate) && <section className="actions">
        {active.hand.filter(canUseAlternate).map((card) => {
          const definition = getCardDefinition(card.definitionId);
          return <button className="quiet" key={card.instanceId} onClick={() => dispatch({ type: "PLAY_ALTERNATE", playerId: active.id, instanceId: card.instanceId })}>轉費 {definition.alternatePlay!.cost}：{definition.name}</button>;
        })}
      </section>}
      {handLimitChoice && <button onClick={() => dispatch({ type: "SELECT_DISCARD", playerId: active.id, instanceIds: selected }, true)}>確認棄牌（需 {handLimitChoice.count} 張）</button>}

      <section className="utility-bar">
        {active.fields.filter(canActivateField).map((card) => {
          const definition = getCardDefinition(card.definitionId);
          const activated = definition.activatedEffect!;
          const resourceName = activated.resource === "NECROMANCY" ? "死靈術" : "機械術";
          return <button className="quiet field-action" key={card.instanceId} onClick={() => dispatch({ type: "ACTIVATE_FIELD", playerId: active.id, instanceId: card.instanceId })}>發動 {definition.name}（{resourceName} {activated.cost}）</button>;
        })}
        <details className="log"><summary>Game Log · {state.log.length}</summary>{[...state.log].reverse().map((entry) => <div key={entry.index}><time>#{entry.index} T{entry.turn}</time><strong>{entry.type}</strong><span>{formatLogMessage(entry.message)}</span></div>)}</details>
        <details><summary>Zone 檢視</summary><pre>{JSON.stringify({ active: { graveyard: active.graveyard.map((c) => c.definitionId), removed: active.removed.map((c) => c.definitionId), extraDeck: active.extraDeck.map((c) => c.definitionId) }, opponent: { graveyard: opponent.graveyard.map((c) => c.definitionId), removed: opponent.removed.map((c) => c.definitionId), extraDeck: opponent.extraDeck.map((c) => c.definitionId) } }, null, 2)}</pre></details>
        {state.phase === "MAIN" && <details className="debug"><summary>Debug 召喚</summary><p>序列化 Debug Action，僅用於驗證召喚、戰斗及關鍵詞。</p><button onClick={() => dispatch({ type: "DEBUG_SUMMON", playerId: active.id, definitionId: "TOKEN_DRAGON_HELLFIRE" })}>我方：地獄炎龍</button><button onClick={() => dispatch({ type: "DEBUG_SUMMON", playerId: active.id, definitionId: "TOKEN_UNDEAD_SPIRIT" })}>我方：不朽者之靈</button><button onClick={() => dispatch({ type: "DEBUG_SUMMON", playerId: opponentId, definitionId: "TOKEN_ALLIANCE_ROYAL_WARRIOR" })}>對手：皇家戰士</button></details>}
      </section>
      {inspectedCard && <CardDetailModal card={inspectedCard} onClose={() => setInspectedCard(undefined)} />}
      {viewedGraveyardPlayerId && <GraveyardModal playerId={viewedGraveyardPlayerId} cards={state.players[viewedGraveyardPlayerId].graveyard} onInspect={(card) => { setViewedGraveyardPlayerId(undefined); setInspectedCard(card); }} onClose={() => setViewedGraveyardPlayerId(undefined)} />}
    </main>
  );
}

interface ZoneProps {
  title: string;
  cards: GameState["players"][PlayerId]["minions"];
  compact?: boolean;
  kind?: "MINION" | "FIELD";
  slotCount?: number;
  legal?: (id: string) => boolean;
  selected?: (id: string) => boolean;
  actionable?: (id: string) => boolean;
  draggable?: (id: string) => boolean;
  dropTarget?: (id: string) => boolean;
  onCard?: (id: string) => void;
  onInspect?: (card: CardInstance) => void;
  onDragStart?: (id: string) => void;
  onDragEnd?: () => void;
  onDropCard?: (id: string) => void;
}

function Zone({ title, cards, compact, kind = "MINION", slotCount = 7, legal, selected, actionable, draggable, dropTarget, onCard, onInspect, onDragStart, onDragEnd, onDropCard }: ZoneProps) {
  const columns = `repeat(${slotCount}, minmax(0, 1fr))`;
  const leadingSlots = Math.floor(Math.max(0, slotCount - cards.length) / 2);
  const trailingSlots = Math.max(0, slotCount - cards.length - leadingSlots);
  return <section className={`${compact ? "compact-zone" : ""} ${kind === "FIELD" ? "field-zone" : "minion-zone"}`}><h2>{title} <small>{cards.length}</small></h2><div className="zone" style={{ gridTemplateColumns: columns }}>{Array.from({ length: leadingSlots }, (_, index) => <span className="slot" data-position="leading" key={`leading-${index}`} />)}{cards.map((card) => <CardView
    key={card.instanceId}
    card={card}
    entering={kind === "MINION"}
    selected={selected?.(card.instanceId)}
    actionable={actionable?.(card.instanceId)}
    draggable={draggable?.(card.instanceId)}
    dropTarget={dropTarget?.(card.instanceId)}
    disabled={Boolean(legal && !legal(card.instanceId))}
    onClick={() => onCard?.(card.instanceId)}
    onInspect={() => onInspect?.(card)}
    onDragStart={() => onDragStart?.(card.instanceId)}
    onDragEnd={onDragEnd}
    onDrop={() => onDropCard?.(card.instanceId)}
  />)}{Array.from({ length: trailingSlots }, (_, index) => <span className="slot" data-position="trailing" key={`trailing-${index}`} />)}</div></section>;
}

function specialRecord(player: GameState["players"][PlayerId]): { label: string; value: number | string } {
  if (player.faction === "UNDEAD") return { label: "死靈數", value: player.resources.necromancy };
  if (player.faction === "MACHINE") return { label: "回收充能", value: player.resources.recycleCharge };
  if (player.faction === "ALLIANCE") return { label: "協作數", value: player.summonedThisGame };
  if (player.faction === "DRAGON") return {
    label: "棄堆龍族",
    value: player.graveyard.filter((card) => {
      const definition = getCardDefinition(card.definitionId);
      return definition.cardType === "MINION" && definition.subtype.includes("DRAGON");
    }).length,
  };
  return { label: "特殊紀錄", value: "—" };
}

function GraveyardModal({ playerId, cards, onInspect, onClose }: { playerId: PlayerId; cards: CardInstance[]; onInspect: (card: CardInstance) => void; onClose: () => void }) {
  return <div className="card-modal-backdrop" role="presentation" onClick={onClose}>
    <section className="graveyard-modal" role="dialog" aria-modal="true" aria-label={`${playerId} 棄堆`} onClick={(event) => event.stopPropagation()}>
      <button className="modal-close" onClick={onClose} aria-label="關閉棄堆">×</button>
      <p className="eyebrow">{playerId} · GRAVEYARD</p><h2>棄堆 <small>{cards.length} 張</small></h2>
      {cards.length === 0 ? <p className="empty-zone-message">目前棄堆沒有卡牌。</p> : <div className="graveyard-list">{cards.map((card) => <button className="graveyard-card-row" key={card.instanceId} onClick={() => onInspect(card)}><span>{getCardDefinition(card.definitionId).name}</span><small>{getCardDefinition(card.definitionId).cardType} · 費用 {card.currentCost ?? "?"}</small></button>)}</div>}
    </section>
  </div>;
}

function CardDetailModal({ card, onClose }: { card: CardInstance; onClose: () => void }) {
  const definition = getCardDefinition(card.definitionId);
  const keywordText = getCardKeywordText(card);
  return <div className="card-modal-backdrop" role="presentation" onClick={onClose}>
    <section className="card-modal" role="dialog" aria-modal="true" aria-label={`${definition.name} 卡牌資訊`} onClick={(event) => event.stopPropagation()}>
      <button className="modal-close" onClick={onClose} aria-label="關閉卡牌資訊">×</button>
      <p className="eyebrow">{definition.cardType} · {definition.subtype.join(" · ") || "無種族"}</p>
      <h2>{definition.name}</h2>
      <div className="card-modal-stats">
        <span>費用 <strong>{card.currentCost ?? definition.originalCost ?? "?"}</strong></span>
        {definition.cardType === "MINION" && <><span>攻擊 <strong>{card.currentAttack ?? "?"}</strong></span><span>生命 <strong>{card.currentHealth ?? "?"}</strong></span></>}
      </div>
      {card.counters.plagueMarks !== undefined && <p className="modal-plague-counter">瘟疫標記 <strong>{card.counters.plagueMarks}</strong> / {definition.transformAura?.threshold ?? 6}</p>}
      <div className="card-modal-effect">
        <strong>效果：</strong>
        <div className="effect-keyword-list">
          {card.sealed && <span className="effect-keyword sealed">封印中</span>}
          {card.keywords.map((keyword, index) => <span className={`effect-keyword keyword-${keyword.toLowerCase().replaceAll("_", "-")}`} key={`${keyword}-${index}`}>{keywordText[index].label}</span>)}
        </div>
        {definition.effectsText && <p className="printed-effect">{definition.effectsText}</p>}
        {keywordText.length === 0 && !definition.effectsText && <p>無卡牌效果</p>}
      </div>
    </section>
  </div>;
}
