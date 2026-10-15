import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ScrollReveal, reveal } from "@/components/motion/ScrollReveal";

type Callback = (entries: Array<{ isIntersecting: boolean; target: Element }>) => void;

let observerCallback: Callback | null = null;
let observed: Element[] = [];

class FakeIntersectionObserver {
  constructor(callback: Callback) {
    observerCallback = callback;
  }
  observe(element: Element) {
    observed.push(element);
  }
  unobserve(element: Element) {
    observed = observed.filter((item) => item !== element);
  }
  disconnect() {
    observed = [];
  }
}

function mockMotionPreference(reduce: boolean) {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: reduce && query.includes("reduce"),
    addEventListener() {},
    removeEventListener() {},
  }));
}

/** Places an element at a fixed distance from the top of the viewport. */
function at(element: Element | null, top: number): void {
  if (!element) throw new Error("missing element");
  element.getBoundingClientRect = () => ({ top, bottom: top + 100 }) as DOMRect;
}

function Page() {
  return (
    <>
      <ScrollReveal />
      <div id="above" {...reveal()} />
      <div id="below" {...reveal(2)} />
    </>
  );
}

function scroll() {
  window.dispatchEvent(new Event("scroll"));
}

const pending = (id: string) => document.getElementById(id)?.hasAttribute("data-reveal-pending");
const armed = () => document.documentElement.hasAttribute("data-reveal-armed");

beforeEach(() => {
  observerCallback = null;
  observed = [];
  vi.stubGlobal("IntersectionObserver", FakeIntersectionObserver);
  mockMotionPreference(false);
  Object.defineProperty(window, "scrollY", { value: 0, configurable: true });
  Object.defineProperty(window, "innerHeight", { value: 800, configurable: true });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  document.documentElement.removeAttribute("data-reveal-armed");
});

describe("ScrollReveal - content is never left hidden", () => {
  // The bug this replaced: framer-motion rendered every section at
  // opacity:0, so a page that was never scrolled showed nothing below the
  // hero. Before any scroll, nothing here is hidden.
  it("hides nothing until the reader scrolls", () => {
    render(<Page />);
    expect(armed()).toBe(false);
    expect(pending("above")).toBe(false);
    expect(pending("below")).toBe(false);
  });

  it("on the first scroll, holds back only what is still below the viewport", () => {
    render(<Page />);
    at(document.getElementById("above"), 100);
    at(document.getElementById("below"), 2000);

    scroll();

    expect(armed()).toBe(true);
    expect(pending("above")).toBe(false);
    expect(pending("below")).toBe(true);
    expect(observed.map((element) => element.id)).toEqual(["below"]);
  });

  it("brings an element in when it reaches the viewport, once", () => {
    render(<Page />);
    const below = document.getElementById("below");
    at(document.getElementById("above"), 100);
    at(below, 2000);
    scroll();

    observerCallback?.([{ isIntersecting: true, target: below! }]);

    expect(pending("below")).toBe(false);
    expect(observed).toHaveLength(0);
  });

  it("never arms under reduced motion", () => {
    mockMotionPreference(true);
    render(<Page />);
    at(document.getElementById("below"), 2000);
    scroll();

    expect(armed()).toBe(false);
    expect(pending("below")).toBe(false);
  });

  it("never arms without IntersectionObserver", () => {
    vi.stubGlobal("IntersectionObserver", undefined);
    render(<Page />);
    at(document.getElementById("below"), 2000);
    scroll();

    expect(armed()).toBe(false);
    expect(pending("below")).toBe(false);
  });

  it("arms straight away when the page opens already scrolled", () => {
    Object.defineProperty(window, "scrollY", { value: 600, configurable: true });
    render(<Page />);
    // Effects run after render, so positions are set before the mount check
    // only in a real browser; here, arming is what is being asserted.
    expect(armed()).toBe(true);
  });

  it("picks up content added later, such as after client-side navigation", async () => {
    render(<Page />);
    at(document.getElementById("above"), 100);
    at(document.getElementById("below"), 2000);
    scroll();

    const late = document.createElement("section");
    late.setAttribute("data-reveal", "");
    at(late, 3000);
    document.body.appendChild(late);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(late.hasAttribute("data-reveal-pending")).toBe(true);
    late.remove();
  });

  // If the component ever goes away while the page stays, whatever it was
  // holding back must not stay invisible.
  it("releases everything it held when it unmounts and the content stays", () => {
    const content = document.createElement("div");
    content.setAttribute("data-reveal", "");
    document.body.appendChild(content);
    at(content, 2000);

    const { unmount } = render(<ScrollReveal />);
    scroll();
    expect(content.hasAttribute("data-reveal-pending")).toBe(true);

    unmount();
    expect(armed()).toBe(false);
    expect(content.hasAttribute("data-reveal-pending")).toBe(false);
    content.remove();
  });
});

describe("reveal()", () => {
  it("marks an element, with a stagger order when given one", () => {
    expect(reveal()).toEqual({ "data-reveal": "" });
    expect(reveal(3)).toEqual({ "data-reveal": "", style: { "--reveal-order": 3 } });
  });
});
