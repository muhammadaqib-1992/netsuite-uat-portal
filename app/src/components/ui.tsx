import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Api } from '../api/api';
import { ApiError } from '../api/api';
import type { Bootstrap, CaseStatus } from '../types';
import { CloseIcon, MonitorIcon, MoonIcon, SunIcon } from './icons';

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

export const statusClass = (s: CaseStatus) => STATUS_CLASS[s] ?? 'st-none';

export function StatusPill({ status }: { status: CaseStatus }) {
  return (
    <span className={`pill ${statusClass(status)}`}>
      <span className="dot" aria-hidden />
      {status}
    </span>
  );
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
            <CloseIcon />
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

type ThemeChoice = 'system' | 'light' | 'dark';
const THEME_KEY = 'uat-portal-theme';
const NEXT_THEME: Record<ThemeChoice, ThemeChoice> = { system: 'light', light: 'dark', dark: 'system' };

function readTheme(): ThemeChoice {
  try {
    const v = localStorage.getItem(THEME_KEY);
    return v === 'light' || v === 'dark' ? v : 'system';
  } catch {
    return 'system';
  }
}

function applyTheme(t: ThemeChoice) {
  if (t === 'system') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = t;
}

applyTheme(readTheme());

/** Cycles System → Light → Dark; remembered in this browser only. */
export function ThemeToggle() {
  const [theme, setTheme] = useState<ThemeChoice>(readTheme);
  function next() {
    const t = NEXT_THEME[theme];
    setTheme(t);
    applyTheme(t);
    try {
      localStorage.setItem(THEME_KEY, t);
    } catch {
      /* storage unavailable: the choice lasts for this page only */
    }
  }
  const label = `Theme: ${theme}`;
  return (
    <button className="icon-btn topbar-icon" onClick={next} title={`${label} (click to change)`} aria-label={label}>
      {theme === 'light' ? <SunIcon /> : theme === 'dark' ? <MoonIcon /> : <MonitorIcon />}
    </button>
  );
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? '?') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

export function Avatar({ name, team }: { name: string; team?: boolean }) {
  return (
    <span className={`avatar ${team ? 'avatar-team' : ''}`} aria-hidden>
      {initials(name || '?')}
    </span>
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: ReactNode }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  );
}
