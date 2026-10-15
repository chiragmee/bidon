'use client';

import { UserPlus, Users } from 'lucide-react';
import { useState } from 'react';
import { AUTH_ENABLED } from '@/lib/flags';
import { REGIONS, REGION_LABEL, type Region, type StaffMemberView } from '@auctionit/domain';
import { Container, PageHeader } from '@/components/layout/Shells';
import { Banner, Button, Card, Checkbox, ConfirmDialog, EmptyState, ErrorState, Field, Input, RetryIcon, Skeleton, StatusBadge, useToast } from '@/components/ui';
import { useData, useQuery } from '@/data';
import { useSession } from '@/lib/SessionProvider';

function RegionPicker({ value, onChange, legend }: { value: Region[]; onChange: (r: Region[]) => void; legend: string }) {
  return (
    <fieldset className="flex flex-col gap-xs">
      <legend className="mb-xs text-label-md text-text-strong">{legend}</legend>
      <div className="flex flex-wrap gap-x-md gap-y-xs">
        {REGIONS.map((r) => (
          <Checkbox key={r} label={REGION_LABEL[r]} checked={value.includes(r)} onChange={(e) => onChange(e.target.checked ? [...value, r] : value.filter((x) => x !== r))} />
        ))}
      </div>
    </fieldset>
  );
}

/** Admin only (D-102): appoint regional reviewers, change their regions, remove them. */
export function TeamPage() {
  const { viewer, user } = useSession();
  const q = useQuery('team', (ds) => ds.team(viewer), { enabled: viewer.role === 'ops' });

  if (user && user.staffLevel !== 'admin') {
    return (
      <Container>
        <EmptyState icon={Users} headingLevel={1} title="Only the admin manages the team">
          Ask the Bid ON admin to change who reviews which region.
        </EmptyState>
      </Container>
    );
  }
  return (
    <Container className="flex flex-col gap-lg">
      <PageHeader overline="Operations" title="Team">
        Reviewers see and decide account applications only from their regions. You see every region, including applications with no state.
      </PageHeader>
      {q.error && !q.data ? (
        <ErrorState what="We couldn’t load the team." meaning="Nothing was changed." next="Try again." action={<Button onClick={q.reload} icon={<RetryIcon />}>Try again</Button>} />
      ) : !q.data ? (
        <Skeleton className="h-64" />
      ) : (
        <>
          {q.data.uncovered.length > 0 && (
            <Banner tone="warning" title={`No reviewer for ${q.data.uncovered.map((r) => REGION_LABEL[r]).join(', ')}`}>
              Applications from {q.data.uncovered.length === 1 ? 'this region' : 'these regions'} come to you alone until you appoint someone.
            </Banner>
          )}
          <Card>
            <h2 className="mb-sm text-h3 text-text-strong">Waiting for review, by region</h2>
            <ul className="grid grid-cols-2 gap-xs sm:grid-cols-3 lg:grid-cols-6">
              {[...REGIONS, 'unset' as const].map((r) => (
                <li key={r} className="rounded-md border border-border bg-canvas p-sm">
                  <span className="block text-caption text-text-secondary">{r === 'unset' ? 'Region not set' : REGION_LABEL[r]}</span>
                  <span className="block text-h3 tabular-nums text-text-strong">{q.data!.waitingByRegion[r]}</span>
                </li>
              ))}
            </ul>
          </Card>
          <Appoint onDone={q.reload} />
          <Card>
            <h2 className="mb-xs text-h3 text-text-strong">Staff ({q.data.members.length})</h2>
            <ul className="flex flex-col divide-y divide-border">
              {q.data.members.map((m) => (
                <Member key={m.id} m={m} onDone={q.reload} />
              ))}
            </ul>
          </Card>
        </>
      )}
    </Container>
  );
}

function Appoint({ onDone }: { onDone: () => void }) {
  const { ds } = useData();
  const { viewer } = useSession();
  const toast = useToast();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [regions, setRegions] = useState<Region[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <Card className="flex flex-col gap-md">
      <h2 className="flex items-center gap-xs text-h3 text-text-strong">
        <UserPlus className="size-5 text-primary" aria-hidden /> Appoint a reviewer
      </h2>
      <form
        className="flex flex-col gap-md"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError(null);
          const r = await ds.appointReviewer({ name, email, regions }, viewer);
          setBusy(false);
          if (!r.ok) return setError(`${r.error.what} ${r.error.next}`);
          toast.show(AUTH_ENABLED ? `Invitation sent to ${r.data.email}.` : `${r.data.name} is now a reviewer.`, 'success');
          setName('');
          setEmail('');
          setRegions([]);
          onDone();
        }}
      >
        <div className="grid gap-md sm:grid-cols-2">
          <Field label="Full name" required>
            <Input value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" />
          </Field>
          <Field label="Work email" required helper={AUTH_ENABLED ? 'They get an email to choose a password.' : undefined}>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" />
          </Field>
        </div>
        <RegionPicker legend="Regions they review" value={regions} onChange={setRegions} />
        {error && <Banner tone="danger" title={error} />}
        <div>
          <Button type="submit" variant="primary" disabled={busy || !name.trim() || !email.trim() || !regions.length}>
            {AUTH_ENABLED ? 'Send invitation' : 'Appoint reviewer'}
          </Button>
        </div>
      </form>
    </Card>
  );
}

function Member({ m, onDone }: { m: StaffMemberView; onDone: () => void }) {
  const { ds } = useData();
  const { viewer } = useSession();
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [regions, setRegions] = useState<Region[]>(m.regions);
  const [removing, setRemoving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reviewer = m.level === 'reviewer';
  return (
    <li className="flex flex-col gap-sm py-sm">
      <div className="flex flex-wrap items-start justify-between gap-sm">
        <span className="min-w-0">
          <span className="flex flex-wrap items-center gap-xs text-label-md text-text-strong">
            {m.name}
            <StatusBadge kind={reviewer ? 'neutral' : 'success'}>{reviewer ? 'Reviewer' : 'Admin'}</StatusBadge>
          </span>
          <span className="block break-all text-caption text-text-secondary">{m.email}</span>
          <span className="mt-1 block text-body-md text-text">
            {reviewer ? m.regions.map((r) => REGION_LABEL[r]).join(', ') : 'All regions'} · {m.waiting} waiting
          </span>
        </span>
        {reviewer && !editing && (
          <span className="flex flex-wrap gap-xs">
            <Button variant="ghost" onClick={() => setEditing(true)} aria-label={`Change regions for ${m.name}`}>
              Change regions
            </Button>
            <Button variant="ghost" onClick={() => setRemoving(true)} aria-label={`Remove ${m.name}`}>
              Remove
            </Button>
          </span>
        )}
      </div>
      {editing && (
        <div className="flex flex-col gap-sm rounded-md bg-canvas p-sm">
          <RegionPicker legend={`Regions ${m.name} reviews`} value={regions} onChange={setRegions} />
          {error && <p className="text-caption text-danger">{error}</p>}
          <span className="flex gap-xs">
            <Button
              variant="primary"
              disabled={busy || !regions.length}
              onClick={async () => {
                setBusy(true);
                const r = await ds.setReviewerRegions(m.id, regions, viewer);
                setBusy(false);
                if (!r.ok) return setError(r.error.what);
                toast.show('Regions updated.', 'success');
                setEditing(false);
                onDone();
              }}
            >
              Save regions
            </Button>
            <Button variant="ghost" onClick={() => (setEditing(false), setRegions(m.regions), setError(null))}>
              Cancel
            </Button>
          </span>
        </div>
      )}
      <ConfirmDialog
        open={removing}
        onClose={() => setRemoving(false)}
        busy={busy}
        tone="danger"
        title={`Remove ${m.name}?`}
        consequence="They lose access to Operations straight away. Their past decisions stay on record, and you can appoint them again later."
        confirmLabel="Remove reviewer"
        onConfirm={async () => {
          setBusy(true);
          const r = await ds.removeReviewer(m.id, viewer);
          setBusy(false);
          setRemoving(false);
          if (!r.ok) return setError(r.error.what);
          toast.show(`${m.name} was removed.`, 'success');
          onDone();
        }}
      />
    </li>
  );
}
