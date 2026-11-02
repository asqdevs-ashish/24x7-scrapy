'use client';

import { AnimatePresence, motion, MotionConfig, useAnimationControls } from 'framer-motion';
import { Eye, EyeOff, KeyRound, Lock, ShieldCheck, User } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/Button';
import { FloatingInput } from '@/components/ui/FloatingField';

export function LoginForm({ next }: { next: string }) {
  const router = useRouter();
  const shake = useAnimationControls();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [reveal, setReveal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [leaving, setLeaving] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!username.trim() || !password) {
      setError('Enter your username and password.');
      shake.start({ x: [0, -10, 10, -6, 6, 0], transition: { duration: 0.4 } });
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), password }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error ?? 'Sign in failed.');
        setPassword('');
        shake.start({ x: [0, -10, 10, -6, 6, 0], transition: { duration: 0.4 } });
        return;
      }
      setSuccess(true);
      setTimeout(() => setLeaving(true), 450);
      setTimeout(() => {
        router.replace(next);
        router.refresh();
      }, 800);
    } catch {
      setError('Network error. Check your connection and try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <MotionConfig reducedMotion="user">
      <main className="relative flex min-h-dvh items-center justify-center overflow-hidden px-4 py-10">
        {/* Animated neon orbs, heavily blurred */}
        <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
          <motion.div
            className="absolute -left-32 top-[-10%] size-[520px] rounded-full bg-neon-blue/25 blur-[120px]"
            animate={{ x: [0, 60, -20, 0], y: [0, 40, 80, 0] }}
            transition={{ duration: 22, repeat: Infinity, ease: 'easeInOut' }}
          />
          <motion.div
            className="absolute -right-24 bottom-[-15%] size-[560px] rounded-full bg-neon-violet/25 blur-[130px]"
            animate={{ x: [0, -50, 30, 0], y: [0, -60, -20, 0] }}
            transition={{ duration: 26, repeat: Infinity, ease: 'easeInOut' }}
          />
          <motion.div
            className="absolute left-1/2 top-1/2 size-[300px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-neon-cyan/10 blur-[100px]"
            animate={{ scale: [1, 1.25, 1] }}
            transition={{ duration: 12, repeat: Infinity, ease: 'easeInOut' }}
          />
        </div>

        <AnimatePresence>
          {!leaving && (
            <motion.div
              key="card"
              initial={{ opacity: 0, y: 24, scale: 0.97, filter: 'blur(10px)' }}
              animate={{ opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }}
              exit={{ opacity: 0, y: -16, scale: 0.98, filter: 'blur(8px)' }}
              transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
              className="relative w-full max-w-[420px]"
            >
              {/* gradient hairline border */}
              <div className="absolute -inset-px rounded-[26px] bg-[linear-gradient(140deg,rgb(77_141_255/0.55),transparent_40%,transparent_60%,rgb(155_107_255/0.55))] opacity-70" />
              <motion.div
                animate={shake}
                className="glass relative rounded-[25px] px-7 pb-7 pt-9 shadow-[0_30px_80px_-20px_rgb(0_0_0/0.8)] sm:px-9"
              >
                <motion.div
                  initial={{ scale: 0.6, opacity: 0, rotate: -12 }}
                  animate={{ scale: 1, opacity: 1, rotate: 0 }}
                  transition={{ delay: 0.15, type: 'spring', stiffness: 260, damping: 18 }}
                  className="mx-auto mb-6 grid size-14 place-items-center rounded-2xl bg-[linear-gradient(135deg,#3b6dff,#9b6bff)] shadow-glow-violet"
                >
                  <AnimatePresence mode="wait" initial={false}>
                    {success ? (
                      <motion.span key="ok" initial={{ scale: 0 }} animate={{ scale: 1 }}>
                        <ShieldCheck className="size-7 text-white" />
                      </motion.span>
                    ) : (
                      <motion.span key="lock" exit={{ scale: 0 }}>
                        <Lock className="size-6 text-white" />
                      </motion.span>
                    )}
                  </AnimatePresence>
                </motion.div>

                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.22 }}
                  className="mb-7 text-center"
                >
                  <h1 className="text-gradient text-2xl font-semibold tracking-tight">Realtor Leads</h1>
                  <p className="mt-1.5 text-sm text-slate-400">Sign in to access your lead intelligence.</p>
                </motion.div>

                <form onSubmit={onSubmit} noValidate className="space-y-1">
                  <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
                    <FloatingInput
                      label="Username"
                      autoComplete="username"
                      autoFocus
                      icon={<User className="size-4" />}
                      value={username}
                      onChange={(e) => {
                        setUsername(e.target.value);
                        setError(null);
                      }}
                    />
                  </motion.div>
                  <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.36 }}>
                    <FloatingInput
                      label="Password"
                      type={reveal ? 'text' : 'password'}
                      autoComplete="current-password"
                      icon={<KeyRound className="size-4" />}
                      value={password}
                      error={error}
                      onChange={(e) => {
                        setPassword(e.target.value);
                        setError(null);
                      }}
                      trailing={
                        <button
                          type="button"
                          onClick={() => setReveal((r) => !r)}
                          aria-label={reveal ? 'Hide password' : 'Show password'}
                          className="grid size-9 place-items-center rounded-lg text-slate-500 transition-colors hover:bg-white/5 hover:text-slate-200"
                        >
                          {reveal ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                        </button>
                      }
                    />
                  </motion.div>

                  <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.42 }}>
                    <Button type="submit" size="lg" loading={loading} success={success} className="mt-2 w-full">
                      {success ? 'Welcome back' : loading ? 'Verifying…' : 'Sign in'}
                    </Button>
                  </motion.div>
                </form>

                <p className="mt-6 flex items-center justify-center gap-1.5 text-[11px] text-slate-500">
                  <ShieldCheck className="size-3.5" />
                  Signed HttpOnly session · expires after 12h
                </p>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </MotionConfig>
  );
}
