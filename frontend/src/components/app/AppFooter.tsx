import Link from "next/link";

export function AppFooter() {
  return (
    <footer className="mt-16 border-t border-neutral-200">
      <div className="mx-auto flex max-w-6xl flex-col gap-3 px-6 py-6 text-xs text-neutral-400 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-4">
          <Link href="/legal/aviso-legal" className="hover:text-neutral-600">Aviso legal</Link>
          <Link href="/legal/privacidad" className="hover:text-neutral-600">Privacidad</Link>
          <Link href="/legal/cookies" className="hover:text-neutral-600">Cookies</Link>
          <Link href="/legal/terminos" className="hover:text-neutral-600">Términos</Link>
        </div>
        <p>
          © 2026 GameTrackr · datos de juegos cortesía de{" "}
          <a
            href="https://www.igdb.com"
            target="_blank"
            rel="noreferrer"
            className="hover:text-accent"
          >
            IGDB.com
          </a>
        </p>
      </div>
    </footer>
  );
}
