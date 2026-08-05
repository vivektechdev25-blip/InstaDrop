import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/Accordion";

const STEPS = [
  "Open instagram.com in your browser and make sure you're logged in.",
  'Open your browser\'s developer tools (press F12, or right-click anywhere and choose "Inspect").',
  'Go to the "Application" tab (Chrome/Edge) or "Storage" tab (Firefox), then find "Cookies" in the sidebar and click on instagram.com.',
  'Find the row named "sessionid" and copy its Value.',
  "Paste that value into the field below.",
];

/**
 * Collapsed by default (single Accordion item) - available for anyone who
 * needs it, without making the page feel more technical/alarming than it
 * needs to for someone who already knows what they're doing.
 */
export function CookieHelpGuide() {
  return (
    <Accordion type="single" collapsible className="w-full">
      <AccordionItem value="cookie-help">
        <AccordionTrigger>How do I find my session cookie?</AccordionTrigger>
        <AccordionContent>
          <ol className="flex flex-col gap-2">
            {STEPS.map((step, index) => (
              <li key={step} className="flex gap-3 text-sm text-muted-foreground">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-semibold text-secondary-foreground">
                  {index + 1}
                </span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}
