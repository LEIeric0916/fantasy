import { describe, expect, it } from "vitest";
import { getCardDefinition } from "../../src/game/cards/cardRegistry";
import { refreshCardCost } from "../../src/game/engine/costEngine";
import { applyAction } from "../../src/game/engine/gameEngine";
import { createCardInstance } from "../../src/game/state/CardInstance";
import { mainState, putCard } from "../helpers";

function addGraveDragons(state: ReturnType<typeof mainState>, count: number) {
  for (let index = 0; index < count; index += 1) {
    state.players.P1.graveyard.push(createCardInstance(getCardDefinition("DRAGON_001"), "P1", "GRAVEYARD", `grave-dragon-${index}`));
  }
}

describe("赤焰的龙皇兵战吼", () => {
  it("指定两个不同手下各4伤，并按实际消灭数抽牌与恢复", () => {
    let state = mainState();
    state.players.P1.hand = [];
    state.players.P1.heroHp = 25;
    const soldier = putCard(state, "P1", "DRAGON_010", "HAND", "battlecry");
    const killed = putCard(state, "P2", "UNDEAD_001", "MINION", "killed");
    const survived = putCard(state, "P2", "DRAGON_012", "MINION", "survived");
    const deckBefore = state.players.P1.deck.length;

    state = applyAction(state, { type: "PLAY_CARD", playerId: "P1", instanceId: soldier.instanceId }).state;
    expect(state.pendingChoice).toMatchObject({ type: "EFFECT_CARDS", count: 2 });
    state = applyAction(state, { type: "SELECT_EFFECT_CARDS", playerId: "P1", instanceIds: [killed.instanceId, survived.instanceId] }).state;
    expect(state.players.P2.graveyard.some((card) => card.instanceId === killed.instanceId)).toBe(true);
    expect(state.players.P2.minions.find((card) => card.instanceId === survived.instanceId)?.currentHealth).toBe(8);
    expect(state.players.P1.deck).toHaveLength(deckBefore - 1);
    expect(state.players.P1.heroHp).toBe(26);
  });

  it("不足两个合法目标时不能指定较少目标，战吼不造成伤害", () => {
    let state = mainState();
    state.players.P1.hand = [];
    const soldier = putCard(state, "P1", "DRAGON_010", "HAND", "insufficient");
    const target = putCard(state, "P2", "DRAGON_012", "MINION", "only");
    state = applyAction(state, { type: "PLAY_CARD", playerId: "P1", instanceId: soldier.instanceId }).state;
    expect(state.pendingChoice).toBeUndefined();
    expect(state.players.P2.minions.find((card) => card.instanceId === target.instanceId)?.currentHealth).toBe(12);
  });
});

describe("巴哈姆特", () => {
  it("只按弃堆当前面板仍为龙族手下的数量减费", () => {
    const state = mainState();
    const bahamut = putCard(state, "P1", "DRAGON_012", "HAND", "cost");
    addGraveDragons(state, 2);
    const transformedOriginalDragon = createCardInstance(getCardDefinition("DRAGON_001"), "P1", "GRAVEYARD", "transformed-original");
    transformedOriginalDragon.definitionId = "TOKEN_UNDEAD_GENERIC";
    state.players.P1.graveyard.push(transformedOriginalDragon);
    refreshCardCost(state, "P1", bahamut);
    expect(bahamut.currentCost).toBe(18);
  });

  it("消失两个不同敌方手下，不触发死亡区域；句号后独立造成12点玩家伤害", () => {
    let state = mainState();
    state.players.P1.hand = [];
    addGraveDragons(state, 12);
    const bahamut = putCard(state, "P1", "DRAGON_012", "HAND", "normal");
    const first = putCard(state, "P2", "UNDEAD_002", "MINION", "first");
    const second = putCard(state, "P2", "UNDEAD_003", "MINION", "second");
    const remains = putCard(state, "P2", "DRAGON_001", "MINION", "remains");
    const p2DeckBefore = state.players.P2.deck.length;

    state = applyAction(state, { type: "PLAY_CARD", playerId: "P1", instanceId: bahamut.instanceId }).state;
    expect(state.players.P1.mana).toBe(2);
    state = applyAction(state, { type: "SELECT_EFFECT_CARDS", playerId: "P1", instanceIds: [first.instanceId, second.instanceId] }).state;
    expect(state.players.P2.removed.map((card) => card.instanceId)).toEqual(expect.arrayContaining([first.instanceId, second.instanceId]));
    expect(state.players.P2.graveyard).toHaveLength(0);
    expect(state.players.P2.deck).toHaveLength(p2DeckBefore);
    expect(state.players.P2.heroHp).toBe(18);
    expect(state.players.P2.minions.some((card) => card.instanceId === remains.instanceId)).toBe(true);
  });

  it("不足两个消失目标时，句号后的12点伤害仍执行", () => {
    let state = mainState();
    state.players.P1.hand = [];
    addGraveDragons(state, 12);
    const bahamut = putCard(state, "P1", "DRAGON_012", "HAND", "one-target");
    const target = putCard(state, "P2", "UNDEAD_001", "MINION", "only");
    state = applyAction(state, { type: "PLAY_CARD", playerId: "P1", instanceId: bahamut.instanceId }).state;
    expect(state.pendingChoice).toBeUndefined();
    expect(state.players.P2.minions.some((card) => card.instanceId === target.instanceId)).toBe(true);
    expect(state.players.P2.heroHp).toBe(18);
  });
});
