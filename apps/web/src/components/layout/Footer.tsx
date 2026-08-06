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
      <div className="container flex flex-col items-center gap-3 py-5 text-center">
        <Link href="/" className="flex items-center gap-2 font-semibold">
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <Download className="h-3.5 w-3.5" />
          </span>
          <span className="bg-hero-gradient bg-clip-text text-lg text-transparent">Instadrop</span>
        </Link>

        <div className="flex flex-col items-center gap-1">
          <nav aria-label="Legal" className="flex flex-wrap items-center justify-center gap-x-2 text-sm text-muted-foreground">
            {LEGAL_LINKS.map((link) => (
              // py-3 pads the text's ~22px line-height up to the 44px WCAG
              // 2.5.5 / Apple HIG touch-target minimum, same standard
              // already enforced elsewhere (Button, Dialog close, paste
              // button) - a plain text link with no padding falls short.
              // The surrounding gaps were shrunk instead, since this
              // padding already carries most of the row's visual space.
              <Link
                key={link.href}
                href={link.href}
                className="inline-flex items-center px-2 py-3 transition-colors duration-150 ease-out hover:text-foreground"
              >
                {link.label}
              </Link>
            ))}
          </nav>

          <div className="flex flex-col items-center gap-1">
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
