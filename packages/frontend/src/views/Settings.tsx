import { useState, useRef } from "react";
import type { Language } from "../lib/api";
import { createLanguage, deleteLanguage, importLanguageFromJson } from "../lib/api";

export function SettingsView({
  languages,
  onCreated,
  onDeleted,
}: {
  languages: Language[];
  onCreated: (lang: Language) => void;
  onDeleted: (id: string) => void;
}) {
  const [name, setName] = useState("");
  const [world, setWorld] = useState("");
  const [tags, setTags] = useState("");
  const [preset, setPreset] = useState<"naturalistic" | "experimental">("naturalistic");
  const [naturalismScore, setNaturalismScore] = useState(0.7);
  const [creating, setCreating] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleCreate() {
    if (!name.trim()) return;
    setCreating(true);
    setError("");
    try {
      const lang = createLanguage({
        name: name.trim(),
        world: world.trim() || undefined,
        tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
        preset,
        naturalismScore,
      });
      onCreated(lang);
      setName("");
      setWorld("");
      setTags("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setCreating(false);
    }
  }

  async function handleImportJson(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setImporting(true);
    setError("");
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as unknown;
      const lang = importLanguageFromJson(parsed);
      onCreated(lang);
      event.target.value = "";
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setImporting(false);
    }
  }

  async function handleDelete(id: string) {
    try {
      deleteLanguage(id);
      onDeleted(id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setDeleteConfirm(null);
    }
  }

  return (
    <>
      <div className="view-header">
        <h1 className="view-title">Settings</h1>
        <span className="view-subtitle">Languages & configuration</span>
      </div>

      <div className="view-body">
        {error && <div style={{ color: "var(--error)", fontSize: 11, marginBottom: 16 }}>{error}</div>}

        {/* Create language */}
        <div className="panel mb24 fade-up">
          <div className="panel-head"><span className="panel-title">New Language</span></div>
          <div className="panel-body">
            <div className="grid-2">
              <div>
                <div className="field">
                  <label>Language Name *</label>
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="My Conlang"
                    autoFocus
                  />
                </div>
                <div className="field">
                  <label>World / Setting</label>
                  <input
                    value={world}
                    onChange={(e) => setWorld(e.target.value)}
                    placeholder="An island empire of nomadic scholars"
                  />
                </div>
                <div className="field">
                  <label>Tags (comma-separated)</label>
                  <input
                    value={tags}
                    onChange={(e) => setTags(e.target.value)}
                    placeholder="agglutinative, SOV, tonal"
                  />
                </div>
              </div>
              <div>
                <div className="field">
                  <label>Preset</label>
                  <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                    {(["naturalistic", "experimental"] as const).map((p) => (
                      <button
                        key={p}
                        onClick={() => setPreset(p)}
                        style={{
                          flex: 1,
                          fontFamily: "var(--mono)",
                          fontSize: 10,
                          letterSpacing: "0.1em",
                          textTransform: "uppercase",
                          padding: "10px",
                          border: "1px solid",
                          borderColor: preset === p ? "var(--ink)" : "var(--rule-heavy)",
                          background: preset === p ? "var(--ink)" : "transparent",
                          color: preset === p ? "var(--paper)" : "var(--ink)",
                          cursor: "pointer",
                          transition: "var(--transition)",
                        }}
                      >
                        {p}
                      </button>
                    ))}
                  </div>
                  <div style={{ fontSize: 10, opacity: 0.5, marginTop: 8, lineHeight: 1.5 }}>
                    {preset === "naturalistic"
                      ? "Draws from typologically attested patterns. Avoids implausible phonology."
                      : "Allows unusual features: clicks, complex tone, rare syllable shapes."}
                  </div>
                </div>

                <div className="field">
                  <label>Naturalism Score: {Math.round(naturalismScore * 100)}%</label>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={naturalismScore}
                    onChange={(e) => setNaturalismScore(Number(e.target.value))}
                  />
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, opacity: 0.4, marginTop: 4 }}>
                    <span>Experimental</span>
                    <span>Naturalistic</span>
                  </div>
                </div>

                <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 8 }}>
                  <button
                    className="btn btn-fill"
                    onClick={handleCreate}
                    disabled={creating || !name.trim()}
                  >
                    {creating ? <span className="spinner" style={{ borderTopColor: "var(--paper)" }} /> : null}
                    Create language
                  </button>
                </div>
              </div>
            </div>
            <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid var(--rule)" }}>
              <div className="muted small mb8" style={{ letterSpacing: "0.1em", textTransform: "uppercase" }}>Or import from JSON</div>
              <p style={{ fontSize: 11, opacity: 0.7, marginBottom: 8 }}>
                Restore a previously exported language (e.g. from Export → JSON).
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".json,application/json"
                onChange={handleImportJson}
                style={{ display: "none" }}
              />
              <button
                type="button"
                className="btn"
                disabled={importing}
                onClick={() => fileInputRef.current?.click()}
              >
                {importing ? <span className="spinner" /> : "📂"}
                Choose JSON file…
              </button>
            </div>
          </div>
        </div>

        {/* Existing languages */}
        {languages.length > 0 && (
          <div className="panel fade-up-1">
            <div className="panel-head"><span className="panel-title">All Languages</span></div>
            <div style={{ padding: 0 }}>
              {languages.map((lang) => (
                <div
                  key={lang.meta.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    padding: "16px 16px",
                    borderBottom: "1px solid var(--rule)",
                    gap: 16,
                  }}
                >
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 4 }}>
                      <span
                        style={{
                          fontFamily: "var(--serif)",
                          fontStyle: "italic",
                          fontSize: 18,
                        }}
                      >
                        {lang.meta.name}
                      </span>
                      <span className="tag">v{lang.meta.version}</span>
                      <span className="tag">{lang.meta.preset}</span>
                    </div>
                    <div style={{ fontSize: 10, opacity: 0.4, display: "flex", gap: 16 }}>
                      <span>{lang.lexicon.length} entries</span>
                      <span>{lang.corpus.length} corpus samples</span>
                      {lang.meta.world && <span style={{ fontStyle: "italic" }}>{lang.meta.world}</span>}
                    </div>
                    {lang.meta.tags.length > 0 && (
                      <div style={{ marginTop: 6, display: "flex", gap: 4 }}>
                        {lang.meta.tags.map((t) => (
                          <span key={t} className="tag" style={{ fontSize: 8 }}>{t}</span>
                        ))}
                      </div>
                    )}
                  </div>

                  <div>
                    {deleteConfirm === lang.meta.id ? (
                      <div style={{ display: "flex", gap: 8 }}>
                        <span style={{ fontSize: 10, opacity: 0.6, alignSelf: "center" }}>Confirm?</span>
                        <button className="btn btn-sm btn-error" onClick={() => handleDelete(lang.meta.id)}>
                          Delete
                        </button>
                        <button className="btn btn-sm" onClick={() => setDeleteConfirm(null)}>
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        className="btn btn-sm"
                        style={{ borderColor: "var(--rule-heavy)", opacity: 0.5 }}
                        onClick={() => setDeleteConfirm(lang.meta.id)}
                      >
                        Delete
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {languages.length === 0 && (
          <div className="empty-state fade-up-1">
            <div className="empty-state-glyph">∴</div>
            <div className="small muted">No languages created yet</div>
          </div>
        )}
      </div>
    </>
  );
}
