export type EffectConnector = "COMMA" | "PERIOD" | "SEMICOLON";

/**
 * 已確認的卡文流程：無合法指定目標時，逗號連接的同一效果鏈中止；
 * 句號或分號後的新效果段仍繼續。卡牌資料解析時必須顯式保存連接符。
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
