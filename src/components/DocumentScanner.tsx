import React, { useState, useRef, useCallback } from "react";
import { formatCaseTitle } from "../utils/caseTitle";
import { generateOfficeReportUrl, generateLastOrderUrl } from "../services/eCourtsService";

// ─────────────────────────────────────────────────────────────────────────────
// TYPE DEFINITIONS
// ─────────────────────────────────────────────────────────────────────────────
interface ExtractedFields {
  diaryNo?: string;
  diaryYear?: string;
  caseType?: string;
  cnr?: string;
  caseNumber?: string;
  courtName?: string;
  courtNumber?: string;
  petitioner?: string;
  respondent?: string;
  advocates?: string[];
  dateOfFiling?: string;
  allDates?: string[];
  judges?: string[];
  timeOfSitting?: string;
  status?: string;
  jurisdiction?: string;
  docType?: string;
}

interface CaseResult {
  diaryNo?: string;
  diaryYear?: string;
  parties?: string;
  caseNumber?: string;
  cnr?: string;
  filed?: string;
  lastListedOn?: string;
  caseStatusBadge?: string;
  petitioner?: string;
  respondent?: string;
  petitionerAdvocates?: string | null;
  respondentAdvocates?: string;
  status?: string;
  [key: string]: unknown;
}

interface SavedCase {
  diaryNumber?: string | number;
  diaryNo?: string | number;
  diaryYear?: string | number;
  cnrNumber?: string;
  caseNumber?: string;
  petitioners?: string[];
  [key: string]: unknown;
}

interface StatusStyle {
  bg: string;
  color: string;
  border: string;
}

declare global {
  interface Window {
    Tesseract: {
      createWorker: (lang: string, oem: number, options: { logger: (m: { status: string; progress: number }) => void }) => Promise<{
        recognize: (src: string) => Promise<{ data: { text: string } }>;
        terminate: () => Promise<void>;
      }>;
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PDF DECODER — handles FlateDecode + CIDFont CMap (Supreme Court PDF format)
// ─────────────────────────────────────────────────────────────────────────────
async function decompressChunk(uint8Array: Uint8Array): Promise<string | null> {
  try {
    const ds = new DecompressionStream("deflate");
    const writer = ds.writable.getWriter();
    const reader = ds.readable.getReader();
    writer.write(new Uint8Array(uint8Array)); writer.close();
    const chunks = [];
    while (true) { const { done, value } = await reader.read(); if (done) break; chunks.push(value); }
    const total = chunks.reduce((n, c) => n + c.length, 0);
    const out = new Uint8Array(total); let off = 0;
    for (const c of chunks) { out.set(c, off); off += c.length; }
    return new TextDecoder("latin1").decode(out);
  } catch { return null; }
}

function buildCMap(text: string): Record<number, string> {
  const m: Record<number, string> = {}, rx = /<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g; let r;
  while ((r = rx.exec(text))) { const g = parseInt(r[1],16), u = parseInt(r[2],16); if (u>0) m[g] = String.fromCodePoint(u); }
  return m;
}

function decodeTJ(tjContent: string, cmap: Record<number, string>): string {
  let t = "";
  for (const [, hex] of tjContent.matchAll(/<([0-9A-Fa-f]*)>/g))
    for (let i = 0; i < hex.length; i += 2) t += cmap[parseInt(hex.slice(i,i+2),16)] ?? "";
  return t;
}

async function extractTextFromPDF(arrayBuffer: ArrayBuffer): Promise<string> {
  try {
    const bytes = new Uint8Array(arrayBuffer);
    let raw = ""; for (let i = 0; i < bytes.length; i++) raw += String.fromCharCode(bytes[i]);
    const streamRx = /<<([^>]*)>>\s*stream\r?\n([\s\S]*?)\r?\nendstream/g;
    const streams = []; let sm;
    while ((sm = streamRx.exec(raw))) streams.push({ meta: sm[1], raw: sm[2] });
    const decompressed = await Promise.all(streams.map(async s => {
      if (!s.meta.includes("FlateDecode")) return s.raw;
      const idx = raw.indexOf(s.raw);
      return await decompressChunk(bytes.slice(idx, idx + s.raw.length)) ?? "";
    }));
    const cmaps: Record<number, Record<number, string>> = {}; let fi = 0;
    for (const t of decompressed) { if (t.includes("begincmap") && t.includes("beginbfchar")) { cmaps[fi] = buildCMap(t); fi++; } }
    const words = [];
    for (const t of decompressed) {
      if (!t.includes("BT")) continue;
      let ci = 0;
      for (const line of t.split("\n")) {
        const fm = line.match(/\/F(\d+)\s+[\d.]+\s+Tf/); if (fm) ci = parseInt(fm[1])-1;
        const cmap: Record<number, string> = cmaps[ci] ?? cmaps[0] ?? {};
        const tj = line.match(/\[([\s\S]*?)\]\s*TJ/); if (tj) { const d = decodeTJ(tj[1],cmap); if (d.trim()) words.push(d.trim()); }
        const ts = line.match(/\(([^)]*)\)\s*Tj/); if (ts) { const d = ts[1].replace(/[^\x20-\x7E]/g,"").trim(); if (d) words.push(d); }
      }
    }
    return words.join(" ");
  } catch { return ""; }
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPREHENSIVE FIELD EXTRACTOR
// ─────────────────────────────────────────────────────────────────────────────
function extractAllFields(text: string): ExtractedFields {
  const t = text.replace(/\s+/g, " ").trim();
  const fields: ExtractedFields = {};

  const casePatterns = [
    { rx: /diary\s*(?:no\.?|number)?\s*[:\-]?\s*(\d{1,6})\s*[\/\-]\s*(20\d{2})/i,              label: "Diary No" },
    { rx: /d\.?\s*no\.?\s*[:\-]?\s*(\d{1,6})\s*[\/\-]\s*(20\d{2})/i,                           label: "Diary No" },
    { rx: /interlocutory\s*application\s*no\.?\s*[:\-]?\s*(\d{1,6})\s*[\/\-]\s*(20\d{2})/i,    label: "IA No" },
    { rx: /i\.?\s*a\.?\s*no\.?\s*[:\-]?\s*(\d{1,6})\s*[\/\-]\s*(20\d{2})/i,                   label: "IA No" },
    { rx: /civil\s*appeal\s*nos?\.?\s*[:\-]?\s*(\d{4,6})[\s\-\d]*(?:of|\/)\s*(20\d{2})/i,     label: "CA No" },
    { rx: /c\.?\s*a\.?\s*nos?\.?\s*[:\-]?\s*(\d{4,6})[\s\-\d]*(?:of|\/)\s*(20\d{2})/i,       label: "CA No" },
    { rx: /w\.?\s*p\.?\s*\(?[a-z]*\)?\s*no\.?\s*[:\-]?\s*(\d{1,6})\s*[\/\-]\s*(20\d{2})/i,   label: "WP No" },
    { rx: /s\.?\s*l\.?\s*p\.?\s*\(?[a-z]*\)?\s*no\.?\s*[:\-]?\s*(\d{1,6})\s*[\/\-]\s*(20\d{2})/i, label: "SLP No" },
    { rx: /t\.?\s*p\.?\s*\(?[a-z]*\)?\s*no\.?\s*[:\-]?\s*(\d{1,6})\s*[\/\-]\s*(20\d{2})/i,   label: "TP No" },
    { rx: /\b(\d{4,6})\s*\/\s*(20\d{2})\b/,                                                     label: "Case No" },
  ];
  for (const { rx, label } of casePatterns) {
    const m = t.match(rx);
    if (m) { fields.diaryNo = m[1]; fields.diaryYear = m[2]; fields.caseType = label; break; }
  }

  const cnr = t.match(/\bSCIN\d{12,}\b|\bCNR\s*[:\-]?\s*([A-Z0-9]{15,})/i);
  if (cnr) fields.cnr = cnr[0].replace(/^CNR\s*[:\-]?\s*/i,"").trim();

  const caseNum = t.match(/\b(W\.P\.\([A-Z]+\)|SLP\([A-Z]+\)|C\.A\.|T\.P\.\([A-Z]+\)|MA|OP|Writ)\s*(?:No\.?\s*)?[\d\/\-]+(?:\s*of\s*\d{4})?/i);
  if (caseNum) fields.caseNumber = caseNum[0].trim();

  if (/supreme\s*court\s*of\s*india/i.test(t)) fields.courtName = "Supreme Court of India";
  else if (/high\s*court\s*of\s*([a-z\s]+)/i.test(t)) fields.courtName = t.match(/high\s*court\s*of\s*([a-z\s]+)/i)?.[0];

  const courtNo = t.match(/court\s*(?:no\.?|number)\s*[:\-]?\s*(\d+)/i);
  if (courtNo) fields.courtNumber = `Court No. ${courtNo[1]}`;

  const petMatch = t.match(/([A-Z][A-Z\s&.,]+?)\s*(?:\.{3}Appellant|\.{3}Petitioner)/);
  if (petMatch) fields.petitioner = petMatch[1].trim();
  else {
    const vs = t.match(/([A-Z][A-Z\s&.,]+?)\s+(?:v\.|vs\.?|versus)\s+([A-Z][A-Z\s&.,]+)/);
    if (vs) { fields.petitioner = vs[1].trim(); fields.respondent = vs[2].trim(); }
  }

  if (!fields.respondent) {
    const resMatch = t.match(/(?:VERSUS|vs\.?)\s*([A-Z][A-Z\s&.,]+?)\s*(?:\.{3}Respondent|OFFICE REPORT|$)/i);
    if (resMatch) fields.respondent = resMatch[1].trim();
  }

  const advMatches = [...t.matchAll(/(?:Mr\.|Ms\.|Mrs\.|Dr\.)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*),?\s*(?:Adv|Advocate|Sr\. Counsel|Senior Counsel)?/g)];
  if (advMatches.length > 0) fields.advocates = advMatches.map(m => m[0].replace(/,?\s*$/, "").trim());

  const filingDate = t.match(/(?:filed|filing|registered\s*on)\s*[:\-]?\s*(\d{1,2}[-\.\/]\d{1,2}[-\.\/]\d{4}|\d{1,2}(?:st|nd|rd|th)?\s+\w+\s+\d{4})/i);
  if (filingDate) fields.dateOfFiling = filingDate[1];

  const dates = [...t.matchAll(/(\d{1,2}[-\.\/]\d{1,2}[-\.\/]\d{4}|\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\w*\s+\d{4})/gi)];
  if (dates.length > 0) fields.allDates = dates.map(d => d[1]);

  const judges = [...t.matchAll(/(?:Justice|Hon'ble|Honble|JUSTICE)\s+([A-Z][a-z]*\.?\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/g)];
  if (judges.length > 0) fields.judges = judges.map(j => `Justice ${j[1].trim()}`);

  const time = t.match(/\b(\d{1,2}:\d{2}\s*(?:AM|PM|am|pm))\b/);
  if (time) fields.timeOfSitting = time[1];

  if (/\bDISPOSED\b/i.test(t)) fields.status = "Disposed";
  else if (/\bDEFECTIVE\b/i.test(t)) fields.status = "Defective";
  else if (/\bPENDING\b/i.test(t)) fields.status = "Pending";
  else if (/\bFRESH\b/i.test(t)) fields.status = "Fresh";

  if (/civil\s*appellate/i.test(t))   fields.jurisdiction = "Civil Appellate";
  if (/criminal\s*appellate/i.test(t)) fields.jurisdiction = "Criminal Appellate";
  if (/original\s*jurisdiction/i.test(t)) fields.jurisdiction = "Original";

  if (/office\s*report/i.test(t))    fields.docType = "Office Report";
  if (/cause\s*list/i.test(t))       fields.docType = "Cause List";
  if (/order\b/i.test(t))            fields.docType = fields.docType || "Order";
  if (/notice\b/i.test(t))           fields.docType = fields.docType || "Notice";

  return fields;
}

function matchAgainstCases(fields: ExtractedFields, savedCases: SavedCase[]): SavedCase | null {
  if (!savedCases?.length) return null;
  return savedCases.find((c: SavedCase) => {
    if (fields.diaryNo && fields.diaryYear)
      if (String(c.diaryNumber || c.diaryNo) === String(fields.diaryNo) && String(c.diaryYear) === String(fields.diaryYear)) return true;
    if (fields.cnr && c.cnrNumber && c.cnrNumber.toLowerCase() === fields.cnr.toLowerCase()) return true;
    if (fields.caseNumber && c.caseNumber && c.caseNumber.toLowerCase().includes(fields.caseNumber.toLowerCase().slice(0,8))) return true;
    if (fields.petitioner && c.petitioners?.some((p: string) => p.toLowerCase().includes(fields.petitioner!.toLowerCase().slice(0,8)))) return true;
    return false;
  }) || null;
}

function transformApiToCase(apiResponse: { data: CaseResult; query: { diary_no: string; diary_year: string } }): CaseResult {
  const { data, query } = apiResponse;
  const now = new Date().toISOString();
  const caseId = `case-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  const splitParties = (raw?: string | null): string[] => {
    if (!raw) return ["Unknown"];
    return raw.split(/\bAND\b|\b&\b/i).map(p => p.replace(/^\d+\.\s*/, "").trim()).filter(Boolean);
  };

  const determineStatus = (badge?: string): string => {
    const b = (badge || "").toUpperCase().trim();
    if (b === "DISPOSED" || b === "DISPOSED OF") return "Disposed";
    if (b === "FRESH") return "Fresh";
    return "Pending";
  };

  return {
    id: caseId,
    petitioners: splitParties(data.petitioner),
    respondents: splitParties(data.respondent),
    petitioner: data.petitioner || "",
    respondent: data.respondent || "",
    caseType: "SC",
    shortCaseNumber: query.diary_no,
    caseNumber: data.caseNumber || "",
    diaryNumber: query.diary_no,
    diaryNo: query.diary_no,
    diaryYear: query.diary_year,
    cnrNumber: data.cnr || "",
    cnr: data.cnr || "",
    status: determineStatus(data.caseStatusBadge),
    caseStatusBadge: data.caseStatusBadge || "Pending",
    nextHearingDate: null,
    lastListedOn: data.lastListedOn || null,
    likelyListedOn: null,
    advanceList: { published: false, date: null, presentInList: false },
    finalList: { published: false, date: null, presentInList: false },
    lastCheckedAt: now,
    labels: [],
    lastListedJudges: [],
    finalListJudges: [],
    courtName: "Supreme Court of India",
    courtNumber: "Court No. 1",
    timeOfSitting: "10:30 AM",
    dateOfFiling: data.filed || now.split("T")[0],
    filed: data.filed || "",
    parties: data.parties || `${data.petitioner} vs ${data.respondent}`,
    earlierCourtDetails: "—",
    officeReportUrl: "#",
    lastOrdersUrl: "#",
    summary: "",
    listings: [],
    tasks: [],
    notes: [{
      id: "n" + Date.now(),
      text: `Case retrieved via Document Scanner on ${new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}.`,
      createdAt: now,
    }],
    documents: [],
    applications: [],
    timeline: [{
      id: "tl" + Date.now(),
      date: data.filed || now.split("T")[0],
      event: "Case filed in Supreme Court",
      type: "filing",
    }],
    archived: false,
  } as unknown as CaseResult;
}

async function fetchCaseFromAPI(diaryNo: string, diaryYear: string): Promise<{ ok: boolean; data: CaseResult; errorMsg?: string }> {
  const url = `/api/case?diary_no=${encodeURIComponent(diaryNo)}&diary_year=${encodeURIComponent(diaryYear)}&language=en`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
    if (!res.ok) {
      return { ok: false, data: {} as CaseResult, errorMsg: `Server returned ${res.status}` };
    }
    const json = await res.json();
    if (!json.ok) {
      return { ok: false, data: {} as CaseResult, errorMsg: json.message || "API returned no match" };
    }
    const transformed = transformApiToCase({ data: json.data, query: { diary_no: diaryNo, diary_year: diaryYear } });
    return { ok: true, data: transformed };
  } catch (e: any) {
    const msg = e?.name === "TimeoutError" ? "Request timed out — check network" : (e?.message || "Network error");
    return { ok: false, data: {} as CaseResult, errorMsg: msg };
  }
}

function statusStyle(s?: string): StatusStyle {
  const b = (s||"").toUpperCase();
  if (b==="PENDING")                   return {bg:"#FBF4E3",color:"#9B7B28",border:"#E8D18A"};
  if (b==="DISPOSED"||b==="CLOSED")    return {bg:"#E3F5EE",color:"#1A8C5B",border:"#9FD9BC"};
  if (b==="DEFECTIVE")                 return {bg:"#FEF2F2",color:"#C62828",border:"#FECACA"};
  return                                      {bg:"#E8F1FB",color:"#2A7BD4",border:"#B3D0F0"};
}

function StepDot({ n, active, done }: { n: number; active: boolean; done: boolean }) {
  return (
    <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:4}}>
      <div style={{width:32,height:32,borderRadius:"50%",background:done?"linear-gradient(135deg,#1A8C5B,#2ECC8A)":active?"linear-gradient(135deg,#1A2E5E,#2A4B9B)":"#E2E6EF",color:(done||active)?"#fff":"#8A94B0",display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,fontWeight:800,transition:"all 0.3s",boxShadow:active?"0 4px 14px rgba(26,46,94,0.35)":"none"}}>
        {done?"✓":n}
      </div>
    </div>
  );
}

function FieldRow({ icon, label, value }: { icon: string; label: string; value?: string | string[] | null }) {
  if (!value) return null;
  const display = Array.isArray(value) ? value.join(", ") : value;
  return (
    <div style={{display:"flex",gap:10,alignItems:"flex-start",padding:"7px 0",borderBottom:"1px solid #F3F4F8"}}>
      <span style={{fontSize:14,flexShrink:0,marginTop:1}}>{icon}</span>
      <div style={{flex:1,minWidth:0}}>
        <div style={{fontSize:10,fontWeight:700,color:"#8A94B0",letterSpacing:0.8,textTransform:"uppercase",marginBottom:2}}>{label}</div>
        <div style={{fontSize:13,fontWeight:600,color:"#1A2340",lineHeight:1.5,wordBreak:"break-word"}}>{display}</div>
      </div>
    </div>
  );
}

function ManualLookup({ initialNo, initialYear, onLookup }: {
  initialNo: string;
  initialYear: string;
  onLookup: (no: string, yr: string) => Promise<void>;
}) {
  const [no, setNo]       = useState(initialNo);
  const [yr, setYr]       = useState(initialYear);
  const [busy, setBusy]   = useState(false);

  const handle = async () => {
    if (!no.trim() || !yr.trim()) return;
    setBusy(true);
    await onLookup(no.trim(), yr.trim());
    setBusy(false);
  };

  return (
    <div style={{padding:"12px 14px",borderRadius:10,background:"#F0F4FF",border:"1px solid #C5D4F5",marginBottom:4}}>
      <div style={{fontSize:11,fontWeight:700,color:"#2A4B9B",letterSpacing:0.6,textTransform:"uppercase",marginBottom:8}}>
        ✏️ Enter / Correct Diary Number
      </div>
      <div style={{display:"flex",gap:8,alignItems:"center"}}>
        <input
          type="text" value={no} onChange={e => setNo(e.target.value)}
          placeholder="Diary No."
          style={{flex:2,padding:"8px 10px",borderRadius:8,border:"1px solid #C5D4F5",fontSize:14,fontWeight:600,color:"#1A2340",outline:"none",background:"#fff"}}
        />
        <input
          type="text" value={yr} onChange={e => setYr(e.target.value)}
          placeholder="Year"
          maxLength={4}
          style={{flex:1,padding:"8px 10px",borderRadius:8,border:"1px solid #C5D4F5",fontSize:14,fontWeight:600,color:"#1A2340",outline:"none",background:"#fff"}}
        />
        <button onClick={handle} disabled={busy || !no.trim() || !yr.trim()}
          style={{flexShrink:0,padding:"8px 14px",borderRadius:8,border:"none",background:busy?"#8A94B0":"linear-gradient(135deg,#1A2E5E,#2A4B9B)",color:"#fff",fontSize:13,fontWeight:800,cursor:busy?"not-allowed":"pointer",whiteSpace:"nowrap"}}>
          {busy ? "…" : "🔍 Lookup"}
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────────────────────
export default function DocumentScanner({ onCaseFound, savedCases = [] }: { onCaseFound?: (c: CaseResult | SavedCase) => void; savedCases?: SavedCase[] }) {
  const [step,       setStep]       = useState(0);
  const [imgSrc,     setImgSrc]     = useState<string | null>(null);
  const [fileType,   setFileType]   = useState("");
  const [progress,   setProgress]   = useState(0);
  const [rawText,    setRawText]    = useState("");
  const [fields,     setFields]     = useState<ExtractedFields | null>(null);
  const [caseResult, setCaseResult] = useState<CaseResult | SavedCase | null>(null);
  const [error,      setError]      = useState("");
  const [source,     setSource]     = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [showCam,    setShowCam]    = useState(false);
  const [camError,   setCamError]   = useState("");

  const fileRef   = useRef<HTMLInputElement>(null);
  const camRef    = useRef<HTMLInputElement>(null);
  const videoRef  = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // ── LOAD FILE ──────────────────────────────────────────────────────────────
  const loadFile = useCallback(async (file: File) => {
    if (!file) return;
    const isPDF = file.type==="application/pdf" || file.name?.toLowerCase().endsWith(".pdf");
    const isImg = file.type.startsWith("image/");
    if (!isPDF && !isImg) { setError("Please upload a JPG, PNG, or PDF file."); setStep(6); return; }
    if (isPDF) {
      setFileType("pdf"); setStep(2); setProgress(10);
      try {
        const buf  = await file.arrayBuffer(); setProgress(40);
        const text = await extractTextFromPDF(buf); setProgress(80);
        setRawText(text); setProgress(100);
        const extracted = extractAllFields(text);
        if (!extracted.diaryNo && !extracted.cnr && !extracted.caseNumber && !extracted.petitioner) {
          setError("No recognisable case fields found. The PDF may use an unsupported encoding — try uploading a screenshot as PNG/JPG.");
          setStep(6); return;
        }
        setFields(extracted); setStep(3);
      } catch(e) { setError("Could not read PDF: "+(e as Error).message); setStep(6); }
    } else {
      setFileType("image");
      const r = new FileReader();
      r.onload = (e: ProgressEvent<FileReader>) => { setImgSrc(e.target?.result as string ?? null); setStep(1); };
      r.readAsDataURL(file);
    }
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => { if (e.target.files?.[0]) loadFile(e.target.files[0]); };
  const handleDrop   = (e: React.DragEvent<HTMLDivElement>) => { e.preventDefault(); setIsDragging(false); if (e.dataTransfer.files[0]) loadFile(e.dataTransfer.files[0]); };

  // ── OCR ────────────────────────────────────────────────────────────────────
  const runOCR = useCallback(async () => {
    setStep(2); setProgress(0); setRawText(""); setFields(null); setError("");
    try {
      if (!window.Tesseract) throw new Error("Tesseract.js not loaded.");
      const worker = await window.Tesseract.createWorker("eng", 1, {
        logger: m => { if (m.status==="recognizing text") setProgress(Math.round(m.progress*100)); }
      });
      const { data: { text } } = await worker.recognize(imgSrc!);
      await worker.terminate();
      setRawText(text);
      const extracted = extractAllFields(text);
      if (!extracted.diaryNo && !extracted.cnr && !extracted.caseNumber && !extracted.petitioner) {
        setError("No case information found in this image. Ensure text is clearly visible."); setStep(6); return;
      }
      setFields(extracted); setStep(3);
    } catch(e) { setError("OCR failed: "+(e as Error).message); setStep(6); }
  }, [imgSrc]);

  // ── LOOKUP ─────────────────────────────────────────────────────────────────
  const [apiError, setApiError] = useState<string>("");

  const lookupCase = useCallback(async () => {
    if (!fields) return;
    setStep(4);
    setApiError("");

    const local = matchAgainstCases(fields, savedCases);
    if (local) {
      setCaseResult(local); setSource("local"); setStep(5);
      if (onCaseFound) onCaseFound(local);
      return;
    }

    if (fields.diaryNo && fields.diaryYear) {
      const res = await fetchCaseFromAPI(fields.diaryNo, fields.diaryYear);
      if (res.ok) {
        setCaseResult(res.data); setSource("api"); setStep(5);
        if (onCaseFound) onCaseFound(res.data);
        return;
      }
      setApiError(res.errorMsg || "API lookup failed");
    } else {
      setApiError("No diary number found in scan — cannot query SC API");
    }

    setCaseResult(null); setSource("extracted"); setStep(5);
  }, [fields, savedCases, onCaseFound]);

  // ── WEBCAM ─────────────────────────────────────────────────────────────────
  const openCamera = useCallback(async () => {
    setCamError("");
    setShowCam(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "environment",
          // Request ideal dimensions matching device screen for best quality
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      });
      streamRef.current = stream;
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play();
        }
      }, 100);
    } catch (e) {
      setCamError("Camera access denied or not available: " + (e as Error).message);
    }
  }, []);

  const capturePhoto = useCallback(() => {
    if (!videoRef.current) return;
    const canvas = document.createElement("canvas");
    canvas.width  = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;
    canvas.getContext("2d")?.drawImage(videoRef.current, 0, 0);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.92);
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    setShowCam(false);
    setImgSrc(dataUrl);
    setFileType("image");
    setStep(1);
  }, []);

  const closeCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    setShowCam(false);
    setCamError("");
  }, []);

  const reset = () => {
    closeCamera();
    setStep(0); setImgSrc(null); setFileType(""); setProgress(0);
    setRawText(""); setFields(null); setCaseResult(null); setError(""); setSource(""); setApiError("");
    if (fileRef.current) fileRef.current.value = "";
    if (camRef.current)  camRef.current.value  = "";
  };

  const ss = caseResult ? statusStyle((caseResult.caseStatusBadge || caseResult.status) as string | undefined) : statusStyle(fields?.status);

  // ── RENDER ─────────────────────────────────────────────────────────────────
  return (
    <div style={{fontFamily:"'DM Sans','Segoe UI',system-ui,sans-serif"}}>

      {/* Steps — only when in progress */}
      {step>0 && step<6 && (
        <div style={{display:"flex",alignItems:"center",marginBottom:16}}>
          {["Upload","Scan","Review","Lookup","Done"].map((label,i)=>(
            <div key={i} style={{display:"flex",alignItems:"center",flex:i<4?1:0}}>
              <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:3}}>
                <StepDot n={i+1} active={step===i+1} done={step>i+1}/>
                <span style={{fontSize:9,color:step>i?"#1A2E5E":"#8A94B0",fontWeight:700,letterSpacing:0.5}}>{label}</span>
              </div>
              {i<4 && <div style={{flex:1,height:2,background:step>i+1?"#1A8C5B":"#E2E6EF",margin:"0 4px",marginBottom:16,transition:"background 0.3s"}}/>}
            </div>
          ))}
        </div>
      )}

      {/* ── STEP 0: Upload ── */}
      {step===0 && (
        <div>
          <div
            onDragOver={e=>{e.preventDefault();setIsDragging(true);}}
            onDragLeave={()=>setIsDragging(false)}
            onDrop={handleDrop}
            style={{border:`1.5px dashed ${isDragging?"#1A2E5E":"#C9A84C"}`,borderRadius:10,padding:"14px 16px",background:isDragging?"rgba(26,46,94,0.04)":"rgba(201,168,76,0.03)",transition:"all 0.2s",display:"flex",alignItems:"center",gap:12,marginBottom:8}}>
            <span style={{fontSize:22,flexShrink:0}}>📂</span>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontSize:13,fontWeight:700,color:"#1A2340"}}>Drop a court document</div>
              <div style={{fontSize:11,color:"#8A94B0"}}>PDF, JPG or PNG</div>
            </div>
            <button onClick={()=>fileRef.current?.click()} style={{flexShrink:0,padding:"7px 16px",borderRadius:20,border:"none",background:"linear-gradient(135deg,#1A2E5E,#2A4B9B)",color:"#fff",fontSize:12,fontWeight:700,cursor:"pointer"}}>
              Browse
            </button>
            <button onClick={openCamera} style={{flexShrink:0,padding:"7px 14px",borderRadius:20,border:"1px solid #E2E6EF",background:"#fff",color:"#1A2340",fontSize:12,fontWeight:700,cursor:"pointer",display:"flex",alignItems:"center",gap:5}}>
              <span style={{fontSize:13}}>📸</span> Camera
            </button>
          </div>
          <input ref={fileRef} type="file" accept="image/*,application/pdf,.pdf" style={{display:"none"}} onChange={handleChange}/>
          <input ref={camRef}  type="file" accept="image/*" capture="environment" style={{display:"none"}} onChange={handleChange}/>

          {/* ─────────────────────────────────────────────────────────────────
              WEBCAM MODAL — Full-screen on mobile, centred card on desktop
          ───────────────────────────────────────────────────────────────── */}
          {showCam && (
            <>
              {/* Inject keyframes + mobile overrides once */}
              <style>{`
                @keyframes camFadeIn {
                  from { opacity: 0; transform: scale(0.97); }
                  to   { opacity: 1; transform: scale(1); }
                }

                /* Full-screen on phones (≤ 640 px wide) */
                @media (max-width: 640px) {
                  .cam-modal-card {
                    width: 100% !important;
                    height: 100% !important;
                    max-width: 100% !important;
                    border-radius: 0 !important;
                    display: flex !important;
                    flex-direction: column !important;
                  }
                  .cam-video-wrap {
                    flex: 1 !important;
                    max-height: none !important;
                  }
                  .cam-video {
                    height: 100% !important;
                    max-height: none !important;
                    object-fit: cover !important;
                  }
                  .cam-btn-row {
                    /* stick to bottom, use safe-area inset for notched phones */
                    padding-bottom: calc(14px + env(safe-area-inset-bottom)) !important;
                  }
                }
              `}</style>

              <div style={{
                position: "fixed",
                inset: 0,
                zIndex: 9999,
                background: "rgba(0,0,0,0.82)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}>
                <div
                  className="cam-modal-card"
                  style={{
                    background: "#fff",
                    borderRadius: 16,
                    overflow: "hidden",
                    // Desktop: nice card. Mobile CSS above overrides to full-screen.
                    width: "min(520px, 92vw)",
                    maxWidth: "92vw",
                    boxShadow: "0 8px 48px rgba(0,0,0,0.5)",
                    animation: "camFadeIn 0.22s ease",
                  }}
                >
                  {/* Header bar */}
                  <div style={{
                    padding: "12px 16px",
                    background: "linear-gradient(135deg,#1A2E5E,#2A4B9B)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    flexShrink: 0,
                  }}>
                    <span style={{fontWeight:800,color:"#fff",fontSize:14}}>📸 Camera Scan</span>
                    <button
                      onClick={closeCamera}
                      style={{background:"rgba(255,255,255,0.2)",border:"none",borderRadius:20,color:"#fff",fontSize:12,fontWeight:700,padding:"5px 12px",cursor:"pointer"}}
                    >
                      ✕ Close
                    </button>
                  </div>

                  {camError ? (
                    <div style={{padding:28,textAlign:"center"}}>
                      <div style={{fontSize:32,marginBottom:12}}>🚫</div>
                      <div style={{fontSize:13,color:"#C62828",fontWeight:600,marginBottom:18,lineHeight:1.5}}>{camError}</div>
                      <button onClick={closeCamera} style={{padding:"10px 24px",borderRadius:8,border:"none",background:"#F3F4F8",color:"#4A5568",fontWeight:700,cursor:"pointer",fontSize:14}}>
                        Close
                      </button>
                    </div>
                  ) : (
                    <>
                      {/* Video area */}
                      <div
                        className="cam-video-wrap"
                        style={{
                          position: "relative",
                          background: "#000",
                          // Desktop: sensible max-height. Mobile CSS removes this.
                          maxHeight: "58vh",
                          overflow: "hidden",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <video
                          ref={videoRef}
                          autoPlay
                          playsInline
                          muted
                          className="cam-video"
                          style={{
                            width: "100%",
                            // Desktop: cap height. Mobile CSS overrides.
                            maxHeight: "58vh",
                            display: "block",
                            objectFit: "cover",
                          }}
                        />

                        {/* Subtle document-frame guide overlay */}
                        <div style={{
                          position: "absolute",
                          inset: 0,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          pointerEvents: "none",
                        }}>
                          <div style={{
                            width: "82%",
                            height: "72%",
                            border: "2px dashed rgba(255,255,255,0.45)",
                            borderRadius: 10,
                            boxShadow: "0 0 0 9999px rgba(0,0,0,0.28)",
                          }}/>
                        </div>

                        {/* Hint text */}
                        <div style={{
                          position: "absolute",
                          bottom: 10,
                          left: 0,
                          right: 0,
                          textAlign: "center",
                          fontSize: 11,
                          color: "rgba(255,255,255,0.75)",
                          fontWeight: 600,
                          letterSpacing: 0.3,
                          pointerEvents: "none",
                        }}>
                          Align document within the frame
                        </div>
                      </div>

                      {/* Capture / Cancel buttons */}
                      <div
                        className="cam-btn-row"
                        style={{
                          padding: "14px 16px",
                          display: "flex",
                          gap: 10,
                          background: "#111827",
                          flexShrink: 0,
                        }}
                      >
                        <button
                          onClick={capturePhoto}
                          style={{
                            flex: 1,
                            padding: "13px",
                            borderRadius: 10,
                            border: "none",
                            background: "linear-gradient(135deg,#C9A84C,#9B7B28)",
                            color: "#fff",
                            fontSize: 15,
                            fontWeight: 800,
                            cursor: "pointer",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            gap: 8,
                          }}
                        >
                          <span style={{fontSize:18}}>📷</span> Capture
                        </button>
                        <button
                          onClick={closeCamera}
                          style={{
                            padding: "13px 20px",
                            borderRadius: 10,
                            border: "none",
                            background: "rgba(255,255,255,0.1)",
                            color: "#fff",
                            fontSize: 14,
                            fontWeight: 700,
                            cursor: "pointer",
                          }}
                        >
                          Cancel
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </>
          )}

          {/* Collapsed fields hint */}
          <details style={{marginTop:4}}>
            <summary style={{fontSize:11,color:"#8A94B0",cursor:"pointer",fontWeight:600,userSelect:"none",listStyle:"none",display:"flex",alignItems:"center",gap:4}}>
              <span style={{fontSize:10}}>▸</span> Fields extracted from document
            </summary>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:"4px 8px",marginTop:8,padding:"10px 12px",borderRadius:8,background:"#F3F4F8",border:"1px solid #E2E6EF"}}>
              {[
                ["🔢","Diary / Case No."],["🏛️","Court Name & No."],["👤","Petitioner(s)"],
                ["👥","Respondent(s)"],   ["📋","Case Number"],    ["🔖","CNR Number"],
                ["⚖️","Advocates"],       ["📅","Filing Date"],    ["🧑‍⚖️","Judges"],
                ["🕐","Time of Sitting"], ["📌","Hearing Dates"],  ["⚡","Status"],
              ].map(([icon,label])=>(
                <div key={label} style={{display:"flex",gap:4,alignItems:"center",fontSize:11,color:"#4A5568"}}>
                  <span>{icon}</span><span style={{fontWeight:600}}>{label}</span>
                </div>
              ))}
            </div>
          </details>
        </div>
      )}

      {/* ── STEP 1: Image preview ── */}
      {step===1 && imgSrc && (
        <div style={{background:"#fff",borderRadius:14,border:"1px solid #E2E6EF",overflow:"hidden",boxShadow:"0 2px 12px rgba(15,28,63,0.08)"}}>
          <div style={{padding:"14px 16px",borderBottom:"1px solid #E2E6EF",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
            <span style={{fontWeight:800,color:"#1A2340",fontSize:14}}>🖼️ Image Preview</span>
            <button onClick={reset} style={{fontSize:12,color:"#8A94B0",background:"none",border:"none",cursor:"pointer",fontWeight:600}}>✕ Change</button>
          </div>
          <img src={imgSrc} alt="preview" style={{width:"100%",maxHeight:280,objectFit:"contain",background:"#F3F4F8",padding:12}}/>
          <div style={{padding:16}}>
            <button onClick={runOCR} style={{width:"100%",padding:"13px",borderRadius:10,border:"none",background:"linear-gradient(135deg,#1A2E5E,#2A4B9B)",color:"#fff",fontSize:15,fontWeight:800,cursor:"pointer"}}>
              🔍 Start OCR Scan
            </button>
          </div>
        </div>
      )}

      {/* ── STEP 2: Processing ── */}
      {step===2 && (
        <div style={{background:"#fff",borderRadius:14,border:"1px solid #E2E6EF",padding:28,textAlign:"center"}}>
          <div style={{fontSize:36,marginBottom:14}}>{fileType==="pdf"?"📄":"🔬"}</div>
          <div style={{fontSize:16,fontWeight:800,color:"#1A2340",marginBottom:6}}>
            {fileType==="pdf"?"Extracting all fields from PDF...":"Scanning document with OCR..."}
          </div>
          <div style={{fontSize:13,color:"#8A94B0",marginBottom:20}}>Reading case info, parties, dates, advocates...</div>
          <div style={{background:"#F3F4F8",borderRadius:99,height:10,overflow:"hidden",marginBottom:10}}>
            <div style={{width:`${progress}%`,height:"100%",background:"linear-gradient(90deg,#1A2E5E,#C9A84C)",borderRadius:99,transition:"width 0.4s"}}/>
          </div>
          <div style={{fontSize:13,fontWeight:700,color:"#1A2E5E"}}>{progress}%</div>
        </div>
      )}

      {/* ── STEP 3: Review extracted fields ── */}
      {step===3 && fields && (
        <div style={{background:"#fff",borderRadius:14,border:"1px solid #E2E6EF",overflow:"hidden",boxShadow:"0 2px 12px rgba(15,28,63,0.08)"}}>
          <div style={{padding:"14px 16px",background:"linear-gradient(135deg,#1A2E5E,#2A4B9B)",display:"flex",alignItems:"center",gap:10}}>
            <span style={{fontSize:18}}>✅</span>
            <span style={{fontWeight:800,color:"#fff",fontSize:14}}>Fields Extracted Successfully</span>
            <span style={{marginLeft:"auto",fontSize:11,padding:"2px 8px",borderRadius:20,background:"rgba(255,255,255,0.2)",color:"#fff",fontWeight:700}}>
              {fileType==="pdf"?"📄 PDF":"🔬 OCR"}
            </span>
          </div>
          <div style={{padding:16}}>
            <div style={{fontSize:12,fontWeight:700,color:"#8A94B0",letterSpacing:0.8,textTransform:"uppercase",marginBottom:8}}>📋 Case Information</div>
            <div style={{background:"#F9FAFB",borderRadius:10,padding:"4px 14px",marginBottom:14,border:"1px solid #E2E6EF"}}>
              <FieldRow icon="🔢" label={fields.caseType||"Case No"} value={fields.diaryNo && fields.diaryYear ? `${fields.diaryNo} / ${fields.diaryYear}` : null}/>
              <FieldRow icon="📋" label="Case Number"   value={fields.caseNumber}/>
              <FieldRow icon="🔖" label="CNR Number"    value={fields.cnr}/>
              <FieldRow icon="👤" label="Petitioner(s)" value={fields.petitioner}/>
              <FieldRow icon="👥" label="Respondent(s)" value={fields.respondent}/>
              <FieldRow icon="🏛️" label="Court Name"    value={fields.courtName}/>
              <FieldRow icon="🏢" label="Court Number"  value={fields.courtNumber}/>
              <FieldRow icon="🕐" label="Time of Sitting" value={fields.timeOfSitting}/>
              <FieldRow icon="⚖️" label="Jurisdiction"  value={fields.jurisdiction}/>
              <FieldRow icon="📁" label="Document Type" value={fields.docType}/>
            </div>

            <div style={{fontSize:12,fontWeight:700,color:"#8A94B0",letterSpacing:0.8,textTransform:"uppercase",marginBottom:8}}>📅 Listing Details</div>
            <div style={{background:"#F9FAFB",borderRadius:10,padding:"4px 14px",marginBottom:14,border:"1px solid #E2E6EF"}}>
              <FieldRow icon="📅" label="Date of Filing" value={fields.dateOfFiling}/>
              <FieldRow icon="🧑‍⚖️" label="Judges"       value={fields.judges}/>
              <FieldRow icon="⚖️" label="Advocates"     value={fields.advocates}/>
              <FieldRow icon="📌" label="Dates Found"   value={fields.allDates?.slice(0,4)}/>
              {fields.status && (
                <div style={{display:"flex",gap:10,alignItems:"center",padding:"7px 0"}}>
                  <span style={{fontSize:14}}>⚡</span>
                  <div>
                    <div style={{fontSize:10,fontWeight:700,color:"#8A94B0",letterSpacing:0.8,textTransform:"uppercase",marginBottom:2}}>Status</div>
                    <span style={{fontSize:12,fontWeight:800,padding:"3px 10px",borderRadius:20,background:statusStyle(fields.status).bg,color:statusStyle(fields.status).color,border:`1px solid ${statusStyle(fields.status).border}`}}>
                      {fields.status.toUpperCase()}
                    </span>
                  </div>
                </div>
              )}
            </div>

            <details style={{marginBottom:16}}>
              <summary style={{fontSize:12,color:"#8A94B0",cursor:"pointer",fontWeight:600,userSelect:"none"}}>📝 View raw extracted text</summary>
              <div style={{marginTop:8,padding:12,borderRadius:8,background:"#F3F4F8",fontSize:11,color:"#4A5568",fontFamily:"monospace",maxHeight:100,overflowY:"auto",whiteSpace:"pre-wrap",lineHeight:1.7}}>
                {rawText.slice(0,800)}{rawText.length>800?"...":""}
              </div>
            </details>

            <div style={{display:"flex",gap:10}}>
              <button onClick={reset} style={{flex:1,padding:"11px",borderRadius:10,border:"1px solid #E2E6EF",background:"#F3F4F8",color:"#4A5568",fontSize:14,fontWeight:700,cursor:"pointer"}}>✕ Cancel</button>
              <button onClick={lookupCase} style={{flex:2,padding:"11px",borderRadius:10,border:"none",background:"linear-gradient(135deg,#C9A84C,#9B7B28)",color:"#fff",fontSize:14,fontWeight:800,cursor:"pointer",boxShadow:"0 4px 14px rgba(201,168,76,0.35)"}}>
                ⚖️ Find This Case
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── STEP 4: Lookup ── */}
      {step===4 && (
        <div style={{background:"#fff",borderRadius:14,border:"1px solid #E2E6EF",padding:28,textAlign:"center"}}>
          <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
          <div style={{width:48,height:48,borderRadius:"50%",background:"linear-gradient(135deg,#1A2E5E,#2A4B9B)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:22,margin:"0 auto 16px",animation:"spin 1.2s linear infinite"}}>⚖️</div>
          <div style={{fontSize:16,fontWeight:800,color:"#1A2340",marginBottom:6}}>Looking up case...</div>
          <div style={{fontSize:13,color:"#8A94B0",marginBottom:6}}>Matching against your dashboard and SC API</div>
          <div style={{display:"flex",flexWrap:"wrap",gap:6,justifyContent:"center",marginTop:12}}>
            {fields?.diaryNo   && <span style={{fontSize:11,padding:"3px 10px",borderRadius:20,background:"#E8F1FB",color:"#2A7BD4",fontWeight:700}}>{fields.caseType} {fields.diaryNo}/{fields.diaryYear}</span>}
            {fields?.cnr        && <span style={{fontSize:11,padding:"3px 10px",borderRadius:20,background:"#E8F1FB",color:"#2A7BD4",fontWeight:700}}>{fields.cnr}</span>}
            {fields?.petitioner && <span style={{fontSize:11,padding:"3px 10px",borderRadius:20,background:"#E8F1FB",color:"#2A7BD4",fontWeight:700}}>{fields.petitioner.slice(0,20)}</span>}
          </div>
        </div>
      )}

      {/* ── STEP 5: Result ── */}
      {step===5 && (
        <div style={{background:"#fff",borderRadius:14,border:"1px solid #E2E6EF",overflow:"hidden",boxShadow:"0 2px 12px rgba(15,28,63,0.08)"}}>
          <div style={{padding:"14px 18px",background:source==="extracted"?"linear-gradient(135deg,#C9A84C,#9B7B28)":"linear-gradient(135deg,#1A8C5B,#2ECC8A)",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
            <div style={{display:"flex",alignItems:"center",gap:10}}>
              <span style={{fontSize:18}}>{source==="extracted"?"📋":"✅"}</span>
              <span style={{fontWeight:800,color:"#fff",fontSize:14}}>
                {source==="local"?"Case Found in Dashboard":source==="api"?"Case Found via SC API":"Fields Extracted — No Match Found"}
              </span>
            </div>
            <span style={{fontSize:11,fontWeight:700,padding:"2px 8px",borderRadius:20,background:"rgba(255,255,255,0.25)",color:"#fff"}}>
              {source==="local"?"📱 Local":source==="api"?"🌐 SC API":"📋 From Scan"}
            </span>
          </div>

          <div style={{padding:18}}>
            {apiError && !caseResult && (
              <div style={{display:"flex",gap:10,alignItems:"flex-start",padding:"10px 14px",borderRadius:10,background:"#FEF2F2",border:"1px solid #FECACA",marginBottom:14}}>
                <span style={{fontSize:18,flexShrink:0}}>⚠️</span>
                <div style={{flex:1}}>
                  <div style={{fontSize:12,fontWeight:800,color:"#C62828",marginBottom:2}}>API Lookup Failed</div>
                  <div style={{fontSize:12,color:"#7F1D1D",lineHeight:1.6}}>{apiError}</div>
                  <div style={{fontSize:11,color:"#9B4040",marginTop:4}}>You can enter the diary number manually below and retry.</div>
                </div>
              </div>
            )}

            {caseResult && (() => {
              const cr = caseResult as CaseResult;
              return (
              <>
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14}}>
                  <div style={{fontSize:13,color:"#8A94B0",fontWeight:600}}>
                    {fields?.caseType} <strong style={{color:"#1A2340"}}>{fields?.diaryNo}/{fields?.diaryYear}</strong>
                  </div>
                  <span style={{fontSize:12,fontWeight:800,padding:"4px 12px",borderRadius:20,background:ss.bg,color:ss.color,border:`1px solid ${ss.border}`}}>
                    {(cr.caseStatusBadge||cr.status||"ACTIVE").toUpperCase()}
                  </span>
                </div>
                <div style={{padding:"12px 14px",borderRadius:10,background:"#F3F4F8",marginBottom:12,border:"1px solid #E2E6EF"}}>
                  <div style={{fontSize:11,fontWeight:700,color:"#8A94B0",letterSpacing:0.8,textTransform:"uppercase",marginBottom:4}}>Parties</div>
                  <div style={{fontSize:14,fontWeight:700,color:"#1A2340",lineHeight:1.5}}>{formatCaseTitle(cr)}</div>
                </div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:12}}>
                  {([["Case No",cr.caseNumber],["CNR",cr.cnr],["Filed",cr.filed],["Last Listed",cr.lastListedOn]] as [string, string | undefined][]).filter(f=>f[1]).map(([l,v])=>(
                    <div key={l} style={{padding:"8px 12px",borderRadius:8,background:"#F3F4F8",border:"1px solid #E2E6EF"}}>
                      <div style={{fontSize:10,fontWeight:700,color:"#8A94B0",letterSpacing:0.8,textTransform:"uppercase",marginBottom:2}}>{l}</div>
                      <div style={{fontSize:12,fontWeight:600,color:"#1A2340"}}>{v}</div>
                    </div>
                  ))}
                </div>
              </>
              );
            })()}

            {fields && (
              <div style={{marginBottom:12}}>
                <div style={{fontSize:12,fontWeight:700,color:"#8A94B0",letterSpacing:0.8,textTransform:"uppercase",marginBottom:8}}>
                  {caseResult?"📋 Additional Extracted Fields":"📋 Extracted from Document"}
                </div>
                <div style={{background:"#F9FAFB",borderRadius:10,padding:"4px 14px",border:"1px solid #E2E6EF"}}>
                  <FieldRow icon="🔢" label={fields.caseType||"Case No"} value={fields.diaryNo&&fields.diaryYear?`${fields.diaryNo} / ${fields.diaryYear}`:null}/>
                  <FieldRow icon="📋" label="Case Number"   value={fields.caseNumber}/>
                  <FieldRow icon="🔖" label="CNR"           value={fields.cnr}/>
                  <FieldRow icon="👤" label="Petitioner"    value={fields.petitioner}/>
                  <FieldRow icon="👥" label="Respondent"    value={fields.respondent}/>
                  <FieldRow icon="🏛️" label="Court"         value={fields.courtName}/>
                  <FieldRow icon="🧑‍⚖️" label="Judges"       value={fields.judges}/>
                  <FieldRow icon="⚖️" label="Advocates"     value={fields.advocates}/>
                  <FieldRow icon="📅" label="Filing Date"   value={fields.dateOfFiling}/>
                  <FieldRow icon="📁" label="Document"      value={fields.docType}/>
                </div>
              </div>
            )}

            {!caseResult && (
              <ManualLookup
                initialNo={fields?.diaryNo || ""}
                initialYear={fields?.diaryYear || new Date().getFullYear().toString()}
                onLookup={async (no, yr) => {
                  setApiError("");
                  setFields(prev => prev ? { ...prev, diaryNo: no, diaryYear: yr } : prev);
                  setStep(4);
                  const local2 = matchAgainstCases({ ...(fields || {}), diaryNo: no, diaryYear: yr }, savedCases);
                  if (local2) { setCaseResult(local2); setSource("local"); setStep(5); if (onCaseFound) onCaseFound(local2); return; }
                  const res = await fetchCaseFromAPI(no, yr);
                  if (res.ok) { setCaseResult(res.data); setSource("api"); setStep(5); if (onCaseFound) onCaseFound(res.data); }
                  else { setApiError(res.errorMsg || "API lookup failed"); setCaseResult(null); setSource("extracted"); setStep(5); }
                }}
              />
            )}

            <div style={{display:"flex",gap:10,marginTop:12}}>
              <button onClick={reset} style={{flex:1,padding:"11px",borderRadius:10,border:"1px solid #E2E6EF",background:"#F3F4F8",color:"#4A5568",fontSize:13,fontWeight:700,cursor:"pointer"}}>📄 Scan Another</button>
              {caseResult && (
                <button onClick={()=>{if(onCaseFound)onCaseFound(caseResult);}} style={{flex:2,padding:"11px",borderRadius:10,border:"none",background:"linear-gradient(135deg,#1A2E5E,#2A4B9B)",color:"#fff",fontSize:13,fontWeight:800,cursor:"pointer"}}>
                  ⚖️ Open in Dashboard
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── STEP 6: Error ── */}
      {step===6 && (
        <div style={{background:"#FEF2F2",borderRadius:14,border:"1px solid #FECACA",padding:22}}>
          <div style={{display:"flex",gap:14,alignItems:"flex-start",marginBottom:16}}>
            <span style={{fontSize:26}}>⚠️</span>
            <div>
              <div style={{fontSize:15,fontWeight:800,color:"#C62828",marginBottom:4}}>Extraction Failed</div>
              <div style={{fontSize:13,color:"#7F1D1D",lineHeight:1.6}}>{error}</div>
            </div>
          </div>
          <ul style={{margin:"0 0 16px",paddingLeft:18,fontSize:12,color:"#7F1D1D",lineHeight:2.2}}>
            <li>For PDFs — works with Supreme Court text-based PDFs (not scanned images)</li>
            <li>For scanned PDFs — take a screenshot → upload as PNG/JPG</li>
            <li>For photos — ensure good lighting and flat document</li>
          </ul>
          <button onClick={reset} style={{width:"100%",padding:"12px",borderRadius:10,border:"none",background:"linear-gradient(135deg,#C62828,#EF5350)",color:"#fff",fontSize:14,fontWeight:800,cursor:"pointer"}}>
            🔄 Try Again
          </button>
        </div>
      )}
    </div>
  );
}