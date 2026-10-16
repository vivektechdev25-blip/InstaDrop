"use client";

import Link from "next/link";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/Accordion";
import { FAQ_ENTRIES } from "@/components/marketing/faqData";
import { reveal } from "@/components/motion/ScrollReveal";

export function Faq() {
  return (
    <section aria-labelledby="faq-heading" className="container pb-16 pt-12 sm:pb-20 sm:pt-16">
      {/* Side by side from lg: - a centred 768px column left most of a wide
          screen empty. The heading column carries a way out for questions
          the list does not answer. Phones keep the stacked, centred layout. */}
      <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-[minmax(0,0.75fr)_minmax(0,1.25fr)] lg:items-start lg:gap-16">
        <div
          {...reveal()}
          className="mx-auto flex max-w-xl flex-col items-center gap-3 text-center lg:sticky lg:top-24 lg:mx-0 lg:items-start lg:text-left"
        >
          <span className="text-eyebrow uppercase text-primary">FAQ</span>
          <h2 id="faq-heading" className="text-h2">
            Frequently asked <span className="text-brand-gradient">questions</span>
          </h2>
          <p className="text-body text-muted-foreground">
            Can&apos;t find your answer?{" "}
            <Link href="/contact" className="font-semibold text-primary underline-offset-4 hover:underline">
              Get in touch
            </Link>
            .
          </p>
        </div>

        {/* One card around the list rather than loose rows on the page, so
            the section has an edge and the questions read as one unit. */}
        <div
          {...reveal(1)}
          className="w-full rounded-lg border border-border bg-card px-5 shadow-sm sm:px-7"
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
      </div>
    </section>
  );
}
