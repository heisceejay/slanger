import type { WritingSystemConfig } from "@slanger/shared-types";

/**
 * Seeded PRNG for deterministic glyph generation.
 */
function seededRandom(seed: string): () => number {
    let hash = 0;
    for (let i = 0; i < seed.length; i++) {
        hash = (hash << 5) - hash + seed.charCodeAt(i);
        hash |= 0;
    }
    return () => {
        const t = (hash += 0x6d2b79f5);
        const z = Math.imul(t ^ (t >>> 15), t | 1);
        const y = z ^ (z + Math.imul(z ^ (z >>> 7), z | 61));
        return ((y ^ (y >>> 14)) >>> 0) / 4294967296;
    };
}

/**
 * Generates an SVG path string procedurally based on a seed and aesthetic parameters.
 */
function generateProceduralPath(seed: string, aes: WritingSystemConfig["aesthetics"]): string {
    const rnd = seededRandom(seed);
    const segments = 2 + Math.floor(aes.complexity * 6);
    const paths: string[] = [];

    let x = 8 + rnd() * 16;
    let y = 8 + rnd() * 16;
    paths.push(`M ${x.toFixed(1)} ${y.toFixed(1)}`);

    for (let i = 0; i < segments; i++) {
        const nx = 4 + rnd() * 24;
        const ny = 4 + rnd() * 24;

        switch (aes.style) {
            case "angular":
                paths.push(`L ${nx.toFixed(1)} ${ny.toFixed(1)}`);
                break;
            case "rounded": {
                const cx = x + (rnd() * 16 - 8);
                const cy = y + (rnd() * 16 - 8);
                paths.push(`Q ${cx.toFixed(1)} ${cy.toFixed(1)} ${nx.toFixed(1)} ${ny.toFixed(1)}`);
                break;
            }
            case "blocky":
                if (rnd() > 0.5) {
                    paths.push(`H ${nx.toFixed(1)}`);
                    paths.push(`V ${ny.toFixed(1)}`);
                } else {
                    paths.push(`V ${ny.toFixed(1)}`);
                    paths.push(`H ${nx.toFixed(1)}`);
                }
                break;
            case "cursive": {
                const cx1 = x + (rnd() * 20 - 10);
                const cy1 = y + (rnd() * 20 - 10);
                const cx2 = nx + (rnd() * 20 - 10);
                const cy2 = ny + (rnd() * 20 - 10);
                paths.push(`C ${cx1.toFixed(1)} ${cy1.toFixed(1)} ${cx2.toFixed(1)} ${cy2.toFixed(1)} ${nx.toFixed(1)} ${ny.toFixed(1)}`);
                break;
            }
        }
        x = nx;
        y = ny;
    }

    return paths.join(" ");
}

/**
 * Procedurally generates glyphs for a writing system config.
 */
export function regenerateGlyphs(
    config: WritingSystemConfig
): WritingSystemConfig {
    const nextGlyphs: Record<string, string> = {};
    const allGraphemes = new Set(Object.values(config.mappings).flat());

    allGraphemes.forEach(g => {
        nextGlyphs[g] = generateProceduralPath(g, config.aesthetics);
    });

    return {
        ...config,
        glyphs: nextGlyphs
    };
}
