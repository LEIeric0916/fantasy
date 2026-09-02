# 遊戲引擎中英對照導讀

本文件翻譯 `src/game/engine/` 內 12 個主要檔案的程式名稱與實際用途。原始 TypeScript 保留英文識別名稱，避免破壞匯入、型別檢查及其他程式的呼叫。

## 共通英文名詞

| English | 中文 | 在本專案中的意思 |
|---|---|---|
| Engine | 引擎 | 執行某類遊戲規則的程式模組 |
| State / GameState | 狀態／遊戲狀態 | 整場對局目前的完整資料 |
| Action / GameAction | 行動／遊戲行動 | 玩家要求引擎執行的命令 |
| PlayerId | 玩家編號 | `P1` 或 `P2` |
| CardDefinition | 卡牌定義 | 卡表中的固定資料 |
| CardInstance | 卡牌實體 | 對局中某一張實際卡牌及其可變狀態 |
| definitionId | 定義編號 | 用來查卡表的穩定 ID，例如 `DRAGON_010` |
| instanceId | 實體編號 | 區分同名卡牌的唯一 ID |
| source | 來源 | 發動效果或造成傷害的卡牌 |
| target | 目標 | 被指定、攻擊或受到效果的對象 |
| resolve | 結算 | 按規則真正執行並改變 GameState |
| enqueue | 加入隊列 | 暫時排入等待處理的效果清單 |
| pending | 待處理 | 尚未完成的效果或玩家選擇 |
| legal | 合法 | 符合目前規則、可以執行 |
| trigger | 觸發 | 在指定時機自動發動效果 |
| aura | 光環 | 位於場上時持續影響其他卡牌的效果 |
| mutable | 可變的 | 函式會直接修改傳入的複製狀態 |
| boolean | 布林值 | `true` 成立／成功，`false` 不成立／失敗 |
| void | 無回傳值 | 函式只負責執行，不回傳資料 |

---

## gameEngine.ts — 遊戲總引擎

原始檔：[gameEngine.ts](../src/game/engine/gameEngine.ts)

這是所有玩家操作的總入口。React 介面不能自行扣血、扣費或移動卡牌，而是把 Action 交給這個檔案。

### GameAction — 遊戲行動

| English Action | 中文 |
|---|---|
| `MULLIGAN` | 完成換牌 |
| `PLAY_CARD` | 正常打出卡牌 |
| `PLAY_ALTERNATE` | 使用轉費／替代方式打出 |
| `ACTIVATE_FIELD` | 主動發動立場效果 |
| `ATTACK` | 攻擊 |
| `END_TURN` | 結束回合 |
| `SELECT_DISCARD` | 選擇要棄掉的牌 |
| `SELECT_TRIGGER_ORDER` | 選擇觸發效果順序 |
| `SELECT_COUNTDOWN_ORDER` | 選擇倒數效果順序 |
| `SELECT_EFFECT_CARDS` | 完成卡牌效果的卡牌指定 |
| `SELECT_EFFECT_OPTION` | 完成二選一等效果選項 |
| `CONFIRM_EFFECT_SUMMON` | 確認效果召喚 |
| `DEBUG_SUMMON` | 測試用召喚 |

### 主要函式

| English | 中文名稱 | 實際工作 |
|---|---|---|
| `playCard` | 正常出牌 | 驗證階段、玩家、手牌、費用及場地上限；支付費用後依手下、立場、法術分流 |
| `playAlternate` | 替代方式出牌 | 支付轉費費用並只執行 alternatePlay 效果 |
| `activateField` | 發動立場 | 驗證資源及封印，扣除死靈數或回收充能後執行效果 |
| `executeMutable` | 執行可變行動 | 依 Action type 呼叫正確的專責引擎 |
| `applyAction` | 套用行動 | 複製原始 GameState、執行行動、刷新費用；失敗時保留原狀態並回傳錯誤 |
| `ruleUndefined` | 建立未定義規則錯誤 | 把不能自行猜測的規則包成結構化錯誤 |

簡化流程：

```text
GameBoard 派發 Action
→ applyAction 複製狀態
→ executeMutable 分流
→ 專責 Engine 結算
→ refreshHandCosts
→ 回傳新 GameState 或錯誤
```

---

## effectEngine.ts — 卡牌效果引擎

原始檔：[effectEngine.ts](../src/game/engine/effectEngine.ts)

這是最大的引擎。它不靠中文卡名判斷，而是讀取 `EffectDefinition.type`。

### 核心函式

| English | 中文名稱 | 實際工作 |
|---|---|---|
| `notifyEffectSkipped` | 通知效果未發動 | 將沒有目標或條件不成立的原因放入 UI 通知及 Game Log |
| `conditionFailureReason` | 產生條件失敗原因 | 將英文條件代碼轉成玩家能理解的中文原因 |
| `conditionMatches` | 檢查條件是否成立 | 讀取 GameState 判斷血量、水晶、手下數、立場等條件 |
| `canExecuteEffect` | 預先檢查能否執行 | 確認抽牌、召喚、指定等效果至少有執行可能 |
| `resolveEffectList` | 結算效果清單 | 依順序逐一讀取 Effect type 並修改狀態 |
| `resolvePendingEffects` | 結算等待中的效果 | 處理觸發隊列；必要時要求玩家選擇順序 |
| `selectTriggerOrder` | 選擇觸發順序 | 驗證玩家指定的來源順序後繼續隊列 |
| `resolveEffects` | 結算效果 | 對外的主要效果入口，完成後繼續狀態型效果召喚及觸發隊列 |
| `selectEffectCards` | 完成卡牌指定 | 驗證指定數量、不可重複及候選清單，接著執行指定結果 |
| `confirmEffectSummon` | 確認效果召喚 | 將符合條件的手牌召喚上場，再繼續剩餘效果 |
| `selectEffectOption` | 選擇效果選項 | 處理二選一或多選一效果 |

### 條件代碼

| English Condition | 中文 |
|---|---|
| `OPPONENT_HAS_MINION` | 對手場上有手下 |
| `NO_OTHER_FRIENDLY_MINIONS` | 我方沒有其他手下 |
| `MAX_MANA_EQUALS` | 最大水晶等於指定值 |
| `MAX_MANA_AT_LEAST` | 最大水晶至少為指定值 |
| `FRIENDLY_ORIGINAL_COST_AT_LEAST` | 我方有原始費用至少為指定值的手下 |
| `FRIENDLY_FIELD_SUBTYPE` | 我方有指定類型立場 |
| `FRIENDLY_SAME_FIELD_COUNT_AT_LEAST` | 我方同名立場達到指定張數 |
| `HERO_HP_BELOW` | 我方玩家生命低於指定值 |
| `SUMMONED_THIS_GAME_AT_LEAST` | 本場召喚數至少為指定值 |
| `SUMMONED_THIS_GAME_BELOW` | 本場召喚數低於指定值 |
| `FRIENDLY_MINION_COUNT_LESS_THAN_OPPONENT` | 我方手下數少於對手 |
| `FRIENDLY_MINION_COUNT_AT_LEAST` | 我方手下數至少為指定值 |
| `ALL` | 所有子條件都必須成立 |

### 基礎效果代碼

| English Effect | 中文 |
|---|---|
| `GAIN_MANA` | 獲得本回合可用水晶 |
| `DRAW` | 抽牌 |
| `HEAL_HERO` | 恢復玩家生命 |
| `MODIFY_SELF_HEALTH` | 修改自身生命 |
| `MODIFY_SELF_ATTACK` | 修改自身攻擊 |
| `MODIFY_SELF_STATS` | 同時修改自身攻擊與生命 |
| `INCREASE_MAX_MANA` | 增加最大水晶 |
| `RESTORE_MANA` | 恢復至最大水晶 |
| `RESTORE_MANA_VALUE` | 恢復指定數量水晶 |
| `RETURN_SELF_TO_HAND` | 自身返回手牌 |
| `RETURN_SELF_TO_DECK_SHUFFLE` | 自身返回牌組並洗牌 |
| `SUMMON_SELF_FROM_HAND` | 自身從手牌效果召喚 |
| `ADD_GENERATED_TO_HAND` | 將衍生牌加入手牌 |

### 召喚與立場效果代碼

| English Effect | 中文 |
|---|---|
| `SUMMON` | 召喚衍生手下 |
| `SUMMON_FIELD` | 召喚衍生立場 |
| `CHOOSE_GENERATED_FIELD` | 選擇一種衍生立場召喚 |
| `CHOOSE_DISTINCT_GENERATED_FIELDS` | 選擇不同衍生立場召喚 |
| `CHOOSE_DISTINCT_GENERATED_MINIONS` | 選擇不同衍生手下召喚 |
| `SUMMON_PER_FRIENDLY_FIELD_SUBTYPE` | 依我方指定類型立場數召喚 |
| `SUMMON_WITH_KEYWORD_IF_FIELD` | 召喚；若有指定立場則賦予關鍵字 |
| `CHOOSE_EFFECT_SUMMON_COPY` | 同名效果召喚有多張時選擇其中一張 |
| `VANISH_OLD_SAME_FIELD_AND_DRAW` | 使舊同名立場消失並抽牌 |
| `VANISH_OTHER_SAME_FIELDS` | 使其他同名立場消失 |
| `TRANSFORM_SELF_FIELD` | 將自身立場轉變 |

### 傷害與消滅效果代碼

| English Effect | 中文 |
|---|---|
| `DAMAGE_ENEMY_HERO` | 傷害對手玩家 |
| `DAMAGE_ALL_ENEMY_MINIONS` | 傷害所有敵方手下 |
| `DAMAGE_ALL_OTHER_MINIONS` | 傷害場上所有其他手下 |
| `DAMAGE_TARGET_ENEMY_MINION` | 傷害指定敵方手下 |
| `DAMAGE_TARGET_ENEMY_MINION_OR_HERO` | 傷害指定敵方手下；無目標時改打玩家 |
| `DAMAGE_ALL_ENEMY_MINIONS_BY_FRIENDLY_FIELD_SUBTYPE` | 依我方指定立場數造成敵方全體傷害 |
| `SNAPSHOT_FIELD_COUNT_DAMAGE_AND_SUMMON` | 先記錄立場數，再依快照傷害及召喚 |
| `SNAPSHOT_ENEMY_COUNT_AOE_HERO_DRAW_SELF_DEBUFF` | 先記錄敵方手下數，再處理全體傷害、玩家傷害、抽牌及自身減值 |
| `REPEAT_DAMAGE_TARGET_ENEMY_MINION_BY_FRIENDLY_FIELD_SUBTYPE` | 依立場數重複指定敵方手下造成傷害 |
| `DAMAGE_DISTINCT_ENEMY_MINIONS_REWARD_KILLS` | 傷害數名不同手下，依消滅數給予獎勵 |
| `REPEAT_DAMAGE_ENEMY_MINION_OR_HERO` | 重複傷害手下；沒有手下時依限制傷害玩家 |
| `DESTROY_TARGET_ENEMY_MINION` | 消滅指定敵方手下 |
| `DESTROY_UP_TO_ENEMY_MINIONS` | 消滅最多指定數量的敵方手下 |
| `DESTROY_DISTINCT_ENEMY_MINIONS` | 消滅固定數量的不同敵方手下 |
| `DESTROY_ALL_ENEMY_MINIONS` | 消滅所有可被消滅的敵方手下 |
| `VANISH_ENEMY_MINIONS` | 使敵方手下消失，不觸發死亡系統 |
| `TRANSFORM_ENEMY_MINIONS` | 將固定數量敵方手下轉變 |
| `TRANSFORM_UP_TO_ENEMY_MINIONS` | 將最多指定數量敵方手下轉變 |

### 手牌、牌組與費用效果代碼

| English Effect | 中文 |
|---|---|
| `DISCARD_HAND` | 棄掉手牌 |
| `RETURN_HAND_MINION_TO_DECK_SHUFFLE_DRAW_BY_COST` | 指定手牌手下返回牌組、洗牌並依費用抽牌 |
| `SEARCH_DECK` | 從整個牌組檢索符合條件的牌並洗牌 |
| `DISCOVER_TOP` | 翻開牌組上方指定數量並從中發現 |
| `COPY_HAND_SPELL_EFFECT` | 複製手牌法術的可執行效果 |
| `SET_HAND_CARD_COST_ZERO` | 指定手牌費用固定為 0 |
| `RETURN_HAND_TO_DECK_MACHINE_DISCOUNT` | 手牌返回牌組並給予下一張機械減費 |
| `GRANT_NEXT_MINION_TEMPORARY_COST_REDUCTION` | 下一張手下暫時減費 |
| `GRANT_NEXT_LOW_COST_DRAGON_ZERO` | 下一張符合上限的低費龍族費用變 0 |
| `GRANT_NEXT_HIGH_COST_DRAGON_REDUCTION` | 下一張符合下限的高費龍族減費 |

### 關鍵字、資源與特殊效果代碼

| English Effect | 中文 |
|---|---|
| `GRANT_ALL_FRIENDLY_KEYWORD` | 我方所有合法手下獲得關鍵字 |
| `GRANT_TARGET_FRIENDLY_MINION_KEYWORD` | 指定我方手下獲得關鍵字 |
| `GAIN_SELF_KEYWORD` | 自身獲得關鍵字 |
| `SEAL_TARGET_ENEMY_MINION` | 封印指定敵方手下 |
| `GAIN_NECROMANCY` | 增加死靈數 |
| `GAIN_RECYCLE_CHARGE` | 增加回收充能 |
| `GAIN_RECYCLE_CHARGE_BY_FRIENDLY_FIELD_SUBTYPE` | 依我方立場數增加回收充能 |
| `GRANT_NEXT_HERO_DAMAGE_ZERO` | 接下來指定次數的玩家傷害變 0 |
| `GRANT_ALL_FRIENDLY_DAMAGE_CAP` | 我方手下獲得單次傷害上限 |
| `GRANT_HERO_DIVINE_SHIELD` | 玩家獲得聖盾術 |
| `CHOOSE_ONE` | 從多個效果選項中選一個 |
| `CONDITIONAL` | 條件成立才執行內層效果 |
| `SEGMENT_BREAK` | 句號／分號效果分段；前段失敗不阻止後段 |
| `RULE_UNDEFINED` | 規則未確認，停止猜測並回報 |
| `SCALED_END_TURN_CHOICE` | 依最大水晶調整數值的回合結束二選一 |
| `CATASTROPHE_FLOOD` | 災厄洪流的專用組合效果 |
| `HEROIC_GLORY` | 英雄榮光的歷史選擇與召喚流程 |
| `CHOOSE_UNACQUIRED_GENERATED_TO_HAND` | 從尚未取得的衍生牌中選擇加入手牌 |
| `RECORD_CHOICE_ADD_GENERATED_TO_HAND` | 記錄選擇並加入衍生牌 |
| `MECHANICAL_TECHNIQUE` | 支付回收充能後執行機械術效果 |
| `NECRO_REVIVE_SELF` | 消耗死靈數使自身從棄堆復活 |

當效果需要玩家指定時，`resolveEffectList` 不會一次執行到底，而是建立 `pendingChoice`。UI 收到後顯示候選卡，玩家選完再由 `selectEffectCards` 繼續。

---

## turnEngine.ts — 回合引擎

原始檔：[turnEngine.ts](../src/game/engine/turnEngine.ts)

| English | 中文名稱 | 實際工作 |
|---|---|---|
| `opponentOf` | 取得對手 | P1 轉成 P2，P2 轉成 P1 |
| `gameHasEnded` | 檢查遊戲是否結束 | 判斷 phase 是否為 GAME_OVER |
| `drawCard` | 抽牌 | 從牌組頂移到手牌；空牌庫仍需抽牌則敗北 |
| `grantCoin` | 給予幸運幣 | 後攻第一回合建立幸運幣卡牌實體 |
| `beginTurn` | 開始回合 | 重設回合紀錄、增加並恢復水晶、進入抽牌階段及檢查效果召喚 |
| `continueAfterStartTurnEffects` | 回合開始效果後繼續 | 執行正常抽牌、後攻額外抽牌與幸運幣，再進入倒數 |
| `continueAfterCountdown` | 倒數後繼續 | 進入生長階段並收集生長效果 |
| `continueAfterGrowthEffects` | 生長後繼續 | 進入主要階段 MAIN |
| `performMulligan` | 執行換牌 | 先抽等量替換牌，再把換出的牌放回牌組洗牌 |
| `requestEndTurn` | 請求結束回合 | 進入 END 並收集我方手下與立場的回合結束效果 |
| `continueAfterEndTurnEffects` | 回合結束效果後繼續 | 檢查手牌上限，必要時要求棄牌 |
| `discardForHandLimit` | 因手牌上限棄牌 | 驗證數量後將指定手牌移至棄堆 |
| `finishTurn` | 完成回合 | 清除回合限定減費、交換主動玩家並開始下一回合 |

回合順序：

```text
MULLIGAN 換牌
→ DRAW 抽牌／回合開始效果
→ COUNTDOWN 倒數
→ GROWTH 生長
→ MAIN 出牌與攻擊
→ END 回合結束效果
→ HAND_LIMIT 手牌上限
→ 下一位玩家的 DRAW
```

---

## combatEngine.ts — 戰鬥引擎

原始檔：[combatEngine.ts](../src/game/engine/combatEngine.ts)

| English | 中文名稱 | 實際工作 |
|---|---|---|
| `AttackTarget` | 攻擊目標型別 | 目標只能是 HERO 玩家或 MINION 手下 |
| `gameHasEnded` | 檢查遊戲結束 | 防止勝負產生後繼續戰鬥 |
| `canAttackThisTurn` | 本回合能否攻擊 | 檢查攻擊次數、封印、進場回合、衝刺、衝鋒與風怒 |
| `attackableEnemyMinions` | 可被攻擊的敵方手下 | 排除潛行與威懾保護的手下 |
| `getLegalAttackTargets` | 取得合法攻擊目標 | 套用嘲諷、獵頭、只能打玩家、不能打玩家等規則 |
| `resolveAttack` | 結算攻擊 | 驗證攻擊、處理交戰前效果、雙方傷害、必殺、死亡及擊殺觸發 |

攻擊手下不是單純互扣生命，順序是：合法目標 → 交戰前觸發 → 雙方同時造成傷害 → 判斷死亡／必殺 → 死亡之聲與擊殺效果。

---

## damageEngine.ts — 傷害引擎

原始檔：[damageEngine.ts](../src/game/engine/damageEngine.ts)

| English | 中文名稱 | 實際工作 |
|---|---|---|
| `DamageKind` | 傷害種類 | `COMBAT` 戰鬥傷害或 `EFFECT` 效果傷害 |
| `revealStealthDamageSource` | 傷害來源解除潛行 | 潛行手下實際造成至少 1 傷後失去潛行 |
| `dealDamageToMinion` | 對手下造成傷害 | 依序檢查無敵、效果免疫、光環免疫、聖盾、減傷上限，再扣生命 |
| `grantDamageCap` | 賦予傷害上限 | 多個傷害上限同時存在時保留最嚴格的較小值 |
| `dealDamageToHero` | 對玩家造成傷害 | 檢查玩家聖盾及傷害歸零次數、扣血並判斷 HP 歸零勝負 |

重要差別：傷害引擎只負責「造成多少傷害」，生命降到 0 後將卡牌移出場通常由呼叫者交給 `zoneEngine`。

---

## zoneEngine.ts — 區域與死亡引擎

原始檔：[zoneEngine.ts](../src/game/engine/zoneEngine.ts)

| English | 中文名稱 | 實際工作 |
|---|---|---|
| `findCard` | 尋找卡牌實體 | 在雙方所有區域用 instanceId 尋找卡牌 |
| `moveCard` | 移動卡牌 | 從來源陣列移除，修改 zone／controller，再放入目的區域並記錄日誌 |
| `destroyMinion` | 消滅手下 | 確保目標位於手下區，再交給共通場上消滅流程 |
| `destroyCardOnField` | 消滅場上卡牌 | 增加死靈數、收集死亡之聲／謝幕曲／回收／死靈復活，最後移往正確區域 |

主要區域代碼：

| English Zone | 中文 |
|---|---|
| `DECK` | 牌組 |
| `HAND` | 手牌 |
| `MINION` | 手下區 |
| `FIELD` | 立場區 |
| `GRAVEYARD` | 棄堆 |
| `REMOVED` | 移除區／消失區 |
| `EXTRA_DECK` | 衍生牌組／額外區 |

衍生牌被消滅後回到 EXTRA_DECK；一般主牌進入 GRAVEYARD；具有回收者返回牌組底部。

---

## costEngine.ts — 費用引擎

原始檔：[costEngine.ts](../src/game/engine/costEngine.ts)

| English | 中文名稱 | 實際工作 |
|---|---|---|
| `setCurrentCost` | 設定目前費用 | 套用最低費用限制後寫入 currentCost |
| `modifyCurrentCost` | 增減目前費用 | 以現有費用加上正數或負數 |
| `refreshCardCost` | 重新計算單張費用 | 從原始費用開始，依暫時修正、全局減費、動態條件及固定費用重算 |
| `refreshHandCosts` | 刷新雙方手牌費用 | 對雙方每張手牌呼叫 refreshCardCost |
| `grantTemporaryCostReduction` | 賦予暫時減費 | 寫入 temporaryCostAdjustment 並立即刷新 |
| `clearTemporaryHandCosts` | 清除暫時費用 | 回合結束刪除暫時修正並重算 |

動態費用代碼例子：

| English | 中文 |
|---|---|
| `ENEMY_MINION_COUNT` | 依敵方手下數減費 |
| `FRIENDLY_GRAVE_DRAGON_COUNT` | 依我方棄堆龍族手下數減費 |
| `RECYCLE_CHARGE` | 依回收充能減費 |
| `FRIENDLY_FIELD_SUBTYPE_COUNT` | 依我方指定類型立場數減費 |
| `FRIENDLY_MINION_COUNT` | 依我方手下數減費 |
| `SUMMONED_THIS_TURN_MULTIPLIER` | 依本回合召喚數乘倍率減費 |

---

## targetingEngine.ts — 效果指定引擎

原始檔：[targetingEngine.ts](../src/game/engine/targetingEngine.ts)

| English | 中文名稱 | 實際工作 |
|---|---|---|
| `getLegalEnemyEffectTargets` | 取得合法敵方效果目標 | 只從對手手下區挑選；排除潛行與光紋，干涉型效果再排除紀律及無敵 |
| `interference` | 是否屬於干涉型效果 | `true` 表示轉變、封印等會被對手紀律或無敵阻擋的效果 |

集中處理指定規則可以避免每張卡各自寫一套、最後出現範圍不一致。

---

## triggerEngine.ts — 觸發隊列引擎

原始檔：[triggerEngine.ts](../src/game/engine/triggerEngine.ts)

| English | 中文名稱 | 實際工作 |
|---|---|---|
| `enqueueTriggeredEffects` | 將觸發效果加入隊列 | 保存來源、控制者、效果、原因、同時時機 ID 與當時合法目標快照 |
| `cause` | 觸發原因 | 例如死亡、回合結束、召喚或交戰開始 |
| `timingContext` | 時機內容 | 區分哪些效果屬於同一個同時發生批次 |
| `allowSealed` | 是否允許離場後來源 | 用於已經死亡但死亡之聲仍須結算；不是讓封印卡發動效果 |

它只負責「排隊」，真正執行仍由 `effectEngine.resolvePendingEffects` 負責。

---

## summonEngine.ts — 召喚引擎

原始檔：[summonEngine.ts](../src/game/engine/summonEngine.ts)

| English | 中文名稱 | 實際工作 |
|---|---|---|
| `canTriggerEffectSummonFromHand` | 能否從手牌效果召喚 | 確認手下區尚未滿 7 格 |
| `recordMinionSummoned` | 記錄召喚 | 增加本回合／本場召喚數，龍族則累加原始費用 |
| `applyFriendlyEnterAuras` | 套用友方進場光環 | 新手下進場時取得符合種族條件的關鍵字 |
| `enqueueFriendlySummonAuras` | 排入友方召喚光環 | 其他友方手下監聽召喚事件，並遵守每回合次數上限 |
| `enqueueBattlecryAfterSummon` | 召喚後排入戰吼 | 卡牌有 BATTLECRY 且未封印時，把戰吼效果加入隊列 |
| `summonGeneratedMinion` | 召喚衍生手下 | 建立新的 CardInstance、放入手下區、套用光環並處理戰吼／入場曲 |
| `summonFromHandByEffect` | 從手牌效果召喚 | 將既有手牌實體移至手下區，再處理召喚紀錄與戰吼 |
| `summonGeneratedField` | 召喚衍生立場 | 建立立場實體、檢查上限並排入場效果 |

正常「支付費用打出手下」由 gameEngine 移動手牌；「效果產生新手下」與「手牌自身效果召喚」則由這裡處理。

---

## transformEngine.ts — 轉變引擎

原始檔：[transformEngine.ts](../src/game/engine/transformEngine.ts)

| English | 中文名稱 | 實際工作 |
|---|---|---|
| `transformMinion` | 轉變手下 | 保留同一 instanceId／擁有者，改成新 definitionId、面板、關鍵字與計數器 |
| `checkDoomsdayWin` | 檢查末日之書勝利 | 同一玩家場上達到 4 張末日之書便立即獲勝 |
| `transformField` | 轉變立場 | 保留實體身分，替換立場定義、費用、關鍵字與計數器，再檢查勝利 |

轉變不等於消滅：不進棄堆、不發動原卡死亡之聲。無敵會阻止轉變；紀律會阻止對手效果造成的轉變，但允許我方與自身效果。成功轉變手下後，引擎也會通知相關轉變光環，例如瘟疫之書增加標記。

---

## reviveEngine.ts — 復活引擎

原始檔：[reviveEngine.ts](../src/game/engine/reviveEngine.ts)

| English | 中文名稱 | 實際工作 |
|---|---|---|
| `ReviveCause` | 復活原因 | `CARD_EFFECT` 其他卡牌效果復活；`NECRO_REVIVE` 自身死靈復活 |
| `reviveMinion` | 復活手下 | 從我方棄堆移到手下區、恢復生命、重設傷害與攻擊次數、套用光環及復活觸發 |

重要規則：

- 一般 `CARD_EFFECT` 復活不發動戰吼。
- `NECRO_REVIVE` 自身復活會排入戰吼。
- 具有 `ON_REVIVE` 的卡牌會發動復活效果。
- 入場曲 `enterFieldEffects` 在兩種復活方式都會處理。

---

## 用一個實例串起所有引擎

玩家使用赤焰的龍皇兵攻擊敵方手下：

```text
GameBoard 派發 ATTACK
→ gameEngine.executeMutable
→ combatEngine.getLegalAttackTargets
→ combatEngine.resolveAttack
→ damageEngine.dealDamageToMinion
→ 生命降至 0 時 zoneEngine.destroyMinion
→ triggerEngine 排入死亡之聲
→ effectEngine.resolvePendingEffects
→ GameState 更新
→ GameBoard 重新顯示
```

若是赤焰的龍皇兵戰吼：

```text
GameBoard 派發 PLAY_CARD
→ gameEngine.playCard
→ cardRegistry 以 DRAGON_010 找到效果資料
→ effectEngine 建立最多 2 名目標的 pendingChoice
→ 玩家選擇後派發 SELECT_EFFECT_CARDS
→ effectEngine 結算 4 點傷害與消滅獎勵
→ damageEngine 處理傷害
→ zoneEngine 處理死亡
→ turnEngine.drawCard 處理獎勵抽牌
→ GameState 更新
```

## 閱讀原始碼的建議順序

1. 先讀 `GameState.ts`，知道遊戲保存哪些資料。
2. 讀 `cardTypes.ts`，認識 Action、Effect、Keyword 等程式語言。
3. 讀 `cardRegistry.ts`，看卡牌 ID 如何對應效果。
4. 讀較短的 `costEngine`、`targetingEngine`、`triggerEngine`。
5. 再讀 `turnEngine`、`combatEngine`、`damageEngine`、`zoneEngine`。
6. 最後讀最大的 `effectEngine`。

遇到不懂的程式碼時，先找函式的輸入參數、回傳型別，再用全域搜尋確認它由誰呼叫。不要一開始就逐字閱讀整個 `effectEngine`。
