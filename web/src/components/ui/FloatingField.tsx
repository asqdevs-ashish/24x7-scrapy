'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { AlertCircle } from 'lucide-react';
import { forwardRef, useId, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

interface BaseProps {
  label: string;
  error?: string | null;
  hint?: ReactNode;
  icon?: ReactNode;
  trailing?: ReactNode;
}

const shell =
  'group relative rounded-xl border bg-obsidian-900/70 transition-[border-color,box-shadow] duration-200 ' +
  'focus-within:border-neon-blue/70 focus-within:shadow-[0_0_0_4px_rgb(77_141_255/0.14),0_0_28px_-8px_rgb(77_141_255/0.6)]';

const fieldBase =
  'peer block w-full bg-transparent px-4 pb-2 pt-6 text-[15px] text-white outline-none placeholder:text-transparent ' +
  'disabled:cursor-not-allowed disabled:opacity-60';

const labelBase =
  'pointer-events-none absolute left-4 top-2 origin-left text-xs font-medium text-slate-400 transition-all duration-200 ' +
  'peer-placeholder-shown:top-[1.05rem] peer-placeholder-shown:text-[15px] peer-placeholder-shown:font-normal ' +
  'peer-focus:top-2 peer-focus:text-xs peer-focus:font-medium peer-focus:text-neon-blue';

function FieldMessage({ id, error, hint }: { id: string; error?: string | null; hint?: ReactNode }) {
  return (
    <div className="min-h-5 px-1 pt-1.5 text-xs">
      <AnimatePresence mode="wait" initial={false}>
        {error ? (
          <motion.p
            key="error"
            id={id}
            role="alert"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.18 }}
            className="flex items-center gap-1.5 text-rose-400"
          >
            <AlertCircle className="size-3.5 shrink-0" />
            {error}
          </motion.p>
        ) : hint ? (
          <motion.div
            key="hint"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="text-slate-500"
          >
            {hint}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

type InputProps = BaseProps & Omit<InputHTMLAttributes<HTMLInputElement>, 'placeholder'>;

export const FloatingInput = forwardRef<HTMLInputElement, InputProps>(function FloatingInput(
  { label, error, hint, icon, trailing, className, id, ...props },
  ref,
) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const msgId = `${inputId}-msg`;

  return (
    <div className={className}>
      <div className={cn(shell, error ? 'border-rose-500/60' : 'border-white/[0.08] hover:border-white/15')}>
        {icon && (
          <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 transition-colors group-focus-within:text-neon-blue">
            {icon}
          </span>
        )}
        <input
          ref={ref}
          id={inputId}
          placeholder=" "
          aria-invalid={!!error}
          aria-describedby={error ? msgId : undefined}
          className={cn(fieldBase, !!icon && 'pl-11', !!trailing && 'pr-12')}
          {...props}
        />
        <label htmlFor={inputId} className={cn(labelBase, !!icon && 'left-11')}>
          {label}
        </label>
        {trailing && <span className="absolute right-2 top-1/2 -translate-y-1/2">{trailing}</span>}
      </div>
      <FieldMessage id={msgId} error={error} hint={hint} />
    </div>
  );
});

type TextareaProps = BaseProps & Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'placeholder'>;

export const FloatingTextarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function FloatingTextarea(
  { label, error, hint, className, id, rows = 4, ...props },
  ref,
) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const msgId = `${inputId}-msg`;

  return (
    <div className={className}>
      <div className={cn(shell, error ? 'border-rose-500/60' : 'border-white/[0.08] hover:border-white/15')}>
        <textarea
          ref={ref}
          id={inputId}
          rows={rows}
          placeholder=" "
          aria-invalid={!!error}
          aria-describedby={error ? msgId : undefined}
          className={cn(fieldBase, 'scrollbar-thin resize-y leading-relaxed')}
          {...props}
        />
        <label htmlFor={inputId} className={labelBase}>
          {label}
        </label>
      </div>
      <FieldMessage id={msgId} error={error} hint={hint} />
    </div>
  );
});
