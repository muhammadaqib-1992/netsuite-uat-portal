/**
 * Nightly backup: writes a CSV snapshot of every Active UAT cycle (cases and comments)
 * to the "Backups" folder, so results survive a sandbox refresh.
 * Reschedules itself when governance runs low.
 *
 * @NApiVersion 2.1
 * @NScriptType ScheduledScript
 * @NModuleScope SameAccount
 */
define(['N/search', 'N/file', 'N/runtime', 'N/task', 'N/log', './f3u_uat_lib'], (search, file, runtime, task, log, lib) => {
  const { REC, CYCLE, CASE, CMT } = lib;
  const MIN_UNITS = 1000;

  function csvCell(v) {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }

  function toCsv(header, rows) {
    return [header].concat(rows).map((r) => r.map(csvCell).join(',')).join('\r\n');
  }

  function today() {
    const d = new Date();
    const p = (n) => (n < 10 ? '0' : '') + n;
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  }

  function safe(name) {
    return String(name || '').replace(/[^\w.\- ]+/g, '_').slice(0, 80);
  }

  function backupCycle(cycle, folderId) {
    const cases = lib.searchAll(
      search.create({
        type: REC.CASE,
        filters: [[CASE.CYCLE, 'anyof', String(cycle.id)], 'AND', ['isinactive', 'is', 'F']],
        columns: [
          search.createColumn({ name: CASE.ROWNUM, sort: search.Sort.ASC }),
          CASE.REF,
          CASE.MODULE,
          CASE.SCENARIO,
          CASE.ASSIGNED,
          CASE.STATUS,
          CASE.ACTUAL,
          CASE.TESTER_NAME,
          CASE.EXECUTED,
          CASE.DEFECT,
        ],
      })
    ).map((r) => [
      r.getValue(CASE.REF),
      r.getValue(CASE.MODULE),
      r.getValue(CASE.SCENARIO),
      r.getValue(CASE.ASSIGNED),
      r.getValue(CASE.STATUS) || 'Not Started',
      r.getValue(CASE.ACTUAL),
      r.getValue(CASE.TESTER_NAME),
      r.getValue(CASE.EXECUTED),
      r.getValue(CASE.DEFECT),
    ]);

    const comments = lib.searchAll(
      search.create({
        type: REC.COMMENT,
        filters: [[`${CMT.CASE}.${CASE.CYCLE}`, 'anyof', String(cycle.id)], 'AND', ['isinactive', 'is', 'F']],
        columns: [
          search.createColumn({ name: 'internalid', sort: search.Sort.ASC }),
          search.createColumn({ name: CASE.REF, join: CMT.CASE }),
          CMT.PARENT,
          CMT.AUTHOR_NAME,
          CMT.POSTED,
          CMT.TYPE,
          CMT.TEXT,
          CMT.FILE,
        ],
      })
    ).map((r) => [
      r.getValue({ name: CASE.REF, join: CMT.CASE }),
      r.id,
      r.getValue(CMT.PARENT),
      r.getValue(CMT.AUTHOR_NAME),
      r.getValue(CMT.POSTED),
      r.getValue(CMT.TYPE),
      r.getValue(CMT.TEXT),
      r.getValue(CMT.FILE) ? r.getText(CMT.FILE) : '',
    ]);

    const prefix = `cycle-${cycle.id}-${safe(cycle.name)}-${today()}`;
    file
      .create({
        name: `${prefix}-cases.csv`,
        fileType: file.Type.CSV,
        folder: folderId,
        contents: toCsv(['Case ID', 'Module', 'Scenario', 'Assigned To', 'Status', 'Actual Result', 'Tester', 'Executed On', 'Defect Ref'], cases),
      })
      .save();
    file
      .create({
        name: `${prefix}-comments.csv`,
        fileType: file.Type.CSV,
        folder: folderId,
        contents: toCsv(['Case ID', 'Comment ID', 'Reply To', 'Author', 'Date', 'Type', 'Comment', 'Attachment'], comments),
      })
      .save();
  }

  function execute() {
    const script = runtime.getCurrentScript();
    const after = Number(script.getParameter({ name: 'custscript_f3u_uat_bk_after' })) || 0;
    const folders = lib.dataFolders(script.getParameter({ name: 'custscript_f3u_uat_bk_data_folder' }));

    const cycles = lib
      .searchAll(
        search.create({
          type: REC.CYCLE,
          filters: [[CYCLE.STATUS, 'is', 'Active'], 'AND', ['isinactive', 'is', 'F'], 'AND', ['internalidnumber', 'greaterthan', after]],
          columns: [search.createColumn({ name: 'internalid', sort: search.Sort.ASC }), 'name'],
        })
      )
      .map((r) => ({ id: Number(r.id), name: r.getValue('name') }));

    for (let i = 0; i < cycles.length; i++) {
      if (script.getRemainingUsage() < MIN_UNITS) {
        const prev = i ? cycles[i - 1].id : after;
        task
          .create({
            taskType: task.TaskType.SCHEDULED_SCRIPT,
            scriptId: script.id,
            deploymentId: script.deploymentId,
            params: { custscript_f3u_uat_bk_after: prev },
          })
          .submit();
        log.audit({ title: 'UAT backup rescheduled', details: `Continuing after cycle ${prev}` });
        return;
      }
      backupCycle(cycles[i], folders.backups);
    }
    log.audit({ title: 'UAT backup complete', details: `${cycles.length} active cycle(s)` });
  }

  return { execute };
});
