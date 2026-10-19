import { useMemo } from 'react';
import type { CaseStatus, CaseSummary } from '../types';
import { StatusPill, useBoot } from './ui';

// Retest means a fix is waiting to be tested again, so it counts as open, not executed.
const EXECUTED: CaseStatus[] = ['Pass', 'Fail', 'Blocked', 'N/A'];
const OPEN: CaseStatus[] = ['Fail', 'Blocked', 'Retest'];
const pct = (n: number, d: number) => (d ? Math.round((n / d) * 100) : 0);

export function Dashboard({ cases, onOpen }: { cases: CaseSummary[]; onOpen: (id: number) => void }) {
  const boot = useBoot();
  const stats = useMemo(() => {
    const byStatus = Object.fromEntries(boot.caseStatuses.map((s) => [s, 0])) as Record<CaseStatus, number>;
    const modules = new Map<string, Record<CaseStatus, number> & { total: number }>();
    for (const c of cases) {
      byStatus[c.status] = (byStatus[c.status] ?? 0) + 1;
      const key = c.module || '(no module)';
      const m = modules.get(key) ?? { ...(Object.fromEntries(boot.caseStatuses.map((s) => [s, 0])) as Record<CaseStatus, number>), total: 0 };
      m[c.status] += 1;
      m.total += 1;
      modules.set(key, m);
    }
    const executed = EXECUTED.reduce((n, s) => n + byStatus[s], 0);
    return { byStatus, modules: [...modules.entries()].sort(([a], [b]) => a.localeCompare(b)), executed };
  }, [cases, boot.caseStatuses]);

  const total = cases.length;
  const open = cases.filter((c) => OPEN.includes(c.status));

  return (
    <div className="dashboard">
      <div className="tiles">
        <Tile label="Test cases" value={total} />
        <Tile label="Executed" value={`${pct(stats.executed, total)}%`} sub={`${stats.executed} of ${total}`} progress={pct(stats.executed, total)} />
        <Tile label="Passed" value={`${pct(stats.byStatus.Pass, total)}%`} sub={`${stats.byStatus.Pass} case${stats.byStatus.Pass === 1 ? '' : 's'}`} progress={pct(stats.byStatus.Pass, total)} tone="ok" />
        <Tile label="Open issues" value={open.length} sub="Fail, Blocked or Retest" alert={open.length > 0} />
      </div>

      <section className="card">
        <h3>By status</h3>
        <div className="stackbar" aria-hidden>
          {boot.caseStatuses.map((s) =>
            stats.byStatus[s] ? <span key={s} className={`seg seg-${s.replace(/[^a-z]/gi, '').toLowerCase()}`} style={{ flexGrow: stats.byStatus[s] }} title={`${s}: ${stats.byStatus[s]}`} /> : null
          )}
        </div>
        <ul className="legend">
          {boot.caseStatuses.map((s) => (
            <li key={s}>
              <StatusPill status={s} /> <strong>{stats.byStatus[s]}</strong>
            </li>
          ))}
        </ul>
      </section>

      <section className="card">
        <h3>By module</h3>
        <div className="table-wrap">
          <table className="grid">
            <thead>
              <tr>
                <th>Module</th>
                <th className="num">Total</th>
                {boot.caseStatuses.map((s) => (
                  <th key={s} className="num">
                    {s}
                  </th>
                ))}
                <th className="num">Executed</th>
                <th className="num">Passed</th>
              </tr>
            </thead>
            <tbody>
              {stats.modules.map(([name, m]) => {
                const exec = EXECUTED.reduce((n, s) => n + m[s], 0);
                return (
                  <tr key={name}>
                    <td>{name}</td>
                    <td className="num">{m.total}</td>
                    {boot.caseStatuses.map((s) => (
                      <td key={s} className="num">
                        {m[s] || ''}
                      </td>
                    ))}
                    <td className="num">{pct(exec, m.total)}%</td>
                    <td className="num">{pct(m.Pass, m.total)}%</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card">
        <h3>Open Fail, Blocked and Retest cases</h3>
        {open.length ? (
          <ul className="open-list">
            {open.map((c) => (
              <li key={c.id}>
                <button className="link-btn mono" onClick={() => onOpen(c.id)}>
                  {c.ref}
                </button>
                <StatusPill status={c.status} />
                <span>{c.scenario}</span>
                {c.defect && <span className="muted small">Defect {c.defect}</span>}
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">No open Fail, Blocked or Retest cases.</p>
        )}
      </section>
    </div>
  );
}

function Tile({ label, value, sub, alert, progress, tone }: { label: string; value: string | number; sub?: string; alert?: boolean; progress?: number; tone?: 'ok' }) {
  return (
    <div className={`tile ${alert ? 'tile-alert' : ''}`}>
      <div className="tile-label">{label}</div>
      <div className="tile-value">{value}</div>
      {sub && <div className="tile-sub">{sub}</div>}
      {progress !== undefined && (
        <div className={`meter ${tone === 'ok' ? 'meter-ok' : ''}`} aria-hidden>
          <span style={{ width: `${progress}%` }} />
        </div>
      )}
    </div>
  );
}
