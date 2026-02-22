import { useState, useCallback } from "react";
import type { Language } from "../lib/api";
import { fillParadigms, updateLanguage } from "../lib/api";

const TYPOLOGIES = ["analytic", "agglutinative", "fusional", "polysynthetic", "mixed"] as const;
const CATEGORY_OPTIONS = [
  "case",
  "number",
  "gender",
  "animacy",
  "tense",
  "aspect",
  "mood",
  "evidentiality",
  "person",
  "polarity",
  "definiteness",
  "nounClass",
  "mirativity",
] as const;
const POS_LIST = ["noun", "verb", "adjective", "adverb", "particle", "pronoun", "numeral", "other"] as const;

type MorphologyConfig = Language["morphology"];

/** Infer 2D grid from paradigm keys: "row.col" → rows × cols; else 1D (rows × 1) */
function paradigmToGrid(paradigm: Record<string, string>): { rows: string[]; cols: string[]; get: (row: string, col: string) => string; keys: string[] } {
  const keys = Object.keys(paradigm);
  const hasCompound = keys.some((k) => k.includes("."));
  if (!hasCompound) {
    return {
      rows: keys,
      cols: [""],
      get: (row) => paradigm[row] ?? "",
      keys,
    };
  }
  const rowSet = new Set<string>();
  const colSet = new Set<string>();
  for (const k of keys) {
    const [r, c] = k.split(".");
    if (r) rowSet.add(r);
    if (c) colSet.add(c);
  }
  const rows = [...rowSet].sort();
  const cols = [...colSet].sort();
  return {
    rows,
    cols,
    get: (row, col) => paradigm[col ? `${row}.${col}` : row] ?? paradigm[row] ?? "",
    keys,
  };
}

export function MorphologyView({
  lang,
  onUpdated,
}: {
  lang: Language;
  onUpdated: (l: Language) => void;
}) {
  const morph = lang.morphology;
  const [filling, setFilling] = useState(false);
  const [rationale, setRationale] = useState("");
  const [error, setError] = useState("");
  const [selectedParadigm, setSelectedParadigm] = useState<string | null>(
    Object.keys(morph.paradigms)[0] ?? null
  );
  const [editingCell, setEditingCell] = useState<{ paradigm: string; key: string } | null>(null);

  const handleMorphChange = useCallback(
    (patch: Partial<MorphologyConfig>) => {
      const next = { ...morph, ...patch };
      const updated = updateLanguage(lang.meta.id, { morphology: next });
      if (updated) onUpdated(updated);
    },
    [lang.meta.id, morph, onUpdated]
  );

  async function handleFill() {
    setFilling(true);
    setError("");
    setRationale("");
    try {
      const { language, rationale: r } = await fillParadigms(lang);
      onUpdated(language);
      setRationale(r);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setFilling(false);
    }
  }

  // ─── Coverage: per-POS categories defined vs empty ─────────────────────────
  const posWithEntries = new Set(lang.lexicon.map((e) => e.pos));
  const coverage = POS_LIST.filter((pos) => posWithEntries.has(pos) || morph.categories[pos]?.length).map((pos) => ({
    pos,
    categories: CATEGORY_OPTIONS.map((cat) => ({
      name: cat,
      defined: morph.categories[pos]?.includes(cat) ?? false,
    })),
  }));

  // ─── Paradigm grid edit ───────────────────────────────────────────────────
  function setParadigmCell(paradigmId: string, key: string, value: string) {
    const nextParadigms = { ...morph.paradigms };
    if (!nextParadigms[paradigmId]) nextParadigms[paradigmId] = {};
    nextParadigms[paradigmId] = { ...nextParadigms[paradigmId], [key]: value };
    handleMorphChange({ paradigms: nextParadigms });
    setEditingCell(null);
  }

  const paradigmKeys = Object.keys(morph.paradigms);
  const activeParadigm = selectedParadigm ? morph.paradigms[selectedParadigm] : null;
  const grid = activeParadigm ? paradigmToGrid(activeParadigm) : null;

  // ─── Categories: add/remove ────────────────────────────────────────────────
  function addCategory(pos: string, cat: string) {
    const cats = morph.categories[pos] ?? [];
    if (cats.includes(cat)) return;
    handleMorphChange({
      categories: { ...morph.categories, [pos]: [...cats, cat] },
    });
  }
  function removeCategory(pos: string, cat: string) {
    const cats = (morph.categories[pos] ?? []).filter((c) => c !== cat);
    handleMorphChange({
      categories: { ...morph.categories, [pos]: cats },
    });
  }

  // ─── Morpheme order: move slot ─────────────────────────────────────────────
  function moveSlot(index: number, dir: 1 | -1) {
    const order = [...morph.morphemeOrder];
    const ni = index + dir;
    if (ni < 0 || ni >= order.length) return;
    [order[index], order[ni]] = [order[ni]!, order[index]!];
    handleMorphChange({ morphemeOrder: order });
  }

  // ─── Derivational: live example from lexicon ───────────────────────────────
  function getDerivExample(rule: { sourcePos: string; targetPos: string; affix: string; affixType: string }) {
    const entry = lang.lexicon.find((e) => e.pos === rule.sourcePos);
    if (!entry) return null;
    const baseOrth = entry.orthographicForm;
    const baseIpa = (entry.phonologicalForm ?? "").replace(/^\/|\/$/g, "");
    const isSuffix = rule.affixType === "suffix" || (rule.affix.startsWith("-") && !rule.affix.endsWith("-"));
    const affixStr = rule.affix.replace(/^-|-$/g, "");
    const derivedOrth = isSuffix ? baseOrth + affixStr : affixStr + baseOrth;
    const ruleId = (rule as { id?: string }).id;
    const derivedForm = ruleId
      ? (entry.derivedForms as { ruleId?: string; orthographicForm?: string; phonologicalForm?: string }[]).find(
          (d) => d.ruleId === ruleId
        )
      : undefined;
    return {
      baseOrth,
      baseIpa,
      derivedOrth: derivedForm?.orthographicForm ?? derivedOrth,
      derivedIpa: derivedForm?.phonologicalForm?.replace(/^\/|\/$/g, "") ?? baseIpa + (isSuffix ? affixStr : ""),
      affixStr,
      isSuffix,
    };
  }

  // ─── Alternation: before/after from lexicon ────────────────────────────────
  function getAlternationExample(rule: { input?: string; output?: string; trigger?: string }) {
    const input = rule.input ?? (rule as { pattern?: string }).pattern?.split("→")[0]?.trim();
    const output = rule.output ?? (rule as { pattern?: string }).pattern?.split("→")[1]?.trim();
    if (!input || !output) return null;
    const entry = lang.lexicon.find((e) => {
      const ipa = (e.phonologicalForm ?? "").replace(/^\/|\/$/g, "");
      return ipa.includes(input);
    });
    if (!entry) return null;
    const ipa = (entry.phonologicalForm ?? "").replace(/^\/|\/$/g, "");
    const before = entry.orthographicForm;
    const afterIpa = ipa.replace(new RegExp(input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g"), output);
    return { before, afterIpa, beforeIpa: ipa };
  }

  return (
    <>
      <div className="view-header">
        <h1 className="view-title">Morphology</h1>
        <span className="view-subtitle">{morph.typology}</span>
        <div style={{ marginLeft: "auto", display: "flex", gap: 10, alignItems: "center" }}>
          <select
            value={morph.typology}
            onChange={(e) => handleMorphChange({ typology: e.target.value as MorphologyConfig["typology"] })}
            style={{
              padding: "8px 12px",
              fontFamily: "var(--mono)",
              fontSize: 12,
              border: "1px solid var(--rule-heavy)",
              background: "var(--paper)",
              color: "var(--ink)",
            }}
          >
            {TYPOLOGIES.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
          <button className="btn" onClick={handleFill} disabled={filling}>
            {filling ? <span className="spinner" /> : "⊛"}
            AI Fill Paradigms
          </button>
        </div>
      </div>

      <div className="view-body">
        {error && <div style={{ color: "var(--error)", fontSize: 11, marginBottom: 16 }}>{error}</div>}
        {rationale && (
          <div className="panel mb16">
            <div className="panel-body">
              <div className="muted small mb8" style={{ letterSpacing: "0.1em", textTransform: "uppercase" }}>AI Rationale</div>
              <div style={{ fontSize: 12, lineHeight: 1.7, opacity: 0.8 }}>{rationale}</div>
            </div>
          </div>
        )}

        {/* Coverage indicator */}
        <div className="panel mb16">
          <div className="panel-head"><span className="panel-title">Category coverage</span></div>
          <div className="panel-body">
            <div style={{ display: "flex", flexWrap: "wrap", gap: 16 }}>
              {coverage.map(({ pos, categories }) => (
                <div key={pos} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: "0.08em", opacity: 0.7, minWidth: 48 }}>{pos}</span>
                  <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                    {categories.map(({ name, defined }) => (
                      <span
                        key={name}
                        title={`${name}: ${defined ? "defined" : "not set"}`}
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: "50%",
                          background: defined ? "var(--ink)" : "transparent",
                          border: "1px solid var(--rule-heavy)",
                        }}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Morpheme order slot diagram */}
        <div className="panel mb16">
          <div className="panel-head"><span className="panel-title">Morpheme order</span></div>
          <div className="panel-body">
            <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
              {morph.morphemeOrder.map((slot, i) => (
                <div
                  key={`${slot}-${i}`}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                  }}
                >
                  <div
                    style={{
                      padding: "8px 14px",
                      border: "1px solid var(--rule-heavy)",
                      fontFamily: "var(--mono)",
                      fontSize: 12,
                      background: "var(--paper)",
                    }}
                  >
                    {slot}
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
                    <button
                      type="button"
                      onClick={() => moveSlot(i, -1)}
                      disabled={i === 0}
                      style={{
                        padding: "2px 6px",
                        border: "1px solid var(--rule)",
                        background: "transparent",
                        cursor: i === 0 ? "not-allowed" : "pointer",
                        opacity: i === 0 ? 0.4 : 1,
                        fontSize: 10,
                      }}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      onClick={() => moveSlot(i, 1)}
                      disabled={i === morph.morphemeOrder.length - 1}
                      style={{
                        padding: "2px 6px",
                        border: "1px solid var(--rule)",
                        background: "transparent",
                        cursor: i === morph.morphemeOrder.length - 1 ? "not-allowed" : "pointer",
                        opacity: i === morph.morphemeOrder.length - 1 ? 0.4 : 1,
                        fontSize: 10,
                      }}
                    >
                      ↓
                    </button>
                  </div>
                  {i < morph.morphemeOrder.length - 1 && (
                    <span style={{ opacity: 0.3, fontSize: 12 }}>→</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Categories per POS */}
        <div className="panel mb16">
          <div className="panel-head"><span className="panel-title">Grammatical categories</span></div>
          <div className="panel-body" style={{ padding: 0 }}>
            {POS_LIST.map((pos) => {
              const cats = morph.categories[pos] ?? [];
              return (
                <div key={pos} style={{ padding: "12px 16px", borderBottom: "1px solid var(--rule)" }}>
                  <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                    <span style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: "0.1em", opacity: 0.5, minWidth: 56 }}>{pos}</span>
                    {cats.map((c) => (
                      <span
                        key={c}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 4,
                          padding: "4px 8px",
                          border: "1px solid var(--rule-heavy)",
                          fontSize: 11,
                          fontFamily: "var(--mono)",
                        }}
                      >
                        {c}
                        <button
                          type="button"
                          onClick={() => removeCategory(pos, c)}
                          style={{
                            background: "none",
                            border: "none",
                            cursor: "pointer",
                            padding: 0,
                            lineHeight: 1,
                            opacity: 0.6,
                            fontSize: 12,
                          }}
                        >
                          ×
                        </button>
                      </span>
                    ))}
                    <select
                      value=""
                      onChange={(e) => {
                        const v = e.target.value;
                        if (v) addCategory(pos, v);
                        e.target.value = "";
                      }}
                      style={{
                        padding: "4px 8px",
                        fontSize: 10,
                        fontFamily: "var(--mono)",
                        border: "1px solid var(--rule)",
                        background: "var(--paper)",
                      }}
                    >
                      <option value="">+ add</option>
                      {CATEGORY_OPTIONS.filter((c) => !cats.includes(c)).map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Paradigm tables */}
        <div className="panel mb16">
          <div className="panel-head">
            <span className="panel-title">Paradigm tables</span>
            {paradigmKeys.length > 0 && (
              <span className="muted small" style={{ marginLeft: 8 }}>
                {paradigmKeys.length} paradigm{paradigmKeys.length !== 1 ? "s" : ""}
              </span>
            )}
          </div>
          <div className="panel-body">
            {paradigmKeys.length === 0 ? (
              <div className="muted small">No paradigms defined. Use AI Fill Paradigms to generate them.</div>
            ) : (
              <>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 16 }}>
                  {paradigmKeys.map((k) => (
                    <button
                      key={k}
                      onClick={() => setSelectedParadigm(k)}
                      style={{
                        fontFamily: "var(--mono)",
                        fontSize: 9,
                        letterSpacing: "0.1em",
                        textTransform: "uppercase",
                        padding: "4px 10px",
                        border: "1px solid",
                        borderColor: selectedParadigm === k ? "var(--ink)" : "var(--rule-heavy)",
                        background: selectedParadigm === k ? "var(--ink)" : "transparent",
                        color: selectedParadigm === k ? "var(--paper)" : "var(--ink)",
                        cursor: "pointer",
                      }}
                    >
                      {k}
                    </button>
                  ))}
                </div>

                {grid && selectedParadigm && (
                  <div style={{ overflowX: "auto" }}>
                    <table className="tbl tbl-mono" style={{ minWidth: 280 }}>
                      <thead>
                        <tr>
                          <th style={{ fontSize: 9, textTransform: "uppercase", opacity: 0.6 }}></th>
                          {grid.cols.map((c) => (
                            <th key={c} style={{ fontSize: 10, padding: "6px 8px" }}>
                              {c || "—"}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {grid.rows.map((row) => (
                          <tr key={row}>
                            <td style={{ fontSize: 10, opacity: 0.7, padding: "6px 8px", whiteSpace: "nowrap" }}>
                              {row}
                            </td>
                            {grid.cols.map((col) => {
                              const key = col ? `${row}.${col}` : row;
                              const val = grid.get(row, col);
                              const isEditing = editingCell?.paradigm === selectedParadigm && editingCell?.key === key;
                              return (
                                <td key={col || "x"} style={{ padding: 2 }}>
                                  {isEditing ? (
                                    <input
                                      autoFocus
                                      defaultValue={val}
                                      onBlur={(e) => setParadigmCell(selectedParadigm, key, e.target.value.trim())}
                                      onKeyDown={(e) => {
                                        if (e.key === "Enter") {
                                          setParadigmCell(selectedParadigm, key, (e.target as HTMLInputElement).value.trim());
                                        }
                                        if (e.key === "Escape") setEditingCell(null);
                                      }}
                                      style={{
                                        width: "100%",
                                        minWidth: 48,
                                        padding: "4px 6px",
                                        fontFamily: "var(--mono)",
                                        fontSize: 13,
                                        border: "1px solid var(--ink)",
                                      }}
                                    />
                                  ) : (
                                    <div
                                      role="button"
                                      tabIndex={0}
                                      onClick={() => setEditingCell({ paradigm: selectedParadigm, key })}
                                      onKeyDown={(e) => e.key === "Enter" && setEditingCell({ paradigm: selectedParadigm, key })}
                                      style={{
                                        padding: "6px 8px",
                                        minHeight: 28,
                                        border: "1px solid var(--rule)",
                                        cursor: "pointer",
                                        fontStyle: "italic",
                                      }}
                                    >
                                      {val || "∅"}
                                    </div>
                                  )}
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* Derivational rules with live examples */}
        {morph.derivationalRules.length > 0 && (
          <div className="panel mb16">
            <div className="panel-head"><span className="panel-title">Derivational rules</span></div>
            <div className="panel-body" style={{ padding: 0 }}>
              {morph.derivationalRules.map((r) => {
                const ex = getDerivExample(r);
                return (
                  <div
                    key={r.id}
                    style={{
                      padding: "12px 16px",
                      borderBottom: "1px solid var(--rule)",
                    }}
                  >
                    <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 4 }}>{r.label}</div>
                    <div style={{ fontSize: 11, opacity: 0.7, marginBottom: 6 }}>
                      {r.sourcePos} → {r.targetPos} · {r.affixType}: {r.affix}
                    </div>
                    {ex && (
                      <div style={{ fontFamily: "var(--mono)", fontSize: 13, fontStyle: "italic" }}>
                        <span>{ex.baseOrth}</span>
                        <span style={{ opacity: 0.5 }}> + {ex.affixStr} </span>
                        <span style={{ opacity: 0.6 }}>→</span>
                        <span style={{ marginLeft: 6 }}>{ex.derivedOrth}</span>
                        <div style={{ fontSize: 11, opacity: 0.5, marginTop: 4 }}>
                          /{ex.baseIpa}/ + {ex.affixStr} → /{ex.derivedIpa}/
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Alternation rules with before/after */}
        {morph.alternationRules.length > 0 && (
          <div className="panel mb16">
            <div className="panel-head"><span className="panel-title">Alternation rules</span></div>
            <div className="panel-body" style={{ padding: 0 }}>
              {morph.alternationRules.map((r) => {
                const trigger = r.trigger ?? r.description ?? "";
                const input = r.input ?? (r as { pattern?: string }).pattern?.split("→")[0]?.trim();
                const output = r.output ?? (r as { pattern?: string }).pattern?.split("→")[1]?.trim();
                const ex = getAlternationExample(r);
                return (
                  <div
                    key={r.id}
                    style={{
                      padding: "12px 16px",
                      borderBottom: "1px solid var(--rule)",
                    }}
                  >
                    <div style={{ fontSize: 11, marginBottom: 4 }}>{trigger || "Rule"}</div>
                    <div style={{ fontSize: 11, opacity: 0.7 }}>
                      /{input}/ → /{output}/ {r.boundary ? `(${r.boundary})` : ""}
                    </div>
                    {ex && (
                      <div style={{ fontFamily: "var(--mono)", fontSize: 12, marginTop: 8 }}>
                        <span style={{ fontStyle: "italic" }}>{ex.before}</span>
                        <span style={{ opacity: 0.5, margin: "0 6px" }}>/{ex.beforeIpa}/</span>
                        <span style={{ opacity: 0.6 }}> → </span>
                        <span style={{ opacity: 0.5 }}>/{ex.afterIpa}/</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
