import { readStorage, removeStorage, writeStorage } from "./storage";

const DISMISSAL_STORAGE_KEY = "instadrop-pwa-dismissal";
const INSTALLED_STORAGE_KEY = "instadrop-pwa-installed";
const OPTED_OUT_STORAGE_KEY = "instadrop-pwa-opted-out";

// Re-show the prompt after whichever comes first. Instadrop is an
// occasional-use utility, not a daily habit app - users often return in
// bursts every few days, so a pure day-based or pure visit-based cooldown
// each fail in opposite ways (re-showing mid-task on a quick return visit,
// or re-showing minutes later on a same-session reload).
export const REMINDER_COOLDOWN_DAYS = 3;
export const REMINDER_COOLDOWN_VISITS = 3;

// After this many dismissals, stop asking permanently rather than
// repeating every cooldown cycle forever - a user who's said no 3 times
// has made their preference clear.
export const MAX_DISMISSALS = 3;

const REMINDER_COOLDOWN_MS = REMINDER_COOLDOWN_DAYS * 24 * 60 * 60 * 1000;

interface DismissalRecord {
  dismissedAt: number;
  dismissCount: number;
  visitsSinceDismissal: number;
}

export function isPersistedInstalled(): boolean {
  return readStorage<boolean>(INSTALLED_STORAGE_KEY) === true;
}

export function markPersistedInstalled(): void {
  writeStorage(INSTALLED_STORAGE_KEY, true);
  removeStorage(DISMISSAL_STORAGE_KEY);
}

function isOptedOut(): boolean {
  return readStorage<boolean>(OPTED_OUT_STORAGE_KEY) === true;
}

function getDismissalRecord(): DismissalRecord | null {
  return readStorage<DismissalRecord>(DISMISSAL_STORAGE_KEY);
}

export function recordDismissal(): void {
  const existing = getDismissalRecord();
  const dismissCount = (existing?.dismissCount ?? 0) + 1;

  if (dismissCount >= MAX_DISMISSALS) {
    writeStorage(OPTED_OUT_STORAGE_KEY, true);
    removeStorage(DISMISSAL_STORAGE_KEY);
    return;
  }

  writeStorage<DismissalRecord>(DISMISSAL_STORAGE_KEY, {
    dismissedAt: Date.now(),
    dismissCount,
    visitsSinceDismissal: 0,
  });
}

export function recordVisit(): void {
  const existing = getDismissalRecord();
  if (!existing) return;

  writeStorage<DismissalRecord>(DISMISSAL_STORAGE_KEY, {
    ...existing,
    visitsSinceDismissal: existing.visitsSinceDismissal + 1,
  });
}

export interface ShouldShowPromptInput {
  canInstall: boolean;
  isInstalled: boolean;
}

export function shouldShowPrompt({ canInstall, isInstalled }: ShouldShowPromptInput): boolean {
  if (isInstalled || isPersistedInstalled()) return false;
  if (!canInstall) return false;
  if (isOptedOut()) return false;

  const record = getDismissalRecord();
  if (!record) return true;

  const cooldownElapsed = Date.now() - record.dismissedAt >= REMINDER_COOLDOWN_MS;
  const visitsElapsed = record.visitsSinceDismissal >= REMINDER_COOLDOWN_VISITS;
  return cooldownElapsed || visitsElapsed;
}
