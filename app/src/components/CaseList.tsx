import { useMemo } from 'react';
import type { CaseStatus, CaseSummary } from '../types';
import { StatusPill, useBoot } from './ui';

export interface Filters {
  module: string;
  status: string;
  tester: string;
  search: string;
  unanswered: boolean;
}

export const emptyFilters: Filters = { module: '', status: '', tester: '', search: '', unanswered: false };

const testerOf = (c: CaseSummary) => c.testerName || c.assigned;

export function applyFilters(cases: CaseSummary[], f: Filters): CaseSummary[] {
  const q = f.search.trim().toLowerCase();
  return cases.filter(
    (c) =>
      (!f.module || c.module === f.module) &&
      (!f.status || c.status === f.status) &&
      (!f.tester || c.testerName === f.tester || c.assigned === f.tester) &&
      (!f.unanswered || c.unanswered) &&
      (!q || [c.ref, c.scenario, c.module, c.defect].some((v) => v?.toLowerCase().includes(q)))
  );
}

export function CaseFilters({ cases, filters, onChange }: { cases: CaseSummary[]; filters: Filters; onChange: (f: Filters) => void }) {
  const boot = useBoot();
  const modules = useMemo(() => [...new Set(cases.map((c) => c.module).filter(Boolean))].sort(), [cases]);
  const testers = useMemo(() => [...new Set(cases.flatMap((c) => [c.testerName, c.assigned]).filter(Boolean))].sort(), [cases]);
  const set = (patch: Partial<Filters>) => onChange({ ...filters, ...patch });
  const active = JSON.stringify(filters) !== JSON.stringify(emptyFilters);
  return (
    <div className="filters">
      <input
        className="search"
        type="search"
        placeholder="Search case ID, scenario, defect…"
        value={filters.search}
        onChange={(e) => set({ search: e.target.value })}
        aria-label="Search cases"
      />
      <select value={filters.module} onChange={(e) => set({ module: e.target.value })} aria-label="Module">
        <option value="">All modules</option>
        {modules.map((m) => (
          <option key={m}>{m}</option>
        ))}
      </select>
      <select value={filters.status} onChange={(e) => set({ status: e.target.value })} aria-label="Status">
        <option value="">All statuses</option>
        {boot.caseStatuses.map((s) => (
          <option key={s}>{s}</option>
        ))}
      </select>
      <select value={filters.tester} onChange={(e) => set({ tester: e.target.value })} aria-label="Tester">
        <option value="">All testers</option>
        {testers.map((t) => (
          <option key={t}>{t}</option>
        ))}
      </select>
      <label className="check">
        <input type="checkbox" checked={filters.unanswered} onChange={(e) => set({ unanswered: e.target.checked })} />
        Unanswered comments
      </label>
      {active && (
        <button className="link-btn" onClick={() => onChange(emptyFilters)}>
          Clear filters
        </button>
      )}
    </div>
  );
}

export function CaseTable({ cases, selectedId, onSelect }: { cases: CaseSummary[]; selectedId: number | null; onSelect: (id: number) => void }) {
  if (!cases.length) return <p className="empty">No test cases match these filters.</p>;
  return (
    <div className="table-wrap">
      <table className="cases">
        <thead>
          <tr>
            <th>Case ID</th>
            <th>Module</th>
            <th>Scenario</th>
            <th>Status</th>
            <th>Tester</th>
            <th title="Comments">💬</th>
          </tr>
        </thead>
        <tbody>
          {cases.map((c) => (
            <tr
              key={c.id}
              className={c.id === selectedId ? 'selected' : ''}
              onClick={() => onSelect(c.id)}
              onKeyDown={(e) => e.key === 'Enter' && onSelect(c.id)}
              tabIndex={0}
            >
              <td className="mono nowrap">{c.ref}</td>
              <td className="nowrap">{c.module}</td>
              <td className="scenario">{c.scenario}</td>
              <td>
                <StatusPill status={c.status as CaseStatus} />
              </td>
              <td className="nowrap muted">{testerOf(c)}</td>
              <td className="nowrap">
                {c.commentCount ? (
                  <span className={`count ${c.unanswered ? 'count-alert' : ''}`} title={c.unanswered ? 'Has unanswered client comments' : undefined}>
                    {c.commentCount}
                  </span>
                ) : (
                  ''
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
