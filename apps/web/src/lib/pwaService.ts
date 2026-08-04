// The BeforeInstallPromptEvent interface isn't part of the standard DOM
// lib types yet (still a Chromium-only proposal), so it's declared here
// rather than reached for `any`.
export interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
  prompt(): Promise<void>;
}

export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(display-mode: standalone)").matches;
}

/**
 * Captures the native prompt as early as possible and calls
 * preventDefault() immediately, per the browser's own contract for
 * controlling *when* the prompt is shown - the event is otherwise
 * unusable later. Returns an unsubscribe function.
 */
export function onInstallPromptAvailable(
  listener: (event: BeforeInstallPromptEvent) => void
): () => void {
  if (typeof window === "undefined") return () => {};

  const handler = (event: Event) => {
    event.preventDefault();
    listener(event as BeforeInstallPromptEvent);
  };

  window.addEventListener("beforeinstallprompt", handler);
  return () => window.removeEventListener("beforeinstallprompt", handler);
}

export function onAppInstalled(listener: () => void): () => void {
  if (typeof window === "undefined") return () => {};

  window.addEventListener("appinstalled", listener);
  return () => window.removeEventListener("appinstalled", listener);
}

/**
 * A captured event is single-use only once prompt() is actually called -
 * calling this "spends" it. Declining our own custom UI (never calling
 * this) leaves the original event valid for reuse later.
 */
export async function triggerInstallPrompt(
  event: BeforeInstallPromptEvent
): Promise<"accepted" | "dismissed"> {
  await event.prompt();
  const choice = await event.userChoice;
  return choice.outcome;
}
