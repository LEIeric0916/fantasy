import { describe, expect, it } from "vitest";
import { cardDefinitions, getCardDefinition, getMainDeckDefinitions, getRuleUndefinedInventory, validateCardData } from "../../src/game/cards/cardRegistry";
import { createCardInstance } from "../../src/game/state/CardInstance";

describe("卡牌资料", () => {
  it("完整载入五个 JSON 且 ID 唯一", () => {
    expect(cardDefinitions).toHaveLength(96);
    expect(new Set(cardDefinitions.map((card) => card.id)).size).toBe(96);
    expect(validateCardData().filter((issue) => issue.code === "DUPLICATE_ID")).toEqual([]);
  });

  it.each([["DRAGON", 40], ["UNDEAD", 40], ["MACHINE", 40], ["ALLIANCE", 35]] as const)(
    "%s 主牌张数严格使用资料值 %i",
    (faction, expected) => {
      expect(getMainDeckDefinitions(faction).reduce((sum, card) => sum + card.deckCount, 0)).toBe(expected);
    },
  );

  it("不会自动补齐联盟缺少的 5 张", () => {
    expect(getMainDeckDefinitions("ALLIANCE").reduce((sum, card) => sum + card.deckCount, 0)).toBe(35);
  });

  it("最后修正：皇家神骑士只消灭对手3手下", () => {
    const definition = cardDefinitions.find((card) => card.id === "ALLIANCE_012")!;
    expect(definition.effectsText).toContain("消滅對手3手下。協作15");
  });

  it("CardInstance 与不可变 CardDefinition 分离", () => {
    const definition = cardDefinitions.find((card) => card.id === "TOKEN_DRAGON_HELLFIRE")!;
    const instance = createCardInstance(definition, "P1", "HAND", "one");
    instance.currentHealth = 1;
    instance.keywords.splice(0, 1);
    expect(definition.health).toBe(5);
    expect(definition.keywords).toContain("TAUNT");
  });

  it("已补齐关键数值，notes 仍由资料验证器列出供审计", () => {
    const issues = validateCardData();
    expect(issues.some((issue) => issue.code === "NULL_REQUIRED_VALUE")).toBe(false);
    expect(issues.some((issue) => issue.code === "NOTES_PRESENT")).toBe(true);
    const card = cardDefinitions.find((item) => item.id === "TOKEN_MACHINE_PRIEST")!;
    expect(card.originalCost).toBe(2);
    expect(getRuleUndefinedInventory().some((issue) => issue.ruleId === "CARD_DATA_NULL")).toBe(false);
    expect(getRuleUndefinedInventory().filter((issue) => issue.ruleId === "CARD_DATA_NOTE")).toHaveLength(77);
  });

  it("最后修正：九张衍生牌费用完整", () => {
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
