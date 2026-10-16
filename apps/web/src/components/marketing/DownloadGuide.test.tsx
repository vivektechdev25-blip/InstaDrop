import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { DownloadGuide } from "@/components/marketing/DownloadGuide";

afterEach(cleanup);

describe("DownloadGuide", () => {
  it("walks through three ways to get a link, each as numbered steps", () => {
    render(<DownloadGuide />);
    const methods = screen.getAllByRole("article");
    expect(methods).toHaveLength(3);

    const titles = methods.map((method) => within(method).getByRole("heading", { level: 3 }).textContent);
    expect(titles).toEqual(["From the Instagram app", "On a computer", "The address-bar shortcut"]);

    for (const method of methods) {
      const steps = within(method).getByRole("list");
      expect(steps.tagName).toBe("OL");
      expect(within(steps).getAllByRole("listitem").length).toBeGreaterThanOrEqual(3);
    }
  });

  it("names Copy link where the guide relies on it", () => {
    render(<DownloadGuide />);
    const [phone, desktop] = screen.getAllByRole("article");
    expect(phone!.textContent).toContain("Copy link");
    expect(desktop!.textContent).toContain("Copy link");
  });

  // Every illustration is described for screen readers; the steps beside it
  // carry the instructions themselves.
  it("labels every illustration", () => {
    render(<DownloadGuide />);
    const illustrations = screen.getAllByRole("img");
    expect(illustrations).toHaveLength(3);
    for (const illustration of illustrations) {
      expect(illustration.getAttribute("aria-label")).toMatch(/^Illustration: /);
    }
  });

  // The site states it is not affiliated with Instagram or Meta, so its
  // pages carry no Instagram imagery: the photos are this site's own, served
  // from its own origin, sized up front so they cannot shift the layout.
  it("shows only its own local, pre-sized, lazy photos", () => {
    const { container } = render(<DownloadGuide />);
    const photos = Array.from(container.querySelectorAll("img"));
    expect(photos).toHaveLength(3);
    for (const photo of photos) {
      expect(photo.getAttribute("src")).toMatch(/^\/guide\/(phone|laptop|shortcut)-1280\.webp$/);
      expect(photo.getAttribute("srcset")).toMatch(/-720\.webp 720w, .*-1280\.webp 1280w$/);
      expect(photo.getAttribute("width")).toBe("1280");
      expect(photo.getAttribute("height")).toBe("960");
      expect(photo.getAttribute("loading")).toBe("lazy");
    }
    expect(container.innerHTML).not.toMatch(/cdninstagram|fbcdn|instagram\.com\/static/);
  });

  it("arrives with the page's scroll reveal, steps staggered", () => {
    const { container } = render(<DownloadGuide />);
    const firstSteps = container.querySelectorAll("article")[0]!.querySelectorAll("li[data-reveal]");
    const orders = Array.from(firstSteps).map((step) => (step as HTMLElement).style.getPropertyValue("--reveal-order"));
    expect(orders).toEqual(["2", "3", "4", "5"]);
  });
});
