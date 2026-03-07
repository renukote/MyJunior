import { useState, useEffect } from "react";
import { useApp } from "../AppContext";
import { fmtDate, fmtDT, SectionCard, SectionIconBox } from "../caseHelpers";

// ── CASE SUMMARY ──────────────────────────────────────────────────────────────
export function CaseSummarySection({ selected, onUpdate }: { selected: any; onUpdate: (c: any) => void }) {
    const { T } = useApp();
    const [expanded, setExpanded] = useState(false);
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState(selected.summary || "");
    useEffect(() => { setDraft(selected.summary || ""); setEditing(false); }, [selected.id]);
    function save() { onUpdate({ ...selected, summary: draft }); setEditing(false); }
    return (
        <div style={{ background: T.bg, borderRadius: 12, border: `1px solid ${T.border}`, padding: "14px 16px", boxShadow: "0 1px 4px rgba(15,28,63,0.08)", marginBottom: 10 }}>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 12, flex: 1, minWidth: 0 }}>
                    <SectionIconBox icon="📋" />
                    <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 800, color: T.text, letterSpacing: 0.8, marginBottom: 5 }}>CASE SUMMARY</div>
                        {!editing && <div style={{ fontSize: 14, color: selected.summary ? T.text : T.textMuted, lineHeight: 1.6 }}>
                            {selected.summary ? (expanded ? selected.summary : selected.summary.slice(0, 120) + (selected.summary.length > 120 ? "…" : "")) : "No summary yet. Click Edit to add one."}
                        </div>}
                        {editing && (
                            <div style={{ marginTop: 4 }}>
                                <textarea value={draft} onChange={e => setDraft(e.target.value)} rows={4} placeholder="Write case summary here…"
                                    style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: `1px solid ${T.border}`, fontSize: 14, color: T.text, resize: "vertical", outline: "none", boxSizing: "border-box", fontFamily: "inherit", lineHeight: 1.6 }} />
                                <div style={{ display: "flex", gap: 7, marginTop: 6, justifyContent: "flex-end" }}>
                                    <button onClick={() => { setEditing(false); setDraft(selected.summary || ""); }} style={{ padding: "5px 12px", borderRadius: 7, border: `1px solid ${T.border}`, background: T.bg, color: T.textSub, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Cancel</button>
                                    <button onClick={save} style={{ padding: "5px 14px", borderRadius: 7, border: "none", background: "linear-gradient(135deg,#C9A84C,#9B7B28)", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>Save</button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
                <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                    {!editing && selected.summary && <button onClick={() => setExpanded(e => !e)} style={{ fontSize: 13, fontWeight: 700, color: "#2A7BD4", background: "transparent", border: "none", cursor: "pointer", whiteSpace: "nowrap" }}>{expanded ? "▲ Hide" : "▼ View"}</button>}
                    {!editing && <button onClick={() => { setEditing(true); setExpanded(true); }} style={{ fontSize: 13, fontWeight: 700, color: T.accentDark, background: T.accentBg, border: `1px solid ${T.accentBorder}`, borderRadius: 7, padding: "3px 10px", cursor: "pointer", whiteSpace: "nowrap" }}>✏️ {selected.summary ? "Edit" : "Add"}</button>}
                </div>
            </div>
        </div>
    );
}

// ── LISTINGS ──────────────────────────────────────────────────────────────────
export function ListingsSection({ selected, onUpdate }: { selected: any; onUpdate: (c: any) => void }) {
    const { T } = useApp();
    const [showForm, setShowForm] = useState(false);
    const [form, setForm] = useState({ date: "", type: "Tentative", notes: "" });
    const listings = selected.listings || [];
    const latest = listings[0];
    function addListing() {
        if (!form.date) return;
        const newL = { id: "l" + Date.now(), ...form };
        const sorted = [newL, ...listings].sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());
        onUpdate({ ...selected, listings: sorted });
        setForm({ date: "", type: "Tentative", notes: "" }); setShowForm(false);
    }
    return (
        <SectionCard icon="📑" title="LISTINGS" count={latest ? `Latest: ${latest.type} · ${fmtDate(latest.date)}` : "No listings recorded yet"} onAdd={() => setShowForm(s => !s)} addLabel={showForm ? "✕ Cancel" : "+ Add Listing"}>
            {showForm && (
                <div style={{ background: T.surface, borderRadius: 9, border: `1px solid ${T.border}`, padding: "12px", marginBottom: 10 }}>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
                        <div>
                            <label style={{ fontSize: 11, fontWeight: 700, color: T.textMuted, letterSpacing: 0.8, display: "block", marginBottom: 3 }}>DATE</label>
                            <input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} style={{ width: "100%", padding: "7px 9px", borderRadius: 7, border: `1px solid ${T.border}`, fontSize: 14, color: T.text, outline: "none", boxSizing: "border-box" }} />
                        </div>
                        <div>
                            <label style={{ fontSize: 11, fontWeight: 700, color: T.textMuted, letterSpacing: 0.8, display: "block", marginBottom: 3 }}>TYPE</label>
                            <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))} style={{ width: "100%", padding: "7px 9px", borderRadius: 7, border: `1px solid ${T.border}`, fontSize: 14, color: T.text, background: T.surface, outline: "none" }}>
                                {["Tentative", "Advance List", "Final List", "Mention", "Fresh"].map(t => <option key={t}>{t}</option>)}
                            </select>
                        </div>
                    </div>
                    <input placeholder="Notes (optional)" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} style={{ width: "100%", padding: "7px 9px", borderRadius: 7, border: `1px solid ${T.border}`, fontSize: 14, color: T.text, outline: "none", boxSizing: "border-box", marginBottom: 8 }} />
                    <div style={{ display: "flex", justifyContent: "flex-end", gap: 7 }}>
                        <button onClick={() => setShowForm(false)} style={{ padding: "5px 12px", borderRadius: 7, border: `1px solid ${T.border}`, background: T.bg, color: T.textSub, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Cancel</button>
                        <button onClick={addListing} style={{ padding: "5px 14px", borderRadius: 7, border: "none", background: "linear-gradient(135deg,#C9A84C,#9B7B28)", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>Add</button>
                    </div>
                </div>
            )}
            {listings.map((l: any) => (
                <div key={l.id} style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", padding: "8px 10px", background: T.surface, borderRadius: 8, border: `1px solid ${T.borderSoft}`, marginBottom: 6 }}>
                    <div>
                        <div style={{ fontSize: 14, fontWeight: 700, color: T.text }}>{fmtDate(l.date)}</div>
                        <div style={{ fontSize: 13, color: "#2A7BD4", fontWeight: 600 }}>{l.type}</div>
                        {l.notes && <div style={{ fontSize: 13, color: T.textMuted, marginTop: 2 }}>{l.notes}</div>}
                    </div>
                    <button onClick={() => onUpdate({ ...selected, listings: listings.filter((x: any) => x.id !== l.id) })} style={{ background: "none", border: "none", color: T.textMuted, cursor: "pointer", fontSize: 16, padding: "2px 4px", lineHeight: 1 }}>✕</button>
                </div>
            ))}
        </SectionCard>
    );
}

// ── TIMELINE ──────────────────────────────────────────────────────────────────

// ── helpers (safe for both ISO "YYYY-MM-DD" and raw SC "DD-MM-YYYY [...]") ──
function parseSCDate(raw: string | null | undefined): string {
    if (!raw) return "";
    const m = raw.match(/(\d{2})-(\d{2})-(\d{4})/);
    return m ? `${m[3]}-${m[2]}-${m[1]}` : "";
}
function extractJudges(raw: string | null | undefined): string[] {
    if (!raw) return [];
    const m = raw.match(/\[(.+)\]/);
    if (!m) return [];
    return m[1].split(/\band\b/i)
        .map((j: string) => j.replace(/HON'BLE\s+MR\.\s+/i, "").trim())
        .filter(Boolean);
}
function extractLikelyDate(c: any): string {
    if (c.likelyListedOn) return c.likelyListedOn;
    if (c.nextHearingDate) return c.nextHearingDate;
    return "";
}
function getDaysUntilDate(iso: string): number | null {
    if (!iso) return null;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const t = new Date(iso); t.setHours(0, 0, 0, 0);
    if (isNaN(t.getTime())) return null;
    return Math.round((t.getTime() - today.getTime()) / 86400000);
}

// ── auto-build SC events from case fields ─────────────────────────────────────
function buildSCEvents(c: any): any[] {
    const evs: any[] = [];
    const lastListedOn   = c.lastListedOn  || parseSCDate(c.lastListedOnRaw);
    const likelyListedOn = extractLikelyDate(c);
    const judges = c.lastListedJudges?.length
        ? c.lastListedJudges
        : extractJudges(c.lastListedOnRaw || "");

    // 1. Case Filed
    if (c.dateOfFiling) evs.push({
        id: "__filing", type: "filing",
        date: c.dateOfFiling,
        event: "Case filed in Supreme Court",
        sub: `Diary No. ${c.diaryNumber}/${c.diaryYear} · Registered`,
        source: "SC Registry", auto: true,
    });

    // 2. Last Listed On
    if (lastListedOn) evs.push({
        id: "__listed", type: "listing",
        date: lastListedOn,
        event: "Case listed in Supreme Court",
        sub: judges.length
            ? `Before ${judges.join(" & ")}`
            : `${c.courtNumber || "Court No. 1"} · ${c.timeOfSitting || "10:30 AM"}`,
        sub2: judges.length ? `${c.courtNumber || "Court No. 1"} · ${c.timeOfSitting || "10:30 AM"}` : null,
        source: "SC Cause List", auto: true,
    });

    // 3. Order date parsed from stage string
    const stageOrderMatch = (c.stage || "").match(/Ord\s*dt[:\s]*(\d{2})-(\d{2})-(\d{4})/i);
    const linkedCase      = (c.stage || "").match(/D\.\s*No\.\s*([\d]+\s*of\s*\d{4})/i);
    if (stageOrderMatch) evs.push({
        id: "__order", type: "order",
        date: `${stageOrderMatch[3]}-${stageOrderMatch[2]}-${stageOrderMatch[1]}`,
        event: "Order passed",
        sub: linkedCase ? `Listed with D. No. ${linkedCase[1]}` : "Motion Hearing — Adjourned Matters",
        source: "SC Order", auto: true,
    });

    // 4. Tentatively listed on (upcoming)
    if (likelyListedOn) evs.push({
        id: "__upcoming", type: "upcoming",
        date: likelyListedOn,
        event: "Tentatively listed on",
        sub: "Computer generated · Subject to revision",
        source: "SC Website", auto: true, upcoming: true,
    });

    // 5. Last fetched timestamp
    if (c.lastCheckedAt) evs.push({
        id: "__fetched", type: "system",
        date: c.lastCheckedAt,
        event: "Case data fetched from SC",
        sub: `CNR: ${c.cnrNumber || "—"}`,
        source: "Lex Tigress", auto: true, isDatetime: true,
    });

    return evs;
}

const TL_COLOR: Record<string, string> = {
    filing: "#2A7BD4", listing: "#C9A84C", order: "#7B3FA0",
    upcoming: "#1A8C5B", system: "#8A94B0",
    hearing: "#C9A84C", notice: "#C62828", other: "#8A94B0",
};
const TL_LABEL: Record<string, string> = {
    filing: "FILED", listing: "LISTED", order: "ORDER",
    upcoming: "UPCOMING", system: "SYNCED",
    hearing: "HEARING", notice: "NOTICE", other: "EVENT",
};
const TL_ICON: Record<string, string> = {
    filing: "📁", listing: "⚖️", order: "📋",
    upcoming: "📅", system: "🔄",
    hearing: "🗓️", notice: "📨", other: "🔖",
};

export function TimelineSection({ selected, onUpdate }: { selected: any; onUpdate: (c: any) => void }) {
    const { T } = useApp();
    const [showForm, setShowForm] = useState(false);
    const [form, setForm] = useState({ date: "", event: "", type: "hearing" });

    // Merge SC auto-events with manual events, sort newest first
    const scEvents  = buildSCEvents(selected);
    const manualEvs = (selected.timeline || []).filter((e: any) => !e.id?.startsWith("__"));
    const allEvents = [...scEvents, ...manualEvs]
        .sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());

    function addEvent() {
        if (!form.date || !form.event.trim()) return;
        onUpdate({ ...selected, timeline: [{ id: "tl" + Date.now(), ...form }, ...(selected.timeline || [])] });
        setForm({ date: "", event: "", type: "hearing" });
        setShowForm(false);
    }
    function removeEvent(id: string) {
        onUpdate({ ...selected, timeline: (selected.timeline || []).filter((x: any) => x.id !== id) });
    }

    return (
        <SectionCard
            icon="🕐"
            title="TIMELINE"
            count={`${allEvents.length} event${allEvents.length !== 1 ? "s" : ""}`}
            onAdd={() => setShowForm(s => !s)}
            addLabel={showForm ? "✕ Cancel" : "+ Add Event"}
        >
            {/* ── Add event form ── */}
            {showForm && (
                <div style={{ background: T.surface, borderRadius: 9, border: `1px solid ${T.border}`, padding: "12px", marginBottom: 12 }}>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
                        <div>
                            <label style={{ fontSize: 11, fontWeight: 700, color: T.textMuted, letterSpacing: 0.8, display: "block", marginBottom: 3 }}>DATE</label>
                            <input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
                                style={{ width: "100%", padding: "7px 9px", borderRadius: 7, border: `1px solid ${T.border}`, fontSize: 14, color: T.text, outline: "none", boxSizing: "border-box" }} />
                        </div>
                        <div>
                            <label style={{ fontSize: 11, fontWeight: 700, color: T.textMuted, letterSpacing: 0.8, display: "block", marginBottom: 3 }}>TYPE</label>
                            <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}
                                style={{ width: "100%", padding: "7px 9px", borderRadius: 7, border: `1px solid ${T.border}`, fontSize: 14, color: T.text, background: T.surface, outline: "none" }}>
                                {["hearing", "filing", "order", "listing", "notice", "other"].map(t =>
                                    <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
                                )}
                            </select>
                        </div>
                    </div>
                    <input placeholder="Describe the event…" value={form.event} onChange={e => setForm(f => ({ ...f, event: e.target.value }))}
                        style={{ width: "100%", padding: "7px 9px", borderRadius: 7, border: `1px solid ${T.border}`, fontSize: 14, color: T.text, outline: "none", boxSizing: "border-box", marginBottom: 8 }} />
                    <div style={{ display: "flex", justifyContent: "flex-end", gap: 7 }}>
                        <button onClick={() => setShowForm(false)}
                            style={{ padding: "5px 12px", borderRadius: 7, border: `1px solid ${T.border}`, background: T.bg, color: T.textSub, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Cancel</button>
                        <button onClick={addEvent}
                            style={{ padding: "5px 14px", borderRadius: 7, border: "none", background: "linear-gradient(135deg,#C9A84C,#9B7B28)", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>Add</button>
                    </div>
                </div>
            )}

            {/* ── SC auto-events notice ── */}
            <div style={{ fontSize: 11, color: T.textMuted, marginBottom: 12, padding: "6px 10px", background: T.surface, borderRadius: 7, border: `1px solid ${T.borderSoft}` }}>
                ℹ️ &nbsp;Events marked <span style={{ color: T.accent, fontWeight: 700 }}>SC</span> are auto-fetched from the Supreme Court database.
            </div>

            {/* ── Timeline list ── */}
            <div style={{ position: "relative" }}>
                {allEvents.map((ev: any, i: number) => {
                    const isLast  = i === allEvents.length - 1;
                    const color   = TL_COLOR[ev.type] || "#8A94B0";
                    const label   = TL_LABEL[ev.type] || ev.type?.toUpperCase();
                    const icon    = TL_ICON[ev.type]  || "🔖";
                    const days    = ev.upcoming ? getDaysUntilDate(ev.date) : null;
                    const isAuto  = ev.auto === true;

                    return (
                        <div key={ev.id} style={{ display: "flex", position: "relative" }}>
                            {/* spine + dot */}
                            <div style={{ width: 52, display: "flex", flexDirection: "column", alignItems: "center", flexShrink: 0 }}>
                                <div style={{ width: 2, height: 12, background: i === 0 ? "transparent" : T.borderSoft }} />
                                <div style={{
                                    width: 32, height: 32, borderRadius: "50%",
                                    background: ev.upcoming ? "transparent" : color,
                                    border: ev.upcoming ? `2px dashed ${color}` : `3px solid ${T.bg}`,
                                    boxShadow: ev.upcoming ? "none" : `0 0 0 3px ${color}25`,
                                    display: "flex", alignItems: "center", justifyContent: "center",
                                    fontSize: 14, flexShrink: 0, zIndex: 1,
                                }}>
                                    {icon}
                                </div>
                                {!isLast && <div style={{ width: 2, flex: 1, minHeight: 16, background: T.borderSoft }} />}
                            </div>

                            {/* card */}
                            <div style={{ flex: 1, paddingTop: 6, paddingBottom: 10, paddingRight: 4 }}>
                                <div style={{
                                    background: ev.upcoming ? `${color}08` : T.bg,
                                    borderRadius: 11,
                                    border: `1px solid ${ev.upcoming ? `${color}35` : T.border}`,
                                    padding: "10px 13px",
                                    transition: "background 0.15s",
                                }}>
                                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            {/* badge row */}
                                            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 5, flexWrap: "wrap" }}>
                                                <span style={{ fontSize: 9, fontWeight: 900, color: "#fff", background: color, padding: "2px 7px", borderRadius: 20, letterSpacing: 0.8 }}>
                                                    {label}
                                                </span>
                                                {isAuto && (
                                                    <span style={{ fontSize: 9, fontWeight: 800, color: T.accent, background: T.accentBg, border: `1px solid ${T.accentBorder}`, padding: "1px 6px", borderRadius: 20, letterSpacing: 0.6 }}>
                                                        SC
                                                    </span>
                                                )}
                                                <span style={{ fontSize: 10, color: T.textMuted }}>via {ev.source}</span>
                                            </div>
                                            {/* title */}
                                            <div style={{ fontSize: 13.5, fontWeight: 700, color: ev.upcoming ? color : T.text, lineHeight: 1.4 }}>
                                                {ev.event}
                                            </div>
                                            {/* sub */}
                                            {ev.sub && <div style={{ fontSize: 12, color: T.textMuted, marginTop: 3 }}>{ev.sub}</div>}
                                            {ev.sub2 && <div style={{ fontSize: 11, color: T.textMuted }}>{ev.sub2}</div>}
                                        </div>

                                        {/* right side: date + delete */}
                                        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4, flexShrink: 0 }}>
                                            <div style={{ fontSize: 12, fontWeight: 700, color: ev.upcoming ? color : T.textSub }}>
                                                {ev.isDatetime ? fmtDT(ev.date) : fmtDate(ev.date)}
                                            </div>
                                            {ev.upcoming && days !== null && (
                                                <div style={{
                                                    fontSize: 10, fontWeight: 800,
                                                    color: days <= 7 ? "#E65100" : color,
                                                    background: days <= 7 ? "#FFF3E0" : `${color}15`,
                                                    padding: "2px 8px", borderRadius: 10,
                                                }}>
                                                    {days === 0 ? "Today" : days < 0 ? `${Math.abs(days)}d ago` : `in ${days}d`}
                                                </div>
                                            )}
                                            {/* only manual events can be deleted */}
                                            {!isAuto && (
                                                <button onClick={() => removeEvent(ev.id)}
                                                    style={{ background: "none", border: "none", color: T.textMuted, cursor: "pointer", fontSize: 15, padding: "0 2px", lineHeight: 1 }}
                                                    aria-label="Remove">✕</button>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
        </SectionCard>
    );
}

// ── TASKS ─────────────────────────────────────────────────────────────────────
export function TasksSection({ selected, onUpdate }: { selected: any; onUpdate: (c: any) => void }) {
    const { T } = useApp();
    const [showForm, setShowForm] = useState(false);
    const [newTask, setNewTask] = useState("");
    const tasks = selected.tasks || [];
    const pending = tasks.filter((t: any) => !t.done);
    const done = tasks.filter((t: any) => t.done);
    function addTask() { if (!newTask.trim()) return; onUpdate({ ...selected, tasks: [{ id: "t" + Date.now(), text: newTask.trim(), done: false, createdAt: new Date().toISOString() }, ...tasks] }); setNewTask(""); setShowForm(false); }
    function toggleTask(id: string) { onUpdate({ ...selected, tasks: tasks.map((t: any) => t.id === id ? { ...t, done: !t.done } : t) }); }
    function deleteTask(id: string) { onUpdate({ ...selected, tasks: tasks.filter((t: any) => t.id !== id) }); }
    return (
        <SectionCard icon="✅" title="TASKS" count={`${pending.length} pending · ${done.length} done`} onAdd={() => setShowForm(s => !s)} addLabel={showForm ? "✕ Cancel" : "+ New Task"}>
            {showForm && (
                <div style={{ display: "flex", gap: 7, marginBottom: 10 }}>
                    <input value={newTask} onChange={e => setNewTask(e.target.value)} placeholder="Describe the task…" onKeyDown={e => e.key === "Enter" && addTask()} style={{ flex: 1, padding: "7px 10px", borderRadius: 7, border: `1px solid ${T.border}`, fontSize: 14, color: T.text, outline: "none" }} />
                    <button onClick={addTask} style={{ padding: "7px 14px", borderRadius: 7, border: "none", background: "linear-gradient(135deg,#C9A84C,#9B7B28)", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>Add</button>
                </div>
            )}
            {tasks.length === 0 && <div style={{ fontSize: 14, color: T.textMuted }}>(No tasks for this case)</div>}
            {pending.map((t: any) => (
                <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 9, padding: "8px 10px", background: T.surface, borderRadius: 8, border: `1px solid ${T.borderSoft}`, marginBottom: 6 }}>
                    <input type="checkbox" checked={false} onChange={() => toggleTask(t.id)} style={{ width: 15, height: 15, accentColor: T.accent, cursor: "pointer", flexShrink: 0 }} />
                    <span style={{ flex: 1, fontSize: 14, color: T.text }}>{t.text}</span>
                    <span style={{ fontSize: 11, color: T.textMuted, flexShrink: 0 }}>{fmtDate(t.createdAt)}</span>
                    <button onClick={() => deleteTask(t.id)} style={{ background: "none", border: "none", color: T.textMuted, cursor: "pointer", fontSize: 15 }}>✕</button>
                </div>
            ))}
            {done.length > 0 && <>
                <div style={{ fontSize: 11, fontWeight: 700, color: T.textMuted, letterSpacing: 0.8, margin: "8px 0 5px" }}>COMPLETED</div>
                {done.map((t: any) => (
                    <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 9, padding: "7px 10px", background: "#F8FAF8", borderRadius: 8, border: `1px solid ${T.borderSoft}`, marginBottom: 5, opacity: 0.7 }}>
                        <input type="checkbox" checked={true} onChange={() => toggleTask(t.id)} style={{ width: 15, height: 15, accentColor: "#1A8C5B", cursor: "pointer", flexShrink: 0 }} />
                        <span style={{ flex: 1, fontSize: 14, color: T.textMuted, textDecoration: "line-through" }}>{t.text}</span>
                        <button onClick={() => deleteTask(t.id)} style={{ background: "none", border: "none", color: T.textMuted, cursor: "pointer", fontSize: 15 }}>✕</button>
                    </div>
                ))}
            </>}
        </SectionCard>
    );
}

// ── NOTES ─────────────────────────────────────────────────────────────────────
export function NotesSection({ selected, onUpdate }: { selected: any; onUpdate: (c: any) => void }) {
    const { T } = useApp();
    const [showForm, setShowForm] = useState(false);
    const [draft, setDraft] = useState("");
    const notes = selected.notes || [];
    function addNote() { if (!draft.trim()) return; onUpdate({ ...selected, notes: [{ id: "n" + Date.now(), text: draft.trim(), createdAt: new Date().toISOString() }, ...notes] }); setDraft(""); setShowForm(false); }
    return (
        <SectionCard icon="📝" title="NOTES" count={notes.length > 0 ? `${notes.length} note${notes.length !== 1 ? "s" : ""}` : "No notes yet"} onAdd={() => setShowForm(s => !s)} addLabel={showForm ? "✕ Cancel" : "+ New Note"}>
            {showForm && (
                <div style={{ marginBottom: 10 }}>
                    <textarea value={draft} onChange={e => setDraft(e.target.value)} rows={3} placeholder="Write a note…" style={{ width: "100%", padding: "8px 10px", borderRadius: 7, border: `1px solid ${T.border}`, fontSize: 14, color: T.text, resize: "vertical", outline: "none", boxSizing: "border-box", fontFamily: "inherit" }} />
                    <div style={{ display: "flex", justifyContent: "flex-end", gap: 7, marginTop: 6 }}>
                        <button onClick={() => { setShowForm(false); setDraft(""); }} style={{ padding: "5px 12px", borderRadius: 7, border: `1px solid ${T.border}`, background: T.bg, color: T.textSub, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Cancel</button>
                        <button onClick={addNote} style={{ padding: "5px 14px", borderRadius: 7, border: "none", background: "linear-gradient(135deg,#C9A84C,#9B7B28)", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>Save Note</button>
                    </div>
                </div>
            )}
            {notes.map((n: any) => (
                <div key={n.id} style={{ background: T.surface, borderRadius: 8, border: `1px solid ${T.borderSoft}`, padding: "10px 12px", marginBottom: 8 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                        <span style={{ fontSize: 11, color: T.textMuted }}>{fmtDT(n.createdAt)}</span>
                        <button onClick={() => onUpdate({ ...selected, notes: notes.filter((x: any) => x.id !== n.id) })} style={{ background: "none", border: "none", color: T.textMuted, cursor: "pointer", fontSize: 15 }}>✕</button>
                    </div>
                    <div style={{ fontSize: 14, color: T.text, lineHeight: 1.6 }}>{n.text}</div>
                </div>
            ))}
        </SectionCard>
    );
}

// ── DOCUMENTS ─────────────────────────────────────────────────────────────────
export function DocumentsSection({ selected, onUpdate }: { selected: any; onUpdate: (c: any) => void }) {
    const { T } = useApp();
    const [showForm, setShowForm] = useState(false);
    const [docName, setDocName] = useState("");
    const [docUrl, setDocUrl] = useState("");
    const docs = selected.documents || [];
    function addDoc() { if (!docName.trim()) return; onUpdate({ ...selected, documents: [...docs, { id: "d" + Date.now(), name: docName.trim(), url: docUrl.trim() || "#", uploadedAt: new Date().toISOString() }] }); setDocName(""); setDocUrl(""); setShowForm(false); }
    return (
        <SectionCard icon="📁" title="DOCUMENTS" count={docs.length > 0 ? `${docs.length} file${docs.length !== 1 ? "s" : ""} saved` : "No documents saved yet"} onAdd={() => setShowForm(s => !s)} addLabel={showForm ? "✕ Cancel" : "+ Upload a doc"}>
            {showForm && (
                <div style={{ background: T.surface, borderRadius: 9, border: `1px solid ${T.border}`, padding: "12px", marginBottom: 10 }}>
                    <input placeholder="Document name" value={docName} onChange={e => setDocName(e.target.value)} style={{ width: "100%", padding: "7px 9px", borderRadius: 7, border: `1px solid ${T.border}`, fontSize: 14, color: T.text, outline: "none", boxSizing: "border-box", marginBottom: 7 }} />
                    <input placeholder="URL or file path (optional)" value={docUrl} onChange={e => setDocUrl(e.target.value)} style={{ width: "100%", padding: "7px 9px", borderRadius: 7, border: `1px solid ${T.border}`, fontSize: 14, color: T.text, outline: "none", boxSizing: "border-box", marginBottom: 8 }} />
                    <div style={{ display: "flex", justifyContent: "flex-end", gap: 7 }}>
                        <button onClick={() => { setShowForm(false); setDocName(""); setDocUrl(""); }} style={{ padding: "5px 12px", borderRadius: 7, border: `1px solid ${T.border}`, background: T.bg, color: T.textSub, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Cancel</button>
                        <button onClick={addDoc} style={{ padding: "5px 14px", borderRadius: 7, border: "none", background: "linear-gradient(135deg,#C9A84C,#9B7B28)", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>Add</button>
                    </div>
                </div>
            )}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {docs.map((d: any) => (
                    <div key={d.id} style={{ display: "flex", alignItems: "center", gap: 7, padding: "8px 12px", background: T.surface, borderRadius: 9, border: `1px solid ${T.border}`, minWidth: 140, flex: "1 1 140px" }}>
                        <span style={{ fontSize: 18, flexShrink: 0 }}>📄</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                            <a href={d.url} target="_blank" rel="noreferrer" style={{ fontSize: 13, fontWeight: 600, color: "#2A7BD4", textDecoration: "none", display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.name}</a>
                            <div style={{ fontSize: 11, color: T.textMuted }}>{fmtDate(d.uploadedAt)}</div>
                        </div>
                        <button onClick={() => onUpdate({ ...selected, documents: docs.filter((x: any) => x.id !== d.id) })} style={{ background: "none", border: "none", color: T.textMuted, cursor: "pointer", fontSize: 15 }}>✕</button>
                    </div>
                ))}
            </div>
        </SectionCard>
    );
}

// ── APPLICATIONS ──────────────────────────────────────────────────────────────
export function ApplicationsSection({ selected, onUpdate }: { selected: any; onUpdate: (c: any) => void }) {
    const { T } = useApp();
    const [showForm, setShowForm] = useState(false);
    const [form, setForm] = useState({ title: "", status: "Pending", filedOn: "" });
    const apps = selected.applications || [];
    const STATUS_COLORS: Record<string, string> = { Pending: "#C9A84C", Allowed: "#1A8C5B", Dismissed: "#C62828", Withdrawn: "#8A94B0" };
    function addApp() { if (!form.title.trim()) return; onUpdate({ ...selected, applications: [...apps, { id: "a" + Date.now(), ...form, filedOn: form.filedOn || new Date().toISOString().split("T")[0] }] }); setForm({ title: "", status: "Pending", filedOn: "" }); setShowForm(false); }
    function updateStatus(id: string, status: string) { onUpdate({ ...selected, applications: apps.map((a: any) => a.id === id ? { ...a, status } : a) }); }
    return (
        <SectionCard icon="📂" title="APPLICATIONS" count={apps.length > 0 ? `${apps.length} application${apps.length !== 1 ? "s" : ""}` : "No applications filed"} onAdd={() => setShowForm(s => !s)} addLabel={showForm ? "✕ Cancel" : "+ Add Application"}>
            {showForm && (
                <div style={{ background: T.surface, borderRadius: 9, border: `1px solid ${T.border}`, padding: "12px", marginBottom: 10 }}>
                    <input placeholder="Application title (e.g. IA No. 1/2024 – Stay Application)" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} style={{ width: "100%", padding: "7px 9px", borderRadius: 7, border: `1px solid ${T.border}`, fontSize: 14, color: T.text, outline: "none", boxSizing: "border-box", marginBottom: 7 }} />
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
                        <div>
                            <label style={{ fontSize: 11, fontWeight: 700, color: T.textMuted, letterSpacing: 0.8, display: "block", marginBottom: 3 }}>STATUS</label>
                            <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))} style={{ width: "100%", padding: "7px 9px", borderRadius: 7, border: `1px solid ${T.border}`, fontSize: 14, color: T.text, background: T.surface, outline: "none" }}>
                                {["Pending", "Allowed", "Dismissed", "Withdrawn"].map(s => <option key={s}>{s}</option>)}
                            </select>
                        </div>
                        <div>
                            <label style={{ fontSize: 11, fontWeight: 700, color: T.textMuted, letterSpacing: 0.8, display: "block", marginBottom: 3 }}>FILED ON</label>
                            <input type="date" value={form.filedOn} onChange={e => setForm(f => ({ ...f, filedOn: e.target.value }))} style={{ width: "100%", padding: "7px 9px", borderRadius: 7, border: `1px solid ${T.border}`, fontSize: 14, color: T.text, outline: "none", boxSizing: "border-box" }} />
                        </div>
                    </div>
                    <div style={{ display: "flex", justifyContent: "flex-end", gap: 7 }}>
                        <button onClick={() => setShowForm(false)} style={{ padding: "5px 12px", borderRadius: 7, border: `1px solid ${T.border}`, background: T.bg, color: T.textSub, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Cancel</button>
                        <button onClick={addApp} style={{ padding: "5px 14px", borderRadius: 7, border: "none", background: "linear-gradient(135deg,#C9A84C,#9B7B28)", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>Add</button>
                    </div>
                </div>
            )}
            {apps.map((a: any) => (
                <div key={a.id} style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10, padding: "9px 11px", background: T.surface, borderRadius: 8, border: `1px solid ${T.borderSoft}`, marginBottom: 6 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 14, fontWeight: 600, color: T.text, marginBottom: 4 }}>{a.title}</div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                            <select value={a.status} onChange={e => updateStatus(a.id, e.target.value)} style={{ padding: "3px 8px", borderRadius: 6, border: `1px solid ${STATUS_COLORS[a.status] || T.border}`, background: `${STATUS_COLORS[a.status] || "#8A94B0"}15`, color: STATUS_COLORS[a.status] || T.textMuted, fontSize: 13, fontWeight: 700, cursor: "pointer", outline: "none" }}>
                                {["Pending", "Allowed", "Dismissed", "Withdrawn"].map(s => <option key={s}>{s}</option>)}
                            </select>
                            <span style={{ fontSize: 11, color: T.textMuted }}>Filed: {fmtDate(a.filedOn)}</span>
                        </div>
                    </div>
                    <button onClick={() => onUpdate({ ...selected, applications: apps.filter((x: any) => x.id !== a.id) })} style={{ background: "none", border: "none", color: T.textMuted, cursor: "pointer", fontSize: 15, padding: "2px 4px", lineHeight: 1 }}>✕</button>
                </div>
            ))}
        </SectionCard>
    );
}