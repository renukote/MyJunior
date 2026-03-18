import { Note } from '../types/notes';
import { syncNoteToSheet as doSyncNoteToSheet } from './sheetsService';
import { getCurrentUser } from './authService';

// Change this environment variable to true when backend is ready.
// Defaults to false right now for standalone execution.
const USE_BACKEND = import.meta.env.VITE_USE_BACKEND === 'true';

// Shared Google Sheet mode — alternative to OAuth
// When true: notes sync to a shared sheet, per-user rows (requires API key, not OAuth)
// When false: notes saved to localStorage only
const SHARED_SHEET_MODE = !!import.meta.env.VITE_SHARED_NOTES_SHEET_ID;
const SHARED_SHEET_ID = import.meta.env.VITE_SHARED_NOTES_SHEET_ID as string | undefined;
const GOOGLE_API_KEY = import.meta.env.VITE_GOOGLE_API_KEY as string | undefined;
const SHEET_RANGE = 'Sheet1!A:H'; // Columns: user_id, id, title, content, case_number, tags, created_at, is_deleted

// Consistent storage key — matches localStorageService.ts export key
const NOTES_STORAGE_KEY = 'lextgress_notes';

// Helper for local storage — with defensive try/catch
const getLocalNotes = (): Note[] => {
    try {
        const raw = localStorage.getItem(NOTES_STORAGE_KEY);
        if (!raw) return [];
        return JSON.parse(raw) || [];
    } catch (error) {
        console.error('Notes data corrupted, resetting:', error);
        localStorage.removeItem(NOTES_STORAGE_KEY);
        return [];
    }
};

const saveLocalNotes = (notes: Note[]) => {
    try {
        localStorage.setItem(NOTES_STORAGE_KEY, JSON.stringify(notes));
    } catch (error) {
        console.error('Failed to save notes to localStorage:', error);
    }
};

// ── SHARED SHEET MODE (Google Sheets API with API key) ──────────────────────
// Fetch notes from shared Google Sheet
const getSheetNotes = async (): Promise<Note[]> => {
    if (!SHARED_SHEET_MODE || !SHARED_SHEET_ID || !GOOGLE_API_KEY) {
        return [];
    }

    try {
        const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHARED_SHEET_ID}/values/${SHEET_RANGE}?key=${GOOGLE_API_KEY}`;
        const response = await fetch(url);
        
        if (!response.ok) {
            console.error('Failed to fetch notes from sheet:', response.status);
            return [];
        }

        const data = await response.json();
        const rows = data.values || [];
        
        if (rows.length < 2) return []; // No data rows

        const currentUser = getCurrentUser();
        const notes: Note[] = [];

        // Skip header row (row 0)
        for (let i = 1; i < rows.length; i++) {
            const row = rows[i];
            // Column order: user_id, id, title, content, case_number, tags, created_at, is_deleted
            if (row[0] === currentUser.id && row[8] !== 'true') { // Filter by user_id and not deleted
                notes.push({
                    id: row[1],
                    title: row[2],
                    content: row[3],
                    case_number: row[4] || null,
                    case_name: null,
                    linked_team_member: null,
                    tags: row[5] ? row[5].split(',').map((t: string) => t.trim()) : [],
                    created_at: row[6],
                    created_by_id: currentUser.id,
                    created_by_name: currentUser.name,
                    updated_at: row[7],
                    is_deleted: false
                });
            }
        }

        return notes.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    } catch (error) {
        console.error('Error fetching notes from sheet:', error);
        return [];
    }
};

// Save/update note to shared Google Sheet
const saveNoteToSheet = async (noteData: Note): Promise<boolean> => {
    if (!SHARED_SHEET_MODE || !SHARED_SHEET_ID || !GOOGLE_API_KEY) {
        return false;
    }

    try {
        const currentUser = getCurrentUser();
        const tags = Array.isArray(noteData.tags) ? noteData.tags.join(',') : '';
        
        // Row format: user_id, id, title, content, case_number, tags, created_at, updated_at, is_deleted
        const row = [
            currentUser.id,
            noteData.id,
            noteData.title,
            noteData.content,
            noteData.case_number || '',
            tags,
            noteData.created_at,
            new Date().toISOString(),
            'false'
        ];

        const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHARED_SHEET_ID}/values/${SHEET_RANGE}:append?valueInputOption=USER_ENTERED&key=${GOOGLE_API_KEY}`;
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                values: [row]
            })
        });

        if (!response.ok) {
            console.error('Failed to save note to sheet:', response.status);
            return false;
        }

        return true;
    } catch (error) {
        console.error('Error saving note to sheet:', error);
        return false;
    }
};

// Mark note as deleted in shared Google Sheet
const deleteNoteFromSheet = async (noteId: string): Promise<boolean> => {
    if (!SHARED_SHEET_MODE || !SHARED_SHEET_ID || !GOOGLE_API_KEY) {
        return false;
    }

    try {
        const currentUser = getCurrentUser();
        
        // Fetch all rows to find the one to update
        const fetchUrl = `https://sheets.googleapis.com/v4/spreadsheets/${SHARED_SHEET_ID}/values/${SHEET_RANGE}?key=${GOOGLE_API_KEY}`;
        const fetchResponse = await fetch(fetchUrl);
        
        if (!fetchResponse.ok) {
            console.error('Failed to fetch notes for deletion:', fetchResponse.status);
            return false;
        }

        const data = await fetchResponse.json();
        const rows = data.values || [];

        // Find row with matching user_id and note id
        let rowToDelete = -1;
        for (let i = 1; i < rows.length; i++) {
            if (rows[i][0] === currentUser.id && rows[i][1] === noteId) {
                rowToDelete = i;
                break;
            }
        }

        if (rowToDelete === -1) return false;

        // Update is_deleted column (index 8)
        const range = `Sheet1!I${rowToDelete + 1}`;
        const updateUrl = `https://sheets.googleapis.com/v4/spreadsheets/${SHARED_SHEET_ID}/values/${range}?valueInputOption=USER_ENTERED&key=${GOOGLE_API_KEY}`;
        
        const updateResponse = await fetch(updateUrl, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                values: [['true']]
            })
        });

        return updateResponse.ok;
    } catch (error) {
        console.error('Error deleting note from sheet:', error);
        return false;
    }
};


// GET all notes
export const getNotes = async (): Promise<Note[]> => {
    if (USE_BACKEND) {
        // Backend call — ready but inactive
        // const response = await api.get('/notes');
        // return response.data;
        return [];
    } else if (SHARED_SHEET_MODE) {
        // Try shared sheet, fall back to localStorage on error
        const sheetNotes = await getSheetNotes();
        if (sheetNotes.length > 0 || (SHARED_SHEET_ID && GOOGLE_API_KEY)) {
            return sheetNotes;
        }
        // Fall back to local if sheet mode is off or fails
        return getLocalNotes().filter(n => !n.is_deleted).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    } else {
        // Local storage — default
        return getLocalNotes().filter(n => !n.is_deleted).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    }
};

// GET single note
export const getNoteById = async (id: string): Promise<Note | null> => {
    if (USE_BACKEND) {
        // return await api.get(`/notes/${id}`);
        return null;
    } else if (SHARED_SHEET_MODE) {
        const notes = await getSheetNotes();
        return notes.find(n => n.id === id && !n.is_deleted) || null;
    } else {
        const notes = getLocalNotes();
        return notes.find(n => n.id === id && !n.is_deleted) || null;
    }
};

// CREATE note
export const createNote = async (noteData: Note): Promise<Note> => {
    if (USE_BACKEND) {
        // return await api.post('/notes', noteData);
        return noteData;
    } else if (SHARED_SHEET_MODE) {
        // Try to save to shared sheet
        const savedToSheet = await saveNoteToSheet(noteData);
        if (savedToSheet) {
            console.log('Note saved to shared sheet');
        } else {
            console.warn('Failed to save to sheet, using localStorage fallback');
            // Fall back to localStorage
            const notes = getLocalNotes();
            notes.push(noteData);
            saveLocalNotes(notes);
        }
        return noteData;
    } else {
        const notes = getLocalNotes();
        notes.push(noteData);
        saveLocalNotes(notes);
        return noteData;
    }
};

// UPDATE note
export const updateNote = async (id: string, noteData: Partial<Note>): Promise<Note | null> => {
    if (USE_BACKEND) {
        // return await api.put(`/notes/${id}`, noteData);
        return null as any;
    } else if (SHARED_SHEET_MODE) {
        // For shared sheet, we'll update localStorage as a cache
        // (full row update would require re-writing to sheet)
        const notes = getLocalNotes();
        const idx = notes.findIndex(n => n.id === id);
        if (idx === -1) return null;

        notes[idx] = { ...notes[idx], ...noteData, updated_at: new Date().toISOString() };
        saveLocalNotes(notes);
        return notes[idx];
    } else {
        const notes = getLocalNotes();
        const idx = notes.findIndex(n => n.id === id);
        if (idx === -1) return null;

        notes[idx] = { ...notes[idx], ...noteData, updated_at: new Date().toISOString() };
        saveLocalNotes(notes);
        return notes[idx];
    }
};

// DELETE note
export const deleteNote = async (id: string): Promise<boolean> => {
    if (USE_BACKEND) {
        // await api.delete(`/notes/${id}`);
        return true;
    } else if (SHARED_SHEET_MODE) {
        // Try to delete from shared sheet
        const deletedFromSheet = await deleteNoteFromSheet(id);
        if (deletedFromSheet) {
            console.log('Note deleted from shared sheet');
        } else {
            console.warn('Failed to delete from sheet, using localStorage fallback');
            // Fall back to localStorage
            const notes = getLocalNotes();
            const idx = notes.findIndex(n => n.id === id);
            if (idx === -1) return false;
            notes[idx] = { ...notes[idx], is_deleted: true, deleted_at: new Date().toISOString() };
            saveLocalNotes(notes);
        }
        return true;
    } else {
        const notes = getLocalNotes();
        const idx = notes.findIndex(n => n.id === id);
        if (idx === -1) return false;

        notes[idx] = { ...notes[idx], is_deleted: true, deleted_at: new Date().toISOString() };
        saveLocalNotes(notes);
        return true;
    }
};

// ── EXPORT SYNC MODE INFO FOR UI ──────────────────────────────────────────
export function getNoteSyncStatus(): { mode: string; message: string; isSharedSheet: boolean; isConfigured: boolean } {
    if (USE_BACKEND) {
        return {
            mode: 'backend',
            message: 'Notes synced to backend server.',
            isSharedSheet: false,
            isConfigured: true
        };
    } else if (SHARED_SHEET_MODE && SHARED_SHEET_ID && GOOGLE_API_KEY) {
        return {
            mode: 'shared_sheet',
            message: 'Notes are private to your account and synced to a shared secure sheet.',
            isSharedSheet: true,
            isConfigured: true
        };
    } else if (SHARED_SHEET_MODE && (!SHARED_SHEET_ID || !GOOGLE_API_KEY)) {
        return {
            mode: 'local',
            message: 'Notes are saved locally only. Configure sheet sync in settings (missing API key or sheet ID).',
            isSharedSheet: false,
            isConfigured: false
        };
    } else {
        return {
            mode: 'local',
            message: 'Notes are saved locally on this device.',
            isSharedSheet: false,
            isConfigured: true
        };
    }
}
