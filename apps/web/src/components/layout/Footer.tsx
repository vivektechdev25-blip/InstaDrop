import Link from "next/link";

export function Footer() {
  return (
    <footer className="border-t border-border">
      <div className="container flex flex-col gap-4 py-10 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        <p>&copy; {new Date().getFullYear()} Instadrop. Not affiliated with Instagram or Meta.</p>

        <div className="flex gap-6">
          <Link href="/privacy-policy" className="transition-colors hover:text-foreground">
            Privacy
          </Link>
          <Link href="/terms" className="transition-colors hover:text-foreground">
            Terms
          </Link>
          <Link href="/contact" className="transition-colors hover:text-foreground">
            Contact
          </Link>
        </div>
      </div>
    </footer>
  );
}
