import type { Metadata } from "next";
import { LegalPageShell } from "@/components/legal/LegalPageShell";
import { LegalSection } from "@/components/legal/LegalSection";
import { siteConfig } from "@/lib/siteConfig";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: `The terms that govern your use of ${siteConfig.name}.`,
  alternates: { canonical: "/terms" },
};

const LAST_UPDATED = "August 5, 2026";

const SECTIONS = [
  { id: "agreement", label: "Agreement to These Terms" },
  { id: "what-reelsavehub-does", label: "What ReelSaveHub Does" },
  { id: "acceptable-use", label: "Acceptable Use" },
  { id: "not-affiliated", label: "Not Affiliated with Instagram or Meta" },
  { id: "intellectual-property", label: "Intellectual Property" },
  { id: "no-warranty", label: "No Warranty" },
  { id: "limitation-of-liability", label: "Limitation of Liability" },
  { id: "changes", label: "Changes to These Terms" },
  { id: "contact", label: "Contact Us" },
];

export default function TermsPage() {
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <h1 className="text-h1 tracking-tight">Terms of Service</h1>
        <p className="text-sm text-muted-foreground">Last updated: {LAST_UPDATED}</p>
      </div>

      <LegalPageShell sections={SECTIONS}>
        <LegalSection id="agreement" title="Agreement to These Terms">
          <p>
            By using ReelSaveHub, you agree to these terms. If you don&apos;t agree with
            them, please don&apos;t use the service. We&apos;ve tried to write these in
            plain language rather than dense legal boilerplate — if anything here is
            unclear, let us know.
          </p>
        </LegalSection>

        <LegalSection id="what-reelsavehub-does" title="What ReelSaveHub Does">
          <p>
            ReelSaveHub&apos;s main tool lets you preview and download media from{" "}
            <strong>public</strong> Instagram posts, reels, videos, and carousels by
            pasting a link. It works entirely without an account, and doesn&apos;t store
            any Instagram media on its own servers — everything is streamed directly from
            Instagram&apos;s content delivery network to your browser.
          </p>
          <p>
            A separate feature lets you download your own private Reels and posts, using
            your own Instagram session cookie. This feature is strictly for downloading{" "}
            <strong>your own</strong> content — it authenticates as you, and only returns
            media if our backend confirms the content actually belongs to the account your
            session cookie represents. It is not a general-purpose way to access other
            people&apos;s private accounts, and using it to attempt to do so is a
            violation of these terms.
          </p>
        </LegalSection>

        <LegalSection id="acceptable-use" title="Acceptable Use">
          <p>
            You agree to use ReelSaveHub only for public content you&apos;re legally
            entitled to access — or, for the own-private-content feature, content that
            genuinely belongs to your own account. You agree not to:
          </p>
          <ul className="flex flex-col gap-2 pl-5">
            <li className="list-disc">Use ReelSaveHub to access, download, or redistribute content you don&apos;t have the rights to.</li>
            <li className="list-disc">
              Attempt to use the own-private-content feature to access another
              person&apos;s private account, or to circumvent Instagram&apos;s own privacy
              controls.
            </li>
            <li className="list-disc">
              Circumvent, automate around, or abuse the service&apos;s rate limits, or use
              the service for bulk/automated scraping.
            </li>
            <li className="list-disc">
              Use ReelSaveHub in any way that violates Instagram&apos;s own Terms of Use, or
              any applicable law.
            </li>
          </ul>
        </LegalSection>

        <LegalSection id="not-affiliated" title="Not Affiliated with Instagram or Meta">
          <p>
            ReelSaveHub is an independent tool and is not affiliated with, endorsed by, or
            sponsored by Instagram or Meta Platforms, Inc. All Instagram content accessed
            through this service remains the property of its respective owners.
            &quot;Instagram&quot; is a trademark of Meta Platforms, Inc.
          </p>
        </LegalSection>

        <LegalSection id="intellectual-property" title="Intellectual Property">
          <p>
            ReelSaveHub doesn&apos;t claim any ownership or rights over content you preview
            or download through the service — that content belongs to its original
            creator, same as it did on Instagram. ReelSaveHub&apos;s own interface, design,
            and code are our property (or that of our licensors), and using the service
            doesn&apos;t grant you any rights to them beyond normal use of the site.
          </p>
        </LegalSection>

        <LegalSection id="no-warranty" title="No Warranty">
          <p>
            ReelSaveHub depends on Instagram&apos;s own, publicly-facing infrastructure,
            which can change without notice. The service is provided &quot;as is,&quot;
            without warranty of any kind, including any guarantee that a given link will
            always successfully resolve, or that the own-private-content feature will
            always be able to authenticate a given session.
          </p>
        </LegalSection>

        <LegalSection id="limitation-of-liability" title="Limitation of Liability">
          <p>
            To the fullest extent permitted by law, ReelSaveHub and its operator are not
            liable for any damages arising from your use of, or inability to use, the
            service, including any consequences of downloading or sharing content you
            weren&apos;t entitled to.
          </p>
        </LegalSection>

        <LegalSection id="changes" title="Changes to These Terms">
          <p>
            We may update these terms from time to time. Continued use of the service
            after a change means you accept the updated terms. Meaningful changes will
            also update the &quot;Last updated&quot; date above.
          </p>
        </LegalSection>

        <LegalSection id="contact" title="Contact Us">
          <p>
            Questions about these terms? Reach out via the{" "}
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
