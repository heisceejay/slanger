import type { LanguageDefinition } from "@slanger/shared-types";
import type { OperationName } from "./types.js";

/**
 * Prunes a LanguageDefinition object to remove non-essential large fields
 * based on the operation being performed. This is critical for staying
 * within the 6000 TPM limit of the Groq free tier.
 */
export function pruneLanguageForOp(
    lang: LanguageDefinition,
    op: OperationName
): LanguageDefinition {
    // Always work on a deep clone to avoid mutating the source language
    const pruned: LanguageDefinition = JSON.parse(JSON.stringify(lang));

    switch (op) {
        case "suggest_phoneme_inventory":
            // Needs meta, maybe current phonology. Lexicon/Corpus/Syntax are irrelevant.
            pruned.lexicon = [];
            pruned.corpus = [];
            pruned.syntax = {
                wordOrder: "SVO",
                alignment: "nominative-accusative",
                phraseStructure: {},
                clauseTypes: [],
                headedness: "dependent-marking",
                adpositionType: "preposition"
            };
            break;

        case "fill_paradigm_gaps":
            // Needs phonology + morphology. Lexicon/Corpus/Syntax can be pruned.
            pruned.lexicon = [];
            pruned.corpus = [];
            pruned.syntax = {
                wordOrder: "SVO",
                alignment: "nominative-accusative",
                phraseStructure: {},
                clauseTypes: [],
                headedness: "dependent-marking",
                adpositionType: "preposition"
            };
            break;

        case "generate_lexicon":
            // Needs phonology + morphology + meta. Lexicon is pruned because GenerateLexiconRequest
            // has its own list of forms to avoid (existingOrthForms). Corpus/Syntax irrelevant.
            pruned.lexicon = [];
            pruned.corpus = [];
            break;

        case "generate_corpus":
            // Needs full language usually, but we can sample the lexicon if it's huge.
            if (pruned.lexicon.length > 50) {
                // Keep a sample of 50 words to give the AI a sense of vocabulary
                pruned.lexicon = pruned.lexicon.slice(0, 50);
            }
            break;

        case "explain_rule":
            // Needs partial context. We can prune the corpus and trim the lexicon.
            pruned.corpus = [];
            if (pruned.lexicon.length > 20) {
                pruned.lexicon = pruned.lexicon.slice(0, 20);
            }
            break;

        case "check_consistency":
            // Needs consistency between modules. We sample the lexicon and corpus to keep size down.
            if (pruned.lexicon.length > 30) {
                pruned.lexicon = pruned.lexicon.slice(0, 30);
            }
            if (pruned.corpus.length > 5) {
                pruned.corpus = pruned.corpus.slice(0, 5);
            }
            break;
    }

    // Clear large metadata fields not needed by LLM
    if (pruned.meta.versionHistory) {
        delete pruned.meta.versionHistory;
    }

    return pruned;
}
