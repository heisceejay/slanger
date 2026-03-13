import type { Language } from "../lib/api";
import type { View } from "../App";
import { checkConsistency } from "../lib/api";
import { useState, useMemo } from "react";

export function Dashboard({
  lang,
  onRefresh: _onRefresh,
  onNavigate,
}: {
  lang: Language;
  onRefresh: () => void;
  onNavigate: (v: View) => void;
}) {
  void _onRefresh;
  const def = lang;
  const vs = def.validationState;
  const [checking, setChecking] = useState(false);
  const [consistency, setConsistency] = useState<{
    overallScore: number;
    suggestions: string[];
    strengths: string[];
    linguisticIssues?: { severity: string; module: string; description: string; suggestion: string }[];
  } | null>(null);

  const analysis = useMemo(() => {
    const wordCounts: Record<string, number> = {};
    let totalTokens = 0;
    const corpus = lang.corpus || [];

    corpus.forEach((sample) => {
      const tokens = sample.orthographicText
        .toLowerCase()
        .replace(/[.,/#!$%^&*;:{}=\-_`~()]/g, "")
        .split(/\s+/)
        .filter(Boolean);

      tokens.forEach((token) => {
        wordCounts[token] = (wordCounts[token] ?? 0) + 1;
        totalTokens++;
      });
    });

    const sortedWords = Object.entries(wordCounts)
      .sort(([, a], [, b]) => b - a)
      .map(([word, count], index) => ({
        word,
        count,
        rank: index + 1,
      }));

    return {
      sortedWords,
      totalTokens,
      uniqueTypes: sortedWords.length,
      ttr: totalTokens > 0 ? sortedWords.length / totalTokens : 0,
    };
  }, [lang.corpus]);

  const maxFreq = analysis.sortedWords[0]?.count ?? 0;
  const chartHeight = 160;
  const chartWidth = 500;

  const stats = [
    {
      num: def.phonology.inventory.consonants.length,
      label: "Consonants",
      sub: `+ ${def.phonology.inventory.vowels.length} vowels`,
    },
    {
      num: Object.keys(def.morphology.paradigms).length,
      label: "Paradigms",
      sub: def.morphology.typology,
    },
    {
      num: def.lexicon.length,
      label: "Lexical entries",
      sub: `${Math.round((def.lexicon.length / 1500) * 100)}% of total capacity`,
    },
    {
      num: def.corpus.length,
      label: "Corpus samples",
      sub: def.syntax.wordOrder,
    },
  ];

  async function runCheck() {
    setChecking(true);
    try {
      const r = await checkConsistency(lang);
      setConsistency(r);
    } catch {
      // ignore
    } finally {
      setChecking(false);
    }
  }

  return (
    <>
      <div className="view-header">
        <h1 className="view-title">{lang.meta.name}</h1>
        <span className="view-subtitle">{lang.meta.preset} · v{lang.meta.version}</span>
        {lang.meta.world && (
          <span className="view-subtitle" style={{ fontStyle: "italic", opacity: 0.4 }}>
            {lang.meta.world}
          </span>
        )}
      </div>

      <div className="view-body">
        {/* Stats row */}
        <div className="grid-3 mb16 fade-up">
          {stats.map((s, i) => (
            <div key={i} style={{ borderLeft: "2px solid var(--ink)", paddingLeft: 16 }}>
              <div className="stat-num">{s.num}</div>
              <div style={{ fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", opacity: 0.5, marginTop: 2 }}>
                {s.label}
              </div>
              <div style={{ fontSize: 10, opacity: 0.3, marginTop: 2, fontFamily: "var(--mono)" }}>
                {s.sub}
              </div>
            </div>
          ))}
        </div>

        <div className="grid-2 fade-up-1">
          {/* Validation state */}
          <div className="panel">
            <div className="panel-head">
              <span className="panel-title">Validation</span>
              <span
                className={`validation-badge ${vs.errors.length === 0 ? "valid" : "invalid"}`}
              >
                {vs.errors.length === 0 ? "✓ Valid" : `✗ ${vs.errors.length} errors`}
              </span>
            </div>
            <div className="panel-body">
              {vs.errors.length > 0 ? (
                <div>
                  {vs.errors.slice(0, 5).map((e, i) => (
                    <div
                      key={i}
                      style={{
                        fontSize: 11,
                        padding: "6px 0",
                        borderBottom: "1px solid var(--rule)",
                        display: "flex",
                        gap: 8,
                        alignItems: "baseline",
                      }}
                    >
                      <span style={{ color: "var(--error)", flexShrink: 0 }}>
                        [{e.module}]
                      </span>
                      <span style={{ opacity: 0.8 }}>{e.message}</span>
                    </div>
                  ))}
                  {vs.errors.length > 5 && (
                    <div style={{ fontSize: 10, opacity: 0.4, marginTop: 8 }}>
                      + {vs.errors.length - 5} more
                    </div>
                  )}
                </div>
              ) : (
                <div className="muted small">All modules pass validation.</div>
              )}
              {vs.warnings.length > 0 && (
                <div style={{ marginTop: 12, fontSize: 10, opacity: 0.5 }}>
                  {vs.warnings.length} warning{vs.warnings.length > 1 ? "s" : ""}
                </div>
              )}
              <div style={{ fontSize: 9, opacity: 0.3, marginTop: 12 }}>
                Last run: {vs.lastRun ? new Date(vs.lastRun).toLocaleString() : "—"}
              </div>
            </div>
          </div>

          {/* Quick nav */}
          <div className="panel">
            <div className="panel-head">
              <span className="panel-title">Modules</span>
            </div>
            <div className="panel-body" style={{ padding: 0 }}>
              {(
                [
                  { id: "phonology" as View, label: "Phonology", detail: `${def.phonology.inventory.consonants.length + def.phonology.inventory.vowels.length} phonemes · ${def.phonology.phonotactics.syllableTemplates.join(", ")}` },
                  { id: "morphology" as View, label: "Morphology", detail: `${def.morphology.typology} · ${Object.keys(def.morphology.paradigms).length} paradigms` },
                  { id: "syntax" as View, label: "Syntax", detail: `${def.syntax.wordOrder} · ${def.syntax.alignment}` },
                  { id: "lexicon" as View, label: "Lexicon", detail: `${def.lexicon.length} entries` },
                  { id: "corpus" as View, label: "Corpus", detail: `${def.corpus.length} samples` },
                ]
              ).map(({ id, label, detail }) => (
                <button
                  key={id}
                  onClick={() => onNavigate(id)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    width: "100%",
                    padding: "12px 16px",
                    background: "none",
                    border: "none",
                    borderBottom: "1px solid var(--rule)",
                    cursor: "pointer",
                    textAlign: "left",
                    transition: "var(--transition)",
                    fontFamily: "var(--mono)",
                    color: "var(--ink)",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "var(--paper-mid)")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
                >
                  <span style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.1em" }}>{label}</span>
                  <span style={{ fontSize: 10, opacity: 0.4 }}>{detail}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Tags */}
        {lang.meta.tags.length > 0 && (
          <div className="fade-up-2 mt16">
            <div className="muted small mb8" style={{ letterSpacing: "0.1em", textTransform: "uppercase" }}>Tags</div>
            <div className="phoneme-chips">
              {lang.meta.tags.map((t) => (
                <span key={t} className="tag">{t}</span>
              ))}
            </div>
          </div>
        )}

        {/* AI Consistency check */}
        <div className="panel mt24 fade-up-3">
          <div className="panel-head">
            <span className="panel-title">AI Consistency Audit</span>
            <button className="btn btn-sm" onClick={runCheck} disabled={checking}>
              {checking ? <span className="spinner" /> : "Run"}
            </button>
          </div>
          <div className="panel-body">
            {!consistency ? (
              <div className="muted small">
                Run an AI-powered consistency check to find issues beyond rule-based validation.
              </div>
            ) : (
              <div>
                <div className="flex-row mb16">
                  <div className="stat-num" style={{ fontSize: 24 }}>{consistency.overallScore}</div>
                  <div className="muted small">/100 consistency score</div>
                  <div
                    style={{
                      marginLeft: "auto",
                      width: 120,
                      height: 2,
                      background: "var(--rule)",
                      position: "relative",
                    }}
                  >
                    <div
                      style={{
                        position: "absolute",
                        left: 0,
                        top: 0,
                        height: 2,
                        width: `${consistency.overallScore}%`,
                        background: "var(--ink)",
                      }}
                    />
                  </div>
                </div>

                {consistency.strengths.length > 0 && (
                  <div className="mb16">
                    <div className="muted small mb8" style={{ letterSpacing: "0.1em", textTransform: "uppercase" }}>Strengths</div>
                    {consistency.strengths.map((s, i) => (
                      <div key={i} style={{ fontSize: 11, padding: "4px 0", opacity: 0.7 }}>
                        + {s}
                      </div>
                    ))}
                  </div>
                )}

                {consistency.suggestions.length > 0 && (
                  <div>
                    <div className="muted small mb8" style={{ letterSpacing: "0.1em", textTransform: "uppercase" }}>Suggestions</div>
                    {consistency.suggestions.map((s, i) => (
                      <div key={i} style={{ fontSize: 11, padding: "4px 0", opacity: 0.7 }}>
                        → {s}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Linguistic Analysis */}
        <div className="panel mt24 fade-up-3">
          <div className="panel-head">
            <span className="panel-title">Linguistic Analysis (Zipfian Distribution)</span>
          </div>
          <div className="panel-body">
            {lang.corpus.length === 0 ? (
              <div className="empty-state" style={{ padding: 40 }}>
                <span className="muted small">Generate corpus samples to see linguistic distribution and frequency analysis.</span>
              </div>
            ) : (
              <div style={{ display: "flex", gap: 40, alignItems: "flex-start" }}>
                <div style={{ flex: 1 }}>
                  {analysis.sortedWords.length < 5 ? (
                    <div className="empty-state" style={{ padding: 20 }}>
                      <span className="muted small">Need more corpus data to generate distribution chart.</span>
                    </div>
                  ) : (
                    <div style={{ overflowX: "auto" }}>
                      <svg width={chartWidth} height={chartHeight} style={{ overflow: "visible", marginBottom: 20 }}>
                        <line x1="0" y1={chartHeight} x2={chartWidth} y2={chartHeight} stroke="var(--rule-heavy)" />
                        <line x1="0" y1="0" x2="0" y2={chartHeight} stroke="var(--rule-heavy)" />
                        {analysis.sortedWords.slice(0, 40).map((d, i) => {
                          const x = (i / 40) * chartWidth;
                          const y = chartHeight - (d.count / maxFreq) * chartHeight;
                          return (
                            <g key={i}>
                              <rect 
                                x={x} 
                                y={y} 
                                width={chartWidth / 50} 
                                height={chartHeight - y} 
                                fill="var(--ink)" 
                                style={{ opacity: 0.2 + (0.8 * (d.count / maxFreq)) }} 
                              />
                            </g>
                          );
                        })}
                        <path 
                          d={`M ${analysis.sortedWords.slice(0, 40).map((_d, i) => {
                            const x = (i / 40) * chartWidth;
                            const idealFreq = maxFreq / (i + 1);
                            const y = chartHeight - (idealFreq / maxFreq) * chartHeight;
                            return `${x},${y}`;
                          }).join(" L ")}`}
                          fill="none"
                          stroke="var(--error)"
                          strokeDasharray="4 2"
                          opacity="0.3"
                        />
                      </svg>
                    </div>
                  )}
                </div>
                <div style={{ width: 240, flexShrink: 0 }}>
                  <div className="muted small mb12" style={{ letterSpacing: "0.1em", textTransform: "uppercase" }}>Common Words</div>
                  {analysis.sortedWords.slice(0, 10).map((w, i) => (
                    <div key={i} className="flex-between" style={{ borderBottom: "1px solid var(--rule)", padding: "4px 0" }}>
                      <span style={{ fontFamily: "var(--mono)", fontSize: 11 }}>{w.word}</span>
                      <span className="muted small">{w.count}x</span>
                    </div>
                  ))}
                  <div className="mt12" style={{ display: "flex", gap: 12, fontSize: 9 }}>
                    <div><span style={{ fontWeight: 600 }}>TTR:</span> {analysis.ttr.toFixed(3)}</div>
                    <div><span style={{ fontWeight: 600 }}>Unique:</span> {analysis.uniqueTypes}</div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
