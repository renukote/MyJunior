export interface Note {
    id: string;
    title: string;
    content: string;
    case_number: string | null;
    case_name: string | null;
    linked_team_member: string | null;
    tags: string[];
    created_by_id: string;
    created_by_name: string;
    created_at: string; // ISO timestamp
    updated_by_id: string | null;
    updated_by_name: string | null;
    updated_at: string | null; // ISO timestamp
    is_deleted: boolean;
    deleted_at: string | null; // ISO timestamp
    source: "app" | "sheet";
}
