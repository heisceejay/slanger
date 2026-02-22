/**
 * Operation: fill_paradigm_gaps
 *
 * Completes an incomplete morphology config.
 * Fills missing paradigm cells, suggests affix phonology
 * consistent with the inventory, and ensures typological
 * coherence (e.g. agglutinative languages have regular affixes).
 */

import type { FillParadigmGapsRequest, FillParadigmGapsResponse } from "../types.js";
import type { MorphologyConfig } from "@slanger/shared-types";

export function buildSystemPrompt(): string {
  return `You are an expert morphologist specializing in constructed language design.

Your task is to complete morphological paradigm tables for constructed languages. You must:
1. Use ONLY phoneme symbols from the provided inventory
2. Produce affixes that create phonotactically valid forms when combined with roots
3. Maintain typological consistency with the specified morphological type
4. Provide paradigm cells for ALL grammatical features defined in the categories config
5. Format all affixes as: "-suffix" for suffixes, "prefix-" for prefixes
6. Ensure fusional paradigms have portmanteau cells (e.g. "1sg" not separate "1" + "sg")`;
}

export function buildUserMessage(req: FillParadigmGapsRequest, retryErrors?: string[]): string {
  const retryBlock = retryErrors?.length
    ? `\n[PREVIOUS ATTEMPT ERRORS — FIX THESE]\n${retryErrors.map((e, i) => `${i + 1}. ${e}`).join("\n")}\n`
    : "";

  const consonants = req.phonology.inventory.consonants.join(", ");
  const vowels = req.phonology.inventory.vowels.join(", ");
  const templates = req.phonology.phonotactics.syllableTemplates.join(", ");

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
${JSON.stringify(req.morphology.paradigms, null, 2)}

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
- ALL affixes must use ONLY the phoneme inventory: ${consonants}, ${vowels}
- Produce paradigm keys in format: <pos>_<category> (e.g. "noun_case", "verb_tense")
- For person+number combined: use cells like "1sg", "2sg", "3sg", "1pl", "2pl", "3pl"

Respond with ONLY this JSON structure:
{
  "morphology": {
    "typology": "${req.morphology.typology}",
    "categories": <same as input>,
    "paradigms": {
      "<paradigm_key>": { "<feature_value>": "-<affix>", ... },
      ...
    },
    "morphemeOrder": ${JSON.stringify(req.morphology.morphemeOrder)},
    "derivationalRules": ${JSON.stringify(req.morphology.derivationalRules)},
    "alternationRules": ${JSON.stringify(req.morphology.alternationRules)}
  },
  "rationale": "<explanation of typological choices>"
}`.trim();
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
  };

  return { morphology: complete, rationale: parsed.rationale ?? "" };
}
