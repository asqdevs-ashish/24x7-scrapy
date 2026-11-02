'use client';

import { motion } from 'framer-motion';
import { AlertTriangle, RefreshCcw, SkipForward } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { StatusPill } from '@/components/ui/primitives';
import { formatNumber, timeAgo } from '@/lib/format';
import type { DuplicateConflict } from '@/lib/types';

export type DuplicateChoice = 'fresh' | 'skip';

// Shown when POST /api/jobs answers 409: some location+category combinations
// already have a job (one row per location × category pair). Finished ones can be re-run ("fresh"); active ones
// (pending / running / paused) are always skipped.
export function DuplicateJobDialog({
  conflict,
  busy,
  onChoose,
  onCancel,
}: {
  conflict: DuplicateConflict | null;
  busy: DuplicateChoice | null;
  onChoose: (choice: DuplicateChoice) => void;
  onCancel: () => void;
}) {
  const finished = conflict?.duplicates.filter((d) => !d.active) ?? [];
  const active = conflict?.duplicates.filter((d) => d.active) ?? [];
  const newCount = conflict?.newJobs.length ?? 0;

  return (
    <Modal
      open={!!conflict}
      onClose={busy ? () => { } : onCancel}
      size="sm"
      title={
        <span className="flex items-center gap-2.5">
          <span className="grid size-8 place-items-center rounded-lg bg-amber-400/15 text-amber-300">
            <AlertTriangle className="size-4" />
          </span>
          Already scraped
        </span>
      }
      subtitle={
        <>
          This combination already exists. Do you want to extract fresh data anyway?
        </>
      }
    >
      {conflict && (
        <div className="space-y-4 p-5 sm:p-6">
          <p className="text-sm text-slate-400">
            <span className="font-medium text-slate-200">{conflict.duplicates.length}</span> location × category
            combination{conflict.duplicates.length > 1 ? 's' : ''} already scraped
          </p>

          <ul className="scrollbar-thin max-h-64 space-y-2 overflow-y-auto pr-1">
            {conflict.duplicates.map((d, i) => (
              <motion.li
                key={d.job_id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0, transition: { delay: i * 0.03 } }}
                className="flex items-center gap-3 rounded-xl border border-white/[0.07] bg-white/[0.02] px-3.5 py-2.5"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-100">{d.location}</p>
                  <p className="truncate text-xs text-neon-blue/90">{d.category}</p>
                  <p className="text-xs text-slate-500">
                    Job #{d.job_id} · {timeAgo(d.created_at)} · {formatNumber(d.leads)} leads
                    {d.active && <span className="text-amber-300/90"> · already in the queue, will be skipped</span>}
                  </p>
                </div>
                <StatusPill status={d.status} />
              </motion.li>
            ))}
          </ul>

          <div className="rounded-xl border border-neon-blue/20 bg-neon-blue/[0.05] px-3.5 py-3 text-xs leading-relaxed text-slate-400">
            <span className="font-medium text-slate-200">Extract fresh data</span> re-opens every place, updates
            rating, reviews, phone and website on the stored leads, and moves them to the new job.
            {newCount > 0 && (
              <>
                {' '}
                <span className="font-medium text-slate-200">{newCount}</span> new job{newCount > 1 ? 's are' : ' is'}{' '}
                queued either way.
              </>
            )}
          </div>

          <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end">
            <Button variant="ghost" onClick={onCancel} disabled={!!busy}>
              Cancel
            </Button>
            {newCount > 0 && (
              <Button
                variant="secondary"
                onClick={() => onChoose('skip')}
                loading={busy === 'skip'}
                disabled={!!busy}
                icon={<SkipForward className="size-4" />}
              >
                Only new ({newCount})
              </Button>
            )}
            <Button
              onClick={() => onChoose('fresh')}
              loading={busy === 'fresh'}
              disabled={!!busy || finished.length === 0}
              icon={<RefreshCcw className="size-4" />}
            >
              Extract fresh data{finished.length + newCount > 1 ? ` (${finished.length + newCount})` : ''}
            </Button>
          </div>
          {active.length > 0 && (
            <p className="text-xs text-slate-500">
              {active.length} combination{active.length > 1 ? 's are' : ' is'} still in the queue and won’t be duplicated — resume
              or wait for {active.length > 1 ? 'those jobs' : 'that job'} instead.
            </p>
          )}
        </div>
      )}
    </Modal>
  );
}
