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

  function changeSelect(label: string, value: string) {
    const select = container.querySelector<HTMLSelectElement>(`select[aria-label="${label}"]`)!;
    act(() => {
      select.value = value;
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    return select;
  }

  it("可選擇任意已實裝陣營並以 0 張換牌進入第一回合", () => {
    const first = container.querySelector<HTMLSelectElement>('select[aria-label="P1 玩家陣營"]')!;
    const second = container.querySelector<HTMLSelectElement>('select[aria-label="P2 玩家陣營"]')!;
    const starting = container.querySelector<HTMLSelectElement>('select[aria-label="先攻設定"]')!;

    act(() => {
      first.value = "MACHINE";
      first.dispatchEvent(new Event("change", { bubbles: true }));
      second.value = "ALLIANCE";
      second.dispatchEvent(new Event("change", { bubbles: true }));
      starting.value = "P1";
      starting.dispatchEvent(new Event("change", { bubbles: true }));
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
    changeSelect("對戰模式", "RANDOM_AI");
    changeSelect("先攻設定", "P1");
    click(button("建立對局"));
    expect(container.textContent).toContain("MULLIGAN · P1");
    click(button("確認換牌（0）"));
    expect(container.textContent).toContain("AI 正在選擇起始手牌");
    act(() => vi.advanceTimersByTime(2_100));
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
      "WATCH_AI_HEURISTIC",
    ]);
  });

  it("可選擇 AI vs AI 觀戰模式，雙方自動完成換牌", () => {
    vi.useFakeTimers();
    changeSelect("對戰模式", "WATCH_AI_HEURISTIC");
    changeSelect("先攻設定", "P1");

    click(button("建立對局"));
    expect(container.textContent).toContain("AI 正在選擇起始手牌");
    expect(container.textContent).toContain("困難 AI · P1");

    act(() => vi.advanceTimersByTime(2_100));
    expect(container.textContent).toContain("困難 AI · P2");

    act(() => vi.advanceTimersByTime(2_100));
    expect(container.textContent).toContain("TURN 1 · MAIN");
    expect(container.textContent).toContain("目前玩家P1");
  });

  it("AI vs AI 觀戰模式可暫停與繼續自動行動", () => {
    vi.useFakeTimers();
    changeSelect("對戰模式", "WATCH_AI_HEURISTIC");
    changeSelect("先攻設定", "P1");

    click(button("建立對局"));
    click(button("暫停AI"));
    expect(container.textContent).toContain("AI 已暫停");
    expect(container.textContent).toContain("困難 AI · P1");

    act(() => vi.advanceTimersByTime(2_100));
    expect(container.textContent).toContain("困難 AI · P1");

    click(button("開始AI"));
    act(() => vi.advanceTimersByTime(2_100));
    expect(container.textContent).toContain("困難 AI · P2");
  });

  it("AI vs AI 觀戰模式可選擇固定視角並手動切換", () => {
    vi.useFakeTimers();
    changeSelect("對戰模式", "WATCH_AI_HEURISTIC");
    const spectator = container.querySelector<HTMLSelectElement>('select[aria-label="觀戰視角"]')!;
    expect([...spectator.options].map((option) => option.value)).toEqual(["FOLLOW_ACTION", "FIXED"]);
    changeSelect("觀戰視角", "FIXED");
    changeSelect("先攻設定", "P1");

    click(button("建立對局"));
    expect(container.textContent).toContain("目前固定視角：P1");
    click(button("切換到P2視角"));
    expect(container.textContent).toContain("目前固定視角：P2");

    act(() => vi.advanceTimersByTime(2_100));
    act(() => vi.advanceTimersByTime(2_100));
    expect(container.textContent).toContain("TURN 1 · MAIN");
    expect(container.textContent).toContain("固定視角：P2");
    expect(container.textContent).toContain("目前玩家P2");
  });

  it("可選擇隨機先攻", () => {
    const random = vi.spyOn(Math, "random").mockReturnValue(0.75);
    const starting = container.querySelector<HTMLSelectElement>('select[aria-label="先攻設定"]')!;
    expect([...starting.options].map((option) => option.value)).toEqual(["RANDOM", "P1", "P2"]);

    click(button("建立對局"));

    expect(container.textContent).toContain("MULLIGAN · P1");
    click(button("確認換牌（0）"));
    expect(container.textContent).toContain("請交給 P2");
    click(button("已交接，顯示畫面"));
    expect(container.textContent).toContain("MULLIGAN · P2");
    click(button("確認換牌（0）"));
    expect(container.textContent).toContain("請交給 P2");
    click(button("已交接，顯示畫面"));
    expect(container.textContent).toContain("TURN 1 · MAIN");
    expect(container.textContent).toContain("目前玩家P2");
    random.mockRestore();
  });
});
