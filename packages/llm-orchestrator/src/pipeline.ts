/**
 * Autonomous Generation Pipeline
 *
 * Chains all 6 operations in dependency order to build
 * a complete LanguageDefinition from a single request.
 *
 * Step order:
 *   1. suggest_phoneme_inventory   → PhonologyConfig
 *   2. fill_paradigm_gaps          → MorphologyConfig
 *   3. generate_lexicon (5 words per batch)
 *   4. generate_corpus             → CorpusSample[]
 *   5. check_consistency           → audit + suggestions (no-op on store)
 *
 * Each step emits StreamEvents so the API layer can SSE them to the client.
 * No step's output is applied to the language store without passing validation.
 */

import type { LanguageDefinition } from "@slanger/shared-types";
import { validate } from "@slanger/validation";
import type { StreamEvent, AutonomousPipelineRequest, AutonomousPipelineResult } from "./types.js";
import { CORE_VOCABULARY_SLOTS, generateCoverageReport } from "@slanger/lexicon";
import {
  suggestPhonemeInventory,
  fillParadigmGaps,
  generateLexicon,
  generateCorpus,
  checkConsistency,
} from "./operations.js";
import { generateWritingSystem } from "@slanger/phonology";

const LEXICON_BATCH_SIZE = 5;
const TARGET_LEXICON_SIZE = 50; // require at least 50 words before corpus
/** Delay between LLM calls to stay within OpenRouter free tier limits */
const INTER_CALL_DELAY_MS = 12_000; // 12 seconds — allows ~5 calls/min at ~1000-2000 tokens each

export async function runAutonomousPipeline(
  req: AutonomousPipelineRequest,
  onEvent: (event: StreamEvent) => void
): Promise<AutonomousPipelineResult> {
  const pipelineStart = Date.now();
  const TOTAL_STEPS = 5;

  // ── Build the initial skeleton language ─────────────────────────────────────
  const now = new Date().toISOString();
  let language: LanguageDefinition = buildSkeleton(req, now);

  try {
    // ── Step 1: Phonology ──────────────────────────────────────────────────────
    onEvent({ type: "pipeline_progress", step: 1, totalSteps: TOTAL_STEPS, stepName: "Designing phoneme inventory" });

    const phonResult = await suggestPhonemeInventory({
      languageId: language.meta.id,
      naturalismScore: req.naturalismScore,
      preset: req.preset,

      tags: req.tags,
      templaticEnabled: !!req.advancedFeatures?.templaticMorphology,
      writingSystemType: req.advancedFeatures?.complexWritingSystem ? "abugida" : "alphabet",
    }, language);

    language = { ...language, phonology: phonResult.data.phonology };
    onEvent({ type: "operation_complete", result: phonResult });

    // Procedural Writing System generation
    if (language.phonology.writingSystem) {
      const generatedWS = generateWritingSystem(
        language.phonology.inventory,
        language.phonology.writingSystem.type,
        {
          style: language.phonology.writingSystem.aesthetics.style,
          complexity: language.phonology.writingSystem.aesthetics.complexity,
          strokeDensity: language.phonology.writingSystem.aesthetics.strokeDensity,
        }
      );
      language.phonology.writingSystem = generatedWS;
    }

    // ── Step 2: Morphology ─────────────────────────────────────────────────────
    onEvent({ type: "pipeline_progress", step: 2, totalSteps: TOTAL_STEPS, stepName: "Building morphological paradigms" });

    // Derive target paradigms and categories from complexity/naturalism heuristics
    const targetParadigms = deriveTargetParadigms(req.complexity);
    const morphCategories = deriveMorphCategories(req.complexity, req.naturalismScore);

    const morphResult = await fillParadigmGaps({
      languageId: language.meta.id,
      morphology: {
        ...language.morphology,
        categories: morphCategories,
        morphemeOrder: ["root", "aspect", "tense", "person.number"],
      },
      phonology: language.phonology,
      targetParadigms,
    }, language);

    language = { ...language, morphology: morphResult.data.morphology };
    onEvent({ type: "operation_complete", result: morphResult });

    // Rate-limit pause before next LLM call
    await sleep(INTER_CALL_DELAY_MS);

    // ── Step 3: Lexicon (batched) ──────────────────────────────────────────────
    onEvent({ type: "pipeline_progress", step: 3, totalSteps: TOTAL_STEPS, stepName: `Generating vocabulary (target: ${TARGET_LEXICON_SIZE} words)` });

    let lexiconDone = false;
    let batchNum = 0;

    while (!lexiconDone) {
      const report = generateCoverageReport(language.lexicon);
      const missingSlots = CORE_VOCABULARY_SLOTS.filter(slot =>
        !language.lexicon.some(e => e.glosses.some(g => g.toLowerCase() === slot.slot.toLowerCase()) ||
          (slot.subcategory && e.subcategory === slot.subcategory))
      );

      const needsMore = language.lexicon.length < TARGET_LEXICON_SIZE || missingSlots.length > 5;
      if (!needsMore) { lexiconDone = true; break; }

      batchNum++;
      const batchSlots = missingSlots.length > 0
        ? missingSlots.slice(0, LEXICON_BATCH_SIZE)
        : CORE_VOCABULARY_SLOTS.slice(0, LEXICON_BATCH_SIZE); // fill extra semantic richness

      const lexResult = await generateLexicon({
        languageId: language.meta.id,
        phonology: language.phonology,
        morphology: language.morphology,
        targetSlots: batchSlots,
        batchSize: LEXICON_BATCH_SIZE,
        existingOrthForms: language.lexicon.map(e => e.orthographicForm),

        naturalismScore: req.naturalismScore,
        tags: req.tags,
      }, language);

      language = {
        ...language,
        lexicon: deduplicateLexicon([...language.lexicon, ...lexResult.data.entries]),
      };
      onEvent({ type: "operation_complete", result: lexResult });

      // Guard against infinite loop (allow enough batches to reach TARGET_LEXICON_SIZE)
      if (batchNum >= 15) { lexiconDone = true; break; }

      // Rate-limit pause between lexicon batches
      await sleep(INTER_CALL_DELAY_MS);
    }

    // ── Step 5: Corpus (only if we have at least 50 words) ─────────────────────
    let corpusRan = false;
    if (language.lexicon.length >= 50) {
      corpusRan = true;
      // Rate-limit pause before corpus generation
      await sleep(INTER_CALL_DELAY_MS);
      onEvent({ type: "pipeline_progress", step: 4, totalSteps: TOTAL_STEPS, stepName: "Generating corpus samples" });

      const corpusResult = await generateCorpus({
        languageId: language.meta.id,
        language,
        count: 5,
        registers: ["informal", "formal", "narrative"],
      }, language);

      const newEntries = corpusResult.data.newEntries ?? [];
      language = {
        ...language,
        lexicon: [...language.lexicon, ...newEntries],
        corpus: [...language.corpus, ...corpusResult.data.samples],
      };
      onEvent({ type: "operation_complete", result: corpusResult });
    }

    // Rate-limit pause before consistency check
    await sleep(INTER_CALL_DELAY_MS);

    // ── Step 5: Consistency check ──────────────────────────────────────────────
    onEvent({ type: "pipeline_progress", step: 5, totalSteps: TOTAL_STEPS, stepName: "Running linguistic consistency audit" });

    const consistencyResult = await checkConsistency({ languageId: language.meta.id, language });
    onEvent({ type: "operation_complete", result: consistencyResult });

    // ── Final validation ───────────────────────────────────────────────────────
    const finalValidation = validate(language);
    language = {
      ...language,
      validationState: {
        lastRun: new Date().toISOString(),
        errors: finalValidation.errors,
        warnings: finalValidation.warnings,
      },
    };

    const totalDurationMs = Date.now() - pipelineStart;
    onEvent({ type: "pipeline_complete", language, totalMs: totalDurationMs });

    const stepsCompleted: AutonomousPipelineResult["stepsCompleted"] = [
      "suggest_phoneme_inventory",
      "fill_paradigm_gaps",
      "generate_lexicon",
      ...(corpusRan ? (["generate_corpus"] as const) : []),
      "check_consistency",
    ];
    return {
      language,
      stepsCompleted,
      totalDurationMs,
      validationResult: finalValidation,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : JSON.stringify(err);
    onEvent({ type: "pipeline_error", step: "unknown", message });
    throw err;
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildSkeleton(req: AutonomousPipelineRequest, now: string): LanguageDefinition {
  return {
    slangerVersion: "1.0",
    meta: {
      id: req.languageId,
      name: req.name,
      authorId: "system",

      tags: req.tags,
      createdAt: now,
      updatedAt: now,
      version: 1,
      preset: req.preset,
      naturalismScore: req.naturalismScore,
    },
    phonology: {
      inventory: { consonants: [], vowels: [], tones: [] },
      phonotactics: { syllableTemplates: [], onsetClusters: [], codaClusters: [], allophonyRules: [] },
      orthography: {},
      suprasegmentals: { hasLexicalTone: false, hasPhonemicStress: false, hasVowelLength: false, hasPhonemicNasalization: false },
    },
    morphology: {
      typology: req.naturalismScore > 0.5 ? "agglutinative" : "analytic",
      categories: { noun: [], verb: [], adjective: [], adverb: [], particle: [], pronoun: [], numeral: [], other: [] },
      paradigms: {},
      morphemeOrder: ["root"],
      derivationalRules: [],
      alternationRules: [],
      templatic: {
        enabled: req.advancedFeatures?.templaticMorphology ?? false,
        rootTemplates: req.advancedFeatures?.templaticMorphology ? ["CVCVC"] : [],
        vocaloidPatterns: {},
        slots: req.advancedFeatures?.templaticMorphology ? ["root", "aspect", "tense", "person.number"] : []
      }
    },
    syntax: {
      wordOrder: "SOV",
      alignment: "nominative-accusative",
      phraseStructure: {
        NP: [{ label: "Det", optional: true, repeatable: false }, { label: "Adj", optional: true, repeatable: true }, { label: "N", optional: false, repeatable: false }],
        VP: [{ label: "V", optional: false, repeatable: false }, { label: "NP", optional: true, repeatable: false }],
        S: [{ label: "NP", optional: false, repeatable: false }, { label: "VP", optional: false, repeatable: false }],
      },
      clauseTypes: ["declarative", "polar-interrogative", "imperative"],
      headedness: "head-marking",
      adpositionType: "postposition",
    },
    pragmatics: { hasFormalRegister: false, hasHonorifics: false, registers: [], discourseMarkers: [], politenessStrategies: [] },
    semantics: { domains: [], untranslatables: [], metaphorSystems: [] },
    culture: { idioms: [], namingConventions: [], proverbs: [] },
    lexicon: [],
    corpus: [],
    validationState: { lastRun: now, errors: [], warnings: [] },
  };
}

function deriveTargetParadigms(complexity: number): string[] {
  const base = ["noun_case", "verb_tense"];
  if (complexity > 0.3) base.push("verb_person_number", "noun_number");
  if (complexity > 0.6) base.push("verb_aspect", "verb_mood", "adjective_agreement");
  if (complexity > 0.8) base.push("verb_evidentiality", "noun_animacy");
  return base;
}

function deriveMorphCategories(
  complexity: number,
  _naturalismScore: number
): LanguageDefinition["morphology"]["categories"] {
  return {
    noun: [
      ...(complexity > 0.2 ? ["number" as const] : []),
      ...(complexity > 0.4 ? ["case" as const] : []),
      ...(complexity > 0.7 ? ["animacy" as const] : []),
    ],
    verb: [
      "tense" as const,
      ...(complexity > 0.3 ? ["person" as const, "number" as const] : []),
      ...(complexity > 0.5 ? ["aspect" as const, "mood" as const] : []),
      ...(complexity > 0.8 ? ["evidentiality" as const] : []),
    ],
    adjective: complexity > 0.5 ? ["number" as const] : [],
    adverb: [],
    particle: [],
    pronoun: complexity > 0.4 ? ["person" as const, "number" as const] : [],
    numeral: [],
    other: [],
  };
}

function deduplicateLexicon(entries: LanguageDefinition["lexicon"]): LanguageDefinition["lexicon"] {
  const seen = new Set<string>();
  const result: LanguageDefinition["lexicon"] = [];
  for (const entry of entries) {
    if (!seen.has(entry.orthographicForm)) {
      seen.add(entry.orthographicForm);
      result.push(entry);
    }
  }
  // Re-number IDs sequentially
  return result.map((e, i) => ({
    ...e,
    id: `lex_${String(i + 1).padStart(4, "0")}`,
  }));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
