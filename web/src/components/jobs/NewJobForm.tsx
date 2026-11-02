'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { Infinity as InfinityIcon, MapPin, Plus, Rocket, Tag, Target, Zap } from 'lucide-react';
import { useMemo, useState, type FormEvent } from 'react';
import { DuplicateJobDialog, type DuplicateChoice } from '@/components/jobs/DuplicateJobDialog';
import { useToast } from '@/components/providers/ToastProvider';
import { Button } from '@/components/ui/Button';
import { FloatingInput, FloatingTextarea } from '@/components/ui/FloatingField';
import { Card, Chip, Segmented, Switch } from '@/components/ui/primitives';
import { ApiError, fetchJson } from '@/lib/hooks';
import type { CreateJobsResponse, DuplicateConflict } from '@/lib/types';

const CATEGORY_SUGGESTIONS = [
  'real estate agency',
  'property dealer',
  'real estate consultant',
  'real estate agent',
  'property broker',
  'land broker',
  'plot dealer',
];

const MAX_LOCATIONS = 500;
const MAX_TARGET = 10_000;
const MAPS_LIST_LIMIT = 120;

type TargetMode = 'unlimited' | 'custom';

interface JobPayload {
  location: string;
  category: string;
  target_leads: number | null;
  is_priority: boolean;
}

function parseLocations(raw: string) {
  const seen = new Set<string>();
  const valid: string[] = [];
  let tooShort = 0;
  for (const line of raw.split(/\r?\n/)) {
    const v = line.trim().replace(/\s+/g, ' ');
    if (!v) continue;
    if (v.length < 2) {
      tooShort++;
      continue;
    }
    if (!seen.has(v.toLowerCase())) {
      seen.add(v.toLowerCase());
      valid.push(v);
    }
  }
  return { valid, tooShort };
}

export function NewJobForm({ onCreated }: { onCreated: () => void }) {
  const { toast } = useToast();
  const [location, setLocation] = useState('');
  const [category, setCategory] = useState('real estate agency');
  const [targetMode, setTargetMode] = useState<TargetMode>('unlimited');
  const [target, setTarget] = useState('50');
  const [priority, setPriority] = useState(false);
  const [touched, setTouched] = useState({ location: false, category: false, target: false });
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [conflict, setConflict] = useState<{ data: DuplicateConflict; payload: JobPayload } | null>(null);
  const [resolving, setResolving] = useState<DuplicateChoice | null>(null);

  const locations = useMemo(() => parseLocations(location), [location]);
  const targetNumber = Number(target);

  const locationError =
    locations.valid.length === 0
      ? 'Add at least one location.'
      : locations.valid.length > MAX_LOCATIONS
        ? `Maximum ${MAX_LOCATIONS} locations per batch (you have ${locations.valid.length}).`
        : locations.tooShort
          ? `${locations.tooShort} line(s) are too short to be a location.`
          : null;
  const categoryError =
    category.trim().length < 2 ? 'Enter a Google Maps search term.' : category.trim().length > 100 ? 'Too long (max 100).' : null;
  const targetError =
    targetMode === 'unlimited'
      ? null
      : !target.trim() || !Number.isInteger(targetNumber) || targetNumber < 1
        ? 'Enter a whole number of at least 1.'
        : targetNumber > MAX_TARGET
          ? `At most ${MAX_TARGET.toLocaleString('en-IN')}.`
          : null;

  const show = (field: keyof typeof touched, error: string | null) => ((touched[field] || submitted) && error) || null;

  function reportCreated(res: CreateJobsResponse, payload: JobPayload) {
    const n = res.created.length;
    const notes = [
      res.skippedActive.length ? `${res.skippedActive.length} already in the queue` : null,
      res.skippedExisting.length ? `${res.skippedExisting.length} existing skipped` : null,
    ].filter(Boolean);

    toast({
      kind: n ? 'success' : 'info',
      title: n ? `Queued ${n} job${n > 1 ? 's' : ''}${payload.is_priority ? ' at top priority' : ''}` : 'Nothing new to queue',
      description: notes.length ? notes.join(' · ') : payload.is_priority ? undefined : 'The worker picks them up on its next run.',
    });

    if (payload.is_priority && n && res.trigger) {
      if (res.trigger.ok) {
        toast({ kind: 'success', title: 'Worker run started', description: 'GitHub Actions is starting a run now.' });
      } else if (res.trigger.configured === false) {
        toast({
          kind: 'info',
          title: 'Queued first — no instant start',
          description: 'Set GITHUB_PAT and GITHUB_REPO to start runs instantly. It runs at the next scheduled run.',
        });
      } else {
        toast({ kind: 'error', title: 'Could not start the worker', description: res.trigger.error });
      }
    }

    if (n) {
      setSuccess(true);
      setTimeout(() => setSuccess(false), 1600);
      setLocation('');
      setPriority(false);
      setTouched({ location: false, category: false, target: false });
      setSubmitted(false);
      onCreated();
    }
  }

  async function send(payload: JobPayload, onDuplicate: 'ask' | DuplicateChoice) {
    const res = await fetchJson<CreateJobsResponse>('/api/jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...payload, on_duplicate: onDuplicate }),
    });
    reportCreated(res, payload);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitted(true);
    if (locationError || categoryError || targetError) return;

    const payload: JobPayload = {
      location: locations.valid.join('\n'),
      category: category.trim(),
      target_leads: targetMode === 'custom' ? targetNumber : null,
      is_priority: priority,
    };

    setLoading(true);
    try {
      await send(payload, 'ask');
    } catch (err) {
      if (err instanceof ApiError && err.status === 409 && (err.body as DuplicateConflict | null)?.code === 'DUPLICATE') {
        setConflict({ data: err.body as DuplicateConflict, payload });
      } else {
        toast({ kind: 'error', title: 'Could not queue job', description: (err as Error).message });
      }
    } finally {
      setLoading(false);
    }
  }

  async function resolveConflict(choice: DuplicateChoice) {
    if (!conflict) return;
    setResolving(choice);
    try {
      await send(conflict.payload, choice);
      setConflict(null);
    } catch (err) {
      toast({ kind: 'error', title: 'Could not queue job', description: (err as Error).message });
    } finally {
      setResolving(null);
    }
  }

  const count = locations.valid.length;

  return (
    <Card
      title="New scraping job"
      subtitle="One location per line — each line becomes its own job."
      icon={<Rocket className="size-5" />}
      delay={0.05}
    >
      <form onSubmit={onSubmit} noValidate className="space-y-2">
        <FloatingTextarea
          label="Location(s)"
          rows={4}
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          onBlur={() => setTouched((t) => ({ ...t, location: true }))}
          error={show('location', locationError)}
          hint={
            <span className="flex items-center gap-1.5">
              <MapPin className="size-3.5" />
              e.g. “Koramangala, Bengaluru, Karnataka”
            </span>
          }
        />

        <FloatingInput
          label="Category"
          value={category}
          icon={<Tag className="size-4" />}
          onChange={(e) => setCategory(e.target.value)}
          onBlur={() => setTouched((t) => ({ ...t, category: true }))}
          error={show('category', categoryError)}
          maxLength={100}
        />

        <div className="-mt-1 flex flex-wrap gap-1.5 pb-3">
          {CATEGORY_SUGGESTIONS.map((c) => (
            <Chip key={c} active={category.trim().toLowerCase() === c} onClick={() => setCategory(c)}>
              {c}
            </Chip>
          ))}
        </div>

        {/* Target limit */}
        <div className="rounded-xl border border-white/[0.08] bg-obsidian-900/50 p-3.5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="flex items-center gap-2 text-sm font-medium text-slate-100">
              <Target className="size-4 text-neon-blue" />
              Leads per location
            </span>
            <Segmented<TargetMode>
              layoutId="target-mode"
              size="sm"
              value={targetMode}
              onChange={setTargetMode}
              options={[
                { value: 'unlimited', label: <><InfinityIcon className="size-3.5" /> Unlimited</> },
                { value: 'custom', label: <><Target className="size-3.5" /> Custom target</> },
              ]}
            />
          </div>
          <AnimatePresence initial={false} mode="wait">
            {targetMode === 'custom' ? (
              <motion.div
                key="custom"
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.22 }}
                className="overflow-hidden"
              >
                <FloatingInput
                  className="pt-3"
                  label="Target leads"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={MAX_TARGET}
                  step={1}
                  value={target}
                  onChange={(e) => setTarget(e.target.value)}
                  onBlur={() => setTouched((t) => ({ ...t, target: true }))}
                  error={show('target', targetError)}
                  hint={
                    targetNumber > MAPS_LIST_LIMIT
                      ? `Google Maps lists about ${MAPS_LIST_LIMIT} places per search — split big areas into more locations.`
                      : 'The worker stops scrolling once this many leads are saved.'
                  }
                />
              </motion.div>
            ) : (
              <motion.p
                key="unlimited"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="pt-2 text-xs text-slate-500"
              >
                Scrolls until Google shows “You’ve reached the end of the list”.
              </motion.p>
            )}
          </AnimatePresence>
        </div>

        <Switch
          className="mt-2"
          tone="amber"
          checked={priority}
          onChange={setPriority}
          icon={<Zap className="size-4" />}
          label="Run first (high priority)"
          description="Jumps the queue and starts a worker run right away."
        />

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.06] pt-4">
          <AnimatePresence mode="wait">
            <motion.p
              key={`${count}-${priority}`}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              className="text-sm text-slate-400"
            >
              {count ? (
                <>
                  <span className="font-semibold text-white">{count}</span> job{count > 1 ? 's' : ''} will be queued
                  {priority && <span className="text-amber-300"> first</span>}
                </>
              ) : (
                'No locations yet'
              )}
            </motion.p>
          </AnimatePresence>
          <Button
            type="submit"
            size="lg"
            loading={loading}
            success={success}
            icon={priority ? <Zap className="size-4" /> : <Plus className="size-4" />}
          >
            {loading ? 'Queuing…' : success ? 'Queued' : priority ? 'Run now' : 'Start job'}
          </Button>
        </div>
      </form>

      <DuplicateJobDialog
        conflict={conflict?.data ?? null}
        category={conflict?.payload.category ?? ''}
        busy={resolving}
        onChoose={resolveConflict}
        onCancel={() => setConflict(null)}
      />
    </Card>
  );
}
