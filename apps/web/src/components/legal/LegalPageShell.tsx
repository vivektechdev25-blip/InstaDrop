import type { ReactNode } from "react";
import { LegalTableOfContents, type TocSection } from "@/components/legal/LegalTableOfContents";

interface LegalPageShellProps {
  sections: TocSection[];
  children: ReactNode;
}

// Owns the two-column grid (TOC + reading column) so the three legal
// pages don't each hand-roll the same layout - they just supply their
// own section list and content.
export function LegalPageShell({ sections, children }: LegalPageShellProps) {
  return (
    <div className="grid gap-8 lg:grid-cols-[220px_1fr] lg:gap-12">
      <LegalTableOfContents sections={sections} />
      <div className="flex max-w-prose flex-col gap-10">{children}</div>
    </div>
  );
}
