import { Check } from "lucide-react";

const TRUST_ITEMS = [
  "No login required",
  "No watermark",
  "Original quality",
  "Photos · Reels · Videos · Carousels",
];

/**
 * A quiet footnote to InputForm, not a competing banner. Deliberately
 * carries no speed claim: Tier 1 succeeds in well under a second, but the
 * Playwright fallback (Tier 2) takes ~4-5s, so a single blanket number would
 * be honest in the best case and misleading in the worst - see
 * docs/KNOWN_ISSUES.md.
 */
export function TrustBar() {
  return (
    <div role="list" className="flex flex-wrap items-center justify-center gap-2 sm:gap-2.5">
      {TRUST_ITEMS.map((item) => (
        <span
          key={item}
          role="listitem"
          className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card/80 px-3 py-1.5 text-[0.8125rem] font-medium text-foreground/80 shadow-sm"
        >
          <Check className="h-3.5 w-3.5 text-primary" strokeWidth={3} aria-hidden="true" />
          {item}
        </span>
      ))}
    </div>
  );
}
