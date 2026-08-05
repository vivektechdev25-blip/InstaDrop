import type { Metadata } from "next";
import { Mail } from "lucide-react";
import { LegalPageShell } from "@/components/legal/LegalPageShell";
import { LegalSection } from "@/components/legal/LegalSection";

export const metadata: Metadata = {
  title: "Contact",
  description: "Get in touch with the Instadrop team.",
  alternates: { canonical: "/contact" },
};

// Placeholder inbox - flagged here rather than silently treated as final:
// confirm this is a real, monitored address before launch.
const CONTACT_EMAIL = "support@instadrop.app";

const SECTIONS = [
  { id: "how-to-reach-us", label: "How to Reach Us" },
  { id: "what-to-contact-us-about", label: "What to Contact Us About" },
  { id: "copyright-concerns", label: "Copyright Concerns" },
];

export default function ContactPage() {
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <h1 className="text-h1 tracking-tight">Contact</h1>
      </div>

      <LegalPageShell sections={SECTIONS}>
        <LegalSection id="how-to-reach-us" title="How to Reach Us">
          <p>
            The fastest way to reach us is by email. We read everything that comes in,
            even if a reply takes a little while.
          </p>
          <a
            href={`mailto:${CONTACT_EMAIL}`}
            className="inline-flex w-fit items-center gap-2 rounded-md border border-border bg-card px-4 py-3 text-sm font-medium text-foreground transition-colors duration-150 ease-out hover:bg-secondary"
          >
            <Mail className="h-4 w-4" aria-hidden="true" />
            {CONTACT_EMAIL}
          </a>
        </LegalSection>

        <LegalSection id="what-to-contact-us-about" title="What to Contact Us About">
          <p>A few things people reach out about most:</p>
          <ul className="flex flex-col gap-2 pl-5">
            <li className="list-disc">Something&apos;s broken — a link that won&apos;t resolve, a download that fails, a bug in the app.</li>
            <li className="list-disc">A copyright or content-removal concern — see the dedicated section below.</li>
            <li className="list-disc">General questions about how Instadrop works, or a feature you&apos;d like to see.</li>
          </ul>
          <p>
            We don&apos;t currently offer live chat or a ticketing system — email is
            genuinely the way to reach a person, not a queue.
          </p>
        </LegalSection>

        <LegalSection id="copyright-concerns" title="Copyright Concerns">
          <p>
            If you believe content accessible through Instadrop infringes your copyright,
            email us with a description of the content and a link to the original
            Instagram post. Since Instadrop never stores media on its own servers,
            removing the content from Instagram itself is the most direct way to stop it
            from being accessible here — but we&apos;re glad to help point you in the
            right direction if you&apos;re not sure how.
          </p>
        </LegalSection>
      </LegalPageShell>
    </div>
  );
}
