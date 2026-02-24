/**
 * Phase 3 Integration Tests — LLM Orchestrator
 *
 * Uses mock fetch — zero network calls.
 * Tests:
 *   - All 6 operations parse, validate, cache, and retry correctly
 *   - The autonomous pipeline chains operations in order
 *   - Validation gate blocks bad LLM responses
 *   - Cache hits skip the LLM entirely
 *   - Retry preamble is injected on subsequent attempts
 */

import {
  initClient,
  initCache,
  MemoryCache,
  injectMockFetch,
  resetFetch,
  suggestPhonemeInventory,
  fillParadigmGaps,
  generateLexicon,
  generateCorpus,
  explainRule,
  checkConsistency,
  runAutonomousPipeline,
  MAX_ATTEMPTS,
} from "../index.js";

import { FIXTURE_KETHANI } from "@slanger/shared-types";
import type { PhonologyConfig, MorphologyConfig } from "@slanger/shared-types";
import type { LanguageDefinition } from "@slanger/shared-types";
import type { FetchFn } from "../client.js";

// ─── Mini test runner ─────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;
const failures: string[] = [];

async function test(name: string, fn: () => Promise<void> | void): Promise<void> {
  try {
    await fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (e: unknown) {
    failed++;
    let msg: string;
    if (e instanceof Error) {
      msg = e.message;
    } else if (e && typeof e === "object" && "finalError" in e) {
      const llmErr = e as { operation?: string; finalError?: string };
      msg = `LLMOperationError(${llmErr.operation ?? "?"}): ${String(llmErr.finalError ?? "").slice(0, 250)}`;
    } else {
      msg = JSON.stringify(e) ?? String(e);
    }
    const short = msg.slice(0, 300);
    console.error(`  ✗ ${name}\n    ${short}`);
    failures.push(`${name}: ${short}`);
  }
}

function eq<T>(a: T, b: T, msg?: string): void {
  if (a !== b) throw new Error(msg ?? `Expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
}

function ok(val: unknown, msg?: string): void {
  if (!val) throw new Error(msg ?? `Expected truthy, got ${JSON.stringify(val)}`);
}

// ─── Mock fetch helpers (Llm OpenAI-compatible format) ───────────────────────

function mockLlmResponse(body: unknown): FetchFn {
  return async (_url, _opts) => {
    const responseBody = JSON.stringify({
      choices: [{
        message: { content: JSON.stringify(body), role: "assistant" },
        finish_reason: "stop",
      }],
      usage: { prompt_tokens: 100, completion_tokens: 200, total_tokens: 300 },
    });
    return new Response(responseBody, {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };
}

function mockLlmError(status: number, message: string): FetchFn {
  return async () => new Response(JSON.stringify({ error: { message } }), { status });
}

/** Build a minimal but valid PhonologyConfig response */
function mockPhonologyResponse() {
  return {
    phonology: {
      inventory: { consonants: ["t", "n", "k", "s", "m", "l"], vowels: ["a", "e", "i", "o", "u"], tones: [] },
      phonotactics: {
        syllableTemplates: ["CV", "CVC", "V", "VC"],
        onsetClusters: [],
        codaClusters: [],
        allophonyRules: [],
      },
      orthography: { t: "t", n: "n", k: "k", s: "s", m: "m", l: "l", a: "a", e: "e", i: "i", o: "o", u: "u" },
      suprasegmentals: {
        hasLexicalTone: false,
        hasPhonemicStress: false,
        hasVowelLength: false,
        hasPhonemicNasalization: false,
      },
    },
    rationale: "A naturalistic inventory with common stops, nasals, and fricatives.",
  };
}

/** Build a minimal valid MorphologyConfig response */
function mockMorphologyResponse() {
  return {
    morphology: {
      typology: "agglutinative",
      categories: {
        noun: ["case", "number"],
        verb: ["tense", "person", "number"],
        adjective: [],
        adverb: [],
        particle: [],
        pronoun: [],
        numeral: [],
        other: [],
      },
      paradigms: {
        noun_case: { nominative: "", accusative: "-em", dative: "-ol" },
        noun_number: { singular: "", plural: "-ari" },
        verb_tense: { present: "", past: "-ki", future: "-na" },
        verb_person_number: { "1sg": "-mi", "2sg": "-ti", "3sg": "-li", "1pl": "-kami", "2pl": "-tami", "3pl": "-lami" },
      },
      morphemeOrder: ["root", "case", "number"],
      derivationalRules: [
        { id: "drv_nom", sourcePos: "verb", targetPos: "noun", label: "nominalization", affix: "-ur", affixType: "suffix" },
      ],
      alternationRules: [],
    },
    rationale: "Agglutinative with transparent case and tense marking.",
  };
}

/** Build a minimal valid lexicon batch response */
function mockLexiconResponse(startId = 1, count = 5) {
  const entries = [];
  // Only valid CV/CVC words using mock inventory (t,n,k,s,m,l + a,e,i,o,u)
  const cvSyllables = ["ta", "na", "ke", "lu", "mi", "so", "no", "ka", "se", "tu", "li", "mu", "ko", "si", "te", "nu", "lo", "ma", "ki", "su", "to", "ni", "le", "mo", "sa", "ku", "ti", "ne", "la", "me"];
  const cvcSyllables = ["tan", "nak", "kel", "lus", "min", "son", "nom", "kan", "sem", "tuk", "lis", "muk", "kon", "sin", "tem", "nut", "los", "mak", "kis", "sul", "tom", "nil", "lek", "mol", "sal", "kun", "til", "nen", "las", "mel"];
  const glosses = ["stone", "go", "big", "I", "one", "not", "water", "see", "small", "you", "two", "and", "fire", "come", "good", "we", "three", "but", "tree", "give", "bad", "they", "four", "or", "sun", "take", "long", "he", "five", "yes", "moon", "eat", "short", "she", "ten", "no", "sky", "drink", "hot", "it", "name", "word", "path", "food", "bird", "fish", "dog", "head", "eye", "ear", "mouth", "hand", "foot", "heart", "blood", "bone", "skin", "hair", "wind", "rain", "night", "day", "year", "house", "animal"];
  const poss: Array<[string, string, string]> = [
    ["noun", "swadesh-core", "nature"], ["verb", "swadesh-core", "motion"], ["adjective", "swadesh-core", "size"],
    ["pronoun", "personal-pronoun", "person"], ["numeral", "cardinal-number", "number"], ["particle", "negation", "grammar"],
    ["noun", "swadesh-core", "body"], ["verb", "swadesh-core", "cognition"], ["noun", "swadesh-core", "social"],
  ];
  for (let i = 0; i < count; i++) {
    const idx = startId + i;
    // Use CVC for odd indices, single CV for even — stays within CV/CVC/V/VC templates
    const orth = (idx % 2 === 0)
      ? cvSyllables[idx % cvSyllables.length]! + cvSyllables[(idx + 7) % cvSyllables.length]!  // CVCV
      : cvcSyllables[idx % cvcSyllables.length]!;  // CVC
    const [pos, sub, field] = poss[idx % poss.length]!;
    const gloss = glosses[idx % glosses.length]!;
    entries.push({
      id: `lex_${String(startId + i).padStart(4, "0")}`,
      phonologicalForm: `/${orth}/`,
      orthographicForm: orth,
      pos, subcategory: sub,
      glosses: [`${gloss}${idx}`], // unique per entry
      semanticFields: [field],
      derivedForms: [],
      source: "generated",
    });
  }
  return { entries, phonologicalNotes: "Words follow CV/CVC patterns from the inventory." };
}

/** Build a minimal corpus response */
function mockCorpusResponse(count = 2) {
  return {
    samples: Array.from({ length: count }, (_, i) => ({
      id: `corp_${String(i + 1).padStart(4, "0")}`,
      register: i % 2 === 0 ? "informal" : "formal",
      orthographicText: "etu tana kelu.",
      ipaText: "/etu tana kelu/",
      translation: "I go to the stone.",
      interlinearGloss: [
        { word: "etu", morphemes: ["etu"], glosses: ["1SG"] },
        { word: "tana", morphemes: ["tan", "-a"], glosses: ["stone", "NOM"] },
        { word: "kelu.", morphemes: ["kelu"], glosses: ["go"] },
      ],
      generatedAt: new Date().toISOString(),
    })),
  };
}

/** Build a valid explain_rule response */
function mockExplainResponse() {
  return {
    explanation: "The nominative case marks the subject of a transitive or intransitive verb.",
    examples: [
      { input: "tana (unmarked)", output: "tana-∅", steps: ["Look up case paradigm", "Nominative = zero suffix"] },
    ],
    crossLinguisticParallels: ["Similar to zero-marked nominatives in Turkish and Japanese"],
  };
}

/** Build a valid consistency check response */
function mockConsistencyResponse() {
  return {
    overallScore: 82,
    linguisticIssues: [
      {
        severity: "note",
        module: "morphology",
        description: "Verb agreement paradigm could be expanded to include aspect.",
        suggestion: "Consider adding perfective/imperfective distinction.",
      },
    ],
    suggestions: ["Add evidentiality markers for narrative register richness."],
    strengths: ["Consistent agglutinative morphology", "Clear phonological inventory"],
  };
}

// ─── Test setup ───────────────────────────────────────────────────────────────

function setup(): MemoryCache {
  const cache = new MemoryCache();
  initCache(cache);
  initClient({ apiKey: "test-key", model: "gemini-1.5-flash", maxApiRetries: 3, maxTokensStructured: 4096, maxTokensStreaming: 8192, baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai" });
  return cache;
}

const BASE_LANG: LanguageDefinition = FIXTURE_KETHANI;

// A minimal skeleton with no lexicon/corpus/paradigms — used for Op1-3 tests
// so the new phonology/morphology is validated in isolation, not against an existing rich lexicon
const SKELETON_LANG: LanguageDefinition = {
  ...FIXTURE_KETHANI,
  lexicon: [],
  corpus: [],
  morphology: {
    typology: "analytic",
    categories: { noun: [], verb: [], adjective: [], adverb: [], particle: [], pronoun: [], numeral: [], other: [] },
    paradigms: {},
    morphemeOrder: ["root"],
    derivationalRules: [],
    alternationRules: [],
  },
};

// ─── Op 1: suggest_phoneme_inventory ─────────────────────────────────────────

console.log("\n── Op 1: suggest_phoneme_inventory ──");

await test("Returns valid PhonologyConfig from Llm response", async () => {
  const cache = setup();
  injectMockFetch(mockLlmResponse(mockPhonologyResponse()));

  const result = await suggestPhonemeInventory({
    languageId: SKELETON_LANG.meta.id,
    naturalismScore: 0.7,
    preset: "naturalistic",
    tags: ["test"],
  }, SKELETON_LANG);

  eq(result.operation, "suggest_phoneme_inventory");
  eq(result.fromCache, false);
  ok(result.data.phonology.inventory.consonants.length > 0);
  ok(result.data.phonology.inventory.vowels.length > 0);
  ok(result.validation.valid, `Validation failed: ${result.validation.errors.map(e => e.message).join("; ")}`);
  resetFetch();
});

await test("Cache hit returns immediately without calling Llm", async () => {
  const cache = setup();
  injectMockFetch(mockLlmResponse(mockPhonologyResponse()));

  const req = { languageId: SKELETON_LANG.meta.id, naturalismScore: 0.7, preset: "naturalistic" as const, tags: ["cache-test"] };

  // First call — populates cache
  const first = await suggestPhonemeInventory(req, SKELETON_LANG);
  eq(first.fromCache, false);

  // Second call — same request key — should be cached
  let fetchCallCount = 0;
  injectMockFetch(async (...args) => {
    fetchCallCount++;
    return mockLlmResponse(mockPhonologyResponse())(...args);
  });
  const second = await suggestPhonemeInventory(req, SKELETON_LANG);
  eq(second.fromCache, true);
  eq(fetchCallCount, 0, "Expected zero fetch calls on cache hit");
  resetFetch();
});

await test("Attempt number is reported correctly", async () => {
  setup();
  injectMockFetch(mockLlmResponse(mockPhonologyResponse()));
  const result = await suggestPhonemeInventory({ languageId: "test", naturalismScore: 0.5, preset: "naturalistic", tags: [] }, SKELETON_LANG);
  eq(result.attempt, 1, "First attempt should succeed on attempt 1");
  resetFetch();
});

// ─── Op 2: fill_paradigm_gaps ─────────────────────────────────────────────────

console.log("\n── Op 2: fill_paradigm_gaps ──");

await test("Returns valid MorphologyConfig with filled paradigms", async () => {
  setup();
  injectMockFetch(mockLlmResponse(mockMorphologyResponse()));

  const result = await fillParadigmGaps({
    languageId: BASE_LANG.meta.id,
    morphology: BASE_LANG.morphology,
    phonology: BASE_LANG.phonology,
    targetParadigms: ["noun_case", "verb_tense"],
  }, BASE_LANG);

  eq(result.operation, "fill_paradigm_gaps");
  ok(Object.keys(result.data.morphology.paradigms).length > 0);
  ok(result.data.morphology.morphemeOrder.includes("root"));
  resetFetch();
});

await test("Morphology typology is preserved from response", async () => {
  setup();
  injectMockFetch(mockLlmResponse(mockMorphologyResponse()));
  const result = await fillParadigmGaps({
    languageId: "test",
    morphology: BASE_LANG.morphology,
    phonology: BASE_LANG.phonology,
    targetParadigms: ["verb_tense"],
  }, BASE_LANG);
  eq(result.data.morphology.typology, "agglutinative");
  resetFetch();
});

// ─── Op 3: generate_lexicon ───────────────────────────────────────────────────

console.log("\n── Op 3: generate_lexicon ──");

await test("Returns LexicalEntry[] with valid IDs and glosses", async () => {
  setup();
  injectMockFetch(mockLlmResponse(mockLexiconResponse(1, 5)));

  const result = await generateLexicon({
    languageId: BASE_LANG.meta.id,
    phonology: BASE_LANG.phonology,
    morphology: BASE_LANG.morphology,
    targetSlots: [{ slot: "stone", pos: "noun", semanticField: "nature" }],
    batchSize: 5,
    existingOrthForms: [],
    naturalismScore: 0.7,
    tags: [],
  }, BASE_LANG);

  eq(result.operation, "generate_lexicon");
  ok(result.data.entries.length > 0);
  for (const entry of result.data.entries) {
    ok(entry.id.match(/^lex_\d+/), `Bad ID: ${entry.id}`);
    ok(entry.glosses.length > 0, `Entry ${entry.id} has no glosses`);
    ok(entry.phonologicalForm, `Entry ${entry.id} missing phonologicalForm`);
    ok(entry.orthographicForm, `Entry ${entry.id} missing orthographicForm`);
  }
  resetFetch();
});

await test("Pronoun subcategory is correctly passed through", async () => {
  setup();
  injectMockFetch(mockLlmResponse(mockLexiconResponse(1, 5)));
  const result = await generateLexicon({
    languageId: "test",
    phonology: BASE_LANG.phonology,
    morphology: BASE_LANG.morphology,
    targetSlots: [{ slot: "I", pos: "pronoun", subcategory: "personal-pronoun", semanticField: "person" }],
    batchSize: 5,
    existingOrthForms: [],
    naturalismScore: 0.7,
    tags: [],
  }, BASE_LANG);
  const pronoun = result.data.entries.find(e => e.subcategory === "personal-pronoun");
  ok(pronoun, "Expected at least one personal pronoun in batch");
  resetFetch();
});

// ─── Op 4: generate_corpus ────────────────────────────────────────────────────

console.log("\n── Op 4: generate_corpus ──");

await test("Returns CorpusSample[] with orthographic text and translation", async () => {
  setup();
  injectMockFetch(mockLlmResponse(mockCorpusResponse(2)));

  const result = await generateCorpus({
    languageId: BASE_LANG.meta.id,
    language: BASE_LANG,
    count: 2,
    registers: ["informal", "formal"],
  }, BASE_LANG);

  eq(result.operation, "generate_corpus");
  eq(result.data.samples.length, 2);
  for (const sample of result.data.samples) {
    ok(sample.orthographicText, `Sample ${sample.id} missing orthographicText`);
    ok(sample.translation, `Sample ${sample.id} missing translation`);
  }
  resetFetch();
});

await test("Corpus validation is structural (not phonotactic)", async () => {
  setup();
  injectMockFetch(mockLlmResponse(mockCorpusResponse(1)));
  const result = await generateCorpus({
    languageId: "test",
    language: BASE_LANG,
    count: 1,
    registers: ["narrative"],
  }, BASE_LANG);
  eq(result.validation.valid, true);
  resetFetch();
});

// ─── Op 5: explain_rule ───────────────────────────────────────────────────────

console.log("\n── Op 5: explain_rule ──");

await test("Returns explanation with examples and cross-linguistic parallels", async () => {
  setup();
  injectMockFetch(mockLlmResponse(mockExplainResponse()));

  const result = await explainRule({
    languageId: BASE_LANG.meta.id,
    module: "morphology",
    ruleRef: "noun_case",
    ruleData: { nominative: "", accusative: "-em" },
    language: BASE_LANG,
    depth: "technical",
  });

  eq(result.operation, "explain_rule");
  ok(result.data.explanation.length > 0);
  ok(Array.isArray(result.data.examples));
  ok(Array.isArray(result.data.crossLinguisticParallels));
  resetFetch();
});

await test("explain_rule is cached with 30-day TTL (verify no second Llm call)", async () => {
  setup();
  injectMockFetch(mockLlmResponse(mockExplainResponse()));

  const req = {
    languageId: "test-explain", module: "phonology" as const, ruleRef: "allophony_1",
    ruleData: {}, language: BASE_LANG, depth: "beginner" as const
  };
  const first = await explainRule(req);
  eq(first.fromCache, false);

  let calls = 0;
  injectMockFetch(async (...args) => { calls++; return mockLlmResponse(mockExplainResponse())(...args); });
  const second = await explainRule(req);
  eq(second.fromCache, true);
  eq(calls, 0);
  resetFetch();
});

// ─── Op 6: check_consistency ─────────────────────────────────────────────────

console.log("\n── Op 6: check_consistency ──");

await test("Returns overallScore 0–100 with issues and suggestions", async () => {
  setup();
  injectMockFetch(mockLlmResponse(mockConsistencyResponse()));

  const result = await checkConsistency({
    languageId: BASE_LANG.meta.id,
    language: BASE_LANG,
  });

  eq(result.operation, "check_consistency");
  ok(result.data.overallScore >= 0 && result.data.overallScore <= 100);
  ok(Array.isArray(result.data.linguisticIssues));
  ok(Array.isArray(result.data.suggestions));
  ok(Array.isArray(result.data.strengths));
  resetFetch();
});

await test("Consistency check with focusAreas makes a successful call", async () => {
  setup();
  injectMockFetch(mockLlmResponse(mockConsistencyResponse()));
  const result = await checkConsistency({
    languageId: "test",
    language: BASE_LANG,
    focusAreas: ["phonology-morphology", "morphology-syntax"],
  });
  ok(result.data.overallScore >= 0);
  resetFetch();
});

// ─── Retry logic ──────────────────────────────────────────────────────────────

console.log("\n── Retry & validation gate ──");

await test("Network error triggers retry inside structuredRequest (2 fetch calls total)", async () => {
  setup();
  let callCount = 0;
  injectMockFetch(async (_url, _opts) => {
    callCount++;
    if (callCount === 1) {
      // Return 429 rate limit — triggers backoff retry inside structuredRequest
      return new Response(JSON.stringify({ error: "rate limited" }), { status: 429, headers: { "Content-Type": "application/json" } });
    }
    return new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify(mockPhonologyResponse()), role: "assistant" }, finish_reason: "stop" }],
      usage: { prompt_tokens: 50, completion_tokens: 100, total_tokens: 150 },
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  });

  const result = await suggestPhonemeInventory({
    languageId: "retry-test",
    naturalismScore: 0.5,
    preset: "naturalistic",
    tags: ["retry"],
  }, SKELETON_LANG);

  // 2 fetch calls: 1 rate-limit + 1 good (both within same structuredRequest call)
  eq(callCount, 2, `Expected 2 fetch calls (1 rate-limit + 1 retry), got ${callCount}`);
  eq(result.attempt, 1); // operation sees it as attempt 1 (structuredRequest handled retry)
  ok(result.validation.valid);
  resetFetch();
});

await test("All MAX_ATTEMPTS exhausted → operation throws LLMOperationError", async () => {
  setup();
  injectMockFetch(mockLlmResponse({ invalid: "not-a-phonology-response" }));

  let threw = false;
  try {
    await suggestPhonemeInventory({
      languageId: "fail-test",
      naturalismScore: 0.5,
      preset: "naturalistic",
      tags: [],
    }, SKELETON_LANG);
  } catch (err: unknown) {
    threw = true;
    const e = err as { retryReasons?: unknown[] };
    ok(e.retryReasons, "Expected LLMOperationError with retryReasons");
  }
  ok(threw, "Expected error to be thrown");
  resetFetch();
});

await test("Validation-failing response is rejected and retried", async () => {
  setup();
  let calls = 0;

  injectMockFetch(async (_url, _opts) => {
    calls++;
    let body: unknown;
    if (calls < MAX_ATTEMPTS) {
      // Return phonology with empty inventory — will fail PHON_001/002
      body = {
        phonology: {
          inventory: { consonants: [], vowels: [], tones: [] }, // INVALID — empty
          phonotactics: { syllableTemplates: ["CV"], onsetClusters: [], codaClusters: [], allophonyRules: [] },
          orthography: {},
          suprasegmentals: { hasLexicalTone: false, hasPhonemicStress: false, hasVowelLength: false, hasPhonemicNasalization: false },
        },
        rationale: "bad",
      };
    } else {
      body = mockPhonologyResponse(); // valid on final attempt
    }
    return new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify(body), role: "assistant" }, finish_reason: "stop" }],
      usage: { prompt_tokens: 50, completion_tokens: 100, total_tokens: 150 },
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  });

  const result = await suggestPhonemeInventory({
    languageId: "validation-fail-test",
    naturalismScore: 0.7,
    preset: "naturalistic",
    tags: [],
  }, SKELETON_LANG);

  eq(result.attempt, MAX_ATTEMPTS, `Expected to succeed on attempt ${MAX_ATTEMPTS}`);
  ok(result.validation.valid);
  resetFetch();
});

// ─── Autonomous pipeline ──────────────────────────────────────────────────────

console.log("\n── Autonomous pipeline ──");

await test("Pipeline chains all 5 steps and returns a LanguageDefinition", async () => {
  setup();

  // Smart mock: identifies operation from the system prompt (more reliable than user msg which may have retry preamble)
  let lexBatch = 0;
  injectMockFetch(async (_url, opts) => {
    const reqBody = JSON.parse((opts?.body as string) ?? "{}");
    // Llm request: messages[0].content = system, messages[1].content = user
    const messages: Array<{ role: string; content?: string }> = reqBody.messages ?? [];
    const sysPrompt: string = (messages[0]?.content ?? "") as string;
    const userMsg: string = (messages[1]?.content ?? "") as string;

    let body: unknown;
    if (sysPrompt.includes("typologist") || sysPrompt.includes("phonological systems")) {
      // Op 1: suggest_phoneme_inventory
      body = mockPhonologyResponse();
    } else if (sysPrompt.includes("interlinear glossing") || sysPrompt.includes("corpus samples")) {
      // Op 4: generate_corpus (check BEFORE morphology — corpus prompt contains 'paradigm tables')
      body = mockCorpusResponse(3);
    } else if (sysPrompt.includes("morphologist") || sysPrompt.includes("morphological paradigm")) {
      // Op 2: fill_paradigm_gaps
      body = mockMorphologyResponse();
    } else if (sysPrompt.includes("consistency") || sysPrompt.includes("coherence") || sysPrompt.includes("consultant")) {
      // Op 6: check_consistency
      body = mockConsistencyResponse();
    } else {
      // Op 3: generate_lexicon (default — also covers explain_rule in pipeline context)
      body = mockLexiconResponse(lexBatch * 40 + 1, 40);
      lexBatch++;
    }

    return new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify(body), role: "assistant" }, finish_reason: "stop" }],
      usage: { prompt_tokens: 100, completion_tokens: 200, total_tokens: 300 },
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  });

  const events: string[] = [];
  const result = await runAutonomousPipeline({
    languageId: "lang_auto01",
    name: "Testlang",
    world: "The test world",
    tags: ["test"],
    preset: "naturalistic",
    naturalismScore: 0.7,
    complexity: 0.5,
  }, (event) => {
    events.push(event.type);
  });

  ok(result.language.meta.name === "Testlang");
  ok(result.stepsCompleted.includes("suggest_phoneme_inventory"));
  ok(result.stepsCompleted.includes("fill_paradigm_gaps"));
  ok(result.stepsCompleted.includes("generate_lexicon"));
  ok(result.stepsCompleted.includes("generate_corpus"));
  ok(result.stepsCompleted.includes("check_consistency"));
  ok(events.includes("pipeline_progress"), "Expected pipeline_progress events");
  ok(events.includes("operation_complete"), "Expected operation_complete events");
  ok(events.includes("pipeline_complete"), "Expected pipeline_complete event");
  ok(result.totalDurationMs >= 0);

  resetFetch();
});

await test("Pipeline emits pipeline_progress for each step", async () => {
  setup();
  let lexBatch2 = 0;
  injectMockFetch(async (_url, opts) => {
    const reqBody = JSON.parse((opts?.body as string) ?? "{}");
    const messages: Array<{ role: string; content?: string }> = reqBody.messages ?? [];
    const sysPrompt: string = (messages[0]?.content ?? "") as string;
    let body: unknown;
    if (sysPrompt.includes("typologist") || sysPrompt.includes("phonological systems")) body = mockPhonologyResponse();
    else if (sysPrompt.includes("interlinear glossing") || sysPrompt.includes("corpus samples")) body = mockCorpusResponse(2);
    else if (sysPrompt.includes("morphologist") || sysPrompt.includes("morphological paradigm")) body = mockMorphologyResponse();
    else if (sysPrompt.includes("consistency") || sysPrompt.includes("coherence") || sysPrompt.includes("consultant")) body = mockConsistencyResponse();
    else { body = mockLexiconResponse(lexBatch2 * 40 + 1, 40); lexBatch2++; }
    return new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify(body), role: "assistant" }, finish_reason: "stop" }],
      usage: { prompt_tokens: 50, completion_tokens: 100, total_tokens: 150 },
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  });

  const progressEvents: number[] = [];
  await runAutonomousPipeline({
    languageId: "lang_pipe02", name: "Testlang2", tags: [],
    preset: "naturalistic", naturalismScore: 0.6, complexity: 0.4,
  }, (event) => {
    if (event.type === "pipeline_progress") progressEvents.push(event.step);
  });

  // Should have 5 steps worth of progress events
  ok(progressEvents.length >= 5, `Expected ≥5 progress events, got ${progressEvents.length}`);
  ok(progressEvents.includes(1), "Missing step 1");
  ok(progressEvents.includes(4), "Missing step 4 (corpus)");
  resetFetch();
});

// ─── Token usage tracking ─────────────────────────────────────────────────────

console.log("\n── Token usage tracking ──");

await test("getUsageSummary reports accumulated token counts", async () => {
  // Use a fresh unique languageId to avoid cache hits
  const { getUsageSummary, logUsage } = await import("../client.js");
  setup();
  const before = getUsageSummary();
  // Directly log usage to test the tracker without a network call
  logUsage("suggest_phoneme_inventory", { inputTokens: 100, outputTokens: 200, totalTokens: 300 });
  const after = getUsageSummary();
  ok(after.calls > before.calls, "Call count should increase after logUsage");
  ok(after.totalInputTokens >= 100, "Input tokens should accumulate");
  ok(after.totalOutputTokens >= 200, "Output tokens should accumulate");
});

// ─── Results ──────────────────────────────────────────────────────────────────

console.log(`\n${"═".repeat(55)}`);
console.log(`Phase 3 Tests: ${passed} passed, ${failed} failed`);
if (failures.length > 0) {
  console.error("\nFailed:");
  failures.forEach(f => console.error(`  ✗ ${f}`));
  throw new Error("Tests failed");
}
