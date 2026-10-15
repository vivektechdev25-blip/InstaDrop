import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { BrandLogo } from "@/components/layout/BrandLogo";

afterEach(cleanup);

describe("BrandLogo", () => {
  it("renders a light and a dark variant, swapped by the theme class", () => {
    const { container } = render(<BrandLogo className="h-9" />);
    const [light, dark] = Array.from(container.querySelectorAll("img"));

    expect(light?.getAttribute("src")).toBe("/brand/wordmark-light.webp");
    expect(light?.className).toContain("dark:hidden");
    expect(dark?.getAttribute("src")).toBe("/brand/wordmark-dark.webp");
    expect(dark?.className).toContain("hidden");
    expect(dark?.className).toContain("dark:block");
  });

  // Without intrinsic dimensions the header jumps when the image arrives.
  it("reserves its box before the image loads", () => {
    const { container } = render(<BrandLogo />);
    for (const image of Array.from(container.querySelectorAll("img"))) {
      expect(image.getAttribute("width")).toBe("348");
      expect(image.getAttribute("height")).toBe("120");
    }
  });

  it("names the site for assistive technology", () => {
    const { container } = render(<BrandLogo />);
    for (const image of Array.from(container.querySelectorAll("img"))) {
      expect(image.getAttribute("alt")).toBe("ReelSaveNow");
    }
  });
});
