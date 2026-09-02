import { useState } from "react";
import type { AiDifficulty } from "../game/ai/aiPolicy";
import type { Faction, PlayerId } from "../game/cards/cardTypes";
import { createFirstTutorialGame, createInitialGame } from "../game/state/createInitialGame";
import { CardCatalog } from "../ui/CardCatalog";
import { GameBoard } from "../ui/GameBoard";

const factionOptions: { value: Faction; label: string }[] = [
  { value: "DRAGON", label: "龍族（40 張）" },
  { value: "UNDEAD", label: "不朽者（40 張）" },
  { value: "MACHINE", label: "機械（40 張）" },
  { value: "ALLIANCE", label: "聯盟（35 張）" },
];

type GameMode = "LOCAL" | "TUTORIAL" | "RANDOM_AI" | "HEURISTIC_AI" | "SEARCH_AI" | "WATCH_AI_HEURISTIC";
type SpectatorViewMode = "FOLLOW_ACTION" | "FIXED";
type FactionSelection = Faction | "RANDOM";

function resolveFaction(selection: FactionSelection): Faction {
  if (selection !== "RANDOM") return selection;
  return factionOptions[Math.floor(Math.random() * factionOptions.length)].value;
}

export default function App() {
  const [gameKey, setGameKey] = useState(0);
  const [started, setStarted] = useState(false);
  const [showCatalog, setShowCatalog] = useState(false);
  const [p1Faction, setP1Faction] = useState<FactionSelection>("DRAGON");
  const [p2Faction, setP2Faction] = useState<FactionSelection>("UNDEAD");
  const [resolvedFactions, setResolvedFactions] = useState<Record<PlayerId, Faction>>({ P1: "DRAGON", P2: "UNDEAD" });
  const [startingMode, setStartingMode] = useState<PlayerId | "RANDOM">("RANDOM");
  const [startingPlayerId, setStartingPlayerId] = useState<PlayerId>("P1");
  const [gameMode, setGameMode] = useState<GameMode>("LOCAL");
  const [spectatorViewMode, setSpectatorViewMode] = useState<SpectatorViewMode>("FOLLOW_ACTION");

  function startGame() {
    if (gameMode === "TUTORIAL") {
      setResolvedFactions({ P1: "ALLIANCE", P2: "ALLIANCE" });
      setStartingPlayerId("P1");
      setStarted(true);
      return;
    }
    setResolvedFactions({ P1: resolveFaction(p1Faction), P2: resolveFaction(p2Faction) });
    setStartingPlayerId(startingMode === "RANDOM" ? (Math.random() < 0.5 ? "P1" : "P2") : startingMode);
    setStarted(true);
  }

  if (showCatalog) return <CardCatalog onBack={() => setShowCatalog(false)} />;

  if (!started) {
    return (
      <main className="setup">
        <p className="eyebrow">戰記 · PHASE ONE</p><h1>瀏覽器灰盒 MVP</h1>
        <p>資料載入：龍族 40 · 不朽者 40 · 機械 40 · 聯盟 35（不會補齊 5 張缺牌）</p>
        <section className="config">
          <h2>已確認的起手規則</h2>
          <p>換牌先抽等量替換牌，再把換出的 0～4 張加入牌庫並洗牌。先手第一回合抽 1；後手第一回合抽 2 並獲得幸運幣；之後均抽 1。</p>
          <label>
            對戰模式
            <select aria-label="對戰模式" value={gameMode} onChange={(event) => setGameMode(event.target.value as GameMode)}>
              <option value="LOCAL">本機雙人</option>
              <option value="TUTORIAL">新手教學・第一關（遊戲介面與出牌）</option>
              <option value="RANDOM_AI">簡單 AI（隨機）</option>
              <option value="HEURISTIC_AI">普通 AI（局面評分）</option>
              <option value="SEARCH_AI">困難 AI（有限搜尋）</option>
              <option value="WATCH_AI_HEURISTIC">AI vs AI 觀戰（困難）</option>
            </select>
          </label>
          {gameMode === "WATCH_AI_HEURISTIC" && <label>
            觀戰視角
            <select aria-label="觀戰視角" value={spectatorViewMode} onChange={(event) => setSpectatorViewMode(event.target.value as SpectatorViewMode)}>
              <option value="FOLLOW_ACTION">雙方視角（跟著行動方）</option>
              <option value="FIXED">固定視角（預設 P1，可手動切換）</option>
            </select>
          </label>}
          {gameMode !== "TUTORIAL" && <label>
            P1 玩家陣營
            <select aria-label="P1 玩家陣營" value={p1Faction} onChange={(event) => setP1Faction(event.target.value as FactionSelection)}>
              <option value="RANDOM">隨機陣營</option>
              {factionOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>}
          {gameMode !== "TUTORIAL" && <label>
            P2 玩家陣營
            <select aria-label="P2 玩家陣營" value={p2Faction} onChange={(event) => setP2Faction(event.target.value as FactionSelection)}>
              <option value="RANDOM">隨機陣營</option>
              {factionOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>}
          {gameMode !== "TUTORIAL" && <label>
            先攻設定
            <select aria-label="先攻設定" value={startingMode} onChange={(event) => setStartingMode(event.target.value as PlayerId | "RANDOM")}>
              <option value="RANDOM">隨機先攻</option>
              <option value="P1">P1 先攻</option>
              <option value="P2">P2 先攻</option>
            </select>
          </label>}
          <div className="setup-actions">
            <button onClick={startGame}>建立對局</button>
            <button className="quiet" onClick={() => setShowCatalog(true)}>查看卡表</button>
          </div>
        </section>
      </main>
    );
  }
  const initialState = gameMode === "TUTORIAL" ? createFirstTutorialGame() : createInitialGame({
    factions: resolvedFactions,
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
  return <GameBoard key={gameKey} initialState={initialState} tutorialLevel={gameMode === "TUTORIAL" ? 1 : undefined} aiPlayers={aiPlayers} aiPlayerId={aiDifficulty ? "P2" : undefined} aiDifficulty={aiDifficulty} spectatorViewMode={spectatorViewMode} onRestart={() => { setGameKey((key) => key + 1); setStarted(false); }} />;
}
