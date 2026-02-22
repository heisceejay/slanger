/**
 * Client-side PDF export: grammar reference document.
 * Styled to match app aesthetic (--paper, --ink, serif/mono).
 */

import { jsPDF } from "jspdf";
import type { Language } from "./api";

const MARGIN = 20;
const PAGE_W = 210;
const PAGE_H = 297;
const CONTENT_W = PAGE_W - MARGIN * 2;
const CONTENT_H = PAGE_H - MARGIN * 2;
const PAPER = [245, 245, 240] as const;
const INK = [26, 26, 24] as const;
const RULE = 77; // ~30% opacity gray
const LINE = 5;
const LINE_SMALL = 4;

const IPA_TO_ENGLISH: Record<string, string> = {
  p: "like the p in spin",
  b: "like the b in bin",
  t: "like the t in stop",
  d: "like the d in dog",
  k: "like the k in sky",
  g: "like the g in go",
  m: "like the m in map",
  n: "like the n in no",
  ŋ: "like the ng in sing",
  f: "like the f in fan",
  v: "like the v in van",
  s: "like the s in see",
  z: "like the z in zoo",
  ʃ: "like the sh in shop",
  ʒ: "like the s in measure",
  h: "like the h in hat",
  r: "like the r in red (or trilled)",
  l: "like the l in lip",
  j: "like the y in yes",
  w: "like the w in we",
  tʃ: "like the ch in chip",
  dʒ: "like the j in jump",
  θ: "like the th in think",
  ð: "like the th in this",
  x: "like the ch in Scottish loch",
  i: "like the ee in see",
  e: "like the e in bed",
  a: "like the a in father",
  o: "like the o in go",
  u: "like the oo in boot",
  ɪ: "like the i in sit",
  ʊ: "like the oo in book",
  ɛ: "like the e in bed",
  ɔ: "like the aw in saw",
  æ: "like the a in cat",
  ə: "like the a in about",
  ɑ: "like the a in father",
};

function defaultIpaDescription(symbol: string): string {
  return IPA_TO_ENGLISH[symbol] ?? `IPA symbol /${symbol}/`;
}

function ensurePage(doc: jsPDF, y: number, needed: number): number {
  if (y + needed > MARGIN + CONTENT_H) {
    doc.addPage();
    doc.setFillColor(...PAPER);
    doc.rect(0, 0, PAGE_W, PAGE_H, "F");
    doc.setTextColor(...INK);
    return MARGIN;
  }
  return y;
}

function addRule(doc: jsPDF, y: number): number {
  doc.setDrawColor(RULE, RULE, RULE);
  doc.line(MARGIN, y, PAGE_W - MARGIN, y);
  return y + LINE;
}

function addFooter(doc: jsPDF, langName: string, pageNum: number): void {
  doc.setFont("courier", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...INK);
  doc.text(langName, MARGIN, PAGE_H - 10);
  doc.text(String(pageNum), PAGE_W - MARGIN, PAGE_H - 10, { align: "right" });
}

export function exportPdf(lang: Language): void {
  const doc = new jsPDF({ orientation: "p", unit: "mm", format: "a4" });
  doc.setFillColor(...PAPER);
  doc.rect(0, 0, PAGE_W, PAGE_H, "F");
  doc.setTextColor(...INK);
  let y = MARGIN;
  const langName = lang.meta.name;

  // ─── Cover ─────────────────────────────────────────────────────────────
  doc.setFont("times", "italic");
  doc.setFontSize(28);
  doc.text(langName, MARGIN, y + 12);
  y += 28;

  if (lang.meta.world) {
    doc.setFont("times", "normal");
    doc.setFontSize(11);
    doc.setTextColor(80, 80, 78);
    const worldLines = doc.splitTextToSize(lang.meta.world, CONTENT_W);
    doc.text(worldLines, MARGIN, y + 6);
    y += worldLines.length * LINE + 4;
    doc.setTextColor(...INK);
  }

  if (lang.meta.tags?.length) {
    doc.setFontSize(9);
    const tagStr = lang.meta.tags.join("   ");
    doc.text(tagStr, MARGIN, y + 4);
    y += 10;
  }

  y = addRule(doc, y + 4);
  doc.setFont("times", "normal");
  doc.setFontSize(10);
  doc.text("A Grammar Reference", MARGIN, y + 4);
  y += 14;

  doc.setFontSize(9);
  doc.setTextColor(100, 100, 98);
  const dateStr = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
  doc.text(dateStr, PAGE_W - MARGIN, PAGE_H - 20, { align: "right" });
  doc.setTextColor(...INK);
  doc.addPage();
  doc.setFillColor(...PAPER);
  doc.rect(0, 0, PAGE_W, PAGE_H, "F");
  y = MARGIN;

  // ─── Pronunciation ─────────────────────────────────────────────────────
  const orth = lang.phonology?.orthography;
  const inv = lang.phonology?.inventory;
  if (orth && inv && Object.keys(orth).length > 0) {
    doc.setFont("times", "normal");
    doc.setFontSize(9);
    doc.setTextColor(80, 80, 78);
    doc.text("PRONUNCIATION", MARGIN, y + 4);
    doc.setTextColor(...INK);
    y += 10;

    doc.setFontSize(10);
    const intro = `The following symbols are used to write ${langName}. Each symbol always represents the same sound.`;
    const introLines = doc.splitTextToSize(intro, CONTENT_W);
    doc.text(introLines, MARGIN, y + 4);
    y += introLines.length * LINE + 6;

    const symbols = [...(inv.consonants ?? []), ...(inv.vowels ?? [])];
    doc.setFont("courier", "normal");
    doc.setFontSize(9);
    for (const ipa of symbols) {
      y = ensurePage(doc, y, LINE_SMALL + 2);
      const graph = orth[ipa] ?? ipa;
      const desc = defaultIpaDescription(ipa);
      doc.text(graph, MARGIN, y + 3);
      doc.setFont("times", "normal");
      const descLines = doc.splitTextToSize(desc, CONTENT_W - 25);
      doc.text(descLines, MARGIN + 22, y + 3);
      doc.setFont("courier", "normal");
      y += Math.max(LINE_SMALL, descLines.length * LINE_SMALL) + 2;
    }
    y += 4;

    const supr = lang.phonology?.suprasegmentals;
    if (supr) {
      doc.setFont("times", "normal");
      doc.setFontSize(10);
      if (supr.hasPhonemicStress) {
        y = ensurePage(doc, y, LINE + 2);
        doc.text("Stress is phonemic — the position of stress can change meaning.", MARGIN, y + 3);
        y += LINE + 2;
      }
      if (supr.hasLexicalTone) {
        y = ensurePage(doc, y, LINE + 2);
        doc.text("The language is tonal — pitch on a syllable can distinguish words.", MARGIN, y + 3);
        y += LINE + 2;
      }
    }

    const templates = lang.phonology?.phonotactics?.syllableTemplates;
    if (templates?.length && lang.lexicon?.length) {
      y = ensurePage(doc, y, LINE * 2 + 4);
      doc.setFont("times", "normal");
      const exWords = lang.lexicon.slice(0, 3).map((e) => e.orthographicForm).filter(Boolean);
      const syllNote = `Syllables follow the pattern(s): ${templates.join(", ")}. Examples from the vocabulary: ${exWords.join(", ")}.`;
      const syllLines = doc.splitTextToSize(syllNote, CONTENT_W);
      doc.text(syllLines, MARGIN, y + 3);
      y += syllLines.length * LINE + 8;
    }
    y = addRule(doc, y) + 4;
  }

  // ─── Building Words — Morphology ───────────────────────────────────────
  const morph = lang.morphology;
  if (morph?.typology) {
    doc.setFont("times", "normal");
    doc.setFontSize(9);
    doc.setTextColor(80, 80, 78);
    doc.text("BUILDING WORDS", MARGIN, y + 4);
    doc.setTextColor(...INK);
    y += 10;

    const typoDesc: Record<string, string> = {
      analytic: "This language is analytic — meaning grammatical relationships are shown by word order and separate words rather than affixes.",
      agglutinative: "This language is agglutinative — meaning grammatical information is added by attaching affixes to an unchanged root.",
      fusional: "This language is fusional — meaning affixes combine several meanings and may alter the root.",
      polysynthetic: "This language is polysynthetic — meaning words can contain many morphemes and express whole clauses.",
      mixed: "This language uses a mixed morphological system — combining features of the above.",
    };
    const typoLine = typoDesc[morph.typology] ?? `This language is ${morph.typology}.`;
    doc.setFontSize(10);
    const typoLines = doc.splitTextToSize(typoLine, CONTENT_W);
    doc.text(typoLines, MARGIN, y + 4);
    y += typoLines.length * LINE + 6;

    const paradigms = morph.paradigms ?? {};
    const paradigmEntries = Object.entries(paradigms);
    for (const [parName, cells] of paradigmEntries) {
      if (!cells || Object.keys(cells).length === 0) continue;
      y = ensurePage(doc, y, 20);

      doc.setFont("times", "normal");
      doc.setFontSize(9);
      doc.setTextColor(80, 80, 78);
      doc.text(parName.replace(/_/g, " ").toUpperCase(), MARGIN, y + 4);
      doc.setTextColor(...INK);
      y += 8;

      doc.setFontSize(10);
      doc.text("Affix and meaning:", MARGIN, y + 3);
      y += LINE + 2;
      doc.setFont("courier", "normal");
      doc.setFontSize(9);
      for (const [feat, affix] of Object.entries(cells)) {
        y = ensurePage(doc, y, LINE_SMALL + 2);
        doc.text(`${affix || "∅"}  →  ${feat}`, MARGIN + 4, y + 3);
        y += LINE_SMALL + 2;
      }
      const exampleEntry = lang.lexicon.find((e) => e.pos === parName.split("_")[0]);
      if (exampleEntry) {
        y += 2;
        doc.setFont("times", "normal");
        const base = exampleEntry.orthographicForm;
        const firstAffix = Object.values(cells)[0];
        const exampleForm = typeof firstAffix === "string" && firstAffix.startsWith("-")
          ? base + firstAffix.slice(1)
          : typeof firstAffix === "string" && firstAffix.endsWith("-")
          ? firstAffix.slice(0, -1) + base
          : base + (Object.values(cells)[0] ?? "");
        doc.text(`Example: ${base} + affix → ${exampleForm}`, MARGIN, y + 3);
        y += LINE + 4;
      }
      y += 4;
    }
    y = addRule(doc, y) + 4;
  }

  // ─── Sentence Structure ────────────────────────────────────────────────
  const syn = lang.syntax;
  if (syn?.wordOrder) {
    doc.setFont("times", "normal");
    doc.setFontSize(9);
    doc.setTextColor(80, 80, 78);
    doc.text("SENTENCE STRUCTURE", MARGIN, y + 4);
    doc.setTextColor(...INK);
    y += 10;

    const orderDesc: Record<string, string> = {
      SOV: `In ${langName}, sentences follow SOV order — the subject comes first, then the object, then the verb.`,
      SVO: `In ${langName}, sentences follow SVO order — the subject comes first, then the verb, then the object.`,
      VSO: `In ${langName}, sentences follow VSO order — the verb comes first, then the subject, then the object.`,
      VOS: `In ${langName}, sentences follow VOS order — the verb comes first, then the object, then the subject.`,
      OVS: `In ${langName}, sentences follow OVS order — the object comes first, then the verb, then the subject.`,
      OSV: `In ${langName}, sentences follow OSV order — the object comes first, then the subject, then the verb.`,
      free: `In ${langName}, word order is free — grammatical relations are marked by morphology rather than position.`,
    };
    const orderLine = orderDesc[syn.wordOrder] ?? `Sentences follow ${syn.wordOrder} order.`;
    doc.setFontSize(10);
    doc.text(doc.splitTextToSize(orderLine, CONTENT_W), MARGIN, y + 4);
    y += LINE * 2 + 4;

    if (syn.alignment) {
      const alignLine = `Grammatical alignment is ${syn.alignment.replace(/-/g, " ")}.`;
      doc.text(alignLine, MARGIN, y + 3);
      y += LINE + 4;
    }

    const subj = lang.lexicon.find((e) => e.pos === "noun" || e.pos === "pronoun");
    const verb = lang.lexicon.find((e) => e.pos === "verb");
    const obj = lang.lexicon.find((e) => e.pos === "noun");
    if (subj && verb && syn.wordOrder !== "free") {
      const parts = syn.wordOrder.split("");
      const map: Record<string, string> = { S: subj.orthographicForm, V: verb.orthographicForm, O: obj?.orthographicForm ?? "…" };
      const example = parts.map((p) => `[${p === "S" ? "SUBJECT" : p === "V" ? "VERB" : "OBJECT"}] ${map[p] ?? ""}`).join("  ");
      doc.setFont("courier", "normal");
      doc.setFontSize(9);
      doc.text(example, MARGIN, y + 3);
      y += LINE + 6;
      doc.setFont("times", "normal");
    }

    if (syn.adpositionType) {
      const adpLine =
        syn.adpositionType === "preposition"
          ? "Adpositions come before the noun phrase."
          : syn.adpositionType === "postposition"
          ? "Adpositions come after the noun phrase."
          : syn.adpositionType === "both"
          ? "Adpositions may come before or after the noun phrase."
          : "The language does not use adpositions in the usual way.";
      doc.text(adpLine, MARGIN, y + 3);
      y += LINE + 6;
    }

    const clauseTypes = syn.clauseTypes ?? [];
    if (clauseTypes.length > 0) {
      doc.setFontSize(9);
      doc.setTextColor(80, 80, 78);
      doc.text("Clause types", MARGIN, y + 4);
      doc.setTextColor(...INK);
      y += 6;
      doc.setFontSize(10);
      for (const ct of clauseTypes.slice(0, 5)) {
        y = ensurePage(doc, y, LINE + 2);
        doc.text(`• ${ct.replace(/-/g, " ")}`, MARGIN + 4, y + 3);
        y += LINE + 2;
      }
      y += 4;
    }
    y = addRule(doc, y) + 4;
  }

  // ─── Core Vocabulary ───────────────────────────────────────────────────
  const lexicon = lang.lexicon ?? [];
  const VOCAB_GROUPS: { label: string; fields: string[] }[] = [
    { label: "People & Pronouns", fields: ["person", "deixis"] },
    { label: "Numbers", fields: ["number"] },
    { label: "Body", fields: ["body"] },
    { label: "Nature", fields: ["nature", "environment"] },
    { label: "Actions", fields: ["motion", "action"] },
    { label: "States & Qualities", fields: ["quality", "state"] },
    { label: "Grammar Words", fields: ["grammar"] },
  ];
  const maxVocab = 100;
  let vocabCount = 0;
  if (lexicon.length > 0) {
    doc.setFont("times", "normal");
    doc.setFontSize(9);
    doc.setTextColor(80, 80, 78);
    doc.text("VOCABULARY", MARGIN, y + 4);
    doc.setTextColor(...INK);
    y += 10;

    for (const group of VOCAB_GROUPS) {
      const entries = lexicon.filter((e) =>
        (e.semanticFields ?? []).some((f) => group.fields.some((gf) => f.toLowerCase().includes(gf.toLowerCase())))
      );
      const fallback = lexicon.filter((e) => !e.semanticFields?.length && group.fields.includes("grammar"));
      const list = entries.length ? entries : (group.label === "Grammar Words" ? fallback : []);
      if (list.length === 0) continue;
      y = ensurePage(doc, y, 14);

      doc.setFont("times", "normal");
      doc.setFontSize(9);
      doc.text(group.label, MARGIN, y + 4);
      y += 8;

      doc.setFont("courier", "normal");
      doc.setFontSize(9);
      for (const e of list) {
        if (vocabCount >= maxVocab) break;
        y = ensurePage(doc, y, LINE_SMALL + 2);
        const orth = e.orthographicForm ?? "";
        const ipa = (e.phonologicalForm ?? "").replace(/^\/|\/$/g, "");
        const gloss = (e.glosses ?? []).join(", ");
        doc.text(orth, MARGIN, y + 3);
        doc.setTextColor(80, 80, 78);
        doc.text(ipa, MARGIN + 45, y + 3);
        doc.setTextColor(...INK);
        doc.setFont("times", "normal");
        doc.text(gloss, MARGIN + 95, y + 3);
        doc.setFont("courier", "normal");
        y += LINE_SMALL + 2;
        vocabCount++;
      }
      doc.setTextColor(...INK);
      y += 4;
    }
    if (vocabCount < lexicon.length && vocabCount < maxVocab) {
      const rest = lexicon.filter(
        (e) =>
          !VOCAB_GROUPS.some((g) =>
            (e.semanticFields ?? []).some((f) => g.fields.some((gf) => f.toLowerCase().includes(gf.toLowerCase())))
          )
      );
      for (const e of rest) {
        if (vocabCount >= maxVocab) break;
        y = ensurePage(doc, y, LINE_SMALL + 2);
        doc.text(e.orthographicForm ?? "", MARGIN, y + 3);
        doc.setTextColor(80, 80, 78);
        doc.text((e.phonologicalForm ?? "").replace(/^\/|\/$/g, ""), MARGIN + 45, y + 3);
        doc.setTextColor(...INK);
        doc.setFont("times", "normal");
        doc.text((e.glosses ?? []).join(", "), MARGIN + 95, y + 3);
        doc.setFont("courier", "normal");
        y += LINE_SMALL + 2;
        vocabCount++;
      }
    }
    y = addRule(doc, y) + 4;
  }

  // ─── Reading Examples — Corpus ──────────────────────────────────────────
  const corpus = lang.corpus ?? [];
  if (corpus.length > 0) {
    doc.setFont("times", "normal");
    doc.setFontSize(9);
    doc.setTextColor(80, 80, 78);
    doc.text("READING EXAMPLES", MARGIN, y + 4);
    doc.setTextColor(...INK);
    y += 10;

    for (let i = 0; i < corpus.length; i++) {
      const sample = corpus[i]!;
      y = ensurePage(doc, y, 35);

      doc.setFont("times", "italic");
      doc.setFontSize(14);
      const orthLines = doc.splitTextToSize(sample.orthographicText ?? "", CONTENT_W);
      doc.text(orthLines, MARGIN, y + 5);
      y += orthLines.length * 6 + 4;

      if (sample.ipaText) {
        doc.setFont("courier", "normal");
        doc.setFontSize(9);
        doc.setTextColor(80, 80, 78);
        const ipaLines = doc.splitTextToSize(sample.ipaText, CONTENT_W);
        doc.text(ipaLines, MARGIN, y + 3);
        y += ipaLines.length * LINE_SMALL + 2;
        doc.setTextColor(...INK);
      }

      doc.setFont("times", "normal");
      doc.setFontSize(10);
      doc.text(`"${sample.translation ?? ""}"`, MARGIN, y + 4);
      y += LINE + 4;

      const inter = sample.interlinearGloss ?? [];
      if (inter.length > 0) {
        doc.setFont("courier", "normal");
        doc.setFontSize(8);
        for (const line of inter) {
          y = ensurePage(doc, y, LINE_SMALL + 2);
          const word = line.word ?? "";
          const morphs = (line.morphemes ?? []).join("-");
          const glosses = (line.glosses ?? []).join(".");
          doc.text(word, MARGIN, y + 3);
          doc.text(morphs, MARGIN + 40, y + 3);
          doc.text(glosses, MARGIN + 85, y + 3);
          y += LINE_SMALL + 2;
        }
      }
      y += 6;
      if (i < corpus.length - 1) y = addRule(doc, y) + 4;
    }
  }

  // ─── Footers on all pages ───────────────────────────────────────────────
  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    addFooter(doc, langName, p);
  }

  const filename = `${lang.meta.name.toLowerCase().replace(/\s+/g, "-")}-grammar.pdf`;
  doc.save(filename);
}

/** Download language as JSON file (for backup or re-import). */
export function exportJson(lang: Language): void {
  const json = JSON.stringify(lang, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${lang.meta.name.toLowerCase().replace(/\s+/g, "-")}-export.json`;
  a.click();
  URL.revokeObjectURL(url);
}
