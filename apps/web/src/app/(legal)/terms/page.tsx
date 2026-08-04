import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "The terms that govern your use of Instadrop.",
  alternates: { canonical: "/terms" },
};

const LAST_UPDATED = "August 4, 2026";

export default function TermsPage() {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-3xl font-bold tracking-tight">Terms of Service</h1>
      <p className="text-sm text-muted-foreground">Last updated: {LAST_UPDATED}</p>

      <p className="mt-2 text-muted-foreground">
        By using Instadrop, you agree to these terms. If you don&apos;t agree with them,
        please don&apos;t use the service.
      </p>

      <h2 className="mt-6 text-xl font-semibold">What Instadrop does</h2>
      <p className="text-muted-foreground">
        Instadrop lets you preview and download media from <strong>public</strong>{" "}
        Instagram posts, reels, videos, and carousels by pasting a link. It works entirely
        without an account. It does not support private accounts, and does not store any
        Instagram media on its own servers — everything is streamed directly from
        Instagram&apos;s content delivery network to your browser.
      </p>

      <h2 className="mt-6 text-xl font-semibold">Your responsibility</h2>
      <p className="text-muted-foreground">
        You&apos;re responsible for how you use content downloaded through Instadrop.
        Only download media you own, have explicit permission to use, or are otherwise
        legally entitled to download — for example, for personal, non-commercial use of
        your own content. Instadrop does not grant you any rights to third-party content,
        and using it to infringe someone else&apos;s copyright or to violate
        Instagram&apos;s own Terms of Use is your responsibility, not ours.
      </p>

      <h2 className="mt-6 text-xl font-semibold">Not affiliated with Instagram or Meta</h2>
      <p className="text-muted-foreground">
        Instadrop is an independent tool and is not affiliated with, endorsed by, or
        sponsored by Instagram or Meta Platforms, Inc. All Instagram content accessed
        through this service remains the property of its respective owners.
      </p>

      <h2 className="mt-6 text-xl font-semibold">Fair use limits</h2>
      <p className="text-muted-foreground">
        To keep the service available and responsive for everyone, requests are rate
        limited per IP address. Attempting to circumvent these limits, or using the
        service for automated bulk scraping, is not permitted.
      </p>

      <h2 className="mt-6 text-xl font-semibold">No warranty</h2>
      <p className="text-muted-foreground">
        Instadrop depends on Instagram&apos;s own, publicly-facing infrastructure, which
        can change without notice. The service is provided &quot;as is,&quot; without
        warranty of any kind, including any guarantee that a given link will always
        successfully resolve.
      </p>

      <h2 className="mt-6 text-xl font-semibold">Limitation of liability</h2>
      <p className="text-muted-foreground">
        To the fullest extent permitted by law, Instadrop and its operator are not liable
        for any damages arising from your use of, or inability to use, the service.
      </p>

      <h2 className="mt-6 text-xl font-semibold">Changes to these terms</h2>
      <p className="text-muted-foreground">
        We may update these terms from time to time. Continued use of the service after a
        change means you accept the updated terms.
      </p>

      <h2 className="mt-6 text-xl font-semibold">Contact</h2>
      <p className="text-muted-foreground">
        Questions about these terms? Reach out via the{" "}
        <a href="/contact" className="text-primary underline underline-offset-2">
          contact page
        </a>
        .
      </p>
    </div>
  );
}
