/**
 * Shared constants and helpers for the UAT portal scripts.
 *
 * @NApiVersion 2.1
 * @NModuleScope SameAccount
 */
define(['N/search', 'N/record', 'N/runtime'], (search, record, runtime) => {
  const REC = {
    CYCLE: 'customrecord_f3u_uat_cycle',
    CASE: 'customrecord_f3u_uat_case',
    COMMENT: 'customrecord_f3u_uat_comment',
  };

  const CYCLE = {
    ENV: 'custrecord_f3u_uat_cycle_env',
    START: 'custrecord_f3u_uat_cycle_start',
    END: 'custrecord_f3u_uat_cycle_end',
    STATUS: 'custrecord_f3u_uat_cycle_status',
    OWNER: 'custrecord_f3u_uat_cycle_owner',
    SOURCE: 'custrecord_f3u_uat_cycle_source',
    WORKBOOK: 'custrecord_f3u_uat_cycle_workbook',
    MAPPING: 'custrecord_f3u_uat_cycle_mapping',
    SCREENSHOTS: 'custrecord_f3u_uat_cycle_screenshots',
    EMAIL: 'custrecord_f3u_uat_cycle_email',
  };

  const CASE = {
    CYCLE: 'custrecord_f3u_uat_case_cycle',
    REF: 'custrecord_f3u_uat_case_ref',
    ROWNUM: 'custrecord_f3u_uat_case_rownum',
    MODULE: 'custrecord_f3u_uat_case_module',
    SCENARIO: 'custrecord_f3u_uat_case_scenario',
    PRECOND: 'custrecord_f3u_uat_case_precond',
    TESTDATA: 'custrecord_f3u_uat_case_testdata',
    STEPS: 'custrecord_f3u_uat_case_steps',
    EXPECTED: 'custrecord_f3u_uat_case_expected',
    ASSIGNED: 'custrecord_f3u_uat_case_assigned',
    STATUS: 'custrecord_f3u_uat_case_status',
    ACTUAL: 'custrecord_f3u_uat_case_actual',
    TESTER: 'custrecord_f3u_uat_case_tester',
    TESTER_NAME: 'custrecord_f3u_uat_case_tester_name',
    EXECUTED: 'custrecord_f3u_uat_case_executed',
    DEFECT: 'custrecord_f3u_uat_case_defect',
    EVIDENCE: 'custrecord_f3u_uat_case_evidence',
    ROW: 'custrecord_f3u_uat_case_row',
    VERSION: 'custrecord_f3u_uat_case_version',
  };

  const CMT = {
    CASE: 'custrecord_f3u_uat_cmt_case',
    PARENT: 'custrecord_f3u_uat_cmt_parent',
    TYPE: 'custrecord_f3u_uat_cmt_type',
    TEXT: 'custrecord_f3u_uat_cmt_text',
    AUTHOR: 'custrecord_f3u_uat_cmt_author',
    AUTHOR_NAME: 'custrecord_f3u_uat_cmt_author_name',
    BY_TEAM: 'custrecord_f3u_uat_cmt_by_team',
    POSTED: 'custrecord_f3u_uat_cmt_posted',
    EDITED: 'custrecord_f3u_uat_cmt_edited',
    STATUS: 'custrecord_f3u_uat_cmt_status',
    FILE: 'custrecord_f3u_uat_cmt_file',
  };

  const CASE_STATUSES = ['Not Started', 'In Progress', 'Pass', 'Fail', 'Retest', 'Blocked', 'N/A'];
  const CYCLE_STATUSES = ['Planned', 'Active', 'Closed'];
  const COMMENT_TYPES = ['General', 'Clarification', 'Fail Reason', 'Retest Note', 'Resolution'];

  const DATA_FOLDER_NAME = 'F3U UAT Portal Data';
  const SUBFOLDERS = { evidence: 'Evidence', workbooks: 'Workbooks', backups: 'Backups' };

  /** Runs a search and returns every result, 1000 per page. */
  function searchAll(srch) {
    const out = [];
    const paged = srch.runPaged({ pageSize: 1000 });
    paged.pageRanges.forEach((range) => {
      paged.fetch({ index: range.index }).data.forEach((r) => out.push(r));
    });
    return out;
  }

  function findFolder(name, parentId) {
    const filters = [['name', 'is', name], 'AND', ['parent', 'anyof', parentId ? String(parentId) : '@NONE@']];
    const res = search.create({ type: 'folder', filters, columns: ['internalid'] }).run().getRange({ start: 0, end: 1 });
    return res.length ? Number(res[0].id) : null;
  }

  function ensureFolder(name, parentId) {
    const existing = findFolder(name, parentId);
    if (existing) return existing;
    const f = record.create({ type: record.Type.FOLDER });
    f.setValue({ fieldId: 'name', value: name });
    if (parentId) f.setValue({ fieldId: 'parent', value: parentId });
    return Number(f.save());
  }

  /**
   * Returns the data folder and its subfolders, creating any that are missing.
   * rootId comes from a script parameter; when blank a top-level "F3U UAT Portal Data" folder is used.
   */
  function dataFolders(rootId) {
    const root = rootId ? Number(rootId) : ensureFolder(DATA_FOLDER_NAME, null);
    const out = { root };
    Object.keys(SUBFOLDERS).forEach((k) => {
      out[k] = ensureFolder(SUBFOLDERS[k], root);
    });
    return out;
  }

  function splitList(value) {
    return String(value || '')
      .split(/[,;\s]+/)
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
  }

  /**
   * The signed-in user and their portal access level:
   * 'team' (implementation team), 'lead' (UAT lead) or 'tester'.
   * Roles are matched by role script ID against comma-separated script parameters.
   */
  function currentUser(teamRolesParam, leadRolesParam) {
    const u = runtime.getCurrentUser();
    const roleId = String(u.roleId || '').toLowerCase();
    const team = splitList(teamRolesParam);
    const leads = splitList(leadRolesParam);
    let level = 'tester';
    if (team.indexOf(roleId) >= 0) level = 'team';
    else if (leads.indexOf(roleId) >= 0) level = 'lead';
    return { id: Number(u.id), name: u.name, email: u.email, roleId, level };
  }

  return {
    REC,
    CYCLE,
    CASE,
    CMT,
    CASE_STATUSES,
    CYCLE_STATUSES,
    COMMENT_TYPES,
    searchAll,
    dataFolders,
    currentUser,
  };
});
