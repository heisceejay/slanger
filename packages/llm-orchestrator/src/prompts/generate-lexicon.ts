/**
 * Operation: generate_lexicon
 *
 * Generates batches of LexicalEntry objects targeting the unfilled
 * core vocabulary slots. Each word must:
 *  - Use only inventory phonemes
 *  - Respect phonotactic templates
 *  - Have orthographic form derived from the orthography map
 *  - Include polysemy where semantically motivated
 *  - Have semantic roles for verbs
 *  - Avoid collision with existing forms
 */

import type { GenerateLexiconRequest, GenerateLexiconResponse } from "../types.js";
import type { LexicalEntry, PartOfSpeech, LanguageDefinition } from "@slanger/shared-types";

export function buildSystemPrompt(): string {
  return `You are a linguistic expert specializing in constructed language lexicon design.

You generate vocabulary for constructed languages. Each word you create must:
1. Be built EXCLUSIVELY from the provided phoneme inventory. If /s/ is not in the inventory, you are STRICTLY FORBIDDEN from using /s/ in any word.
2. Follow the syllable templates exactly — no exceptions.
3. Respect all phonological and morphological rules: if the language has root templates (like k-t-b) or specific morpheme orders, your roots must be compatible with them.
4. Have a plausible IPA phonological form AND an orthographic form (explicitly derived from the orthography map).
5. Include semantically motivated polysemy where natural (most words should have 1-2 senses).
6. Avoid phonological collision with existing words.
7. Provide semantic roles for all verbs (agent, patient, experiencer, theme, etc.).
8. Mark pronouns, numbers, and function words with the correct subcategory field.
9. NEVER invent new phonemes. Every single character in your words MUST be a direct copy-paste from the allowed inventory list.

Each batch adds 5 essential words. Generate words efficiently.

Prioritize core vocabulary (Swadesh-style) that a functional language needs. Match the slot requirements exactly.`;
}

export function buildUserMessage(req: GenerateLexiconRequest, lang: LanguageDefinition, retryErrors?: string[]): string {
  const retryBlock = retryErrors?.length
    ? `\n[PREVIOUS ATTEMPT ERRORS — FIX THESE]\n${retryErrors.map((e, i) => `${i + 1}. ${e}`).join("\n")}\n`
    : "";

  const consonants = req.phonology.inventory.consonants;
  const vowels = req.phonology.inventory.vowels;
  const consStr = consonants.join(" ");
  const vowStr = vowels.join(" ");
  const allowedOnly = [...consonants, ...vowels].join(", ");
  const templates = req.phonology.phonotactics.syllableTemplates.join(", ");
  const orthSample = Object.entries(req.phonology.orthography).slice(0, 12).map(([p, g]) => `${p}→${g}`).join(", ");

  const slotsBlock = req.targetSlots
    .slice(0, req.batchSize)
    .map(s => `  - "${s.slot}" (${s.pos}${s.subcategory ? ", subcategory: " + s.subcategory : ""}, field: ${s.semanticField})`)
    .join("\n");

  const existingBlock = req.existingOrthForms.length
    ? `\nAVOID THESE EXISTING FORMS (don't create homophones):\n${req.existingOrthForms.slice(0, 30).join(", ")}`
    : "";

  const worldNote = lang.meta.world
    ? `\nWORLD/CULTURE CONTEXT: "${lang.meta.world}" — let this flavor naming conventions subtly`
    : "";

  return `${retryBlock}
Generate ${req.batchSize} lexical entries for a constructed language.

PHONEME INVENTORY (use ONLY these symbols in phonologicalForm — no others):
- Consonants: ${consStr}
- Vowels: ${vowStr}
- Syllable templates: ${templates}
- Orthography (IPA→spelling): ${orthSample}

ALLOWED IPA SYMBOLS ONLY: [ ${allowedOnly} ]
Do NOT use ɛ, ɔ, ɑ, ɪ, ʊ, ə, æ, ʒ, ʃ, θ, ð, ŋ, etc. unless they appear in the list above. Use the exact vowels/consonants from this language (e.g. if vowels are a e i o u, write /kana/ not /kɑnɑ/).

MORPHOLOGY: typology ${lang.morphology.typology}. Follow the language's inflectional categories and paradigm structure (e.g. noun cases, verb agreement) when generating words; root forms should be compatible with the morphology.
NATURALISM SCORE: ${req.naturalismScore.toFixed(2)} (0=experimental, 1=naturalistic)
TAGS: ${req.tags.join(", ") || "none"}
${lang.morphology.templatic?.enabled
      ? `\nTEMPLATIC MORPHOLOGY ENABLED:
- For this language, roots are NOT whole words.
- 'phonologicalForm' MUST be a sequence of consonants representing the root (e.g. "k-t-b").
- 'orthographicForm' should be the orthographic representation of that root.
- The root must have exactly as many consonants as the 'rootTemplates' expect (usualy 3).`
      : ""
    }
${worldNote}
${existingBlock}

SEMANTIC SLOTS TO FILL (generate one entry per slot):
${slotsBlock}

For each entry, generate the IPA form by combining phonemes per templates.
Derive the orthographic form by substituting each IPA phoneme using the orthography map.

Respond with ONLY this JSON:
{
  "entries": [
    {
      "id": "lex_NNNN",
      "phonologicalForm": "/<ipa>/",
      "orthographicForm": "<orthographic>",
      "pos": "<noun|verb|adjective|adverb|particle|pronoun|numeral|other>",
      "subcategory": "<optional: personal-pronoun|cardinal-number|negation|copula|conjunction|adposition|swadesh-core|etc>",
      "glosses": ["<primary gloss>", "<secondary gloss if polysemous>"],
      "senses": [
        { "index": 1, "gloss": "<gloss>", "semanticField": "<field>" }
      ],
      "semanticFields": ["<field>"],
      "semanticRoles": ["agent", "patient"],
      "derivedForms": [],
      "source": "generated"
    }
  ],
  "phonologicalNotes": "<brief note on phonological patterns used>"
}

CRITICAL:
- IDs: lex_0001, lex_0002, ... (4+ digits)
- phonologicalForm: use ONLY these symbols — ${allowedOnly}. No ɛ, ɔ, ɑ, ɪ, ʊ, ə, æ. Format: "/syllable.syllable/" or "/word/"
- Every word must match syllable templates: ${templates}
- orthographicForm: spell using the orthography map (each IPA → one grapheme)
- glosses: every entry MUST have at least one gloss, e.g. ["water"]. Never leave glosses empty.
- semanticRoles: required for verbs (e.g. ["agent"])`.trim();
}

export function parseResponse(raw: string, startId: number): GenerateLexiconResponse {
  const parsed = JSON.parse(raw) as Partial<GenerateLexiconResponse>;

  if (!Array.isArray(parsed.entries)) throw new Error('Response missing "entries" array');
  if (parsed.entries.length === 0) throw new Error("entries array is empty");

  // Re-number IDs sequentially to avoid collisions
  const entries: LexicalEntry[] = (parsed.entries as unknown as Record<string, unknown>[]).map((e, i) => {
    const idNum = String(startId + i).padStart(4, "0");
    const pos = (e["pos"] as PartOfSpeech) ?? "other";

    const entry: LexicalEntry = {
      id: `lex_${idNum}`,
      phonologicalForm: String(e["phonologicalForm"] ?? ""),
      orthographicForm: String(e["orthographicForm"] ?? ""),
      pos,
      glosses: Array.isArray(e["glosses"]) ? (e["glosses"] as string[]) : [String(e["glosses"] ?? "")],
      semanticFields: Array.isArray(e["semanticFields"]) ? (e["semanticFields"] as string[]) : [],
      derivedForms: [],
      source: "generated" as const,
    };
    const rawSub = e["subcategory"];
    if (typeof rawSub === "string") entry.subcategory = rawSub as NonNullable<LexicalEntry["subcategory"]>;
    if (Array.isArray(e["senses"])) entry.senses = e["senses"] as LexicalEntry["senses"] ?? [];
    if (Array.isArray(e["semanticRoles"])) entry.semanticRoles = e["semanticRoles"] as LexicalEntry["semanticRoles"] ?? [];
    if (e["etymology"]) entry.etymology = String(e["etymology"]);
    return entry;
  });

  // Basic structural checks
  for (const entry of entries) {
    if (!entry.phonologicalForm) throw new Error(`Entry ${entry.id} missing phonologicalForm`);
    if (!entry.orthographicForm) throw new Error(`Entry ${entry.id} missing orthographicForm`);
    if (entry.glosses.length === 0) throw new Error(`Entry ${entry.id} has no glosses`);
  }

  return {
    entries,
    phonologicalNotes: String(parsed.phonologicalNotes ?? ""),
  };
}
