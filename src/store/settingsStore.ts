import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { Role, Urgency } from '../caseLogic';

export interface TeamMember {
    id: string;
    name: string;
    role: Role;
    specialization: string;
    workloadCapacity: number;
    currentWorkload: number;
}

export interface TrainingExampleTask {
    task: string;
    assigned_to_role: Role;
    assigned_to_person: string;
    urgency: Urgency;
    deadline_days: number;
    reason: string;
}

export interface TrainingExample {
    id: string;
    case_type?: string;
    office_report_text: string;
    correct_tasks: TrainingExampleTask[];
    added_by: string;
    added_on: string;
    isActive: boolean;
}

export interface AiStats {
    accuracyThisWeek: number;
    tasksAutoAssigned: number;
    tasksManuallyCorrected: number;
    commonCorrectionType: string | null;
}

interface SettingsState {
    roles: string[];
    teamMembers: TeamMember[];
    trainingExamples: TrainingExample[];
    aiStats: AiStats;
    addRole: (role: string) => void;
    removeRole: (role: string) => void;
    addTeamMember: (member: Omit<TeamMember, 'id'>) => void;
    updateTeamMember: (id: string, updates: Partial<TeamMember>) => void;
    removeTeamMember: (id: string) => void;
    addTrainingExample: (example: Omit<TrainingExample, 'id' | 'added_on'>) => void;
    updateTrainingExample: (id: string, updates: Partial<TrainingExample>) => void;
    removeTrainingExample: (id: string) => void;
    recordAiTask: () => void;
    recordAiCorrection: (correctionType: string) => void;
}

export const useSettingsStore = create<SettingsState>()(
    persist(
        (set) => ({
            roles: ['Advocate', 'Associate Advocate', 'Paralegal / Clerk'],
            teamMembers: [
                // Default mock data
                { id: '1', name: 'Renu', role: 'Paralegal / Clerk', specialization: 'Service Tracking', workloadCapacity: 15, currentWorkload: 5 },
                { id: '2', name: 'Priya', role: 'Associate Advocate', specialization: 'Criminal Drafting', workloadCapacity: 10, currentWorkload: 2 },
                { id: '3', name: 'Vikram', role: 'Advocate', specialization: 'Court Appearances', workloadCapacity: 5, currentWorkload: 1 },
            ],
            trainingExamples: [],
            aiStats: {
                accuracyThisWeek: 100,
                tasksAutoAssigned: 0,
                tasksManuallyCorrected: 0,
                commonCorrectionType: null,
            },
            addRole: (role) => set((state) => ({
                roles: [...state.roles, role]
            })),
            removeRole: (role) => set((state) => ({
                roles: state.roles.filter((r) => r !== role)
            })),
            addTeamMember: (member) => set((state) => ({
                teamMembers: [...state.teamMembers, { ...member, id: Date.now().toString() }]
            })),
            updateTeamMember: (id, updates) => set((state) => ({
                teamMembers: state.teamMembers.map((m) => m.id === id ? { ...m, ...updates } : m)
            })),
            removeTeamMember: (id) => set((state) => ({
                teamMembers: state.teamMembers.filter((m) => m.id !== id)
            })),
            addTrainingExample: (example) => set((state) => ({
                trainingExamples: [...state.trainingExamples, {
                    ...example,
                    id: Date.now().toString(),
                    added_on: new Date().toISOString()
                }]
            })),
            updateTrainingExample: (id, updates) => set((state) => ({
                trainingExamples: state.trainingExamples.map((e) => e.id === id ? { ...e, ...updates } : e)
            })),
            removeTrainingExample: (id) => set((state) => ({
                trainingExamples: state.trainingExamples.filter((e) => e.id !== id)
            })),
            recordAiTask: () => set((state) => {
                const total = state.aiStats.tasksAutoAssigned + 1;
                const corrected = state.aiStats.tasksManuallyCorrected;
                const accuracy = total > 0 ? Math.round(((total - corrected) / total) * 100) : 100;
                return {
                    aiStats: {
                        ...state.aiStats,
                        tasksAutoAssigned: total,
                        accuracyThisWeek: accuracy
                    }
                };
            }),
            recordAiCorrection: (correctionType) => set((state) => {
                const total = state.aiStats.tasksAutoAssigned; // assumed recorded already
                const corrected = state.aiStats.tasksManuallyCorrected + 1;
                const accuracy = total > 0 ? Math.round(((total - Math.min(corrected, total)) / total) * 100) : 0;
                return {
                    aiStats: {
                        ...state.aiStats,
                        tasksManuallyCorrected: corrected,
                        accuracyThisWeek: accuracy,
                        commonCorrectionType: correctionType
                    }
                };
            })
        }),
        {
            name: 'lextigress-settings-storage', version: 2,
        }
    )
);