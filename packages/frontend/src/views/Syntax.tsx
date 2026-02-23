import { useState, useCallback, useEffect } from "react";
import type { Language } from "../lib/api";
import { updateLanguage } from "../lib/api";
import type { SyntaxConfig, PhraseStructureSlot } from "@slanger/shared-types";

// ... existing constants ...
const WORD_ORDERS = ["SOV", "SVO", "VSO", "VOS", "OVS", "OSV", "free"] as const;
const ALIGNMENTS = [
  "nominative-accusative",
  "ergative-absolutive",
  "tripartite",
  "split-ergative",
  "active-stative",
] as const;
const HEADEDNESS = ["head-marking", "dependent-marking", "double-marking"] as const;
const ADPOSITION_TYPES = ["preposition", "postposition", "both", "none"] as const;

const CONSTITUENT_LABELS = ["N", "V", "Det", "Adj", "Adv", "P", "NP", "VP", "PP", "AP", "CP", "DP", "C", "T", "custom..."];
const CLAUSE_TYPE_OPTIONS = [
  "declarative",
  "polar-interrogative",
  "content-interrogative",
  "imperative",
  "relative",
  "complement",
  "conditional",
  "exclamative",
] as const;

const WORD_ORDER_DESC: Record<string, string> = {
  SOV: "Subject · Object · Verb — the most common word order globally (Turkish, Japanese, Hindi)",
  SVO: "Subject · Verb · Object — dominant in English, Mandarin, Romance languages",
  VSO: "Verb · Subject · Object — common in Celtic languages, Classical Arabic, Hebrew",
  VOS: "Verb · Object · Subject — found in Malagasy, some Mayan languages",
  OVS: "Object · Verb · Subject — rare; found in Hixkaryana and some Amazonian languages",
  OSV: "Object · Subject · Verb — extremely rare; found in some Tibeto-Burman languages",
  free: "Free word order — grammatical relations marked morphologically (Latin, Russian)",
};

const ALIGNMENT_DESC: Record<string, string> = {
  "nominative-accusative": "Subject of intransitive = subject of transitive; object is distinct (English, Latin)",
  "ergative-absolutive": "Subject of intransitive = object of transitive; agents are distinct (Basque, Dyirbal)",
  tripartite: "All three roles (S, A, O) marked distinctly — typologically rare",
  "split-ergative": "Ergative in some contexts, nominative-accusative in others",
  "active-stative": "Alignment varies based on verb semantics or animacy — split-intransitive",
};

export function SyntaxView({
  lang,
  onUpdated,
}: {
  lang: Language;
  onUpdated: (l: Language) => void;
}) {
  const syn = lang.syntax;
  const [editingStructure, setEditingStructure] = useState<SyntaxConfig["phraseStructure"]>(syn.phraseStructure);
  const [autoDerivedWarning, setAutoDerivedWarning] = useState(false);
  const [draggedItem, setDraggedItem] = useState<{ phraseType: string; slotIndex: number } | null>(null);
  const [addingPhraseType, setAddingPhraseType] = useState(false);
  const [newPhraseTypeLabel, setNewPhraseTypeLabel] = useState("");

  // Sync upward when local editable structure changes
  useEffect(() => {
    // Only dispatch if actually different to avoid infinite loops, though object references changing will trigger it
    if (JSON.stringify(editingStructure) !== JSON.stringify(syn.phraseStructure)) {
      updateLanguage(lang.meta.id, { syntax: { ...syn, phraseStructure: editingStructure } });
      onUpdated(lang); // Note: local state drives it, so we don't strictly need to rely on the server roundtrip for rendering
    }
  }, [editingStructure, syn.phraseStructure, lang.meta.id, syn, onUpdated, lang]);

  // Derived Phrase Structure Logic based on Word Order & Adposition
  function derivePhraseStructure(wo: SyntaxConfig["wordOrder"], adpo: SyntaxConfig["adpositionType"]): SyntaxConfig["phraseStructure"] {
    const rules: SyntaxConfig["phraseStructure"] = { ...editingStructure };

    // VP rules based on verb position
    if (wo === "VSO" || wo === "VOS") {
      rules["VP"] = [{ label: "V", optional: false, repeatable: false }, { label: "NP", optional: true, repeatable: false }];
    } else if (wo === "SOV" || wo === "OVS") {
      rules["VP"] = [{ label: "NP", optional: true, repeatable: false }, { label: "V", optional: false, repeatable: false }];
    } else {
      // SVO, OSV, free
      rules["VP"] = [{ label: "V", optional: false, repeatable: false }, { label: "NP", optional: true, repeatable: false }];
    }

    // PP / NP branching based on adposition
    if (adpo === "postposition") {
      rules["PP"] = [{ label: "NP", optional: false, repeatable: false }, { label: "P", optional: false, repeatable: false }];
      // Left-branching NPs are typological for postpositional languages
      rules["NP"] = [{ label: "Det", optional: true, repeatable: false }, { label: "Adj", optional: true, repeatable: true }, { label: "N", optional: false, repeatable: false }];
    } else if (adpo === "preposition") {
      rules["PP"] = [{ label: "P", optional: false, repeatable: false }, { label: "NP", optional: false, repeatable: false }];
      // Right-branching NPs are typological for prepositional languages
      rules["NP"] = [{ label: "Det", optional: true, repeatable: false }, { label: "N", optional: false, repeatable: false }, { label: "Adj", optional: true, repeatable: true }];
    } else {
      // Mixed or none - default to right-branching head-initial
      if (!rules["PP"]) rules["PP"] = [{ label: "P", optional: false, repeatable: false }, { label: "NP", optional: false, repeatable: false }];
      if (!rules["NP"]) rules["NP"] = [{ label: "Det", optional: true, repeatable: false }, { label: "N", optional: false, repeatable: false }, { label: "Adj", optional: true, repeatable: true }];
    }

    if (!rules["S"]) {
      if (wo === "VSO" || wo === "VOS") {
        rules["S"] = [{ label: "VP", optional: false, repeatable: false }, { label: "NP", optional: false, repeatable: false }];
      } else {
        rules["S"] = [{ label: "NP", optional: false, repeatable: false }, { label: "VP", optional: false, repeatable: false }];
      }
    }

    return rules;
  }

  const handleSyntaxChange = useCallback(
    (patch: Partial<Language["syntax"]>) => {
      let nextPhraseStructure = editingStructure;
      let showWarning = false;

      if (patch.wordOrder || patch.adpositionType) {
        const wo = (patch.wordOrder ?? syn.wordOrder) as SyntaxConfig["wordOrder"];
        const adpo = (patch.adpositionType ?? syn.adpositionType) as SyntaxConfig["adpositionType"];
        nextPhraseStructure = derivePhraseStructure(wo, adpo);
        setEditingStructure(nextPhraseStructure);
        showWarning = true;
        setAutoDerivedWarning(showWarning);
      }

      const next = { ...syn, ...patch, phraseStructure: nextPhraseStructure };
      const updated = updateLanguage(lang.meta.id, { syntax: next });
      if (updated) onUpdated(updated);
    },
    [lang.meta.id, syn, onUpdated, editingStructure]
  );


  const wordOrderParts = syn.wordOrder === "free"
    ? ["Free", "Word", "Order"]
    : syn.wordOrder.split("").map((l) =>
      l === "S" ? "Subject" : l === "V" ? "Verb" : "Object"
    );

  const toggleClauseType = (ct: string) => {
    const current = syn.clauseTypes.slice();
    const idx = current.indexOf(ct);
    if (idx >= 0) {
      if (current.length <= 1) return;
      current.splice(idx, 1);
    } else {
      current.push(ct);
      current.sort((a, b) => CLAUSE_TYPE_OPTIONS.indexOf(a as typeof CLAUSE_TYPE_OPTIONS[number]) - CLAUSE_TYPE_OPTIONS.indexOf(b as typeof CLAUSE_TYPE_OPTIONS[number]));
    }
    handleSyntaxChange({ clauseTypes: current });
  };

  const hasPhonology = (lang.phonology?.inventory?.consonants?.length ?? 0) > 0 && (lang.phonology?.inventory?.vowels?.length ?? 0) > 0;
  const hasMorphology = Object.values(lang.morphology?.categories ?? {}).some(c => c.length > 0) || Object.keys(lang.morphology?.paradigms ?? {}).length > 0;
  const canEditSyntax = hasPhonology && hasMorphology;

  return (
    <>
      <div className="view-header">
        <h1 className="view-title">Syntax</h1>
        <span className="view-subtitle">{syn.wordOrder} · {syn.alignment}</span>
      </div>

      <div className="view-body">

        {!canEditSyntax ? (
          <div className="panel" style={{ padding: 40, textAlign: "center", borderStyle: "dashed", opacity: 0.8 }}>
            <div className="muted mb16" style={{ fontSize: 12 }}>
              Syntax definition is locked until you define your language's basic profile.
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
                  <span className="muted small">Define categories or fill paradigms first.</span>
                </div>
              )}
            </div>
          </div>
        ) : (
          <>
            <div className="grid-2 fade-up">
              {/* Word order — editable */}
              <div className="panel">
                <div className="panel-head"><span className="panel-title">Word Order</span></div>
                <div className="panel-body">
                  <select
                    value={syn.wordOrder}
                    onChange={(e) => handleSyntaxChange({ wordOrder: e.target.value as SyntaxConfig["wordOrder"] })}
                    style={{
                      width: "100%",
                      padding: "10px 12px",
                      fontFamily: "var(--mono)",
                      fontSize: 14,
                      marginBottom: 12,
                      border: "1px solid var(--rule-heavy)",
                      background: "var(--paper)",
                      color: "var(--ink)",
                    }}
                  >
                    {WORD_ORDERS.map((wo) => (
                      <option key={wo} value={wo}>{wo}</option>
                    ))}
                  </select>
                  <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
                    {wordOrderParts.map((part, i) => (
                      <div key={i}>
                        <div
                          style={{
                            background: "var(--ink)",
                            color: "var(--paper)",
                            padding: "12px 16px",
                            fontFamily: "var(--serif)",
                            fontStyle: "italic",
                            fontSize: 22,
                            minWidth: 60,
                            textAlign: "center",
                          }}
                        >
                          {part.charAt(0)}
                        </div>
                        <div style={{ fontSize: 8, textAlign: "center", marginTop: 4, opacity: 0.4, textTransform: "uppercase", letterSpacing: "0.1em" }}>
                          {part}
                        </div>
                      </div>
                    ))}
                  </div>
                  <div style={{ fontSize: 11, lineHeight: 1.6, opacity: 0.6 }}>
                    {WORD_ORDER_DESC[syn.wordOrder] ?? "Custom word order"}
                  </div>
                </div>
              </div>

              {/* Alignment — editable */}
              <div className="panel">
                <div className="panel-head"><span className="panel-title">Morphosyntactic Alignment</span></div>
                <div className="panel-body">
                  <select
                    value={syn.alignment}
                    onChange={(e) => handleSyntaxChange({ alignment: e.target.value })}
                    style={{
                      width: "100%",
                      padding: "10px 12px",
                      fontFamily: "var(--mono)",
                      fontSize: 14,
                      marginBottom: 12,
                      border: "1px solid var(--rule-heavy)",
                      background: "var(--paper)",
                      color: "var(--ink)",
                    }}
                  >
                    {ALIGNMENTS.map((a) => (
                      <option key={a} value={a}>{a}</option>
                    ))}
                  </select>
                  <div style={{ fontSize: 11, lineHeight: 1.6, opacity: 0.6 }}>
                    {ALIGNMENT_DESC[syn.alignment] ?? "Custom alignment system"}
                  </div>
                </div>
              </div>
            </div>

            <div className="grid-2 fade-up-1">
              {/* Clause types — editable */}
              <div className="panel">
                <div className="panel-head"><span className="panel-title">Clause Types</span></div>
                <div className="panel-body" style={{ padding: 0 }}>
                  {CLAUSE_TYPE_OPTIONS.map((ct) => {
                    const active = syn.clauseTypes.includes(ct);
                    return (
                      <div
                        key={ct}
                        onClick={() => toggleClauseType(ct)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => e.key === "Enter" && toggleClauseType(ct)}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          padding: "12px 16px",
                          borderBottom: "1px solid var(--rule)",
                          cursor: "pointer",
                          background: active ? "rgba(0,0,0,0.04)" : "transparent",
                        }}
                      >
                        <span style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.08em" }}>{ct}</span>
                        <span style={{ fontFamily: "var(--mono)", fontSize: 14, opacity: active ? 0.8 : 0.3 }}>
                          {active ? "✓" : "—"}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Headedness & Adposition — editable */}
              <div className="panel">
                <div className="panel-head"><span className="panel-title">Properties</span></div>
                <div className="panel-body">
                  <div className="field" style={{ marginBottom: 16 }}>
                    <label style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: "0.1em", opacity: 0.5 }}>Headedness</label>
                    <select
                      value={syn.headedness}
                      onChange={(e) => handleSyntaxChange({ headedness: e.target.value })}
                      style={{
                        width: "100%",
                        padding: "10px 12px",
                        fontFamily: "var(--mono)",
                        fontSize: 12,
                        border: "1px solid var(--rule-heavy)",
                        background: "var(--paper)",
                        color: "var(--ink)",
                      }}
                    >
                      {HEADEDNESS.map((h) => (
                        <option key={h} value={h}>{h}</option>
                      ))}
                    </select>
                  </div>
                  <div className="field">
                    <label style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: "0.1em", opacity: 0.5 }}>Adposition type</label>
                    <select
                      value={syn.adpositionType}
                      onChange={(e) => handleSyntaxChange({ adpositionType: e.target.value as Language["syntax"]["adpositionType"] })}
                      style={{
                        width: "100%",
                        padding: "10px 12px",
                        fontFamily: "var(--mono)",
                        fontSize: 12,
                        border: "1px solid var(--rule-heavy)",
                        background: "var(--paper)",
                        color: "var(--ink)",
                      }}
                    >
                      {ADPOSITION_TYPES.map((a) => (
                        <option key={a} value={a}>{a}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            </div>

            {/* Phrase structure */}
            <div className="panel mt16 fade-up-2">
              <div className="panel-head"><span className="panel-title">Phrase Structure Rules</span></div>
              <div className="panel-body">
                {autoDerivedWarning && (
                  <div
                    style={{
                      background: "var(--paper)",
                      border: "1px solid var(--rule-heavy)",
                      padding: "8px 12px",
                      fontSize: 11,
                      marginBottom: 16,
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                    }}
                  >
                    <div style={{ color: "var(--ink)", fontWeight: "bold" }}>ⓘ</div>
                    Word order or adposition type changed — phrase structure has been auto-updated to match. You can further adjust below.
                    <button onClick={() => setAutoDerivedWarning(false)} style={{ marginLeft: "auto", background: "none", border: "none", cursor: "pointer", opacity: 0.5 }}>×</button>
                  </div>
                )}

                {Object.keys(editingStructure).length === 0 ? (
                  <div className="muted small mb16">No phrase structure defined</div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 16 }}>
                    {(Object.entries(editingStructure) as [string, PhraseStructureSlot[]][]).map(([phraseType, slots]) => (
                      <div key={phraseType} style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", paddingBottom: 8, borderBottom: "1px dashed var(--rule)" }}>
                        {/* LHS Rule Identity */}
                        <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 60 }}>
                          <button
                            title={`Delete ${phraseType} rule`}
                            onClick={() => {
                              const next = { ...editingStructure };
                              delete next[phraseType];
                              setEditingStructure(next);
                            }}
                            style={{
                              background: "none",
                              border: "none",
                              color: "var(--error)",
                              opacity: 0.5,
                              cursor: "pointer",
                              fontSize: 14,
                            }}
                          >×</button>
                          <span style={{ fontStyle: "italic", fontFamily: "var(--mono)", color: "var(--ink)", fontWeight: 700 }}>{phraseType}</span>
                          <span style={{ opacity: 0.4, fontFamily: "var(--mono)" }}>→</span>
                        </div>

                        {/* RHS Drag and Drop Zone */}
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", flex: 1 }}>
                          {(slots as PhraseStructureSlot[]).map((slot: PhraseStructureSlot, index: number) => (
                            <div
                              key={`${phraseType}-${index}`}
                              draggable
                              onDragStart={(e) => {
                                setDraggedItem({ phraseType, slotIndex: index });
                                e.dataTransfer.effectAllowed = "move";
                                // For Firefox compatibility
                                e.dataTransfer.setData("text/plain", `${phraseType}:${index}`);
                              }}
                              onDragOver={(e) => {
                                e.preventDefault(); // Necessary to allow dropping
                                e.dataTransfer.dropEffect = "move";
                              }}
                              onDrop={(e) => {
                                e.preventDefault();
                                if (!draggedItem || draggedItem.phraseType !== phraseType) return;
                                const newSlots = [...(slots as PhraseStructureSlot[])];
                                const [movedItem] = newSlots.splice(draggedItem.slotIndex, 1);
                                if (movedItem) {
                                  newSlots.splice(index, 0, movedItem);
                                  setEditingStructure({ ...editingStructure, [phraseType]: newSlots });
                                }
                                setDraggedItem(null);
                              }}
                              onDragEnd={() => setDraggedItem(null)}
                              style={{
                                display: "flex",
                                alignItems: "center",
                                background: "var(--paper)",
                                border: "1px solid var(--rule)",
                                padding: "4px 8px",
                                opacity: draggedItem?.phraseType === phraseType && draggedItem.slotIndex === index ? 0.4 : 1,
                                cursor: "grab",
                                fontFamily: "var(--mono)",
                                fontSize: 12,
                                boxShadow: "0 1px 2px rgba(0,0,0,0.05)"
                              }}
                            >
                              <span style={{ cursor: "grab", opacity: 0.3, marginRight: 6 }}>⋮⋮</span>

                              {/* Label Select/Input */}
                              {CONSTITUENT_LABELS.includes(slot.label) || slot.label === "custom..." ? (
                                <select
                                  value={CONSTITUENT_LABELS.includes(slot.label) ? slot.label : "custom..."}
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    if (val === "custom...") {
                                      // Transform it into a custom string that isn't exactly "custom..." so the input shows up
                                      const next = [...(slots as PhraseStructureSlot[])];
                                      next[index] = { ...slot, label: "X" };
                                      setEditingStructure({ ...editingStructure, [phraseType]: next });
                                    } else {
                                      const next = [...(slots as PhraseStructureSlot[])];
                                      next[index] = { ...slot, label: val };
                                      setEditingStructure({ ...editingStructure, [phraseType]: next });
                                    }
                                  }}
                                  style={{
                                    appearance: "none", border: "none", background: "transparent",
                                    padding: "0 4px", outline: "none", fontFamily: "inherit", fontSize: "inherit",
                                    fontStyle: slot.optional ? "italic" : "normal",
                                    cursor: "pointer"
                                  }}
                                >
                                  {CONSTITUENT_LABELS.map(l => <option key={l} value={l}>{l}</option>)}
                                </select>
                              ) : (
                                <input
                                  type="text"
                                  value={slot.label}
                                  onChange={(e) => {
                                    const next = [...(slots as PhraseStructureSlot[])];
                                    next[index] = { ...slot, label: e.target.value };
                                    setEditingStructure({ ...editingStructure, [phraseType]: next });
                                  }}
                                  style={{
                                    width: Math.max(20, slot.label.length * 8) + 'px', outline: "none", border: "1px dashed var(--rule)",
                                    background: "transparent", padding: "0 2px", fontFamily: "inherit", fontSize: "inherit"
                                  }}
                                  autoFocus
                                />
                              )}

                              {/* Controls */}
                              <div style={{ display: "flex", alignItems: "center", marginLeft: 8, gap: 4, opacity: 0.7 }}>
                                <button
                                  title="Toggle Optional"
                                  onClick={() => {
                                    const next = [...(slots as PhraseStructureSlot[])];
                                    next[index] = { ...slot, optional: !slot.optional };
                                    setEditingStructure({ ...editingStructure, [phraseType]: next });
                                  }}
                                  style={{ background: "none", border: "none", cursor: "pointer", fontSize: 10, padding: 2, fontWeight: slot.optional ? "bold" : "normal", color: slot.optional ? "var(--ink)" : "" }}
                                >{slot.optional ? "( )" : "(-)"}</button>
                                <button
                                  title="Toggle Repeatable"
                                  onClick={() => {
                                    const next = [...(slots as PhraseStructureSlot[])];
                                    next[index] = { ...slot, repeatable: !slot.repeatable };
                                    setEditingStructure({ ...editingStructure, [phraseType]: next });
                                  }}
                                  style={{ background: "none", border: "none", cursor: "pointer", fontSize: 12, padding: 2, fontWeight: slot.repeatable ? "bold" : "normal", color: slot.repeatable ? "var(--ink)" : "" }}
                                >⁺</button>
                                <button
                                  title="Remove Slot"
                                  onClick={() => {
                                    const next = [...(slots as PhraseStructureSlot[])];
                                    next.splice(index, 1);
                                    setEditingStructure({ ...editingStructure, [phraseType]: next });
                                  }}
                                  style={{ background: "none", border: "none", cursor: "pointer", fontSize: 12, padding: 2 }}
                                >×</button>
                              </div>
                            </div>
                          ))}

                          <button
                            onClick={() => {
                              const next = [...(slots as PhraseStructureSlot[])];
                              next.push({ label: "N", optional: false, repeatable: false });
                              setEditingStructure({ ...editingStructure, [phraseType]: next });
                            }}
                            style={{
                              background: "transparent",
                              border: "1px dashed var(--rule-heavy)",
                              padding: "4px 8px",
                              fontSize: 11,
                              cursor: "pointer",
                              opacity: 0.6,
                            }}
                          >+ Add Slot</button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {!addingPhraseType ? (
                  <button
                    className="btn btn-sm"
                    onClick={() => setAddingPhraseType(true)}
                  >
                    + Add Phrase Type
                  </button>
                ) : (
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <span style={{ fontFamily: "var(--mono)", opacity: 0.5 }}>New:</span>
                    <input
                      type="text"
                      placeholder="e.g. AdvP"
                      value={newPhraseTypeLabel}
                      onChange={(e) => setNewPhraseTypeLabel(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && newPhraseTypeLabel.trim()) {
                          const next = { ...editingStructure, [newPhraseTypeLabel.trim()]: [] };
                          setEditingStructure(next);
                          setNewPhraseTypeLabel("");
                          setAddingPhraseType(false);
                        }
                      }}
                      autoFocus
                      style={{
                        padding: "4px 8px",
                        fontFamily: "var(--mono)",
                        border: "1px solid var(--rule-heavy)",
                        background: "var(--paper)",
                        color: "var(--ink)",
                        width: 100,
                      }}
                    />
                    <button
                      className="btn btn-sm"
                      onClick={() => {
                        if (newPhraseTypeLabel.trim()) {
                          const next = { ...editingStructure, [newPhraseTypeLabel.trim()]: [] };
                          setEditingStructure(next);
                        }
                        setNewPhraseTypeLabel("");
                        setAddingPhraseType(false);
                      }}
                    >
                      Create
                    </button>
                    <button
                      onClick={() => setAddingPhraseType(false)}
                      style={{ background: "none", border: "none", cursor: "pointer", opacity: 0.5 }}
                    >×</button>
                  </div>
                )}
              </div>
            </div>

            {/* Sample sentence structure */}
            {lang.lexicon.length > 0 && (
              <div className="panel mt16 fade-up-3">
                <div className="panel-head"><span className="panel-title">Sample Structure</span></div>
                <div className="panel-body">
                  <div style={{ display: "flex", gap: 24, alignItems: "flex-start" }}>
                    {syn.wordOrder === "free" ? (
                      <div style={{ fontFamily: "var(--serif)", fontStyle: "italic", fontSize: 16, opacity: 0.7 }}>
                        Free word order — structure depends on morphology
                      </div>
                    ) : (
                      syn.wordOrder.split("").map((role, i) => {
                        const noun = lang.lexicon.find((e) => e.pos === "noun");
                        const verb = lang.lexicon.find((e) => e.pos === "verb");
                        const entry = role === "V" ? verb : noun;
                        const gloss = role === "S" ? "SUBJ" : role === "O" ? "OBJ" : "VERB";
                        return (
                          <div key={i} style={{ textAlign: "center" }}>
                            <div style={{ fontFamily: "var(--mono)", fontSize: 18, fontStyle: "italic", marginBottom: 4 }}>
                              {entry?.orthographicForm ?? `[${role}]`}
                            </div>
                            <div style={{ fontSize: 9, letterSpacing: "0.12em", textTransform: "uppercase", opacity: 0.5 }}>
                              {gloss}
                            </div>
                            <div style={{ fontSize: 10, opacity: 0.4, marginTop: 2 }}>
                              {entry?.glosses[0] ?? "—"}
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}
