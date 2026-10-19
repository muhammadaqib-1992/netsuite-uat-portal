import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Api } from '../api/api';
import { ApiError } from '../api/api';
import type { Bootstrap, CaseStatus } from '../types';

export const ApiContext = createContext<Api | null>(null);
export const BootContext = createContext<Bootstrap | null>(null);

export function useApi(): Api {
  const api = useContext(ApiContext);
  if (!api) throw new Error('API not ready');
  return api;
}

export function useBoot(): Bootstrap {
  const boot = useContext(BootContext);
  if (!boot) throw new Error('Not loaded');
  return boot;
}

export function errorText(e: unknown): string {
  if (e instanceof ApiError || e instanceof Error) return e.message;
  return String(e);
}

const STATUS_CLASS: Record<CaseStatus, string> = {
  'Not Started': 'st-none',
  'In Progress': 'st-progress',
  Pass: 'st-pass',
  Fail: 'st-fail',
  Blocked: 'st-blocked',
  'N/A': 'st-na',
};

export function StatusPill({ status }: { status: CaseStatus }) {
  return <span className={`pill ${STATUS_CLASS[status] ?? 'st-none'}`}>{status}</span>;
}

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="spinner-wrap" role="status">
      <span className="spinner" aria-hidden />
      {label && <span>{label}</span>}
    </div>
  );
}

export function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${wide ? 'modal-wide' : ''}`} role="dialog" aria-modal aria-label={title}>
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

type Toast = { id: number; text: string; kind: 'ok' | 'error' };
const ToastContext = createContext<(text: string, kind?: Toast['kind']) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((text: string, kind: Toast['kind'] = 'ok') => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, text, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === 'error' ? 7000 : 3500);
  }, []);
  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="toasts" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.kind}`}>
            {t.text}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: ReactNode }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  );
}
