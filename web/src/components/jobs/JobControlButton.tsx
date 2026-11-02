'use client';

import { motion } from 'framer-motion';
import { Loader2, Pause, Play, RotateCcw } from 'lucide-react';
import { useState } from 'react';
import { useToast } from '@/components/providers/ToastProvider';
import { cn } from '@/lib/cn';
import { fetchJson } from '@/lib/hooks';
import type { JobDTO, TriggerInfo } from '@/lib/types';

// Play / Pause for one job. Pause: pending|running → paused. Play: paused → pending,
// failed → pending (retry). Completed jobs have no control.
export function JobControlButton({ job, onChanged, size = 'md' }: { job: JobDTO; onChanged: () => void; size?: 'sm' | 'md' }) {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);

  const action = job.status === 'pending' || job.status === 'running' ? 'pause' : job.status === 'paused' || job.status === 'failed' ? 'resume' : null;
  if (!action) return <span className={size === 'sm' ? 'size-8' : 'size-9'} aria-hidden />;

  const label =
    action === 'pause'
      ? job.status === 'running'
        ? 'Pause (the worker stops at its next heartbeat)'
        : 'Pause (keep it out of the queue)'
      : job.status === 'failed'
        ? 'Retry from where it stopped'
        : 'Resume from where it stopped';

  async function toggle(e: React.MouseEvent) {
    e.stopPropagation(); // the row itself opens the leads modal
    setBusy(true);
    try {
      const res = await fetchJson<{ trigger: TriggerInfo | null }>(`/api/jobs/${job.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      toast({
        kind: 'success',
        title: action === 'pause' ? `Job #${job.id} paused` : `Job #${job.id} back in the queue`,
        description:
          action === 'pause'
            ? job.status === 'running'
              ? 'The worker saves its progress and stops within ~90 seconds.'
              : undefined
            : res.trigger?.ok
              ? 'Priority job — a worker run is starting now.'
              : 'Already-saved leads are skipped when it resumes.',
      });
      onChanged();
    } catch (err) {
      toast({ kind: 'error', title: `Could not ${action} job #${job.id}`, description: (err as Error).message });
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  const Icon = busy ? Loader2 : action === 'pause' ? Pause : job.status === 'failed' ? RotateCcw : Play;

  return (
    <motion.button
      type="button"
      onClick={toggle}
      onKeyDown={(e) => e.stopPropagation()}
      disabled={busy}
      whileTap={{ scale: 0.88 }}
      whileHover={{ scale: 1.06 }}
      aria-label={label}
      title={label}
      className={cn(
        'grid shrink-0 place-items-center rounded-xl border transition-[background,border-color,box-shadow,color]',
        size === 'sm' ? 'size-8' : 'size-9',
        action === 'pause'
          ? 'border-violet-400/30 bg-violet-400/10 text-violet-200 hover:border-violet-300/60 hover:shadow-[0_0_18px_-4px_rgb(167_139_250/0.8)]'
          : 'border-emerald-400/30 bg-emerald-400/10 text-emerald-200 hover:border-emerald-300/60 hover:shadow-[0_0_18px_-4px_rgb(52_211_153/0.8)]',
        'disabled:opacity-60',
      )}
    >
      <Icon className={cn('size-4', busy && 'animate-spin', action === 'resume' && !busy && job.status === 'paused' && 'fill-current')} />
    </motion.button>
  );
}
