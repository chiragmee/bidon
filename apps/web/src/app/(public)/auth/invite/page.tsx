import type { Metadata } from 'next';
import { AcceptInviteForm } from '@/components/auth/AuthForms';

export const metadata: Metadata = { title: 'Accept invitation' };

export default function Page() {
  return <AcceptInviteForm />;
}
