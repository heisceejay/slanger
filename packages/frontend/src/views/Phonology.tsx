import { useState } from "react";
import type { Language } from "../lib/api";
import { suggestInventory } from "../lib/api";

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

export function PhonologyView({ lang, onUpdated }: { lang: Language; onUpdated: (l: Language) => void }) {
  const phon = lang.phonology;
  const [suggesting, setSuggesting] = useState(false);
  const [rationale, setRationale] = useState("");
  const [error, setError] = useState("");
  const [tab, setTab] = useState<"inventory" | "phonotactics" | "orthography">("inventory");

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
          {(["inventory", "phonotactics", "orthography"] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)} style={{
              background: "none", border: "none",
              borderBottom: tab === t ? "2px solid var(--ink)" : "2px solid transparent",
              padding: "8px 16px 10px", cursor: "pointer", fontSize: 10,
              letterSpacing: "0.12em", textTransform: "uppercase", fontFamily: "var(--mono)",
              marginBottom: -1, transition: "var(--transition)",
            }}>{t}</button>
          ))}
        </div>

        {tab === "inventory" && (
          <div>
            <div className="panel mb24">
              <div className="panel-head"><span className="panel-title">Consonants ({phon.inventory.consonants.length})</span></div>
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
                              {cell.split(" ").filter(Boolean).map((ph) => (
                                <span key={ph} style={{
                                  fontFamily: "var(--mono)", fontSize: 14, width: 22, height: 22,
                                  display: "flex", alignItems: "center", justifyContent: "center",
                                  background: phon.inventory.consonants.includes(ph) ? "var(--ink)" : "transparent",
                                  color: phon.inventory.consonants.includes(ph) ? "var(--paper)" : "var(--ink)",
                                  border: phon.inventory.consonants.includes(ph) ? "1px solid var(--ink)" : "1px solid transparent",
                                }}>{ph}</span>
                              ))}
                            </div>
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="grid-2">
              <div className="panel">
                <div className="panel-head"><span className="panel-title">Vowels ({phon.inventory.vowels.length})</span></div>
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
                                {cell.split(" ").filter(Boolean).map((ph) => (
                                  <span key={ph} style={{
                                    fontFamily: "var(--mono)", fontSize: 14, width: 22, height: 22,
                                    display: "flex", alignItems: "center", justifyContent: "center",
                                    background: phon.inventory.vowels.includes(ph) ? "var(--ink)" : "transparent",
                                    color: phon.inventory.vowels.includes(ph) ? "var(--paper)" : "var(--ink)",
                                  }}>{ph}</span>
                                ))}
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
                            onUpdated({ ...lang, phonology: { ...phon, suprasegmentals: next } });
                          }}
                          style={{
                            fontFamily: "var(--mono)",
                            background: val ? "var(--ink)" : "transparent",
                            color: val ? "var(--paper)" : "var(--ink)",
                            border: "1px solid " + (val ? "var(--ink)" : "var(--rule-heavy)"),
                            padding: "4px 10px",
                            fontSize: 9,
                            letterSpacing: "0.1em",
                            cursor: "pointer",
                            transition: "var(--transition)",
                          }}
                        >
                          {val ? "YES" : "NO"}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="panel">
                  <div className="panel-head"><span className="panel-title">Inventory</span></div>
                  <div className="panel-body">
                    <div className="muted small mb8" style={{ letterSpacing: "0.1em", textTransform: "uppercase" }}>Consonants</div>
                    <div className="phoneme-chips mb16">
                      {phon.inventory.consonants.map(c => <span key={c} className="phoneme-chip active">{c}</span>)}
                      {phon.inventory.consonants.length === 0 && <span className="muted small">None defined</span>}
                    </div>
                    <div className="muted small mb8" style={{ letterSpacing: "0.1em", textTransform: "uppercase" }}>Vowels</div>
                    <div className="phoneme-chips">
                      {phon.inventory.vowels.map(v => <span key={v} className="phoneme-chip active">{v}</span>)}
                      {phon.inventory.vowels.length === 0 && <span className="muted small">None defined</span>}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {tab === "phonotactics" && (
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
        )}

        {tab === "orthography" && (
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
        )}
      </div>
    </>
  );
}
