import type { CSSProperties } from "react";

/**
 * Props that mark an element for ScrollReveal; `order` staggers siblings.
 *
 * In its own module rather than ScrollReveal.tsx because that file is a
 * client module: a server component calling a function imported from one
 * gets a client reference, not the function. Keeping this plain lets server
 * components (no client JavaScript at all) use reveal too.
 */
export function reveal(order = 0): { "data-reveal": ""; style?: CSSProperties } {
  return order > 0
    ? { "data-reveal": "", style: { "--reveal-order": order } as CSSProperties }
    : { "data-reveal": "" };
}
