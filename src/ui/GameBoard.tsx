import { useMemo, useState } from "react";
import { getCardDefinition } from "../game/cards/cardRegistry";
import type { PlayerId } from "../game/cards/cardTypes";
import { getLegalAttackTargets } from "../game/engine/combatEngine";
import { applyAction, type GameAction } from "../game/engine/gameEngine";
import type { GameState } from "../game/state/GameState";
import { CardView } from "./CardView";

interface Props { initialState: GameState; onRestart: () => void }

export function GameBoard({ initialState, onRestart }: Props) {
  const [state, setState] = useState(initialState);
  const [message, setMessage] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [attackerId, setAttackerId] = useState<string>();
  const [privacyGate, setPrivacyGate] = useState(false);
  const active = state.players[state.activePlayerId];
  const opponentId: PlayerId = state.activePlayerId === "P1" ? "P2" : "P1";
  const opponent = state.players[opponentId];
  const legalTargets = useMemo(() => attackerId ? getLegalAttackTargets(state, attackerId) : [], [state, attackerId]);

  function dispatch(action: GameAction, gateAfter = false) {
    const result = applyAction(state, action);
    setState(result.state);
    setMessage(result.error ? `${result.error.code}：${result.error.message}` : "");
    if (!result.error) {
      setSelected([]);
      setAttackerId(undefined);
      if (gateAfter) setPrivacyGate(true);
    }
  }

  const mulliganPlayer: PlayerId = !state.players.P1.mulliganDone ? "P1" : "P2";
  if (privacyGate) {
    return <main className="privacy"><h1>请交给 {state.phase === "MULLIGAN" ? mulliganPlayer : state.activePlayerId}</h1><button onClick={() => setPrivacyGate(false)}>已交接，显示画面</button></main>;
  }

  if (state.phase === "MULLIGAN") {
    const player = state.players[mulliganPlayer];
    return (
      <main>
        <header><div><p className="eyebrow">MULLIGAN · {mulliganPlayer}</p><h1>选择要更换的起始手牌</h1></div><button className="quiet" onClick={onRestart}>重新设定</button></header>
        <p className="notice">先抽取等量替换牌，再把换出的 0～4 张加入牌库并洗牌。</p>
        <section className="hand open">{player.hand.map((card) => <CardView key={card.instanceId} card={card} selected={selected.includes(card.instanceId)} onClick={() => setSelected((items) => items.includes(card.instanceId) ? items.filter((id) => id !== card.instanceId) : [...items, card.instanceId])} />)}</section>
        {message && <p className="error">{message}</p>}
        <button onClick={() => dispatch({ type: "MULLIGAN", playerId: mulliganPlayer, instanceIds: selected }, true)}>确认换牌（{selected.length}）</button>
      </main>
    );
  }

  function isLegalMinion(id: string) { return legalTargets.some((target) => target.type === "MINION" && target.instanceId === id); }
  const heroLegal = legalTargets.some((target) => target.type === "HERO" && target.playerId === opponentId);
  const handLimitChoice = state.pendingChoice?.type === "HAND_LIMIT" ? state.pendingChoice : undefined;
  const handLimit = Boolean(handLimitChoice);
  const orderChoice = state.pendingChoice?.type === "TRIGGER_ORDER" || state.pendingChoice?.type === "COUNTDOWN_ORDER"
    ? state.pendingChoice
    : undefined;
  const effectChoice = state.pendingChoice?.type === "EFFECT_CARDS" ? state.pendingChoice : undefined;
  const optionChoice = state.pendingChoice?.type === "EFFECT_OPTION" ? state.pendingChoice : undefined;

  return (
    <main>
      <header>
        <div><p className="eyebrow">TURN {state.turnNumber} · {state.phase}</p><h1>戰記 <span>规则验证台</span></h1></div>
        <div className="actions"><button className="quiet" onClick={onRestart}>重新开始</button>{state.phase === "MAIN" && !state.pendingChoice && <button onClick={() => dispatch({ type: "END_TURN", playerId: state.activePlayerId }, active.hand.length <= state.rulesConfig.handLimitAtEnd)}>结束回合</button>}</div>
      </header>
      {state.phase === "GAME_OVER" && <section className="result"><strong>{state.winner} 获胜</strong><span>{state.loseReason}</span></section>}
      {message && <p className="error">{message}</p>}
      {orderChoice && <section className="notice">
        <strong>选择同一时机的处理顺序</strong>
        <p>依次点击来源；同批次新生成的卡不进入本次合法目标范围。</p>
        <p>目前顺序：{selected.join(" → ") || "尚未选择"}</p>
        {orderChoice.instanceIds.filter((id) => !selected.includes(id)).map((id) => <button key={id} onClick={() => setSelected((items) => [...items, id])}>{id}</button>)}
        <button disabled={selected.length !== orderChoice.instanceIds.length} onClick={() => dispatch({
          type: orderChoice.type === "TRIGGER_ORDER" ? "SELECT_TRIGGER_ORDER" : "SELECT_COUNTDOWN_ORDER",
          playerId: orderChoice.playerId,
          instanceIds: selected,
        })}>确认顺序</button>
      </section>}
      {effectChoice && <section className="notice">
        <strong>{effectChoice.prompt}</strong>
        <p>已选择 {selected.length}/{effectChoice.count}；{effectChoice.minCount === 0 ? "可选择0张。" : "同一次指定不可重复选择同一卡牌实例。"}</p>
        {effectChoice.candidateInstanceIds.map((id) => {
          const card = [...state.players.P1.deck, ...state.players.P2.deck, ...state.players.P1.hand, ...state.players.P2.hand, ...state.players.P1.minions, ...state.players.P2.minions]
            .find((candidate) => candidate.instanceId === id);
          const chosen = selected.includes(id);
          return <button key={id} className={chosen ? "selected" : "quiet"} onClick={() => setSelected((items) => chosen ? items.filter((item) => item !== id) : items.length < effectChoice.count ? [...items, id] : items)}>{card ? getCardDefinition(card.definitionId).name : id}</button>;
        })}
        <button disabled={selected.length < (effectChoice.minCount ?? effectChoice.count) || selected.length > effectChoice.count} onClick={() => dispatch({ type: "SELECT_EFFECT_CARDS", playerId: effectChoice.playerId, instanceIds: selected })}>确认指定</button>
      </section>}
      {optionChoice && <section className="notice">
        <strong>{optionChoice.prompt}</strong>
        <p>选择画面已经按当前条件显示最终数值。</p>
        {optionChoice.options.map((option) => <button key={option.id} onClick={() => dispatch({ type: "SELECT_EFFECT_OPTION", playerId: optionChoice.playerId, optionId: option.id })}>{option.label}</button>)}
      </section>}

      <section className={`player-strip ${heroLegal ? "legal" : ""}`} onClick={() => attackerId && heroLegal && dispatch({ type: "ATTACK", playerId: state.activePlayerId, attackerId, target: { type: "HERO", playerId: opponentId } })}>
        <strong>{opponentId} · {opponent.faction}</strong><span>HP {opponent.heroHp}</span><span>水晶 {opponent.mana}/{opponent.maxMana}</span><span>手牌 {opponent.hand.length}</span><span>牌库 {opponent.deck.length}</span>
      </section>
      <Zone title="对手立场区" cards={opponent.fields} />
      <Zone title="对手手下区 · 7 格" cards={opponent.minions} legal={isLegalMinion} onCard={(id) => attackerId && isLegalMinion(id) && dispatch({ type: "ATTACK", playerId: state.activePlayerId, attackerId, target: { type: "MINION", instanceId: id } })} />
      <div className="divider" />
      <Zone title="我方手下区 · 7 格" cards={active.minions} selected={(id) => id === attackerId} onCard={(id) => setAttackerId(id === attackerId ? undefined : id)} />
      <Zone title="我方立场区" cards={active.fields} />
      {!state.pendingChoice && state.phase === "MAIN" && active.fields.some((card) => getCardDefinition(card.definitionId).activatedEffect) && <section className="actions">
        {active.fields.filter((card) => getCardDefinition(card.definitionId).activatedEffect).map((card) => {
          const definition = getCardDefinition(card.definitionId);
          const activated = definition.activatedEffect!;
          return <button className="quiet" key={card.instanceId} disabled={card.sealed} onClick={() => dispatch({ type: "ACTIVATE_FIELD", playerId: active.id, instanceId: card.instanceId })}>发动 {definition.name}（死灵术 {activated.cost}）</button>;
        })}
      </section>}
      <section className="player-strip"><strong>{active.id} · {active.faction}</strong><span>HP {active.heroHp}</span><span>水晶 {active.mana}/{active.maxMana}</span><span>死灵 {active.resources.necromancy}</span><span>回收 {active.resources.recycleCharge}</span></section>

      <h2>我方手牌 <small>{active.hand.length} 张</small></h2>
      <section className="hand">{active.hand.map((card) => <CardView key={card.instanceId} card={card} selected={selected.includes(card.instanceId)} onClick={() => handLimit ? setSelected((items) => items.includes(card.instanceId) ? items.filter((id) => id !== card.instanceId) : [...items, card.instanceId]) : !effectChoice && dispatch({ type: "PLAY_CARD", playerId: active.id, instanceId: card.instanceId })} />)}</section>
      {!state.pendingChoice && state.phase === "MAIN" && active.hand.some((card) => getCardDefinition(card.definitionId).alternatePlay) && <section className="actions">
        {active.hand.filter((card) => getCardDefinition(card.definitionId).alternatePlay).map((card) => {
          const definition = getCardDefinition(card.definitionId);
          return <button className="quiet" key={card.instanceId} onClick={() => dispatch({ type: "PLAY_ALTERNATE", playerId: active.id, instanceId: card.instanceId })}>转费 {definition.alternatePlay!.cost}：{definition.name}</button>;
        })}
      </section>}
      {handLimitChoice && <button onClick={() => dispatch({ type: "SELECT_DISCARD", playerId: active.id, instanceIds: selected }, true)}>确认弃牌（需 {handLimitChoice.count} 张）</button>}

      {state.phase === "MAIN" && <details className="debug"><summary>Debug：生成基础衍生手下</summary><p>序列化 Debug Action，仅用于验证召唤、战斗及关键词。</p><button onClick={() => dispatch({ type: "DEBUG_SUMMON", playerId: active.id, definitionId: "TOKEN_DRAGON_HELLFIRE" })}>我方：地獄炎龍</button><button onClick={() => dispatch({ type: "DEBUG_SUMMON", playerId: active.id, definitionId: "TOKEN_UNDEAD_SPIRIT" })}>我方：不朽者之靈</button><button onClick={() => dispatch({ type: "DEBUG_SUMMON", playerId: opponentId, definitionId: "TOKEN_ALLIANCE_ROYAL_WARRIOR" })}>对手：皇家戰士</button></details>}

      <details className="log" open><summary>Game Log · {state.log.length}</summary>{[...state.log].reverse().map((entry) => <div key={entry.index}><time>#{entry.index} T{entry.turn}</time><strong>{entry.type}</strong><span>{entry.message}</span></div>)}</details>
      <details><summary>Zone 检视</summary><pre>{JSON.stringify({ active: { graveyard: active.graveyard.map((c) => c.definitionId), removed: active.removed.map((c) => c.definitionId), extraDeck: active.extraDeck.map((c) => c.definitionId) }, opponent: { graveyard: opponent.graveyard.map((c) => c.definitionId), removed: opponent.removed.map((c) => c.definitionId), extraDeck: opponent.extraDeck.map((c) => c.definitionId) } }, null, 2)}</pre></details>
    </main>
  );
}

function Zone({ title, cards, legal, selected, onCard }: { title: string; cards: GameState["players"][PlayerId]["minions"]; legal?: (id: string) => boolean; selected?: (id: string) => boolean; onCard?: (id: string) => void }) {
  return <section><h2>{title} <small>{cards.length}</small></h2><div className="zone">{cards.map((card) => <CardView key={card.instanceId} card={card} selected={selected?.(card.instanceId)} disabled={Boolean(legal && !legal(card.instanceId))} onClick={() => onCard?.(card.instanceId)} />)}{Array.from({ length: Math.max(0, 7 - cards.length) }, (_, index) => <span className="slot" key={index} />)}</div></section>;
}
