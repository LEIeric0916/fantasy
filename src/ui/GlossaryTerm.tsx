import { useState } from "react";
import type { Keyword } from "../game/cards/cardTypes";
import { findGlossaryTerm, getGlossaryTermByKeyword, GLOSSARY_MATCH_LABELS, type GlossaryTerm } from "../game/rules/glossary";

export function GlossaryTermButton({ term, className = "", onOpen }: { term: GlossaryTerm; className?: string; onOpen?: (label: string) => void }) {
  const [open, setOpen] = useState(false);
  return <span className={`glossary-term-wrap ${className}`}>
    <button type="button" className="glossary-term-button" aria-expanded={open} onClick={(event) => { event.stopPropagation(); setOpen((value) => !value); if (!open) onOpen?.(term.label); }}>{term.label}</button>
    {open && <span className="glossary-term-popover" role="dialog" aria-label={`${term.label}規則提示`} onClick={(event) => event.stopPropagation()}>
      <button type="button" className="glossary-popover-close" aria-label={`關閉${term.label}規則提示`} onClick={() => setOpen(false)}>×</button>
      <small>{term.category}</small><strong>{term.label}</strong><span>{term.summary}</span><em>{term.rules}</em>
    </span>}
  </span>;
}

export function KeywordGlossaryButton({ keyword, onOpen, highlighted = false }: { keyword: Keyword; onOpen?: (keyword: Keyword) => void; highlighted?: boolean }) {
  return <GlossaryTermButton term={getGlossaryTermByKeyword(keyword)} onOpen={() => onOpen?.(keyword)} className={`effect-keyword keyword-${keyword.toLowerCase().replaceAll("_", "-")} ${highlighted ? "tutorial-keyword-target" : ""}`} />;
}

export function GlossaryText({ text }: { text: string }) {
  const pattern = new RegExp(`(${GLOSSARY_MATCH_LABELS.map(escapeRegExp).join("|")})`, "g");
  return <>{text.split(pattern).map((part, index) => {
    const term = findGlossaryTerm(part);
    return term ? <GlossaryTermButton term={term} className="inline-glossary-term" key={`${part}-${index}`} /> : part;
  })}</>;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
