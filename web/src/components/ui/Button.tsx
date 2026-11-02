'use client';

import { AnimatePresence, motion, type HTMLMotionProps } from 'framer-motion';
import { Check, Loader2 } from 'lucide-react';
import { forwardRef, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

interface ButtonProps extends Omit<HTMLMotionProps<'button'>, 'children'> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  success?: boolean;
  icon?: ReactNode;
  children?: ReactNode;
}

const variants: Record<Variant, string> = {
  primary:
    'text-white bg-[linear-gradient(110deg,#3b6dff,#7a4dff_55%,#a35cff)] shadow-[0_8px_30px_-10px_rgb(122_77_255/0.8)] ' +
    'hover:shadow-[0_10px_38px_-8px_rgb(122_77_255/0.95)] hover:brightness-110 border border-white/10',
  secondary:
    'text-slate-100 bg-white/[0.04] border border-white/10 hover:bg-white/[0.08] hover:border-white/20',
  ghost: 'text-slate-300 hover:text-white hover:bg-white/[0.06]',
  danger: 'text-rose-200 bg-rose-500/10 border border-rose-500/30 hover:bg-rose-500/20',
};

const sizes: Record<Size, string> = {
  sm: 'h-8 px-3 text-xs gap-1.5 rounded-lg',
  md: 'h-10 px-4 text-sm gap-2 rounded-xl',
  lg: 'h-12 px-6 text-[15px] gap-2.5 rounded-xl',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', loading, success, icon, disabled, className, children, ...props },
  ref,
) {
  const state = loading ? 'loading' : success ? 'success' : 'idle';

  return (
    <motion.button
      ref={ref}
      whileHover={disabled || loading ? undefined : { y: -1 }}
      whileTap={disabled || loading ? undefined : { scale: 0.96 }}
      transition={{ type: 'spring', stiffness: 500, damping: 30 }}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        'relative inline-flex select-none items-center justify-center overflow-hidden font-medium transition-[background,box-shadow,filter,border-color] duration-200',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neon-blue/70 focus-visible:ring-offset-2 focus-visible:ring-offset-obsidian-950',
        'disabled:cursor-not-allowed disabled:opacity-55',
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    >
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={state}
          initial={{ opacity: 0, y: 8, filter: 'blur(4px)' }}
          animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
          exit={{ opacity: 0, y: -8, filter: 'blur(4px)' }}
          transition={{ duration: 0.18 }}
          className="inline-flex items-center gap-[inherit]"
        >
          {state === 'loading' ? (
            <Loader2 className="size-4 animate-spin" />
          ) : state === 'success' ? (
            <Check className="size-4" />
          ) : (
            icon
          )}
          {children}
        </motion.span>
      </AnimatePresence>
    </motion.button>
  );
});
