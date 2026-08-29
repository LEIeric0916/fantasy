// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { describeAiAction, GameBoard } from "../../src/ui/GameBoard";
import { moveCard } from "../../src/game/engine/zoneEngine";
import { mainState, putCard } from "../helpers";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("效果未發動介面提示", () => {
  it("對戰紀錄與 AI 行動提示使用卡牌名稱", () => {
    const state = mainState();
    state.players.P2.hand = [];
    const spell = putCard(state, "P2", "DRAGON_013", "HAND", "ai-spell-notice");
    state.log.push({ index: state.log.length, turn: 1, type: "ACTION", message: "DRAGON_013 的效果開始結算" });
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    act(() => root.render(<GameBoard initialState={state} onRestart={() => undefined} />));
    expect(container.querySelector(".log")?.textContent).toContain("炎龍召喚");
    expect(container.querySelector(".log")?.textContent).not.toContain("DRAGON_013");
    expect(describeAiAction(state, { type: "PLAY_CARD", playerId: "P2", instanceId: spell.instanceId })).toBe("P2 AI 施放法術「炎龍召喚」");
    act(() => root.unmount());
    container.remove();
  });

  it("手下卡牌首次進入手下區時播放進場動畫並在結束後移除動畫類別", () => {
    vi.useFakeTimers();
    const state = mainState();
    const minion = putCard(state, "P1", "UNDEAD_003", "MINION", "entrance-animation");
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    act(() => root.render(<GameBoard initialState={state} onRestart={() => undefined} />));
    expect(container.querySelector(`[data-instance-id="${minion.instanceId}"]`)?.classList.contains("minion-entering")).toBe(true);
    act(() => vi.advanceTimersByTime(750));
    expect(container.querySelector(`[data-instance-id="${minion.instanceId}"]`)?.classList.contains("minion-entering")).toBe(false);
    act(() => root.unmount());
    container.remove();
    vi.useRealTimers();
  });

  it("皇家親衛隊在場上明確顯示光環標示", () => {
    const state = mainState();
    const guard = putCard(state, "P1", "TOKEN_ALLIANCE_ROYAL_HONOR_GUARD", "MINION", "aura-badge");
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    act(() => root.render(<GameBoard initialState={state} onRestart={() => undefined} />));
    const rendered = container.querySelector(`[data-instance-id="${guard.instanceId}"]`);
    expect(rendered?.classList.contains("status-aura")).toBe(true);
    expect(rendered?.textContent).toContain("光環");
    act(() => root.unmount());
    container.remove();
  });


  it("直接向玩家顯示卡牌名稱與未發動原因", () => {
    const state = mainState();
    state.effectNotices = [{
      id: 1,
      playerId: "P1",
      sourceInstanceId: "notice-source",
      sourceName: "測試卡牌",
      reason: "沒有合法目標",
    }];
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    act(() => root.render(<GameBoard initialState={state} onRestart={() => undefined} />));
    expect(container.querySelector('[role="status"]')?.textContent).toContain("測試卡牌：沒有合法目標");
    act(() => root.unmount());
    container.remove();
  });

  it("以卡名顯示選擇來源，並可開啟大字卡牌資訊", () => {
    const state = mainState();
    state.players.P1.hand = [];
    const card = putCard(state, "P1", "DRAGON_001", "HAND", "inspect");
    state.pendingChoice = {
      type: "TRIGGER_ORDER",
      playerId: "P1",
      timingId: "ui-order",
      instanceIds: [card.instanceId],
    };
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    act(() => root.render(<GameBoard initialState={state} onRestart={() => undefined} />));
    expect([...container.querySelectorAll("button")].some((button) => button.textContent === "聖印白龍")).toBe(true);
    const inspect = container.querySelector<HTMLButtonElement>('[aria-label="檢視 聖印白龍 卡牌資訊"]')!;
    act(() => inspect.click());
    expect(container.querySelector('[role="dialog"]')?.textContent).toContain("抽1張牌");
    expect(container.querySelector(".card-modal-effect")).not.toBeNull();
    act(() => root.unmount());
    container.remove();
  });

  it("長按手牌或場上卡牌可直接開啟資訊", () => {
    vi.useFakeTimers();
    const state = mainState();
    const minion = putCard(state, "P1", "UNDEAD_008", "MINION", "long-press");
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    act(() => root.render(<GameBoard initialState={state} onRestart={() => undefined} />));
    const card = container.querySelector<HTMLElement>(`[data-instance-id="${minion.instanceId}"]`)!;
    act(() => {
      card.dispatchEvent(new Event("pointerdown", { bubbles: true }));
      vi.advanceTimersByTime(560);
    });
    expect(container.querySelector('[role="dialog"]')?.textContent).toContain("不朽的追憶者");
    act(() => root.unmount());
    container.remove();
    vi.useRealTimers();
  });

  it("換牌階段顯示完整卡面，而不是壓縮手牌摘要", () => {
    const state = mainState();
    state.phase = "MULLIGAN";
    state.players.P1.mulliganDone = false;
    state.players.P2.mulliganDone = false;
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    act(() => root.render(<GameBoard initialState={state} onRestart={() => undefined} />));
    const card = container.querySelector(".mulligan-screen .card")!;
    expect(card.classList.contains("hand-card")).toBe(false);
    expect(card.querySelector(".effect")).not.toBeNull();
    act(() => root.unmount());
    container.remove();
  });

  it("標示可出牌手牌與可行動手下，並可拖曳手下攻擊合法目標", () => {
    const state = mainState();
    state.players.P1.hand = [];
    const playable = putCard(state, "P1", "DRAGON_001", "HAND", "playable");
    const attacker = putCard(state, "P1", "UNDEAD_001", "MINION", "attacker");
    const defender = putCard(state, "P2", "UNDEAD_001", "MINION", "defender");
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    act(() => root.render(<GameBoard initialState={state} onRestart={() => undefined} />));
    expect(container.querySelector(`[data-instance-id="${playable.instanceId}"]`)?.classList.contains("playable")).toBe(true);
    const attackerElement = container.querySelector<HTMLElement>(`[data-instance-id="${attacker.instanceId}"]`)!;
    expect(attackerElement.classList.contains("actionable")).toBe(true);
    expect(attackerElement.getAttribute("draggable")).toBe("true");
    const dataTransfer = { effectAllowed: "none", dropEffect: "none", setData: () => undefined };
    const dragStart = new Event("dragstart", { bubbles: true });
    Object.defineProperty(dragStart, "dataTransfer", { value: dataTransfer });
    act(() => attackerElement.dispatchEvent(dragStart));
    expect(container.querySelector(".attack-drag-indicator")?.textContent).toContain("拖曳至攻擊目標");
    const defenderElement = container.querySelector<HTMLElement>(`[data-instance-id="${defender.instanceId}"]`)!;
    expect(defenderElement.classList.contains("drop-target")).toBe(true);
    const drop = new Event("drop", { bubbles: true });
    Object.defineProperty(drop, "dataTransfer", { value: dataTransfer });
    act(() => defenderElement.dispatchEvent(drop));
    expect(container.querySelector(`[data-instance-id="${defender.instanceId}"]`)).toBeNull();
    expect(container.textContent).toContain("交戰");
    act(() => root.unmount());
    container.remove();
  });

  it("手牌點擊只開啟詳細資訊，不會直接打出", () => {
    const state = mainState();
    state.players.P1.hand = [];
    const playable = putCard(state, "P1", "DRAGON_001", "HAND", "click-inspect-only");
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    act(() => root.render(<GameBoard initialState={state} onRestart={() => undefined} />));
    const cardSurface = container.querySelector<HTMLElement>(`[data-instance-id="${playable.instanceId}"] .card-surface`)!;
    act(() => cardSurface.click());
    expect(container.querySelector('[role="dialog"]')?.textContent).toContain("聖印白龍");
    expect(container.querySelector(`.hand-panel [data-instance-id="${playable.instanceId}"]`)).not.toBeNull();
    expect(container.querySelector(`.active-side .minion-zone [data-instance-id="${playable.instanceId}"]`)).toBeNull();
    act(() => root.unmount());
    container.remove();
  });

  it("拖曳可出牌手牌時我方場地發光，放開後才打出", () => {
    const state = mainState();
    state.players.P1.hand = [];
    const playable = putCard(state, "P1", "DRAGON_001", "HAND", "drag-play-card");
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    act(() => root.render(<GameBoard initialState={state} onRestart={() => undefined} />));
    const handCard = container.querySelector<HTMLElement>(`.hand-panel [data-instance-id="${playable.instanceId}"]`)!;
    expect(handCard.classList.contains("playable")).toBe(true);
    expect(handCard.getAttribute("draggable")).toBe("true");
    const dataTransfer = { effectAllowed: "none", dropEffect: "none", setData: () => undefined };
    const dragStart = new Event("dragstart", { bubbles: true });
    Object.defineProperty(dragStart, "dataTransfer", { value: dataTransfer });
    act(() => handCard.dispatchEvent(dragStart));
    const activeSide = container.querySelector<HTMLElement>(".active-side")!;
    expect(activeSide.classList.contains("hand-play-drop-zone")).toBe(true);
    const drop = new Event("drop", { bubbles: true });
    Object.defineProperty(drop, "dataTransfer", { value: dataTransfer });
    act(() => activeSide.dispatchEvent(drop));
    expect(container.querySelector(`.hand-panel [data-instance-id="${playable.instanceId}"]`)).toBeNull();
    expect(container.querySelector(`.active-side .minion-zone [data-instance-id="${playable.instanceId}"]`)).not.toBeNull();
    act(() => root.unmount());
    container.remove();
  });

  it("場上手下以左右角分開顯示攻擊與生命", () => {
    const state = mainState();
    const minion = putCard(state, "P1", "UNDEAD_008", "MINION", "battle-stats");
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    act(() => root.render(<GameBoard initialState={state} onRestart={() => undefined} />));
    const card = container.querySelector(`[data-instance-id="${minion.instanceId}"]`)!;
    expect(card.querySelector(".attack-stat")?.textContent).toContain("4");
    expect(card.querySelector(".health-stat")?.textContent).toContain("3");
    expect(card.querySelector(".status-strip")?.textContent).toContain("聖盾術");
    act(() => root.unmount());
    container.remove();
  });

  it("回合結束效果先由目前玩家完成，完成後才顯示交接畫面", () => {
    const state = mainState();
    putCard(state, "P1", "DRAGON_005", "MINION", "end-turn-ui");
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    act(() => root.render(<GameBoard initialState={state} onRestart={() => undefined} />));
    const endTurn = [...container.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent === "結束回合")!;
    act(() => endTurn.click());
    expect(container.textContent).toContain("選擇神威焰龍的回合結束效果");
    expect(container.textContent).not.toContain("請交給 P2");
    const damage = [...container.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent?.includes("給予對手所有手下"))!;
    act(() => damage.click());
    expect(container.textContent).toContain("請交給 P2");
    act(() => root.unmount());
    container.remove();
  });

  it("醒目顯示瘟疫標記與玩家生命", () => {
    const state = mainState();
    state.players.P1.heroHp = 8;
    const plague = putCard(state, "P1", "TOKEN_UNDEAD_BOOK_PLAGUE", "FIELD", "visible-marks");
    plague.counters.plagueMarks = 4;
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    act(() => root.render(<GameBoard initialState={state} onRestart={() => undefined} />));
    expect(container.querySelector('[aria-label="瘟疫標記 4"]')?.textContent).toContain("4/ 6");
    const plagueZone = container.querySelector(`[data-instance-id="${plague.instanceId}"]`)?.closest(".field-zone");
    expect(plagueZone?.querySelectorAll(".slot")).toHaveLength(6);
    expect(container.querySelectorAll(".player-panel")).toHaveLength(2);
    const health = container.querySelector('[data-testid="player-health-P1"]')!;
    expect(health.textContent).toContain("生命8/30");
    expect(health.classList.contains("critical")).toBe(true);
    const inspect = container.querySelector<HTMLButtonElement>('[aria-label="檢視 黑暗之書 瘟疫典錄 卡牌資訊"]')!;
    act(() => inspect.click());
    expect(container.querySelector(".modal-plague-counter")?.textContent).toContain("瘟疫標記 4 / 6");
    act(() => root.unmount());
    container.remove();
  });

  it("固定雙方立場為7格，並在手牌只顯示費用、名稱與數值", () => {
    const state = mainState();
    state.players.P1.hand = [];
    const handCard = putCard(state, "P1", "DRAGON_001", "HAND", "summary-card");
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    act(() => root.render(<GameBoard initialState={state} onRestart={() => undefined} />));
    const fieldZones = container.querySelectorAll(".field-zone");
    expect(fieldZones).toHaveLength(2);
    expect([...container.querySelectorAll(".compact-zone")].every((zone) => zone.children[0]?.tagName === "H2" && zone.children[1]?.classList.contains("zone"))).toBe(true);
    expect(fieldZones[0].querySelectorAll(".slot")).toHaveLength(7);
    expect(fieldZones[1].querySelectorAll(".slot")).toHaveLength(7);
    expect(container.querySelector(".debug")?.closest(".utility-bar")).not.toBeNull();
    const hand = container.querySelector(`[data-instance-id="${handCard.instanceId}"]`)!;
    expect(hand.classList.contains("hand-card")).toBe(true);
    expect(hand.querySelector(".cost")?.textContent).toBe("2");
    expect(hand.querySelector("strong")?.textContent).toBe("聖印白龍");
    expect(hand.querySelector(".stats")?.textContent).toContain("1 / 2");
    expect(hand.querySelector(".effect")).toBeNull();
    expect(hand.querySelector("small")).toBeNull();
    act(() => root.unmount());
    container.remove();
  });

  it("將場上卡牌置中，並醒目顯示聖盾、封印與減傷狀態", () => {
    const state = mainState();
    const shielded = putCard(state, "P1", "ALLIANCE_005", "MINION", "status-shield");
    shielded.counters.damageCap = 3;
    const sealed = putCard(state, "P1", "DRAGON_001", "MINION", "status-sealed");
    sealed.sealed = true;
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    act(() => root.render(<GameBoard initialState={state} onRestart={() => undefined} />));
    const minionZone = container.querySelector(".active-side .minion-zone")!;
    expect(minionZone.querySelectorAll('[data-position="leading"]')).toHaveLength(2);
    expect(minionZone.querySelectorAll('[data-position="trailing"]')).toHaveLength(3);
    const card = container.querySelector(`[data-instance-id="${shielded.instanceId}"]`)!;
    expect(card.classList.contains("status-divine-shield")).toBe(true);
    expect(card.classList.contains("status-damage-cap")).toBe(true);
    expect(card.querySelector(".status-strip")?.textContent).toContain("聖盾術");
    expect(card.querySelector(".status-strip")?.textContent).toContain("減傷≤3");
    expect(container.querySelector(`[data-instance-id="${sealed.instanceId}"]`)?.classList.contains("status-sealed")).toBe(true);
    act(() => root.unmount());
    container.remove();
  });

  it("顯示陣營特殊紀錄、大型水晶與可隨時開啟的棄堆", () => {
    const state = mainState();
    const dragon = putCard(state, "P1", "DRAGON_001", "MINION", "grave-view");
    moveCard(state, dragon, "GRAVEYARD", "TEST");
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    act(() => root.render(<GameBoard initialState={state} onRestart={() => undefined} />));
    expect(container.querySelector(".active-side .mana-display")?.textContent).toContain("水晶10/10上限 10");
    expect(container.querySelector(".active-side .special-record")?.textContent).toContain("棄堆龍族1");
    const graveButton = container.querySelector<HTMLButtonElement>(".active-side .zone-count")!;
    act(() => graveButton.click());
    expect(container.querySelector('[aria-label="P1 棄堆"]')?.textContent).toContain("聖印白龍");
    act(() => root.unmount());
    container.remove();
  });

  it("效果召喚先提示玩家，確認後才召喚", () => {
    const state = mainState();
    state.players.P1.hand = [];
    const soldier = putCard(state, "P1", "DRAGON_010", "HAND", "confirm-ui");
    state.pendingChoice = { type: "EFFECT_SUMMON_CONFIRM", playerId: "P1", sourceInstanceId: soldier.instanceId, remainingEffects: [] };
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    act(() => root.render(<GameBoard initialState={state} onRestart={() => undefined} />));
    expect(container.querySelector(".effect-summon-confirm")?.textContent).toContain("赤焰的龍皇兵");
    const confirm = [...container.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent === "確認召喚")!;
    act(() => confirm.click());
    expect(container.querySelector(`[data-instance-id="${soldier.instanceId}"]`)?.closest(".minion-zone")).not.toBeNull();
    act(() => root.unmount());
    container.remove();
  });

  it("不朽典錄的死靈術屬於生長效果，主要階段不顯示發動按鈕", () => {
    const state = mainState();
    putCard(state, "P1", "TOKEN_UNDEAD_BOOK_IMMORTAL", "FIELD", "immortal-book-action");
    state.players.P1.resources.necromancy = 19;
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    act(() => root.render(<GameBoard initialState={state} onRestart={() => undefined} />));
    expect(container.textContent).not.toContain("發動 黑暗之書 不朽典錄");
    act(() => root.unmount());

    state.players.P1.resources.necromancy = 20;
    const readyRoot = createRoot(container);
    act(() => readyRoot.render(<GameBoard initialState={state} onRestart={() => undefined} />));
    const action = [...container.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent?.includes("發動 黑暗之書 不朽典錄"));
    expect(action).toBeUndefined();
    expect(container.querySelector(".board-actions")).toBeNull();
    act(() => readyRoot.unmount());
    container.remove();
  });

  it("機械玩家顯示6格立場，其他陣營維持7格", () => {
    const state = mainState();
    state.players.P1.faction = "MACHINE";
    state.players.P2.faction = "DRAGON";
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    act(() => root.render(<GameBoard initialState={state} onRestart={() => undefined} />));
    const activeField = container.querySelector(".active-side .field-zone")!;
    const opponentField = container.querySelector(".opponent-side .field-zone")!;
    expect(activeField.querySelector("h2")?.textContent).toContain("6 格");
    expect(activeField.querySelectorAll(".slot")).toHaveLength(6);
    expect(opponentField.querySelector("h2")?.textContent).toContain("7 格");
    expect(opponentField.querySelectorAll(".slot")).toHaveLength(7);
    act(() => root.unmount());
    container.remove();
  });
});
