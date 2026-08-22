import type { CardInstance, ConditionDefinition, EffectDefinition, PlayerId } from "../cards/cardTypes";
import type { GameState } from "../state/GameState";
import { addLog } from "../utils/gameLog";
import { dealDamageToHero, dealDamageToMinion, grantDamageCap } from "./damageEngine";
import { InvalidActionError, NotImplementedError, RuleUndefinedError } from "./errors";
import { createCardInstance } from "../state/CardInstance";
import { searchDeckCard } from "./searchEngine";
import { hasActiveKeyword } from "../keywords/keywordRules";
import { grantTemporaryCostReduction } from "./costEngine";
import { shuffleSeeded } from "../utils/rng";
import { summonFromHandByEffect, summonGeneratedField, summonGeneratedMinion } from "./summonEngine";
import { drawCard, opponentOf } from "./turnEngine";
import { destroyMinion, findCard } from "./zoneEngine";
import { createTimingContext } from "./simultaneousEngine";
import { getCardDefinition } from "../cards/cardRegistry";
import { moveCard } from "./zoneEngine";
import { enqueueTriggeredEffects } from "./triggerEngine";
import { getLegalEnemyEffectTargets } from "./targetingEngine";
import { transformField, transformMinion } from "./transformEngine";
import { reviveMinion } from "./reviveEngine";
import { enqueueStateBasedEffectSummons } from "./effectSummonEngine";

function conditionMatches(
  state: GameState,
  playerId: PlayerId,
  source: CardInstance,
  condition: ConditionDefinition,
): boolean {
  switch (condition.type) {
    case "OPPONENT_HAS_MINION":
      return state.players[opponentOf(playerId)].minions.length > 0;
    case "NO_OTHER_FRIENDLY_MINIONS":
      return state.players[playerId].minions.every((card) => card.instanceId === source.instanceId);
    case "MAX_MANA_EQUALS":
      return state.players[playerId].maxMana === condition.value;
    case "FRIENDLY_ORIGINAL_COST_AT_LEAST":
      return state.players[playerId].minions.some((card) => {
        const cost = getCardDefinition(card.definitionId).originalCost;
        return cost !== null && cost >= condition.value;
      });
    case "FRIENDLY_FIELD_SUBTYPE":
      return state.players[playerId].fields.some((card) => getCardDefinition(card.definitionId).subtype.includes(condition.subtype));
    case "FRIENDLY_SAME_FIELD_COUNT_AT_LEAST":
      return state.players[playerId].fields.filter((card) => card.definitionId === source.definitionId).length >= condition.value;
    case "HERO_HP_BELOW":
      return state.players[playerId].heroHp < condition.value;
    case "SUMMONED_THIS_GAME_AT_LEAST":
      return state.players[playerId].summonedThisGame >= condition.value;
    case "SUMMONED_THIS_GAME_BELOW":
      return state.players[playerId].summonedThisGame < condition.value;
    case "FRIENDLY_MINION_COUNT_LESS_THAN_OPPONENT":
      return state.players[playerId].minions.length < state.players[opponentOf(playerId)].minions.length;
    case "FRIENDLY_MINION_COUNT_AT_LEAST":
      return state.players[playerId].minions.length >= condition.value;
    case "ALL":
      return condition.conditions.every((item) => conditionMatches(state, playerId, source, item));
  }
}

function canExecuteEffect(state: GameState, playerId: PlayerId, source: CardInstance, effect: EffectDefinition): boolean {
  switch (effect.type) {
    case "DRAW": return state.players[playerId].deck.length > 0;
    case "SUMMON": return state.players[playerId].minions.length < state.rulesConfig.minionLimit;
    case "SUMMON_FIELD": {
      const limit = state.rulesConfig.fieldLimits[state.players[playerId].faction];
      return limit === null || limit === undefined || state.players[playerId].fields.length < limit;
    }
    case "CHOOSE_DISTINCT_GENERATED_MINIONS":
      return effect.definitionIds.length >= effect.count
        && state.players[playerId].minions.length + effect.count <= state.rulesConfig.minionLimit;
    case "DAMAGE_TARGET_ENEMY_MINION":
    case "DESTROY_TARGET_ENEMY_MINION":
    case "SEAL_TARGET_ENEMY_MINION":
      return getLegalEnemyEffectTargets(state, playerId, true).length > 0;
    case "CONDITIONAL":
      return conditionMatches(state, playerId, source, effect.condition)
        && effect.effects.some((nested) => canExecuteEffect(state, playerId, source, nested));
    case "SET_HAND_CARD_COST_ZERO":
      return state.players[playerId].hand.filter((card) => {
        const definition = getCardDefinition(card.definitionId);
        return (!effect.cardType || definition.cardType === effect.cardType)
          && (!effect.subtype || definition.subtype.includes(effect.subtype));
      }).length >= effect.count;
    default: return true;
  }
}

function resolveEffectList(
  state: GameState,
  playerId: PlayerId,
  source: CardInstance,
  effects: readonly EffectDefinition[],
): boolean {
  function skipCommaChain(index: number): number | undefined {
    const boundary = effects.findIndex((candidate, candidateIndex) => candidateIndex > index && candidate.type === "SEGMENT_BREAK");
    return boundary < 0 ? undefined : boundary;
  }
  for (let effectIndex = 0; effectIndex < effects.length; effectIndex += 1) {
    const effect = effects[effectIndex];
    if (state.phase === "GAME_OVER") return true;
    const remainingEffects = effects.slice(effectIndex + 1) as EffectDefinition[];
    switch (effect.type) {
      case "GAIN_MANA":
        state.players[playerId].mana += effect.value;
        addLog(state, "RESOURCE", `${source.definitionId}：可用水晶 +${effect.value}`, {
          mana: state.players[playerId].mana,
          maxMana: state.players[playerId].maxMana,
        });
        break;
      case "DRAW":
        for (let count = 0; count < effect.value && !state.winner; count += 1) {
          drawCard(state, playerId, `EFFECT:${source.definitionId}`);
        }
        break;
      case "HEAL_HERO": {
        const player = state.players[playerId];
        const before = player.heroHp;
        player.heroHp = Math.min(player.heroMaxHp, player.heroHp + effect.value);
        const restored = player.heroHp - before;
        addLog(state, "RESOURCE", `${playerId} 恢复 ${restored} HP`, {
          source: source.definitionId,
          requested: effect.value,
          restored,
          heroHp: player.heroHp,
          heroMaxHp: player.heroMaxHp,
        });
        break;
      }
      case "MODIFY_SELF_HEALTH":
        if (hasActiveKeyword(source, "DISCIPLINE") || hasActiveKeyword(source, "INVINCIBLE")) {
          addLog(state, "PROTECTION", `${source.definitionId} 的纪律阻挡自身生命改值`, { instanceId: source.instanceId });
          break;
        }
        if (source.currentHealth === null || source.maxHealth === null) {
          throw new RuleUndefinedError("NULL_MINION_STATS", "手下生命为 null，不能改值", source.definitionId);
        }
        source.currentHealth += effect.value;
        source.maxHealth += effect.value;
        addLog(state, "RESOURCE", `${source.definitionId} +0/+${effect.value}`, { instanceId: source.instanceId });
        break;
      case "MODIFY_SELF_ATTACK":
        if (hasActiveKeyword(source, "DISCIPLINE") || hasActiveKeyword(source, "INVINCIBLE")) {
          addLog(state, "PROTECTION", `${source.definitionId} 的纪律阻挡自身攻击改值`, { instanceId: source.instanceId });
          break;
        }
        if (source.currentAttack === null) {
          throw new RuleUndefinedError("NULL_MINION_STATS", "手下攻击为 null，不能改值", source.definitionId);
        }
        source.currentAttack += effect.value;
        addLog(state, "RESOURCE", `${source.definitionId} +${effect.value}/+0`, { instanceId: source.instanceId });
        break;
      case "MODIFY_SELF_STATS":
        if (hasActiveKeyword(source, "DISCIPLINE") || hasActiveKeyword(source, "INVINCIBLE")) {
          addLog(state, "PROTECTION", `${source.definitionId} 的纪律阻挡自身面板改值`, { instanceId: source.instanceId });
          break;
        }
        if (source.currentAttack === null || source.currentHealth === null || source.maxHealth === null) {
          throw new RuleUndefinedError("NULL_MINION_STATS", "手下面板为 null，不能改值", source.definitionId);
        }
        source.currentAttack += effect.attack;
        source.currentHealth += effect.health;
        source.maxHealth += effect.health;
        addLog(state, "RESOURCE", `${source.definitionId} +${effect.attack}/+${effect.health}`, { instanceId: source.instanceId });
        break;
      case "INCREASE_MAX_MANA": {
        const player = state.players[playerId];
        player.maxMana += effect.value;
        addLog(state, "RESOURCE", `${playerId} 水晶最大值 +${effect.value}`, { source: source.definitionId, maxMana: player.maxMana });
        break;
      }
      case "RESTORE_MANA": {
        const player = state.players[playerId];
        player.mana = player.maxMana;
        addLog(state, "RESOURCE", `${playerId} 恢复所有水晶`, { source: source.definitionId, mana: player.mana });
        break;
      }
      case "RESTORE_MANA_VALUE": {
        const player = state.players[playerId];
        player.mana = Math.min(player.maxMana, player.mana + effect.value);
        addLog(state, "RESOURCE", `${playerId} 恢复${effect.value}水晶`, { source: source.definitionId, mana: player.mana });
        break;
      }
      case "RETURN_SELF_TO_HAND":
        if (source.zone !== "HAND") moveCard(state, source, "HAND", "RETURN_SELF_TO_HAND");
        break;
      case "RETURN_SELF_TO_DECK_SHUFFLE": {
        moveCard(state, source, "DECK", "ALTERNATE_RETURN_TO_DECK");
        const shuffled = shuffleSeeded(state.players[playerId].deck, state.rngSeed);
        state.players[playerId].deck = shuffled.value;
        state.rngSeed = shuffled.seed;
        addLog(state, "RNG", `${playerId} 将转费卡返回牌组并洗牌`, { instanceId: source.instanceId, resultingSeed: state.rngSeed });
        break;
      }
      case "SUMMON_SELF_FROM_HAND":
        if (!state.players[playerId].effectSummonUsedThisTurn.includes(source.definitionId)) {
          state.players[playerId].effectSummonUsedThisTurn.push(source.definitionId);
        }
        summonFromHandByEffect(state, source);
        break;
      case "CHOOSE_EFFECT_SUMMON_COPY": {
        const candidates = effect.candidateInstanceIds.filter((instanceId) =>
          state.players[playerId].hand.some((card) => card.instanceId === instanceId),
        );
        if (candidates.length === 0 || state.players[playerId].effectSummonUsedThisTurn.includes(effect.definitionId)) break;
        state.pendingChoice = {
          type: "EFFECT_CARDS",
          playerId,
          sourceInstanceId: source.instanceId,
          prompt: "同名卡的效果召唤本回合只能发动一次，请选择1张",
          count: 1,
          candidateInstanceIds: candidates,
          resolution: { type: "SUMMON_EFFECT_COPY", definitionId: effect.definitionId },
          remainingEffects,
        };
        return false;
      }
      case "COPY_HAND_SPELL_EFFECT": {
        const candidates = state.players[playerId].hand
          .filter((card) => getCardDefinition(card.definitionId).cardType === "SPELL")
          .map((card) => card.instanceId);
        if (candidates.length === 0) return false;
        state.pendingChoice = {
          type: "EFFECT_CARDS",
          playerId,
          sourceInstanceId: source.instanceId,
          prompt: "指定我方手牌1张法术，复制并发动其效果",
          count: 1,
          candidateInstanceIds: candidates,
          resolution: { type: "COPY_SPELL_EFFECT" },
          remainingEffects,
        };
        return false;
      }
      case "SCALED_END_TURN_CHOICE": {
        const bonus = state.players[playerId].maxMana >= effect.maxManaThreshold ? effect.bonus : 0;
        const damage = 3 + bonus;
        const health = 5 + bonus;
        const heal = 1 + bonus;
        state.pendingChoice = {
          type: "EFFECT_OPTION",
          playerId,
          sourceInstanceId: source.instanceId,
          prompt: "选择神威焰龙的回合结束效果",
          options: [
            {
              id: "DAMAGE",
              label: `给予对手所有手下与对手玩家 ${damage} 点伤害`,
              effects: [{ type: "DAMAGE_ALL_ENEMY_MINIONS", value: damage }, { type: "DAMAGE_ENEMY_HERO", value: damage }],
            },
            {
              id: "DEFEND",
              label: `获得嘲讽与 +0/+${health}，我方玩家恢复 ${heal} HP`,
              effects: [
                { type: "GAIN_SELF_KEYWORD", keyword: "TAUNT" },
                { type: "MODIFY_SELF_HEALTH", value: health },
                { type: "HEAL_HERO", value: heal },
              ],
            },
          ],
          remainingEffects,
        };
        return false;
      }
      case "CATASTROPHE_FLOOD": {
        const enemies = [...state.players[opponentOf(playerId)].minions];
        let transformedCount = 0;
        for (const enemy of enemies) {
          if (transformMinion(state, enemy, effect.transformDefinitionId)) transformedCount += 1;
        }
        const damageTargets = [...state.players[opponentOf(playerId)].minions];
        const timingContext = createTimingContext(state, `CATASTROPHE_FLOOD:${source.instanceId}`);
        for (const target of damageTargets) dealDamageToMinion(state, target, transformedCount, source.instanceId, "EFFECT");
        for (const target of damageTargets.filter((card) => (card.currentHealth ?? 1) <= 0)) {
          destroyMinion(state, target, "EFFECT_DAMAGE_DEATH", timingContext);
        }
        const player = state.players[playerId];
        const before = player.heroHp;
        player.heroHp = Math.min(player.heroMaxHp, player.heroHp + transformedCount);
        addLog(state, "RESOURCE", `${playerId} 因灾厄洪流恢复 ${player.heroHp - before} HP`, { transformedCount });
        if (player.fields.some((field) => field.definitionId === effect.doomFieldDefinitionId)) {
          for (let count = 0; count < effect.bonusSummonCount; count += 1) {
            summonGeneratedMinion(state, playerId, effect.bonusSummonDefinitionId);
          }
        }
        break;
      }
      case "SUMMON":
        for (let count = 0; count < effect.count; count += 1) summonGeneratedMinion(state, playerId, effect.definitionId);
        break;
      case "SUMMON_FIELD":
        for (let count = 0; count < effect.count; count += 1) summonGeneratedField(state, playerId, effect.definitionId);
        break;
      case "CHOOSE_GENERATED_FIELD":
        state.pendingChoice = {
          type: "EFFECT_OPTION",
          playerId,
          sourceInstanceId: source.instanceId,
          prompt: "选择要召唤的黑暗之书",
          options: effect.definitionIds.map((definitionId) => ({
            id: definitionId,
            label: getCardDefinition(definitionId).name,
            effects: [{ type: "SUMMON_FIELD", definitionId, count: 1 }],
          })),
          remainingEffects,
        };
        return false;
      case "CHOOSE_DISTINCT_GENERATED_MINIONS": {
        if (effect.count <= 0 || effect.definitionIds.length < effect.count) break;
        state.pendingChoice = {
          type: "EFFECT_OPTION",
          playerId,
          sourceInstanceId: source.instanceId,
          prompt: `选择机械神造物（尚需选择${effect.count}种，不可重复）`,
          options: effect.definitionIds.map((definitionId) => ({
            id: definitionId,
            label: getCardDefinition(definitionId).name,
            effects: [
              { type: "SUMMON", definitionId, count: 1 },
              ...(effect.count > 1 ? [{
                type: "CHOOSE_DISTINCT_GENERATED_MINIONS" as const,
                definitionIds: effect.definitionIds.filter((candidate) => candidate !== definitionId),
                count: effect.count - 1,
              }] : []),
            ],
          })),
          remainingEffects,
        };
        return false;
      }
      case "SUMMON_PER_FRIENDLY_FIELD_SUBTYPE": {
        const count = state.players[playerId].fields.filter((card) =>
          getCardDefinition(card.definitionId).subtype.includes(effect.subtype),
        ).length;
        for (let index = 0; index < count; index += 1) summonGeneratedMinion(state, playerId, effect.definitionId);
        break;
      }
      case "SUMMON_WITH_KEYWORD_IF_FIELD": {
        const grant = state.players[playerId].fields.some((field) => field.definitionId === effect.fieldDefinitionId);
        for (let index = 0; index < effect.count; index += 1) {
          const before = state.players[playerId].minions.length;
          if (!summonGeneratedMinion(state, playerId, effect.definitionId)) continue;
          const summoned = state.players[playerId].minions[before];
          if (grant && summoned && !summoned.keywords.includes(effect.keyword)) summoned.keywords.push(effect.keyword);
        }
        break;
      }
      case "VANISH_OLD_SAME_FIELD_AND_DRAW": {
        const old = state.players[playerId].fields.find((card) =>
          card.instanceId !== source.instanceId && card.definitionId === source.definitionId,
        );
        if (old) {
          const destination = getCardDefinition(old.definitionId).generatedOnly ? "EXTRA_DECK" : "REMOVED";
          moveCard(state, old, destination, "VANISH_OLD_SAME_FIELD");
          drawCard(state, playerId, `EFFECT:${source.definitionId}:REPLACE_OLD`);
        }
        break;
      }
      case "VANISH_OTHER_SAME_FIELDS": {
        const others = state.players[playerId].fields
          .filter((card) => card.instanceId !== source.instanceId && card.definitionId === source.definitionId)
          .slice(0, effect.count);
        if (others.length < effect.count) return false;
        for (const old of others) {
          const destination = getCardDefinition(old.definitionId).generatedOnly ? "EXTRA_DECK" : "REMOVED";
          moveCard(state, old, destination, "VANISH_OTHER_SAME_FIELDS");
        }
        break;
      }
      case "TRANSFORM_SELF_FIELD":
        transformField(state, source, effect.definitionId);
        break;
      case "ADD_GENERATED_TO_HAND":
        for (let count = 0; count < effect.count; count += 1) {
          const definition = getCardDefinition(effect.definitionId);
          const card = createCardInstance(definition, playerId, "HAND", `${playerId}-${effect.definitionId}-created-${state.turnNumber}-${state.log.length}-${count}`);
          state.players[playerId].hand.push(card);
          addLog(state, "ZONE", `${playerId} 获得 ${definition.name}`, { instanceId: card.instanceId, reason: "CREATE_TO_HAND" });
        }
        break;
      case "DAMAGE_ALL_ENEMY_MINIONS": {
        const enemies = [...state.players[opponentOf(playerId)].minions];
        const timingContext = createTimingContext(state, `AOE:${source.instanceId}`);
        for (const enemy of enemies) dealDamageToMinion(state, enemy, effect.value, source.instanceId, "EFFECT");
        for (const enemy of enemies.filter((card) => (card.currentHealth ?? 1) <= 0)) {
          destroyMinion(state, enemy, "EFFECT_DAMAGE_DEATH", timingContext);
        }
        break;
      }
      case "DAMAGE_ALL_ENEMY_MINIONS_BY_FRIENDLY_FIELD_SUBTYPE": {
        const value = state.players[playerId].fields.filter((field) => getCardDefinition(field.definitionId).subtype.includes(effect.subtype)).length;
        const enemies = [...state.players[opponentOf(playerId)].minions];
        const timingContext = createTimingContext(state, `SCALED_AOE:${source.instanceId}`);
        for (const enemy of enemies) dealDamageToMinion(state, enemy, value, source.instanceId, "EFFECT");
        for (const enemy of enemies.filter((card) => (card.currentHealth ?? 1) <= 0)) destroyMinion(state, enemy, "EFFECT_DAMAGE_DEATH", timingContext);
        break;
      }
      case "SNAPSHOT_FIELD_COUNT_DAMAGE_AND_SUMMON": {
        const value = state.players[playerId].fields.filter((field) => getCardDefinition(field.definitionId).subtype.includes(effect.subtype)).length;
        const enemies = [...state.players[opponentOf(playerId)].minions];
        const timingContext = createTimingContext(state, `SNAPSHOT_AOE:${source.instanceId}`);
        dealDamageToHero(state, opponentOf(playerId), value, source.instanceId);
        for (const enemy of enemies) dealDamageToMinion(state, enemy, value, source.instanceId, "EFFECT");
        for (const enemy of enemies.filter((card) => (card.currentHealth ?? 1) <= 0)) destroyMinion(state, enemy, "EFFECT_DAMAGE_DEATH", timingContext);
        for (let count = 0; count < value; count += 1) summonGeneratedMinion(state, playerId, effect.summonDefinitionId);
        break;
      }
      case "SNAPSHOT_ENEMY_COUNT_AOE_HERO_DRAW_SELF_DEBUFF": {
        const enemyCount = state.players[opponentOf(playerId)].minions.length;
        const enemies = [...state.players[opponentOf(playerId)].minions];
        const timingContext = createTimingContext(state, `SNAPSHOT_ENEMY:${source.instanceId}`);
        for (const enemy of enemies) dealDamageToMinion(state, enemy, effect.aoeDamage, source.instanceId, "EFFECT");
        for (const enemy of enemies.filter((card) => (card.currentHealth ?? 1) <= 0)) destroyMinion(state, enemy, "EFFECT_DAMAGE_DEATH", timingContext);
        dealDamageToHero(state, opponentOf(playerId), effect.heroDamage, source.instanceId);
        for (let count = 0; count < effect.draw && !state.winner; count += 1) drawCard(state, playerId, `EFFECT:${source.definitionId}`);
        if (source.zone === "MINION" && source.currentAttack !== null && source.currentHealth !== null && source.maxHealth !== null) {
          source.currentAttack -= enemyCount;
          source.currentHealth -= enemyCount;
          source.maxHealth -= enemyCount;
          addLog(state, "RESOURCE", `${source.definitionId} 依战吼开始快照 -${enemyCount}/-${enemyCount}`, { instanceId: source.instanceId, enemyCount });
          if (source.currentHealth <= 0) destroyMinion(state, source, "SELF_STAT_ZERO", timingContext);
        }
        break;
      }
      case "DAMAGE_ALL_OTHER_MINIONS": {
        const targets = [...state.players.P1.minions, ...state.players.P2.minions]
          .filter((card) => card.instanceId !== source.instanceId);
        const timingContext = createTimingContext(state, `AOE_OTHER:${source.instanceId}`);
        for (const target of targets) dealDamageToMinion(state, target, effect.value, source.instanceId, "EFFECT");
        for (const target of targets.filter((card) => (card.currentHealth ?? 1) <= 0)) {
          destroyMinion(state, target, "EFFECT_DAMAGE_DEATH", timingContext);
        }
        break;
      }
      case "DESTROY_ALL_ENEMY_MINIONS": {
        const targets = [...state.players[opponentOf(playerId)].minions];
        const timingContext = createTimingContext(state, `DESTROY_ALL:${source.instanceId}`);
        for (const target of targets) {
          if (hasActiveKeyword(target, "SANCTUARY") || hasActiveKeyword(target, "INVINCIBLE")) {
            addLog(state, "PROTECTION", `${target.definitionId} 阻挡范围效果直接消灭`, { source: source.instanceId });
            continue;
          }
          destroyMinion(state, target, "EFFECT_DESTROY_ALL", timingContext);
        }
        break;
      }
      case "DESTROY_UP_TO_ENEMY_MINIONS": {
        const candidates = getLegalEnemyEffectTargets(state, playerId).map((card) => card.instanceId);
        const count = Math.min(effect.maxCount, candidates.length);
        state.pendingChoice = {
          type: "EFFECT_CARDS",
          playerId,
          sourceInstanceId: source.instanceId,
          prompt: `指定0～${count}名对手手下消灭`,
          count,
          minCount: 0,
          candidateInstanceIds: candidates,
          resolution: { type: "DESTROY_MINIONS" },
          remainingEffects,
        };
        return false;
      }
      case "DESTROY_DISTINCT_ENEMY_MINIONS": {
        const candidates = getLegalEnemyEffectTargets(state, playerId).map((card) => card.instanceId);
        if (candidates.length < effect.count) {
          const boundary = skipCommaChain(effectIndex);
          if (boundary === undefined) return false;
          effectIndex = boundary;
          break;
        }
        state.pendingChoice = {
          type: "EFFECT_CARDS",
          playerId,
          sourceInstanceId: source.instanceId,
          prompt: `指定对手${effect.count}名不同手下消灭`,
          count: effect.count,
          candidateInstanceIds: candidates,
          resolution: { type: "DESTROY_MINIONS" },
          remainingEffects,
        };
        return false;
      }
      case "GRANT_ALL_FRIENDLY_KEYWORD":
        for (const target of state.players[playerId].minions) {
          const definition = getCardDefinition(target.definitionId);
          if (effect.subtypes && !effect.subtypes.every((subtype) => definition.subtype.includes(subtype))) continue;
          if (hasActiveKeyword(target, "DISCIPLINE") || hasActiveKeyword(target, "INVINCIBLE")) {
            addLog(state, "PROTECTION", `${target.definitionId} 的纪律阻挡获得 ${effect.keyword}`, { source: source.instanceId });
            continue;
          }
          if (!target.keywords.includes(effect.keyword)) target.keywords.push(effect.keyword);
        }
        addLog(state, "ACTION", `${playerId} 场上合法手下获得 ${effect.keyword}`, { source: source.instanceId });
        break;
      case "GRANT_TARGET_FRIENDLY_MINION_KEYWORD": {
        const candidates = state.players[playerId].minions.filter((card) => {
          const definition = getCardDefinition(card.definitionId);
          return (!effect.subtypes || effect.subtypes.every((subtype) => definition.subtype.includes(subtype)))
            && !hasActiveKeyword(card, "DISCIPLINE") && !hasActiveKeyword(card, "INVINCIBLE");
        });
        if (candidates.length === 0) return false;
        state.pendingChoice = {
          type: "EFFECT_CARDS",
          playerId,
          sourceInstanceId: source.instanceId,
          prompt: `指定我方1名合法手下获得${effect.keyword}`,
          count: 1,
          candidateInstanceIds: candidates.map((card) => card.instanceId),
          resolution: { type: "GRANT_MINION_KEYWORD", keyword: effect.keyword },
          remainingEffects,
        };
        return false;
      }
      case "GAIN_SELF_KEYWORD":
        if (hasActiveKeyword(source, "DISCIPLINE") || hasActiveKeyword(source, "INVINCIBLE")) {
          addLog(state, "PROTECTION", `${source.definitionId} 的纪律阻挡自身获得 ${effect.keyword}`);
        } else if (!source.keywords.includes(effect.keyword)) {
          source.keywords.push(effect.keyword);
          addLog(state, "ACTION", `${source.definitionId} 获得 ${effect.keyword}`, { instanceId: source.instanceId });
        }
        break;
      case "DAMAGE_ENEMY_HERO":
        dealDamageToHero(state, opponentOf(playerId), effect.value, source.instanceId);
        break;
      case "DISCARD_HAND": {
        const candidates = state.players[playerId].hand.map((card) => card.instanceId);
        if (candidates.length < effect.count) {
          const boundary = skipCommaChain(effectIndex);
          if (boundary === undefined) return false;
          effectIndex = boundary;
          break;
        }
        state.pendingChoice = {
          type: "EFFECT_CARDS",
          playerId,
          sourceInstanceId: source.instanceId,
          prompt: `指定丢弃 ${effect.count} 张手牌`,
          count: effect.count,
          candidateInstanceIds: candidates,
          resolution: { type: "DISCARD_HAND" },
          remainingEffects,
        };
        return false;
      }
      case "DAMAGE_TARGET_ENEMY_MINION": {
        const candidates = getLegalEnemyEffectTargets(state, playerId).map((card) => card.instanceId);
        if (candidates.length === 0) {
          const boundary = skipCommaChain(effectIndex);
          if (boundary === undefined) return false;
          effectIndex = boundary;
          break;
        }
        state.pendingChoice = {
          type: "EFFECT_CARDS",
          playerId,
          sourceInstanceId: source.instanceId,
          prompt: `指定对手 1 手下，造成 ${effect.value} 点伤害`,
          count: 1,
          candidateInstanceIds: candidates,
          resolution: { type: "DAMAGE_MINION", value: effect.value },
          remainingEffects,
        };
        return false;
      }
      case "DAMAGE_TARGET_ENEMY_MINION_OR_HERO": {
        const candidates = getLegalEnemyEffectTargets(state, playerId).map((card) => card.instanceId);
        if (candidates.length === 0) {
          dealDamageToHero(state, opponentOf(playerId), effect.heroValue ?? effect.value, source.instanceId);
          break;
        }
        state.pendingChoice = {
          type: "EFFECT_CARDS",
          playerId,
          sourceInstanceId: source.instanceId,
          prompt: `指定对手1手下，造成${effect.value}点伤害`,
          count: 1,
          candidateInstanceIds: candidates,
          resolution: { type: "DAMAGE_MINION", value: effect.value },
          remainingEffects,
        };
        return false;
      }
      case "REPEAT_DAMAGE_TARGET_ENEMY_MINION_BY_FRIENDLY_FIELD_SUBTYPE": {
        const hits = state.players[playerId].fields.filter((field) => getCardDefinition(field.definitionId).subtype.includes(effect.subtype)).length;
        const candidates = getLegalEnemyEffectTargets(state, playerId).map((card) => card.instanceId);
        if (hits === 0 || candidates.length === 0) break;
        state.pendingChoice = {
          type: "EFFECT_CARDS",
          playerId,
          sourceInstanceId: source.instanceId,
          prompt: `指定对手1手下造成${effect.value}点伤害（剩余${hits}次）`,
          count: 1,
          candidateInstanceIds: candidates,
          resolution: { type: "REPEAT_DAMAGE_MINION", value: effect.value, remainingHits: hits },
          remainingEffects,
        };
        return false;
      }
      case "DAMAGE_DISTINCT_ENEMY_MINIONS_REWARD_KILLS": {
        const candidates = getLegalEnemyEffectTargets(state, playerId).map((card) => card.instanceId);
        if (candidates.length < effect.count) {
          const boundary = skipCommaChain(effectIndex);
          if (boundary === undefined) return false;
          effectIndex = boundary;
          break;
        }
        state.pendingChoice = {
          type: "EFFECT_CARDS",
          playerId,
          sourceInstanceId: source.instanceId,
          prompt: `指定对手 ${effect.count} 个不同手下，各造成 ${effect.value} 点伤害`,
          count: effect.count,
          candidateInstanceIds: candidates,
          resolution: {
            type: "DAMAGE_MINIONS_REWARD_KILLS",
            value: effect.value,
            drawPerKill: effect.drawPerKill,
            healPerKill: effect.healPerKill,
          },
          remainingEffects,
        };
        return false;
      }
      case "VANISH_ENEMY_MINIONS": {
        const candidates = getLegalEnemyEffectTargets(state, playerId).map((card) => card.instanceId);
        if (candidates.length < effect.count) {
          const boundary = skipCommaChain(effectIndex);
          if (boundary === undefined) return false;
          effectIndex = boundary;
          break;
        }
        state.pendingChoice = {
          type: "EFFECT_CARDS",
          playerId,
          sourceInstanceId: source.instanceId,
          prompt: `指定使对手 ${effect.count} 个不同手下消失`,
          count: effect.count,
          candidateInstanceIds: candidates,
          resolution: { type: "VANISH_MINIONS" },
          remainingEffects,
        };
        return false;
      }
      case "TRANSFORM_ENEMY_MINIONS": {
        const candidates = getLegalEnemyEffectTargets(state, playerId, true)
          .filter((card) => effect.maxHealth === undefined || (card.currentHealth !== null && card.currentHealth <= effect.maxHealth))
          .map((card) => card.instanceId);
        if (candidates.length < effect.count) return false;
        state.pendingChoice = {
          type: "EFFECT_CARDS",
          playerId,
          sourceInstanceId: source.instanceId,
          prompt: `指定转变对手 ${effect.count} 个不同手下`,
          count: effect.count,
          candidateInstanceIds: candidates,
          resolution: { type: "TRANSFORM_MINIONS", definitionId: effect.definitionId },
          remainingEffects,
        };
        return false;
      }
      case "REVIVE_FRIENDLY_GRAVE_MINION": {
        const candidates = state.players[playerId].graveyard.filter((card) => {
          const definition = getCardDefinition(card.definitionId);
          if (definition.cardType !== "MINION" || definition.originalCost === null) return false;
          return (effect.maxOriginalCost === undefined || definition.originalCost <= effect.maxOriginalCost)
            && (effect.minOriginalCost === undefined || definition.originalCost >= effect.minOriginalCost);
        });
        if (candidates.length === 0) return false;
        state.pendingChoice = {
          type: "EFFECT_CARDS",
          playerId,
          sourceInstanceId: source.instanceId,
          prompt: "指定我方弃堆1张合法手下复活",
          count: 1,
          candidateInstanceIds: candidates.map((card) => card.instanceId),
          resolution: { type: "REVIVE_MINION" },
          remainingEffects,
        };
        return false;
      }
      case "DESTROY_TARGET_ENEMY_MINION": {
        const candidates = getLegalEnemyEffectTargets(state, playerId).map((card) => card.instanceId);
        if (candidates.length === 0) {
          const boundary = skipCommaChain(effectIndex);
          if (boundary === undefined) return false;
          effectIndex = boundary;
          break;
        }
        state.pendingChoice = {
          type: "EFFECT_CARDS",
          playerId,
          sourceInstanceId: source.instanceId,
          prompt: "指定消灭对手 1 手下",
          count: 1,
          candidateInstanceIds: candidates,
          resolution: { type: "DESTROY_MINION" },
          remainingEffects,
        };
        return false;
      }
      case "RETURN_FRIENDLY_MINION_DRAW_BY_COST": {
        const candidates = state.players[playerId].minions
          .filter((card) => getCardDefinition(card.definitionId).subtype.includes(effect.subtype))
          .map((card) => card.instanceId);
        if (candidates.length === 0) {
          const boundary = skipCommaChain(effectIndex);
          if (boundary === undefined) return false;
          effectIndex = boundary;
          break;
        }
        state.pendingChoice = {
          type: "EFFECT_CARDS",
          playerId,
          sourceInstanceId: source.instanceId,
          prompt: `指定我方 1 张 ${effect.subtype} 手下返回手牌`,
          count: 1,
          candidateInstanceIds: candidates,
          resolution: { type: "RETURN_MINION_DRAW_BY_COST", threshold: effect.threshold, low: effect.low, high: effect.high },
          remainingEffects,
        };
        return false;
      }
      case "SEARCH_DECK": {
        const candidates = state.players[playerId].deck
          .filter((card) => (!effect.cardType || getCardDefinition(card.definitionId).cardType === effect.cardType)
            && (!effect.definitionId || card.definitionId === effect.definitionId))
          .map((card) => card.instanceId);
        if (candidates.length === 0) {
          const boundary = skipCommaChain(effectIndex);
          if (boundary === undefined) return false;
          effectIndex = boundary;
          break;
        }
        state.pendingChoice = {
          type: "EFFECT_CARDS",
          playerId,
          sourceInstanceId: source.instanceId,
          prompt: effect.definitionId ? `从牌库检索 1 张${getCardDefinition(effect.definitionId).name}` : `从牌库检索 1 张${effect.cardType === "SPELL" ? "法术" : "卡牌"}`,
          count: 1,
          candidateInstanceIds: candidates,
          resolution: { type: "SEARCH_DECK" },
          remainingEffects,
        };
        return false;
      }
      case "DISCOVER_TOP": {
        const revealed = state.players[playerId].deck.slice(-effect.reveal);
        const matches = (card: CardInstance) => {
          const definition = getCardDefinition(card.definitionId);
          return (!effect.cardType || definition.cardType === effect.cardType)
            && (!effect.subtype || definition.subtype.includes(effect.subtype));
        };
        const candidates = revealed.filter(matches);
        addLog(state, "ACTION", `${playerId} 从牌组上方翻开 ${revealed.length} 张进行发现`, {
          source: source.definitionId,
          revealed: revealed.map((card) => card.instanceId),
          legal: candidates.map((card) => card.instanceId),
        });
        if (candidates.length < effect.count) {
          if (effect.fallbackDrawIfNoMatchInDeck && !state.players[playerId].deck.some(matches)) {
            for (let count = 0; count < effect.fallbackDrawIfNoMatchInDeck && !state.winner; count += 1) {
              drawCard(state, playerId, `EFFECT:${source.definitionId}:DISCOVER_FALLBACK`);
            }
          }
          const boundary = skipCommaChain(effectIndex);
          if (boundary === undefined) return false;
          effectIndex = boundary;
          break;
        }
        state.pendingChoice = {
          type: "EFFECT_CARDS",
          playerId,
          sourceInstanceId: source.instanceId,
          prompt: `从发现候选中指定 ${effect.count} 张牌`,
          count: effect.count,
          candidateInstanceIds: candidates.map((card) => card.instanceId),
          resolution: {
            type: "DISCOVER_TO_HAND",
            temporaryCostReduction: effect.temporaryCostReduction,
            discardFromSelected: effect.discardFromSelected,
          },
          remainingEffects,
        };
        return false;
      }
      case "SEAL_TARGET_ENEMY_MINION": {
        const candidates = getLegalEnemyEffectTargets(state, playerId, true).map((card) => card.instanceId);
        if (candidates.length === 0) {
          const boundary = skipCommaChain(effectIndex);
          if (boundary === undefined) return false;
          effectIndex = boundary;
          break;
        }
        state.pendingChoice = {
          type: "EFFECT_CARDS",
          playerId,
          sourceInstanceId: source.instanceId,
          prompt: "指定对手 1 手下并永久封印至离场",
          count: 1,
          candidateInstanceIds: candidates,
          resolution: { type: "SEAL_MINION" },
          remainingEffects,
        };
        return false;
      }
      case "GAIN_NECROMANCY":
        state.players[playerId].resources.necromancy += effect.value;
        addLog(state, "RESOURCE", `${playerId} 死灵数 +${effect.value}`, {
          source: source.definitionId,
          necromancy: state.players[playerId].resources.necromancy,
        });
        break;
      case "GAIN_RECYCLE_CHARGE":
        state.players[playerId].resources.recycleCharge += effect.value;
        addLog(state, "RESOURCE", `${playerId} 回收充能 +${effect.value}`, {
          source: source.definitionId,
          recycleCharge: state.players[playerId].resources.recycleCharge,
        });
        break;
      case "GAIN_RECYCLE_CHARGE_BY_FRIENDLY_FIELD_SUBTYPE": {
        const value = state.players[playerId].fields.filter((field) => getCardDefinition(field.definitionId).subtype.includes(effect.subtype)).length;
        state.players[playerId].resources.recycleCharge += value;
        addLog(state, "RESOURCE", `${playerId} 回收充能 +${value}`, {
          source: source.definitionId,
          recycleCharge: state.players[playerId].resources.recycleCharge,
        });
        break;
      }
      case "GRANT_NEXT_HERO_DAMAGE_ZERO":
        state.players[playerId].heroDamageNullifiers += effect.count;
        addLog(state, "PROTECTION", `${playerId} 接下来${effect.count}次受到的伤害变为0`, { source: source.instanceId });
        break;
      case "GRANT_NEXT_MINION_TEMPORARY_COST_REDUCTION":
        state.players[playerId].nextMinionTemporaryCostReduction += effect.value;
        addLog(state, "RESOURCE", `${playerId} 本回合下一张手下费用-${effect.value}`, { source: source.instanceId });
        break;
      case "GRANT_ALL_FRIENDLY_DAMAGE_CAP":
        for (const target of state.players[playerId].minions) grantDamageCap(target, effect.value);
        addLog(state, "PROTECTION", `${playerId} 场上手下永久获得单次伤害上限${effect.value}`, { source: source.instanceId });
        break;
      case "GRANT_HERO_DIVINE_SHIELD":
        state.players[playerId].heroDivineShield = true;
        addLog(state, "PROTECTION", `${playerId} 玩家获得圣盾术`, { source: source.instanceId });
        break;
      case "CHOOSE_ONE":
        state.pendingChoice = {
          type: "EFFECT_OPTION",
          playerId,
          sourceInstanceId: source.instanceId,
          prompt: effect.prompt,
          options: effect.options,
          remainingEffects,
        };
        return false;
      case "HEROIC_GLORY": {
        const next: EffectDefinition = { type: "CHOOSE_UNACQUIRED_GENERATED_TO_HAND", definitionIds: effect.heroDefinitionIds, historyKey: effect.historyKey };
        const options = [];
        if (getLegalEnemyEffectTargets(state, playerId).length > 0) {
          options.push({ id: "DESTROY", label: "消灭对手1手下", effects: [{ type: "DESTROY_TARGET_ENEMY_MINION" as const }, { type: "SEGMENT_BREAK" as const }, next] });
        }
        options.push({ id: "DRAW", label: "抽2张牌", effects: [{ type: "DRAW" as const, value: 2 }, { type: "SEGMENT_BREAK" as const }, next] });
        state.pendingChoice = {
          type: "EFFECT_OPTION",
          playerId,
          sourceInstanceId: source.instanceId,
          prompt: "选择绝杰荣耀效果",
          options,
          remainingEffects,
        };
        return false;
      }
      case "CHOOSE_UNACQUIRED_GENERATED_TO_HAND": {
        const acquired = state.players[playerId].choiceHistory[effect.historyKey] ?? [];
        const candidates = effect.definitionIds.filter((definitionId) => !acquired.includes(definitionId));
        if (candidates.length === 0) break;
        state.pendingChoice = {
          type: "EFFECT_OPTION",
          playerId,
          sourceInstanceId: source.instanceId,
          prompt: "选择尚未取得的绝杰加入手牌",
          options: candidates.map((definitionId) => ({
            id: definitionId,
            label: getCardDefinition(definitionId).name,
            effects: [{ type: "RECORD_CHOICE_ADD_GENERATED_TO_HAND", definitionId, historyKey: effect.historyKey }],
          })),
          remainingEffects,
        };
        return false;
      }
      case "RECORD_CHOICE_ADD_GENERATED_TO_HAND": {
        const acquired = state.players[playerId].choiceHistory[effect.historyKey] ?? [];
        if (!acquired.includes(effect.definitionId)) acquired.push(effect.definitionId);
        state.players[playerId].choiceHistory[effect.historyKey] = acquired;
        const definition = getCardDefinition(effect.definitionId);
        const card = createCardInstance(definition, playerId, "HAND", `${playerId}-${effect.definitionId}-choice-${state.turnNumber}-${state.log.length}`);
        state.players[playerId].hand.push(card);
        addLog(state, "ZONE", `${playerId} 取得 ${definition.name}`, { instanceId: card.instanceId, historyKey: effect.historyKey });
        break;
      }
      case "MECHANICAL_TECHNIQUE": {
        const player = state.players[playerId];
        const executableEffects = effect.effects.filter((nested) => canExecuteEffect(state, playerId, source, nested));
        if (player.resources.recycleCharge < effect.cost || executableEffects.length === 0) break;
        player.resources.recycleCharge -= effect.cost;
        addLog(state, "RESOURCE", `${source.definitionId} 发动机械术${effect.cost}`, {
          source: source.instanceId,
          recycleCharge: player.resources.recycleCharge,
        });
        if (!resolveEffectList(state, playerId, source, executableEffects)) return false;
        break;
      }
      case "SET_HAND_CARD_COST_ZERO": {
        const candidates = state.players[playerId].hand.filter((card) => {
          const definition = getCardDefinition(card.definitionId);
          return (!effect.cardType || definition.cardType === effect.cardType)
            && (!effect.subtype || definition.subtype.includes(effect.subtype));
        });
        if (candidates.length < effect.count) break;
        state.pendingChoice = {
          type: "EFFECT_CARDS",
          playerId,
          sourceInstanceId: source.instanceId,
          prompt: `指定${effect.count}张手牌使费用变为0`,
          count: effect.count,
          candidateInstanceIds: candidates.map((card) => card.instanceId),
          resolution: { type: "SET_CARD_COST_ZERO" },
          remainingEffects,
        };
        return false;
      }
      case "RETURN_HAND_TO_DECK_MACHINE_DISCOUNT": {
        const candidates = state.players[playerId].hand
          .filter((card) => card.instanceId !== source.instanceId)
          .map((card) => card.instanceId);
        state.pendingChoice = {
          type: "EFFECT_CARDS",
          playerId,
          sourceInstanceId: source.instanceId,
          prompt: `选择0～${Math.min(effect.maxCount, candidates.length)}张手牌返回牌组并洗牌`,
          count: Math.min(effect.maxCount, candidates.length),
          minCount: 0,
          candidateInstanceIds: candidates,
          resolution: { type: "RETURN_HAND_TO_DECK_MACHINE_DISCOUNT", reductionPerCard: effect.reductionPerCard },
          remainingEffects,
        };
        return false;
      }
      case "NECRO_REVIVE_SELF": {
        const player = state.players[playerId];
        if (state.activePlayerId !== playerId || source.zone !== "GRAVEYARD") break;
        if (source.necroRevivedTurn === state.turnNumber || player.resources.necromancy < effect.value) break;
        if (player.minions.length >= state.rulesConfig.minionLimit) break;
        player.resources.necromancy -= effect.value;
        addLog(state, "RESOURCE", `${source.definitionId} 消耗 ${effect.value} 死灵数发动死灵复活`, {
          instanceId: source.instanceId,
          necromancy: player.resources.necromancy,
        });
        reviveMinion(state, playerId, source, "NECRO_REVIVE");
        break;
      }
      case "SEGMENT_BREAK":
        break;
      case "CONDITIONAL":
        if (conditionMatches(state, playerId, source, effect.condition) && !resolveEffectList(state, playerId, source, effect.effects)) return false;
        break;
      case "RULE_UNDEFINED":
        throw new RuleUndefinedError(effect.ruleId, "效果标记为未定义", source.definitionId);
    }
  }
  return true;
}

export function resolvePendingEffects(state: GameState): void {
  while (state.pendingEffects.length > 0 && state.phase !== "GAME_OVER") {
    const timingId = state.pendingEffects[0].timingId;
    const batch = state.pendingEffects.filter((effect) => effect.timingId === timingId);
    if (batch.length > 1 && !batch.every((effect) => effect.orderConfirmed)) {
      const controllerOrder = [state.activePlayerId, opponentOf(state.activePlayerId)];
      for (const controllerId of controllerOrder) {
        const group = batch.filter((effect) => effect.controllerId === controllerId);
        if (group.length === 0 || group.every((effect) => effect.orderConfirmed)) continue;
        if (group.length === 1) {
          group[0].orderConfirmed = true;
          continue;
        }
        state.pendingChoice = {
          type: "TRIGGER_ORDER",
          playerId: controllerId,
          timingId,
          instanceIds: group.map((effect) => effect.sourceInstanceId),
        };
        addLog(state, "ACTION", `${controllerId} 选择同一时机触发效果的处理顺序`, { timingId });
        return;
      }
      const remainder = state.pendingEffects.filter((effect) => effect.timingId !== timingId);
      state.pendingEffects = [
        ...controllerOrder.flatMap((controllerId) => batch.filter((effect) => effect.controllerId === controllerId)),
        ...remainder,
      ];
      continue;
    }
    const pending = state.pendingEffects.shift()!;
    const source = findCard(state, pending.sourceInstanceId);
    if (!source) throw new Error(`Triggered effect source ${pending.sourceInstanceId} no longer exists`);
    addLog(state, "ACTION", `${source.definitionId} 结算延后触发效果`, {
      sourceInstanceId: source.instanceId,
      cause: pending.cause,
    });
    resolveEffectList(state, pending.controllerId, source, pending.effects);
    if (state.pendingChoice) return;
    enqueueStateBasedEffectSummons(state, state.activePlayerId);
  }
}

export function selectTriggerOrder(state: GameState, playerId: PlayerId, instanceIds: string[]): void {
  const choice = state.pendingChoice;
  if (!choice || choice.type !== "TRIGGER_ORDER" || choice.playerId !== playerId) {
    throw new Error("目前没有此触发排序选择");
  }
  if (instanceIds.length !== choice.instanceIds.length || new Set(instanceIds).size !== instanceIds.length) {
    throw new Error("必须排列全部且不重复的触发来源");
  }
  if (instanceIds.some((id) => !choice.instanceIds.includes(id))) throw new Error("触发来源不合法");
  const batch = state.pendingEffects.filter((effect) => effect.timingId === choice.timingId);
  const remainder = state.pendingEffects.filter((effect) => effect.timingId !== choice.timingId);
  const selectedController = batch.filter((effect) => effect.controllerId === playerId);
  const ordered = instanceIds
    .map((id) => selectedController.find((effect) => effect.sourceInstanceId === id)!)
    .map((effect) => ({ ...effect, orderConfirmed: true }));
  const otherController = batch.filter((effect) => effect.controllerId !== playerId);
  state.pendingEffects = playerId === state.activePlayerId
    ? [...ordered, ...otherController, ...remainder]
    : [...otherController, ...ordered, ...remainder];
  state.pendingChoice = undefined;
  resolvePendingEffects(state);
}

export function resolveEffects(
  state: GameState,
  playerId: PlayerId,
  source: CardInstance,
  effects: readonly EffectDefinition[],
  drainPending = true,
): void {
  resolveEffectList(state, playerId, source, effects);
  if (!state.pendingChoice) enqueueStateBasedEffectSummons(state, state.activePlayerId);
  if (drainPending && !state.pendingChoice) resolvePendingEffects(state);
}

export function selectEffectCards(state: GameState, playerId: PlayerId, instanceIds: string[]): void {
  const choice = state.pendingChoice;
  if (!choice || choice.type !== "EFFECT_CARDS" || choice.playerId !== playerId) {
    throw new InvalidActionError("目前没有此效果选择");
  }
  const minCount = choice.minCount ?? choice.count;
  if (instanceIds.length < minCount || instanceIds.length > choice.count || new Set(instanceIds).size !== instanceIds.length) {
    throw new InvalidActionError(choice.minCount === undefined ? `必须指定 ${choice.count} 张不同卡牌` : `必须指定 ${minCount}～${choice.count} 张不同卡牌`);
  }
  if (instanceIds.some((id) => !choice.candidateInstanceIds.includes(id))) throw new InvalidActionError("指定目标不合法");
  const source = findCard(state, choice.sourceInstanceId);
  if (!source) throw new InvalidActionError("效果来源已不存在");
  state.pendingChoice = undefined;
  const timingContext = createTimingContext(state, `CHOICE:${source.instanceId}`);

  if (choice.resolution.type === "DISCARD_HAND") {
    for (const instanceId of instanceIds) {
      const card = state.players[playerId].hand.find((candidate) => candidate.instanceId === instanceId);
      if (!card) throw new InvalidActionError("弃牌目标已经不在手牌");
      const definition = getCardDefinition(card.definitionId);
      moveCard(state, card, definition.generatedOnly ? "EXTRA_DECK" : "GRAVEYARD", "EFFECT_DISCARD");
      const discardEffects = !card.sealed && card.keywords.includes("ON_DISCARD") ? definition.triggeredEffects?.ON_DISCARD : undefined;
      const graveEntryEffects: EffectDefinition[] = [...(discardEffects ?? [])];
      if (!definition.generatedOnly && card.keywords.includes("NECRO_REVIVE_4")) graveEntryEffects.push({ type: "NECRO_REVIVE_SELF", value: 4 });
      if (!definition.generatedOnly && card.keywords.includes("NECRO_REVIVE_5")) graveEntryEffects.push({ type: "NECRO_REVIVE_SELF", value: 5 });
      if (graveEntryEffects.length > 0) enqueueTriggeredEffects(state, card, graveEntryEffects, "EFFECT_DISCARD:GRAVE_ENTRY", timingContext);
    }
  } else if (choice.resolution.type === "SET_CARD_COST_ZERO") {
    for (const instanceId of instanceIds) {
      const card = state.players[playerId].hand.find((candidate) => candidate.instanceId === instanceId);
      if (!card) throw new InvalidActionError("费用变更目标已经不在手牌");
      card.counters.fixedCost = 0;
      card.currentCost = 0;
      addLog(state, "RESOURCE", `${card.definitionId} 费用变为0`, { instanceId: card.instanceId });
    }
  } else if (choice.resolution.type === "RETURN_HAND_TO_DECK_MACHINE_DISCOUNT") {
    for (const instanceId of instanceIds) {
      const card = state.players[playerId].hand.find((candidate) => candidate.instanceId === instanceId);
      if (!card) throw new InvalidActionError("返回牌组的目标已经不在手牌");
      moveCard(state, card, "DECK", "RETURN_HAND_TO_DECK");
    }
    const shuffled = shuffleSeeded(state.players[playerId].deck, state.rngSeed);
    state.players[playerId].deck = shuffled.value;
    state.rngSeed = shuffled.seed;
    state.players[playerId].nextMachineCostReduction = instanceIds.length * choice.resolution.reductionPerCard;
    addLog(state, "RNG", `${playerId} 将${instanceIds.length}张手牌返回牌组并洗牌`, {
      instanceIds,
      resultingSeed: state.rngSeed,
      nextMachineCostReduction: state.players[playerId].nextMachineCostReduction,
    });
    drawCard(state, playerId, `EFFECT:${source.definitionId}`);
  } else if (choice.resolution.type === "RETURN_MINION_DRAW_BY_COST") {
    const target = findCard(state, instanceIds[0]);
    if (!target || target.zone !== "MINION" || target.controllerId !== playerId) throw new InvalidActionError("返回目标已经不在我方手下区");
    const originalCost = getCardDefinition(target.definitionId).originalCost;
    if (originalCost === null) throw new RuleUndefinedError("NULL_CARD_COST", "返回目标原始费用为 null", target.definitionId);
    const destination = getCardDefinition(target.definitionId).generatedOnly ? "EXTRA_DECK" : "HAND";
    moveCard(state, target, destination, "RETURN_TO_HAND");
    const drawCount = originalCost >= choice.resolution.threshold ? choice.resolution.high : choice.resolution.low;
    for (let count = 0; count < drawCount && !state.winner; count += 1) drawCard(state, playerId, `EFFECT:${source.definitionId}`);
  } else if (choice.resolution.type === "SEARCH_DECK") {
    searchDeckCard(state, playerId, instanceIds[0]);
  } else if (choice.resolution.type === "DISCOVER_TO_HAND") {
    for (const instanceId of instanceIds) {
      const card = state.players[playerId].deck.find((candidate) => candidate.instanceId === instanceId);
      if (!card) throw new InvalidActionError("发现目标已经不在牌库");
      moveCard(state, card, "HAND", "DISCOVER");
      if (choice.resolution.temporaryCostReduction) {
        grantTemporaryCostReduction(state, playerId, card, choice.resolution.temporaryCostReduction);
      }
    }
    addLog(state, "ACTION", `${playerId} 完成发现；未选牌保持原相对顺序`, { selected: instanceIds });
    if (choice.resolution.discardFromSelected) {
      state.pendingChoice = {
        type: "EFFECT_CARDS",
        playerId,
        sourceInstanceId: source.instanceId,
        prompt: `从本次发现加入手牌的牌中指定丢弃 ${choice.resolution.discardFromSelected} 张`,
        count: choice.resolution.discardFromSelected,
        candidateInstanceIds: [...instanceIds],
        resolution: { type: "DISCARD_HAND" },
        remainingEffects: choice.remainingEffects,
      };
      return;
    }
  } else if (choice.resolution.type === "SUMMON_EFFECT_COPY") {
    const selected = state.players[playerId].hand.find((card) => card.instanceId === instanceIds[0]);
    if (!selected || selected.definitionId !== choice.resolution.definitionId) throw new InvalidActionError("效果召唤选择已经失效");
    if (!state.players[playerId].effectSummonUsedThisTurn.includes(choice.resolution.definitionId)) {
      state.players[playerId].effectSummonUsedThisTurn.push(choice.resolution.definitionId);
    }
    summonFromHandByEffect(state, selected);
  } else if (choice.resolution.type === "COPY_SPELL_EFFECT") {
    const selected = state.players[playerId].hand.find((card) => card.instanceId === instanceIds[0]);
    if (!selected) throw new InvalidActionError("复制的法术已经不在我方手牌");
    const copiedDefinition = getCardDefinition(selected.definitionId);
    if (copiedDefinition.cardType !== "SPELL" || !copiedDefinition.effects?.length) {
      throw new NotImplementedError("所选法术效果尚未实现，不能略过后复制", copiedDefinition.id);
    }
    addLog(state, "ACTION", `${source.definitionId} 复制并发动 ${copiedDefinition.name} 的效果`, {
      source: source.instanceId,
      copiedSpell: selected.instanceId,
    });
    resolveEffects(state, playerId, source, [...copiedDefinition.effects, ...choice.remainingEffects]);
    return;
  } else if (choice.resolution.type === "DAMAGE_MINIONS_REWARD_KILLS") {
    const targets = instanceIds.map((instanceId) => {
      const target = findCard(state, instanceId);
      if (!target || target.zone !== "MINION") throw new InvalidActionError("伤害目标已经不在手下区");
      return target;
    });
    for (const target of targets) dealDamageToMinion(state, target, choice.resolution.value, source.instanceId, "EFFECT");
    const killed = targets.filter((target) => (target.currentHealth ?? 1) <= 0);
    for (const target of killed) destroyMinion(state, target, "EFFECT_DAMAGE_DEATH", timingContext);
    for (let count = 0; count < killed.length * choice.resolution.drawPerKill && !state.winner; count += 1) {
      drawCard(state, playerId, `EFFECT:${source.definitionId}:KILL_REWARD`);
    }
    if (!state.winner && killed.length > 0 && choice.resolution.healPerKill > 0) {
      const player = state.players[playerId];
      const requested = killed.length * choice.resolution.healPerKill;
      const before = player.heroHp;
      player.heroHp = Math.min(player.heroMaxHp, player.heroHp + requested);
      addLog(state, "RESOURCE", `${playerId} 因消灭奖励恢复 ${player.heroHp - before} HP`, { requested, killed: killed.length });
    }
  } else if (choice.resolution.type === "VANISH_MINIONS") {
    for (const instanceId of instanceIds) {
      const target = findCard(state, instanceId);
      if (!target || target.zone !== "MINION") throw new InvalidActionError("消失目标已经不在手下区");
      if (hasActiveKeyword(target, "INVINCIBLE")) {
        addLog(state, "PROTECTION", `${target.definitionId} 的无敌阻挡消失`, { source: source.instanceId });
        continue;
      }
      const destination = getCardDefinition(target.definitionId).generatedOnly ? "EXTRA_DECK" : "REMOVED";
      moveCard(state, target, destination, "VANISH");
    }
  } else if (choice.resolution.type === "TRANSFORM_MINIONS") {
    for (const instanceId of instanceIds) {
      const target = findCard(state, instanceId);
      if (!target || target.zone !== "MINION") throw new InvalidActionError("转变目标已经不在手下区");
      transformMinion(state, target, choice.resolution.definitionId);
    }
  } else if (choice.resolution.type === "REVIVE_MINION") {
    const target = findCard(state, instanceIds[0]);
    if (!target || target.zone !== "GRAVEYARD") throw new InvalidActionError("复活目标已经不在弃堆");
    reviveMinion(state, playerId, target);
  } else if (choice.resolution.type === "REPEAT_DAMAGE_MINION") {
    const target = findCard(state, instanceIds[0]);
    if (!target || target.zone !== "MINION") throw new InvalidActionError("重复伤害目标已经不在手下区");
    dealDamageToMinion(state, target, choice.resolution.value, source.instanceId, "EFFECT");
    if ((target.currentHealth ?? 1) <= 0) destroyMinion(state, target, "EFFECT_DAMAGE_DEATH", timingContext);
    const remainingHits = choice.resolution.remainingHits - 1;
    const candidates = getLegalEnemyEffectTargets(state, playerId).map((card) => card.instanceId);
    if (remainingHits > 0 && candidates.length > 0) {
      state.pendingChoice = {
        type: "EFFECT_CARDS",
        playerId,
        sourceInstanceId: source.instanceId,
        prompt: `重新指定对手1手下造成${choice.resolution.value}点伤害（剩余${remainingHits}次）`,
        count: 1,
        candidateInstanceIds: candidates,
        resolution: { type: "REPEAT_DAMAGE_MINION", value: choice.resolution.value, remainingHits },
        remainingEffects: choice.remainingEffects,
      };
      return;
    }
  } else if (choice.resolution.type === "DESTROY_MINIONS") {
    for (const instanceId of instanceIds) {
      const target = findCard(state, instanceId);
      if (!target || target.zone !== "MINION") continue;
      if (hasActiveKeyword(target, "SANCTUARY") || hasActiveKeyword(target, "INVINCIBLE")) continue;
      destroyMinion(state, target, "EFFECT_DESTROY", timingContext);
    }
  } else {
    const target = findCard(state, instanceIds[0]);
    if (!target || target.zone !== "MINION") throw new InvalidActionError("效果目标已经不在手下区");
    if (choice.resolution.type === "DAMAGE_MINION") {
      dealDamageToMinion(state, target, choice.resolution.value, source.instanceId, "EFFECT");
      if ((target.currentHealth ?? 1) <= 0) destroyMinion(state, target, "EFFECT_DAMAGE_DEATH", timingContext);
    } else if (choice.resolution.type === "DESTROY_MINION") {
      if (hasActiveKeyword(target, "SANCTUARY") || hasActiveKeyword(target, "INVINCIBLE")) {
        addLog(state, "PROTECTION", `${target.definitionId} 阻挡效果直接消灭`, { source: source.instanceId, target: target.instanceId });
      } else {
        destroyMinion(state, target, "EFFECT_DESTROY", timingContext);
      }
    } else if (choice.resolution.type === "GRANT_MINION_KEYWORD") {
      if (!target.keywords.includes(choice.resolution.keyword)) target.keywords.push(choice.resolution.keyword);
      addLog(state, "ACTION", `${target.definitionId} 获得 ${choice.resolution.keyword}`, { source: source.instanceId, target: target.instanceId });
    } else {
      target.sealed = true;
      addLog(state, "ACTION", `${target.definitionId} 被永久封印至离场`, { source: source.instanceId, target: target.instanceId });
    }
  }

  resolveEffects(state, playerId, source, choice.remainingEffects);
}

export function selectEffectOption(state: GameState, playerId: PlayerId, optionId: string): void {
  const choice = state.pendingChoice;
  if (!choice || choice.type !== "EFFECT_OPTION" || choice.playerId !== playerId) {
    throw new InvalidActionError("目前没有此效果选项");
  }
  const option = choice.options.find((candidate) => candidate.id === optionId);
  if (!option) throw new InvalidActionError("效果选项不合法");
  const source = findCard(state, choice.sourceInstanceId);
  if (!source) throw new InvalidActionError("效果来源已不存在");
  state.pendingChoice = undefined;
  addLog(state, "ACTION", `${playerId} 选择：${option.label}`, { source: source.instanceId, optionId });
  resolveEffects(state, playerId, source, [...option.effects, ...choice.remainingEffects]);
}
