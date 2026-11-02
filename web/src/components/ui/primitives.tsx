'use client';

import { animate, motion, useInView, useMotionValue, useTransform } from 'framer-motion';
import { useEffect, useRef, type ReactNode } from 'react';
import { cn } from '@/lib/cn';
import type { JobStatus } from '@/lib/types';

/* ------------------------------- Card ------------------------------- */

export function Card({
  title,
  subtitle,
  icon,
  actions,
  children,
  className,
  delay = 0,
}: {
  title?: ReactNode;
  subtitle?: ReactNode;
  icon?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  delay?: number;
}) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay, ease: [0.22, 1, 0.36, 1] }}
      className={cn('glass relative rounded-2xl p-5 shadow-[0_20px_60px_-30px_rgb(0_0_0/0.9)] sm:p-6', className)}
    >
      {(title || actions) && (
        <header className="mb-5 flex flex-wrap items-start gap-3">
          {icon && (
            <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-white/10 bg-[linear-gradient(135deg,rgb(77_141_255/0.18),rgb(155_107_255/0.18))] text-neon-blue">
              {icon}
            </span>
          )}
          <div className="min-w-0 flex-1">
            {title && <h2 className="text-[17px] font-semibold tracking-tight text-white">{title}</h2>}
            {subtitle && <p className="mt-0.5 text-sm text-slate-400">{subtitle}</p>}
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </header>
      )}
      {children}
    </motion.section>
  );
}

/* ---------------------------- Status pill --------------------------- */

const STATUS_STYLE: Record<JobStatus, { label: string; cls: string; dot: string }> = {
  pending: {
    label: 'Pending',
    cls: 'text-amber-300 bg-amber-400/10 border-amber-400/30 shadow-[0_0_14px_-4px_rgb(251_191_36/0.55)]',
    dot: 'bg-amber-300',
  },
  running: {
    label: 'Running',
    cls: 'text-sky-300 bg-sky-400/10 border-sky-400/35 shadow-[0_0_16px_-3px_rgb(56_189_248/0.7)]',
    dot: 'bg-sky-300',
  },
  completed: {
    label: 'Completed',
    cls: 'text-emerald-300 bg-emerald-400/10 border-emerald-400/30 shadow-[0_0_14px_-4px_rgb(52_211_153/0.55)]',
    dot: 'bg-emerald-300',
  },
  paused: {
    label: 'Paused',
    cls: 'text-violet-200 bg-violet-400/10 border-violet-400/35 shadow-[0_0_14px_-4px_rgb(167_139_250/0.6)]',
    dot: 'bg-violet-300',
  },
  failed: {
    label: 'Failed',
    cls: 'text-rose-300 bg-rose-400/10 border-rose-400/35 shadow-[0_0_14px_-4px_rgb(251_113_133/0.6)]',
    dot: 'bg-rose-300',
  },
};

export function StatusPill({ status }: { status: JobStatus }) {
  const s = STATUS_STYLE[status];
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium', s.cls)}>
      <span className="relative flex size-1.5">
        {status === 'running' && (
          <span className={cn('absolute inline-flex size-full animate-ping rounded-full opacity-75', s.dot)} />
        )}
        <span className={cn('relative inline-flex size-1.5 rounded-full', s.dot)} />
      </span>
      {s.label}
    </span>
  );
}

/* ------------------------- Segmented control ------------------------ */

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  layoutId,
  size = 'md',
  className,
}: {
  options: { value: T; label: ReactNode }[];
  value: T;
  onChange: (v: T) => void;
  layoutId: string;
  size?: 'sm' | 'md';
  className?: string;
}) {
  return (
    <div
      role="radiogroup"
      className={cn('inline-flex rounded-xl border border-white/[0.08] bg-obsidian-900/80 p-1', className)}
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.value)}
            className={cn(
              'relative flex-1 whitespace-nowrap rounded-lg font-medium transition-colors',
              size === 'sm' ? 'px-2.5 py-1 text-xs' : 'px-3.5 py-1.5 text-sm',
              active ? 'text-white' : 'text-slate-400 hover:text-slate-200',
            )}
          >
            {active && (
              <motion.span
                layoutId={layoutId}
                transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                className="absolute inset-0 rounded-lg border border-white/10 bg-[linear-gradient(120deg,rgb(77_141_255/0.35),rgb(155_107_255/0.35))] shadow-glow-blue"
              />
            )}
            <span className="relative z-10 inline-flex items-center gap-1.5">{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}

/* ------------------------------- Switch ----------------------------- */

export function Switch({
  checked,
  onChange,
  label,
  description,
  icon,
  tone = 'blue',
  className,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  tone?: 'blue' | 'amber';
  className?: string;
}) {
  const on =
    tone === 'amber'
      ? 'border-amber-400/60 bg-amber-400/30 shadow-[0_0_18px_-4px_rgb(251_191_36/0.8)]'
      : 'border-neon-blue/60 bg-neon-blue/30 shadow-[0_0_18px_-4px_rgb(77_141_255/0.8)]';

  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={cn(
        'group flex w-full items-center gap-3 rounded-xl border px-3.5 py-3 text-left transition-colors',
        checked
          ? tone === 'amber'
            ? 'border-amber-400/30 bg-amber-400/[0.06]'
            : 'border-neon-blue/30 bg-neon-blue/[0.06]'
          : 'border-white/[0.08] bg-obsidian-900/50 hover:border-white/15',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neon-blue/60',
        className,
      )}
    >
      {icon && (
        <span className={cn('shrink-0 transition-colors', checked ? (tone === 'amber' ? 'text-amber-300' : 'text-neon-blue') : 'text-slate-500')}>
          {icon}
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-slate-100">{label}</span>
        {description && <span className="mt-0.5 block text-xs text-slate-500">{description}</span>}
      </span>
      <span
        className={cn(
          'relative h-6 w-11 shrink-0 rounded-full border transition-[background,border-color,box-shadow]',
          checked ? on : 'border-white/15 bg-white/[0.04]',
        )}
      >
        <motion.span
          layout
          transition={{ type: 'spring', stiffness: 600, damping: 32 }}
          className={cn('absolute top-0.5 size-[18px] rounded-full bg-white shadow', checked ? 'right-0.5' : 'left-0.5')}
        />
      </span>
    </button>
  );
}

/* -------------------------------- Chip ------------------------------ */

export function Chip({
  active,
  onClick,
  children,
  role = 'button',
  className,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
  role?: 'button' | 'checkbox' | 'radio';
  className?: string;
}) {
  return (
    <motion.button
      type="button"
      role={role}
      aria-checked={role === 'button' ? undefined : active}
      aria-pressed={role === 'button' ? active : undefined}
      onClick={onClick}
      whileTap={{ scale: 0.93 }}
      layout
      className={cn(
        'relative inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-[color,background,border-color,box-shadow] duration-200',
        active
          ? 'border-neon-blue/60 bg-neon-blue/15 text-white shadow-[0_0_18px_-6px_rgb(77_141_255/0.9)]'
          : 'border-white/10 bg-white/[0.03] text-slate-400 hover:border-white/20 hover:text-slate-200',
        className,
      )}
    >
      {children}
    </motion.button>
  );
}

/* ---------------------------- Animated number ----------------------- */

export function AnimatedNumber({ value, className }: { value: number; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true });
  const mv = useMotionValue(0);
  const rounded = useTransform(mv, (v) => Math.round(v).toLocaleString('en-IN'));

  useEffect(() => {
    if (!inView) return;
    const controls = animate(mv, value, { duration: 1.1, ease: [0.22, 1, 0.36, 1] });
    return () => controls.stop();
  }, [inView, value, mv]);

  return (
    <motion.span ref={ref} className={cn('tabular-nums', className)}>
      {rounded}
    </motion.span>
  );
}

/* ------------------------------ Skeleton ---------------------------- */

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'animate-shimmer rounded-md bg-[linear-gradient(90deg,rgb(255_255_255/0.03)_0%,rgb(255_255_255/0.08)_50%,rgb(255_255_255/0.03)_100%)] bg-[length:200%_100%]',
        className,
      )}
    />
  );
}

/* ----------------------------- Empty state -------------------------- */

export function EmptyState({ icon, title, description }: { icon: ReactNode; title: string; description?: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      className="flex flex-col items-center justify-center gap-3 px-6 py-14 text-center"
    >
      <span className="grid size-12 place-items-center rounded-2xl border border-white/10 bg-white/[0.03] text-slate-500">
        {icon}
      </span>
      <p className="text-sm font-medium text-slate-200">{title}</p>
      {description && <p className="max-w-sm text-xs text-slate-500">{description}</p>}
    </motion.div>
  );
}
