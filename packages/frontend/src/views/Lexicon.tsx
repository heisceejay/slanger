import { useState, useMemo } from "react";
import type { Language, LexicalEntry } from "../lib/api";
import { generateLexicon, explainRule, updateLanguage } from "../lib/api";

export function LexiconView({
  lang,
  onUpdated,
}: {
  lang: Language;
  onUpdated: (l: Language) => void;
}) {
  const [search, setSearch] = useState("");
  const [posFilter, setPosFilter] = useState("all");
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");
  const [selectedEntry, setSelectedEntry] = useState<LexicalEntry | null>(null);
  const [explanation, setExplanation] = useState<{
    explanation: string;
    examples: Array<{ input: string; output: string; steps: string[] }>;
    crossLinguisticParallels: string[];
  } | null>(null);
  const [explaining, setExplaining] = useState(false);

  const entries = lang.lexicon;
  // Coverage stats
  const posCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const e of entries) {
      counts[e.pos] = (counts[e.pos] ?? 0) + 1;
    }
    return counts;
  }, [entries]);

  // Filtered entries
  const filtered = useMemo(() => {
    return entries.filter((e) => {
      const matchSearch =
        !search ||
        e.orthographicForm.toLowerCase().includes(search.toLowerCase()) ||
        e.glosses.some((g) => g.toLowerCase().includes(search.toLowerCase())) ||
        e.semanticFields.some((f) => f.toLowerCase().includes(search.toLowerCase()));
      const matchPos = posFilter === "all" || e.pos === posFilter;
      return matchSearch && matchPos;
    });
  }, [entries, search, posFilter]);

  const allPos = useMemo(() => ["all", ...new Set(entries.map((e) => e.pos))], [entries]);

  async function handleGenerate() {
    setGenerating(true);
    setError("");
    try {
      const r = await generateLexicon(lang, 5);
      onUpdated(r);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setGenerating(false);
    }
  }

  function handleUpdateEntry(entryId: string, patch: Partial<LexicalEntry>) {
    const nextLexicon = lang.lexicon.map((e) => (e.id === entryId ? { ...e, ...patch } : e));
    const updated = updateLanguage(lang.meta.id, { lexicon: nextLexicon });
    if (updated) onUpdated(updated);
  }



  async function handleExplain(entry: LexicalEntry) {
    setSelectedEntry(entry);
    setExplaining(true);
    setExplanation(null);
    try {
      const result = await explainRule(
        lang,
        "phonology",
        `entry_${entry.id}`,
        {
          orthographic: entry.orthographicForm,
          phonological: entry.phonologicalForm,
          pos: entry.pos,
          glosses: entry.glosses,
        }
      );
      setExplanation(result);
    } catch {
      setExplanation(null);
    } finally {
      setExplaining(false);
    }
  }

  const coveragePct = Math.round((entries.length / 500) * 100);
  const hasPhonology = (lang.phonology?.inventory?.consonants?.length ?? 0) > 0 && (lang.phonology?.inventory?.vowels?.length ?? 0) > 0;
  const hasMorphology = !!lang.morphology?.typology;
  const canGenerateLexicon = hasPhonology && hasMorphology;

  return (
    <>
      <div className="view-header">
        <h1 className="view-title">Lexicon</h1>
        <span className="view-subtitle">{entries.length} entries</span>
        <div style={{ marginLeft: "auto", display: "flex", gap: 10 }}>
          <button className="btn" onClick={handleGenerate} disabled={generating || !canGenerateLexicon}>
            {generating ? <span className="spinner" /> : "⊛"}
            AI Generate Batch
          </button>
        </div>
      </div>

      <div className="view-body">
        {error && <div style={{ color: "var(--error)", fontSize: 11, marginBottom: 16 }}>{error}</div>}

        {!canGenerateLexicon ? (
          <div className="panel" style={{ padding: 40, textAlign: "center", borderStyle: "dashed", opacity: 0.8 }}>
            <div className="muted mb16" style={{ fontSize: 12 }}>
              Lexicon generation is locked until you define your language's basic profile.
            </div>
            <div style={{ display: "flex", justifyContent: "center", gap: 12 }}>
              {!hasPhonology && (
                <div style={{ padding: 12, border: "1px solid var(--rule)", borderRadius: 8, background: "rgba(255,255,255,0.05)" }}>
                  <div className="small mb8">Phonology Required</div>
                  <span className="muted small">Define phoneme inventory first.</span>
                </div>
              )}
              {!hasMorphology && (
                <div style={{ padding: 12, border: "1px solid var(--rule)", borderRadius: 8, background: "rgba(255,255,255,0.05)" }}>
                  <div className="small mb8">Morphology Required</div>
                  <span className="muted small">Define typology and categories.</span>
                </div>
              )}
            </div>
          </div>
        ) : (
          <>
            {/* Coverage bar */}
            <div className="mb24 fade-up">
              <div className="flex-between mb8">
                <span style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: "0.15em", opacity: 0.5 }}>
                  Vocabulary Coverage
                </span>
                <span style={{ fontSize: 9, opacity: 0.5 }}>{entries.length} / 500 target</span>
              </div>
              <div className="progress-bar-track">
                <div className="progress-bar-fill" style={{ width: `${Math.min(coveragePct, 100)}%` }} />
              </div>
              <div style={{ display: "flex", gap: 16, marginTop: 12, flexWrap: "wrap" }}>
                {Object.entries(posCounts).map(([pos, count]) => (
                  <div key={pos} style={{ fontSize: 10, opacity: 0.6 }}>
                    <span style={{ textTransform: "uppercase", letterSpacing: "0.08em" }}>{pos}</span>{" "}
                    <span style={{ fontFamily: "var(--serif)", fontStyle: "italic" }}>{count}</span>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ display: "flex", gap: 24 }}>
              {/* Entry list */}
              <div style={{ flex: 1 }}>
                {/* Search + filter */}
                <div className="search-bar fade-up-1 mb16">
                  <span style={{ opacity: 0.3, fontSize: 14 }}>🔍</span>
                  <input
                    placeholder="Search by form, gloss, or semantic field…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    style={{ border: "none", padding: "10px 0" }}
                  />
                </div>

                <div className="flex-row mb16 fade-up-1" style={{ flexWrap: "wrap", gap: 6 }}>
                  {allPos.map((p) => (
                    <button
                      key={p}
                      onClick={() => setPosFilter(p)}
                      style={{
                        fontFamily: "var(--mono)",
                        fontSize: 9,
                        letterSpacing: "0.1em",
                        textTransform: "uppercase",
                        padding: "3px 10px",
                        border: "1px solid",
                        borderColor: posFilter === p ? "var(--ink)" : "var(--rule-heavy)",
                        background: posFilter === p ? "var(--ink)" : "transparent",
                        color: posFilter === p ? "var(--paper)" : "var(--ink)",
                        cursor: "pointer",
                        transition: "var(--transition)",
                      }}
                    >
                      {p} {p !== "all" && posCounts[p] !== undefined ? `(${posCounts[p]})` : ""}
                    </button>
                  ))}
                </div>

                {/* Header row */}
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "140px 80px 80px 1fr",
                    gap: 0,
                    padding: "6px 12px",
                    borderBottom: "1px solid var(--ink)",
                    fontSize: 9,
                    letterSpacing: "0.15em",
                    textTransform: "uppercase",
                    opacity: 0.4,
                  }}
                >
                  <span>Form</span>
                  <span>POS</span>
                  <span>IPA</span>
                  <span>Gloss</span>
                </div>

                <div style={{ maxHeight: 500, overflowY: "auto" }}>
                  {filtered.length === 0 ? (
                    <div className="empty-state" style={{ padding: "40px 20px" }}>
                      <div className="muted small">No entries match</div>
                    </div>
                  ) : (
                    filtered.map((e) => (
                      <div
                        key={e.id}
                        className="entry-row"
                        style={{
                          gridTemplateColumns: "140px 80px 80px 1fr",
                          cursor: "pointer",
                          background: selectedEntry?.id === e.id ? "var(--paper-mid)" : "transparent",
                        }}
                        onClick={() => {
                          setSelectedEntry(e);
                          setExplanation(null);
                        }}
                      >
                        <span className="entry-orth">{e.orthographicForm}</span>
                        <span className="entry-pos">{e.pos}</span>
                        <span style={{ fontFamily: "var(--mono)", fontSize: 11, opacity: 0.4 }}>
                          {e.phonologicalForm}
                        </span>
                        <span style={{ fontSize: 12, opacity: 0.7 }}>{e.glosses.join(", ")}</span>
                      </div>
                    ))
                  )}
                </div>

                <div style={{ fontSize: 10, opacity: 0.4, marginTop: 8, textAlign: "right" }}>
                  Showing {filtered.length} of {entries.length}
                </div>
              </div>

              {/* Entry detail panel */}
              {selectedEntry && (() => {
                const entry = entries.find((e) => e.id === selectedEntry.id) ?? selectedEntry;
                return (
                  <div style={{ width: 320, flexShrink: 0 }}>
                    <div className="panel">
                      <div className="panel-head">
                        <span className="panel-title">Entry</span>
                        <button
                          className="btn btn-sm"
                          onClick={() => handleExplain(entry)}
                          disabled={explaining}
                        >
                          {explaining ? <span className="spinner" /> : "⊛"} Explain
                        </button>
                      </div>
                      <div className="panel-body">
                        <div className="muted small mb4" style={{ textTransform: "uppercase", letterSpacing: "0.1em" }}>Orthographic (from map)</div>
                        <div style={{ fontFamily: "var(--mono)", fontSize: 28, fontStyle: "italic", marginBottom: 8 }}>
                          {entry.orthographicForm}
                        </div>
                        <div className="muted small mb4" style={{ textTransform: "uppercase", letterSpacing: "0.1em" }}>IPA Phonology</div>
                        <div style={{
                          width: "100%",
                          fontFamily: "var(--mono)",
                          fontSize: 14,
                          padding: "8px 10px",
                          border: "1px solid var(--rule-heavy)",
                          background: "var(--paper)",
                          marginBottom: 12,
                          opacity: 0.8
                        }}>
                          {entry.phonologicalForm}
                        </div>

                        <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
                          <span className="tag tag-fill">{entry.pos}</span>
                          {entry.subcategory && (
                            <span className="tag">{entry.subcategory}</span>
                          )}
                          {entry.etymologyType && (
                            <span className="tag" style={{ opacity: 0.9 }}>{entry.etymologyType}</span>
                          )}
                        </div>

                        {/* Etymology */}
                        <div className="mb16">
                          <div className="muted small mb8" style={{ textTransform: "uppercase", letterSpacing: "0.1em" }}>Etymology</div>
                          <select
                            value={entry.etymologyType ?? ""}
                            onChange={(e) => {
                              const v = (e.target.value || undefined) as LexicalEntry["etymologyType"];
                              handleUpdateEntry(entry.id, {
                                etymologyType: v,
                                ...(v !== "derived" ? { derivedFromEntryId: undefined } : {}),
                                ...(v !== "borrowed" ? { borrowedFrom: undefined } : {}),
                              });
                            }}
                            style={{ width: "100%", padding: "6px 8px", marginBottom: 8, fontSize: 11 }}
                          >
                            <option value="">—</option>
                            <option value="derived">Derived from another word</option>
                            <option value="borrowed">Borrowed</option>
                            <option value="reconstructed">Reconstructed</option>
                          </select>
                          {entry.etymologyType === "derived" && (
                            <select
                              value={entry.derivedFromEntryId ?? ""}
                              onChange={(e) => handleUpdateEntry(entry.id, { derivedFromEntryId: e.target.value || undefined })}
                              style={{ width: "100%", padding: "6px 8px", marginBottom: 8, fontSize: 11 }}
                            >
                              <option value="">— Select source word</option>
                              {entries.filter((e) => e.id !== entry.id).map((e) => (
                                <option key={e.id} value={e.id}>{e.orthographicForm} ({e.glosses[0]})</option>
                              ))}
                            </select>
                          )}
                          {entry.etymologyType === "borrowed" && (
                            <input
                              type="text"
                              value={entry.borrowedFrom ?? ""}
                              onChange={(e) => handleUpdateEntry(entry.id, { borrowedFrom: e.target.value || undefined })}
                              placeholder="Source language or note"
                              style={{ width: "100%", padding: "6px 8px", marginBottom: 8, fontSize: 11 }}
                            />
                          )}
                          <input
                            type="text"
                            value={entry.etymology ?? ""}
                            onChange={(e) => handleUpdateEntry(entry.id, { etymology: e.target.value || undefined })}
                            placeholder="Free-form note"
                            style={{ width: "100%", padding: "6px 8px", fontSize: 11 }}
                          />
                        </div>

                        <div className="mb16">
                          <div className="muted small mb8" style={{ textTransform: "uppercase", letterSpacing: "0.1em" }}>Glosses</div>
                          {entry.glosses.map((g, i) => (
                            <div key={i} style={{ fontSize: 13, padding: "3px 0", borderBottom: "1px solid var(--rule)" }}>
                              {i + 1}. {g}
                            </div>
                          ))}
                        </div>

                        {entry.senses && entry.senses.length > 1 && (
                          <div className="mb16">
                            <div className="muted small mb8" style={{ textTransform: "uppercase", letterSpacing: "0.1em" }}>Senses</div>
                            {entry.senses.map((s) => (
                              <div key={s.index} style={{ fontSize: 11, padding: "4px 0", borderBottom: "1px solid var(--rule)", opacity: 0.8 }}>
                                <span style={{ opacity: 0.4 }}>{s.index}.</span> {s.gloss}
                                {s.semanticField && <span style={{ opacity: 0.4 }}> · {s.semanticField}</span>}
                              </div>
                            ))}
                          </div>
                        )}

                        <div>
                          <div className="muted small mb8" style={{ textTransform: "uppercase", letterSpacing: "0.1em" }}>Semantic Fields</div>
                          <div className="phoneme-chips">
                            {entry.semanticFields.map((f) => (
                              <span key={f} className="tag">{f}</span>
                            ))}
                          </div>
                        </div>

                        {explanation && (
                          <div className="mt16">
                            <div className="muted small mb8" style={{ textTransform: "uppercase", letterSpacing: "0.1em" }}>AI Explanation</div>
                            <div style={{ fontSize: 11, lineHeight: 1.7, opacity: 0.8, marginBottom: 12 }}>
                              {explanation.explanation}
                            </div>
                            {explanation.crossLinguisticParallels.length > 0 && (
                              <div>
                                <div className="muted small mb8" style={{ fontSize: 8, textTransform: "uppercase", letterSpacing: "0.1em" }}>
                                  Cross-linguistic
                                </div>
                                {explanation.crossLinguisticParallels.map((p, i) => (
                                  <div key={i} style={{ fontSize: 10, opacity: 0.6, padding: "2px 0" }}>
                                    · {p}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>
          </>
        )}
      </div>
    </>
  );
}
