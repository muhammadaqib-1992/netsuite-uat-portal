import { useEffect, useState } from 'react';
import type { Cycle, CycleStatus } from '../types';
import { Field, errorText, useApi, useBoot, useToast } from './ui';

export function CycleSettings({ cycle, onSaved }: { cycle: Cycle; onSaved: (c: Cycle) => void }) {
  const api = useApi();
  const boot = useBoot();
  const toast = useToast();
  const [form, setForm] = useState(cycle);
  const [busy, setBusy] = useState(false);

  useEffect(() => setForm(cycle), [cycle]);

  async function save() {
    setBusy(true);
    try {
      const saved = await api.updateCycle({
        id: cycle.id,
        name: form.name,
        env: form.env,
        start: form.start,
        end: form.end,
        status: form.status,
        screenshots: form.screenshots,
        email: form.email,
      });
      onSaved(saved);
      toast('Cycle saved');
    } catch (e) {
      toast(errorText(e), 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="settings card">
      <h3>Cycle settings</h3>
      <div className="row wrap">
        <Field label="Name">
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </Field>
        <Field label="Environment">
          <input value={form.env} onChange={(e) => setForm({ ...form, env: e.target.value })} />
        </Field>
        <Field label="Status">
          <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as CycleStatus })}>
            {boot.cycleStatuses.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </Field>
      </div>
      <div className="row wrap">
        <Field label="Start">
          <input type="date" value={form.start} onChange={(e) => setForm({ ...form, start: e.target.value })} />
        </Field>
        <Field label="End">
          <input type="date" value={form.end} onChange={(e) => setForm({ ...form, end: e.target.value })} />
        </Field>
      </div>
      <fieldset className="switches">
        <legend>Features for this cycle</legend>
        <label className="check">
          <input type="checkbox" checked={form.screenshots} onChange={(e) => setForm({ ...form, screenshots: e.target.checked })} />
          Screenshot attachments
          <span className="muted small"> (account default: {boot.accountDefaults.screenshots ? 'on' : 'off'})</span>
        </label>
        <label className="check">
          <input type="checkbox" checked={form.email} onChange={(e) => setForm({ ...form, email: e.target.checked })} />
          Email alerts for Fail/Blocked and new comments
          <span className="muted small"> (account default: {boot.accountDefaults.email ? 'on' : 'off'})</span>
        </label>
      </fieldset>
      <p className="muted small">
        Owner: {cycle.ownerName || '—'} · Source file: {cycle.sourceFile || '—'}
        {!cycle.hasWorkbook && cycle.sourceFile && ' (original not stored; export rebuilds the layout)'}
      </p>
      <button className="btn btn-primary" onClick={save} disabled={busy}>
        {busy ? 'Saving…' : 'Save cycle'}
      </button>
    </div>
  );
}
