'use client';

import { MotionConfig } from 'framer-motion';
import type { ReactNode } from 'react';
import { FiltersProvider } from './FiltersProvider';
import { ToastProvider } from './ToastProvider';

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <MotionConfig reducedMotion="user">
      <ToastProvider>
        <FiltersProvider>{children}</FiltersProvider>
      </ToastProvider>
    </MotionConfig>
  );
}
