"use client";

import { motion } from "framer-motion";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/Accordion";
import { FAQ_ENTRIES } from "@/components/marketing/faqData";

export function Faq() {
  return (
    <motion.section
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      className="container py-16 sm:py-24"
      data-scroll-reveal
    >
      <div className="mx-auto max-w-xl text-center">
        <h2 className="text-h2">Frequently asked questions</h2>
      </div>

      <Accordion type="single" collapsible className="mx-auto mt-10 max-w-2xl">
        {FAQ_ENTRIES.map((entry) => (
          <AccordionItem key={entry.question} value={entry.question}>
            <AccordionTrigger>{entry.question}</AccordionTrigger>
            <AccordionContent>{entry.answer}</AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </motion.section>
  );
}
