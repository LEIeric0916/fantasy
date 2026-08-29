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

describe("最新確認的全局規則", () => {
  it("機械立場上限為6、其他陣營為7，發現保持順序放回且費用最低為0", () => {
    const state = mainState();
    expect(state.rulesConfig.fieldLimits).toMatchObject({ DRAGON: 7, UNDEAD: 7, MACHINE: 6, ALLIANCE: 7 });
    expect(state.rulesConfig.discoverRemainderPolicy).toBe("RETURN_KEEP_ORDER");
    expect(state.rulesConfig.minCardCost).toBe(0);
    const card = putCard(state, "P1", "DRAGON_001", "HAND", "cost-floor");
    expect(modifyCurrentCost(state, card, -99)).toBe(0);
  });

  it("滿場時手牌中的效果召喚不觸發", () => {
    const state = mainState();
    for (let index = 0; index < 7; index += 1) putCard(state, "P1", "TOKEN_DRAGON_HELLFIRE", "MINION", `full-${index}`);
    expect(canTriggerEffectSummonFromHand(state, "P1")).toBe(false);
  });

  it("轉變沿用實例與原始資料，清除傷害、攻擊次數和進場狀態", () => {
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

  it("未寫回合數的封印持續到離場，並在離場時解除", () => {
    const state = mainState();
    const card = putCard(state, "P1", "DRAGON_001", "MINION", "sealed-leave");
    card.sealed = true;
    moveCard(state, card, "HAND", "RETURN_TO_HAND");
    expect(card.sealed).toBe(false);
  });

  it("規則反擊可被不能反擊覆蓋，取首且只能攻擊玩家時無視嘲諷", () => {
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

describe("最後修正的卡表文字", () => {
  it("同步龍族與不朽者逐卡確認", () => {
    expect(getCardDefinition("DRAGON_002").keywords).toContain("BATTLECRY");
    expect(getCardDefinition("DRAGON_002").effectsText).toMatch(/^戰吼：/);
    expect(getCardDefinition("DRAGON_009").effectsText).toContain("返回牌組並洗牌");
    expect(getCardDefinition("UNDEAD_004").effectsText).toContain("最多2名目前生命為5或以下、且不受紀律阻擋的手下");
    expect(getCardDefinition("UNDEAD_010").effectsText).toContain("死靈數為10以上時");
    expect(getCardDefinition("UNDEAD_013").effectsText).toContain("翻開5張，從中指定3張手下");
  });

  it("同步機械 M1～M8 確認", () => {
    expect(getCardDefinition("MACHINE_006").subtype).toEqual(["MACHINE"]);
    expect(getCardDefinition("MACHINE_007").effectsText).toContain("返回牌組並洗牌");
    expect(getCardDefinition("MACHINE_011").effectsText).toContain("回收充能為6以上");
    expect(getCardDefinition("MACHINE_014").notes).toContain("傷害與召喚共用同一快照");
    expect(getCardDefinition("TOKEN_MACHINE_DIVINE_ENDYMION").notes).toContain("死亡之聲開始時另按當時仍在場");
  });

  it("機械士兵制造艙倒數結束後以謝幕曲召喚士兵", () => {
    const state = mainState();
    const bay = putCard(state, "P1", "TOKEN_MACHINE_SOLDIER_BAY", "FIELD", "last-words-bay");
    bay.counters.countdown = 1;
    state.phase = "END";
    beginTurn(state);
    expect(state.players.P1.extraDeck.some((card) => card.instanceId === bay.instanceId)).toBe(true);
    expect(state.players.P1.minions.some((card) => card.definitionId === "TOKEN_MACHINE_EMPIRE_SOLDIER")).toBe(true);
    expect(state.phase).toBe("MAIN");
  });

  it("同步聯盟 A1～A7 確認", () => {
    expect(getCardDefinition("ALLIANCE_003").notes).toContain("總計抽2張");
    expect(getCardDefinition("ALLIANCE_004").notes).toContain("先召喚第一名革命士兵");
    expect(getCardDefinition("ALLIANCE_006").keywords).toContain("IMMUNE_EFFECT_DAMAGE");
    expect(getCardDefinition("ALLIANCE_011").notes).toContain("計算一次X");
    expect(getCardDefinition("TOKEN_ALLIANCE_AIRSTRIKE").notes).toContain("返回衍生牌庫／額外區");
  });

  it("銀翼刻柏斯免疫能力傷害但承受戰斗傷害", () => {
    const state = mainState();
    const cerberus = putCard(state, "P2", "ALLIANCE_006", "MINION", "effect-immunity");
    expect(dealDamageToMinion(state, cerberus, 9, "spell", "EFFECT")).toBe(0);
    expect(cerberus.currentHealth).toBe(4);
    expect(dealDamageToMinion(state, cerberus, 2, "attacker", "COMBAT")).toBe(2);
    expect(cerberus.currentHealth).toBe(2);
  });

  it("永久單次傷害上限重復獲得時取最小值", () => {
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

  it("絕杰榮耀以玩家整場記錄且三種取完後無候選", () => {
    const player = mainState().players.P1;
    const options = ["TOKEN_ALLIANCE_HERO_OSDANTIN", "TOKEN_ALLIANCE_HERO_DION", "TOKEN_ALLIANCE_HERO_VALENTINE"];
    for (const option of options) recordUniqueChoice(player, "TOKEN_ALLIANCE_HEROIC_GLORY", option, options);
    expect(getRemainingUniqueChoices(player, "TOKEN_ALLIANCE_HEROIC_GLORY", options)).toEqual([]);
  });
});
