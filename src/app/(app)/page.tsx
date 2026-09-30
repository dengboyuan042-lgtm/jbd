import type { Metadata } from 'next';

import { HomeWorkspace } from '@/features/home/home-workspace';

export const metadata: Metadata = { title: 'Home' };

export default function HomePage() {
  return <HomeWorkspace />;
}
