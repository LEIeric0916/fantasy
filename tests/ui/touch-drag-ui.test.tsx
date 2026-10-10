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
  it("詳細按鈕不被卡牌指標擷取攔截，手牌能開啟資訊", () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    const state = mainState();
    const card = putCard(state, "P1", "NEUTRAL_002", "HAND", "inspect-pointer");
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    act(() => root.render(<GameBoard initialState={state} onRestart={() => undefined} />));
    const cardElement = container.querySelector<HTMLElement>(`[data-instance-id="${card.instanceId}"]`)!;
    let captures = 0;
    cardElement.setPointerCapture = () => { captures += 1; };
    const inspect = cardElement.querySelector<HTMLButtonElement>(".inspect-card")!;
    act(() => inspect.dispatchEvent(pointerEvent("pointerdown", 50, 600, "mouse")));
    act(() => inspect.dispatchEvent(pointerEvent("pointerup", 50, 600, "mouse")));
    expect(captures).toBe(0);
    act(() => inspect.click());
    expect(container.querySelector(".card-modal-backdrop")).not.toBeNull();
    act(() => root.unmount());
    container.remove();
  });

  for (const pointerType of ["mouse", "touch"]) {
    for (const destination of ["minion", "hero", "invalid"]) {
      it(`${pointerType}拖曳攻擊${destination}能正確判定目標`, () => {
        (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
        const state = mainState();
        const attacker = putCard(state, "P1", "NEUTRAL_002", "MINION", "drag-attacker");
        const defender = putCard(state, "P2", "NEUTRAL_002", "MINION", "drag-defender");
        const container = document.createElement("div");
        document.body.append(container);
        const root = createRoot(container);
        act(() => root.render(<GameBoard initialState={state} onRestart={() => undefined} />));
        const surface = container.querySelector<HTMLElement>(`[data-instance-id="${attacker.instanceId}"] .card-surface`)!;
        const target = destination === "minion"
          ? container.querySelector(`[data-instance-id="${defender.instanceId}"] .card-surface`)!
          : container.querySelector(destination === "hero" ? ".opponent-side .player-panel" : ".active-side .player-panel")!;
        const originalElementFromPoint = document.elementFromPoint;
        Object.defineProperty(document, "elementFromPoint", { configurable: true, value: () => target });
        act(() => surface.dispatchEvent(pointerEvent("pointerdown", 50, 420, pointerType)));
        act(() => surface.dispatchEvent(pointerEvent("pointermove", 50, 350, pointerType)));
        act(() => surface.dispatchEvent(pointerEvent("pointerup", 50, 220, pointerType)));
        const hp = container.querySelector(`[data-instance-id="${defender.instanceId}"] .health-stat b`)!;
        expect(hp.textContent).toBe(destination === "minion" ? "1" : "3");
        expect(container.querySelector('[data-testid="player-health-P2"] b')?.textContent).toBe(destination === "hero" ? "28" : "30");
        expect(container.querySelector(`[data-instance-id="${attacker.instanceId}"] .attack-card`) !== null).toBe(destination === "invalid");
        Object.defineProperty(document, "elementFromPoint", { configurable: true, value: originalElementFromPoint });
        act(() => root.unmount());
        container.remove();
      });
    }
  }

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
