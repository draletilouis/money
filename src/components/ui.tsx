import { AlertCircle, LoaderCircle, X } from 'lucide-react';
import type { ReactNode } from 'react';

export function Modal({ title, description, children, onClose, wide = false }: { title: string; description?: string; children: ReactNode; onClose: () => void; wide?: boolean }) {
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <section className={`modal ${wide ? 'modal-wide' : ''}`} role="dialog" aria-modal="true" aria-labelledby="modal-title">
      <header className="modal-header"><div><h2 id="modal-title">{title}</h2>{description && <p>{description}</p>}</div><button className="icon-button" onClick={onClose} aria-label="Close"><X size={20}/></button></header>
      {children}
    </section>
  </div>;
}

export function Loading({ label = 'Loading your finances' }: { label?: string }) {
  return <div className="state-card"><LoaderCircle className="spin"/><strong>{label}</strong><span>Just a moment…</span></div>;
}

export function EmptyState({ icon, title, message, action }: { icon?: ReactNode; title: string; message: string; action?: ReactNode }) {
  return <div className="empty-state">{icon}<h3>{title}</h3><p>{message}</p>{action}</div>;
}

export function ErrorState({ message, retry }: { message: string; retry?: () => void }) {
  return <div className="error-state"><AlertCircle/><div><strong>We couldn’t load this</strong><p>{message}</p></div>{retry && <button className="button secondary" onClick={retry}>Try again</button>}</div>;
}

export function StatusBadge({ status }: { status: string }) { return <span className={`status status-${status.toLowerCase()}`}>{status.toLowerCase().replaceAll('_', ' ')}</span>; }

export const formatMoney = (amount: string | number, currency = 'UGX', compact = false) => new Intl.NumberFormat('en-UG', { style: 'currency', currency, maximumFractionDigits: currency === 'UGX' ? 0 : 2, notation: compact ? 'compact' : 'standard' }).format(Number(amount));
export const formatDate = (date: string | Date) => new Intl.DateTimeFormat('en-UG', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(date));

