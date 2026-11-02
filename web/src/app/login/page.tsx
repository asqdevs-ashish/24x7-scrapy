import type { Metadata } from 'next';
import { safeNextPath } from '@/lib/auth';
import { LoginForm } from '@/components/auth/LoginForm';

export const metadata: Metadata = { title: 'Sign in · Realtor Leads' };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return <LoginForm next={safeNextPath(next)} />;
}
