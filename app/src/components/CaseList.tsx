import { useMemo } from 'react';
import type { CaseStatus, CaseSummary } from '../types';
import { CommentIcon, SearchIcon } from './icons';
import { StatusPill, statusClass, useBoot } from './ui';

export interface Filters {
  module: string;
  status: string;
  tester: string;
  search: string;
  unanswered: boolean;
}

export const emptyFilters: Filters = { module: '', status: '', tester: '', search: '', unanswered: false };

const testerOf = (c: CaseSummary) => c.testerName || c.assigned;

export function applyFilters(cases: CaseSummary[], f: Filters, ignoreStatus = false): CaseSummary[] {
  const q = f.search.trim().toLowerCase();
  return cases.filter(
    (c) =>
      (!f.module || c.module === f.module) &&
      (ignoreStatus || !f.status || c.status === f.status) &&
      (!f.tester || c.testerName === f.tester || c.assigned === f.tester) &&
      (!f.unanswered || c.unanswered) &&
      (!q || [c.ref, c.scenario, c.module, c.defect].some((v) => v?.toLowerCase().includes(q)))
  );
}

export function CaseFilters({ cases, filters, onChange }: { cases: CaseSummary[]; filters: Filters; onChange: (f: Filters) => void }) {
  const boot = useBoot();
  const modules = useMemo(() => [...new Set(cases.map((c) => c.module).filter(Boolean))].sort(), [cases]);
  const testers = useMemo(() => [...new Set(cases.flatMap((c) => [c.testerName, c.assigned]).filter(Boolean))].sort(), [cases]);
  // Status counts follow the other filters, so the chips show what clicking them would give.
  const counts = useMemo(() => {
    const out: Record<string, number> = {};
    for (const c of applyFilters(cases, filters, true)) out[c.status] = (out[c.status] ?? 0) + 1;
    return out;
  }, [cases, filters]);
  const unansweredCount = useMemo(() => cases.filter((c) => c.unanswered).length, [cases]);
  const set = (patch: Partial<Filters>) => onChange({ ...filters, ...patch });
  const active = JSON.stringify(filters) !== JSON.stringify(emptyFilters);
  const total = Object.values(counts).reduce((a, b) => a + b, 0);

  return (
    <div className="filters">
      <div className="filter-row">
        <label className="search">
          <SearchIcon />
          <input type="search" placeholder="Search case ID, scenario, defect…" value={filters.search} onChange={(e) => set({ search: e.target.value })} aria-label="Search cases" />
        </label>
        <select value={filters.module} onChange={(e) => set({ module: e.target.value })} aria-label="Module">
          <option value="">All modules</option>
          {modules.map((m) => (
            <option key={m}>{m}</option>
          ))}
        </select>
        <select value={filters.tester} onChange={(e) => set({ tester: e.target.value })} aria-label="Tester">
          <option value="">All testers</option>
          {testers.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
      </div>
      <div className="chip-row" role="group" aria-label="Filter by status">
        <button className={`fchip ${!filters.status ? 'on' : ''}`} aria-pressed={!filters.status} onClick={() => set({ status: '' })}>
          All <b>{total}</b>
        </button>
        {boot.caseStatuses.map((s) => (
          <button
            key={s}
            className={`fchip fchip-${statusClass(s)} ${filters.status === s ? 'on' : ''}`}
            aria-pressed={filters.status === s}
            onClick={() => set({ status: filters.status === s ? '' : s })}
          >
            <span className="dot" aria-hidden />
            {s} <b>{counts[s] ?? 0}</b>
          </button>
        ))}
        <button
          className={`fchip fchip-alert ${filters.unanswered ? 'on' : ''}`}
          aria-pressed={filters.unanswered}
          onClick={() => set({ unanswered: !filters.unanswered })}
          title="Cases with client comments the implementation team hasn't answered"
        >
          <CommentIcon size={13} /> Unanswered <b>{unansweredCount}</b>
        </button>
        {active && (
          <button className="link-btn clear" onClick={() => onChange(emptyFilters)}>
            Clear filters
          </button>
        )}
      </div>
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
            <th className="num" aria-label="Comments">
              <CommentIcon size={14} />
            </th>
          </tr>
        </thead>
        <tbody>
          {cases.map((c) => (
            <tr
              key={c.id}
              className={`${c.id === selectedId ? 'selected' : ''} row-${statusClass(c.status as CaseStatus)}`}
              onClick={() => onSelect(c.id)}
              onKeyDown={(e) => e.key === 'Enter' && onSelect(c.id)}
              tabIndex={0}
              aria-selected={c.id === selectedId}
            >
              <td className="mono nowrap c-ref">{c.ref}</td>
              <td className="nowrap c-module">{c.module || <span className="faint">—</span>}</td>
              <td className="c-scenario">{c.scenario}</td>
              <td className="c-status">
                <StatusPill status={c.status as CaseStatus} />
              </td>
              <td className="nowrap muted c-tester">{testerOf(c) || <span className="faint">—</span>}</td>
              <td className="num c-comments">
                {c.commentCount ? (
                  <span className={`count ${c.unanswered ? 'count-alert' : ''}`} title={c.unanswered ? 'Has unanswered client comments' : `${c.commentCount} comment(s)`}>
                    <CommentIcon size={12} />
                    {c.commentCount}
                  </span>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
