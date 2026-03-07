import React from "react";
import { useApp } from "./AppContext";

// ── SHARED LABEL COLORS ───────────────────────────────────────────────────────
export const LABEL_COLORS: Record<string, string> = {
    "Pending/Hearing": "#C9A84C",
    Filing: "#C2185B",
    Disposed: "#1A8C5B",
    Drafting: "#6A1B9A",
    Admin: "#283593",
    Inquiry: "#2A7BD4",
    Urgent: "#C62828",
    "High Priority": "#2E7D32",
};
export const ALL_LABELS = Object.keys(LABEL_COLORS);
export const CASE_TYPES = ["W.P.(C)", "SLP(Crl.)", "CA", "C.A.", "SLP(C)", "OP", "Writ", "MA", "TP"];
export const COURT_NUMBERS = Array.from({ length: 15 }, (_, i) => `Court No. ${i + 1}`);
export const SITTING_TIMES = ["10:30 AM", "11:00 AM", "2:00 PM", "2:30 PM", "3:00 PM", "3:30 PM"];

// ── DATE HELPERS ──────────────────────────────────────────────────────────────
export function fmtDate(str: string | null | undefined): string {
    if (!str) return "—";
    try {
        const [y, m, d] = str.split("T")[0].split("-").map(Number);
        return new Date(y, m - 1, d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
    } catch { return str; }
}

export function fmtDT(str: string | null | undefined): string {
    if (!str) return "—";
    try { return new Date(str).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }); }
    catch { return str; }
}

export function getDaysUntil(dateStr: string | null | undefined): number | null {
    if (!dateStr) return null;
    try {
        const [y, m, d] = dateStr.split("-").map(Number);
        const target = new Date(y, m - 1, d);
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        return Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    } catch { return null; }
}

export function hearingLabel(days: number | null): string | null {
    if (days === 0) return "Today";
    if (days === 1) return "Tomorrow";
    if (days != null && days > 1) return `in ${days} days`;
    return null;
}

export function matchesSearch(c: any, q: string): boolean {
    if (!q) return true;
    const lq = q.toLowerCase().trim();
    return (
        (c.petitioners || []).some((p: string) => p.toLowerCase().includes(lq)) ||
        (c.respondents || []).some((r: string) => r.toLowerCase().includes(lq)) ||
        (c.caseNumber || "").toLowerCase().includes(lq) ||
        (c.shortCaseNumber || "").toLowerCase().includes(lq) ||
        (c.caseType || "").toLowerCase().includes(lq) ||
        String(c.diaryNumber || "").includes(lq) ||
        String(c.diaryYear || "").includes(lq) ||
        `${c.diaryNumber || ""}/${c.diaryYear || ""}`.includes(lq) ||
        (c.courtNumber || "").toLowerCase().includes(lq) ||
        (c.labels || []).some((l: string) => l.toLowerCase().includes(lq))
    );
}

export function sortCases(cases: any[], sortBy: string): any[] {
    const arr = [...cases];
    if (sortBy === "hearing") return arr.sort((a, b) => {
        const da = a.nextHearingDate ? new Date(a.nextHearingDate) : new Date("9999-01-01");
        const db = b.nextHearingDate ? new Date(b.nextHearingDate) : new Date("9999-01-01");
        return da.getTime() - db.getTime();
    });
    if (sortBy === "filing") return arr.sort((a, b) => new Date(b.dateOfFiling).getTime() - new Date(a.dateOfFiling).getTime());
    if (sortBy === "status") { const o: any = { Fresh: 0, Pending: 1, Disposed: 2 }; return arr.sort((a, b) => (o[a.status] ?? 3) - (o[b.status] ?? 3)); }
    if (sortBy === "name") return arr.sort((a, b) => (a.petitioners[0] || "").localeCompare(b.petitioners[0] || ""));
    return arr;
}

// ── SHARED UI ATOMS ───────────────────────────────────────────────────────────
export function Badge({ text, color }: { text: string; color: string }) {
    return (
        <span style={{ background: `${color}15`, color, fontSize: 13, fontWeight: 700, padding: "3px 10px", borderRadius: 20, border: `1px solid ${color}30`, marginRight: 5, marginBottom: 4, display: "inline-block" }}>
            {text}
        </span>
    );
}

export function DR({ icon, label, children }: { icon: string; label: string; children: React.ReactNode }) {
    const { T } = useApp();
    return (
        <div style={{ marginBottom: 13 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 3 }}>
                <span style={{ fontSize: 13, opacity: 0.4 }} aria-hidden="true">{icon}</span>
                <span style={{ color: T.textMuted, fontSize: 11, letterSpacing: 0.9, fontWeight: 700, textTransform: "uppercase" }}>{label}</span>
            </div>
            <div style={{ color: T.text, fontSize: 14.5, paddingLeft: 17, lineHeight: 1.6, fontWeight: 500 }}>{children}</div>
        </div>
    );
}

export function SectionHead({ icon, label }: { icon: string; label: string }) {
    const { T } = useApp();
    return (
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14, paddingBottom: 9, borderBottom: `1px solid ${T.borderSoft}` }}>
            <div style={{ width: 26, height: 26, borderRadius: 7, background: "linear-gradient(135deg,#1A2E5E,#0F1C3F)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, boxShadow: "0 2px 6px rgba(15,28,63,0.25)" }} aria-hidden="true">{icon}</div>
            <span style={{ color: T.text, fontSize: 15, fontWeight: 700 }}>{label}</span>
        </div>
    );
}

export function SectionIconBox({ icon }: { icon: string }) {
    return (
        <div style={{ width: 32, height: 32, borderRadius: 9, background: "linear-gradient(135deg,#1A2E5E,#0F1C3F)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 17, flexShrink: 0, boxShadow: "0 2px 6px rgba(15,28,63,0.2)" }}>
            {icon}
        </div>
    );
}

export function SectionCard({ icon, title, count, onAdd, addLabel, children }: {
    icon: string; title: string; count: string; onAdd: () => void; addLabel: string; children: React.ReactNode;
}) {
    const { T } = useApp();
    return (
        <div style={{ background: T.bg, borderRadius: 12, border: `1px solid ${T.border}`, padding: "14px 16px", boxShadow: "0 1px 4px rgba(15,28,63,0.08)", marginBottom: 10 }}>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 8 }}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 12, flex: 1, minWidth: 0 }}>
                    <SectionIconBox icon={icon} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 800, color: T.text, letterSpacing: 0.8, marginBottom: 3 }}>{title}</div>
                        <div style={{ fontSize: 14, color: T.textMuted }}>{count}</div>
                    </div>
                </div>
                <button onClick={onAdd} style={{ fontSize: 13, fontWeight: 700, color: "#2A7BD4", background: "transparent", border: "none", cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0, paddingTop: 2 }}>{addLabel}</button>
            </div>
            {children}
        </div>
    );
}

export function CaseInfoSection({ icon, title, children, actionLabel, actionUrl }: {
    icon: string; title: string; children: React.ReactNode; actionLabel?: string; actionUrl?: string;
}) {
    const { T } = useApp();
    return (
        <div style={{ background: T.bg, borderRadius: 12, border: `1px solid ${T.border}`, padding: "14px 16px", boxShadow: "0 1px 4px rgba(15,28,63,0.08)", marginBottom: 10, display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 12, flex: 1, minWidth: 0 }}>
                <SectionIconBox icon={icon} />
                <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 800, color: T.text, letterSpacing: 0.8, marginBottom: 5 }}>{title}</div>
                    {children}
                </div>
            </div>
            {actionLabel && (
                <a href={actionUrl || "#"} target={actionUrl && actionUrl !== "#" ? "_blank" : undefined} rel="noreferrer"
                    style={{ fontSize: 13, fontWeight: 700, color: "#2A7BD4", whiteSpace: "nowrap", textDecoration: "none", flexShrink: 0, paddingTop: 2 }}>
                    {actionLabel}
                </a>
            )}
        </div>
    );
}
