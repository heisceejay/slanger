import { useState, useCallback, useRef, useEffect } from "react";
import type { Language } from "./lib/api";
import { listLanguages, deleteLanguage } from "./lib/api";
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
  const [navCollapsed, setNavCollapsed] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const exportRef = useRef<HTMLDivElement>(null);

  const activeLang = languages.find((l) => l.meta.id === activeId) ?? null;

  useEffect(() => {
    if (!exportOpen) return;
    const close = (e: MouseEvent) => {
      if (exportRef.current && !exportRef.current.contains(e.target as Node)) setExportOpen(false);
    };
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [exportOpen]);

  // Close mobile nav when view changes
  useEffect(() => { setMobileNavOpen(false); }, [view]);

  const refreshLang = useCallback((updated: Language) => {
    setLanguages((prev) => prev.map((l) => (l.meta.id === updated.meta.id ? updated : l)));
  }, []);

  const reload = useCallback(() => {
    const fresh = listLanguages();
    setLanguages(fresh);
    if (!fresh.find((l) => l.meta.id === activeId)) {
      setActiveId(fresh[0]?.meta.id ?? null);
    }
  }, [activeId]);

  const navItems = [
    { id: "dashboard" as View, icon: "◈", label: "Overview" },
    { id: "phonology" as View, icon: "ʃ", label: "Phonology" },
    { id: "morphology" as View, icon: "∞", label: "Morphology" },
    { id: "syntax" as View, icon: "⊢", label: "Syntax" },
    { id: "lexicon" as View, icon: "≋", label: "Lexicon", count: activeLang?.lexicon.length },
    { id: "corpus" as View, icon: "§", label: "Corpus", count: activeLang?.corpus.length },
  ];

  const NavContent = () => (
    <>
      <div className="nav-section">
        <div className="nav-label">{navCollapsed ? "" : "Languages"}</div>
        {languages.map((l) => (
          <button
            key={l.meta.id}
            className={`nav-item ${l.meta.id === activeId ? "active" : ""}`}
            onClick={() => { setActiveId(l.meta.id); setView("dashboard"); }}
            title={l.meta.name}
          >
            <span className="nav-icon">∴</span>
            {!navCollapsed && <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.meta.name}</span>}
          </button>
        ))}
        {!navCollapsed && (
          <button
            className="btn btn-sm"
            style={{ width: "100%", marginTop: 8, justifyContent: "center" }}
            onClick={() => setView("settings")}
          >
            + New language
          </button>
        )}
        {navCollapsed && (
          <button className="nav-item" onClick={() => setView("settings")} title="New language" style={{ justifyContent: "center" }}>
            <span className="nav-icon">+</span>
          </button>
        )}
      </div>

      <div className="nav-divider" />

      {activeId && (
        <div className="nav-section">
          {!navCollapsed && <div className="nav-label">Editor</div>}
          {navItems.map(({ id, icon, label, count }) => (
            <button
              key={id}
              className={`nav-item ${view === id ? "active" : ""}`}
              onClick={() => setView(id)}
              title={label}
            >
              <span className="nav-icon">{icon}</span>
              {!navCollapsed && label}
              {!navCollapsed && count !== undefined && <span className="nav-count">{count}</span>}
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
            title="Settings"
          >
            <span className="nav-icon">◎</span>
            {!navCollapsed && "Settings"}
          </button>
        </div>
      </div>
    </>
  );

  return (
    <div className={`shell ${navCollapsed ? "nav-collapsed" : ""}`}>
      {/* Mobile overlay */}
      {mobileNavOpen && (
        <div className="mobile-nav-overlay" onClick={() => setMobileNavOpen(false)} />
      )}

      {/* Topbar */}
      <header className="topbar">
        {/* Mobile hamburger */}
        <button
          className="mobile-menu-btn"
          onClick={() => setMobileNavOpen((o) => !o)}
          aria-label="Toggle navigation"
        >
          ☰
        </button>

        {/* Desktop collapse toggle */}
        <button
          className="nav-collapse-btn"
          onClick={() => setNavCollapsed((c) => !c)}
          title={navCollapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {navCollapsed ? "›" : "‹"}
        </button>

        <span className="topbar-wordmark">Slanger</span>
        {activeLang && (
          <>
            <span style={{ opacity: 0.3, fontSize: 16 }}>·</span>
            <span className="topbar-lang">{activeLang.meta.name}</span>
            <span className="tag" style={{ borderColor: "rgba(245,245,240,0.3)", color: "rgba(245,245,240,0.6)", fontSize: 9 }}>
              v{activeLang.meta.version}
            </span>
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

      {/* Sidebar nav — desktop */}
      <nav className={`nav ${navCollapsed ? "nav-collapsed" : ""}`}>
        <NavContent />
      </nav>

      {/* Sidebar nav — mobile slide-in */}
      <nav className={`nav mobile-nav ${mobileNavOpen ? "mobile-nav-open" : ""}`}>
        <NavContent />
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
