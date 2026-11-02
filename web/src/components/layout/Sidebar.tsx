'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { LayoutDashboard, LogOut, Menu, Radar, Users, X } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { cn } from '@/lib/cn';

const NAV = [
  { href: '/', label: 'Overview', icon: LayoutDashboard },
  { href: '/leads', label: 'Leads', icon: Users },
];

function Brand() {
  return (
    <Link href="/" className="flex items-center gap-3 px-2">
      <span className="grid size-9 place-items-center rounded-xl bg-[linear-gradient(135deg,#3b6dff,#9b6bff)] shadow-glow-violet">
        <Radar className="size-[18px] text-white" />
      </span>
      <span className="leading-tight">
        <span className="block text-[15px] font-semibold tracking-tight text-white">Realtor Leads</span>
        <span className="block text-[11px] uppercase tracking-[0.16em] text-slate-500">Intelligence</span>
      </span>
    </Link>
  );
}

function NavLinks({ layoutId, onNavigate }: { layoutId: string; onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav className="flex flex-col gap-1">
      {NAV.map(({ href, label, icon: Icon }) => {
        const active = href === '/' ? pathname === '/' : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            onClick={onNavigate}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors',
              active ? 'text-white' : 'text-slate-400 hover:bg-white/[0.04] hover:text-slate-100',
            )}
          >
            {active && (
              <motion.span
                layoutId={layoutId}
                transition={{ type: 'spring', stiffness: 400, damping: 34 }}
                className="absolute inset-0 rounded-xl border border-white/10 bg-[linear-gradient(110deg,rgb(77_141_255/0.2),rgb(155_107_255/0.12))]"
              >
                <span className="absolute inset-y-2 left-0 w-[3px] rounded-full bg-neon-blue shadow-glow-blue" />
              </motion.span>
            )}
            <Icon className={cn('relative size-[18px]', active && 'text-neon-blue')} />
            <span className="relative">{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

function UserBlock({ user }: { user: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function signOut() {
    setBusy(true);
    await fetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
    router.replace('/login');
    router.refresh();
  }

  return (
    <div className="flex items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] p-2.5">
      <span className="grid size-8 place-items-center rounded-lg bg-obsidian-700 text-xs font-semibold uppercase text-slate-200">
        {user.slice(0, 2)}
      </span>
      <span className="min-w-0 flex-1 truncate text-sm text-slate-300">{user}</span>
      <button
        onClick={signOut}
        disabled={busy}
        aria-label="Sign out"
        title="Sign out"
        className="grid size-8 place-items-center rounded-lg text-slate-500 transition-colors hover:bg-rose-500/10 hover:text-rose-300 disabled:opacity-50"
      >
        <LogOut className="size-4" />
      </button>
    </div>
  );
}

export function Sidebar({ user }: { user: string }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => setOpen(false), [pathname]);

  return (
    <>
      {/* Desktop */}
      <aside className="glass fixed inset-y-3 left-3 z-40 hidden w-64 flex-col rounded-2xl p-4 lg:flex">
        <Brand />
        <div className="my-6 h-px bg-white/[0.06]" />
        <NavLinks layoutId="nav-active-desktop" />
        <div className="mt-auto">
          <UserBlock user={user} />
        </div>
      </aside>

      {/* Mobile top bar */}
      <header className="glass sticky top-0 z-40 flex items-center justify-between border-x-0 border-t-0 px-4 py-3 lg:hidden">
        <Brand />
        <button
          onClick={() => setOpen(true)}
          aria-label="Open menu"
          className="grid size-10 place-items-center rounded-xl border border-white/10 text-slate-300"
        >
          <Menu className="size-5" />
        </button>
      </header>

      <AnimatePresence>
        {open && (
          <div className="fixed inset-0 z-50 lg:hidden">
            <motion.div
              className="absolute inset-0 bg-obsidian-950/70 backdrop-blur-sm"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setOpen(false)}
            />
            <motion.aside
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', stiffness: 360, damping: 36 }}
              className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col border-r border-white/10 bg-obsidian-900 p-4"
            >
              <div className="flex items-center justify-between">
                <Brand />
                <button
                  onClick={() => setOpen(false)}
                  aria-label="Close menu"
                  className="grid size-9 place-items-center rounded-xl text-slate-400 hover:bg-white/5"
                >
                  <X className="size-5" />
                </button>
              </div>
              <div className="my-6 h-px bg-white/[0.06]" />
              <NavLinks layoutId="nav-active-mobile" onNavigate={() => setOpen(false)} />
              <div className="mt-auto">
                <UserBlock user={user} />
              </div>
            </motion.aside>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}
