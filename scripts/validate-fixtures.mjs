/**
 * validate-fixtures.mjs
 *
 * CI contract test: validates all fixture language definitions
 * against the Slanger Language Schema (JSON Schema).
 *
 * Run: node scripts/validate-fixtures.mjs
 * Exits 0 on success, 1 on failure.
 */

import { createRequire } from "module";
const require = createRequire(import.meta.url);

// Minimal AJV-compatible validation using only Node built-ins
// In production: npm install ajv ajv-formats
// For Phase 1 CI we do structural validation manually

async function main() {
  const { ALL_FIXTURES, LANGUAGE_DEFINITION_SCHEMA } = await import(
    "../packages/shared-types/dist/index.js"
  );

  let passed = 0;
  let failed = 0;

  const REQUIRED_TOP_LEVEL = [
    "slangerVersion",
    "meta",
    "phonology",
    "morphology",
    "syntax",
    "lexicon",
    "corpus",
    "validationState",
  ];

  const REQUIRED_META = [
    "id", "name", "authorId", "tags",
    "createdAt", "updatedAt", "version", "preset", "naturalismScore",
  ];

  const REQUIRED_PHONOLOGY = ["inventory", "phonotactics", "orthography", "suprasegmentals"];
  const REQUIRED_INVENTORY = ["consonants", "vowels", "tones"];

  for (const fixture of ALL_FIXTURES) {
    const errors = [];
    const name = fixture?.meta?.name ?? "(unknown)";

    // Top-level fields
    for (const field of REQUIRED_TOP_LEVEL) {
      if (!(field in fixture)) errors.push(`Missing top-level field: ${field}`);
    }

    // slangerVersion
    if (fixture.slangerVersion !== "1.0") {
      errors.push(`slangerVersion must be "1.0", got: ${fixture.slangerVersion}`);
    }

    // meta
    if (fixture.meta) {
      for (const field of REQUIRED_META) {
        if (!(field in fixture.meta)) errors.push(`Missing meta.${field}`);
      }
      if (!/^lang_[a-z0-9]{6,}$/.test(fixture.meta.id ?? "")) {
        errors.push(`meta.id does not match pattern lang_<alphanum6+>: ${fixture.meta.id}`);
      }
      if (!["naturalistic", "experimental"].includes(fixture.meta.preset)) {
        errors.push(`meta.preset must be naturalistic or experimental`);
      }
      if (
        typeof fixture.meta.naturalismScore !== "number" ||
        fixture.meta.naturalismScore < 0 ||
        fixture.meta.naturalismScore > 1
      ) {
        errors.push(`meta.naturalismScore must be number 0–1`);
      }
    }

    // phonology
    if (fixture.phonology) {
      for (const field of REQUIRED_PHONOLOGY) {
        if (!(field in fixture.phonology)) errors.push(`Missing phonology.${field}`);
      }
      if (fixture.phonology.inventory) {
        for (const field of REQUIRED_INVENTORY) {
          if (!Array.isArray(fixture.phonology.inventory[field])) {
            errors.push(`phonology.inventory.${field} must be an array`);
          }
        }
        if ((fixture.phonology.inventory.consonants?.length ?? 0) === 0) {
          errors.push(`phonology.inventory.consonants must not be empty`);
        }
        if ((fixture.phonology.inventory.vowels?.length ?? 0) === 0) {
          errors.push(`phonology.inventory.vowels must not be empty`);
        }
      }
      // Orthography must cover all phonemes
      if (fixture.phonology.inventory && fixture.phonology.orthography) {
        const allPhonemes = [
          ...fixture.phonology.inventory.consonants,
          ...fixture.phonology.inventory.vowels,
        ];
        for (const phoneme of allPhonemes) {
          if (!(phoneme in fixture.phonology.orthography)) {
            errors.push(`phonology.orthography missing mapping for phoneme: ${phoneme}`);
          }
        }
      }
    }

    // morphology
    if (!fixture.morphology?.typology) errors.push("Missing morphology.typology");
    const validTypologies = ["analytic", "agglutinative", "fusional", "polysynthetic", "mixed"];
    if (fixture.morphology?.typology && !validTypologies.includes(fixture.morphology.typology)) {
      errors.push(`Invalid morphology.typology: ${fixture.morphology.typology}`);
    }

    // syntax
    const validOrders = ["SOV", "SVO", "VSO", "VOS", "OVS", "OSV", "free"];
    if (!validOrders.includes(fixture.syntax?.wordOrder)) {
      errors.push(`Invalid syntax.wordOrder: ${fixture.syntax?.wordOrder}`);
    }

    // lexicon — validate entry IDs
    if (Array.isArray(fixture.lexicon)) {
      for (const entry of fixture.lexicon) {
        if (!/^lex_[0-9]{4,}$/.test(entry.id ?? "")) {
          errors.push(`Invalid lexical entry id: ${entry.id}`);
        }
        if (!Array.isArray(entry.glosses) || entry.glosses.length === 0) {
          errors.push(`Lexical entry ${entry.id} must have at least one gloss`);
        }
      }
    }

    // validationState
    if (!Array.isArray(fixture.validationState?.errors)) {
      errors.push("validationState.errors must be an array");
    }

    // Report
    if (errors.length === 0) {
      console.log(`  ✓ ${name}`);
      passed++;
    } else {
      console.error(`  ✗ ${name}`);
      errors.forEach((e) => console.error(`    → ${e}`));
      failed++;
    }
  }

  console.log(`\nContract tests: ${passed} passed, ${failed} failed`);

  if (failed > 0) process.exit(1);
  process.exit(0);
}

main().catch((err) => {
  console.error("Fixture validation script error:", err);
  process.exit(1);
});
