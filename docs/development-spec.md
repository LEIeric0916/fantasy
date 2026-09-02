# 《戰記》Codex MVP 開發規格 v0.1

## 1. 目標與范圍

建立可在瀏覽器游玩的規則驗證型 MVP。第一階段優先規則正確、可測試、可重放；不做美術、動畫、帳號、配對或後端。

首發范圍：

- 本機雙人 Hot Seat。
- 先完整支持龍族 vs 不朽者。
- 機機械與聯盟資料先可載入，但復雜效果在後續階段實現。
- 全 GameState 保存在前端記憶體。

建議技術：React + TypeScript + Vite + Vitest。規則引擎必須是純 TypeScript，不依賴 React。

## 2. 建議目錄

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
  fieldLimits: Partial<Record<Faction, number | null>>; // machine: 6; other current factions: 7
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
  choiceHistory: Record<string, string[]>; // 玩家整場對局的唯一候選取得記錄
  summonedThisTurn: number;
  summonedThisGame: number;
  cardsPlayedThisTurn: number;
  mulliganDone: boolean;
}
```

## 4. CardDefinition 與 CardInstance

定義與實例必須分離；CardDefinition 永不在對局中被直接修改。

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

JSON 中 `null` 是明確表示「來源未提供」，不是 0。

## 5. Effect 系統

卡牌效果盡量資料驅動，禁止在一般引擎中以中文卡名作判斷。

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

復雜卡優先組合通用 Effect；真的無法泛化時才使用穩定 custom resolver key，例如 `CATACLYSM_FLOOD`，resolver 仍不得依顯示名稱判斷。

災厄洪流應先記錄本次實際轉變數量，再將該快照作為後續傷害與治療的 X，不能在後續從場上剩余數量重算。

## 6. 行動、選擇與確定性

所有玩家動作必須可序列化：

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

- 每個隨機操作使用 seeded RNG，並寫入 log。
- 換牌固定先抽取等量替換牌，再將換出牌加入牌組並使用 seeded RNG 洗牌。
- 檢索將選定牌加入手牌後，使用 seeded RNG 洗牌並記錄 log。
- PendingChoice 暫停引擎繼續結算，直到玩家給出合法選擇。
- 指定與丟棄都由玩家依卡文目標范圍選擇；沒有合法目標時，逗號連接的同一效果鏈停止，句號或分號後的新效果段繼續。
- 效果按卡文順序執行，先完整執行逗號前的效果，再處理逗號後的效果。
- 同一次多目標指定使用不同 CardInstance；重復 X 次則每次重新指定，可再次選擇仍合法的同一實例，中途無合法手下時停止剩余次數。
- 牌 A 結算期間產生的觸發效果只加入 `pendingEffects`；牌 A 的效果列表完整結算後，才依序處理等待中的觸發效果。
- 同一時機先建立合法目標快照；同一玩家排列該批次的觸發順序，新召喚對象不進入舊批次目標范圍，已離場目標在輪到時跳過。同對象的同時傷害先合計。
- 雙方同時觸發時各自排列；當前回合玩家批次先於非當前回合玩家批次，兩批共享同一時機快照，新觸發排在整個批次之後。
- 恢復玩家生命使用其當前 `heroMaxHp` 封頂，不改變生命最大值。
- 「召喚黑暗之書」必須產生玩家選擇，不得隨機。
- 發現未選卡保持原相對順序返回原位置；費用最低為 0。
- 任何規則未定項都通過 RulesConfig 或顯式 TODO 隔離，不把假設散落在 resolver 中。

## 7. 回合引擎

固定骨架：MULLIGAN → DRAW → COUNTDOWN → GROWTH → MAIN → END → HAND_LIMIT。

每個 phase：

1. 建立 phase event。
2. 收集合法觸發。
3. 依已定義順序排入 pendingEffects。
4. 逐一解析；遇到目標／選擇暫停。
5. 每個 atomic effect 後執行 state-based checks（0 HP、致死手下、場面上限、特殊勝利）。

倒數階段移除的立場不進入隨後生長觸發收集。

## 8. 戰斗引擎

- targetingEngine 先排除潛行、威懾、光紋與其他非法目標，再套嘲諷限制。
- 潛行／威懾會令該手下的嘲諷暫時無效。
- 同時傷害後處理聖盾、傷害上限與無敵。
- 必殺在該次交戰傷害完成後處理。
- 區分 Destroy、Vanish、Transform、Move Zone；不能共用一個 `removeCard()` 而隱含全部觸發。

## 9. 第一批實作卡

### Batch 1：基礎能力

- 幸運幣：GAIN_MANA。
- 聖印白龍：戰吼抽牌／治療／條件加生命。
- 地獄炎龍：基礎嘲諷衍生手下。
- 炎龍召喚：SUMMON + AOE damage。
- 沉默者：棄牌、單體傷害、死亡抽牌。
- 殘光渡扉者 亞恩：戰吼棄牌並選擇兩種不同黑暗之書；回合結束恢復玩家並賦予我方手下聖盾術。
- 烏比斯／不朽者之靈：沖鋒、被棄觸發、死亡召喚、復活觸發。

### Batch 2：區域與資源

- 巴哈姆特：棄堆龍族減費、消失、玩家傷害。
- 機械收集者：立場、倒數、生長、回收。
- 機械帝國游騎兵：檢索、機械術、死亡充能。
- 蓋德爾斯／進擊死靈：死靈復活。

### Batch 3：黑暗之書

- 四種黑暗之書與末日之書。
- 玩家選擇書種。
- 轉變後可再次生成同種。
- 末日序曲 4 張結算與特殊勝利。

### Batch 4：復雜互動

- 災厄洪流。
- 瘟疫典錄計數。
- 炎火之龍復制法術效果但不視為使用法術。
- 卡戎、奧迪菲斯等交戰與殺意鏈。

## 10. 測試策略

- 單元測試：Zone 遷移、費用、資源、合法目標、每種通用 Effect。
- 狀態機測試：完整回合 phase 順序、PendingChoice、滿場／手牌超限／牌庫耗盡。
- 交互測試：完整采用 `interaction-tests.md`。
- 資料驗證：所有 JSON schema、唯一 ID、主牌張數與同名上限。
- 回歸測試：每次改卡只改數據或 resolver，並保留原 bug 場景。
- 屬性測試：任何狀態下手下數不超過 7；mana 不為負；同一實例只存在一個 Zone；Game Over 後不再接受行動。
- Replay 測試：同 seed + 同 actions 必須產生完全相同 GameState 與 log。

## 11. MVP UI

單屏灰盒布局：

```text
對手：HP／水晶／手牌數／牌庫數／死靈數或回收充能
對手立場區
對手 7 格手下區
我方 7 格手下區
我方立場區
我方：HP／水晶／資源
我方手牌
[攻擊] [結束回合] [查看棄堆]
Game Log
```

- 卡牌至少顯示名稱、費用、攻／血、種族、關鍵字、效果文字；不需卡圖。
- 需要指定時，高亮合法目標並禁用非法目標。
- 二／三選一、發現、黑暗之書選擇統一使用 ChoiceModal。
- Hot Seat 切換玩家時提供遮罩，避免直接看到對手手牌。
- DebugPanel：+1 水晶、+1 死靈數、+1 回收充能、抽 1、生成指定卡、跳回合、設 HP、查看所有 Zone。
- Game Log 記錄每個 action、effect、資源變化、Zone 遷移、傷害防護與勝負原因。

## 12. 工程原則

1. Game Engine 與 React 解耦，便於 AI、模擬、Replay 與未來聯網。
2. 卡牌 ID 是程式 key；顯示名稱可修改，不影響邏輯。
3. 數值集中在卡牌資料，不散落在 UI 或 resolver。
4. Effect 資料化；特殊 resolver 必須小、純函數、可測試。
5. 所有動作與狀態可序列化；隨機性可重現。
6. Zone 遷移必須帶 `reason`（DESTROY、VANISH、TRANSFORM、DISCARD、RECYCLE、REVIVE 等）。
7. 不自行定義資料包列出的待確認規則；遇到未定義行為，返回結構化 `RULE_UNDEFINED` 或 TODO。
8. JSON `null` 不得自動轉成 0；相關卡在規則確認前不進入可玩牌池。
9. 先寫測試再實現復雜互動，尤其轉變／回收／死靈復活／末日之書。

## 13. MVP 完成標準

- 可建立龍族 vs 不朽者 Hot Seat 對局並換牌。
- 正常抽牌、水晶、出牌、召喚、攻擊、結束回合。
- 正確處理 7 格手下、獨立立場、回合末手牌 10 張限制與空牌庫敗北。
- 支持核心關鍵字與轉變／消滅／消失／復活。
- 支持死靈數、死靈術、死靈復活與四本末日之書。
- 災厄洪流與巴哈姆特互動通過測試。
- 末日序曲與特殊勝利通過測試。
- 完整 Game Log、DebugPanel、重新開始與 deterministic replay。
