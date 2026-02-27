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
import { withValidationRetry, buildRetryPreamble, MAX_ATTEMPTS } from "./retry.js";
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

  const retryReasons: string[][] = [];

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const previousErrors = retryReasons.length > 0 ? retryReasons[retryReasons.length - 1] : undefined;
    const prunedLang = pruneLanguageForOp(baseLanguage, "suggest_phoneme_inventory");
    const userMessage = SuggestInventoryPrompt.buildUserMessage(req, previousErrors);

    const raw = await structuredRequest({
      operation: "suggest_phoneme_inventory",
      systemPrompt: SuggestInventoryPrompt.buildSystemPrompt(),
      userMessage,
      expectJson: true,
      maxTokens: 3000,
    });

    let parsed: SuggestInventoryResponse;
    try {
      parsed = SuggestInventoryPrompt.parseResponse(raw);
    } catch (parseErr) {
      retryReasons.push([`Parse error: ${parseErr instanceof Error ? parseErr.message : String(parseErr)}`]);
      if (attempt === MAX_ATTEMPTS) throw buildOperationError("suggest_phoneme_inventory", attempt, retryReasons, start);
      continue;
    }

    // Validate by applying to language
    const candidate: LanguageDefinition = { ...baseLanguage, phonology: parsed.phonology };
    const validation = validate(candidate);

    if (validation.valid || validation.errors.filter(e => e.module === "phonology").length === 0) {
      const cacheKey = await cache.set("suggest_phoneme_inventory", req, parsed);
      return {
        operation: "suggest_phoneme_inventory",
        attempt,
        rawResponse: raw,
        data: parsed,
        validation,
        durationMs: Date.now() - start,
        fromCache: false,
        cacheKey,
      };
    }

    retryReasons.push(validation.errors.map(e => `[${e.module} ${e.ruleId}] ${e.message}`));
  }

  throw buildOperationError("suggest_phoneme_inventory", MAX_ATTEMPTS, retryReasons, start);
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

  const retryReasons: string[][] = [];

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const previousErrors = retryReasons.length > 0 ? retryReasons[retryReasons.length - 1] : undefined;
    const prunedLang = pruneLanguageForOp(baseLanguage, "fill_paradigm_gaps");
    const raw = await structuredRequest({
      operation: "fill_paradigm_gaps",
      systemPrompt: FillParadigmsPrompt.buildSystemPrompt(),
      userMessage: FillParadigmsPrompt.buildUserMessage(req, prunedLang, previousErrors),
      expectJson: true,
      maxTokens: 4000,
    });

    let parsed: FillParadigmGapsResponse;
    try { parsed = FillParadigmsPrompt.parseResponse(raw); }
    catch (e) {
      retryReasons.push([`Parse error: ${e instanceof Error ? e.message : String(e)}`]);
      if (attempt === MAX_ATTEMPTS) throw buildOperationError("fill_paradigm_gaps", attempt, retryReasons, start);
      continue;
    }

    const candidate: LanguageDefinition = { ...baseLanguage, morphology: parsed.morphology };
    const validation = validate(candidate);

    if (validation.errors.filter(e => e.module === "morphology").length === 0) {
      const cacheKey = await cache.set("fill_paradigm_gaps", req, parsed);
      return {
        operation: "fill_paradigm_gaps", attempt, rawResponse: raw, data: parsed,
        validation, durationMs: Date.now() - start, fromCache: false, cacheKey
      };
    }

    retryReasons.push(validation.errors.map(e => `[${e.module} ${e.ruleId}] ${e.message}`));
  }

  throw buildOperationError("fill_paradigm_gaps", MAX_ATTEMPTS, retryReasons, start);
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
  const retryReasons: string[][] = [];

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const previousErrors = retryReasons.length > 0 ? retryReasons[retryReasons.length - 1] : undefined;
    const raw = await structuredRequest({
      operation: "generate_lexicon",
      systemPrompt: GenerateLexiconPrompt.buildSystemPrompt(),
      userMessage: GenerateLexiconPrompt.buildUserMessage(req, prunedLang, previousErrors),
      expectJson: true,
      maxTokens: 4000,
    });

    let parsed: GenerateLexiconResponse;
    try {
      parsed = GenerateLexiconPrompt.parseResponse(
        raw,
        startId,
        {
          consonants: baseLanguage.phonology.inventory.consonants,
          vowels: baseLanguage.phonology.inventory.vowels
        },
        baseLanguage.phonology.phonotactics
      );
    }
    catch (e) {
      retryReasons.push([`Parse error: ${e instanceof Error ? e.message : String(e)}`]);
      if (attempt === MAX_ATTEMPTS) throw buildOperationError("generate_lexicon", attempt, retryReasons, start);
      continue;
    }

    // Validate by adding entries to language and running full validation
    const candidate: LanguageDefinition = {
      ...baseLanguage,
      lexicon: [...baseLanguage.lexicon, ...parsed.entries],
    };
    const validation = validate(candidate);

    // Filter for errors that are likely caused by the newly generated entries
    const relevantErrors = validation.errors.filter(e => {
      const isRelevantModule = e.module === "phonology" || e.module === "morphology" || e.module === "cross-module";
      const referencesNewEntry = parsed.entries.some(entry => e.entityRef?.startsWith(entry.id));
      return isRelevantModule && referencesNewEntry;
    });

    if (relevantErrors.length === 0) {
      const cacheKey = await cache.set("generate_lexicon", req, parsed);
      return {
        operation: "generate_lexicon", attempt, rawResponse: raw, data: parsed,
        validation, durationMs: Date.now() - start, fromCache: false, cacheKey
      };
    }

    retryReasons.push(relevantErrors.map(e => `[${e.module} ${e.ruleId}] ${e.message}`));
  }

  throw buildOperationError("generate_lexicon", MAX_ATTEMPTS, retryReasons, start);
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
      systemPrompt: CORPUS_SYSTEM_PROMPT,
      userMessage: buildCorpusUserMessage(prunedReq),
      onEvent,
    });
  } else {
    raw = await structuredRequest({
      operation: "generate_corpus",
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
