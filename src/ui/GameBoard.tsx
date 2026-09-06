import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { chooseAiAction, type AiDifficulty } from "../game/ai/aiPolicy";
import { getActingPlayerId } from "../game/ai/legalActionEngine";
import { cardDefinitions, getCardDefinition, isCardImplemented } from "../game/cards/cardRegistry";
import { getCardKeywordText } from "../game/cards/keywordText";
import { GlossaryText, KeywordGlossaryButton } from "./GlossaryTerm";
import type { CardInstance, PlayerId } from "../game/cards/cardTypes";
import { getLegalAttackTargets } from "../game/engine/combatEngine";
import { refreshHandCosts } from "../game/engine/costEngine";
import { applyAction, type GameAction } from "../game/engine/gameEngine";
import { getPlayerFieldLimit, playerHasFaction, type GameState, type PlayerState } from "../game/state/GameState";
import { CardView } from "./CardView";
import { cardTypeLabels, factionLabels, formatSubtypeLabels } from "../game/cards/displayLabels";

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

function playerFactionLabel(player: PlayerState): string {
  const factions = player.deckFactions?.length > 1 ? player.deckFactions : [player.faction];
  if (factions.length === 1) return factionLabels[player.faction];
  return factions.map((faction) => factionLabels[faction]).join("＋");
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
  tutorialLevel?: 1 | 2 | 3;
  aiPlayerId?: PlayerId;
  aiDifficulty?: AiDifficulty;
  aiPlayers?: Partial<Record<PlayerId, AiDifficulty>>;
  spectatorViewMode?: "FOLLOW_ACTION" | "FIXED";
}

export function GameBoard({ initialState, onRestart, tutorialLevel, aiPlayerId, aiDifficulty = "RANDOM", aiPlayers, spectatorViewMode = "FOLLOW_ACTION" }: Props) {
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
  const [tutorialStep, setTutorialStep] = useState<number | undefined>(tutorialLevel ? 0 : undefined);
  const aiSeed = useRef((initialState.rngSeed ^ 0xa17a17) >>> 0);
  const aiStepCount = useRef(0);
  const actingPlayerId = getActingPlayerId(state);
  const aiDifficulties: Partial<Record<PlayerId, AiDifficulty>> = aiPlayers ?? (aiPlayerId ? { [aiPlayerId]: aiDifficulty } : {});
  const actingAiDifficulty = actingPlayerId ? aiDifficulties[actingPlayerId] : undefined;
  const aiActing = Boolean(actingPlayerId && actingAiDifficulty);
  const firstTutorial = tutorialLevel === 1;
  const secondTutorial = tutorialLevel === 2;
  const thirdTutorial = tutorialLevel === 3;
  const tutorialMode = firstTutorial || secondTutorial || thirdTutorial;
  const chaosMode = !tutorialMode && Object.values(state.players).some((player) => (player.deckFactions?.length ?? 1) > 1);
  const tutorialInspectDefinitionId = firstTutorial && tutorialStep === 4
    ? "TOKEN_ALLIANCE_ROYAL_GUARD"
    : secondTutorial && tutorialStep === 8
      ? "NEUTRAL_004"
      : secondTutorial && tutorialStep === 20
        ? "NEUTRAL_005"
        : undefined;
  const aiVsAi = Boolean(aiDifficulties.P1 && aiDifficulties.P2);
  const fixedSpectatorView = aiVsAi && spectatorViewMode === "FIXED";
  const perspectivePlayerId: PlayerId = tutorialMode
    ? "P1"
    : aiVsAi
    ? fixedSpectatorView ? fixedSpectatorPlayerId : (actingPlayerId ?? state.activePlayerId)
    : aiPlayerId
      ? (aiPlayerId === "P1" ? "P2" : "P1")
      : state.activePlayerId;
  const active = state.players[perspectivePlayerId];
  const opponentId: PlayerId = perspectivePlayerId === "P1" ? "P2" : "P1";
  const opponent = state.players[opponentId];
  const activeFieldSlots = getPlayerFieldLimit(state, active.id) ?? 7;
  const opponentFieldSlots = getPlayerFieldLimit(state, opponent.id) ?? 7;
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
    if (firstTutorial && tutorialStep !== 6) return false;
    if (secondTutorial) {
      const expectedCardId = tutorialStep === 3 ? "NEUTRAL_002" : tutorialStep === 10 ? "NEUTRAL_004" : tutorialStep === 22 ? "NEUTRAL_005" : undefined;
      if (!expectedCardId || card.definitionId !== expectedCardId) return false;
    }
    if (thirdTutorial) {
      const expectedCardId = tutorialStep === 2 ? "NEUTRAL_001" : tutorialStep === 6 ? "MACHINE_008" : undefined;
      if (!expectedCardId || card.definitionId !== expectedCardId) return false;
    }
    if (aiActing || state.activePlayerId !== active.id || state.phase !== "MAIN" || state.pendingChoice || card.currentCost === null || card.currentCost > active.mana) return false;
    const definition = getCardDefinition(card.definitionId);
    if (!isCardImplemented(definition)) return false;
    if (definition.cardType === "MINION" && active.minions.length >= state.rulesConfig.minionLimit) return false;
    if (definition.cardType === "FIELD") {
      const limit = getPlayerFieldLimit(state, active.id);
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
    if (secondTutorial) {
      const expectedAttackerId = tutorialStep === 12 || tutorialStep === 24
        ? "tutorial-knight-apprentice"
        : tutorialStep === 15
          ? "tutorial-warrior-apprentice"
          : tutorialStep === 23
            ? "tutorial-assassin-apprentice"
            : undefined;
      if (!expectedAttackerId || card.instanceId !== expectedAttackerId) return false;
    }
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
    let nextState = result.state;
    setMessage(result.error ? `${result.error.code}：${result.error.message}` : "");
    setAiAnnouncement("");
    if (!result.error) {
      if (firstTutorial && tutorialStep === 6 && action.type === "PLAY_CARD") {
        const playedCard = state.players[action.playerId].hand.find((card) => card.instanceId === action.instanceId);
        if (playedCard?.definitionId === "TOKEN_ALLIANCE_ROYAL_GUARD") setTutorialStep(7);
      }
      if (secondTutorial && action.type === "PLAY_CARD") {
        const playedCard = state.players[action.playerId].hand.find((card) => card.instanceId === action.instanceId);
        if (tutorialStep === 3 && playedCard?.definitionId === "NEUTRAL_002") setTutorialStep(4);
        if (tutorialStep === 10 && playedCard?.definitionId === "NEUTRAL_004") setTutorialStep(11);
        if (tutorialStep === 22 && playedCard?.definitionId === "NEUTRAL_005") setTutorialStep(23);
      }
      if (secondTutorial && action.type === "ATTACK") {
        if (tutorialStep === 12 && action.attackerId === "tutorial-knight-apprentice") setTutorialStep(13);
        if (tutorialStep === 15 && action.attackerId === "tutorial-warrior-apprentice") setTutorialStep(16);
        if (tutorialStep === 23 && action.attackerId === "tutorial-assassin-apprentice") setTutorialStep(24);
        if (tutorialStep === 24 && action.attackerId === "tutorial-knight-apprentice") setTutorialStep(25);
      }
      if (secondTutorial && action.type === "END_TURN" && tutorialStep === 5) {
        const guard = nextState.players.P2.hand.find((card) => card.definitionId === "NEUTRAL_003");
        const scripted = guard ? applyAction(nextState, { type: "PLAY_CARD", playerId: "P2", instanceId: guard.instanceId }) : undefined;
        if (scripted && !scripted.error) {
          nextState = scripted.state;
          setTutorialStep(6);
        } else {
          setMessage("教學流程錯誤：對手無法打出守備學徒");
        }
      }
      if (secondTutorial && action.type === "END_TURN" && tutorialStep === 16) {
        const knight = nextState.players.P2.hand.find((card) => card.definitionId === "NEUTRAL_004");
        const scripted = knight ? applyAction(nextState, { type: "PLAY_CARD", playerId: "P2", instanceId: knight.instanceId }) : undefined;
        if (scripted && !scripted.error) {
          nextState = scripted.state;
          setTutorialStep(17);
        } else {
          setMessage("教學流程錯誤：對手無法打出騎士學徒");
        }
      }
      if (thirdTutorial && action.type === "PLAY_CARD") {
        const playedCard = state.players[action.playerId].hand.find((card) => card.instanceId === action.instanceId);
        if (tutorialStep === 2 && playedCard?.definitionId === "NEUTRAL_001") setTutorialStep(3);
        if (tutorialStep === 6 && playedCard?.definitionId === "MACHINE_008") setTutorialStep(7);
      }
      showActionAnimation(action);
      setSelected([]);
      setAttackerId(undefined);
      const activePlayerChanged = nextState.activePlayerId !== state.activePlayerId;
      if (!tutorialMode && Object.keys(aiDifficulties).length === 0 && (gateAfter || activePlayerChanged)) setPrivacyGate(true);
    }
    setState(nextState);
  }

  function continueTutorial() {
    if (tutorialStep === undefined || !tutorialLevel) return;
    if (secondTutorial && tutorialStep === 6) {
      const result = applyAction(state, { type: "END_TURN", playerId: "P2" });
      if (result.error) {
        setMessage(`教學流程錯誤：${result.error.message}`);
        return;
      }
      setState(result.state);
      setTutorialStep(7);
      return;
    }
    if (secondTutorial && tutorialStep === 17) {
      const action: GameAction = { type: "ATTACK", playerId: "P2", attackerId: "tutorial-opponent-knight-apprentice", target: { type: "MINION", instanceId: "tutorial-warrior-apprentice" } };
      const result = applyAction(state, action);
      if (result.error) {
        setMessage(`教學流程錯誤：${result.error.message}`);
        return;
      }
      showActionAnimation(action);
      setState(result.state);
      setTutorialStep(18);
      return;
    }
    if (secondTutorial && tutorialStep === 18) {
      const result = applyAction(state, { type: "END_TURN", playerId: "P2" });
      if (result.error) {
        setMessage(`教學流程錯誤：${result.error.message}`);
        return;
      }
      setState(result.state);
      setTutorialStep(19);
      return;
    }
    const finalStep = secondTutorial ? 25 : 8;
    if (tutorialStep === finalStep) onRestart();
    else setTutorialStep(tutorialStep + 1);
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
    <main className={`game-board ${tutorialMode ? `tutorial-board tutorial-level-${tutorialLevel} tutorial-step-${tutorialStep}` : ""}`}>
      <header className="game-header">
        <div><p className="eyebrow">{tutorialMode ? `新手教學 · 第${tutorialLevel === 1 ? "一" : tutorialLevel === 2 ? "二" : "三"}關` : `TURN ${state.turnNumber} · ${state.phase}`}</p><h1>戰記 <span>{firstTutorial ? "怎麼玩遊戲" : secondTutorial ? "手下戰鬥" : thirdTutorial ? "法術與立場" : chaosMode ? "混沌模式" : "規則驗證臺"}</span></h1></div>
        <div className="actions"><button className="quiet" onClick={onRestart}>{tutorialMode ? "離開教學" : "重新開始"}</button>{fixedSpectatorView && <button className="quiet" onClick={toggleFixedSpectator}>切換到{fixedSpectatorPlayerId === "P1" ? "P2" : "P1"}視角</button>}{Object.keys(aiDifficulties).length > 0 && <button className="quiet" onClick={() => setAiPaused((paused) => !paused)}>{aiPaused ? "開始AI" : "暫停AI"}</button>}{fixedSpectatorView && <span className="ai-thinking">固定視角：{fixedSpectatorPlayerId}</span>}{aiActing && <span className="ai-thinking">{aiPaused ? "AI 已暫停" : "AI 思考中…"}</span>}{((!tutorialMode && !aiActing && state.activePlayerId === active.id && state.phase === "MAIN" && !state.pendingChoice) || (secondTutorial && (tutorialStep === 5 || tutorialStep === 16))) && <button className={secondTutorial ? "tutorial-end-turn" : ""} onClick={() => dispatch({ type: "END_TURN", playerId: active.id })}>結束回合</button>}</div>
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
            <div className="player-identity"><small>對手玩家</small><strong>{opponentId}</strong><span> · {playerFactionLabel(opponent)}</span></div>
            <div className="hero-resource-row"><span className={`hero-health ${opponent.heroHp <= 10 ? "critical" : ""}`} data-testid={`player-health-${opponentId}`}><small>生命</small><b>{opponent.heroHp}</b><small>/{opponent.heroMaxHp}</small></span><span className="mana-display"><small>水晶</small><b>{opponent.mana}<i>/</i>{opponent.maxMana}</b><em>上限 {state.rulesConfig.normalMaxMana}</em></span></div>
            <div className="player-stats"><span><small>手牌</small><b>{opponent.hand.length}</b></span><span><small>牌庫</small><b>{opponent.deck.length}</b></span><button className="zone-count" onClick={() => setViewedGraveyardPlayerId(opponentId)}><small>棄堆</small><b>{opponent.graveyard.length}</b></button><span className="special-record-list">{specialRecords(opponent).map((record) => <span className="special-record" key={record.label}><small>{record.label}</small><b>{record.value}</b></span>)}</span></div>
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
            <div className="player-identity"><small>目前玩家</small><strong>{active.id}</strong><span> · {playerFactionLabel(active)}</span></div>
            <div className="hero-resource-row"><span className={`hero-health ${active.heroHp <= 10 ? "critical" : ""}`} data-testid={`player-health-${active.id}`}><small>生命</small><b>{active.heroHp}</b><small>/{active.heroMaxHp}</small></span><span className="mana-display"><small>水晶</small><b>{active.mana}<i>/</i>{active.maxMana}</b><em>上限 {state.rulesConfig.normalMaxMana}</em></span></div>
            <div className="player-stats"><span><small>手牌</small><b>{active.hand.length}</b></span><span><small>牌庫</small><b>{active.deck.length}</b></span><button className="zone-count" onClick={() => setViewedGraveyardPlayerId(active.id)}><small>棄堆</small><b>{active.graveyard.length}</b></button><span className="special-record-list">{specialRecords(active).map((record) => <span className="special-record" key={record.label}><small>{record.label}</small><b>{record.value}</b></span>)}</span></div>
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
          onInspect={() => {
            setInspectedCard(card);
          }}
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
        {!tutorialMode && state.phase === "MAIN" && <details className="debug"><summary>Debug 召喚</summary><p>序列化 Debug Action，僅用於驗證召喚、戰斗及關鍵詞。</p><button onClick={() => dispatch({ type: "DEBUG_SUMMON", playerId: active.id, definitionId: "TOKEN_DRAGON_HELLFIRE" })}>我方：地獄炎龍</button><button onClick={() => dispatch({ type: "DEBUG_SUMMON", playerId: active.id, definitionId: "TOKEN_UNDEAD_SPIRIT" })}>我方：不朽者之靈</button><button onClick={() => dispatch({ type: "DEBUG_SUMMON", playerId: opponentId, definitionId: "TOKEN_ALLIANCE_ROYAL_WARRIOR" })}>對手：皇家戰士</button></details>}
      </section>
      {inspectedCard && <CardDetailModal
        card={inspectedCard}
        tutorialCloseHint={inspectedCard.definitionId === tutorialInspectDefinitionId}
        onClose={() => {
          const completedTutorialInspect = inspectedCard.definitionId === tutorialInspectDefinitionId;
          setInspectedCard(undefined);
          if (completedTutorialInspect) setTutorialStep((step) => step === undefined ? step : step + 1);
        }}
      />}
      {viewedGraveyardPlayerId && <GraveyardModal playerId={viewedGraveyardPlayerId} cards={state.players[viewedGraveyardPlayerId].graveyard} onInspect={(card) => { setViewedGraveyardPlayerId(undefined); setInspectedCard(card); }} onClose={() => setViewedGraveyardPlayerId(undefined)} />}
      {tutorialMode && tutorialStep !== undefined && <TutorialOverlay level={tutorialLevel!} step={tutorialStep} onContinue={continueTutorial} />}
    </main>
  );
}

const firstTutorialContent = [
  { title: "場地區：手下與立場", text: "畫面中央是雙方的場地。手下區在前方，用來放置手下並進行戰鬥；立場區在後方，用來放置會持續存在的立場卡。手下與立場使用不同格子。" },
  { title: "配置：牌組與手牌", text: "牌組保存尚未抽到的卡牌；抽出的牌會進入畫面下方的手牌。玩家資訊區會顯示目前的牌組與手牌數量。" },
  { title: "玩家資訊區", text: "玩家資訊區顯示生命、水晶、手牌數、牌組數與棄堆數，也會顯示牌組的獨立紀錄。聯盟牌組的獨立紀錄是本場累積召喚的「協作數」。" },
  { title: "先看看你的手牌", text: "你的手牌現在只有一張「皇家衛兵」。手牌會顯示卡牌費用、名稱與攻擊／生命數值。" },
  { title: "查看卡牌詳細資訊", text: "想完整閱讀卡牌時，可以點卡牌上的「詳細」，也可以點一下或長按卡牌，開啟放大的資訊欄。" },
  { title: "確認費用與水晶", text: "皇家衛兵的費用是1；你現在有1顆水晶，因此費用符合，可以打出。能打出的手牌會以發光邊框提示。" },
  { title: "請親自打出皇家衛兵", text: "按住下方的皇家衛兵，把它拖曳到我方場地後放開。完成正確操作後，教學才會繼續。" },
  { title: "皇家衛兵已經進場", text: "你打出的皇家衛兵現在位於我方玩家區域的手下區。手下進場後會留在這裡，之後可以在符合行動條件時攻擊。" },
  { title: "第一關完成！", text: "你已經認識場地、牌組、手牌、玩家資訊與水晶，並成功從手牌打出一名手下。點擊任意位置返回模式選擇。" },
] as const;

const secondTutorialContent = [
  { title: "認識戰士學徒", text: "這場戰鬥示範中，你剩下2點生命，對手剩下6點生命。你的起始手牌是2費、2攻擊、3生命的中立手下「戰士學徒」。" },
  { title: "攻擊力", text: "箭頭指向的是戰士學徒的攻擊力。無論攻擊敵方手下或敵方玩家，都會依照這個數值造成傷害。" },
  { title: "生命值", text: "箭頭指向的是戰士學徒的生命值。手下受到傷害會失去生命；生命降至0時會被消滅並移入棄堆。" },
  { title: "請打出戰士學徒", text: "你現在有2顆水晶，剛好可以打出戰士學徒。請把它拖曳到我方場地。" },
  { title: "召喚回合不能攻擊", text: "一般手下在打出的這個回合不能攻擊。戰士學徒要等到你的下一個回合，才會成為可行動手下。" },
  { title: "請結束回合", text: "戰士學徒目前不能攻擊，請點擊上方的「結束回合」，讓對手開始行動。" },
  { title: "嘲諷會保護其他目標", text: "對手打出了2費、1攻擊、3生命的「守備學徒」。具有嘲諷的敵方手下存在時，我方手下必須優先攻擊嘲諷手下，不能直接攻擊敵方玩家。" },
  { title: "輪到我方並抽牌", text: "對手已經結束回合。你的水晶增加並恢復，這回合抽到的是3費、3攻擊、2生命的「騎士學徒」。" },
  { title: "請查看騎士學徒", text: "請點擊騎士學徒的「詳細」，查看它擁有的關鍵字。閱讀完成後，再點擊資訊欄外關閉。" },
  { title: "衝刺", text: "衝刺手下能在召喚的回合立刻攻擊敵方手下，但這個回合不能攻擊敵方玩家。" },
  { title: "請打出騎士學徒", text: "你現在有3顆水晶，請把騎士學徒拖曳到我方場地。" },
  { title: "發光代表可以行動", text: "我方場上具有發光標示的手下可以攻擊。戰士學徒已經等過一回合；騎士學徒則因為衝刺，可以立刻攻擊敵方手下。" },
  { title: "用騎士學徒攻擊守備學徒", text: "拖曳騎士學徒至對面的守備學徒，完成第一次手下戰鬥。" },
  { title: "守備學徒被消滅", text: "騎士學徒造成3點傷害，使守備學徒的生命降至0，因此守備學徒被消滅並進入對手棄堆。" },
  { title: "手下會反擊", text: "手下互相戰鬥時，防守方會依自己的攻擊力反擊。守備學徒具有1點攻擊，因此騎士學徒也受到1點傷害，剩下1點生命。" },
  { title: "用戰士學徒攻擊對手", text: "嘲諷手下已經離場。請拖曳戰士學徒至對手玩家區域，對對手造成2點傷害。" },
  { title: "請再次結束回合", text: "這回合的攻擊已經完成，請點擊「結束回合」。" },
  { title: "對手打出騎士學徒", text: "對手打出具有衝刺的騎士學徒。它能在召喚回合攻擊手下，接下來會攻擊我方戰士學徒。" },
  { title: "戰士學徒被消滅", text: "對手的騎士學徒攻擊戰士學徒。戰士學徒的生命降至0，因此被消滅並進入我方棄堆。對手隨後結束回合。" },
  { title: "抽到刺客學徒", text: "輪到我方，你抽到4費、3攻擊、3生命的「刺客學徒」。" },
  { title: "請查看刺客學徒", text: "請點擊刺客學徒的「詳細」，查看它擁有的關鍵字。閱讀完成後，再點擊資訊欄外關閉。" },
  { title: "衝鋒", text: "衝鋒手下在召喚回合就能攻擊，而且可以選擇敵方手下或敵方玩家，和只能立即攻擊手下的衝刺不同。" },
  { title: "請打出刺客學徒", text: "你現在有4顆水晶，請把刺客學徒拖曳到我方場地。" },
  { title: "刺客學徒攻擊對手", text: "請先拖曳刺客學徒至對手玩家區域，造成3點傷害。" },
  { title: "騎士學徒攻擊對手", text: "騎士學徒已經度過召喚回合，現在也能攻擊玩家。請拖曳騎士學徒至對手玩家區域，完成最後一擊。" },
  { title: "第二關完成！", text: "你已學會攻擊與生命、召喚回合限制、嘲諷、衝刺、衝鋒、反擊、手下死亡及攻擊玩家。點擊任意位置返回教學關卡選擇。" },
] as const;

const thirdTutorialContent = [
  { title: "法術分為一般法術與立場", text: "一般法術打出後會立即執行效果，結算完成後進入棄堆；立場打出後會留在專用的立場區，持續提供牌面記載的效果。" },
  { title: "先看一般法術", text: "你的起始手牌是1費中立法術「魔法知識」，效果是抽1張牌。你現在有4顆水晶，因此可以使用它。" },
  { title: "請打出魔法知識", text: "按住手牌中的「魔法知識」，拖曳到我方場地後放開。一般法術不會留在場上，效果結算後會進入棄堆。" },
  { title: "法術效果已經結算", text: "魔法知識消耗1顆水晶並抽了1張牌。你現在抽到的是3費立場「機械帝國兵工廠」，目前剩餘3顆水晶。" },
  { title: "立場會留在立場區", text: "立場與一般法術不同。打出後，它會進入我方立場區持續存在；手下區與立場區的格子彼此獨立。" },
  { title: "查看機械帝國兵工廠", text: "機械帝國兵工廠費用是3，具有入場曲、生長、倒數與回收。你剩下3顆水晶，剛好符合它的費用。" },
  { title: "請打出機械帝國兵工廠", text: "按住機械帝國兵工廠，拖曳到我方場地後放開。它會進入後方的立場區，並發動入場曲。" },
  { title: "入場曲召喚了手下", text: "請看我方玩家區域：機械帝國兵工廠已經進入立場區，並因為它的入場曲效果，在手下區召喚了1名「機械帝國士兵」。" },
  { title: "第三關完成！", text: "你已經學會一般法術會立即結算並離場，而立場會留在立場區持續運作。點擊任意位置返回教學關卡選擇。" },
] as const;

function TutorialOverlay({ level, step, onContinue }: { level: 1 | 2 | 3; step: number; onContinue: () => void }) {
  const content = (level === 1 ? firstTutorialContent : level === 2 ? secondTutorialContent : thirdTutorialContent)[step];
  const secondLevelActionSteps = new Set([3, 5, 8, 10, 12, 15, 16, 20, 22, 23, 24]);
  const waitingForAction = level === 1 ? step === 4 || step === 6 : level === 2 ? secondLevelActionSteps.has(step) : step === 2 || step === 6;
  const actionHint = level === 1 && step === 4
    ? "等待你點擊皇家衛兵的「詳細」"
    : level === 2 && (step === 8 || step === 20)
      ? "等待你點擊手牌的「詳細」"
      : level === 2 && (step === 5 || step === 16)
        ? "等待你點擊「結束回合」"
        : level === 2 && [12, 15, 23, 24].includes(step)
          ? "等待你完成指定攻擊"
          : "等待你完成拖曳出牌";
  const placement = tutorialDialogPlacement(level, step);
  const visualGuide = tutorialVisualGuide(level, step);
  const dialogRef = useRef<HTMLElement>(null);

  useLayoutEffect(() => {
    const keepDialogInSafeArea = () => {
      const dialog = dialogRef.current;
      if (!dialog) return;
      dialog.style.setProperty("--tutorial-safe-shift-x", "0px");
      dialog.style.setProperty("--tutorial-safe-shift-y", "0px");
      const rect = dialog.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) return;
      const boardRect = dialog.closest(".game-board")?.getBoundingClientRect();
      const boardHasSize = Boolean(boardRect && boardRect.width > 0 && boardRect.height > 0);
      const safeLeft = Math.max(16, boardHasSize ? boardRect!.left + 12 : 16);
      const safeRight = Math.min(window.innerWidth - 16, boardHasSize ? boardRect!.right - 12 : window.innerWidth - 16);
      const safeTop = Math.max(70, boardHasSize ? boardRect!.top + 64 : 70);
      const safeBottom = Math.min(window.innerHeight - 16, boardHasSize ? boardRect!.bottom - 12 : window.innerHeight - 16);
      let shiftX = rect.left < safeLeft ? safeLeft - rect.left : 0;
      if (rect.right + shiftX > safeRight) shiftX += safeRight - (rect.right + shiftX);
      let shiftY = rect.top < safeTop ? safeTop - rect.top : 0;
      if (rect.bottom + shiftY > safeBottom) shiftY += safeBottom - (rect.bottom + shiftY);
      dialog.style.setProperty("--tutorial-safe-shift-x", `${shiftX}px`);
      dialog.style.setProperty("--tutorial-safe-shift-y", `${shiftY}px`);
    };
    keepDialogInSafeArea();
    window.addEventListener("resize", keepDialogInSafeArea);
    return () => window.removeEventListener("resize", keepDialogInSafeArea);
  }, [level, step, placement]);

  if (!content) return null;
  return <>
    <div className={`tutorial-overlay tutorial-overlay-level-${level} tutorial-overlay-step-${step} ${waitingForAction ? "tutorial-action-step" : ""}`} role="presentation" onClick={waitingForAction ? undefined : onContinue} />
    <section ref={dialogRef} className={`tutorial-dialog tutorial-dialog-level-${level} tutorial-dialog-step-${step} tutorial-dialog-placement-${placement} ${waitingForAction ? "tutorial-action-dialog" : ""}`} role="dialog" aria-modal={!waitingForAction} aria-label={content.title} onClick={waitingForAction ? undefined : onContinue}>
      <p className="eyebrow">新手教學 · 第{level === 1 ? "一" : level === 2 ? "二" : "三"}關 · {Math.min(step + 1, level === 2 ? 25 : 8)} / {level === 2 ? 25 : 8}</p>
      <h2>{content.title}</h2>
      <p>{content.text}</p>
      <small>{waitingForAction ? actionHint : step === (level === 2 ? 25 : 8) ? "點擊任意位置完成教學" : "準備好時，點擊任意位置繼續"}</small>
    </section>
    {visualGuide?.type === "ATTACK"
      ? <TutorialAttackGuide fromSelector={visualGuide.from} toSelector={visualGuide.to} />
      : <TutorialArrow level={level} step={step} finalStep={level === 2 ? 25 : 8} targetSelector={visualGuide?.target} />}
  </>;
}

function TutorialAttackGuide({ fromSelector, toSelector }: { fromSelector: string; toSelector: string }) {
  const [style, setStyle] = useState<CSSProperties>();
  useLayoutEffect(() => {
    const placeGuide = () => {
      const from = document.querySelector(fromSelector)?.getBoundingClientRect();
      const to = document.querySelector(toSelector)?.getBoundingClientRect();
      if (!from || !to) return;
      const fromCenter = { x: from.left + from.width / 2, y: from.top + from.height / 2 };
      const toCenter = { x: to.left + to.width / 2, y: to.top + to.height / 2 };
      const dx = toCenter.x - fromCenter.x;
      const dy = toCenter.y - fromCenter.y;
      const distance = Math.hypot(dx, dy);
      if (distance === 0) return;
      const trim = Math.min(46, distance / 4);
      const unitX = dx / distance;
      const unitY = dy / distance;
      setStyle({
        left: fromCenter.x + unitX * trim,
        top: fromCenter.y + unitY * trim,
        width: Math.max(24, distance - trim * 2),
        transform: `rotate(${Math.atan2(dy, dx)}rad)`,
      });
    };
    placeGuide();
    window.addEventListener("resize", placeGuide);
    return () => window.removeEventListener("resize", placeGuide);
  }, [fromSelector, toSelector]);
  return <span className="tutorial-attack-guide" style={style} aria-hidden="true"><i /></span>;
}

function TutorialArrow({ level, step, finalStep, targetSelector }: { level: 1 | 2 | 3; step: number; finalStep: number; targetSelector?: string }) {
  const arrowRef = useRef<HTMLSpanElement>(null);
  const [position, setPosition] = useState<CSSProperties>();

  useLayoutEffect(() => {
    if (!targetSelector) {
      setPosition(undefined);
      return;
    }
    const placeArrow = () => {
      const target = document.querySelector(targetSelector);
      if (!target) return;
      const rect = target.getBoundingClientRect();
      const arrowSize = 48;
      const gap = 10;
      let left: number;
      let top: number;
      let transform: string;
      if (targetSelector.includes("health-stat")) {
        const cardRect = target.closest(".card")?.getBoundingClientRect() ?? rect;
        if (cardRect.right + arrowSize + gap < window.innerWidth - 8) {
          left = cardRect.right + gap;
          top = rect.top + rect.height / 2 - arrowSize / 2;
          transform = "rotate(180deg)";
        } else {
          left = cardRect.left - arrowSize - gap;
          top = rect.top + rect.height / 2 - arrowSize / 2;
          transform = "none";
        }
      } else if (rect.width > 260) {
        left = rect.left + rect.width / 2 - arrowSize / 2;
        top = rect.top - arrowSize - gap;
        transform = "rotate(90deg)";
      } else if (rect.left >= arrowSize + gap + 8) {
        left = rect.left - arrowSize - gap;
        top = rect.top + rect.height / 2 - arrowSize / 2;
        transform = "none";
      } else {
        left = rect.right + gap;
        top = rect.top + rect.height / 2 - arrowSize / 2;
        transform = "rotate(180deg)";
      }
      setPosition({
        right: "auto",
        bottom: "auto",
        left: Math.max(8, Math.min(window.innerWidth - arrowSize - 8, left)),
        top: Math.max(70, Math.min(window.innerHeight - arrowSize - 8, top)),
        transform,
      });
    };
    placeArrow();
    window.addEventListener("resize", placeArrow);
    return () => window.removeEventListener("resize", placeArrow);
  }, [targetSelector]);

  if (step >= finalStep) return null;
  return <span ref={arrowRef} className={`tutorial-arrow tutorial-arrow-level-${level} tutorial-arrow-step-${step}`} style={position} aria-hidden="true">➜</span>;
}

type TutorialVisualGuide = { type: "POINTER"; target: string } | { type: "ATTACK"; from: string; to: string };

function tutorialVisualGuide(level: 1 | 2 | 3, step: number): TutorialVisualGuide | undefined {
  const firstLevelTargets: Record<number, string> = {
    0: ".active-side .minion-zone",
    1: ".hand-panel",
    2: ".active-side .player-panel",
    3: '[data-instance-id="tutorial-royal-guard"]',
    4: '[data-instance-id="tutorial-royal-guard"] .inspect-card',
    5: '[data-instance-id="tutorial-royal-guard"] .cost',
    6: '[data-instance-id="tutorial-royal-guard"]',
    7: '[data-instance-id="tutorial-royal-guard"]',
  };
  const secondLevelTargets: Record<number, string> = {
    0: '[data-instance-id="tutorial-warrior-apprentice"]',
    1: '[data-instance-id="tutorial-warrior-apprentice"] .hand-attack',
    2: '[data-instance-id="tutorial-warrior-apprentice"] .hand-health',
    3: '[data-instance-id="tutorial-warrior-apprentice"]',
    4: '[data-instance-id="tutorial-warrior-apprentice"]',
    5: ".tutorial-end-turn",
    6: '[data-instance-id="tutorial-guard-apprentice"]',
    7: '[data-instance-id="tutorial-knight-apprentice"]',
    8: '[data-instance-id="tutorial-knight-apprentice"] .inspect-card',
    9: '[data-instance-id="tutorial-knight-apprentice"]',
    10: '[data-instance-id="tutorial-knight-apprentice"]',
    11: ".active-side .minion-zone",
    13: ".opponent-side .zone-count",
    14: '[data-instance-id="tutorial-knight-apprentice"] .health-stat',
    16: ".tutorial-end-turn",
    17: '[data-instance-id="tutorial-opponent-knight-apprentice"]',
    18: ".active-side .zone-count",
    19: '[data-instance-id="tutorial-assassin-apprentice"]',
    20: '[data-instance-id="tutorial-assassin-apprentice"] .inspect-card',
    21: '[data-instance-id="tutorial-assassin-apprentice"]',
    22: '[data-instance-id="tutorial-assassin-apprentice"]',
  };
  const thirdLevelTargets: Record<number, string> = {
    0: ".active-side .field-zone",
    1: '[data-instance-id="tutorial-magic-knowledge"]',
    2: '[data-instance-id="tutorial-magic-knowledge"]',
    3: ".hand-panel",
    4: ".active-side .field-zone",
    5: ".hand-panel .hand-card",
    6: ".hand-panel .hand-card",
    7: ".active-side",
  };
  if (level === 2 && step === 12) return { type: "ATTACK", from: '[data-instance-id="tutorial-knight-apprentice"]', to: '[data-instance-id="tutorial-guard-apprentice"]' };
  if (level === 2 && step === 15) return { type: "ATTACK", from: '[data-instance-id="tutorial-warrior-apprentice"]', to: ".opponent-side .player-panel" };
  if (level === 2 && step === 23) return { type: "ATTACK", from: '[data-instance-id="tutorial-assassin-apprentice"]', to: ".opponent-side .player-panel" };
  if (level === 2 && step === 24) return { type: "ATTACK", from: '[data-instance-id="tutorial-knight-apprentice"]', to: ".opponent-side .player-panel" };
  const target = level === 1 ? firstLevelTargets[step] : level === 2 ? secondLevelTargets[step] : thirdLevelTargets[step];
  return target ? { type: "POINTER", target } : undefined;
}

function tutorialDialogPlacement(level: 1 | 2 | 3, step: number): "board" | "hand" | "player" | "active" | "opponent" | "header" | "center" {
  if (level === 2) {
    if (step === 25) return "center";
    if (step === 5 || step === 16) return "header";
    if ([6, 13, 17].includes(step)) return "opponent";
    if ([4, 11, 14, 18].includes(step)) return "active";
    if ([12, 15, 23, 24].includes(step)) return "board";
    return "hand";
  }
  if (step === 8) return "center";
  if (step === 7) return "active";
  if (level === 1) {
    if (step === 0) return "board";
    if (step === 2) return "player";
    return "hand";
  }
  if (step === 0 || step === 4) return "board";
  return "hand";
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

function specialRecords(player: GameState["players"][PlayerId]): { label: string; value: number | string }[] {
  const records: { label: string; value: number | string }[] = [];
  if (playerHasFaction(player, "UNDEAD")) records.push({ label: "死靈數", value: player.resources.necromancy });
  if (playerHasFaction(player, "MACHINE")) records.push({ label: "回收充能", value: player.resources.recycleCharge });
  if (playerHasFaction(player, "ALLIANCE")) records.push({ label: "協作數", value: player.summonedThisGame });
  if (playerHasFaction(player, "DRAGON")) records.push({
    label: "棄堆龍族",
    value: player.graveyard.filter((card) => {
      const definition = getCardDefinition(card.definitionId);
      return definition.cardType === "MINION" && definition.subtype.includes("DRAGON");
    }).length,
  });
  return records.length > 0 ? records : [{ label: "特殊紀錄", value: "—" }];
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

function CardDetailModal({ card, onClose, tutorialCloseHint = false }: { card: CardInstance; onClose: () => void; tutorialCloseHint?: boolean }) {
  const definition = getCardDefinition(card.definitionId);
  const keywordText = getCardKeywordText(card);
  return <div className="card-modal-backdrop" role="presentation" onClick={onClose}>
    <section className="card-modal" role="dialog" aria-modal="true" aria-label={`${definition.name} 卡牌資訊`} onClick={(event) => event.stopPropagation()}>
      <button className="modal-close" onClick={onClose} aria-label="關閉卡牌資訊">×</button>
      {tutorialCloseHint && <p className="tutorial-modal-hint">閱讀完成後，點擊資訊欄外任意一處即可關閉，並繼續下一步。</p>}
      <p className="eyebrow">{cardTypeLabels[definition.cardType]} · {formatSubtypeLabels(definition.subtype)}</p>
      <h2>{definition.name}</h2>
      <div className="card-modal-stats">
        <span>費用 <strong>{card.currentCost ?? definition.originalCost ?? "?"}</strong></span>
        {definition.cardType === "MINION" && <><span>攻擊 <strong>{card.currentAttack ?? "?"}</strong></span><span>生命 <strong>{card.currentHealth ?? "?"}</strong></span></>}
      </div>
      {card.counters.plagueMarks !== undefined && <p className="modal-plague-counter">瘟疫標記 <strong>{card.counters.plagueMarks}</strong> / {definition.transformAura?.threshold ?? 6}</p>}
      {card.counters.countdown !== undefined && <p className="modal-countdown-counter">目前倒數 <strong>{card.counters.countdown}</strong></p>}
      <div className="card-modal-effect">
        <strong>效果：</strong>
        <div className="effect-keyword-list">
          {card.sealed && <span className="effect-keyword sealed">封印中</span>}
          {card.keywords.map((keyword, index) => <KeywordGlossaryButton keyword={keyword} key={`${keyword}-${index}`} />)}
        </div>
        {definition.effectsText && <p className="printed-effect"><GlossaryText text={definition.effectsText} /></p>}
        {keywordText.length === 0 && !definition.effectsText && <p>無卡牌效果</p>}
      </div>
    </section>
  </div>;
}
