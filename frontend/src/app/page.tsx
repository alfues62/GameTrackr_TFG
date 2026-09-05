import Link from "next/link";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { Logo } from "@/components/Logo";
import { authOptions } from "@/lib/auth";

export default async function LandingPage() {
  // Con sesión iniciada, la raíz lleva directa a la app.
  const session = await getServerSession(authOptions);
  if (session) redirect("/home");

  return (
    <div className="flex min-h-screen flex-col bg-[#F4F1EC] text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100">
      {/* ------------------------------------------------ Cabecera */}
      <header className="border-b border-neutral-200 shadow-sm dark:border-neutral-800">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-5">
          <Logo as="div" />
          <div className="flex items-center gap-3">
            <Link href="/login" className="text-sm font-medium text-neutral-600 transition-colors hover:text-neutral-900 dark:text-neutral-300 dark:hover:text-white">
              Entrar
            </Link>
            <Link href="/register" className="rounded-full bg-neutral-900 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-neutral-700 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200">
              Crear cuenta
            </Link>
          </div>
        </div>
      </header>

      {/* ------------------------------------------------ Hero */}
      <section className="mx-auto flex w-full max-w-6xl flex-1 flex-col items-center justify-center px-6 text-center">
        <h1 className="mx-auto max-w-3xl text-5xl font-bold leading-[1.05] tracking-tight sm:text-7xl">
          Tu backlog no va a ordenarse <span className="text-accent">solo</span>.
        </h1>
        <p className="mx-auto mt-6 max-w-xl text-lg text-neutral-500">
          GameTrackr es el archivador de tu vida gamer: estados, listas, horas y
          estadísticas. Deja de apuntar juegos en notas que nunca vuelves a abrir.
        </p>

        <div className="mt-8">
          <Link
            href="/register"
            className="inline-flex items-center gap-2 rounded-full bg-accent px-7 py-3.5 font-semibold text-white shadow-lg shadow-accent/30 transition-colors hover:bg-accent-600"
          >
            Empieza gratis
          </Link>
        </div>
      </section>

      {/* ------------------------------------------------ Pie */}
      <footer className="border-t border-neutral-200 dark:border-neutral-800">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-6 py-8 text-xs text-neutral-400 sm:flex-row">
          <Logo size="sm" as="div" />
          <div className="flex gap-5">
            <Link href="/legal/privacidad" className="hover:text-neutral-600">Privacidad</Link>
            <Link href="/legal/terminos" className="hover:text-neutral-600">Términos</Link>
            <Link href="/legal/contacto" className="hover:text-neutral-600">Contacto</Link>
          </div>
          <p>
            © 2026 GameTrackr · datos de{" "}
            <a href="https://www.igdb.com" target="_blank" rel="noreferrer" className="hover:text-accent">
              IGDB.com
            </a>
          </p>
        </div>
      </footer>
    </div>
  );
}