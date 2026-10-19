import { useState, type ClipboardEvent } from 'react';
import type { Attachment, Comment, CommentType } from '../types';
import { toAttachment } from '../lib/files';
import { errorText, useApi, useBoot, useToast } from './ui';
import { FileLink } from './FileView';

interface Props {
  caseId: number;
  comments: Comment[];
  screenshots: boolean;
  onChange: (comments: Comment[]) => void;
}

export function Comments({ caseId, comments, screenshots, onChange }: Props) {
  const roots = comments.filter((c) => !c.parentId);
  const replies = (id: number) => comments.filter((c) => c.parentId === id);
  const [replyTo, setReplyTo] = useState<number | null>(null);

  return (
    <section className="comments">
      <h3>
        Comments <span className="muted">({comments.length})</span>
      </h3>
      {!roots.length && <p className="muted small">No comments yet.</p>}
      {roots.map((root) => (
        <div key={root.id} className="thread">
          <CommentItem comment={root} onChange={onChange} onReply={() => setReplyTo(root.id)} />
          <div className="replies">
            {replies(root.id).map((r) => (
              <CommentItem key={r.id} comment={r} onChange={onChange} />
            ))}
            {replyTo === root.id && (
              <Composer
                caseId={caseId}
                parentId={root.id}
                screenshots={screenshots}
                onPosted={(list) => {
                  onChange(list);
                  setReplyTo(null);
                }}
                onCancel={() => setReplyTo(null)}
              />
            )}
          </div>
        </div>
      ))}
      <Composer caseId={caseId} screenshots={screenshots} onPosted={onChange} />
    </section>
  );
}

function CommentItem({ comment: c, onChange, onReply }: { comment: Comment; onChange: (list: Comment[]) => void; onReply?: () => void }) {
  const api = useApi();
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(c.text);
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    try {
      onChange((await api.editComment({ id: c.id, text })).comments);
      setEditing(false);
    } catch (e) {
      toast(errorText(e), 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className={`comment ${c.byTeam ? 'comment-team' : ''}`}>
      <header>
        <strong>{c.authorName || 'Unknown'}</strong>
        {c.byTeam && <span className="tag tag-team">Implementation team</span>}
        {c.type !== 'General' && <span className={`tag tag-${c.type.replace(/\s+/g, '-').toLowerCase()}`}>{c.type}</span>}
        <span className="muted small">
          {c.postedOn}
          {c.editedOn && ' · edited'}
        </span>
      </header>
      {editing ? (
        <div className="stack">
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} />
          <div className="row">
            <button className="btn btn-primary btn-sm" disabled={busy || !text.trim()} onClick={save}>
              Save
            </button>
            <button className="btn btn-sm" onClick={() => (setEditing(false), setText(c.text))}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <p className="comment-text">{c.text}</p>
      )}
      {c.fileId && <FileLink fileId={c.fileId} name={c.fileName} />}
      {!editing && (onReply || c.editable) && (
        <footer>
          {onReply && (
            <button className="link-btn" onClick={onReply}>
              Reply
            </button>
          )}
          {c.editable && (
            <button className="link-btn" onClick={() => setEditing(true)}>
              Edit
            </button>
          )}
        </footer>
      )}
    </article>
  );
}

function Composer({
  caseId,
  parentId,
  screenshots,
  onPosted,
  onCancel,
}: {
  caseId: number;
  parentId?: number;
  screenshots: boolean;
  onPosted: (list: Comment[]) => void;
  onCancel?: () => void;
}) {
  const api = useApi();
  const boot = useBoot();
  const toast = useToast();
  const [text, setText] = useState('');
  const [type, setType] = useState<CommentType>(parentId ? 'General' : 'General');
  const [attachment, setAttachment] = useState<Attachment | null>(null);
  const [busy, setBusy] = useState(false);

  async function attach(file: File | null | undefined) {
    if (!file) return;
    try {
      setAttachment(await toAttachment(file, boot.limits.imageBytes));
    } catch (e) {
      toast(errorText(e), 'error');
    }
  }

  function onPaste(e: ClipboardEvent<HTMLTextAreaElement>) {
    if (!screenshots) return;
    const item = [...e.clipboardData.items].find((i) => i.type.startsWith('image/'));
    if (item) {
      e.preventDefault();
      attach(item.getAsFile());
    }
  }

  async function post() {
    setBusy(true);
    try {
      const res = await api.addComment({ caseId, text, type, parentId: parentId ?? null, attachment: attachment ?? undefined });
      onPosted(res.comments);
      setText('');
      setAttachment(null);
      setType('General');
    } catch (e) {
      toast(errorText(e), 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={`composer ${parentId ? 'composer-reply' : ''}`}>
      <textarea
        rows={parentId ? 2 : 3}
        placeholder={parentId ? 'Write a reply…' : screenshots ? 'Add a comment… (paste a screenshot with Ctrl+V)' : 'Add a comment…'}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onPaste={onPaste}
        autoFocus={!!parentId}
      />
      <div className="row wrap">
        <select value={type} onChange={(e) => setType(e.target.value as CommentType)} aria-label="Comment type">
          {boot.commentTypes.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
        {screenshots &&
          (attachment ? (
            <span className="chip">
              📎 {attachment.name}
              <button className="icon-btn" onClick={() => setAttachment(null)} aria-label="Remove attachment">
                ×
              </button>
            </span>
          ) : (
            <label className="btn btn-sm">
              Attach screenshot
              <input type="file" accept="image/png,image/jpeg,image/gif" hidden onChange={(e) => attach(e.target.files?.[0])} />
            </label>
          ))}
        <span className="spacer" />
        {onCancel && (
          <button className="btn btn-sm" onClick={onCancel}>
            Cancel
          </button>
        )}
        <button className="btn btn-primary btn-sm" disabled={busy || !text.trim()} onClick={post}>
          {busy ? 'Posting…' : parentId ? 'Reply' : 'Post comment'}
        </button>
      </div>
    </div>
  );
}
