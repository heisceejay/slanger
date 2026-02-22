import { useCallback } from "react";
import type { Language } from "../lib/api";
import { updateLanguage } from "../lib/api";

const WORD_ORDERS = ["SOV", "SVO", "VSO", "VOS", "OVS", "OSV", "free"] as const;
const ALIGNMENTS = [
  "nominative-accusative",
  "ergative-absolutive",
  "tripartite",
  "split-ergative",
  "active-stative",
] as const;
const HEADEDNESS = ["head-marking", "dependent-marking", "double-marking"] as const;
const ADPOSITION_TYPES = ["preposition", "postposition", "both", "none"] as const;
const CLAUSE_TYPE_OPTIONS = [
  "declarative",
  "polar-interrogative",
  "content-interrogative",
  "imperative",
  "relative",
  "complement",
  "conditional",
  "exclamative",
] as const;

const WORD_ORDER_DESC: Record<string, string> = {
  SOV: "Subject · Object · Verb — the most common word order globally (Turkish, Japanese, Hindi)",
  SVO: "Subject · Verb · Object — dominant in English, Mandarin, Romance languages",
  VSO: "Verb · Subject · Object — common in Celtic languages, Classical Arabic, Hebrew",
  VOS: "Verb · Object · Subject — found in Malagasy, some Mayan languages",
  OVS: "Object · Verb · Subject — rare; found in Hixkaryana and some Amazonian languages",
  OSV: "Object · Subject · Verb — extremely rare; found in some Tibeto-Burman languages",
  free: "Free word order — grammatical relations marked morphologically (Latin, Russian)",
};

const ALIGNMENT_DESC: Record<string, string> = {
  "nominative-accusative": "Subject of intransitive = subject of transitive; object is distinct (English, Latin)",
  "ergative-absolutive": "Subject of intransitive = object of transitive; agents are distinct (Basque, Dyirbal)",
  tripartite: "All three roles (S, A, O) marked distinctly — typologically rare",
  "split-ergative": "Ergative in some contexts, nominative-accusative in others",
  "active-stative": "Alignment varies based on verb semantics or animacy — split-intransitive",
};

export function SyntaxView({
  lang,
  onUpdated,
}: {
  lang: Language;
  onUpdated: (l: Language) => void;
}) {
  const syn = lang.syntax;

  const handleSyntaxChange = useCallback(
    (patch: Partial<Language["syntax"]>) => {
      const next = { ...syn, ...patch };
      const updated = updateLanguage(lang.meta.id, { syntax: next });
      if (updated) onUpdated(updated);
    },
    [lang.meta.id, syn, onUpdated]
  );

  const wordOrderParts = syn.wordOrder === "free"
    ? ["Free", "Word", "Order"]
    : syn.wordOrder.split("").map((l) =>
        l === "S" ? "Subject" : l === "V" ? "Verb" : "Object"
      );

  const toggleClauseType = (ct: string) => {
    const current = syn.clauseTypes.slice();
    const idx = current.indexOf(ct);
    if (idx >= 0) {
      if (current.length <= 1) return;
      current.splice(idx, 1);
    } else {
      current.push(ct);
      current.sort((a, b) => CLAUSE_TYPE_OPTIONS.indexOf(a as typeof CLAUSE_TYPE_OPTIONS[number]) - CLAUSE_TYPE_OPTIONS.indexOf(b as typeof CLAUSE_TYPE_OPTIONS[number]));
    }
    handleSyntaxChange({ clauseTypes: current });
  };

  return (
    <>
      <div className="view-header">
        <h1 className="view-title">Syntax</h1>
        <span className="view-subtitle">{syn.wordOrder} · {syn.alignment}</span>
      </div>

      <div className="view-body">
        <div className="grid-2 fade-up">
          {/* Word order — editable */}
          <div className="panel">
            <div className="panel-head"><span className="panel-title">Word Order</span></div>
            <div className="panel-body">
              <select
                value={syn.wordOrder}
                onChange={(e) => handleSyntaxChange({ wordOrder: e.target.value as Language["syntax"]["wordOrder"] })}
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  fontFamily: "var(--mono)",
                  fontSize: 14,
                  marginBottom: 12,
                  border: "1px solid var(--rule-heavy)",
                  background: "var(--paper)",
                  color: "var(--ink)",
                }}
              >
                {WORD_ORDERS.map((wo) => (
                  <option key={wo} value={wo}>{wo}</option>
                ))}
              </select>
              <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
                {wordOrderParts.map((part, i) => (
                  <div key={i}>
                    <div
                      style={{
                        background: "var(--ink)",
                        color: "var(--paper)",
                        padding: "12px 16px",
                        fontFamily: "var(--serif)",
                        fontStyle: "italic",
                        fontSize: 22,
                        minWidth: 60,
                        textAlign: "center",
                      }}
                    >
                      {part.charAt(0)}
                    </div>
                    <div style={{ fontSize: 8, textAlign: "center", marginTop: 4, opacity: 0.4, textTransform: "uppercase", letterSpacing: "0.1em" }}>
                      {part}
                    </div>
                  </div>
                ))}
              </div>
              <div style={{ fontSize: 11, lineHeight: 1.6, opacity: 0.6 }}>
                {WORD_ORDER_DESC[syn.wordOrder] ?? "Custom word order"}
              </div>
            </div>
          </div>

          {/* Alignment — editable */}
          <div className="panel">
            <div className="panel-head"><span className="panel-title">Morphosyntactic Alignment</span></div>
            <div className="panel-body">
              <select
                value={syn.alignment}
                onChange={(e) => handleSyntaxChange({ alignment: e.target.value })}
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  fontFamily: "var(--mono)",
                  fontSize: 14,
                  marginBottom: 12,
                  border: "1px solid var(--rule-heavy)",
                  background: "var(--paper)",
                  color: "var(--ink)",
                }}
              >
                {ALIGNMENTS.map((a) => (
                  <option key={a} value={a}>{a}</option>
                ))}
              </select>
              <div style={{ fontSize: 11, lineHeight: 1.6, opacity: 0.6 }}>
                {ALIGNMENT_DESC[syn.alignment] ?? "Custom alignment system"}
              </div>
            </div>
          </div>
        </div>

        <div className="grid-2 fade-up-1">
          {/* Clause types — editable */}
          <div className="panel">
            <div className="panel-head"><span className="panel-title">Clause Types</span></div>
            <div className="panel-body" style={{ padding: 0 }}>
              {CLAUSE_TYPE_OPTIONS.map((ct) => {
                const active = syn.clauseTypes.includes(ct);
                return (
                  <div
                    key={ct}
                    onClick={() => toggleClauseType(ct)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => e.key === "Enter" && toggleClauseType(ct)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "12px 16px",
                      borderBottom: "1px solid var(--rule)",
                      cursor: "pointer",
                      background: active ? "rgba(0,0,0,0.04)" : "transparent",
                    }}
                  >
                    <span style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.08em" }}>{ct}</span>
                    <span style={{ fontFamily: "var(--mono)", fontSize: 14, opacity: active ? 0.8 : 0.3 }}>
                      {active ? "✓" : "—"}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Headedness & Adposition — editable */}
          <div className="panel">
            <div className="panel-head"><span className="panel-title">Properties</span></div>
            <div className="panel-body">
              <div className="field" style={{ marginBottom: 16 }}>
                <label style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: "0.1em", opacity: 0.5 }}>Headedness</label>
                <select
                  value={syn.headedness}
                  onChange={(e) => handleSyntaxChange({ headedness: e.target.value })}
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    fontFamily: "var(--mono)",
                    fontSize: 12,
                    border: "1px solid var(--rule-heavy)",
                    background: "var(--paper)",
                    color: "var(--ink)",
                  }}
                >
                  {HEADEDNESS.map((h) => (
                    <option key={h} value={h}>{h}</option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: "0.1em", opacity: 0.5 }}>Adposition type</label>
                <select
                  value={syn.adpositionType}
                  onChange={(e) => handleSyntaxChange({ adpositionType: e.target.value as Language["syntax"]["adpositionType"] })}
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    fontFamily: "var(--mono)",
                    fontSize: 12,
                    border: "1px solid var(--rule-heavy)",
                    background: "var(--paper)",
                    color: "var(--ink)",
                  }}
                >
                  {ADPOSITION_TYPES.map((a) => (
                    <option key={a} value={a}>{a}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        </div>

        {/* Phrase structure — read-only display (structure is complex to edit inline) */}
        <div className="panel mt16 fade-up-2">
          <div className="panel-head"><span className="panel-title">Phrase Structure Rules</span></div>
          <div className="panel-body">
            {Object.keys(syn.phraseStructure).length === 0 ? (
              <div className="muted small">No phrase structure defined</div>
            ) : (
              <div style={{ fontFamily: "var(--mono)", fontSize: 13, lineHeight: 2.4 }}>
                {Object.entries(syn.phraseStructure).map(([cat, constituents]) => (
                  <div key={cat} style={{ display: "flex", gap: 16, alignItems: "baseline" }}>
                    <span style={{ fontStyle: "italic", minWidth: 32, color: "var(--ink)", fontWeight: 700 }}>{cat}</span>
                    <span style={{ opacity: 0.4 }}>→</span>
                    <span>
                      {(constituents as Array<{ label: string; optional?: boolean; repeatable?: boolean }>).map((c, i) => (
                        <span key={i}>
                          {i > 0 && " "}
                          <span
                            style={{
                              fontStyle: c.optional ? "italic" : "normal",
                              opacity: c.optional ? 0.6 : 1,
                            }}
                          >
                            {c.optional ? `(${c.label})` : c.label}
                            {c.repeatable ? "⁺" : ""}
                          </span>
                        </span>
                      ))}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Sample sentence structure */}
        {lang.lexicon.length > 0 && (
          <div className="panel mt16 fade-up-3">
            <div className="panel-head"><span className="panel-title">Sample Structure</span></div>
            <div className="panel-body">
              <div style={{ display: "flex", gap: 24, alignItems: "flex-start" }}>
                {syn.wordOrder === "free" ? (
                  <div style={{ fontFamily: "var(--serif)", fontStyle: "italic", fontSize: 16, opacity: 0.7 }}>
                    Free word order — structure depends on morphology
                  </div>
                ) : (
                  syn.wordOrder.split("").map((role, i) => {
                    const noun = lang.lexicon.find((e) => e.pos === "noun");
                    const verb = lang.lexicon.find((e) => e.pos === "verb");
                    const entry = role === "V" ? verb : noun;
                    const gloss = role === "S" ? "SUBJ" : role === "O" ? "OBJ" : "VERB";
                    return (
                      <div key={i} style={{ textAlign: "center" }}>
                        <div style={{ fontFamily: "var(--mono)", fontSize: 18, fontStyle: "italic", marginBottom: 4 }}>
                          {entry?.orthographicForm ?? `[${role}]`}
                        </div>
                        <div style={{ fontSize: 9, letterSpacing: "0.12em", textTransform: "uppercase", opacity: 0.5 }}>
                          {gloss}
                        </div>
                        <div style={{ fontSize: 10, opacity: 0.4, marginTop: 2 }}>
                          {entry?.glosses[0] ?? "—"}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
