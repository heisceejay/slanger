/**
 * Operation: suggest_phoneme_inventory
 *
 * Generates a complete PhonologyConfig including:
 *  - Consonant and vowel inventory (IPA symbols)
 *  - Phonotactic rules (syllable templates, clusters, allophony)
 *  - Orthography mapping (phoneme → grapheme)
 *  - Suprasegmental features
 *
 * Prompt strategy:
 *  - Anchors the LLM in linguistics expertise
 *  - Provides typological constraints from naturalismScore
 *  - Requests specific JSON schema
 *  - Includes anti-English-default instructions
 */

import type { SuggestInventoryRequest, SuggestInventoryResponse } from "../types.js";
import type { PhonologyConfig } from "@slanger/shared-types";

export function buildSystemPrompt(): string {
  return `You are an expert linguistic typologist and constructed language designer with deep knowledge of phonological systems across the world's languages.

Your task is to design phonological systems for constructed languages. You must:
1. Draw from typological diversity — avoid defaulting to English-like phonology
2. Ensure internal consistency — all inventory members must be usable in words
3. Respect naturalismScore constraints strictly
4. Produce phoneme inventories that interact correctly with the provided syllable templates
5. Use only standard IPA symbols in inventory arrays
6. Never use IPA diacritics in the main inventory — put those in suprasegmentals flags
7. Map every inventory phoneme to an orthographic grapheme; prefer unique graphemes (duplicates are allowed but produce a warning)`;
}

export function buildUserMessage(req: SuggestInventoryRequest, retryErrors?: string[]): string {
  const naturalism = req.naturalismScore;
  const isExperimental = req.preset === "experimental" || naturalism < 0.3;

  const typologicalGuidance = isExperimental
    ? `EXPERIMENTAL MODE (naturalismScore=${naturalism.toFixed(2)}):
- Include unusual features like clicks, ejectives, pharyngeals, or complex tone systems
- Consider rare phonotactics (large onset clusters, unusual syllable shapes)
- Avoid the standard 5-vowel system; consider 3 vowels, or 7+, or non-modal phonation
- May include non-pulmonic consonants`
    : `NATURALISTIC MODE (naturalismScore=${naturalism.toFixed(2)}):
- Model after attested natural language patterns
- Inventory size: ${Math.round(8 + naturalism * 22)} consonants, ${Math.round(3 + naturalism * 7)} vowels (approximate)
- Standard tone/stress if any`;

  const writingSystemGuidance = req.writingSystemType
    ? `\nWRITING SYSTEM: Generate a "${req.writingSystemType}" mapping in the 'orthography' field.`
    : "";

  const templaticGuidance = req.templaticEnabled
    ? `\nMORPHOLOGY: This language uses TEMPLATIC (root-and-pattern) morphology.
- Ensure the phoneme inventory supports a clear consonant-vowel distinction.
- Provide a 'rationale' that mentions the templatic structure.`
    : "";

  const retryBlock = retryErrors?.length
    ? `\n[PREVIOUS ATTEMPT ERRORS — FIX THESE]\n${retryErrors.map((e, i) => `${i + 1}. ${e}`).join("\n")}\n`
    : "";

  return `${retryBlock}
Design a complete phonology system for a constructed language with these parameters:
- Name hint: ${req.world ? `set in "${req.world}"` : "no specific world"}
- Tags: ${req.tags.length ? req.tags.join(", ") : "none specified"}
${typologicalGuidance}${writingSystemGuidance}${templaticGuidance}
${req.existingInventory ? `\nExisting inventory to build on:\n${JSON.stringify(req.existingInventory, null, 2)}` : ""}

Respond with ONLY this JSON structure (no text outside JSON):
{
  "phonology": {
    "inventory": {
      "consonants": ["<IPA>", ...],
      "vowels": ["<IPA>", ...],
      "tones": []
    },
    "phonotactics": {
      "syllableTemplates": ["CV", "CV(C)", "V(C)"],
      "onsetClusters": [],
      "codaClusters": [],
      "allophonyRules": []
    },
    "orthography": {
      "<IPA>": "<grapheme>",
      ...
    },
    "suprasegmentals": {
      "hasLexicalTone": false,
      "hasPhonemicStress": false,
      "hasVowelLength": false,
      "hasPhonemicNasalization": false
    },
    "writingSystem": {
      "type": "${req.writingSystemType || "alphabet"}",
      "mappings": {},
      "aesthetics": {
        "complexity": 0.5,
        "style": "angular",
        "strokeDensity": 0.5
      },
      "glyphs": {}
    }
  },
  "rationale": "<2-3 sentences explaining typological choices>"
}

CRITICAL CONSTRAINTS:
1. Every consonant and vowel in the inventory MUST have an entry in orthography
2. Prefer unique graphemes (one per phoneme); multiple phonemes may share a grapheme if needed (e.g. ʃ→"s" and s→"s"), but unique is preferred
3. syllableTemplates must use only "C" and "V" characters (optionally wrapped in "()")
4. onsetClusters: only include clusters if your syllable templates have "CC" patterns
5. allophonyRules: each rule needs phoneme, allophone, environment, optional position
6. IPA symbols only — no X-SAMPA, no made-up notation`.trim();
}

export function parseResponse(raw: string): SuggestInventoryResponse {
  // Import parseJson inline to avoid circular deps
  const parsed = JSON.parse(raw) as Partial<SuggestInventoryResponse>;

  if (!parsed.phonology) {
    throw new Error('Response missing required "phonology" field');
  }

  const phon = parsed.phonology as Partial<PhonologyConfig>;

  // Structural validation before the full engine runs
  if (!Array.isArray(phon.inventory?.consonants) || phon.inventory.consonants.length === 0) {
    throw new Error("phonology.inventory.consonants must be a non-empty array");
  }
  if (!Array.isArray(phon.inventory?.vowels) || phon.inventory.vowels.length === 0) {
    throw new Error("phonology.inventory.vowels must be a non-empty array");
  }
  if (!phon.orthography || Object.keys(phon.orthography).length === 0) {
    throw new Error("phonology.orthography must be a non-empty object");
  }
  if (!Array.isArray(phon.phonotactics?.syllableTemplates) || phon.phonotactics.syllableTemplates.length === 0) {
    throw new Error("phonology.phonotactics.syllableTemplates must be a non-empty array");
  }

  // Fill in optional fields with safe defaults
  const complete: PhonologyConfig = {
    inventory: {
      consonants: phon.inventory!.consonants,
      vowels: phon.inventory!.vowels,
      tones: phon.inventory!.tones ?? [],
    },
    phonotactics: {
      syllableTemplates: phon.phonotactics!.syllableTemplates,
      onsetClusters: phon.phonotactics!.onsetClusters ?? [],
      codaClusters: phon.phonotactics!.codaClusters ?? [],
      allophonyRules: phon.phonotactics!.allophonyRules ?? [],
    },
    orthography: phon.orthography!,
    suprasegmentals: {
      hasLexicalTone: phon.suprasegmentals?.hasLexicalTone ?? false,
      hasPhonemicStress: phon.suprasegmentals?.hasPhonemicStress ?? false,
      hasVowelLength: phon.suprasegmentals?.hasVowelLength ?? false,
      hasPhonemicNasalization: phon.suprasegmentals?.hasPhonemicNasalization ?? false,
    },
    writingSystem: phon.writingSystem ?? {
      type: "alphabet",
      mappings: Object.fromEntries(
        Object.entries(phon.orthography || {}).map(([k, v]) => [k, [v]])
      ),
      aesthetics: { complexity: 0.5, style: "angular", strokeDensity: 0.5 },
      glyphs: {}
    }
  };

  return {
    phonology: complete,
    rationale: parsed.rationale ?? "",
  };
}
