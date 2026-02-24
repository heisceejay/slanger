/**
 * @slanger/llm-orchestrator — Public API surface
 */
export { initClient, getConfig, getUsageSummary, injectMockFetch, resetFetch } from "./client.js";
export type { OpenRouterClientConfig, TokenUsage } from "./client.js";
export { initCache, getCache, MemoryCache, RedisCache } from "./cache.js";
export type { CacheBackend } from "./cache.js";
export { withValidationRetry, buildRetryPreamble, MAX_ATTEMPTS } from "./retry.js";
export { suggestPhonemeInventory, fillParadigmGaps, generateLexicon, generateCorpus, explainRule, checkConsistency } from "./operations.js";
export { normalizeCorpusSamplesToLexicon } from "./prompts/corpus-explain-consistency.js";
export { runAutonomousPipeline } from "./pipeline.js";
export type {
  OperationName, LLMOperationResult, LLMOperationError, StreamEvent,
  SuggestInventoryRequest, SuggestInventoryResponse,
  FillParadigmGapsRequest, FillParadigmGapsResponse,
  GenerateLexiconRequest, GenerateLexiconResponse,
  GenerateCorpusRequest, GenerateCorpusResponse,
  ExplainRuleRequest, ExplainRuleResponse,
  CheckConsistencyRequest, CheckConsistencyResponse,
  AutonomousPipelineRequest, AutonomousPipelineResult,
  CacheConfig,
} from "./types.js";
export { CACHE_TTLS } from "./types.js";
