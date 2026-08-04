import type { Metadata } from "next";
import { Mail } from "lucide-react";

export const metadata: Metadata = {
  title: "Contact",
  description: "Get in touch with the Instadrop team.",
  alternates: { canonical: "/contact" },
};

const CONTACT_EMAIL = "support@instadrop.app";

export default function ContactPage() {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-3xl font-bold tracking-tight">Contact</h1>

      <p className="mt-2 text-muted-foreground">
        Questions, feedback, a copyright concern, or something not working right? We&apos;d
        like to hear about it.
      </p>

      <a
        href={`mailto:${CONTACT_EMAIL}`}
        className="mt-4 inline-flex w-fit items-center gap-2 rounded-lg border border-border bg-card px-4 py-3 text-sm font-medium transition-colors hover:bg-secondary"
      >
        <Mail className="h-4 w-4" aria-hidden="true" />
        {CONTACT_EMAIL}
      </a>

      <h2 className="mt-6 text-xl font-semibold">Copyright concerns</h2>
      <p className="text-muted-foreground">
        If you believe content accessible through Instadrop infringes your copyright,
        please email us with a description of the content and a link to the original
        Instagram post. Since Instadrop never stores media on its own servers, removing
        content from Instagram itself is the most direct way to stop it from being
        accessible here.
      </p>
    </div>
  );
}
