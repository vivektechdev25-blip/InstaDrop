"use client";

import { useToast } from "@/hooks/useToast";
import { Toast } from "@/components/ui/Toast";

export function Toaster() {
  const { toasts, dismiss } = useToast();

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[100] flex flex-col items-center gap-2 p-4 sm:items-end">
      {toasts.map((toastItem) => (
        <Toast key={toastItem.id} toastItem={toastItem} onDismiss={dismiss} />
      ))}
    </div>
  );
}
