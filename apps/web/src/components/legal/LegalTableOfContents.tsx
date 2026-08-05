"use client";

import { useEffect, useState } from "react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/Accordion";
import { cn } from "@/lib/utils";

export interface TocSection {
  id: string;
  label: string;
}

/**
 * Two renderings of the same section list, one hidden below `lg`, the
 * other hidden at `lg`+ - not two components, so callers never have to
 * pick the right one for a given viewport themselves.
 */
export function LegalTableOfContents({ sections }: { sections: TocSection[] }) {
  const [activeId, setActiveId] = useState(sections[0]?.id ?? "");

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const firstVisible = entries.find((entry) => entry.isIntersecting);
        if (firstVisible) setActiveId(firstVisible.target.id);
      },
      // Trigger zone is a thin band near the top of the viewport, below
      // the sticky Navbar - reads naturally as "which section is at the
      // top of my screen right now" rather than "which is fully visible".
      { rootMargin: "-96px 0px -70% 0px" }
    );

    for (const { id } of sections) {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    }

    return () => observer.disconnect();
  }, [sections]);

  return (
    <>
      <nav aria-label="Table of contents" className="hidden lg:block">
        <div className="sticky top-24 flex flex-col gap-1">
          <span className="mb-2 px-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            On this page
          </span>
          {sections.map((section) => (
            <a
              key={section.id}
              href={`#${section.id}`}
              aria-current={activeId === section.id ? "location" : undefined}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm transition-colors duration-150 ease-out",
                activeId === section.id
                  ? "bg-secondary font-medium text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {section.label}
            </a>
          ))}
        </div>
      </nav>

      <div className="rounded-lg border border-border bg-card px-4 lg:hidden">
        <Accordion type="single" collapsible>
          <AccordionItem value="toc" className="border-b-0">
            <AccordionTrigger>Jump to section</AccordionTrigger>
            <AccordionContent>
              <nav aria-label="Table of contents" className="flex flex-col gap-1">
                {sections.map((section) => (
                  <a
                    key={section.id}
                    href={`#${section.id}`}
                    className="rounded-md px-2 py-1.5 text-sm text-muted-foreground transition-colors duration-150 ease-out hover:text-foreground"
                  >
                    {section.label}
                  </a>
                ))}
              </nav>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </div>
    </>
  );
}
