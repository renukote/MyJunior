export enum CaseStatus {
  PENDING = 'Pending',
  ACTIVE = 'Active',
  CLOSED = 'Closed',
  DEFECTIVE = 'Defective'
}

export enum ServiceStatus {
  SERVED = 'Served',
  PENDING = 'Pending',
  DEFECTIVE = 'Defective'
}

export enum TaskStatus {
  OPEN = 'Open',
  IN_PROGRESS = 'In Progress',
  COMPLETED = 'Completed',
  DELAYED = 'Delayed',
  MISSED = 'Missed'
}

export enum Priority {
  HIGH = 'High',
  MEDIUM = 'Medium',
  LOW = 'Low'
}

export enum UserRole {
  AOR = 'AOR',
  ASSOCIATE = 'Associate',
  APPELLATE_ADVOCATE = 'Appellate Advocate',
  CLIENT = 'Client'
}

export interface Case {
  id: string;
  parties: string;
  petitioner?: string;
  respondent?: string;
  displayTitle?: string;
  diaryNo: string;
  diaryYear: string;
  caseNumber: string;
  lastListedOn: string;
  status: CaseStatus;
  processId?: string;
}

export interface Task {
  id: string;
  title: string;
  description: string;
  deadline: Date;
  priority: Priority;
  responsibleAssociateId: string;
  status: TaskStatus;
  reasonForDelay?: string;
  linkedCaseId: string;
  category?: string;
}

export interface User {
  id: string;
  name: string;
  role: UserRole;
  completionRate: number;
  phoneNumber: string;
  email: string;
}

export interface ViewMode {
  type: 'table' | 'kanban' | 'gallery';
  groupBy?: 'status' | 'judge' | 'date';
}

export interface FilterOptions {
  status?: CaseStatus[];
  judge?: string[];
  dateRange?: {
    start: Date;
    end: Date;
  };
  serviceStatus?: ServiceStatus[];
  searchQuery?: string;
}

export interface ApiCaseResponse {
  ok: boolean;
  query: {
    diary_no: string;
    diary_year: string;
    language: string;
  };
  data: {
    diaryNo: string;
    diaryYear: string;
    parties: string;
    caseNumber: string;
    cnr: string;
    filed: string;
    lastListedOn: string;
    stage: string;
    dispositionType: string;
    category: string;
    petitioner: string;
    respondent: string;
    petitionerAdvocates: string | null;
    respondentAdvocates: string | null;
    caseStatusBadge: string;
    raw: {
      heading: string;
      table: Record<string, string>;
    };
  };
}