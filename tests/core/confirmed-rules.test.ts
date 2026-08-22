import { describe, expect, it } from "vitest";
import { getCardDefinition } from "../../src/game/cards/cardRegistry";
import { getLegalAttackTargets } from "../../src/game/engine/combatEngine";
import { modifyCurrentCost } from "../../src/game/engine/costEngine";
import { applyAction } from "../../src/game/engine/gameEngine";
import { canTriggerEffectSummonFromHand } from "../../src/game/engine/summonEngine";
import { transformMinion } from "../../src/game/engine/transformEngine";
import { destroyMinion, moveCard } from "../../src/game/engine/zoneEngine";
import { beginTurn } from "../../src/game/engine/turnEngine";
import { dealDamageToMinion, grantDamageCap } from "../../src/game/engine/damageEngine";
import { getRemainingUniqueChoices, recordUniqueChoice } from "../../src/game/engine/choiceHistoryEngine";
import { mainState, putCard } from "../helpers";

describe("最新确认的全局规则", () => {
  it("非机械阵营立场无限、发现保持顺序放回且费用最低为0", () => {
    const state = mainState();
    expect(state.rulesConfig.fieldLimits).toMatchObject({ DRAGON: null, UNDEAD: null, MACHINE: 6, ALLIANCE: null });
    expect(state.rulesConfig.discoverRemainderPolicy).toBe("RETURN_KEEP_ORDER");
    expect(state.rulesConfig.minCardCost).toBe(0);
    const card = putCard(state, "P1", "DRAGON_001", "HAND", "cost-floor");
    expect(modifyCurrentCost(state, card, -99)).toBe(0);
  });

  it("满场时手牌中的效果召唤不触发", () => {
    const state = mainState();
    for (let index = 0; index < 7; index += 1) putCard(state, "P1", "TOKEN_DRAGON_HELLFIRE", "MINION", `full-${index}`);
    expect(canTriggerEffectSummonFromHand(state, "P1")).toBe(false);
  });

  it("转变沿用实例与原始资料，清除伤害、攻击次数和进场状态", () => {
    const state = mainState();
    const card = putCard(state, "P1", "UNDEAD_001", "MINION", "transform");
    card.currentHealth = 1;
    card.damageTaken = 1;
    card.attacksUsedThisTurn = 1;
    card.summonedOnTurn = state.turnNumber;
    expect(transformMinion(state, card, "TOKEN_UNDEAD_SPIRIT")).toBe(true);
    expect(card.instanceId).toBe("P1-UNDEAD_001-transform");
    expect(card.originalDefinitionId).toBe("UNDEAD_001");
    expect(card.definitionId).toBe("TOKEN_UNDEAD_SPIRIT");
    expect(card.currentAttack).toBe(1);
    expect(card.currentHealth).toBe(1);
    expect(card.damageTaken).toBe(0);
    expect(card.attacksUsedThisTurn).toBe(0);
    expect(card.summonedOnTurn).toBeNull();
    destroyMinion(state, card, "TRANSFORMED_DEATH");
    const departed = state.players.P1.extraDeck.find((candidate) => candidate.instanceId === card.instanceId)!;
    expect(departed.definitionId).toBe("TOKEN_UNDEAD_SPIRIT");
    expect(departed.originalDefinitionId).toBe("UNDEAD_001");
  });

  it("未写回合数的封印持续到离场，并在离场时解除", () => {
    const state = mainState();
    const card = putCard(state, "P1", "DRAGON_001", "MINION", "sealed-leave");
    card.sealed = true;
    moveCard(state, card, "HAND", "RETURN_TO_HAND");
    expect(card.sealed).toBe(false);
  });

  it("规则反击可被不能反击覆盖，取首且只能攻击玩家时无视嘲讽", () => {
    let state = mainState();
    const attacker = putCard(state, "P1", "DRAGON_001", "MINION", "attack-no-counter");
    const noCounter = putCard(state, "P2", "ALLIANCE_009", "MINION", "no-counter");
    state = applyAction(state, {
      type: "ATTACK",
      playerId: "P1",
      attackerId: attacker.instanceId,
      target: { type: "MINION", instanceId: noCounter.instanceId },
    }).state;
    expect(state.players.P1.minions.find((card) => card.instanceId === attacker.instanceId)?.currentHealth).toBe(2);

    const headhunter = putCard(state, "P1", "ALLIANCE_009", "MINION", "headhunter");
    putCard(state, "P2", "TOKEN_DRAGON_HELLFIRE", "MINION", "taunt");
    expect(getLegalAttackTargets(state, headhunter.instanceId)).toEqual([{ type: "HERO", playerId: "P2" }]);
  });
});

describe("最后修正的卡表文字", () => {
  it("同步龙族与不朽者逐卡确认", () => {
    expect(getCardDefinition("DRAGON_002").keywords).toContain("BATTLECRY");
    expect(getCardDefinition("DRAGON_002").effectsText).toMatch(/^戰吼：/);
    expect(getCardDefinition("DRAGON_009").effectsText).toContain("返回牌組並洗牌");
    expect(getCardDefinition("UNDEAD_004").effectsText).toContain("血量為5以下的手下");
    expect(getCardDefinition("UNDEAD_010").effectsText).toContain("死靈數為10以上時");
    expect(getCardDefinition("UNDEAD_013").effectsText).toContain("翻開5張，從中指定3張手下");
  });

  it("同步机械 M1～M8 确认", () => {
    expect(getCardDefinition("MACHINE_006").subtype).toEqual(["MACHINE"]);
    expect(getCardDefinition("MACHINE_007").effectsText).toContain("返回牌組並洗牌");
    expect(getCardDefinition("MACHINE_011").effectsText).toContain("回收充能為6以上");
    expect(getCardDefinition("MACHINE_014").notes).toContain("伤害与召唤共用同一快照");
    expect(getCardDefinition("TOKEN_MACHINE_DIVINE_ENDYMION").notes).toContain("死亡之声开始时另按当时仍在场");
  });

  it("机械士兵制造舱倒数结束后以谢幕曲召唤士兵", () => {
    const state = mainState();
    const bay = putCard(state, "P1", "TOKEN_MACHINE_SOLDIER_BAY", "FIELD", "last-words-bay");
    bay.counters.countdown = 1;
    state.phase = "END";
    beginTurn(state);
    expect(state.players.P1.extraDeck.some((card) => card.instanceId === bay.instanceId)).toBe(true);
    expect(state.players.P1.minions.some((card) => card.definitionId === "TOKEN_MACHINE_EMPIRE_SOLDIER")).toBe(true);
    expect(state.phase).toBe("MAIN");
  });

  it("同步联盟 A1～A7 确认", () => {
    expect(getCardDefinition("ALLIANCE_003").notes).toContain("总计抽2张");
    expect(getCardDefinition("ALLIANCE_004").notes).toContain("先召唤第一名革命士兵");
    expect(getCardDefinition("ALLIANCE_006").keywords).toContain("IMMUNE_EFFECT_DAMAGE");
    expect(getCardDefinition("ALLIANCE_011").notes).toContain("计算一次X");
    expect(getCardDefinition("TOKEN_ALLIANCE_AIRSTRIKE").notes).toContain("返回衍生牌库／额外区");
  });

  it("银翼刻柏斯免疫能力伤害但承受战斗伤害", () => {
    const state = mainState();
    const cerberus = putCard(state, "P2", "ALLIANCE_006", "MINION", "effect-immunity");
    expect(dealDamageToMinion(state, cerberus, 9, "spell", "EFFECT")).toBe(0);
    expect(cerberus.currentHealth).toBe(4);
    expect(dealDamageToMinion(state, cerberus, 2, "attacker", "COMBAT")).toBe(2);
    expect(cerberus.currentHealth).toBe(2);
  });

  it("永久单次伤害上限重复获得时取最小值", () => {
    const state = mainState();
    const minion = putCard(state, "P1", "DRAGON_001", "MINION", "damage-cap");
    minion.currentHealth = 10;
    minion.maxHealth = 10;
    expect(grantDamageCap(minion, 4)).toBe(4);
    expect(grantDamageCap(minion, 3)).toBe(3);
    expect(grantDamageCap(minion, 6)).toBe(3);
    expect(dealDamageToMinion(state, minion, 8, "test", "EFFECT")).toBe(3);
    expect(minion.currentHealth).toBe(7);
  });

  it("绝杰荣耀以玩家整场记录且三种取完后无候选", () => {
    const player = mainState().players.P1;
    const options = ["TOKEN_ALLIANCE_HERO_OSDANTIN", "TOKEN_ALLIANCE_HERO_DION", "TOKEN_ALLIANCE_HERO_VALENTINE"];
    for (const option of options) recordUniqueChoice(player, "TOKEN_ALLIANCE_HEROIC_GLORY", option, options);
    expect(getRemainingUniqueChoices(player, "TOKEN_ALLIANCE_HEROIC_GLORY", options)).toEqual([]);
  });
});
