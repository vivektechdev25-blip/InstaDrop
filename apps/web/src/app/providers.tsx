"use client";

import { QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { queryClient } from "@/lib/queryClient";
import { ThemeProvider } from "@/hooks/useTheme";
import { ToastProvider } from "@/hooks/useToast";
import { useServiceWorker } from "@/hooks/useServiceWorker";
import { Toaster } from "@/components/ui/Toaster";
import { InstallModal } from "@/components/pwa/InstallModal";

export function Providers({ children }: { children: ReactNode }) {
  useServiceWorker();

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <ToastProvider>
          {children}
          <Toaster />
          <InstallModal />
        </ToastProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
