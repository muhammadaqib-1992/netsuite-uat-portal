import * as XLSX from 'xlsx';
import type { CaseDetail, CaseStatus, CellValue, Comment, Cycle, FieldKey, ImportRow, Mapping } from '../types';

export const META_SHEET = '_uat_portal';
export const COMMENTS_SHEET = 'Comments';
export const LATEST_COMMENT = 'Latest Comment';

export const FIELDS: { key: FieldKey; label: string; required?: boolean }[] = [
  { key: 'ref', label: 'Case ID', required: true },
  { key: 'module', label: 'Module' },
  { key: 'scenario', label: 'Scenario' },
  { key: 'precond', label: 'Pre-conditions' },
  { key: 'testData', label: 'Test Data' },
  { key: 'steps', label: 'Steps', required: true },
  { key: 'expected', label: 'Expected Result' },
  { key: 'assigned', label: 'Assigned To' },
  { key: 'status', label: 'Status' },
  { key: 'actual', label: 'Actual Result' },
  { key: 'defect', label: 'Defect Ref' },
  { key: 'executedBy', label: 'Executed By' },
  { key: 'executedOn', label: 'Executed On' },
];

const SYNONYMS: Record<FieldKey, string[]> = {
  ref: ['caseid', 'testcaseid', 'tcid', 'id', 'caseno', 'casenumber', 'testcaseno', 'testid', 'scriptid', 'testscriptid', 'tcno', 'ref'],
  module: ['module', 'area', 'process', 'functionalarea', 'processarea', 'businessprocess', 'workstream'],
  scenario: ['scenario', 'testscenario', 'description', 'testcase', 'title', 'testcasename', 'summary', 'testcasedescription', 'name'],
  precond: ['preconditions', 'precondition', 'prerequisites', 'prerequisite', 'prereqs'],
  testData: ['testdata', 'data', 'inputdata'],
  steps: ['steps', 'teststeps', 'procedure', 'stepstoexecute', 'testprocedure', 'actions', 'stepsdescription'],
  expected: ['expectedresult', 'expectedresults', 'expectedoutcome', 'expected', 'expectedbehaviour', 'expectedbehavior'],
  assigned: ['tester', 'assignedto', 'assignee', 'owner', 'testowner', 'testedby'],
  status: ['status', 'result', 'testresult', 'executionstatus', 'passfail', 'teststatus'],
  actual: ['actualresult', 'actualresults', 'actualoutcome', 'actual', 'actualbehaviour', 'actualbehavior'],
  defect: ['defect', 'defectid', 'bugid', 'defectref', 'jira', 'issue', 'defectno', 'ticket'],
  executedBy: ['executedby', 'testername'],
  executedOn: ['executedon', 'executiondate', 'testdate', 'datetested', 'dateexecuted'],
};

const STATUS_SYNONYMS: Record<string, CaseStatus> = {
  notstarted: 'Not Started',
  notrun: 'Not Started',
  open: 'Not Started',
  todo: 'Not Started',
  pending: 'Not Started',
  inprogress: 'In Progress',
  wip: 'In Progress',
  pass: 'Pass',
  passed: 'Pass',
  ok: 'Pass',
  fail: 'Fail',
  failed: 'Fail',
  blocked: 'Blocked',
  onhold: 'Blocked',
  na: 'N/A',
  notapplicable: 'N/A',
  skipped: 'N/A',
};

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

/** Maps a workbook status to a portal status; null when it isn't recognised. Blank is Not Started. */
export function normaliseStatus(value: string): CaseStatus | null {
  const n = norm(value);
  if (!n) return 'Not Started';
  return STATUS_SYNONYMS[n] ?? null;
}

export function cellText(v: unknown): string {
  if (v === null || v === undefined) return '';
  return String(v).trim();
}

export interface ParsedWorkbook {
  wb: XLSX.WorkBook;
  fileName: string;
  base64: string;
  /** Cycle ID found in the hidden sheet of a workbook exported from the portal. */
  exportedCycleId: number | null;
}

export async function readWorkbookFile(file: File): Promise<ParsedWorkbook> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array', cellDates: false });
  return { wb, fileName: file.name, base64: arrayBufferToBase64(buf), exportedCycleId: readMeta(wb) };
}

export function arrayBufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

function base64ToArrayBuffer(b64: string): ArrayBuffer {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

function readMeta(wb: XLSX.WorkBook): number | null {
  const ws = wb.Sheets[META_SHEET];
  if (!ws) return null;
  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1 });
  const row = rows.find((r) => r[0] === 'cycleId');
  return row ? Number(row[1]) || null : null;
}

/** Sheet contents as displayed text, one array per row. */
export function sheetRows(wb: XLSX.WorkBook, sheetName: string): string[][] {
  const ws = wb.Sheets[sheetName];
  if (!ws) return [];
  return XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: false, defval: '', blankrows: true }).map((r) => r.map(cellText));
}

export function dataSheets(wb: XLSX.WorkBook): string[] {
  return wb.SheetNames.filter((n) => n !== META_SHEET && n !== COMMENTS_SHEET);
}

/** Makes header cells unique and non-empty so they can be keys of the original-row JSON. */
export function uniqueHeaders(cells: string[]): string[] {
  const seen = new Map<string, number>();
  return cells.map((c, i) => {
    const base = c || `Column ${i + 1}`;
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    return n === 1 ? base : `${base} (${n})`;
  });
}

export function autoMap(headers: string[]): Partial<Record<FieldKey, string>> {
  const fields: Partial<Record<FieldKey, string>> = {};
  const used = new Set<string>();
  for (const { key } of FIELDS) {
    const hit = headers.find((h) => !used.has(h) && SYNONYMS[key].includes(norm(h)));
    if (hit) {
      fields[key] = hit;
      used.add(hit);
    }
  }
  return fields;
}

/** The first row among the top 20 that matches the most known column names. */
export function detectHeaderRow(rows: string[][]): number {
  let best = 0;
  let bestScore = -1;
  rows.slice(0, 20).forEach((r, i) => {
    const filled = r.filter(Boolean).length;
    if (filled < 2) return;
    const score = Object.keys(autoMap(uniqueHeaders(r))).length * 10 + filled;
    if (score > bestScore) {
      best = i;
      bestScore = score;
    }
  });
  return best;
}

/** The data sheet whose header row maps the most portal fields (ties go to the earlier sheet). */
export function bestSheet(wb: XLSX.WorkBook): string {
  let best = dataSheets(wb)[0];
  let bestScore = -1;
  for (const name of dataSheets(wb)) {
    const m = buildMapping(wb, name);
    const score = Object.keys(m.fields).length + (m.fields.ref ? 5 : 0) + (m.fields.steps ? 5 : 0);
    if (score > bestScore) {
      best = name;
      bestScore = score;
    }
  }
  return best;
}

export function buildMapping(wb: XLSX.WorkBook, sheetName: string, headerRow?: number): Mapping {
  const rows = sheetRows(wb, sheetName);
  const hr = headerRow ?? detectHeaderRow(rows);
  const headers = uniqueHeaders(trimTrailing(rows[hr] ?? []));
  return { sheetName, headerRow: hr, headers, fields: autoMap(headers) };
}

function trimTrailing(cells: string[]): string[] {
  let end = cells.length;
  while (end > 0 && !cells[end - 1]) end--;
  return cells.slice(0, end);
}

export interface Issue {
  level: 'error' | 'warning';
  row?: number;
  message: string;
}

/** Rows below the header as import rows, plus anything that should stop or warn about the import. */
export function extractRows(wb: XLSX.WorkBook, mapping: Mapping): { rows: ImportRow[]; issues: Issue[] } {
  const issues: Issue[] = [];
  for (const f of FIELDS) {
    if (f.required && !mapping.fields[f.key]) issues.push({ level: 'error', message: `Map a column to "${f.label}".` });
  }
  if (issues.length) return { rows: [], issues };

  const all = sheetRows(wb, mapping.sheetName);
  const col = (key: FieldKey) => (mapping.fields[key] ? mapping.headers.indexOf(mapping.fields[key]!) : -1);
  const idx = Object.fromEntries(FIELDS.map((f) => [f.key, col(f.key)])) as Record<FieldKey, number>;
  const get = (r: string[], key: FieldKey) => (idx[key] >= 0 ? r[idx[key]] ?? '' : '');

  const rows: ImportRow[] = [];
  const seen = new Map<string, number>();
  for (let i = mapping.headerRow + 1; i < all.length; i++) {
    const r = all[i];
    if (!r.some(Boolean)) continue;
    const sheetRow = i + 1;
    const ref = get(r, 'ref');
    const steps = get(r, 'steps');
    if (!ref) {
      issues.push({ level: 'error', row: sheetRow, message: 'Case ID is empty.' });
      continue;
    }
    if (seen.has(ref)) issues.push({ level: 'error', row: sheetRow, message: `Duplicate Case ID "${ref}" (also on row ${seen.get(ref)}).` });
    seen.set(ref, sheetRow);
    if (!steps) issues.push({ level: 'error', row: sheetRow, message: `${ref}: Steps are empty.` });
    if (idx.expected >= 0 && !get(r, 'expected')) issues.push({ level: 'warning', row: sheetRow, message: `${ref}: Expected Result is empty.` });

    const rawStatus = get(r, 'status');
    let status: string = 'Not Started';
    if (rawStatus) {
      const s = normaliseStatus(rawStatus);
      if (s) status = s;
      else issues.push({ level: 'warning', row: sheetRow, message: `${ref}: status "${rawStatus}" not recognised; imported as Not Started.` });
    }

    const original: Record<string, CellValue> = {};
    mapping.headers.forEach((h, c) => {
      original[h] = r[c] ?? '';
    });
    rows.push({
      ref,
      rowNum: i,
      module: get(r, 'module'),
      scenario: get(r, 'scenario'),
      precond: get(r, 'precond'),
      testData: get(r, 'testData'),
      steps,
      expected: get(r, 'expected'),
      assigned: get(r, 'assigned'),
      status,
      actual: get(r, 'actual'),
      defect: get(r, 'defect'),
      row: original,
    });
  }
  if (!rows.length && !issues.some((x) => x.level === 'error')) issues.push({ level: 'error', message: 'No test cases found below the header row.' });
  return { rows, issues };
}

// ---------- export ----------

function commentLine(c: Comment): string {
  return `${c.authorName} (${c.postedOn}): ${c.text}`;
}

/**
 * Builds the export workbook: the original workbook (all sheets) with the cases sheet rewritten
 * from current portal data, a Latest Comment column, a Comments sheet and a hidden marker sheet.
 */
export function buildExport(cycle: Cycle, cases: CaseDetail[], comments: Comment[], originalBase64: string | null): XLSX.WorkBook {
  const mapping: Mapping = cycle.mapping ?? {
    sheetName: 'Test Cases',
    headerRow: 0,
    headers: ['Case ID', 'Module', 'Scenario', 'Pre-conditions', 'Test Data', 'Steps', 'Expected Result'],
    fields: { ref: 'Case ID', module: 'Module', scenario: 'Scenario', precond: 'Pre-conditions', testData: 'Test Data', steps: 'Steps', expected: 'Expected Result' },
  };
  const f = { ...mapping.fields };
  const headers = [...mapping.headers];
  const ensure = (key: FieldKey | null, header: string) => {
    if (key && f[key]) return;
    if (!headers.includes(header)) headers.push(header);
    if (key) f[key] = header;
  };
  ensure('status', 'Status');
  ensure('actual', 'Actual Result');
  ensure(null, LATEST_COMMENT);

  const latest = new Map<number, Comment>();
  for (const c of comments) latest.set(c.caseId, c); // comments arrive oldest first

  const body = [...cases]
    .sort((a, b) => a.rowNum - b.rowNum)
    .map((c) => {
      const values: Record<string, CellValue> = { ...c.row };
      const set = (key: FieldKey, v: string) => {
        if (f[key]) values[f[key]!] = v;
      };
      set('status', c.status);
      set('actual', c.actual);
      set('defect', c.defect);
      set('executedBy', c.testerName);
      set('executedOn', c.executedOn);
      const lc = latest.get(c.id);
      values[LATEST_COMMENT] = lc ? commentLine(lc) : '';
      return headers.map((h) => values[h] ?? '');
    });

  let wb: XLSX.WorkBook;
  let preface: unknown[][] = [];
  let old: XLSX.WorkSheet | undefined;
  if (originalBase64) {
    wb = XLSX.read(base64ToArrayBuffer(originalBase64), { type: 'array' });
    old = wb.Sheets[mapping.sheetName];
    if (old) preface = XLSX.utils.sheet_to_json<unknown[]>(old, { header: 1, raw: true, defval: null, blankrows: true }).slice(0, mapping.headerRow);
  } else {
    wb = XLSX.utils.book_new();
  }

  const ws = XLSX.utils.aoa_to_sheet([...preface, headers, ...body]);
  if (old?.['!cols']) ws['!cols'] = old['!cols'];
  if (old?.['!merges']) ws['!merges'] = old['!merges'].filter((m) => m.e.r < mapping.headerRow);
  ws['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: mapping.headerRow, c: 0 }, e: { r: mapping.headerRow + body.length, c: headers.length - 1 } }) };
  replaceSheet(wb, mapping.sheetName, ws);

  const refById = new Map(cases.map((c) => [c.id, c.ref]));
  const commentRows = comments.map((c) => [refById.get(c.caseId) ?? '', c.id, c.parentId ?? '', c.authorName, c.postedOn, c.type, c.text, c.fileName]);
  const cws = XLSX.utils.aoa_to_sheet([['Case ID', 'Comment ID', 'Reply To', 'Author', 'Date', 'Type', 'Comment', 'Attachment name'], ...commentRows]);
  cws['!cols'] = [{ wch: 14 }, { wch: 11 }, { wch: 10 }, { wch: 22 }, { wch: 20 }, { wch: 14 }, { wch: 80 }, { wch: 30 }];
  replaceSheet(wb, COMMENTS_SHEET, cws);

  const meta = XLSX.utils.aoa_to_sheet([
    ['cycleId', cycle.id],
    ['cycleName', cycle.name],
    ['exportedAt', new Date().toISOString()],
  ]);
  replaceSheet(wb, META_SHEET, meta);
  wb.Workbook = wb.Workbook ?? {};
  const props = wb.Workbook.Sheets ?? [];
  wb.Workbook.Sheets = wb.SheetNames.map((name) => {
    const prev = props.find((p) => p.name === name);
    return { ...prev, name, Hidden: name === META_SHEET ? 1 : prev?.Hidden ?? 0 };
  });
  return wb;
}

function replaceSheet(wb: XLSX.WorkBook, name: string, ws: XLSX.WorkSheet) {
  if (wb.Sheets[name]) wb.Sheets[name] = ws;
  else XLSX.utils.book_append_sheet(wb, ws, name);
}

export function downloadWorkbook(wb: XLSX.WorkBook, fileName: string) {
  XLSX.writeFile(wb, fileName, { compression: true });
}

export function exportFileName(cycle: Cycle): string {
  const d = new Date();
  const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}-${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}`;
  const base = (cycle.sourceFile || cycle.name).replace(/\.xlsx$/i, '').replace(/[^\w.\- ]+/g, '_');
  return `${base}-export-${stamp}.xlsx`;
}
