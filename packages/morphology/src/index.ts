/**
 * @slanger/morphology — Req #4 + Req #6
 * Morphological typology, inflectional paradigm generator,
 * derivational rule engine, morphophonological alternations.
 */
import type {
  MorphologyConfig, MorphologicalTypology, PartOfSpeech,
  GrammaticalCategory, DerivationalRule, AlternationRule,
  LexicalEntry, DerivedForm, PhonologyConfig
} from "@slanger/shared-types";

export interface MorphologyValidationIssue {
  ruleId: string; severity: "error"|"warning"; message: string; entityRef?: string;
}

export interface InflectedForm {
  /** The root word */
  root: string;
  /** Slot-label → feature-value pairs applied */
  features: Record<string,string>;
  /** Resulting orthographic form */
  orthographicForm: string;
  /** Resulting IPA form */
  phonologicalForm: string;
}

export interface ParadigmTable {
  lexemeId: string;
  pos: PartOfSpeech;
  /** rows: feature combination label, columns: inflected form */
  rows: ParadigmRow[];
}

export interface ParadigmRow {
  label: string;
  features: Record<GrammaticalCategory, string>;
  orthographicForm: string;
  phonologicalForm: string;
}

// ─── Paradigm table generation ────────────────────────────────────────────────

/**
 * Generate all inflected forms for a lexical entry given the
 * morphology config. Handles agglutinative (slot-stacking) and
 * fusional (lookup table) strategies.
 */
export function generateParadigmTable(
  entry: LexicalEntry,
  config: MorphologyConfig,
  phonology: PhonologyConfig
): ParadigmTable {
  const categories = config.categories[entry.pos] ?? [];
  const rows: ParadigmRow[] = [];

  if (categories.length === 0) {
    // Uninflected POS (e.g. adverb in many languages)
    rows.push({
      label: "base",
      features: {} as Record<GrammaticalCategory,string>,
      orthographicForm: entry.orthographicForm,
      phonologicalForm: entry.phonologicalForm,
    });
    return { lexemeId: entry.id, pos: entry.pos, rows };
  }

  // Collect all feature values per category
  const featureSets: Array<{cat: GrammaticalCategory; values: string[]}> = categories.map(cat => ({
    cat,
    values: getFeatureValues(cat, config),
  }));

  // Generate cartesian product of all feature combinations
  const combos = cartesian(featureSets.map(f => f.values));

  for (const combo of combos) {
    const featureMap: Record<GrammaticalCategory, string> = {} as Record<GrammaticalCategory,string>;
    for (let i = 0; i < categories.length; i++) {
      featureMap[categories[i]!] = combo[i]!;
    }

    const label = combo.join(".");
    const { orth, ipa } = inflect(entry, featureMap, config, phonology);

    rows.push({
      label,
      features: featureMap,
      orthographicForm: orth,
      phonologicalForm: ipa,
    });
  }

  return { lexemeId: entry.id, pos: entry.pos, rows };
}

/**
 * Apply derivational rules to a lexical entry, returning all derived forms.
 */
export function applyDerivationalRules(
  entry: LexicalEntry,
  rules: DerivationalRule[],
  phonology: PhonologyConfig
): DerivedForm[] {
  const applicable = rules.filter(r => r.sourcePos === entry.pos);
  return applicable.map(rule => {
    const { orth, ipa } = applyAffix(
      entry.orthographicForm,
      entry.phonologicalForm,
      rule,
      phonology
    );
    return {
      ruleId: rule.id,
      phonologicalForm: ipa,
      orthographicForm: orth,
      pos: rule.targetPos,
      gloss: `${entry.glosses[0] ?? "?"} (${rule.label})`,
    };
  });
}

/**
 * Apply morphophonological alternation rules to a phonological form.
 * Rules fire at morpheme boundaries.
 */
export function applyAlternationRules(
  ipaForm: string,
  rules: AlternationRule[],
  boundary: "prefix" | "suffix" | "any"
): string {
  let result = ipaForm;
  for (const rule of rules) {
    if (rule.boundary !== boundary && rule.boundary !== "any" && boundary !== "any") continue;
    result = result.replaceAll(rule.input, rule.output);
  }
  return result;
}

// ─── Morphology validation ────────────────────────────────────────────────────

export function validateMorphologyConfig(
  config: MorphologyConfig,
  phonology: PhonologyConfig
): MorphologyValidationIssue[] {
  const issues: MorphologyValidationIssue[] = [];
  const inventorySet = new Set([...phonology.inventory.consonants, ...phonology.inventory.vowels]);

  // Validate morpheme order has "root"
  if (!config.morphemeOrder.includes("root")) {
    issues.push({ruleId:"MORPH_001",severity:"error",message:'Morpheme order must include a "root" slot.'});
  }

  // Validate paradigm affixes use only inventory phonemes
  for (const [paradigmKey, cells] of Object.entries(config.paradigms)) {
    for (const [featureVal, affix] of Object.entries(cells)) {
      const strippedAffix = affix.replace(/^-|-$/g,"");
      for (const char of strippedAffix) {
        // Simple check: single chars that look like IPA
        if (char.length === 1 && /[a-zɐɑɒæɓɔɕɖɗɘɛɜɝɞɟɠɡɢɣɤɥɦɧɨɩɪɫɬɭɮɯɰɱɲɳɴɵɶɷɸɹɺɻɼɽɾɿʀʁʂʃʄʅʆʇʈʉʊʋʌʍʎʏʐʑʒʓ]/.test(char)) {
          if (!inventorySet.has(char)) {
            issues.push({
              ruleId:"MORPH_002",severity:"warning",
              message:`Paradigm "${paradigmKey}[${featureVal}]": affix "${affix}" contains phoneme /${char}/ not in inventory.`,
              entityRef:`${paradigmKey}.${featureVal}`
            });
          }
        }
      }
    }
  }

  // Validate derivational rule affix types
  for (const rule of config.derivationalRules) {
    if (!rule.id) issues.push({ruleId:"MORPH_010",severity:"error",message:"Derivational rule missing id.",entityRef:rule.label});
    if (!["prefix","suffix","circumfix","infix"].includes(rule.affixType)) {
      issues.push({ruleId:"MORPH_011",severity:"error",message:`Unknown affix type: ${rule.affixType}.`,entityRef:rule.id});
    }
  }

  return issues;
}

/**
 * Validate that all inflected forms produced for a lexical entry pass
 * phonotactic rules. Returns issues for any violating cells.
 */
export function validateParadigmPhonology(
  table: ParadigmTable,
  phonology: PhonologyConfig,
  validateWordForm: (form: string, phonotactics: typeof phonology.phonotactics, inventory: typeof phonology.inventory) => {valid: boolean; issues: MorphologyValidationIssue[]}
): MorphologyValidationIssue[] {
  const issues: MorphologyValidationIssue[] = [];
  for (const row of table.rows) {
    const result = validateWordForm(row.phonologicalForm, phonology.phonotactics, phonology.inventory);
    if (!result.valid) {
      for (const issue of result.issues) {
        issues.push({
          ...issue,
          ruleId: `MORPH_PHN_${issue.ruleId}`,
          message: `Paradigm cell [${row.label}] → "${row.orthographicForm}": ${issue.message}`,
          entityRef: table.lexemeId,
        });
      }
    }
  }
  return issues;
}

// ─── Internals ────────────────────────────────────────────────────────────────

/** Get all feature values for a grammatical category from the paradigm tables */
function getFeatureValues(cat: GrammaticalCategory, config: MorphologyConfig): string[] {
  // Look for a paradigm key containing the category name
  for (const [key, cells] of Object.entries(config.paradigms)) {
    if (key.includes(cat)) return Object.keys(cells);
  }
  // Fallback: common defaults per category
  const defaults: Record<GrammaticalCategory, string[]> = {
    tense: ["present","past","future"],
    aspect: ["perfective","imperfective"],
    mood: ["indicative","subjunctive","imperative"],
    person: ["1sg","2sg","3sg","1pl","2pl","3pl"],
    number: ["singular","plural"],
    case: ["nominative","accusative","dative"],
    gender: ["masculine","feminine"],
    nounClass: ["class1","class2"],
    evidentiality: ["direct","reported","inferential"],
    mirativity: ["mirative","non-mirative"],
    definiteness: ["definite","indefinite"],
    animacy: ["animate","inanimate"],
  };
  return defaults[cat] ?? ["base"];
}

interface InflectResult { orth: string; ipa: string; }

/** Apply inflectional morphology to produce a surface form */
function inflect(
  entry: LexicalEntry,
  features: Record<GrammaticalCategory,string>,
  config: MorphologyConfig,
  phonology: PhonologyConfig
): InflectResult {
  let orth = entry.orthographicForm;
  let ipa = entry.phonologicalForm.replace(/^\/|\/$/g,"");

  // Walk morpheme order slots (skip "root")
  for (const slot of config.morphemeOrder) {
    if (slot === "root") continue;

    // Find paradigm that matches this slot
    for (const [paradigmKey, cells] of Object.entries(config.paradigms)) {
      if (!paradigmKey.includes(slot.replace(/\./g,"_").split("_")[0] ?? slot)) continue;

      // Find matching feature value
      for (const [catStr, featureVal] of Object.entries(features)) {
        if (!paradigmKey.includes(catStr)) continue;
        const affix = cells[featureVal];
        if (affix === undefined) continue;

        const applied = applyAffix(orth, ipa, {
          id: paradigmKey,
          sourcePos: entry.pos,
          targetPos: entry.pos,
          label: slot,
          affix,
          affixType: affix.startsWith("-") ? "suffix" : affix.endsWith("-") ? "prefix" : "suffix",
        }, phonology);
        orth = applied.orth;
        ipa = applied.ipa;
        break;
      }
    }
  }

  // Also do a combined slot lookup (e.g. "person.number" → "1sg")
  const combinedKey = Object.values(features).join(".");
  for (const [paradigmKey, cells] of Object.entries(config.paradigms)) {
    const affix = cells[combinedKey];
    if (affix !== undefined) {
      const applied = applyAffix(orth, ipa, {
        id: paradigmKey, sourcePos: entry.pos, targetPos: entry.pos,
        label: paradigmKey, affix,
        affixType: affix.startsWith("-") ? "suffix" : affix.endsWith("-") ? "prefix" : "suffix",
      }, phonology);
      orth = applied.orth;
      ipa = applied.ipa;
    }
  }

  return { orth, ipa: `/${ipa}/` };
}

function applyAffix(orth: string, ipa: string, rule: DerivationalRule, _phonology: PhonologyConfig): InflectResult {
  const cleanIpa = ipa.replace(/^\/|\/$/g,"");
  const affix = rule.affix;

  if (rule.affixType === "suffix") {
    const a = affix.replace(/^-/,"");
    return { orth: orth + a, ipa: `/${cleanIpa}${a}/` };
  } else if (rule.affixType === "prefix") {
    const a = affix.replace(/-$/,"");
    return { orth: a + orth, ipa: `/${a}${cleanIpa}/` };
  } else if (rule.affixType === "circumfix") {
    const parts = affix.split("…");
    const pre = (parts[0] ?? "").replace(/-$/,"");
    const suf = (parts[1] ?? "").replace(/^-/,"");
    return { orth: pre + orth + suf, ipa: `/${pre}${cleanIpa}${suf}/` };
  }
  // infix — insert after first vowel
  const vowelMatch = /[aeiouæɛɔɪʊəɑɒ]/.exec(orth);
  if (vowelMatch && vowelMatch.index !== undefined) {
    const pos = vowelMatch.index + 1;
    const a = affix.replace(/^-|-$/g,"");
    return {
      orth: orth.slice(0,pos) + a + orth.slice(pos),
      ipa: `/${cleanIpa.slice(0,pos)}${a}${cleanIpa.slice(pos)}/`,
    };
  }
  return { orth: orth + affix.replace(/^-|-$/g,""), ipa: `/${cleanIpa}${affix.replace(/^-|-$/g,"")}/` };
}

function cartesian<T>(arrays: T[][]): T[][] {
  if (arrays.length === 0) return [[]];
  const [first,...rest] = arrays;
  const restProduct = cartesian(rest);
  return (first ?? []).flatMap(item => restProduct.map(combo => [item,...combo]));
}
