/**
 * Operation: suggest_syntax
 *
 * Generates an initial SyntaxConfig including:
 *  - Word order (SVO, SOV, etc.)
 *  - Morphosyntactic alignment (nominative-accusative, ergative-absolutive, etc.)
 *  - Headedness and branching direction
 *  - Basic phrase structure rules
 */

import type { SuggestSyntaxRequest, SuggestSyntaxResponse } from "../types.js";
import type { SyntaxConfig, PhraseStructureSlot } from "@slanger/shared-types";

export function buildSystemPrompt(): string {
    return `You are an expert linguistic typologist and constructed language designer.

Your task is to design syntactic systems for constructed languages. You must:
1. Choose a word order and alignment that feels natural given the language's phonology, morphology, and tags
2. Ensure consistency between headedness (head-initial vs head-final) and word order
3. Design phrase structure rules (S, VP, NP, PP) that reflect the chosen word order
4. Respect typological correlations (e.g., SOV languages are often postpositional)
5. Provide a clear rationale for your design choices`;
}

export function buildUserMessage(req: SuggestSyntaxRequest, retryErrors?: string[]): string {
    const naturalism = req.naturalismScore;

    const phonInfo = `PHONOLOGY CONTEXT:
- Inventory: ${req.phonology.inventory.consonants.join(", ")} | ${req.phonology.inventory.vowels.join(", ")}
- Templates: ${req.phonology.phonotactics.syllableTemplates.join(", ")}`;

    const morphInfo = `MORPHOLOGY CONTEXT:
- Typology: ${req.morphology.typology}
- Categories: ${JSON.stringify(req.morphology.categories)}`;

    const retryBlock = retryErrors?.length
        ? `\n[PREVIOUS ATTEMPT ERRORS — FIX THESE]\n${retryErrors.map((e, i) => `${i + 1}. ${e}`).join("\n")}\n`
        : "";

    return `${retryBlock}
Design a starting syntax system for a constructed language with these parameters:
- Name hint: ${req.world ? `set in "${req.world}"` : "no specific world"}
- Tags: ${req.tags.length ? req.tags.join(", ") : "none specified"}
- Naturalism Score: ${naturalism.toFixed(2)}

${phonInfo}
${morphInfo}

WORD ORDER OPTIONS: [SOV, SVO, VSO, VOS, OVS, OSV, free]
ALIGNMENT OPTIONS: [nominative-accusative, ergative-absolutive, tripartite, split-ergative, active-stative]

Respond with ONLY this JSON structure (no text outside JSON):
{
  "syntax": {
    "wordOrder": "<SOV|SVO|VSO|VOS|OVS|OSV|free>",
    "alignment": "<alignment>",
    "adpositionType": "<preposition|postposition|both|none>",
    "headedness": "<head-marking|dependent-marking|double-marking>",
    "phraseStructure": {
      "S": [{"label": "NP", "optional": true, "repeatable": false}, {"label": "VP", "optional": false, "repeatable": false}],
      "VP": [{"label": "V", "optional": false, "repeatable": false}, {"label": "NP", "optional": true, "repeatable": false}],
      "NP": [{"label": "Det", "optional": true, "repeatable": false}, {"label": "N", "optional": false, "repeatable": false}],
      "PP": [{"label": "P", "optional": false, "repeatable": false}, {"label": "NP", "optional": false, "repeatable": false}]
    },
    "clauseTypes": ["declarative"]
  },
  "rationale": "<2-3 sentences explaining syntactic choices and their typological justification>"
}

CRITICAL CONSTRAINTS:
1. If the language is SOV, it should likely be postpositional.
2. If the morphology is highly fusional or agglutinative, 'free' word order or OVS/VOS might be more plausible.
3. Alignment should ideally correlate with case markers defined in morphology (if any).
4. phraseStructure slots should use labels: NP, VP, PP, S, N, V, Adj, Adv, P, Det.
5. All phraseStructure slots MUST include 'repeatable': true/false and 'optional': true/false.
6. Ensure phraseStructure matches the chosen 'wordOrder'.`.trim();
}

export function parseResponse(raw: string): SuggestSyntaxResponse {
    const parsed = JSON.parse(raw) as Partial<SuggestSyntaxResponse>;

    if (!parsed.syntax) {
        throw new Error('Response missing required "syntax" field');
    }

    const syn = parsed.syntax as Partial<SyntaxConfig>;

    if (!syn.wordOrder || !syn.alignment) {
        throw new Error("syntax.wordOrder and syntax.alignment are required");
    }

    // Ensure phraseStructure slots have all required fields
    const phraseStructure: Record<string, PhraseStructureSlot[]> = {};
    if (syn.phraseStructure) {
        for (const [key, slots] of Object.entries(syn.phraseStructure)) {
            phraseStructure[key] = (slots as any[]).map(s => ({
                label: s.label || "N",
                optional: s.optional ?? false,
                repeatable: s.repeatable ?? false
            }));
        }
    }

    // Fill in optional fields/structure if missing
    const complete: SyntaxConfig = {
        wordOrder: syn.wordOrder as any,
        alignment: syn.alignment as any,
        adpositionType: syn.adpositionType ?? "preposition",
        headedness: syn.headedness ?? "dependent-marking",
        phraseStructure: Object.keys(phraseStructure).length > 0 ? phraseStructure : {
            S: [{ label: "NP", optional: true, repeatable: false }, { label: "VP", optional: false, repeatable: false }],
            VP: [{ label: "V", optional: false, repeatable: false }, { label: "NP", optional: true, repeatable: false }],
            NP: [{ label: "Det", optional: true, repeatable: false }, { label: "N", optional: false, repeatable: false }],
            PP: [{ label: "P", optional: false, repeatable: false }, { label: "NP", optional: false, repeatable: false }]
        },
        clauseTypes: Array.isArray(syn.clauseTypes) ? syn.clauseTypes : ["declarative"]
    };

    return {
        syntax: complete,
        rationale: parsed.rationale ?? "",
    };
}
