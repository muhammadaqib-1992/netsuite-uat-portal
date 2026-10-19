// Checks import → export → re-import on the sample workbooks without NetSuite.
// Run: npm run test:excel
import * as XLSX from 'xlsx';
import ExcelJS from 'exceljs';
import fs from 'node:fs';
import path from 'node:path';
import {
  LATEST_COMMENT,
  META_SHEET,
  bestSheet,
  buildMapping,
  defaultStatusLabels,
  extractRows,
  parseWorkbook,
  sameLayoutSheets,
  statusValuesInUse,
  type ParsedWorkbook,
} from '../src/lib/excel';
import { buildExportWorkbook, dropdownValues } from '../src/lib/export';
import type { CaseDetail, Comment, Cycle, Mapping } from '../src/types';

const dir = path.resolve(process.cwd(), '../sample-data');
let failures = 0;
const check = (ok: boolean, msg: string) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${msg}`);
  if (!ok) failures++;
};

const toAb = (b: Buffer) => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;

/** What the import wizard does by default. */
async function prepare(p: ParsedWorkbook, ab: ArrayBuffer): Promise<Mapping> {
  const m = buildMapping(p.wb, bestSheet(p.wb, p.portalSheets));
  m.sheets = sameLayoutSheets(p.wb, m, p.portalSheets);
  m.moduleFromSheet = !m.fields.module && m.sheets.length > 1;
  const col = m.fields.status ? m.headers.indexOf(m.fields.status) : -1;
  const dd = col >= 0 ? await dropdownValues(ab, m.sheets[0], col) : [];
  m.statusLabels = defaultStatusLabels([...dd, ...statusValuesInUse(p.wb, m)]);
  return m;
}

const comment = (caseId: number, id: number, text: string): Comment => ({
  id, caseId, parentId: null, type: 'General', text, authorId: 1, authorName: 'A', byTeam: false, postedOn: `d${id}`, editedOn: '', statusAtTime: '', fileId: null, fileName: '', editable: false,
});

async function main() {
  for (const name of ['sample-order-to-cash.xlsx', 'sample-procure-to-pay.xlsx', 'sample-web-store-multi-sheet.xlsx']) {
    console.log(`\n${name}`);
    const buf = fs.readFileSync(path.join(dir, name));
    const ab = toAb(buf);
    const p = parseWorkbook(ab, name);
    const m = await prepare(p, ab);
    check(!!m.fields.ref && !!m.fields.steps, `auto-mapped Case ID (${m.fields.ref}) and Steps (${m.fields.steps}) on header row ${m.headerRow + 1} of "${m.sheetName}"`);
    const { rows, issues, headings } = extractRows(p.wb, m);
    check(!issues.some((i) => i.level === 'error'), `no validation errors (${issues.length} issue(s), ${headings} heading row(s) skipped)`);
    check(rows.length > 5, `${rows.length} rows from ${m.sheets!.length} sheet(s)`);

    const cycle: Cycle = { id: 42, name: 'Test', env: '', start: '', end: '', status: 'Active', ownerId: 1, ownerName: 'x', sourceFile: name, hasWorkbook: true, screenshots: true, email: false, mapping: m };
    const statuses = ['Pass', 'Fail', 'Blocked', 'In Progress', 'N/A', 'Not Started', 'Retest'] as const;
    const cases: CaseDetail[] = rows.map((r, i) => ({
      ...r, id: 100 + i, cycleId: 42, status: statuses[i % statuses.length], actual: i === 1 ? 'It failed' : r.actual,
      testerId: null, testerName: i === 0 ? 'Some Tester' : '', executedOn: '', version: 1, evidenceId: null, evidenceName: '',
    }));
    const comments = [comment(100, 1, 'First'), comment(100, 2, 'Second')];
    const out = Buffer.from(await buildExportWorkbook(cycle, cases, comments, buf.toString('base64')));

    // Re-import the export: same cycle, same cases, same statuses.
    const p2 = parseWorkbook(toAb(out), 'export.xlsx');
    check(p2.exportedCycleId === 42, 'export carries the cycle ID in a hidden sheet');
    const m2 = await prepare(p2, toAb(out));
    m2.statusLabels = m.statusLabels;
    const again = extractRows(p2.wb, m2);
    check(again.rows.length === rows.length, `re-import finds the same ${rows.length} cases`);
    const differ = again.rows.filter((r, i) => r.ref !== cases[i].ref || r.status !== cases[i].status).length;
    check(differ === 0, 'every status survives export and re-import');

    // Second export of the re-imported workbook must not add columns again.
    const out2 = Buffer.from(await buildExportWorkbook({ ...cycle, mapping: m2 }, cases, comments, out.toString('base64')));
    const wb2 = XLSX.read(out2, { type: 'buffer' });
    const header2 = XLSX.utils.sheet_to_json<string[]>(wb2.Sheets[m.sheetName], { header: 1, defval: '' })[m.headerRow].map(String);
    check(header2.filter((h) => h === LATEST_COMMENT).length <= 1, 'second export does not duplicate columns');
    check(wb2.SheetNames.filter((n) => n === META_SHEET).length === 1, 'one marker sheet after two exports');

    // Formatting kept (checked with ExcelJS on the first data sheet).
    const a = new ExcelJS.Workbook();
    await a.xlsx.load(ab);
    const b = new ExcelJS.Workbook();
    await b.xlsx.load(toAb(out));
    const A = a.getWorksheet(m.sheetName)!;
    const B = b.getWorksheet(m.sheetName)!;
    check(a.worksheets.every((w) => !!b.getWorksheet(w.name)), 'all original sheets kept');
    check(A.columns.map((c) => c.width).join() === B.columns.slice(0, A.columns.length).map((c) => c.width).join(), 'column widths kept');
    const merges = (w: ExcelJS.Worksheet) => Object.keys((w as unknown as { _merges: object })._merges ?? {}).sort().join();
    check(merges(A) === merges(B), 'merged cells kept');
    const dv = (w: ExcelJS.Worksheet) => Object.keys((w as unknown as { dataValidations: { model: object } }).dataValidations.model).length;
    check(dv(A) === dv(B), `dropdowns kept (${dv(A)})`);
    const hdrCell = m.sheets![0].origin.r + m.headerRow + 1;
    const firstCol = m.sheets![0].origin.c + 1;
    check(JSON.stringify(A.getCell(hdrCell, firstCol).fill ?? null) === JSON.stringify(B.getCell(hdrCell, firstCol).fill ?? null), 'header fill kept');
    if (m.sheets!.length > 1) {
      const statusCol = firstCol + m.headers.indexOf(m.fields.status!);
      const layoutOf = (c: CaseDetail) => m.sheets![Math.floor(c.rowNum / 100000)];
      const cellOf = (c: CaseDetail) => b.getWorksheet(layoutOf(c).name)!.getCell(layoutOf(c).origin.r + (c.rowNum % 100000) + 1, statusCol);
      check(cellOf(cases[2]).value === m.statusLabels!.Blocked, `Blocked is written as the workbook's word "${m.statusLabels!.Blocked}"`);
      const blank = cellOf(cases[5]).value;
      check(cases[5].status === 'Not Started' && (blank === null || blank === undefined), `Not Started is written as a blank cell (got ${JSON.stringify(blank)}, label ${JSON.stringify(m.statusLabels!['Not Started'])})`);
      const zip = XLSX.CFB.read(out, { type: 'buffer' });
      const wbXml = Buffer.from(zip.FileIndex.find((e) => /workbook.xml$/.test(e.name))!.content as Uint8Array).toString();
      check(/fullCalcOnLoad="1"/.test(wbXml), 'tracker formulas recalculate on open');
      check(cellOf(cases[6]).value === 'Retest', 'Retest is written as Retest');
      check(m.fields.scenario === 'Step Name', 'Step Name is the case title when Scenario also exists');
    }
  }
  console.log(failures ? `\n${failures} check(s) failed` : '\nAll checks passed');
  process.exit(failures ? 1 : 0);
}

main();
