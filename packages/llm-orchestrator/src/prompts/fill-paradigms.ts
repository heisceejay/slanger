/**
 * Operation: fill_paradigm_gaps
 * 
 * Fills in missing morphological paradigms based on the language's
 * typology and specified categories.
 */

import type { FillParadigmGapsRequest, FillParadigmGapsResponse } from "../types.js";
import type { LanguageDefinition } from "@slanger/shared-types";
import type { MorphologyConfig } from "@slanger/shared-types";
import { parseJson } from "../client.js";

export function buildSystemPrompt(): string {
  return `You are an expert morphologist specializing in constructed language design.

Your task is to complete morphological paradigm tables for constructed languages. You must:
1. Use ONLY phoneme symbols from the provided inventory. If /s/ is not in the inventory, you are STRICTLY FORBIDDEN from using /s/ in any affix.
2. Produce affixes that create phonotactically valid forms when combined with roots.
3. Maintain typological consistency with the specified morphological type.
4. Provide paradigm cells for ALL grammatical features defined in the categories config.
5. Format all affixes as: "-suffix" for suffixes, "prefix-" for prefixes.
6. Ensure fusional paradigms have portmanteau cells (e.g. "1sg" not separate "1" + "sg").
7. NEVER invent new phonemes. Every single character in your affixes MUST be a direct copy-paste from the allowed inventory list.`;
}

export function buildUserMessage(req: FillParadigmGapsRequest, lang: LanguageDefinition, retryErrors?: string[]): string {
  const retryBlock = retryErrors?.length
    ? `\n[PREVIOUS ATTEMPT ERRORS — FIX THESE]\n${retryErrors.map((e, i) => `${i + 1}. ${e}`).join("\n")}\n`
    : "";

  const isReplace = req.mode === "replace";
  const existingParadigms = isReplace ? {} : req.morphology.paradigms;
  const existingRules = isReplace ? { derivational: [], alternation: [] } : { 
    derivational: req.morphology.derivationalRules, 
    alternation: req.morphology.alternationRules 
  };

  const modeInstruction = isReplace 
    ? "MODE: REPLACE. Ignore all existing paradigms and rules. Start from scratch to build a better, more robust system."
    : "MODE: AUGMENT. Maintain existing paradigms and rules exactly as they are. Extend them to fill the gaps and add more depth.";

  const constraintsSection = `
[STRICT PHONOLOGICAL CONSTRAINTS]
- YOU ARE ONLY ALLOWED TO USE THE PHONEMES LISTED BELOW.
- DO NOT use any characters, symbols, or letters that are not in the inventory.
- DO NOT use English letters or IPA symbols that aren't specifically allowed.
- This applies to ALL affixes, derivational rules, and alternation rules.
- If you use an forbidden phoneme, the system will REJECT your output.

[BROAD PART-OF-SPEECH COVERAGE]
- DO NOT limit yourself to just nouns and verbs.
- Every constructed language needs depth across ALL parts of speech.
- Suggest and implement grammatical categories for:
  * ADJECTIVES (e.g., degree, gender/number agreement)
  * PRONOUNS (e.g., case, person, number, animacy)
  * NUMERALS (e.g., ordinality)
  * ADVERBS and PARTICLES (if appropriate)
- If a part-of-speech currently has NO categories defined, you MUST suggest at least 2 relevant categories and build paradigms for them.
`;

  const consonants = req.phonology.inventory.consonants.join(", ");
  const vowels = req.phonology.inventory.vowels.join(", ");
  const templates = req.phonology.phonotactics.syllableTemplates.join(", ");

  const allowsVowelInitial = req.phonology.phonotactics.syllableTemplates.some(t => {
    return t.startsWith("V") || t.startsWith("(C)");
  });

  const vowelInitialWarning = !allowsVowelInitial
    ? `\nCRITICAL TEMPLATE RULE: Your templates [ ${templates} ] all require a consonant onset!
- EVERY SINGLE AFFIX MUST contain a consonant to avoid creating vowel-only syllables or vowel hiatus.
- For example, if you create a suffix "-a" or "-ii", it will fail validation because attaching it to a root like "per" creates "per-a", leaving "a" as a vowel-only syllable which your templates DO NOT ALLOW.
- Instead, use suffixes like "-ma", "-ti", or "-n" that provide their own onset consonant or attach as a valid coda.`
    : "";

  const strictCodaRule = req.phonology.phonotactics.syllableTemplates.every((t) => !t.includes("CC"))
    ? `\nCRITICAL CODA RULE (based on templates: [ ${templates} ]):\n- Your templates do NOT allow CC codas.\n- Therefore you MUST NOT create suffixes like "-pp", "-tt", "-bb", or any affix that can create a CVCC syllable.\n- Avoid geminates/double letters at word boundaries. Prefer affixes shaped like "-CV" (e.g. "-pa", "-ti").\n`
    : "";

  const paradigmKeys = Object.keys(existingParadigms);
  const paradigmLimit = 15;
  const paradigmSample = paradigmKeys.length > paradigmLimit
    ? `${JSON.stringify(Object.fromEntries(Object.entries(existingParadigms).slice(0, paradigmLimit)), null, 2)}\n... (and ${paradigmKeys.length - paradigmLimit} more paradigms)`
    : JSON.stringify(existingParadigms, null, 2);

  return `${retryBlock}
${modeInstruction}
${constraintsSection}

Complete the morphological paradigms for this constructed language.

PHONEME INVENTORY:
- Consonants: ${consonants}
- Vowels: ${vowels}
- Syllable templates: ${templates}${vowelInitialWarning}${strictCodaRule}

MORPHOLOGICAL TYPOLOGY: ${req.morphology.typology}

GRAMMATICAL CATEGORIES TO FILL:
${JSON.stringify(req.morphology.categories, null, 2)}

TARGET PARADIGMS (fill these):
${req.targetParadigms.join(", ")}

EXISTING PARADIGMS (keep these, they're already set):
${isReplace ? "None (REPLACE MODE)" : paradigmSample}

EXISTING RULES:
Derivational: ${JSON.stringify(existingRules.derivational, null, 2)}
Alternation: ${JSON.stringify(existingRules.alternation, null, 2)}

SAMPLE LEXICON ROOTS (Ensure your affixes are compatible with these, if any):
${lang.lexicon.length > 0 
  ? lang.lexicon.slice(0, 20).map(e => `- ${e.orthographicForm} /${e.phonologicalForm}/ (${e.pos})`).join("\n")
  : "None yet. You have full creative freedom to design morpheme shapes that best fit the phonology/typology."}

MORPHEME ORDER: ${req.morphology.morphemeOrder.join(" → ")}

INSTRUCTIONS:
- For ${req.morphology.typology} morphology:
${req.morphology.typology === "agglutinative"
      ? "  * Each paradigm should have one meaning per affix (clear segmentation)\n  * Affixes should be short (1-3 phonemes) and phonologically regular"
      : req.morphology.typology === "fusional"
        ? "  * Paradigm cells can bundle multiple categories (e.g. tense+person+number)\n  * Allow some irregularity and allomorphy"
        : req.morphology.typology === "polysynthetic"
          ? "  * Allow long, complex morpheme chains\n  * Verbs can incorporate nominal arguments"
          : "  * Minimal affixation; use separate particles or word order instead"
    }
${req.morphology.templatic?.enabled
      ? `- For TEMPLATIC morphology:
  * Instead of simple affixes, provide 'vocaloidPatterns' (e.g. "a-i") for each category combination.
  * Define 'rootTemplates' (e.g. "CVCVC") that dictate how consonants and vowels interleave.`
      : ""
    }
- ALL affixes must use ONLY the phoneme inventory: ${consonants}, ${vowels}
- MANDATORY: If a phoneme is NOT in that list, you are FORBIDDEN from using it. For example, do not use /s/ if it is not listed, even if it feels "natural" for an affix.
- Produce paradigm keys in format: <pos>_<category> (e.g. "noun_case", "verb_tense")
- For person + number combined: use cells like "1sg", "2sg", "3sg", "1pl", "2pl", "3pl"
- Respond with ONLY this JSON:
{
  "rationale": "<brief explanation of your morphological choices>",
  "morphology": {
    "typology": "${req.morphology.typology}",
    "categories": ${JSON.stringify(req.morphology.categories)},
    "paradigms": {
      "noun_case": { "nom": "", "acc": "", "gen": "" },
      "verb_tense": { "pres": "", "past": "", "fut": "" },
      "adj_degree": { "pos": "", "comp": "", "superl": "" },
      "pron_case": { "nom": "", "acc": "" }
    },
    "morphemeOrder": ["root", "tense", "case", "..."],
    "derivationalRules": [
      { "id": "dr1", "label": "...", "sourcePos": "noun", "targetPos": "adjective", "affix": "-...", "affixType": "suffix" },
      { "id": "dr2", "label": "...", "sourcePos": "verb", "targetPos": "noun", "affix": "-...", "affixType": "suffix" },
      { "id": "dr3", "label": "...", "sourcePos": "noun", "targetPos": "verb", "affix": "...", "affixType": "prefix" },
      { "id": "dr4", "label": "...", "sourcePos": "adjective", "targetPos": "adverb", "affix": "...", "affixType": "suffix" },
      { "id": "dr5", "label": "...", "sourcePos": "verb", "targetPos": "adjective", "affix": "...", "affixType": "suffix" }
    ],
    "alternationRules": [
      { "id": "ar1", "trigger": "...", "input": "...", "output": "...", "boundary": "suffix" },
      { "id": "ar2", "trigger": "...", "input": "...", "output": "...", "boundary": "suffix" },
      { "id": "ar3", "trigger": "...", "input": "...", "output": "...", "boundary": "prefix" },
      { "id": "ar4", "trigger": "...", "input": "...", "output": "...", "boundary": "any" },
      { "id": "ar5", "trigger": "...", "input": "...", "output": "...", "boundary": "any" }
    ]
  }
}

MANDATORY DATA VOLUME:
- You MUST provide at least 5 distinct and linguistically interesting derivational rules.
- You MUST provide at least 5 distinct morphophonological alternation rules.
- Ensure the rationale explains these rules in depth.

MANDATORY: If a phoneme is NOT in the phonology list, you are FORBIDDEN from using it (for example, do not use /s/ if it is not listed). Even if you think it is a "standard" affix, if it is not in the list, you must not use it.`.trim();
}

export function parseResponse(raw: string): FillParadigmGapsResponse {
  const parsed = parseJson<any>(raw, "fill_paradigm_gaps");

  if (!parsed.morphology) throw new Error('Response missing "morphology" field');
  const m = parsed.morphology;

  if (!m.typology) throw new Error("morphology.typology is required");
  if (!m.paradigms || typeof m.paradigms !== "object") throw new Error("morphology.paradigms must be an object");
  
  let morphemeOrder = Array.isArray(m.morphemeOrder) ? m.morphemeOrder : ["root"];
  if (!morphemeOrder.includes("root")) {
    morphemeOrder = ["root", ...morphemeOrder];
  }

  const derivationalRules = Array.isArray(m.derivationalRules) ? m.derivationalRules.map((r: any) => {
    if (!r || typeof r !== "object") return null;

    // Map legacy/hallucinated names to real ones
    const mapped: any = {
      id: String(r.id || `dr_${Math.random().toString(36).slice(2, 7)}`),
      label: String(r.label || r.name || "Unnamed Rule"),
      sourcePos: String(r.sourcePos || r.appliesTo || "noun"),
      targetPos: String(r.targetPos || r.resultPos || r.sourcePos || "noun"),
      affix: String(r.affix || ""),
      affixType: r.affixType,
    };

    // Infer or fix affixType
    const validTypes = ["prefix", "suffix", "circumfix", "infix"];
    if (!mapped.affixType || !validTypes.includes(mapped.affixType)) {
      if (mapped.affix.startsWith("-")) mapped.affixType = "suffix";
      else if (mapped.affix.endsWith("-")) mapped.affixType = "prefix";
      else mapped.affixType = "suffix"; // Default to suffix
    }

    return mapped;
  }).filter(Boolean) : [];

  const alternationRules = Array.isArray(m.alternationRules) ? m.alternationRules.map((r: any) => {
    if (!r || typeof r !== "object") return null;
    return {
      id: String(r.id || `ar_${Math.random().toString(36).slice(2, 7)}`),
      trigger: String(r.trigger || r.description || "none"),
      input: String(r.input || ""),
      output: String(r.output || r.effect || ""),
      boundary: ["prefix", "suffix", "any"].includes(r.boundary) ? r.boundary : "any"
    };
  }).filter(Boolean) : [];

  // Sanitize paradigms
  const paradigms: any = {};
  if (m.paradigms && typeof m.paradigms === "object") {
    for (const [pKey, cells] of Object.entries(m.paradigms)) {
      if (!cells || typeof cells !== "object") continue;
      const sanitizedCells: Record<string, string> = {};
      for (const [fKey, val] of Object.entries(cells)) {
        sanitizedCells[fKey] = sanitizeAffix(String(val || ""));
      }
      paradigms[pKey] = sanitizedCells;
    }
  }

  const complete: MorphologyConfig = {
    typology: m.typology,
    categories: m.categories ?? { noun: [], verb: [], adjective: [], adverb: [], particle: [], pronoun: [], numeral: [], other: [] },
    paradigms: paradigms,
    morphemeOrder: morphemeOrder,
    derivationalRules: derivationalRules.map((r: any) => ({ ...r, affix: sanitizeAffix(String(r.affix ?? "")) })),
    alternationRules,
    templatic: m.templatic ?? {
      enabled: false,
      rootTemplates: [],
      vocaloidPatterns: {},
      slots: []
    }
  };

  return { morphology: complete, rationale: parsed.rationale ?? "" };
}

function sanitizeAffix(affix: string): string {
  const a = (affix ?? "").trim();
  if (!a) return a;

  // 1) Collapse obvious geminates that cause illegal CC codas in CV/CV(C)/V(C) template sets.
  let s = a.replace(/([b-df-hj-np-tv-z])\1+/gi, "$1");

  const isSuffix = s.startsWith("-");
  const isPrefix = s.endsWith("-");

  // 2) Avoid affixes that are a bare consonant (creates illegal lone-C syllables in many configs).
  if (isSuffix) {
    const core = s.slice(1);
    if (/^[b-df-hj-np-tv-z]$/i.test(core)) s = `-${core}a`;
    if (/[b-df-hj-np-tv-z]{2,}$/i.test(core)) s = `-${core[0]}a`;
  } else if (isPrefix) {
    const core = s.slice(0, -1);
    if (/^[b-df-hj-np-tv-z]$/i.test(core)) s = `${core}a-`;
    if (/[b-df-hj-np-tv-z]{2,}$/i.test(core)) s = `${core[0]}a-`;
  }

  return s;
}
