import Link from "next/link";
import { Download } from "lucide-react";

const LEGAL_LINKS = [
  { href: "/privacy-policy", label: "Privacy Policy" },
  { href: "/terms", label: "Terms of Service" },
  { href: "/contact", label: "Contact Us" },
];

// Plain text, deliberately not links - Instadrop is one unified flow, not
// separate per-content-type pages, so these shouldn't imply otherwise.
const SUPPORTED_CONTENT = "Photos · Reels · Videos · Carousels";

export function Footer() {
  return (
    <footer className="border-t border-border">
      <div className="container flex flex-col items-center gap-8 py-12 text-center">
        <Link href="/" className="flex items-center gap-2 font-semibold">
          <span className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <Download className="h-4 w-4" />
          </span>
          <span className="bg-hero-gradient bg-clip-text text-h3 text-transparent">Instadrop</span>
        </Link>

        <div className="flex flex-col items-center gap-6">
          <nav aria-label="Legal" className="flex flex-wrap items-center justify-center gap-x-2 text-sm text-muted-foreground">
            {LEGAL_LINKS.map((link) => (
              // py-3 pads the text's ~22px line-height up to the 44px WCAG
              // 2.5.5 / Apple HIG touch-target minimum, same standard
              // already enforced elsewhere (Button, Dialog close, paste
              // button) - a plain text link with no padding falls short.
              <Link
                key={link.href}
                href={link.href}
                className="inline-flex items-center px-2 py-3 transition-colors duration-150 ease-out hover:text-foreground"
              >
                {link.label}
              </Link>
            ))}
          </nav>

          <div className="flex flex-col items-center gap-1.5">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Supports</span>
            <p className="text-sm text-muted-foreground">{SUPPORTED_CONTENT}</p>
          </div>
        </div>

        <div className="w-full max-w-xs border-t border-border" aria-hidden="true" />

        <p className="text-sm text-muted-foreground">
          &copy; {new Date().getFullYear()} Instadrop. Not affiliated with Instagram or Meta.
        </p>
      </div>
    </footer>
  );
}
