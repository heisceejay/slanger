/**
 * Phase 2 Integration Tests
 * Self-contained test runner — no external test framework dependencies.
 */

// Import compiled outputs
import { validate, toValidationState } from "../index.js";
import { FIXTURE_KETHANI, FIXTURE_VAROSSI, FIXTURE_XRVETH } from "@slanger/shared-types";
import { validateInventory, validateOrthography, validateWordForm, generateIpaChartData } from "@slanger/phonology";
import { generateParadigmTable, applyDerivationalRules } from "@slanger/morphology";
import { validateSyntaxConfig, getConstituencyOrder } from "@slanger/syntax";
import { generateCoverageReport, CORE_VOCABULARY_SLOTS, validateLexicon } from "@slanger/lexicon";

// ─── Mini test runner ─────────────────────────────────────────────────────────

let passed = 0; let failed = 0;
const failures: string[] = [];

function test(name: string, fn: () => void): void {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e: unknown) {
    failed++;
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`  ✗ ${name}\n    ${msg}`);
    failures.push(`${name}: ${msg}`);
  }
}

function eq<T>(actual: T, expected: T, msg?: string): void {
  if (actual !== expected) throw new Error(msg ?? `Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

function ok(val: unknown, msg?: string): void {
  if (!val) throw new Error(msg ?? `Expected truthy, got ${JSON.stringify(val)}`);
}

function deepEq<T>(actual: T, expected: T, msg?: string): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected))
    throw new Error(msg ?? `Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

// ─── Phonology ────────────────────────────────────────────────────────────────

console.log("\n── Phonology ──");

test("Kethani inventory passes validation", () => {
  const issues = validateInventory(FIXTURE_KETHANI.phonology.inventory);
  const errors = issues.filter(i => i.severity === "error");
  eq(errors.length, 0, `Errors: ${JSON.stringify(errors)}`);
});

test("Varossi inventory passes validation", () => {
  const errors = validateInventory(FIXTURE_VAROSSI.phonology.inventory).filter(i => i.severity === "error");
  eq(errors.length, 0);
});

test("Kethani orthography is bijective", () => {
  const r = validateOrthography(FIXTURE_KETHANI.phonology.inventory, FIXTURE_KETHANI.phonology.orthography);
  eq(r.bijective, true, `Missing: ${r.missingPhonemes}, Unused: ${r.unusedGraphemes}`);
});

test("Varossi orthography is bijective", () => {
  const r = validateOrthography(FIXTURE_VAROSSI.phonology.inventory, FIXTURE_VAROSSI.phonology.orthography);
  eq(r.bijective, true);
});

test("Valid Kethani word 'tana' passes phonotactics (CV.CV)", () => {
  const r = validateWordForm("/tana/", FIXTURE_KETHANI.phonology.phonotactics, FIXTURE_KETHANI.phonology.inventory);
  eq(r.valid, true, `Issues: ${JSON.stringify(r.issues)}`);
});

test("Valid Kethani word 'kelu' passes phonotactics (CV.CV)", () => {
  const r = validateWordForm("/kelu/", FIXTURE_KETHANI.phonology.phonotactics, FIXTURE_KETHANI.phonology.inventory);
  eq(r.valid, true);
});

test("Invalid word 'tna' (CC onset, no clusters) fails for Kethani", () => {
  const r = validateWordForm("/tna/", FIXTURE_KETHANI.phonology.phonotactics, FIXTURE_KETHANI.phonology.inventory);
  eq(r.valid, false);
});

test("Word with non-inventory phoneme fails", () => {
  const r = validateWordForm("/xata/", FIXTURE_KETHANI.phonology.phonotactics, FIXTURE_KETHANI.phonology.inventory);
  eq(r.valid, false);
});

test("IPA chart generated with correct inventory markers", () => {
  const chart = generateIpaChartData(FIXTURE_KETHANI.phonology.inventory);
  ok(chart.consonantChart.length > 0);
  const inInv = chart.consonantChart.flat().filter(c => c.inInventory).map(c => c.ipa);
  for (const ph of FIXTURE_KETHANI.phonology.inventory.consonants) {
    ok(inInv.includes(ph), `${ph} not marked in chart`);
  }
});

// ─── Morphology ───────────────────────────────────────────────────────────────

console.log("\n── Morphology ──");

test("Paradigm table generates for Kethani noun 'tana'", () => {
  const entry = FIXTURE_KETHANI.lexicon[0]!;
  const table = generateParadigmTable(entry, FIXTURE_KETHANI.morphology, FIXTURE_KETHANI.phonology);
  eq(table.lexemeId, entry.id);
  ok(table.rows.length > 0);
});

test("Paradigm table generates for Kethani verb 'kelu'", () => {
  const entry = FIXTURE_KETHANI.lexicon[1]!;
  const table = generateParadigmTable(entry, FIXTURE_KETHANI.morphology, FIXTURE_KETHANI.phonology);
  ok(table.rows.length > 0);
});

test("Nominalization rule produces 'keluur' from 'kelu'", () => {
  const entry = FIXTURE_KETHANI.lexicon[1]!;
  const derived = applyDerivationalRules(entry, FIXTURE_KETHANI.morphology.derivationalRules, FIXTURE_KETHANI.phonology);
  const nom = derived.find(d => d.ruleId === "drv_nom");
  ok(nom, "nominalization not found");
  eq(nom?.orthographicForm, "keluur");
  eq(nom?.pos, "noun");
});

test("Adjectivization rule produces 'tanaik' from 'tana'", () => {
  const entry = FIXTURE_KETHANI.lexicon[0]!;
  const derived = applyDerivationalRules(entry, FIXTURE_KETHANI.morphology.derivationalRules, FIXTURE_KETHANI.phonology);
  const adj = derived.find(d => d.ruleId === "drv_adj");
  ok(adj, "adjectivization not found");
  eq(adj?.orthographicForm, "tanaik");
});

test("Varossi fusional paradigm has verb_present and verb_past", () => {
  ok("verb_present" in FIXTURE_VAROSSI.morphology.paradigms);
  ok("verb_past" in FIXTURE_VAROSSI.morphology.paradigms);
});

// ─── Syntax ───────────────────────────────────────────────────────────────────

console.log("\n── Syntax ──");

test("Kethani SOV syntax passes validation", () => {
  const errors = validateSyntaxConfig(FIXTURE_KETHANI.syntax).filter(i => i.severity === "error");
  eq(errors.length, 0);
});

test("Varossi SVO syntax passes validation", () => {
  const errors = validateSyntaxConfig(FIXTURE_VAROSSI.syntax).filter(i => i.severity === "error");
  eq(errors.length, 0);
});

test("Xr'veth free-order syntax passes validation", () => {
  const errors = validateSyntaxConfig(FIXTURE_XRVETH.syntax).filter(i => i.severity === "error");
  eq(errors.length, 0);
});

test("SOV order: [S, O, V]", () => { deepEq(getConstituencyOrder("SOV"), ["S","O","V"]); });
test("SVO order: [S, V, O]", () => { deepEq(getConstituencyOrder("SVO"), ["S","V","O"]); });
test("VSO order: [V, S, O]", () => { deepEq(getConstituencyOrder("VSO"), ["V","S","O"]); });
test("VOS order: [V, O, S]", () => { deepEq(getConstituencyOrder("VOS"), ["V","O","S"]); });
test("OVS order: [O, V, S]", () => { deepEq(getConstituencyOrder("OVS"), ["O","V","S"]); });
test("OSV order: [O, S, V]", () => { deepEq(getConstituencyOrder("OSV"), ["O","S","V"]); });

// ─── Lexicon ──────────────────────────────────────────────────────────────────

console.log("\n── Lexicon (Req #3) ──");

test("Core slots list has 70+ defined slots", () => {
  ok(CORE_VOCABULARY_SLOTS.length >= 70);
});

test("Core slots include 6 personal pronouns (I/you/he/we/you-pl/they)", () => {
  const pronouns = CORE_VOCABULARY_SLOTS.filter(s => s.subcategory === "personal-pronoun");
  ok(pronouns.length >= 6);
});

test("Core slots include cardinal numbers", () => {
  ok(CORE_VOCABULARY_SLOTS.filter(s => s.subcategory === "cardinal-number").length >= 5);
});

test("Core slots include negation particle", () => {
  ok(CORE_VOCABULARY_SLOTS.filter(s => s.subcategory === "negation").length >= 1);
});

test("Core slots include copula", () => {
  ok(CORE_VOCABULARY_SLOTS.filter(s => s.subcategory === "copula").length >= 1);
});

test("Coverage report detects missing slots in small fixture", () => {
  const r = generateCoverageReport(FIXTURE_KETHANI.lexicon);
  ok(r.missingSlots.length > 0);
});

test("Kethani lexicon has no validation errors", () => {
  const errors = validateLexicon(FIXTURE_KETHANI.lexicon, FIXTURE_KETHANI.morphology, FIXTURE_KETHANI.phonology)
    .filter(i => i.severity === "error");
  eq(errors.length, 0, JSON.stringify(errors));
});

// ─── Full Validation Pipeline ─────────────────────────────────────────────────

console.log("\n── Full Validation Pipeline ──");

test("Kethani: all passes — zero errors", () => {
  const r = validate(FIXTURE_KETHANI);
  eq(r.errors.length, 0, r.errors.map(e => `[${e.module}] ${e.message}`).join("; "));
});

test("Varossi: all passes — zero errors", () => {
  const r = validate(FIXTURE_VAROSSI);
  eq(r.errors.length, 0, r.errors.map(e => `[${e.module}] ${e.message}`).join("; "));
});

test("Xr'veth: all passes — zero errors", () => {
  const r = validate(FIXTURE_XRVETH);
  eq(r.errors.length, 0, r.errors.map(e => `[${e.module}] ${e.message}`).join("; "));
});

test("ValidationResult.valid === true for all fixtures", () => {
  for (const f of [FIXTURE_KETHANI, FIXTURE_VAROSSI, FIXTURE_XRVETH]) {
    const r = validate(f);
    eq(r.valid, true, `${f.meta.name} failed`);
  }
});

test("toValidationState maps correctly", () => {
  const r = validate(FIXTURE_KETHANI);
  const s = toValidationState(r);
  ok(s.lastRun);
  eq(s.errors.length, r.errors.length);
});

test("Summary has all four pass modules", () => {
  const r = validate(FIXTURE_KETHANI);
  ok("phonology" in r.summary);
  ok("morphology" in r.summary);
  ok("syntax" in r.summary);
  ok("crossModule" in r.summary);
});

test("Empty inventory → PHON_001 error → validation fails", () => {
  const broken = { ...FIXTURE_KETHANI, phonology: { ...FIXTURE_KETHANI.phonology,
    inventory: { consonants: [], vowels: FIXTURE_KETHANI.phonology.inventory.vowels, tones: [] }
  }};
  const r = validate(broken as typeof FIXTURE_KETHANI);
  eq(r.valid, false);
  ok(r.errors.some(e => e.ruleId === "PHON_001"));
});

test("Validation runs in <500ms", () => {
  const r = validate(FIXTURE_KETHANI);
  ok(r.durationMs < 500, `Took ${r.durationMs}ms`);
});

// ─── Results ──────────────────────────────────────────────────────────────────

console.log(`\n${"═".repeat(50)}`);
console.log(`Phase 2 Tests: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.error("\nFailed tests:");
  failures.forEach(f => console.error(`  ✗ ${f}`));
  throw new Error("Tests failed");
}
