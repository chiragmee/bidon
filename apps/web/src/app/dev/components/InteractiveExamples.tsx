'use client';

import { Gavel } from 'lucide-react';
import { useState } from 'react';
import {
  Button,
  Checkbox,
  ConfirmDialog,
  Dialog,
  Field,
  Input,
  MoneyInput,
  Select,
  Textarea,
  useToast,
} from '@/components/ui';

export function InteractiveExamples() {
  const toast = useToast();
  const [confirm, setConfirm] = useState(false);
  const [form, setForm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [bid, setBid] = useState<number | null>(35_000);
  const [reserve, setReserve] = useState<number | null>(null);

  return (
    <section aria-labelledby="interactive-h" className="flex flex-col gap-md border-t border-border pt-lg">
      <h2 id="interactive-h" className="text-h2 text-text-strong">
        Buttons, forms, dialogs and toasts
      </h2>

      <div className="flex flex-wrap items-start gap-sm">
        <Button variant="primary" icon={<Gavel aria-hidden />} onClick={() => setConfirm(true)}>
          Place bid
        </Button>
        <Button variant="secondary">Secondary</Button>
        <Button variant="ghost">Ghost</Button>
        <Button variant="danger">Danger</Button>
        <Button variant="demo">Close demo auction</Button>
        <Button variant="primary" loading>
          Saving
        </Button>
        <Button variant="primary" disabled disabledReason="Pay the EMD to start bidding.">
          Place bid
        </Button>
      </div>
      <div className="max-w-[384px]">
        <Button variant="primary" size="lg" fullWidth>
          Place bid (large, full width)
        </Button>
      </div>

      <div className="grid max-w-[560px] gap-lg">
        <Field label="Your bid per MT" helper="Minimum ₹35,000/MT · increments of ₹500" required>
          <MoneyInput value={bid} onChange={setBid} perMt />
        </Field>
        <Field label="Reserve price per MT" error="Enter a reserve price per MT greater than ₹0, in whole rupees." required>
          <MoneyInput value={reserve} onChange={setReserve} perMt />
        </Field>
        <Field label="Business email" helper="Used for dispatch and tax invoices.">
          <Input type="email" placeholder="name@company.com" />
        </Field>
        <Field label="Material category">
          <Select defaultValue="ferrous_hms">
            <option value="ferrous_hms">Ferrous / HMS</option>
            <option value="non_ferrous">Non-ferrous</option>
          </Select>
        </Field>
        <Field label="Short explanation">
          <Textarea placeholder="What did you find at lifting?" />
        </Field>
        <Checkbox label="I agree to the Lot Assurance terms for this lot (demo policy)." />
      </div>

      <div className="flex flex-wrap gap-sm">
        <Button onClick={() => setForm(true)}>Open form dialog</Button>
        <Button onClick={() => toast.show('Bid placed — you are leading.', 'success')}>Show success toast</Button>
        <Button onClick={() => toast.show('Network error — nothing was changed.', 'error')}>Show error toast</Button>
      </div>

      <ConfirmDialog
        open={confirm}
        onClose={() => setConfirm(false)}
        busy={busy}
        title="Confirm your bid"
        consequence="₹35,000/MT on ~40 MT (estimated ₹14,00,000). Bids can’t be withdrawn."
        confirmLabel="Place bid"
        onConfirm={() => {
          setBusy(true);
          setTimeout(() => {
            setBusy(false);
            setConfirm(false);
            toast.show('Bid placed — you are leading.', 'success');
          }, 800);
        }}
      />
      <Dialog
        open={form}
        onClose={() => setForm(false)}
        size="form"
        title="Propose a lifting date"
        description="The seller confirms the date before lifting is scheduled."
        footer={
          <>
            <Button variant="ghost" onClick={() => setForm(false)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={() => setForm(false)}>
              Propose date
            </Button>
          </>
        }
      >
        <div className="grid gap-md">
          <Field label="Lifting date" required>
            <Input type="date" />
          </Field>
          <Field label="Vehicle number" required>
            <Input placeholder="MH 04 GP 8812" />
          </Field>
        </div>
      </Dialog>
    </section>
  );
}
