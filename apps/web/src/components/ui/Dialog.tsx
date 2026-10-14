'use client';

import { X } from 'lucide-react';
import type { ReactNode } from 'react';
import { useEffect, useId, useRef } from 'react';
import { cn } from '@/lib/cn';
import { Button } from './Button';

/**
 * Modal on the native <dialog>: focus trap, Escape and inert background come from the browser.
 * 480px for confirmations, 640px for forms (DESIGN.md Modals).
 */
export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'confirm',
  dismissible = true,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  /** One-line consequence of the action. */
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  size?: 'confirm' | 'form';
  /** Set false while a request is in flight so it can't be dismissed mid-submit. */
  dismissible?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descId = useId();

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    // Backdrop click is a mouse convenience; keyboard users close with Escape (native `cancel`).
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={description ? descId : undefined}
      onCancel={(e) => {
        e.preventDefault();
        if (dismissible) onClose();
      }}
      onClick={(e) => {
        // Click on the backdrop (the dialog element itself, outside the panel) closes it.
        if (e.target === e.currentTarget && dismissible) onClose();
      }}
      className={cn(
        'm-auto w-[calc(100%-2rem)] rounded-lg border border-border bg-surface p-0 text-text shadow-3',
        'backdrop:bg-text-strong/40',
        size === 'confirm' ? 'max-w-[480px]' : 'max-w-[640px]',
      )}
    >
      {open && (
        <div className="flex max-h-[85vh] flex-col">
          <div className="flex items-start justify-between gap-md p-lg pb-sm">
            <div>
              <h2 id={titleId} className="text-h3 text-text-strong">
                {title}
              </h2>
              {description && (
                <p id={descId} className="mt-1 text-body-md text-text-secondary">
                  {description}
                </p>
              )}
            </div>
            {dismissible && (
              <button type="button" onClick={onClose} aria-label="Close" className="-m-1 rounded-md p-1 text-text-secondary hover:bg-surface-muted">
                <X className="size-5" aria-hidden />
              </button>
            )}
          </div>
          {children && <div className="overflow-y-auto px-lg pb-sm">{children}</div>}
          {footer && <div className="flex flex-col-reverse gap-xs border-t border-border p-md sm:flex-row sm:justify-end">{footer}</div>}
        </div>
      )}
    </dialog>
  );
}

/** Consequential actions always confirm (CLAUDE.md UI rules). */
export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  consequence,
  confirmLabel,
  tone = 'primary',
  busy = false,
  children,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: ReactNode;
  consequence: ReactNode;
  confirmLabel: string;
  tone?: 'primary' | 'danger' | 'demo';
  busy?: boolean;
  children?: ReactNode;
}) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      description={consequence}
      dismissible={!busy}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant={tone} onClick={onConfirm} loading={busy}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      {children}
    </Dialog>
  );
}
