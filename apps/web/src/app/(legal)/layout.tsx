import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";

export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />
      <main className="flex-1">
        {/* Widened from the old single-column max-w-2xl: reading width is
            now capped inside LegalPageShell's content column
            (max-w-prose), freeing this outer container to also hold the
            TOC sidebar beside it rather than leaving that space empty. */}
        <article className="container max-w-6xl py-16">{children}</article>
      </main>
      <Footer />
    </div>
  );
}
