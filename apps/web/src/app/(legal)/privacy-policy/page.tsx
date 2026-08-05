import type { Metadata } from "next";
import { LegalPageShell } from "@/components/legal/LegalPageShell";
import { LegalSection } from "@/components/legal/LegalSection";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "How Instadrop handles data: what we collect, what we don't, and why.",
  alternates: { canonical: "/privacy-policy" },
};

const LAST_UPDATED = "August 5, 2026";

const SECTIONS = [
  { id: "overview", label: "Overview" },
  { id: "what-we-collect", label: "What We Collect" },
  { id: "what-we-dont-collect", label: "What We Don't Collect" },
  { id: "local-storage", label: "Local Storage on Your Device" },
  { id: "private-content-cookie", label: "Session Cookie Handling" },
  { id: "third-party-services", label: "Third-Party Services We Use" },
  { id: "your-rights", label: "Your Rights and Choices" },
  { id: "childrens-privacy", label: "Children's Privacy" },
  { id: "changes", label: "Changes to This Policy" },
  { id: "contact", label: "Contact Us" },
];

export default function PrivacyPolicyPage() {
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <h1 className="text-h1 tracking-tight">Privacy Policy</h1>
        <p className="text-sm text-muted-foreground">Last updated: {LAST_UPDATED}</p>
      </div>

      <LegalPageShell sections={SECTIONS}>
        <LegalSection id="overview" title="Overview">
          <p>
            Instadrop is built around a simple principle: the less of your data we hold,
            the less there is to protect, lose, or misuse. There&apos;s no account to
            create, no profile to build, and no media stored on our servers. This page
            explains, section by section, exactly what that means in practice — what
            little we do handle, what we deliberately don&apos;t, and how the one feature
            that touches something genuinely sensitive (your own private content, via a
            session cookie) is handled.
          </p>
        </LegalSection>

        <LegalSection id="what-we-collect" title="What We Collect">
          <p>Instadrop&apos;s backend processes requests to do its job, but doesn&apos;t build a record of who you are.</p>
          <p>
            When you submit a request, our rate limiter briefly holds your IP address in
            memory — only for the duration of the current rate-limit window — purely to
            enforce a per-IP request cap and keep the service available for everyone.
            It&apos;s never written to a database, a log file, or any persistent store, and
            it&apos;s discarded automatically once the window expires.
          </p>
          <p>
            Beyond that in-memory rate-limiting use, we don&apos;t currently log or store
            request-level data at all.
          </p>
        </LegalSection>

        <LegalSection id="what-we-dont-collect" title="What We Don't Collect">
          <p>To be equally clear about what we don&apos;t do:</p>
          <ul className="flex flex-col gap-2 pl-5">
            <li className="list-disc">
              No accounts, sign-in, or user profiles — Instadrop doesn&apos;t ask for a
              username, email address, or password to use the public downloader.
            </li>
            <li className="list-disc">
              No storage of Instagram credentials. The only feature that touches an
              Instagram credential-like value at all is the separate own-private-content
              tool, and even there, nothing is stored — see the dedicated section below.
            </li>
            <li className="list-disc">
              No server-side storage of Instagram media. When you paste a link, our
              backend fetches the corresponding media directly from Instagram&apos;s own
              content delivery network and streams it straight to your browser. It&apos;s
              never saved, cached, or copied onto our servers at any point.
            </li>
            <li className="list-disc">
              No advertising or tracking cookies, and no third-party analytics or
              ad-network scripts of any kind.
            </li>
          </ul>
        </LegalSection>

        <LegalSection id="local-storage" title="Local Storage on Your Device">
          <p>
            A small amount of information is stored locally in your browser — never sent
            to our servers — purely to remember your preferences between visits:
          </p>
          <ul className="flex flex-col gap-2 pl-5">
            <li className="list-disc">Your light/dark theme choice.</li>
            <li className="list-disc">
              Whether you&apos;ve installed Instadrop as an app, or dismissed the install
              prompt, so we don&apos;t ask again on every visit.
            </li>
          </ul>
          <p>
            Because none of this is a tracking or advertising cookie, and none of it is
            shared with us or anyone else, Instadrop doesn&apos;t show a cookie-consent
            banner — there&apos;s nothing here that requires one. If you&apos;d rather not
            keep this locally, clearing your browser&apos;s site data for Instadrop removes
            it.
          </p>
          <p>
            Instadrop&apos;s installable app also caches its own interface files (the code
            that renders the page) on your device for faster loading and offline access to
            the app shell. It does not cache Instagram media, or responses from our API, on
            your device.
          </p>
        </LegalSection>

        <LegalSection id="private-content-cookie" title="Your Own Private Content Feature: Session Cookie Handling">
          <div className="rounded-lg border border-primary/25 bg-primary/5 p-4">
            <span className="mb-2 inline-flex items-center rounded-full border border-primary/30 bg-background px-2.5 py-0.5 text-xs font-medium text-primary">
              Sensitive data handling
            </span>
            <p className="text-sm text-foreground">
              Instadrop&apos;s main tool only works with public content. A separate,
              clearly-labelled feature lets you download your own private Reels and posts
              using your own Instagram session cookie — and because that&apos;s a
              genuinely sensitive piece of data, it gets a section of its own, not a
              footnote.
            </p>
          </div>
          <ul className="flex flex-col gap-2 pl-5">
            <li className="list-disc">The cookie you paste is used only in memory, only for the single request you submit.</li>
            <li className="list-disc">It is never written to a database, a log file, or any cache, at any point.</li>
            <li className="list-disc">
              The browser session created to use it is closed at the end of that one
              request, and the cookie is discarded with it.
            </li>
            <li className="list-disc">
              We verify, on our server, that the content you&apos;re requesting actually
              belongs to the account the cookie authenticates as, before returning
              anything.
            </li>
            <li className="list-disc">
              This feature isn&apos;t linked from our main navigation and isn&apos;t
              indexed by search engines — it&apos;s there if you know to look for it, not
              pushed on anyone.
            </li>
          </ul>
        </LegalSection>

        <LegalSection id="third-party-services" title="Third-Party Services We Use">
          <p>Instadrop keeps its list of third parties short, on purpose:</p>
          <ul className="flex flex-col gap-2 pl-5">
            <li className="list-disc">
              Supabase, our database provider, is configured to host anonymized request
              logs — but as described above, that logging isn&apos;t active yet, so
              Supabase doesn&apos;t currently receive any data from Instadrop. If that
              changes, this section will change with it.
            </li>
            <li className="list-disc">
              Instagram&apos;s own content delivery network, which is where the media you
              download actually comes from. We don&apos;t route it through, or store it
              on, our own infrastructure.
            </li>
          </ul>
          <p>
            Instadrop doesn&apos;t use any advertising networks, third-party analytics
            platforms, or session-replay/tracking tools.
          </p>
        </LegalSection>

        <LegalSection id="your-rights" title="Your Rights and Choices">
          <p>
            Because Instadrop doesn&apos;t create an account or a personal profile for
            you, there generally isn&apos;t a stored personal data record to access,
            correct, or delete beyond what&apos;s already described on this page — the
            request-and-delete process that makes sense for a service with accounts
            doesn&apos;t have much to attach to here. In practice, your choices are:
          </p>
          <ul className="flex flex-col gap-2 pl-5">
            <li className="list-disc">Stop using the service at any time — no account to close, nothing to cancel.</li>
            <li className="list-disc">
              Clear your browser&apos;s local storage/site data for Instadrop to remove
              your saved theme preference and install-prompt history.
            </li>
            <li className="list-disc">
              If you&apos;ve used the own-private-content feature, there&apos;s nothing to
              request deletion of afterward — the session cookie you provided was already
              discarded at the end of that single request, as described above.
            </li>
          </ul>
          <p>
            If you believe we&apos;re handling something incorrectly, or have a question
            this page doesn&apos;t answer, contact us — see below.
          </p>
        </LegalSection>

        <LegalSection id="childrens-privacy" title="Children's Privacy">
          <p>
            Instadrop is not directed at children under 13, and we do not knowingly
            collect information from anyone, regardless of age — in practice this is
            straightforward, since collecting personal information isn&apos;t part of how
            the service works in the first place.
          </p>
        </LegalSection>

        <LegalSection id="changes" title="Changes to This Policy">
          <p>
            If this policy changes in a way that matters, we&apos;ll update this page and
            the &quot;Last updated&quot; date above. We&apos;d encourage checking back
            occasionally if you&apos;re a regular user, rather than assuming this page
            never changes.
          </p>
        </LegalSection>

        <LegalSection id="contact" title="Contact Us">
          <p>
            Questions about this policy? Reach out via the{" "}
            <a href="/contact" className="text-primary underline underline-offset-2">
              contact page
            </a>
            .
          </p>
        </LegalSection>
      </LegalPageShell>
    </div>
  );
}
