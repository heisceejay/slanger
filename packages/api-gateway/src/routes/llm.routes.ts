/**
 * Slanger LLM Routes — stateless proxy to Groq (Llama)
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
// We just verify the essential meta fields are present so ops can run.

const LangBodySchema = z.object({
  meta: z.object({
    id: z.string(),
    name: z.string(),
    naturalismScore: z.number().min(0).max(1),
    preset: z.string(),
    tags: z.array(z.string()),
    world: z.string().optional(),
    version: z.number(),
  }),
  phonology: z.record(z.unknown()),
  morphology: z.record(z.unknown()),
  syntax: z.record(z.unknown()),
  lexicon: z.array(z.unknown()),
  corpus: z.array(z.unknown()),
}).passthrough();

function ok(data: unknown, requestId: string) {
  return { data, requestId };
}

function badRequest(message: string, requestId: string) {
  return { data: null, requestId, errors: [{ code: "BAD_REQUEST", message }] };
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

  fastify.post("/v1/suggest-inventory", { config: { rateLimit: LLM_RATE } }, async (req, reply) => {
    const parsed = LangBodySchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send(badRequest(parsed.error.issues[0]?.message ?? "Invalid body", req.id));
    const lang = parsed.data as unknown as LanguageDefinition;

    const result = await suggestPhonemeInventory({
      languageId: lang.meta.id,
      naturalismScore: lang.meta.naturalismScore,
      preset: lang.meta.preset,
      tags: lang.meta.tags,
      force: true, // Always bypass cache when regenerating from the UI
      ...(lang.meta.world !== undefined ? { world: lang.meta.world } : {}),
    }, lang);

    const updated: LanguageDefinition = { ...lang, phonology: result.data.phonology };
    return reply.send(ok({ language: updated, rationale: result.data.rationale, fromCache: result.fromCache }, req.id));
  });

  // ── Op 2: Fill paradigm gaps ────────────────────────────────────────────────

  fastify.post("/v1/fill-paradigms", { config: { rateLimit: LLM_RATE } }, async (req, reply) => {
    const parsed = LangBodySchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send(badRequest(parsed.error.issues[0]?.message ?? "Invalid body", req.id));
    const lang = parsed.data as unknown as LanguageDefinition;

    const targetParadigms = detectEmptyParadigms(lang);

    const result = await fillParadigmGaps({
      languageId: lang.meta.id,
      morphology: lang.morphology,
      phonology: lang.phonology,
      targetParadigms,
    }, lang);

    const updated: LanguageDefinition = { ...lang, morphology: result.data.morphology };
    return reply.send(ok({ language: updated, rationale: result.data.rationale, fromCache: result.fromCache }, req.id));
  });

  // ── Op 3: Generate lexicon ──────────────────────────────────────────────────

  fastify.post<{ Body: { language: unknown; batchSize?: number } }>(
    "/v1/generate-lexicon", { config: { rateLimit: LLM_RATE } }, async (req, reply) => {
      const body = req.body as { language: unknown; batchSize?: number };
      const parsed = LangBodySchema.safeParse(body.language ?? req.body);
      if (!parsed.success) return reply.code(400).send(badRequest(parsed.error.issues[0]?.message ?? "Invalid body", req.id));
      const lang = parsed.data as unknown as LanguageDefinition;

      const hasPhonology = (lang.phonology?.inventory?.consonants?.length ?? 0) > 0 && (lang.phonology?.inventory?.vowels?.length ?? 0) > 0;
      const hasMorphology = !!lang.morphology?.typology;
      if (!hasPhonology || !hasMorphology) {
        return reply.code(400).send(badRequest(
          "Generate phonology (Suggest phoneme inventory) and morphology (Fill paradigm gaps) before generating lexicon.",
          req.id
        ));
      }

      const batchSize = Math.min(body.batchSize ?? 5, 5);

      const existingGlosses = new Set(lang.lexicon.flatMap((e: { glosses?: string[] }) => (e.glosses ?? []).map((g: string) => g.toLowerCase())));
      const missingSlots = CORE_VOCABULARY_SLOTS
        .filter((s) => !existingGlosses.has(s.slot.toLowerCase()))
        .slice(0, batchSize);
      const targetSlots = missingSlots.length > 0 ? missingSlots : CORE_VOCABULARY_SLOTS.slice(0, batchSize);

      const result = await generateLexicon({
        languageId: lang.meta.id,
        phonology: lang.phonology,
        morphology: lang.morphology,
        targetSlots: targetSlots.map((s) => ({
          slot: s.slot,
          pos: s.pos,
          semanticField: s.semanticField,
          ...(s.subcategory !== undefined ? { subcategory: s.subcategory } : {}),
        })),
        batchSize,
        existingOrthForms: lang.lexicon.map((e: { orthographicForm?: string }) => e.orthographicForm ?? ""),
        naturalismScore: lang.meta.naturalismScore,
        tags: lang.meta.tags,
        ...(lang.meta.world !== undefined ? { world: lang.meta.world } : {}),
      }, lang);

      const updated: LanguageDefinition = {
        ...lang,
        lexicon: [...lang.lexicon, ...result.data.entries] as LanguageDefinition["lexicon"],
      };
      return reply.send(ok({ language: updated, newCount: result.data.entries.length, fromCache: result.fromCache }, req.id));
    }
  );

  // ── Op 4: Generate corpus ───────────────────────────────────────────────────

  fastify.post<{ Body: { language?: unknown; count?: number; registers?: string[]; prompt?: string } }>(
    "/v1/generate-corpus", { config: { rateLimit: LLM_RATE } }, async (req, reply) => {
      const body = req.body;
      const parsed = LangBodySchema.safeParse(body.language ?? req.body);
      if (!parsed.success) return reply.code(400).send(badRequest(parsed.error.issues[0]?.message ?? "Invalid body", req.id));
      const lang = parsed.data as unknown as LanguageDefinition;

      if ((lang.lexicon?.length ?? 0) < 50) {
        return reply.code(400).send(badRequest("Lexicon must have at least 50 words before generating corpus. Add more words via the Lexicon view.", req.id));
      }

      const result = await generateCorpus({
        languageId: lang.meta.id,
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
    }
  );

  // ── Op 5: Explain rule (read-only) ──────────────────────────────────────────

  fastify.post<{ Body: { language: unknown; module: string; ruleRef: string; ruleData: unknown; depth?: string } }>(
    "/v1/explain-rule", { config: { rateLimit: LLM_RATE } }, async (req, reply) => {
      const parsed = LangBodySchema.safeParse(req.body.language);
      if (!parsed.success) return reply.code(400).send(badRequest("language field required", req.id));
      const lang = parsed.data as unknown as LanguageDefinition;

      const result = await explainRule({
        languageId: lang.meta.id,
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
    }
  );

  // ── Op 6: Check consistency (read-only) ─────────────────────────────────────

  fastify.post("/v1/check-consistency", { config: { rateLimit: LLM_RATE } }, async (req, reply) => {
    const parsed = LangBodySchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send(badRequest(parsed.error.issues[0]?.message ?? "Invalid body", req.id));
    const lang = parsed.data as unknown as LanguageDefinition;

    const result = await checkConsistency({ languageId: lang.meta.id, language: lang });

    return reply.send(ok({
      overallScore: result.data.overallScore,
      linguisticIssues: result.data.linguisticIssues,
      suggestions: result.data.suggestions,
      strengths: result.data.strengths,
      fromCache: result.fromCache,
    }, req.id));
  });

  // ── Autonomous pipeline (SSE) ───────────────────────────────────────────────

  fastify.post<{ Body: { language: unknown; complexity?: number } }>(
    "/v1/autonomous", { config: { rateLimit: PIPELINE_RATE } }, async (req, reply) => {
      const parsed = LangBodySchema.safeParse(req.body.language);
      if (!parsed.success) return reply.code(400).send(badRequest("language field required", req.id));
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
  const defined = Object.keys(lang.morphology.paradigms);
  const empty: string[] = [];
  for (const [pos, cats] of Object.entries(lang.morphology.categories)) {
    for (const cat of cats) {
      const key = `${pos}_${cat}`;
      if (!defined.includes(key)) empty.push(key);
    }
  }
  if (empty.length === 0) {
    // All paradigms exist — request a quality pass on sparse ones
    empty.push(...defined.filter((k) => Object.keys(lang.morphology.paradigms[k] ?? {}).length < 2));
  }
  return empty.length > 0 ? empty : defined;
}
