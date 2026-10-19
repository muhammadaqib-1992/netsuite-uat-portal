import type {
  Attachment,
  Bootstrap,
  CaseBundle,
  CaseDetail,
  CaseStatus,
  CaseSummary,
  Comment,
  CommentType,
  Cycle,
  CycleStatus,
  FileData,
  ImportRow,
  Mapping,
  MappingTemplate,
} from '../types';

export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public extra?: unknown
  ) {
    super(message);
  }
}

export interface CycleInput {
  name?: string;
  env?: string;
  start?: string;
  end?: string;
  status?: CycleStatus;
  sourceFile?: string;
  mapping?: Mapping;
  screenshots?: boolean;
  email?: boolean;
}

export interface SaveCaseInput {
  id: number;
  version: number;
  status: CaseStatus;
  actual: string;
  defect: string;
  reason?: string;
}

/** Every call the app makes. Implemented by the RESTlet client and, in development, a mock. */
export interface Api {
  bootstrap(): Promise<Bootstrap>;
  cycles(): Promise<Cycle[]>;
  cycle(id: number): Promise<Cycle>;
  cases(cycleId: number): Promise<CaseSummary[]>;
  getCase(id: number): Promise<CaseBundle>;
  exportCases(cycleId: number, page: number): Promise<{ page: number; pageCount: number; total: number; cases: CaseDetail[] }>;
  exportComments(cycleId: number): Promise<Comment[]>;
  workbook(cycleId: number): Promise<FileData | null>;
  file(id: number): Promise<FileData>;
  templates(): Promise<MappingTemplate[]>;

  saveCase(input: SaveCaseInput): Promise<CaseBundle>;
  uploadEvidence(input: { caseId: number; version: number } & Attachment): Promise<CaseBundle>;
  addComment(input: { caseId: number; text: string; type: CommentType; parentId?: number | null; attachment?: Attachment }): Promise<{ comments: Comment[] }>;
  editComment(input: { id: number; text: string }): Promise<{ comments: Comment[] }>;
  createCycle(input: CycleInput): Promise<Cycle>;
  updateCycle(input: CycleInput & { id: number }): Promise<Cycle>;
  uploadWorkbook(input: { cycleId: number } & Attachment): Promise<Cycle>;
  importBatch(input: { cycleId: number; rows: ImportRow[] }): Promise<{ processed: number; created: number; updated: number }>;
  saveTemplate(input: MappingTemplate): Promise<MappingTemplate[]>;
}

type Envelope<T> = { ok: true; data: T } | { ok: false; error: { code: string; message: string; extra?: unknown } };

function unwrap<T>(text: string, status: number): T {
  let body: unknown;
  try {
    body = JSON.parse(text);
    if (typeof body === 'string') body = JSON.parse(body);
  } catch {
    throw new ApiError('BAD_RESPONSE', status >= 400 ? `Server error ${status}` : 'The server sent an unexpected response.');
  }
  const b = body as Envelope<T> & { error?: { code: string; message: string } };
  if (b && b.ok === true) return b.data;
  if (b && b.error) throw new ApiError(b.error.code, b.error.message, (b.error as { extra?: unknown }).extra);
  throw new ApiError('BAD_RESPONSE', 'The server sent an unexpected response.');
}

/** Client for the RESTlet, called with the user's NetSuite session. */
export function restletApi(apiUrl: string): Api {
  const headers = { 'Content-Type': 'application/json' };

  async function get<T>(action: string, params: Record<string, string | number> = {}): Promise<T> {
    const qs = new URLSearchParams({ action, ...Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])) });
    const sep = apiUrl.includes('?') ? '&' : '?';
    const res = await fetch(`${apiUrl}${sep}${qs}`, { headers, credentials: 'same-origin' });
    return unwrap<T>(await res.text(), res.status);
  }

  async function post<T>(action: string, body: object): Promise<T> {
    const res = await fetch(apiUrl, { method: 'POST', headers, credentials: 'same-origin', body: JSON.stringify({ action, ...body }) });
    return unwrap<T>(await res.text(), res.status);
  }

  return {
    bootstrap: () => get('bootstrap'),
    cycles: () => get('cycles'),
    cycle: (id) => get('cycle', { id }),
    cases: (cycleId) => get('cases', { cycleId }),
    getCase: (id) => get('case', { id }),
    exportCases: (cycleId, page) => get('exportCases', { cycleId, page }),
    exportComments: (cycleId) => get('exportComments', { cycleId }),
    workbook: (cycleId) => get('workbook', { cycleId }),
    file: (id) => get('file', { id }),
    templates: () => get('templates'),
    saveCase: (input) => post('saveCase', input),
    uploadEvidence: (input) => post('uploadEvidence', input),
    addComment: (input) => post('addComment', input),
    editComment: (input) => post('editComment', input),
    createCycle: (input) => post('createCycle', input),
    updateCycle: (input) => post('updateCycle', input),
    uploadWorkbook: (input) => post('uploadWorkbook', input),
    importBatch: (input) => post('importBatch', input),
    saveTemplate: (input) => post('saveTemplate', input),
  };
}

declare global {
  interface Window {
    __UAT_CONFIG__?: { apiUrl: string };
  }
}

/** The RESTlet client inside NetSuite; an in-memory mock in `npm run dev` and the demo build. */
export async function createApi(): Promise<Api> {
  const config = window.__UAT_CONFIG__;
  if (config?.apiUrl && !__DEMO__) return restletApi(config.apiUrl);
  if (import.meta.env.DEV || __DEMO__) {
    const { mockApi } = await import('./mock');
    return mockApi();
  }
  throw new ApiError('NO_CONFIG', 'Open the UAT portal from its NetSuite Suitelet link.');
}
