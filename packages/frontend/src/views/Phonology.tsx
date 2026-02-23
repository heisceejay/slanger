import { useState } from "react";
import type { Language } from "../lib/api";
import { suggestInventory, updateLanguage } from "../lib/api";
import { regenerateGlyphs } from "../lib/glyphs";

const CONSONANT_CHART = {
  places: ["Bilabial", "Labiodent.", "Dental", "Alveolar", "Post-alv.", "Palatal", "Velar", "Uvular", "Glottal"],
  manners: ["Plosive", "Nasal", "Trill", "Tap", "Fricative", "Lateral", "Approximant"],
  cells: [
    ["p b", "", "t̪ d̪", "t d", "", "c ɟ", "k ɡ", "q ɢ", "ʔ"],
    ["m", "ɱ", "", "n", "", "ɲ", "ŋ", "ɴ", ""],
    ["ʙ", "", "", "r", "", "", "", "ʀ", ""],
    ["", "", "", "ɾ", "", "", "", "ɺ", ""],
    ["ɸ β", "f v", "θ ð", "s z", "ʃ ʒ", "ç ʝ", "x ɣ", "χ ʁ", "h ɦ"],
    ["", "", "", "ɬ ɮ", "", "ʎ", "", "", ""],
    ["", "ʋ", "", "ɹ", "ɻ", "j", "ɰ", "", ""],
  ],
};

const VOWEL_CHART = {
  heights: ["Close", "Close-mid", "Mid", "Open-mid", "Open"],
  backness: ["Front", "Central", "Back"],
  cells: [
    ["i y", "ɨ ʉ", "ɯ u"],
    ["e ø", "ə", "ɤ o"],
    ["", "ə̞", ""],
    ["ɛ œ", "ɐ", "ʌ ɔ"],
    ["a æ", "", "ɑ ɒ"],
  ],
};

const WRITING_SYSTEM_TYPES = ["alphabet", "abjad", "abugida", "syllabary", "logographic", "hybrid"] as const;
const GLYPH_STYLES = ["angular", "rounded", "blocky", "cursive"] as const;

type Tab = "inventory" | "phonotactics" | "orthography" | "writing-system";

export function PhonologyView({ lang, onUpdated }: { lang: Language; onUpdated: (l: Language) => void }) {
  const phon = lang.phonology;
  const [suggesting, setSuggesting] = useState(false);
  const [rationale, setRationale] = useState("");
  const [error, setError] = useState("");
  const [tab, setTab] = useState<Tab>("inventory");

  async function handleSuggest() {
    setSuggesting(true);
    setError("");
    setRationale("");
    try {
      const { language, rationale: r } = await suggestInventory(lang);
      onUpdated(language);
      setRationale(r);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSuggesting(false);
    }
  }

  function togglePhoneme(ph: string, type: "consonants" | "vowels") {
    const current = [...phon.inventory[type]];
    const idx = current.indexOf(ph);
    const next = idx >= 0 ? current.filter((x) => x !== ph) : [...current, ph];
    const updated = { ...lang, phonology: { ...phon, inventory: { ...phon.inventory, [type]: next } } };
    const saved = updateLanguage(lang.meta.id, { phonology: updated.phonology });
    if (saved) onUpdated(saved);
  }

  function updateWritingSystem(patch: Partial<NonNullable<Language["phonology"]["writingSystem"]>>) {
    const ws = phon.writingSystem ?? {
      type: "alphabet" as const,
      mappings: {},
      aesthetics: { complexity: 0.5, style: "angular" as const, strokeDensity: 0.5 },
      glyphs: {},
    };
    let next = { ...ws, ...patch };

    // If aesthetics or type changed, regenerate glyphs
    if (patch.aesthetics || patch.type) {
      next = regenerateGlyphs(next);
    }

    const saved = updateLanguage(lang.meta.id, { phonology: { ...phon, writingSystem: next } });
    if (saved) onUpdated(saved);
  }

  function GlyphPreview({ path, density }: { path?: string, density?: number }) {
    if (!path) return <span style={{ opacity: 0.2 }}>?</span>;
    return (
      <svg width="32" height="32" viewBox="0 0 32 32" style={{ border: "1px solid var(--rule)", borderRadius: 4, background: "var(--paper)" }}>
        <path
          d={path}
          fill="none"
          stroke="var(--ink)"
          strokeWidth={1 + (density ?? 0.5) * 3}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  const ws = phon.writingSystem;
  const allPhonemes = [...phon.inventory.consonants, ...phon.inventory.vowels];

  return (
    <>
      <div className="view-header">
        <h1 className="view-title">Phonology</h1>
        <span className="view-subtitle">{phon.inventory.consonants.length}C + {phon.inventory.vowels.length}V</span>
        <div style={{ marginLeft: "auto" }}>
          <button className="btn" onClick={handleSuggest} disabled={suggesting}>
            {suggesting ? <span className="spinner" /> : "⊛"} AI Suggest Inventory
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

        <div className="flex-row mb16" style={{ borderBottom: "1px solid var(--ink)" }}>
          {(["inventory", "phonotactics", "orthography", "writing-system"] as Tab[]).map((t) => (
            <button key={t} onClick={() => setTab(t)} style={{
              background: "none", border: "none",
              borderBottom: tab === t ? "2px solid var(--ink)" : "2px solid transparent",
              padding: "8px 16px 10px", cursor: "pointer", fontSize: 10,
              letterSpacing: "0.12em", textTransform: "uppercase", fontFamily: "var(--mono)",
              marginBottom: -1, transition: "var(--transition)",
            }}>{t.replace("-", " ")}</button>
          ))}
        </div>

        {tab === "inventory" && (
          <div>
            <div className="panel mb24">
              <div className="panel-head">
                <span className="panel-title">Consonants ({phon.inventory.consonants.length})</span>
                <span className="muted small" style={{ marginLeft: "auto" }}>Click a phoneme to toggle it in/out of the inventory</span>
              </div>
              <div className="panel-body" style={{ overflowX: "auto" }}>
                <table style={{ borderCollapse: "collapse", fontSize: 11, minWidth: 600 }}>
                  <thead>
                    <tr>
                      <th style={{ width: 90, padding: "4px 8px", textAlign: "left", fontSize: 9, opacity: 0.4, letterSpacing: "0.08em", textTransform: "uppercase" }}>Manner</th>
                      {CONSONANT_CHART.places.map((p) => (
                        <th key={p} style={{ padding: "4px 8px", fontSize: 8, opacity: 0.4, letterSpacing: "0.06em", textTransform: "uppercase", textAlign: "center", minWidth: 70 }}>{p}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {CONSONANT_CHART.manners.map((manner, mi) => (
                      <tr key={manner}>
                        <td style={{ padding: "4px 8px", fontSize: 9, opacity: 0.4, letterSpacing: "0.08em", textTransform: "uppercase", borderRight: "1px solid var(--rule)" }}>{manner}</td>
                        {CONSONANT_CHART.cells[mi]!.map((cell, pi) => (
                          <td key={pi} style={{ padding: "6px 8px", textAlign: "center", border: "1px solid var(--rule)", background: !cell ? "var(--paper-mid)" : "transparent" }}>
                            <div style={{ display: "flex", gap: 4, justifyContent: "center" }}>
                              {cell.split(" ").filter(Boolean).map((ph) => {
                                const active = phon.inventory.consonants.includes(ph);
                                return (
                                  <span
                                    key={ph}
                                    title={active ? `Remove / ${ph} /` : `Add /${ph}/`}
                                    onClick={() => togglePhoneme(ph, "consonants")}
                                    style={{
                                      fontFamily: "var(--mono)", fontSize: 14, width: 28, height: 28,
                                      display: "flex", alignItems: "center", justifyContent: "center",
                                      background: active ? "var(--ink)" : "transparent",
                                      color: active ? "var(--paper)" : "var(--ink)",
                                      border: active ? "1px solid var(--ink)" : "1px solid transparent",
                                      cursor: "pointer",
                                      borderRadius: 2,
                                      transition: "var(--transition)",
                                      userSelect: "none",
                                    }}
                                  > {ph}</span >
                                );
                              })}
                            </div >
                          </td >
                        ))}
                      </tr >
                    ))}
                  </tbody >
                </table >
              </div >
            </div >

            <div className="grid-2">
              <div className="panel">
                <div className="panel-head">
                  <span className="panel-title">Vowels ({phon.inventory.vowels.length})</span>
                  <span className="muted small" style={{ marginLeft: "auto" }}>Click to toggle</span>
                </div>
                <div className="panel-body">
                  <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 11 }}>
                    <thead>
                      <tr>
                        <th style={{ padding: "4px 8px", fontSize: 9, opacity: 0.4, textTransform: "uppercase", letterSpacing: "0.08em", textAlign: "left" }}>Height</th>
                        {VOWEL_CHART.backness.map((b) => (
                          <th key={b} style={{ padding: "4px 8px", fontSize: 9, opacity: 0.4, textTransform: "uppercase", letterSpacing: "0.08em", textAlign: "center" }}>{b}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {VOWEL_CHART.heights.map((h, hi) => (
                        <tr key={h}>
                          <td style={{ padding: "4px 8px", fontSize: 9, opacity: 0.4, textTransform: "uppercase", letterSpacing: "0.06em", borderRight: "1px solid var(--rule)" }}>{h}</td>
                          {VOWEL_CHART.cells[hi]!.map((cell, bi) => (
                            <td key={bi} style={{ padding: "6px 8px", textAlign: "center", border: "1px solid var(--rule)" }}>
                              <div style={{ display: "flex", gap: 4, justifyContent: "center" }}>
                                {cell.split(" ").filter(Boolean).map((ph) => {
                                  const active = phon.inventory.vowels.includes(ph);
                                  return (
                                    <span
                                      key={ph}
                                      title={active ? `Remove /${ph}/` : `Add /${ph}/`}
                                      onClick={() => togglePhoneme(ph, "vowels")}
                                      style={{
                                        fontFamily: "var(--mono)", fontSize: 14, width: 28, height: 28,
                                        display: "flex", alignItems: "center", justifyContent: "center",
                                        background: active ? "var(--ink)" : "transparent",
                                        color: active ? "var(--paper)" : "var(--ink)",
                                        border: active ? "2px solid var(--ink)" : "1px dashed rgba(10,10,10,0.3)",
                                        cursor: "pointer",
                                        borderRadius: "50%",
                                        transition: "var(--transition)",
                                        userSelect: "none",
                                      }}
                                    >{ph}</span>
                                  );
                                })}
                              </div>
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div>
                <div className="panel mb16">
                  <div className="panel-head"><span className="panel-title">Suprasegmentals</span></div>
                  <div className="panel-body" style={{ padding: 0 }}>
                    {Object.entries(phon.suprasegmentals).map(([key, val]) => (
                      <div key={key} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 16px", borderBottom: "1px solid var(--rule)", fontSize: 11 }}>
                        <span style={{ opacity: 0.6 }}>{key.replace(/([A-Z])/g, " $1").replace(/^./, s => s.toUpperCase()).replace("has ", "")}</span>
                        <button
                          type="button"
                          onClick={() => {
                            const next = { ...phon.suprasegmentals, [key]: !val };
                            const saved = updateLanguage(lang.meta.id, { phonology: { ...phon, suprasegmentals: next } });
                            if (saved) onUpdated(saved);
                          }}
                          style={{
                            fontFamily: "var(--mono)",
                            background: val ? "var(--ink)" : "transparent",
                            color: val ? "var(--paper)" : "var(--ink)",
                            border: "1px solid " + (val ? "var(--ink)" : "var(--rule-heavy)"),
                            padding: "4px 10px", fontSize: 9, letterSpacing: "0.1em",
                            cursor: "pointer", transition: "var(--transition)",
                          }}
                        >
                          {val ? "YES" : "NO"}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="panel">
                  <div className="panel-head"><span className="panel-title">Active Inventory</span></div>
                  <div className="panel-body">
                    <div className="muted small mb8" style={{ letterSpacing: "0.1em", textTransform: "uppercase" }}>Consonants</div>
                    <div className="phoneme-chips mb16">
                      {phon.inventory.consonants.map(c => (
                        <span key={c} className="phoneme-chip active" onClick={() => togglePhoneme(c, "consonants")} style={{ cursor: "pointer" }} title="Click to remove">{c}</span>
                      ))}
                      {phon.inventory.consonants.length === 0 && <span className="muted small">None defined</span>}
                    </div>
                    <div className="muted small mb8" style={{ letterSpacing: "0.1em", textTransform: "uppercase" }}>Vowels</div>
                    <div className="phoneme-chips">
                      {phon.inventory.vowels.map(v => (
                        <span key={v} className="phoneme-chip active" onClick={() => togglePhoneme(v, "vowels")} style={{ cursor: "pointer", borderRadius: "50%", border: "2px solid var(--ink)" }} title="Click to remove">{v}</span>
                      ))}
                      {phon.inventory.vowels.length === 0 && <span className="muted small">None defined</span>}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div >
        )}

        {
          tab === "phonotactics" && (
            <div className="grid-2">
              <div className="panel">
                <div className="panel-head"><span className="panel-title">Syllable Templates</span></div>
                <div className="panel-body">
                  {phon.phonotactics.syllableTemplates.length === 0 ? (
                    <div className="muted small">None defined</div>
                  ) : (
                    <div className="phoneme-chips">
                      {phon.phonotactics.syllableTemplates.map(t => (
                        <span key={t} className="tag tag-fill" style={{ fontSize: 13, fontFamily: "var(--mono)", padding: "4px 10px" }}>{t}</span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <div className="panel">
                <div className="panel-head"><span className="panel-title">Clusters</span></div>
                <div className="panel-body">
                  <div className="muted small mb8" style={{ letterSpacing: "0.1em", textTransform: "uppercase" }}>Onset</div>
                  <div className="phoneme-chips mb16">
                    {phon.phonotactics.onsetClusters.map((c, i) => (
                      <span key={i} className="tag" style={{ fontFamily: "var(--mono)", fontSize: 13 }}>{Array.isArray(c) ? c.join("") : c}</span>
                    ))}
                    {phon.phonotactics.onsetClusters.length === 0 && <span className="muted small">None</span>}
                  </div>
                  <div className="muted small mb8" style={{ letterSpacing: "0.1em", textTransform: "uppercase" }}>Coda</div>
                  <div className="phoneme-chips">
                    {phon.phonotactics.codaClusters.map((c, i) => (
                      <span key={i} className="tag" style={{ fontFamily: "var(--mono)", fontSize: 13 }}>{Array.isArray(c) ? c.join("") : c}</span>
                    ))}
                    {phon.phonotactics.codaClusters.length === 0 && <span className="muted small">None</span>}
                  </div>
                </div>
              </div>
              <div className="panel" style={{ gridColumn: "1 / -1" }}>
                <div className="panel-head"><span className="panel-title">Allophony Rules ({phon.phonotactics.allophonyRules.length})</span></div>
                <div className="panel-body" style={{ padding: 0 }}>
                  {phon.phonotactics.allophonyRules.length === 0 ? (
                    <div style={{ padding: 16 }} className="muted small">No allophony rules defined</div>
                  ) : (
                    <table className="tbl tbl-mono">
                      <thead><tr><th>Phoneme</th><th>Allophone</th><th>Environment</th><th>Position</th></tr></thead>
                      <tbody>
                        {phon.phonotactics.allophonyRules.map((r, i) => (
                          <tr key={i}>
                            <td style={{ fontSize: 16 }}>{r.phoneme}</td>
                            <td style={{ fontSize: 16 }}>{r.allophone}</td>
                            <td style={{ opacity: 0.7 }}>{r.environment}</td>
                            <td>{r.position ?? "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            </div>
          )
        }

        {
          tab === "orthography" && (
            <div className="panel">
              <div className="panel-head"><span className="panel-title">Orthography Map ({Object.keys(phon.orthography).length} mappings)</span></div>
              <div className="panel-body" style={{ padding: 0 }}>
                <table className="tbl tbl-mono">
                  <thead><tr><th>Phoneme (IPA)</th><th>Grapheme</th><th>Example</th></tr></thead>
                  <tbody>
                    {Object.entries(phon.orthography).map(([ph, gr]) => (
                      <tr key={ph}>
                        <td style={{ fontSize: 18 }}>{ph}</td>
                        <td style={{ fontSize: 18 }}>{gr}</td>
                        <td style={{ opacity: 0.4, fontSize: 11 }}>/{ph}/ → {gr}</td>
                      </tr>
                    ))}
                    {Object.keys(phon.orthography).length === 0 && (
                      <tr><td colSpan={3} style={{ textAlign: "center", opacity: 0.4 }}>No orthography defined</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )
        }

        {
          tab === "writing-system" && (
            <div>
              {/* Header row: type selector + aesthetics */}
              <div className="grid-2 mb16">
                <div className="panel">
                  <div className="panel-head"><span className="panel-title">Writing System Type</span></div>
                  <div className="panel-body" style={{ padding: 0 }}>
                    {WRITING_SYSTEM_TYPES.map((t) => {
                      const active = (ws?.type ?? "alphabet") === t;
                      return (
                        <div key={t} onClick={() => updateWritingSystem({ type: t })} style={{
                          display: "flex", alignItems: "center", gap: 10, padding: "12px 16px",
                          borderBottom: "1px solid var(--rule)", cursor: "pointer",
                          background: active ? "var(--paper-mid)" : "transparent",
                          transition: "var(--transition)",
                        }}>
                          <span style={{
                            width: 8, height: 8, borderRadius: "50%",
                            background: active ? "var(--ink)" : "transparent",
                            border: "1px solid var(--ink)", flexShrink: 0,
                          }} />
                          <span style={{ fontFamily: "var(--mono)", fontSize: 12, fontWeight: active ? 600 : 400 }}>{t}</span>
                          <span className="muted small" style={{ marginLeft: "auto", textAlign: "right", maxWidth: 200 }}>
                            {t === "alphabet" && "Full vowel + consonant mapping"}
                            {t === "abjad" && "Consonants only (Arabic, Hebrew)"}
                            {t === "abugida" && "Consonants with vowel diacritics (Devanagari)"}
                            {t === "syllabary" && "One glyph per syllable (Katakana)"}
                            {t === "logographic" && "One glyph per morpheme (Chinese)"}
                            {t === "hybrid" && "Mixed system"}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <div className="panel mb16">
                    <div className="panel-head"><span className="panel-title">Aesthetics</span></div>
                    <div className="panel-body">
                      <div className="muted small mb8" style={{ letterSpacing: "0.1em", textTransform: "uppercase" }}>Style</div>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
                        {GLYPH_STYLES.map((s) => {
                          const active = (ws?.aesthetics?.style ?? "angular") === s;
                          return (
                            <button key={s} onClick={() => updateWritingSystem({ aesthetics: { ...(ws?.aesthetics ?? { complexity: 0.5, strokeDensity: 0.5, style: "angular" }), style: s } })}
                              style={{
                                fontFamily: "var(--mono)", fontSize: 10, padding: "5px 12px",
                                background: active ? "var(--ink)" : "transparent",
                                color: active ? "var(--paper)" : "var(--ink)",
                                border: "1px solid " + (active ? "var(--ink)" : "var(--rule-heavy)"),
                                cursor: "pointer", letterSpacing: "0.08em", transition: "var(--transition)",
                              }}
                            >{s}</button>
                          );
                        })}
                      </div>

                      <div className="muted small mb8" style={{ letterSpacing: "0.1em", textTransform: "uppercase" }}>Complexity</div>
                      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
                        <input
                          type="range" min={0} max={1} step={0.05}
                          value={ws?.aesthetics?.complexity ?? 0.5}
                          onChange={(e) => updateWritingSystem({ aesthetics: { ...(ws?.aesthetics ?? { strokeDensity: 0.5, style: "angular" }), complexity: Number(e.target.value) } })}
                          style={{ flex: 1 }}
                        />
                        <span style={{ fontFamily: "var(--mono)", fontSize: 11, opacity: 0.7, width: 32, textAlign: "right" }}>
                          {((ws?.aesthetics?.complexity ?? 0.5) * 100).toFixed(0)}%
                        </span>
                      </div>

                      <div className="muted small mb8" style={{ letterSpacing: "0.1em", textTransform: "uppercase" }}>Stroke Density</div>
                      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                        <input
                          type="range" min={0} max={1} step={0.05}
                          value={ws?.aesthetics?.strokeDensity ?? 0.5}
                          onChange={(e) => updateWritingSystem({ aesthetics: { ...(ws?.aesthetics ?? { complexity: 0.5, style: "angular" }), strokeDensity: Number(e.target.value) } })}
                          style={{ flex: 1 }}
                        />
                        <span style={{ fontFamily: "var(--mono)", fontSize: 11, opacity: 0.7, width: 32, textAlign: "right" }}>
                          {((ws?.aesthetics?.strokeDensity ?? 0.5) * 100).toFixed(0)}%
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Phoneme → Glyph Mapping Table */}
              <div className="panel">
                <div className="panel-head">
                  <span className="panel-title">Phoneme → Glyph Mappings ({Object.keys(ws?.mappings ?? {}).length})</span>
                  <span className="muted small" style={{ marginLeft: "auto" }}>
                    {ws?.type === "abjad" ? "Vowels are omitted (abjad)" : `${allPhonemes.length} phonemes in inventory`}
                  </span>
                </div>
                <div className="panel-body" style={{ padding: 0 }}>
                  {allPhonemes.length === 0 ? (
                    <div style={{ padding: 16 }} className="muted small">No phonemes in inventory. Define your inventory first.</div>
                  ) : (
                    <table className="tbl tbl-mono">
                      <thead>
                        <tr>
                          <th>Phoneme (IPA)</th>
                          <th>Type</th>
                          <th>Glyph(s)</th>
                          <th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {allPhonemes.map((ph) => {
                          const isVowel = phon.inventory.vowels.includes(ph);
                          const glyphs = ws?.mappings?.[ph] ?? [];
                          const omitted = ws?.type === "abjad" && isVowel;
                          return (
                            <tr key={ph} style={{ opacity: omitted ? 0.4 : 1 }}>
                              <td style={{ fontSize: 18 }}>{ph}</td>
                              <td>
                                <span className={`tag ${isVowel ? "tag-fill" : ""}`} style={{ fontSize: 9 }}>
                                  {isVowel ? "vowel" : "consonant"}
                                </span>
                              </td>
                              <td style={{ fontSize: 16 }}>
                                {omitted ? (
                                  <span className="muted small">omitted (abjad)</span>
                                ) : glyphs.length > 0 ? (
                                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                    {glyphs.map(g => (
                                      <div key={g} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                                        <GlyphPreview path={ws?.glyphs[g]} density={ws?.aesthetics.strokeDensity} />
                                        <span style={{ fontSize: 10, opacity: 0.5 }}>{g}</span>
                                      </div>
                                    ))}
                                  </div>
                                ) : (
                                  <span className="muted small">—</span>
                                )}
                              </td>
                              <td>
                                <span style={{
                                  fontSize: 9, letterSpacing: "0.08em", fontFamily: "var(--mono)",
                                  color: omitted || glyphs.length > 0 ? "var(--success, #4a7)" : "var(--error, #c44)",
                                }}>
                                  {omitted ? "OK (abjad)" : glyphs.length > 0 ? "mapped" : "unmapped"}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            </div>
          )}
      </div>
    </>
  );
}
