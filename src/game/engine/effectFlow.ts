export type EffectConnector = "COMMA" | "PERIOD" | "SEMICOLON";

/**
 * 已确认的卡文流程：无合法指定目标时，逗号连接的同一效果链中止；
 * 句号或分号后的新效果段仍继续。卡牌资料解析时必须显式保存连接符。
 */
export function continueAfterMissingLegalTarget(connector: EffectConnector): boolean {
  return connector !== "COMMA";
}

export interface TargetSelectionRule {
  minimum: number;
  maximum: number;
  allowRepeatedInstance?: boolean;
}

export function isValidTargetSelection(instanceIds: readonly string[], rule: TargetSelectionRule): boolean {
  if (instanceIds.length < rule.minimum || instanceIds.length > rule.maximum) return false;
  return rule.allowRepeatedInstance === true || new Set(instanceIds).size === instanceIds.length;
}

export function shouldExecuteNextRepeatedTargeting(hasLegalMinionTarget: boolean): boolean {
  return hasLegalMinionTarget;
}
