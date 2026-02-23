import { useState, useCallback, useRef, useEffect } from "react";
import type { Language, VersionSnapshot } from "./lib/api";
import { listLanguages, deleteLanguage, rollbackToVersion } from "./lib/api";
import { exportPdf, exportJson } from "./lib/export-pdf";
import { Dashboard } from "./views/Dashboard";
import { PhonologyView } from "./views/Phonology";
import { MorphologyView } from "./views/Morphology";
import { SyntaxView } from "./views/Syntax";
import { LexiconView } from "./views/Lexicon";
import { CorpusView } from "./views/Corpus";
import { SettingsView } from "./views/Settings";

export type View =
  | "dashboard" | "phonology" | "morphology" | "syntax"
  | "lexicon" | "corpus" | "settings";

// ─── App root — no auth, data from sessionStorage ─────────────────────────────

export default function App() {
  const [languages, setLanguages] = useState<Language[]>(() => listLanguages());
  const [activeId, setActiveId] = useState<string | null>(
    () => listLanguages()[0]?.meta.id ?? null
  );
  const [view, setView] = useState<View>("dashboard");
  const [exportOpen, setExportOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const exportRef = useRef<HTMLDivElement>(null);
  const historyRef = useRef<HTMLDivElement>(null);

  const activeLang = languages.find((l) => l.meta.id === activeId) ?? null;
  const versionHistory = activeLang?.meta?.versionHistory ?? [];

  useEffect(() => {
    if (!exportOpen) return;
    const close = (e: MouseEvent) => {
      if (exportRef.current && !exportRef.current.contains(e.target as Node)) setExportOpen(false);
    };
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [exportOpen]);

  useEffect(() => {
    if (!historyOpen) return;
    const close = (e: MouseEvent) => {
      if (historyRef.current && !historyRef.current.contains(e.target as Node)) setHistoryOpen(false);
    };
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [historyOpen]);

  // Called when an LLM op updates a language in sessionStorage
  const refreshLang = useCallback((updated: Language) => {
    setLanguages((prev) => prev.map((l) => (l.meta.id === updated.meta.id ? updated : l)));
  }, []);

  // Re-read from sessionStorage (used after create/delete)
  const reload = useCallback(() => {
    const fresh = listLanguages();
    setLanguages(fresh);
    if (!fresh.find((l) => l.meta.id === activeId)) {
      setActiveId(fresh[0]?.meta.id ?? null);
    }
  }, [activeId]);

  return (
    <div className="shell">
      {/* Topbar */}
      <header className="topbar">
        <span className="topbar-wordmark">Slanger</span>
        {activeLang && (
          <>
            <span style={{ opacity: 0.3, fontSize: 16 }}>·</span>
            <span className="topbar-lang">{activeLang.meta.name}</span>
            <span className="tag" style={{ borderColor: "rgba(245,245,240,0.3)", color: "rgba(245,245,240,0.6)", fontSize: 9 }}>
              v{activeLang.meta.version}
            </span>
            <div ref={historyRef} style={{ position: "relative", marginLeft: 12 }}>
              <button
                type="button"
                className="btn"
                onClick={() => setHistoryOpen((o) => !o)}
                title="Version history"
              >
                🕐 History{versionHistory.length > 0 ? ` (${versionHistory.length})` : ""}
              </button>
              {historyOpen && (
                <div
                  style={{
                    position: "absolute",
                    top: "100%",
                    left: 0,
                    marginTop: 4,
                    background: "var(--paper)",
                    border: "1px solid var(--rule-heavy)",
                    boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
                    zIndex: 100,
                    minWidth: 260,
                    maxHeight: 320,
                    overflowY: "auto",
                  }}
                >
                  {versionHistory.length === 0 ? (
                    <div style={{ padding: 12, fontSize: 11, opacity: 0.6 }}>No snapshots yet. Run an AI step to save history.</div>
                  ) : (
                    versionHistory.map((entry: VersionSnapshot, i: number) => (
                      <div
                        key={i}
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          padding: "8px 12px",
                          borderBottom: "1px solid var(--rule)",
                          gap: 8,
                        }}
                      >
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 11 }}>
                            <span style={{ opacity: 0.5, fontFamily: "var(--mono)", marginRight: 6 }}>
                              v{entry.snapshot.meta.version}
                            </span>
                            {entry.label}
                          </div>
                          <div style={{ fontSize: 9, opacity: 0.4 }}>
                            {new Date(entry.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                          </div>
                        </div>
                        <button
                          type="button"
                          className="btn btn-sm"
                          onClick={() => {
                            const restored = rollbackToVersion(activeLang.meta.id, i);
                            if (restored) refreshLang(restored);
                            setHistoryOpen(false);
                          }}
                        >
                          Restore
                        </button>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
            <div ref={exportRef} style={{ position: "relative", marginLeft: 8 }}>
              <button
                type="button"
                className="btn"
                onClick={() => setExportOpen((o) => !o)}
              >
                ⬇ Export
              </button>
              {exportOpen && (
                <div
                  style={{
                    position: "absolute",
                    top: "100%",
                    left: 0,
                    marginTop: 4,
                    background: "var(--paper)",
                    border: "1px solid var(--rule-heavy)",
                    boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
                    zIndex: 100,
                    minWidth: 140,
                  }}
                >
                  <button
                    type="button"
                    className="btn"
                    style={{ width: "100%", justifyContent: "flex-start", borderRadius: 0 }}
                    onClick={() => { exportPdf(activeLang); setExportOpen(false); }}
                  >
                    PDF
                  </button>
                  <button
                    type="button"
                    className="btn"
                    style={{ width: "100%", justifyContent: "flex-start", borderRadius: 0 }}
                    onClick={() => { exportJson(activeLang); setExportOpen(false); }}
                  >
                    JSON
                  </button>
                </div>
              )}
            </div>
          </>
        )}
        <div className="topbar-right">
          <span style={{ fontSize: 9, opacity: 0.3, letterSpacing: "0.1em", textTransform: "uppercase" }}>
            session · no account needed
          </span>
        </div>
      </header>

      {/* Nav */}
      <nav className="nav">
        <div className="nav-section">
          <div className="nav-label">Languages</div>
          {languages.map((l) => (
            <button
              key={l.meta.id}
              className={`nav-item ${l.meta.id === activeId ? "active" : ""}`}
              onClick={() => { setActiveId(l.meta.id); setView("dashboard"); }}
            >
              <span className="nav-icon">∴</span>
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {l.meta.name}
              </span>
            </button>
          ))}
          <button
            className="btn btn-sm"
            style={{ width: "100%", marginTop: 8, justifyContent: "center" }}
            onClick={() => setView("settings")}
          >
            + New language
          </button>
        </div>

        <div className="nav-divider" />

        {activeId && (
          <div className="nav-section">
            <div className="nav-label">Editor</div>
            {(
              [
                { id: "dashboard", icon: "◈", label: "Overview" },
                { id: "phonology", icon: "ʃ", label: "Phonology" },
                { id: "morphology", icon: "∞", label: "Morphology" },
                { id: "syntax", icon: "⊢", label: "Syntax" },
                { id: "lexicon", icon: "≋", label: "Lexicon", count: activeLang?.lexicon.length },
                { id: "corpus", icon: "§", label: "Corpus", count: activeLang?.corpus.length },
              ] as Array<{ id: View; icon: string; label: string; count?: number }>
            ).map(({ id, icon, label, count }) => (
              <button
                key={id}
                className={`nav-item ${view === id ? "active" : ""}`}
                onClick={() => setView(id)}
              >
                <span className="nav-icon">{icon}</span>
                {label}
                {count !== undefined && <span className="nav-count">{count}</span>}
              </button>
            ))}
          </div>
        )}



        <div style={{ marginTop: "auto" }}>
          <div className="nav-divider" />
          <div className="nav-section">
            <button
              className={`nav-item ${view === "settings" ? "active" : ""}`}
              onClick={() => setView("settings")}
            >
              <span className="nav-icon">◎</span>
              Settings
            </button>
          </div>
        </div>
      </nav>

      {/* Main content */}
      <main className="main">
        {view === "settings" || !activeId ? (
          <SettingsView
            languages={languages}
            onCreated={(lang) => {
              reload();
              setActiveId(lang.meta.id);
              setView("dashboard");
            }}
            onDeleted={(id) => {
              deleteLanguage(id);
              reload();
              setView("dashboard");
            }}
          />
        ) : activeLang ? (
          <>
            {view === "dashboard" && <Dashboard lang={activeLang} onRefresh={reload} onNavigate={setView} />}
            {view === "phonology" && <PhonologyView lang={activeLang} onUpdated={refreshLang} />}
            {view === "morphology" && <MorphologyView lang={activeLang} onUpdated={refreshLang} />}
            {view === "syntax" && <SyntaxView lang={activeLang} onUpdated={refreshLang} />}
            {view === "lexicon" && <LexiconView lang={activeLang} onUpdated={refreshLang} />}
            {view === "corpus" && <CorpusView lang={activeLang} onUpdated={refreshLang} />}

          </>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: 12 }}>
            <div style={{ fontFamily: "var(--serif)", fontStyle: "italic", fontSize: 48, opacity: 0.1 }}>∴</div>
            <div className="small muted">Create a language to begin</div>
            <button className="btn btn-fill" onClick={() => setView("settings")}>+ New language</button>
          </div>
        )}
      </main>
    </div>
  );
}
