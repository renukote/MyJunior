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
    cnrOverride?: string
): any | null {
    if (!mcpData) return null;

    // eCourts full response: { data: { courtCaseData: {...} }, meta: {...} }
    // eCourts search result: flat object { cnr, petitioners, caseStatus, ... }
    const d = mcpData?.data?.courtCaseData || mcpData;

    const now = new Date().toISOString();
    const caseId = `case-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    // eCourts uses caseStatus (not caseStatusBadge)
    // Map to UI status keys: Fresh, Pending, Disposed (matches STATUS_STYLES in AppContext)
    // eCourts "FRESH" = newly registered, not yet heard (SC website shows these as "PENDING")
    // Default to 'Pending' so unknown/empty statuses match SC website behavior
    const statusRaw = (d.caseStatus || d.caseStatusBadge || d.status || '').toUpperCase();
    let status = 'Pending';
    // eCourts API uses various disposal outcome words instead of just "DISPOSED"
    const disposalKeywords = ['DISPOSED', 'ALLOWED', 'DISMISSED', 'WITHDRAWN', 'SETTLED', 'DISPOSED OF', 'QUASHED', 'DECREED', 'CONVICTED', 'ACQUITTED', 'ABATED'];
    if (disposalKeywords.some(k => statusRaw === k || statusRaw.startsWith(k))) status = 'Disposed';
    else if (statusRaw === 'FRESH') status = 'Fresh';
    else if (statusRaw === 'DEFECTIVE') status = 'Pending';
    else if (statusRaw === 'PENDING') status = 'Pending';
    else if (statusRaw === 'ACTIVE') status = 'Pending';

    // petitioners/respondents are plain string arrays in eCourts API
    const petitionersArr: string[] = Array.isArray(d.petitioners)
        ? d.petitioners
        : d.petitioner ? [d.petitioner] : [];
    const respondentsArr: string[] = Array.isArray(d.respondents)
        ? d.respondents
        : d.respondent ? [d.respondent] : [];

    const petitionerRaw = petitionersArr[0] || '';
    const respondentRaw = respondentsArr[0] || '';

    // petitionerAdvocates/respondentAdvocates are plain string arrays (not tagged strings)
    const petitionerAdvocates: string[] = Array.isArray(d.petitionerAdvocates)
        ? d.petitionerAdvocates : [];
    const respondentAdvocates: string[] = Array.isArray(d.respondentAdvocates)
        ? d.respondentAdvocates : [];

    const theCnr = d.cnr || d.cnrNumber || cnrOverride || '';

    // Derive diary number and year from CNR (SCIN01XXXXXXYYYY format)
    // e.g. SCIN010005422026 → diary = "542", year = "2026"
    const cnrMatch = theCnr.match(/^SCIN01(\d{6})(\d{4})$/i);
    const diaryFromCnr = cnrMatch ? String(parseInt(cnrMatch[1], 10)) : '';
    const yearFromCnr  = cnrMatch ? cnrMatch[2] : '';

    // Extract hearings array from whichever field the API uses
    const hearingsArr: any[] = Array.isArray(d.hearings) ? d.hearings
        : Array.isArray(d.hearingHistory) ? d.hearingHistory
        : Array.isArray(d.caseHearings) ? d.caseHearings
        : Array.isArray(d.listingDates) ? d.listingDates : [];

    // Extract latest hearing date from arrays if top-level field is missing
    const latestHearingDate = (() => {
        if (hearingsArr.length === 0) return null;
        const sorted = hearingsArr.slice().sort((a: any, b: any) => {
            const da = a.hearingDate || a.date || a.caseHearingDate || a.clDate || '';
            const db = b.hearingDate || b.date || b.caseHearingDate || b.clDate || '';
            return da > db ? -1 : 1;
        });
        return sorted[0]?.hearingDate || sorted[0]?.date || sorted[0]?.caseHearingDate || sorted[0]?.clDate || null;
    })();

    // Map hearings to the listings format used by ListingsSection
    const listingsFromAPI = hearingsArr.map((h: any, i: number) => {
        const rawDate = h.hearingDate || h.date || h.caseHearingDate || h.clDate || '';
        // Normalize date to YYYY-MM-DD if it's DD-MM-YYYY
        let isoDate = rawDate;
        const dmyMatch = rawDate.match(/^(\d{2})-(\d{2})-(\d{4})$/);
        if (dmyMatch) isoDate = `${dmyMatch[3]}-${dmyMatch[2]}-${dmyMatch[1]}`;

        const judgesRaw = Array.isArray(h.judges) ? h.judges.join(', ')
            : Array.isArray(h.coram) ? h.coram.join(', ')
            : (h.judge || h.judgeNames || h.bench || '');

        const purpose = h.purpose || h.purposeOfHearing || h.stage || h.type || '';
        const miscRegular = h.miscRegular || h.listType || (purpose.toLowerCase().includes('misc') ? 'Misc.' : 'Regular');

        return {
            id: `l_api_${i}_${Date.now()}`,
            date: isoDate,
            type: purpose || 'Listed',
            bench: judgesRaw,
            court: h.courtNumber || h.court || h.proposedList || '',
            item: h.itemNo || h.item || h.clItemNo || '',
            notes: `${miscRegular}${purpose ? ' · ' + purpose : ''} — synced from eCourts API`,
        };
    }).filter((l: any) => l.date);

    // Extract latest order date from judgmentOrders as last-resort fallback
    const latestOrderDate = (() => {
        if (!Array.isArray(d.judgmentOrders) || d.judgmentOrders.length === 0) return null;
        const sorted = d.judgmentOrders.slice().sort((a: any, b: any) => {
            const da = a.orderDate || a.date || a.judgmentDate || '';
            const db = b.orderDate || b.date || b.judgmentDate || '';
            return da > db ? -1 : 1;
        });
        return sorted[0]?.orderDate || sorted[0]?.date || sorted[0]?.judgmentDate || null;
    })();

    // ourSide — match logged-in AOR name against advocate lists
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
        petitioners: petitionersArr,
        respondents: respondentsArr,
        parties: petitionersArr.concat(respondentsArr).join(' vs ') || '',
        caseType: d.caseType || d.case_type || '',
        shortCaseNumber: d.caseNumber || d.case_number || '',
        caseNumber: d.caseNumber || d.case_number || '',
        diaryNumber: diaryFromCnr || d.diaryNo || d.diary_no || '',
        diaryYear: yearFromCnr || (d.filingDate ? String(d.filingDate).slice(0, 4) : ''),
        cnrNumber: theCnr,
        status,
        nextHearingDate: d.nextHearingDate || d.next_hearing_date || d.nextDate || d.next_date || null,
        lastListedOn: d.lastHearingDate || d.lastListedOn || d.last_listed_on || d.lastHearing || d.lastDate || d.last_date || d.latestHearingDate || latestHearingDate || latestOrderDate || null,
        likelyListedOn: d.likelyListedOn || d.tentativeDate || null,
        advanceList: { published: false, date: null, presentInList: false },
        finalList: { published: false, date: null, presentInList: false },
        lastCheckedAt: now,
        labels: [],
        lastListedJudges: Array.isArray(d.judges) ? d.judges : (Array.isArray(d.coram) ? d.coram : []),
        finalListJudges: [],
        courtName: d.courtName || d.court_name || 'Supreme Court of India',
        courtNumber: d.courtNumber || d.court_number || 'Court No. 1',
        timeOfSitting: d.timeOfSitting || '10:30 AM',
        dateOfFiling: d.filingDate || d.filed || d.date_of_filing || d.dateOfFiling || now.split('T')[0],
        earlierCourtDetails: '—',
        officeReportUrl: '',
        lastOrdersUrl: '',
        stage: d.stage || d.purpose || d.purposeOfHearing || d.currentStage || '',
        lastListedOnRaw: d.lastHearingDate || d.lastListedOn || d.lastHearing || d.lastDate || latestHearingDate || latestOrderDate || '',
        scSyncedAt: now,
        summary: d.caseAiAnalysis?.caseSummary || '',
        listings: listingsFromAPI,
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
            date: d.filingDate || d.filed || now.split('T')[0],
            event: 'Case filed',
            type: 'filing',
        }],
        archived: false,
        petitionerAdvocates,
        respondentAdvocates,
        ourSide,
        displayTitle: petitionerRaw
            ? `${petitionerRaw.split(',')[0]?.trim()} vs ${respondentRaw.split(',')[0]?.trim() || '...'}`
            : d.caseNumber || theCnr,
    };
}