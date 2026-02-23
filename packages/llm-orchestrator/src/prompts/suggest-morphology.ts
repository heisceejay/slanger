/**
 * Operation: suggest_morphology
 *
 * Generates an initial MorphologyConfig including:
 *  - Typology (analytic, agglutinative, fusional, polysynthetic, mixed)
 *  - Morphological categories per Part of Speech
 *  - Paradigm structures
 *  - Morphological features (alignment, etc.)
 */

import type { SuggestMorphologyRequest, SuggestMorphologyResponse } from "../types.js";
import type { MorphologyConfig } from "@slanger/shared-types";

export function buildSystemPrompt(): string {
  return `You are an expert linguistic typologist and constructed language designer.
  
Your task is to design morphological systems for constructed languages. You must:
1. Choose a morphological typology that feels natural given the language's phonology and tags
2. Define inflectional categories (case, number, tense, aspect, etc.) appropriate for each part of speech
3. Design paradigm structures that avoid western-centric defaults where appropriate
4. Ensure the morphology is coherent with the provided naturalismScore
5. Provide a clear rationale for your design choices`;
}

export function buildUserMessage(req: SuggestMorphologyRequest, retryErrors?: string[]): string {
  const naturalism = req.naturalismScore;

  const phonInfo = `PHONOLOGY CONTEXT:
- Consonants: ${req.phonology.inventory.consonants.join(", ")}
- Vowels: ${req.phonology.inventory.vowels.join(", ")}
- Syllable Templates: ${req.phonology.phonotactics.syllableTemplates.join(", ")}
- Suprasegmentals: ${JSON.stringify(req.phonology.suprasegmentals)}`;

  const retryBlock = retryErrors?.length
    ? `\n[PREVIOUS ATTEMPT ERRORS — FIX THESE]\n${retryErrors.map((e, i) => `${i + 1}. ${e}`).join("\n")}\n`
    : "";

  return `${retryBlock}
Design a starting morphology system for a constructed language with these parameters:
- Name hint: ${req.world ? `set in "${req.world}"` : "no specific world"}
- Tags: ${req.tags.length ? req.tags.join(", ") : "none specified"}
- Naturalism Score: ${naturalism.toFixed(2)}

${phonInfo}

INFLECTIONAL CATEGORIES OPTIONS: [case, number, gender, animacy, tense, aspect, mood, evidentiality, person, polarity, definiteness, nounClass, mirativity]
TYPOLOGY OPTIONS: [analytic, agglutinative, fusional, polysynthetic, mixed]

Respond with ONLY this JSON structure (no text outside JSON):
{
  "morphology": {
    "typology": "<analytic|agglutinative|fusional|polysynthetic|mixed>",
    "categories": {
      "noun": ["<category>", ...],
      "verb": ["<category>", ...],
      "adjective": [],
      "pronoun": [],
      "adverb": [],
      "particle": [],
      "numeral": [],
      "other": []
    },
    "paradigms": {
      "<pos>_<category>": {
        "<feature_value>": ""
      }
    },
    "morphemeOrder": {
      "noun": ["root"],
      "verb": ["root"]
    },
    "alternationRules": [],
    "derivationalRules": []
  },
  "rationale": "<2-3 sentences explaining typological choices and how they relate to the phonology>"
}

CRITICAL CONSTRAINTS:
1. If the language has very simple phonology/syllables, consider more complex (agglutinative) morphology.
2. If the phonology is very complex, consider simpler (analytic) morphology.
3. Every category listed in 'categories' for a POS should have a corresponding paradigm entry.
4. Paradigm keys should follow the format "noun_case", "verb_tense", etc.
5. For initial suggestion, leave affix values empty ("") in paradigms; they will be filled later.`.trim();
}

export function parseResponse(raw: string): SuggestMorphologyResponse {
  const parsed = JSON.parse(raw) as Partial<SuggestMorphologyResponse>;

  if (!parsed.morphology) {
    throw new Error('Response missing required "morphology" field');
  }

  const morph = parsed.morphology as Partial<MorphologyConfig>;

  if (!morph.typology) {
    throw new Error("morphology.typology is required");
  }

  // Fill in optional fields with safe defaults
  const complete: MorphologyConfig = {
    typology: morph.typology as any,
    categories: {
      noun: morph.categories?.noun ?? [],
      verb: morph.categories?.verb ?? [],
      adjective: morph.categories?.adjective ?? [],
      pronoun: morph.categories?.pronoun ?? [],
      adverb: morph.categories?.adverb ?? [],
      particle: morph.categories?.particle ?? [],
      numeral: morph.categories?.numeral ?? [],
      other: morph.categories?.other ?? [],
    },
    paradigms: morph.paradigms ?? {},
    morphemeOrder: Array.isArray(morph.morphemeOrder) ? morph.morphemeOrder : ["root"],
    alternationRules: morph.alternationRules ?? [],
    derivationalRules: morph.derivationalRules ?? [],
  };

  if (morph.templatic) {
    complete.templatic = morph.templatic;
  }

  return {
    morphology: complete,
    rationale: parsed.rationale ?? "",
  };
}
