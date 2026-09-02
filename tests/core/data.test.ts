import { describe, expect, it } from "vitest";
import { cardDefinitions, getCardDefinition, getMainDeckDefinitions, getRuleUndefinedInventory, isCardImplemented, validateCardData } from "../../src/game/cards/cardRegistry";
import { createCardInstance } from "../../src/game/state/CardInstance";

describe("卡牌資料", () => {
  it("完整載入五個 JSON 且 ID 唯一", () => {
    expect(cardDefinitions).toHaveLength(96);
    expect(new Set(cardDefinitions.map((card) => card.id)).size).toBe(96);
    expect(validateCardData().filter((issue) => issue.code === "DUPLICATE_ID")).toEqual([]);
  });

  it.each([["DRAGON", 40], ["UNDEAD", 40], ["MACHINE", 40], ["ALLIANCE", 35]] as const)(
    "%s 主牌張數嚴格使用資料值 %i",
    (faction, expected) => {
      expect(getMainDeckDefinitions(faction).reduce((sum, card) => sum + card.deckCount, 0)).toBe(expected);
    },
  );

  it("不會自動補齊聯盟缺少的 5 張", () => {
    expect(getMainDeckDefinitions("ALLIANCE").reduce((sum, card) => sum + card.deckCount, 0)).toBe(35);
  });

  it("最後修正：皇家神騎士消滅對手最多3手下", () => {
    const definition = cardDefinitions.find((card) => card.id === "ALLIANCE_012")!;
    expect(definition.effectsText).toContain("消滅對手最多3手下。協作20");
  });

  it("CardInstance 與不可變 CardDefinition 分離", () => {
    const definition = cardDefinitions.find((card) => card.id === "TOKEN_DRAGON_HELLFIRE")!;
    const instance = createCardInstance(definition, "P1", "HAND", "one");
    instance.currentHealth = 1;
    instance.keywords.splice(0, 1);
    expect(definition.health).toBe(5);
    expect(definition.keywords).toContain("TAUNT");
  });

  it("已補齊關鍵數值，notes 仍由資料驗證器列出供審計", () => {
    const issues = validateCardData();
    expect(issues.some((issue) => issue.code === "NULL_REQUIRED_VALUE")).toBe(false);
    expect(issues.some((issue) => issue.code === "NOTES_PRESENT")).toBe(true);
    const card = cardDefinitions.find((item) => item.id === "TOKEN_MACHINE_PRIEST")!;
    expect(card.originalCost).toBe(2);
    expect(getRuleUndefinedInventory().some((issue) => issue.ruleId === "CARD_DATA_NULL")).toBe(false);
    expect(getRuleUndefinedInventory().filter((issue) => issue.ruleId === "CARD_DATA_NOTE")).toHaveLength(76);
  });

  it("卡牌文字中的主要關鍵效果都有可執行資料", () => {
    expect(validateCardData().filter((issue) => issue.code === "MISSING_EFFECT_IMPLEMENTATION")).toEqual([]);
    expect(cardDefinitions.filter((card) => !isCardImplemented(card)).map((card) => card.id)).toEqual([]);
  });

  it("機械牌的神器範圍使用神器立場，而不是機械手下", () => {
    for (const id of ["MACHINE_005", "MACHINE_008", "MACHINE_012", "TOKEN_MACHINE_ARTIFACT_BOX", "TOKEN_MACHINE_CUBE", "TOKEN_MACHINE_ATTACK_SHIP", "TOKEN_MACHINE_SOLDIER_BAY", "TOKEN_MACHINE_GEAR"]) {
      const definition = getCardDefinition(id);
      expect(definition.cardType, id).toBe("FIELD");
      expect(definition.subtype, id).toContain("ARTIFACT");
      expect(definition.subtype, id).not.toContain("MACHINE");
    }
    expect(getCardDefinition("MACHINE_007").subtype).toContain("ARTIFACT_SPELL");
    expect(getCardDefinition("MACHINE_014").dynamicCost).toEqual({ type: "FRIENDLY_FIELD_SUBTYPE_COUNT", subtype: "ARTIFACT" });
  });

  it("最後修正：九張衍生牌費用完整", () => {
    expect(getCardDefinition("TOKEN_MACHINE_GEAR").originalCost).toBe(1);
    expect(getCardDefinition("TOKEN_MACHINE_SOLDIER_BAY").originalCost).toBe(3);
    for (const id of [
      "TOKEN_MACHINE_PRIEST",
      "TOKEN_MACHINE_ATTACK_SHIP",
      "TOKEN_UNDEAD_BOOK_IMMORTAL",
      "TOKEN_UNDEAD_BOOK_PLAGUE",
      "TOKEN_UNDEAD_BOOK_REVENGE",
      "TOKEN_UNDEAD_BOOK_DOOM_PRELUDE",
      "TOKEN_UNDEAD_DOOMSDAY_BOOK",
    ]) expect(getCardDefinition(id).originalCost).toBe(2);
  });
});
