// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import App from "../../src/app/App";

describe("浏览器入口流程", () => {
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
  });

  function button(name: string): HTMLButtonElement {
    const result = [...container.querySelectorAll("button")].find((item) => item.textContent === name);
    if (!result) throw new Error(`找不到按钮：${name}`);
    return result;
  }

  function click(target: HTMLElement) {
    act(() => target.dispatchEvent(new MouseEvent("click", { bubbles: true })));
  }

  it("可选择任意已实装阵营并以 0 张换牌进入第一回合", () => {
    const first = container.querySelector<HTMLSelectElement>('select[aria-label="先攻玩家阵营"]')!;
    const second = container.querySelector<HTMLSelectElement>('select[aria-label="后攻玩家阵营"]')!;

    act(() => {
      first.value = "MACHINE";
      first.dispatchEvent(new Event("change", { bubbles: true }));
      second.value = "ALLIANCE";
      second.dispatchEvent(new Event("change", { bubbles: true }));
    });
    click(button("建立对局"));

    expect(container.textContent).toContain("MULLIGAN · P1");
    click(button("确认换牌（0）"));
    expect(container.textContent).toContain("请交给 P2");
    click(button("已交接，显示画面"));
    expect(container.textContent).toContain("MULLIGAN · P2");
    click(button("确认换牌（0）"));
    expect(container.textContent).toContain("请交给 P1");
    click(button("已交接，显示画面"));

    expect(container.textContent).toContain("TURN 1 · MAIN");
    expect(container.textContent).toContain("P1 · MACHINE");
    expect(container.textContent).toContain("P2 · ALLIANCE");
    expect(container.textContent).toContain("手牌 4");
    expect(container.textContent).toContain("牌库 31");
  });
});
