import { useState } from "react";
import type { Faction } from "../game/cards/cardTypes";
import { createInitialGame } from "../game/state/createInitialGame";
import { GameBoard } from "../ui/GameBoard";

const factionOptions: { value: Faction; label: string }[] = [
  { value: "DRAGON", label: "龙族（40 张）" },
  { value: "UNDEAD", label: "不朽者（40 张）" },
  { value: "MACHINE", label: "机械（40 张）" },
  { value: "ALLIANCE", label: "联盟（35 张）" },
];

export default function App() {
  const [gameKey, setGameKey] = useState(0);
  const [started, setStarted] = useState(false);
  const [firstFaction, setFirstFaction] = useState<Faction>("DRAGON");
  const [secondFaction, setSecondFaction] = useState<Faction>("UNDEAD");

  if (!started) {
    return (
      <main className="setup">
        <p className="eyebrow">戰記 · PHASE ONE</p><h1>浏览器灰盒 MVP</h1>
        <p>资料载入：龙族 40 · 不朽者 40 · 机械 40 · 联盟 35（不会补齐 5 张缺牌）</p>
        <section className="config">
          <h2>已确认的起手规则</h2>
          <p>换牌先抽等量替换牌，再把换出的 0～4 张加入牌库并洗牌。先手第一回合抽 1；后手第一回合抽 2 并获得幸運幣；之后均抽 1。</p>
          <label>
            先攻玩家阵营
            <select aria-label="先攻玩家阵营" value={firstFaction} onChange={(event) => setFirstFaction(event.target.value as Faction)}>
              {factionOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>
          <label>
            后攻玩家阵营
            <select aria-label="后攻玩家阵营" value={secondFaction} onChange={(event) => setSecondFaction(event.target.value as Faction)}>
              {factionOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>
          <button onClick={() => setStarted(true)}>建立对局</button>
        </section>
      </main>
    );
  }
  const initialState = createInitialGame({
    seed: 20260822 + gameKey,
    factions: { P1: firstFaction, P2: secondFaction },
  });
  return <GameBoard key={gameKey} initialState={initialState} onRestart={() => { setGameKey((key) => key + 1); setStarted(false); }} />;
}
