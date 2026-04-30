/**
 * Slanger LLM Routes — stateless proxy to LLM API
 *
 * Every route receives the full LanguageDefinition in the request body,
 * runs the requested operation, and returns the updated definition.
 * No database. No auth. The browser is the source of truth.
 *
 * POST /v1/suggest-inventory     → updated LanguageDefinition
 * POST /v1/fill-paradigms        → updated LanguageDefinition
 * POST /v1/generate-lexicon      → updated LanguageDefinition
 * POST /v1/generate-corpus       → updated LanguageDefinition
 * POST /v1/explain-rule          → { explanation, examples, crossLinguisticParallels }
 * POST /v1/check-consistency     → { overallScore, linguisticIssues, suggestions, strengths }
 * POST /v1/autonomous            → SSE stream → final LanguageDefinition
 */

import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import {
  suggestPhonemeInventory,
  fillParadigmGaps,
  generateLexicon,
  generateCorpus,
  normalizeCorpusSamplesToLexicon,
  explainRule,
  checkConsistency,
  runAutonomousPipeline,
  initCache,
  MemoryCache,
} from "@slanger/llm-orchestrator";
import type { StreamEvent } from "@slanger/llm-orchestrator";
import type { LanguageDefinition } from "@slanger/shared-types";
import { CORE_VOCABULARY_SLOTS } from "@slanger/lexicon";

// ─── Cache initialization ─────────────────────────────────────────────────────

let _cacheInit = false;
function ensureCache(): void {
  if (_cacheInit) return;
  initCache(new MemoryCache());
  _cacheInit = true;
}

// ─── Zod schema for a full LanguageDefinition (loose — we trust the client) ──
// We verify essential meta fields; optional ones get defaults so older/imported payloads still validate.

const LangBodySchema = z.object({
  meta: z.object({
    id: z.string(),
    name: z.string(),
    naturalismScore: z.number().min(0).max(1).optional().default(0.7),
    preset: z.string().optional().default("naturalistic"),
    tags: z.array(z.string()).optional().default([]),
    world: z.string().optional(),
    version: z.number().optional().default(1),
  }),
  phonology: z.record(z.unknown()).optional().default({}),
  morphology: z.record(z.unknown()).optional().default({}),
  syntax: z.record(z.unknown()).optional().default({}),
  lexicon: z.array(z.unknown()).optional().default([]),
  corpus: z.array(z.unknown()).optional().default([]),
}).passthrough();

function ok(data: unknown, requestId: string) {
  return { data, requestId };
}

function badRequest(message: string, requestId: string, issues?: z.ZodIssue[]) {
  let detailedMessage = issues?.[0] ? `${issues[0].path.join(".")}: ${issues[0].message}` : message;
  if (detailedMessage === "Required" || detailedMessage === ": Required" || (issues?.[0] && issues[0].path.length === 0)) {
    detailedMessage = "Request body must be JSON with a language object: { language: { meta: { id, name }, phonology, morphology, ... }, mode?: \"augment\"|\"replace\" }. Check that the request has a body and Content-Type: application/json.";
  }
  return { data: null, requestId, errors: [{ code: "BAD_REQUEST", message: detailedMessage }] };
}

function llmOperationError(err: { finalError?: string; retryReasons?: unknown }, requestId: string) {
  const message = err.finalError || "LLM operation failed";
  return {
    data: null,
    requestId,
    errors: [{ code: "LLM_OPERATION_FAILED", message, details: err.retryReasons }],
  };
}

// ─── Rate limits ──────────────────────────────────────────────────────────────

const LLM_RATE = {
  max: 10,
  timeWindow: 60_000,
  keyGenerator: (r: FastifyRequest) => `llm:${r.ip}`,
  errorResponseBuilder: (_r: FastifyRequest, ctx: { ttl: number }) => ({
    data: null,
    errors: [{ code: "LLM_RATE_LIMITED", message: `Rate limit exceeded. Retry after ${Math.ceil(ctx.ttl / 1000)}s.` }],
  }),
};

const PIPELINE_RATE = { ...LLM_RATE, max: 2 };

// ─── Route registration ───────────────────────────────────────────────────────

export async function llmRoutes(fastify: FastifyInstance): Promise<void> {
  ensureCache();

  // ── Op 1: Suggest phoneme inventory ────────────────────────────────────────

  fastify.post<{ Body: { language?: unknown } }>(
    "/v1/suggest-inventory", { config: { rateLimit: LLM_RATE } }, async (req, reply) => {
      const body = req.body as { language?: any };
      const parsed = LangBodySchema.safeParse(body.language || body);
      if (!parsed.success) return reply.code(400).send(badRequest("Invalid body", req.id, parsed.error.issues));
      const lang = parsed.data as unknown as LanguageDefinition;

    try {
      const result = await suggestPhonemeInventory({
        languageId: lang.meta.id,
        requestId: req.id,
        naturalismScore: lang.meta.naturalismScore,
        preset: lang.meta.preset,
        tags: lang.meta.tags,
        force: true, // Always bypass cache when regenerating from the UI
        ...(lang.meta.world !== undefined ? { world: lang.meta.world } : {}),
      }, lang);

      const updated: LanguageDefinition = { ...lang, phonology: result.data.phonology };
      return reply.send(ok({ language: updated, rationale: result.data.rationale, fromCache: result.fromCache }, req.id));
    } catch (err: any) {
      if (err.operation) {
        return reply.code(400).send(llmOperationError(err, req.id));
      }
      throw err;
    }
  });


  // ── Op 2: Fill paradigm gaps ────────────────────────────────────────────────

  fastify.post<{ Body: { language?: unknown; mode?: "augment" | "replace" } }>(
    "/v1/fill-paradigms", { config: { rateLimit: LLM_RATE } }, async (req, reply) => {
      const body = req.body as { language?: any; mode?: "augment" | "replace" } | undefined;
      if (body === undefined || body === null) {
        return reply.code(400).send(badRequest("Request body is missing. Send POST with Content-Type: application/json and body: { language: { meta, phonology, morphology, ... }, mode?: \"augment\"|\"replace\" }", req.id));
      }
      const toParse = typeof body === "object" ? (body.language !== undefined ? body.language : body) : undefined;
      if (toParse == null || typeof toParse !== "object" || Array.isArray(toParse)) {
        return reply.code(400).send(badRequest("Request body must be JSON with a language object: { language: { meta, phonology, morphology, ... }, mode?: \"augment\"|\"replace\" }", req.id));
      }
      const parsed = LangBodySchema.safeParse(toParse);
      if (!parsed.success) {
        const first = parsed.error.issues[0];
        const detail = first ? `${first.path.join(".")}: ${first.message}` : "Invalid body";
        return reply.code(400).send(badRequest(detail, req.id, parsed.error.issues));
      }
      const lang = parsed.data as unknown as LanguageDefinition;

      const phon = lang.phonology as { inventory?: { consonants?: string[]; vowels?: string[] }; phonotactics?: { syllableTemplates?: string[] } };
      const morph = lang.morphology as { typology?: string; categories?: Record<string, string[]>; paradigms?: Record<string, unknown> };
      if (!phon?.inventory?.consonants?.length && !phon?.inventory?.vowels?.length) {
        return reply.code(400).send(badRequest("Phonology is required. Define a phoneme inventory in the Phonology tab first.", req.id));
      }
      if (!morph?.typology) {
        return reply.code(400).send(badRequest("Morphology must have a typology (e.g. analytic, agglutinative). Save morphology in the Morphology tab and try again.", req.id));
      }

      const targetParadigms = req.body.mode === "replace" 
        ? ["noun_case", "verb_tense", "adj_degree", "pron_case"] 
        : detectEmptyParadigms(lang);
      
      try {
        const result = await fillParadigmGaps({
          languageId: lang.meta.id,
          requestId: req.id,
          morphology: lang.morphology,
          phonology: lang.phonology,
          targetParadigms,
          mode: req.body.mode ?? "augment",
        }, lang);

        const updated: LanguageDefinition = { ...lang, morphology: result.data.morphology };
        return reply.send(ok({ language: updated, rationale: result.data.rationale, fromCache: result.fromCache }, req.id));
      } catch (err: any) {
        if (err.operation) {
          return reply.code(400).send(llmOperationError(err, req.id));
        }
        throw err; // Let regular errors fall through to 500
      }
    });

  // ── Op 3: Generate lexicon ──────────────────────────────────────────────────

  fastify.post<{ Body: { language: unknown; batchSize?: number } }>(
    "/v1/generate-lexicon", { config: { rateLimit: LLM_RATE } }, async (req, reply) => {
      const body = req.body as { language?: any; batchSize?: number };
      const parsed = LangBodySchema.safeParse(body.language || body);
      if (!parsed.success) return reply.code(400).send(badRequest("Invalid body", req.id, parsed.error.issues));
      const lang = parsed.data as unknown as LanguageDefinition;

      const hasPhonology = (lang.phonology?.inventory?.consonants?.length ?? 0) > 0 && (lang.phonology?.inventory?.vowels?.length ?? 0) > 0;
      const hasMorphology = Object.values(lang.morphology?.categories ?? {}).some(c => c.length > 0) || Object.keys(lang.morphology?.paradigms ?? {}).length > 0;
      if (!hasPhonology || !hasMorphology) {
        return reply.code(400).send(badRequest(
          "Generate phonology (Suggest phoneme inventory) and morphology (Define and Fill paradigm gaps) before generating lexicon.",
          req.id
        ));
      }

      const batchSize = Math.min(body.batchSize ?? 15, 25);

      const existingGlosses = new Set(lang.lexicon.flatMap((e: { glosses?: string[] }) => {
        const arr = Array.isArray(e.glosses) ? e.glosses : (e.glosses ? [e.glosses] : []);
        return arr.map((g) => String(g).toLowerCase());
      }));
      const missingSlots = CORE_VOCABULARY_SLOTS
        .filter((s) => !existingGlosses.has(s.slot.toLowerCase()))
        .slice(0, batchSize);
      const targetSlots = missingSlots.length > 0 ? missingSlots : CORE_VOCABULARY_SLOTS.slice(0, batchSize);

      try {
        const result = await generateLexicon({
          languageId: lang.meta.id,
          requestId: req.id,
          // Strip SVG glyph data from phonology — only inventory + orthography + phonotactics needed
          phonology: {
            ...lang.phonology,
            ...(lang.phonology.writingSystem
              ? { writingSystem: { ...lang.phonology.writingSystem, glyphs: {} } }
              : {}),
          } as LanguageDefinition["phonology"],
          // Strip full paradigm detail — only typology + categories needed for lexicon generation
          morphology: { ...lang.morphology, paradigms: {} },
          targetSlots: targetSlots.map((s) => ({
            slot: s.slot,
            pos: s.pos,
            semanticField: s.semanticField,
            ...(s.subcategory !== undefined ? { subcategory: s.subcategory } : {}),
          })),
          batchSize,
          // Cap collision list — prompt only shows 10, no point sending 200+ entries
          existingOrthForms: lang.lexicon.map((e: { orthographicForm?: string }) => e.orthographicForm ?? "").slice(0, 20),
          naturalismScore: lang.meta.naturalismScore,
          tags: lang.meta.tags,
          ...(lang.meta.world !== undefined ? { world: lang.meta.world } : {}),
        }, lang);

        const updated: LanguageDefinition = {
          ...lang,
          lexicon: [...lang.lexicon, ...result.data.entries] as LanguageDefinition["lexicon"],
        };
        return reply.send(ok({ language: updated, newCount: result.data.entries.length, fromCache: result.fromCache }, req.id));
      } catch (err: any) {
        if (err.operation) {
          return reply.code(400).send(llmOperationError(err, req.id));
        }
        throw err;
      }
    }
  );

  // ── Op 4: Generate corpus ───────────────────────────────────────────────────

  fastify.post<{ Body: { language?: unknown; count?: number; registers?: string[]; prompt?: string } }>(
    "/v1/generate-corpus", { config: { rateLimit: LLM_RATE } }, async (req, reply) => {
      const body = req.body as { language?: any; count?: number; registers?: string[]; prompt?: string };
      const parsed = LangBodySchema.safeParse(body.language || body);
      if (!parsed.success) return reply.code(400).send(badRequest("Invalid body", req.id, parsed.error.issues));
      const lang = parsed.data as unknown as LanguageDefinition;

      if ((lang.lexicon?.length ?? 0) < 150) {
        return reply.code(400).send(badRequest("Lexicon must have at least 150 words before generating corpus. Add more words via the Lexicon view.", req.id));
      }

      try {
        const result = await generateCorpus({
          languageId: lang.meta.id,
          requestId: req.id,
          language: lang,
          count: Math.min(body.count ?? 5, 5),
          registers: (body.registers ?? ["informal", "formal", "narrative"]) as ("informal" | "formal" | "narrative")[],
          ...(body.prompt !== undefined ? { userPrompt: body.prompt } : {}),
        }, lang);

        const newEntries = result.data.newEntries ?? [];
        const updatedLexicon = [...lang.lexicon, ...newEntries] as LanguageDefinition["lexicon"];
        const mergedCorpus = [...lang.corpus, ...result.data.samples] as LanguageDefinition["corpus"];
        const normalizedCorpus = normalizeCorpusSamplesToLexicon(mergedCorpus, updatedLexicon);
        const updated: LanguageDefinition = {
          ...lang,
          lexicon: updatedLexicon,
          corpus: normalizedCorpus,
        };
        return reply.send(ok({ language: updated, newCount: result.data.samples.length, newWordsAdded: newEntries.length, fromCache: result.fromCache }, req.id));
      } catch (err: any) {
        if (err.operation) {
          return reply.code(400).send(llmOperationError(err, req.id));
        }
        throw err;
      }
    }
  );

  // ── Op 5: Explain rule (read-only) ──────────────────────────────────────────

  fastify.post<{ Body: { language: unknown; module: string; ruleRef: string; ruleData: unknown; depth?: string } }>(
    "/v1/explain-rule", { config: { rateLimit: LLM_RATE } }, async (req, reply) => {
      const body = req.body as { language?: any; module: string; ruleRef: string; ruleData: unknown; depth?: string };
      const parsed = LangBodySchema.safeParse(body.language || body);
      if (!parsed.success) return reply.code(400).send(badRequest("language field required", req.id, parsed.error.issues));
      const lang = parsed.data as unknown as LanguageDefinition;

      try {
        const result = await explainRule({
          languageId: lang.meta.id,
          requestId: req.id,
          language: lang,
          module: req.body.module as "phonology" | "morphology" | "syntax",
          ruleRef: req.body.ruleRef,
          ruleData: (req.body.ruleData ?? {}) as Record<string, unknown>,
          depth: req.body.depth === "academic" ? "technical" : (req.body.depth ?? "technical") as "beginner" | "technical",
        });

        return reply.send(ok({
          explanation: result.data.explanation,
          examples: result.data.examples,
          crossLinguisticParallels: result.data.crossLinguisticParallels,
          fromCache: result.fromCache,
        }, req.id));
      } catch (err: any) {
        if (err.operation) {
          return reply.code(400).send(llmOperationError(err, req.id));
        }
        throw err;
      }
    }
  );

  // ── Op 6: Check consistency (read-only) ─────────────────────────────────────

  fastify.post<{ Body: { language?: unknown } }>(
    "/v1/check-consistency", { config: { rateLimit: LLM_RATE } }, async (req, reply) => {
      const body = req.body as { language?: any };
      const parsed = LangBodySchema.safeParse(body.language || body);
      if (!parsed.success) return reply.code(400).send(badRequest("Invalid body", req.id, parsed.error.issues));
      const lang = parsed.data as unknown as LanguageDefinition;

    try {
      const result = await checkConsistency({ languageId: lang.meta.id, requestId: req.id, language: lang });

      return reply.send(ok({
        overallScore: result.data.overallScore,
        linguisticIssues: result.data.linguisticIssues,
        suggestions: result.data.suggestions,
        strengths: result.data.strengths,
        fromCache: result.fromCache,
      }, req.id));
    } catch (err: any) {
      if (err.operation) {
        return reply.code(400).send(llmOperationError(err, req.id));
      }
      throw err;
    }
  });

  // ── Autonomous pipeline (SSE) ───────────────────────────────────────────────

  fastify.post<{ Body: { language: unknown; complexity?: number } }>(
    "/v1/autonomous", { config: { rateLimit: PIPELINE_RATE } }, async (req, reply) => {
      const body = req.body as { language?: any; complexity?: number };
      const parsed = LangBodySchema.safeParse(body.language || body);
      if (!parsed.success) return reply.code(400).send(badRequest("language field required", req.id, parsed.error.issues));
      const lang = parsed.data as unknown as LanguageDefinition;

      reply.raw.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
        "X-Request-Id": req.id,
      });

      const send = (event: unknown) => reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);

      try {
        const result = await runAutonomousPipeline({
          languageId: lang.meta.id,
          requestId: req.id,
          name: lang.meta.name,
          tags: lang.meta.tags,
          preset: lang.meta.preset,
          naturalismScore: lang.meta.naturalismScore,
          complexity: req.body.complexity ?? 0.6,
          ...(lang.meta.world !== undefined ? { world: lang.meta.world } : {}),
        }, (event: StreamEvent) => send(event));

        // Send the final committed language to the client
        send({ type: "committed", language: result.language, totalDurationMs: result.totalDurationMs });
      } catch (err) {
        send({ type: "pipeline_error", step: "unknown", message: err instanceof Error ? err.message : String(err) });
      }

      reply.raw.end();
    }
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function detectEmptyParadigms(lang: LanguageDefinition): string[] {
  const morph = lang.morphology as { paradigms?: Record<string, unknown>; categories?: Record<string, string[]> };
  const paradigms = morph?.paradigms ?? {};
  const categories = morph?.categories ?? {};
  const defined = Object.keys(paradigms);
  const empty: string[] = [];
  for (const [pos, cats] of Object.entries(categories)) {
    for (const cat of cats ?? []) {
      const key = `${pos}_${cat}`;
      if (!defined.includes(key)) empty.push(key);
    }
  }
  if (empty.length === 0) {
    empty.push(...defined.filter((k) => Object.keys(paradigms[k] ?? {}).length < 2));
  }
  return empty.length > 0 ? empty : defined;
}
