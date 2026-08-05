"use client";

import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from "react";

export type ToastVariant = "default" | "success" | "destructive";

export interface ToastItem {
  id: string;
  title: string;
  description?: string;
  variant: ToastVariant;
  /** True once dismiss() has been called - Toaster renders it with the
   * exit animation for LEAVE_ANIMATION_MS before actually removing it,
   * instead of a hard, instant unmount. */
  leaving?: boolean;
}

export interface ToastInput {
  title: string;
  description?: string;
  variant?: ToastVariant;
  durationMs?: number;
}

interface ToastContextValue {
  toasts: ToastItem[];
  toast: (input: ToastInput) => void;
  dismiss: (id: string) => void;
}

const DEFAULT_DURATION_MS = 5000;
// Matches the slide-down-out animation duration in tailwind.config.ts -
// keeps the item mounted long enough to actually play the exit
// transition before removing it from state.
const LEAVE_ANIMATION_MS = 200;

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts((current) =>
      current.map((toastItem) =>
        toastItem.id === id ? { ...toastItem, leaving: true } : toastItem
      )
    );
    setTimeout(() => {
      setToasts((current) => current.filter((toastItem) => toastItem.id !== id));
    }, LEAVE_ANIMATION_MS);
  }, []);

  const toast = useCallback(
    ({ title, description, variant = "default", durationMs = DEFAULT_DURATION_MS }: ToastInput) => {
      const id = crypto.randomUUID();
      setToasts((current) => [...current, { id, title, description, variant }]);
      setTimeout(() => dismiss(id), durationMs);
    },
    [dismiss]
  );

  return (
    <ToastContext.Provider value={{ toasts, toast, dismiss }}>
      {children}
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within a ToastProvider.");
  }
  return context;
}
