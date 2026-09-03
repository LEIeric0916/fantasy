import { describe, expect, it } from "vitest";
import { cardDefinitions, getCardDefinition, getMainDeckDefinitions, getRuleUndefinedInventory, isCardImplemented, validateCardData } from "../../src/game/cards/cardRegistry";
import { createCardInstance } from "../../src/game/state/CardInstance";

describe("卡牌資料", () => {
  it("完整載入六個 JSON 且 ID 唯一", () => {
    expect(cardDefinitions).toHaveLength(104);
    expect(new Set(cardDefinitions.map((card) => card.id)).size).toBe(104);
    expect(validateCardData().filter((issue) => issue.code === "DUPLICATE_ID")).toEqual([]);
  });

  it("中立牌堆載入魔法知識並連接抽牌效果", () => {
    const card = getCardDefinition("NEUTRAL_001");
    expect(card.name).toBe("魔法知識");
    expect(card.faction).toBe("NEUTRAL");
    expect(card.cardType).toBe("SPELL");
    expect(card.originalCost).toBe(1);
    expect(card.effects).toEqual([{ type: "DRAW", value: 1 }]);
  });

  it("中立牌堆包含戰鬥教學使用的四種學徒", () => {
    expect(["NEUTRAL_002", "NEUTRAL_003", "NEUTRAL_004", "NEUTRAL_005"].map((id) => {
      const card = getCardDefinition(id);
      return [card.name, card.originalCost, card.attack, card.health, card.keywords];
    })).toEqual([
      ["戰士學徒", 2, 2, 3, []],
      ["守備學徒", 2, 1, 3, ["TAUNT"]],
      ["騎士學徒", 3, 3, 2, ["RUSH"]],
      ["刺客學徒", 4, 3, 3, ["CHARGE"]],
    ]);
  });

  it.each([["DRAGON", 40], ["UNDEAD", 40], ["MACHINE", 40], ["ALLIANCE", 38]] as const)(
    "%s 主牌張數嚴格使用資料值 %i",
    (faction, expected) => {
      expect(getMainDeckDefinitions(faction).reduce((sum, card) => sum + card.deckCount, 0)).toBe(expected);
    },
  );

  it("不會自動補齊聯盟缺少的 2 張", () => {
    expect(getMainDeckDefinitions("ALLIANCE").reduce((sum, card) => sum + card.deckCount, 0)).toBe(38);
  });

  it("最後修正：皇家神騎士消滅對手最多3手下", () => {
    const definition = cardDefinitions.find((card) => card.id === "ALLIANCE_012")!;
    expect(definition.effectsText).toContain("消滅對手最多3手下。協作20");
  });

  it("聯盟新增3張革命戰線銀彈克加魯", () => {
    const definition = getCardDefinition("ALLIANCE_013");
    expect(definition.deckCount).toBe(3);
    expect(definition.keywords).toEqual(expect.arrayContaining(["EFFECT_SUMMON", "RUSH", "BATTLECRY", "DEATHRATTLE"]));
    expect(definition.effectSummon).toEqual({ event: "NON_NORMAL_HAND_ENTRY_SUMMONED_THIS_GAME_AT_LEAST", value: 10 });
    expect(definition.effects).toEqual([{ type: "DAMAGE_TARGET_ENEMY_MINION", value: 3 }]);
    expect(definition.triggeredEffects?.DEATHRATTLE).toEqual([{ type: "DRAW", value: 1 }]);
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
    expect(getRuleUndefinedInventory().filter((issue) => issue.ruleId === "CARD_DATA_NOTE")).toHaveLength(78);
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
