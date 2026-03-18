import { Case, CaseStatus, ApiCaseResponse } from '../types';

export const transformApiResponseToCase = (apiResponse: ApiCaseResponse): Case => {
  const { data } = apiResponse;

  const determineStatus = (statusBadge: string): CaseStatus => {
    const badge = statusBadge.toUpperCase();
    if (badge === 'DISPOSED') return CaseStatus.CLOSED;
    if (badge === 'DEFECTIVE') return CaseStatus.DEFECTIVE;
    if (badge === 'PENDING') return CaseStatus.PENDING;
    return CaseStatus.ACTIVE;
  };

  const caseId = `${data.diaryNo}-${data.diaryYear}`;

  return {
    id: caseId,
    parties: data.parties,
    diaryNo: data.diaryNo,
    diaryYear: data.diaryYear,
    caseNumber: data.caseNumber,
    lastListedOn: data.lastListedOn,
    status: determineStatus(data.caseStatusBadge)
  };
};
// ── transformMCPToCase ─────────────────────────────────────────────────────────
// Converts the raw response from fetchCaseByDiary (eCourts MCP API) into the
// same case shape that transformApiToCase (SearchCaseForm) produces.
// This allows SearchCaseForm's handleSearch to use the eCourts API path
// while producing identical case objects for the dashboard.

export function transformMCPToCase(
    mcpData: any,
    diaryNo: string,
    diaryYear: string
): any | null {
    if (!mcpData) return null;

    // MCP response may wrap data under .data, .case, or be flat — normalise
    const d = mcpData.data || mcpData.case || mcpData;

    const now = new Date().toISOString();
    const caseId = `case-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    // Normalise status
    const statusBadge = (d.caseStatusBadge || d.status_badge || d.status || '').toUpperCase();
    let status = 'active';
    if (statusBadge === 'DISPOSED') status = 'closed';
    else if (statusBadge === 'DEFECTIVE') status = 'defective';
    else if (statusBadge === 'PENDING') status = 'pending';

    const petitionerRaw = d.petitioner || d.petitioner_name || '';
    const respondentRaw = d.respondent || d.respondent_name || '';

    // Parse advocate strings if present
    const parseAdvStr = (raw: string): string[] => {
        if (!raw) return [];
        const matches = raw.match(/([^[]+)\[[PR]-[\d.]+\]/g) || [];
        const names = matches.map(m => m.replace(/\[[PR]-[\d.]+\]$/, '').trim()).filter(Boolean);
        return [...new Set(names)];
    };

    const petitionerAdvocates = parseAdvStr(d.petitionerAdvocates || d.petitioner_advocates || '');
    const respondentAdvocates = parseAdvStr(d.respondentAdvocates || d.respondent_advocates || '');

    // ourSide — read aorName from localStorage and match against advocates
    let ourSide: 'petitioner' | 'respondent' | null = null;
    try {
        const userRaw = localStorage.getItem('lextgress_user');
        if (userRaw) {
            const user = JSON.parse(userRaw);
            const aorName = (user.aorName || '').trim().toUpperCase();
            if (aorName) {
                const norm = (s: string) => s.trim().toUpperCase();
                if (petitionerAdvocates.some(a => norm(a) === aorName)) ourSide = 'petitioner';
                else if (respondentAdvocates.some(a => norm(a) === aorName)) ourSide = 'respondent';
            }
        }
    } catch { /* ignore */ }

    return {
        id: caseId,
        petitioner: petitionerRaw,
        respondent: respondentRaw,
        parties: d.parties || '',
        caseType: d.caseType || d.case_type || '',
        shortCaseNumber: d.shortCaseNumber || d.short_case_number || '',
        caseNumber: d.caseNumber || d.case_number || '',
        diaryNumber: diaryNo,
        diaryYear: diaryYear,
        cnrNumber: d.cnr || d.cnrNumber || '',
        status,
        nextHearingDate: d.nextHearingDate || d.next_hearing_date || null,
        lastListedOn: d.lastListedOn || d.last_listed_on || null,
        likelyListedOn: d.likelyListedOn || null,
        advanceList: { published: false, date: null, presentInList: false },
        finalList: { published: false, date: null, presentInList: false },
        lastCheckedAt: now,
        labels: [],
        lastListedJudges: [],
        finalListJudges: [],
        courtName: 'Supreme Court of India',
        courtNumber: 'Court No. 1',
        timeOfSitting: '10:30 AM',
        dateOfFiling: d.filed || d.date_of_filing || now.split('T')[0],
        earlierCourtDetails: '—',
        officeReportUrl: '',
        lastOrdersUrl: '',
        stage: d.stage || '',
        lastListedOnRaw: d.lastListedOn || '',
        scSyncedAt: now,
        summary: '',
        listings: [],
        keyRisk: false,
        tasks: [],
        notes: [{
            id: 'n' + Date.now(),
            text: `Case retrieved via eCourts API on ${new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}.`,
            createdAt: now,
        }],
        documents: [],
        applications: [],
        timeline: [{
            id: 'tl' + Date.now(),
            date: d.filed || now.split('T')[0],
            event: 'Case filed in Supreme Court',
            type: 'filing',
        }],
        archived: false,
        petitioners: petitionerRaw ? [petitionerRaw] : [],
        respondents: respondentRaw ? [respondentRaw] : [],
        petitionerAdvocates,
        respondentAdvocates,
        ourSide,
        displayTitle: petitionerRaw
            ? `${petitionerRaw.split(' vs ')[0]?.trim()} vs ${respondentRaw || '...'}`
            : d.caseNumber || '',
    };
}