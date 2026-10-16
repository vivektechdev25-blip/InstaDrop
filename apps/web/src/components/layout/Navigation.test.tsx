import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { Footer } from "@/components/layout/Footer";
import { Navbar } from "@/components/layout/Navbar";
import { ThemeProvider } from "@/hooks/useTheme";

vi.mock("next/navigation", () => ({ usePathname: () => "/" }));

beforeAll(() => {
  // jsdom has no matchMedia; the theme hook reads it for the system theme.
  // A plain function, not vi.fn(): the test config resets mocks between
  // tests, which would wipe a mocked return value.
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia;
});

afterEach(cleanup);

describe("site navigation", () => {
  it("leads with Home and puts Support right after Contact", () => {
    render(
      <ThemeProvider>
        <Navbar />
      </ThemeProvider>
    );
    const header = screen.getByRole("navigation");
    // The logo also links home but has no text of its own (it is an image).
    const links = within(header)
      .getAllByRole("link")
      .filter((link) => link.textContent?.trim());
    expect(links.map((link) => [link.textContent, link.getAttribute("href")])).toEqual([
      ["Home", "/"],
      ["Privacy", "/privacy-policy"],
      ["Terms", "/terms"],
      ["Contact", "/contact"],
      ["Support", "/support"],
    ]);
    // usePathname is mocked to "/", so Home is the current page.
    expect(within(header).getByRole("link", { name: "Home" }).getAttribute("aria-current")).toBe("page");
  });

  // The supported-content list moved to /support; the footer keeps only the
  // legal links.
  it("no longer lists supported content in the footer", () => {
    const { container } = render(<Footer />);
    expect(container.textContent).not.toMatch(/Supports/i);
    expect(container.textContent).not.toContain("Photos · Reels · Videos · Carousels");
    const legal = screen.getByRole("navigation", { name: "Legal" });
    expect(within(legal).getAllByRole("link").map((link) => link.getAttribute("href"))).toEqual([
      "/privacy-policy",
      "/terms",
      "/contact",
    ]);
  });
});
