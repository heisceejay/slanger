/**
 * @slanger/llm-orchestrator — Type definitions
 *
 * Six operations, each with a typed Request and Response.
 * All responses are validated before leaving the orchestrator.
 */
import type {
  LanguageDefinition, PhonologyConfig, MorphologyConfig, SyntaxConfig,
  LexicalEntry, CorpusSample, PragmaticsConfig, SemanticsConfig, CulturalConfig
} from "@slanger/shared-types";
import type { ValidationResult } from "@slanger/validation";

// ─── Operation names ─────────────────────────────────────────────────────────

export type OperationName =
  | "suggest_phoneme_inventory"
  | "fill_paradigm_gaps"
  | "generate_lexicon"
  | "generate_corpus"
  | "explain_rule"
  | "check_consistency";

// ─── Shared envelope ─────────────────────────────────────────────────────────

export interface LLMOperationResult<T> {
  operation: OperationName;
  /** Attempt number that succeeded (1–3) */
  attempt: number;
  /** Raw response from Groq before parsing */
  rawResponse: string;
  /** Parsed and validated output */
  data: T;
  /** Validation result — must have valid:true before committing */
  validation: ValidationResult;
  /** Total wall-clock time including retries */
  durationMs: number;
  /** Whether result was served from Redis cache */
  fromCache: boolean;
  /** Cache key if cached */
  cacheKey?: string;
}

export interface LLMOperationError {
  operation: OperationName;
  attempt: number;
  /** Which attempt ultimately failed */
  finalError: string;
  /** Per-attempt validation issues that triggered retries */
  retryReasons: string[][];
  durationMs: number;
}

// ─── Streaming events ─────────────────────────────────────────────────────────

export type StreamEvent =
  | { type: "operation_start"; operation: OperationName; attempt: number }
  | { type: "token"; delta: string }
  | { type: "operation_complete"; result: LLMOperationResult<unknown> }
  | { type: "operation_error"; error: LLMOperationError }
  | { type: "pipeline_progress"; step: number; totalSteps: number; stepName: string }
  | { type: "pipeline_complete"; language: LanguageDefinition; totalMs: number }
  | { type: "pipeline_error"; step: string; message: string };

// ─── Op 1: suggest_phoneme_inventory ─────────────────────────────────────────

export interface SuggestInventoryRequest {
  languageId: string;
  /** 0–1: how naturalistic vs exotic */
  naturalismScore: number;
  preset: "naturalistic" | "experimental";
  world?: string;
  force?: boolean;
  /** Tags to guide generation, e.g. ["tonal", "click-consonants"] */
  tags: string[];
  /** Optional prior inventory to build on */
  existingInventory?: Partial<PhonologyConfig["inventory"]>;
  /** Whether to enable non-linear/templatic morphology */
  templaticEnabled?: boolean;
  /** Desired writing system type */
  writingSystemType?: "alphabet" | "abjad" | "abugida" | "syllabary" | "logographic" | "hybrid";
}

export interface SuggestInventoryResponse {
  phonology: PhonologyConfig;
  /** Human-readable rationale for the choices made */
  rationale: string;
}

// ─── Op 2: fill_paradigm_gaps ────────────────────────────────────────────────

export interface FillParadigmGapsRequest {
  languageId: string;
  /** The current (possibly incomplete) morphology config */
  morphology: MorphologyConfig;
  phonology: PhonologyConfig;
  /** Specific paradigm keys that are empty or incomplete */
  targetParadigms: string[];
}

export interface FillParadigmGapsResponse {
  morphology: MorphologyConfig;
  /** Explanation of typological choices */
  rationale: string;
}

// ─── Op 3: generate_lexicon ──────────────────────────────────────────────────

export interface GenerateLexiconRequest {
  languageId: string;
  phonology: PhonologyConfig;
  morphology: MorphologyConfig;
  /** Semantic slots that still need filling (from coverage report) */
  targetSlots: Array<{
    slot: string;
    pos: string;
    subcategory?: string;
    semanticField: string;
  }>;
  /** How many entries to generate in this batch (5 per click) */
  batchSize: number;
  /** Existing entries to avoid phonological collisions */
  existingOrthForms: string[];
  /** Cultural/world context to flavor the words */
  world?: string;
  naturalismScore: number;
  tags: string[];
}

export interface GenerateLexiconResponse {
  entries: LexicalEntry[];
  /** Phonological notes about patterns used */
  phonologicalNotes: string;
}

// ─── Op 4: generate_corpus ───────────────────────────────────────────────────

export interface GenerateCorpusRequest {
  languageId: string;
  language: LanguageDefinition;
  /** How many corpus samples to generate */
  count: number;
  /** Target registers */
  registers: CorpusSample["register"][];
  /** Optional user prompt to seed the content */
  userPrompt?: string;
}

export interface GenerateCorpusResponse {
  samples: CorpusSample[];
  /** New lexical entries introduced in the corpus (to be merged into the language lexicon) */
  newEntries?: LexicalEntry[];
}

// ─── Op 5: explain_rule ──────────────────────────────────────────────────────

export interface ExplainRuleRequest {
  languageId: string;
  /** Which module the rule belongs to */
  module: "phonology" | "morphology" | "syntax";
  /** Rule ID or paradigm key */
  ruleRef: string;
  /** The rule data as a serialized object */
  ruleData: Record<string, unknown>;
  /** Full language context for accurate explanation */
  language: LanguageDefinition;
  /** Desired depth: "beginner" for casual users, "technical" for conlangers */
  depth: "beginner" | "technical";
}

export interface ExplainRuleResponse {
  /** Plain-language explanation */
  explanation: string;
  /** Worked examples using actual lexical entries */
  examples: Array<{
    input: string;
    output: string;
    steps: string[];
  }>;
  /** Cross-linguistic parallels for context */
  crossLinguisticParallels: string[];
}

// ─── Op 6: check_consistency ─────────────────────────────────────────────────

export interface CheckConsistencyRequest {
  languageId: string;
  language: LanguageDefinition;
  /** Focus areas for the consistency check */
  focusAreas?: Array<"phonology-morphology" | "morphology-syntax" | "syntax-pragmatics" | "lexicon-phonology">;
}

export interface CheckConsistencyResponse {
  /** Overall consistency assessment */
  overallScore: number; // 0–100
  /** Issues found that the rule-based validator missed */
  linguisticIssues: LinguisticIssue[];
  /** Suggestions for making the language more naturalistic/coherent */
  suggestions: string[];
  /** Positive features worth keeping */
  strengths: string[];
}

export interface LinguisticIssue {
  severity: "error" | "warning" | "note";
  module: string;
  description: string;
  suggestion: string;
}

// ─── Autonomous pipeline ──────────────────────────────────────────────────────

export interface AutonomousPipelineRequest {
  languageId: string;
  name: string;
  world?: string;
  tags: string[];
  preset: "naturalistic" | "experimental";
  naturalismScore: number;
  complexity: number; // 0–1
  /** Optional seed for reproducibility (passed as system context) */
  seed?: string;
  /** Phase toggles for advanced features */
  advancedFeatures?: {
    templaticMorphology: boolean;
    complexWritingSystem: boolean;
  };
}

export interface AutonomousPipelineResult {
  language: LanguageDefinition;
  stepsCompleted: OperationName[];
  totalDurationMs: number;
  validationResult: ValidationResult;
}

// ─── Cache key builder ────────────────────────────────────────────────────────

export interface CacheConfig {
  /** TTL in seconds. Defaults: lexicon/corpus=7days, explain=30days, consistency=1hr */
  ttl: number;
  /** If true, bypass cache for this request */
  noCache?: boolean;
}

export const CACHE_TTLS: Record<OperationName, number> = {
  suggest_phoneme_inventory: 60 * 60 * 24 * 7,   // 7 days
  fill_paradigm_gaps: 60 * 60 * 24 * 7,   // 7 days
  generate_lexicon: 60 * 60 * 24 * 7,   // 7 days
  generate_corpus: 60 * 60 * 24,        // 1 day (more volatile)
  explain_rule: 60 * 60 * 24 * 30,   // 30 days (stable explanations)
  check_consistency: 60 * 60,             // 1 hour (re-check after edits)
};
