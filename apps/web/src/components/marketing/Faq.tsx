"use client";

import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/Accordion";
import { FAQ_ENTRIES } from "@/components/marketing/faqData";
import { reveal } from "@/components/motion/ScrollReveal";

export function Faq() {
  return (
    <section aria-labelledby="faq-heading" className="container pb-16 pt-4 sm:pb-20 sm:pt-6">
      <div {...reveal()} className="mx-auto flex max-w-xl flex-col items-center gap-3 text-center">
        <span className="text-eyebrow uppercase text-primary">FAQ</span>
        <h2 id="faq-heading" className="text-h2">
          Frequently asked <span className="text-brand-gradient">questions</span>
        </h2>
      </div>

      {/* One card around the list rather than loose rows on the page, so the
          section has an edge and the questions read as one unit. */}
      <div
        {...reveal(1)}
        className="mx-auto mt-10 max-w-3xl rounded-lg border border-border bg-card px-5 shadow-sm sm:px-7"
      >
        <Accordion type="single" collapsible>
          {FAQ_ENTRIES.map((entry) => (
            <AccordionItem key={entry.question} value={entry.question}>
              <AccordionTrigger>{entry.question}</AccordionTrigger>
              <AccordionContent>{entry.answer}</AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </section>
  );
}
