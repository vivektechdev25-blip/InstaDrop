// Presentation-only: a static visual example of the address-bar shortcut
// (reelsavehub.com/<link>), not a working input. Styled as a compact variant
// of the existing Input component (same border/radius/height family) so it
// reads as a natural extension of the app rather than a foreign mockup.
const EXAMPLE_URL = "https://www.instagram.com/reel/CxAmPlE123/";

export function AddressBarExample() {
  return (
    <div
      aria-hidden="true"
      className="flex h-10 w-full min-w-0 items-center overflow-hidden rounded-md border border-border bg-muted px-3"
    >
      <span className="shrink-0 text-sm font-medium text-primary">reelsavehub.com/</span>
      <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">{EXAMPLE_URL}</span>
    </div>
  );
}
