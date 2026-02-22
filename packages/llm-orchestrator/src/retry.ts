/**
 * Validation-gated retry engine.
 *
 * For each LLM operation:
 *   1. Call the LLM
 *   2. Parse the response
 *   3. Run the validation engine on the result
 *   4. If errors → feed them back into a retry prompt and try again
 *   5. After 3 failed attempts → throw LLMOperationError
 *
 * This is the core Phase 3 invariant:
 *   NO LLM OUTPUT TOUCHES THE LANGUAGE STORE WITHOUT PASSING VALIDATION.
 */

import type { LanguageDefinition } from "@slanger/shared-types";
import type { ValidationResult } from "@slanger/validation";
import type { OperationName, LLMOperationResult, LLMOperationError } from "./types.js";

export const MAX_ATTEMPTS = 3;

export interface AttemptContext<TReq, TRes> {
  operation: OperationName;
  request: TReq;
  /** Call the LLM and return parsed response */
  callLLM: (req: TReq, previousErrors?: string[]) => Promise<TRes>;
  /** Apply the response to a LanguageDefinition snapshot to validate it */
  applyToLanguage: (response: TRes, base: LanguageDefinition) => LanguageDefinition;
  /** The base language to validate against */
  baseLanguage: LanguageDefinition;
  validate: (lang: LanguageDefinition) => ValidationResult;
}

/**
 * Execute an LLM operation with validation-gated retries.
 * Returns the first result that passes all validation passes.
 */
export async function withValidationRetry<TReq, TRes>(
  ctx: AttemptContext<TReq, TRes>
): Promise<{ result: TRes; validation: ValidationResult; attempt: number; rawResponses: string[] }> {
  const retryReasons: string[][] = [];
  const rawResponses: string[] = [];
  let lastValidation: ValidationResult | null = null;
  let lastResult: TRes | null = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const previousErrors = retryReasons.length > 0
      ? retryReasons[retryReasons.length - 1]
      : undefined;

    lastResult = await ctx.callLLM(ctx.request, previousErrors);
    rawResponses.push(JSON.stringify(lastResult));

    // Apply the LLM output to a language snapshot and validate
    let candidateLanguage: LanguageDefinition;
    try {
      candidateLanguage = ctx.applyToLanguage(lastResult, ctx.baseLanguage);
    } catch (applyErr) {
      const msg = `Failed to apply response to language: ${applyErr instanceof Error ? applyErr.message : String(applyErr)}`;
      retryReasons.push([msg]);
      if (attempt === MAX_ATTEMPTS) break;
      continue;
    }

    lastValidation = ctx.validate(candidateLanguage);

    if (lastValidation.valid) {
      return { result: lastResult, validation: lastValidation, attempt, rawResponses };
    }

    // Extract actionable error messages for the retry prompt
    const errorMessages = lastValidation.errors.map(
      (e) => `[${e.module.toUpperCase()} ${e.ruleId}] ${e.message}${e.entityRef ? ` (ref: ${e.entityRef})` : ""}`
    );
    retryReasons.push(errorMessages);
  }

  // All attempts exhausted
  const error: LLMOperationError = {
    operation: ctx.operation,
    attempt: MAX_ATTEMPTS,
    finalError: lastValidation
      ? `Validation failed after ${MAX_ATTEMPTS} attempts. Final errors: ${lastValidation.errors.map(e => e.message).join("; ")}`
      : "All attempts exhausted without a valid response.",
    retryReasons,
    durationMs: 0,
  };

  throw error;
}

/**
 * Build a retry preamble to prepend to the user message on subsequent attempts.
 * Tells the LLM exactly what went wrong so it can fix it.
 */
export function buildRetryPreamble(errors: string[], attempt: number): string {
  return `
[RETRY ATTEMPT ${attempt}/${MAX_ATTEMPTS}]
Your previous response failed Slanger's linguistic validation engine with the following errors:

${errors.map((e, i) => `${i + 1}. ${e}`).join("\n")}

Please fix ALL of the above issues in your response. Pay careful attention to:
- Only use phoneme symbols that appear in the language's inventory
- All affixes must produce phonotactically valid forms
- All required fields must be present and non-empty
- IPA forms must use the format "/phonemes/" (with slashes)

`.trim();
}
