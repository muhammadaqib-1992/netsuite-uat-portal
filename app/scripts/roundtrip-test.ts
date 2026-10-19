// Checks import → export → re-import on the sample workbooks without NetSuite.
// Run: npx esbuild scripts/roundtrip-test.ts --bundle --platform=node --outfile=<tmp>/rt.cjs && node <tmp>/rt.cjs
import * as XLSX from 'xlsx';
import fs from 'node:fs';
import path from 'node:path';
import { bestSheet, buildExport, buildMapping, extractRows, LATEST_COMMENT, COMMENTS_SHEET, META_SHEET } from '../src/lib/excel';
import type { CaseDetail, Comment, Cycle } from '../src/types';

const dir = path.resolve(process.cwd(), '../sample-data');
let failures = 0;
const check = (ok: boolean, msg: string) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${msg}`);
  if (!ok) failures++;
};

for (const name of ['sample-order-to-cash.xlsx', 'sample-procure-to-pay.xlsx']) {
  console.log(`\n${name}`);
  const buf = fs.readFileSync(path.join(dir, name));
  const wb = XLSX.read(buf, { type: 'buffer' });
  const sheet = bestSheet(wb);
  check(sheet !== 'Instructions', `picked the cases sheet (${sheet}), not Instructions`);
  const mapping = buildMapping(wb, sheet);
  check(!!mapping.fields.ref && !!mapping.fields.steps, `auto-mapped Case ID (${mapping.fields.ref}) and Steps (${mapping.fields.steps}) on header row ${mapping.headerRow + 1}`);
  const { rows, issues } = extractRows(wb, mapping);
  check(!issues.some((i) => i.level === 'error'), `no validation errors (${issues.length} issue(s))`);
  check(rows.length > 5, `${rows.length} rows extracted`);

  const cycle: Cycle = { id: 42, name: 'Test', env: '', start: '', end: '', status: 'Active', ownerId: 1, ownerName: 'x', sourceFile: name, hasWorkbook: true, screenshots: true, email: false, mapping };
  const cases: CaseDetail[] = rows.map((r, i) => ({
    ...r, id: 100 + i, cycleId: 42, status: i === 0 ? 'Pass' : (r.status as CaseDetail['status']), actual: i === 0 ? 'Worked fine' : r.actual,
    testerId: null, testerName: i === 0 ? 'Some Tester' : '', executedOn: '', version: 1, evidenceId: null, evidenceName: '',
  }));
  const comments: Comment[] = [
    { id: 1, caseId: 100, parentId: null, type: 'General', text: 'First', authorId: 1, authorName: 'A', byTeam: false, postedOn: 'd1', editedOn: '', statusAtTime: '', fileId: null, fileName: '', editable: false },
    { id: 2, caseId: 100, parentId: 1, type: 'Resolution', text: 'Second', authorId: 2, authorName: 'B', byTeam: true, postedOn: 'd2', editedOn: '', statusAtTime: '', fileId: null, fileName: '', editable: false },
  ];
  const out = buildExport(cycle, cases, comments, buf.toString('base64'));
  const written = XLSX.read(XLSX.write(out, { type: 'buffer', bookType: 'xlsx' }), { type: 'buffer' });

  check(written.SheetNames.includes('Instructions'), 'other sheets kept');
  check(written.SheetNames.includes(COMMENTS_SHEET), 'Comments sheet added');
  check(written.Workbook?.Sheets?.find((s) => s.name === META_SHEET)?.Hidden === 1, 'marker sheet hidden');
  const aoa = XLSX.utils.sheet_to_json<string[]>(written.Sheets[sheet], { header: 1, raw: false, defval: '' });
  if (mapping.headerRow > 0) check(aoa[0][0] === XLSX.utils.sheet_to_json<string[]>(wb.Sheets[sheet], { header: 1 })[0][0], 'title rows above the header kept');
  const header = aoa[mapping.headerRow];
  check(header.includes(LATEST_COMMENT), 'Latest Comment column added');
  const statusCol = header.indexOf(mapping.fields.status ?? 'Status');
  check(aoa[mapping.headerRow + 1][statusCol] === 'Pass', 'status written to first case');
  check(aoa[mapping.headerRow + 1][header.indexOf(LATEST_COMMENT)].includes('Second'), 'latest comment is the newest one');

  // Re-import the export: same cycle found, same cases, no new columns appended twice.
  const re = buildMapping(written, sheet);
  const again = extractRows(written, re);
  check(again.rows.length === rows.length, `re-import finds the same ${rows.length} cases`);
  check(again.rows[0].status === 'Pass', 're-import reads the exported status');
  const writtenB64 = XLSX.write(out, { type: 'base64', bookType: 'xlsx' });
  const out2 = buildExport({ ...cycle, mapping: re }, cases, comments, writtenB64);
  const header2 = XLSX.utils.sheet_to_json<string[]>(out2.Sheets[sheet], { header: 1 })[re.headerRow] as string[];
  check(header2.filter((h) => h === LATEST_COMMENT).length === 1, 'second export does not duplicate columns');
  const meta = XLSX.utils.sheet_to_json<unknown[]>(written.Sheets[META_SHEET], { header: 1 });
  check(meta.some((r) => r[0] === 'cycleId' && r[1] === 42), 'marker sheet holds the cycle ID');
}

console.log(failures ? `\n${failures} check(s) failed` : '\nAll checks passed');
process.exit(failures ? 1 : 0);
