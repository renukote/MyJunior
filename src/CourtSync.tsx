import { useState, useMemo, useEffect, useRef } from "react";
import { AppContext } from "./AppContext";
import { LIGHT_THEME, DARK_THEME } from "./themes";
import { ALL_LABELS, LABEL_COLORS, matchesSearch, sortCases, fmtDate, fmtDT, getDaysUntil, hearingLabel, Badge, DR, SectionHead, CaseInfoSection } from "./caseHelpers";
import SearchCaseForm from "./components/SearchCaseForm";
import { DonutChart, CourtBarChart, UpcomingHearings, CaseCard, GalleryCard, TableView, KanbanView } from "./components/CaseViews";
import { CaseSummarySection, ListingsSection, TimelineSection, TasksSection, NotesSection, DocumentsSection, ApplicationsSection } from "./components/DetailSections";
import { SearchInfo, BellPanel, ConfirmDialog, CaseModal } from "./components/Modals";

const LS_KEY = "courtsync_cases_v1";
function loadCases() { try { const r = localStorage.getItem(LS_KEY); if (r) return JSON.parse(r); } catch { } return []; }
function saveCases(cases: any[]) {
    try {
        const s = JSON.stringify(cases);
        if (s.length > 4 * 1024 * 1024) { console.warn("Storage approaching limit"); return false; }
        localStorage.setItem(LS_KEY, s); return true;
    } catch { return false; }
}

// ── TOP-LEVEL NAVIGATION (matches original sidebar) ───────────────────────────
const MAIN_NAV = [
    { id: "cases", label: "Cases", icon: "⚖" },
    { id: "tasks", label: "Tasks & Deadlines", icon: "✓" },
    { id: "documents", label: "Documents", icon: "📄" },
    { id: "ai", label: "AI Analysis Hub", icon: "✦" },
    { id: "service", label: "Service Status", icon: "📡" },
    { id: "notify", label: "Notifications", icon: "🔔" },
    { id: "voice", label: "Voice Notes", icon: "🎙" },
];

// Sub-filters shown only when Cases view is active
const CASE_FILTERS = [
    { label: "All Cases", icon: "▦" },
    { label: "Pending", icon: "⏱" },
    { label: "Fresh", icon: "✦" },
    { label: "Disposed", icon: "✓" },
];

const SORT_OPTIONS = [
    { value: "default", label: "Default" },
    { value: "hearing", label: "Hearing Date" },
    { value: "filing", label: "Filing Date" },
    { value: "status", label: "Status" },
    { value: "name", label: "Name (A–Z)" },
];

// ── COMING SOON PLACEHOLDER ───────────────────────────────────────────────────
function ComingSoon({ icon, title, subtitle, T }: { icon: string; title: string; subtitle: string; T: any }) {
    return (
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 20, padding: 40 }}>
            <div style={{
                width: 80, height: 80, borderRadius: 22,
                background: "linear-gradient(135deg,#1A2E5E,#2A4B9B)",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 36, boxShadow: "0 8px 32px rgba(15,28,63,0.2)",
            }}>{icon}</div>
            <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: 22, fontWeight: 800, color: T.text, marginBottom: 8, letterSpacing: -0.4 }}>{title}</div>
                <div style={{ fontSize: 15, color: T.textMuted, lineHeight: 1.8, maxWidth: 380 }}>{subtitle}</div>
            </div>
            <div style={{
                padding: "10px 24px", borderRadius: 30,
                background: "linear-gradient(135deg,#C9A84C,#9B7B28)",
                color: "#fff", fontSize: 14, fontWeight: 700,
                boxShadow: "0 4px 16px rgba(201,168,76,0.35)",
                letterSpacing: 0.3,
            }}>
                Coming Soon
            </div>
        </div>
    );
}

const COMING_SOON: Record<string, { icon: string; title: string; subtitle: string }> = {
    tasks: { icon: "✓", title: "Tasks & Deadlines", subtitle: "Track your case tasks, deadlines, and reminders all in one place. Set due dates, assign priorities, and never miss a court deadline again." },
    documents: { icon: "📁", title: "Documents", subtitle: "Securely store and organise all your case documents, pleadings, orders, and notices. Full-text search and version history coming soon." },
    ai: { icon: "✦", title: "AI Analysis Hub", subtitle: "Leverage AI to analyse judgments, predict outcomes, summarise case facts, and draft pleadings. Powered by advanced legal language models." },
    service: { icon: "📡", title: "Service Status", subtitle: "Monitor the real-time health of the Supreme Court API, listing services, and connected integrations from a single dashboard." },
    notify: { icon: "🔔", title: "Notifications", subtitle: "Get instant alerts when your case is listed, an order is uploaded, or a hearing date changes. Configure via email, SMS, or push." },
    voice: { icon: "🎙", title: "Voice Notes", subtitle: "Record voice memos during hearings, auto-transcribe them, and link them directly to case records for a seamless workflow." },
};

// ── MAIN COMPONENT ────────────────────────────────────────────────────────────
export default function CourtSync() {
    const [isDark, setIsDark] = useState(() => {
        try { const s = localStorage.getItem("courtsync_dark"); return s ? JSON.parse(s) : false; } catch { return false; }
    });
    const T = isDark ? DARK_THEME : LIGHT_THEME;

    const getS = (s: string) => {
        if (s === "Pending") return T.pending;
        if (s === "Fresh") return T.fresh;
        if (s === "Disposed") return T.disposed;
        return T.archived;
    };
    const hearingColor = (days: number | null): string => {
        if (days === null || days < 0) return T.textMuted;
        if (days === 0) return "#C62828";
        if (days <= 3) return "#9B7B28";
        return T.textMuted;
    };

    useEffect(() => { localStorage.setItem("courtsync_dark", JSON.stringify(isDark)); }, [isDark]);

    // ── STATE ──────────────────────────────────────────────────────────────────
    const [cases, setCases] = useState<any[]>(loadCases);
    const [activeView, setActiveView] = useState("cases");        // top-level nav
    const [statusFilter, setStatusFilter] = useState("All Cases");    // case sub-filter
    const [labelFilter, setLabelFilter] = useState<string[]>([]);
    const [searchTerm, setSearchTerm] = useState("");
    const [selected, setSelected] = useState<any>(null);
    const [collapsed, setCollapsed] = useState(false);
    const [showAdd, setShowAdd] = useState(false);
    const [showEdit, setShowEdit] = useState(false);
    const [detailClosed, setDetailClosed] = useState(false);
    const [activeTab, setActiveTab] = useState("courts");
    const [searchFocus, setSearchFocus] = useState(false);
    const [sortBy, setSortBy] = useState("default");
    const [showBell, setShowBell] = useState(false);
    const [showArchived, setShowArchived] = useState(false);
    const [viewMode, setViewMode] = useState("list");
    const [confirm, setConfirm] = useState<any>(null);
    const [successToast, setSuccessToast] = useState<string | null>(null);
    const [storageWarn, setStorageWarn] = useState(false);
    const bellRef = useRef<HTMLDivElement>(null);

    useEffect(() => { const ok = saveCases(cases); if (!ok) setStorageWarn(true); }, [cases]);
    useEffect(() => {
        if (!successToast) return;
        const t = setTimeout(() => setSuccessToast(null), 3000);
        return () => clearTimeout(t);
    }, [successToast]);

    // ── DERIVED ────────────────────────────────────────────────────────────────
    const activeCases = cases.filter(c => !c.archived);
    const counts = {
        Pending: activeCases.filter(c => c.status === "Pending").length,
        Fresh: activeCases.filter(c => c.status === "Fresh").length,
        Disposed: activeCases.filter(c => c.status === "Disposed").length,
    };
    const upcomingThisWeek = activeCases.filter(c => {
        const d = getDaysUntil(c.nextHearingDate);
        return d !== null && d >= 0 && d <= 7 && c.status !== "Disposed";
    }).length;

    const filtered = useMemo(() => {
        const pool = showArchived ? cases.filter(c => c.archived) : activeCases;
        const base = pool.filter(c => {
            const okStatus = statusFilter === "All Cases" || c.status === statusFilter;
            const okLabel = labelFilter.length === 0 || labelFilter.some(l => c.labels.includes(l));
            return okStatus && okLabel && matchesSearch(c, searchTerm);
        });
        return sortCases(base, sortBy);
    }, [cases, statusFilter, labelFilter, searchTerm, sortBy, showArchived]);

    const hasFilters = searchTerm || labelFilter.length > 0 || statusFilter !== "All Cases";

    // ── HANDLERS ───────────────────────────────────────────────────────────────
    function handleSaveCase(saved: any) {
        setCases(prev => {
            const idx = prev.findIndex(c => c.id === saved.id);
            if (idx === -1) return [saved, ...prev];
            const n = [...prev]; n[idx] = saved; return n;
        });
        setSelected(saved);
    }
    function handleArchiveToggle(caseId: string) {
        setCases(prev => prev.map(c => c.id === caseId ? { ...c, archived: !c.archived } : c));
        if (selected?.id === caseId) setSelected((p: any) => ({ ...p, archived: !p.archived }));
        setConfirm(null);
    }
    function handleDelete(caseId: string) {
        setCases(prev => prev.filter(c => c.id !== caseId));
        if (selected?.id === caseId) setSelected(null);
        setConfirm(null);
    }
    function handleCaseFound(caseData: any) {
        setCases(prev => {
            const exists = prev.findIndex(c => c.diaryNumber === caseData.diaryNumber && c.diaryYear === caseData.diaryYear);
            if (exists !== -1) {
                const n = [...prev]; n[exists] = caseData;
                setSuccessToast(`Case ${caseData.caseNumber} updated.`); return n;
            }
            setSuccessToast(`Case ${caseData.caseNumber} added successfully.`);
            return [caseData, ...prev];
        });
        setSelected(caseData); setStatusFilter("All Cases"); setShowArchived(false);
    }

    function handleExportListPdf() {
        let rows = "";
        filtered.forEach((c: any, index: number) => {
            rows += `
                <tr>
                    <td style="text-align: center;">${index + 1}</td>
                    <td><strong>${c.diaryNumber}/${c.diaryYear}</strong><br/>${c.caseType} ${c.shortCaseNumber}</td>
                    <td>${c.petitioners.join(", ")}<br/><span style="font-style:italic; font-weight:bold;">v.</span><br/>${c.respondents.join(", ")}</td>
                    <td style="font-weight:bold; text-align:center;">${c.status.toUpperCase()}</td>
                </tr>
            `;
        });

        const htmlContent = `
            <!DOCTYPE html>
            <html>
            <head>
                <title>Lex Tigress Case List</title>
                <style>
                    body { font-family: 'Times New Roman', Times, serif; color: #000; padding: 40px; background: #fff; max-width: 1000px; margin: 0 auto; line-height: 1.5; }
                    .header { text-align: center; margin-bottom: 30px; }
                    .header h1 { margin: 0; font-size: 24px; text-decoration: underline; text-transform: uppercase; }
                    .header h2 { margin: 8px 0 0 0; font-size: 18px; font-weight: bold; }
                    table { width: 100%; border-collapse: collapse; margin-bottom: 30px; font-size: 14px; }
                    th { padding: 12px; border: 1px solid #000; background-color: #eaeaea; font-weight:bold; text-align: left; }
                    td { padding: 10px; border: 1px solid #000; }
                    .footer { border-top: 1px solid #000; margin-top: 40px; padding-top: 15px; font-size: 13px; text-align: center; }
                    
                    @media print {
                        .no-print { display: none !important; }
                        body { padding: 0; max-width: 100%; }
                    }
                    .actions { text-align: right; margin-bottom: 30px; padding-bottom: 20px; border-bottom: 1px dashed #ccc; }
                    .btn { padding: 10px 20px; background: #1A2E5E; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 16px; font-weight: bold; font-family: sans-serif; }
                    .btn:hover { background: #2A4B9B; }
                </style>
            </head>
            <body>
                <div class="actions no-print">
                    <button class="btn" onclick="window.print()">🖨️ Print / Save as PDF</button>
                    <button class="btn" style="background:#666; margin-left:10px;" onclick="window.close()">Close</button>
                </div>
                
                <div class="header">
                    <h1>IN THE SUPREME COURT OF INDIA</h1>
                    <h2>CASE LISTING SUMMARY</h2>
                    <p style="margin: 8px 0 0 0; font-size: 15px;">Total Cases: ${filtered.length} | Generated on ${new Date().toLocaleDateString()}</p>
                </div>
                
                <table>
                    <thead>
                        <tr>
                            <th style="width: 5%; text-align:center;">S.No</th>
                            <th style="width: 25%;">Case / Diary No.</th>
                            <th style="width: 50%;">Parties</th>
                            <th style="width: 20%; text-align:center;">Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rows}
                    </tbody>
                </table>

                <div class="footer">
                    <p style="margin: 0;">Generated by <strong>Lex Tigress</strong> AI Legal Platform</p>
                    <p style="font-style: italic; margin: 5px 0 0 0; font-size: 12px;">This document is for information purposes and not a certified court copy.</p>
                </div>
            </body>
            </html>
        `;

        const newWin = window.open('', '_blank');
        if (newWin) {
            newWin.document.open();
            newWin.document.write(htmlContent);
            newWin.document.close();
        }
    }

    function handleExportDetailPdf(c: any) {
        const nextHearingText = c.nextHearingDate && c.status !== "Disposed" ? new Date(c.nextHearingDate).toLocaleDateString() : "Not Listed / N/A";

        const htmlContent = `
            <!DOCTYPE html>
            <html>
            <head>
                <title>Case Report - ${c.diaryNumber}/${c.diaryYear}</title>
                <style>
                    body { font-family: 'Times New Roman', Times, serif; color: #000; padding: 40px; background: #fff; max-width: 850px; margin: 0 auto; line-height: 1.5; }
                    .header { text-align: center; margin-bottom: 20px; }
                    .header h1 { margin: 0; font-size: 24px; text-decoration: underline; text-transform: uppercase; }
                    .header h2 { margin: 8px 0 0 0; font-size: 18px; font-weight: bold; }
                    table { width: 100%; border-collapse: collapse; margin-bottom: 30px; font-size: 15px; }
                    td { padding: 12px; border: 1px solid #000; }
                    .label-td { font-weight: bold; background-color: #f9f9f9; width: 35%; }
                    .section { margin-bottom: 30px; border: 1px solid #000; padding: 20px; }
                    .section-title { font-weight: bold; font-size: 18px; margin-bottom: 15px; text-decoration: underline; }
                    .party-block { margin-left: 10px; }
                    .vs { text-align: center; font-style: italic; font-weight: bold; margin: 15px 0; }
                    .footer { border-top: 1px solid #000; margin-top: 50px; padding-top: 15px; font-size: 13px; text-align: center; }
                    
                    @media print {
                        .no-print { display: none !important; }
                        body { padding: 0; max-width: 100%; }
                    }
                    .actions { text-align: right; margin-bottom: 30px; padding-bottom: 20px; border-bottom: 1px dashed #ccc; }
                    .btn { padding: 10px 20px; background: #1A2E5E; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 16px; font-weight: bold; font-family: sans-serif; }
                    .btn:hover { background: #2A4B9B; }
                </style>
            </head>
            <body>
                <div class="actions no-print">
                    <button class="btn" onclick="window.print()">🖨️ Print / Save as PDF</button>
                    <button class="btn" style="background:#666; margin-left:10px;" onclick="window.close()">Close</button>
                </div>
                
                <div class="header">
                    <h1>IN THE SUPREME COURT OF INDIA</h1>
                    <h2>CASE STATUS RECORD</h2>
                </div>
                
                <table>
                    <tr><td class="label-td">Case Type / No.</td><td>${c.caseType} No. ${c.shortCaseNumber}</td></tr>
                    <tr><td class="label-td">Diary Number</td><td>${c.diaryNumber} / ${c.diaryYear}</td></tr>
                    <tr><td class="label-td">Present Status</td><td style="text-transform: uppercase; font-weight: bold;">${c.status}</td></tr>
                    <tr><td class="label-td">Next Hearing Date</td><td>${nextHearingText}</td></tr>
                </table>

                <div class="section">
                    <div class="section-title">PARTIES</div>
                    <div class="party-block">
                        <p style="margin: 0 0 10px 0;"><strong>Petitioner(s):</strong><br/>${(c.petitioners || []).join(", ") || "N/A"}</p>
                        <div class="vs">Versus</div>
                        <p style="margin: 0;"><strong>Respondent(s):</strong><br/>${(c.respondents || []).join(", ") || "N/A"}</p>
                    </div>
                </div>
                
                <div class="section">
                    <div class="section-title">ADVOCATES</div>
                    <div class="party-block">
                        <p style="margin: 0 0 10px 0;"><strong>For Petitioner(s):</strong><br/>${c.petitionerAdvocates?.length ? c.petitionerAdvocates.join(", ") : "Not Updated"}</p>
                        <p style="margin: 0;"><strong>For Respondent(s):</strong><br/>${c.respondentAdvocates?.length ? c.respondentAdvocates.join(", ") : "Not Updated"}</p>
                    </div>
                </div>

                <div class="footer">
                    <p style="margin: 0;">Generated by <strong>Lex Tigress</strong> AI Legal Platform on ${new Date().toLocaleDateString()}</p>
                    <p style="font-style: italic; margin: 5px 0 0 0; font-size: 12px;">This document is for information purposes and not a certified court copy.</p>
                </div>
            </body>
            </html>
        `;

        const newWin = window.open('', '_blank');
        if (newWin) {
            newWin.document.open();
            newWin.document.write(htmlContent);
            newWin.document.close();
        }
    }

    // ── TOPBAR TITLE ───────────────────────────────────────────────────────────
    const navItem = MAIN_NAV.find(n => n.id === activeView);
    const topbarTitle = activeView === "cases"
        ? (showArchived ? "Archived Cases" : "Cases")
        : (navItem?.label ?? "Dashboard");

    // ── RENDER ─────────────────────────────────────────────────────────────────
    return (
        <AppContext.Provider value={{ T, getS, hearingColor }}>
            <div style={{ display: "flex", height: "100vh", background: T.bg, fontFamily: "'DM Sans','Segoe UI',sans-serif", color: T.text, overflow: "hidden" }}>

                {/* ── GLOBAL MOBILE STYLES ───────────────────────────────────────── */}
                <style>{`
                    @keyframes slideUp{from{transform:translateY(20px);opacity:0}to{transform:translateY(0);opacity:1}}
                    @keyframes slideInRight{from{transform:translateX(100%)}to{transform:translateX(0)}}
                    @keyframes fadeIn{from{opacity:0}to{opacity:1}}
                    ::-webkit-scrollbar{width:4px;height:4px}
                    ::-webkit-scrollbar-track{background:transparent}
                    ::-webkit-scrollbar-thumb{background:rgba(0,0,0,0.15);border-radius:4px}
                    .desktop-sidebar{display:flex!important}
                    .mobile-bottom-nav{display:none!important}
                    .mobile-search-bar{display:none!important}
                    .mobile-detail-sheet{display:none!important}
                    @media(max-width:768px){
                        .desktop-sidebar{display:none!important}
                        .mobile-bottom-nav{display:flex!important}
                        .mobile-search-bar{display:flex!important}
                        .desktop-search{display:none!important}
                        .desktop-sort{display:none!important}
                        .desktop-count{display:none!important}
                        .charts-row{display:none!important}
                        .view-mode-btns{display:none!important}
                        .generate-report-btn{display:none!important}
                        .detail-panel-desktop{display:none!important}
                        .main-content-padding{padding:12px!important;padding-bottom:76px!important}
                        .info-grid{grid-template-columns:1fr!important}
                        .case-gallery-grid{grid-template-columns:repeat(2,1fr)!important;gap:8px!important}
                        .filter-toolbar{padding:10px 12px!important}
                        .filter-status-wrap{flex-wrap:nowrap!important;overflow-x:auto;padding-bottom:4px;-webkit-overflow-scrolling:touch}
                        .filter-labels-wrap{flex-wrap:nowrap!important;overflow-x:auto;padding-bottom:4px;-webkit-overflow-scrolling:touch}
                        .topbar-height{height:48px!important}
                        .topbar-title{font-size:15px!important}
                        .desktop-only{display:none!important}
                        .mobile-search-icon{display:flex!important}
                        .mobile-detail-sheet{display:flex!important}
                    }
                `}</style>

                {/* ── TOASTS ─────────────────────────────────────────────────────── */}
                {successToast && (
                    <div style={{ position: "fixed", bottom: 80, right: 16, zIndex: 2000, background: "#1A8C5B", color: "#fff", padding: "11px 16px", borderRadius: 12, fontSize: 14, fontWeight: 700, boxShadow: "0 4px 20px rgba(26,140,91,0.4)", display: "flex", alignItems: "center", gap: 10, maxWidth: "calc(100vw - 32px)", animation: "slideUp 0.3s ease" }} role="status">
                        ✅ {successToast}
                        <button onClick={() => setSuccessToast(null)} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.7)", cursor: "pointer", fontSize: 18, lineHeight: 1 }}>✕</button>
                    </div>
                )}
                {storageWarn && (
                    <div style={{ position: "fixed", bottom: successToast ? 130 : 80, right: 16, zIndex: 2000, background: "#9B7B28", color: "#fff", padding: "11px 16px", borderRadius: 12, fontSize: 13, fontWeight: 600, display: "flex", gap: 10, maxWidth: "calc(100vw - 32px)" }} role="alert">
                        ⚠️ Storage almost full. Archive old cases.
                        <button onClick={() => setStorageWarn(false)} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.7)", cursor: "pointer", fontSize: 18, lineHeight: 1 }}>✕</button>
                    </div>
                )}

                {/* ── SIDEBAR (desktop only) ─────────────────────────────────────── */}
                <div className="desktop-sidebar" style={{ width: collapsed ? 58 : 234, background: T.sidebar, flexDirection: "column", transition: "width 0.25s ease", flexShrink: 0, overflow: "hidden", boxShadow: "2px 0 16px rgba(15,28,63,0.22)" }} role="navigation" aria-label="Main navigation">

                    {/* Logo */}
                    <div style={{ padding: "16px 14px", borderBottom: "1px solid rgba(255,255,255,0.08)", display: "flex", alignItems: "center", gap: 11, flexShrink: 0 }}>
                        <div style={{ width: 36, height: 36, flexShrink: 0, background: "linear-gradient(135deg,#C9A84C,#9B7B28)", borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, boxShadow: "0 2px 8px rgba(201,168,76,0.45)" }}>⚖</div>
                        {!collapsed && (
                            <div>
                                <div style={{ fontWeight: 800, fontSize: 17, color: "#fff", letterSpacing: -0.3 }}>Lex Tigress</div>
                                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.38)", letterSpacing: 0.9, marginTop: 1 }}>AI LEGAL PLATFORM</div>
                            </div>
                        )}
                    </div>

                    {/* Main nav items */}
                    <nav style={{ padding: "10px 8px", flexShrink: 0 }}>
                        {MAIN_NAV.map(n => {
                            const active = activeView === n.id;
                            return (
                                <button key={n.id}
                                    onClick={() => { setActiveView(n.id); if (n.id === "cases") { setShowArchived(false); setStatusFilter("All Cases"); } }}
                                    aria-current={active ? "page" : undefined}
                                    style={{ width: "100%", display: "flex", alignItems: "center", gap: 11, padding: "10px 12px", borderRadius: 10, border: "none", background: active ? "rgba(201,168,76,0.16)" : "transparent", color: active ? "#C9A84C" : "rgba(255,255,255,0.52)", cursor: "pointer", fontSize: 14.5, fontWeight: active ? 700 : 400, transition: "all 0.18s", textAlign: "left", marginBottom: 2 }}>
                                    <span style={{ fontSize: 17, flexShrink: 0, lineHeight: 1 }}>{n.icon}</span>
                                    {!collapsed && <span style={{ flex: 1 }}>{n.label}</span>}
                                    {!collapsed && n.id === "cases" && (
                                        <span style={{ fontSize: 12, fontWeight: 700, color: active ? "#C9A84C" : "rgba(255,255,255,0.28)", background: "rgba(255,255,255,0.06)", padding: "1px 8px", borderRadius: 12 }}>
                                            {activeCases.length}
                                        </span>
                                    )}
                                </button>
                            );
                        })}
                    </nav>

                    {/* Spacer to push bottom section down */}
                    <div style={{ flex: 1 }} />

                    {/* Bottom section */}
                    <div style={{ padding: "8px", borderTop: "1px solid rgba(255,255,255,0.08)", flexShrink: 0 }}>
                        {activeView === "cases" && (
                            <button
                                onClick={() => { setShowArchived(!showArchived); setStatusFilter("All Cases"); }}
                                aria-pressed={showArchived}
                                style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: collapsed ? "center" : "flex-start", gap: 9, padding: "8px 11px", borderRadius: 9, border: "none", background: showArchived ? "rgba(201,168,76,0.1)" : "transparent", color: showArchived ? "#C9A84C" : "rgba(255,255,255,0.38)", cursor: "pointer", fontSize: 13.5, fontWeight: showArchived ? 700 : 400, marginBottom: 6 }}>
                                <span>🗄</span>
                                {!collapsed && <span>Archived ({cases.filter(c => c.archived).length})</span>}
                            </button>
                        )}
                        <button
                            onClick={() => { setActiveView("cases"); setShowAdd(true); }}
                            style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: collapsed ? "center" : "flex-start", gap: 9, padding: "10px 11px", borderRadius: 9, border: "1px solid rgba(201,168,76,0.32)", background: "rgba(201,168,76,0.09)", color: "#C9A84C", cursor: "pointer", fontSize: 14.5, fontWeight: 700, marginBottom: 8 }}
                            aria-label="Add new case">
                            <span style={{ fontSize: 19, lineHeight: 1 }}>＋</span>
                            {!collapsed && <span>Add Case</span>}
                        </button>

                        {/* Need Help? */}
                        {!collapsed && (
                            <div style={{ background: "rgba(201,168,76,0.08)", border: "1px solid rgba(201,168,76,0.15)", borderRadius: 9, padding: "10px 12px" }}>
                                <div style={{ fontSize: 13, fontWeight: 700, color: "#C9A84C", marginBottom: 2 }}>Need Help?</div>
                                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", cursor: "pointer" }}>Contact support</div>
                            </div>
                        )}
                    </div>
                </div>

                {/* ── MOBILE BOTTOM NAV ──────────────────────────────────────── */}
                <div className="mobile-bottom-nav" style={{ position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 100, background: T.sidebar, borderTop: "1px solid rgba(255,255,255,0.1)", paddingBottom: "env(safe-area-inset-bottom)", alignItems: "center", justifyContent: "space-around" }}>
                    {MAIN_NAV.slice(0, 5).map(n => {
                        const active = activeView === n.id;
                        return (
                            <button key={n.id} onClick={() => { setActiveView(n.id); if (n.id === "cases") { setShowArchived(false); setStatusFilter("All Cases"); } }}
                                style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 3, padding: "8px 4px", background: "none", border: "none", cursor: "pointer", color: active ? "#C9A84C" : "rgba(255,255,255,0.45)" }}>
                                <span style={{ fontSize: 20 }}>{n.icon}</span>
                                <span style={{ fontSize: 10, fontWeight: active ? 700 : 500 }}>{n.label.split(" ")[0]}</span>
                            </button>
                        );
                    })}
                    <button onClick={() => { setActiveView("cases"); setShowAdd(true); }} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 3, padding: "8px 4px", background: "none", border: "none", cursor: "pointer", color: "#C9A84C" }}>
                        <span style={{ fontSize: 22 }}>＋</span>
                        <span style={{ fontSize: 10, fontWeight: 600 }}>Add</span>
                    </button>
                </div>

                {/* ── MOBILE DETAIL SHEET ─────────────────────────────────────────── */}
                {selected && (
                    <div className="mobile-detail-sheet" style={{ position: "fixed", inset: 0, zIndex: 200, background: T.surface, flexDirection: "column", animation: "slideInRight 0.28s ease" }}>
                        <div style={{ height: 52, display: "flex", alignItems: "center", padding: "0 14px", gap: 12, background: T.sidebar, flexShrink: 0 }}>
                            <button onClick={() => setSelected(null)} style={{ background: "none", border: "none", color: "#C9A84C", cursor: "pointer", fontSize: 22, lineHeight: 1, padding: 4 }}>←</button>
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: 13, fontWeight: 800, color: "#fff", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{selected.petitioners[0]}</div>
                                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.45)" }}>{selected.caseType} {selected.shortCaseNumber}</div>
                            </div>
                            <button onClick={() => setShowEdit(true)} style={{ background: "rgba(201,168,76,0.15)", border: "1px solid rgba(201,168,76,0.3)", borderRadius: 8, color: "#C9A84C", cursor: "pointer", fontSize: 12, fontWeight: 700, padding: "5px 12px" }}>Edit</button>
                        </div>
                        <div style={{ flex: 1, overflow: "auto", padding: "14px 14px 80px" }}>
                            <div style={{ marginBottom: 14, paddingBottom: 14, borderBottom: `1px solid ${T.borderSoft}` }}>
                                <div style={{ display: "inline-block", background: T.accentBg, border: `1px solid ${T.accentBorder}`, borderRadius: 6, padding: "2px 9px", color: T.accentDark, fontSize: 12, fontWeight: 700, marginBottom: 8 }}>{selected.caseType} {selected.shortCaseNumber}</div>
                                <div style={{ fontSize: 18, fontWeight: 800, color: T.text, lineHeight: 1.3, marginBottom: 4 }}>{selected.petitioners.join(", ")}</div>
                                <div style={{ fontSize: 13, color: T.textSub, fontStyle: "italic", marginBottom: 10 }}>v. {selected.respondents.join(", ")}</div>
                                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
                                    <span style={{ background: getS(selected.status).bg, color: getS(selected.status).text, fontSize: 12, fontWeight: 700, padding: "3px 10px", borderRadius: 20, border: `1px solid ${getS(selected.status).border}` }}>{selected.status.toUpperCase()}</span>
                                    {selected.archived && <span style={{ background: "#F3F4F7", color: T.textMuted, fontSize: 12, fontWeight: 700, padding: "3px 10px", borderRadius: 20, border: `1px solid ${T.border}` }}>ARCHIVED</span>}
                                </div>
                                <div style={{ display: "flex", gap: 8 }}>
                                    <button onClick={() => setShowEdit(true)} style={{ flex: 1, padding: "9px", borderRadius: 9, border: `1px solid ${T.border}`, background: T.bg, color: T.textSub, fontSize: 13, fontWeight: 700, cursor: "pointer" }}>✏️ Edit</button>
                                    <button onClick={() => setConfirm({ type: selected.archived ? "unarchive" : "archive", caseId: selected.id })} style={{ flex: 1, padding: "9px", borderRadius: 9, border: `1px solid ${T.border}`, background: T.bg, color: T.textSub, fontSize: 13, fontWeight: 700, cursor: "pointer" }}>{selected.archived ? "📤 Restore" : "🗄 Archive"}</button>
                                    <button onClick={() => setConfirm({ type: "delete", caseId: selected.id })} style={{ padding: "9px 14px", borderRadius: 9, border: "1px solid #FECACA", background: "#FEF2F2", color: "#C62828", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>🗑</button>
                                </div>
                            </div>
                            <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 12, marginBottom: 14 }}>
                                <div style={{ background: T.bg, borderRadius: 12, border: `1px solid ${T.border}`, padding: 14 }}>
                                    <SectionHead icon="🔨" label="Case Information" />
                                    <DR icon="👤" label="Petitioner(s)">{selected.petitioners.join("; ")}</DR>
                                    <DR icon="👥" label="Respondent(s)">{selected.respondents.join("; ")}</DR>
                                    <DR icon="#" label="D.No">{selected.diaryNumber} / {selected.diaryYear}</DR>
                                    <DR icon="🔖" label="CNR">{selected.cnrNumber || "—"}</DR>
                                    <DR icon="📋" label="Case No.">{selected.caseNumber}</DR>
                                    <DR icon="⚖" label="Court">{selected.courtName}</DR>
                                    <DR icon="🏛" label="Court No.">{selected.courtNumber}</DR>
                                    <DR icon="🕐" label="Time">{selected.timeOfSitting}</DR>
                                    <DR icon="🏷" label="Labels"><div style={{ display: "flex", flexWrap: "wrap", marginTop: 3 }}>{selected.labels?.length > 0 ? selected.labels.map((l: string) => <Badge key={l} text={l} color={LABEL_COLORS[l] || T.textSub} />) : <span style={{ color: T.textMuted }}>—</span>}</div></DR>
                                </div>
                                <div style={{ background: T.bg, borderRadius: 12, border: `1px solid ${T.border}`, padding: 14 }}>
                                    <SectionHead icon="📅" label="Listing Details" />
                                    <DR icon="📅" label="Filed">{fmtDate(selected.dateOfFiling)}</DR>
                                    <DR icon="📌" label="Advance List">{selected.advanceList?.date ? fmtDate(selected.advanceList.date) : "Awaited"}</DR>
                                    <DR icon="📌" label="Final List">{selected.finalList?.date ? fmtDate(selected.finalList.date) : "Awaited"}</DR>
                                    <DR icon="🔄" label="Checked">{fmtDT(selected.lastCheckedAt)}</DR>
                                </div>
                            </div>
                            <CaseSummarySection selected={selected} onUpdate={handleSaveCase} />
                            <ListingsSection selected={selected} onUpdate={handleSaveCase} />
                            <TimelineSection selected={selected} onUpdate={handleSaveCase} />
                            <TasksSection selected={selected} onUpdate={handleSaveCase} />
                            <NotesSection selected={selected} onUpdate={handleSaveCase} />
                            <DocumentsSection selected={selected} onUpdate={handleSaveCase} />
                            <ApplicationsSection selected={selected} onUpdate={handleSaveCase} />
                        </div>
                    </div>
                )}

                {/* ── MAIN CONTENT ───────────────────────────────────────────────── */}
                <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>

                    {/* TOPBAR */}
                    <div className="topbar-height" style={{ height: 56, borderBottom: `1px solid ${T.border}`, display: "flex", alignItems: "center", padding: "0 14px", gap: 10, background: T.topbar, flexShrink: 0, boxShadow: T.shadow }}>
                        {/* Hamburger — desktop only */}
                        <button className="desktop-only" onClick={() => setCollapsed(!collapsed)} style={{ background: "none", border: "none", color: T.textMuted, cursor: "pointer", fontSize: 20, padding: 4, lineHeight: 1, flexShrink: 0 }} aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}>☰</button>
                        <div className="desktop-only" style={{ width: 1, height: 22, background: T.borderSoft }} />

                        {/* Logo icon — mobile only */}
                        <div style={{ width: 28, height: 28, flexShrink: 0, background: "linear-gradient(135deg,#C9A84C,#9B7B28)", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>⚖</div>

                        <span className="topbar-title" style={{ fontWeight: 700, fontSize: 18, color: T.text, letterSpacing: -0.2, flexShrink: 0 }}>{topbarTitle}</span>

                        {/* Search — desktop only */}
                        {activeView === "cases" && (
                            <div className="desktop-search" style={{ flex: 1, maxWidth: 480, position: "relative" }}>
                                <span style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", fontSize: 15, color: T.textMuted, pointerEvents: "none" }}>🔍</span>
                                <input type="search" value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
                                    onFocus={() => setSearchFocus(true)} onBlur={() => setTimeout(() => setSearchFocus(false), 150)}
                                    placeholder="Search name, case no., diary no., court…" aria-label="Search cases"
                                    style={{ width: "100%", padding: "7px 34px 7px 33px", borderRadius: 20, border: `1px solid ${searchFocus ? T.accent : T.border}`, fontSize: 14, color: T.text, background: T.bg, outline: "none", boxSizing: "border-box", transition: "border-color 0.2s" }} />
                                {searchTerm && <button onClick={() => setSearchTerm("")} style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: T.textMuted, fontSize: 16, lineHeight: 1 }} aria-label="Clear search">✕</button>}
                                <SearchInfo show={searchFocus && !searchTerm} />
                            </div>
                        )}

                        {activeView === "cases" && (
                            <select className="desktop-sort" value={sortBy} onChange={e => setSortBy(e.target.value)} aria-label="Sort cases"
                                style={{ padding: "6px 10px", borderRadius: 8, border: `1px solid ${T.border}`, background: T.bg, color: T.textSub, fontSize: 14, fontWeight: 600, cursor: "pointer", outline: "none", flexShrink: 0 }}>
                                {SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>Sort: {o.label}</option>)}
                            </select>
                        )}

                        <div style={{ flex: 1 }} />

                        {/* Mobile search icon */}
                        {activeView === "cases" && (
                            <button className="mobile-search-icon" onClick={() => { const el = document.getElementById("mobile-search-input"); el?.focus(); }} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 20, color: T.textMuted, padding: 4, flexShrink: 0 }} aria-label="Search">🔍</button>
                        )}

                        {activeView === "cases" && (
                            <div className="desktop-count" style={{ background: T.bg, border: `1px solid ${T.border}`, borderRadius: 20, padding: "5px 14px", fontSize: 14, color: T.textSub, fontWeight: 600, flexShrink: 0, whiteSpace: "nowrap" }}>
                                {filtered.length} of {showArchived ? cases.filter(c => c.archived).length : activeCases.length} cases
                            </div>
                        )}

                        {/* Bell */}
                        <div style={{ position: "relative", flexShrink: 0 }} ref={bellRef}>
                            <button onClick={() => setShowBell(!showBell)} aria-label={`${upcomingThisWeek} hearing(s) this week`} aria-expanded={showBell}
                                style={{ width: 34, height: 34, borderRadius: 10, background: upcomingThisWeek > 0 ? "#FBF4E3" : T.bg, border: `1px solid ${upcomingThisWeek > 0 ? T.accentBorder : T.border}`, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", fontSize: 18, position: "relative" }}>
                                🔔
                                {upcomingThisWeek > 0 && <div style={{ position: "absolute", top: -4, right: -4, width: 16, height: 16, borderRadius: "50%", background: "#C62828", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, color: "#fff", fontWeight: 800, border: "2px solid #fff" }}>{upcomingThisWeek}</div>}
                            </button>
                            {showBell && <BellPanel cases={cases} onClose={() => setShowBell(false)} onSelectCase={c => { setActiveView("cases"); setSelected(c); setDetailClosed(false); setShowArchived(false); }} />}
                        </div>

                        {/* Theme toggle */}
                        <button onClick={() => setIsDark(!isDark)} aria-label="Toggle theme"
                            style={{ width: 34, height: 34, borderRadius: 10, background: T.bg, border: `1px solid ${T.border}`, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", fontSize: 18, flexShrink: 0 }}>
                            {isDark ? "☀️" : "🌙"}
                        </button>
                    </div>

                    {/* Mobile search bar — slides below topbar */}
                    {activeView === "cases" && (
                        <div className="mobile-search-bar" style={{ padding: "8px 12px", borderBottom: `1px solid ${T.border}`, background: T.topbar, gap: 8, alignItems: "center" }}>
                            <div style={{ flex: 1, position: "relative" }}>
                                <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", fontSize: 14, color: T.textMuted, pointerEvents: "none" }}>🔍</span>
                                <input id="mobile-search-input" type="search" value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
                                    placeholder="Search cases…" aria-label="Search cases"
                                    style={{ width: "100%", padding: "8px 30px 8px 30px", borderRadius: 20, border: `1px solid ${T.border}`, fontSize: 14, color: T.text, background: T.bg, outline: "none", boxSizing: "border-box" }} />
                                {searchTerm && <button onClick={() => setSearchTerm("")} style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: T.textMuted, fontSize: 16 }}>✕</button>}
                            </div>
                            <select value={sortBy} onChange={e => setSortBy(e.target.value)}
                                style={{ padding: "7px 8px", borderRadius: 8, border: `1px solid ${T.border}`, background: T.bg, color: T.textSub, fontSize: 13, fontWeight: 600, cursor: "pointer", outline: "none", flexShrink: 0 }}>
                                {SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                            </select>
                        </div>
                    )}

                    {/* ── BODY ─────────────────────────────────────────────────────── */}
                    {/* Non-cases views: show coming soon */}
                    {activeView !== "cases" && (
                        <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
                            <ComingSoon T={T} {...COMING_SOON[activeView]} />
                        </div>
                    )}

                    {/* Cases view */}
                    {activeView === "cases" && (
                        <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
                            <div className="main-content-padding" style={{ flex: 1, overflow: "auto", padding: 20 }}>

                                {/* SC Lookup */}
                                {!showArchived && <SearchCaseForm onCaseFound={handleCaseFound} theme={T} />}

                                {/* Charts row */}
                                {!showArchived && (
                                    <div className="charts-row" style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 12, marginBottom: 22 }}>
                                        <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 14, padding: 18, boxShadow: T.shadow }}>
                                            <div style={{ fontSize: 11, color: T.textMuted, letterSpacing: 1.1, fontWeight: 700, marginBottom: 16 }}>STATUS BREAKDOWN</div>
                                            <DonutChart cases={cases} />
                                        </div>
                                        <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 14, padding: 18, boxShadow: T.shadow }}>
                                            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
                                                <div style={{ fontSize: 11, color: T.textMuted, letterSpacing: 1.1, fontWeight: 700 }}>{activeTab === "hearings" ? "UPCOMING HEARINGS" : "BY COURT NUMBER"}</div>
                                                <div style={{ display: "flex", gap: 4 }} role="tablist">
                                                    {[["courts", "Courts"], ["hearings", "Hearings"]].map(([key, lbl]) => (
                                                        <button key={key} onClick={() => setActiveTab(key)} role="tab" aria-selected={activeTab === key}
                                                            style={{ padding: "3px 8px", borderRadius: 6, border: `1px solid ${T.border}`, background: activeTab === key ? T.sidebar : "transparent", color: activeTab === key ? "#C9A84C" : T.textMuted, fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                                                            {lbl}
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>
                                            {activeTab === "courts" ? <CourtBarChart cases={cases} /> : <UpcomingHearings cases={cases} onSelectCase={c => { setSelected(c); setDetailClosed(false); }} />}
                                        </div>
                                    </div>
                                )}

                                {/* Filter Toolbar (Moved from Sidebar) */}
                                {!showArchived && (
                                    <div className="filter-toolbar" style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, padding: "16px 20px", marginBottom: 20, boxShadow: T.shadow }}>
                                        {/* Status Row */}
                                        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
                                            <div style={{ fontSize: 12, fontWeight: 700, color: T.textMuted, letterSpacing: 0.5, width: 60 }}>STATUS</div>
                                            <div className="filter-status-wrap" style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                                                {CASE_FILTERS.map(f => {
                                                    const active = statusFilter === f.label;
                                                    return (
                                                        <button key={f.label} onClick={() => setStatusFilter(f.label)}
                                                            style={{ padding: "6px 14px", borderRadius: 20, border: active ? `1px solid #C9A84C` : `1px solid ${T.border}`, background: active ? "rgba(201,168,76,0.1)" : T.bg, color: active ? "#C9A84C" : T.textSub, fontSize: 13, fontWeight: active ? 700 : 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 6, transition: "all 0.15s" }}>
                                                            <span style={{ fontSize: 14 }}>{f.icon}</span> {f.label} {f.label !== "All Cases" && <span style={{ opacity: 0.6 }}>({counts[f.label as keyof typeof counts] ?? 0})</span>}
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        </div>

                                        {/* Labels Row */}
                                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                            <div style={{ fontSize: 12, fontWeight: 700, color: T.textMuted, letterSpacing: 0.5, width: 60 }}>LABELS</div>
                                            <div className="filter-labels-wrap" style={{ display: "flex", gap: 6, flexWrap: "wrap", flex: 1 }}>
                                                {ALL_LABELS.map(l => {
                                                    const active = labelFilter.includes(l);
                                                    return (
                                                        <button key={l} onClick={() => setLabelFilter(prev => active ? prev.filter(x => x !== l) : [...prev, l])}
                                                            style={{ padding: "4px 12px", borderRadius: 8, border: active ? `1px solid ${LABEL_COLORS[l]}` : `1px solid ${T.border}`, background: active ? `${LABEL_COLORS[l]}15` : T.bg, color: active ? LABEL_COLORS[l] : T.textSub, fontSize: 12, fontWeight: active ? 700 : 500, cursor: "pointer", display: "flex", alignItems: "center", gap: 6, transition: "all 0.15s" }}>
                                                            <div style={{ width: 8, height: 8, borderRadius: "50%", background: LABEL_COLORS[l] }} />
                                                            {l}
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                            {(labelFilter.length > 0 || statusFilter !== "All Cases") && (
                                                <button onClick={() => { setLabelFilter([]); setStatusFilter("All Cases"); }}
                                                    style={{ padding: "6px 12px", borderRadius: 8, border: "none", background: "rgba(198,40,40,0.08)", color: "#C62828", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                                                    ✕ Clear Filters
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                )}

                                {/* Search info banner */}
                                {searchTerm && <div style={{ marginBottom: 10, padding: "8px 14px", background: T.accentBg, border: `1px solid ${T.accentBorder}`, borderRadius: 9, fontSize: 14, color: T.accentDark, fontWeight: 600 }} role="status">🔍 {filtered.length} result{filtered.length !== 1 ? "s" : ""} for "{searchTerm}"</div>}

                                {/* View mode + header */}
                                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12, gap: 10 }}>
                                    <div style={{ fontSize: 11, color: T.textMuted, letterSpacing: 1.2, fontWeight: 700, display: "flex", alignItems: "center", gap: 8, flex: 1 }}>
                                        <div style={{ height: 1, width: 20, background: T.border }} />
                                        {showArchived ? "ARCHIVED CASES" : "CASE TIMELINE"}
                                        <div style={{ height: 1, flex: 1, background: T.border }} />
                                    </div>
                                    {filtered.length > 0 && (
                                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                            <button className="generate-report-btn" onClick={handleExportListPdf} title="Generate Case List Report" style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 14px", borderRadius: 9, border: `1px solid ${T.border}`, background: T.surface, color: T.textSub, fontSize: 13, fontWeight: 700, cursor: "pointer", boxShadow: T.shadow }}>
                                                📄 Generate Report
                                            </button>
                                            <div className="view-mode-btns" style={{ display: "flex", gap: 3, background: T.surface, border: `1px solid ${T.border}`, borderRadius: 9, padding: 3, flexShrink: 0, boxShadow: T.shadow }}>
                                                {[{ mode: "list", icon: "≡", label: "List" }, { mode: "gallery", icon: "⊞", label: "Gallery" }, { mode: "table", icon: "▦", label: "Table" }, { mode: "kanban", icon: "⋮⋮", label: "Kanban" }].map(v => (
                                                    <button key={v.mode} onClick={() => setViewMode(v.mode)} title={v.label}
                                                        style={{ padding: "5px 11px", borderRadius: 7, border: "none", background: viewMode === v.mode ? "linear-gradient(135deg,#1A2E5E,#2A4B9B)" : "transparent", color: viewMode === v.mode ? "#C9A84C" : T.textMuted, fontSize: 13, fontWeight: 700, cursor: "pointer", transition: "all 0.15s" }}>
                                                        {v.icon}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {/* Case list */}
                                <div id="case-list-panel">
                                    {viewMode === "list" && <div role="list">{filtered.map(c => <div key={c.id} role="listitem"><CaseCard c={c} selected={selected?.id === c.id} onClick={() => { setSelected(c); setDetailClosed(false); }} searchTerm={searchTerm} /></div>)}</div>}
                                    {viewMode === "gallery" && <div className="case-gallery-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(220px,1fr))", gap: 12 }}>{filtered.map(c => <GalleryCard key={c.id} c={c} selected={selected?.id === c.id} onClick={() => { setSelected(c); setDetailClosed(false); }} />)}</div>}
                                    {viewMode === "table" && <TableView cases={filtered} selected={selected} onSelect={c => { setSelected(c); setDetailClosed(false); }} searchTerm={searchTerm} />}
                                    {viewMode === "kanban" && <KanbanView cases={filtered} selected={selected} onSelect={c => { setSelected(c); setDetailClosed(false); }} />}
                                </div>

                                {/* Empty state */}
                                {filtered.length === 0 && (
                                    <div style={{ textAlign: "center", padding: "56px 20px" }} role="status">
                                        {cases.length === 0 && !showArchived ? (
                                            <>
                                                <div style={{ fontSize: 40, marginBottom: 14 }}>⚖️</div>
                                                <div style={{ color: T.text, fontSize: 17, fontWeight: 800, marginBottom: 8 }}>Welcome to Lex Tigress</div>
                                                <div style={{ color: T.textMuted, fontSize: 15, marginBottom: 6, lineHeight: 1.8 }}>Search for a Supreme Court case using the form above.<br />Enter a <strong style={{ color: T.textSub }}>Diary Number</strong> and <strong style={{ color: T.textSub }}>Year</strong> to get started.</div>
                                                <div style={{ display: "inline-block", marginTop: 8, padding: "8px 18px", background: T.accentBg, border: `1px solid ${T.accentBorder}`, borderRadius: 9, fontSize: 14, color: T.accentDark, fontWeight: 600 }}>e.g. Diary No. 45821 / Year 2024</div>
                                            </>
                                        ) : (
                                            <>
                                                <div style={{ fontSize: 36, marginBottom: 12 }}>🔍</div>
                                                <div style={{ color: T.text, fontSize: 16, fontWeight: 700, marginBottom: 6 }}>No cases found</div>
                                                <div style={{ color: T.textMuted, fontSize: 14, marginBottom: 20, lineHeight: 1.8 }}>Try a party name, case no., or diary no.</div>
                                                {hasFilters && <button onClick={() => { setSearchTerm(""); setLabelFilter([]); setStatusFilter("All Cases"); }} style={{ padding: "9px 22px", borderRadius: 9, border: `1px solid ${T.border}`, background: T.surface, color: T.textSub, fontSize: 14, fontWeight: 600, cursor: "pointer" }}>Clear all filters</button>}
                                            </>
                                        )}
                                    </div>
                                )}
                            </div>

                            {/* DETAIL PANEL */}
                            {selected && (
                                <div className="detail-panel-desktop" style={{ width: detailClosed ? 40 : "clamp(480px,42vw,680px)", background: T.surface, borderLeft: `1px solid ${T.border}`, overflow: detailClosed ? "hidden" : "auto", flexShrink: 0, boxShadow: "-2px 0 12px rgba(15,28,63,0.06)", transition: "width 0.25s ease" }} role="complementary" aria-label="Case details">
                                    <button onClick={() => setDetailClosed(!detailClosed)} aria-label={detailClosed ? "Expand details" : "Collapse details"} aria-expanded={!detailClosed}
                                        style={{ position: "sticky", top: 0, zIndex: 10, width: "100%", display: "flex", alignItems: "center", justifyContent: detailClosed ? "center" : "flex-end", padding: "10px 14px", background: T.surface, border: "none", borderBottom: `1px solid ${T.borderSoft}`, cursor: "pointer", color: T.textMuted, fontSize: 15, fontWeight: 700 }}>
                                        {detailClosed ? "▶" : "◀ Close"}
                                    </button>
                                    {!detailClosed && (
                                        <div id="case-detail-content" style={{ padding: 20 }}>
                                            {/* Header */}
                                            <div style={{ marginBottom: 18, paddingBottom: 16, borderBottom: `1px solid ${T.borderSoft}` }}>
                                                <div style={{ display: "inline-block", background: T.accentBg, border: `1px solid ${T.accentBorder}`, borderRadius: 6, padding: "2px 9px", color: T.accentDark, fontSize: 13, fontFamily: "Georgia,serif", fontWeight: 700, marginBottom: 8 }}>{selected.caseType} {selected.shortCaseNumber}</div>
                                                <div style={{ fontSize: 20, fontWeight: 800, color: T.text, lineHeight: 1.3, marginBottom: 4, letterSpacing: -0.3 }}>{selected.petitioners.join(", ")}</div>
                                                <div style={{ fontSize: 14.5, color: T.textSub, fontStyle: "italic" }}>v. {selected.respondents.join(", ")}</div>
                                                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 12 }}>
                                                    <span style={{ background: getS(selected.status).bg, color: getS(selected.status).text, fontSize: 13, fontWeight: 700, padding: "4px 12px", borderRadius: 20, border: `1px solid ${getS(selected.status).border}`, letterSpacing: 0.5 }}>{selected.status.toUpperCase()}</span>
                                                    {selected.archived && <span style={{ background: "#F3F4F7", color: T.textMuted, fontSize: 13, fontWeight: 700, padding: "4px 12px", borderRadius: 20, border: `1px solid ${T.border}` }}>ARCHIVED</span>}
                                                </div>
                                                {selected.nextHearingDate && selected.status !== "Disposed" && !selected.archived && (() => {
                                                    const days = getDaysUntil(selected.nextHearingDate);
                                                    if (days === null || days < 0) return null;
                                                    return <div style={{ marginTop: 12, padding: "10px 14px", background: "#FBF4E3", border: "1px solid #E8D18A", borderRadius: 9, display: "flex", alignItems: "center", gap: 12 }}>
                                                        <span style={{ fontSize: 22 }}>📅</span>
                                                        <div>
                                                            <div style={{ fontSize: 11, fontWeight: 700, color: T.textMuted, letterSpacing: 0.8, textTransform: "uppercase", marginBottom: 2 }}>Next Hearing</div>
                                                            <div style={{ fontSize: 15, fontWeight: 800, color: T.text }}>{fmtDate(selected.nextHearingDate)}<span style={{ fontSize: 13, fontWeight: 600, color: hearingColor(days), marginLeft: 8 }}>({hearingLabel(days)})</span></div>
                                                        </div>
                                                    </div>;
                                                })()}
                                                <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap", borderTop: `1px solid ${T.borderSoft}`, paddingTop: 14 }}>
                                                    <button onClick={() => handleExportDetailPdf(selected)} title="Generate Case Report" style={{ flex: 1, padding: "8px 14px", borderRadius: 9, border: `1px solid ${T.border}`, background: T.surface, color: T.textSub, fontSize: 14, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>📄 Generate Report</button>
                                                    <button onClick={() => setShowEdit(true)} style={{ flex: 1, padding: "8px 14px", borderRadius: 9, border: `1px solid ${T.accentBorder}`, background: T.accentBg, color: T.accentDark, fontSize: 14, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>✏️ Edit</button>
                                                    <button onClick={() => setConfirm({ type: selected.archived ? "unarchive" : "archive", caseId: selected.id })} style={{ flex: 1, padding: "8px 14px", borderRadius: 9, border: `1px solid ${T.border}`, background: T.bg, color: T.textSub, fontSize: 14, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>{selected.archived ? "🔄 Restore" : "🗄 Archive"}</button>
                                                    <button onClick={() => setConfirm({ type: "delete", caseId: selected.id })} style={{ padding: "8px 14px", borderRadius: 9, border: "1px solid #FECACA", background: "#FEF2F2", color: "#C62828", fontSize: 14, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>🗑 Delete</button>
                                                </div>
                                            </div>

                                            {/* Info Grid */}
                                            <div className="info-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16, alignItems: "start" }}>
                                                <div style={{ background: T.bg, borderRadius: 12, border: `1px solid ${T.border}`, padding: 16, boxShadow: T.shadow }}>
                                                    <SectionHead icon="🔨" label="Case Information" />
                                                    <DR icon="👤" label="Petitioner(s)">{selected.petitioners.join("; ")}</DR>
                                                    <DR icon="👥" label="Respondent(s)">{selected.respondents.join("; ")}</DR>
                                                    <DR icon="#" label="D.No">{selected.diaryNumber} / {selected.diaryYear}</DR>
                                                    <DR icon="🔖" label="CNR Number">{selected.cnrNumber || "—"}</DR>
                                                    <DR icon="📋" label="Case Number">{selected.caseNumber}</DR>
                                                    <DR icon="⚖" label="Court Name">{selected.courtName}</DR>
                                                    <DR icon="🏛" label="Court Number">{selected.courtNumber}</DR>
                                                    <DR icon="🕐" label="Time of Sitting">{selected.timeOfSitting}</DR>
                                                    <DR icon="📝" label="Earlier Court">{selected.earlierCourtDetails}</DR>
                                                    <DR icon="🏷" label="Labels">
                                                        <div style={{ display: "flex", flexWrap: "wrap", marginTop: 3 }}>
                                                            {selected.labels?.length > 0 ? selected.labels.map((l: string) => <Badge key={l} text={l} color={LABEL_COLORS[l] || T.textSub} />) : <span style={{ color: T.textMuted, fontSize: 14 }}>—</span>}
                                                        </div>
                                                    </DR>
                                                </div>
                                                <div style={{ background: T.bg, borderRadius: 12, border: `1px solid ${T.border}`, padding: 16, boxShadow: T.shadow }}>
                                                    <SectionHead icon="📅" label="Listing Details" />
                                                    <DR icon="📅" label="Date of Filing">{fmtDate(selected.dateOfFiling)}</DR>
                                                    {selected.lastListedJudges?.length > 0 && <DR icon="🧑‍⚖️" label="Judges (Last Listed)">{selected.lastListedJudges.join("; ")}</DR>}
                                                    <DR icon="📌" label="Advance List">{selected.advanceList?.date ? fmtDate(selected.advanceList.date) : selected.advanceList?.published ? "Published" : "List awaited"}</DR>
                                                    <DR icon="📌" label="Final List">{selected.finalList?.date ? fmtDate(selected.finalList.date) : selected.finalList?.published ? "Published" : "List awaited"}</DR>
                                                    <DR icon="🔄" label="Checked At">{fmtDT(selected.lastCheckedAt)}</DR>
                                                </div>
                                            </div>

                                            <CaseSummarySection selected={selected} onUpdate={handleSaveCase} />
                                            <ListingsSection selected={selected} onUpdate={handleSaveCase} />
                                            <CaseInfoSection icon="🏅" title="OFFICE REPORT" actionLabel="Read Last Office Report" actionUrl={selected.officeReportUrl}>
                                                <div style={{ fontSize: 14, color: T.textMuted, marginBottom: 2 }}>{fmtDate(selected.lastCheckedAt)}</div>
                                                <div style={{ fontSize: 14, color: T.text, fontWeight: 600 }}>{selected.caseNumber}</div>
                                            </CaseInfoSection>
                                            <CaseInfoSection icon="🏅" title="ORDER" actionLabel="Read Last Order" actionUrl={selected.lastOrdersUrl}>
                                                <div style={{ fontSize: 14, color: T.textMuted, marginBottom: 2 }}>{fmtDate(selected.lastCheckedAt)}</div>
                                                <div style={{ fontSize: 14, color: T.text, fontWeight: 600 }}>Diary No. {selected.diaryNumber}/{selected.diaryYear}</div>
                                            </CaseInfoSection>
                                            <TimelineSection selected={selected} onUpdate={handleSaveCase} />
                                            <TasksSection selected={selected} onUpdate={handleSaveCase} />
                                            <NotesSection selected={selected} onUpdate={handleSaveCase} />
                                            <DocumentsSection selected={selected} onUpdate={handleSaveCase} />
                                            <ApplicationsSection selected={selected} onUpdate={handleSaveCase} />
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* ── MODALS ─────────────────────────────────────────────────────── */}
                {showAdd && <CaseModal onClose={() => setShowAdd(false)} onSave={c => { setCases(p => [c, ...p]); setSelected(c); setShowArchived(false); }} />}
                {showEdit && selected && <CaseModal editCase={selected} onClose={() => setShowEdit(false)} onSave={handleSaveCase} />}
                {confirm?.type === "archive" && <ConfirmDialog title="Archive Case" message={`Archive "${cases.find(c => c.id === confirm.caseId)?.caseNumber}"?`} confirmLabel="Archive" onConfirm={() => handleArchiveToggle(confirm.caseId)} onCancel={() => setConfirm(null)} />}
                {confirm?.type === "unarchive" && <ConfirmDialog title="Restore Case" message={`Restore "${cases.find(c => c.id === confirm.caseId)?.caseNumber}" to active list?`} confirmLabel="Restore" onConfirm={() => handleArchiveToggle(confirm.caseId)} onCancel={() => setConfirm(null)} />}
                {confirm?.type === "delete" && <ConfirmDialog title="Delete Case" message={`Permanently delete "${cases.find(c => c.id === confirm.caseId)?.caseNumber}"? This cannot be undone.`} confirmLabel="Delete" danger onConfirm={() => handleDelete(confirm.caseId)} onCancel={() => setConfirm(null)} />}
            </div>
        </AppContext.Provider>
    );
}