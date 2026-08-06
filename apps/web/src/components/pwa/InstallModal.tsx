"use client";

import { useEffect, useState } from "react";
import { Download } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { usePWAInstall } from "@/hooks/usePWAInstall";
import { siteConfig } from "@/lib/siteConfig";

// Doesn't compete with the user's first action on the page (e.g. pasting
// a URL) by appearing the instant it becomes eligible.
const SHOW_DELAY_MS = 2500;

/**
 * Mounted once, globally (see Providers.tsx) - never inside a page
 * component. Built on the existing Dialog primitive (Radix) rather than
 * a hand-rolled overlay specifically because Radix already provides
 * focus trapping, aria-modal, and Escape-to-dismiss for free - the exact
 * accessibility requirements this modal needs.
 */
export function InstallModal() {
  const { shouldShowPrompt, promptInstall, dismiss } = usePWAInstall();
  const [delayElapsed, setDelayElapsed] = useState(false);

  useEffect(() => {
    if (!shouldShowPrompt) {
      setDelayElapsed(false);
      return;
    }
    const timer = setTimeout(() => setDelayElapsed(true), SHOW_DELAY_MS);
    return () => clearTimeout(timer);
  }, [shouldShowPrompt]);

  const open = shouldShowPrompt && delayElapsed;

  function handleOpenChange(nextOpen: boolean) {
    // Radix calls this on Escape, overlay click, or its built-in close
    // button - all of those are a dismissal, same as "Maybe Later".
    if (!nextOpen) dismiss();
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent aria-describedby="install-modal-description">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <Download className="h-5 w-5" aria-hidden="true" />
            </span>
            <DialogTitle>Install {siteConfig.name}</DialogTitle>
          </div>
          <DialogDescription id="install-modal-description">
            Install the app for faster access, better performance, and a native app
            experience.
          </DialogDescription>
        </DialogHeader>

        {/* w-full (not flex-1) at the base/column layout - confirmed live
            that flex-1's flex-basis:0% overrides Button's own h-11 height
            class in a *column* flex container (CSS flex-basis wins over
            height for main-axis sizing), collapsing these to ~20px tall.
            Only applies flex-1 once sm:flex-row makes width, not height,
            the main axis - safe there. */}
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button onClick={() => promptInstall()} className="w-full sm:flex-1">
            Install App
          </Button>
          <Button variant="outline" onClick={dismiss} className="w-full sm:flex-1">
            Maybe Later
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
