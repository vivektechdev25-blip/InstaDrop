"use client";

import type { ReactNode } from "react";
import { ThemeProvider } from "@/hooks/useTheme";
import { ToastProvider } from "@/hooks/useToast";
import { useServiceWorker } from "@/hooks/useServiceWorker";
import { Toaster } from "@/components/ui/Toaster";
import { InstallModal } from "@/components/pwa/InstallModal";
import { ScrollReveal } from "@/components/motion/ScrollReveal";

export function Providers({ children }: { children: ReactNode }) {
  useServiceWorker();

  return (
    <ThemeProvider>
      <ToastProvider>
        {children}
        <Toaster />
        <InstallModal />
        <ScrollReveal />
      </ToastProvider>
    </ThemeProvider>
  );
}
