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

  function drag(source: HTMLElement, target: HTMLElement) {
    const dataTransfer = { effectAllowed: "none", dropEffect: "none", setData: () => undefined };
    const dragStart = new Event("dragstart", { bubbles: true });
    Object.defineProperty(dragStart, "dataTransfer", { value: dataTransfer });
    act(() => source.dispatchEvent(dragStart));
    const drop = new Event("drop", { bubbles: true });
    Object.defineProperty(drop, "dataTransfer", { value: dataTransfer });
    act(() => target.dispatchEvent(drop));
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
    expect(container.textContent).toContain("牌庫34");
  });

  it("P1 與 P2 陣營選單都能選擇隨機陣營", () => {
    const random = vi.spyOn(Math, "random")
      .mockReturnValueOnce(0.01)
      .mockReturnValueOnce(0.74);
    const first = changeSelect("P1 玩家陣營", "RANDOM");
    const second = changeSelect("P2 玩家陣營", "RANDOM");
    changeSelect("先攻設定", "P1");
    expect([...first.options].map((option) => option.value)).toEqual(["RANDOM", "DRAGON", "UNDEAD", "MACHINE", "ALLIANCE"]);
    expect([...second.options].map((option) => option.value)).toEqual(["RANDOM", "DRAGON", "UNDEAD", "MACHINE", "ALLIANCE"]);

    click(button("建立對局"));
    click(button("確認換牌（0）"));
    click(button("已交接，顯示畫面"));
    click(button("確認換牌（0）"));
    click(button("已交接，顯示畫面"));

    expect(container.textContent).toContain("P1 · DRAGON");
    expect(container.textContent).toContain("P2 · MACHINE");
    random.mockRestore();
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

  it("新手教學第一關會依序介紹介面並等待玩家拖曳皇家衛兵出牌", () => {
    changeSelect("遊玩類型", "TUTORIAL");
    changeSelect("教學關卡", "1");
    expect(container.querySelector('select[aria-label="P1 玩家陣營"]')).toBeNull();
    expect(container.querySelector('select[aria-label="對戰模式"]')).toBeNull();
    click(button("開始教學"));

    expect(container.textContent).toContain("新手教學 · 第一關");
    expect(container.textContent).toContain("場地區：手下與立場");
    for (const expected of ["配置：牌組與手牌", "玩家資訊區", "先看看你的手牌", "查看卡牌詳細資訊"]) {
      click(container.querySelector<HTMLElement>(".tutorial-overlay")!);
      expect(container.textContent).toContain(expected);
    }

    expect(container.textContent).toContain("皇家衛兵");
    expect(container.textContent).toContain("1/1");
    const inspectButton = container.querySelector<HTMLButtonElement>('button[aria-label="檢視 皇家衛兵 卡牌資訊"]')!;
    click(inspectButton);
    expect(container.textContent).toContain("點擊資訊欄外任意一處即可關閉");
    click(container.querySelector<HTMLElement>(".card-modal-backdrop")!);
    expect(container.textContent).toContain("確認費用與水晶");
    click(container.querySelector<HTMLElement>(".tutorial-overlay")!);
    expect(container.textContent).toContain("請親自打出皇家衛兵");

    const handCard = container.querySelector<HTMLElement>('[data-instance-id="tutorial-royal-guard"]')!;
    expect(handCard.getAttribute("draggable")).toBe("true");
    const dataTransfer = { effectAllowed: "none", dropEffect: "none", setData: () => undefined };
    const dragStart = new Event("dragstart", { bubbles: true });
    Object.defineProperty(dragStart, "dataTransfer", { value: dataTransfer });
    act(() => handCard.dispatchEvent(dragStart));
    const activeSide = container.querySelector<HTMLElement>(".active-side")!;
    const drop = new Event("drop", { bubbles: true });
    Object.defineProperty(drop, "dataTransfer", { value: dataTransfer });
    act(() => activeSide.dispatchEvent(drop));

    expect(container.textContent).toContain("皇家衛兵已經進場");
    expect(container.querySelector('.minion-zone [data-instance-id="tutorial-royal-guard"]')).not.toBeNull();
    click(container.querySelector<HTMLElement>(".tutorial-overlay")!);
    expect(container.textContent).toContain("第一關完成！");
  });

  it("新手教學第二關會完整引導出牌、嘲諷、衝刺、反擊、衝鋒與勝利", () => {
    changeSelect("遊玩類型", "TUTORIAL");
    changeSelect("教學關卡", "2");
    click(button("開始教學"));

    expect(container.textContent).toContain("新手教學 · 第二關");
    expect(container.textContent).toContain("認識戰士學徒");
    expect(container.textContent).toContain("生命2/30");
    expect(container.textContent).toContain("生命6/30");
    for (const expected of ["攻擊力", "生命值", "請打出戰士學徒"]) {
      click(container.querySelector<HTMLElement>(".tutorial-overlay")!);
      expect(container.textContent).toContain(expected);
    }

    drag(container.querySelector<HTMLElement>('[data-instance-id="tutorial-warrior-apprentice"]')!, container.querySelector<HTMLElement>(".active-side")!);
    expect(container.textContent).toContain("召喚回合不能攻擊");
    click(container.querySelector<HTMLElement>(".tutorial-overlay")!);
    expect(container.textContent).toContain("請結束回合");
    click(button("結束回合"));

    expect(container.textContent).toContain("嘲諷會保護其他目標");
    expect(container.querySelector('[data-instance-id="tutorial-guard-apprentice"]')).not.toBeNull();
    click(container.querySelector<HTMLElement>(".tutorial-overlay")!);
    expect(container.textContent).toContain("輪到我方並抽牌");
    click(container.querySelector<HTMLElement>(".tutorial-overlay")!);
    expect(container.textContent).toContain("請查看騎士學徒");
    click(container.querySelector<HTMLButtonElement>('button[aria-label="檢視 騎士學徒 卡牌資訊"]')!);
    expect(container.textContent).toContain("點擊資訊欄外任意一處即可關閉");
    click(container.querySelector<HTMLElement>(".card-modal-backdrop")!);
    expect(container.textContent).toContain("衝刺");
    click(container.querySelector<HTMLElement>(".tutorial-overlay")!);
    expect(container.textContent).toContain("請打出騎士學徒");
    drag(container.querySelector<HTMLElement>('[data-instance-id="tutorial-knight-apprentice"]')!, container.querySelector<HTMLElement>(".active-side")!);

    expect(container.textContent).toContain("發光代表可以行動");
    click(container.querySelector<HTMLElement>(".tutorial-overlay")!);
    expect(container.textContent).toContain("用騎士學徒攻擊守備學徒");
    drag(container.querySelector<HTMLElement>('[data-instance-id="tutorial-knight-apprentice"]')!, container.querySelector<HTMLElement>('[data-instance-id="tutorial-guard-apprentice"]')!);
    expect(container.textContent).toContain("守備學徒被消滅");
    click(container.querySelector<HTMLElement>(".tutorial-overlay")!);
    expect(container.textContent).toContain("手下會反擊");
    click(container.querySelector<HTMLElement>(".tutorial-overlay")!);
    expect(container.textContent).toContain("用戰士學徒攻擊對手");
    drag(container.querySelector<HTMLElement>('[data-instance-id="tutorial-warrior-apprentice"]')!, container.querySelector<HTMLElement>(".opponent-side .player-panel")!);

    expect(container.textContent).toContain("請再次結束回合");
    click(button("結束回合"));
    expect(container.textContent).toContain("對手打出騎士學徒");
    click(container.querySelector<HTMLElement>(".tutorial-overlay")!);
    expect(container.textContent).toContain("戰士學徒被消滅");
    expect(container.querySelector('.minion-zone [data-instance-id="tutorial-warrior-apprentice"]')).toBeNull();
    click(container.querySelector<HTMLElement>(".tutorial-overlay")!);
    expect(container.textContent).toContain("抽到刺客學徒");
    click(container.querySelector<HTMLElement>(".tutorial-overlay")!);
    expect(container.textContent).toContain("請查看刺客學徒");
    click(container.querySelector<HTMLButtonElement>('button[aria-label="檢視 刺客學徒 卡牌資訊"]')!);
    click(container.querySelector<HTMLElement>(".card-modal-backdrop")!);
    expect(container.textContent).toContain("衝鋒");
    click(container.querySelector<HTMLElement>(".tutorial-overlay")!);
    expect(container.textContent).toContain("請打出刺客學徒");
    drag(container.querySelector<HTMLElement>('[data-instance-id="tutorial-assassin-apprentice"]')!, container.querySelector<HTMLElement>(".active-side")!);

    expect(container.textContent).toContain("刺客學徒攻擊對手");
    drag(container.querySelector<HTMLElement>('[data-instance-id="tutorial-assassin-apprentice"]')!, container.querySelector<HTMLElement>(".opponent-side .player-panel")!);
    expect(container.textContent).toContain("騎士學徒攻擊對手");
    drag(container.querySelector<HTMLElement>('[data-instance-id="tutorial-knight-apprentice"]')!, container.querySelector<HTMLElement>(".opponent-side .player-panel")!);
    expect(container.textContent).toContain("第二關完成！");
    expect(container.textContent).toContain("P1 獲勝");
  });

  it("新手教學第三關會教玩家施放一般法術，再打出立場", () => {
    changeSelect("遊玩類型", "TUTORIAL");
    changeSelect("教學關卡", "3");
    click(button("開始教學"));

    expect(container.textContent).toContain("新手教學 · 第三關");
    expect(container.textContent).toContain("法術分為一般法術與立場");
    click(container.querySelector<HTMLElement>(".tutorial-overlay")!);
    expect(container.textContent).toContain("魔法知識");
    click(container.querySelector<HTMLElement>(".tutorial-overlay")!);
    expect(container.textContent).toContain("請打出魔法知識");

    const magicKnowledge = container.querySelector<HTMLElement>('[data-instance-id="tutorial-magic-knowledge"]')!;
    expect(magicKnowledge.getAttribute("draggable")).toBe("true");
    const spellTransfer = { effectAllowed: "none", dropEffect: "none", setData: () => undefined };
    const spellDragStart = new Event("dragstart", { bubbles: true });
    Object.defineProperty(spellDragStart, "dataTransfer", { value: spellTransfer });
    act(() => magicKnowledge.dispatchEvent(spellDragStart));
    const activeSide = container.querySelector<HTMLElement>(".active-side")!;
    const spellDrop = new Event("drop", { bubbles: true });
    Object.defineProperty(spellDrop, "dataTransfer", { value: spellTransfer });
    act(() => activeSide.dispatchEvent(spellDrop));

    expect(container.textContent).toContain("法術效果已經結算");
    expect(container.textContent).toContain("機械帝國兵工廠");
    for (const expected of ["立場會留在立場區", "查看機械帝國兵工廠", "請打出機械帝國兵工廠"]) {
      click(container.querySelector<HTMLElement>(".tutorial-overlay")!);
      expect(container.textContent).toContain(expected);
    }

    const arsenal = container.querySelector<HTMLElement>('.hand [data-instance-id]')!;
    expect(arsenal.getAttribute("draggable")).toBe("true");
    const fieldTransfer = { effectAllowed: "none", dropEffect: "none", setData: () => undefined };
    const fieldDragStart = new Event("dragstart", { bubbles: true });
    Object.defineProperty(fieldDragStart, "dataTransfer", { value: fieldTransfer });
    act(() => arsenal.dispatchEvent(fieldDragStart));
    const fieldDrop = new Event("drop", { bubbles: true });
    Object.defineProperty(fieldDrop, "dataTransfer", { value: fieldTransfer });
    act(() => activeSide.dispatchEvent(fieldDrop));

    expect(container.textContent).toContain("入場曲召喚了手下");
    expect(container.textContent).toContain("機械帝國士兵");
    expect(container.querySelector('.field-zone [data-instance-id]')).not.toBeNull();
    expect(container.querySelector('.minion-zone [data-instance-id]')).not.toBeNull();
    click(container.querySelector<HTMLElement>(".tutorial-overlay")!);
    expect(container.textContent).toContain("第三關完成！");
  });

  it("可從起始頁面開啟卡表、篩選卡牌並查看詳細資訊", () => {
    click(button("查看卡表"));
    expect(container.textContent).toContain("CARD LIBRARY");
    expect(container.textContent).toContain("卡表");
    expect(container.textContent).toContain("選擇一副牌查看卡表");

    click(container.querySelector<HTMLButtonElement>('button[aria-label="查看龍族牌組"]')!);
    expect(container.textContent).toContain("赤焰的龍皇兵");

    click(container.querySelector<HTMLButtonElement>('button[aria-label="查看機械牌組"]')!);
    expect(container.textContent).toContain("機械帝國遊騎兵");
    expect(container.textContent).not.toContain("赤焰的龍皇兵");
    expect(container.textContent).toContain("牌組卡");
    expect(container.textContent).toContain("預備卡表");
    expect(container.textContent).toContain("暫時從主牌組下放的卡牌；不計入正式牌組張數");
    expect(container.textContent).toContain("衍生卡");
    expect(container.textContent).toContain("機械帝國士兵");

    click(container.querySelector<HTMLButtonElement>('button[aria-label="檢視 機械帝國遊騎兵"]')!);
    expect(container.querySelector('[role="dialog"]')?.getAttribute("aria-label")).toBe("機械帝國遊騎兵 卡牌資訊");
    click(button("衝刺"));
    expect(container.querySelector('[aria-label="衝刺規則提示"]')?.textContent).toContain("進場當回合不能攻擊玩家");
    click(container.querySelector<HTMLButtonElement>('button[aria-label="關閉衝刺規則提示"]')!);
    click(button("機械術"));
    expect(container.querySelector('[aria-label="機械術規則提示"]')?.textContent).toContain("回收充能");
    click(container.querySelector<HTMLButtonElement>('button[aria-label="關閉機械術規則提示"]')!);
    expect(container.textContent).toContain("相關卡牌");
    expect(container.textContent).toContain("機械士兵製造艙");
    click(container.querySelector<HTMLButtonElement>('button[aria-label="查看關聯卡 機械士兵製造艙"]')!);
    expect(container.querySelector('[role="dialog"]')?.getAttribute("aria-label")).toBe("機械士兵製造艙 卡牌資訊");
    expect(container.textContent).toContain("產生此牌");
    click(button("×"));
    click(button("返回起始頁面"));
    expect(container.textContent).toContain("建立對局");
  });

  it("可從起始頁面開啟專有名詞圖鑑並依分類查看詳細規則", () => {
    click(button("專有名詞圖鑑"));
    expect(container.textContent).toContain("RULE GLOSSARY");
    expect(container.textContent).toContain("專有名詞圖鑑");
    expect(container.textContent).toContain("聖盾術");
    expect(container.textContent).toContain("詳細規則");

    click(button("牌組機制"));
    expect(container.textContent).toContain("機械術");
    expect(container.textContent).toContain("死靈術");
    expect(container.textContent).not.toContain("聖盾術");

    click(button("返回起始頁面"));
    expect(container.textContent).toContain("建立對局");
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
