import fs from "node:fs";
import path from "node:path";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { generateMetadata as homeMetadata } from "@/app/page";
import { metadata as catchAllMetadata } from "@/app/[...url]/page";
import { metadata as privateMetadata } from "@/app/private/page";
import { metadata as supportMetadata } from "@/app/support/page";
import { metadata as contactMetadata } from "@/app/(legal)/contact/page";
import PrivacyPolicyPage, { metadata as privacyMetadata } from "@/app/(legal)/privacy-policy/page";
import TermsPage, { metadata as termsMetadata } from "@/app/(legal)/terms/page";
import { formatLegalDate, PRIVACY_POLICY_UPDATED, TERMS_UPDATED } from "@/lib/legalDates";

beforeAll(() => {
  // The legal pages' table of contents watches headings as they scroll by.
  globalThis.IntersectionObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof IntersectionObserver;
});

afterEach(cleanup);

describe("page metadata", () => {
  it("gives every indexable page a canonical equal to its sitemap path", () => {
    expect(supportMetadata.alternates?.canonical).toBe("/support");
    expect(contactMetadata.alternates?.canonical).toBe("/contact");
    expect(privacyMetadata.alternates?.canonical).toBe("/privacy-policy");
    expect(termsMetadata.alternates?.canonical).toBe("/terms");
    // The plain homepage inherits the root layout's canonical, "/". (The
    // layout itself loads next/font, which can't run here, so read it.)
    expect(homeMetadata({ searchParams: {} })).toEqual({});
    const layout = fs.readFileSync(path.join(__dirname, "layout.tsx"), "utf8");
    expect(layout).toMatch(/alternates:\s*{\s*canonical:\s*"\/"/);
  });

  it("marks the utility routes noindex, with no canonical to contradict it", () => {
    const noindex = [
      privateMetadata,
      catchAllMetadata,
      homeMetadata({ searchParams: { url: "https://www.instagram.com/reel/x/" } }),
    ];
    for (const meta of noindex) {
      expect(meta.robots).toEqual({ index: false, follow: false });
      expect(meta.alternates).toEqual({ canonical: null });
    }
  });

  it("shows the legal pages' Last updated date from the module the sitemap reads", () => {
    render(<PrivacyPolicyPage />);
    expect(screen.getByText(`Last updated: ${formatLegalDate(PRIVACY_POLICY_UPDATED)}`)).toBeTruthy();
    cleanup();
    render(<TermsPage />);
    expect(screen.getByText(`Last updated: ${formatLegalDate(TERMS_UPDATED)}`)).toBeTruthy();
  });
});
