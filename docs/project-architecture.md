# 《戰記》專案運作導覽

這份文件給第一次接觸遊戲程式與 AI 的開發者使用。目標不是記住所有檔案，而是能回答三件事：規則寫在哪裡、卡牌效果如何被執行、修改後如何證明沒有破壞其他卡牌。

## 一張卡從文字到畫面的完整路徑

```text
data/*.json（人類可讀卡表與原始數值）
        ↓ 以 card ID 合併
src/game/cards/cardRegistry.ts（可執行效果與觸發時機）
        ↓ 建立 CardDefinition / CardInstance
src/game/engine/gameEngine.ts（接收玩家 Action）
        ↓
各專責 Engine（效果、回合、戰鬥、傷害、區域、費用等）
        ↓ 產生新的 GameState
src/ui/GameBoard.tsx、CardView.tsx（只顯示狀態並派發 Action）
        ↓
tests/**/*.test.ts(x)（驗證規則與畫面行為）
```

UI 不應自行改血量、移動卡牌或判斷勝負。所有遊戲結果都應由純 TypeScript 引擎產生，如此同一套引擎才能供真人對戰、AI、重播與未來的網路對戰共用。

## 規則與資料的權責

- `docs/game-rules.md`：遊戲共通規則及關鍵字定義。
- `docs/interaction-tests.md`：容易互相影響的規則案例，是實作時的重要驗收依據。
- `data/dragon-cards.json` 等五份 JSON：卡名、費用、攻擊、生命、卡牌文字、關鍵字與牌組張數。
- `src/game/cards/cardTypes.ts`：程式允許的關鍵字、效果型別及卡牌資料結構。
- `src/game/cards/cardRegistry.ts`：用卡牌 ID 把 JSON 文字資料接到真正可執行的 Effect、TriggeredEffect、動態費用、轉費與光環。

`effectsText` 只負責讓玩家閱讀，不會自行執行。真正執行的是 registry 中的結構化資料。例如：

```ts
TOKEN_DRAGON_TIDAL_EMPEROR: {
  DEATHRATTLE: [
    { type: "GRANT_NEXT_LOW_COST_DRAGON_ZERO", maxOriginalCost: 7 },
    { type: "HEAL_HERO", value: 2 },
  ],
}
```

這代表海潮皇龍死亡時，引擎依序執行「下一張低費龍歸零」與「恢復 2 HP」。如果 JSON 只有寫死亡之聲、registry 卻沒有這段資料，卡面看得到文字但遊戲不會發動。

## 主要引擎分工

- `gameEngine.ts`：唯一的 Action 入口；驗證行動、複製狀態、呼叫專責引擎並回傳結果。
- `effectEngine.ts`：解讀 EffectDefinition；處理傷害、抽牌、指定、條件、重複效果與後續效果。
- `turnEngine.ts`：換牌及 DRAW → COUNTDOWN → GROWTH → MAIN → END → HAND_LIMIT 的流程。
- `combatEngine.ts`：合法攻擊目標、攻擊與反擊。
- `damageEngine.ts`：傷害、聖盾術、減傷與玩家傷害防護。
- `zoneEngine.ts`：卡牌在手牌、場上、棄堆、移除區及額外區之間移動；死亡之聲也從這裡加入隊列。
- `triggerEngine.ts`、`simultaneousEngine.ts`：建立觸發隊列與同時觸發的順序。
- `summonEngine.ts`、`reviveEngine.ts`、`transformEngine.ts`：召喚、復活與轉變。
- `costEngine.ts`：動態費用與暫時費用的統一計算。
- `targetingEngine.ts`：效果的合法指定目標，避免各卡重複實作庇護、紀律等判斷。

## CardDefinition 與 CardInstance

- `CardDefinition` 是不變的卡表定義，例如聖印白龍原始為 2 費、1/2。
- `CardInstance` 是某場對局中的實體，具有唯一 `instanceId`，可記錄目前費用、目前生命、控制者、所在區域、封印與標記。

同名卡必須靠 `instanceId` 區分。效果判斷原始費用時查 Definition；顯示受傷後生命時查 Instance。

## 觸發效果如何執行

1. 玩家按下按鈕或拖曳，UI 派發 `GameAction`。
2. `applyAction()` 複製目前 GameState，避免失敗行動污染原狀態。
3. 出牌、攻擊、死亡或回合階段找到相應的結構化效果。
4. 立即效果由 `resolveEffects()` 依順序處理；觸發效果先進入 `pendingEffects`。
5. 需要玩家指定時建立 `pendingChoice`，UI 顯示選項後再派發 `SELECT_EFFECT_CARDS` 或 `SELECT_EFFECT_OPTION`。
6. 選擇完成後繼續剩餘效果及觸發隊列。
7. 每次成功 Action 後重新計算手牌費用，React 依新的 GameState 重畫畫面。

## 關鍵字「庇護」

程式代碼是 `SANCTUARY`，中文統一顯示為「庇護」。它防止手下被卡牌效果直接消滅，但不阻止：

- 數值傷害；生命降至 0 仍會被消滅。
- 「消失」；消失不是消滅。
- 一般戰鬥傷害。

哪些卡具有庇護，由各 JSON 卡牌的 `keywords` 決定；介面不會自行賦予。

## 修改一張卡的高效率流程

1. 先在 `data/*.json` 找卡牌 ID，確認玩家看到的文字、數值與 notes。
2. 在 `cardRegistry.ts` 用同一 ID 找實際 Effects、TriggeredEffects、dynamicCost 或其他機制。
3. 搜尋對應 Effect type 在 `effectEngine.ts` 等引擎的 resolver。
4. 先寫或更新該卡的回歸測試，至少涵蓋正常情況、沒有目標、臨界值與離場情況。
5. 執行單一測試檔快速迭代：`npx vitest run tests/dragon/diablo.test.ts`。
6. 完成後執行 `npm run check`，同時跑全部測試、TypeScript 與正式建置。

資料驗證器會檢查卡牌文字中的戰吼、死亡之聲、謝幕曲與回合結束效果是否有連接到可執行資料。這能防止「卡面有寫、遊戲沒做」再次無聲通過。

## AI 對戰目前的狀態

目前專案沒有 AI 對手；雙方都由同一介面的人類玩家操作。這是好事，因為規則引擎和 UI 已分離，未來 AI 只需要讀取 GameState 並輸出合法 GameAction，不必操作畫面。

建議按以下順序加入 AI：

1. 建立 `getLegalActions(state, playerId)`，完整列出出牌、攻擊、結束回合及所有選擇；這也是規則完整性的第二道檢查。
2. 建立最簡單的隨機 AI，只從合法 Action 中選一個，用來做大量自動對局與找崩潰。
3. 建立規則型 AI，依場攻、手牌價值、生命、水晶效率與擊殺價值評分。
4. 再考慮搜尋型 AI，例如有限深度 minimax／beam search。卡牌遊戲有隱藏資訊及隨機性，不適合一開始就追求複雜模型。
5. 最後才評估機器學習。沒有可靠合法行動生成器、狀態評分、重播資料與大量模擬環境時，直接使用模型只會讓錯誤更難定位。

實用的第一版 AI 不需要「像人一樣思考」；它只需要永遠遵守規則、能完成所有 Choice、不當機，並做出比隨機稍好的決策。

## 每次交付的完成標準

- 卡牌顯示文字與可執行效果一致。
- 沒有以中文卡名散落在引擎中硬判斷。
- 合法目標與範圍由共通 targeting／engine 邏輯處理。
- 新規則有正常、失敗與臨界案例測試。
- `npm run check` 全部通過。
- 未確認規則明確記入 notes／RULE_UNDEFINED，不由開發者或 AI 猜測。
