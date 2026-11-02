'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { Check, Infinity as InfinityIcon, MapPin, Plus, Rocket, Tag, Target, Zap } from 'lucide-react';
import { useMemo, useState, type FormEvent, type KeyboardEvent } from 'react';
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
const MAX_CATEGORIES = 20;
const MAX_JOBS = 500; // locations × categories, matches the API cap
const MAX_TARGET = 10_000;
const MAPS_LIST_LIMIT = 120;

type TargetMode = 'unlimited' | 'custom';

interface JobPayload {
  location: string;
  categories: string[];
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

const sameCategory = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

export function NewJobForm({ onCreated }: { onCreated: () => void }) {
  const { toast } = useToast();
  const [location, setLocation] = useState('');
  const [categories, setCategories] = useState<string[]>(['real estate agency']);
  // Typed-in categories stay as chips (even when deselected) until the page reloads.
  const [customCategories, setCustomCategories] = useState<string[]>([]);
  const [categoryDraft, setCategoryDraft] = useState('');
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
  const draft = categoryDraft.trim().replace(/\s+/g, ' ');
  const chips = [...CATEGORY_SUGGESTIONS, ...customCategories];
  const isSelected = (c: string) => categories.some((x) => sameCategory(x, c));
  const count = locations.valid.length;
  const jobCount = count * categories.length;

  const locationError =
    count === 0
      ? 'Add at least one location.'
      : count > MAX_LOCATIONS
        ? `Maximum ${MAX_LOCATIONS} locations per batch (you have ${count}).`
        : locations.tooShort
          ? `${locations.tooShort} line(s) are too short to be a location.`
          : null;
  const draftError = draft && draft.length < 2 ? 'Too short.' : draft.length > 100 ? 'Too long (max 100).' : null;
  const categoryErrorFor = (list: string[]) =>
    list.length === 0
      ? 'Pick at least one category.'
      : list.length > MAX_CATEGORIES
        ? `At most ${MAX_CATEGORIES} categories per batch.`
        : count * list.length > MAX_JOBS
          ? `At most ${MAX_JOBS} jobs per batch (${count} × ${list.length} = ${count * list.length}).`
          : null;
  const categoryError = draftError ?? categoryErrorFor(categories);
  const targetError =
    targetMode === 'unlimited'
      ? null
      : !target.trim() || !Number.isInteger(targetNumber) || targetNumber < 1
        ? 'Enter a whole number of at least 1.'
        : targetNumber > MAX_TARGET
          ? `At most ${MAX_TARGET.toLocaleString('en-IN')}.`
          : null;

  const show = (field: keyof typeof touched, error: string | null) => ((touched[field] || submitted) && error) || null;

  function toggleCategory(c: string) {
    setTouched((t) => ({ ...t, category: true }));
    setCategories((prev) => (prev.some((x) => sameCategory(x, c)) ? prev.filter((x) => !sameCategory(x, c)) : [...prev, c]));
  }

  // Selects the typed category (adding it as a chip if new). Returns the resulting selection.
  function addDraftCategory(): string[] {
    if (!draft || draftError) return categories;
    const known = chips.find((c) => sameCategory(c, draft));
    if (!known) setCustomCategories((prev) => [...prev, draft]);
    const next = isSelected(draft) ? categories : [...categories, known ?? draft];
    setCategories(next);
    setCategoryDraft('');
    return next;
  }

  function onDraftKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault();
      addDraftCategory();
    }
  }

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
    // A category still sitting in the input counts as selected.
    const selected = addDraftCategory();
    if (locationError || draftError || categoryErrorFor(selected) || targetError) return;

    const payload: JobPayload = {
      location: locations.valid.join('\n'),
      categories: selected,
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

  return (
    <Card
      title="New scraping job"
      subtitle="One location per line. Every location × category becomes its own job."
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

        {/* Categories (multi-select) */}
        <div className="flex items-center justify-between gap-3 pb-1 pt-1">
          <span className="flex items-center gap-2 text-sm font-medium text-slate-100">
            <Tag className="size-4 text-neon-blue" />
            Categories
          </span>
          <span className="flex items-center gap-2 text-xs text-slate-500">
            {categories.length} selected
            {categories.length > 0 && (
              <button
                type="button"
                onClick={() => setCategories([])}
                className="rounded px-1 text-slate-400 transition-colors hover:text-white"
              >
                Clear
              </button>
            )}
          </span>
        </div>

        <div className="flex flex-wrap gap-1.5 pb-2" role="group" aria-label="Categories">
          {chips.map((c) => {
            const active = isSelected(c);
            return (
              <Chip key={c} role="checkbox" active={active} onClick={() => toggleCategory(c)}>
                {active && <Check className="size-3.5 text-neon-blue" />}
                {c}
              </Chip>
            );
          })}
        </div>

        <FloatingInput
          label="Add another category"
          value={categoryDraft}
          icon={<Plus className="size-4" />}
          onChange={(e) => setCategoryDraft(e.target.value)}
          onKeyDown={onDraftKeyDown}
          onBlur={() => setTouched((t) => ({ ...t, category: true }))}
          error={show('category', categoryError)}
          hint="Type any Google Maps search term and press Enter, e.g. “plumber”."
          maxLength={120}
          trailing={
            draft && !draftError ? (
              <Button type="button" size="sm" variant="secondary" onClick={() => addDraftCategory()}>
                Add
              </Button>
            ) : undefined
          }
        />

        {/* Target limit */}
        <div className="rounded-xl border border-white/[0.08] bg-obsidian-900/50 p-3.5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="flex items-center gap-2 text-sm font-medium text-slate-100">
              <Target className="size-4 text-neon-blue" />
              Leads per job
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
              key={`${count}-${categories.length}-${priority}`}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              className="text-sm text-slate-400"
            >
              {jobCount ? (
                <>
                  {categories.length > 1 && (
                    <span className="text-slate-500">
                      {count} × {categories.length} ={' '}
                    </span>
                  )}
                  <span className="font-semibold text-white">{jobCount}</span> job{jobCount > 1 ? 's' : ''} will be queued
                  {priority && <span className="text-amber-300"> first</span>}
                </>
              ) : count ? (
                'No categories selected'
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
        busy={resolving}
        onChoose={resolveConflict}
        onCancel={() => setConflict(null)}
      />
    </Card>
  );
}
