export type Level = 'team' | 'lead' | 'tester';

export type CaseStatus = 'Not Started' | 'In Progress' | 'Pass' | 'Fail' | 'Blocked' | 'N/A';
export type CycleStatus = 'Planned' | 'Active' | 'Closed';
export type CommentType = 'General' | 'Clarification' | 'Fail Reason' | 'Retest Note' | 'Resolution';

export interface User {
  id: number;
  name: string;
  email: string;
  roleId: string;
  level: Level;
}

/** Workbook fields the portal understands. Everything else is kept in the original row. */
export type FieldKey =
  | 'ref'
  | 'module'
  | 'scenario'
  | 'precond'
  | 'testData'
  | 'steps'
  | 'expected'
  | 'assigned'
  | 'status'
  | 'actual'
  | 'defect'
  | 'executedBy'
  | 'executedOn';

export interface Mapping {
  sheetName: string;
  /** 0-based index of the header row in the sheet. */
  headerRow: number;
  /** Header cells in sheet order, made unique. */
  headers: string[];
  /** Workbook column header for each portal field. */
  fields: Partial<Record<FieldKey, string>>;
}

export interface MappingTemplate {
  name: string;
  mapping: Pick<Mapping, 'fields'>;
}

export interface Cycle {
  id: number;
  name: string;
  env: string;
  start: string;
  end: string;
  status: CycleStatus;
  ownerId: number | null;
  ownerName: string;
  sourceFile: string;
  hasWorkbook: boolean;
  screenshots: boolean;
  email: boolean;
  caseCount?: number;
  mapping?: Mapping | null;
}

export interface CaseSummary {
  id: number;
  cycleId: number;
  ref: string;
  rowNum: number;
  module: string;
  scenario: string;
  assigned: string;
  status: CaseStatus;
  testerId: number | null;
  testerName: string;
  executedOn: string;
  defect: string;
  version: number;
  commentCount?: number;
  unanswered?: boolean;
}

export type CellValue = string | number | boolean | null;

export interface CaseDetail extends CaseSummary {
  precond: string;
  testData: string;
  steps: string;
  expected: string;
  actual: string;
  evidenceId: number | null;
  evidenceName: string;
  row: Record<string, CellValue>;
}

export interface Comment {
  id: number;
  caseId: number;
  parentId: number | null;
  type: CommentType;
  text: string;
  authorId: number | null;
  authorName: string;
  byTeam: boolean;
  postedOn: string;
  editedOn: string;
  statusAtTime: string;
  fileId: number | null;
  fileName: string;
  editable: boolean;
  editableUntil?: number;
}

export interface Bootstrap {
  user: User;
  accountDefaults: { screenshots: boolean; email: boolean };
  cycles: Cycle[];
  caseStatuses: CaseStatus[];
  cycleStatuses: CycleStatus[];
  commentTypes: CommentType[];
  limits: { imageBytes: number; workbookBytes: number; editWindowMs: number };
}

export interface CaseBundle {
  case: CaseDetail;
  comments: Comment[];
  cycle: Cycle;
}

/** One workbook row as sent to the import API. */
export interface ImportRow {
  ref: string;
  rowNum: number;
  module: string;
  scenario: string;
  precond: string;
  testData: string;
  steps: string;
  expected: string;
  assigned: string;
  status: string;
  actual: string;
  defect: string;
  row: Record<string, CellValue>;
}

export interface FileData {
  id?: number;
  name: string;
  mime: string;
  base64: string;
}

export interface Attachment {
  name: string;
  base64: string;
}
