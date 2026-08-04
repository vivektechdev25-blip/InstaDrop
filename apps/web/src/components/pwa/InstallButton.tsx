"use client";

import type { ReactNode } from "react";
import { Download } from "lucide-react";
import { Button, type ButtonProps } from "@/components/ui/Button";
import { usePWAInstall } from "@/hooks/usePWAInstall";

export interface InstallButtonProps extends Omit<ButtonProps, "onClick" | "children"> {
  children?: ReactNode;
  onInstalled?: () => void;
  onDismissed?: () => void;
}

/**
 * Reusable trigger - usable inside InstallModal or standalone (e.g. a
 * footer link). Renders nothing when there's no captured install prompt
 * to trigger, rather than a dead-end button.
 */
export function InstallButton({
  children,
  onInstalled,
  onDismissed,
  ...buttonProps
}: InstallButtonProps) {
  const { canInstall, promptInstall } = usePWAInstall();

  if (!canInstall) return null;

  async function handleClick() {
    const outcome = await promptInstall();
    if (outcome === "accepted") onInstalled?.();
    if (outcome === "dismissed") onDismissed?.();
  }

  return (
    <Button onClick={handleClick} {...buttonProps}>
      {children ?? (
        <>
          <Download className="h-4 w-4" aria-hidden="true" />
          Install App
        </>
      )}
    </Button>
  );
}
