const TRUST_ITEMS = [
  "No login required",
  "No watermark",
  "Original quality",
  "Photos · Reels · Videos · Carousels",
];

/**
 * A quiet footnote to InputForm, not a competing banner - reuses the
 * hero's existing badge style (rounded-full pill, muted text) as its
 * visual precedent rather than introducing a new "stat banner" look.
 * Deliberately carries no speed claim: Tier 1 succeeds in well under a
 * second, but the Playwright fallback (Tier 2) takes ~4-5s, so a single
 * blanket number would be honest in the best case and misleading in the
 * worst - see docs/KNOWN_ISSUES.md.
 */
export function TrustBar() {
  return (
    <div
      role="list"
      className="flex flex-wrap items-center justify-center gap-2 sm:gap-3"
    >
      {TRUST_ITEMS.map((item) => (
        <span
          key={item}
          role="listitem"
          className="rounded-full border border-border px-3.5 py-1.5 text-sm font-medium text-muted-foreground"
        >
          {item}
        </span>
      ))}
    </div>
  );
}
