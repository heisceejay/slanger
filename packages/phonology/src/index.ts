/**
 * @slanger/phonology — Req #1 + Req #2
 * Phoneme inventory management, phonotactic rule engine,
 * orthography mapper, word-form validator, IPA chart data.
 */
import type {
  PhonologyConfig, PhonemeInventory, Phonotactics, AllophonyRule
} from "@slanger/shared-types";

export interface PhonologyValidationIssue {
  ruleId: string; severity: "error" | "warning"; message: string; entityRef?: string;
}
export interface SyllableParse {
  valid: boolean; matchedTemplate?: string;
  onset: string[]; nucleus: string[]; coda: string[];
}
export interface WordFormValidationResult {
  valid: boolean; syllables: SyllableParse[]; issues: PhonologyValidationIssue[];
}
export interface IpaChartData {
  consonantChart: ConsonantCell[][]; vowelChart: VowelCell[]; tones: string[];
}
export interface ConsonantCell {
  place: string; manner: string; ipa: string | null; inInventory: boolean;
}
export interface VowelCell {
  ipa: string; height: "close"|"close-mid"|"mid"|"open-mid"|"open";
  backness: "front"|"central"|"back"; rounded: boolean; inInventory: boolean;
}
export interface OrthographyValidationResult {
  bijective: boolean; missingPhonemes: string[]; unusedGraphemes: string[]; conflicts: string[];
}

// IPA reference grids
const CONSONANT_GRID = [
  {ipa:"p",place:"bilabial",manner:"plosive"},{ipa:"b",place:"bilabial",manner:"plosive"},
  {ipa:"m",place:"bilabial",manner:"nasal"},{ipa:"ɸ",place:"bilabial",manner:"fricative"},
  {ipa:"β",place:"bilabial",manner:"fricative"},{ipa:"f",place:"labiodental",manner:"fricative"},
  {ipa:"v",place:"labiodental",manner:"fricative"},{ipa:"ʋ",place:"labiodental",manner:"approximant"},
  {ipa:"θ",place:"dental",manner:"fricative"},{ipa:"ð",place:"dental",manner:"fricative"},
  {ipa:"t",place:"alveolar",manner:"plosive"},{ipa:"d",place:"alveolar",manner:"plosive"},
  {ipa:"n",place:"alveolar",manner:"nasal"},{ipa:"s",place:"alveolar",manner:"fricative"},
  {ipa:"z",place:"alveolar",manner:"fricative"},{ipa:"r",place:"alveolar",manner:"trill"},
  {ipa:"ɾ",place:"alveolar",manner:"tap"},{ipa:"l",place:"alveolar",manner:"lateral-approx"},
  {ipa:"ɬ",place:"alveolar",manner:"lateral-fricative"},
  {ipa:"ʃ",place:"post-alveolar",manner:"fricative"},{ipa:"ʒ",place:"post-alveolar",manner:"fricative"},
  {ipa:"tʃ",place:"post-alveolar",manner:"affricate"},{ipa:"dʒ",place:"post-alveolar",manner:"affricate"},
  {ipa:"ʈ",place:"retroflex",manner:"plosive"},{ipa:"ɖ",place:"retroflex",manner:"plosive"},
  {ipa:"ɳ",place:"retroflex",manner:"nasal"},{ipa:"ɭ",place:"retroflex",manner:"lateral-approx"},
  {ipa:"c",place:"palatal",manner:"plosive"},{ipa:"ɟ",place:"palatal",manner:"plosive"},
  {ipa:"ɲ",place:"palatal",manner:"nasal"},{ipa:"j",place:"palatal",manner:"approximant"},
  {ipa:"k",place:"velar",manner:"plosive"},{ipa:"g",place:"velar",manner:"plosive"},
  {ipa:"ŋ",place:"velar",manner:"nasal"},{ipa:"x",place:"velar",manner:"fricative"},
  {ipa:"ɣ",place:"velar",manner:"fricative"},{ipa:"w",place:"velar",manner:"approximant"},
  {ipa:"q",place:"uvular",manner:"plosive"},{ipa:"ʀ",place:"uvular",manner:"trill"},
  {ipa:"χ",place:"uvular",manner:"fricative"},{ipa:"ʁ",place:"uvular",manner:"fricative"},
  {ipa:"ħ",place:"pharyngeal",manner:"fricative"},{ipa:"ʕ",place:"pharyngeal",manner:"fricative"},
  {ipa:"ʔ",place:"glottal",manner:"plosive"},{ipa:"h",place:"glottal",manner:"fricative"},
  {ipa:"ǀ",place:"click",manner:"click"},{ipa:"ǃ",place:"click",manner:"click"},
];

const VOWEL_GRID: VowelCell[] = [
  {ipa:"i",height:"close",backness:"front",rounded:false,inInventory:false},
  {ipa:"y",height:"close",backness:"front",rounded:true,inInventory:false},
  {ipa:"ɨ",height:"close",backness:"central",rounded:false,inInventory:false},
  {ipa:"u",height:"close",backness:"back",rounded:true,inInventory:false},
  {ipa:"ɯ",height:"close",backness:"back",rounded:false,inInventory:false},
  {ipa:"e",height:"close-mid",backness:"front",rounded:false,inInventory:false},
  {ipa:"ø",height:"close-mid",backness:"front",rounded:true,inInventory:false},
  {ipa:"ə",height:"mid",backness:"central",rounded:false,inInventory:false},
  {ipa:"o",height:"close-mid",backness:"back",rounded:true,inInventory:false},
  {ipa:"ɛ",height:"open-mid",backness:"front",rounded:false,inInventory:false},
  {ipa:"œ",height:"open-mid",backness:"front",rounded:true,inInventory:false},
  {ipa:"ɔ",height:"open-mid",backness:"back",rounded:true,inInventory:false},
  {ipa:"æ",height:"open-mid",backness:"front",rounded:false,inInventory:false},
  {ipa:"ɪ",height:"close-mid",backness:"front",rounded:false,inInventory:false},
  {ipa:"ʊ",height:"close-mid",backness:"back",rounded:true,inInventory:false},
  {ipa:"a",height:"open",backness:"front",rounded:false,inInventory:false},
  {ipa:"ɑ",height:"open",backness:"back",rounded:false,inInventory:false},
  {ipa:"ɒ",height:"open",backness:"back",rounded:true,inInventory:false},
];

// ─── Inventory validation ─────────────────────────────────────────────────────

export function validateInventory(inv: PhonemeInventory): PhonologyValidationIssue[] {
  const issues: PhonologyValidationIssue[] = [];
  if (inv.consonants.length === 0)
    issues.push({ruleId:"PHON_001",severity:"error",message:"Inventory must contain at least one consonant."});
  if (inv.vowels.length === 0)
    issues.push({ruleId:"PHON_002",severity:"error",message:"Inventory must contain at least one vowel."});
  if (inv.vowels.length === 1)
    issues.push({ruleId:"PHON_003",severity:"warning",message:"Single-vowel languages are extremely rare and may cause phonotactic problems."});
  const seen = new Set<string>();
  for (const ph of [...inv.consonants,...inv.vowels,...inv.tones]) {
    if (seen.has(ph)) issues.push({ruleId:"PHON_004",severity:"error",message:`Duplicate phoneme: "${ph}".`,entityRef:ph});
    seen.add(ph);
  }
  return issues;
}

// ─── Orthography ──────────────────────────────────────────────────────────────

export function validateOrthography(inv: PhonemeInventory, orth: Record<string,string>): OrthographyValidationResult {
  const all = [...inv.consonants,...inv.vowels];
  const missing = all.filter(ph => !(ph in orth));
  const invSet = new Set(all);
  const unused = Object.keys(orth).filter(ph => !invSet.has(ph));
  const g2p = new Map<string,string[]>();
  for (const [ph,g] of Object.entries(orth)) {
    if (!g2p.has(g)) g2p.set(g,[]);
    g2p.get(g)!.push(ph);
  }
  const conflicts = [...g2p.entries()].filter(([,ps])=>ps.length>1).map(([g,ps])=>`"${g}" ← ${ps.join(", ")}`);
  return {bijective:missing.length===0&&unused.length===0&&conflicts.length===0,missingPhonemes:missing,unusedGraphemes:unused,conflicts};
}

// ─── Word-form validation ─────────────────────────────────────────────────────

export function validateWordForm(form: string, phonotactics: Phonotactics, inventory: PhonemeInventory): WordFormValidationResult {
  const issues: PhonologyValidationIssue[] = [];
  const cleaned = form.replace(/^\/|\/$/g,"").replace(/\./g,"").trim();
  if (!cleaned) return {valid:false,syllables:[],issues:[{ruleId:"PHON_010",severity:"error",message:"Empty word form.",entityRef:form}]};
  const consonantSet = new Set(inventory.consonants);
  const vowelSet = new Set(inventory.vowels);
  const tokens = tokenizeIpa(cleaned,[...inventory.consonants,...inventory.vowels]);
  if (!tokens) return {valid:false,syllables:[],issues:[{ruleId:"PHON_011",severity:"error",message:`"${form}" contains symbols not in the inventory.`,entityRef:form}]};
  const rawSylls = syllabify(tokens,consonantSet,vowelSet);
  const syllables: SyllableParse[] = [];
  for (const {onset,nucleus,coda} of rawSylls) {
    const tmplStr = buildTemplateString(onset,nucleus,coda,consonantSet,vowelSet);
    const matched = matchTemplate(tmplStr,phonotactics.syllableTemplates);
    if (!matched) {
      issues.push({ruleId:"PHON_012",severity:"error",
        message:`Syllable "${[...onset,...nucleus,...coda].join("")}" (pattern:${tmplStr}) doesn't match templates: [${phonotactics.syllableTemplates.join(", ")}].`,entityRef:form});
      syllables.push({valid:false,onset,nucleus,coda});
    } else {
      syllables.push({valid:true,matchedTemplate:matched,onset,nucleus,coda});
    }
    if (onset.length>1) {
      const cs = onset.join(",");
      if (!phonotactics.onsetClusters.some(c=>c.join(",")===cs))
        issues.push({ruleId:"PHON_013",severity:"error",message:`Onset cluster /${onset.join("")}/ not permitted.`,entityRef:form});
    }
    if (coda.length>1) {
      const cs = coda.join(",");
      if (!phonotactics.codaClusters.some(c=>c.join(",")===cs))
        issues.push({ruleId:"PHON_014",severity:"error",message:`Coda cluster /${coda.join("")}/ not permitted.`,entityRef:form});
    }
  }
  return {valid:issues.length===0,syllables,issues};
}

export function applyAllophony(tokens: string[], rules: AllophonyRule[], inventory: PhonemeInventory): string[] {
  const vowelSet = new Set(inventory.vowels);
  const result = [...tokens];
  for (let i=0;i<result.length;i++) {
    const ph = result[i]!;
    for (const rule of rules) {
      if (rule.phoneme!==ph) continue;
      const isOnset = i===0||vowelSet.has(result[i-1]??"");
      const isCoda = i===result.length-1||vowelSet.has(result[i+1]??"");
      if (!rule.position||(rule.position==="onset"&&isOnset)||(rule.position==="coda"&&isCoda)) {
        result[i]=rule.allophone; break;
      }
    }
  }
  return result;
}

export function phonemesToOrthography(phonemes: string[], orth: Record<string,string>): string {
  return phonemes.map(ph=>orth[ph]??ph).join("");
}

export function generateIpaChartData(inventory: PhonemeInventory): IpaChartData {
  const invC = new Set(inventory.consonants);
  const invV = new Set(inventory.vowels);
  const places = [...new Set(CONSONANT_GRID.map(e=>e.place))];
  const manners = [...new Set(CONSONANT_GRID.map(e=>e.manner))];
  const grid = manners.map(manner=>
    places.map(place=>{
      const entry = CONSONANT_GRID.find(e=>e.place===place&&e.manner===manner);
      return {place,manner,ipa:entry?.ipa??null,inInventory:entry?invC.has(entry.ipa):false};
    })
  );
  const vowelChart = VOWEL_GRID.map(v=>({...v,inInventory:invV.has(v.ipa)}));
  return {consonantChart:grid,vowelChart,tones:inventory.tones};
}

export function validatePhonologyConfig(config: PhonologyConfig): PhonologyValidationIssue[] {
  const issues: PhonologyValidationIssue[] = [...validateInventory(config.inventory)];
  const o = validateOrthography(config.inventory,config.orthography);
  for (const ph of o.missingPhonemes) issues.push({ruleId:"PHON_020",severity:"error",message:`Phoneme /${ph}/ has no orthographic mapping.`,entityRef:ph});
  for (const g of o.unusedGraphemes) issues.push({ruleId:"PHON_021",severity:"warning",message:`Orthography key "${g}" is not in the inventory.`,entityRef:g});
  for (const c of o.conflicts) issues.push({ruleId:"PHON_022",severity:"warning",message:`Orthography conflict (multiple phonemes → same grapheme): ${c}. Allowed but prefer unique graphemes.`,entityRef:c});
  if (config.phonotactics.syllableTemplates.length===0)
    issues.push({ruleId:"PHON_031",severity:"error",message:"At least one syllable template is required."});
  const invSet = new Set([...config.inventory.consonants,...config.inventory.vowels]);
  for (const cluster of [...config.phonotactics.onsetClusters,...config.phonotactics.codaClusters])
    for (const ph of cluster)
      if (!invSet.has(ph)) issues.push({ruleId:"PHON_032",severity:"error",message:`Cluster member /${ph}/ not in inventory.`,entityRef:ph});
  for (const rule of config.phonotactics.allophonyRules)
    if (!invSet.has(rule.phoneme)) issues.push({ruleId:"PHON_040",severity:"error",message:`Allophony rule references unknown phoneme /${rule.phoneme}/.`,entityRef:rule.phoneme});
  return issues;
}

// ─── Internals ────────────────────────────────────────────────────────────────

function tokenizeIpa(form: string, inventory: string[]): string[]|null {
  const sorted = [...inventory].sort((a,b)=>b.length-a.length);
  const tokens: string[] = [];
  let i=0;
  while (i<form.length) {
    if (form[i]==="."||form[i]===" "){i++;continue;}
    let matched=false;
    for (const ph of sorted) {
      if (form.startsWith(ph,i)){tokens.push(ph);i+=ph.length;matched=true;break;}
    }
    if (!matched) return null;
  }
  return tokens;
}

interface RawSyll {onset:string[];nucleus:string[];coda:string[];}

function syllabify(tokens: string[], consonants: Set<string>, vowels: Set<string>): RawSyll[] {
  const sylls: RawSyll[] = [];
  let cur: RawSyll = {onset:[],nucleus:[],coda:[]};
  let inNuc=false;
  for (let i=0;i<tokens.length;i++) {
    const t=tokens[i]!;
    if (vowels.has(t)) {
      if (inNuc){sylls.push(cur);cur={onset:[],nucleus:[t],coda:[]};}
      else{cur.nucleus.push(t);inNuc=true;}
    } else {
      if (!inNuc){cur.onset.push(t);}
      else {
        const nextV=i+1<tokens.length&&vowels.has(tokens[i+1]!);
        if (nextV&&cur.nucleus.length>0){sylls.push(cur);cur={onset:[t],nucleus:[],coda:[]};inNuc=false;}
        else{cur.coda.push(t);}
      }
    }
  }
  if (cur.nucleus.length>0||cur.onset.length>0) sylls.push(cur);
  return sylls;
}

function buildTemplateString(onset:string[],nucleus:string[],coda:string[],c:Set<string>,v:Set<string>):string{
  return onset.map(p=>c.has(p)?"C":"?").join("")+nucleus.map(p=>v.has(p)?"V":"?").join("")+coda.map(p=>c.has(p)?"C":"?").join("");
}

function matchTemplate(tmplStr:string,allowed:string[]):string|null{
  for (const t of allowed){
    const s=t.replace(/[()]/g,"");
    if (s===tmplStr||isSubsetOfOptional(tmplStr,t)) return t;
  }
  return null;
}

function isSubsetOfOptional(concrete:string,template:string):boolean{
  return expandOptional(template).includes(concrete);
}

function expandOptional(template:string):string[]{
  const m=/\(([^)]+)\)/.exec(template);
  if (!m) return [template];
  const before=template.slice(0,m.index),inside=m[1]!,after=template.slice(m.index+m[0].length);
  return [...new Set([...expandOptional(before+after),...expandOptional(before+inside+after)])];
}
