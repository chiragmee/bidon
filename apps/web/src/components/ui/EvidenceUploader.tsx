'use client';

import { Camera, FileText, LoaderCircle, RotateCcw, Trash2, Upload, Video } from 'lucide-react';
import { useId, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import type { CategoryId, LotMedia } from '@auctionit/domain';
import { useData } from '@/data';
import { useSession } from '@/lib/SessionProvider';
import { cn } from '@/lib/cn';
import { ACCEPT, UPLOAD_RULES, validateUpload } from '@/lib/uploads';
import { LotImage } from './LotImage';

interface Pending {
  key: string;
  file: File;
  status: 'uploading' | 'failed';
  error?: string;
}

const ICON = { photo: Camera, video: Video, document: FileText } as const;

/**
 * Evidence files with progress, specific type/size errors, retry and remove (SPEC §13 step 3,
 * §16). Files are only attached when the form they belong to is submitted. Location metadata is
 * never claimed as verified — we only attach the file.
 */
export function EvidenceUploader({
  label,
  helper,
  stage,
  kinds = ['photo', 'video', 'document'],
  value,
  onChange,
  min = 0,
  category = 'ferrous_hms',
  error,
}: {
  label: string;
  helper?: string;
  stage: LotMedia['stage'];
  kinds?: LotMedia['kind'][];
  value: LotMedia[];
  /** A state setter: uploads finish at different times, so updates are functional. */
  onChange: Dispatch<SetStateAction<LotMedia[]>>;
  min?: number;
  category?: CategoryId;
  error?: string | null;
}) {
  const { ds } = useData();
  const { viewer } = useSession();
  const inputId = useId();
  const input = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<Pending[]>([]);
  const [rejected, setRejected] = useState<string[]>([]);

  async function upload(p: Pending) {
    setPending((xs) => [...xs.filter((x) => x.key !== p.key), { ...p, status: 'uploading', error: undefined }]);
    const r = await ds.uploadMedia(p.file, stage, viewer);
    if (r.ok) {
      setPending((xs) => xs.filter((x) => x.key !== p.key));
      onChange((prev) => [...prev, r.data]);
    } else {
      setPending((xs) => xs.map((x) => (x.key === p.key ? { ...x, status: 'failed', error: `${r.error.what} ${r.error.next}` } : x)));
    }
  }

  function add(files: FileList | null) {
    if (!files) return;
    const bad: string[] = [];
    for (const file of Array.from(files)) {
      const problem = validateUpload(file, kinds);
      if (problem) bad.push(problem);
      else void upload({ key: `${file.name}-${file.size}-${Math.random()}`, file, status: 'uploading' });
    }
    setRejected(bad);
    if (input.current) input.current.value = '';
  }

  const accept = kinds.flatMap((k) => UPLOAD_RULES[k].types).join(',') || ACCEPT;
  const count = value.length;

  return (
    <fieldset className="flex flex-col gap-sm">
      <legend className="text-label-md text-text-strong">
        {label}
        {min > 0 && <span className="text-danger" aria-hidden> *</span>}
      </legend>
      {helper && <p className="-mt-1 text-caption text-text-secondary">{helper}</p>}

      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          add(e.dataTransfer.files);
        }}
        className={cn('flex flex-col items-center gap-xs rounded-md border border-dashed bg-surface px-md py-md text-center', error ? 'border-danger' : 'border-border-control')}
      >
        <Upload className="size-5 text-text-secondary" aria-hidden />
        <label htmlFor={inputId} className="cursor-pointer text-label-md text-primary underline">
          Choose files
        </label>
        <input ref={input} id={inputId} type="file" multiple accept={accept} className="sr-only" onChange={(e) => add(e.target.files)} />
        <p className="text-caption text-text-secondary">
          or drag them here · {kinds.map((k) => `${UPLOAD_RULES[k].label} up to ${UPLOAD_RULES[k].maxBytes / 1024 / 1024} MB`).join(' · ')}
        </p>
      </div>

      <p aria-live="polite" className={cn('text-caption', min > 0 && count < min ? 'text-warning' : 'text-text-secondary')}>
        {count} file{count === 1 ? '' : 's'} attached{min > 0 ? ` · at least ${min} needed` : ''}
      </p>
      {error && <p className="text-caption text-danger">{error}</p>}
      {rejected.map((r) => (
        <p key={r} role="alert" className="text-caption text-danger">
          {r}
        </p>
      ))}

      {(value.length > 0 || pending.length > 0) && (
        <ul className="grid gap-xs sm:grid-cols-2">
          {value.map((m) => {
            const Icon = ICON[m.kind];
            return (
              <li key={m.id} className="flex items-center gap-xs rounded-md border border-border bg-surface p-xs">
                {m.kind === 'photo' ? (
                  <LotImage src={m.url || null} alt={m.caption} category={category} ratio="1/1" sizes="48px" className="w-12 shrink-0 rounded-sm" />
                ) : (
                  <span className="grid size-12 shrink-0 place-items-center rounded-sm bg-surface-muted">
                    <Icon className="size-5 text-text-secondary" aria-hidden />
                  </span>
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-body-md">{m.caption}</span>
                  <span className="text-caption text-success">Attached</span>
                </span>
                <button type="button" onClick={() => onChange((prev) => prev.filter((x) => x.id !== m.id))} className="rounded p-1 text-text-secondary hover:bg-surface-muted" aria-label={`Remove ${m.caption}`}>
                  <Trash2 className="size-4" aria-hidden />
                </button>
              </li>
            );
          })}
          {pending.map((p) => (
            <li key={p.key} className={cn('flex flex-col gap-1 rounded-md border p-xs', p.status === 'failed' ? 'border-danger/30 bg-danger-container' : 'border-border bg-surface')}>
              <div className="flex items-center gap-xs">
                {p.status === 'uploading' ? <LoaderCircle className="size-4 animate-spin text-primary" aria-hidden /> : null}
                <span className="min-w-0 flex-1 truncate text-body-md">{p.file.name}</span>
                {p.status === 'failed' && (
                  <>
                    <button type="button" onClick={() => void upload(p)} className="flex items-center gap-1 rounded px-1 text-caption font-medium text-primary underline">
                      <RotateCcw className="size-3.5" aria-hidden /> Retry
                    </button>
                    <button type="button" onClick={() => setPending((xs) => xs.filter((x) => x.key !== p.key))} className="rounded p-1 text-text-secondary" aria-label={`Remove ${p.file.name}`}>
                      <Trash2 className="size-4" aria-hidden />
                    </button>
                  </>
                )}
              </div>
              {p.status === 'uploading' ? (
                <div className="h-1 overflow-hidden rounded-full bg-surface-muted" role="progressbar" aria-label={`Uploading ${p.file.name}`}>
                  <div className="h-full w-1/2 animate-pulse rounded-full bg-primary" />
                </div>
              ) : (
                <p className="text-caption text-danger">{p.error}</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </fieldset>
  );
}
