"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  isStandalone,
  onAppInstalled,
  onInstallPromptAvailable,
  triggerInstallPrompt,
  type BeforeInstallPromptEvent,
} from "@/lib/pwaService";
import {
  isPersistedInstalled,
  markPersistedInstalled,
  recordDismissal,
  recordVisit,
  shouldShowPrompt as evaluateShouldShowPrompt,
} from "@/lib/installPromptManager";

export type PromptInstallResult = "accepted" | "dismissed" | "unavailable";

export interface UsePWAInstallResult {
  canInstall: boolean;
  isInstalled: boolean;
  shouldShowPrompt: boolean;
  promptInstall: () => Promise<PromptInstallResult>;
  dismiss: () => void;
}

export function usePWAInstall(): UsePWAInstallResult {
  const deferredEventRef = useRef<BeforeInstallPromptEvent | null>(null);
  const [canInstall, setCanInstall] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);
  // Bumped after storage-only changes (e.g. "Maybe Later", which touches
  // neither canInstall nor isInstalled) so shouldShowPrompt - computed
  // fresh from storage on every render - actually gets re-evaluated.
  const [, forceRecompute] = useState(0);

  useEffect(() => {
    setIsInstalled(isStandalone() || isPersistedInstalled());

    const offAvailable = onInstallPromptAvailable((event) => {
      deferredEventRef.current = event;
      setCanInstall(true);
    });

    const offInstalled = onAppInstalled(() => {
      deferredEventRef.current = null;
      markPersistedInstalled();
      setCanInstall(false);
      setIsInstalled(true);
    });

    recordVisit();

    return () => {
      offAvailable();
      offInstalled();
    };
  }, []);

  const promptInstall = useCallback(async (): Promise<PromptInstallResult> => {
    const event = deferredEventRef.current;
    if (!event) return "unavailable";

    const outcome = await triggerInstallPrompt(event);
    deferredEventRef.current = null;
    setCanInstall(false);

    if (outcome === "accepted") {
      markPersistedInstalled();
      setIsInstalled(true);
    } else {
      recordDismissal();
    }

    return outcome;
  }, []);

  const dismiss = useCallback(() => {
    recordDismissal();
    forceRecompute((n) => n + 1);
  }, []);

  return {
    canInstall,
    isInstalled,
    shouldShowPrompt: evaluateShouldShowPrompt({ canInstall, isInstalled }),
    promptInstall,
    dismiss,
  };
}
