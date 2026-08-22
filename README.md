# 《戰記》Codex 專案資料包

本資料包依據對話「戰記遊戲設計整理」中已提供的內容整理，採用最後一次明確更正。未獲確認的內容不自行補完，會以 `null`、空陣列或 `notes`／文件中的「待確認」標示。

## 內容

- `docs/game-rules.md`：核心規則與關鍵字
- `docs/development-spec.md`：瀏覽器 MVP 開發規格
- `docs/interaction-tests.md`：已確認的特殊互動與驗收案例
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

## 浏览器灰盒 MVP

```bash
npm install
npm run dev
npm test
npm run build
```

- React UI 可选择龙族、不朽者、机械、联盟作为双方阵营；联盟严格使用 35 张主牌。
- 换牌、首回合抽牌、检索后洗牌、水晶、幸運幣、回合阶段、区域、7 格上限、结束回合弃至 10 张与空牌库败北均由纯 TypeScript Engine 处理。
- 召唤、战斗、同时触发排序、倒数、生长、复活、回收、封印、转变、消失、资料化卡效与 Game Log 已接入；React 只派发 Action 并显示 GameState。
- 战吼会在付费打出、自身效果召唤（含效果召唤、死灵复活）及衍生牌效果召唤后发动；召唤来源效果先完整结算。由其他卡牌复活的普通主牌不触发战吼。
- `docs/interaction-tests.md` 的 A01–G04 已全部转成可执行 Vitest 测试，无 `it.todo`。
- 当前回归结果：55 个测试文件、236 项测试全部通过；TypeScript 与 Vite 正式构建通过。`dist/` 可直接部署到静态网页托管服务。
- 所有 `null`、非空 `notes` 与规则审计项见 `docs/RULE_UNDEFINED.md`；运行时可由 `getRuleUndefinedInventory()` 查询。未确认内容不会由引擎自行补完。
