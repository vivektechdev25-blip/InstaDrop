import Link from "next/link";
import { BrandLogo } from "@/components/layout/BrandLogo";
import { siteConfig } from "@/lib/siteConfig";

const LEGAL_LINKS = [
  { href: "/privacy-policy", label: "Privacy Policy" },
  { href: "/terms", label: "Terms of Service" },
  { href: "/contact", label: "Contact Us" },
];

export function Footer() {
  return (
    <footer className="relative border-t border-border">
      {/* A hairline of the logo's gradient over the top border. */}
      <div aria-hidden="true" className="absolute inset-x-0 -top-px mx-auto h-px max-w-3xl bg-brand-gradient opacity-60" />
      <div className="container flex flex-col items-center gap-3 py-5 text-center">
        <Link href="/" className="flex items-center rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <BrandLogo className="h-10" />
        </Link>

        {/* What ReelSaveNow supports used to be listed here; it now has
            its own page, /support, linked from the header. */}
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
        </div>

        <div className="w-full max-w-xs border-t border-border" aria-hidden="true" />

        <p className="text-sm text-muted-foreground">
          &copy; {new Date().getFullYear()} {siteConfig.name}. Not affiliated with Instagram or Meta.
        </p>
      </div>
    </footer>
  );
}
