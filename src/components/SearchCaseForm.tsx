import React, { useState } from "react";
import axios from "axios";
import { Theme } from "../themes";
import DocumentScanner from "./DocumentScanner";
import { generateLegalTasks } from "../caseLogic";
import { loadSearchHistory, saveSearchHistory, SearchHistoryEntry } from "../services/localStorageService";
import { formatCaseTitle } from "../utils/caseTitle";
import {
  generateOfficeReportUrl,
  generateLastOrderUrl,
  fetchCaseFullByCNR,
  searchCases,
} from "../services/eCourtsService";
import { transformMCPToCase } from "../utils/apiTransform";
import { getDemoSearchCount, getDemoSearchLimit, incrementDemoSearchCount } from "./Login";

interface SearchCaseFormProps {
    onCaseFound: (caseData: any) => void;
    onError?: (err: string) => void;
    theme: Theme;
    onViewDetail?: (caseData: any) => void;
}

const CASE_TYPES_FULL = [
    "Special Leave Petition (Civil)",
    "Special Leave Petition (Criminal)",
    "Civil Appeal",
    "Criminal Appeal",
    "Writ Petition (Civil)",
    "Writ Petition (Criminal)",
    "Transfer Petition (Civil)",
    "Transfer Petition (Criminal)",
    "Review Petition (Civil)",
    "Review Petition (Criminal)",
    "Contempt Petition (Civil)",
    "Contempt Petition (Criminal)",
    "Tax Reference Case",
    "Original Suit",
    "Election Petition",
    "Arbitration Petition",
    "Curative Petition (Civil)",
    "Curative Petition (Criminal)",
    "Special Reference Case",
    "Transferred Case (Civil)",
    "Transferred Case (Criminal)",
    "Petition for Special Leave to Appeal",
    "Suo Moto Writ Petition (Civil)",
    "Suo Moto Writ Petition (Criminal)",
    "Miscellaneous Application",
    "Caveat",
    "Reference under Article 317(1)",
    "Death Sentence Reference",
    "Interlocutory Application",
    "Restoration Application",
    "Condonation of Delay Application",
    "Substitution Application",
    "Stay Application",
    "Impleadment Application",
    "Direction Application",
    "Modification Application",
    "Clarification Application",
    "Early Hearing Application"
];

const YEARS = Array.from({ length: 2026 - 1950 + 1 }, (_, i) => (1950 + i).toString()).reverse();
const RECENT_SEARCHES_KEY = "courtsync_aor_searches";

// ── DATE HELPERS ──────────────────────────────────────────────────────────────
// SC API returns dates as "DD-MM-YYYY" or "DD-MM-YYYY [JUDGE NAMES]"
// JS new Date() cannot parse DD-MM-YYYY → "Invalid Date"
// This extracts the date and converts to ISO "YYYY-MM-DD"
function parseSCDate(raw: string | null | undefined): string {
    if (!raw) return "";
    const m = raw.match(/(\d{2})-(\d{2})-(\d{4})/);
    if (!m) return "";
    return `${m[3]}-${m[2]}-${m[1]}`; // DD-MM-YYYY → YYYY-MM-DD
}

// Extract judge names from "DD-MM-YYYY [HON'BLE MR. JUSTICE X and HON'BLE MR. JUSTICE Y]"
function extractJudges(raw: string | null | undefined): string[] {
    if (!raw) return [];
    const m = raw.match(/\[([^\]0-9A-Z:]+)\]/i) || raw.match(/\[(HON'BLE.+?)\]/i) || raw.match(/\[([^\]]+)\]/);
    if (!m) return [];
    if (m[1].includes("CL.NO.")) return []; // Skip if it matched the item number bracket
    return m[1].split(/\band\b/i).map(j => j.replace(/HON'BLE\s+MR\.\s+/i, "").replace(/HON'BLE\s+MS\.\s+/i, "").replace(/JUSTICE\s+/i, "").trim()).filter(Boolean);
}

function extractItemNo(raw: string | null | undefined): string {
    if (!raw) return "";
    const m = raw.match(/\[CL\.NO\.\s*:\s*([^\]]+)\]/i);
    return m ? m[1].trim() : "";
}

// Extract "Tentatively case may be listed on" date
// Checks: 1) explicit field  2) exact raw.table keys  3) fuzzy key scan
function extractLikelyListedOn(data: any): string {
    // 1. Explicit top-level field
    if (data.likelyListedOn) return parseSCDate(data.likelyListedOn);

    const table: Record<string, string> = data.raw?.table ?? {};

    // 2. Exact key matches
    const exactVal =
        table["Tentatively case may be listed on (likely to be listed on)"] ||
        table["Tentatively case may be listed on"] ||
        table["Likely to be listed on"] ||
        table["likely to be listed on"] ||
        "";
    if (exactVal) {
        return parseSCDate(exactVal);
    }

    // 3. Fuzzy scan — handles any casing/spacing the SC website may use
    const fuzzyKey = Object.keys(table).find(k => {
        const l = k.toLowerCase();
        return l.includes("tentativ") || l.includes("likely to be listed");
    });
    if (fuzzyKey) {
        return parseSCDate(table[fuzzyKey]);
    }

    return "";
}

function parseCaseType(caseNumberFull: string): { caseType: string; shortCaseNumber: string } {
    if (!caseNumberFull) return { caseType: "SLP(C)", shortCaseNumber: "" };
    const match = caseNumberFull.match(/^(.+?)\s+(?:No\.?\s*)?(\d+\/\d+)\s*$/i);
    if (match) {
        return { caseType: match[1].trim(), shortCaseNumber: match[2].trim() };
    }
    const parts = caseNumberFull.trim().split(/\s+/);
    const last = parts[parts.length - 1];
    return {
        caseType: parts.slice(0, -1).join(" ") || caseNumberFull,
        shortCaseNumber: last,
    };
}

function determineStatus(badge: string): "Fresh" | "Pending" | "Disposed" {
    const b = (badge || "").toUpperCase().trim();
    if (b === "DISPOSED" || b === "DISPOSED OF") return "Disposed";
    if (b === "FRESH") return "Fresh";
    return "Pending";
}

function splitParties(
    raw: string | null | undefined
): string[] {
    if (!raw) return []

    // SC API format uses numbered prefixes:
    // Top level parties: 1, 2, 3
    // Sub parties: 1.1, 1.2, 1.3
    //
    // RULE: Only count TOP LEVEL parties
    // (1, 2, 3) as separate persons.
    // Sub parties (1.1, 1.2) are the SAME
    // person with multiple LRS/heirs.
    // Do NOT count sub parties separately.
    //
    // Example:
    // "1 RAJESH (DEAD) THROUGH LRS
    //  1.1 SMT. PUSHPA DEVI
    //  1.2 DHARMENDRA BUGALIA"
    // = 1 top level party (RAJESH)
    //   with 2 sub parties (heirs)
    // Count = 1 person

    // Split by top-level number pattern
    // Match: start of string OR 
    // number followed by space that is
    // NOT preceded by a decimal
    const cleanRaw = (raw || "").trim()

    // Find positions of top-level numbers
    // like "1 ", "2 ", "3 " 
    // but not "1.1 ", "1.2 "
    const parts = cleanRaw.split(
        /(?=(?<!\d\.\d)\b[1-9]\d*\s+[A-Z])/
    )

    const topLevelParts = parts
        .map(p => p.trim())
        .filter(p => p.length > 0)
        // Only keep top-level entries
        // (start with digit NOT preceded by dot)
        .filter(p => /^[1-9]\d*\s/.test(p) &&
            !/^\d+\.\d/.test(p))

    if (topLevelParts.length === 0) {
        // Fallback: return the whole string
        // as one party if pattern not found
        return [cleanRaw
            .replace(/^\d+\s+/, '')
            .replace(/\d+\.\d+\s+[^1-9]*/g, '')
            .trim()
        ]
    }

    // Extract just the first party name
    // Remove the leading number
    return topLevelParts.map(p =>
        p.replace(/^\d+\s+/, '').trim()
    )
}

// ── ADVOCATE PARSING ──────────────────────────────────────────────────────────
/**
 * Parse the concatenated advocate string from the SC API into a clean array.
 * Input:  "K. PAARI VENDHAN[P-1]K. PAARI VENDHAN[P-1.1]SOME OTHER[P-2]"
 * Output: ["K. PAARI VENDHAN", "SOME OTHER"]
 * Deduplicates so each advocate name appears only once.
 */
function parseAdvocateString(raw: string): string[] {
    if (!raw) return [];
    // Split on each occurrence of a name followed by a bracket tag like [P-1] or [R-2.1]
    const matches = raw.match(/([^[]+)\[[PR]-[\d.]+\]/g) || [];
    const names = matches
        .map(m => m.replace(/\[[PR]-[\d.]+\]$/, '').trim())
        .filter(Boolean);
    // Deduplicate preserving order
    return [...new Set(names)];
}

/**
 * Auto-detect which side the logged-in advocate is on by comparing aorName
 * (from localStorage lextgress_user) against the petitioner/respondent advocate lists.
 * Returns 'petitioner', 'respondent', or null if no match / aorName not set.
 */
function detectOurSide(
    petitionerAdvocates: string[],
    respondentAdvocates: string[]
): 'petitioner' | 'respondent' | null {
    try {
        const userRaw = localStorage.getItem('lextgress_user');
        if (!userRaw) return null;
        const user = JSON.parse(userRaw);
        const aorName: string = (user.aorName || '').trim().toUpperCase();
        if (!aorName) return null;

        const normalize = (s: string) => s.trim().toUpperCase();
        if (petitionerAdvocates.some(a => normalize(a) === aorName)) return 'petitioner';
        if (respondentAdvocates.some(a => normalize(a) === aorName)) return 'respondent';
        return null;
    } catch {
        return null;
    }
}

export function transformApiToCase(apiResponse: any): any {
    const { data, query } = apiResponse;


    const { caseType, shortCaseNumber } = parseCaseType(data.caseNumber || "");
    const petitioners = splitParties(data.petitioner);
    const respondents = splitParties(data.respondent);
    const status = determineStatus(data.caseStatusBadge);
    const now = new Date().toISOString();
    const caseId = `case-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const caseNumberDisplay = data.caseNumber || `${caseType} No. ${shortCaseNumber}`;

    const lastListedOn = parseSCDate(data.lastListedOn);
    const likelyListedOn = extractLikelyListedOn(data);
    const itemNo = extractItemNo(data.lastListedOn);

    let nextHearingFromStage = "";
    if (data.stage) {
        const sm = data.stage.match(/List On\s*\(?Date\)?\s*[\(-]([^)-]+)[\)-]/i);
        if (sm) nextHearingFromStage = parseSCDate(sm[1]);
    }

    let nextHearingConfirmed = likelyListedOn || nextHearingFromStage;
    if (lastListedOn) {
        const llDate = new Date(lastListedOn);
        const today = new Date(); today.setHours(0, 0, 0, 0);
        if (!isNaN(llDate.getTime()) && llDate >= today) {
            nextHearingConfirmed = nextHearingConfirmed || lastListedOn;
        }
    }


    // FEATURE 1, 2, 4, 6: Trigger Auto-Task Generator and Risk Flag based on Rule Engine
    const triageData = generateLegalTasks(caseType, status, nextHearingConfirmed);

    // Add these new fields:
    const petitionerRaw = data.petitioner || data.raw?.table?.['Petitioner(s)'] || '';
    const respondentRaw = data.respondent || data.raw?.table?.['Respondent(s)'] || '';

    // ── ADVOCATE PARSING & SIDE DETECTION ──────────────────────────────────────
    const petitionerAdvocatesRaw = data.petitionerAdvocates || data.petitioner_advocates || '';
    const respondentAdvocatesRaw = data.respondentAdvocates || data.respondent_advocates || '';
    const petitionerAdvocates = parseAdvocateString(petitionerAdvocatesRaw);
    const respondentAdvocates = parseAdvocateString(respondentAdvocatesRaw);
    const ourSide = detectOurSide(petitionerAdvocates, respondentAdvocates);

    return {
        id: caseId,
        petitioners,
        respondents,
        caseType,
        shortCaseNumber,
        caseNumber: caseNumberDisplay,
        diaryNumber: String(query.diary_no || "").trim(),
        diaryYear: String(query.diary_year || "").trim(),
        cnrNumber: data.cnr || "",
        status,
        nextHearingDate: nextHearingConfirmed || null,
        lastListedOn: lastListedOn,
        likelyListedOn: likelyListedOn,
        advanceList: { published: false, date: null, presentInList: false },
        finalList: { published: false, date: null, presentInList: false },
        lastCheckedAt: now,
        labels: [],
        lastListedJudges: extractJudges(data.lastListedOn),
        finalListJudges: [],
        courtName: "Supreme Court of India",
        courtNumber: "Court No. 1",
        timeOfSitting: "10:30 AM",
        dateOfFiling: parseSCDate(data.filed) || now.split("T")[0],
        earlierCourtDetails: "—",
        officeReportUrl: generateOfficeReportUrl(query.diary_no.toString(), query.diary_year.toString()),
        lastOrdersUrl: generateLastOrderUrl(query.diary_no.toString(), query.diary_year.toString()),
        stage: data.stage || "",
        lastListedOnRaw: data.lastListedOn || "",
        scSyncedAt: now,
        summary: "",
        listings: lastListedOn ? [{
            id: "l_auto_" + Date.now(),
            date: lastListedOn,
            type: data.caseStatusBadge === "Disposed" ? "Disposed" : (nextHearingConfirmed === lastListedOn ? "List On (Date)" : "Listed"),
            bench: extractJudges(data.lastListedOn).join(", ") || "",
            court: "",
            item: itemNo,
            notes: "Auto-synced from Supreme Court Database",
        }] : [],

        // Key Risk Flag (Feature 3)
        keyRisk: triageData.keyRisk,
        tasks: triageData.tasks,

        notes: [
            {
                id: "n" + Date.now(),
                text: `Case retrieved from Supreme Court of India database on ${new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}.`,
                createdAt: now,
            },
        ],
        documents: [],
        applications: [],
        timeline: [
            {
                id: "tl" + Date.now(),
                date: parseSCDate(data.filed) || now.split("T")[0],
                event: "Case filed in Supreme Court",
                type: "filing",
            },
        ],
        archived: false,
        
        petitioner: petitionerRaw,
        respondent: respondentRaw,
        parties: data.parties || '',

        // ── Advocate lists & side detection ────────────────────────────────────
        // petitionerAdvocates / respondentAdvocates: parsed from SC API advocate string
        //   e.g. "K. PAARI VENDHAN[P-1]..." → ["K. PAARI VENDHAN"]
        // ourSide: auto-detected by matching aorName (from lextgress_user) against each list
        //   'petitioner' | 'respondent' | null (null = no match or aorName not set)
        petitionerAdvocates,
        respondentAdvocates,
        ourSide,

        // formatted title ready to display
        displayTitle: formatCaseTitle({
            petitioner: petitionerRaw,
            respondent: respondentRaw,
            parties: data.parties
        })
    };
}

export default function SearchCaseForm({ onCaseFound, onError, theme: T, onViewDetail }: SearchCaseFormProps) {
    const [activeTab, setActiveTab] = useState<"diary" | "aor">("diary");

    // Diary Search State
    const [diaryNumber, setDiaryNumber] = useState("");
    const [year, setYear] = useState(new Date().getFullYear().toString());
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [showScanner, setShowScanner] = useState(false);

    // AOR Search State
    const [aorName, setAorName] = useState("");
    const [aorNumber, setAorNumber] = useState("");
    const [fromYear, setFromYear] = useState("2020");
    const [toYear, setToYear] = useState("2026");
    const [caseType, setCaseType] = useState("All Case Types");
    const [isSearchingAOR, setIsSearchingAOR] = useState(false);
    const [aorResults, setAorResults] = useState<any[]>([]);
    const [showAorComingSoon, setShowAorComingSoon] = useState(false);
    const [recentSearches] = useState<any[]>(() => {
        try {
            const saved = localStorage.getItem(RECENT_SEARCHES_KEY);
            return saved ? JSON.parse(saved) : [];
        } catch { return []; }
    });

    // Diary search history (Part 6)
    const [diarySearchHistory, setDiarySearchHistory] = useState<SearchHistoryEntry[]>(() => loadSearchHistory());

    // Pagination & Sorting
    const [currentPage, setCurrentPage] = useState(1);
    const [resultsSortBy, setResultsSortBy] = useState<"year" | "title" | "type">("year");
    const [resultsSortOrder, setResultsSortOrder] = useState<"asc" | "desc">("desc");

    const pageSize = 20;


    const handleAORSearch = async () => {
        // Input validation — still enforced
        if (!aorName.trim()) {
            setError("Advocate on Record Name is required.");
            return;
        }
        if (parseInt(fromYear) > parseInt(toYear)) {
            setError("From year cannot be greater than To year.");
            return;
        }

        setIsSearchingAOR(true);
        setError(null);
        setAorResults([]);
        setCurrentPage(1);
        setShowAorComingSoon(false);

        try {
            const result = await searchCases({
                advocates: aorName.trim(),
                filingDateFrom: `${fromYear}-01-01`,
                filingDateTo: `${toYear}-12-31`,
                state: 'SC',
                pageSize: 50,
            });
            const results = result?.data?.results || [];
            if (results.length === 0) {
                setError("No cases found. Try a different name or date range.");
            } else {
                setAorResults(results);
            }
        } catch (err) {
            setError("Error searching cases. Please try again.");
        } finally {
            setIsSearchingAOR(false);
        }
    };


    const sortedResults = [...aorResults].sort((a, b) => {
        let valA, valB;
        if (resultsSortBy === "year") {
            valA = parseInt(a.diaryYear || a.year || "0");
            valB = parseInt(b.diaryYear || b.year || "0");
        } else if (resultsSortBy === "title") {
            valA = a.caseTitle || "";
            valB = b.caseTitle || "";
        } else {
            valA = a.caseType || "";
            valB = b.caseType || "";
        }

        if (valA < valB) return resultsSortOrder === "asc" ? -1 : 1;
        if (valA > valB) return resultsSortOrder === "asc" ? 1 : -1;
        return 0;
    });

    const paginatedResults = sortedResults.slice((currentPage - 1) * pageSize, currentPage * pageSize);
    const totalPages = Math.ceil(sortedResults.length / pageSize);

    const toggleSort = (key: "year" | "title" | "type") => {
        if (resultsSortBy === key) {
            setResultsSortOrder(resultsSortOrder === "asc" ? "desc" : "asc");
        } else {
            setResultsSortBy(key);
            setResultsSortOrder("desc");
        }
    };

    const [addingCaseId, setAddingCaseId] = useState<string | null>(null);

    const handleAddToDashboard = async (caseInfo: any) => {
        const cnr = caseInfo.cnr || caseInfo.cnrNumber;
        setAddingCaseId(cnr || caseInfo.id || 'loading');
        try {
            if (!cnr) { alert("No CNR number available for this case."); return; }
            const data = await fetchCaseFullByCNR(cnr);
            if (data) {
                const fullCaseData = transformMCPToCase(data, cnr);
                onCaseFound(fullCaseData);
            } else {
                alert("Could not fetch case details. Please try again.");
            }
        } catch (err) {
            alert("Error adding case to dashboard.");
        } finally {
            setAddingCaseId(null);
        }
    };

    // ── SC proxy response cache (6-hour TTL) ──────────────────────────────────
    // Prevents burning API credits when the same diary number is re-searched
    // within the same session or within 6 hours.
    const SC_CACHE_TTL = 6 * 60 * 60 * 1000; // 6 hours
    const getSCCache = (diaryNo: string, yr: string) => {
        try {
            const raw = localStorage.getItem(`lx_sc_case_${diaryNo}_${yr}`);
            if (!raw) return null;
            const { data, ts } = JSON.parse(raw);
            if (Date.now() - ts < SC_CACHE_TTL) return data;
            localStorage.removeItem(`lx_sc_case_${diaryNo}_${yr}`);
        } catch {}
        return null;
    };
    const setSCCache = (diaryNo: string, yr: string, data: any) => {
        try {
            localStorage.setItem(`lx_sc_case_${diaryNo}_${yr}`, JSON.stringify({ data, ts: Date.now() }));
        } catch {}
    };

    const handleSearch = async () => {
        // ── Demo account search limit check ───────────────────────────────────
        try {
            const userRaw = localStorage.getItem('lextgress_user');
            if (userRaw) {
                const user = JSON.parse(userRaw);
                const limit = getDemoSearchLimit(user.email);
                if (limit !== null) {
                    const used = getDemoSearchCount(user.email);
                    if (used >= limit) {
                        setError(`Trial limit reached (${used}/${limit} searches used). Please contact us to upgrade your account.`);
                        return;
                    }
                }
            }
        } catch { /* ignore */ }

        const input = diaryNumber.trim();
        if (!input) {
            setError("Please enter a diary number or CNR number.");
            return;
        }

        // Auto-detect input type:
        // - Numeric (e.g. 542) → diary number → derive CNR: SCIN01 + padded to 6 digits + year
        // - Starts with SCIN (e.g. SCIN010005422026) → use directly as CNR
        let cnr: string;
        if (/^\d+$/.test(input)) {
            cnr = `SCIN01${input.padStart(6, '0')}${year}`;
        } else if (/^SCIN/i.test(input)) {
            cnr = input.toUpperCase();
        } else {
            setError("Enter a diary number (e.g., 542) or a CNR number (e.g., SCIN010005422026).");
            return;
        }

        setIsLoading(true);
        setError(null);

        try {
            let caseData: any = null;

            // ── Fetch by CNR (derived from diary number or entered directly) ────
            const rawData = await fetchCaseFullByCNR(cnr);
            if (rawData) {
                caseData = transformMCPToCase(rawData, cnr);
            }

            if (!caseData) {
                const msg = "Case not found. Please check the diary number and year, or the CNR number.";
                setError(msg);
                onError?.(msg);
                return;
            }

            if (!caseData) {
                const msg = "Could not process case data. Please try again.";
                setError(msg);
                onError?.(msg);
                return;
            }

            onCaseFound(caseData);

            // Increment demo search counter if applicable
            try {
                const userRaw = localStorage.getItem('lextgress_user');
                if (userRaw) {
                    const user = JSON.parse(userRaw);
                    if (getDemoSearchLimit(user.email) !== null) {
                        incrementDemoSearchCount(user.email);
                    }
                }
            } catch { /* ignore */ }

            // Part 6 — persist diary search history
            saveSearchHistory(input, year);
            setDiarySearchHistory(loadSearchHistory());

            setDiaryNumber("");
        } catch (err: any) {
            let msg = "An unexpected error occurred. Please try again.";
            if (axios.isAxiosError(err)) {
                if (err.code === "ECONNABORTED") {
                    msg = "Request timed out. The Supreme Court server may be busy.";
                } else if (err.response) {
                    if (err.response.status === 429) {
                        msg = "Supreme Court website is temporarily blocking requests (rate limit reached).";
                    } else if (err.response.status === 400) {
                        msg = `API Error 400: Bad Request. Check parameters.`;
                    } else {
                        msg = `API Error ${err.response.status}: ${err.response.statusText}`;
                    }
                } else if (err.request) {
                    msg = "Could not reach the Supreme Court API. Please check your connection.";
                }
            } else {
                msg = String(err?.message || err) || msg;
            }
            setError(msg);
            onError?.(msg);
        } finally {
            setIsLoading(false);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === "Enter") handleSearch();
    };

    return (
        <div style={{
            background: T.surface,
            border: `1px solid ${T.border}`,
            borderRadius: 16,
            padding: "24px 0",
            marginBottom: 24,
            boxShadow: T.shadow,
            overflow: "hidden"
        }}>
            {/* Tabs */}
            <div style={{ display: "flex", borderBottom: `1px solid ${T.border}`, padding: "0 28px", marginBottom: 24 }}>
                <button
                    onClick={() => { setActiveTab("diary"); setError(null); }}
                    style={{
                        padding: "12px 20px",
                        background: "none",
                        border: "none",
                        borderBottom: `3px solid ${activeTab === "diary" ? "#C9A84C" : "transparent"}`,
                        color: activeTab === "diary" ? T.text : T.textMuted,
                        fontWeight: 700,
                        fontSize: 15,
                        cursor: "pointer",
                        transition: "all 0.2s"
                    }}
                >
                    🔍 Search by Diary No.
                </button>
                <button
                    onClick={() => { setActiveTab("aor"); setError(null); }}
                    style={{
                        padding: "12px 20px",
                        background: "none",
                        border: "none",
                        borderBottom: `3px solid ${activeTab === "aor" ? "#C9A84C" : "transparent"}`,
                        color: activeTab === "aor" ? T.text : T.textMuted,
                        fontWeight: 700,
                        fontSize: 15,
                        cursor: "pointer",
                        transition: "all 0.2s"
                    }}
                >
                    👤 Search by AOR
                </button>
            </div>

            <div style={{ padding: "0 28px" }}>
                {activeTab === "diary" ? (
                    <>
                        {/* Header */}
                        <div style={{ display: "flex", alignItems: "flex-start", gap: 16, marginBottom: 20 }}>
                            <div style={{
                                width: 48, height: 48, borderRadius: 12,
                                background: "linear-gradient(135deg,#1A2E5E,#2A4B9B)",
                                display: "flex", alignItems: "center", justifyContent: "center",
                                fontSize: 22, color: "#C9A84C",
                                flexShrink: 0,
                                boxShadow: "0 4px 12px rgba(15,28,63,0.2)",
                            }}>
                                📄
                            </div>
                            <div>
                                <div style={{ fontWeight: 800, fontSize: 18, color: T.text, letterSpacing: -0.3, marginBottom: 4 }}>
                                    Search by Diary Number
                                </div>
                                <div style={{ fontSize: 14, color: T.textMuted, lineHeight: 1.5 }}>
                                    Enter a diary number (e.g., 542) with the year, or paste a full CNR number (e.g., SCIN010005422026).
                                </div>
                            </div>
                        </div>

                        {/* Inputs & Button Row */}
                        <div style={{ display: "flex", gap: 12, marginBottom: 16, alignItems: "center", flexWrap: "wrap" }}>
                            <input
                                type="text"
                                value={diaryNumber}
                                onChange={(e) => { setDiaryNumber(e.target.value); setError(null); }}
                                onKeyDown={handleKeyDown}
                                placeholder="Diary No. (e.g., 542) or CNR (e.g., SCIN010005422026)"
                                aria-label="Diary Number or CNR Number"
                                style={{
                                    flex: "2",
                                    minWidth: 200,
                                    padding: "12px 14px",
                                    borderRadius: 8,
                                    border: `1px solid ${T.border}`,
                                    fontSize: 15,
                                    color: T.text,
                                    background: T.bg,
                                    outline: "none",
                                    fontFamily: "inherit",
                                }}
                            />

                            <select
                                value={year}
                                onChange={(e) => setYear(e.target.value)}
                                aria-label="Year"
                                style={{
                                    padding: "12px 10px",
                                    borderRadius: 8,
                                    border: `1px solid ${T.border}`,
                                    fontSize: 15,
                                    color: T.text,
                                    background: T.bg,
                                    outline: "none",
                                    fontFamily: "inherit",
                                    minWidth: 90,
                                    cursor: "pointer",
                                }}
                            >
                                {YEARS.map(y => (
                                    <option key={y} value={y}>{y}</option>
                                ))}
                            </select>

                            <button
                                onClick={handleSearch}
                                disabled={isLoading}
                                style={{
                                    flex: "1",
                                    minWidth: 120,
                                    padding: "12px 20px",
                                    borderRadius: 8,
                                    border: "none",
                                    background: isLoading ? "#9B7B28" : "linear-gradient(135deg,#C9A84C,#9B7B28)",
                                    color: "#fff",
                                    fontSize: 15,
                                    fontWeight: 700,
                                    cursor: isLoading ? "not-allowed" : "pointer",
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    gap: 8,
                                    transition: "opacity 0.2s",
                                    opacity: isLoading ? 0.75 : 1,
                                    boxShadow: "0 2px 10px rgba(201,168,76,0.3)",
                                }}
                            >
                                {isLoading ? (
                                    <>
                                        <span style={{ display: "inline-block", width: 16, height: 16, border: "2px solid rgba(255,255,255,0.4)", borderTop: "2px solid #fff", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
                                        Searching
                                    </>
                                ) : (
                                    <>🔍 Lookup</>
                                )}
                            </button>

                            {/* Demo search counter badge */}
                            {(() => {
                                try {
                                    const userRaw = localStorage.getItem('lextgress_user');
                                    if (!userRaw) return null;
                                    const user = JSON.parse(userRaw);
                                    const limit = getDemoSearchLimit(user.email);
                                    if (limit === null) return null;
                                    const used = getDemoSearchCount(user.email);
                                    const remaining = limit - used;
                                    const isLow = remaining <= 10;
                                    return (
                                        <div style={{ fontSize: 11, fontWeight: 700, color: isLow ? "#C62828" : "#6B7280", background: isLow ? "#FEF2F2" : "#F3F4F6", border: `1px solid ${isLow ? "#FECACA" : "#E5E7EB"}`, borderRadius: 6, padding: "4px 10px", whiteSpace: "nowrap", alignSelf: "center" }}>
                                            {remaining > 0 ? `${used}/${limit} searches used` : `⛔ Limit reached (${limit}/${limit})`}
                                        </div>
                                    );
                                } catch { return null; }
                            })()}

                            <button
                                onClick={() => setShowScanner(true)}
                                title="Scan court document"
                                style={{
                                    padding: "12px 16px",
                                    borderRadius: 8,
                                    border: `1px solid ${T.border}`,
                                    background: T.surface,
                                    color: T.text,
                                    fontSize: 15,
                                    fontWeight: 700,
                                    cursor: "pointer",
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 6,
                                    whiteSpace: "nowrap",
                                }}
                            >
                                📷 Scan
                            </button>
                        </div>
                        {/* Recent diary searches – Part 6 */}
                        {diarySearchHistory.length > 0 && (
                            <div style={{ marginTop: 4, marginBottom: 4 }}>
                                <div style={{ fontSize: 12, fontWeight: 700, color: T.textMuted, letterSpacing: 0.8, marginBottom: 8 }}>
                                    Recent:
                                </div>
                                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                                    {diarySearchHistory.map((h, idx) => (
                                        <button
                                            key={idx}
                                            onClick={() => {
                                                setDiaryNumber(h.diary_number);
                                                setYear(h.year);
                                            }}
                                            title={`Search ${h.diary_number}/${h.year}`}
                                            style={{
                                                padding: "5px 12px",
                                                borderRadius: 20,
                                                border: `1px solid ${T.borderSoft}`,
                                                background: T.bg,
                                                color: T.textSub,
                                                fontSize: 12,
                                                cursor: "pointer",
                                                display: "flex",
                                                alignItems: "center",
                                                gap: 5,
                                                fontFamily: "monospace",
                                                fontWeight: 600,
                                            }}
                                        >
                                            <span style={{ fontSize: 11 }}>🕒</span>
                                            {h.diary_number}/{h.year}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}
                    </>
                ) : (
                    <>
                        {/* AOR Search UI */}
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16, marginBottom: 20 }}>
                            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                                <label style={{ fontSize: 13, fontWeight: 700, color: T.textSub }}>Advocate on Record Name</label>
                                <input
                                    type="text"
                                    value={aorName}
                                    onChange={(e) => { setAorName(e.target.value); setError(null); }}
                                    placeholder="Enter AOR full name..."
                                    style={{ padding: "11px 13px", borderRadius: 8, border: `1px solid ${T.border}`, background: T.bg, color: T.text, fontSize: 14, outline: "none" }}
                                />
                            </div>
                            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                                <label style={{ fontSize: 13, fontWeight: 700, color: T.textSub }}>AOR Registration Number</label>
                                <input
                                    type="text"
                                    value={aorNumber}
                                    onChange={(e) => { setAorNumber(e.target.value); setError(null); }}
                                    placeholder="Enter AOR number (optional)..."
                                    style={{ padding: "11px 13px", borderRadius: 8, border: `1px solid ${T.border}`, background: T.bg, color: T.text, fontSize: 14, outline: "none" }}
                                />
                            </div>
                            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                                <label style={{ fontSize: 13, fontWeight: 700, color: T.textSub }}>Show cases from year</label>
                                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                                    <select
                                        value={fromYear}
                                        onChange={(e) => setFromYear(e.target.value)}
                                        style={{ flex: 1, padding: "11px", borderRadius: 8, border: `1px solid ${T.border}`, background: T.bg, color: T.text, fontSize: 14, outline: "none" }}
                                    >
                                        {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
                                    </select>
                                    <span style={{ color: T.textMuted }}>to</span>
                                    <select
                                        value={toYear}
                                        onChange={(e) => setToYear(e.target.value)}
                                        style={{ flex: 1, padding: "11px", borderRadius: 8, border: `1px solid ${T.border}`, background: T.bg, color: T.text, fontSize: 14, outline: "none" }}
                                    >
                                        {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
                                    </select>
                                </div>
                            </div>
                            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                                <label style={{ fontSize: 13, fontWeight: 700, color: T.textSub }}>Filter by Case Type</label>
                                <select
                                    value={caseType}
                                    onChange={(e) => setCaseType(e.target.value)}
                                    style={{ padding: "11px", borderRadius: 8, border: `1px solid ${T.border}`, background: T.bg, color: T.text, fontSize: 14, outline: "none" }}
                                >
                                    <option>All Case Types</option>
                                    {CASE_TYPES_FULL.map(t => <option key={t} value={t}>{t}</option>)}
                                </select>
                            </div>
                        </div>

                        <div style={{ display: "flex", gap: 12, marginBottom: 24 }}>
                            <button
                                onClick={handleAORSearch}
                                disabled={isSearchingAOR}
                                style={{
                                    padding: "12px 24px",
                                    borderRadius: 9,
                                    border: "none",
                                    background: isSearchingAOR ? "#9B7B28" : "linear-gradient(135deg,#C9A84C,#9B7B28)",
                                    color: "#fff",
                                    fontSize: 15,
                                    fontWeight: 700,
                                    cursor: isSearchingAOR ? "not-allowed" : "pointer",
                                    flex: 1,
                                    boxShadow: "0 2px 10px rgba(201,168,76,0.3)"
                                }}
                            >
                                {isSearchingAOR ? "Fetching cases from Supreme Court database..." : "Search Cases"}
                            </button>
                            <button
                                onClick={() => {
                                    setAorName("");
                                    setAorNumber("");
                                    setFromYear("2020");
                                    setToYear("2026");
                                    setCaseType("All Case Types");
                                    setAorResults([]);
                                    setError(null);
                                    setShowAorComingSoon(false);
                                }}
                                style={{
                                    padding: "12px 24px",
                                    borderRadius: 9,
                                    border: `1px solid ${T.border}`,
                                    background: T.bg,
                                    color: T.textSub,
                                    fontSize: 15,
                                    fontWeight: 700,
                                    cursor: "pointer"
                                }}
                            >
                                Clear
                            </button>
                        </div>

                        {/* Recent Searches */}
                        {recentSearches.length > 0 && (
                            <div style={{ marginBottom: 24 }}>
                                <div style={{ fontSize: 12, fontWeight: 800, color: T.textMuted, letterSpacing: 1, marginBottom: 8, textTransform: "uppercase" }}>Recent Searches:</div>
                                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                                    {recentSearches.map((s, idx) => (
                                        <button
                                            key={idx}
                                            onClick={() => {
                                                setAorName(s.name);
                                                setFromYear(s.from);
                                                setToYear(s.to);
                                                // Trigger search automatically if user prefers, but letting them review is safer
                                            }}
                                            style={{
                                                padding: "6px 12px",
                                                borderRadius: 20,
                                                border: `1px solid ${T.borderSoft}`,
                                                background: T.bg,
                                                color: T.textSub,
                                                fontSize: 13,
                                                cursor: "pointer",
                                                display: "flex",
                                                alignItems: "center",
                                                gap: 5
                                            }}
                                        >
                                            <span style={{ fontSize: 11 }}>🕒</span> {s.name} ({s.from}-{s.to})
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}
                    </>
                )}

                {/* Error Banner */}
                {error && (
                    <div style={{ marginBottom: 20, padding: "12px 16px", background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 10, fontSize: 14, color: "#C62828", display: "flex", alignItems: "center", gap: 10 }} role="alert">
                        <span style={{ fontSize: 18 }}>⚠️</span><span>{error}</span>
                    </div>
                )}

                {/* AOR Coming Soon Card */}
                {activeTab === "aor" && showAorComingSoon && (
                    <div style={{
                        textAlign: 'center', padding: '32px 24px', marginTop: 16,
                        background: '#F8F9FF', borderRadius: 12, border: '1px dashed #C0C8FF',
                    }}>
                        <div style={{ fontSize: 36, marginBottom: 12 }}>🔍</div>
                        <div style={{ fontWeight: 700, fontSize: 16, color: '#1E3A8A', marginBottom: 6 }}>
                            AOR Search — Coming Soon
                        </div>
                        <div style={{ fontSize: 13, color: '#64748B', lineHeight: 1.7, maxWidth: 380, margin: '0 auto' }}>
                            Search by Advocate on Record will be available once the SC eCourt API
                            integration is complete.
                            <br />
                            All diary number search features are fully functional now.
                        </div>
                        <button
                            onClick={() => { setShowAorComingSoon(false); setActiveTab('diary'); }}
                            style={{ marginTop: 16, padding: '8px 20px', borderRadius: 8, border: 'none', background: 'linear-gradient(135deg,#C9A84C,#9B7B28)', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
                        >
                            Switch to Diary Search
                        </button>
                    </div>
                )}

                {/* Results Table (Local View for AOR Search) */}
                {activeTab === "aor" && aorResults.length > 0 && (
                    <div style={{ marginTop: 24, borderTop: `1px solid ${T.borderSoft}`, paddingTop: 24 }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
                            <div style={{ fontSize: 15, fontWeight: 700, color: T.text }}>
                                Showing {(currentPage - 1) * pageSize + 1} to {Math.min(currentPage * pageSize, aorResults.length)} of {aorResults.length} results
                            </div>
                            <div style={{ display: "flex", gap: 8 }}>
                                <button
                                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                    disabled={currentPage === 1}
                                    style={{ padding: "6px 12px", borderRadius: 6, border: `1px solid ${T.border}`, background: T.bg, color: currentPage === 1 ? T.textMuted : T.text, cursor: currentPage === 1 ? "not-allowed" : "pointer", fontSize: 13, fontWeight: 600 }}
                                >
                                    Previous
                                </button>
                                <button
                                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                    disabled={currentPage === totalPages}
                                    style={{ padding: "6px 12px", borderRadius: 6, border: `1px solid ${T.border}`, background: T.bg, color: currentPage === totalPages ? T.textMuted : T.text, cursor: currentPage === totalPages ? "not-allowed" : "pointer", fontSize: 13, fontWeight: 600 }}
                                >
                                    Next
                                </button>
                            </div>
                        </div>

                        <div style={{ overflowX: "auto" }}>
                            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
                                <thead>
                                    <tr style={{ borderBottom: `2px solid ${T.border}`, textAlign: "left" }}>
                                        <th style={{ padding: "12px 8px", color: T.textMuted, fontWeight: 700 }}>S.No</th>
                                        <th style={{ padding: "12px 8px", color: T.textMuted, fontWeight: 700, cursor: "pointer" }}>Case Number</th>
                                        <th style={{ padding: "12px 8px", color: T.textMuted, fontWeight: 700, cursor: "pointer" }} onClick={() => toggleSort("title")}>
                                            Case Title {resultsSortBy === "title" && (resultsSortOrder === "asc" ? "↑" : "↓")}
                                        </th>
                                        <th style={{ padding: "12px 8px", color: T.textMuted, fontWeight: 700, cursor: "pointer" }} onClick={() => toggleSort("type")}>
                                            Case Type {resultsSortBy === "type" && (resultsSortOrder === "asc" ? "↑" : "↓")}
                                        </th>
                                        <th style={{ padding: "12px 8px", color: T.textMuted, fontWeight: 700, cursor: "pointer" }} onClick={() => toggleSort("year")}>
                                            Year {resultsSortBy === "year" && (resultsSortOrder === "asc" ? "↑" : "↓")}
                                        </th>
                                        <th style={{ padding: "12px 8px", color: T.textMuted, fontWeight: 700 }}>Status</th>
                                        <th style={{ padding: "12px 8px", color: T.textMuted, fontWeight: 700, textAlign: "right" }}>Action</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {paginatedResults.map((res, idx) => {
                                        const cId = res.id || `${res.diaryNumber}-${res.diaryYear}`;
                                        const isAdding = addingCaseId === cId;

                                        return (
                                            <tr key={idx} style={{ borderBottom: `1px solid ${T.borderSoft}`, verticalAlign: "middle" }}>
                                                <td style={{ padding: "16px 8px", color: T.textSub }}>{(currentPage - 1) * pageSize + idx + 1}</td>
                                                <td style={{ padding: "16px 8px", fontWeight: 700 }}>{res.caseNumber || `${res.diaryNumber}/${res.diaryYear}`}</td>
                                                <td style={{ padding: "16px 8px", color: T.text, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={res.caseTitle}>
                                                    {res.caseTitle || "Untitled Case"}
                                                </td>
                                                <td style={{ padding: "16px 8px" }}>
                                                    <span style={{ background: T.accentBg, color: T.accentDark, padding: "2px 8px", borderRadius: 4, fontSize: 12, fontWeight: 700 }}>
                                                        {res.caseType || "N/A"}
                                                    </span>
                                                </td>
                                                <td style={{ padding: "16px 8px" }}>{res.diaryYear || res.year}</td>
                                                <td style={{ padding: "16px 8px" }}>
                                                    <span style={{
                                                        color: res.status?.toLowerCase() === "disposed" ? "#1A8C5B" : "#C9A84C",
                                                        fontWeight: 700,
                                                        fontSize: 12,
                                                        textTransform: "uppercase"
                                                    }}>
                                                        {res.status || "Pending"}
                                                    </span>
                                                </td>
                                                <td style={{ padding: "16px 8px", textAlign: "right" }}>
                                                    <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                                                        <button
                                                            onClick={() => onViewDetail?.(res)}
                                                            style={{ padding: "6px 10px", borderRadius: 6, border: `1px solid ${T.border}`, background: T.bg, color: T.textSub, fontSize: 12, fontWeight: 700, cursor: "pointer" }}
                                                        >
                                                            View Details
                                                        </button>
                                                        <button
                                                            onClick={() => handleAddToDashboard(res)}
                                                            disabled={isAdding}
                                                            style={{
                                                                padding: "6px 10px",
                                                                borderRadius: 6,
                                                                border: "none",
                                                                background: isAdding ? T.textMuted : "linear-gradient(135deg,#1A2E5E,#2A4B9B)",
                                                                color: "#fff",
                                                                fontSize: 12,
                                                                fontWeight: 700,
                                                                cursor: isAdding ? "not-allowed" : "pointer"
                                                            }}
                                                        >
                                                            {isAdding ? "Adding..." : "Add to Dashboard"}
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
            </div>

            <style>{`
                @keyframes spin { to { transform: rotate(360deg); } }
            `}</style>

            {/* Scanner Modal */}
            {showScanner && (
                <div style={{ position: "fixed", inset: 0, zIndex: 9999, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
                    <div style={{ background: T.surface, borderRadius: 16, width: "100%", maxWidth: 640, maxHeight: "90vh", overflowY: "auto", boxShadow: "0 8px 40px rgba(0,0,0,0.35)" }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 18px", borderBottom: `1px solid ${T.border}` }}>
                            <span style={{ fontWeight: 800, fontSize: 15, color: T.text }}>📷 Document Scanner</span>
                            <button onClick={() => setShowScanner(false)} style={{ background: "none", border: "none", fontSize: 18, cursor: "pointer", color: T.textMuted, lineHeight: 1 }}>✕</button>
                        </div>
                        <div style={{ padding: 18 }}>
                            <DocumentScanner
                                onCaseFound={(c) => { onCaseFound(c as any); setShowScanner(false); }}
                                savedCases={[]}
                            />
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}