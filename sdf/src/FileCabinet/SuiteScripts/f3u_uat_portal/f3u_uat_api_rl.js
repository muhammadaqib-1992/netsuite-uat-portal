/**
 * UAT portal data API. The only way the React app reads or writes data.
 *
 * GET  ?action=<name>&...params     POST { action: <name>, ...params }
 * Every response is { ok: true, data } or { ok: false, error: { code, message } }.
 *
 * @NApiVersion 2.1
 * @NScriptType Restlet
 * @NModuleScope SameAccount
 */
define(['N/record', 'N/search', 'N/runtime', 'N/file', 'N/email', 'N/url', 'N/format', 'N/log', './f3u_uat_lib'], (
  record,
  search,
  runtime,
  file,
  email,
  url,
  format,
  log,
  lib
) => {
  const { REC, CYCLE, CASE, CMT } = lib;

  const PARAM = {
    SCREENSHOTS: 'custscript_f3u_uat_enable_screenshots',
    EMAIL: 'custscript_f3u_uat_enable_email',
    TEAM_ROLES: 'custscript_f3u_uat_team_roles',
    LEAD_ROLES: 'custscript_f3u_uat_lead_roles',
    TEAM_EMPLOYEES: 'custscript_f3u_uat_team_employees',
    LEAD_EMPLOYEES: 'custscript_f3u_uat_lead_employees',
    DATA_FOLDER: 'custscript_f3u_uat_data_folder',
  };

  const EDIT_WINDOW_MS = 15 * 60 * 1000;
  const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
  const MAX_WORKBOOK_BYTES = 9 * 1024 * 1024;
  const MIN_UNITS_PER_ROW = 60;
  const EXPORT_PAGE_SIZE = 500;
  const TEMPLATES_FILE = 'mapping-templates.json';

  const IMAGE_TYPES = {
    png: file.Type.PNGIMAGE,
    jpg: file.Type.JPGIMAGE,
    jpeg: file.Type.JPGIMAGE,
    gif: file.Type.GIFIMAGE,
  };
  const MIME = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif' };

  // ---------- plumbing ----------

  class ApiError extends Error {
    constructor(code, message, extra) {
      super(message);
      this.code = code;
      this.extra = extra;
    }
  }
  const fail = (code, message, extra) => {
    throw new ApiError(code, message, extra);
  };

  function param(id) {
    return runtime.getCurrentScript().getParameter({ name: id });
  }
  const isTrue = (v) => v === true || v === 'T' || v === 'true';

  function me() {
    return lib.currentUser({
      teamEmployees: param(PARAM.TEAM_EMPLOYEES),
      teamRoles: param(PARAM.TEAM_ROLES),
      leadEmployees: param(PARAM.LEAD_EMPLOYEES),
      leadRoles: param(PARAM.LEAD_ROLES),
    });
  }

  function requireTeam(user) {
    if (user.level !== 'team') fail('FORBIDDEN', 'Only the implementation team can do this.');
  }

  function folders() {
    return lib.dataFolders(param(PARAM.DATA_FOLDER));
  }

  function str(v, max) {
    const s = v === null || v === undefined ? '' : String(v);
    return max && s.length > max ? s.slice(0, max) : s;
  }

  function parseJson(s, fallback) {
    if (!s) return fallback;
    try {
      return JSON.parse(s);
    } catch (e) {
      return fallback;
    }
  }

  function toDate(ymd) {
    if (!ymd) return null;
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(ymd));
    return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
  }

  /** A NetSuite date (string in the user's format) as YYYY-MM-DD for the app. */
  function isoDate(value) {
    if (!value) return '';
    try {
      const d = format.parse({ value, type: format.Type.DATE });
      const p = (n) => (n < 10 ? '0' : '') + n;
      return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
    } catch (e) {
      return '';
    }
  }

  function safeName(name) {
    return str(name, 120).replace(/[^\w.\- ]+/g, '_') || 'file';
  }

  function base64Bytes(b64) {
    const s = String(b64 || '');
    return Math.floor((s.length * 3) / 4);
  }

  function run(handler, input) {
    try {
      return JSON.stringify({ ok: true, data: handler(input || {}) });
    } catch (e) {
      if (e instanceof ApiError) {
        return JSON.stringify({ ok: false, error: { code: e.code, message: e.message, extra: e.extra } });
      }
      log.error({ title: 'UAT API error', details: e });
      return JSON.stringify({ ok: false, error: { code: e.name || 'UNEXPECTED_ERROR', message: e.message || String(e) } });
    }
  }

  // ---------- reads ----------

  function cycleColumns() {
    return [
      'name',
      CYCLE.ENV,
      CYCLE.START,
      CYCLE.END,
      CYCLE.STATUS,
      CYCLE.OWNER,
      CYCLE.SOURCE,
      CYCLE.WORKBOOK,
      CYCLE.SCREENSHOTS,
      CYCLE.EMAIL,
      search.createColumn({ name: 'internalid', sort: search.Sort.DESC }),
    ];
  }

  function cycleFromResult(r) {
    return {
      id: Number(r.id),
      name: r.getValue('name'),
      env: r.getValue(CYCLE.ENV),
      start: isoDate(r.getValue(CYCLE.START)),
      end: isoDate(r.getValue(CYCLE.END)),
      status: r.getValue(CYCLE.STATUS) || 'Active',
      ownerId: Number(r.getValue(CYCLE.OWNER)) || null,
      ownerName: r.getText(CYCLE.OWNER) || '',
      sourceFile: r.getValue(CYCLE.SOURCE),
      hasWorkbook: !!r.getValue(CYCLE.WORKBOOK),
      screenshots: isTrue(r.getValue(CYCLE.SCREENSHOTS)),
      email: isTrue(r.getValue(CYCLE.EMAIL)),
    };
  }

  function caseCounts() {
    const counts = {};
    search
      .create({
        type: REC.CASE,
        filters: [['isinactive', 'is', 'F']],
        columns: [
          search.createColumn({ name: CASE.CYCLE, summary: search.Summary.GROUP }),
          search.createColumn({ name: 'internalid', summary: search.Summary.COUNT }),
        ],
      })
      .run()
      .each((r) => {
        counts[r.getValue({ name: CASE.CYCLE, summary: search.Summary.GROUP })] = Number(
          r.getValue({ name: 'internalid', summary: search.Summary.COUNT })
        );
        return true;
      });
    return counts;
  }

  function listCycles() {
    const counts = caseCounts();
    return lib
      .searchAll(search.create({ type: REC.CYCLE, filters: [['isinactive', 'is', 'F']], columns: cycleColumns() }))
      .map((r) => Object.assign(cycleFromResult(r), { caseCount: counts[r.id] || 0 }));
  }

  function getCycle(id) {
    const res = search
      .create({ type: REC.CYCLE, filters: [['internalid', 'anyof', String(id)]], columns: cycleColumns().concat([CYCLE.MAPPING]) })
      .run()
      .getRange({ start: 0, end: 1 });
    if (!res.length) fail('NOT_FOUND', 'UAT cycle not found.');
    return Object.assign(cycleFromResult(res[0]), { mapping: parseJson(res[0].getValue(CYCLE.MAPPING), null) });
  }

  const LIGHT_CASE_COLUMNS = [
    CASE.REF,
    CASE.ROWNUM,
    CASE.MODULE,
    CASE.SCENARIO,
    CASE.ASSIGNED,
    CASE.STATUS,
    CASE.TESTER,
    CASE.TESTER_NAME,
    CASE.EXECUTED,
    CASE.DEFECT,
    CASE.VERSION,
    CASE.CYCLE,
  ];
  const FULL_CASE_COLUMNS = LIGHT_CASE_COLUMNS.concat([
    CASE.PRECOND,
    CASE.TESTDATA,
    CASE.STEPS,
    CASE.EXPECTED,
    CASE.ACTUAL,
    CASE.EVIDENCE,
    CASE.ROW,
  ]);

  function caseFromResult(r, full) {
    const c = {
      id: Number(r.id),
      cycleId: Number(r.getValue(CASE.CYCLE)),
      ref: r.getValue(CASE.REF),
      rowNum: Number(r.getValue(CASE.ROWNUM)) || 0,
      module: r.getValue(CASE.MODULE),
      scenario: r.getValue(CASE.SCENARIO),
      assigned: r.getValue(CASE.ASSIGNED),
      status: r.getValue(CASE.STATUS) || 'Not Started',
      testerId: Number(r.getValue(CASE.TESTER)) || null,
      testerName: r.getValue(CASE.TESTER_NAME) || r.getText(CASE.TESTER) || '',
      executedOn: r.getValue(CASE.EXECUTED),
      defect: r.getValue(CASE.DEFECT),
      version: Number(r.getValue(CASE.VERSION)) || 0,
    };
    if (full) {
      c.precond = r.getValue(CASE.PRECOND);
      c.testData = r.getValue(CASE.TESTDATA);
      c.steps = r.getValue(CASE.STEPS);
      c.expected = r.getValue(CASE.EXPECTED);
      c.actual = r.getValue(CASE.ACTUAL);
      c.evidenceId = Number(r.getValue(CASE.EVIDENCE)) || null;
      c.evidenceName = c.evidenceId ? r.getText(CASE.EVIDENCE) : '';
      c.row = parseJson(r.getValue(CASE.ROW), {});
    }
    return c;
  }

  function caseSearch(filters, full) {
    const columns = (full ? FULL_CASE_COLUMNS : LIGHT_CASE_COLUMNS).map((c) =>
      c === CASE.ROWNUM ? search.createColumn({ name: CASE.ROWNUM, sort: search.Sort.ASC }) : c
    );
    return search.create({ type: REC.CASE, filters: [['isinactive', 'is', 'F'], 'AND', filters], columns });
  }

  function getCase(id) {
    const res = caseSearch(['internalid', 'anyof', String(id)], true).run().getRange({ start: 0, end: 1 });
    if (!res.length) fail('NOT_FOUND', 'Test case not found.');
    return caseFromResult(res[0], true);
  }

  const COMMENT_COLUMNS = [
    CMT.CASE,
    CMT.PARENT,
    CMT.TYPE,
    CMT.TEXT,
    CMT.AUTHOR,
    CMT.AUTHOR_NAME,
    CMT.BY_TEAM,
    CMT.POSTED,
    CMT.EDITED,
    CMT.STATUS,
    CMT.FILE,
    search.createColumn({ name: 'internalid', sort: search.Sort.ASC }),
  ];

  function commentFromResult(r) {
    return {
      id: Number(r.id),
      caseId: Number(r.getValue(CMT.CASE)),
      parentId: Number(r.getValue(CMT.PARENT)) || null,
      type: r.getValue(CMT.TYPE) || 'General',
      text: r.getValue(CMT.TEXT),
      authorId: Number(r.getValue(CMT.AUTHOR)) || null,
      authorName: r.getValue(CMT.AUTHOR_NAME) || r.getText(CMT.AUTHOR) || '',
      byTeam: isTrue(r.getValue(CMT.BY_TEAM)),
      postedOn: r.getValue(CMT.POSTED),
      editedOn: r.getValue(CMT.EDITED),
      statusAtTime: r.getValue(CMT.STATUS),
      fileId: Number(r.getValue(CMT.FILE)) || null,
      fileName: r.getValue(CMT.FILE) ? r.getText(CMT.FILE) : '',
      editable: false,
    };
  }

  /** Comments of one case, with an `editable` flag for the signed-in user's recent comments. */
  function caseComments(caseId, user) {
    const results = lib.searchAll(
      search.create({ type: REC.COMMENT, filters: [[CMT.CASE, 'anyof', String(caseId)], 'AND', ['isinactive', 'is', 'F']], columns: COMMENT_COLUMNS })
    );
    const comments = results.map((r) => commentFromResult(r));
    // Only the user's own comments can be editable; read their exact posted time from the record.
    comments.forEach((c) => {
      if (c.authorId !== user.id) return;
      const posted = record.load({ type: REC.COMMENT, id: c.id }).getValue(CMT.POSTED);
      c.editable = posted instanceof Date && Date.now() - posted.getTime() < EDIT_WINDOW_MS;
      if (c.editable) c.editableUntil = posted.getTime() + EDIT_WINDOW_MS;
    });
    return comments;
  }

  function cycleCommentResults(cycleId, columns) {
    return lib.searchAll(
      search.create({
        type: REC.COMMENT,
        filters: [[`${CMT.CASE}.${CASE.CYCLE}`, 'anyof', String(cycleId)], 'AND', ['isinactive', 'is', 'F']],
        columns,
      })
    );
  }

  /** Comment count and "unanswered client comment" flag per case. */
  function commentStats(cycleId) {
    const rows = cycleCommentResults(cycleId, [CMT.CASE, CMT.PARENT, CMT.BY_TEAM]).map((r) => ({
      id: Number(r.id),
      caseId: Number(r.getValue(CMT.CASE)),
      parentId: Number(r.getValue(CMT.PARENT)) || null,
      byTeam: isTrue(r.getValue(CMT.BY_TEAM)),
    }));
    const teamReplied = {};
    rows.forEach((r) => {
      if (r.parentId && r.byTeam) teamReplied[r.parentId] = true;
    });
    const stats = {};
    rows.forEach((r) => {
      const s = stats[r.caseId] || (stats[r.caseId] = { count: 0, unanswered: false });
      s.count += 1;
      if (!r.parentId && !r.byTeam && !teamReplied[r.id]) s.unanswered = true;
    });
    return stats;
  }

  function listCases(cycleId) {
    const stats = commentStats(cycleId);
    return lib.searchAll(caseSearch([CASE.CYCLE, 'anyof', String(cycleId)], false)).map((r) => {
      const c = caseFromResult(r, false);
      const s = stats[c.id] || { count: 0, unanswered: false };
      c.commentCount = s.count;
      c.unanswered = s.unanswered;
      return c;
    });
  }

  function loadFileAsBase64(fileId, allowedFolders) {
    const f = file.load({ id: fileId });
    if (allowedFolders.indexOf(Number(f.folder)) < 0) fail('FORBIDDEN', 'This file is not part of the UAT portal.');
    const ext = (f.name.split('.').pop() || '').toLowerCase();
    return { id: Number(f.id), name: f.name, mime: MIME[ext] || 'application/octet-stream', base64: f.getContents() };
  }

  function readTemplates(fld) {
    const res = search
      .create({ type: 'file', filters: [['name', 'is', TEMPLATES_FILE], 'AND', ['folder', 'anyof', String(fld.workbooks)]], columns: ['internalid'] })
      .run()
      .getRange({ start: 0, end: 1 });
    if (!res.length) return { fileId: null, templates: [] };
    return { fileId: Number(res[0].id), templates: parseJson(file.load({ id: res[0].id }).getContents(), []) };
  }

  const GET = {
    bootstrap() {
      const user = me();
      return {
        user,
        accountDefaults: { screenshots: isTrue(param(PARAM.SCREENSHOTS)), email: isTrue(param(PARAM.EMAIL)) },
        cycles: listCycles(),
        caseStatuses: lib.CASE_STATUSES,
        cycleStatuses: lib.CYCLE_STATUSES,
        commentTypes: lib.COMMENT_TYPES,
        limits: { imageBytes: MAX_IMAGE_BYTES, workbookBytes: MAX_WORKBOOK_BYTES, editWindowMs: EDIT_WINDOW_MS },
      };
    },
    cycles() {
      return listCycles();
    },
    cycle(p) {
      return getCycle(p.id);
    },
    cases(p) {
      return listCases(p.cycleId);
    },
    case(p) {
      const user = me();
      const c = getCase(p.id);
      return { case: c, comments: caseComments(c.id, user), cycle: getCycle(c.cycleId) };
    },
    exportCases(p) {
      const paged = caseSearch([CASE.CYCLE, 'anyof', String(p.cycleId)], true).runPaged({ pageSize: EXPORT_PAGE_SIZE });
      const page = Number(p.page) || 0;
      const range = paged.pageRanges[page];
      const cases = range ? paged.fetch({ index: range.index }).data.map((r) => caseFromResult(r, true)) : [];
      return { page, pageCount: paged.pageRanges.length, total: paged.count, cases };
    },
    exportComments(p) {
      return cycleCommentResults(p.cycleId, COMMENT_COLUMNS).map((r) => commentFromResult(r));
    },
    workbook(p) {
      const cyc = record.load({ type: REC.CYCLE, id: p.cycleId });
      const fileId = cyc.getValue(CYCLE.WORKBOOK);
      if (!fileId) return null;
      return loadFileAsBase64(fileId, [folders().workbooks]);
    },
    file(p) {
      const fld = folders();
      return loadFileAsBase64(p.id, [fld.evidence]);
    },
    templates() {
      return readTemplates(folders()).templates;
    },
  };

  // ---------- writes ----------

  function portalLink(cycleId, caseId) {
    try {
      const path = url.resolveScript({ scriptId: 'customscript_f3u_uat_portal_sl', deploymentId: 'customdeploy_f3u_uat_portal_sl' });
      const domain = url.resolveDomain({ hostType: url.HostType.APPLICATION });
      return `https://${domain}${path}#cycle=${cycleId}&case=${caseId}`;
    } catch (e) {
      return '';
    }
  }

  /** Sends an alert to the case's tester and the cycle owner, if email is switched on for the cycle. */
  function notify(user, cycle, caseRec, subject, lines) {
    if (!cycle.email) return;
    const recipients = [Number(caseRec.getValue(CASE.TESTER)) || null, cycle.ownerId].filter(
      (id, i, all) => id && id !== user.id && all.indexOf(id) === i
    );
    if (!recipients.length) return;
    const link = portalLink(cycle.id, caseRec.id);
    try {
      email.send({
        author: user.id,
        recipients,
        subject: `[UAT] ${subject}`,
        body: lines.concat(['', link ? `Open in the UAT portal: ${link}` : '']).join('\n'),
      });
    } catch (e) {
      log.error({ title: 'UAT email alert not sent', details: e });
    }
  }

  function saveImage(name, base64, fld, prefix) {
    const ext = (String(name).split('.').pop() || '').toLowerCase();
    const type = IMAGE_TYPES[ext];
    if (!type) fail('BAD_FILE', 'Only PNG, JPG and GIF screenshots can be attached.');
    if (base64Bytes(base64) > MAX_IMAGE_BYTES) fail('BAD_FILE', 'Screenshots must be 5 MB or smaller.');
    const f = file.create({
      name: `${prefix}-${Date.now()}-${safeName(name)}`,
      fileType: type,
      contents: base64,
      folder: fld.evidence,
    });
    return Number(f.save());
  }

  function setTester(rec, user) {
    try {
      rec.setValue({ fieldId: CASE.TESTER, value: user.id });
    } catch (e) {
      log.audit({ title: 'Tester is not an employee record', details: user.id });
    }
    rec.setValue({ fieldId: CASE.TESTER_NAME, value: str(user.name, 300) });
    rec.setValue({ fieldId: CASE.EXECUTED, value: new Date() });
  }

  function loadCaseForSave(id, version) {
    const rec = record.load({ type: REC.CASE, id });
    const current = Number(rec.getValue(CASE.VERSION)) || 0;
    if (version !== undefined && version !== null && Number(version) !== current) {
      fail('CONFLICT', 'Someone else saved this case after you opened it. Reload to see their changes.', { version: current });
    }
    return rec;
  }

  function createComment(user, caseRec, input, cycle) {
    const text = str(input.text).trim();
    if (!text) fail('INVALID', 'Comment text is required.');
    const type = input.type || 'General';
    if (lib.COMMENT_TYPES.indexOf(type) < 0) fail('INVALID', `Unknown comment type: ${type}`);

    let parentId = Number(input.parentId) || null;
    if (parentId) {
      const parent = search.lookupFields({ type: REC.COMMENT, id: parentId, columns: [CMT.CASE, CMT.PARENT] });
      const parentCase = parent[CMT.CASE] && parent[CMT.CASE][0] && Number(parent[CMT.CASE][0].value);
      if (parentCase !== Number(caseRec.id)) fail('INVALID', 'Replies must be on the same test case.');
      // One reply level: a reply to a reply joins the top-level thread.
      const grand = parent[CMT.PARENT] && parent[CMT.PARENT][0] && Number(parent[CMT.PARENT][0].value);
      if (grand) parentId = grand;
    }

    let fileId = null;
    if (input.attachment && input.attachment.base64) {
      if (!cycle.screenshots) fail('FEATURE_OFF', 'Screenshots are switched off for this cycle.');
      fileId = saveImage(input.attachment.name, input.attachment.base64, folders(), safeName(caseRec.getValue(CASE.REF)));
    }

    const c = record.create({ type: REC.COMMENT });
    c.setValue({ fieldId: CMT.CASE, value: caseRec.id });
    if (parentId) c.setValue({ fieldId: CMT.PARENT, value: parentId });
    c.setValue({ fieldId: CMT.TYPE, value: type });
    c.setValue({ fieldId: CMT.TEXT, value: text });
    try {
      c.setValue({ fieldId: CMT.AUTHOR, value: user.id });
    } catch (e) {
      log.audit({ title: 'Author is not an employee record', details: user.id });
    }
    c.setValue({ fieldId: CMT.AUTHOR_NAME, value: str(user.name, 300) });
    c.setValue({ fieldId: CMT.BY_TEAM, value: user.level === 'team' });
    c.setValue({ fieldId: CMT.POSTED, value: new Date() });
    c.setValue({ fieldId: CMT.STATUS, value: caseRec.getValue(CASE.STATUS) || 'Not Started' });
    if (fileId) c.setValue({ fieldId: CMT.FILE, value: fileId });
    return Number(c.save());
  }

  function caseResponse(caseId, user) {
    const c = getCase(caseId);
    return { case: c, comments: caseComments(caseId, user), cycle: getCycle(c.cycleId) };
  }

  const STRING_FIELDS = {
    module: [CASE.MODULE, 300],
    scenario: [CASE.SCENARIO, 3900],
    precond: [CASE.PRECOND],
    testData: [CASE.TESTDATA],
    steps: [CASE.STEPS],
    expected: [CASE.EXPECTED],
    assigned: [CASE.ASSIGNED, 300],
  };

  function normaliseStatus(s) {
    return lib.CASE_STATUSES.indexOf(s) >= 0 ? s : 'Not Started';
  }

  function importRow(cycleId, row, existingId) {
    if (existingId) {
      const rec = record.load({ type: REC.CASE, id: existingId });
      Object.keys(STRING_FIELDS).forEach((k) => {
        const [fieldId, max] = STRING_FIELDS[k];
        rec.setValue({ fieldId, value: str(row[k], max) });
      });
      rec.setValue({ fieldId: CASE.ROWNUM, value: Number(row.rowNum) || 0 });
      rec.setValue({ fieldId: CASE.ROW, value: JSON.stringify(row.row || {}) });
      // Results recorded in the portal win; the workbook only fills cases nobody has executed yet.
      const current = rec.getValue(CASE.STATUS) || 'Not Started';
      if (current === 'Not Started' && row.status && normaliseStatus(row.status) !== 'Not Started') {
        rec.setValue({ fieldId: CASE.STATUS, value: normaliseStatus(row.status) });
        if (row.actual) rec.setValue({ fieldId: CASE.ACTUAL, value: str(row.actual) });
        if (row.defect) rec.setValue({ fieldId: CASE.DEFECT, value: str(row.defect, 300) });
      }
      rec.setValue({ fieldId: CASE.VERSION, value: (Number(rec.getValue(CASE.VERSION)) || 0) + 1 });
      rec.save();
      return 'updated';
    }
    const rec = record.create({ type: REC.CASE });
    rec.setValue({ fieldId: 'name', value: str(row.ref, 300) });
    rec.setValue({ fieldId: CASE.CYCLE, value: cycleId });
    rec.setValue({ fieldId: CASE.REF, value: str(row.ref, 300) });
    Object.keys(STRING_FIELDS).forEach((k) => {
      const [fieldId, max] = STRING_FIELDS[k];
      rec.setValue({ fieldId, value: str(row[k], max) });
    });
    rec.setValue({ fieldId: CASE.ROWNUM, value: Number(row.rowNum) || 0 });
    rec.setValue({ fieldId: CASE.STATUS, value: normaliseStatus(row.status) });
    rec.setValue({ fieldId: CASE.ACTUAL, value: str(row.actual) });
    rec.setValue({ fieldId: CASE.DEFECT, value: str(row.defect, 300) });
    rec.setValue({ fieldId: CASE.ROW, value: JSON.stringify(row.row || {}) });
    rec.setValue({ fieldId: CASE.VERSION, value: 1 });
    rec.save();
    return 'created';
  }

  function existingCaseIds(cycleId, refs) {
    if (!refs.length) return {};
    const refFilter = [];
    refs.forEach((ref, i) => {
      if (i) refFilter.push('OR');
      refFilter.push([CASE.REF, 'is', ref]);
    });
    const out = {};
    lib
      .searchAll(
        search.create({
          type: REC.CASE,
          filters: [[CASE.CYCLE, 'anyof', String(cycleId)], 'AND', ['isinactive', 'is', 'F'], 'AND', refFilter],
          columns: [CASE.REF],
        })
      )
      .forEach((r) => {
        out[r.getValue(CASE.REF)] = Number(r.id);
      });
    return out;
  }

  function setCycleFields(rec, p) {
    if (p.name !== undefined) rec.setValue({ fieldId: 'name', value: str(p.name, 300) || 'UAT Cycle' });
    if (p.env !== undefined) rec.setValue({ fieldId: CYCLE.ENV, value: str(p.env, 300) });
    ['start', 'end'].forEach((k) => {
      if (p[k] === undefined) return;
      const d = toDate(p[k]);
      if (p[k] && !d) fail('INVALID', `${k === 'start' ? 'Start' : 'End'} date must be YYYY-MM-DD.`);
      rec.setValue({ fieldId: k === 'start' ? CYCLE.START : CYCLE.END, value: d });
    });
    if (p.status !== undefined) {
      if (lib.CYCLE_STATUSES.indexOf(p.status) < 0) fail('INVALID', `Unknown cycle status: ${p.status}`);
      rec.setValue({ fieldId: CYCLE.STATUS, value: p.status });
    }
    if (p.sourceFile !== undefined) rec.setValue({ fieldId: CYCLE.SOURCE, value: str(p.sourceFile, 300) });
    if (p.mapping !== undefined) rec.setValue({ fieldId: CYCLE.MAPPING, value: JSON.stringify(p.mapping) });
    if (p.screenshots !== undefined) rec.setValue({ fieldId: CYCLE.SCREENSHOTS, value: !!p.screenshots });
    if (p.email !== undefined) rec.setValue({ fieldId: CYCLE.EMAIL, value: !!p.email });
    if (p.ownerId !== undefined) rec.setValue({ fieldId: CYCLE.OWNER, value: p.ownerId || null });
  }

  const POST = {
    saveCase(p) {
      const user = me();
      const status = p.status;
      if (lib.CASE_STATUSES.indexOf(status) < 0) fail('INVALID', `Unknown status: ${status}`);
      const rec = loadCaseForSave(p.id, p.version);
      const before = rec.getValue(CASE.STATUS) || 'Not Started';
      const actual = str(p.actual);
      const reason = str(p.reason).trim();
      const needsReason = (status === 'Fail' || status === 'Blocked') && status !== before;
      if ((status === 'Fail' || status === 'Blocked') && !actual.trim()) fail('INVALID', `${status} needs an Actual Result.`);
      if (needsReason && !reason) fail('INVALID', `${status} needs a reason.`);

      const actualChanged = actual !== str(rec.getValue(CASE.ACTUAL));
      rec.setValue({ fieldId: CASE.STATUS, value: status });
      rec.setValue({ fieldId: CASE.ACTUAL, value: actual });
      rec.setValue({ fieldId: CASE.DEFECT, value: str(p.defect, 300) });
      if (status !== 'Not Started' && (status !== before || actualChanged)) setTester(rec, user);
      rec.setValue({ fieldId: CASE.VERSION, value: (Number(rec.getValue(CASE.VERSION)) || 0) + 1 });
      rec.save();

      const cycle = getCycle(rec.getValue(CASE.CYCLE));
      if (reason) createComment(user, rec, { text: reason, type: 'Fail Reason' }, cycle);
      if (needsReason) {
        notify(user, cycle, rec, `${rec.getValue(CASE.REF)} set to ${status}`, [
          `${user.name} set test case ${rec.getValue(CASE.REF)} to ${status}.`,
          `Cycle: ${cycle.name}`,
          '',
          `Reason: ${reason}`,
          `Actual result: ${actual}`,
        ]);
      }
      return caseResponse(rec.id, user);
    },

    uploadEvidence(p) {
      const user = me();
      const rec = loadCaseForSave(p.caseId, p.version);
      const cycle = getCycle(rec.getValue(CASE.CYCLE));
      if (!cycle.screenshots) fail('FEATURE_OFF', 'Screenshots are switched off for this cycle.');
      const fileId = saveImage(p.name, p.base64, folders(), safeName(rec.getValue(CASE.REF)));
      rec.setValue({ fieldId: CASE.EVIDENCE, value: fileId });
      rec.setValue({ fieldId: CASE.VERSION, value: (Number(rec.getValue(CASE.VERSION)) || 0) + 1 });
      rec.save();
      return caseResponse(rec.id, user);
    },

    addComment(p) {
      const user = me();
      const caseRec = record.load({ type: REC.CASE, id: p.caseId });
      const cycle = getCycle(caseRec.getValue(CASE.CYCLE));
      createComment(user, caseRec, p, cycle);
      notify(user, cycle, caseRec, `New comment on ${caseRec.getValue(CASE.REF)}`, [
        `${user.name} commented on test case ${caseRec.getValue(CASE.REF)} (${p.type || 'General'}):`,
        `Cycle: ${cycle.name}`,
        '',
        str(p.text),
      ]);
      return { comments: caseComments(caseRec.id, user) };
    },

    editComment(p) {
      const user = me();
      const rec = record.load({ type: REC.COMMENT, id: p.id });
      if (Number(rec.getValue(CMT.AUTHOR)) !== user.id) fail('FORBIDDEN', 'You can only edit your own comments.');
      const posted = rec.getValue(CMT.POSTED);
      if (!(posted instanceof Date) || Date.now() - posted.getTime() > EDIT_WINDOW_MS) {
        fail('FORBIDDEN', 'Comments can only be edited for 15 minutes after posting.');
      }
      const text = str(p.text).trim();
      if (!text) fail('INVALID', 'Comment text is required.');
      rec.setValue({ fieldId: CMT.TEXT, value: text });
      rec.setValue({ fieldId: CMT.EDITED, value: new Date() });
      rec.save();
      return { comments: caseComments(rec.getValue(CMT.CASE), user) };
    },

    createCycle(p) {
      const user = me();
      requireTeam(user);
      folders();
      const rec = record.create({ type: REC.CYCLE });
      setCycleFields(rec, Object.assign({ status: 'Active' }, p, { ownerId: user.id }));
      rec.setValue({ fieldId: CYCLE.SCREENSHOTS, value: isTrue(param(PARAM.SCREENSHOTS)) });
      rec.setValue({ fieldId: CYCLE.EMAIL, value: isTrue(param(PARAM.EMAIL)) });
      return getCycle(rec.save());
    },

    updateCycle(p) {
      requireTeam(me());
      const rec = record.load({ type: REC.CYCLE, id: p.id });
      const fields = Object.assign({}, p);
      delete fields.id;
      setCycleFields(rec, fields);
      rec.save();
      return getCycle(p.id);
    },

    uploadWorkbook(p) {
      requireTeam(me());
      if (!/\.xlsx$/i.test(String(p.name))) fail('BAD_FILE', 'Only .xlsx workbooks can be stored.');
      if (base64Bytes(p.base64) > MAX_WORKBOOK_BYTES) fail('BAD_FILE', 'The workbook is larger than 9 MB.');
      const fileId = Number(
        file
          .create({ name: `cycle-${p.cycleId}-${Date.now()}-${safeName(p.name)}`, fileType: file.Type.EXCEL, contents: p.base64, folder: folders().workbooks })
          .save()
      );
      record.submitFields({ type: REC.CYCLE, id: p.cycleId, values: { [CYCLE.WORKBOOK]: fileId, [CYCLE.SOURCE]: str(p.name, 300) } });
      return getCycle(p.cycleId);
    },

    /**
     * Creates or updates cases by Case ID within the cycle. Stops early when governance runs low;
     * `processed` tells the caller how many rows were handled so it can send the rest.
     */
    importBatch(p) {
      requireTeam(me());
      const rows = Array.isArray(p.rows) ? p.rows : [];
      if (rows.length > 100) fail('INVALID', 'Send at most 100 rows per batch.');
      const script = runtime.getCurrentScript();
      const existing = existingCaseIds(
        p.cycleId,
        rows.map((r) => str(r.ref, 300)).filter(Boolean)
      );
      const result = { processed: 0, created: 0, updated: 0 };
      for (let i = 0; i < rows.length; i++) {
        if (script.getRemainingUsage() < MIN_UNITS_PER_ROW) break;
        const ref = str(rows[i].ref, 300);
        if (!ref) fail('INVALID', `Row ${rows[i].rowNum || i + 1} has no Case ID.`);
        const outcome = importRow(p.cycleId, rows[i], existing[ref]);
        result[outcome] += 1;
        result.processed += 1;
      }
      return result;
    },

    saveTemplate(p) {
      requireTeam(me());
      const name = str(p.name, 100).trim();
      if (!name) fail('INVALID', 'Template name is required.');
      const fld = folders();
      const current = readTemplates(fld);
      const templates = current.templates.filter((t) => t.name !== name);
      templates.push({ name, mapping: p.mapping });
      file.create({ name: TEMPLATES_FILE, fileType: file.Type.JSON, contents: JSON.stringify(templates), folder: fld.workbooks }).save();
      return templates;
    },
  };

  return {
    get(params) {
      const handler = GET[params && params.action];
      return run(handler || (() => fail('UNKNOWN_ACTION', `Unknown GET action: ${params && params.action}`)), params);
    },
    post(body) {
      const input = typeof body === 'string' ? parseJson(body, {}) : body;
      const handler = POST[input && input.action];
      return run(handler || (() => fail('UNKNOWN_ACTION', `Unknown POST action: ${input && input.action}`)), input);
    },
  };
});
