/**
 * Slanger API client
 *
 * Languages live entirely in sessionStorage — cleared when the browser tab closes.
 * LLM operations POST the full LanguageDefinition to the backend (stateless Groq
 * proxy) and return an updated LanguageDefinition. No accounts, no login.
 */

const API_BASE = import.meta.env.VITE_API_URL ?? "http://localhost:3001";
const BASE = `${API_BASE}/v1`;

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const err = await res.json() as { errors?: { message: string }[] };
      msg = err.errors?.[0]?.message ?? msg;
    } catch { /* use default */ }
    throw new Error(msg);
  }
  return res.json() as Promise<T>;
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface LanguageMeta {
  id: string;
  name: string;
  world?: string;
  tags: string[];
  version: number;
  preset: string;
  naturalismScore: number;
  createdAt: string;
  updatedAt: string;
  authorId?: string;
}

export interface PhonologyConfig {
  inventory: { consonants: string[]; vowels: string[]; tones: string[] };
  phonotactics: {
    syllableTemplates: string[];
    onsetClusters: string[][];
    codaClusters: string[][];
    allophonyRules: { phoneme: string; allophone: string; environment: string; position?: string }[];
  };
  orthography: Record<string, string>;
  suprasegmentals: {
    hasLexicalTone: boolean;
    hasPhonemicStress: boolean;
    hasVowelLength: boolean;
    hasPhonemicNasalization: boolean;
  };
}

export interface MorphologyConfig {
  typology: string;
  categories: Record<string, string[]>;
  paradigms: Record<string, Record<string, string>>;
  morphemeOrder: string[];
  derivationalRules: { id: string; sourcePos: string; targetPos: string; label: string; affix: string; affixType: string }[];
  alternationRules: { id: string; trigger?: string; input?: string; output?: string; boundary?: string; description?: string; pattern?: string; example?: string }[];
}

export interface SyntaxConfig {
  wordOrder: string;
  alignment: string;
  phraseStructure: Record<string, { label: string; optional: boolean; repeatable: boolean }[]>;
  clauseTypes: string[];
  headedness: string;
  adpositionType: string;
}

export interface LexicalEntry {
  id: string;
  orthographicForm: string;
  phonologicalForm: string;
  pos: string;
  subcategory?: string;
  glosses: string[];
  semanticFields: string[];
  derivedForms: unknown[];
  source: string;
  senses?: Array<{ index: number; gloss: string; semanticField?: string }>;
  etymology?: string;
  etymologyType?: "derived" | "borrowed" | "reconstructed";
  derivedFromEntryId?: string;
  borrowedFrom?: string;
}

export interface CorpusSample {
  id: string;
  register: string;
  orthographicText: string;
  ipaText?: string;
  translation: string;
  interlinearGloss: { word: string; morphemes: string[]; glosses: string[] }[];
  generatedAt: string;
}

export interface ValidationState {
  lastRun: string;
  errors: { module: string; ruleId: string; message: string; entityRef: string | null }[];
  warnings: { module: string; ruleId: string; message: string; entityRef: string | null }[];
}

export interface Language {
  slangerVersion: string;
  meta: LanguageMeta;
  phonology: PhonologyConfig;
  morphology: MorphologyConfig;
  syntax: SyntaxConfig;
  pragmatics: unknown;
  semantics: unknown;
  culture: unknown;
  lexicon: LexicalEntry[];
  corpus: CorpusSample[];
  validationState: ValidationState;
}

// ─── sessionStorage CRUD ──────────────────────────────────────────────────────

const STORAGE_KEY = "slanger_languages";

function loadAll(): Language[] {
  try {
    return JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? "[]") as Language[];
  } catch {
    return [];
  }
}

function saveAll(langs: Language[]): void {
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(langs));
}

function uid(): string {
  return `lang_${Math.random().toString(36).slice(2, 10)}`;
}

export function listLanguages(): Language[] {
  return loadAll();
}

export function getLanguage(id: string): Language | null {
  return loadAll().find((l) => l.meta.id === id) ?? null;
}

export function createLanguage(input: {
  name: string;
  world?: string;
  tags?: string[];
  preset?: string;
  naturalismScore?: number;
}): Language {
  const ts = new Date().toISOString();
  const lang: Language = {
    slangerVersion: "1.0",
    meta: {
      id: uid(),
      name: input.name,
      world: input.world,
      tags: input.tags ?? [],
      version: 1,
      preset: input.preset ?? "naturalistic",
      naturalismScore: input.naturalismScore ?? 0.7,
      createdAt: ts,
      updatedAt: ts,
    },
    phonology: {
      inventory: { consonants: [], vowels: [], tones: [] },
      phonotactics: { syllableTemplates: [], onsetClusters: [], codaClusters: [], allophonyRules: [] },
      orthography: {},
      suprasegmentals: {
        hasLexicalTone: false, hasPhonemicStress: false,
        hasVowelLength: false, hasPhonemicNasalization: false,
      },
    },
    morphology: {
      typology: "analytic",
      categories: { noun: [], verb: [], adjective: [], adverb: [], particle: [], pronoun: [], numeral: [], other: [] },
      paradigms: {},
      morphemeOrder: ["root"],
      derivationalRules: [],
      alternationRules: [],
    },
    syntax: {
      wordOrder: "SVO",
      alignment: "nominative-accusative",
      phraseStructure: {
        NP: [{ label: "Det", optional: true, repeatable: false }, { label: "N", optional: false, repeatable: false }],
        VP: [{ label: "V", optional: false, repeatable: false }, { label: "NP", optional: true, repeatable: false }],
        S:  [{ label: "NP", optional: false, repeatable: false }, { label: "VP", optional: false, repeatable: false }],
      },
      clauseTypes: ["declarative", "polar-interrogative", "imperative"],
      headedness: "dependent-marking",
      adpositionType: "preposition",
    },
    pragmatics: { hasFormalRegister: false, hasHonorifics: false, registers: [], discourseMarkers: [], politenessStrategies: [] },
    semantics: { domains: [], untranslatables: [], metaphorSystems: [] },
    culture: { idioms: [], namingConventions: [], proverbs: [] },
    lexicon: [],
    corpus: [],
    validationState: { lastRun: ts, errors: [], warnings: [] },
  };

  const all = loadAll();
  all.unshift(lang);
  saveAll(all);
  return lang;
}

/** Import a language from an exported JSON file. Assigns new id and version. */
export function importLanguageFromJson(parsed: unknown): Language {
  if (typeof parsed !== "object" || parsed === null) {
    throw new Error("Invalid JSON: expected an object");
  }
  const raw = parsed as Record<string, unknown>;
  const meta = raw.meta as Record<string, unknown> | undefined;
  if (!meta || typeof meta.name !== "string") {
    throw new Error("Invalid export: missing meta.name");
  }
  const ts = new Date().toISOString();
  const lang: Language = {
    slangerVersion: (raw.slangerVersion as string) ?? "1.0",
    meta: {
      id: uid(),
      name: String(meta.name),
      world: meta.world !== undefined ? String(meta.world) : undefined,
      tags: Array.isArray(meta.tags) ? (meta.tags as string[]) : [],
      version: 1,
      preset: typeof meta.preset === "string" ? meta.preset : "naturalistic",
      naturalismScore: typeof meta.naturalismScore === "number" ? meta.naturalismScore : 0.7,
      createdAt: ts,
      updatedAt: ts,
    },
    phonology: (raw.phonology as Language["phonology"]) ?? {
      inventory: { consonants: [], vowels: [], tones: [] },
      phonotactics: { syllableTemplates: [], onsetClusters: [], codaClusters: [], allophonyRules: [] },
      orthography: {},
      suprasegmentals: { hasLexicalTone: false, hasPhonemicStress: false, hasVowelLength: false, hasPhonemicNasalization: false },
    },
    morphology: (raw.morphology as Language["morphology"]) ?? {
      typology: "analytic",
      categories: { noun: [], verb: [], adjective: [], adverb: [], particle: [], pronoun: [], numeral: [], other: [] },
      paradigms: {},
      morphemeOrder: ["root"],
      derivationalRules: [],
      alternationRules: [],
    },
    syntax: (raw.syntax as Language["syntax"]) ?? {
      wordOrder: "SVO",
      alignment: "nominative-accusative",
      phraseStructure: { NP: [], VP: [], S: [] },
      clauseTypes: ["declarative", "polar-interrogative", "imperative"],
      headedness: "dependent-marking",
      adpositionType: "preposition",
    },
    pragmatics: (raw.pragmatics as Language["pragmatics"]) ?? { hasFormalRegister: false, hasHonorifics: false, registers: [], discourseMarkers: [], politenessStrategies: [] },
    semantics: (raw.semantics as Language["semantics"]) ?? { domains: [], untranslatables: [], metaphorSystems: [] },
    culture: (raw.culture as Language["culture"]) ?? { idioms: [], namingConventions: [], proverbs: [] },
    lexicon: Array.isArray(raw.lexicon) ? (raw.lexicon as Language["lexicon"]) : [],
    corpus: Array.isArray(raw.corpus) ? (raw.corpus as Language["corpus"]) : [],
    validationState: (raw.validationState as Language["validationState"]) ?? { lastRun: ts, errors: [], warnings: [] },
  };
  const all = loadAll();
  all.unshift(lang);
  saveAll(all);
  return lang;
}

/** Replace a language in sessionStorage with a server-returned copy (preserves id/version) */
function persistServerLang(serverLang: Language): Language {
  const all = loadAll();
  const idx = all.findIndex((l) => l.meta.id === serverLang.meta.id);
  if (idx === -1) {
    all.unshift(serverLang);
  } else {
    all[idx] = serverLang;
  }
  saveAll(all);
  return serverLang;
}

export function updateLanguage(id: string, patch: Partial<Language>): Language | null {
  const all = loadAll();
  const idx = all.findIndex((l) => l.meta.id === id);
  if (idx === -1) return null;
  const current = all[idx]!;
  const updated: Language = {
    ...current,
    ...patch,
    meta: {
      ...current.meta,
      ...(patch.meta ?? {}),
      id: current.meta.id,     // never overwrite id
      version: current.meta.version + 1,
      updatedAt: new Date().toISOString(),
    },
  };
  all[idx] = updated;
  saveAll(all);
  return updated;
}

const MAX_VERSION_HISTORY = 15;

/** Push current language state to version history (call before an AI generation step). */
export function pushVersionSnapshot(lang: Language, stepLabel: string): void {
  const snapshot: Language = JSON.parse(JSON.stringify(lang));
  snapshot.meta = { ...snapshot.meta, versionHistory: undefined };
  const entry: VersionSnapshot = {
    label: stepLabel,
    timestamp: new Date().toISOString(),
    snapshot,
  };
  const history = [...(lang.meta.versionHistory ?? []), entry].slice(-MAX_VERSION_HISTORY);
  updateLanguage(lang.meta.id, { meta: { ...lang.meta, versionHistory: history } });
}

/** Restore language to a previous snapshot. Returns the restored language or null. */
export function rollbackToVersion(langId: string, snapshotIndex: number): Language | null {
  const all = loadAll();
  const idx = all.findIndex((l) => l.meta.id === langId);
  if (idx === -1) return null;
  const lang = all[idx]!;
  const history = lang.meta.versionHistory ?? [];
  const entry = history[snapshotIndex];
  if (!entry?.snapshot) return null;
  const restored: Language = {
    ...entry.snapshot,
    meta: { ...entry.snapshot.meta, id: langId, versionHistory: history },
  };
  all[idx] = restored;
  saveAll(all);
  return restored;
}

export function deleteLanguage(id: string): boolean {
  const all = loadAll();
  const next = all.filter((l) => l.meta.id !== id);
  if (next.length === all.length) return false;
  saveAll(next);
  return true;
}

// ─── LLM operations ───────────────────────────────────────────────────────────
// Each op sends the full Language to the backend and gets back { data: { language } }.
// Before persisting we push the previous state to versionHistory so users can roll back.

type LLMResp = { data: { language: Language } };

function persistWithHistory(previousLang: Language, newLang: Language, stepLabel: string): Language {
  const snapshot: Language = JSON.parse(JSON.stringify(previousLang));
  snapshot.meta.versionHistory = undefined;
  const entry: VersionSnapshot = { label: stepLabel, timestamp: new Date().toISOString(), snapshot };
  const history = [...(previousLang.meta.versionHistory ?? []), entry].slice(-MAX_VERSION_HISTORY);
  const merged: Language = { ...newLang, meta: { ...newLang.meta, versionHistory: history } };
  return persistServerLang(merged);
}

export interface SuggestResult {
  language: Language;
  rationale: string;
}

export async function suggestInventory(lang: Language): Promise<SuggestResult> {
  const res = await request<{ data: { language: Language; rationale: string } }>(
    "POST", "/suggest-inventory", lang
  );
  return { language: persistWithHistory(lang, res.data.language, "Before: Suggest phoneme inventory"), rationale: res.data.rationale ?? "" };
}

export interface FillResult {
  language: Language;
  rationale: string;
}

export async function fillParadigms(lang: Language): Promise<FillResult> {
  const res = await request<{ data: { language: Language; rationale: string } }>(
    "POST", "/fill-paradigms", lang
  );
  return { language: persistWithHistory(lang, res.data.language, "Before: Fill paradigm gaps"), rationale: res.data.rationale ?? "" };
}

export async function generateLexicon(lang: Language, batchSize = 5): Promise<Language> {
  const res = await request<LLMResp>("POST", "/generate-lexicon", { language: lang, batchSize });
  return persistWithHistory(lang, res.data.language, "Before: Generate lexicon batch");
}

export async function generateCorpus(
  lang: Language,
  prompt?: string,
  count = 5,
  registers: ("informal" | "formal" | "narrative")[] = ["informal", "formal", "narrative"]
): Promise<Language> {
  const res = await request<LLMResp>("POST", "/generate-corpus", { language: lang, count, registers, prompt });
  return persistWithHistory(lang, res.data.language, "Before: Generate corpus");
}

export interface ExplainResult {
  explanation: string;
  examples: Array<{ input: string; output: string; steps: string[] }>;
  crossLinguisticParallels: string[];
}

export async function explainRule(
  lang: Language,
  module: "phonology" | "morphology" | "syntax",
  ruleRef: string,
  ruleData: unknown
): Promise<ExplainResult> {
  const res = await request<{ data: ExplainResult }>("POST", "/explain-rule", {
    language: lang, module, ruleRef, ruleData, depth: "technical",
  });
  return res.data;
}

export interface ConsistencyResult {
  overallScore: number;
  linguisticIssues: { severity: string; module: string; description: string; suggestion: string }[];
  suggestions: string[];
  strengths: string[];
}

export async function checkConsistency(lang: Language): Promise<ConsistencyResult> {
  const res = await request<{ data: ConsistencyResult }>("POST", "/check-consistency", lang);
  return res.data;
}

// ─── Autonomous pipeline — SSE ────────────────────────────────────────────────

export interface StreamEvent {
  type: "pipeline_progress" | "operation_complete" | "pipeline_complete" | "pipeline_error" | "committed";
  step?: number;
  totalSteps?: number;
  stepName?: string;
  result?: { operation: string; attempt: number; durationMs: number; fromCache?: boolean };
  language?: Language;
  totalMs?: number;
  message?: string;
}

export function runAutonomousPipeline(
  lang: Language,
  complexity: number,
  onEvent: (event: StreamEvent) => void
): () => void {
  const controller = new AbortController();

  (async () => {
    try {
      const res = await fetch(`${API_BASE}/v1/autonomous`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ language: lang, complexity }),
        signal: controller.signal,
      });

      if (!res.ok || !res.body) {
        onEvent({ type: "pipeline_error", message: `HTTP ${res.status}` });
        return;
      }

      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const ev = JSON.parse(line.slice(6)) as StreamEvent;
            // When backend sends committed language, persist it
            if ((ev.type === "committed" || ev.type === "pipeline_complete") && ev.language) {
              persistServerLang(ev.language);
            }
            onEvent(ev);
          } catch { /* skip malformed */ }
        }
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        onEvent({ type: "pipeline_error", message: (err as Error).message });
      }
    }
  })();

  return () => controller.abort();
}
