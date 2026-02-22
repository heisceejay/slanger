/**
 * Fixture language definitions used in schema validation tests and
 * as baseline inputs for the eval harness.
 *
 * Three fixtures are required by the Phase 1 exit criteria:
 *   1. Kethani  — SOV agglutinative, naturalistic
 *   2. Varossi  — SVO fusional, naturalistic
 *   3. Xr'veth  — free-order polysynthetic, experimental
 */

import type { LanguageDefinition } from "./schema.js";

const now = new Date().toISOString();

function emptyValidation() {
  return { lastRun: now, errors: [], warnings: [] };
}

function emptyPragmatics() {
  return {
    hasFormalRegister: false,
    hasHonorifics: false,
    registers: [],
    discourseMarkers: [],
    politenessStrategies: [],
  };
}

function emptySemantics() {
  return { domains: [], untranslatables: [], metaphorSystems: [] };
}

function emptyCulture() {
  return { idioms: [], namingConventions: [], proverbs: [] };
}

// ─── Fixture 1: Kethani (SOV, Agglutinative) ──────────────────────────────

export const FIXTURE_KETHANI: LanguageDefinition = {
  slangerVersion: "1.0",
  meta: {
    id: "lang_kethani",
    name: "Kethani",
    authorId: "user_fixture",
    world: "The Amber Reach",
    tags: ["agglutinative", "SOV", "nominative-accusative"],
    createdAt: now,
    updatedAt: now,
    version: 1,
    preset: "naturalistic",
    naturalismScore: 0.8,
  },
  phonology: {
    inventory: {
      consonants: ["p", "t", "k", "s", "n", "l", "m", "r"],
      vowels: ["a", "e", "i", "o", "u"],
      tones: [],
    },
    phonotactics: {
      syllableTemplates: ["CV", "CVC", "V", "VC"],
      onsetClusters: [],
      codaClusters: [],
      allophonyRules: [],
    },
    orthography: {
      p: "p", t: "t", k: "k", s: "s",
      n: "n", l: "l", m: "m", r: "r",
      a: "a", e: "e", i: "i", o: "o", u: "u",
    },
    suprasegmentals: {
      hasLexicalTone: false,
      hasPhonemicStress: false,
      hasVowelLength: false,
      hasPhonemicNasalization: false,
    },
  },
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
      verb_tense: { past: "-va", present: "-na", future: "-sa" },
      verb_person_number: {
        "1sg": "-ki", "2sg": "-ti", "3sg": "-li",
        "1pl": "-kami", "2pl": "-tami", "3pl": "-lami",
      },
    },
    morphemeOrder: ["root", "case", "number"],
    derivationalRules: [
      {
        id: "drv_nom",
        sourcePos: "verb",
        targetPos: "noun",
        label: "nominalization",
        affix: "-ur",
        affixType: "suffix",
      },
      {
        id: "drv_adj",
        sourcePos: "noun",
        targetPos: "adjective",
        label: "adjectivization",
        affix: "-ik",
        affixType: "suffix",
      },
    ],
    alternationRules: [],
  },
  syntax: {
    wordOrder: "SOV",
    alignment: "nominative-accusative",
    phraseStructure: {
      NP: [
        { label: "Det", optional: true, repeatable: false },
        { label: "Adj", optional: true, repeatable: true },
        { label: "N", optional: false, repeatable: false },
      ],
      VP: [
        { label: "NP", optional: true, repeatable: false },
        { label: "V", optional: false, repeatable: false },
      ],
      S: [
        { label: "NP", optional: false, repeatable: false },
        { label: "VP", optional: false, repeatable: false },
      ],
    },
    clauseTypes: ["declarative", "polar-interrogative", "imperative"],
    headedness: "dependent-marking",
    adpositionType: "postposition",
  },
  lexicon: [
    {
      id: "lex_0001",
      phonologicalForm: "/ta.na/",
      orthographicForm: "tana",
      pos: "noun",
      glosses: ["water", "liquid"],
      semanticFields: ["nature", "environment"],
      derivedForms: [
        {
          ruleId: "drv_adj",
          phonologicalForm: "/ta.na.ik/",
          orthographicForm: "tanaik",
          pos: "adjective",
          gloss: "watery, liquid-like",
        },
      ],
      source: "user",
    },
    {
      id: "lex_0002",
      phonologicalForm: "/ke.lu/",
      orthographicForm: "kelu",
      pos: "verb",
      glosses: ["to walk", "to travel"],
      semanticFields: ["motion", "body"],
      semanticRoles: ["agent"],
      derivedForms: [
        {
          ruleId: "drv_nom",
          phonologicalForm: "/ke.lu.ur/",
          orthographicForm: "keluur",
          pos: "noun",
          gloss: "journey, act of walking",
        },
      ],
      source: "user",
    },
  ],
  corpus: [],
  pragmatics: emptyPragmatics(),
  semantics: emptySemantics(),
  culture: emptyCulture(),
  validationState: emptyValidation(),
};

// ─── Fixture 2: Varossi (SVO, Fusional) ───────────────────────────────────

export const FIXTURE_VAROSSI: LanguageDefinition = {
  slangerVersion: "1.0",
  meta: {
    id: "lang_varossi",
    name: "Varossi",
    authorId: "user_fixture",
    world: "The Dawnfold Republic",
    tags: ["fusional", "SVO", "ergative-absolutive"],
    createdAt: now,
    updatedAt: now,
    version: 1,
    preset: "naturalistic",
    naturalismScore: 0.65,
  },
  phonology: {
    inventory: {
      consonants: ["b", "d", "g", "v", "z", "r", "l", "n", "m", "f", "s"],
      vowels: ["a", "e", "i", "o", "u", "ə"],
      tones: [],
    },
    phonotactics: {
      syllableTemplates: ["CV", "CVC", "CCV", "CCVC"],
      onsetClusters: [["s", "t"], ["s", "p"], ["d", "r"], ["g", "r"]],
      codaClusters: [["n", "t"], ["l", "d"]],
      allophonyRules: [
        {
          phoneme: "b",
          allophone: "v",
          environment: "intervocalic position",
          position: "onset",
        },
      ],
    },
    orthography: {
      b: "b", d: "d", g: "g", v: "v", z: "z",
      r: "r", l: "l", n: "n", m: "m", f: "f", s: "s",
      a: "a", e: "e", i: "i", o: "o", u: "u", ə: "ë",
    },
    suprasegmentals: {
      hasLexicalTone: false,
      hasPhonemicStress: true,
      hasVowelLength: false,
      hasPhonemicNasalization: false,
    },
  },
  morphology: {
    typology: "fusional",
    categories: {
      noun: ["case", "gender", "number"],
      verb: ["tense", "mood", "person", "number"],
      adjective: ["gender", "number"],
      adverb: [],
      particle: [],
      pronoun: [],
      numeral: [],
      other: [],
    },
    paradigms: {
      verb_present: {
        "1sg": "-o", "2sg": "-as", "3sg.masc": "-et", "3sg.fem": "-at",
        "1pl": "-amos", "2pl": "-atis", "3pl": "-ant",
      },
      verb_past: {
        "1sg": "-avi", "2sg": "-avit", "3sg": "-avit",
        "1pl": "-avimus", "2pl": "-avistis", "3pl": "-averunt",
      },
      noun_masc_sg: { ergative: "-us", absolutive: "-em", dative: "-i" },
      noun_fem_sg: { ergative: "-a", absolutive: "-am", dative: "-ae" },
    },
    morphemeOrder: ["root", "tense+person+number"],
    derivationalRules: [
      {
        id: "drv_vnom",
        sourcePos: "verb",
        targetPos: "noun",
        label: "action nominalization",
        affix: "-tio",
        affixType: "suffix",
      },
    ],
    alternationRules: [
      {
        id: "alt_b_v",
        trigger: "intervocalic b",
        input: "b",
        output: "v",
        boundary: "any",
      },
    ],
  },
  syntax: {
    wordOrder: "SVO",
    alignment: "ergative-absolutive",
    phraseStructure: {
      NP: [
        { label: "Det", optional: true, repeatable: false },
        { label: "N", optional: false, repeatable: false },
        { label: "Adj", optional: true, repeatable: true },
        { label: "PP", optional: true, repeatable: true },
      ],
      VP: [
        { label: "V", optional: false, repeatable: false },
        { label: "NP", optional: true, repeatable: false },
        { label: "PP", optional: true, repeatable: true },
      ],
      PP: [
        { label: "P", optional: false, repeatable: false },
        { label: "NP", optional: false, repeatable: false },
      ],
    },
    clauseTypes: ["declarative", "polar-interrogative", "content-interrogative", "imperative", "relative"],
    headedness: "head-marking",
    adpositionType: "preposition",
  },
  lexicon: [
    {
      id: "lex_0001",
      phonologicalForm: "/va.rəs/",
      orthographicForm: "varës",
      pos: "noun",
      glosses: ["star", "light from above"],
      semanticFields: ["astronomy", "nature"],
      derivedForms: [],
      source: "user",
    },
  ],
  corpus: [],
  pragmatics: emptyPragmatics(),
  semantics: emptySemantics(),
  culture: emptyCulture(),
  validationState: emptyValidation(),
};

// ─── Fixture 3: Xr'veth (Free order, Polysynthetic, Experimental) ──────────

export const FIXTURE_XRVETH: LanguageDefinition = {
  slangerVersion: "1.0",
  meta: {
    id: "lang_xrveth",
    name: "Xr'veth",
    authorId: "user_fixture",
    world: "The Void Between",
    tags: ["polysynthetic", "free-order", "tonal", "experimental"],
    createdAt: now,
    updatedAt: now,
    version: 1,
    preset: "experimental",
    naturalismScore: 0.1,
  },
  phonology: {
    inventory: {
      consonants: ["x", "ʀ", "v", "θ", "ʔ", "ħ", "ɬ", "ŋ"],
      vowels: ["ɛ", "ɪ", "ʊ", "æ"],
      tones: ["high", "low", "falling", "rising"],
    },
    phonotactics: {
      syllableTemplates: ["CCV", "CCVC", "CVC"],
      onsetClusters: [["x", "r"], ["θ", "v"], ["ħ", "ɬ"]],
      codaClusters: [["ŋ", "ʔ"]],
      allophonyRules: [],
    },
    orthography: {
      x: "x", ʀ: "r'", v: "v", θ: "th", ʔ: "'",
      ħ: "hh", ɬ: "hl", ŋ: "ng",
      ɛ: "e", ɪ: "i", ʊ: "u", æ: "ae",
    },
    suprasegmentals: {
      hasLexicalTone: true,
      hasPhonemicStress: false,
      hasVowelLength: true,
      hasPhonemicNasalization: false,
    },
  },
  morphology: {
    typology: "polysynthetic",
    categories: {
      verb: ["tense", "aspect", "mood", "person", "number", "evidentiality", "mirativity"],
      noun: ["case", "animacy", "number"],
      adjective: [],
      adverb: [],
      particle: [],
      pronoun: [],
      numeral: [],
      other: [],
    },
    paradigms: {
      evidentiality: {
        direct: "-vɛ",
        reported: "-θɪ",
        inferential: "-ħæ",
        mirative: "-ʀʊ",
      },
      verb_aspect: {
        perfective: "x-",
        imperfective: "ħ-",
        habitual: "ŋ-",
      },
    },
    morphemeOrder: ["aspect", "root", "tense", "person.number", "evidentiality"],
    derivationalRules: [],
    alternationRules: [],
  },
  syntax: {
    wordOrder: "free",
    alignment: "active-stative",
    phraseStructure: {
      NP: [
        { label: "N", optional: false, repeatable: false },
        { label: "Adj", optional: true, repeatable: true },
      ],
    },
    clauseTypes: ["declarative", "imperative", "exclamative"],
    headedness: "head-marking",
    adpositionType: "none",
  },
  lexicon: [],
  corpus: [],
  pragmatics: emptyPragmatics(),
  semantics: emptySemantics(),
  culture: emptyCulture(),
  validationState: emptyValidation(),
};

export const ALL_FIXTURES = [FIXTURE_KETHANI, FIXTURE_VAROSSI, FIXTURE_XRVETH];
