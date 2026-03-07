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