// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { GameBoard } from "../../src/ui/GameBoard";
import { mainState, putCard } from "../helpers";

describe("英雄模式介面", () => {
  it("指定型英雄技能先標示合法目標，再由玩家點選發動", () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    const state = mainState();
    state.players.P1.hero = { id: "BRAVE", skillUses: 0, skillUsedThisTurn: false };
    state.players.P1.turnsStarted = 4;
    const target = putCard(state, "P1", "NEUTRAL_002", "MINION", "hero-ui-target");
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    act(() => root.render(<GameBoard initialState={state} onRestart={() => undefined} />));

    const skillButton = container.querySelector<HTMLButtonElement>("button.hero-power-button")!;
    expect(skillButton.closest(".hand-panel")).not.toBeNull();
    expect(skillButton.closest(".player-panel")).toBeNull();
    act(() => skillButton.click());
    expect(container.textContent).toContain("請點選英雄技能的目標");
    expect(container.querySelector(`[data-instance-id="${target.instanceId}"]`)?.classList.contains("drop-target")).toBe(true);
    act(() => (container.querySelector(`[data-instance-id="${target.instanceId}"] .card-surface`) as HTMLElement).click());

    const changed = container.querySelector(`[data-instance-id="${target.instanceId}"]`)!;
    expect(changed.textContent).toContain("3");
    expect(changed.textContent).toContain("4");
    expect(container.textContent).toContain("剩餘 3/4 次");
    expect(skillButton.getAttribute("aria-disabled")).toBe("true");
    expect(container.textContent).not.toContain("請點選英雄技能的目標");

    act(() => root.unmount());
    container.remove();
  });

  it("可長按查看技能規則，且拖曳技能至合法目標發動", () => {
    vi.useFakeTimers();
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    const state = mainState();
    state.players.P1.hero = { id: "BRAVE", skillUses: 0, skillUsedThisTurn: false };
    state.players.P1.turnsStarted = 4;
    const target = putCard(state, "P1", "NEUTRAL_002", "MINION", "hero-drag-target");
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    act(() => root.render(<GameBoard initialState={state} onRestart={() => undefined} />));

    const skillButton = container.querySelector<HTMLButtonElement>("button.hero-power-button")!;
    act(() => skillButton.dispatchEvent(new Event("pointerdown", { bubbles: true })));
    act(() => vi.advanceTimersByTime(600));
    expect(container.querySelector(".hero-power-control")?.classList.contains("info-open")).toBe(true);
    act(() => skillButton.dispatchEvent(new Event("pointerup", { bubbles: true })));

    const dataTransfer = { effectAllowed: "none", setData: vi.fn() };
    const dragStart = new Event("dragstart", { bubbles: true, cancelable: true });
    Object.defineProperty(dragStart, "dataTransfer", { value: dataTransfer });
    act(() => skillButton.dispatchEvent(dragStart));
    expect(container.textContent).toContain("請點選英雄技能的目標");

    const drop = new Event("drop", { bubbles: true, cancelable: true });
    Object.defineProperty(drop, "dataTransfer", { value: dataTransfer });
    act(() => container.querySelector(`[data-instance-id="${target.instanceId}"]`)!.dispatchEvent(drop));
    const changed = container.querySelector(`[data-instance-id="${target.instanceId}"]`)!;
    expect(changed.textContent).toContain("3");
    expect(changed.textContent).toContain("4");
    expect(skillButton.getAttribute("aria-disabled")).toBe("true");

    act(() => root.unmount());
    container.remove();
    vi.useRealTimers();
  });
});
