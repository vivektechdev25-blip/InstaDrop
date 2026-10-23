import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { ReactNode } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import HomePage from "@/app/page";
import PrivacyPolicyPage from "@/app/(legal)/privacy-policy/page";
import TermsPage from "@/app/(legal)/terms/page";
import SupportPage from "@/app/support/page";
import { Faq } from "@/components/marketing/Faq";
import { FAQ_ENTRIES } from "@/components/marketing/faqData";
import { FeatureList } from "@/components/marketing/FeatureList";
import { siteConfig } from "@/lib/siteConfig";
import { APPLICATION_JSON_LD } from "@/lib/structuredData";

// What the site says about Download Audio (MP3), and that it says nothing
// the feature can't back up. The downloader itself has its own tests.
vi.mock("@/components/downloader/DownloaderPage", () => ({
  DownloaderPage: ({ children }: { children?: ReactNode }) => <main>{children}</main>,
}));
vi.mock("@/components/layout/Navbar", () => ({ Navbar: () => <header /> }));
vi.mock("@/components/layout/Footer", () => ({ Footer: () => <footer /> }));

const MP3_QUESTION = "Can I download just the audio of a Reel as MP3?";
// The wording the site used before audio joining and MP3 conversion, both
// of which briefly write a temporary file on the server.
const OUTDATED_CLAIMS = [
  "never saved, cached, or copied",
  "everything is streamed directly",
  "We never store a copy on our servers",
  "We don't re-compress, resize or watermark anything",
];

beforeAll(() => {
  // The legal pages' table of contents watches headings as they scroll by.
  globalThis.IntersectionObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof IntersectionObserver;
});

afterEach(cleanup);

const pageText = () => document.body.textContent ?? "";

describe("site copy: Download Audio (MP3)", () => {
  it("answers the MP3 question in the FAQ, with its limits", () => {
    render(<Faq />);

    fireEvent.click(screen.getByRole("button", { name: MP3_QUESTION }));

    const answer = pageText();
    expect(answer).toContain("press Download Audio (MP3) to save only its sound");
    expect(answer).toContain("personal use");
    expect(answer).toContain("the button is greyed out");
  });

  it("puts the same answer in the homepage's FAQPage structured data", () => {
    render(<HomePage searchParams={{}} />);

    const blocks = Array.from(document.querySelectorAll('script[type="application/ld+json"]')).map(
      (script) => JSON.parse(script.textContent ?? "") as { "@type": string; mainEntity?: Array<{ name: string; acceptedAnswer: { text: string } }> }
    );
    const faq = blocks.find((block) => block["@type"] === "FAQPage");
    const entry = faq?.mainEntity?.find((question) => question.name === MP3_QUESTION);
    expect(entry?.acceptedAnswer.text).toBe(FAQ_ENTRIES.find((item) => item.question === MP3_QUESTION)?.answer);
  });

  it("mentions MP3 in the meta description, within 155 characters", () => {
    expect(siteConfig.description).toContain("MP3");
    expect(siteConfig.description).toContain("public");
    expect(siteConfig.description).toContain("No login required");
    expect(siteConfig.description.length).toBeLessThanOrEqual(155);
  });

  it("names the button in the Support page's Instagram Reels card", () => {
    render(<SupportPage />);

    const card = screen.getByRole("heading", { level: 3, name: "Instagram Reels" }).parentElement;
    expect(card?.textContent).toContain("Download Audio (MP3) to save just the sound");
  });

  it("lists the MP3 feature in the WebApplication structured data", () => {
    const schema = JSON.parse(JSON.stringify(APPLICATION_JSON_LD)) as typeof APPLICATION_JSON_LD;
    expect(schema["@type"]).toBe("WebApplication");
    expect(schema.featureList).toContain("Save a Reel's audio as MP3");
    expect(schema.description).toBe(siteConfig.description);

    // And that it is the object the layout renders.
    const layout = readFileSync(join(__dirname, "layout.tsx"), "utf8");
    expect(layout).toContain('import { APPLICATION_JSON_LD } from "@/lib/structuredData"');
    expect(layout).toContain("JSON.stringify(APPLICATION_JSON_LD)");
  });
});

describe("site copy: what happens to downloaded files", () => {
  it.each([
    ["the Privacy Policy", () => render(<PrivacyPolicyPage />)],
    ["the Terms", () => render(<TermsPage />)],
    ["the Support page", () => render(<SupportPage />)],
    ["the homepage feature list", () => render(<FeatureList />)],
  ])("%s no longer claims nothing is ever written on the server", (_label, renderPage) => {
    renderPage();
    const text = pageText();
    for (const claim of OUTDATED_CLAIMS) expect(text).not.toContain(claim);
    expect(text).toMatch(/temporary file/);
  });

  it.each([
    ["the Privacy Policy", () => render(<PrivacyPolicyPage />)],
    ["the Terms", () => render(<TermsPage />)],
    ["the Support page", () => render(<SupportPage />)],
  ])("%s says the temporary file is deleted when the download ends", (_label, renderPage) => {
    renderPage();
    expect(pageText()).toContain("deleted as soon as the download finishes or fails");
  });
});
