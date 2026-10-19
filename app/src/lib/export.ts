// Export: writes current portal results into the workbook the cycle was imported from, cell by cell,
// so styling, dropdowns, merged cells, section rows, other sheets and formulas are kept.
// Without a stored original it builds a plain workbook with the same columns.
import type { Workbook, Worksheet } from 'exceljs';
import type { CaseDetail, CaseStatus, CellValue, Comment, Cycle, FieldKey, Mapping, SheetLayout } from '../types';
import { COMMENTS_SHEET, LATEST_COMMENT, META_SHEET, ROW_BLOCK, SHEET_KEY, base64ToArrayBuffer, layoutsOf } from './excel';

async function excelJs() {
  const mod = await import('exceljs');
  return (mod as unknown as { default?: typeof mod }).default ?? mod;
}

const defaultMapping: Mapping = {
  sheetName: 'Test Cases',
  headerRow: 0,
  headers: ['Case ID', 'Module', 'Scenario', 'Pre-conditions', 'Test Data', 'Steps', 'Expected Result'],
  fields: { ref: 'Case ID', module: 'Module', scenario: 'Scenario', precond: 'Pre-conditions', testData: 'Test Data', steps: 'Steps', expected: 'Expected Result' },
};

function commentLine(c: Comment): string {
  return `${c.authorName} (${c.postedOn}): ${c.text}`;
}

export function statusText(status: CaseStatus, mapping: Mapping): string {
  const label = mapping.statusLabels?.[status];
  return label === undefined ? status : label;
}

/** Which layout a case belongs to and its 0-based row index inside that sheet's used range. */
function locate(c: CaseDetail, layouts: SheetLayout[]): { layout: SheetLayout; rowIdx: number } | null {
  const si = Math.floor(c.rowNum / ROW_BLOCK);
  const bySheet = typeof c.row?.[SHEET_KEY] === 'string' ? layouts.find((l) => l.name === c.row[SHEET_KEY]) : undefined;
  const layout = bySheet ?? layouts[si] ?? layouts[0];
  return layout ? { layout, rowIdx: c.rowNum % ROW_BLOCK } : null;
}

/** Columns the export writes: mapped ones, plus Status / Actual Result / Latest Comment added when missing. */
function exportColumns(mapping: Mapping) {
  const f = { ...mapping.fields };
  const extra: string[] = [];
  const need = (key: FieldKey, header: string) => {
    if (f[key]) return;
    if (!mapping.headers.includes(header) && !extra.includes(header)) extra.push(header);
    f[key] = header;
  };
  need('status', 'Status');
  need('actual', 'Actual Result');
  need('comments', LATEST_COMMENT);
  return { fields: f, headers: [...mapping.headers, ...extra], extra };
}

function caseValues(c: CaseDetail, mapping: Mapping, fields: Partial<Record<FieldKey, string>>, latest: Comment | undefined): Record<string, CellValue> {
  const v: Record<string, CellValue> = {};
  const set = (key: FieldKey, value: string) => {
    if (fields[key]) v[fields[key]!] = value;
  };
  set('status', statusText(c.status, mapping));
  set('actual', c.actual);
  set('defect', c.defect);
  set('executedBy', c.testerName);
  set('executedOn', c.executedOn);
  // Keep whatever the workbook already had in its comments column when nobody has commented in the portal.
  if (latest) set('comments', commentLine(latest));
  return v;
}

function latestByCase(comments: Comment[]) {
  const latest = new Map<number, Comment>();
  for (const c of comments) latest.set(c.caseId, c); // comments arrive oldest first
  return latest;
}

function addCommentsSheet(wb: Workbook, name: string, cases: CaseDetail[], comments: Comment[]) {
  const ws = wb.addWorksheet(name);
  ws.columns = [
    { header: 'Case ID', width: 16 },
    { header: 'Comment ID', width: 12 },
    { header: 'Reply To', width: 10 },
    { header: 'Author', width: 22 },
    { header: 'Date', width: 20 },
    { header: 'Type', width: 14 },
    { header: 'Comment', width: 80 },
    { header: 'Attachment name', width: 30 },
  ];
  ws.getRow(1).font = { bold: true };
  ws.views = [{ state: 'frozen', ySplit: 1 }];
  const refById = new Map(cases.map((c) => [c.id, c.ref]));
  for (const c of comments) ws.addRow([refById.get(c.caseId) ?? '', c.id, c.parentId ?? '', c.authorName, c.postedOn, c.type, c.text, c.fileName]);
  ws.getColumn(7).alignment = { wrapText: true, vertical: 'top' };
}

function addMetaSheet(wb: Workbook, cycle: Cycle, commentsSheet: string) {
  const ws = wb.addWorksheet(META_SHEET, { state: 'hidden' });
  ws.addRows([
    ['cycleId', cycle.id],
    ['cycleName', cycle.name],
    ['commentsSheet', commentsSheet],
    ['exportedAt', new Date().toISOString()],
  ]);
}

function removeSheet(wb: Workbook, name: string) {
  const ws = wb.getWorksheet(name);
  if (ws) wb.removeWorksheet(ws.id);
}

/** Name for the comments sheet that doesn't clash with a sheet the client already had. */
function commentsSheetName(wb: Workbook, previous: string | undefined): string {
  if (previous) return previous;
  if (!wb.getWorksheet(COMMENTS_SHEET)) return COMMENTS_SHEET;
  let n = 'Portal Comments';
  for (let i = 2; wb.getWorksheet(n); i++) n = `Portal Comments ${i}`;
  return n;
}

function readPreviousCommentsSheet(wb: Workbook): string | undefined {
  const meta = wb.getWorksheet(META_SHEET);
  if (!meta) return undefined;
  let name: string | undefined;
  meta.eachRow((row) => {
    if (row.getCell(1).value === 'commentsSheet') name = String(row.getCell(2).value ?? '') || undefined;
  });
  return name;
}

/** Copies the look of the header cell to its left onto a new header cell. */
function styleLikeLeft(ws: Worksheet, row: number, col: number) {
  const left = ws.getCell(row, col - 1);
  const cell = ws.getCell(row, col);
  cell.style = JSON.parse(JSON.stringify(left.style ?? {}));
  ws.getColumn(col).width = Math.max(ws.getColumn(col - 1).width ?? 12, 30);
}

async function exportIntoOriginal(cycle: Cycle, mapping: Mapping, cases: CaseDetail[], comments: Comment[], original: ArrayBuffer): Promise<ArrayBuffer> {
  const ExcelJS = await excelJs();
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(original);
  const previousComments = readPreviousCommentsSheet(wb);
  const layouts = layoutsOf(mapping);
  const { fields, headers, extra } = exportColumns(mapping);
  const latest = latestByCase(comments);

  for (const layout of layouts) {
    const ws = wb.getWorksheet(layout.name);
    if (!ws) continue;
    const headerRow = layout.origin.r + layout.headerRow + 1;
    extra.forEach((h, i) => {
      const col = layout.origin.c + mapping.headers.length + i + 1;
      ws.getCell(headerRow, col).value = h;
      styleLikeLeft(ws, headerRow, col);
    });
  }

  for (const c of cases) {
    const at = locate(c, layouts);
    const ws = at && wb.getWorksheet(at.layout.name);
    if (!at || !ws) continue;
    const excelRow = at.layout.origin.r + at.rowIdx + 1;
    for (const [header, value] of Object.entries(caseValues(c, mapping, fields, latest.get(c.id)))) {
      const col = headers.indexOf(header);
      if (col < 0) continue;
      const cell = ws.getCell(excelRow, at.layout.origin.c + col + 1);
      cell.value = value === '' ? null : value;
      if (typeof value === 'string' && value.includes('\n')) cell.alignment = { ...(cell.alignment ?? {}), wrapText: true };
    }
  }

  removeSheet(wb, META_SHEET);
  if (previousComments) removeSheet(wb, previousComments);
  const commentsName = commentsSheetName(wb, previousComments);
  addCommentsSheet(wb, commentsName, cases, comments);
  addMetaSheet(wb, cycle, commentsName);
  // Summary formulas (for example a tracker sheet counting results) recalculate when the file opens.
  wb.calcProperties = { ...(wb.calcProperties ?? {}), fullCalcOnLoad: true };
  return (await wb.xlsx.writeBuffer()) as ArrayBuffer;
}

async function exportFresh(cycle: Cycle, mapping: Mapping, cases: CaseDetail[], comments: Comment[]): Promise<ArrayBuffer> {
  const ExcelJS = await excelJs();
  const wb = new ExcelJS.Workbook();
  const layouts = layoutsOf(mapping);
  const { fields, headers } = exportColumns(mapping);
  const latest = latestByCase(comments);
  const bySheet = new Map<string, CaseDetail[]>();
  for (const c of [...cases].sort((a, b) => a.rowNum - b.rowNum)) {
    const name = locate(c, layouts)?.layout.name ?? mapping.sheetName;
    bySheet.set(name, [...(bySheet.get(name) ?? []), c]);
  }
  for (const layout of layouts) {
    const ws = wb.addWorksheet(layout.name.slice(0, 31));
    ws.addRow(headers).font = { bold: true };
    ws.views = [{ state: 'frozen', ySplit: 1 }];
    for (const c of bySheet.get(layout.name) ?? []) {
      const values = { ...c.row, ...caseValues(c, mapping, fields, latest.get(c.id)) };
      ws.addRow(headers.map((h) => values[h] ?? ''));
    }
    headers.forEach((_, i) => {
      ws.getColumn(i + 1).width = 22;
    });
  }
  addCommentsSheet(wb, COMMENTS_SHEET, cases, comments);
  addMetaSheet(wb, cycle, COMMENTS_SHEET);
  return (await wb.xlsx.writeBuffer()) as ArrayBuffer;
}

/** Builds the export workbook. Pass the stored original (base64) to keep the client's own formatting. */
export async function buildExportWorkbook(cycle: Cycle, cases: CaseDetail[], comments: Comment[], originalBase64: string | null): Promise<ArrayBuffer> {
  const mapping = cycle.mapping ?? defaultMapping;
  if (originalBase64) return exportIntoOriginal(cycle, mapping, cases, comments, base64ToArrayBuffer(originalBase64));
  return exportFresh(cycle, mapping, cases, comments);
}

/** Values offered by list dropdowns (data validation) in the given column of a sheet, if any. */
export async function dropdownValues(buf: ArrayBuffer, layout: SheetLayout, columnIndex: number): Promise<string[]> {
  const ExcelJS = await excelJs();
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);
  const ws = wb.getWorksheet(layout.name);
  if (!ws) return [];
  const col = layout.origin.c + columnIndex + 1;
  const model = (ws as unknown as { dataValidations?: { model?: Record<string, { type?: string; formulae?: string[] }> } }).dataValidations?.model ?? {};
  const values = new Set<string>();
  for (const [address, dv] of Object.entries(model)) {
    if (dv.type !== 'list' || !dv.formulae?.[0]) continue;
    if (!addressCoversColumn(address, col)) continue;
    const f = dv.formulae[0].trim();
    if (!f.startsWith('"')) continue; // ranges like =Lists!A1:A6 aren't resolved
    f.replace(/^"|"$/g, '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .forEach((s) => values.add(s));
  }
  return [...values];
}

function colNumber(letters: string): number {
  let n = 0;
  for (const ch of letters.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n;
}

function addressCoversColumn(address: string, col: number): boolean {
  return address.split(/\s+/).some((part) => {
    const m = /^\$?([A-Z]+)\$?\d+(?::\$?([A-Z]+)\$?\d+)?$/i.exec(part.replace(/^range:/, ''));
    if (!m) return false;
    const a = colNumber(m[1]);
    const b = m[2] ? colNumber(m[2]) : a;
    return col >= Math.min(a, b) && col <= Math.max(a, b);
  });
}
