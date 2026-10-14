import type { Metadata } from 'next';
import { ComingSoon } from '@/components/layout/ComingSoon';

export const metadata: Metadata = { title: 'New lot' };

export default function NewLotPage() {
  return (
    <ComingSoon title="The listing wizard" phase={4}>
      The four-step listing wizard with evidence upload, preview and publish is built in Phase 4.
    </ComingSoon>
  );
}
