// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "../../src/app/App";

describe("瀏覽器入口流程", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    act(() => root.render(<App />));
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.useRealTimers();
  });

  function button(name: string): HTMLButtonElement {
    const result = [...container.querySelectorAll("button")].find((item) => item.textContent === name);
    if (!result) throw new Error(`找不到按鈕：${name}`);
    return result;
  }

  function click(target: HTMLElement) {
    act(() => target.dispatchEvent(new MouseEvent("click", { bubbles: true })));
  }

  it("可選擇任意已實裝陣營並以 0 張換牌進入第一回合", () => {
    const first = container.querySelector<HTMLSelectElement>('select[aria-label="先攻玩家陣營"]')!;
    const second = container.querySelector<HTMLSelectElement>('select[aria-label="後攻玩家陣營"]')!;

    act(() => {
      first.value = "MACHINE";
      first.dispatchEvent(new Event("change", { bubbles: true }));
      second.value = "ALLIANCE";
      second.dispatchEvent(new Event("change", { bubbles: true }));
    });
    click(button("建立對局"));

    expect(container.textContent).toContain("MULLIGAN · P1");
    click(button("確認換牌（0）"));
    expect(container.textContent).toContain("請交給 P2");
    click(button("已交接，顯示畫面"));
    expect(container.textContent).toContain("MULLIGAN · P2");
    click(button("確認換牌（0）"));
    expect(container.textContent).toContain("請交給 P1");
    click(button("已交接，顯示畫面"));

    expect(container.textContent).toContain("TURN 1 · MAIN");
    expect(container.textContent).toContain("P1 · MACHINE");
    expect(container.textContent).toContain("P2 · ALLIANCE");
    expect(container.textContent).toContain("手牌4");
    expect(container.textContent).toContain("牌庫31");
  });

  it("可選擇隨機 AI 模式，由 P2 自動完成換牌並維持 P1 視角", () => {
    vi.useFakeTimers();
    const mode = container.querySelector<HTMLSelectElement>('select[aria-label="對戰模式"]')!;
    act(() => {
      mode.value = "RANDOM_AI";
      mode.dispatchEvent(new Event("change", { bubbles: true }));
    });
    click(button("建立對局"));
    expect(container.textContent).toContain("MULLIGAN · P1");
    click(button("確認換牌（0）"));
    expect(container.textContent).toContain("AI 正在選擇起始手牌");
    act(() => vi.advanceTimersByTime(1_300));
    expect(container.textContent).toContain("TURN 1 · MAIN");
    expect(container.textContent).toContain("目前玩家P1");
    expect(container.textContent).toContain("對手玩家P2");
  });

  it("提供簡單、普通與困難三種 AI 難度", () => {
    const mode = container.querySelector<HTMLSelectElement>('select[aria-label="對戰模式"]')!;
    expect([...mode.options].map((option) => option.value)).toEqual([
      "LOCAL",
      "RANDOM_AI",
      "HEURISTIC_AI",
      "SEARCH_AI",
    ]);
  });
});
