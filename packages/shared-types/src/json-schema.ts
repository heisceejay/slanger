/**
 * JSON Schema (Draft 7) representation of the Slanger Language Definition.
 * Used by the Validation Engine and API layer for runtime payload validation.
 */
export const LANGUAGE_DEFINITION_SCHEMA = {
  $schema: "http://json-schema.org/draft-07/schema#",
  $id: "https://slanger.app/schemas/language-definition/1.0.json",
  title: "LanguageDefinition",
  type: "object",
  required: [
    "slangerVersion", "meta", "phonology", "morphology",
    "syntax", "lexicon", "corpus", "validationState"
  ],
  additionalProperties: false,
  properties: {
    slangerVersion: { type: "string", const: "1.0" },
    meta: {
      type: "object",
      required: ["id", "name", "authorId", "tags", "createdAt", "updatedAt", "version", "preset", "naturalismScore"],
      additionalProperties: false,
      properties: {
        id: { type: "string", pattern: "^lang_[a-z0-9]{6,}$" },
        name: { type: "string", minLength: 1, maxLength: 100 },
        authorId: { type: "string" },
        world: { type: "string", maxLength: 200 },
        tags: { type: "array", items: { type: "string" }, maxItems: 20 },
        createdAt: { type: "string", format: "date-time" },
        updatedAt: { type: "string", format: "date-time" },
        version: { type: "number", minimum: 1 },
        preset: { type: "string", enum: ["naturalistic", "experimental"] },
        naturalismScore: { type: "number", minimum: 0, maximum: 1 }
      }
    },
    phonology: {
      type: "object",
      required: ["inventory", "phonotactics", "orthography", "suprasegmentals"],
      additionalProperties: false,
      properties: {
        inventory: {
          type: "object",
          required: ["consonants", "vowels", "tones"],
          properties: {
            consonants: { type: "array", items: { type: "string" }, minItems: 1 },
            vowels: { type: "array", items: { type: "string" }, minItems: 1 },
            tones: { type: "array", items: { type: "string" } }
          }
        },
        phonotactics: {
          type: "object",
          required: ["syllableTemplates", "onsetClusters", "codaClusters", "allophonyRules"],
          properties: {
            syllableTemplates: {
              type: "array",
              items: { type: "string", pattern: "^[CcVvGgNnSs()]+$" },
              minItems: 1
            },
            onsetClusters: { type: "array", items: { type: "array", items: { type: "string" } } },
            codaClusters: { type: "array", items: { type: "array", items: { type: "string" } } },
            allophonyRules: { type: "array", items: { type: "object" } }
          }
        },
        orthography: {
          type: "object",
          additionalProperties: { type: "string" }
        },
        suprasegmentals: {
          type: "object",
          required: ["hasLexicalTone", "hasPhonemicStress", "hasVowelLength", "hasPhonemicNasalization"],
          properties: {
            hasLexicalTone: { type: "boolean" },
            hasPhonemicStress: { type: "boolean" },
            hasVowelLength: { type: "boolean" },
            hasPhonemicNasalization: { type: "boolean" }
          }
        }
      }
    },
    morphology: {
      type: "object",
      required: ["typology", "categories", "paradigms", "morphemeOrder", "derivationalRules", "alternationRules"],
      additionalProperties: false,
      properties: {
        typology: {
          type: "string",
          enum: ["analytic", "agglutinative", "fusional", "polysynthetic", "mixed"]
        },
        categories: { type: "object" },
        paradigms: { type: "object" },
        morphemeOrder: { type: "array", items: { type: "string" } },
        derivationalRules: { type: "array" },
        alternationRules: { type: "array" }
      }
    },
    syntax: {
      type: "object",
      required: ["wordOrder", "alignment", "phraseStructure", "clauseTypes", "headedness", "adpositionType"],
      additionalProperties: false,
      properties: {
        wordOrder: {
          type: "string",
          enum: ["SOV", "SVO", "VSO", "VOS", "OVS", "OSV", "free"]
        },
        alignment: {
          type: "string",
          enum: [
            "nominative-accusative", "ergative-absolutive",
            "tripartite", "split-ergative", "active-stative"
          ]
        },
        phraseStructure: { type: "object" },
        clauseTypes: { type: "array", items: { type: "string" } },
        headedness: {
          type: "string",
          enum: ["head-marking", "dependent-marking", "double-marking"]
        },
        adpositionType: {
          type: "string",
          enum: ["preposition", "postposition", "both", "none"]
        }
      }
    },
    lexicon: {
      type: "array",
      items: {
        type: "object",
        required: ["id", "phonologicalForm", "orthographicForm", "pos", "glosses", "semanticFields", "derivedForms", "source"],
        properties: {
          id: { type: "string", pattern: "^lex_[0-9]{4,}$" },
          phonologicalForm: { type: "string" },
          orthographicForm: { type: "string" },
          pos: { type: "string", enum: ["noun", "verb", "adjective", "adverb", "particle", "other"] },
          glosses: { type: "array", items: { type: "string" }, minItems: 1 },
          semanticFields: { type: "array", items: { type: "string" } },
          derivedForms: { type: "array" },
          source: { type: "string", enum: ["generated", "user"] }
        }
      }
    },
    corpus: { type: "array" },
    validationState: {
      type: "object",
      required: ["lastRun", "errors", "warnings"],
      properties: {
        lastRun: { type: "string", format: "date-time" },
        errors: { type: "array" },
        warnings: { type: "array" }
      }
    }
  }
} as const;
