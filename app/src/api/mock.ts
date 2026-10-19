// In-memory stand-in for the RESTlet, used by `npm run dev` and the demo build. Mirrors the RESTlet's
// rules (conflict check, Fail/Blocked reason, one reply level, 15-minute edits, feature switches).
// In dev, open http://localhost:5173/?level=tester (or lead) to see the app as another access level.
import { ApiError, type Api } from './api';
import type { CaseDetail, CaseStatus, Comment, Cycle, FileData, Level, Mapping, MappingTemplate, User } from '../types';
import { DEMO_CYCLES, DEMO_USER, PEOPLE, type DemoComment } from './demo-data';

const STATUSES: CaseStatus[] = ['Not Started', 'In Progress', 'Pass', 'Fail', 'Retest', 'Blocked', 'N/A'];
const EDIT_WINDOW_MS = 15 * 60 * 1000;
const HOUR = 3600 * 1000;

function userFor(level: Level): User {
  const p = PEOPLE[DEMO_USER[level]];
  return { id: p.id, name: p.name, email: 'demo@example.com', roleId: `demo_${level}`, level };
}

let user: User = userFor((new URLSearchParams(location.search).get('level') as Level) || 'team');

/** Switches who the mock is signed in as. Data is kept. */
export function setMockLevel(level: Level) {
  user = userFor(level);
}

let nextId = 1000;
const id = () => ++nextId;
const fmt = (ms: number) => new Date(ms).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
const now = () => fmt(Date.now());
const delay = <T>(v: T): Promise<T> => new Promise((r) => setTimeout(() => r(structuredClone(v)), 120));

const cycles: Cycle[] = [];
const cases: CaseDetail[] = [];
const comments: (Comment & { postedMs: number })[] = [];
const files = new Map<number, FileData>();
const workbooks = new Map<number, number>();
let templates: MappingTemplate[] = [];

const HEADERS = ['Case ID', 'Module', 'Scenario', 'Pre-conditions', 'Test Data', 'Steps', 'Expected Result', 'Tester', 'Status', 'Actual Result', 'Defect ID'];
const FIELDS: Mapping['fields'] = {
  ref: 'Case ID', module: 'Module', scenario: 'Scenario', precond: 'Pre-conditions', testData: 'Test Data', steps: 'Steps',
  expected: 'Expected Result', assigned: 'Tester', status: 'Status', actual: 'Actual Result', defect: 'Defect ID',
};

function seed() {
  const t = Date.now();
  for (const dc of DEMO_CYCLES) {
    const owner = PEOPLE[dc.owner];
    const cycle: Cycle = {
      id: id(), name: dc.name, env: dc.env, start: dc.start, end: dc.end, status: dc.status,
      ownerId: owner.id, ownerName: owner.name, sourceFile: dc.sourceFile, hasWorkbook: false,
      screenshots: true, email: true, mapping: { sheetName: dc.sheetName, headerRow: 0, headers: HEADERS, fields: FIELDS },
    };
    cycles.push(cycle);
    dc.cases.forEach((d, i) => {
      const tester = d.ran !== undefined ? PEOPLE[d.assigned] : null;
      const steps = d.steps.map((s, n) => `${n + 1}. ${s}`).join('\n');
      const c: CaseDetail = {
        id: id(), cycleId: cycle.id, ref: d.ref, rowNum: i + 1, module: d.module, scenario: d.scenario,
        assigned: PEOPLE[d.assigned].name, status: d.status, testerId: tester?.id ?? null, testerName: tester?.name ?? '',
        executedOn: d.ran !== undefined ? fmt(t - d.ran * HOUR) : '', defect: d.defect ?? '', version: 1,
        precond: d.precond, testData: d.testData, steps, expected: d.expected, actual: d.actual ?? '',
        evidenceId: null, evidenceName: '',
        row: {
          'Case ID': d.ref, Module: d.module, Scenario: d.scenario, 'Pre-conditions': d.precond, 'Test Data': d.testData,
          Steps: steps, 'Expected Result': d.expected, Tester: PEOPLE[d.assigned].name, Status: '', 'Actual Result': '', 'Defect ID': '',
        },
      };
      cases.push(c);
      const add = (dm: DemoComment, parentId: number | null) => {
        const p = PEOPLE[dm.by];
        const postedMs = t - dm.ago * HOUR;
        const cid = id();
        comments.push({
          ...blankComment(c.id), id: cid, parentId, type: dm.type ?? 'General', text: dm.text, authorId: p.id, authorName: p.name,
          byTeam: p.team, postedOn: fmt(postedMs), postedMs, statusAtTime: d.status,
        });
        return cid;
      };
      for (const dm of d.comments ?? []) {
        const root = add(dm, null);
        for (const r of dm.replies ?? []) add(r, root);
      }
    });
  }
}

function blankComment(caseId: number): Comment & { postedMs: number } {
  return {
    id: 0,
    caseId,
    parentId: null,
    type: 'General',
    text: '',
    authorId: null,
    authorName: '',
    byTeam: false,
    postedOn: now(),
    editedOn: '',
    statusAtTime: 'Not Started',
    fileId: null,
    fileName: '',
    editable: false,
    postedMs: Date.now() - EDIT_WINDOW_MS * 2,
  };
}

function findCycle(cycleId: number) {
  const c = cycles.find((x) => x.id === Number(cycleId));
  if (!c) throw new ApiError('NOT_FOUND', 'UAT cycle not found.');
  return c;
}
function findCase(caseId: number) {
  const c = cases.find((x) => x.id === Number(caseId));
  if (!c) throw new ApiError('NOT_FOUND', 'Test case not found.');
  return c;
}
function requireTeam() {
  if (user.level !== 'team') throw new ApiError('FORBIDDEN', 'Only the implementation team can do this.');
}

function caseComments(caseId: number): Comment[] {
  return comments
    .filter((c) => c.caseId === caseId)
    .map(({ postedMs, ...c }) => {
      const editable = c.authorId === user.id && Date.now() - postedMs < EDIT_WINDOW_MS;
      return { ...c, editable, editableUntil: editable ? postedMs + EDIT_WINDOW_MS : undefined };
    });
}

function bundle(caseId: number) {
  const c = findCase(caseId);
  return { case: c, comments: caseComments(caseId), cycle: findCycle(c.cycleId) };
}

function saveFile(name: string, base64: string, mime: string) {
  const fid = id();
  files.set(fid, { id: fid, name, base64, mime });
  return fid;
}

function addComment(caseId: number, text: string, type: Comment['type'], parentId?: number | null, fileId?: number | null, fileName?: string) {
  if (!text.trim()) throw new ApiError('INVALID', 'Comment text is required.');
  let parent = parentId ? comments.find((c) => c.id === parentId) : undefined;
  if (parent?.parentId) parent = comments.find((c) => c.id === parent!.parentId);
  comments.push({
    ...blankComment(caseId),
    id: id(),
    parentId: parent?.id ?? null,
    type,
    text: text.trim(),
    authorId: user.id,
    authorName: user.name,
    byTeam: user.level === 'team',
    statusAtTime: findCase(caseId).status,
    fileId: fileId ?? null,
    fileName: fileName ?? '',
    postedMs: Date.now(),
  });
}

function imageMime(name: string) {
  const ext = name.split('.').pop()?.toLowerCase();
  const mime = ext === 'png' ? 'image/png' : ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : ext === 'gif' ? 'image/gif' : '';
  if (!mime) throw new ApiError('BAD_FILE', 'Only PNG, JPG and GIF screenshots can be attached.');
  return mime;
}

export function mockApi(): Api {
  if (!cycles.length) seed();
  return {
    async bootstrap() {
      return delay({
        user,
        accountDefaults: { screenshots: true, email: false },
        cycles: cycles.map((c) => ({ ...c, mapping: undefined, caseCount: cases.filter((x) => x.cycleId === c.id).length })),
        caseStatuses: STATUSES,
        cycleStatuses: ['Planned', 'Active', 'Closed'],
        commentTypes: ['General', 'Clarification', 'Fail Reason', 'Retest Note', 'Resolution'],
        limits: { imageBytes: 5 * 1024 * 1024, workbookBytes: 9 * 1024 * 1024, editWindowMs: EDIT_WINDOW_MS },
      });
    },
    async cycles() {
      return delay(cycles.map((c) => ({ ...c, caseCount: cases.filter((x) => x.cycleId === c.id).length })));
    },
    async cycle(cid) {
      return delay(findCycle(cid));
    },
    async cases(cycleId) {
      return delay(
        cases
          .filter((c) => c.cycleId === Number(cycleId))
          .sort((a, b) => a.rowNum - b.rowNum)
          .map(({ precond, testData, steps, expected, actual, evidenceId, evidenceName, row, ...c }) => {
            const list = comments.filter((x) => x.caseId === c.id);
            const unanswered = list.some((x) => !x.parentId && !x.byTeam && !list.some((r) => r.parentId === x.id && r.byTeam));
            return { ...c, commentCount: list.length, unanswered };
          })
      );
    },
    async getCase(cid) {
      return delay(bundle(cid));
    },
    async exportCases(cycleId, page) {
      const all = cases.filter((c) => c.cycleId === Number(cycleId)).sort((a, b) => a.rowNum - b.rowNum);
      const size = 500;
      return delay({ page, pageCount: Math.ceil(all.length / size), total: all.length, cases: all.slice(page * size, page * size + size) });
    },
    async exportComments(cycleId) {
      const ids = new Set(cases.filter((c) => c.cycleId === Number(cycleId)).map((c) => c.id));
      return delay(comments.filter((c) => ids.has(c.caseId)).map(({ postedMs, ...c }) => c));
    },
    async workbook(cycleId) {
      const fid = workbooks.get(Number(cycleId));
      return delay(fid ? files.get(fid)! : null);
    },
    async file(fid) {
      const f = files.get(Number(fid));
      if (!f) throw new ApiError('NOT_FOUND', 'File not found.');
      return delay(f);
    },
    async templates() {
      return delay(templates);
    },

    async saveCase(input) {
      const c = findCase(input.id);
      if (c.version !== input.version) throw new ApiError('CONFLICT', 'Someone else saved this case after you opened it. Reload to see their changes.', { version: c.version });
      const failing = input.status === 'Fail' || input.status === 'Blocked';
      const needsReason = failing && input.status !== c.status;
      if (failing && !input.actual.trim()) throw new ApiError('INVALID', `${input.status} needs an Actual Result.`);
      if (needsReason && !input.reason?.trim()) throw new ApiError('INVALID', `${input.status} needs a reason.`);
      const changed = input.status !== c.status || input.actual !== c.actual;
      Object.assign(c, { status: input.status, actual: input.actual, defect: input.defect, version: c.version + 1 });
      if (input.status !== 'Not Started' && changed) Object.assign(c, { testerId: user.id, testerName: user.name, executedOn: now() });
      if (input.reason?.trim()) addComment(c.id, input.reason, 'Fail Reason');
      return delay(bundle(c.id));
    },
    async uploadEvidence(input) {
      const c = findCase(input.caseId);
      if (c.version !== input.version) throw new ApiError('CONFLICT', 'Someone else saved this case after you opened it. Reload to see their changes.');
      if (!findCycle(c.cycleId).screenshots) throw new ApiError('FEATURE_OFF', 'Screenshots are switched off for this cycle.');
      const fid = saveFile(input.name, input.base64, imageMime(input.name));
      Object.assign(c, { evidenceId: fid, evidenceName: input.name, version: c.version + 1 });
      return delay(bundle(c.id));
    },
    async addComment(input) {
      const c = findCase(input.caseId);
      let fid: number | null = null;
      if (input.attachment) {
        if (!findCycle(c.cycleId).screenshots) throw new ApiError('FEATURE_OFF', 'Screenshots are switched off for this cycle.');
        fid = saveFile(input.attachment.name, input.attachment.base64, imageMime(input.attachment.name));
      }
      addComment(c.id, input.text, input.type, input.parentId, fid, input.attachment?.name);
      return delay({ comments: caseComments(c.id) });
    },
    async editComment(input) {
      const cm = comments.find((c) => c.id === input.id);
      if (!cm || cm.authorId !== user.id) throw new ApiError('FORBIDDEN', 'You can only edit your own comments.');
      if (Date.now() - cm.postedMs > EDIT_WINDOW_MS) throw new ApiError('FORBIDDEN', 'Comments can only be edited for 15 minutes after posting.');
      Object.assign(cm, { text: input.text.trim(), editedOn: now() });
      return delay({ comments: caseComments(cm.caseId) });
    },
    async createCycle(input) {
      requireTeam();
      const c: Cycle = {
        id: id(),
        name: input.name || 'UAT Cycle',
        env: input.env || '',
        start: input.start || '',
        end: input.end || '',
        status: input.status || 'Active',
        ownerId: user.id,
        ownerName: user.name,
        sourceFile: input.sourceFile || '',
        hasWorkbook: false,
        screenshots: true,
        email: false,
        mapping: input.mapping ?? null,
      };
      cycles.unshift(c);
      return delay(c);
    },
    async updateCycle(input) {
      requireTeam();
      const c = findCycle(input.id);
      const { id: _ignored, ...rest } = input;
      Object.assign(c, Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== undefined)));
      return delay(c);
    },
    async uploadWorkbook(input) {
      requireTeam();
      const c = findCycle(input.cycleId);
      workbooks.set(c.id, saveFile(input.name, input.base64, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'));
      Object.assign(c, { hasWorkbook: true, sourceFile: input.name });
      return delay(c);
    },
    async importBatch(input) {
      requireTeam();
      findCycle(input.cycleId);
      const result = { processed: 0, created: 0, updated: 0 };
      for (const r of input.rows) {
        const existing = cases.find((c) => c.cycleId === input.cycleId && c.ref === r.ref);
        const status = (STATUSES.includes(r.status as CaseStatus) ? r.status : 'Not Started') as CaseStatus;
        const fields = { module: r.module, scenario: r.scenario, precond: r.precond, testData: r.testData, steps: r.steps, expected: r.expected, assigned: r.assigned, rowNum: r.rowNum, row: r.row };
        if (existing) {
          Object.assign(existing, fields, { version: existing.version + 1 });
          if (existing.status === 'Not Started' && status !== 'Not Started') Object.assign(existing, { status, actual: r.actual || existing.actual, defect: r.defect || existing.defect });
          result.updated++;
        } else {
          cases.push({ ...fields, id: id(), cycleId: input.cycleId, ref: r.ref, status, actual: r.actual, defect: r.defect, testerId: null, testerName: '', executedOn: '', version: 1, evidenceId: null, evidenceName: '' });
          result.created++;
        }
        result.processed++;
      }
      return delay(result);
    },
    async saveTemplate(input) {
      requireTeam();
      templates = templates.filter((t) => t.name !== input.name).concat(input);
      return delay(templates);
    },
  };
}
