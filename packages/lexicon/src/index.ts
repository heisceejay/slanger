/**
 * @slanger/lexicon — Req #3 + Req #7 + Req #11
 * Core vocabulary (200-500 words), polysemy, semantic fields,
 * pronoun/number/function word subcategories, idioms, naming conventions.
 */
import type {
  LexicalEntry, PartOfSpeech, VocabularySubcategory, SemanticRole,
  MorphologyConfig, PhonologyConfig, DerivedForm, LanguageDefinition
} from "@slanger/shared-types";
import type { DerivationalRule } from "@slanger/shared-types";

export interface LexiconValidationIssue {
  ruleId: string; severity: "error"|"warning"; message: string; entityRef?: string;
}

// ─── Swadesh-like core vocabulary list ───────────────────────────────────────
// Req #3: A functional starter language begins with 200–500 words.
// These semantic slots must be filled.

export const CORE_VOCABULARY_SLOTS: Array<{
  slot: string;
  pos: PartOfSpeech;
  subcategory?: VocabularySubcategory;
  semanticField: string;
  roles?: SemanticRole[];
}> = [
  // Pronouns (Req #3: pronouns)
  {slot:"I",pos:"pronoun",subcategory:"personal-pronoun",semanticField:"person"},
  {slot:"you (sg)",pos:"pronoun",subcategory:"personal-pronoun",semanticField:"person"},
  {slot:"he/she/it",pos:"pronoun",subcategory:"personal-pronoun",semanticField:"person"},
  {slot:"we",pos:"pronoun",subcategory:"personal-pronoun",semanticField:"person"},
  {slot:"you (pl)",pos:"pronoun",subcategory:"personal-pronoun",semanticField:"person"},
  {slot:"they",pos:"pronoun",subcategory:"personal-pronoun",semanticField:"person"},
  {slot:"this",pos:"pronoun",subcategory:"demonstrative-pronoun",semanticField:"deixis"},
  {slot:"that",pos:"pronoun",subcategory:"demonstrative-pronoun",semanticField:"deixis"},
  {slot:"who",pos:"pronoun",subcategory:"interrogative-pronoun",semanticField:"deixis"},
  {slot:"what",pos:"pronoun",subcategory:"interrogative-pronoun",semanticField:"deixis"},
  // Numbers (Req #3: numbers)
  {slot:"one",pos:"numeral",subcategory:"cardinal-number",semanticField:"number"},
  {slot:"two",pos:"numeral",subcategory:"cardinal-number",semanticField:"number"},
  {slot:"three",pos:"numeral",subcategory:"cardinal-number",semanticField:"number"},
  {slot:"four",pos:"numeral",subcategory:"cardinal-number",semanticField:"number"},
  {slot:"five",pos:"numeral",subcategory:"cardinal-number",semanticField:"number"},
  {slot:"ten",pos:"numeral",subcategory:"cardinal-number",semanticField:"number"},
  {slot:"hundred",pos:"numeral",subcategory:"cardinal-number",semanticField:"number"},
  // Function words (Req #3)
  {slot:"and",pos:"particle",subcategory:"conjunction",semanticField:"grammar"},
  {slot:"or",pos:"particle",subcategory:"conjunction",semanticField:"grammar"},
  {slot:"but",pos:"particle",subcategory:"conjunction",semanticField:"grammar"},
  {slot:"not / negation",pos:"particle",subcategory:"negation",semanticField:"grammar"},
  {slot:"yes",pos:"particle",semanticField:"grammar"},
  {slot:"no",pos:"particle",semanticField:"grammar"},
  {slot:"in / at (location)",pos:"particle",subcategory:"adposition",semanticField:"space"},
  {slot:"to / toward",pos:"particle",subcategory:"adposition",semanticField:"space"},
  {slot:"from / away",pos:"particle",subcategory:"adposition",semanticField:"space"},
  {slot:"with / accompaniment",pos:"particle",subcategory:"adposition",semanticField:"social"},
  // Core nouns (body)
  {slot:"person / human",pos:"noun",subcategory:"swadesh-core",semanticField:"person"},
  {slot:"man",pos:"noun",subcategory:"swadesh-core",semanticField:"person"},
  {slot:"woman",pos:"noun",subcategory:"swadesh-core",semanticField:"person"},
  {slot:"child",pos:"noun",subcategory:"swadesh-core",semanticField:"person"},
  {slot:"head",pos:"noun",subcategory:"swadesh-core",semanticField:"body"},
  {slot:"eye",pos:"noun",subcategory:"swadesh-core",semanticField:"body"},
  {slot:"ear",pos:"noun",subcategory:"swadesh-core",semanticField:"body"},
  {slot:"mouth",pos:"noun",subcategory:"swadesh-core",semanticField:"body"},
  {slot:"hand",pos:"noun",subcategory:"swadesh-core",semanticField:"body"},
  {slot:"foot / leg",pos:"noun",subcategory:"swadesh-core",semanticField:"body"},
  {slot:"heart",pos:"noun",subcategory:"swadesh-core",semanticField:"body"},
  {slot:"blood",pos:"noun",subcategory:"swadesh-core",semanticField:"body"},
  {slot:"bone",pos:"noun",subcategory:"swadesh-core",semanticField:"body"},
  {slot:"skin / hide",pos:"noun",subcategory:"swadesh-core",semanticField:"body"},
  {slot:"hair",pos:"noun",subcategory:"swadesh-core",semanticField:"body"},
  // Core nouns (nature)
  {slot:"water",pos:"noun",subcategory:"swadesh-core",semanticField:"nature"},
  {slot:"fire",pos:"noun",subcategory:"swadesh-core",semanticField:"nature"},
  {slot:"earth / soil",pos:"noun",subcategory:"swadesh-core",semanticField:"nature"},
  {slot:"stone / rock",pos:"noun",subcategory:"swadesh-core",semanticField:"nature"},
  {slot:"tree",pos:"noun",subcategory:"swadesh-core",semanticField:"nature"},
  {slot:"sun",pos:"noun",subcategory:"swadesh-core",semanticField:"nature"},
  {slot:"moon",pos:"noun",subcategory:"swadesh-core",semanticField:"nature"},
  {slot:"star",pos:"noun",subcategory:"swadesh-core",semanticField:"nature"},
  {slot:"sky",pos:"noun",subcategory:"swadesh-core",semanticField:"nature"},
  {slot:"wind / air",pos:"noun",subcategory:"swadesh-core",semanticField:"nature"},
  {slot:"rain",pos:"noun",subcategory:"swadesh-core",semanticField:"nature"},
  {slot:"night",pos:"noun",subcategory:"swadesh-core",semanticField:"time"},
  {slot:"day",pos:"noun",subcategory:"swadesh-core",semanticField:"time"},
  {slot:"year",pos:"noun",subcategory:"swadesh-core",semanticField:"time"},
  // Core nouns (social/material)
  {slot:"house / home",pos:"noun",subcategory:"swadesh-core",semanticField:"shelter"},
  {slot:"name",pos:"noun",subcategory:"swadesh-core",semanticField:"identity"},
  {slot:"word / speech",pos:"noun",subcategory:"swadesh-core",semanticField:"language"},
  {slot:"path / road",pos:"noun",subcategory:"swadesh-core",semanticField:"space"},
  {slot:"food",pos:"noun",subcategory:"swadesh-core",semanticField:"sustenance"},
  {slot:"animal",pos:"noun",subcategory:"swadesh-core",semanticField:"nature"},
  {slot:"bird",pos:"noun",subcategory:"swadesh-core",semanticField:"nature"},
  {slot:"fish",pos:"noun",subcategory:"swadesh-core",semanticField:"nature"},
  {slot:"dog",pos:"noun",subcategory:"swadesh-core",semanticField:"nature"},
  // Core verbs (Req #3: core verbs)
  {slot:"to be (exist)",pos:"verb",subcategory:"copula",semanticField:"existence",roles:["theme"]},
  {slot:"to have",pos:"verb",subcategory:"swadesh-core",semanticField:"possession",roles:["agent","theme"]},
  {slot:"to do / make",pos:"verb",subcategory:"swadesh-core",semanticField:"action",roles:["agent","patient"]},
  {slot:"to say / speak",pos:"verb",subcategory:"swadesh-core",semanticField:"language",roles:["agent","theme"]},
  {slot:"to go / walk",pos:"verb",subcategory:"swadesh-core",semanticField:"motion",roles:["agent"]},
  {slot:"to come",pos:"verb",subcategory:"swadesh-core",semanticField:"motion",roles:["agent"]},
  {slot:"to see",pos:"verb",subcategory:"swadesh-core",semanticField:"perception",roles:["experiencer","theme"]},
  {slot:"to hear",pos:"verb",subcategory:"swadesh-core",semanticField:"perception",roles:["experiencer","theme"]},
  {slot:"to know",pos:"verb",subcategory:"swadesh-core",semanticField:"cognition",roles:["experiencer","theme"]},
  {slot:"to think",pos:"verb",subcategory:"swadesh-core",semanticField:"cognition",roles:["agent","theme"]},
  {slot:"to want / desire",pos:"verb",subcategory:"swadesh-core",semanticField:"desire",roles:["experiencer","theme"]},
  {slot:"to eat",pos:"verb",subcategory:"swadesh-core",semanticField:"sustenance",roles:["agent","patient"]},
  {slot:"to drink",pos:"verb",subcategory:"swadesh-core",semanticField:"sustenance",roles:["agent","patient"]},
  {slot:"to sleep",pos:"verb",subcategory:"swadesh-core",semanticField:"body",roles:["theme"]},
  {slot:"to die",pos:"verb",subcategory:"swadesh-core",semanticField:"life",roles:["theme"]},
  {slot:"to live / be alive",pos:"verb",subcategory:"swadesh-core",semanticField:"life",roles:["theme"]},
  {slot:"to give",pos:"verb",subcategory:"swadesh-core",semanticField:"social",roles:["agent","theme","recipient"]},
  {slot:"to take / receive",pos:"verb",subcategory:"swadesh-core",semanticField:"action",roles:["agent","patient"]},
  {slot:"to kill",pos:"verb",subcategory:"swadesh-core",semanticField:"action",roles:["agent","patient"]},
  {slot:"to fall",pos:"verb",subcategory:"swadesh-core",semanticField:"motion",roles:["theme"]},
  {slot:"to stand",pos:"verb",subcategory:"swadesh-core",semanticField:"motion",roles:["theme"]},
  {slot:"to sit",pos:"verb",subcategory:"swadesh-core",semanticField:"motion",roles:["theme"]},
  {slot:"to grow",pos:"verb",subcategory:"swadesh-core",semanticField:"life",roles:["theme"]},
  {slot:"to burn",pos:"verb",subcategory:"swadesh-core",semanticField:"nature",roles:["theme"]},
  // Core adjectives
  {slot:"big / large",pos:"adjective",subcategory:"swadesh-core",semanticField:"size"},
  {slot:"small / little",pos:"adjective",subcategory:"swadesh-core",semanticField:"size"},
  {slot:"long",pos:"adjective",subcategory:"swadesh-core",semanticField:"size"},
  {slot:"short",pos:"adjective",subcategory:"swadesh-core",semanticField:"size"},
  {slot:"good",pos:"adjective",subcategory:"swadesh-core",semanticField:"evaluation"},
  {slot:"bad / evil",pos:"adjective",subcategory:"swadesh-core",semanticField:"evaluation"},
  {slot:"new",pos:"adjective",subcategory:"swadesh-core",semanticField:"time"},
  {slot:"old",pos:"adjective",subcategory:"swadesh-core",semanticField:"time"},
  {slot:"hot / warm",pos:"adjective",subcategory:"swadesh-core",semanticField:"temperature"},
  {slot:"cold",pos:"adjective",subcategory:"swadesh-core",semanticField:"temperature"},
  {slot:"wet",pos:"adjective",subcategory:"swadesh-core",semanticField:"texture"},
  {slot:"dry",pos:"adjective",subcategory:"swadesh-core",semanticField:"texture"},
  {slot:"full",pos:"adjective",subcategory:"swadesh-core",semanticField:"quantity"},
  {slot:"empty",pos:"adjective",subcategory:"swadesh-core",semanticField:"quantity"},
  {slot:"many / much",pos:"adjective",subcategory:"swadesh-core",semanticField:"quantity"},
  {slot:"few",pos:"adjective",subcategory:"swadesh-core",semanticField:"quantity"},
  {slot:"one / alone",pos:"adjective",subcategory:"swadesh-core",semanticField:"quantity"},
  {slot:"all / every",pos:"adjective",subcategory:"swadesh-core",semanticField:"quantity"},
  {slot:"alive",pos:"adjective",subcategory:"swadesh-core",semanticField:"life"},
  {slot:"dead",pos:"adjective",subcategory:"swadesh-core",semanticField:"life"},
  // Colors
  {slot:"black",pos:"adjective",subcategory:"swadesh-core",semanticField:"color"},
  {slot:"white",pos:"adjective",subcategory:"swadesh-core",semanticField:"color"},
  {slot:"red",pos:"adjective",subcategory:"swadesh-core",semanticField:"color"},
];

export const MINIMUM_VOCABULARY_COUNT = 200;
export const RECOMMENDED_VOCABULARY_COUNT = 500;

// ─── Lexicon validation ───────────────────────────────────────────────────────

export function validateLexicon(
  entries: LexicalEntry[],
  morphology: MorphologyConfig,
  phonology: PhonologyConfig
): LexiconValidationIssue[] {
  const issues: LexiconValidationIssue[] = [];

  // Req #3: Minimum vocabulary check
  if (entries.length < MINIMUM_VOCABULARY_COUNT) {
    issues.push({
      ruleId:"LEX_001",severity:"warning",
      message:`Lexicon has ${entries.length} entries. A functional language needs at least ${MINIMUM_VOCABULARY_COUNT} words. Consider running vocabulary generation.`
    });
  }

  // Check for duplicate IDs
  const seenIds = new Set<string>();
  for (const entry of entries) {
    if (seenIds.has(entry.id)) {
      issues.push({ruleId:"LEX_002",severity:"error",message:`Duplicate lexical entry ID: ${entry.id}.`,entityRef:entry.id});
    }
    seenIds.add(entry.id);
  }

  // Check for duplicate orthographic forms (homographs — warning only)
  const seenOrth = new Map<string,string>();
  for (const entry of entries) {
    const prev = seenOrth.get(entry.orthographicForm);
    if (prev) {
      issues.push({
        ruleId:"LEX_003",severity:"warning",
        message:`Homograph "${entry.orthographicForm}" appears in both ${prev} and ${entry.id}. Intentional polysemy should be modeled with the senses[] field on a single entry.`,
        entityRef:entry.id
      });
    }
    seenOrth.set(entry.orthographicForm, entry.id);
  }

  // Req #3: Core subcategory coverage
  const hasPronoun = entries.some(e => e.subcategory === "personal-pronoun");
  const hasNegation = entries.some(e => e.subcategory === "negation");
  const hasCardinal = entries.some(e => e.subcategory === "cardinal-number");
  if (!hasPronoun) issues.push({ruleId:"LEX_010",severity:"warning",message:"No personal pronouns found. Add entries with subcategory 'personal-pronoun'."});
  if (!hasNegation) issues.push({ruleId:"LEX_011",severity:"warning",message:"No negation particle found. Add an entry with subcategory 'negation'."});
  if (!hasCardinal) issues.push({ruleId:"LEX_012",severity:"warning",message:"No cardinal numbers found. Add entries with subcategory 'cardinal-number'."});

  // Validate each entry
  for (const entry of entries) {
    if (!entry.id.match(/^lex_[0-9]{4,}$/)) {
      issues.push({ruleId:"LEX_020",severity:"error",message:`Entry ID "${entry.id}" must match pattern lex_NNNN+.`,entityRef:entry.id});
    }
    if (entry.glosses.length === 0) {
      issues.push({ruleId:"LEX_021",severity:"error",message:`Entry ${entry.id} has no glosses.`,entityRef:entry.id});
    }
    if (!entry.phonologicalForm) {
      issues.push({ruleId:"LEX_022",severity:"error",message:`Entry ${entry.id} missing phonologicalForm.`,entityRef:entry.id});
    }
    if (!entry.orthographicForm) {
      issues.push({ruleId:"LEX_023",severity:"error",message:`Entry ${entry.id} missing orthographicForm.`,entityRef:entry.id});
    }
    // Req #7: Polysemy validation
    if (entry.senses) {
      for (let i=0;i<entry.senses.length;i++) {
        if (!entry.senses[i]?.gloss) {
          issues.push({ruleId:"LEX_030",severity:"error",message:`Sense ${i+1} of entry ${entry.id} missing gloss.`,entityRef:entry.id});
        }
      }
    }
  }

  // Check derivational rule references
  const derivRuleIds = new Set(morphology.derivationalRules.map(r=>r.id));
  for (const entry of entries) {
    for (const derived of entry.derivedForms) {
      if (!derivRuleIds.has(derived.ruleId)) {
        issues.push({
          ruleId:"LEX_040",severity:"error",
          message:`Entry ${entry.id} derived form references unknown rule "${derived.ruleId}".`,
          entityRef:entry.id
        });
      }
    }
  }

  return issues;
}

// ─── Coverage report ─────────────────────────────────────────────────────────

export interface CoverageReport {
  totalEntries: number;
  coreSlotsFilled: number;
  coreSlotsTotal: number;
  coveragePercent: number;
  missingSlots: string[];
  bySemanticField: Record<string,number>;
  byPos: Record<PartOfSpeech,number>;
}

/**
 * Analyse how well a lexicon covers the required core vocabulary slots.
 */
export function generateCoverageReport(entries: LexicalEntry[]): CoverageReport {
  const glossSet = new Set(entries.flatMap(e => e.glosses.map(g => g.toLowerCase())));
  const filled = CORE_VOCABULARY_SLOTS.filter(slot =>
    glossSet.has(slot.slot.toLowerCase()) ||
    entries.some(e => e.subcategory === slot.subcategory && slot.subcategory)
  );
  const missing = CORE_VOCABULARY_SLOTS.filter(s => !filled.includes(s)).map(s => s.slot);

  const bySemanticField: Record<string,number> = {};
  for (const e of entries) {
    for (const f of e.semanticFields) {
      bySemanticField[f] = (bySemanticField[f] ?? 0) + 1;
    }
  }

  const byPos = {} as Record<PartOfSpeech,number>;
  for (const e of entries) {
    byPos[e.pos] = (byPos[e.pos] ?? 0) + 1;
  }

  return {
    totalEntries: entries.length,
    coreSlotsFilled: filled.length,
    coreSlotsTotal: CORE_VOCABULARY_SLOTS.length,
    coveragePercent: Math.round((filled.length / CORE_VOCABULARY_SLOTS.length) * 100),
    missingSlots: missing,
    bySemanticField,
    byPos,
  };
}

// ─── Lexical CRUD helpers ─────────────────────────────────────────────────────

export function createLexicalEntry(params: {
  id: string;
  phonologicalForm: string;
  orthographicForm: string;
  pos: PartOfSpeech;
  subcategory?: VocabularySubcategory;
  glosses: string[];
  semanticFields: string[];
  semanticRoles?: SemanticRole[];
  source: "generated"|"user";
}): LexicalEntry {
  const entry: LexicalEntry = {
    ...params,
    derivedForms: [],
  };
  if (params.glosses.length > 1) {
    entry.senses = params.glosses.map((g,i) => ({
      index: i+1,
      gloss: g,
      semanticField: params.semanticFields[0] ?? "general",
    }));
  }
  return entry;
}

/**
 * Generate derived forms for an entry using the morphology config.
 */
export function expandDerivedForms(
  entry: LexicalEntry,
  rules: DerivationalRule[]
): DerivedForm[] {
  const applicable = rules.filter(r => r.sourcePos === entry.pos);
  return applicable.map(rule => {
    const base = entry.orthographicForm;
    const ipaBase = entry.phonologicalForm.replace(/^\/|\/$/g,"");
    let orth: string;
    let ipa: string;
    if (rule.affixType === "suffix") {
      const a = rule.affix.replace(/^-/,"");
      orth = base + a; ipa = `/${ipaBase}${a}/`;
    } else {
      const a = rule.affix.replace(/-$/,"");
      orth = a + base; ipa = `/${a}${ipaBase}/`;
    }
    return {
      ruleId: rule.id,
      phonologicalForm: ipa,
      orthographicForm: orth,
      pos: rule.targetPos,
      gloss: `${entry.glosses[0] ?? "?"} (${rule.label})`,
    };
  });
}
