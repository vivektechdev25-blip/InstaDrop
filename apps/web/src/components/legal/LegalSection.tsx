import type { ReactNode } from "react";

interface LegalSectionProps {
  id: string;
  title: string;
  children: ReactNode;
}

// Reusable heading+anchor wrapper so each legal page just supplies a list
// of sections instead of repeating the same id/heading boilerplate three
// times. scroll-mt-24 keeps a jumped-to heading clear of the sticky
// Navbar (h-16) instead of landing flush against it.
export function LegalSection({ id, title, children }: LegalSectionProps) {
  return (
    <section id={id} className="scroll-mt-24">
      <h2 className="text-h2">{title}</h2>
      <div className="mt-3 flex flex-col gap-3 text-muted-foreground">{children}</div>
    </section>
  );
}
