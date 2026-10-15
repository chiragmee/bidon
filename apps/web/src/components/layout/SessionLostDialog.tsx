'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Button, Dialog } from '@/components/ui';
import { ROLE_LABEL, SESSION_LOST_EVENT } from '@/data';
import { demoSessionFor } from '@/lib/session';
import { useSession } from '@/lib/SessionProvider';

/**
 * When a call says the session is gone (expired, or its account removed by a data reset), offer to
 * sign back in right here — no navigation, so whatever the person typed stays in the form.
 */
export function SessionLostDialog() {
  const { session, signInAs } = useSession();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const on = () => setOpen(true);
    window.addEventListener(SESSION_LOST_EVENT, on);
    return () => window.removeEventListener(SESSION_LOST_EVENT, on);
  }, []);

  const role = session.role === 'guest' ? 'buyer' : session.role;
  return (
    <Dialog
      open={open}
      onClose={() => setOpen(false)}
      title="Your session has ended"
      description="Nothing you typed on this page is lost. Sign in again, then repeat your last step."
      footer={
        <>
          <Link href="/sign-in" className="inline-flex h-10 items-center justify-center rounded-md px-4 text-label-md text-primary hover:bg-primary-container">
            Choose another account
          </Link>
          <Button
            variant="primary"
            onClick={() => {
              signInAs(demoSessionFor(role), window.location.pathname + window.location.search);
              setOpen(false);
            }}
          >
            Continue as demo {ROLE_LABEL[role].toLowerCase()}
          </Button>
        </>
      }
    >
      <p className="text-body-md text-text-secondary">This happens when a session expires or the demo data is reset in another tab.</p>
    </Dialog>
  );
}
