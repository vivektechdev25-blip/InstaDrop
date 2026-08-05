import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "How Instadrop handles data: what we collect, what we don't, and why.",
  alternates: { canonical: "/privacy-policy" },
};

const LAST_UPDATED = "August 4, 2026";

export default function PrivacyPolicyPage() {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-h1 tracking-tight">Privacy Policy</h1>
      <p className="text-sm text-muted-foreground">Last updated: {LAST_UPDATED}</p>

      <p className="mt-2 text-muted-foreground">
        Instadrop is built around a simple principle: the less of your data we hold, the
        less there is to protect, lose, or misuse. This page explains exactly what that
        means in practice.
      </p>

      <h2 className="mt-6 text-h2">No accounts, no personal data collection</h2>
      <p className="text-muted-foreground">
        Instadrop doesn&apos;t require — or offer — account creation, sign-in, or a
        profile. We don&apos;t ask for your name, email address, or any other personally
        identifying information to use the service.
      </p>

      <h2 className="mt-6 text-h2">What we do log</h2>
      <p className="text-muted-foreground">
        To prevent abuse and keep the service available for everyone, our backend records
        a minimal, anonymous audit trail for each request: which endpoint was called, the
        response status, and a timestamp. The requester&apos;s IP address is never stored
        in plain text — it&apos;s hashed with SHA-256 and a daily rotating salt before it
        touches our database, so it can&apos;t be reversed back to your real IP or linked
        across days. This log exists solely for security and rate-limiting purposes, and
        is retained only as long as necessary for that purpose.
      </p>

      <h2 className="mt-6 text-h2">Instagram content isn&apos;t stored</h2>
      <p className="text-muted-foreground">
        When you paste a link, our backend fetches the corresponding public media directly
        from Instagram&apos;s own content delivery network and streams it straight to your
        browser. It is never saved, cached, or copied onto our servers at any point.
      </p>

      <h2 className="mt-6 text-h2">Local preferences</h2>
      <p className="text-muted-foreground">
        Your dark/light theme preference is saved in your browser&apos;s local storage. It
        never leaves your device and is not sent to our servers.
      </p>

      <h2 className="mt-6 text-h2">Third-party services</h2>
      <p className="text-muted-foreground">
        We use Supabase to store the anonymous, hashed request logs described above, and
        we fetch media directly from Instagram/Meta&apos;s public infrastructure. Neither
        receives any information that identifies you personally.
      </p>

      <h2 className="mt-6 text-h2">Children&apos;s privacy</h2>
      <p className="text-muted-foreground">
        Instadrop is not directed at children under 13, and we do not knowingly collect
        information from them — in practice, this is straightforward, since we don&apos;t
        collect personal information from anyone.
      </p>

      <h2 className="mt-6 text-h2">Changes to this policy</h2>
      <p className="text-muted-foreground">
        If this policy changes, we&apos;ll update this page and the &quot;Last
        updated&quot; date above.
      </p>

      <h2 className="mt-6 text-h2">Contact</h2>
      <p className="text-muted-foreground">
        Questions about this policy? Reach out via the{" "}
        <a href="/contact" className="text-primary underline underline-offset-2">
          contact page
        </a>
        .
      </p>
    </div>
  );
}
