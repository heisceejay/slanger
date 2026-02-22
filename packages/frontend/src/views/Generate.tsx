import { useState, useRef, useEffect } from "react";
import type { Language } from "../lib/api";
import { runAutonomousPipeline } from "../lib/api";
import type { StreamEvent } from "../lib/api";

const STEPS = [
  "Designing phoneme inventory",
  "Building morphological paradigms",
  "Generating vocabulary",
  "Generating corpus samples",
  "Running consistency audit",
];

export function GenerateView({
  lang,
  onUpdated,
}: {
  lang: Language;
  onUpdated: (l: Language) => void;
}) {
  const [running, setRunning] = useState(false);
  const [complexity, setComplexity] = useState(0.6);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  const [currentStep, setCurrentStep] = useState(0);
  const [totalSteps, setTotalSteps] = useState(5);
  const [log, setLog] = useState<Array<{ type: string; text: string }>>([]);
  const logRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [log]);

  function appendLog(type: string, text: string) {
    setLog((prev) => [...prev, { type, text }]);
  }

  function handleCancel() {
    cancelRef.current?.();
    setRunning(false);
    appendLog("error", "[ Cancelled by user ]");
  }

  function handleStart() {
    setRunning(true);
    setDone(false);
    setError("");
    setCurrentStep(0);
    setLog([{ type: "progress", text: `[ Starting autonomous generation for ${lang.meta.name} ]` }]);

    const cancel = runAutonomousPipeline(
      lang,
      complexity,
      (event: StreamEvent) => {
        switch (event.type) {
          case "pipeline_progress":
            setCurrentStep(event.step ?? 0);
            setTotalSteps(event.totalSteps ?? 5);
            appendLog("progress", `[ Step ${event.step ?? 0}/${event.totalSteps ?? 5} ] ${event.stepName ?? ""}`);
            break;

          case "operation_complete":
            if (event.result) {
              appendLog(
                "complete",
                `  ✓ ${event.result.operation} — ${event.result.attempt} attempt(s), ${event.result.durationMs}ms`
              );
            }
            break;

          case "pipeline_complete":
            appendLog("complete", `[ Pipeline complete — ${event.totalMs ?? 0}ms ]`);
            setDone(true);
            setRunning(false);
            // Update the language in the parent
            if (event.language) onUpdated(event.language);
            break;

          case "committed":
            // Pipeline complete — language already persisted by api.ts
            if (event.language) {
              onUpdated(event.language);
            }
            break;

          case "pipeline_error":
            appendLog("error", `[ Error at step "${event.step}" ] ${event.message ?? ""}`);
            setError(event.message ?? "");
            setRunning(false);
            break;


        }
      }
    );

    cancelRef.current = cancel;
  }

  const progressPct = totalSteps > 0 ? Math.round((currentStep / totalSteps) * 100) : 0;

  return (
    <>
      <div className="view-header">
        <h1 className="view-title">Generate</h1>
        <span className="view-subtitle">Autonomous AI pipeline</span>
      </div>

      <div className="view-body">
        {/* Controls */}
        <div className="panel mb24 fade-up">
          <div className="panel-head"><span className="panel-title">Autonomous Generation</span></div>
          <div className="panel-body">
            <div className="grid-2">
              <div>
                <p style={{ fontSize: 12, lineHeight: 1.7, opacity: 0.7, marginBottom: 16 }}>
                  Runs all five pipeline steps in sequence: phoneme inventory design, morphological
                  paradigm generation, vocabulary (200+ words), corpus samples, and a final
                  consistency audit. Each step is validated before committing to the database.
                </p>

                <div className="field">
                  <label>Complexity: {Math.round(complexity * 100)}%</label>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={complexity}
                    onChange={(e) => setComplexity(Number(e.target.value))}
                    disabled={running}
                  />
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, opacity: 0.4, marginTop: 4 }}>
                    <span>Simple / Analytic</span>
                    <span>Complex / Polysynthetic</span>
                  </div>
                </div>

                <div style={{ display: "flex", gap: 12, marginTop: 16 }}>
                  {!running ? (
                    <button className="btn btn-fill" onClick={handleStart} disabled={done}>
                      ⊛ Start pipeline
                    </button>
                  ) : (
                    <button className="btn btn-error" onClick={handleCancel}>
                      ✕ Cancel
                    </button>
                  )}
                  {(done || error) && (
                    <button
                      className="btn"
                      onClick={() => {
                        setDone(false);
                        setError("");
                        setLog([]);
                        setCurrentStep(0);
                      }}
                    >
                      Reset
                    </button>
                  )}
                </div>
              </div>

              {/* Step list */}
              <div>
                <div className="muted small mb12" style={{ textTransform: "uppercase", letterSpacing: "0.1em" }}>
                  Pipeline Steps
                </div>
                {STEPS.map((step, i) => {
                  const stepNum = i + 1;
                  const isComplete = done || (running && currentStep > stepNum);
                  const isActive = running && currentStep === stepNum;
                  const isPending = !running && !done;
                  return (
                    <div
                      key={step}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 12,
                        padding: "8px 0",
                        borderBottom: "1px solid var(--rule)",
                        opacity: isPending ? 0.4 : 1,
                      }}
                    >
                      <div
                        style={{
                          width: 20,
                          height: 20,
                          border: "1px solid",
                          borderColor: isComplete ? "var(--ink)" : isActive ? "var(--ink)" : "var(--rule-heavy)",
                          background: isComplete ? "var(--ink)" : "transparent",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          flexShrink: 0,
                        }}
                      >
                        {isComplete && (
                          <span style={{ color: "var(--paper)", fontSize: 9 }}>✓</span>
                        )}
                        {isActive && <span className="spinner" style={{ width: 8, height: 8 }} />}
                      </div>
                      <span style={{ fontSize: 11 }}>{step}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Progress bar */}
            {(running || done) && (
              <div className="mt16">
                <div className="flex-between mb8">
                  <span style={{ fontSize: 9, opacity: 0.5, textTransform: "uppercase", letterSpacing: "0.1em" }}>Progress</span>
                  <span style={{ fontSize: 9, opacity: 0.5 }}>{progressPct}%</span>
                </div>
                <div className="progress-bar-track">
                  <div className="progress-bar-fill" style={{ width: `${done ? 100 : progressPct}%` }} />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Stream log */}
        {log.length > 0 && (
          <div className="panel fade-up-1">
            <div className="panel-head">
              <span className="panel-title">Pipeline Log</span>
              {running && <span className="spinner" style={{ borderTopColor: "var(--paper)" }} />}
              {done && <span style={{ fontSize: 9, color: "#aaa" }}>Complete</span>}
            </div>
            <div className="stream-log" ref={logRef}>
              {log.map((line, i) => (
                <span key={i} className={`stream-log-line ${line.type}`}>
                  {line.text}
                  {"\n"}
                </span>
              ))}
              {running && <span className="stream-log-line progress">▋</span>}
            </div>
          </div>
        )}

        {/* Success state */}
        {done && (
          <div
            className="panel fade-up-2"
            style={{ borderColor: "var(--ink)", marginTop: 16 }}
          >
            <div className="panel-body">
              <div style={{ fontFamily: "var(--serif)", fontStyle: "italic", fontSize: 20, marginBottom: 8 }}>
                Generation complete.
              </div>
              <div style={{ fontSize: 12, opacity: 0.7, lineHeight: 1.7 }}>
                {lang.meta.name} has been updated with a full phonological inventory, morphological
                paradigms, vocabulary, and corpus samples. Navigate to any module to review and
                refine the generated content.
              </div>
            </div>
          </div>
        )}

        {/* Individual operations */}
        {!running && !done && (
          <div className="panel mt16 fade-up-2">
            <div className="panel-head"><span className="panel-title">Individual Operations</span></div>
            <div className="panel-body" style={{ padding: 0 }}>
              {[
                { label: "Suggest phoneme inventory", desc: "Generates a typologically natural consonant/vowel inventory", nav: "phonology" },
                { label: "Fill morphological paradigms", desc: "Completes case, tense, person/number tables", nav: "morphology" },
                { label: "Generate lexicon batch (5 words)", desc: "Adds 5 words per click", nav: "lexicon" },
                { label: "Generate corpus samples", desc: "Creates interlinear-glossed example sentences", nav: "corpus" },
              ].map(({ label, desc }) => (
                <div
                  key={label}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "14px 16px",
                    borderBottom: "1px solid var(--rule)",
                  }}
                >
                  <div>
                    <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 2 }}>
                      {label}
                    </div>
                    <div style={{ fontSize: 10, opacity: 0.5 }}>{desc}</div>
                  </div>
                  <div style={{ fontSize: 10, opacity: 0.3 }}>→</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
