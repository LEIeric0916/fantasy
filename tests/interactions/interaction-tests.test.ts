import { describe, expect, it } from "vitest";
import { getCardDefinition } from "../../src/game/cards/cardRegistry";
import { applyAction } from "../../src/game/engine/gameEngine";
import { getLegalAttackTargets } from "../../src/game/engine/combatEngine";
import { dealDamageToHero, dealDamageToMinion } from "../../src/game/engine/damageEngine";
import { refreshCardCost } from "../../src/game/engine/costEngine";
import { resolveEffects, resolvePendingEffects, selectEffectCards } from "../../src/game/engine/effectEngine";
import { transformMinion } from "../../src/game/engine/transformEngine";
import { destroyCardOnField, destroyMinion, moveCard } from "../../src/game/engine/zoneEngine";
import { reviveMinion } from "../../src/game/engine/reviveEngine";
import { summonGeneratedField, summonGeneratedMinion } from "../../src/game/engine/summonEngine";
import { beginTurn, drawCard } from "../../src/game/engine/turnEngine";
import { mainState, putCard } from "../helpers";

// docs/interaction-tests.md 的逐項自動化索引。
describe("A. 核心區域與回合", () => {
  it("A01｜倒數先於生長", () => {
    const state = mainState();
    const field = putCard(state, "P1", "TOKEN_MACHINE_ATTACK_SHIP", "FIELD", "A01");
    field.keywords.push("GROWTH");
    field.counters.countdown = 1;
    beginTurn(state);
    expect(state.players.P1.fields.some((card) => card.instanceId === field.instanceId)).toBe(false);
    expect(state.players.P1.extraDeck.some((card) => card.instanceId === field.instanceId)).toBe(true);
  });
  it("A02｜滿場召喚失敗", () => {
    const state = mainState();
    for (let index = 0; index < 7; index += 1) summonGeneratedMinion(state, "P1", "TOKEN_DRAGON_HELLFIRE");
    expect(summonGeneratedMinion(state, "P1", "TOKEN_DRAGON_HELLFIRE")).toBe(false);
    expect(state.players.P1.minions).toHaveLength(7);
  });
  it("A03｜手牌超過 10 不立即燒牌", () => {
    const state = mainState();
    while (state.players.P1.hand.length < 11) drawCard(state, "P1", "TEST");
    expect(state.players.P1.hand).toHaveLength(11);
    expect(state.players.P1.graveyard).toHaveLength(0);
  });
  it("A04｜空牌庫再抽立即敗北", () => {
    const state = mainState(); state.players.P1.deck = []; drawCard(state, "P1");
    expect(state).toMatchObject({ phase: "GAME_OVER", winner: "P2", loseReason: "DECK_OUT" });
  });
  it("A05｜幸運幣不增加上限", () => {
    let state = mainState(); const coin = putCard(state, "P1", "TOKEN_COIN", "HAND", "interaction");
    state.players.P1.mana = 1; state.players.P1.maxMana = 1;
    state = applyAction(state, { type: "PLAY_CARD", playerId: "P1", instanceId: coin.instanceId }).state;
    expect([state.players.P1.mana, state.players.P1.maxMana]).toEqual([2, 1]);
  });
});

describe("B. 戰斗與防護", () => {
  it("B01｜潛行優先於嘲諷", () => {
    const state = mainState();
    const attacker = putCard(state, "P1", "TOKEN_DRAGON_HELLFIRE", "MINION", "stealth-taunt-attacker");
    const hidden = putCard(state, "P2", "TOKEN_DRAGON_HELLFIRE", "MINION", "stealth-taunt");
    hidden.keywords.push("STEALTH");
    expect(getLegalAttackTargets(state, attacker.instanceId)).toContainEqual({ type: "HERO", playerId: "P2" });
    expect(getLegalAttackTargets(state, attacker.instanceId)).not.toContainEqual({ type: "MINION", instanceId: hidden.instanceId });
  });
  it("B02｜威懾優先於嘲諷", () => {
    const state = mainState();
    const attacker = putCard(state, "P1", "TOKEN_DRAGON_HELLFIRE", "MINION", "deterrence-attacker");
    const deterred = putCard(state, "P2", "TOKEN_DRAGON_HELLFIRE", "MINION", "deterrence-taunt");
    deterred.keywords.push("DETERRENCE");
    expect(getLegalAttackTargets(state, attacker.instanceId)).toContainEqual({ type: "HERO", playerId: "P2" });
    expect(getLegalAttackTargets(state, attacker.instanceId)).not.toContainEqual({ type: "MINION", instanceId: deterred.instanceId });
  });
  it("B03｜潛行解除", () => {
    let state = mainState();
    const attacker = putCard(state, "P1", "UNDEAD_001", "MINION", "stealth-attack");
    attacker.keywords.push("STEALTH");
    state = applyAction(state, { type: "ATTACK", playerId: "P1", attackerId: attacker.instanceId, target: { type: "HERO", playerId: "P2" } }).state;
    expect(state.players.P1.minions[0].keywords).not.toContain("STEALTH");
    const abilitySource = putCard(state, "P1", "TOKEN_DRAGON_HELLFIRE", "MINION", "stealth-effect");
    abilitySource.keywords.push("STEALTH");
    dealDamageToHero(state, "P2", 1, abilitySource.instanceId, "EFFECT");
    expect(abilitySource.keywords).not.toContain("STEALTH");
  });
  it("B04｜必殺在傷害後結算", () => {
    let state = mainState();
    const attacker = putCard(state, "P1", "UNDEAD_001", "MINION", "lethal-attacker");
    attacker.keywords.push("LETHAL");
    const defender = putCard(state, "P2", "TOKEN_MACHINE_DESTROYER", "MINION", "lethal-defender");
    state = applyAction(state, { type: "ATTACK", playerId: "P1", attackerId: attacker.instanceId, target: { type: "MINION", instanceId: defender.instanceId } }).state;
    expect(state.players.P2.extraDeck.some((card) => card.instanceId === defender.instanceId)).toBe(true);
  });
  it("B05｜聖盾術", () => {
    let state = mainState();
    const attacker = putCard(state, "P1", "DRAGON_012", "MINION", "shield-hit");
    const shielded = putCard(state, "P2", "ALLIANCE_005", "MINION", "shielded");
    state = applyAction(state, { type: "ATTACK", playerId: "P1", attackerId: attacker.instanceId, target: { type: "MINION", instanceId: shielded.instanceId } }).state;
    const after = state.players.P2.minions.find((card) => card.instanceId === shielded.instanceId)!;
    expect(after.currentHealth).toBe(1);
    expect(after.keywords).not.toContain("DIVINE_SHIELD");
  });
  it("B06｜紀律阻擋正負改值但不擋傷害", () => {
    const state = mainState();
    const disciplined = putCard(state, "P1", "TOKEN_MACHINE_DIVINE_ENDYMION", "MINION", "discipline");
    const before = [disciplined.currentAttack, disciplined.currentHealth];
    resolveEffects(state, "P1", disciplined, [{ type: "MODIFY_SELF_STATS", attack: 2, health: 2 }]);
    expect([disciplined.currentAttack, disciplined.currentHealth]).toEqual(before);
    expect(dealDamageToMinion(state, disciplined, 3, "test", "EFFECT")).toBe(3);
  });
  it("B07｜庇護、無敵與消失", () => {
    const state = mainState();
    const source = putCard(state, "P1", "DRAGON_012", "MINION", "protection-source");
    const sanctuary = putCard(state, "P2", "UNDEAD_001", "MINION", "sanctuary");
    sanctuary.keywords.push("SANCTUARY");
    resolveEffects(state, "P1", source, [{ type: "DESTROY_TARGET_ENEMY_MINION" }]);
    if (state.pendingChoice) selectEffectCards(state, "P1", [sanctuary.instanceId]);
    expect(sanctuary.zone).toBe("MINION");
    resolveEffects(state, "P1", source, [{ type: "VANISH_ENEMY_MINIONS", count: 1 }]);
    if (state.pendingChoice) selectEffectCards(state, "P1", [sanctuary.instanceId]);
    expect(sanctuary.zone).toBe("REMOVED");

    const invincible = putCard(state, "P2", "TOKEN_UNDEAD_SPIRIT", "MINION", "invincible");
    invincible.keywords.push("INVINCIBLE");
    expect(dealDamageToMinion(state, invincible, 10, source.instanceId, "EFFECT")).toBe(0);
    expect(transformMinion(state, invincible, "TOKEN_UNDEAD_GENERIC")).toBe(false);
  });
});

describe("C. 消滅、消失、轉變與資源", () => {
  it("C01｜消失不觸發死亡系統", () => {
    const state = mainState();
    const source = putCard(state, "P1", "DRAGON_012", "MINION", "vanish-source");
    const target = putCard(state, "P2", "MACHINE_013", "MINION", "vanish-target");
    const before = state.players.P2.resources.necromancy;
    resolveEffects(state, "P1", source, [{ type: "VANISH_ENEMY_MINIONS", count: 1 }]);
    selectEffectCards(state, "P1", [target.instanceId]);
    expect(target.zone).toBe("REMOVED");
    expect(state.players.P2.resources.necromancy).toBe(before);
    expect(state.players.P2.resources.recycleCharge).toBe(0);
  });
  it("C02｜轉變不觸發原卡離場與死亡", () => {
    const state = mainState();
    const target = putCard(state, "P2", "MACHINE_013", "MINION", "transform-target");
    expect(transformMinion(state, target, "TOKEN_UNDEAD_GENERIC")).toBe(true);
    resolvePendingEffects(state);
    expect(target).toMatchObject({ definitionId: "TOKEN_UNDEAD_GENERIC", originalDefinitionId: "MACHINE_013", zone: "MINION" });
    expect(state.players.P2.resources).toMatchObject({ necromancy: 0, recycleCharge: 0 });
  });
  it("C03｜災厄洪流與巴哈姆特", () => {
    let state = mainState();
    state.players.P1.hand = [];
    const dragon = putCard(state, "P2", "DRAGON_001", "MINION", "flood-dragon");
    const flood = putCard(state, "P1", "UNDEAD_014", "HAND", "flood");
    state = applyAction(state, { type: "PLAY_CARD", playerId: "P1", instanceId: flood.instanceId }).state;
    expect(state.players.P2.minions.find((card) => card.instanceId === dragon.instanceId)?.definitionId).toBe("TOKEN_UNDEAD_GENERIC");
    const bahamut = putCard(state, "P2", "DRAGON_012", "HAND", "bahamut");
    expect(refreshCardCost(state, "P2", bahamut)).toBe(20);
  });
  it("C04｜災厄洪流的 X", () => {
    let state = mainState();
    state.players.P1.hand = [];
    state.players.P1.heroHp = 20;
    for (let index = 0; index < 4; index += 1) putCard(state, "P2", "TOKEN_MACHINE_DESTROYER", "MINION", `flood-${index}`);
    const flood = putCard(state, "P1", "UNDEAD_014", "HAND", "x-four");
    state = applyAction(state, { type: "PLAY_CARD", playerId: "P1", instanceId: flood.instanceId }).state;
    expect(state.players.P1.heroHp).toBe(24);
    expect(state.players.P2.minions).toHaveLength(0);
    expect(state.players.P2.extraDeck.filter((card) => card.definitionId === "TOKEN_UNDEAD_GENERIC")).toHaveLength(4);
  });
  it("C05｜災厄洪流與末日之書", () => {
    let state = mainState();
    state.players.P1.hand = [];
    putCard(state, "P1", "TOKEN_UNDEAD_DOOMSDAY_BOOK", "FIELD", "doom");
    putCard(state, "P2", "UNDEAD_001", "MINION", "target");
    const flood = putCard(state, "P1", "UNDEAD_014", "HAND", "bonus");
    state = applyAction(state, { type: "PLAY_CARD", playerId: "P1", instanceId: flood.instanceId }).state;
    expect(state.players.P1.minions.filter((card) => card.definitionId === "TOKEN_UNDEAD_CATASTROPHE_KNIGHT")).toHaveLength(2);
  });
});

describe("D. 回收與機械術", () => {
  it("D01｜回收", () => {
    const state = mainState();
    const card = putCard(state, "P1", "MACHINE_002", "MINION", "recycle");
    destroyMinion(state, card, "TEST");
    resolvePendingEffects(state);
    expect(state.players.P1.deck[0].instanceId).toBe(card.instanceId);
    expect(state.players.P1.resources.recycleCharge).toBe(1);
    expect(state.players.P1.graveyard).not.toContainEqual(expect.objectContaining({ instanceId: card.instanceId }));
  });
  it("D02｜回收與其他死亡效果", () => {
    const state = mainState();
    const wheel = putCard(state, "P1", "MACHINE_012", "FIELD", "recycle-last-words");
    destroyCardOnField(state, wheel, "TEST");
    resolvePendingEffects(state);
    expect(state.players.P1.deck[0].instanceId).toBe(wheel.instanceId);
    expect(state.players.P1.minions.some((card) => card.definitionId === "TOKEN_MACHINE_DESTROYER")).toBe(true);
    expect(state.players.P1.resources.recycleCharge).toBe(1);
  });
  it("D03｜機械術全部不可執行", () => {
    const state = mainState();
    state.players.P1.resources.recycleCharge = 2;
    const source = putCard(state, "P1", "MACHINE_002", "MINION", "tech-none");
    resolveEffects(state, "P1", source, [{ type: "MECHANICAL_TECHNIQUE", cost: 2, effects: [{ type: "DESTROY_TARGET_ENEMY_MINION" }] }]);
    expect(state.players.P1.resources.recycleCharge).toBe(2);
    expect(state.pendingChoice).toBeUndefined();
  });
  it("D04｜機械術部分可執行", () => {
    const state = mainState();
    state.players.P1.resources.recycleCharge = 2;
    const source = putCard(state, "P1", "MACHINE_002", "MINION", "tech-partial");
    const deckSize = state.players.P1.deck.length;
    resolveEffects(state, "P1", source, [{ type: "MECHANICAL_TECHNIQUE", cost: 2, effects: [{ type: "DESTROY_TARGET_ENEMY_MINION" }, { type: "DRAW", value: 1 }] }]);
    expect(state.players.P1.resources.recycleCharge).toBe(0);
    expect(state.players.P1.deck).toHaveLength(deckSize - 1);
  });
  it("D05｜機械毀滅者最新版", () => {
    const state = mainState();
    state.players.P1.heroHp = 29;
    const destroyer = putCard(state, "P1", "TOKEN_MACHINE_DESTROYER", "MINION", "latest");
    expect(destroyer).toMatchObject({ currentCost: 6, currentAttack: 4, currentHealth: 7 });
    destroyMinion(state, destroyer, "TEST");
    resolvePendingEffects(state);
    expect(state.players.P1.resources.recycleCharge).toBe(1);
    expect(state.players.P1.heroHp).toBe(30);
    expect(destroyer.zone).toBe("EXTRA_DECK");
  });
  it("D06｜伊利亞斯傷害上限", () => {
    const state = mainState();
    putCard(state, "P1", "TOKEN_MACHINE_DIVINE_ELIAS", "MINION", "elias");
    const army = putCard(state, "P1", "TOKEN_MACHINE_EMPIRE_SOLDIER", "MINION", "capped");
    expect([2, 3, 5, 12].map((amount) => {
      army.currentHealth = 20;
      return dealDamageToMinion(state, army, amount, "test", "EFFECT");
    })).toEqual([2, 3, 3, 3]);
  });
});

describe("E. 死靈、棄牌與復活", () => {
  it("E01｜死靈數只看從場上被消滅", () => {
    let state = mainState();
    state.players.P1.hand = [];
    const source = putCard(state, "P1", "UNDEAD_002", "HAND", "discard-source");
    const discarded = putCard(state, "P1", "UNDEAD_001", "HAND", "discarded");
    state = applyAction(state, { type: "PLAY_CARD", playerId: "P1", instanceId: source.instanceId }).state;
    state = applyAction(state, { type: "SELECT_EFFECT_CARDS", playerId: "P1", instanceIds: [discarded.instanceId] }).state;
    expect(state.players.P1.resources.necromancy).toBe(0);
    const fieldMinion = putCard(state, "P1", "UNDEAD_001", "MINION", "destroyed");
    destroyMinion(state, fieldMinion, "TEST");
    resolvePendingEffects(state);
    expect(state.players.P1.resources.necromancy).toBe(1);
  });
  it("E02｜死靈數 +X 不消耗資源", () => {
    const state = mainState();
    const preacher = putCard(state, "P1", "TOKEN_UNDEAD_PREACHER", "MINION", "preacher");
    resolveEffects(state, "P1", preacher, getCardDefinition(preacher.definitionId).effects ?? []);
    expect(state.players.P1.resources.necromancy).toBe(3);
  });
  it("E03｜死靈復活：由場上死亡", () => {
    const state = mainState();
    state.players.P1.resources.necromancy = 3;
    const minion = putCard(state, "P1", "UNDEAD_009", "MINION", "field-revive");
    destroyMinion(state, minion, "TEST");
    resolvePendingEffects(state);
    expect(minion.zone).toBe("MINION");
    expect(state.players.P1.resources.necromancy).toBe(0);
  });
  it("E04｜死靈復活：由其他區域送棄堆", () => {
    let state = mainState();
    state.players.P1.hand = [];
    state.players.P1.resources.necromancy = 4;
    const source = putCard(state, "P1", "UNDEAD_002", "HAND", "discard-necro-source");
    const revived = putCard(state, "P1", "UNDEAD_009", "HAND", "discard-necro-target");
    state = applyAction(state, { type: "PLAY_CARD", playerId: "P1", instanceId: source.instanceId }).state;
    state = applyAction(state, { type: "SELECT_EFFECT_CARDS", playerId: "P1", instanceIds: [revived.instanceId] }).state;
    expect(state.players.P1.minions.some((card) => card.instanceId === revived.instanceId)).toBe(true);
    expect(state.players.P1.resources.necromancy).toBe(0);
  });
  it("E05｜同一角色每回合一次", () => {
    const state = mainState();
    state.players.P1.resources.necromancy = 10;
    const minion = putCard(state, "P1", "UNDEAD_009", "MINION", "revive-once");
    destroyMinion(state, minion, "FIRST"); resolvePendingEffects(state);
    destroyMinion(state, minion, "SECOND"); resolvePendingEffects(state);
    expect(minion.zone).toBe("GRAVEYARD");
    expect(state.players.P1.resources.necromancy).toBe(8);
  });
  it("E06｜復活觸發", () => {
    const state = mainState();
    const ubis = putCard(state, "P1", "UNDEAD_003", "MINION", "revive-trigger");
    destroyMinion(state, ubis, "TEST"); resolvePendingEffects(state);
    expect(reviveMinion(state, "P1", ubis)).toBe(true);
    resolvePendingEffects(state);
    expect(ubis.currentAttack).toBe(3);
  });
});

describe("F. 黑暗之書與末日之書", () => {
  it("F01｜未指定種類的黑暗之書", () => {
    let state = mainState();
    state.players.P1.hand = [];
    const source = putCard(state, "P1", "UNDEAD_006", "HAND", "choose-book");
    state = applyAction(state, { type: "PLAY_CARD", playerId: "P1", instanceId: source.instanceId }).state;
    expect(state.pendingChoice).toMatchObject({ type: "EFFECT_OPTION" });
    expect(state.pendingChoice?.type === "EFFECT_OPTION" ? state.pendingChoice.options : []).toHaveLength(4);
  });
  it("F02｜同種類可再次生成", () => {
    const state = mainState();
    expect(summonGeneratedField(state, "P1", "TOKEN_UNDEAD_BOOK_REVENGE")).toBe(true);
    resolvePendingEffects(state);
    const old = state.players.P1.fields[0];
    expect(summonGeneratedField(state, "P1", "TOKEN_UNDEAD_BOOK_REVENGE")).toBe(true);
    resolvePendingEffects(state);
    expect(old.zone).toBe("EXTRA_DECK");
    expect(state.players.P1.fields.filter((card) => card.definitionId === "TOKEN_UNDEAD_BOOK_REVENGE")).toHaveLength(1);
  });
  it("F03｜不朽典錄", () => {
    const state = mainState();
    state.players.P1.resources.necromancy = 23;
    const book = putCard(state, "P1", "TOKEN_UNDEAD_BOOK_IMMORTAL", "FIELD", "growth-necromancy");
    const rejected = applyAction(state, { type: "ACTIVATE_FIELD", playerId: "P1", instanceId: book.instanceId });
    expect(rejected.error?.message).toContain("沒有可主動發動的效果");
    expect(rejected.state.players.P1.resources.necromancy).toBe(23);

    state.phase = "END";
    beginTurn(state);
    expect(state.players.P1.resources.necromancy).toBe(3);
    expect(state.players.P1.fields[0].definitionId).toBe("TOKEN_UNDEAD_DOOMSDAY_BOOK");
  });
  it("F04｜瘟疫典錄標記", () => {
    let state = mainState();
    const book = putCard(state, "P1", "TOKEN_UNDEAD_BOOK_PLAGUE", "FIELD", "plague");
    const target = putCard(state, "P2", "TOKEN_UNDEAD_SPIRIT", "MINION", "plague-target");
    target.currentHealth = 3;
    state = applyAction(state, { type: "END_TURN", playerId: "P1" }).state;
    state = applyAction(state, { type: "SELECT_EFFECT_CARDS", playerId: "P1", instanceIds: [target.instanceId] }).state;
    expect(state.players.P1.fields.find((card) => card.instanceId === book.instanceId)?.counters.plagueMarks).toBe(1);
  });
  it("F05｜復仇典錄", () => {
    let low = mainState();
    low.players.P1.heroHp = 9;
    putCard(low, "P1", "TOKEN_UNDEAD_BOOK_REVENGE", "FIELD", "low");
    low = applyAction(low, { type: "END_TURN", playerId: "P1" }).state;
    expect(low.players.P1.fields[0].definitionId).toBe("TOKEN_UNDEAD_DOOMSDAY_BOOK");
    let equal = mainState();
    equal.players.P1.heroHp = 10;
    putCard(equal, "P1", "TOKEN_UNDEAD_BOOK_REVENGE", "FIELD", "equal");
    equal = applyAction(equal, { type: "END_TURN", playerId: "P1" }).state;
    expect(equal.players.P1.fields[0].definitionId).toBe("TOKEN_UNDEAD_BOOK_REVENGE");
  });
  it("F06｜末日序曲三張結算", () => {
    const state = mainState();
    const deckSize = state.players.P1.deck.length;
    const ids: string[] = [];
    for (let index = 0; index < 3; index += 1) {
      summonGeneratedField(state, "P1", "TOKEN_UNDEAD_BOOK_DOOM_PRELUDE");
      ids.push(state.players.P1.fields.at(-1)!.instanceId);
      resolvePendingEffects(state);
    }
    expect(state.players.P1.fields).toHaveLength(1);
    expect(state.players.P1.fields[0]).toMatchObject({ instanceId: ids[2], definitionId: "TOKEN_UNDEAD_DOOMSDAY_BOOK" });
    expect(state.players.P1.deck).toHaveLength(deckSize - 2);
  });
  it("F07｜四本末日特殊勝利", () => {
    let state = mainState();
    state.players.P1.heroHp = 9;
    for (let index = 0; index < 3; index += 1) putCard(state, "P1", "TOKEN_UNDEAD_DOOMSDAY_BOOK", "FIELD", `doom-${index}`);
    putCard(state, "P1", "TOKEN_UNDEAD_BOOK_REVENGE", "FIELD", "fourth");
    state = applyAction(state, { type: "END_TURN", playerId: "P1" }).state;
    expect(state).toMatchObject({ phase: "GAME_OVER", winner: "P1", loseReason: "DOOMSDAY_BOOK" });
  });
});

describe("G. 指定卡牌確認", () => {
  it("G01｜炎龍召喚（見 dragon/batch1.test.ts 完整斷言）", () => {
    expect(getCardDefinition("DRAGON_013").effects).toEqual([
      { type: "SUMMON", definitionId: "TOKEN_DRAGON_HELLFIRE", count: 1 },
      { type: "DAMAGE_ALL_ENEMY_MINIONS", value: 4 },
    ]);
  });
  it("G02｜炎火之龍與魔導戰龍", () => {
    let state = mainState();
    state.players.P1.hand = [];
    const fireDragon = putCard(state, "P1", "DRAGON_008", "HAND", "copy-source");
    const magicDragon = putCard(state, "P1", "DRAGON_004", "HAND", "must-stay");
    const spell = putCard(state, "P1", "DRAGON_013", "HAND", "copied-spell");
    state = applyAction(state, { type: "PLAY_CARD", playerId: "P1", instanceId: fireDragon.instanceId }).state;
    state = applyAction(state, { type: "SELECT_EFFECT_CARDS", playerId: "P1", instanceIds: [spell.instanceId] }).state;
    expect(state.players.P1.hand.some((card) => card.instanceId === magicDragon.instanceId)).toBe(true);
    expect(state.players.P1.effectSummonUsedThisTurn).not.toContain("DRAGON_004");
  });
  it("G03｜巴哈姆特減費", () => {
    const state = mainState();
    const bahamut = putCard(state, "P1", "DRAGON_012", "HAND", "cost");
    for (let index = 0; index < 2; index += 1) {
      const dragon = putCard(state, "P1", "DRAGON_001", "MINION", `grave-${index}`);
      moveCard(state, dragon, "GRAVEYARD", "TEST");
    }
    const transformed = putCard(state, "P1", "DRAGON_001", "MINION", "transformed");
    transformMinion(state, transformed, "TOKEN_UNDEAD_GENERIC");
    moveCard(state, transformed, "GRAVEYARD", "TEST");
    expect(refreshCardCost(state, "P1", bahamut)).toBe(18);
  });
  it("G04｜絕傑榮耀名稱", () => {
    expect(getCardDefinition("TOKEN_ALLIANCE_HEROIC_GLORY").name).toBe("絕傑榮耀");
    expect(getCardDefinition("ALLIANCE_001").effectsText).toContain("絕傑榮耀");
  });
});
