import React, { useState } from "react";
import axios from "axios";
import { Theme } from "../themes";
import DocumentScanner from "./DocumentScanner";

interface SearchCaseFormProps {
    onCaseFound: (caseData: any) => void;
    onError?: (err: string) => void;
    theme: Theme;
}

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
    const m = raw.match(/\[(.+)\]/);
    if (!m) return [];
    return m[1].split(/\band\b/i).map(j => j.replace(/HON'BLE\s+MR\.\s+/i, "").trim()).filter(Boolean);
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
        console.log("[LexTigress] likelyListedOn (exact):", exactVal);
        return parseSCDate(exactVal);
    }

    // 3. Fuzzy scan — handles any casing/spacing the SC website may use
    const fuzzyKey = Object.keys(table).find(k => {
        const l = k.toLowerCase();
        return l.includes("tentativ") || l.includes("likely to be listed");
    });
    if (fuzzyKey) {
        console.log("[LexTigress] likelyListedOn (fuzzy key):", fuzzyKey, "→", table[fuzzyKey]);
        return parseSCDate(table[fuzzyKey]);
    }

    // Log all keys so we can identify the correct one
    console.log("[LexTigress] raw.table keys:", JSON.stringify(Object.keys(table)));
    console.log("[LexTigress] raw.table full:", JSON.stringify(table));
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

function splitParties(raw: string | null | undefined): string[] {
    if (!raw) return ["Unknown"];
    const parts = raw.split(/\bAND\b|\b&\b/i).map(p => p.replace(/^\d+\.\s*/, "").trim()).filter(Boolean);
    return parts.length > 0 ? parts : ["Unknown"];
}

export function transformApiToCase(apiResponse: any): any {
    const { data, query } = apiResponse;

    // DEBUG: log full API data so we can verify all field names
    console.log("[LexTigress] Full API data:", JSON.stringify(data, null, 2));

    const { caseType, shortCaseNumber } = parseCaseType(data.caseNumber || "");
    const petitioners = splitParties(data.petitioner);
    const respondents = splitParties(data.respondent);
    const status = determineStatus(data.caseStatusBadge);
    const now = new Date().toISOString();
    const caseId = `case-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const caseNumberDisplay = data.caseNumber || `${caseType} No. ${shortCaseNumber}`;

    const lastListedOn = parseSCDate(data.lastListedOn);
    const likelyListedOn = extractLikelyListedOn(data);

    console.log("[LexTigress] lastListedOn raw:", data.lastListedOn, "→ parsed:", lastListedOn);
    console.log("[LexTigress] likelyListedOn →", likelyListedOn || "NOT FOUND");

    return {
        id: caseId,
        petitioners,
        respondents,
        caseType,
        shortCaseNumber,
        caseNumber: caseNumberDisplay,
        diaryNumber: query.diary_no,
        diaryYear: query.diary_year,
        cnrNumber: data.cnr || "",
        status,
        nextHearingDate: likelyListedOn || null,
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
        officeReportUrl: "#",
        lastOrdersUrl: "#",
        summary: "",
        listings: [],
        tasks: [],
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
    };
}

export default function SearchCaseForm({ onCaseFound, onError, theme: T }: SearchCaseFormProps) {
    const [diaryNumber, setDiaryNumber] = useState("");
    const [year, setYear] = useState(new Date().getFullYear().toString());
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [showScanner, setShowScanner] = useState(false);

    const handleSearch = async () => {
        const trimmed = diaryNumber.trim();
        if (!trimmed) {
            setError("Please enter a diary number.");
            return;
        }

        setIsLoading(true);
        setError(null);

        try {
            const response = await axios.get("/api/case", {
                // Use relative URL so the Vite proxy forwards to lex-t.vercel.app.
                // This fixes CORS failures when accessed via VS Code dev tunnels.
                params: { diary_no: trimmed, diary_year: year, language: "en" },
                timeout: 15000,
            });

            const apiData = response.data;

            if (!apiData.ok) {
                const msg = "Case not found. Please check the diary number and year.";
                setError(msg);
                onError?.(msg);
                return;
            }

            const caseData = transformApiToCase(apiData);
            onCaseFound(caseData);
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
            padding: "24px 28px",
            marginBottom: 24,
            boxShadow: T.shadow,
        }}>
            {/* Header matching original: Icon left, Title + Subtitle right */}
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
                        Supreme Court Case Lookup
                    </div>
                    <div style={{ fontSize: 14, color: T.textMuted, lineHeight: 1.5 }}>
                        Enter the diary number and year to fetch case details from the Supreme Court database.
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
                    placeholder="Diary Number (e.g., 1234)"
                    aria-label="Diary Number"
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

                <input
                    type="text"
                    value={year}
                    onChange={(e) => { setYear(e.target.value); setError(null); }}
                    onKeyDown={handleKeyDown}
                    placeholder="2026"
                    aria-label="Diary Year"
                    style={{
                        flex: "1",
                        minWidth: 100,
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

            {/* Error Banner */}
            {error && (
                <div style={{ marginBottom: 12, padding: "9px 14px", background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 9, fontSize: 14, color: "#C62828", display: "flex", alignItems: "center", gap: 7 }} role="alert">
                    <span aria-hidden="true">⚠</span><span>{error}</span>
                </div>
            )}

            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

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