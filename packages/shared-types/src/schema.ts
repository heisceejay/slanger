/**
 * Slanger Language Schema v1.0
 *
 * This is the single source of truth for all language definitions.
 * Every module reads from and writes to this schema.
 * Breaking changes require a major version bump and migration plan.
 */

// ─── Meta ────────────────────────────────────────────────────────────────────

export interface LanguageMeta {
  /** Unique language identifier, e.g. "lang_abc123" */
  id: string;
  /** Display name of the language */
  name: string;
  /** Owning user ID */
  authorId: string;
  /** Optional world/setting name */
  world?: string;
  /** Searchable tags, e.g. ["agglutinative", "SOV", "tonal"] */
  tags: string[];
  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
  /** Incremented on every save */
  version: number;
  /** "naturalistic" | "experimental" preset */
  preset: LanguagePreset;
  /** 0–1 scalar: 0 = naturalistic, 1 = maximally alien/experimental */
  naturalismScore: number;
  /** Snapshots at major generation steps for rollback (client-side only) */
  versionHistory?: VersionSnapshot[];
}

export interface VersionSnapshot {
  label: string;
  timestamp: string; // ISO 8601
  snapshot: LanguageDefinition;
}

export type LanguagePreset = "naturalistic" | "experimental";

// ─── Phonology ───────────────────────────────────────────────────────────────

export interface PhonologyConfig {
  inventory: PhonemeInventory;
  phonotactics: Phonotactics;
  /** Maps IPA phoneme symbol → orthographic grapheme */
  orthography: Record<string, string>;
  /** Optional suprasegmental features */
  suprasegmentals: Suprasegmentals;
}

export interface PhonemeInventory {
  /** IPA symbols for consonants in the inventory */
  consonants: string[];
  /** IPA symbols for vowels in the inventory */
  vowels: string[];
  /** Tone descriptors if the language is tonal */
  tones: string[];
}

export interface Phonotactics {
  /**
   * Syllable structure templates using C (consonant) and V (vowel).
   * E.g. ["CV", "CVC", "V", "VC"]
   */
  syllableTemplates: string[];
  /** Permitted onset consonant clusters as ordered arrays of IPA symbols */
  onsetClusters: string[][];
  /** Permitted coda consonant clusters as ordered arrays of IPA symbols */
  codaClusters: string[][];
  /** Positional allophony rules */
  allophonyRules: AllophonyRule[];
}

export interface AllophonyRule {
  /** Base phoneme (IPA) */
  phoneme: string;
  /** Allophone that surfaces (IPA) */
  allophone: string;
  /** Human-readable environment description, e.g. "before front vowels" */
  environment: string;
  /** Machine-readable environment: position in syllable */
  position?: "onset" | "coda" | "nucleus";
}

export interface Suprasegmentals {
  /** Whether the language has lexical tone */
  hasLexicalTone: boolean;
  /** Whether stress is phonemic (vs predictable) */
  hasPhonemicStress: boolean;
  /** Whether vowel length is contrastive */
  hasVowelLength: boolean;
  /** Whether nasalization is phonemic */
  hasPhonemicNasalization: boolean;
}

// ─── Morphology ──────────────────────────────────────────────────────────────

export type MorphologicalTypology =
  | "analytic"
  | "agglutinative"
  | "fusional"
  | "polysynthetic"
  | "mixed";

export interface MorphologyConfig {
  typology: MorphologicalTypology;
  /** Grammatical categories per part of speech */
  categories: Record<PartOfSpeech, GrammaticalCategory[]>;
  /** Paradigm tables: category name → feature value → affix string */
  paradigms: Record<string, Record<string, string>>;
  /**
   * Linear ordering of morpheme slots.
   * E.g. ["root", "aspect", "tense", "person.number"]
   */
  morphemeOrder: string[];
  /** Derivational rules */
  derivationalRules: DerivationalRule[];
  /** Morphophonological alternation rules */
  alternationRules: AlternationRule[];
}

export type PartOfSpeech = "noun" | "verb" | "adjective" | "adverb" | "particle" | "pronoun" | "numeral" | "other";

/** Req #3: Core vocabulary subcategory for pronouns, numbers, function words */
export type VocabularySubcategory =
  | "personal-pronoun"
  | "demonstrative-pronoun"
  | "interrogative-pronoun"
  | "indefinite-pronoun"
  | "cardinal-number"
  | "ordinal-number"
  | "conjunction"
  | "adposition"
  | "article"
  | "copula"
  | "negation"
  | "auxiliary"
  | "swadesh-core"; // marks items from the Swadesh list

export type GrammaticalCategory =
  | "tense"
  | "aspect"
  | "mood"
  | "person"
  | "number"
  | "case"
  | "gender"
  | "nounClass"
  | "evidentiality"
  | "mirativity"
  | "definiteness"
  | "animacy";

export interface DerivationalRule {
  id: string;
  /** What POS the rule applies to */
  sourcePos: PartOfSpeech;
  /** What POS the derived form belongs to */
  targetPos: PartOfSpeech;
  /** Human-readable label, e.g. "nominalization" */
  label: string;
  /** Affix string (prefix uses hyphen suffix: "-tion", prefix: "un-") */
  affix: string;
  /** Whether affix is a prefix or suffix */
  affixType: "prefix" | "suffix" | "circumfix" | "infix";
}

export interface AlternationRule {
  id: string;
  /** Triggering context description */
  trigger: string;
  /** Phoneme that changes (IPA) */
  input: string;
  /** Phoneme it changes to (IPA) */
  output: string;
  /** At which morpheme boundary this applies */
  boundary: "prefix" | "suffix" | "any";
}

// ─── Syntax ──────────────────────────────────────────────────────────────────

export type WordOrder = "SOV" | "SVO" | "VSO" | "VOS" | "OVS" | "OSV" | "free";

export type AlignmentSystem =
  | "nominative-accusative"
  | "ergative-absolutive"
  | "tripartite"
  | "split-ergative"
  | "active-stative";

export interface SyntaxConfig {
  wordOrder: WordOrder;
  alignment: AlignmentSystem;
  /** Phrase structure rules: constituent label → ordered slot array */
  phraseStructure: Record<string, PhraseStructureSlot[]>;
  /** Supported clause types */
  clauseTypes: ClauseType[];
  /** Head-marking vs dependent-marking */
  headedness: "head-marking" | "dependent-marking" | "double-marking";
  /** Whether the language uses postpositions or prepositions */
  adpositionType: "preposition" | "postposition" | "both" | "none";
}

export interface PhraseStructureSlot {
  /** Constituent label, e.g. "Det", "N", "Adj", "V", "PP" */
  label: string;
  /** Whether this slot is optional */
  optional: boolean;
  /** Whether this slot may repeat */
  repeatable: boolean;
}

export type ClauseType =
  | "declarative"
  | "polar-interrogative"
  | "content-interrogative"
  | "imperative"
  | "relative"
  | "complement"
  | "conditional"
  | "exclamative";

// ─── Lexicon ─────────────────────────────────────────────────────────────────

export interface LexicalEntry {
  /** Unique entry ID within the language, e.g. "lex_0042" */
  id: string;
  /** IPA phonological form, e.g. "/ta.na/" */
  phonologicalForm: string;
  /** Orthographic surface form */
  orthographicForm: string;
  pos: PartOfSpeech;
  /** Req #3: Fine-grained subcategory (pronouns, numbers, function words) */
  subcategory?: VocabularySubcategory;
  /** Primary and secondary gloss meanings */
  glosses: string[];
  /** Req #7: Polysemy — multiple distinct senses with explanations */
  senses?: LexicalSense[];
  /** Semantic domain tags */
  semanticFields: string[];
  /** Auto-derived related forms */
  derivedForms: DerivedForm[];
  /** Semantic roles for verbs */
  semanticRoles?: SemanticRole[];
  /** Optional etymological note (req #9 hooks into this) */
  etymology?: string;
  /** Whether this entry was LLM-generated or user-defined */
  source: "generated" | "user";
}

/** Req #7: A distinct sense of a polysemous word */
export interface LexicalSense {
  /** Sense number, 1-indexed */
  index: number;
  gloss: string;
  semanticField: string;
  /** Usage example in the conlang (orthographic) */
  exampleOrthographic?: string;
  /** Free translation of example */
  exampleTranslation?: string;
}

export interface DerivedForm {
  /** Rule ID from MorphologyConfig.derivationalRules */
  ruleId: string;
  phonologicalForm: string;
  orthographicForm: string;
  pos: PartOfSpeech;
  gloss: string;
}

export type SemanticRole =
  | "agent"
  | "patient"
  | "experiencer"
  | "theme"
  | "instrument"
  | "location"
  | "recipient"
  | "source"
  | "goal";

// ─── Pragmatics ──────────────────────────────────────────────────────────────

/** Req #8: Pragmatics — register distinctions, honorifics, politeness */
export interface PragmaticsConfig {
  /** Whether the language grammaticalizes formality level */
  hasFormalRegister: boolean;
  /** Whether honorifics are grammatically encoded */
  hasHonorifics: boolean;
  /** Named registers with descriptions */
  registers: RegisterDefinition[];
  /** Discourse markers by function */
  discourseMarkers: DiscourseMarker[];
  /** Politeness strategies used */
  politenessStrategies: PolitenessStrategy[];
}

export interface RegisterDefinition {
  name: Register;
  description: string;
  /** Morphological or lexical markers that signal this register */
  markers: string[];
}

export interface DiscourseMarker {
  orthographicForm: string;
  function: "topic" | "focus" | "contrast" | "evidential" | "discourse-boundary" | "hedging";
  gloss: string;
}

export type PolitenessStrategy =
  | "honorific-pronouns"
  | "verb-agreement-rank"
  | "lexical-substitution"
  | "indirection"
  | "formal-vocabulary"
  | "avoidance-speech";

// ─── Semantics ────────────────────────────────────────────────────────────────

/** Req #7: Semantics — domains, polysemy, metaphor, cross-linguistic gaps */
export interface SemanticsConfig {
  /** Named semantic domains in this language */
  domains: SemanticDomain[];
  /** Concepts that don't map cleanly to English */
  untranslatables: Untranslatable[];
  /** Active metaphor systems, e.g. TIME IS SPACE */
  metaphorSystems: MetaphorSystem[];
}

export interface SemanticDomain {
  id: string;
  name: string;
  description: string;
  /** Cultural significance level */
  culturalSalience: "low" | "medium" | "high";
}

export interface Untranslatable {
  orthographicForm: string;
  phonologicalForm: string;
  /** Best-effort English approximation */
  approximateGloss: string;
  /** Full explanation of the concept */
  explanation: string;
  semanticField: string;
}

export interface MetaphorSystem {
  /** e.g. "TIME IS SPACE" */
  label: string;
  sourceDomain: string;
  targetDomain: string;
  /** Example lexical items demonstrating the metaphor */
  examples: string[];
}

// ─── Cultural Integration ─────────────────────────────────────────────────────

/** Req #11: Cultural integration — idioms, naming, worldview */
export interface CulturalConfig {
  /** Idiomatic expressions */
  idioms: Idiom[];
  /** Naming conventions for people, places, factions */
  namingConventions: NamingConvention[];
  /** Proverbs and fixed expressions */
  proverbs: Proverb[];
}

export interface Idiom {
  id: string;
  orthographicForm: string;
  literalGloss: string;
  idiomaticMeaning: string;
  register: Register;
  semanticField: string;
}

export interface NamingConvention {
  /** e.g. "personal", "place", "faction", "deity" */
  category: string;
  description: string;
  /** Phonological patterns typical of this name type */
  phonologicalPattern: string;
  /** Example names */
  examples: string[];
}

export interface Proverb {
  id: string;
  orthographicForm: string;
  translation: string;
  explanation: string;
}

// ─── Corpus ──────────────────────────────────────────────────────────────────

export interface CorpusSample {
  id: string;
  /** Register this sample belongs to */
  register: Register;
  /** The surface text in the language's orthography */
  orthographicText: string;
  /** IPA transcription */
  ipaText: string;
  /** Free translation */
  translation: string;
  /** Morpheme-by-morpheme interlinear gloss */
  interlinearGloss: InterlinearLine[];
  /** Optional user prompt that generated this sample */
  prompt?: string;
  generatedAt: string;
}

export type Register = "formal" | "informal" | "ritual" | "technical" | "narrative";

export interface InterlinearLine {
  /** Original word in orthography */
  word: string;
  /** Morpheme segmentation */
  morphemes: string[];
  /** Gloss for each morpheme */
  glosses: string[];
}

// ─── Validation State ────────────────────────────────────────────────────────

export interface ValidationState {
  lastRun: string; // ISO 8601
  /** Blocking issues that must be resolved */
  errors: ValidationIssue[];
  /** Non-blocking issues */
  warnings: ValidationIssue[];
}

export type ValidationModule = "phonology" | "morphology" | "syntax" | "lexicon" | "cross-module";
export type ValidationSeverity = "error" | "warning";

export interface ValidationIssue {
  /** Unique rule identifier, e.g. "PHON_001" */
  ruleId: string;
  module: ValidationModule;
  severity: ValidationSeverity;
  /** Human-readable, actionable message */
  message: string;
  /** Reference to the affected entity (lexeme ID, paradigm key, etc.) */
  entityRef?: string;
}

// ─── Root Language Definition ────────────────────────────────────────────────

export interface LanguageDefinition {
  /** Always "1.0" for this schema version */
  slangerVersion: "1.0";
  meta: LanguageMeta;
  phonology: PhonologyConfig;
  morphology: MorphologyConfig;
  syntax: SyntaxConfig;
  /** Req #8: Pragmatics — register, honorifics, discourse */
  pragmatics: PragmaticsConfig;
  /** Req #7: Semantics — domains, polysemy, metaphor */
  semantics: SemanticsConfig;
  /** Req #11: Cultural integration — idioms, naming, proverbs */
  culture: CulturalConfig;
  lexicon: LexicalEntry[];
  corpus: CorpusSample[];
  validationState: ValidationState;
}

// ─── API Envelope ────────────────────────────────────────────────────────────

export interface ApiResponse<T> {
  data: T;
  meta: {
    version: number;
    validated: boolean;
    requestId: string;
  };
  errors: ApiError[];
}

export interface ApiError {
  code: string;
  message: string;
  field?: string;
}

// ─── Partial / Creation types ────────────────────────────────────────────────

/** Used when creating a new language — meta fields are auto-generated */
export type CreateLanguageInput = {
  name: string;
  world?: string;
  tags?: string[];
  preset?: LanguagePreset;
  naturalismScore?: number;
  /** Optional seed for reproducible autonomous generation */
  seed?: string;
  /** 0–1 complexity scalar for autonomous generation */
  complexity?: number;
  /** If provided, use guided configuration instead of autonomous generation */
  phonology?: Partial<PhonologyConfig>;
  morphology?: Partial<MorphologyConfig>;
  syntax?: Partial<SyntaxConfig>;
  pragmatics?: Partial<PragmaticsConfig>;
  semantics?: Partial<SemanticsConfig>;
  culture?: Partial<CulturalConfig>;
};

/** Patch payload — all fields optional, module-level granularity */
export type UpdateLanguageInput = {
  name?: string;
  world?: string;
  tags?: string[];
  preset?: LanguagePreset;
  naturalismScore?: number;
  phonology?: Partial<PhonologyConfig>;
  morphology?: Partial<MorphologyConfig>;
  syntax?: Partial<SyntaxConfig>;
  pragmatics?: Partial<PragmaticsConfig>;
  semantics?: Partial<SemanticsConfig>;
  culture?: Partial<CulturalConfig>;
};
