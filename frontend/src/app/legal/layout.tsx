import Link from "next/link";
import { ChevronLeftIcon } from "@/components/icons";
import { Logo } from "@/components/Logo";

export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-white text-neutral-900">
      <header className="mx-auto flex max-w-3xl items-center justify-between px-6 py-5">
        <Logo size="md" />
        <Link href="/" className="inline-flex items-center gap-1 text-sm font-medium text-neutral-500 transition-colors hover:text-neutral-900">
          <ChevronLeftIcon className="h-4 w-4" /> Volver al inicio
        </Link>
      </header>
      <main className="mx-auto max-w-3xl px-6 pb-24 pt-6">{children}</main>
    </div>
  );
}
