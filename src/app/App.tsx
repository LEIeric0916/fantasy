import { useState } from "react";
import type { AiDifficulty } from "../game/ai/aiPolicy";
import type { Faction } from "../game/cards/cardTypes";
import { createInitialGame } from "../game/state/createInitialGame";
import { GameBoard } from "../ui/GameBoard";

const factionOptions: { value: Faction; label: string }[] = [
  { value: "DRAGON", label: "龍族（40 張）" },
  { value: "UNDEAD", label: "不朽者（40 張）" },
  { value: "MACHINE", label: "機械（40 張）" },
  { value: "ALLIANCE", label: "聯盟（35 張）" },
];

export default function App() {
  const [gameKey, setGameKey] = useState(0);
  const [started, setStarted] = useState(false);
  const [firstFaction, setFirstFaction] = useState<Faction>("DRAGON");
  const [secondFaction, setSecondFaction] = useState<Faction>("UNDEAD");
  const [gameMode, setGameMode] = useState<"LOCAL" | "RANDOM_AI" | "HEURISTIC_AI" | "SEARCH_AI">("LOCAL");

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
            <select aria-label="對戰模式" value={gameMode} onChange={(event) => setGameMode(event.target.value as typeof gameMode)}>
              <option value="LOCAL">本機雙人</option>
              <option value="RANDOM_AI">簡單 AI（隨機）</option>
              <option value="HEURISTIC_AI">普通 AI（局面評分）</option>
              <option value="SEARCH_AI">困難 AI（有限搜尋）</option>
            </select>
          </label>
          <label>
            先攻玩家陣營
            <select aria-label="先攻玩家陣營" value={firstFaction} onChange={(event) => setFirstFaction(event.target.value as Faction)}>
              {factionOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>
          <label>
            後攻玩家陣營
            <select aria-label="後攻玩家陣營" value={secondFaction} onChange={(event) => setSecondFaction(event.target.value as Faction)}>
              {factionOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>
          <button onClick={() => setStarted(true)}>建立對局</button>
        </section>
      </main>
    );
  }
  const initialState = createInitialGame({
    factions: { P1: firstFaction, P2: secondFaction },
  });
  const aiDifficulty: AiDifficulty | undefined = gameMode === "RANDOM_AI"
    ? "RANDOM"
    : gameMode === "HEURISTIC_AI"
      ? "HEURISTIC"
      : gameMode === "SEARCH_AI"
        ? "SEARCH"
        : undefined;
  return <GameBoard key={gameKey} initialState={initialState} aiPlayerId={aiDifficulty ? "P2" : undefined} aiDifficulty={aiDifficulty} onRestart={() => { setGameKey((key) => key + 1); setStarted(false); }} />;
}
