import { useMemo, useState } from "react";
import { GLOSSARY_CATEGORIES, GLOSSARY_TERMS, type GlossaryCategory } from "../game/rules/glossary";

export function Glossary({ onBack }: { onBack: () => void }) {
  const [category, setCategory] = useState<GlossaryCategory | "ALL">("ALL");
  const [query, setQuery] = useState("");
  const terms = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("zh-Hant");
    return GLOSSARY_TERMS.filter((term) => category === "ALL" || term.category === category)
      .filter((term) => !normalized || [term.label, term.summary, term.rules, ...(term.aliases ?? [])].join(" ").toLocaleLowerCase("zh-Hant").includes(normalized));
  }, [category, query]);

  return <main className="glossary-page">
    <header className="catalog-header"><div><p className="eyebrow">戰記 · RULE GLOSSARY</p><h1>專有名詞圖鑑</h1><p>目前遊戲使用的關鍵字、區域、資源與牌組機制。</p></div><button className="quiet" onClick={onBack}>返回起始頁面</button></header>
    <section className="glossary-controls" aria-label="專有名詞篩選">
      <label>搜尋規則<input aria-label="搜尋專有名詞" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="名稱或規則內容" /></label>
      <div className="glossary-category-tabs"><button className={category === "ALL" ? "selected" : ""} onClick={() => setCategory("ALL")}>全部</button>{GLOSSARY_CATEGORIES.map((item) => <button className={category === item ? "selected" : ""} onClick={() => setCategory(item)} key={item}>{item}</button>)}</div>
    </section>
    <p className="catalog-summary">顯示 <strong>{terms.length}</strong> 個專有名詞</p>
    <section className="glossary-grid">{terms.map((term) => <article className="glossary-entry" id={term.id} key={term.id}><small>{term.category}</small><h2>{term.label}</h2><p>{term.summary}</p><div><strong>詳細規則</strong><p>{term.rules}</p></div>{term.aliases?.length ? <em>其他名稱：{term.aliases.join("、")}</em> : null}</article>)}</section>
  </main>;
}
