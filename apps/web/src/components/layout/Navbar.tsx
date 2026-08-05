"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Download, Menu, Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useTheme } from "@/hooks/useTheme";
import { cn } from "@/lib/utils";

// Pulls in framer-motion - not needed until a mobile visitor opens the
// menu, so keep it out of the initial page bundle. Not needed for SSR
// either (it's a client-only overlay).
const MobileNav = dynamic(
  () => import("@/components/layout/MobileNav").then((mod) => mod.MobileNav),
  { ssr: false }
);

const NAV_LINKS = [
  { href: "/privacy-policy", label: "Privacy" },
  { href: "/terms", label: "Terms" },
  { href: "/contact", label: "Contact" },
];

export function Navbar() {
  const { theme, toggleTheme } = useTheme();
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur">
      <nav className="container flex h-16 items-center justify-between">
        <Link href="/" className="flex items-center gap-2 font-semibold">
          <span className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <Download className="h-4 w-4" />
          </span>
          <span className="bg-hero-gradient bg-clip-text text-h3 text-transparent">Instadrop</span>
        </Link>

        <div className="hidden items-center gap-6 md:flex">
          {NAV_LINKS.map((link) => {
            const isActive = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "relative py-2 text-sm transition-colors duration-150 ease-out hover:text-foreground",
                  // Underline indicator, not just a color swap - a color-only
                  // "active" state is easy to miss at a glance; a persistent
                  // underline reads immediately, even for colorblind users.
                  isActive
                    ? "text-foreground after:absolute after:inset-x-0 after:-bottom-[1px] after:h-0.5 after:rounded-full after:bg-primary"
                    : "text-muted-foreground"
                )}
              >
                {link.label}
              </Link>
            );
          })}
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
            onClick={toggleTheme}
          >
            {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </Button>

          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            aria-label="Open menu"
            aria-expanded={isMobileNavOpen}
            onClick={() => setIsMobileNavOpen(true)}
          >
            <Menu className="h-5 w-5" />
          </Button>
        </div>
      </nav>

      <MobileNav
        open={isMobileNavOpen}
        onOpenChange={setIsMobileNavOpen}
        links={NAV_LINKS}
      />
    </header>
  );
}
