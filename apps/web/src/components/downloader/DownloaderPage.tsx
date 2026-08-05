import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { InputForm } from "@/components/downloader/InputForm";

export interface DownloaderPageProps {
  initialUrl?: string;
}

/**
 * The one page shell shared by every entry point (manual homepage,
 * ?url= query param, and the [...url] catch-all address-bar route) -
 * do not fork this layout per entry point.
 */
export function DownloaderPage({ initialUrl }: DownloaderPageProps) {
  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />

      <main className="flex-1">
        <section className="container flex flex-col items-center gap-6 py-20 text-center sm:py-28">
          <span className="rounded-full border border-border px-3 py-1 text-xs font-medium text-muted-foreground">
            No login. No watermark. No cost.
          </span>

          <h1 className="max-w-2xl text-4xl font-bold tracking-tight sm:text-5xl">
            Download Instagram photos, reels &amp; videos in original quality
          </h1>

          <p className="max-w-xl text-balance text-muted-foreground sm:text-lg">
            Paste a public Instagram link and get a direct, high-resolution download —
            no account required.
          </p>

          <div className="w-full max-w-xl">
            <InputForm initialUrl={initialUrl} />
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
