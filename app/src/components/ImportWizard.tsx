import { useEffect, useMemo, useState } from 'react';
import type { CaseStatus, Cycle, FieldKey, Mapping, MappingTemplate, SheetLayout } from '../types';
import {
  CASE_STATUSES,
  FIELDS,
  base64ToArrayBuffer,
  bestSheet,
  buildMapping,
  dataSheets,
  defaultStatusLabels,
  extractRows,
  readWorkbookFile,
  sameLayoutSheets,
  sheetRows,
  statusValuesInUse,
  type ParsedWorkbook,
} from '../lib/excel';
import { dropdownValues } from '../lib/export';
import { Field, errorText, useApi, useBoot, useToast } from './ui';
import { UploadIcon } from './icons';

const BATCH_SIZE = 50;

interface Props {
  cycles: Cycle[];
  onDone: (cycleId: number) => void;
}

export function ImportWizard({ cycles, onDone }: Props) {
  const api = useApi();
  const boot = useBoot();
  const toast = useToast();
  const [parsed, setParsed] = useState<ParsedWorkbook | null>(null);
  const [mapping, setMapping] = useState<Mapping | null>(null);
  /** Every sheet with the same columns as the first sheet; the user picks which to import. */
  const [candidates, setCandidates] = useState<SheetLayout[]>([]);
  const [dropdown, setDropdown] = useState<string[]>([]);
  const [templates, setTemplates] = useState<MappingTemplate[]>([]);
  const [templateName, setTemplateName] = useState('');
  const [target, setTarget] = useState<'new' | number>('new');
  const [cycleForm, setCycleForm] = useState({ name: '', env: '', start: '', end: '' });
  const [progress, setProgress] = useState<{ done: number; total: number; created: number; updated: number } | null>(null);
  const [running, setRunning] = useState(false);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    api.templates().then(setTemplates).catch(() => setTemplates([]));
  }, [api]);

  /** Mapping for a first sheet: its columns, every sheet sharing them, and the workbook's status words. */
  async function prepare(p: ParsedWorkbook, sheet: string, headerRow?: number, prior?: Mapping | null): Promise<Mapping> {
    const m = buildMapping(p.wb, sheet, headerRow);
    if (prior) m.fields = { ...m.fields, ...Object.fromEntries(Object.entries(prior.fields).filter(([, h]) => h && m.headers.includes(h))) };
    const same = sameLayoutSheets(p.wb, m, p.portalSheets);
    setCandidates(same);
    const keep = prior?.sheets?.length ? same.filter((s) => prior.sheets!.some((x) => x.name === s.name)) : same;
    m.sheets = keep.length ? keep : same;
    m.moduleFromSheet = prior?.moduleFromSheet ?? (!m.fields.module && m.sheets.length > 1);
    let dd: string[] = [];
    const statusCol = m.fields.status ? m.headers.indexOf(m.fields.status) : -1;
    if (statusCol >= 0) {
      try {
        dd = await dropdownValues(base64ToArrayBuffer(p.base64), m.sheets[0], statusCol);
      } catch {
        dd = [];
      }
    }
    setDropdown(dd);
    m.statusLabels = prior?.statusLabels ?? defaultStatusLabels([...dd, ...statusValuesInUse(p.wb, m)]);
    return m;
  }

  async function pick(file: File | undefined) {
    if (!file) return;
    try {
      const p = await readWorkbookFile(file);
      const sheets = dataSheets(p.wb, p.portalSheets);
      if (!sheets.length) throw new Error('The workbook has no sheets.');
      const existing = p.exportedCycleId ? cycles.find((c) => c.id === p.exportedCycleId) : undefined;
      const prior = existing ? (await api.cycle(existing.id)).mapping : null;
      const sheet = prior && sheets.includes(prior.sheetName) ? prior.sheetName : bestSheet(p.wb, p.portalSheets);
      const m = await prepare(p, sheet, prior?.sheetName === sheet ? prior.headerRow : undefined, prior);
      setParsed(p);
      setMapping(m);
      setTarget(existing ? existing.id : 'new');
      setCycleForm((f) => ({ ...f, name: f.name || file.name.replace(/\.xlsx$/i, '') }));
      setProgress(null);
      if (existing) toast(`This workbook was exported from "${existing.name}". Importing will update that cycle.`);
    } catch (e) {
      toast(`Could not read the workbook: ${errorText(e)}`, 'error');
    }
  }

  async function changeFirstSheet(sheet: string, headerRow?: number) {
    if (!parsed) return;
    setMapping(await prepare(parsed, sheet, headerRow));
  }

  const result = useMemo(() => (parsed && mapping ? extractRows(parsed.wb, mapping) : null), [parsed, mapping]);
  const errors = result?.issues.filter((i) => i.level === 'error') ?? [];
  const warnings = result?.issues.filter((i) => i.level === 'warning') ?? [];
  const tooBig = parsed ? (parsed.base64.length * 3) / 4 > boot.limits.workbookBytes : false;
  const selectedNames = new Set(mapping?.sheets?.map((s) => s.name));
  const multi = (mapping?.sheets?.length ?? 1) > 1;
  const otherSheets = parsed ? dataSheets(parsed.wb, parsed.portalSheets).filter((n) => !candidates.some((c) => c.name === n)) : [];
  const statusChoices = useMemo(() => {
    if (!parsed || !mapping) return [];
    return [...new Set([...dropdown, ...statusValuesInUse(parsed.wb, mapping), ...CASE_STATUSES])];
  }, [parsed, mapping, dropdown]);

  function update(patch: Partial<Mapping>) {
    if (mapping) setMapping({ ...mapping, ...patch });
  }

  function setField(key: FieldKey, header: string) {
    if (!mapping) return;
    const fields = { ...mapping.fields };
    if (header) fields[key] = header;
    else delete fields[key];
    update({ fields });
  }

  function toggleSheet(name: string, on: boolean) {
    if (!mapping) return;
    const next = candidates.filter((c) => (c.name === name ? on : selectedNames.has(c.name)));
    if (!next.length) return;
    update({ sheets: next });
  }

  function setLabel(status: CaseStatus, label: string) {
    if (!mapping) return;
    update({ statusLabels: { ...mapping.statusLabels, [status]: label } });
  }

  function applyTemplate(name: string) {
    const t = templates.find((x) => x.name === name);
    if (!t || !mapping) return;
    const fields = Object.fromEntries(Object.entries(t.mapping.fields).filter(([, h]) => h && mapping.headers.includes(h)));
    update({
      fields,
      statusLabels: t.mapping.statusLabels ?? mapping.statusLabels,
      moduleFromSheet: t.mapping.moduleFromSheet ?? mapping.moduleFromSheet,
    });
    toast(`Applied template "${name}"`);
  }

  async function saveTemplate() {
    if (!mapping || !templateName.trim()) return;
    try {
      setTemplates(
        await api.saveTemplate({
          name: templateName.trim(),
          mapping: { fields: mapping.fields, statusLabels: mapping.statusLabels, moduleFromSheet: mapping.moduleFromSheet },
        })
      );
      toast(`Template "${templateName.trim()}" saved`);
      setTemplateName('');
    } catch (e) {
      toast(errorText(e), 'error');
    }
  }

  async function runImport() {
    if (!parsed || !mapping || !result || errors.length) return;
    setRunning(true);
    try {
      let cycle: Cycle;
      if (target === 'new') {
        cycle = await api.createCycle({ ...cycleForm, name: cycleForm.name || parsed.fileName, sourceFile: parsed.fileName, mapping });
      } else {
        cycle = await api.updateCycle({ id: target, mapping, sourceFile: parsed.fileName });
      }
      if (!tooBig) await api.uploadWorkbook({ cycleId: cycle.id, name: parsed.fileName, base64: parsed.base64 });

      const rows = result.rows;
      const p = { done: 0, total: rows.length, created: 0, updated: 0 };
      setProgress({ ...p });
      while (p.done < rows.length) {
        const batch = rows.slice(p.done, p.done + BATCH_SIZE);
        const r = await api.importBatch({ cycleId: cycle.id, rows: batch });
        if (!r.processed) throw new Error('The server could not process any rows in this batch.');
        p.done += r.processed;
        p.created += r.created;
        p.updated += r.updated;
        setProgress({ ...p });
      }
      toast(`Imported ${p.total} cases: ${p.created} new, ${p.updated} updated.`);
      onDone(cycle.id);
    } catch (e) {
      toast(`Import stopped: ${errorText(e)}. Rows already saved are kept; run the import again to finish.`, 'error');
    } finally {
      setRunning(false);
    }
  }

  const allSheets = parsed ? dataSheets(parsed.wb, parsed.portalSheets) : [];
  const preview = parsed && mapping ? sheetRows(parsed.wb, mapping.sheetName).slice(0, 20) : [];

  return (
    <div className="import">
      <section className="card">
        <h3 className="step-title">
          <span className="step">1</span>Choose a workbook
        </h3>
        <label
          className={`dropzone ${dragging ? 'over' : ''} ${running ? 'disabled' : ''}`}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            if (!running) pick(e.dataTransfer.files[0]);
          }}
        >
          <UploadIcon size={22} />
          <span>
            <b>{parsed ? 'Choose a different workbook' : 'Drop a .xlsx workbook here'}</b> or click to browse
          </span>
          <input id="import-file" type="file" accept=".xlsx" onChange={(e) => pick(e.target.files?.[0])} disabled={running} />
        </label>
        {parsed && (
          <p className="muted small">
            {parsed.fileName} · {parsed.wb.SheetNames.length} sheet(s)
            {tooBig && ' · larger than 9 MB, so the original file will not be stored; export will rebuild the layout from the saved rows.'}
          </p>
        )}
      </section>

      {parsed && mapping && (
        <section className="card">
          <h3 className="step-title">
            <span className="step">2</span>Choose sheets
          </h3>
          <div className="row wrap">
            <Field label="Layout from sheet">
              <select id="import-first-sheet" value={mapping.sheetName} onChange={(e) => changeFirstSheet(e.target.value)}>
                {allSheets.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </Field>
            <Field label="Header row">
              <select id="import-header-row" value={mapping.headerRow} onChange={(e) => changeFirstSheet(mapping.sheetName, Number(e.target.value))}>
                {preview.map((r, i) => (
                  <option key={i} value={i}>
                    Row {i + 1}: {r.filter(Boolean).slice(0, 4).join(' | ').slice(0, 60)}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          {candidates.length > 1 && (
            <>
              <p className="small">
                <b>{candidates.length} sheets</b> have these columns. Import them together as one cycle:
              </p>
              <div className="sheet-list">
                {candidates.map((s) => (
                  <label key={s.name} className="check sheet-item">
                    <input type="checkbox" checked={selectedNames.has(s.name)} onChange={(e) => toggleSheet(s.name, e.target.checked)} />
                    <span>{s.name}</span>
                    <span className="muted small">{result?.perSheet[s.name] ?? 0}</span>
                  </label>
                ))}
              </div>
              <div className="row wrap">
                <button className="link-btn" onClick={() => update({ sheets: candidates })}>
                  Select all
                </button>
                <label className="check">
                  <input type="checkbox" checked={!!mapping.moduleFromSheet} onChange={(e) => update({ moduleFromSheet: e.target.checked })} />
                  Use the sheet name as Module{mapping.fields.module ? ' when the Module column is empty' : ''}
                </label>
              </div>
            </>
          )}
          {otherSheets.length > 0 && <p className="muted small">Not imported (different columns): {otherSheets.join(', ')}. They stay in the export unchanged.</p>}
        </section>
      )}

      {parsed && mapping && (
        <section className="card">
          <h3 className="step-title">
            <span className="step">3</span>Map columns
          </h3>
          {templates.length > 0 && (
            <Field label="Mapping template">
              <select id="import-template" value="" onChange={(e) => applyTemplate(e.target.value)}>
                <option value="">Apply a template…</option>
                {templates.map((t) => (
                  <option key={t.name}>{t.name}</option>
                ))}
              </select>
            </Field>
          )}
          <div className="mapping-grid">
            {FIELDS.map((f) => (
              <Field key={f.key} label={`${f.label}${f.required ? ' *' : ''}`} hint={f.hint}>
                <select
                  id={`map-${f.key}`}
                  value={mapping.fields[f.key] ?? ''}
                  onChange={(e) => setField(f.key, e.target.value)}
                  className={mapping.fields[f.key] ? '' : 'unmapped'}
                >
                  <option value="">— not in this workbook —</option>
                  {mapping.headers.map((h) => (
                    <option key={h}>{h}</option>
                  ))}
                </select>
              </Field>
            ))}
          </div>
          <p className="muted small">Columns you don't map are kept and come back unchanged in the export.</p>

          {mapping.fields.status && (
            <div className="status-map">
              <h4>Status words in this workbook</h4>
              <p className="muted small">
                Import reads these words as the portal status; export writes them back so the workbook's own dropdowns and totals keep working.
                {dropdown.length > 0 && ` Found a dropdown with: ${dropdown.join(', ')}.`}
              </p>
              <div className="status-map-grid">
                {CASE_STATUSES.map((s) => (
                  <label key={s} className="status-map-row">
                    <span className="status-map-name">{s}</span>
                    <span aria-hidden>→</span>
                    <select id={`status-label-${s}`} value={mapping.statusLabels?.[s] ?? s} onChange={(e) => setLabel(s, e.target.value)}>
                      <option value="">(blank cell)</option>
                      {statusChoices.map((v) => (
                        <option key={v} value={v}>
                          {v}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>
            </div>
          )}

          <div className="row wrap template-save">
            <Field label="Save this mapping as a template">
              <input id="template-name" value={templateName} onChange={(e) => setTemplateName(e.target.value)} placeholder="e.g. Web store UAT layout" />
            </Field>
            <button className="btn btn-sm" onClick={saveTemplate} disabled={!templateName.trim()}>
              Save template
            </button>
          </div>
        </section>
      )}

      {result && (
        <section className="card">
          <h3 className="step-title">
            <span className="step">4</span>Check
          </h3>
          <p>
            <strong>{result.rows.length}</strong> test cases found{multi && <> across <strong>{mapping?.sheets?.length}</strong> sheets</>}
            {result.headings > 0 && <span className="muted"> · {result.headings} section headings skipped</span>}.{' '}
            {errors.length > 0 ? <span className="error">{errors.length} error(s) must be fixed in the workbook first.</span> : <span className="ok">Ready to import.</span>}
          </p>
          {(errors.length > 0 || warnings.length > 0) && (
            <ul className="issues">
              {[...errors, ...warnings].slice(0, 100).map((i, n) => (
                <li key={n} className={i.level}>
                  {i.sheet && multi ? `${i.sheet}, ` : ''}
                  {i.row ? `row ${i.row}: ` : ''}
                  {i.message}
                </li>
              ))}
              {errors.length + warnings.length > 100 && <li className="muted">…and {errors.length + warnings.length - 100} more</li>}
            </ul>
          )}
        </section>
      )}

      {result && errors.length === 0 && (
        <section className="card">
          <h3 className="step-title">
            <span className="step">5</span>Import into
          </h3>
          <div className="row wrap">
            <label className="check">
              <input type="radio" name="import-target" checked={target === 'new'} onChange={() => setTarget('new')} /> A new cycle
            </label>
            <label className="check">
              <input type="radio" name="import-target" checked={target !== 'new'} onChange={() => cycles[0] && setTarget(cycles[0].id)} disabled={!cycles.length} /> An existing cycle
            </label>
          </div>
          {target === 'new' ? (
            <div className="row wrap">
              <Field label="Cycle name">
                <input id="cycle-name" value={cycleForm.name} onChange={(e) => setCycleForm({ ...cycleForm, name: e.target.value })} />
              </Field>
              <Field label="Environment">
                <input id="cycle-env" value={cycleForm.env} onChange={(e) => setCycleForm({ ...cycleForm, env: e.target.value })} placeholder="e.g. Sandbox 1" />
              </Field>
              <Field label="Start">
                <input id="cycle-start" type="date" value={cycleForm.start} onChange={(e) => setCycleForm({ ...cycleForm, start: e.target.value })} />
              </Field>
              <Field label="End">
                <input id="cycle-end" type="date" value={cycleForm.end} onChange={(e) => setCycleForm({ ...cycleForm, end: e.target.value })} />
              </Field>
            </div>
          ) : (
            <>
              <Field label="Cycle">
                <select id="import-cycle" value={target} onChange={(e) => setTarget(Number(e.target.value))}>
                  {cycles.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </Field>
              <p className="muted small">
                Cases are matched by Case ID. Descriptions are updated from the workbook; statuses and results already recorded in the portal are kept.
              </p>
            </>
          )}
          <div className="row">
            <button className="btn btn-primary" onClick={runImport} disabled={running}>
              {running ? 'Importing…' : `Import ${result.rows.length} cases`}
            </button>
            {progress && (
              <div className="progress" aria-label="Import progress">
                <div className="progress-bar" style={{ width: `${(progress.done / Math.max(progress.total, 1)) * 100}%` }} />
                <span>
                  {progress.done} / {progress.total}
                </span>
              </div>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
