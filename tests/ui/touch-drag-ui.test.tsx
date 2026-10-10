// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vitest";
import { GameBoard } from "../../src/ui/GameBoard";
import { mainState, putCard } from "../helpers";

function pointerEvent(type: string, x: number, y: number, pointerType = "touch") {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperties(event, {
    pointerType: { value: pointerType },
    pointerId: { value: 1 },
    clientX: { value: x },
    clientY: { value: y },
  });
  return event;
}

describe("手機觸控拖曳", () => {
  it("電腦從卡面按鈕開始拖曳時也能正常出牌", () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    const state = mainState();
    const card = putCard(state, "P1", "NEUTRAL_002", "HAND", "mouse-card-surface-play");
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    act(() => root.render(<GameBoard initialState={state} onRestart={() => undefined} />));

    const cardElement = container.querySelector<HTMLElement>(`[data-instance-id="${card.instanceId}"]`)!;
    const cardSurface = cardElement.querySelector<HTMLButtonElement>(".card-surface")!;
    const activeSide = container.querySelector<HTMLElement>(".active-side")!;
    const originalElementFromPoint = document.elementFromPoint;
    Object.defineProperty(document, "elementFromPoint", { configurable: true, value: () => activeSide });

    expect(cardElement.draggable).toBe(false);
    expect(cardSurface.draggable).toBe(false);
    act(() => cardSurface.dispatchEvent(pointerEvent("pointerdown", 50, 600, "mouse")));
    act(() => cardSurface.dispatchEvent(pointerEvent("pointermove", 50, 520, "mouse")));
    expect(activeSide.classList.contains("hand-play-drop-zone")).toBe(true);
    act(() => cardSurface.dispatchEvent(pointerEvent("pointerup", 50, 420, "mouse")));

    expect(container.querySelector(`.active-side .minion-zone [data-instance-id="${card.instanceId}"]`)).not.toBeNull();
    expect(container.querySelector(`.hand [data-instance-id="${card.instanceId}"]`)).toBeNull();

    Object.defineProperty(document, "elementFromPoint", { configurable: true, value: originalElementFromPoint });
    act(() => root.unmount());
    container.remove();
  });

  it("把可出的手牌拖到我方場地後會正常出牌", () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    const state = mainState();
    const card = putCard(state, "P1", "NEUTRAL_002", "HAND", "touch-play");
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    act(() => root.render(<GameBoard initialState={state} onRestart={() => undefined} />));

    const cardElement = container.querySelector<HTMLElement>(`[data-instance-id="${card.instanceId}"]`)!;
    const activeSide = container.querySelector<HTMLElement>(".active-side")!;
    const originalElementFromPoint = document.elementFromPoint;
    Object.defineProperty(document, "elementFromPoint", { configurable: true, value: () => activeSide });

    act(() => cardElement.dispatchEvent(pointerEvent("pointerdown", 50, 600)));
    act(() => cardElement.dispatchEvent(pointerEvent("pointermove", 50, 520)));
    expect(cardElement.classList.contains("selected")).toBe(true);
    act(() => cardElement.dispatchEvent(pointerEvent("pointerup", 50, 420)));

    expect(container.querySelector(`.active-side .minion-zone [data-instance-id="${card.instanceId}"]`)).not.toBeNull();
    expect(container.querySelector(`.hand [data-instance-id="${card.instanceId}"]`)).toBeNull();

    Object.defineProperty(document, "elementFromPoint", { configurable: true, value: originalElementFromPoint });
    act(() => root.unmount());
    container.remove();
  });

  it("電腦可用手牌上的打出按鈕直接出牌", () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    const state = mainState();
    const card = putCard(state, "P1", "NEUTRAL_002", "HAND", "click-play");
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    act(() => root.render(<GameBoard initialState={state} onRestart={() => undefined} />));

    const playButton = container.querySelector<HTMLButtonElement>(`[data-instance-id="${card.instanceId}"] .play-card`)!;
    expect(playButton.textContent).toBe("打出");
    act(() => playButton.click());

    expect(container.querySelector(`.active-side .minion-zone [data-instance-id="${card.instanceId}"]`)).not.toBeNull();
    expect(container.querySelector(`.hand [data-instance-id="${card.instanceId}"]`)).toBeNull();

    act(() => root.unmount());
    container.remove();
  });
});
