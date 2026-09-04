import { describe, expect, it } from "vitest";
import { cardDefinitions, cardRegistry, validateCardData } from "../../src/game/cards/cardRegistry";
import type { CardDefinition, EffectDefinition } from "../../src/game/cards/cardTypes";

function rootEffects(card: CardDefinition): EffectDefinition[] {
  return [
    ...(card.effects ?? []),
    ...(card.enterFieldEffects ?? []),
    ...(card.alternatePlay?.effects ?? []),
    ...(card.activatedEffect?.effects ?? []),
    ...(card.friendlySummonAura?.effects ?? []),
    ...Object.values(card.triggeredEffects ?? {}).flatMap((effects) => effects ?? []),
  ];
}

function walkEffects(effects: readonly EffectDefinition[]): EffectDefinition[] {
  const walked: EffectDefinition[] = [];
  for (const effect of effects) {
    walked.push(effect);
    if ("effects" in effect && Array.isArray(effect.effects)) walked.push(...walkEffects(effect.effects));
    if (effect.type === "CHOOSE_ONE") {
      for (const option of effect.options) walked.push(...walkEffects(option.effects));
    }
  }
  return walked;
}

const referenceKeys = new Set([
  "definitionId",
  "fieldDefinitionId",
  "summonDefinitionId",
  "transformDefinitionId",
  "transformedDefinitionId",
  "transformSelfDefinitionId",
  "doomFieldDefinitionId",
  "bonusSummonDefinitionId",
]);

function collectCardReferences(value: unknown, key = ""): string[] {
  if (typeof value === "string") return referenceKeys.has(key) ? [value] : [];
  if (Array.isArray(value)) {
    if (key === "definitionIds" || key === "heroDefinitionIds") return value.filter((item): item is string => typeof item === "string");
    return value.flatMap((item) => collectCardReferences(item));
  }
  if (!value || typeof value !== "object") return [];
  return Object.entries(value).flatMap(([childKey, child]) => collectCardReferences(child, childKey));
}

describe("全卡牌卡死風險靜態稽核", () => {
  it("所有卡面宣告光環的卡牌都有 AURA 關鍵字與可執行機制", () => {
    const auraCards = cardDefinitions.filter((card) => card.effectsText.includes("光環"));
    expect(auraCards.length).toBeGreaterThan(0);
    expect(auraCards.every((card) => card.keywords.includes("AURA"))).toBe(true);
    const missingAuraIds = new Set(validateCardData()
      .filter((issue) => issue.code === "MISSING_EFFECT_IMPLEMENTATION" && issue.message.includes("光環"))
      .map((issue) => issue.cardId));
    expect(auraCards.filter((card) => missingAuraIds.has(card.id))).toEqual([]);
  });

  it("所有效果引用的卡牌定義都存在", () => {
    for (const card of cardDefinitions) {
      for (const reference of collectCardReferences(card)) {
        expect(cardRegistry.has(reference), `${card.id} 引用了不存在的卡牌 ${reference}`).toBe(true);
      }
    }
  });

  it("可執行效果中沒有 RULE_UNDEFINED，固定選項與數量也都可完成", () => {
    for (const card of cardDefinitions) {
      for (const effect of walkEffects(rootEffects(card))) {
        expect(effect.type, `${card.id} 仍含 RULE_UNDEFINED 效果`).not.toBe("RULE_UNDEFINED");
        if ("count" in effect && typeof effect.count === "number") {
          expect(effect.count, `${card.id} 的 ${effect.type} 數量不可為負數`).toBeGreaterThanOrEqual(0);
        }
        if (effect.type === "CHOOSE_ONE") {
          expect(effect.options.length, `${card.id} 的選項不可為空`).toBeGreaterThan(0);
          expect(new Set(effect.options.map((option) => option.id)).size, `${card.id} 的選項 ID 不可重複`).toBe(effect.options.length);
        }
        if (effect.type === "CHOOSE_DISTINCT_GENERATED_MINIONS" || effect.type === "CHOOSE_DISTINCT_GENERATED_FIELDS") {
          expect(new Set(effect.definitionIds).size, `${card.id} 的衍生卡候選不可重複`).toBe(effect.definitionIds.length);
          expect(effect.definitionIds.length, `${card.id} 的衍生卡候選不足`).toBeGreaterThanOrEqual(effect.count);
        }
      }
    }
  });

  it("召喚與轉變效果引用正確的卡牌類型", () => {
    const expectType = (ownerId: string, reference: string, expected: "MINION" | "FIELD") => {
      expect(cardRegistry.get(reference)?.cardType, `${ownerId} 的 ${reference} 必須是 ${expected}`).toBe(expected);
    };
    for (const card of cardDefinitions) {
      for (const effect of walkEffects(rootEffects(card))) {
        if (effect.type === "SUMMON" || effect.type === "SUMMON_WITH_KEYWORD_IF_FIELD") expectType(card.id, effect.definitionId, "MINION");
        if (effect.type === "SUMMON_FIELD") expectType(card.id, effect.definitionId, "FIELD");
        if (effect.type === "CHOOSE_GENERATED_FIELD" || effect.type === "CHOOSE_DISTINCT_GENERATED_FIELDS") {
          for (const definitionId of effect.definitionIds) expectType(card.id, definitionId, "FIELD");
        }
        if (effect.type === "CHOOSE_DISTINCT_GENERATED_MINIONS") {
          for (const definitionId of effect.definitionIds) expectType(card.id, definitionId, "MINION");
        }
        if (effect.type === "TRANSFORM_ENEMY_MINIONS" || effect.type === "TRANSFORM_UP_TO_ENEMY_MINIONS") expectType(card.id, effect.definitionId, "MINION");
        if (effect.type === "TRANSFORM_SELF_FIELD") expectType(card.id, effect.definitionId, "FIELD");
        if (effect.type === "VANISH_SELF_IF_NO_FRIENDLY_FIELD") expectType(card.id, effect.definitionId, "FIELD");
        if (effect.type === "SNAPSHOT_FIELD_COUNT_DAMAGE_AND_SUMMON") expectType(card.id, effect.summonDefinitionId, "MINION");
        if (effect.type === "CATASTROPHE_FLOOD") {
          expectType(card.id, effect.transformDefinitionId, "MINION");
          expectType(card.id, effect.doomFieldDefinitionId, "FIELD");
          expectType(card.id, effect.bonusSummonDefinitionId, "MINION");
        }
      }
    }
  });
});
