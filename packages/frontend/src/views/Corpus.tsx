import { useState } from "react";
import type { Language } from "../lib/api";
import { generateCorpus } from "../lib/api";

const REGISTER_LABELS: Record<string, string> = {
  informal: "Informal",
  formal: "Formal",
  narrative: "Narrative",
  ceremonial: "Ceremonial",
  technical: "Technical",
};

export function CorpusView({
  lang,
  onUpdated,
}: {
  lang: Language;
  onUpdated: (l: Language) => void;
}) {
  const samples = lang.corpus;
  const lexiconSize = lang.lexicon?.length ?? 0;
  const canGenerateCorpus = lexiconSize >= 50;
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");
  const [prompt, setPrompt] = useState("");
  const [count, setCount] = useState(5);
  const [registers, setRegisters] = useState<string[]>(["informal", "formal"]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const allRegisters = ["informal", "formal", "narrative", "ceremonial", "technical"];

  function toggleExpanded(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleRegister(r: string) {
    setRegisters((prev) =>
      prev.includes(r) ? prev.filter((x) => x !== r) : [...prev, r]
    );
  }

  async function handleGenerate() {
    setGenerating(true);
    setError("");
    try {
      const r = await generateCorpus(lang, prompt || undefined, count, registers as ("informal" | "formal" | "narrative")[]);
      onUpdated(r);
      setPrompt("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setGenerating(false);
    }
  }

  return (
    <>
      <div className="view-header">
        <h1 className="view-title">Corpus</h1>
        <span className="view-subtitle">{samples.length} samples</span>
      </div>

      <div className="view-body">
        {error && <div style={{ color: "var(--error)", fontSize: 11, marginBottom: 16 }}>{error}</div>}

        {/* Generation controls */}
        <div className="panel mb24 fade-up">
          <div className="panel-head"><span className="panel-title">Generate Corpus Samples</span></div>
          <div className="panel-body">
            {!canGenerateCorpus && (
              <div style={{ marginBottom: 16, padding: 12, background: "var(--rule)", borderRadius: 4, fontSize: 12 }}>
                Add at least 50 words to the lexicon before generating corpus. Current: {lexiconSize} words.
              </div>
            )}
            <div className="grid-2">
              <div>
                <div className="field">
                  <label>Prompt (optional)</label>
                  <textarea
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    placeholder="Describe the content or context for the samples…"
                    rows={3}
                    style={{ resize: "vertical" }}
                  />
                </div>
                <div className="field">
                  <label>Number of samples: {count}</label>
                  <input
                    type="range"
                    min={1}
                    max={5}
                    value={count}
                    onChange={(e) => setCount(Number(e.target.value))}
                  />
                </div>
              </div>
              <div>
                <label>Registers</label>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
                  {allRegisters.map((r) => (
                    <button
                      key={r}
                      onClick={() => toggleRegister(r)}
                      style={{
                        fontFamily: "var(--mono)",
                        fontSize: 9,
                        letterSpacing: "0.1em",
                        textTransform: "uppercase",
                        padding: "4px 10px",
                        border: "1px solid",
                        borderColor: registers.includes(r) ? "var(--ink)" : "var(--rule-heavy)",
                        background: registers.includes(r) ? "var(--ink)" : "transparent",
                        color: registers.includes(r) ? "var(--paper)" : "var(--ink)",
                        cursor: "pointer",
                        transition: "var(--transition)",
                      }}
                    >
                      {REGISTER_LABELS[r] ?? r}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div style={{ marginTop: 16, display: "flex", justifyContent: "flex-end" }}>
              <button
                className="btn btn-fill"
                onClick={handleGenerate}
                disabled={generating || registers.length === 0 || !canGenerateCorpus}
              >
                {generating ? <span className="spinner" style={{ borderTopColor: "var(--paper)" }} /> : "⊛"}
                Generate {count} Sample{count > 1 ? "s" : ""}
              </button>
            </div>
          </div>
        </div>

        {/* Sample list */}
        {samples.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-glyph">§</div>
            <div className="small muted">No corpus samples yet</div>
            <div className="small muted" style={{ marginTop: 8 }}>Generate some above</div>
          </div>
        ) : (
          <div className="fade-up-1">
            {samples.map((s) => (
              <div key={s.id} className="corpus-card">
                <div className="corpus-meta">
                  <span className="tag">{REGISTER_LABELS[s.register] ?? s.register}</span>
                  <span style={{ fontSize: 9, opacity: 0.3 }}>
                    {new Date(s.generatedAt).toLocaleDateString()}
                  </span>
                  <button
                    style={{
                      marginLeft: "auto",
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      fontSize: 10,
                      opacity: 0.4,
                      fontFamily: "var(--mono)",
                      letterSpacing: "0.1em",
                    }}
                    onClick={() => toggleExpanded(s.id)}
                  >
                    {expanded.has(s.id) ? "▲ Hide gloss" : "▼ Show gloss"}
                  </button>
                </div>

                {/* Original text */}
                <div
                  style={{
                    fontFamily: "var(--serif)",
                    fontStyle: "italic",
                    fontSize: 18,
                    marginBottom: 6,
                    lineHeight: 1.5,
                  }}
                >
                  {s.orthographicText}
                </div>

                {/* IPA */}
                {s.ipaText && (
                  <div style={{ fontFamily: "var(--mono)", fontSize: 12, opacity: 0.4, marginBottom: 8 }}>
                    {s.ipaText}
                  </div>
                )}

                {/* Interlinear gloss */}
                {expanded.has(s.id) && s.interlinearGloss && s.interlinearGloss.length > 0 && (
                  <div
                    style={{
                      marginTop: 4,
                      marginBottom: 16,
                    }}
                  >
                    <div className="muted small mb8" style={{ textTransform: "uppercase", letterSpacing: "0.1em" }}>
                      Interlinear Gloss
                    </div>
                    <div className="interlinear">
                      {s.interlinearGloss.map((w, i) => (
                        <div key={i} className="interlinear-word">
                          <div className="interlinear-orth">{w.word}</div>
                          <div className="interlinear-morph">{w.morphemes.join("-")}</div>
                          <div className="interlinear-gloss">{w.glosses.join("-")}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Translation */}
                <div style={{ fontSize: 14, opacity: 0.8, marginTop: 12, borderTop: expanded.has(s.id) ? "1px solid var(--rule)" : "none", paddingTop: expanded.has(s.id) ? 12 : 0 }}>
                  '{s.translation}'
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
