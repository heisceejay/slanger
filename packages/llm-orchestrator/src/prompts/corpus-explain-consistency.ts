/**
 * Operation: generate_corpus
 *
 * Generates corpus samples with full interlinear glosses.
 * Each sample must use only words from the lexicon and
 * respect the syntax config's word order and clause types.
 */

import type {
  GenerateCorpusRequest, GenerateCorpusResponse,
  ExplainRuleRequest, ExplainRuleResponse,
  CheckConsistencyRequest, CheckConsistencyResponse
} from "../types.js";
import type { CorpusSample, InterlinearLine, LexicalEntry, LanguageDefinition } from "@slanger/shared-types";

// ─── Op 4: generate_corpus ────────────────────────────────────────────────────

export const CORPUS_SYSTEM_PROMPT = `You are an expert in constructed language text creation, syntax, and interlinear glossing.

You create corpus samples for constructed languages. Each sample must:
1. Be a coherent, natural sentence that logically applies the requested clause types and registers.
2. SYNTAX COMPLIANCE: Strictly follow the language's word order, phrase structure rules, headedness, and adposition type.
3. MORPHOLOGY COMPLIANCE: Apply the correct inflectional morphology using the paradigm tables.
4. LEXICON REUSE: You MUST prioritize using words from the provided lexicon. Do not coin a new word if a near-synonym already exists.
5. NEW WORD CONSTRAINTS: If you ABSOLUTELY MUST coin a new word to make a sentence logical, you MUST add it to "newEntries". ANY new word MUST use ONLY the exact phonemes from the phonology inventory and follow the syllable templates.
6. Produce grammatically complete interlinear glosses in Leipzig glossing convention.
7. Include IPA transcription (only allowed consonants and vowels from the phonology).
8. English translation must be in SVO order for clarity, even if the conlang has different word order.
9. TEMPLATIC MORPHOLOGY (if enabled): the 'morphemes' array should contain the root consonants (e.g. "k-t-b") and the 'glosses' should reflect the root meaning and the vocalic pattern meaning.`;

export function buildCorpusUserMessage(req: GenerateCorpusRequest, retryErrors?: string[]): string {
  const retryBlock = retryErrors?.length
    ? `\n[PREVIOUS ATTEMPT ERRORS — FIX THESE STRICTLY]\n${retryErrors.map((e, i) => `${i + 1}. ${e}`).join("\n")}\n`
    : "";

  // Increase lexicon sample drastically so model has more to work with
  const lexSample = req.language.lexicon.slice(0, 40).map(e =>
    `  ${e.orthographicForm} /${e.phonologicalForm.replace(/^\/|\/$/g, "")}/ (${e.pos}) = "${e.glosses.join(", ")}"`
  ).join("\n");

  const paradigmSample = JSON.stringify(
    Object.fromEntries(Object.entries(req.language.morphology.paradigms).slice(0, 4)),
    null, 2
  );

  // Serialize phrase structure rules into readable constituent rules
  const phraseStructStr = Object.entries(req.language.syntax.phraseStructure)
    .map(([head, slots]) => {
      const slotDesc = slots.map(s => {
        let sc = s.label;
        if (s.optional) sc = `[${sc}]`;
        if (s.repeatable) sc = `${sc}+`;
        return sc;
      }).join(" ");
      return `  - ${head} → ${slotDesc}`;
    }).join("\n");

  const consonants = req.language.phonology.inventory.consonants;
  const vowels = req.language.phonology.inventory.vowels;
  const allowedOnly = [...consonants, ...vowels].join(", ");

  return `${retryBlock}
Generate ${req.count} corpus sample(s) for this constructed language.

═══════════════════════════════════════════
SYNTAX (STRICT COMPLIANCE REQUIRED)
═══════════════════════════════════════════
- Word order: ${req.language.syntax.wordOrder}
- Morphosyntactic alignment: ${req.language.syntax.alignment} (ensure subjects/objects are case-marked or agreed-with correctly according to this alignment)
- Headedness: ${req.language.syntax.headedness}
- Adposition type: ${req.language.syntax.adpositionType}
- Supported clause types: ${req.language.syntax.clauseTypes.join(", ")}
Phrase Structure Rules:
${phraseStructStr || "  (Use standard X-bar theory mappings for the word order)"}

═══════════════════════════════════════════
LEXICON & REUSE (PRIORITIZE THESE WORDS)
═══════════════════════════════════════════
${lexSample}
...and ${Math.max(0, req.language.lexicon.length - 40)} more entries.
-> RULE: Construct your sentences using THESE words if at all possible. New words are a last resort.

═══════════════════════════════════════════
PHONOLOGY (APPLIES TO IPA AND ANY NEW WORDS)
═══════════════════════════════════════════
- Consonants: ${consonants.join(" ")}
- Vowels: ${vowels.join(" ")}
- Allowed symbols: [ ${allowedOnly} ]
- Syllable templates: ${req.language.phonology.phonotactics.syllableTemplates.join(", ")}
${req.language.phonology.writingSystem ? `- Writing System: ${req.language.phonology.writingSystem.type} (${JSON.stringify(req.language.phonology.writingSystem.aesthetics)})` : ""}

═══════════════════════════════════════════
MORPHOLOGY PARADIGMS (SAMPLE)
═══════════════════════════════════════════
Typology: ${req.language.morphology.typology}
${paradigmSample}

${req.language.morphology.templatic?.enabled
      ? `TEMPLATIC MORPHOLOGY ENABLED:
- Roots are consonant clusters (e.g. "k-t-b").
- Inflection happens by inserting vowels per templates: ${req.language.morphology.templatic.rootTemplates.join(", ")}.
- Vocalisms: ${JSON.stringify(req.language.morphology.templatic.vocaloidPatterns)}`
      : ""
    }

═══════════════════════════════════════════
REQUEST DETAILS
═══════════════════════════════════════════
- Language Name: ${req.language.meta.name}
- Registers requested: ${req.registers.join(", ")}
${req.userPrompt ? `- USER PROMPT: "${req.userPrompt}"` : ""}

Generate exactly ${req.count} sample(s) following THIS JSON structure:
{
  "samples": [
    {
      "id": "corpus_001",
      "register": "${req.registers[0]}",
      "orthographicText": "<text in language's orthography>",
      "ipaText": "/<full IPA transcription>/",
      "translation": "<English free translation>",
      "interlinearGloss": [
        {
          "word": "<orthographic word>",
          "morphemes": ["<root>", "-<suffix>"],
          "glosses": ["ROOT.GLOSS", "GRAM.FEAT"]
        }
      ],
      "prompt": "${req.userPrompt ?? ""}",
      "generatedAt": "${new Date().toISOString()}"
    }
  ],
  "newEntries": [
    { "orthographicForm": "<spelling>", "phonologicalForm": "/<ipa>/", "pos": "noun|verb|adjective|...", "glosses": ["<English gloss>"] }
  ]
}

CRITICAL:
- Write sentences that are logical and well-formed.
- If you use ANY word NOT in the lexicon above, you MUST add it to "newEntries".
- Any word in "newEntries" MUST use ONLY the exact consonants and vowels listed in PHONOLOGY.
- Leipzig glossing rules: capitalize grammatical abbreviations (NOM, ACC, 1SG, PAST), lowercase lexical glosses.

RESPOND WITH ONLY valid JSON. No markdown, no preamble.`.trim();
}

/**
 * Normalize corpus samples so every word matches the lexicon exactly.
 * Replaces interlinear word forms with canonical orthographicForm and rebuilds
 * orthographicText and ipaText from lexicon so lexicon and corpus stay in sync.
 */
export function normalizeCorpusSamplesToLexicon(
  samples: CorpusSample[],
  lexicon: LexicalEntry[]
): CorpusSample[] {
  if (lexicon.length === 0) return samples;

  const orthToEntry = new Map<string, LexicalEntry>();
  const glossToEntry = new Map<string, LexicalEntry>();
  for (const e of lexicon) {
    const orth = (e.orthographicForm ?? "").trim();
    if (orth) orthToEntry.set(orth, e);
    orthToEntry.set(orth.toLowerCase(), e);
    for (const g of e.glosses ?? []) {
      const k = g.trim().toLowerCase();
      if (k && !glossToEntry.has(k)) glossToEntry.set(k, e);
    }
  }

  function findEntry(line: InterlinearLine): LexicalEntry | null {
    const word = (line.word ?? "").trim();
    if (!word) return null;
    return orthToEntry.get(word) ?? orthToEntry.get(word.toLowerCase()) ?? null;
  }

  function findEntryByGloss(line: InterlinearLine): LexicalEntry | null {
    const firstGloss = (line.glosses?.[0] ?? "").trim().toLowerCase();
    if (!firstGloss) return null;
    return glossToEntry.get(firstGloss) ?? null;
  }

  return samples.map((sample) => {
    const interlinear = sample.interlinearGloss ?? [];
    const normalizedLines: InterlinearLine[] = interlinear.map((line) => {
      const entry = findEntry(line) ?? findEntryByGloss(line);
      const word = entry ? entry.orthographicForm : line.word;
      return { ...line, word: word ?? line.word };
    });

    const orthographicText = normalizedLines.map((l) => l.word ?? "").join(" ").replace(/\s+/g, " ").trim();
    const ipaParts = normalizedLines.map((line) => {
      const entry = findEntry(line) ?? findEntryByGloss(line);
      if (entry?.phonologicalForm) return entry.phonologicalForm.replace(/^\/|\/$/g, "").trim();
      return "";
    });
    const ipaText = ipaParts.every(Boolean) ? `/${ipaParts.join(" ")}/` : (sample.ipaText || "");

    return {
      ...sample,
      interlinearGloss: normalizedLines,
      orthographicText: orthographicText || sample.orthographicText,
      ipaText: ipaText || sample.ipaText,
    };
  });
}

export function parseCorpusResponse(raw: string): GenerateCorpusResponse {
  const parsed = JSON.parse(raw) as Partial<GenerateCorpusResponse & { newEntries?: unknown[] }>;
  if (!Array.isArray(parsed.samples)) throw new Error('Response missing "samples" array');
  const samples: CorpusSample[] = (parsed.samples as unknown as Record<string, unknown>[]).map((s, i) => {
    const sample: CorpusSample = {
      id: String(s["id"] ?? `corpus_${String(i + 1).padStart(3, "0")}`),
      register: (s["register"] as CorpusSample["register"]) ?? "informal",
      orthographicText: String(s["orthographicText"] ?? ""),
      ipaText: String(s["ipaText"] ?? ""),
      translation: String(s["translation"] ?? ""),
      interlinearGloss: Array.isArray(s["interlinearGloss"])
        ? (s["interlinearGloss"] as InterlinearLine[])
        : [],
      generatedAt: String(s["generatedAt"] ?? new Date().toISOString()),
    };
    if (s["prompt"]) sample.prompt = String(s["prompt"]);
    return sample;
  });
  for (const s of samples) {
    if (!s.orthographicText) throw new Error(`Sample ${s.id} missing orthographicText`);
    if (!s.translation) throw new Error(`Sample ${s.id} missing translation`);
  }

  const newEntries: LexicalEntry[] = [];
  if (Array.isArray(parsed.newEntries)) {
    for (const e of parsed.newEntries as Record<string, unknown>[]) {
      const orth = String(e["orthographicForm"] ?? "").trim();
      const phon = String(e["phonologicalForm"] ?? "").trim();
      const pos = (e["pos"] as LexicalEntry["pos"]) ?? "other";
      const glosses = Array.isArray(e["glosses"]) ? (e["glosses"] as string[]) : [String(e["glosses"] ?? "")];
      if (!orth || !phon || glosses.length === 0) continue;
      newEntries.push({
        id: "", // assigned in operation
        orthographicForm: orth,
        phonologicalForm: phon.startsWith("/") ? phon : `/${phon}/`,
        pos,
        glosses,
        semanticFields: Array.isArray(e["semanticFields"]) ? (e["semanticFields"] as string[]) : [],
        derivedForms: [],
        source: "generated",
      });
    }
  }
  if (newEntries.length > 0) return { samples, newEntries };
  return { samples };
}

// ─── Op 5: explain_rule ───────────────────────────────────────────────────────

export const EXPLAIN_SYSTEM_PROMPT = `You are a linguistics teacher who explains constructed language features clearly.

When explaining a rule:
1. Start with the core idea in plain language
2. Show worked examples using the language's actual vocabulary
3. Note the cross-linguistic parallels (what natural language does something similar?)
4. For technical depth: describe the formal/phonological account
5. Keep beginner explanations jargon-free; use proper terminology for technical depth`;

export function buildExplainUserMessage(req: ExplainRuleRequest, retryErrors?: string[]): string {
  const retryBlock = retryErrors?.length
    ? `\n[RETRY — FIX ERRORS]\n${retryErrors.map((e, i) => `${i + 1}. ${e}`).join("\n")}\n`
    : "";

  const lexSample = req.language.lexicon.slice(0, 5).map(e =>
    `${e.orthographicForm} = "${e.glosses[0]}"`
  ).join(", ");

  return `${retryBlock}
Explain this ${req.module} rule from the constructed language "${req.language.meta.name}".

RULE REFERENCE: ${req.ruleRef}
RULE DATA: ${JSON.stringify(req.ruleData, null, 2)}

LANGUAGE CONTEXT:
- Morphological type: ${req.language.morphology.typology}
- Word order: ${req.language.syntax.wordOrder}
- Sample vocabulary: ${lexSample}

EXPLANATION DEPTH: ${req.depth}

Respond with ONLY this JSON:
{
  "explanation": "<clear explanation appropriate for ${req.depth} level>",
  "examples": [
    {
      "input": "<base form>",
      "output": "<derived/inflected form>",
      "steps": ["step 1: ...", "step 2: ..."]
    }
  ],
  "crossLinguisticParallels": ["<natural language example>", ...]
}`.trim();
}

export function parseExplainResponse(raw: string): ExplainRuleResponse {
  const parsed = JSON.parse(raw) as Partial<ExplainRuleResponse>;
  if (!parsed.explanation) throw new Error('Response missing "explanation"');
  return {
    explanation: String(parsed.explanation),
    examples: Array.isArray(parsed.examples) ? parsed.examples : [],
    crossLinguisticParallels: Array.isArray(parsed.crossLinguisticParallels) ? parsed.crossLinguisticParallels : [],
  };
}

// ─── Op 6: check_consistency ─────────────────────────────────────────────────

export const CONSISTENCY_SYSTEM_PROMPT = `You are a professional linguistic consultant reviewing constructed languages.

Your role is to identify inconsistencies that rule-based validators miss:
1. Typological mismatches (e.g. SOV language with prepositions — cross-linguistically unusual)
2. Phonological "texture" inconsistencies (mixing sounds from very different language families)
3. Morphological complexity mismatches (inventory size vs paradigm complexity)
4. Pragmatic lacunae (no way to express politeness despite having honorifics flag)
5. Lexical gaps for the stated typology (no evidentiality markers despite evidentiality category)

Be constructive — note strengths, not just problems. Score 0-100 (100 = perfectly consistent).`;

export function buildConsistencyUserMessage(req: CheckConsistencyRequest, lang: LanguageDefinition, retryErrors?: string[]): string {
  const retryBlock = retryErrors?.length
    ? `\n[RETRY]\n${retryErrors.map((e, i) => `${i + 1}. ${e}`).join("\n")}\n`
    : "";

  const focus = req.focusAreas?.join(", ") ?? "all areas";
  const usedLang = lang;

  return `${retryBlock}
Perform a linguistic consistency review of "${usedLang.meta.name}".

FOCUS AREAS: ${focus}

PHONOLOGY:
- Consonants (${usedLang.phonology.inventory.consonants.length}): ${usedLang.phonology.inventory.consonants.join(" ")}
- Vowels (${usedLang.phonology.inventory.vowels.length}): ${usedLang.phonology.inventory.vowels.join(" ")}
- Suprasegmentals: tone=${usedLang.phonology.suprasegmentals.hasLexicalTone}, stress=${usedLang.phonology.suprasegmentals.hasPhonemicStress}
- Templates: ${usedLang.phonology.phonotactics.syllableTemplates.join(", ")}
${usedLang.phonology.writingSystem ? `- Writing System: ${usedLang.phonology.writingSystem.type}` : ""}

MORPHOLOGY:
- Typology: ${usedLang.morphology.typology}
- Templatic: ${usedLang.morphology.templatic?.enabled ? `YES (${usedLang.morphology.templatic.rootTemplates.join(", ")})` : "NO"}
- Categories: ${JSON.stringify(usedLang.morphology.categories)}
- Paradigm keys: ${Object.keys(usedLang.morphology.paradigms).join(", ")}
- Morpheme order: ${usedLang.morphology.morphemeOrder.join(" → ")}

SYNTAX:
- Word order: ${usedLang.syntax.wordOrder}
- Alignment: ${usedLang.syntax.alignment}
- Headedness: ${usedLang.syntax.headedness}
- Adposition type: ${usedLang.syntax.adpositionType}
- Clause types: ${usedLang.syntax.clauseTypes.join(", ")}

PRAGMATICS:
- Formal register: ${usedLang.pragmatics.hasFormalRegister}
- Honorifics: ${usedLang.pragmatics.hasHonorifics}
- Strategies: ${usedLang.pragmatics.politenessStrategies.join(", ") || "none"}

LEXICON: ${usedLang.lexicon.length} entries (${usedLang.lexicon.filter((e: LexicalEntry) => e.subcategory === "personal-pronoun").length} pronouns, ${usedLang.lexicon.filter((e: LexicalEntry) => e.subcategory === "cardinal-number").length} numerals)

Respond with ONLY this JSON:
{
  "overallScore": <0-100>,
  "linguisticIssues": [
    {
      "severity": "error|warning|note",
      "module": "<phonology|morphology|syntax|pragmatics|cross>",
      "description": "<what is inconsistent>",
      "suggestion": "<how to fix it>"
    }
  ],
  "overallStrengths": ["<positive feature>", ...],
  "suggestions": ["<actionable improvement>", ...]
}`.trim();
}

export function parseConsistencyResponse(raw: string): CheckConsistencyResponse {
  const parsed = JSON.parse(raw) as Partial<CheckConsistencyResponse>;
  if (typeof parsed.overallScore !== "number") throw new Error('Response missing numeric "overallScore"');
  return {
    overallScore: Math.max(0, Math.min(100, parsed.overallScore)),
    linguisticIssues: Array.isArray(parsed.linguisticIssues) ? parsed.linguisticIssues : [],
    suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions : [],
    strengths: Array.isArray(parsed.strengths) ? parsed.strengths : [],
  };
}
