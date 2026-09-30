import { redirect } from 'next/navigation';

import { AppShell } from '@/components/shell/app-shell';
import { getCurrentUser } from '@/server/auth';

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  return <AppShell user={user}>{children}</AppShell>;
}
