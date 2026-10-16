"use client";

import { useEffect } from "react";

const SELECTOR = "[data-reveal]";

/**
 * Brings marked content (`data-reveal`) in with a short fade-and-rise as the
 * reader scrolls to it. Mounted once, for the whole app.
 *
 * Built so it can never leave content hidden - the failure that replaced
 * framer-motion's whileInView here, which server-rendered every marketing
 * section at opacity:0 (a full-page capture without scrolling showed
 * ~1,500px of blank page):
 *
 * - Nothing is hidden until the reader actually scrolls. Before that the
 *   page is exactly what the server sent: complete. No JavaScript, slow
 *   hydration, print, crawlers and screenshot tools all see everything.
 * - When it arms, only elements still entirely below the viewport are
 *   marked pending. Anything already seen stays put, so nothing flickers.
 * - Reduced motion, or no IntersectionObserver, means it never arms.
 *
 * Elements added later (client-side navigation) are picked up the same way.
 */
export function ScrollReveal() {
  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const root = document.documentElement;
    let mutations: MutationObserver | null = null;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.removeAttribute("data-reveal-pending");
          observer.unobserve(entry.target);
        }
      },
      // A little before the element is fully in view, so the entrance is
      // already under way when the reader's eye gets there.
      { rootMargin: "0px 0px -8% 0px" }
    );

    function enrol(element: Element): void {
      if (element.hasAttribute("data-reveal-pending")) return;
      if (element.getBoundingClientRect().top < window.innerHeight) return;
      element.setAttribute("data-reveal-pending", "");
      observer.observe(element);
    }

    function arm(): void {
      document.querySelectorAll(SELECTOR).forEach(enrol);
      root.setAttribute("data-reveal-armed", "");

      mutations = new MutationObserver((records) => {
        for (const record of records) {
          record.addedNodes.forEach((node) => {
            if (!(node instanceof Element)) return;
            if (node.matches(SELECTOR)) enrol(node);
            node.querySelectorAll(SELECTOR).forEach(enrol);
          });
        }
      });
      mutations.observe(document.body, { childList: true, subtree: true });
    }

    // Arrived already scrolled (reload, back navigation, an anchor link):
    // arm now; otherwise on the first scroll.
    if (window.scrollY > 0) {
      arm();
    } else {
      window.addEventListener("scroll", arm, { once: true, passive: true });
    }

    return () => {
      window.removeEventListener("scroll", arm);
      observer.disconnect();
      mutations?.disconnect();
      root.removeAttribute("data-reveal-armed");
      document.querySelectorAll("[data-reveal-pending]").forEach((element) =>
        element.removeAttribute("data-reveal-pending")
      );
    };
  }, []);

  return null;
}

// Kept importable from here for existing callers; see reveal.ts.
export { reveal } from "./reveal";
