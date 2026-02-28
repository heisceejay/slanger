/**
 * Operation: generate_lexicon
 *
 * Generates batches of LexicalEntry objects targeting the unfilled
 * core vocabulary slots. Each word must:
 *  - Use only inventory phonemes
 *  - Respect phonotactic templates
 *  - Have orthographic form derived from the orthography map
 *  - Be morphologically compatible: root + common affixes must stay phonotactically valid
 *  - Include polysemy where semantically motivated
 *  - Have semantic roles for verbs
 *  - Avoid collision with existing forms
 */

import type { GenerateLexiconRequest, GenerateLexiconResponse } from "../types.js";
import type { LexicalEntry, PartOfSpeech, LanguageDefinition, Phonotactics } from "@slanger/shared-types";
import { validateWordForm } from "@slanger/phonology";

export function buildSystemPrompt(): string {
  return `You are a linguistic expert specializing in constructed language lexicon design.

You generate vocabulary for constructed languages. Each word must:
1. Use ONLY phonemes from the provided inventory — NO exceptions, not even for visually similar symbols.
2. Follow the syllable templates exactly — every syllable in the word must match one of the provided templates.
3. Be morphologically compatible: after adding any common affix, the resulting form must still use only inventory phonemes and valid syllable templates.
4. Have a valid IPA phonologicalForm AND orthographicForm derived from the orthography map.
5. Respect morpheme order (PREFIX → ROOT → SUFFIX where applicable) — roots must be designable to attach affixes cleanly.
6. Include polysemy only where semantically natural (1–2 senses per word).
7. Avoid phonological collision with existing words.
8. NEVER invent new phonemes. If unsure whether a symbol is in the inventory, do not use it.

MORPHOLOGICAL COMPATIBILITY CHECK (mandatory for every entry):
- Look at the COMMON AFFIXES list provided in the user message.
- Mentally compose: ROOT + each affix listed.
- Verify the composite form still uses only inventory phonemes and a valid syllable template.
- Adjust the root until all common affix combinations are phonotactically valid.

WARNING ABOUT ENGLISH CALQUES (VERY STRICT!):
- Do NOT provide English words disguised with IPA (e.g. "with", "from", "to", "or", "no", "so", "not", "yes").
- Functional/grammar words MUST BE COMPLETELY INVENTED ROOTS.
- If your word looks or sounds like the English translation (e.g. /sɔ/ for "so", /ur/ for "or", /nɔt/ for "not", /es/ or /jɛs/ for "yes"), IT WILL FAIL.
- Instead, invent roots that look totally different (e.g., /tasi/ for "so", /vum/ for "or", /kana/ for "not", /zivu/ for "yes").

Generate core vocabulary efficiently. Prioritize Swadesh-style words.`;
}

export function buildUserMessage(req: GenerateLexiconRequest, lang: LanguageDefinition, retryErrors?: string[]): string {
  const retryBlock = retryErrors?.length
    ? `\n[PREVIOUS ATTEMPT ERRORS — FIX THESE]\n${retryErrors.map((e, i) => `${i + 1}. ${e}`).join("\n")}
CRITICAL RETRY INSTRUCTIONS:
1. ILLEGAL SYMBOL OR CALQUE: If a word failed for using an illegal phoneme (like /ɔ/ or /ɪ/), OR failed phonotactics, you likely tried to copy an English word like "so", "or", "no", "yes", or "not". DO NOT JUST SWAP ONE VOWEL. You MUST invent a COMPLETELY NEW, unrelated spelling (e.g. /taka/, /vum/, /pali/) using only the allowed inventory!
2. MORPHOLOGY ERRORS [MORPH_PHN_PHON]: If a word failed when combined with an affix (e.g. "manua" or "tamai"), the root itself is the problem.
   - If the error says "Syllable 'a' (pattern:V) doesn't match", it means you have two vowels in a row (hiatus).
   - FIX: Redesign the root to end in a CONSONANT (e.g. change "manu" to "manut") so that + "-a" becomes "manuta" (CV-CV-CV), which is valid!\n`
    : "";

  const consonants = req.phonology.inventory.consonants;
  const vowels = req.phonology.inventory.vowels;
  const consStr = consonants.join(" ");
  const vowStr = vowels.join(" ");
  const allowedOnly = [...consonants, ...vowels].join(", ");
  const templates = req.phonology.phonotactics.syllableTemplates.join(", ");
  const orthSample = Object.entries(req.phonology.orthography).slice(0, 12).map(([p, g]) => `${p}→${g}`).join(", ");

  // Check if any template allows a syllable without an onset consonant (e.g., V, VC, VCC)
  // A template allows it if it starts with V or (C) or optional onset.
  // For simplicity, if no template has V as the first required element, we add a strict rule.
  const allowsVowelInitial = req.phonology.phonotactics.syllableTemplates.some(t => {
    // Basic heuristic: if it starts with V or (C), it might allow vowel-initial
    return t.startsWith("V") || t.startsWith("(C)");
  });

  const vowelInitialWarning = !allowsVowelInitial
    ? `\nCRITICAL SYLLABIFICATION RULE:
- EVERY VOWEL phoneme forms its own syllable.
- Your templates [ ${templates} ] all require a CONSONANT ONSET.
- This means: NO consecutive vowels (e.g. "aa" is NOT a long vowel, it is two 'V' syllables, which is ILLEGAL).
- If you attach a vowel suffix to a vowel-ending root, it creates an illegal 'V' syllable. You MUST use a root ending in a consonant instead!`
    : "";

  // Extract flat affix samples from paradigms so the model can check root compatibility
  const affixSamples: string[] = [];
  for (const [paradigmKey, cells] of Object.entries(lang.morphology.paradigms).slice(0, 4)) {
    if (typeof cells === "object" && cells !== null) {
      for (const [featureVal, affix] of Object.entries(cells).slice(0, 3)) {
        if (typeof affix === "string" && affix.trim()) {
          affixSamples.push(`"${affix}" (${featureVal})`);
        }
        if (affixSamples.length >= 8) break;
      }
    }
    if (affixSamples.length >= 8) break;
  }
  const affixBlock = affixSamples.length
    ? `\nCOMMON AFFIXES (roots MUST be compatible with these):\n${affixSamples.join(", ")}`
    : "";

  const morphemeOrderStr = lang.morphology.morphemeOrder?.join(" → ") ?? "root";

  const slotsBlock = req.targetSlots
    .slice(0, req.batchSize)
    .map(s => `  - "${s.slot}" (${s.pos}${s.subcategory ? ", subcategory: " + s.subcategory : ""}, field: ${s.semanticField})`)
    .join("\n");

  const existingBlock = req.existingOrthForms.length
    ? `\nAVOID THESE EXISTING FORMS (no homophones or near-homophones):\n${req.existingOrthForms.slice(0, 15).join(", ")}`
    : "";

  const worldNote = lang.meta.world
    ? `\nWORLD/CULTURE CONTEXT: "${lang.meta.world}" — let this subtly flavor naming conventions`
    : "";

  return `${retryBlock}
Generate ${req.batchSize} lexical entries for a constructed language.

═══════════════════════════════════════════
PHONOLOGY (STRICT — ZERO EXCEPTIONS)
═══════════════════════════════════════════
Consonants: ${consStr}
Vowels: ${vowStr}
Syllable templates: ${templates}${vowelInitialWarning}
Orthography map (IPA→spelling): ${orthSample}

ALLOWED IPA SYMBOLS ONLY: [ ${allowedOnly} ]
Do NOT use ɛ, ɔ, ɑ, ɪ, ʊ, ə, æ, ʒ, ʃ, θ, ð, ŋ, or ANY symbol not in the list above.
Example: if vowels are /a e i o u/, write /kana/ not /kɑnɑ/. If only /p t k/ are stops, do not write /b d g/.
CRITICAL: Do not spell out English words ("with", "from", "or", "no", "not", "so", "yes") using their English pronunciation! INVENT A NEW VALID ROOT INSTEAD! For example, for "so", "not", or "yes", invent a root like /ma/, /pali/, or /tusi/ using your allowed phonemes, rather than trying to force /sɔ/, /ur/, or /es/!

═══════════════════════════════════════════
MORPHOLOGY & COMPATIBILITY
═══════════════════════════════════════════
Typology: ${lang.morphology.typology}
Morpheme order: ${morphemeOrderStr}
${lang.morphology.categories ? `Inflectional categories: ${JSON.stringify(lang.morphology.categories).slice(0, 300)}` : ""}
${affixBlock}

ROOT COMPATIBILITY CHECK EXAMPLE:
If suffixes are "-a" and templates are [CV, CVC]:
  1. Try root "manu" (ma.nu). Root alone is valid.
  2. Combine with "-a" → "manua".
  3. Syllabify "manua" → ma (CV) + nu (CV) + a (V).
  4. ERROR: "a" (V) is not allowed in [CV, CVC]. "manu" is an INVALID root.
  5. Try root "manut" (ma.nut). Combined → "manuta" (ma.nu.ta, all CV). VALID!

ROOT COMPATIBILITY REQUIREMENT:
For each root you generate, verify:
  (a) ROOT alone → uses only [ ${allowedOnly} ] and fits template(s): ${templates}
  (b) ROOT + each affix above → still uses only [ ${allowedOnly} ] and fits template(s): ${templates}
  If any combination fails, choose a different root shape.
${lang.morphology.templatic?.enabled
      ? `
TEMPLATIC MORPHOLOGY ENABLED:
- Roots are NOT whole words — they are bare consonant sequences (e.g. "k-t-b").
- 'phonologicalForm' MUST be those consonants (e.g. "/k-t-b/").
- 'orthographicForm' is the orthographic rendering of that consonant sequence.
- Root must have exactly ${lang.morphology.templatic.rootTemplates?.[0]?.replace(/[^C]/g, "").length ?? 3} consonants.`
      : ""}

═══════════════════════════════════════════
CONTEXT & SEMANTICS
═══════════════════════════════════════════
Naturalism score: ${req.naturalismScore.toFixed(2)} (0=experimental, 1=naturalistic — higher means more regular, predictable phonology)
Tags: ${req.tags.join(", ") || "none"}
${worldNote}
${existingBlock}

═══════════════════════════════════════════
SEMANTIC SLOTS TO FILL
═══════════════════════════════════════════
${slotsBlock}

STEPS for each entry:
1. Pick a root shape compatible with inventory and templates.
2. Run the ROOT COMPATIBILITY CHECK (as shown in the example above).
3. If valid, map to orthography.

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
  "phonologicalNotes": "<brief note on root shapes chosen and affix compatibility verified>"
}

RESPOND WITH ONLY valid JSON. No markdown, no preamble.
IDs: lex_0001, lex_0002, etc. Phonemes only from: ${allowedOnly}. Templates: ${templates}.`.trim();
}

export function parseResponse(raw: string, startId: number, inventory: { consonants: string[], vowels: string[] }, phonotactics: Phonotactics): GenerateLexiconResponse {
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

    // Strip slashes from phonological form for consistency with the rest of the app
    entry.phonologicalForm = entry.phonologicalForm.replace(/^\/+|\/+$/g, "");

    return entry;
  });

  // Basic structural and strict phoneme checks
  const allowedSet = new Set([...inventory.consonants, ...inventory.vowels]);
  for (const entry of entries) {
    if (!entry.phonologicalForm) throw new Error(`Entry ${entry.id} missing phonologicalForm`);
    if (!entry.orthographicForm) throw new Error(`Entry ${entry.id} missing orthographicForm`);
    if (entry.glosses.length === 0) throw new Error(`Entry ${entry.id} has no glosses`);

    // Strict fast-fail check for hallucinated phonemes
    // This feeds directly back into the LLM retry loop
    const characters = Array.from(entry.phonologicalForm);
    for (const char of characters) {
      if (/[a-zɐ-ʒ]/.test(char) && !allowedSet.has(char)) {
        throw new Error(`Entry ${entry.id} ("${entry.orthographicForm}") uses ILLEGAL symbol /${char}/ in /${entry.phonologicalForm}/. You MUST ONLY use the allowed inventory symbols.`);
      }
    }

    // Strict fast-fail check for phonotactic structure
    const phonoResult = validateWordForm(`/${entry.phonologicalForm}/`, phonotactics, {
      consonants: inventory.consonants,
      vowels: inventory.vowels,
      tones: []
    });
    if (!phonoResult.valid) {
      const errorMsg = phonoResult.issues.map(i => i.message).join("; ");
      throw new Error(`Entry ${entry.id} ("${entry.orthographicForm}") failed phonotactics: ${errorMsg}`);
    }
  }

  return {
    entries,
    phonologicalNotes: String(parsed.phonologicalNotes ?? ""),
  };
}
