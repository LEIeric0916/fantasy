import { useState } from "react";
import type { AiDifficulty } from "../game/ai/aiPolicy";
import type { Faction, PlayerId } from "../game/cards/cardTypes";
import { createEighthTutorialGame, createFifthTutorialGame, createFirstTutorialGame, createFourthTutorialGame, createInitialGame, createSecondTutorialGame, createSeventhTutorialGame, createSixthTutorialGame, createThirdTutorialGame } from "../game/state/createInitialGame";
import { CardCatalog } from "../ui/CardCatalog";
import { GameBoard } from "../ui/GameBoard";
import { Glossary } from "../ui/Glossary";

const factionOptions: { value: Faction; label: string }[] = [
  { value: "DRAGON", label: "龍族（40 張）" },
  { value: "UNDEAD", label: "不朽（40 張）" },
  { value: "MACHINE", label: "機械（40 張）" },
  { value: "ALLIANCE", label: "聯盟（40 張）" },
];

type EntryMode = "BATTLE" | "CHAOS" | "TUTORIAL";
type GameMode = "LOCAL" | "RANDOM_AI" | "HEURISTIC_AI" | "SEARCH_AI" | "WATCH_AI_HEURISTIC";
type SpectatorViewMode = "FOLLOW_ACTION" | "FIXED";
type FactionSelection = Faction | "RANDOM";
export type TutorialLevel = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
type TutorialChapter = "INFO" | "COMBAT" | "EFFECT" | "SPELL";

const tutorialLevels: Record<TutorialChapter, { value: TutorialLevel; label: string }[]> = {
  INFO: [{ value: 1, label: "第一關：遊戲介面與打出手下" }],
  COMBAT: [
    { value: 2, label: "第一關：戰鬥基礎" },
    { value: 4, label: "第二關：聖盾術" },
    { value: 5, label: "第三關：殺意" },
    { value: 6, label: "第四關：風怒" },
  ],
  EFFECT: [
    { value: 7, label: "第一關：死亡之聲" },
    { value: 8, label: "第二關：戰吼" },
  ],
  SPELL: [{ value: 3, label: "第一關：一般法術與立場" }],
};

function resolveFaction(selection: FactionSelection): Faction {
  if (selection !== "RANDOM") return selection;
  return factionOptions[Math.floor(Math.random() * factionOptions.length)].value;
}

export function randomChaosFactions(random: () => number = Math.random): [Faction, Faction] {
  const available = factionOptions.map((option) => option.value);
  const first = available.splice(Math.floor(random() * available.length), 1)[0];
  const second = available.splice(Math.floor(random() * available.length), 1)[0];
  if (!first || !second) throw new Error("混沌模式無法取得兩個不同牌組");
  return [first, second];
}

export default function App() {
  const [gameKey, setGameKey] = useState(0);
  const [started, setStarted] = useState(false);
  const [showCatalog, setShowCatalog] = useState(false);
  const [showGlossary, setShowGlossary] = useState(false);
  const [p1Faction, setP1Faction] = useState<FactionSelection>("DRAGON");
  const [p2Faction, setP2Faction] = useState<FactionSelection>("UNDEAD");
  const [resolvedFactions, setResolvedFactions] = useState<Record<PlayerId, Faction>>({ P1: "DRAGON", P2: "UNDEAD" });
  const [resolvedDeckFactions, setResolvedDeckFactions] = useState<Record<PlayerId, Faction[]>>({ P1: ["DRAGON"], P2: ["UNDEAD"] });
  const [startingMode, setStartingMode] = useState<PlayerId | "RANDOM">("RANDOM");
  const [startingPlayerId, setStartingPlayerId] = useState<PlayerId>("P1");
  const [entryMode, setEntryMode] = useState<EntryMode>("BATTLE");
  const [tutorialChapter, setTutorialChapter] = useState<TutorialChapter>("INFO");
  const [tutorialLevel, setTutorialLevel] = useState<TutorialLevel>(1);
  const [gameMode, setGameMode] = useState<GameMode>("LOCAL");
  const [spectatorViewMode, setSpectatorViewMode] = useState<SpectatorViewMode>("FOLLOW_ACTION");

  function startGame() {
    if (entryMode === "TUTORIAL") {
      const tutorialFaction: Faction = tutorialLevel === 3 ? "MACHINE" : "ALLIANCE";
      setResolvedFactions({ P1: tutorialFaction, P2: tutorialFaction });
      setResolvedDeckFactions({ P1: [tutorialFaction], P2: [tutorialFaction] });
      setStartingPlayerId("P1");
      setStarted(true);
      return;
    }
    if (entryMode === "CHAOS") {
      const deckFactions = { P1: randomChaosFactions(), P2: randomChaosFactions() } satisfies Record<PlayerId, Faction[]>;
      setResolvedDeckFactions(deckFactions);
      setResolvedFactions({ P1: deckFactions.P1[0], P2: deckFactions.P2[0] });
    } else {
      const factions = { P1: resolveFaction(p1Faction), P2: resolveFaction(p2Faction) };
      setResolvedFactions(factions);
      setResolvedDeckFactions({ P1: [factions.P1], P2: [factions.P2] });
    }
    setStartingPlayerId(startingMode === "RANDOM" ? (Math.random() < 0.5 ? "P1" : "P2") : startingMode);
    setStarted(true);
  }

  if (showCatalog) return <CardCatalog onBack={() => setShowCatalog(false)} />;
  if (showGlossary) return <Glossary onBack={() => setShowGlossary(false)} />;

  if (!started) {
    return (
      <main className="setup">
        <p className="eyebrow">戰記 · PHASE ONE</p><h1>瀏覽器灰盒 MVP</h1>
        <p>資料載入：龍族 40 · 不朽 40 · 機械 40 · 聯盟 40</p>
        <section className="config">
          <h2>已確認的起手規則</h2>
          <p>換牌先抽等量替換牌，再把換出的 0～4 張加入牌庫並洗牌。先手第一回合抽 1；後手第一回合抽 2 並獲得幸運幣；之後均抽 1。</p>
          <label>
            遊玩類型
            <select aria-label="遊玩類型" value={entryMode} onChange={(event) => setEntryMode(event.target.value as EntryMode)}>
              <option value="BATTLE">一般對戰</option>
              <option value="CHAOS">混沌模式</option>
              <option value="TUTORIAL">新手教學</option>
            </select>
          </label>
          {entryMode === "TUTORIAL" && <>
            <label>
              教學篇章
              <select aria-label="教學篇章" value={tutorialChapter} onChange={(event) => {
                const chapter = event.target.value as TutorialChapter;
                setTutorialChapter(chapter);
                setTutorialLevel(tutorialLevels[chapter][0].value);
              }}>
                <option value="INFO">資訊篇</option>
                <option value="COMBAT">戰鬥篇</option>
                <option value="EFFECT">效果篇</option>
                <option value="SPELL">法術篇</option>
              </select>
            </label>
            <label>
              教學關卡
              <select aria-label="教學關卡" value={tutorialLevel} onChange={(event) => setTutorialLevel(Number(event.target.value) as TutorialLevel)}>
                {tutorialLevels[tutorialChapter].map((level) => <option value={level.value} key={level.value}>{level.label}</option>)}
              </select>
            </label>
          </>}
          {entryMode === "CHAOS" && <p className="mode-description">雙方每場各自隨機取得兩副不同牌組，合併並洗牌後進行對戰。</p>}
          {entryMode !== "TUTORIAL" && <label>
            對戰模式
            <select aria-label="對戰模式" value={gameMode} onChange={(event) => setGameMode(event.target.value as GameMode)}>
              <option value="LOCAL">本機雙人</option>
              <option value="RANDOM_AI">簡單 AI（隨機）</option>
              <option value="HEURISTIC_AI">普通 AI（局面評分）</option>
              <option value="SEARCH_AI">困難 AI（有限搜尋）</option>
              <option value="WATCH_AI_HEURISTIC">AI vs AI 觀戰（困難）</option>
            </select>
          </label>}
          {entryMode !== "TUTORIAL" && gameMode === "WATCH_AI_HEURISTIC" && <label>
            觀戰視角
            <select aria-label="觀戰視角" value={spectatorViewMode} onChange={(event) => setSpectatorViewMode(event.target.value as SpectatorViewMode)}>
              <option value="FOLLOW_ACTION">雙方視角（跟著行動方）</option>
              <option value="FIXED">固定視角（預設 P1，可手動切換）</option>
            </select>
          </label>}
          {entryMode === "BATTLE" && <label>
            P1 玩家陣營
            <select aria-label="P1 玩家陣營" value={p1Faction} onChange={(event) => setP1Faction(event.target.value as FactionSelection)}>
              <option value="RANDOM">隨機陣營</option>
              {factionOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>}
          {entryMode === "BATTLE" && <label>
            P2 玩家陣營
            <select aria-label="P2 玩家陣營" value={p2Faction} onChange={(event) => setP2Faction(event.target.value as FactionSelection)}>
              <option value="RANDOM">隨機陣營</option>
              {factionOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>}
          {entryMode !== "TUTORIAL" && <label>
            先攻設定
            <select aria-label="先攻設定" value={startingMode} onChange={(event) => setStartingMode(event.target.value as PlayerId | "RANDOM")}>
              <option value="RANDOM">隨機先攻</option>
              <option value="P1">P1 先攻</option>
              <option value="P2">P2 先攻</option>
            </select>
          </label>}
          <div className="setup-actions">
            <button onClick={startGame}>{entryMode === "TUTORIAL" ? "開始教學" : entryMode === "CHAOS" ? "建立混沌對局" : "建立對局"}</button>
            <button className="quiet" onClick={() => setShowCatalog(true)}>查看卡表</button>
            <button className="quiet" onClick={() => setShowGlossary(true)}>專有名詞圖鑑</button>
          </div>
        </section>
      </main>
    );
  }
  const initialState = entryMode === "TUTORIAL"
    ? tutorialLevel === 1 ? createFirstTutorialGame()
      : tutorialLevel === 2 ? createSecondTutorialGame()
        : tutorialLevel === 3 ? createThirdTutorialGame()
          : tutorialLevel === 4 ? createFourthTutorialGame()
            : tutorialLevel === 5 ? createFifthTutorialGame()
              : tutorialLevel === 6 ? createSixthTutorialGame()
                : tutorialLevel === 7 ? createSeventhTutorialGame()
                  : createEighthTutorialGame()
    : createInitialGame({
    factions: resolvedFactions,
    deckFactions: resolvedDeckFactions,
    startingPlayerId,
  });
  const aiDifficulty: AiDifficulty | undefined = gameMode === "RANDOM_AI"
    ? "RANDOM"
    : gameMode === "HEURISTIC_AI"
      ? "HEURISTIC"
      : gameMode === "SEARCH_AI"
        ? "SEARCH"
        : undefined;
  const aiPlayers = gameMode === "WATCH_AI_HEURISTIC"
    ? { P1: "SEARCH", P2: "SEARCH" } satisfies Partial<Record<PlayerId, AiDifficulty>>
    : undefined;
  return <GameBoard key={gameKey} initialState={initialState} tutorialLevel={entryMode === "TUTORIAL" ? tutorialLevel : undefined} aiPlayers={aiPlayers} aiPlayerId={aiDifficulty ? "P2" : undefined} aiDifficulty={aiDifficulty} spectatorViewMode={spectatorViewMode} onRestart={() => { setGameKey((key) => key + 1); setStarted(false); }} />;
}
