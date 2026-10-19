import { useEffect, useMemo, useState } from 'react';
import type { Cycle, FieldKey, Mapping, MappingTemplate } from '../types';
import { FIELDS, buildMapping, dataSheets, extractRows, readWorkbookFile, sheetRows, type ParsedWorkbook } from '../lib/excel';
import { Field, errorText, useApi, useBoot, useToast } from './ui';

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
  const [templates, setTemplates] = useState<MappingTemplate[]>([]);
  const [target, setTarget] = useState<'new' | number>('new');
  const [cycleForm, setCycleForm] = useState({ name: '', env: '', start: '', end: '' });
  const [progress, setProgress] = useState<{ done: number; total: number; created: number; updated: number } | null>(null);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    api.templates().then(setTemplates).catch(() => setTemplates([]));
  }, [api]);

  async function pick(file: File | undefined) {
    if (!file) return;
    try {
      const p = await readWorkbookFile(file);
      const sheets = dataSheets(p.wb);
      if (!sheets.length) throw new Error('The workbook has no sheets.');
      const existing = p.exportedCycleId ? cycles.find((c) => c.id === p.exportedCycleId) : undefined;
      const prior = existing ? (await api.cycle(existing.id)).mapping : null;
      const sheet = prior && sheets.includes(prior.sheetName) ? prior.sheetName : sheets[0];
      const m = buildMapping(p.wb, sheet, prior?.sheetName === sheet ? prior.headerRow : undefined);
      if (prior) m.fields = { ...m.fields, ...Object.fromEntries(Object.entries(prior.fields).filter(([, h]) => h && m.headers.includes(h))) };
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

  const result = useMemo(() => (parsed && mapping ? extractRows(parsed.wb, mapping) : null), [parsed, mapping]);
  const errors = result?.issues.filter((i) => i.level === 'error') ?? [];
  const warnings = result?.issues.filter((i) => i.level === 'warning') ?? [];
  const tooBig = parsed ? (parsed.base64.length * 3) / 4 > boot.limits.workbookBytes : false;

  function setField(key: FieldKey, header: string) {
    if (!mapping) return;
    const fields = { ...mapping.fields };
    if (header) fields[key] = header;
    else delete fields[key];
    setMapping({ ...mapping, fields });
  }

  function applyTemplate(name: string) {
    const t = templates.find((x) => x.name === name);
    if (!t || !mapping) return;
    const fields = Object.fromEntries(Object.entries(t.mapping.fields).filter(([, h]) => h && mapping.headers.includes(h)));
    setMapping({ ...mapping, fields });
    toast(`Applied template "${name}"`);
  }

  async function saveTemplate() {
    if (!mapping) return;
    const name = window.prompt('Template name');
    if (!name?.trim()) return;
    try {
      setTemplates(await api.saveTemplate({ name: name.trim(), mapping: { fields: mapping.fields } }));
      toast('Template saved');
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

  const sheets = parsed ? dataSheets(parsed.wb) : [];
  const preview = parsed && mapping ? sheetRows(parsed.wb, mapping.sheetName).slice(0, 20) : [];

  return (
    <div className="import">
      <section className="card">
        <h3>1. Choose a workbook</h3>
        <input type="file" accept=".xlsx" onChange={(e) => pick(e.target.files?.[0])} disabled={running} />
        {parsed && (
          <p className="muted small">
            {parsed.fileName} · {parsed.wb.SheetNames.length} sheet(s)
            {tooBig && ' · larger than 9 MB, so the original file will not be stored; export will rebuild the layout from the saved rows.'}
          </p>
        )}
      </section>

      {parsed && mapping && (
        <section className="card">
          <h3>2. Map columns</h3>
          <div className="row wrap">
            <Field label="Sheet">
              <select value={mapping.sheetName} onChange={(e) => setMapping(buildMapping(parsed.wb, e.target.value))}>
                {sheets.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </Field>
            <Field label="Header row">
              <select value={mapping.headerRow} onChange={(e) => setMapping(buildMapping(parsed.wb, mapping.sheetName, Number(e.target.value)))}>
                {preview.map((r, i) => (
                  <option key={i} value={i}>
                    Row {i + 1}: {r.filter(Boolean).slice(0, 4).join(' | ').slice(0, 60)}
                  </option>
                ))}
              </select>
            </Field>
            {templates.length > 0 && (
              <Field label="Mapping template">
                <select value="" onChange={(e) => applyTemplate(e.target.value)}>
                  <option value="">Apply a template…</option>
                  {templates.map((t) => (
                    <option key={t.name}>{t.name}</option>
                  ))}
                </select>
              </Field>
            )}
          </div>
          <div className="mapping-grid">
            {FIELDS.map((f) => (
              <Field key={f.key} label={`${f.label}${f.required ? ' *' : ''}`}>
                <select value={mapping.fields[f.key] ?? ''} onChange={(e) => setField(f.key, e.target.value)} className={mapping.fields[f.key] ? '' : 'unmapped'}>
                  <option value="">— not in this workbook —</option>
                  {mapping.headers.map((h) => (
                    <option key={h}>{h}</option>
                  ))}
                </select>
              </Field>
            ))}
          </div>
          <p className="muted small">Columns you don't map are still kept and come back in the export.</p>
          <button className="btn btn-sm" onClick={saveTemplate}>
            Save mapping as template
          </button>
        </section>
      )}

      {result && (
        <section className="card">
          <h3>3. Check</h3>
          <p>
            <strong>{result.rows.length}</strong> test cases found.{' '}
            {errors.length > 0 ? <span className="error">{errors.length} error(s) must be fixed in the workbook first.</span> : <span className="ok">Ready to import.</span>}
          </p>
          {(errors.length > 0 || warnings.length > 0) && (
            <ul className="issues">
              {[...errors, ...warnings].slice(0, 100).map((i, n) => (
                <li key={n} className={i.level}>
                  {i.row ? `Row ${i.row}: ` : ''}
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
          <h3>4. Import into</h3>
          <div className="row wrap">
            <label className="check">
              <input type="radio" checked={target === 'new'} onChange={() => setTarget('new')} /> A new cycle
            </label>
            <label className="check">
              <input type="radio" checked={target !== 'new'} onChange={() => cycles[0] && setTarget(cycles[0].id)} disabled={!cycles.length} /> An existing cycle
            </label>
          </div>
          {target === 'new' ? (
            <div className="row wrap">
              <Field label="Cycle name">
                <input value={cycleForm.name} onChange={(e) => setCycleForm({ ...cycleForm, name: e.target.value })} />
              </Field>
              <Field label="Environment">
                <input value={cycleForm.env} onChange={(e) => setCycleForm({ ...cycleForm, env: e.target.value })} placeholder="e.g. Sandbox 1" />
              </Field>
              <Field label="Start">
                <input type="date" value={cycleForm.start} onChange={(e) => setCycleForm({ ...cycleForm, start: e.target.value })} />
              </Field>
              <Field label="End">
                <input type="date" value={cycleForm.end} onChange={(e) => setCycleForm({ ...cycleForm, end: e.target.value })} />
              </Field>
            </div>
          ) : (
            <>
              <Field label="Cycle">
                <select value={target} onChange={(e) => setTarget(Number(e.target.value))}>
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
