import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import SupportPage from "@/app/support/page";

// The header and footer have their own tests; here they only need to exist.
vi.mock("@/components/layout/Navbar", () => ({ Navbar: () => <header /> }));
vi.mock("@/components/layout/Footer", () => ({ Footer: () => <footer /> }));

afterEach(cleanup);

function headings(level: number) {
  return screen.getAllByRole("heading", { level }).map((heading) => heading.textContent);
}

describe("Support page", () => {
  it("explains every service and feature it was asked to cover", () => {
    render(<SupportPage />);
    expect(headings(1)).toEqual(["How can we help?"]);
    expect(headings(3)).toEqual(
      expect.arrayContaining([
        "Instagram Reels",
        "Photos",
        "Videos",
        "Carousels",
        "Original quality",
        "No login required",
        "Phones and tablets",
        "Laptops and desktops",
      ])
    );
    expect(headings(2)).toContain("When something doesn't work");
  });

  // Troubleshooting quotes the messages the site really shows, so a reader
  // can match what is on their screen.
  it("quotes the site's own messages in Troubleshooting", () => {
    const { container } = render(<SupportPage />);
    for (const message of [
      "Please paste a valid public Instagram post, reel, or IGTV link.",
      "This content is from a private Instagram account and cannot be processed.",
      "This post could not be found. It may have been deleted or the link is incorrect.",
      "Could not download this media right now. Please try again.",
    ]) {
      expect(container.textContent).toContain(message);
    }
  });

  it("does not promise what the app cannot do", () => {
    const { container } = render(<SupportPage />);
    const text = container.textContent ?? "";
    expect(text).toContain("Stories and Highlights aren't supported");
    expect(text).not.toMatch(/download (all|everything) at once|private accounts? (are|is) supported/i);
  });

  it("jumps to each section and links on to Contact and the downloader", () => {
    const { container } = render(<SupportPage />);
    const anchors = Array.from(container.querySelectorAll('nav[aria-label="On this page"] a'));
    for (const anchor of anchors) {
      const id = anchor.getAttribute("href")!.slice(1);
      expect(container.querySelector(`#${id}`)).not.toBeNull();
    }
    expect(anchors).toHaveLength(4);
    expect(screen.getByRole("link", { name: /Contact us/ }).getAttribute("href")).toBe("/contact");
    expect(screen.getByRole("link", { name: "Back to the downloader" }).getAttribute("href")).toBe("/");
  });
});
