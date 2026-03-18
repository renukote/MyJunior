/**
 * Lex Tigress – Local Storage Service
 * Centralises all localStorage reads/writes so key names are consistent.
 *
 * Storage keys (all prefixed with "lextgress_"):
 *   lextgress_cases            – saved cases
 *   lextgress_tasks            – all tasks
 *   lextgress_notes            – all notes
 *   lextgress_settings         – app settings
 *   lextgress_team             – team members
 *   lextgress_training         – AI training data
 *   lextgress_search_history   – recent diary searches (max 10)
 *   lextgress_last_export      – ISO datetime of last data export
 */

// ─── KEY CONSTANTS ────────────────────────────────────────────────────────────

export const LS_KEYS = {
    CASES: 'lextgress_cases',
    TASKS: 'lextgress_tasks',
    NOTES: 'lextgress_notes',
    SETTINGS: 'lextgress_settings',
    TEAM: 'lextgress_team',
    TRAINING: 'lextgress_training',
    SEARCH_HISTORY: 'lextgress_search_history',
    LAST_EXPORT: 'lextgress_last_export',
} as const;

// ─── CASE PERSISTENCE (Parts 1-4) ─────────────────────────────────────────────

/** Load all cases from localStorage. Returns [] on error. */
export function loadCases(): any[] {
    try {
        const raw = localStorage.getItem(LS_KEYS.CASES);
        if (!raw) return [];
        return JSON.parse(raw);
    } catch {
        return [];
    }
}

/**
 * Save or update a case.
 * - If it doesn't exist yet: adds added_on + last_viewed stamps.
 * - If it exists: only updates last_viewed to now.
 */
export function saveCase(caseData: any): void {
    try {
        const existing: any[] = loadCases();
        const idx = existing.findIndex(
            (c) => c.diaryNumber === caseData.diaryNumber && c.diaryYear === caseData.diaryYear,
        );

        if (idx === -1) {
            const now = new Date().toISOString();
            const caseToSave = {
                ...caseData,
                added_on: caseData.added_on || now,
                last_viewed: now,
            };
            existing.push(caseToSave);
        } else {
            existing[idx] = {
                ...existing[idx],
                ...caseData,
                // Preserve original added_on; freshen last_viewed
                added_on: existing[idx].added_on ?? caseData.added_on ?? new Date().toISOString(),
                last_viewed: new Date().toISOString(),
            };
        }

        localStorage.setItem(LS_KEYS.CASES, JSON.stringify(existing));
    } catch (err) {
        console.warn('[LexTigress] saveCase failed', err);
    }
}

/** Persist the whole cases array at once (mirrors CourtSync's internal state). */
export function saveCasesArray(cases: any[]): boolean {
    try {
        const serialised = JSON.stringify(cases);
        if (serialised.length > 4.5 * 1024 * 1024) {
            console.warn('[LexTigress] Cases data approaching 5 MB limit');
            return false;
        }
        localStorage.setItem(LS_KEYS.CASES, serialised);
        return true;
    } catch {
        return false;
    }
}

/**
 * Refresh (update) a specific case by its diary number.
 * Keeps the original added_on; updates last_viewed.
 */
export function updateCase(diaryNumber: string, diaryYear: string, freshData: any): void {
    try {
        const existing: any[] = loadCases();
        const updated = existing.map((c) =>
            c.diaryNumber === diaryNumber && c.diaryYear === diaryYear
                ? {
                    ...freshData,
                    added_on: c.added_on ?? new Date().toISOString(),
                    last_viewed: new Date().toISOString(),
                }
                : c,
        );
        localStorage.setItem(LS_KEYS.CASES, JSON.stringify(updated));
    } catch (err) {
        console.warn('[LexTigress] updateCase failed', err);
    }
}

/** Remove a case by diary number / year. */
export function deleteCase(diaryNumber: string, diaryYear: string): void {
    try {
        const existing = loadCases();
        const filtered = existing.filter(
            (c) => !(c.diaryNumber === diaryNumber && c.diaryYear === diaryYear),
        );
        localStorage.setItem(LS_KEYS.CASES, JSON.stringify(filtered));
    } catch (err) {
        console.warn('[LexTigress] deleteCase failed', err);
    }
}

// ─── SEARCH HISTORY (Part 6) ──────────────────────────────────────────────────

export interface SearchHistoryEntry {
    diary_number: string;
    year: string;
    searched_at: string;
}

/** Load last-10 diary searches. */
export function loadSearchHistory(): SearchHistoryEntry[] {
    try {
        const raw = localStorage.getItem(LS_KEYS.SEARCH_HISTORY);
        return raw ? JSON.parse(raw) : [];
    } catch {
        return [];
    }
}

/** Push a new diary search to the top; deduplicate; keep max 10 entries. */
export function saveSearchHistory(diaryNumber: string, year: string): void {
    try {
        const history = loadSearchHistory();
        const filtered = history.filter((h) => h.diary_number !== diaryNumber);
        filtered.unshift({
            diary_number: diaryNumber,
            year,
            searched_at: new Date().toISOString(),
        });
        const trimmed = filtered.slice(0, 10);
        localStorage.setItem(LS_KEYS.SEARCH_HISTORY, JSON.stringify(trimmed));
    } catch (err) {
        console.warn('[LexTigress] saveSearchHistory failed', err);
    }
}

// ─── STORAGE HEALTH (Part 7) ──────────────────────────────────────────────────

export interface StorageHealth {
    usedKB: string; // e.g. "128.4"
    percent: number; // 0-100
    isWarning: boolean; // true when > 80%
}

const LIMIT_KB = 5120; // 5 MB in KB

export function checkStorageHealth(): StorageHealth {
    let totalChars = 0;
    for (const key in localStorage) {
        if (Object.prototype.hasOwnProperty.call(localStorage, key) && key.startsWith('lextgress_')) {
            totalChars += (localStorage.getItem(key) ?? '').length;
        }
    }
    const usedKB = (totalChars / 1024).toFixed(1);
    const percent = Math.min(Math.round((parseFloat(usedKB) / LIMIT_KB) * 100), 100);
    return { usedKB, percent, isWarning: percent > 80 };
}

// ─── EXPORT ALL DATA (Part 8) ─────────────────────────────────────────────────

export function exportAllData(): void {
    try {
        const allData = {
            exported_at: new Date().toISOString(),
            app: 'Lex Tigress',
            version: '1.0',
            cases: loadCases(),
            tasks: JSON.parse(localStorage.getItem(LS_KEYS.TASKS) || '[]'),
            notes: JSON.parse(localStorage.getItem(LS_KEYS.NOTES) || '[]'),
            settings: JSON.parse(localStorage.getItem(LS_KEYS.SETTINGS) || '{}'),
            team: JSON.parse(localStorage.getItem(LS_KEYS.TEAM) || '[]'),
            training: JSON.parse(localStorage.getItem(LS_KEYS.TRAINING) || '[]'),
        };

        const blob = new Blob([JSON.stringify(allData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `LexTigress_Backup_${new Date()
            .toLocaleDateString('en-IN')
            .replace(/\//g, '-')}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        // Record last export timestamp (Part 10)
        localStorage.setItem(LS_KEYS.LAST_EXPORT, new Date().toISOString());
    } catch (err) {
        console.error('[LexTigress] exportAllData failed', err);
        alert('Export failed. Please try again.');
    }
}

// ─── IMPORT ALL DATA (Part 9) ─────────────────────────────────────────────────

export function importAllData(file: File): Promise<void> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = JSON.parse((e.target?.result as string) ?? '{}');
                if (data.app !== 'Lex Tigress') {
                    alert('Invalid backup file. This file was not created by Lex Tigress.');
                    reject(new Error('Invalid backup'));
                    return;
                }
                if (data.cases) localStorage.setItem(LS_KEYS.CASES, JSON.stringify(data.cases));
                if (data.tasks) localStorage.setItem(LS_KEYS.TASKS, JSON.stringify(data.tasks));
                if (data.notes) localStorage.setItem(LS_KEYS.NOTES, JSON.stringify(data.notes));
                if (data.settings) localStorage.setItem(LS_KEYS.SETTINGS, JSON.stringify(data.settings));
                if (data.team) localStorage.setItem(LS_KEYS.TEAM, JSON.stringify(data.team));
                if (data.training) localStorage.setItem(LS_KEYS.TRAINING, JSON.stringify(data.training));
                resolve();
                window.location.reload();
            } catch {
                alert('Could not read backup file. It may be corrupted.');
                reject(new Error('Parse error'));
            }
        };
        reader.onerror = () => reject(new Error('File read error'));
        reader.readAsText(file);
    });
}

// ─── LAST BACKUP INDICATOR (Part 10) ─────────────────────────────────────────

export type BackupStatus = 'today' | 'recent' | 'old' | 'never';

export interface BackupInfo {
    status: BackupStatus;
    label: string;
    icon: string;
    color: string;
}

export function getBackupInfo(): BackupInfo {
    const raw = localStorage.getItem(LS_KEYS.LAST_EXPORT);
    if (!raw) {
        return { status: 'never', label: 'No backup — Export now', icon: '🔴', color: '#C62828' };
    }
    const last = new Date(raw);
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - last.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return { status: 'today', label: 'Backed up today', icon: '✅', color: '#1A8C5B' };
    if (diffDays <= 7) return { status: 'recent', label: `Last backup ${diffDays} day${diffDays > 1 ? 's' : ''} ago`, icon: '⚠️', color: '#9B7B28' };
    return { status: 'old', label: 'Backup overdue — Export now', icon: '🔴', color: '#C62828' };
}

/** Format an ISO timestamp in "DD MMM YYYY" style (e.g. "11 Mar 2026"). */
export function formatAddedOn(isoDate: string | undefined): string {
    if (!isoDate) return '—';
    try {
        return new Date(isoDate).toLocaleDateString('en-IN', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
        });
    } catch {
        return '—';
    }
}
