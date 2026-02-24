import type { LanguageDefinition } from "@slanger/shared-types";
import type { OperationName } from "./types.js";

/**
 * Prunes a LanguageDefinition object to remove non-essential large fields
 * based on the operation being performed. This is critical for staying
 * within strict TPM/token limits of the LLM provider free tier.
 */
export function pruneLanguageForOp(
    lang: LanguageDefinition,
    op: OperationName
): LanguageDefinition {
    // Always work on a deep clone to avoid mutating the source language
    const pruned: LanguageDefinition = JSON.parse(JSON.stringify(lang));

    // Truncate world context - it can be long
    if (pruned.meta.world && pruned.meta.world.length > 500) {
        pruned.meta.world = pruned.meta.world.slice(0, 500) + "... (truncated)";
    }

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
            // Needs phonology + morphology + meta.
            // Paradigms are pruned because lexicon generation only needs typology/categories.
            pruned.lexicon = [];
            pruned.corpus = [];
            pruned.morphology.paradigms = {};
            break;

        case "generate_corpus":
            // Needs full language usually, but we sample aggressively
            pruned.lexicon = pruned.lexicon.slice(0, 20);
            pruned.corpus = pruned.corpus.slice(0, 3);
            break;

        case "explain_rule":
            // Needs partial context. We can prune the corpus and trim the lexicon.
            pruned.corpus = [];
            pruned.lexicon = pruned.lexicon.slice(0, 15);
            break;

        case "check_consistency":
            // Needs consistency between modules. We sample the lexicon and corpus to keep size down.
            pruned.lexicon = pruned.lexicon.slice(0, 20);
            pruned.corpus = pruned.corpus.slice(0, 3);
            break;
    }

    // Clear large metadata fields not needed by LLM
    if (pruned.meta.versionHistory) {
        delete (pruned.meta as any).versionHistory;
    }

    return pruned;
}
