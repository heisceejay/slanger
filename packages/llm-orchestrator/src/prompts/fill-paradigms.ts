/**
 * Operation: fill_paradigm_gaps
 * 
 * Fills in missing morphological paradigms based on the language's
 * typology and specified categories.
 */

import type { FillParadigmGapsRequest, FillParadigmGapsResponse } from "../types.js";
import type { LanguageDefinition } from "@slanger/shared-types";
import type { MorphologyConfig } from "@slanger/shared-types";

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

  const consonants = req.phonology.inventory.consonants.join(", ");
  const vowels = req.phonology.inventory.vowels.join(", ");
  const templates = req.phonology.phonotactics.syllableTemplates.join(", ");

  const existingParadigms = Object.entries(req.morphology.paradigms);
  const paradigmLimit = 15;
  const paradigmSample = existingParadigms.length > paradigmLimit
    ? `${JSON.stringify(Object.fromEntries(existingParadigms.slice(0, paradigmLimit)), null, 2)}\n... (and ${existingParadigms.length - paradigmLimit} more paradigms)`
    : JSON.stringify(req.morphology.paradigms, null, 2);

  return `${retryBlock}
Complete the morphological paradigms for this constructed language.

PHONEME INVENTORY:
- Consonants: ${consonants}
- Vowels: ${vowels}
- Syllable templates: ${templates}

MORPHOLOGICAL TYPOLOGY: ${req.morphology.typology}

GRAMMATICAL CATEGORIES TO FILL:
${JSON.stringify(req.morphology.categories, null, 2)}

TARGET PARADIGMS (fill these):
${req.targetParadigms.join(", ")}

EXISTING PARADIGMS (keep these, they're already set):
${paradigmSample}

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
      "noun_case": { "nom": "", "acc": "" },
      "verb_tense": { "pres": "", "past": "" }
    },
    "morphemeOrder": ["root", "tense", "..."],
    "derivationalRules": [],
    "alternationRules": []
  }
}

MANDATORY: If a phoneme is NOT in the phonology list, you are FORBIDDEN from using it (for example, do not use /s/ if it is not listed). Even if you think it is a "standard" affix, if it is not in the list, you must not use it.`.trim();
}

export function parseResponse(raw: string): FillParadigmGapsResponse {
  const parsed = JSON.parse(raw) as Partial<FillParadigmGapsResponse>;

  if (!parsed.morphology) throw new Error('Response missing "morphology" field');
  const m = parsed.morphology as Partial<MorphologyConfig>;

  if (!m.typology) throw new Error("morphology.typology is required");
  if (!m.paradigms || typeof m.paradigms !== "object") throw new Error("morphology.paradigms must be an object");
  if (!Array.isArray(m.morphemeOrder)) throw new Error("morphology.morphemeOrder must be an array");
  if (!m.morphemeOrder.includes("root")) throw new Error('morphology.morphemeOrder must include "root"');

  const complete: MorphologyConfig = {
    typology: m.typology,
    categories: m.categories ?? { noun: [], verb: [], adjective: [], adverb: [], particle: [], pronoun: [], numeral: [], other: [] },
    paradigms: m.paradigms,
    morphemeOrder: m.morphemeOrder,
    derivationalRules: m.derivationalRules ?? [],
    alternationRules: m.alternationRules ?? [],
    templatic: m.templatic ?? {
      enabled: false,
      rootTemplates: [],
      vocaloidPatterns: {},
      slots: []
    }
  };

  return { morphology: complete, rationale: parsed.rationale ?? "" };
}
