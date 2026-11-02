'use client';

import { Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useToast } from '@/components/providers/ToastProvider';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { StatusPill } from '@/components/ui/primitives';
import { formatNumber, timeAgo } from '@/lib/format';
import { fetchJson } from '@/lib/hooks';
import type { JobDTO } from '@/lib/types';

// "Are you sure?" for one job. Deleting also deletes its leads (ON DELETE CASCADE).
export function DeleteJobDialog({
  job,
  onClose,
  onDeleted,
}: {
  job: JobDTO | null;
  onClose: () => void;
  onDeleted: (id: number) => void;
}) {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);

  async function confirm() {
    if (!job) return;
    setBusy(true);
    try {
      const res = await fetchJson<{ deleted: number; leadsDeleted: number }>(`/api/jobs/${job.id}`, { method: 'DELETE' });
      toast({
        kind: 'success',
        title: `Job #${job.id} deleted`,
        description: `${job.location} and ${formatNumber(res.leadsDeleted)} lead${res.leadsDeleted === 1 ? '' : 's'} removed.`,
      });
      onDeleted(job.id);
      onClose();
    } catch (err) {
      toast({ kind: 'error', title: `Could not delete job #${job.id}`, description: (err as Error).message });
    } finally {
      setBusy(false);
    }
  }

  const leads = job?.leads_saved ?? 0;

  return (
    <Modal
      open={!!job}
      onClose={busy ? () => { } : onClose}
      size="sm"
      title={
        <span className="flex items-center gap-2.5">
          <span className="grid size-8 place-items-center rounded-lg bg-rose-500/15 text-rose-300">
            <Trash2 className="size-4" />
          </span>
          Delete job?
        </span>
      }
      subtitle={
        job && (
          <>
            Are you sure? This will permanently delete this job and its{' '}
            <span className="font-semibold text-rose-200">
              {formatNumber(leads)} lead{leads === 1 ? '' : 's'}
            </span>
            .
          </>
        )
      }
    >
      {job && (
        <div className="space-y-4 p-5 sm:p-6">
          <div className="flex items-center gap-3 rounded-xl border border-white/[0.07] bg-white/[0.02] px-3.5 py-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-slate-100">{job.location}</p>
              <p className="text-xs text-slate-500">
                Job #{job.id} · {job.category} · {timeAgo(job.created_at)}
              </p>
            </div>
            <StatusPill status={job.status} />
          </div>
          <p className="text-xs text-slate-500">This can’t be undone. Export the leads first if you still need them.</p>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="ghost" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button variant="danger" onClick={confirm} loading={busy} icon={<Trash2 className="size-4" />}>
              {busy ? 'Deleting…' : `Delete job${leads ? ` & ${formatNumber(leads)} leads` : ''}`}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
