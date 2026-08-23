# 《戰記》Codex 專案資料包

本資料包依據對話「戰記遊戲設計整理」中已提供的內容整理，採用最後一次明確更正。未獲確認的內容不自行補完，會以 `null`、空陣列或 `notes`／文件中的「待確認」標示。

## 內容

- `docs/game-rules.md`：核心規則與關鍵字
- `docs/development-spec.md`：瀏覽器 MVP 開發規格
- `docs/interaction-tests.md`：已確認的特殊互動與驗收案例
- `docs/project-architecture.md`：規則、卡牌資料、引擎、UI、測試與未來 AI 對戰的運作導覽
- `docs/ai-mode.md`：隨機 AI、合法行動產生器、自動對局與後續策略 AI 的說明
- `docs/engine-bilingual-guide.md`：12 個主要遊戲引擎的英文程式名稱、中文翻譯與執行流程
- `data/dragon-cards.json`：龍族主牌（40 張）
- `data/undead-cards.json`：不朽者主牌（40 張）
- `data/machine-cards.json`：機械主牌（40 張）
- `data/alliance-cards.json`：聯盟主牌（35 張，缺 5 張）
- `data/token-cards.json`：衍生牌、黑暗之書與幸運幣

## 資料原則

- `deckCount` 是該主牌在目前牌組的張數；衍生牌固定為 `0`。
- 未提供的費用、攻擊或生命使用 `null`，不以同類卡推算。
- `effectsText` 保留目前確認的自然語言效果，工程實作時再轉成結構化 Effect。
- `keywords` 使用穩定英文代碼；中文定義見規則書。
- 聯盟目前主牌只有 35 張，禁止自動補齊缺少的 5 張。

## 瀏覽器灰盒 MVP

```bash
npm install
npm run dev
npm test
npm run build
```

- React UI 可選擇龍族、不朽者、機械、聯盟作為雙方陣營；聯盟嚴格使用 35 張主牌。
- 換牌、首回合抽牌、檢索後洗牌、水晶、幸運幣、回合階段、區域、7 格上限、結束回合棄至 10 張與空牌庫敗北均由純 TypeScript Engine 處理。
- 召喚、戰斗、同時觸發排序、倒數、生長、復活、回收、封印、轉變、消失、資料化卡效與 Game Log 已接入；React 只派發 Action 並顯示 GameState。
- 戰吼會在付費打出、自身效果召喚（含效果召喚、死靈復活）及衍生牌效果召喚後發動；召喚來源效果先完整結算。由其他卡牌復活的普通主牌不觸發戰吼。
- `docs/interaction-tests.md` 的 A01–G04 已全部轉成可執行 Vitest 測試，無 `it.todo`。
- 當前回歸結果：56 個測試文件、262 項測試全部通過；TypeScript 與 Vite 正式構建通過。`dist/` 可直接部署到靜態網頁托管服務。
- 所有 `null`、非空 `notes` 與規則審計項見 `docs/RULE_UNDEFINED.md`；運行時可由 `getRuleUndefinedInventory()` 查詢。未確認內容不會由引擎自行補完。
