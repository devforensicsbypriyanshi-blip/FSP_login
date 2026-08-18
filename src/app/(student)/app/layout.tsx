import type { Metadata } from 'next';
import type * as React from 'react';
import { PortalLayout } from '@/components/layout/portal-layout';

export const metadata: Metadata = { title: { default: 'Dashboard', template: '%s · FSP' } };

export default function Layout({ children }: { children: React.ReactNode }) {
  return <PortalLayout role="student">{children}</PortalLayout>;
}
