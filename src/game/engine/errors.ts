import type { RuleUndefined } from "../state/GameState";

export class RuleUndefinedError extends Error {
  readonly issue: RuleUndefined;

  constructor(ruleId: string, message: string, cardId?: string) {
    super(message);
    this.issue = { code: "RULE_UNDEFINED", ruleId, message, cardId };
  }
}

export class InvalidActionError extends Error {}

export class NotImplementedError extends Error {
  constructor(message: string, readonly cardId?: string) { super(message); }
}
