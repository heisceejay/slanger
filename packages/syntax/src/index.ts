/**
 * @slanger/syntax — Req #5 + Req #6 (sentence structure)
 * Word order, phrase structure, alignment, clause type templates,
 * example sentence generation, interlinear gloss rendering.
 */
import type {
  SyntaxConfig, WordOrder, AlignmentSystem, ClauseType,
  LexicalEntry, CorpusSample, InterlinearLine, Register, MorphologyConfig, PartOfSpeech
} from "@slanger/shared-types";
import type { ParadigmTable } from "@slanger/morphology";

export interface SyntaxValidationIssue {
  ruleId: string; severity: "error" | "warning"; message: string; entityRef?: string;
}

export interface SentenceSlot {
  role: "subject" | "object" | "verb" | "adverb" | "adposition" | "modifier";
  entry: LexicalEntry;
  inflectedOrth: string;
  inflectedIpa: string;
  morphemeGlosses: string[];
}

export interface GeneratedSentence {
  orthographicText: string;
  ipaText: string;
  translation: string;
  interlinearLines: InterlinearLine[];
  clauseType: ClauseType;
}

// ─── Syntax validation ────────────────────────────────────────────────────────

export function validateSyntaxConfig(config: SyntaxConfig): SyntaxValidationIssue[] {
  const issues: SyntaxValidationIssue[] = [];
  const validOrders: WordOrder[] = ["SOV", "SVO", "VSO", "VOS", "OVS", "OSV", "free"];
  if (!validOrders.includes(config.wordOrder)) {
    issues.push({ ruleId: "SYN_001", severity: "error", message: `Invalid word order: ${config.wordOrder}.` });
  }
  const validAlignments: AlignmentSystem[] = [
    "nominative-accusative", "ergative-absolutive", "tripartite", "split-ergative", "active-stative"
  ];
  if (!validAlignments.includes(config.alignment)) {
    issues.push({ ruleId: "SYN_002", severity: "error", message: `Invalid alignment: ${config.alignment}.` });
  }
  if (config.clauseTypes.length === 0) {
    issues.push({ ruleId: "SYN_003", severity: "error", message: "At least one clause type must be defined." });
  }
  if (!config.clauseTypes.includes("declarative")) {
    issues.push({ ruleId: "SYN_004", severity: "warning", message: "Languages typically have at least a declarative clause type." });
  }
  // Validate phrase structure rules reference known constituents
  const knownLabels = new Set(["NP", "VP", "PP", "CP", "DP", "AP", "S", "N", "V", "Det", "Adj", "Adv", "P", "C", "T"]);
  for (const [constituent, slots] of Object.entries(config.phraseStructure)) {
    for (const slot of slots) {
      if (!knownLabels.has(slot.label) && !Object.keys(config.phraseStructure).includes(slot.label)) {
        issues.push({
          ruleId: "SYN_010", severity: "warning",
          message: `Phrase structure slot "${slot.label}" in ${constituent} is not a recognized constituent label.`,
          entityRef: constituent
        });
      }
    }
  }
  return issues;
}

/**
 * Validates that corpus samples respect the defined syntax rules (basic word order check).
 */
export function validateCorpusConsistency(corpus: CorpusSample[], config: SyntaxConfig): SyntaxValidationIssue[] {
  const issues: SyntaxValidationIssue[] = [];
  if (config.wordOrder === "free") return issues;

  for (const sample of corpus) {
    if (!sample.interlinearGloss || sample.interlinearGloss.length === 0) continue;

    const posSequence = sample.interlinearGloss.map(line => line.pos).filter((p): p is PartOfSpeech => !!p);
    const nouns = posSequence.filter(p => p === "noun" || p === "pronoun");
    const verbs = posSequence.filter(p => p === "verb");

    if (nouns.length >= 1 && verbs.length >= 1) {
      const firstNounIdx = posSequence.findIndex(p => p === "noun" || p === "pronoun");
      const lastNounIdx = findLastIndex(posSequence, p => p === "noun" || p === "pronoun");
      const firstVerbIdx = posSequence.findIndex(p => p === "verb");

      // Extremely basic heuristic checks based on word order
      if (config.wordOrder === "SOV" || config.wordOrder === "SVO") {
        // S usually comes first (first noun before verb)
        if (firstNounIdx > firstVerbIdx && firstVerbIdx !== -1) {
          issues.push({
            ruleId: "SYN_020", severity: "warning",
            message: `Corpus sample "${sample.id}" might violate ${config.wordOrder} order: Verb found before Subject/Object.`,
            entityRef: sample.id
          });
        }
      } else if (config.wordOrder === "VSO" || config.wordOrder === "VOS") {
        // V usually comes first
        if (firstVerbIdx > firstNounIdx && firstNounIdx !== -1) {
          issues.push({
            ruleId: "SYN_021", severity: "warning",
            message: `Corpus sample "${sample.id}" might violate ${config.wordOrder} order: Subject/Object found before Verb.`,
            entityRef: sample.id
          });
        }
      }
    }
  }
  return issues;
}

function findLastIndex<T>(arr: T[], predicate: (val: T) => boolean): number {
  for (let i = arr.length - 1; i >= 0; i--) {
    if (predicate(arr[i]!)) return i;
  }
  return -1;
}

// ─── Sentence generation ──────────────────────────────────────────────────────

/**
 * Generate an example sentence for a given clause type given a
 * set of available lexical entries and their paradigm tables.
 */
export function generateExampleSentence(
  clauseType: ClauseType,
  config: SyntaxConfig,
  morphConfig: MorphologyConfig,
  availableEntries: LexicalEntry[],
  paradigmTables: Map<string, ParadigmTable>
): GeneratedSentence | null {
  const nouns = availableEntries.filter(e => e.pos === "noun" || e.pos === "pronoun");
  const verbs = availableEntries.filter(e => e.pos === "verb");

  if (nouns.length < 1 || verbs.length < 1) return null;

  const subj = nouns[0]!;
  const verb = verbs[0]!;
  const obj = nouns.length > 1 ? nouns[1]! : null;

  // Get inflected forms from paradigm tables
  const subjTable = paradigmTables.get(subj.id);
  const verbTable = paradigmTables.get(verb.id);

  const subjForm = subjTable?.rows.find(r => r.label.includes("nominative") || r.label === "base");
  const verbForm = verbTable?.rows.find(r => r.label.includes("present") || r.label.includes("3sg") || r.label === "base");
  const objTable = obj ? paradigmTables.get(obj.id) : null;
  const objForm = objTable?.rows.find(r => r.label.includes("accusative") || r.label === "base");

  const slots = buildSlotOrder(config.wordOrder, {
    subject: { entry: subj, inflOrth: subjForm?.orthographicForm ?? subj.orthographicForm, inflIpa: subjForm?.phonologicalForm ?? subj.phonologicalForm },
    verb: { entry: verb, inflOrth: addClauseMarker(verbForm?.orthographicForm ?? verb.orthographicForm, clauseType), inflIpa: verbForm?.phonologicalForm ?? verb.phonologicalForm },
    object: obj ? { entry: obj, inflOrth: objForm?.orthographicForm ?? obj.orthographicForm, inflIpa: objForm?.phonologicalForm ?? obj.phonologicalForm } : null,
  });

  const orthWords = slots.map(s => s.inflOrth);
  const ipaWords = slots.map(s => s.inflIpa.replace(/^\/|\/$/g, ""));

  // Apply clause-type transformation
  const finalOrth = applyClauseTransform(orthWords, clauseType, config);
  const finalIpa = "/" + ipaWords.join(" ") + "/";

  const translation = buildTranslation(subj, verb, obj, clauseType);

  const interlinear: InterlinearLine[] = slots.map(s => ({
    word: s.inflOrth,
    morphemes: segmentMorphemes(s.inflOrth, s.entry),
    glosses: buildGlosses(s.entry, s.inflOrth),
  }));

  return {
    orthographicText: finalOrth,
    ipaText: finalIpa,
    translation,
    interlinearLines: interlinear,
    clauseType,
  };
}

/**
 * Render a corpus sample with interlinear gloss.
 */
export function renderInterlinear(sample: CorpusSample): string {
  const lines: string[] = [];
  lines.push(sample.orthographicText);
  lines.push(sample.ipaText);
  for (const line of sample.interlinearGloss) {
    lines.push(line.morphemes.join("-"));
    lines.push(line.glosses.map(g => g.toUpperCase()).join("-"));
  }
  lines.push(`'${sample.translation}'`);
  return lines.join("\n");
}

/**
 * Get the ordering of S, V, O positions for a given word order.
 */
export function getConstituencyOrder(wordOrder: WordOrder): Array<"S" | "V" | "O"> {
  const orderMap: Record<WordOrder, Array<"S" | "V" | "O">> = {
    SOV: ["S", "O", "V"], SVO: ["S", "V", "O"], VSO: ["V", "S", "O"],
    VOS: ["V", "O", "S"], OVS: ["O", "V", "S"], OSV: ["O", "S", "V"],
    free: ["S", "V", "O"], // default for free
  };
  return orderMap[wordOrder];
}

// ─── Internals ────────────────────────────────────────────────────────────────

interface SlotInput {
  subject: { entry: LexicalEntry; inflOrth: string; inflIpa: string };
  verb: { entry: LexicalEntry; inflOrth: string; inflIpa: string };
  object: { entry: LexicalEntry; inflOrth: string; inflIpa: string } | null;
}

function buildSlotOrder(wordOrder: WordOrder, inputs: SlotInput) {
  const order = getConstituencyOrder(wordOrder);
  const map = {
    S: inputs.subject,
    V: inputs.verb,
    O: inputs.object,
  };
  return order.flatMap(role => {
    const slot = map[role];
    if (!slot) return [];
    return [slot];
  });
}

function addClauseMarker(verbForm: string, clauseType: ClauseType): string {
  // Simple suffix markers for different clause types (naturalistic approximation)
  const markers: Partial<Record<ClauseType, string>> = {
    "polar-interrogative": "-ka",
    "imperative": "-ve",
    "exclamative": "-ra",
  };
  const marker = markers[clauseType];
  return marker ? verbForm + marker : verbForm;
}

function applyClauseTransform(words: string[], clauseType: ClauseType, config: SyntaxConfig): string {
  const base = words.join(" ");
  switch (clauseType) {
    case "polar-interrogative": return base + "?";
    case "content-interrogative": return "Wh-" + base + "?";
    case "imperative": return base + "!";
    case "exclamative": return base + "!";
    default: return base + ".";
  }
}

function buildTranslation(subj: LexicalEntry, verb: LexicalEntry, obj: LexicalEntry | null, clauseType: ClauseType): string {
  const s = subj.glosses[0] ?? "someone";
  const v = verb.glosses[0] ?? "does";
  const o = obj?.glosses[0];
  const base = o ? `${s} ${v} ${o}` : `${s} ${v}`;
  switch (clauseType) {
    case "polar-interrogative": return `Does ${base}?`;
    case "content-interrogative": return `What does ${s} ${v}?`;
    case "imperative": return `${v.charAt(0).toUpperCase() + v.slice(1)}!`;
    default: return `${s.charAt(0).toUpperCase() + s.slice(1)} ${v}${o ? " " + o : ""}.`;
  }
}

function segmentMorphemes(form: string, entry: LexicalEntry): string[] {
  // If the form equals the base form, return unsegmented
  const base = entry.orthographicForm;
  if (form === base) return [form];
  // If longer, assume suffix
  if (form.startsWith(base)) return [base, form.slice(base.length)];
  // If prefix
  if (form.endsWith(base)) return [form.slice(0, form.length - base.length), base];
  return [form];
}

function buildGlosses(entry: LexicalEntry, form: string): string[] {
  const base = entry.glosses[0] ?? entry.orthographicForm;
  const segs = segmentMorphemes(form, entry);
  if (segs.length === 1) return [base];
  return [base, ...segs.slice(1).map(s => s.toUpperCase())];
}
