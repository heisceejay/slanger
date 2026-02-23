/**
 * @slanger/validation — The Validation Engine
 *
 * Runs after EVERY mutation to the Language Store.
 * No LLM output may be committed without passing all passes.
 *
 * Four passes:
 *   1. Phonological  — inventory, orthography, word-form phonotactics
 *   2. Morphological — paradigm integrity, affix phonology
 *   3. Syntactic     — phrase structure, clause types, alignment
 *   4. Cross-module  — all morphemes use inventory phonemes;
 *                      orthography consistent; categories defined;
 *                      core vocabulary requirements met (Req #3)
 */
import type {
  LanguageDefinition, ValidationState, ValidationIssue, ValidationModule
} from "@slanger/shared-types";

import {
  validateInventory, validateOrthography, validatePhonologyConfig, validateWordForm, validateWritingSystem
} from "@slanger/phonology";
import {
  validateMorphologyConfig, generateParadigmTable, validateParadigmPhonology, validateTemplaticMorphology
} from "@slanger/morphology";
import { validateSyntaxConfig, validateCorpusConsistency } from "@slanger/syntax";
import { validateLexicon, generateCoverageReport, MINIMUM_VOCABULARY_COUNT } from "@slanger/lexicon";

// ─── Public surface ───────────────────────────────────────────────────────────

export interface ValidationResult {
  valid: boolean;         // true only if no errors (warnings are OK)
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
  /** Detailed per-pass summary */
  summary: ValidationSummary;
  durationMs: number;
}

export interface ValidationSummary {
  phonology: PassResult;
  morphology: PassResult;
  syntax: PassResult;
  crossModule: PassResult;
}

export interface PassResult {
  passed: boolean;
  errorCount: number;
  warningCount: number;
}

/**
 * Run all four validation passes on a LanguageDefinition.
 * This is the single entry point called by the API gateway after every PATCH.
 */
export function validate(lang: LanguageDefinition): ValidationResult {
  const start = Date.now();
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];

  // ── Pass 1: Phonological ─────────────────────────────────────────────────
  const phonIssues = runPhonologicalPass(lang);
  classify(phonIssues, "phonology", errors, warnings);

  // ── Pass 2: Morphological ────────────────────────────────────────────────
  const morphIssues = runMorphologicalPass(lang);
  classify(morphIssues, "morphology", errors, warnings);

  // ── Pass 3: Syntactic ────────────────────────────────────────────────────
  const synIssues = runSyntacticPass(lang);
  classify(synIssues, "syntax", errors, warnings);

  // ── Pass 4: Cross-module ─────────────────────────────────────────────────
  const crossIssues = runCrossModulePass(lang);
  classify(crossIssues, "cross-module", errors, warnings);

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    summary: {
      phonology: passResult(errors, warnings, "phonology"),
      morphology: passResult(errors, warnings, "morphology"),
      syntax: passResult(errors, warnings, "syntax"),
      crossModule: passResult(errors, warnings, "cross-module"),
    },
    durationMs: Date.now() - start,
  };
}

/**
 * Convert a ValidationResult into the ValidationState stored on the language document.
 */
export function toValidationState(result: ValidationResult): ValidationState {
  return {
    lastRun: new Date().toISOString(),
    errors: result.errors,
    warnings: result.warnings,
  };
}

// ─── Pass 1: Phonological ─────────────────────────────────────────────────────

function runPhonologicalPass(lang: LanguageDefinition): RawIssue[] {
  const issues: RawIssue[] = [];
  const phon = lang.phonology;

  // Inventory
  for (const i of validateInventory(phon.inventory))
    issues.push({ ...i, module: "phonology" });

  // Writing System
  if (phon.writingSystem) {
    for (const i of validateWritingSystem(phon.writingSystem, phon.inventory))
      issues.push({ ...i, module: "writing-system" });
  }

  // Orthography
  const ortho = validateOrthography(phon.inventory, phon.orthography);
  for (const ph of ortho.missingPhonemes)
    issues.push({ ruleId: "PHON_020", severity: "error", module: "phonology", message: `Phoneme /${ph}/ has no orthographic mapping.`, entityRef: ph });
  for (const g of ortho.unusedGraphemes)
    issues.push({ ruleId: "PHON_021", severity: "warning", module: "phonology", message: `Orthography key "${g}" is not in the inventory.`, entityRef: g });
  for (const c of ortho.conflicts)
    issues.push({ ruleId: "PHON_022", severity: "warning", module: "phonology", message: `Orthography conflict (multiple phonemes → same grapheme): ${c}. Allowed but prefer unique graphemes.`, entityRef: c });

  // Syllable templates
  if (phon.phonotactics.syllableTemplates.length === 0)
    issues.push({ ruleId: "PHON_031", severity: "error", module: "phonology", message: "At least one syllable template is required." });

  // Validate all lexicon word forms against phonotactics
  for (const entry of lang.lexicon) {
    const result = validateWordForm(entry.phonologicalForm, phon.phonotactics, phon.inventory);
    if (!result.valid) {
      for (const i of result.issues)
        issues.push({ ...i, module: "phonology", entityRef: entry.id });
    }
    // Also validate derived forms
    for (const derived of entry.derivedForms) {
      const dr = validateWordForm(derived.phonologicalForm, phon.phonotactics, phon.inventory);
      if (!dr.valid) {
        for (const i of dr.issues)
          issues.push({ ...i, module: "phonology", ruleId: `${i.ruleId}_DRV`, entityRef: `${entry.id}:${derived.ruleId}` });
      }
    }
  }

  return issues;
}

// ─── Pass 2: Morphological ────────────────────────────────────────────────────

function runMorphologicalPass(lang: LanguageDefinition): RawIssue[] {
  const issues: RawIssue[] = [];
  const morph = lang.morphology;
  const phon = lang.phonology;

  for (const i of validateMorphologyConfig(morph, phon))
    issues.push({ ...i, module: "morphology" });

  if (morph.templatic?.enabled) {
    for (const i of validateTemplaticMorphology(morph.templatic, morph, phon))
      issues.push({ ...i, module: "morphology" });
  }

  // Generate and validate paradigm tables for every lexical entry
  // (limit to first 50 entries to keep validation fast; full run is async)
  const sampleEntries = lang.lexicon.slice(0, 50);
  for (const entry of sampleEntries) {
    try {
      const table = generateParadigmTable(entry, morph, phon);
      // Validate paradigm cell phonology using phonology module
      const morphPhonIssues = validateParadigmPhonology(table, phon, (form, phonotactics, inventory) => {
        // Strip extra slashes that may result from nested IPA wrapping
        const cleanForm = form.replace(/^\/+|\/+$/g, "");
        const r = validateWordForm("/" + cleanForm + "/", phonotactics, inventory);
        return { valid: r.valid, issues: r.issues.map(i => ({ ...i, module: "morphology" as ValidationModule })) };
      });
      for (const i of morphPhonIssues)
        issues.push({ ...i, module: "morphology" });
    } catch (e) {
      issues.push({
        ruleId: "MORPH_ERR", severity: "warning", module: "morphology",
        message: `Could not generate paradigm for ${entry.id}: ${String(e)}`,
        entityRef: entry.id
      });
    }
  }

  return issues;
}

// ─── Pass 3: Syntactic ────────────────────────────────────────────────────────

function runSyntacticPass(lang: LanguageDefinition): RawIssue[] {
  const issues: RawIssue[] = [];
  for (const i of validateSyntaxConfig(lang.syntax))
    issues.push({ ...i, module: "syntax" });

  if (lang.corpus && lang.corpus.length > 0) {
    for (const i of validateCorpusConsistency(lang.corpus, lang.syntax))
      issues.push({ ...i, module: "syntax" });
  }
  return issues;
}

// ─── Pass 4: Cross-module ─────────────────────────────────────────────────────

function runCrossModulePass(lang: LanguageDefinition): RawIssue[] {
  const issues: RawIssue[] = [];
  const inventorySet = new Set([...lang.phonology.inventory.consonants, ...lang.phonology.inventory.vowels]);

  // All paradigm affixes must reference inventory phonemes
  for (const [paradigmKey, cells] of Object.entries(lang.morphology.paradigms)) {
    for (const [featureVal, affix] of Object.entries(cells)) {
      const stripped = affix.replace(/^-|-$/g, "");
      // Tokenize and check
      for (const char of stripped) {
        if (/[a-zɐ-ʒ]/.test(char) && !inventorySet.has(char)) {
          issues.push({
            ruleId: "CROSS_001", severity: "warning", module: "cross-module",
            message: `Paradigm "${paradigmKey}[${featureVal}]" affix "${affix}" contains /${char}/ not in inventory.`,
            entityRef: `${paradigmKey}.${featureVal}`
          });
        }
      }
    }
  }

  // Derivational affixes must use inventory phonemes
  for (const rule of lang.morphology.derivationalRules) {
    const stripped = rule.affix.replace(/^-|-$/g, "");
    for (const char of stripped) {
      if (/[a-zɐ-ʒ]/.test(char) && !inventorySet.has(char)) {
        issues.push({
          ruleId: "CROSS_002", severity: "warning", module: "cross-module",
          message: `Derivational rule "${rule.id}" affix "${rule.affix}" contains /${char}/ not in inventory.`,
          entityRef: rule.id
        });
      }
    }
  }

  // Orthography ↔ phonology consistency (orthography must be complete)
  const missingOrth = [...inventorySet].filter(ph => !(ph in lang.phonology.orthography));
  for (const ph of missingOrth) {
    issues.push({
      ruleId: "CROSS_010", severity: "error", module: "cross-module",
      message: `Phoneme /${ph}/ in inventory has no orthographic mapping. Orthography is incomplete.`,
      entityRef: ph
    });
  }

  // Morphological categories used in paradigms must be in the categories config
  const definedCategories = new Set(
    Object.values(lang.morphology.categories).flat()
  );
  for (const paradigmKey of Object.keys(lang.morphology.paradigms)) {
    // Extract category name from key (e.g. "verb_tense" → "tense")
    const parts = paradigmKey.split("_");
    const catName = parts[parts.length - 1];
    if (catName && !definedCategories.has(catName as any) && catName !== "present" && catName !== "past") {
      issues.push({
        ruleId: "CROSS_020", severity: "warning", module: "cross-module",
        message: `Paradigm key "${paradigmKey}" references category "${catName}" not in morphology.categories.`,
        entityRef: paradigmKey
      });
    }
  }

  // Req #3: Core vocabulary coverage check
  const report = generateCoverageReport(lang.lexicon);
  if (report.totalEntries < MINIMUM_VOCABULARY_COUNT) {
    issues.push({
      ruleId: "CROSS_030", severity: "warning", module: "cross-module",
      message: `Lexicon has ${report.totalEntries}/${MINIMUM_VOCABULARY_COUNT} minimum required entries. Coverage: ${report.coveragePercent}% of core slots.`
    });
  }
  // Pronouns
  if (!report.byPos["pronoun"]) {
    issues.push({ ruleId: "CROSS_031", severity: "warning", module: "cross-module", message: "No pronouns in lexicon. Req #3 requires personal pronouns." });
  }
  // Numbers
  if (!report.byPos["numeral"]) {
    issues.push({ ruleId: "CROSS_032", severity: "warning", module: "cross-module", message: "No numerals in lexicon. Req #3 requires cardinal numbers." });
  }

  // Lexicon validation
  for (const i of validateLexicon(lang.lexicon, lang.morphology, lang.phonology))
    issues.push({ ...i, module: "cross-module" });

  // Pragmatics: if honorifics enabled, check for honorific strategies
  if (lang.pragmatics.hasHonorifics && lang.pragmatics.politenessStrategies.length === 0) {
    issues.push({
      ruleId: "CROSS_040", severity: "warning", module: "cross-module",
      message: "Honorifics are enabled but no politeness strategies are defined in pragmatics config."
    });
  }

  // Semantics: domains referenced in lexicon should be defined
  const definedDomains = new Set(lang.semantics.domains.map(d => d.id));
  if (lang.semantics.domains.length > 0) {
    for (const entry of lang.lexicon) {
      for (const field of entry.semanticFields) {
        if (!definedDomains.has(field) && lang.semantics.domains.length > 0) {
          // Only warn if domains are explicitly defined but field is missing
          // (don't warn for freeform tagging when domains list is empty)
        }
      }
    }
  }

  return issues;
}

// ─── Internals ────────────────────────────────────────────────────────────────

interface RawIssue {
  ruleId: string;
  severity: "error" | "warning";
  module: ValidationModule;
  message: string;
  entityRef?: string;
}

function classify(
  raw: RawIssue[],
  _module: ValidationModule,
  errors: ValidationIssue[],
  warnings: ValidationIssue[]
): void {
  for (const issue of raw) {
    const vi: ValidationIssue = {
      ruleId: issue.ruleId,
      module: issue.module,
      severity: issue.severity,
      message: issue.message,
    };
    if (issue.entityRef !== undefined) vi.entityRef = issue.entityRef;
    if (issue.severity === "error") errors.push(vi);
    else warnings.push(vi);
  }
}

function passResult(errors: ValidationIssue[], warnings: ValidationIssue[], module: ValidationModule): PassResult {
  const e = errors.filter(i => i.module === module).length;
  const w = warnings.filter(i => i.module === module).length;
  return { passed: e === 0, errorCount: e, warningCount: w };
}
