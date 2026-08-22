# 《戰記》Codex MVP 開發規格 v0.1

## 1. 目标与范围

建立可在浏览器游玩的规则验证型 MVP。第一阶段优先规则正确、可测试、可重放；不做美术、动画、帐号、配对或后端。

首发范围：

- 本机双人 Hot Seat。
- 先完整支持龙族 vs 不朽者。
- 机机械与联盟资料先可载入，但复杂效果在后续阶段实现。
- 全 GameState 保存在前端记忆体。

建议技术：React + TypeScript + Vite + Vitest。规则引擎必须是纯 TypeScript，不依赖 React。

## 2. 建议目录

```text
src/
├─ app/
│  ├─ App.tsx
│  └─ GamePage.tsx
├─ game/
│  ├─ engine/
│  │  ├─ gameEngine.ts
│  │  ├─ turnEngine.ts
│  │  ├─ combatEngine.ts
│  │  ├─ effectEngine.ts
│  │  ├─ triggerEngine.ts
│  │  ├─ targetingEngine.ts
│  │  ├─ summonEngine.ts
│  │  ├─ zoneEngine.ts
│  │  └─ costEngine.ts
│  ├─ state/
│  │  ├─ GameState.ts
│  │  ├─ PlayerState.ts
│  │  ├─ CardInstance.ts
│  │  └─ createInitialGame.ts
│  ├─ cards/
│  │  ├─ cardTypes.ts
│  │  └─ cardRegistry.ts
│  ├─ effects/
│  │  ├─ effectTypes.ts
│  │  ├─ effectRegistry.ts
│  │  └─ customResolvers.ts
│  ├─ keywords/
│  │  ├─ keywordTypes.ts
│  │  └─ keywordRules.ts
│  └─ utils/
│     ├─ shuffle.ts
│     ├─ id.ts
│     └─ gameLog.ts
├─ ui/
│  ├─ Board.tsx
│  ├─ PlayerPanel.tsx
│  ├─ Hand.tsx
│  ├─ MinionZone.tsx
│  ├─ FieldZone.tsx
│  ├─ CardView.tsx
│  ├─ TargetSelector.tsx
│  ├─ ChoiceModal.tsx
│  ├─ MulliganModal.tsx
│  ├─ GameLog.tsx
│  └─ DebugPanel.tsx
├─ tests/
│  ├─ core/
│  ├─ keywords/
│  ├─ dragon/
│  ├─ undead/
│  ├─ machine/
│  └─ interactions/
└─ main.tsx
```

## 3. GameState

```ts
type PlayerId = "P1" | "P2";

type GamePhase =
  | "MULLIGAN"
  | "DRAW"
  | "COUNTDOWN"
  | "GROWTH"
  | "MAIN"
  | "END"
  | "HAND_LIMIT"
  | "GAME_OVER";

interface GameState {
  gameId: string;
  turnNumber: number;
  activePlayerId: PlayerId;
  startingPlayerId: PlayerId;
  phase: GamePhase;
  players: Record<PlayerId, PlayerState>;
  pendingEffects: PendingEffect[];
  pendingChoice?: PendingChoice;
  log: GameLogEntry[];
  winner?: PlayerId;
  loseReason?: "HP_ZERO" | "DECK_OUT" | "DOOMSDAY_BOOK";
  rngSeed: number;
  rulesConfig: RulesConfig;
}

interface RulesConfig {
  minionLimit: number; // 7
  handLimitAtEnd: number; // 10
  normalMaxMana: number; // 10
  minCardCost: number; // 0
  fieldLimits: Partial<Record<Faction, number | null>>; // machine: 6; null = unlimited
  discoverRemainderPolicy: "RETURN_KEEP_ORDER";
}

interface PlayerState {
  id: PlayerId;
  faction: Faction;
  heroHp: number;
  heroMaxHp: number;
  mana: number;
  maxMana: number;
  deck: CardInstance[];
  hand: CardInstance[];
  minions: CardInstance[];
  fields: CardInstance[];
  graveyard: CardInstance[];
  removed: CardInstance[];
  resources: {
    necromancy: number;
    recycleCharge: number;
  };
  choiceHistory: Record<string, string[]>; // 玩家整场对局的唯一候选取得记录
  summonedThisTurn: number;
  summonedThisGame: number;
  cardsPlayedThisTurn: number;
  mulliganDone: boolean;
}
```

## 4. CardDefinition 与 CardInstance

定义与实例必须分离；CardDefinition 永不在对局中被直接修改。

```ts
interface CardDefinition {
  id: string;
  name: string;
  faction: "DRAGON" | "UNDEAD" | "MACHINE" | "ALLIANCE" | "NEUTRAL";
  cardType: "MINION" | "SPELL" | "FIELD";
  subtype: string[];
  originalCost: number | null;
  attack: number | null;
  health: number | null;
  deckCount: number;
  keywords: Keyword[];
  effectsText: string;
  generatedOnly: boolean;
  notes: string;
  effects?: EffectDefinition[];
  customResolver?: string;
}

interface CardInstance {
  instanceId: string;
  originalDefinitionId: string;
  definitionId: string;
  ownerId: PlayerId;
  controllerId: PlayerId;
  zone: "DECK" | "HAND" | "MINION" | "FIELD" | "GRAVEYARD" | "REMOVED" | "EXTRA_DECK";
  currentCost: number | null;
  currentAttack: number | null;
  currentHealth: number | null;
  maxHealth: number | null;
  damageTaken: number;
  keywords: Keyword[];
  counters: Record<string, number>;
  flags: Record<string, boolean>;
  attacksUsedThisTurn: number;
  necroRevivedTurn?: number;
  silenced: boolean;
  sealed: boolean;
}
```

JSON 中 `null` 是明确表示「来源未提供」，不是 0。

## 5. Effect 系统

卡牌效果尽量资料驱动，禁止在一般引擎中以中文卡名作判断。

```ts
interface EffectDefinition {
  type: EffectType;
  timing?: TriggerTiming;
  target?: TargetRule;
  value?: number;
  valueSource?: ValueSource;
  condition?: ConditionDefinition;
  cardId?: string;
  count?: number;
  options?: EffectDefinition[];
  effects?: EffectDefinition[];
}

type EffectType =
  | "DRAW" | "HEAL_HERO" | "DAMAGE_HERO" | "DAMAGE_MINION"
  | "DAMAGE_ALL_ENEMY_MINIONS" | "DESTROY_MINION" | "VANISH_MINION"
  | "TRANSFORM_MINION" | "SUMMON" | "ADD_CARD_TO_HAND"
  | "SEARCH_DECK" | "DISCOVER" | "DISCARD" | "RETURN_TO_HAND"
  | "RETURN_TO_DECK" | "INCREASE_MAX_MANA" | "RESTORE_MANA" | "GAIN_MANA"
  | "MODIFY_ATTACK" | "MODIFY_HEALTH" | "SET_COST" | "REDUCE_COST"
  | "GAIN_KEYWORD" | "SILENCE" | "SEAL" | "REVIVE"
  | "GAIN_NECROMANCY" | "SPEND_NECROMANCY"
  | "GAIN_RECYCLE_CHARGE" | "SPEND_RECYCLE_CHARGE"
  | "CREATE_FIELD" | "TRANSFORM_SELF" | "CHOICE" | "CONDITIONAL";

type TriggerTiming =
  | "BATTLECRY" | "DEATHRATTLE" | "ENTER_FIELD" | "LAST_WORDS"
  | "START_TURN" | "COUNTDOWN" | "GROWTH" | "END_TURN"
  | "ON_ATTACK" | "AFTER_COMBAT" | "ON_KILL" | "ON_SUMMON"
  | "ON_REVIVE" | "ON_DISCARD" | "AURA";
```

复杂卡优先组合通用 Effect；真的无法泛化时才使用稳定 custom resolver key，例如 `CATACLYSM_FLOOD`，resolver 仍不得依显示名称判断。

災厄洪流应先记录本次实际转变数量，再将该快照作为后续伤害与治疗的 X，不能在后续从场上剩余数量重算。

## 6. 行动、选择与确定性

所有玩家动作必须可序列化：

```ts
type GameAction =
  | MulliganAction
  | PlayCardAction
  | AttackAction
  | EndTurnAction
  | SelectTargetAction
  | SelectChoiceAction
  | SelectDiscardAction;
```

- 每个随机操作使用 seeded RNG，并写入 log。
- 换牌固定先抽取等量替换牌，再将换出牌加入牌组并使用 seeded RNG 洗牌。
- 检索将选定牌加入手牌后，使用 seeded RNG 洗牌并记录 log。
- PendingChoice 暂停引擎继续结算，直到玩家给出合法选择。
- 指定与丢弃都由玩家依卡文目标范围选择；没有合法目标时，逗号连接的同一效果链停止，句号或分号后的新效果段继续。
- 效果按卡文顺序执行，先完整执行逗号前的效果，再处理逗号后的效果。
- 同一次多目标指定使用不同 CardInstance；重复 X 次则每次重新指定，可再次选择仍合法的同一实例，中途无合法手下时停止剩余次数。
- 牌 A 结算期间产生的触发效果只加入 `pendingEffects`；牌 A 的效果列表完整结算后，才依序处理等待中的触发效果。
- 同一时机先建立合法目标快照；同一玩家排列该批次的触发顺序，新召唤对象不进入旧批次目标范围，已离场目标在轮到时跳过。同对象的同时伤害先合计。
- 双方同时触发时各自排列；当前回合玩家批次先于非当前回合玩家批次，两批共享同一时机快照，新触发排在整个批次之后。
- 恢复玩家生命使用其当前 `heroMaxHp` 封顶，不改变生命最大值。
- 「召唤黑暗之书」必须产生玩家选择，不得随机。
- 发现未选卡保持原相对顺序返回原位置；费用最低为 0。
- 任何规则未定项都通过 RulesConfig 或显式 TODO 隔离，不把假设散落在 resolver 中。

## 7. 回合引擎

固定骨架：MULLIGAN → DRAW → COUNTDOWN → GROWTH → MAIN → END → HAND_LIMIT。

每个 phase：

1. 建立 phase event。
2. 收集合法触发。
3. 依已定义顺序排入 pendingEffects。
4. 逐一解析；遇到目标／选择暂停。
5. 每个 atomic effect 后执行 state-based checks（0 HP、致死手下、场面上限、特殊胜利）。

倒数阶段移除的立场不进入随后生长触发收集。

## 8. 战斗引擎

- targetingEngine 先排除潜行、威慑、光纹与其他非法目标，再套嘲讽限制。
- 潜行／威慑会令该手下的嘲讽暂时无效。
- 同时伤害后处理聖盾、伤害上限与无敌。
- 必杀在该次交战伤害完成后处理。
- 区分 Destroy、Vanish、Transform、Move Zone；不能共用一个 `removeCard()` 而隐含全部触发。

## 9. 第一批实作卡

### Batch 1：基础能力

- 幸運幣：GAIN_MANA。
- 聖印白龍：战吼抽牌／治疗／条件加生命。
- 地獄炎龍：基础嘲讽衍生手下。
- 炎龍召喚：SUMMON + AOE damage。
- 沉默者：弃牌、单体伤害、死亡抽牌。
- 不朽的追憶者：被弃触发、战吼弃抽、封印。
- 烏比斯／不朽者之靈：冲锋、死亡召唤、复活触发。

### Batch 2：区域与资源

- 巴哈姆特：棄堆龙族减费、消失、玩家伤害。
- 机械收集者：立场、倒数、生长、回收。
- 机械帝国游骑兵：检索、机械术、死亡充能。
- 蓋德爾斯／進擊死靈：死灵复活。

### Batch 3：黑暗之书

- 四种黑暗之书与末日之书。
- 玩家选择书种。
- 转变后可再次生成同种。
- 末日序曲 4 张结算与特殊胜利。

### Batch 4：复杂互动

- 災厄洪流。
- 瘟疫典錄计数。
- 炎火之龍复制法术效果但不视为使用法术。
- 卡戎、奥迪菲斯等交战与杀意链。

## 10. 测试策略

- 单元测试：Zone 迁移、费用、资源、合法目标、每种通用 Effect。
- 状态机测试：完整回合 phase 顺序、PendingChoice、满场／手牌超限／牌库耗尽。
- 交互测试：完整采用 `interaction-tests.md`。
- 资料验证：所有 JSON schema、唯一 ID、主牌张数与同名上限。
- 回归测试：每次改卡只改数据或 resolver，并保留原 bug 场景。
- 属性测试：任何状态下手下数不超过 7；mana 不为负；同一实例只存在一个 Zone；Game Over 后不再接受行动。
- Replay 测试：同 seed + 同 actions 必须产生完全相同 GameState 与 log。

## 11. MVP UI

单屏灰盒布局：

```text
对手：HP／水晶／手牌数／牌库数／死灵数或回收充能
对手立场区
对手 7 格手下区
我方 7 格手下区
我方立场区
我方：HP／水晶／资源
我方手牌
[攻击] [结束回合] [查看棄堆]
Game Log
```

- 卡牌至少显示名称、费用、攻／血、种族、关键字、效果文字；不需卡图。
- 需要指定时，高亮合法目标并禁用非法目标。
- 二／三选一、发现、黑暗之书选择统一使用 ChoiceModal。
- Hot Seat 切换玩家时提供遮罩，避免直接看到对手手牌。
- DebugPanel：+1 水晶、+1 死灵数、+1 回收充能、抽 1、生成指定卡、跳回合、设 HP、查看所有 Zone。
- Game Log 记录每个 action、effect、资源变化、Zone 迁移、伤害防护与胜负原因。

## 12. 工程原则

1. Game Engine 与 React 解耦，便于 AI、模拟、Replay 与未来联网。
2. 卡牌 ID 是程式 key；显示名称可修改，不影响逻辑。
3. 数值集中在卡牌资料，不散落在 UI 或 resolver。
4. Effect 资料化；特殊 resolver 必须小、纯函数、可测试。
5. 所有动作与状态可序列化；随机性可重现。
6. Zone 迁移必须带 `reason`（DESTROY、VANISH、TRANSFORM、DISCARD、RECYCLE、REVIVE 等）。
7. 不自行定义资料包列出的待确认规则；遇到未定义行为，返回结构化 `RULE_UNDEFINED` 或 TODO。
8. JSON `null` 不得自动转成 0；相关卡在规则确认前不进入可玩牌池。
9. 先写测试再实现复杂互动，尤其转变／回收／死灵复活／末日之书。

## 13. MVP 完成标准

- 可建立龙族 vs 不朽者 Hot Seat 对局并换牌。
- 正常抽牌、水晶、出牌、召唤、攻击、结束回合。
- 正确处理 7 格手下、独立立场、回合末手牌 10 张限制与空牌库败北。
- 支持核心关键字与转变／消灭／消失／复活。
- 支持死灵数、死灵术、死灵复活与四本末日之书。
- 災厄洪流与巴哈姆特互动通过测试。
- 末日序曲与特殊胜利通过测试。
- 完整 Game Log、DebugPanel、重新开始与 deterministic replay。
