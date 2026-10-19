import { useCallback, useEffect, useState } from 'react';
import { ApiError } from '../api/api';
import type { CaseBundle, CaseStatus, CaseSummary, Comment } from '../types';
import { toAttachment } from '../lib/files';
import { SHEET_KEY } from '../lib/excel';
import { Comments } from './Comments';
import { FileLink } from './FileView';
import { ChevronLeftIcon, CloseIcon, UploadIcon } from './icons';
import { Spinner, StatusPill, errorText, useApi, useBoot, useToast } from './ui';

interface Props {
  caseId: number;
  onUpdated: (summary: CaseSummary) => void;
  onClose: () => void;
}

export function commentStats(comments: Comment[]) {
  const unanswered = comments.some((c) => !c.parentId && !c.byTeam && !comments.some((r) => r.parentId === c.id && r.byTeam));
  return { commentCount: comments.length, unanswered };
}

const FAILING: CaseStatus[] = ['Fail', 'Blocked'];

export function CaseDetail({ caseId, onUpdated, onClose }: Props) {
  const api = useApi();
  const boot = useBoot();
  const toast = useToast();
  const [data, setData] = useState<CaseBundle | null>(null);
  const [loadError, setLoadError] = useState('');
  const [status, setStatus] = useState<CaseStatus>('Not Started');
  const [actual, setActual] = useState('');
  const [defect, setDefect] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [conflict, setConflict] = useState(false);

  const apply = useCallback(
    (b: CaseBundle) => {
      setData(b);
      setStatus(b.case.status);
      setActual(b.case.actual || '');
      setDefect(b.case.defect || '');
      setReason('');
      setConflict(false);
      onUpdated({ ...b.case, ...commentStats(b.comments) });
    },
    [onUpdated]
  );

  const load = useCallback(async () => {
    setLoadError('');
    try {
      apply(await api.getCase(caseId));
    } catch (e) {
      setLoadError(errorText(e));
    }
  }, [api, caseId, apply]);

  useEffect(() => {
    setData(null);
    load();
  }, [load]);

  if (loadError) return <div className="detail"><p className="error">{loadError}</p></div>;
  if (!data) return <div className="detail"><Spinner label="Loading case…" /></div>;

  const c = data.case;
  const needsReason = FAILING.includes(status) && status !== c.status;
  const dirty = status !== c.status || actual !== (c.actual || '') || defect !== (c.defect || '');
  const extra = Object.entries(c.row || {}).filter(([k, v]) => k !== SHEET_KEY && v !== '' && v !== null && !Object.values(data.cycle.mapping?.fields ?? {}).includes(k));

  async function save() {
    setSaving(true);
    try {
      apply(await api.saveCase({ id: c.id, version: c.version, status, actual, defect, reason: needsReason ? reason : undefined }));
      toast(`${c.ref} saved`);
    } catch (e) {
      if (e instanceof ApiError && e.code === 'CONFLICT') setConflict(true);
      else toast(errorText(e), 'error');
    } finally {
      setSaving(false);
    }
  }

  async function uploadEvidence(file: File | undefined) {
    if (!file) return;
    try {
      const att = await toAttachment(file, boot.limits.imageBytes);
      apply(await api.uploadEvidence({ caseId: c.id, version: c.version, ...att }));
      toast('Evidence attached');
    } catch (e) {
      if (e instanceof ApiError && e.code === 'CONFLICT') setConflict(true);
      else toast(errorText(e), 'error');
    }
  }

  return (
    <div className="detail">
      <button className="back-btn" onClick={onClose}>
        <ChevronLeftIcon /> All test cases
      </button>
      <div className="detail-head">
        <div className="detail-title">
          <div className="eyebrow">
            {c.module || 'Test case'}
            {c.assigned && <span> · Assigned to {c.assigned}</span>}
          </div>
          <h2>
            <span className="mono">{c.ref}</span>
            <StatusPill status={c.status} />
          </h2>
          {c.scenario && <p className="scenario-text">{c.scenario}</p>}
        </div>
        <button className="icon-btn close-btn" onClick={onClose} aria-label="Close case">
          <CloseIcon />
        </button>
      </div>

      <div className="spec">
        <TextBlock title="Pre-conditions" text={c.precond} />
        <TextBlock title="Test data" text={c.testData} />
        <TextBlock title="Steps" text={c.steps} />
        <TextBlock title="Expected result" text={c.expected} />
      </div>
      {extra.length > 0 && (
        <details className="extra">
          <summary>More from the workbook ({extra.length})</summary>
          <dl>
            {extra.map(([k, v]) => (
              <div key={k}>
                <dt>{k}</dt>
                <dd>{String(v)}</dd>
              </div>
            ))}
          </dl>
        </details>
      )}

      <section className="result panel">
        <h3>Result</h3>
        {conflict && (
          <div className="banner banner-warn">
            Someone else saved this case after you opened it. Reload to see their changes; your edits here will be replaced.
            <button className="btn btn-sm" onClick={load}>
              Reload case
            </button>
          </div>
        )}
        <div className="status-picker" role="radiogroup" aria-label="Status">
          {boot.caseStatuses.map((s) => (
            <button key={s} role="radio" aria-checked={status === s} className={`status-opt ${status === s ? 'on' : ''}`} onClick={() => setStatus(s)}>
              {s}
            </button>
          ))}
        </div>
        <label className="field">
          <span className="field-label">Actual result{FAILING.includes(status) && <span className="req"> *</span>}</span>
          <textarea rows={3} value={actual} onChange={(e) => setActual(e.target.value)} />
        </label>
        {needsReason && (
          <label className="field">
            <span className="field-label">
              Reason for {status}
              <span className="req"> *</span>
            </span>
            <textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Posted as a Fail Reason comment" />
          </label>
        )}
        <label className="field field-inline">
          <span className="field-label">Defect ref</span>
          <input value={defect} onChange={(e) => setDefect(e.target.value)} placeholder="e.g. a Jira key" />
        </label>
        <div className="row wrap">
          <button
            className="btn btn-primary"
            disabled={saving || !dirty || conflict || (FAILING.includes(status) && !actual.trim()) || (needsReason && !reason.trim())}
            onClick={save}
          >
            {saving ? 'Saving…' : 'Save result'}
          </button>
          {data.cycle.screenshots && (
            <label className="btn">
              <UploadIcon size={14} />
              {c.evidenceId ? 'Replace evidence' : 'Attach evidence'}
              <input type="file" accept="image/png,image/jpeg,image/gif" hidden onChange={(e) => uploadEvidence(e.target.files?.[0])} />
            </label>
          )}
          {c.evidenceId && <FileLink fileId={c.evidenceId} name={c.evidenceName} />}
        </div>
        {(c.testerName || c.executedOn) && (
          <p className="muted small">
            Last executed {c.executedOn && `on ${c.executedOn}`} {c.testerName && `by ${c.testerName}`}
          </p>
        )}
      </section>

      <Comments
        caseId={c.id}
        comments={data.comments}
        screenshots={data.cycle.screenshots}
        onChange={(comments) => {
          setData({ ...data, comments });
          onUpdated({ ...c, ...commentStats(comments) });
        }}
      />
    </div>
  );
}

function TextBlock({ title, text }: { title: string; text: string }) {
  if (!text) return null;
  return (
    <section className="text-block">
      <h4>{title}</h4>
      <p>{text}</p>
    </section>
  );
}
