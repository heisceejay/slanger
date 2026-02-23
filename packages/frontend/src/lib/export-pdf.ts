/**
 * Client-side PDF export: grammar reference document.
 * Styled to match app aesthetic (--paper, --ink, serif/mono).
 * Uses a custom table renderer for a clean, structure look.
 */

import { jsPDF } from "jspdf";
import type { Language } from "./api";

const MARGIN = 20;
const PAGE_W = 210;
const PAGE_H = 297;
const CONTENT_W = PAGE_W - MARGIN * 2;
const PAPER = [245, 245, 240] as const;
const INK = [26, 26, 24] as const;
const RULE = [200, 200, 195] as const; // Lighter gray for rules

const IPA_TO_ENGLISH: Record<string, string> = {
  p: "like p in spin", b: "like b in bin", t: "like t in stop", d: "like d in dog",
  k: "like k in sky", g: "like g in go", m: "like m in map", n: "like n in no",
  ŋ: "like ng in sing", f: "like f in fan", v: "like v in van", s: "like s in see",
  z: "like z in zoo", ʃ: "like sh in shop", ʒ: "like s in measure", h: "like h in hat",
  r: "trilled or like red", l: "like l in lip", j: "like y in yes", w: "like w in we",
  tʃ: "like ch in chip", dʒ: "like j in jump", θ: "like th in think", ð: "like th in this",
  x: "like ch in loch", i: "like ee in see", e: "like e in bed", a: "like a in father",
  o: "like o in go", u: "like oo in boot", ɪ: "like i in sit", ʊ: "like oo in book",
  ɛ: "like e in bed", ɔ: "like aw in saw", æ: "like a in cat", ə: "like a in about",
  ɑ: "like a in father",
};

function defaultIpaDescription(symbol: string): string {
  return IPA_TO_ENGLISH[symbol] ?? `IPA symbol /${symbol}/`;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function ensurePage(doc: jsPDF, y: number, needed: number): number {
  if (y + needed > PAGE_H - MARGIN) {
    doc.addPage();
    drawBackground(doc);
    return MARGIN + 10;
  }
  return y;
}

function drawBackground(doc: jsPDF) {
  doc.setFillColor(...PAPER);
  doc.rect(0, 0, PAGE_W, PAGE_H, "F");
  doc.setTextColor(...INK);
}

function addLabel(doc: jsPDF, text: string, y: number): number {
  doc.setFont("times", "normal");
  doc.setFontSize(9);
  doc.setTextColor(110, 110, 105);
  doc.text(text.toUpperCase(), MARGIN, y + 4);
  doc.setTextColor(...INK);
  return y + 10;
}

function addHeader(doc: jsPDF, text: string, y: number): number {
  doc.setFont("times", "italic");
  doc.setFontSize(22);
  doc.text(text, MARGIN, y + 8);
  return y + 16;
}

interface TableCol {
  header: string;
  width: number;
  align?: "left" | "center" | "right";
  font?: "times" | "courier";
}

function drawTable(
  doc: jsPDF,
  y: number,
  cols: TableCol[],
  rows: string[][]
): number {
  let curY = y;
  const rowH = 7;

  // Headers
  doc.setFillColor(235, 235, 230);
  doc.rect(MARGIN, curY, CONTENT_W, rowH, "F");
  doc.setDrawColor(...RULE);
  doc.line(MARGIN, curY, MARGIN + CONTENT_W, curY);
  doc.line(MARGIN, curY + rowH, MARGIN + CONTENT_W, curY + rowH);

  doc.setFont("times", "bold");
  doc.setFontSize(9);
  let curX = MARGIN;
  cols.forEach(col => {
    const x = col.align === "center" ? curX + col.width / 2 : col.align === "right" ? curX + col.width - 2 : curX + 2;
    doc.text(col.header, x, curY + 5, { align: col.align || "left" });
    curX += col.width;
  });
  curY += rowH;

  // Rows
  rows.forEach((row, idx) => {
    curY = ensurePage(doc, curY, rowH);
    if (idx % 2 === 1) {
      doc.setFillColor(242, 242, 238);
      doc.rect(MARGIN, curY, CONTENT_W, rowH, "F");
    }

    curX = MARGIN;
    row.forEach((cell, i) => {
      const col = cols[i]!;
      doc.setFont(col.font || "times", "normal");
      doc.setFontSize(9);
      const x = col.align === "center" ? curX + col.width / 2 : col.align === "right" ? curX + col.width - 2 : curX + 2;
      doc.text(cell, x, curY + 5, { align: col.align || "left" });
      curX += col.width;
    });

    doc.setDrawColor(...RULE);
    doc.line(MARGIN, curY + rowH, MARGIN + CONTENT_W, curY + rowH);
    curY += rowH;
  });

  return curY + 5;
}

function addFooter(doc: jsPDF, langName: string, pageNum: number): void {
  doc.setFont("courier", "normal");
  doc.setFontSize(8);
  doc.setTextColor(150, 150, 145);
  doc.text(`${langName} · Grammar Resource`, MARGIN, PAGE_H - 10);
  doc.text(`Page ${pageNum}`, PAGE_W - MARGIN, PAGE_H - 10, { align: "right" });
}

// ─── Main Export ──────────────────────────────────────────────────────────────

export function exportPdf(lang: Language): void {
  const doc = new jsPDF({ orientation: "p", unit: "mm", format: "a4" });
  drawBackground(doc);
  let y = MARGIN;
  const langName = lang.meta.name;

  // 1. Cover
  doc.setFont("times", "italic");
  doc.setFontSize(36);
  doc.text(langName, MARGIN, y + 15);
  y += 30;

  doc.setFont("times", "normal");
  doc.setFontSize(12);
  const worldText = lang.meta.world || "A constructed language for a unique world.";
  const worldLines = doc.splitTextToSize(worldText, CONTENT_W);
  doc.text(worldLines, MARGIN, y);
  y += worldLines.length * 6 + 10;

  if (lang.meta.tags?.length) {
    doc.setFontSize(10);
    doc.setTextColor(100, 100, 95);
    doc.text(`Tags: ${lang.meta.tags.join(", ")}`, MARGIN, y);
    y += 10;
  }

  doc.setDrawColor(...INK);
  doc.setLineWidth(0.5);
  doc.line(MARGIN, y, PAGE_W - MARGIN, y);
  y += 15;

  doc.setFontSize(11);
  doc.setTextColor(...INK);
  doc.text("Official Grammar & Lexicon Reference", MARGIN, y);
  y += 10;
  doc.text(`Generated on ${new Date().toLocaleDateString()}`, MARGIN, y);

  doc.addPage();
  drawBackground(doc);
  y = MARGIN;

  // 2. Phonology
  y = addLabel(doc, "Phonology & Writing", y);
  y = addHeader(doc, "Sound System", y);

  const phonDesc = `The sound system of ${langName} is designed for ${lang.meta.naturalismScore > 0.6 ? "naturalistic realism" : "clarity and expressiveness"}.`;
  doc.setFontSize(10);
  const phonLines = doc.splitTextToSize(phonDesc, CONTENT_W);
  doc.text(phonLines, MARGIN, y);
  y += phonLines.length * 5 + 8;

  const inv = lang.phonology.inventory;
  const orth = lang.phonology.orthography;
  const symbols = [...inv.consonants, ...inv.vowels];

  if (symbols.length > 0) {
    const phonCols: TableCol[] = [
      { header: "Symbol", width: 30, align: "center", font: "courier" },
      { header: "IPA", width: 30, align: "center", font: "courier" },
      { header: "English Approximate", width: CONTENT_W - 60 }
    ];
    const phonRows = symbols.map(ph => [
      orth[ph] || ph,
      `/${ph}/`,
      defaultIpaDescription(ph)
    ]);
    y = drawTable(doc, y, phonCols, phonRows);
  }

  // 3. Morphology
  y = ensurePage(doc, y, 40);
  y = addLabel(doc, "Morphology", y);
  y = addHeader(doc, "Word Structure", y);

  const morphDesc = `Typologically, this language is ${lang.morphology.typology}. Morphemes are typically ordered as: ${lang.morphology.morphemeOrder.join(" + ")}.`;
  doc.setFontSize(10);
  const morphLines = doc.splitTextToSize(morphDesc, CONTENT_W);
  doc.text(morphLines, MARGIN, y);
  y += morphLines.length * 5 + 8;

  const paradigms = Object.entries(lang.morphology.paradigms);
  for (const [name, cells] of paradigms) {
    if (Object.keys(cells).length === 0) continue;
    y = ensurePage(doc, y, 30);
    doc.setFont("times", "bold");
    doc.setFontSize(10);
    doc.text(name.replace(/_/g, " ").toUpperCase(), MARGIN, y);
    y += 5;

    const parCols: TableCol[] = [
      { header: "Feature", width: 60 },
      { header: "Affix", width: 50, font: "courier" },
      { header: "Example", width: CONTENT_W - 110 }
    ];

    // Find a sample word for this POS to show examples
    const pos = name.split("_")[0];
    const sample = lang.lexicon.find(e => e.pos === pos);

    const parRows = Object.entries(cells).map(([feat, affix]) => {
      let example = "—";
      if (sample) {
        const cleanAffix = affix.replace(/^-|-$/g, "");
        example = affix.startsWith("-") ? sample.orthographicForm + cleanAffix : cleanAffix + sample.orthographicForm;
      }
      return [feat, affix || "∅", example];
    });

    y = drawTable(doc, y, parCols, parRows);
  }

  // 4. Syntax
  y = ensurePage(doc, y, 40);
  y = addLabel(doc, "Syntax", y);
  y = addHeader(doc, "Sentence Structure", y);

  const syn = lang.syntax;
  const synDesc = `The basic word order is ${syn.wordOrder}. The language uses ${syn.adpositionType}s and exhibits ${syn.alignment.replace("-", " ")} alignment.`;
  doc.setFontSize(10);
  const synLines = doc.splitTextToSize(synDesc, CONTENT_W);
  doc.text(synLines, MARGIN, y);
  y += synLines.length * 5 + 8;

  // 5. Lexicon
  doc.addPage();
  drawBackground(doc);
  y = MARGIN;
  y = addLabel(doc, "Lexicon", y);
  y = addHeader(doc, "Core Vocabulary", y);

  const lexCols: TableCol[] = [
    { header: "Word", width: 45, font: "courier" },
    { header: "IPA", width: 45, font: "courier" },
    { header: "Function", width: 30, align: "center" },
    { header: "Meaning / Gloss", width: CONTENT_W - 120 }
  ];

  const lexRows = lang.lexicon.slice(0, 150).map(e => [
    e.orthographicForm,
    `/${e.phonologicalForm.replace(/^\/|\/$/g, "")}/`,
    e.pos,
    e.glosses.join(", ")
  ]);

  y = drawTable(doc, y, lexCols, lexRows);

  // 6. Corpus
  if (lang.corpus.length > 0) {
    doc.addPage();
    drawBackground(doc);
    y = MARGIN;
    y = addLabel(doc, "Corpus", y);
    y = addHeader(doc, "Sample Texts", y);

    for (const sample of lang.corpus) {
      y = ensurePage(doc, y, 40);
      doc.setFont("times", "italic");
      doc.setFontSize(14);
      const textLines = doc.splitTextToSize(sample.orthographicText, CONTENT_W);
      doc.text(textLines, MARGIN, y + 5);
      y += textLines.length * 7 + 5;

      doc.setFont("courier", "normal");
      doc.setFontSize(9);
      doc.setTextColor(110, 110, 105);
      doc.text(`/${sample.ipaText}/`, MARGIN, y);
      y += 6;

      doc.setFont("times", "normal");
      doc.setFontSize(10);
      doc.setTextColor(...INK);
      doc.text(`"${sample.translation}"`, MARGIN, y);
      y += 12;

      // Inline interlinear if available
      if (sample.interlinearGloss?.length) {
        const intCols: TableCol[] = [
          { header: "Word", width: 40, font: "courier" },
          { header: "Analysis", width: 60, font: "courier" },
          { header: "Gloss", width: CONTENT_W - 100 }
        ];
        const intRows = sample.interlinearGloss.map(line => [
          line.word,
          line.morphemes.join("-"),
          line.glosses.join(".")
        ]);
        y = drawTable(doc, y, intCols, intRows);
        y += 5;
      }
    }
  }

  // 7. Final Footer Pass
  const totalSlots = doc.getNumberOfPages();
  for (let i = 1; i <= totalSlots; i++) {
    doc.setPage(i);
    addFooter(doc, langName, i);
  }

  const filename = `${langName.toLowerCase().replace(/\s+/g, "-")}-grammar.pdf`;
  doc.save(filename);
}

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
