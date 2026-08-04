"use client";

import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";

interface MobileNavLink {
  href: string;
  label: string;
}

interface MobileNavProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  links: MobileNavLink[];
}

export function MobileNav({ open, onOpenChange, links }: MobileNavProps) {
  return (
    <AnimatePresence>
      {open ? (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm md:hidden"
            onClick={() => onOpenChange(false)}
            aria-hidden="true"
          />
          <motion.nav
            initial={{ y: "-100%" }}
            animate={{ y: 0 }}
            exit={{ y: "-100%" }}
            transition={{ type: "tween", duration: 0.25 }}
            className="fixed inset-x-0 top-0 z-50 border-b border-border bg-background p-6 md:hidden"
            aria-label="Mobile navigation"
          >
            {/* py-3 on each link (not the old zero-padding plain text) -
                confirmed live via a responsive screenshot check that the
                links measured 24px tall, well under the 44px WCAG 2.5.5 /
                Apple HIG touch-target minimum. gap dropped since the
                links' own padding now provides the spacing. */}
            <ul className="flex flex-col gap-1">
              {links.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="-mx-3 block rounded-md px-3 py-3 text-base font-medium text-foreground transition-colors hover:bg-secondary"
                    onClick={() => onOpenChange(false)}
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </motion.nav>
        </>
      ) : null}
    </AnimatePresence>
  );
}
