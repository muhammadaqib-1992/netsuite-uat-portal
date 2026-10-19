import * as XLSX from 'xlsx';
import type { CaseStatus, CellValue, FieldKey, ImportRow, Mapping, SheetLayout } from '../types';

export const META_SHEET = '_uat_portal';
export const COMMENTS_SHEET = 'Comments';
export const LATEST_COMMENT = 'Latest Comment';
/** rowNum = sheet index × ROW_BLOCK + row index, so one number orders and locates every case. */
export const ROW_BLOCK = 100000;
/** Key in a case's original-row JSON that records which sheet it came from. */
export const SHEET_KEY = '__sheet';

export const CASE_STATUSES: CaseStatus[] = ['Not Started', 'In Progress', 'Pass', 'Fail', 'Retest', 'Blocked', 'N/A'];

export const FIELDS: { key: FieldKey; label: string; required?: boolean; hint?: string }[] = [
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
  { key: 'comments', label: 'Comments', hint: 'Export writes the latest portal comment here' },
];

const SYNONYMS: Record<FieldKey, string[]> = {
  ref: ['caseid', 'testcaseid', 'tcid', 'id', 'caseno', 'casenumber', 'testcaseno', 'testid', 'scriptid', 'testscriptid', 'tcno', 'ref', 'no', 'sno', 'number', 'stepno', 'step'],
  module: ['module', 'area', 'process', 'functionalarea', 'processarea', 'businessprocess', 'workstream'],
  scenario: ['scenario', 'testscenario', 'description', 'testcase', 'title', 'testcasename', 'summary', 'testcasedescription', 'name', 'stepname'],
  precond: ['preconditions', 'precondition', 'prerequisites', 'prerequisite', 'prereqs'],
  testData: ['testdata', 'data', 'inputdata'],
  steps: ['steps', 'teststeps', 'procedure', 'stepstoexecute', 'testprocedure', 'actions', 'stepsdescription', 'stepinstructions', 'instructions'],
  expected: ['expectedresult', 'expectedresults', 'expectedoutcome', 'expected', 'expectedbehaviour', 'expectedbehavior'],
  assigned: ['tester', 'assignedto', 'assignee', 'owner', 'testowner', 'testedby'],
  status: ['status', 'result', 'results', 'testresult', 'executionstatus', 'passfail', 'teststatus'],
  actual: ['actualresult', 'actualresults', 'actualoutcome', 'actual', 'actualbehaviour', 'actualbehavior'],
  defect: ['defect', 'defectid', 'bugid', 'defectref', 'jira', 'issue', 'defectno', 'ticket'],
  executedBy: ['executedby', 'testername'],
  executedOn: ['executedon', 'executiondate', 'testdate', 'datetested', 'dateexecuted'],
  comments: ['comments', 'comment', 'remarks', 'latestcomment', 'feedback'],
};

const STATUS_SYNONYMS: Record<string, CaseStatus> = {
  notstarted: 'Not Started',
  notrun: 'Not Started',
  notexecuted: 'Not Started',
  open: 'Not Started',
  todo: 'Not Started',
  inprogress: 'In Progress',
  wip: 'In Progress',
  pending: 'In Progress',
  retest: 'Retest',
  retesting: 'Retest',
  readyforretest: 'Retest',
  pass: 'Pass',
  passed: 'Pass',
  ok: 'Pass',
  fail: 'Fail',
  failed: 'Fail',
  blocked: 'Blocked',
  onhold: 'Blocked',
  requireddiscussion: 'Blocked',
  discussion: 'Blocked',
  needsdiscussion: 'Blocked',
  na: 'N/A',
  notapplicable: 'N/A',
  skipped: 'N/A',
};

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

/** Maps workbook status text to a portal status; null when it isn't recognised. Blank is Not Started. */
export function normaliseStatus(value: string, labels?: Mapping['statusLabels']): CaseStatus | null {
  const n = norm(value);
  if (labels) {
    for (const s of CASE_STATUSES) {
      const label = labels[s];
      if (label !== undefined && norm(label) === n) return s;
    }
  }
  if (!n) return 'Not Started';
  return STATUS_SYNONYMS[n] ?? null;
}

/**
 * Text to write for each portal status, chosen from the values the workbook uses (its dropdown list
 * and existing cells). Statuses with no matching value use the portal's own word; Not Started stays blank
 * unless the workbook has a word for it.
 */
export function defaultStatusLabels(values: string[]): Record<CaseStatus, string> {
  const out = {} as Record<CaseStatus, string>;
  for (const s of CASE_STATUSES) {
    const hit = values.find((v) => normaliseStatus(v) === s && norm(v));
    out[s] = hit ?? (s === 'Not Started' ? '' : s);
  }
  return out;
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
  /** Sheets the portal added on export, ignored on import. */
  portalSheets: string[];
}

export async function readWorkbookFile(file: File): Promise<ParsedWorkbook> {
  return parseWorkbook(await file.arrayBuffer(), file.name);
}

export function parseWorkbook(buf: ArrayBuffer, fileName: string): ParsedWorkbook {
  const wb = XLSX.read(buf, { type: 'array', cellDates: false });
  const meta = readMeta(wb);
  return {
    wb,
    fileName,
    base64: arrayBufferToBase64(buf),
    exportedCycleId: meta.cycleId,
    portalSheets: [META_SHEET, meta.commentsSheet ?? COMMENTS_SHEET],
  };
}

export function arrayBufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

export function base64ToArrayBuffer(b64: string): ArrayBuffer {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

function readMeta(wb: XLSX.WorkBook): { cycleId: number | null; commentsSheet?: string } {
  const ws = wb.Sheets[META_SHEET];
  if (!ws) return { cycleId: null };
  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1 });
  const get = (k: string) => rows.find((r) => r[0] === k)?.[1];
  return { cycleId: Number(get('cycleId')) || null, commentsSheet: get('commentsSheet') ? String(get('commentsSheet')) : undefined };
}

/** A sheet's used range as displayed text, plus where that range starts. */
export function sheetGrid(wb: XLSX.WorkBook, sheetName: string): { rows: string[][]; origin: { r: number; c: number } } {
  const ws = wb.Sheets[sheetName];
  if (!ws || !ws['!ref']) return { rows: [], origin: { r: 0, c: 0 } };
  const start = XLSX.utils.decode_range(ws['!ref']).s;
  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: false, defval: '', blankrows: true }).map((r) => r.map(cellText));
  return { rows, origin: { r: start.r, c: start.c } };
}

export function sheetRows(wb: XLSX.WorkBook, sheetName: string): string[][] {
  return sheetGrid(wb, sheetName).rows;
}

export function dataSheets(wb: XLSX.WorkBook, exclude: string[] = [META_SHEET, COMMENTS_SHEET]): string[] {
  return wb.SheetNames.filter((n) => !exclude.includes(n));
}

/** Makes header cells unique and non-empty so they can be keys of the original-row JSON. */
export function uniqueHeaders(cells: string[]): string[] {
  const seen = new Map<string, number>();
  return cells.map((c, i) => {
    const base = c.replace(/\s+/g, ' ').trim() || `Column ${i + 1}`;
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    return n === 1 ? base : `${base} (${n})`;
  });
}

/**
 * Headers that win over other exact matches. Layouts with both "Scenario" and "Step Name" use
 * Scenario as a section label and Step Name as each case's own title.
 */
const PREFERRED: Partial<Record<FieldKey, string[]>> = {
  scenario: ['stepname', 'testcasename', 'testcasetitle'],
};

/** 4: preferred name, 3: exact, 2: exact once text in brackets is dropped, 1: one part of "A / B" or "A & B" matches. */
function matchScore(header: string, synonyms: string[], key?: FieldKey): number {
  if (key && PREFERRED[key]?.includes(norm(header))) return 4;
  if (synonyms.includes(norm(header))) return 3;
  const bare = header.replace(/\([^)]*\)|\[[^\]]*\]/g, ' ');
  if (synonyms.includes(norm(bare))) return 2;
  if (bare.split(/[/&,;|+]|\band\b/i).some((part) => synonyms.includes(norm(part)))) return 1;
  return 0;
}

export function autoMap(headers: string[]): Partial<Record<FieldKey, string>> {
  const fields: Partial<Record<FieldKey, string>> = {};
  const used = new Set<string>();
  // Strongest matches first, so "Scenario" claims Scenario before "Step Name" can.
  const candidates: { key: FieldKey; header: string; score: number; order: number }[] = [];
  FIELDS.forEach(({ key }, order) => {
    headers.forEach((h) => {
      const score = matchScore(h, SYNONYMS[key], key);
      if (score) candidates.push({ key, header: h, score, order });
    });
  });
  candidates.sort((a, b) => b.score - a.score || a.order - b.order);
  for (const c of candidates) {
    if (fields[c.key] || used.has(c.header)) continue;
    fields[c.key] = c.header;
    used.add(c.header);
  }
  return fields;
}

/** The row among the top 20 that matches the most known column names. */
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

function trimTrailing(cells: string[]): string[] {
  let end = cells.length;
  while (end > 0 && !cells[end - 1]) end--;
  return cells.slice(0, end);
}

function layoutOf(wb: XLSX.WorkBook, name: string, headerRow?: number): { layout: SheetLayout; headers: string[] } {
  const { rows, origin } = sheetGrid(wb, name);
  const hr = headerRow ?? detectHeaderRow(rows);
  return { layout: { name, origin, headerRow: hr }, headers: uniqueHeaders(trimTrailing(rows[hr] ?? [])) };
}

/** Mapping for one sheet; use `withLayoutSheets` to add the other sheets that share its columns. */
export function buildMapping(wb: XLSX.WorkBook, sheetName: string, headerRow?: number): Mapping {
  const { layout, headers } = layoutOf(wb, sheetName, headerRow);
  return { sheetName, headerRow: layout.headerRow, headers, fields: autoMap(headers), sheets: [layout] };
}

/** Other data sheets whose detected header row has exactly the same columns as the mapping. */
export function sameLayoutSheets(wb: XLSX.WorkBook, mapping: Mapping, exclude?: string[]): SheetLayout[] {
  const key = mapping.headers.map(norm).join('|');
  return dataSheets(wb, exclude)
    .map((n) => (n === mapping.sheetName ? { layout: mapping.sheets?.[0] ?? layoutOf(wb, n, mapping.headerRow).layout, headers: mapping.headers } : layoutOf(wb, n)))
    .filter((x) => x.headers.map(norm).join('|') === key)
    .map((x) => x.layout);
}

/** The data sheet whose header row maps the most portal fields (ties go to the earlier sheet). */
export function bestSheet(wb: XLSX.WorkBook, exclude?: string[]): string {
  let best = dataSheets(wb, exclude)[0];
  let bestScore = -1;
  for (const name of dataSheets(wb, exclude)) {
    const m = buildMapping(wb, name);
    const score = Object.keys(m.fields).length + (m.fields.ref ? 5 : 0) + (m.fields.steps ? 5 : 0);
    if (score > bestScore) {
      best = name;
      bestScore = score;
    }
  }
  return best;
}

export function layoutsOf(mapping: Mapping): SheetLayout[] {
  return mapping.sheets?.length ? mapping.sheets : [{ name: mapping.sheetName, origin: { r: 0, c: 0 }, headerRow: mapping.headerRow }];
}

/** Values seen in the status column of the mapped sheets, in first-seen order. */
export function statusValuesInUse(wb: XLSX.WorkBook, mapping: Mapping): string[] {
  const col = mapping.fields.status ? mapping.headers.indexOf(mapping.fields.status) : -1;
  if (col < 0) return [];
  const seen = new Set<string>();
  for (const l of layoutsOf(mapping)) {
    const { rows } = sheetGrid(wb, l.name);
    for (let i = l.headerRow + 1; i < rows.length; i++) if (rows[i][col]) seen.add(rows[i][col]);
  }
  return [...seen];
}

export interface Issue {
  level: 'error' | 'warning';
  sheet?: string;
  row?: number;
  message: string;
}

export interface Extracted {
  rows: ImportRow[];
  issues: Issue[];
  /** Section heading rows (a label in the Case ID column and nothing else) that were skipped. */
  headings: number;
  perSheet: Record<string, number>;
}

/** Rows below the header as import rows, plus anything that should stop or warn about the import. */
export function extractRows(wb: XLSX.WorkBook, mapping: Mapping): Extracted {
  const issues: Issue[] = [];
  const perSheet: Record<string, number> = {};
  for (const f of FIELDS) {
    if (f.required && !mapping.fields[f.key]) issues.push({ level: 'error', message: `Map a column to "${f.label}".` });
  }
  if (issues.length) return { rows: [], issues, headings: 0, perSheet };

  const col = (key: FieldKey) => (mapping.fields[key] ? mapping.headers.indexOf(mapping.fields[key]!) : -1);
  const idx = Object.fromEntries(FIELDS.map((f) => [f.key, col(f.key)])) as Record<FieldKey, number>;
  const content: FieldKey[] = ['scenario', 'precond', 'testData', 'steps', 'expected', 'actual', 'status', 'assigned'];
  const layouts = layoutsOf(mapping);
  const multi = layouts.length > 1;

  const rows: ImportRow[] = [];
  const seen = new Map<string, string>();
  let headings = 0;
  layouts.forEach((layout, si) => {
    const all = sheetGrid(wb, layout.name).rows;
    const get = (r: string[], key: FieldKey) => (idx[key] >= 0 ? r[idx[key]] ?? '' : '');
    perSheet[layout.name] = 0;
    for (let i = layout.headerRow + 1; i < all.length; i++) {
      const r = all[i];
      if (!r.some(Boolean)) continue;
      const where = { sheet: layout.name, row: layout.origin.r + i + 1 };
      const rawRef = get(r, 'ref');
      if (rawRef && content.every((k) => !get(r, k))) {
        headings++;
        continue;
      }
      if (!rawRef) {
        issues.push({ level: 'error', ...where, message: 'Case ID is empty.' });
        continue;
      }
      const ref = multi ? `${layout.name} ${rawRef}` : rawRef;
      const label = `${multi ? `${layout.name} ` : ''}row ${where.row}`;
      if (seen.has(ref)) issues.push({ level: 'error', ...where, message: `Duplicate Case ID "${ref}" (also on ${seen.get(ref)}).` });
      seen.set(ref, label);
      const steps = get(r, 'steps');
      if (!steps) issues.push({ level: 'error', ...where, message: `${ref}: Steps are empty.` });
      if (idx.expected >= 0 && !get(r, 'expected')) issues.push({ level: 'warning', ...where, message: `${ref}: Expected Result is empty.` });

      const rawStatus = get(r, 'status');
      let status: string = 'Not Started';
      if (rawStatus) {
        const s = normaliseStatus(rawStatus, mapping.statusLabels);
        if (s) status = s;
        else issues.push({ level: 'warning', ...where, message: `${ref}: status "${rawStatus}" not recognised; imported as Not Started.` });
      }

      const original: Record<string, CellValue> = {};
      mapping.headers.forEach((h, c) => {
        original[h] = r[c] ?? '';
      });
      if (multi) original[SHEET_KEY] = layout.name;
      rows.push({
        ref,
        rowNum: si * ROW_BLOCK + i,
        module: get(r, 'module') || (mapping.moduleFromSheet ? layout.name : ''),
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
      perSheet[layout.name]++;
    }
  });
  if (!rows.length && !issues.some((x) => x.level === 'error')) issues.push({ level: 'error', message: 'No test cases found below the header row.' });
  return { rows, issues, headings, perSheet };
}

export function exportFileName(cycle: { sourceFile: string; name: string }): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  const stamp = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
  const base = (cycle.sourceFile || cycle.name).replace(/\.xlsx$/i, '').replace(/[^\w.\- ]+/g, '_');
  return `${base}-export-${stamp}.xlsx`;
}

export function downloadBytes(bytes: ArrayBuffer, fileName: string) {
  const url = URL.createObjectURL(new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
