import { describe, expect, it } from "vitest";
import { cardDefinitions } from "../../src/game/cards/cardRegistry";
import { KEYWORD_TEXT } from "../../src/game/cards/keywordText";
import type { Keyword } from "../../src/game/cards/cardTypes";

describe("卡牌效果欄關鍵字說明", () => {
  it("所有卡牌使用的關鍵字都有中文名稱與效果說明", () => {
    const keywords = new Set<Keyword>();
    for (const card of cardDefinitions) {
      for (const keyword of card.keywords) keywords.add(keyword);
    }

    for (const keyword of keywords) {
      expect(KEYWORD_TEXT[keyword].label, keyword).not.toBe("");
      expect(KEYWORD_TEXT[keyword].description, keyword).not.toBe("");
    }
  });

  it("皇家親衛隊的效果欄會包含紀律說明", () => {
    const definition = cardDefinitions.find((card) => card.id === "TOKEN_ALLIANCE_ROYAL_HONOR_GUARD");
    expect(definition?.keywords).toContain("DISCIPLINE");
    expect(KEYWORD_TEXT.DISCIPLINE.label).toBe("紀律");
    expect(KEYWORD_TEXT.DISCIPLINE.description).toContain("仍會受到效果傷害");
  });

  it("主牌皇家戰士費用為9", () => {
    const definition = cardDefinitions.find((card) => card.id === "ALLIANCE_010");
    expect(definition?.originalCost).toBe(9);
  });
});
