import { CheckCircle2, X, XCircle, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ToastItem } from "@/hooks/useToast";

const VARIANT_ICON: Record<ToastItem["variant"], typeof Info> = {
  default: Info,
  success: CheckCircle2,
  destructive: XCircle,
};

const VARIANT_STYLES: Record<ToastItem["variant"], string> = {
  default: "border-border bg-card text-card-foreground",
  success: "border-success/30 bg-success/10 text-success",
  destructive: "border-destructive/30 bg-destructive/10 text-destructive",
};

export interface ToastProps {
  toastItem: ToastItem;
  onDismiss: (id: string) => void;
}

export function Toast({ toastItem, onDismiss }: ToastProps) {
  const Icon = VARIANT_ICON[toastItem.variant];

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-lg border p-4 shadow-lg animate-slide-up",
        VARIANT_STYLES[toastItem.variant]
      )}
    >
      <Icon className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
      <div className="flex-1">
        <p className="text-sm font-medium">{toastItem.title}</p>
        {toastItem.description ? (
          <p className="mt-1 text-sm opacity-90">{toastItem.description}</p>
        ) : null}
      </div>
      <button
        type="button"
        aria-label="Dismiss notification"
        onClick={() => onDismiss(toastItem.id)}
        className="shrink-0 rounded-md opacity-70 transition-opacity hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
