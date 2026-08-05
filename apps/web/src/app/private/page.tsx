import type { Metadata } from "next";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { PrivateContentForm } from "@/components/private/PrivateContentForm";

// Deliberately noindex (2026-08-05, per architecture approval) - not a
// technical requirement the way the ?url= shortcut's noindex is, but a
// page instructing users to extract a session cookie could read oddly out
// of context to an automated crawler. Also deliberately not linked from
// Navbar/Footer - this is a credential-adjacent flow aimed at a narrower,
// more technical audience, reached by direct URL only, not one click away
// from the main public flow where a casual visitor could stumble into it.
export const metadata: Metadata = {
  title: "Download Your Own Private Content",
  robots: { index: false, follow: false },
};

export default function PrivateContentPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />

      <main className="flex-1">
        <section className="container flex flex-col items-center gap-6 py-16 text-center sm:py-24">
          <h1 className="max-w-2xl text-h1 tracking-tight">
            Download Your Own Private Content
          </h1>

          <p className="max-w-xl text-balance text-base text-muted-foreground">
            This is a separate flow from the main downloader above, built specifically
            for content on your own private account. It works by using a temporary session
            cookie from your own logged-in Instagram session — the same way your browser
            proves you're logged in.
          </p>

          <div className="w-full max-w-xl rounded-lg border border-border bg-card p-4 text-left">
            <p className="text-sm text-muted-foreground">
              <span className="font-medium text-foreground">What this does and doesn&apos;t do:</span>{" "}
              your session cookie is used only to fetch content that belongs to your own
              account, and only for the single request you submit — it is never stored,
              logged, or saved anywhere, on this server or anywhere else. This only works
              for your own Reels and posts. It does not work for other people&apos;s private
              accounts, and it does not currently support Stories.
            </p>
          </div>

          <div className="w-full max-w-xl">
            <PrivateContentForm />
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
