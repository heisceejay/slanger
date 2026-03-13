/**
 * @slanger/llm-orchestrator — Six Operations
 *
 * Each operation:
 *  1. Checks cache
 *  2. Builds prompt
 *  3. Calls LLM with validation-gated retry (max 3 attempts)
 *  4. Parses and validates response
 *  5. Stores in cache
 *  6. Returns typed LLMOperationResult
 */

import type { LanguageDefinition } from "@slanger/shared-types";
import { validate } from "@slanger/validation";
import type { ValidationResult } from "@slanger/validation";
import { structuredRequest, streamingRequest } from "./client.js";
import { getCache } from "./cache.js";
import { MAX_ATTEMPTS, withValidationRetry } from "./retry.js";
import { pruneLanguageForOp } from "./prune.js";
import type {
  LLMOperationResult, LLMOperationError, StreamEvent,
  SuggestInventoryRequest, SuggestInventoryResponse,
  FillParadigmGapsRequest, FillParadigmGapsResponse,
  GenerateLexiconRequest, GenerateLexiconResponse,
  GenerateCorpusRequest, GenerateCorpusResponse,
  ExplainRuleRequest, ExplainRuleResponse,
  CheckConsistencyRequest, CheckConsistencyResponse,
} from "./types.js";

import * as SuggestInventoryPrompt from "./prompts/suggest-inventory.js";
import * as FillParadigmsPrompt from "./prompts/fill-paradigms.js";
import * as GenerateLexiconPrompt from "./prompts/generate-lexicon.js";
import {
  CORPUS_SYSTEM_PROMPT, buildCorpusUserMessage, parseCorpusResponse, normalizeCorpusSamplesToLexicon,
  EXPLAIN_SYSTEM_PROMPT, buildExplainUserMessage, parseExplainResponse,
  CONSISTENCY_SYSTEM_PROMPT, buildConsistencyUserMessage, parseConsistencyResponse,
} from "./prompts/corpus-explain-consistency.js";

// ─── Op 1: suggest_phoneme_inventory ─────────────────────────────────────────

export async function suggestPhonemeInventory(
  req: SuggestInventoryRequest,
  baseLanguage: LanguageDefinition
): Promise<LLMOperationResult<SuggestInventoryResponse>> {
  const start = Date.now();
  const cache = getCache();

  const cached = req.force ? null : await cache.get<SuggestInventoryResponse>("suggest_phoneme_inventory", req);
  if (cached) {
    return {
      operation: "suggest_phoneme_inventory",
      attempt: 0,
      rawResponse: "",
      data: cached.data,
      validation: { valid: true, errors: [], warnings: [], summary: emptySummary(), durationMs: 0 },
      durationMs: Date.now() - start,
      fromCache: true,
      cacheKey: cached.key,
    };
  }

  const { result: parsed, validation, attempt } = await withValidationRetry({
    operation: "suggest_phoneme_inventory",
    request: req,
    baseLanguage,
    callLLM: async (currentReq, previousErrors) => {
      const userMessage = SuggestInventoryPrompt.buildUserMessage(currentReq, previousErrors);
      const raw = await structuredRequest({
        operation: "suggest_phoneme_inventory",
        ...(currentReq.requestId ? { requestId: currentReq.requestId } : {}),
        systemPrompt: SuggestInventoryPrompt.buildSystemPrompt(),
        userMessage,
        expectJson: true,
        maxTokens: 3000,
      });
      return { raw, parsed: SuggestInventoryPrompt.parseResponse(raw) };
    },
    applyToLanguage: (response, base) => ({ ...base, phonology: response.parsed.phonology }),
    validate: (lang) => {
      const v = validate(lang);
      // Only fail validation if phonology-specific errors exist
      if (v.valid || v.errors.filter(e => e.module === "phonology").length === 0) {
        return { ...v, valid: true };
      }
      return v;
    }
  });

  const cacheKey = await cache.set("suggest_phoneme_inventory", req, parsed.parsed);
  return {
    operation: "suggest_phoneme_inventory",
    attempt,
    rawResponse: parsed.raw,
    data: parsed.parsed,
    validation,
    durationMs: Date.now() - start,
    fromCache: false,
    cacheKey,
  };
}


// ─── Op 2: fill_paradigm_gaps ────────────────────────────────────────────────

export async function fillParadigmGaps(
  req: FillParadigmGapsRequest,
  baseLanguage: LanguageDefinition
): Promise<LLMOperationResult<FillParadigmGapsResponse>> {
  const start = Date.now();
  const cache = getCache();

  const cached = await cache.get<FillParadigmGapsResponse>("fill_paradigm_gaps", req);
  if (cached) {
    return {
      operation: "fill_paradigm_gaps", attempt: 0, rawResponse: "", data: cached.data,
      validation: { valid: true, errors: [], warnings: [], summary: emptySummary(), durationMs: 0 },
      durationMs: Date.now() - start, fromCache: true, cacheKey: cached.key
    };
  }

  const { result: parsed, validation, attempt } = await withValidationRetry({
    operation: "fill_paradigm_gaps",
    request: req,
    baseLanguage,
    callLLM: async (currentReq, previousErrors) => {
      const prunedLang = pruneLanguageForOp(baseLanguage, "fill_paradigm_gaps");
      const raw = await structuredRequest({
        operation: "fill_paradigm_gaps",
        ...(currentReq.requestId ? { requestId: currentReq.requestId } : {}),
        systemPrompt: FillParadigmsPrompt.buildSystemPrompt(),
        userMessage: FillParadigmsPrompt.buildUserMessage(currentReq, prunedLang, previousErrors),
        expectJson: true,
        maxTokens: 4000,
      });
      return { raw, parsed: FillParadigmsPrompt.parseResponse(raw) };
    },
    applyToLanguage: (response, base) => {
      if (req.mode === "replace") {
        return { ...base, morphology: response.parsed.morphology };
      }
      
      // AUGMENT mode: Merge
      const m = response.parsed.morphology;
      
      // Deep merge categories
      const categories: any = { ...base.morphology.categories };
      for (const [pos, cats] of Object.entries(m.categories)) {
        categories[pos] = Array.from(new Set([...(categories[pos] || []), ...(cats as string[])]));
      }

      // Merge rules by ID (new overwrites old if same ID)
      const mergeRules = <T extends { id: string }>(base: T[], next: T[]): T[] => {
        const map = new Map<string, T>();
        base.forEach(r => map.set(r.id, r));
        next.forEach(r => map.set(r.id, r));
        return Array.from(map.values());
      };

      return {
        ...base,
        morphology: {
          ...base.morphology,
          categories,
          paradigms: { ...base.morphology.paradigms, ...m.paradigms },
          morphemeOrder: Array.from(new Set([...base.morphology.morphemeOrder, ...m.morphemeOrder])),
          derivationalRules: mergeRules(base.morphology.derivationalRules, m.derivationalRules),
          alternationRules: mergeRules(base.morphology.alternationRules, m.alternationRules),
        }
      };
    },
    validate: (lang) => {
      const v = validate(lang);
      // Only block on errors the morphologist AI can actually resolve.
      // Unrelated errors (like CROSS_010: Incomplete Orthography) should NOT block morphology generation.
      const relevantErrors = v.errors.filter(e => 
        e.module === "morphology" || 
        (e.module === "cross-module" && e.ruleId !== "CROSS_010")
      );
      if (relevantErrors.length === 0) {
        return { ...v, valid: true };
      }
      return { ...v, valid: false, errors: relevantErrors };
    }
  });

  const cacheKey = await cache.set("fill_paradigm_gaps", req, parsed.parsed);
  return {
    operation: "fill_paradigm_gaps", attempt, rawResponse: parsed.raw, data: parsed.parsed,
    validation, durationMs: Date.now() - start, fromCache: false, cacheKey
  };
}

// ─── Op 3: generate_lexicon ──────────────────────────────────────────────────

/**
 * Generates lexicon in batches of up to 50 entries.
 * Tracks the current max lexical ID to avoid collisions.
 */
export async function generateLexicon(
  req: GenerateLexiconRequest,
  baseLanguage: LanguageDefinition
): Promise<LLMOperationResult<GenerateLexiconResponse>> {
  const start = Date.now();
  const cache = getCache();
  const prunedLang = pruneLanguageForOp(baseLanguage, "generate_lexicon");

  const cached = await cache.get<GenerateLexiconResponse>("generate_lexicon", req);
  if (cached) {
    return {
      operation: "generate_lexicon", attempt: 0, rawResponse: "", data: cached.data,
      validation: { valid: true, errors: [], warnings: [], summary: emptySummary(), durationMs: 0 },
      durationMs: Date.now() - start, fromCache: true, cacheKey: cached.key
    };
  }

  const startId = baseLanguage.lexicon.length + 1;
  const { result: parsed, validation, attempt } = await withValidationRetry({
    operation: "generate_lexicon",
    request: req,
    baseLanguage,
    callLLM: async (currentReq, previousErrors) => {
      const raw = await structuredRequest({
        operation: "generate_lexicon",
        ...(currentReq.requestId ? { requestId: currentReq.requestId } : {}),
        systemPrompt: GenerateLexiconPrompt.buildSystemPrompt(baseLanguage.phonology.inventory),
        userMessage: GenerateLexiconPrompt.buildUserMessage(currentReq, prunedLang, previousErrors),
        expectJson: true,
        maxTokens: 4000,
      });
      return { 
        raw, 
        parsed: GenerateLexiconPrompt.parseResponse(
          raw,
          startId,
          {
            consonants: baseLanguage.phonology.inventory.consonants,
            vowels: baseLanguage.phonology.inventory.vowels
          },
          baseLanguage.phonology.phonotactics
        ) 
      };
    },
    applyToLanguage: (response, base) => ({
      ...base,
      lexicon: [...base.lexicon, ...response.parsed.entries],
    }),
    validate: (lang) => {
      const v = validate(lang);
      // Filter for errors that are likely caused by the newly generated entries
      const relevantErrors = v.errors.filter(e => {
        const isRelevantModule = e.module === "phonology" || e.module === "morphology" || e.module === "cross-module";
        // To find which entries are new we check entries that are in lang.lexicon but not baseLanguage.lexicon. Since new entries are appended we can just slice.
        const newEntries = lang.lexicon.slice(baseLanguage.lexicon.length);
        const referencesNewEntry = newEntries.some(entry => e.entityRef?.startsWith(entry.id));
        return isRelevantModule && referencesNewEntry;
      });

      if (relevantErrors.length === 0) {
        return { ...v, valid: true };
      }
      return { ...v, valid: false, errors: relevantErrors };
    }
  });

  const cacheKey = await cache.set("generate_lexicon", req, parsed.parsed);
  return {
    operation: "generate_lexicon", attempt, rawResponse: parsed.raw, data: parsed.parsed,
    validation, durationMs: Date.now() - start, fromCache: false, cacheKey
  };
}

// ─── Op 4: generate_corpus ───────────────────────────────────────────────────

/**
 * Generates corpus samples with SSE streaming.
 * Streams tokens via onEvent; final validation is structural only
 * (full phonotactic check not possible for free text corpus).
 */
export async function generateCorpus(
  req: GenerateCorpusRequest,
  baseLanguage: LanguageDefinition,
  onEvent?: (event: StreamEvent) => void
): Promise<LLMOperationResult<GenerateCorpusResponse>> {
  const start = Date.now();
  const cache = getCache();

  const cached = await cache.get<GenerateCorpusResponse>("generate_corpus", req);
  if (cached) {
    return {
      operation: "generate_corpus", attempt: 0, rawResponse: "", data: cached.data,
      validation: { valid: true, errors: [], warnings: [], summary: emptySummary(), durationMs: 0 },
      durationMs: Date.now() - start, fromCache: true, cacheKey: cached.key
    };
  }

  let raw: string;
  const prunedLang = pruneLanguageForOp(baseLanguage, "generate_corpus");
  // Override req.language with the pruned version to avoid massive prompt payloads
  const prunedReq: GenerateCorpusRequest = { ...req, language: prunedLang };
  if (onEvent) {
    raw = await streamingRequest({
      operation: "generate_corpus",
      ...(req.requestId ? { requestId: req.requestId } : {}),
      systemPrompt: CORPUS_SYSTEM_PROMPT,
      userMessage: buildCorpusUserMessage(prunedReq),
      onEvent,
    });
  } else {
    raw = await structuredRequest({
      operation: "generate_corpus",
      ...(req.requestId ? { requestId: req.requestId } : {}),
      systemPrompt: `${CORPUS_SYSTEM_PROMPT}\n\nRespond with ONLY valid JSON.`,
      userMessage: buildCorpusUserMessage(prunedReq),
      expectJson: true,
      maxTokens: 4000,
    });
  }

  let parsed = parseCorpusResponse(raw);
  const newEntries = parsed.newEntries ?? [];
  let startId = baseLanguage.lexicon.length + 1;
  const newEntriesWithIds = newEntries.map((e) => {
    const id = `lex_${String(startId++).padStart(4, "0")}`;
    return { ...e, id };
  });
  const mergedLexicon = [...baseLanguage.lexicon, ...newEntriesWithIds];
  const normalizedSamples = normalizeCorpusSamplesToLexicon(parsed.samples, mergedLexicon);
  const data = { samples: normalizedSamples, newEntries: newEntriesWithIds };

  // Structural validation only for corpus
  const validation: ValidationResult = {
    valid: normalizedSamples.length > 0 && normalizedSamples.every(s => s.orthographicText && s.translation),
    errors: [],
    warnings: [],
    summary: emptySummary(),
    durationMs: 0,
  };

  const cacheKey = await cache.set("generate_corpus", req, data);
  return {
    operation: "generate_corpus", attempt: 1, rawResponse: raw, data,
    validation, durationMs: Date.now() - start, fromCache: false, cacheKey
  };
}

// ─── Op 5: explain_rule ──────────────────────────────────────────────────────

export async function explainRule(
  req: ExplainRuleRequest
): Promise<LLMOperationResult<ExplainRuleResponse>> {
  const start = Date.now();
  const cache = getCache();

  const cached = await cache.get<ExplainRuleResponse>("explain_rule", req);
  if (cached) {
    return {
      operation: "explain_rule", attempt: 0, rawResponse: "", data: cached.data,
      validation: { valid: true, errors: [], warnings: [], summary: emptySummary(), durationMs: 0 },
      durationMs: Date.now() - start, fromCache: true, cacheKey: cached.key
    };
  }

  const prunedLang = pruneLanguageForOp(req.language, "explain_rule");
  const prunedReq: ExplainRuleRequest = { ...req, language: prunedLang };
  const raw = await structuredRequest({
    operation: "explain_rule",
    ...(req.requestId ? { requestId: req.requestId } : {}),
    systemPrompt: EXPLAIN_SYSTEM_PROMPT,
    userMessage: buildExplainUserMessage(prunedReq),
    expectJson: true,
    maxTokens: 3000,
  });

  const parsed = parseExplainResponse(raw);
  const validation: ValidationResult = {
    valid: Boolean(parsed.explanation),
    errors: [], warnings: [], summary: emptySummary(), durationMs: 0,
  };

  const cacheKey = await cache.set("explain_rule", req, parsed);
  return {
    operation: "explain_rule", attempt: 1, rawResponse: raw, data: parsed,
    validation, durationMs: Date.now() - start, fromCache: false, cacheKey
  };
}

// ─── Op 6: check_consistency ─────────────────────────────────────────────────

export async function checkConsistency(
  req: CheckConsistencyRequest
): Promise<LLMOperationResult<CheckConsistencyResponse>> {
  const start = Date.now();
  const cache = getCache();

  const cached = await cache.get<CheckConsistencyResponse>("check_consistency", req);
  if (cached) {
    return {
      operation: "check_consistency", attempt: 0, rawResponse: "", data: cached.data,
      validation: { valid: true, errors: [], warnings: [], summary: emptySummary(), durationMs: 0 },
      durationMs: Date.now() - start, fromCache: true, cacheKey: cached.key
    };
  }

  const prunedLang = pruneLanguageForOp(req.language, "check_consistency");
  const prunedReq: CheckConsistencyRequest = { ...req, language: prunedLang };
  const raw = await structuredRequest({
    operation: "check_consistency",
    ...(req.requestId ? { requestId: req.requestId } : {}),
    systemPrompt: CONSISTENCY_SYSTEM_PROMPT,
    userMessage: buildConsistencyUserMessage(prunedReq, prunedLang),
    expectJson: true,
    maxTokens: 4000,
  });

  const parsed = parseConsistencyResponse(raw);
  const validation: ValidationResult = {
    valid: typeof parsed.overallScore === "number",
    errors: [], warnings: [], summary: emptySummary(), durationMs: 0,
  };

  const cacheKey = await cache.set("check_consistency", req, parsed);
  return {
    operation: "check_consistency", attempt: 1, rawResponse: raw, data: parsed,
    validation, durationMs: Date.now() - start, fromCache: false, cacheKey
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function emptySummary() {
  return {
    phonology: { passed: true, errorCount: 0, warningCount: 0 },
    morphology: { passed: true, errorCount: 0, warningCount: 0 },
    syntax: { passed: true, errorCount: 0, warningCount: 0 },
    crossModule: { passed: true, errorCount: 0, warningCount: 0 },
  };
}

function buildOperationError(
  operation: LLMOperationError["operation"],
  attempt: number,
  retryReasons: string[][],
  start: number
): LLMOperationError {
  return {
    operation,
    attempt,
    finalError: `All ${MAX_ATTEMPTS} attempts failed. Last errors: ${(retryReasons[retryReasons.length - 1] ?? []).join("; ")}`,
    retryReasons,
    durationMs: Date.now() - start,
  };
}
