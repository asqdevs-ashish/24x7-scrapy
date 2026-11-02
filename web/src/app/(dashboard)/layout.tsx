import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { Sidebar } from '@/components/layout/Sidebar';
import { AppProviders } from '@/components/providers/AppProviders';
import { getAuthConfig, SESSION_COOKIE, verifySessionToken } from '@/lib/auth';

// Never prerender: the shell depends on the request's session cookie.
export const dynamic = 'force-dynamic';

// Second line of defence behind the middleware: the dashboard shell itself
// refuses to render without a valid session.
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const cfg = getAuthConfig();
  const session = cfg ? await verifySessionToken(cfg, token) : null;
  if (!session) redirect('/login');

  return (
    <AppProviders>
      <Sidebar user={session.u} />
      <div className="lg:pl-[17.5rem]">
        <main className="mx-auto w-full max-w-[1500px] px-4 pb-16 pt-6 sm:px-6 lg:px-8 lg:pt-8">{children}</main>
      </div>
    </AppProviders>
  );
}
