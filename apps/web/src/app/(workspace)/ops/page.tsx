import type { Metadata } from 'next';
import { ComingSoon } from '@/components/layout/ComingSoon';

export const metadata: Metadata = { title: 'Operations' };

export default function OpsPage() {
  return (
    <ComingSoon title="The Operations workspace" phase={5}>
      The overview, assurance queue and claim review are built in Phase 5. Operations can already close a live demo auction from its lot page.
    </ComingSoon>
  );
}
