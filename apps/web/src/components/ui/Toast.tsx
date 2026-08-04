import { CheckCircle2, X, XCircle, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ToastItem } from "@/hooks/useToast";

const VARIANT_ICON: Record<ToastItem["variant"], typeof Info> = {
  default: Info,
  success: CheckCircle2,
  destructive: XCircle,
};

const VARIANT_BORDER: Record<ToastItem["variant"], string> = {
  default: "border-border",
  success: "border-success/40",
  destructive: "border-destructive/40",
};

const VARIANT_ICON_COLOR: Record<ToastItem["variant"], string> = {
  default: "text-muted-foreground",
  success: "text-success",
  destructive: "text-destructive",
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
        // bg-card, not a tinted bg-destructive/10 - confirmed live via a
        // responsive screenshot that the previous translucent background
        // let whatever sat underneath (the submit button, footer links)
        // visibly bleed through the toast, reading as broken overlapping
        // text rather than a floating notification.
        "pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-lg border bg-card p-4 text-card-foreground shadow-lg animate-slide-up",
        VARIANT_BORDER[toastItem.variant]
      )}
    >
      <Icon
        className={cn("mt-0.5 h-5 w-5 shrink-0", VARIANT_ICON_COLOR[toastItem.variant])}
        aria-hidden="true"
      />
      <div className="flex-1">
        <p className="text-sm font-medium">{toastItem.title}</p>
        {toastItem.description ? (
          <p className="mt-1 text-sm text-muted-foreground">{toastItem.description}</p>
        ) : null}
      </div>
      <button
        type="button"
        aria-label="Dismiss notification"
        onClick={() => onDismiss(toastItem.id)}
        className="-m-2.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-md opacity-70 transition-opacity hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
