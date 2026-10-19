import { useCallback, useEffect, useMemo, useState } from 'react';
import { createApi, type Api } from './api/api';
import type { Bootstrap, CaseDetail, CaseSummary, Cycle, Level } from './types';
import { downloadBytes, exportFileName } from './lib/excel';
import { buildExportWorkbook } from './lib/export';
import { CaseFilters, CaseTable, applyFilters, emptyFilters, type Filters } from './components/CaseList';
import { CaseDetail as CaseDetailView } from './components/CaseDetail';
import { Dashboard } from './components/Dashboard';
import { ImportWizard } from './components/ImportWizard';
import { CycleSettings } from './components/CycleSettings';
import { ApiContext, Avatar, BootContext, Spinner, ThemeToggle, errorText, useToast } from './components/ui';
import { DownloadIcon, RefreshIcon, SheetIcon } from './components/icons';

type Tab = 'cases' | 'dashboard' | 'import' | 'settings';

function readHash(): { cycle?: number; case?: number } {
  const p = new URLSearchParams(location.hash.slice(1));
  return { cycle: Number(p.get('cycle')) || undefined, case: Number(p.get('case')) || undefined };
}

function writeHash(cycle: number | null, caseId: number | null) {
  const p = new URLSearchParams();
  if (cycle) p.set('cycle', String(cycle));
  if (caseId) p.set('case', String(caseId));
  try {
    history.replaceState(null, '', `#${p}`);
  } catch {
    /* some embedded frames refuse history changes; the link just won't deep-link */
  }
}

const SHOW_DEMO_BAR = import.meta.env.DEV || __DEMO__;
const LEVEL_LABEL: Record<Level, string> = { team: 'Implementation team', lead: 'UAT lead', tester: 'Tester' };

function DemoBar({ level, onChange }: { level: Level; onChange: (l: Level) => void }) {
  return (
    <div className="demo-bar" role="note">
      <span>
        <b>Demo</b> · Sample data only. Changes are kept until you reload the page.
      </span>
      <label>
        View as
        <select value={level} onChange={(e) => onChange(e.target.value as Level)} aria-label="View the demo as">
          {(Object.keys(LEVEL_LABEL) as Level[]).map((l) => (
            <option key={l} value={l}>
              {LEVEL_LABEL[l]}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}

const SUMMARY_KEYS: (keyof CaseSummary)[] = [
  'id', 'cycleId', 'ref', 'rowNum', 'module', 'scenario', 'assigned', 'status', 'testerId', 'testerName', 'executedOn', 'defect', 'version', 'commentCount', 'unanswered',
];
const toSummary = (c: CaseSummary | CaseDetail): CaseSummary =>
  Object.fromEntries(SUMMARY_KEYS.filter((k) => k in c).map((k) => [k, c[k as keyof typeof c]])) as unknown as CaseSummary;

export function App() {
  const [api, setApi] = useState<Api | null>(null);
  const [boot, setBoot] = useState<Bootstrap | null>(null);
  const [fatal, setFatal] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const a = await createApi();
        setApi(a);
        setBoot(await a.bootstrap());
      } catch (e) {
        setFatal(errorText(e));
      }
    })();
  }, []);

  async function viewAs(level: Level) {
    if (!SHOW_DEMO_BAR || !api) return;
    const { setMockLevel } = await import('./api/mock');
    setMockLevel(level);
    setBoot(await api.bootstrap());
  }

  if (fatal) return <div className="fatal"><h1>UAT Portal</h1><p className="error">{fatal}</p></div>;
  if (!api || !boot) return <div className="fatal"><Spinner label="Loading UAT Portal…" /></div>;
  return (
    <ApiContext.Provider value={api}>
      <BootContext.Provider value={boot}>
        <div className="app">
          {SHOW_DEMO_BAR && <DemoBar level={boot.user.level} onChange={viewAs} />}
          <Portal key={boot.user.id} api={api} boot={boot} />
        </div>
      </BootContext.Provider>
    </ApiContext.Provider>
  );
}

function Portal({ api, boot }: { api: Api; boot: Bootstrap }) {
  const toast = useToast();
  const team = boot.user.level === 'team';
  const canSeeDashboard = boot.user.level !== 'tester';
  const initial = readHash();

  const [cycles, setCycles] = useState<Cycle[]>(boot.cycles);
  const [cycleId, setCycleId] = useState<number | null>(
    (initial.cycle && boot.cycles.some((c) => c.id === initial.cycle) ? initial.cycle : boot.cycles.find((c) => c.status === 'Active')?.id ?? boot.cycles[0]?.id) ?? null
  );
  const [tab, setTab] = useState<Tab>(boot.cycles.length || !team ? 'cases' : 'import');
  const [cases, setCases] = useState<CaseSummary[]>([]);
  const [loadingCases, setLoadingCases] = useState(false);
  const [selected, setSelected] = useState<number | null>(initial.case ?? null);
  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const [exporting, setExporting] = useState('');

  const cycle = cycles.find((c) => c.id === cycleId) ?? null;

  const loadCases = useCallback(async () => {
    if (!cycleId) return setCases([]);
    setLoadingCases(true);
    try {
      setCases(await api.cases(cycleId));
    } catch (e) {
      toast(errorText(e), 'error');
    } finally {
      setLoadingCases(false);
    }
  }, [api, cycleId, toast]);

  useEffect(() => {
    loadCases();
  }, [loadCases]);

  useEffect(() => writeHash(cycleId, selected), [cycleId, selected]);

  const onUpdated = useCallback((s: CaseSummary) => {
    setCases((list) => list.map((c) => (c.id === s.id ? { ...c, ...toSummary(s) } : c)));
  }, []);

  const visible = useMemo(() => applyFilters(cases, filters), [cases, filters]);

  async function refreshCycles(selectId?: number) {
    const list = await api.cycles();
    setCycles(list);
    if (selectId) setCycleId(selectId);
  }

  async function exportCycle() {
    if (!cycle) return;
    setExporting('Preparing…');
    try {
      const full = await api.cycle(cycle.id);
      const all: CaseDetail[] = [];
      for (let page = 0, pageCount = 1; page < pageCount; page++) {
        setExporting(`Reading cases… ${all.length}`);
        const r = await api.exportCases(cycle.id, page);
        pageCount = r.pageCount;
        all.push(...r.cases);
      }
      setExporting('Reading comments…');
      const comments = await api.exportComments(cycle.id);
      const original = full.hasWorkbook ? await api.workbook(cycle.id) : null;
      setExporting('Writing workbook…');
      const bytes = await buildExportWorkbook(full, all, comments, original?.base64 ?? null);
      if (__DEMO__) {
        toast(`Built the export: ${all.length} cases and ${comments.length} comments in the workbook's own layout. Downloads are turned off on this demo page.`);
        return;
      }
      downloadBytes(bytes, exportFileName(full));
      toast(`Exported ${all.length} cases`);
    } catch (e) {
      toast(`Export failed: ${errorText(e)}`, 'error');
    } finally {
      setExporting('');
    }
  }

  return (
    <div className="portal">
      <header className="topbar">
        <div className="topbar-row">
          <div className="brand">
            <span className="brand-mark" aria-hidden>
              <SheetIcon size={16} />
            </span>
            <span className="brand-name">UAT Portal</span>
          </div>
          {cycles.length > 0 && (
            <select
              className="cycle-select"
              value={cycleId ?? ''}
              onChange={(e) => {
                setCycleId(Number(e.target.value));
                setSelected(null);
                setFilters(emptyFilters);
              }}
              aria-label="UAT cycle"
            >
              {cycles.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {c.status !== 'Active' ? ` (${c.status})` : ''}
                </option>
              ))}
            </select>
          )}
          <span className="spacer" />
          {cycle && (
            <button className="btn btn-on-dark" onClick={exportCycle} disabled={!!exporting} title="Export the cycle to Excel">
              <DownloadIcon />
              <span className="hide-sm">{exporting || 'Export to Excel'}</span>
            </button>
          )}
          <ThemeToggle />
          <span className="user" title={`${boot.user.name} · role ${boot.user.roleId}`}>
            <Avatar name={boot.user.name} team={team} />
            <span className="user-meta hide-sm">
              <span className="user-name">{boot.user.name}</span>
              <span className="user-level">{boot.user.level === 'team' ? 'Implementation team' : boot.user.level === 'lead' ? 'UAT lead' : 'Tester'}</span>
            </span>
          </span>
        </div>
        <nav className="tabs" aria-label="Sections">
          <TabButton tab="cases" current={tab} onClick={setTab} disabled={!cycle}>
            Test cases
          </TabButton>
          {canSeeDashboard && (
            <TabButton tab="dashboard" current={tab} onClick={setTab} disabled={!cycle}>
              Dashboard
            </TabButton>
          )}
          {team && (
            <TabButton tab="import" current={tab} onClick={setTab}>
              Import
            </TabButton>
          )}
          {team && (
            <TabButton tab="settings" current={tab} onClick={setTab} disabled={!cycle}>
              Cycle settings
            </TabButton>
          )}
        </nav>
      </header>

      <main className={`main ${tab === 'cases' && selected ? 'with-detail' : ''}`}>
        {!cycle && tab !== 'import' && (
          <div className="empty-state">
            <h2>No UAT cycles yet</h2>
            <p>{team ? 'Import a UAT workbook to create the first cycle.' : 'The implementation team has not imported any test cases yet.'}</p>
            {team && (
              <button className="btn btn-primary" onClick={() => setTab('import')}>
                Import a workbook
              </button>
            )}
          </div>
        )}

        {cycle && tab === 'cases' && (
          <>
            <div className="list-pane">
              <div className="list-head">
                <CaseFilters cases={cases} filters={filters} onChange={setFilters} />
                <div className="list-meta">
                  <span>
                    Showing <b>{visible.length}</b> of {cases.length} cases
                    {cycle.env && <span className="env">{cycle.env}</span>}
                  </span>
                  <button className="btn btn-ghost btn-sm" onClick={loadCases} disabled={loadingCases}>
                    <RefreshIcon size={14} className={loadingCases ? 'spin' : ''} />
                    {loadingCases ? 'Refreshing…' : 'Refresh'}
                  </button>
                </div>
              </div>
              {loadingCases && !cases.length ? <Spinner label="Loading cases…" /> : <CaseTable cases={visible} selectedId={selected} onSelect={setSelected} />}
            </div>
            {selected && <CaseDetailView key={selected} caseId={selected} onUpdated={onUpdated} onClose={() => setSelected(null)} />}
          </>
        )}

        {cycle && tab === 'dashboard' && (
          <Dashboard
            cases={cases}
            onOpen={(id) => {
              setSelected(id);
              setTab('cases');
            }}
          />
        )}

        {tab === 'import' && team && (
          <ImportWizard
            cycles={cycles}
            onDone={async (id) => {
              await refreshCycles(id);
              setSelected(null);
              setFilters(emptyFilters);
              setTab('cases');
            }}
          />
        )}

        {cycle && tab === 'settings' && team && <CycleSettings cycle={cycle} onSaved={(c) => setCycles((list) => list.map((x) => (x.id === c.id ? { ...x, ...c } : x)))} />}
      </main>
    </div>
  );
}

function TabButton({ tab, current, onClick, disabled, children }: { tab: Tab; current: Tab; onClick: (t: Tab) => void; disabled?: boolean; children: string }) {
  return (
    <button className={`tab ${tab === current ? 'on' : ''}`} onClick={() => onClick(tab)} disabled={disabled}>
      {children}
    </button>
  );
}
