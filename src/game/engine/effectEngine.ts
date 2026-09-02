import type { CardInstance, ConditionDefinition, EffectDefinition, PlayerId } from "../cards/cardTypes";
import type { GameState } from "../state/GameState";
import { addLog } from "../utils/gameLog";
import { dealDamageToHero, dealDamageToMinion, grantDamageCap } from "./damageEngine";
import { InvalidActionError, NotImplementedError, RuleUndefinedError } from "./errors";
import { createCardInstance } from "../state/CardInstance";
import { searchDeckCard } from "./searchEngine";
import { hasActiveKeyword } from "../keywords/keywordRules";
import { grantTemporaryCostReduction, refreshHandCosts } from "./costEngine";
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

function notifyEffectSkipped(state: GameState, playerId: PlayerId, source: CardInstance, reason: string): void {
  const sourceName = getCardDefinition(source.definitionId).name;
  state.effectNotices.push({
    id: state.log.length,
    playerId,
    sourceInstanceId: source.instanceId,
    sourceName,
    reason,
  });
  addLog(state, "RULE", `${sourceName} 的效果未發動：${reason}`, {
    playerId,
    sourceInstanceId: source.instanceId,
    reason,
  });
}

function conditionFailureReason(condition: ConditionDefinition): string {
  switch (condition.type) {
    case "OPPONENT_HAS_MINION": return "對手場上沒有手下";
    case "NO_OTHER_FRIENDLY_MINIONS": return "我方場上仍有其他手下";
    case "MAX_MANA_EQUALS": return `最大水晶不等於 ${condition.value}`;
    case "MAX_MANA_AT_LEAST": return `最大水晶未達 ${condition.value}`;
    case "FRIENDLY_ORIGINAL_COST_AT_LEAST": return `我方場上沒有原始費用 ${condition.value} 以上的手下`;
    case "FRIENDLY_FIELD_SUBTYPE": return `我方場上沒有符合 ${condition.subtype === "ARTIFACT" ? "神器" : condition.subtype} 的立場`;
    case "FRIENDLY_SAME_FIELD_COUNT_AT_LEAST": return `同名立場未達 ${condition.value} 張`;
    case "HERO_HP_BELOW": return `我方玩家生命未低於 ${condition.value}`;
    case "SUMMONED_THIS_GAME_AT_LEAST": return `本場累積召喚手下未達 ${condition.value} 名`;
    case "SUMMONED_THIS_GAME_BELOW": return `本場累積召喚手下未低於 ${condition.value} 名`;
    case "FRIENDLY_MINION_COUNT_LESS_THAN_OPPONENT": return "我方手下數量沒有少於對手";
    case "FRIENDLY_MINION_COUNT_AT_LEAST": return `我方場上手下未達 ${condition.value} 名`;
    case "ALL": return condition.conditions.map(conditionFailureReason).join("；");
  }
}

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
    case "MAX_MANA_AT_LEAST":
      return state.players[playerId].maxMana >= condition.value;
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

export function canExecuteEffect(state: GameState, playerId: PlayerId, source: CardInstance, effect: EffectDefinition): boolean {
  switch (effect.type) {
    case "DRAW": return state.players[playerId].deck.length > 0;
    case "RESTORE_MANA":
    case "RESTORE_MANA_VALUE":
      return state.players[playerId].mana < state.players[playerId].maxMana;
    case "SUMMON": return state.players[playerId].minions.length < state.rulesConfig.minionLimit;
    case "SUMMON_FIELD": {
      const limit = state.rulesConfig.fieldLimits[state.players[playerId].faction];
      return limit === null || limit === undefined || state.players[playerId].fields.length < limit;
    }
    case "CHOOSE_DISTINCT_GENERATED_FIELDS": {
      const limit = state.rulesConfig.fieldLimits[state.players[playerId].faction];
      return effect.definitionIds.length >= effect.count
        && (limit === null || limit === undefined || state.players[playerId].fields.length + effect.count <= limit);
    }
    case "CHOOSE_DISTINCT_GENERATED_MINIONS": {
      const availableSlots = state.rulesConfig.minionLimit - state.players[playerId].minions.length;
      return effect.upTo
        ? effect.definitionIds.length > 0 && availableSlots > 0
        : effect.definitionIds.length >= effect.count && availableSlots >= effect.count;
    }
    case "DAMAGE_TARGET_ENEMY_MINION":
    case "DESTROY_TARGET_ENEMY_MINION":
    case "SEAL_TARGET_ENEMY_MINION":
      return getLegalEnemyEffectTargets(state, playerId, true).length > 0;
    case "CONDITIONAL":
      return conditionMatches(state, playerId, source, effect.condition)
        && effect.effects.some((nested) => canExecuteEffect(state, playerId, source, nested));
    case "NECROMANCY":
      return state.players[playerId].resources.necromancy >= effect.cost
        && effect.effects.some((nested) => canExecuteEffect(state, playerId, source, nested));
    case "SET_HAND_CARD_COST_ZERO":
      return state.players[playerId].hand.some((card) => {
        const definition = getCardDefinition(card.definitionId);
        return (!effect.cardType || definition.cardType === effect.cardType)
          && (!effect.subtype || definition.subtype.includes(effect.subtype))
          && (!effect.subtypes || effect.subtypes.some((subtype) => definition.subtype.includes(subtype)));
      });
    default: return true;
  }
}

export function shouldEnqueueTriggeredEffectList(
  state: GameState,
  playerId: PlayerId,
  source: CardInstance,
  effects: readonly EffectDefinition[],
): boolean {
  return effects.some((effect) => {
    if (effect.type === "SEGMENT_BREAK") return false;
    if (effect.type === "CONDITIONAL" && effect.silentOnFailure) {
      return conditionMatches(state, playerId, source, effect.condition);
    }
    if (effect.type === "NECROMANCY" && effect.silentIfInsufficient) {
      return state.players[playerId].resources.necromancy >= effect.cost;
    }
    return true;
  });
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
        addLog(state, "RESOURCE", `${playerId} 恢復 ${restored} HP`, {
          source: source.definitionId,
          requested: effect.value,
          restored,
          heroHp: player.heroHp,
          heroMaxHp: player.heroMaxHp,
        });
        break;
      }
      case "MODIFY_SELF_HEALTH":
        if (hasActiveKeyword(source, "INVINCIBLE")) {
          addLog(state, "PROTECTION", `${source.definitionId} 的無敵阻擋自身生命改值`, { instanceId: source.instanceId });
          break;
        }
        if (source.currentHealth === null || source.maxHealth === null) {
          throw new RuleUndefinedError("NULL_MINION_STATS", "手下生命為 null，不能改值", source.definitionId);
        }
        source.currentHealth += effect.value;
        source.maxHealth += effect.value;
        addLog(state, "RESOURCE", `${source.definitionId} +0/+${effect.value}`, { instanceId: source.instanceId });
        break;
      case "MODIFY_SELF_ATTACK":
        if (hasActiveKeyword(source, "INVINCIBLE")) {
          addLog(state, "PROTECTION", `${source.definitionId} 的無敵阻擋自身攻擊改值`, { instanceId: source.instanceId });
          break;
        }
        if (source.currentAttack === null) {
          throw new RuleUndefinedError("NULL_MINION_STATS", "手下攻擊為 null，不能改值", source.definitionId);
        }
        source.currentAttack += effect.value;
        addLog(state, "RESOURCE", `${source.definitionId} +${effect.value}/+0`, { instanceId: source.instanceId });
        break;
      case "MODIFY_SELF_ATTACK_UNTIL_LEAVES":
        if (hasActiveKeyword(source, "INVINCIBLE")) {
          addLog(state, "PROTECTION", `${source.definitionId} 的無敵阻擋自身攻擊改值`, { instanceId: source.instanceId });
          break;
        }
        if (source.currentAttack === null) {
          throw new RuleUndefinedError("NULL_MINION_STATS", "手下攻擊為 null，不能改值", source.definitionId);
        }
        source.currentAttack += effect.value;
        source.counters.leaveAttackBonus = (source.counters.leaveAttackBonus ?? 0) + effect.value;
        addLog(state, "RESOURCE", `${source.definitionId} +${effect.value}/+0（離場時還原）`, { instanceId: source.instanceId });
        break;
      case "MODIFY_SELF_STATS":
        if (hasActiveKeyword(source, "INVINCIBLE")) {
          addLog(state, "PROTECTION", `${source.definitionId} 的無敵阻擋自身面板改值`, { instanceId: source.instanceId });
          break;
        }
        if (source.currentAttack === null || source.currentHealth === null || source.maxHealth === null) {
          throw new RuleUndefinedError("NULL_MINION_STATS", "手下面板為 null，不能改值", source.definitionId);
        }
        source.currentAttack += effect.attack;
        source.currentHealth += effect.health;
        source.maxHealth += effect.health;
        addLog(state, "RESOURCE", `${source.definitionId} +${effect.attack}/+${effect.health}`, { instanceId: source.instanceId });
        break;
      case "INCREASE_MAX_MANA": {
        const player = state.players[playerId];
        const before = player.maxMana;
        player.maxMana = Math.min(state.rulesConfig.normalMaxMana, player.maxMana + effect.value);
        addLog(state, "RESOURCE", `${playerId} 水晶最大值 +${player.maxMana - before}`, { source: source.definitionId, requested: effect.value, maxMana: player.maxMana, cap: state.rulesConfig.normalMaxMana });
        break;
      }
      case "RESTORE_MANA": {
        const player = state.players[playerId];
        player.mana = player.maxMana;
        addLog(state, "RESOURCE", `${playerId} 恢復所有水晶`, { source: source.definitionId, mana: player.mana });
        break;
      }
      case "RESTORE_MANA_VALUE": {
        const player = state.players[playerId];
        player.mana = Math.min(player.maxMana, player.mana + effect.value);
        addLog(state, "RESOURCE", `${playerId} 恢復${effect.value}水晶`, { source: source.definitionId, mana: player.mana });
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
        addLog(state, "RNG", `${playerId} 將轉費卡返回牌組並洗牌`, { instanceId: source.instanceId, resultingSeed: state.rngSeed });
        break;
      }
      case "SUMMON_SELF_FROM_HAND":
        state.pendingChoice = {
          type: "EFFECT_SUMMON_CONFIRM",
          playerId,
          sourceInstanceId: source.instanceId,
          remainingEffects,
        };
        addLog(state, "ACTION", `${getCardDefinition(source.definitionId).name} 的效果召喚等待玩家確認`, { sourceInstanceId: source.instanceId });
        return false;
      case "CHOOSE_EFFECT_SUMMON_COPY": {
        const candidates = effect.candidateInstanceIds.filter((instanceId) =>
          state.players[playerId].hand.some((card) => card.instanceId === instanceId),
        );
        if (candidates.length === 0 || state.players[playerId].effectSummonUsedThisTurn.includes(effect.definitionId)) break;
        state.pendingChoice = {
          type: "EFFECT_CARDS",
          playerId,
          sourceInstanceId: source.instanceId,
          prompt: "同名卡的效果召喚本回合只能發動一次，請選擇1張",
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
        if (candidates.length === 0) {
          notifyEffectSkipped(state, playerId, source, "手牌中沒有可複製的法術");
          return false;
        }
        state.pendingChoice = {
          type: "EFFECT_CARDS",
          playerId,
          sourceInstanceId: source.instanceId,
          prompt: "指定我方手牌1張法術，複製並發動其效果",
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
          prompt: "選擇神威焰龍的回合結束效果",
          options: [
            {
              id: "DAMAGE",
              label: `給予對手所有手下與對手玩家 ${damage} 點傷害`,
              effects: [{ type: "DAMAGE_ALL_ENEMY_MINIONS", value: damage }, { type: "DAMAGE_ENEMY_HERO", value: damage }],
            },
            {
              id: "DEFEND",
              label: `獲得嘲諷與 +0/+${health}，我方玩家恢復 ${heal} HP`,
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
          if (hasActiveKeyword(enemy, "DISCIPLINE")) continue;
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
        addLog(state, "RESOURCE", `${playerId} 因災厄洪流恢復 ${player.heroHp - before} HP`, { transformedCount });
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
          prompt: "選擇要召喚的黑暗之書",
          options: effect.definitionIds.map((definitionId) => ({
            id: definitionId,
            label: getCardDefinition(definitionId).name,
            effects: [{ type: "SUMMON_FIELD", definitionId, count: 1 }],
          })),
          remainingEffects,
        };
        return false;
      case "CHOOSE_DISTINCT_GENERATED_FIELDS": {
        if (effect.count <= 0 || effect.definitionIds.length < effect.count) break;
        state.pendingChoice = {
          type: "EFFECT_OPTION",
          playerId,
          sourceInstanceId: source.instanceId,
          prompt: `選擇黑暗之書（尚需選擇${effect.count}種，不可重複）`,
          options: effect.definitionIds.map((definitionId) => ({
            id: definitionId,
            label: getCardDefinition(definitionId).name,
            effects: [
              { type: "SUMMON_FIELD", definitionId, count: 1 },
              ...(effect.count > 1 ? [{
                type: "CHOOSE_DISTINCT_GENERATED_FIELDS" as const,
                definitionIds: effect.definitionIds.filter((candidate) => candidate !== definitionId),
                count: effect.count - 1,
              }] : []),
            ],
          })),
          remainingEffects,
        };
        return false;
      }
      case "CHOOSE_DISTINCT_GENERATED_MINIONS": {
        const availableSlots = state.rulesConfig.minionLimit - state.players[playerId].minions.length;
        const choiceCount = effect.upTo ? Math.min(effect.count, availableSlots) : effect.count;
        if (choiceCount <= 0 || effect.definitionIds.length < choiceCount) break;
        const options: { id: string; label: string; effects: EffectDefinition[] }[] = effect.definitionIds.map((definitionId) => ({
          id: definitionId,
          label: getCardDefinition(definitionId).name,
          effects: [
            { type: "SUMMON", definitionId, count: 1 },
            ...(choiceCount > 1 ? [{
              type: "CHOOSE_DISTINCT_GENERATED_MINIONS" as const,
              definitionIds: effect.definitionIds.filter((candidate) => candidate !== definitionId),
              count: choiceCount - 1,
              upTo: effect.upTo,
            }] : []),
          ],
        }));
        if (effect.upTo) options.push({ id: "STOP", label: "不再召喚", effects: [] });
        state.pendingChoice = {
          type: "EFFECT_OPTION",
          playerId,
          sourceInstanceId: source.instanceId,
          prompt: `選擇最多${choiceCount}種機械神造物（不可重復）`,
          options,
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
          if (grant && summoned) {
            for (const keyword of [effect.keyword, ...(effect.additionalKeywords ?? [])]) {
              if (!summoned.keywords.includes(keyword)) summoned.keywords.push(keyword);
            }
          }
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
        } else if (!effect.silentIfNone) {
          notifyEffectSkipped(state, playerId, source, "我方場上沒有其他同名立場");
        }
        break;
      }
      case "VANISH_OTHER_SAME_FIELDS": {
        const others = state.players[playerId].fields
          .filter((card) => card.instanceId !== source.instanceId && card.definitionId === source.definitionId)
          .slice(0, effect.count);
        if (others.length < effect.count) {
          notifyEffectSkipped(state, playerId, source, `沒有足夠的其他同名立場（需要 ${effect.count} 張，目前 ${others.length} 張）`);
          return false;
        }
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
          addLog(state, "ZONE", `${playerId} 獲得 ${definition.name}`, { instanceId: card.instanceId, reason: "CREATE_TO_HAND" });
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
          source.currentHealth = Math.max(0, source.currentHealth - enemyCount);
          source.maxHealth = Math.max(0, source.maxHealth - enemyCount);
          addLog(state, "RESOURCE", `${source.definitionId} 依戰吼開始快照 -${enemyCount}/-${enemyCount}`, { instanceId: source.instanceId, enemyCount });
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
            addLog(state, "PROTECTION", `${target.definitionId} 阻擋范圍效果直接消滅`, { source: source.instanceId });
            continue;
          }
          destroyMinion(state, target, "EFFECT_DESTROY_ALL", timingContext);
        }
        break;
      }
      case "DESTROY_UP_TO_ENEMY_MINIONS": {
        const candidates = getLegalEnemyEffectTargets(state, playerId).map((card) => card.instanceId);
        const count = Math.min(effect.maxCount, candidates.length);
        if (count === 0) {
          notifyEffectSkipped(state, playerId, source, "對手場上沒有可被消滅的合法手下");
          break;
        }
        state.pendingChoice = {
          type: "EFFECT_CARDS",
          playerId,
          sourceInstanceId: source.instanceId,
          prompt: `指定0～${count}名對手手下消滅`,
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
        const requiredCount = effect.minCount ?? effect.count;
        if (candidates.length < requiredCount) {
          notifyEffectSkipped(state, playerId, source, `可被消滅的敵方手下不足 ${effect.count} 名（目前 ${candidates.length} 名）`);
          const boundary = skipCommaChain(effectIndex);
          if (boundary === undefined) return false;
          effectIndex = boundary;
          break;
        }
        if (candidates.length === 0 && requiredCount === 0) break;
        const count = Math.min(effect.count, candidates.length);
        state.pendingChoice = {
          type: "EFFECT_CARDS",
          playerId,
          sourceInstanceId: source.instanceId,
          prompt: effect.minCount === undefined ? `指定對手${effect.count}名不同手下消滅` : `指定對手最多${effect.count}名不同手下消滅`,
          count,
          minCount: effect.minCount,
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
          if (hasActiveKeyword(target, "INVINCIBLE")) {
            addLog(state, "PROTECTION", `${target.definitionId} 的無敵阻擋獲得 ${effect.keyword}`, { source: source.instanceId });
            continue;
          }
          if (!target.keywords.includes(effect.keyword)) target.keywords.push(effect.keyword);
        }
        addLog(state, "ACTION", `${playerId} 場上合法手下獲得 ${effect.keyword}`, { source: source.instanceId });
        break;
      case "GRANT_TARGET_FRIENDLY_MINION_KEYWORD": {
        const candidates = state.players[playerId].minions.filter((card) => {
          const definition = getCardDefinition(card.definitionId);
          return (!effect.subtypes || effect.subtypes.every((subtype) => definition.subtype.includes(subtype)))
            && !hasActiveKeyword(card, "INVINCIBLE");
        });
        if (candidates.length === 0) {
          notifyEffectSkipped(state, playerId, source, "我方場上沒有符合條件的手下");
          return false;
        }
        state.pendingChoice = {
          type: "EFFECT_CARDS",
          playerId,
          sourceInstanceId: source.instanceId,
          prompt: `指定我方1名合法手下獲得${effect.keyword}`,
          count: 1,
          candidateInstanceIds: candidates.map((card) => card.instanceId),
          resolution: { type: "GRANT_MINION_KEYWORD", keyword: effect.keyword },
          remainingEffects,
        };
        return false;
      }
      case "GAIN_SELF_KEYWORD":
        if (hasActiveKeyword(source, "INVINCIBLE")) {
          addLog(state, "PROTECTION", `${source.definitionId} 的無敵阻擋自身獲得 ${effect.keyword}`);
        } else if (!source.keywords.includes(effect.keyword)) {
          source.keywords.push(effect.keyword);
          addLog(state, "ACTION", `${source.definitionId} 獲得 ${effect.keyword}`, { instanceId: source.instanceId });
        }
        break;
      case "DAMAGE_ENEMY_HERO":
        dealDamageToHero(state, opponentOf(playerId), effect.value, source.instanceId);
        break;
      case "DISCARD_HAND": {
        const candidates = state.players[playerId].hand.map((card) => card.instanceId);
        if (candidates.length < effect.count) {
          notifyEffectSkipped(state, playerId, source, `可丟棄的手牌不足 ${effect.count} 張（目前 ${candidates.length} 張）`);
          const boundary = skipCommaChain(effectIndex);
          if (boundary === undefined) return false;
          effectIndex = boundary;
          break;
        }
        state.pendingChoice = {
          type: "EFFECT_CARDS",
          playerId,
          sourceInstanceId: source.instanceId,
          prompt: `指定丟棄 ${effect.count} 張手牌`,
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
          notifyEffectSkipped(state, playerId, source, "對手場上沒有可指定的合法手下");
          const boundary = skipCommaChain(effectIndex);
          if (boundary === undefined) return false;
          effectIndex = boundary;
          break;
        }
        state.pendingChoice = {
          type: "EFFECT_CARDS",
          playerId,
          sourceInstanceId: source.instanceId,
          prompt: `指定對手 1 手下，造成 ${effect.value} 點傷害`,
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
          prompt: `指定對手1手下，造成${effect.value}點傷害`,
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
        if (hits === 0 || candidates.length === 0) {
          notifyEffectSkipped(state, playerId, source, hits === 0 ? `我方場上沒有符合 ${effect.subtype} 的立場` : "對手場上沒有可指定的合法手下");
          break;
        }
        state.pendingChoice = {
          type: "EFFECT_CARDS",
          playerId,
          sourceInstanceId: source.instanceId,
          prompt: `指定對手1手下造成${effect.value}點傷害（剩余${hits}次）`,
          count: 1,
          candidateInstanceIds: candidates,
          resolution: { type: "REPEAT_DAMAGE_MINION", value: effect.value, remainingHits: hits },
          remainingEffects,
        };
        return false;
      }
      case "DAMAGE_DISTINCT_ENEMY_MINIONS_REWARD_KILLS": {
        const candidates = getLegalEnemyEffectTargets(state, playerId).map((card) => card.instanceId);
        const count = Math.min(effect.count, candidates.length);
        if (count === 0) {
          notifyEffectSkipped(state, playerId, source, "對手場上沒有可指定的合法手下");
          break;
        }
        state.pendingChoice = {
          type: "EFFECT_CARDS",
          playerId,
          sourceInstanceId: source.instanceId,
          prompt: `指定對手場上最多 ${effect.count} 名不同手下，各造成 ${effect.value} 點傷害`,
          count,
          minCount: 0,
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
      case "REPEAT_DAMAGE_ENEMY_MINION_OR_HERO": {
        const candidates = getLegalEnemyEffectTargets(state, playerId).map((card) => card.instanceId);
        if (effect.count <= 0) break;
        if (candidates.length === 0) {
          if (effect.heroMaxHits > 0) dealDamageToHero(state, opponentOf(playerId), effect.value, source.instanceId);
          break;
        }
        state.pendingChoice = {
          type: "EFFECT_CARDS",
          playerId,
          sourceInstanceId: source.instanceId,
          prompt: `指定對手1名手下造成${effect.value}點傷害（剩餘${effect.count}次）`,
          count: 1,
          candidateInstanceIds: candidates,
          resolution: {
            type: "REPEAT_DAMAGE_MINION_OR_HERO",
            value: effect.value,
            remainingHits: effect.count,
            heroHitsRemaining: effect.heroMaxHits,
          },
          remainingEffects,
        };
        return false;
      }
      case "VANISH_ENEMY_MINIONS": {
        const candidates = getLegalEnemyEffectTargets(state, playerId).map((card) => card.instanceId);
        if (candidates.length < effect.count) {
          notifyEffectSkipped(state, playerId, source, `可使其消失的敵方手下不足 ${effect.count} 名（目前 ${candidates.length} 名）`);
          const boundary = skipCommaChain(effectIndex);
          if (boundary === undefined) return false;
          effectIndex = boundary;
          break;
        }
        state.pendingChoice = {
          type: "EFFECT_CARDS",
          playerId,
          sourceInstanceId: source.instanceId,
          prompt: `指定使對手 ${effect.count} 個不同手下消失`,
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
        if (candidates.length < effect.count) {
          notifyEffectSkipped(state, playerId, source, `符合轉變條件的敵方手下不足 ${effect.count} 名（目前 ${candidates.length} 名）`);
          return false;
        }
        state.pendingChoice = {
          type: "EFFECT_CARDS",
          playerId,
          sourceInstanceId: source.instanceId,
          prompt: `指定轉變對手 ${effect.count} 個不同手下`,
          count: effect.count,
          candidateInstanceIds: candidates,
          resolution: { type: "TRANSFORM_MINIONS", definitionId: effect.definitionId },
          remainingEffects,
        };
        return false;
      }
      case "TRANSFORM_UP_TO_ENEMY_MINIONS": {
        const candidates = getLegalEnemyEffectTargets(state, playerId, true)
          .filter((card) => effect.maxHealth === undefined || (card.currentHealth !== null && card.currentHealth <= effect.maxHealth))
          .map((card) => card.instanceId);
        const count = Math.min(effect.maxCount, candidates.length);
        if (count === 0) {
          notifyEffectSkipped(state, playerId, source, "對手場上沒有符合轉變條件且不受紀律阻擋的手下");
          break;
        }
        state.pendingChoice = {
          type: "EFFECT_CARDS",
          playerId,
          sourceInstanceId: source.instanceId,
          prompt: `指定轉變對手最多 ${count} 個不同手下`,
          count,
          minCount: 0,
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
        if (candidates.length === 0) {
          notifyEffectSkipped(state, playerId, source, "我方棄堆沒有符合條件的可復活手下");
          return false;
        }
        state.pendingChoice = {
          type: "EFFECT_CARDS",
          playerId,
          sourceInstanceId: source.instanceId,
          prompt: "指定我方棄堆1張合法手下復活",
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
          notifyEffectSkipped(state, playerId, source, "對手場上沒有可被消滅的合法手下");
          const boundary = skipCommaChain(effectIndex);
          if (boundary === undefined) return false;
          effectIndex = boundary;
          break;
        }
        state.pendingChoice = {
          type: "EFFECT_CARDS",
          playerId,
          sourceInstanceId: source.instanceId,
          prompt: "指定消滅對手 1 手下",
          count: 1,
          candidateInstanceIds: candidates,
          resolution: { type: "DESTROY_MINION" },
          remainingEffects,
        };
        return false;
      }
      case "RETURN_HAND_MINION_TO_DECK_SHUFFLE_DRAW_BY_COST": {
        const candidates = state.players[playerId].hand
          .filter((card) => card.instanceId !== source.instanceId
            && getCardDefinition(card.definitionId).cardType === "MINION"
            && getCardDefinition(card.definitionId).subtype.includes(effect.subtype))
          .map((card) => card.instanceId);
        if (candidates.length === 0) {
          notifyEffectSkipped(state, playerId, source, `手牌中沒有其他 ${effect.subtype} 手下可返回牌組`);
          const boundary = skipCommaChain(effectIndex);
          if (boundary === undefined) return false;
          effectIndex = boundary;
          break;
        }
        state.pendingChoice = {
          type: "EFFECT_CARDS",
          playerId,
          sourceInstanceId: source.instanceId,
          prompt: `指定手牌 1 張其他 ${effect.subtype} 手下返回牌組並洗牌`,
          count: 1,
          candidateInstanceIds: candidates,
          resolution: { type: "RETURN_HAND_MINION_TO_DECK_SHUFFLE_DRAW_BY_COST", threshold: effect.threshold, low: effect.low, high: effect.high },
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
          notifyEffectSkipped(state, playerId, source, "牌組中沒有符合檢索條件的卡牌");
          const boundary = skipCommaChain(effectIndex);
          if (boundary === undefined) return false;
          effectIndex = boundary;
          break;
        }
        state.pendingChoice = {
          type: "EFFECT_CARDS",
          playerId,
          sourceInstanceId: source.instanceId,
          prompt: effect.definitionId ? `從牌庫檢索 1 張${getCardDefinition(effect.definitionId).name}` : `從牌庫檢索 1 張${effect.cardType === "SPELL" ? "法術" : "卡牌"}`,
          count: 1,
          candidateInstanceIds: candidates,
          resolution: { type: "SEARCH_DECK" },
          remainingEffects,
        };
        return false;
      }
      case "DISCOVER_TOP": {
        const revealCount = 3 + (effect.bonusReveal ?? 0);
        const revealed = state.players[playerId].deck.slice(-revealCount);
        const matches = (card: CardInstance) => {
          const definition = getCardDefinition(card.definitionId);
          return (!effect.cardType || definition.cardType === effect.cardType)
            && (!effect.subtype || definition.subtype.includes(effect.subtype));
        };
        const candidates = revealed.filter(matches);
        addLog(state, "ACTION", `${playerId} 從牌組上方翻開 ${revealed.length} 張進行發現`, {
          source: source.definitionId,
          revealed: revealed.map((card) => card.instanceId),
          legal: candidates.map((card) => card.instanceId),
        });
        if (candidates.length < effect.count) {
          notifyEffectSkipped(state, playerId, source, `翻開的 ${revealed.length} 張牌中沒有足夠的發現目標（需要 ${effect.count} 張，目前 ${candidates.length} 張）`);
          const boundary = skipCommaChain(effectIndex);
          if (boundary === undefined) return false;
          effectIndex = boundary;
          break;
        }
        state.pendingChoice = {
          type: "EFFECT_CARDS",
          playerId,
          sourceInstanceId: source.instanceId,
          prompt: `從發現候選中指定 ${effect.count} 張牌`,
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
          notifyEffectSkipped(state, playerId, source, "對手場上沒有可被封印且不受紀律阻擋的手下");
          const boundary = skipCommaChain(effectIndex);
          if (boundary === undefined) return false;
          effectIndex = boundary;
          break;
        }
        state.pendingChoice = {
          type: "EFFECT_CARDS",
          playerId,
          sourceInstanceId: source.instanceId,
          prompt: "指定對手 1 手下並永久封印至離場",
          count: 1,
          candidateInstanceIds: candidates,
          resolution: { type: "SEAL_MINION" },
          remainingEffects,
        };
        return false;
      }
      case "GAIN_NECROMANCY":
        state.players[playerId].resources.necromancy += effect.value;
        addLog(state, "RESOURCE", `${playerId} 死靈數 +${effect.value}`, {
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
        addLog(state, "PROTECTION", `${playerId} 接下來${effect.count}次受到的傷害變為0`, { source: source.instanceId });
        break;
      case "GRANT_NEXT_MINION_TEMPORARY_COST_REDUCTION":
        state.players[playerId].nextMinionTemporaryCostReduction += effect.value;
        addLog(state, "RESOURCE", `${playerId} 本回合下一張手下費用-${effect.value}`, { source: source.instanceId });
        break;
      case "GRANT_NEXT_LOW_COST_DRAGON_ZERO":
        state.players[playerId].nextLowCostDragonZeroMaxCost = effect.maxOriginalCost;
        addLog(state, "RESOURCE", `${playerId} 下一張原始費用${effect.maxOriginalCost}以下的龍族手下費用變為0`, { source: source.instanceId });
        break;
      case "GRANT_NEXT_HIGH_COST_DRAGON_REDUCTION":
        state.players[playerId].nextHighCostDragonReductionMinCost = effect.minOriginalCost;
        state.players[playerId].nextHighCostDragonReduction += effect.value;
        refreshHandCosts(state);
        addLog(state, "RESOURCE", `${playerId} 下一張原始費用${effect.minOriginalCost}以上的龍族手下累計費用-${state.players[playerId].nextHighCostDragonReduction}`, { source: source.instanceId });
        break;
      case "GRANT_ALL_FRIENDLY_DAMAGE_CAP":
        for (const target of state.players[playerId].minions) grantDamageCap(target, effect.value);
        addLog(state, "PROTECTION", `${playerId} 場上手下永久獲得單次傷害上限${effect.value}`, { source: source.instanceId });
        break;
      case "GRANT_HERO_DIVINE_SHIELD":
        state.players[playerId].heroDivineShield = true;
        addLog(state, "PROTECTION", `${playerId} 玩家獲得圣盾術`, { source: source.instanceId });
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
          options.push({ id: "DESTROY", label: "消滅對手1手下", effects: [{ type: "DESTROY_TARGET_ENEMY_MINION" as const }, { type: "SEGMENT_BREAK" as const }, next] });
        }
        options.push({ id: "DRAW", label: "抽2張牌", effects: [{ type: "DRAW" as const, value: 2 }, { type: "SEGMENT_BREAK" as const }, next] });
        state.pendingChoice = {
          type: "EFFECT_OPTION",
          playerId,
          sourceInstanceId: source.instanceId,
          prompt: "選擇絕杰榮耀效果",
          options,
          remainingEffects,
        };
        return false;
      }
      case "CHOOSE_UNACQUIRED_GENERATED_TO_HAND": {
        const acquired = state.players[playerId].choiceHistory[effect.historyKey] ?? [];
        const candidates = effect.definitionIds.filter((definitionId) => !acquired.includes(definitionId));
        if (candidates.length === 0) {
          notifyEffectSkipped(state, playerId, source, "所有可選卡牌都已取得，沒有剩餘候選項目");
          break;
        }
        state.pendingChoice = {
          type: "EFFECT_OPTION",
          playerId,
          sourceInstanceId: source.instanceId,
          prompt: "選擇尚未取得的絕杰加入手牌",
          options: candidates.map((definitionId) => ({
            id: definitionId,
            label: getCardDefinition(definitionId).name,
            effects: [{
              type: "RECORD_CHOICE_ADD_GENERATED_TO_HAND",
              definitionId,
              historyKey: effect.historyKey,
              fixedCost: state.players[playerId].summonedThisGame >= 20 ? 0 : undefined,
            }],
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
        if (effect.fixedCost !== undefined) {
          card.counters.fixedCost = effect.fixedCost;
          card.currentCost = effect.fixedCost;
        }
        state.players[playerId].hand.push(card);
        addLog(state, "ZONE", `${playerId} 取得 ${definition.name}`, { instanceId: card.instanceId, historyKey: effect.historyKey });
        break;
      }
      case "MECHANICAL_TECHNIQUE": {
        const player = state.players[playerId];
        const executableEffects = effect.effects.filter((nested) => canExecuteEffect(state, playerId, source, nested));
        if (player.resources.recycleCharge < effect.cost || executableEffects.length === 0) {
          notifyEffectSkipped(
            state,
            playerId,
            source,
            player.resources.recycleCharge < effect.cost
              ? `回收充能不足（需要 ${effect.cost}，目前 ${player.resources.recycleCharge}）`
              : "機械術的後續效果都沒有合法目標或未達發動條件",
          );
          break;
        }
        player.resources.recycleCharge -= effect.cost;
        addLog(state, "RESOURCE", `${source.definitionId} 發動機械術${effect.cost}`, {
          source: source.instanceId,
          recycleCharge: player.resources.recycleCharge,
        });
        if (!resolveEffectList(state, playerId, source, executableEffects)) return false;
        break;
      }
      case "NECROMANCY": {
        const player = state.players[playerId];
        const executableEffects = effect.effects.filter((nested) => canExecuteEffect(state, playerId, source, nested));
        if (player.resources.necromancy < effect.cost || executableEffects.length === 0) {
          if (!effect.silentIfInsufficient) {
            notifyEffectSkipped(
              state,
              playerId,
              source,
              player.resources.necromancy < effect.cost
                ? `死靈數不足（需要 ${effect.cost}，目前 ${player.resources.necromancy}）`
                : "死靈術的後續效果無法執行",
            );
          }
          break;
        }
        player.resources.necromancy -= effect.cost;
        addLog(state, "RESOURCE", `${source.definitionId} 發動死靈術${effect.cost}`, {
          source: source.instanceId,
          necromancy: player.resources.necromancy,
        });
        if (!resolveEffectList(state, playerId, source, executableEffects)) return false;
        break;
      }
      case "SET_HAND_CARD_COST_ZERO": {
        const candidates = state.players[playerId].hand.filter((card) => {
          const definition = getCardDefinition(card.definitionId);
          return (!effect.cardType || definition.cardType === effect.cardType)
            && (!effect.subtype || definition.subtype.includes(effect.subtype))
            && (!effect.subtypes || effect.subtypes.some((subtype) => definition.subtype.includes(subtype)));
        });
        if (candidates.length === 0) {
          notifyEffectSkipped(state, playerId, source, "手中沒有可指定的神器");
          break;
        }
        const maxCount = Math.min(effect.count, candidates.length);
        state.pendingChoice = {
          type: "EFFECT_CARDS",
          playerId,
          sourceInstanceId: source.instanceId,
          prompt: `指定最多${maxCount}張手牌使費用變為0`,
          count: maxCount,
          minCount: 0,
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
          prompt: `選擇0～${Math.min(effect.maxCount, candidates.length)}張手牌返回牌組並洗牌`,
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
        addLog(state, "RESOURCE", `${source.definitionId} 消耗 ${effect.value} 死靈數發動死靈復活`, {
          instanceId: source.instanceId,
          necromancy: player.resources.necromancy,
        });
        reviveMinion(state, playerId, source, "NECRO_REVIVE");
        break;
      }
      case "SEGMENT_BREAK":
        break;
      case "CONDITIONAL":
        if (!conditionMatches(state, playerId, source, effect.condition)) {
          if (!effect.silentOnFailure) notifyEffectSkipped(state, playerId, source, conditionFailureReason(effect.condition));
        } else if (!resolveEffectList(state, playerId, source, effect.effects)) return false;
        break;
      case "RULE_UNDEFINED":
        throw new RuleUndefinedError(effect.ruleId, "效果標記為未定義", source.definitionId);
      default: {
        const unhandledEffect: never = effect;
        throw new NotImplementedError(`尚未實作效果類型：${(unhandledEffect as EffectDefinition).type}`, source.definitionId);
      }
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
        const unresolvedGroup = group.filter((effect) => !effect.orderConfirmed);
        const sourceInstanceIds = [...new Set(unresolvedGroup.map((effect) => effect.sourceInstanceId))];
        if (sourceInstanceIds.length === 1) {
          for (const effect of unresolvedGroup) effect.orderConfirmed = true;
          continue;
        }
        state.pendingChoice = {
          type: "TRIGGER_ORDER",
          playerId: controllerId,
          timingId,
          instanceIds: sourceInstanceIds,
        };
        addLog(state, "ACTION", `${controllerId} 選擇同一時機觸發效果的處理順序`, { timingId });
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
    addLog(state, "ACTION", `${source.definitionId} 結算延後觸發效果`, {
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
    throw new Error("目前沒有此觸發排序選擇");
  }
  if (instanceIds.length !== choice.instanceIds.length || new Set(instanceIds).size !== instanceIds.length) {
    throw new Error("必須排列全部且不重復的觸發來源");
  }
  if (instanceIds.some((id) => !choice.instanceIds.includes(id))) throw new Error("觸發來源不合法");
  const batch = state.pendingEffects.filter((effect) => effect.timingId === choice.timingId);
  const remainder = state.pendingEffects.filter((effect) => effect.timingId !== choice.timingId);
  const selectedController = batch.filter((effect) => effect.controllerId === playerId);
  const ordered = instanceIds
    .flatMap((id) => selectedController.filter((effect) => effect.sourceInstanceId === id))
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
    throw new InvalidActionError("目前沒有此效果選擇");
  }
  const minCount = choice.minCount ?? choice.count;
  if (instanceIds.length < minCount || instanceIds.length > choice.count || new Set(instanceIds).size !== instanceIds.length) {
    throw new InvalidActionError(choice.minCount === undefined ? `必須指定 ${choice.count} 張不同卡牌` : `必須指定 ${minCount}～${choice.count} 張不同卡牌`);
  }
  if (instanceIds.some((id) => !choice.candidateInstanceIds.includes(id))) throw new InvalidActionError("指定目標不合法");
  const source = findCard(state, choice.sourceInstanceId);
  if (!source) throw new InvalidActionError("效果來源已不存在");
  state.pendingChoice = undefined;
  const timingContext = createTimingContext(state, `CHOICE:${source.instanceId}`);

  if (choice.resolution.type === "DISCARD_HAND") {
    for (const instanceId of instanceIds) {
      const card = state.players[playerId].hand.find((candidate) => candidate.instanceId === instanceId);
      if (!card) throw new InvalidActionError("棄牌目標已經不在手牌");
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
      if (!card) throw new InvalidActionError("費用變更目標已經不在手牌");
      card.counters.fixedCost = 0;
      card.currentCost = 0;
      addLog(state, "RESOURCE", `${card.definitionId} 費用變為0`, { instanceId: card.instanceId });
    }
  } else if (choice.resolution.type === "RETURN_HAND_TO_DECK_MACHINE_DISCOUNT") {
    for (const instanceId of instanceIds) {
      const card = state.players[playerId].hand.find((candidate) => candidate.instanceId === instanceId);
      if (!card) throw new InvalidActionError("返回牌組的目標已經不在手牌");
      moveCard(state, card, "DECK", "RETURN_HAND_TO_DECK");
    }
    const shuffled = shuffleSeeded(state.players[playerId].deck, state.rngSeed);
    state.players[playerId].deck = shuffled.value;
    state.rngSeed = shuffled.seed;
    state.players[playerId].nextMachineCostReduction = instanceIds.length * choice.resolution.reductionPerCard;
    addLog(state, "RNG", `${playerId} 將${instanceIds.length}張手牌返回牌組並洗牌`, {
      instanceIds,
      resultingSeed: state.rngSeed,
      nextMachineCostReduction: state.players[playerId].nextMachineCostReduction,
    });
    drawCard(state, playerId, `EFFECT:${source.definitionId}`);
  } else if (choice.resolution.type === "RETURN_HAND_MINION_TO_DECK_SHUFFLE_DRAW_BY_COST") {
    const target = state.players[playerId].hand.find((card) => card.instanceId === instanceIds[0]);
    if (!target) throw new InvalidActionError("返回目標已經不在我方手牌");
    const targetDefinition = getCardDefinition(target.definitionId);
    const originalCost = targetDefinition.originalCost;
    if (originalCost === null) throw new RuleUndefinedError("NULL_CARD_COST", "返回目標原始費用為 null", target.definitionId);
    if (targetDefinition.generatedOnly) {
      moveCard(state, target, "EXTRA_DECK", "RETURN_HAND_MINION_TO_DECK_SHUFFLE");
    } else {
      moveCard(state, target, "DECK", "RETURN_HAND_MINION_TO_DECK_SHUFFLE");
      const shuffled = shuffleSeeded(state.players[playerId].deck, state.rngSeed);
      state.players[playerId].deck = shuffled.value;
      state.rngSeed = shuffled.seed;
      addLog(state, "RNG", `${playerId} 將手牌龍族手下返回牌組並洗牌`, {
        instanceId: target.instanceId,
        resultingSeed: state.rngSeed,
      });
    }
    const drawCount = originalCost >= choice.resolution.threshold ? choice.resolution.high : choice.resolution.low;
    for (let count = 0; count < drawCount && !state.winner; count += 1) drawCard(state, playerId, `EFFECT:${source.definitionId}`);
  } else if (choice.resolution.type === "SEARCH_DECK") {
    searchDeckCard(state, playerId, instanceIds[0]);
  } else if (choice.resolution.type === "DISCOVER_TO_HAND") {
    for (const instanceId of instanceIds) {
      const card = state.players[playerId].deck.find((candidate) => candidate.instanceId === instanceId);
      if (!card) throw new InvalidActionError("發現目標已經不在牌庫");
      moveCard(state, card, "HAND", "DISCOVER");
      if (choice.resolution.temporaryCostReduction) {
        grantTemporaryCostReduction(state, playerId, card, choice.resolution.temporaryCostReduction);
      }
    }
    addLog(state, "ACTION", `${playerId} 完成發現；未選牌保持原相對順序`, { selected: instanceIds });
    if (choice.resolution.discardFromSelected) {
      state.pendingChoice = {
        type: "EFFECT_CARDS",
        playerId,
        sourceInstanceId: source.instanceId,
        prompt: `從本次發現加入手牌的牌中指定丟棄 ${choice.resolution.discardFromSelected} 張`,
        count: choice.resolution.discardFromSelected,
        candidateInstanceIds: [...instanceIds],
        resolution: { type: "DISCARD_HAND" },
        remainingEffects: choice.remainingEffects,
      };
      return;
    }
  } else if (choice.resolution.type === "SUMMON_EFFECT_COPY") {
    const selected = state.players[playerId].hand.find((card) => card.instanceId === instanceIds[0]);
    if (!selected || selected.definitionId !== choice.resolution.definitionId) throw new InvalidActionError("效果召喚選擇已經失效");
    state.pendingChoice = {
      type: "EFFECT_SUMMON_CONFIRM",
      playerId,
      sourceInstanceId: selected.instanceId,
      remainingEffects: choice.remainingEffects,
    };
    addLog(state, "ACTION", `${getCardDefinition(selected.definitionId).name} 的效果召喚等待玩家確認`, { sourceInstanceId: selected.instanceId });
    return;
  } else if (choice.resolution.type === "COPY_SPELL_EFFECT") {
    const selected = state.players[playerId].hand.find((card) => card.instanceId === instanceIds[0]);
    if (!selected) throw new InvalidActionError("複製的法術已經不在我方手牌");
    const copiedDefinition = getCardDefinition(selected.definitionId);
    if (copiedDefinition.cardType !== "SPELL" || !copiedDefinition.effects?.length) {
      throw new NotImplementedError("所選法術效果尚未實現，不能略過後複製", copiedDefinition.id);
    }
    addLog(state, "ACTION", `${source.definitionId} 複製並發動 ${copiedDefinition.name} 的效果`, {
      source: source.instanceId,
      copiedSpell: selected.instanceId,
    });
    resolveEffects(state, playerId, source, [...copiedDefinition.effects, ...choice.remainingEffects]);
    return;
  } else if (choice.resolution.type === "DAMAGE_MINIONS_REWARD_KILLS") {
    const targets = instanceIds.map((instanceId) => {
      const target = findCard(state, instanceId);
      if (!target || target.zone !== "MINION") throw new InvalidActionError("傷害目標已經不在手下區");
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
      addLog(state, "RESOURCE", `${playerId} 因消滅獎勵恢復 ${player.heroHp - before} HP`, { requested, killed: killed.length });
    }
  } else if (choice.resolution.type === "VANISH_MINIONS") {
    for (const instanceId of instanceIds) {
      const target = findCard(state, instanceId);
      if (!target || target.zone !== "MINION") throw new InvalidActionError("消失目標已經不在手下區");
      if (hasActiveKeyword(target, "INVINCIBLE")) {
        addLog(state, "PROTECTION", `${target.definitionId} 的無敵阻擋消失`, { source: source.instanceId });
        continue;
      }
      const destination = getCardDefinition(target.definitionId).generatedOnly ? "EXTRA_DECK" : "REMOVED";
      moveCard(state, target, destination, "VANISH");
    }
  } else if (choice.resolution.type === "TRANSFORM_MINIONS") {
    for (const instanceId of instanceIds) {
      const target = findCard(state, instanceId);
      if (!target || target.zone !== "MINION") throw new InvalidActionError("轉變目標已經不在手下區");
      transformMinion(state, target, choice.resolution.definitionId);
    }
  } else if (choice.resolution.type === "REVIVE_MINION") {
    const target = findCard(state, instanceIds[0]);
    if (!target || target.zone !== "GRAVEYARD") throw new InvalidActionError("復活目標已經不在棄堆");
    reviveMinion(state, playerId, target);
  } else if (choice.resolution.type === "REPEAT_DAMAGE_MINION") {
    const target = findCard(state, instanceIds[0]);
    if (!target || target.zone !== "MINION") throw new InvalidActionError("重復傷害目標已經不在手下區");
    dealDamageToMinion(state, target, choice.resolution.value, source.instanceId, "EFFECT");
    if ((target.currentHealth ?? 1) <= 0) destroyMinion(state, target, "EFFECT_DAMAGE_DEATH", timingContext);
    const remainingHits = choice.resolution.remainingHits - 1;
    const candidates = getLegalEnemyEffectTargets(state, playerId).map((card) => card.instanceId);
    if (remainingHits > 0 && candidates.length > 0) {
      state.pendingChoice = {
        type: "EFFECT_CARDS",
        playerId,
        sourceInstanceId: source.instanceId,
        prompt: `重新指定對手1手下造成${choice.resolution.value}點傷害（剩余${remainingHits}次）`,
        count: 1,
        candidateInstanceIds: candidates,
        resolution: { type: "REPEAT_DAMAGE_MINION", value: choice.resolution.value, remainingHits },
        remainingEffects: choice.remainingEffects,
      };
      return;
    }
  } else if (choice.resolution.type === "REPEAT_DAMAGE_MINION_OR_HERO") {
    const target = findCard(state, instanceIds[0]);
    if (!target || target.zone !== "MINION") throw new InvalidActionError("重複傷害目標已經不在手下區");
    dealDamageToMinion(state, target, choice.resolution.value, source.instanceId, "EFFECT");
    if ((target.currentHealth ?? 1) <= 0) destroyMinion(state, target, "EFFECT_DAMAGE_DEATH", timingContext);
    const remainingHits = choice.resolution.remainingHits - 1;
    const candidates = getLegalEnemyEffectTargets(state, playerId).map((card) => card.instanceId);
    if (remainingHits > 0 && candidates.length > 0) {
      state.pendingChoice = {
        type: "EFFECT_CARDS",
        playerId,
        sourceInstanceId: source.instanceId,
        prompt: `重新指定對手1名手下造成${choice.resolution.value}點傷害（剩餘${remainingHits}次）`,
        count: 1,
        candidateInstanceIds: candidates,
        resolution: { ...choice.resolution, remainingHits },
        remainingEffects: choice.remainingEffects,
      };
      return;
    }
    if (remainingHits > 0 && choice.resolution.heroHitsRemaining > 0) {
      dealDamageToHero(state, opponentOf(playerId), choice.resolution.value, source.instanceId);
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
    if (!target || target.zone !== "MINION") throw new InvalidActionError("效果目標已經不在手下區");
    if (choice.resolution.type === "DAMAGE_MINION") {
      dealDamageToMinion(state, target, choice.resolution.value, source.instanceId, "EFFECT");
      if ((target.currentHealth ?? 1) <= 0) destroyMinion(state, target, "EFFECT_DAMAGE_DEATH", timingContext);
    } else if (choice.resolution.type === "DESTROY_MINION") {
      if (hasActiveKeyword(target, "SANCTUARY") || hasActiveKeyword(target, "INVINCIBLE")) {
        addLog(state, "PROTECTION", `${target.definitionId} 阻擋效果直接消滅`, { source: source.instanceId, target: target.instanceId });
      } else {
        destroyMinion(state, target, "EFFECT_DESTROY", timingContext);
      }
    } else if (choice.resolution.type === "GRANT_MINION_KEYWORD") {
      if (!target.keywords.includes(choice.resolution.keyword)) target.keywords.push(choice.resolution.keyword);
      addLog(state, "ACTION", `${target.definitionId} 獲得 ${choice.resolution.keyword}`, { source: source.instanceId, target: target.instanceId });
    } else {
      target.sealed = true;
      addLog(state, "ACTION", `${target.definitionId} 被永久封印至離場`, { source: source.instanceId, target: target.instanceId });
    }
  }

  resolveEffects(state, playerId, source, choice.remainingEffects);
}

export function confirmEffectSummon(state: GameState, playerId: PlayerId): void {
  const choice = state.pendingChoice;
  if (!choice || choice.type !== "EFFECT_SUMMON_CONFIRM" || choice.playerId !== playerId) {
    throw new InvalidActionError("目前沒有待確認的效果召喚");
  }
  const source = state.players[playerId].hand.find((card) => card.instanceId === choice.sourceInstanceId);
  if (!source) throw new InvalidActionError("效果召喚卡牌已不在手牌");
  if (state.players[playerId].minions.length >= state.rulesConfig.minionLimit) throw new InvalidActionError("手下區已滿，無法效果召喚");
  state.pendingChoice = undefined;
  if (!state.players[playerId].effectSummonUsedThisTurn.includes(source.definitionId)) {
    state.players[playerId].effectSummonUsedThisTurn.push(source.definitionId);
  }
  addLog(state, "ACTION", `${playerId} 確認效果召喚 ${getCardDefinition(source.definitionId).name}`, { sourceInstanceId: source.instanceId });
  summonFromHandByEffect(state, source);
  resolveEffects(state, playerId, source, choice.remainingEffects);
}

export function selectEffectOption(state: GameState, playerId: PlayerId, optionId: string): void {
  const choice = state.pendingChoice;
  if (!choice || choice.type !== "EFFECT_OPTION" || choice.playerId !== playerId) {
    throw new InvalidActionError("目前沒有此效果選項");
  }
  const option = choice.options.find((candidate) => candidate.id === optionId);
  if (!option) throw new InvalidActionError("效果選項不合法");
  const source = findCard(state, choice.sourceInstanceId);
  if (!source) throw new InvalidActionError("效果來源已不存在");
  state.pendingChoice = undefined;
  addLog(state, "ACTION", `${playerId} 選擇：${option.label}`, { source: source.instanceId, optionId });
  resolveEffects(state, playerId, source, [...option.effects, ...choice.remainingEffects]);
}
