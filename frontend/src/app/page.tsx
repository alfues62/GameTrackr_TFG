import Link from "next/link";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { ArrowRightIcon, SearchIcon } from "@/components/icons";
import { Logo } from "@/components/Logo";
import { authOptions } from "@/lib/auth";

// ---------------------------------------------------------------------------
// Contenido de muestra de los mockups (UI reconstruida en CSS, sin capturas).
// ---------------------------------------------------------------------------

const MOCK_COVERS = [
  "Hollow Knight", "Elden Ring", "Hades", "Outer Wilds",
  "Celeste", "Sekiro", "Disco Elysium", "Silksong",
];

const MOCK_STATES = [
  { label: "Jugando", count: 4, dot: "#22c55e", active: true },
  { label: "Completados", count: 23, dot: "#3b82f6" },
  { label: "Pendientes", count: 12, dot: "#9ca3af" },
  { label: "Abandonados", count: 7, dot: "#ef4444" },
];

const MOCK_TABS = [
  { label: "Mis juegos", accent: "#F97316", active: true },
  { label: "Biblioteca", accent: "#3B82F6" },
  { label: "Explorar", accent: "#22C55E" },
  { label: "Comunidad", accent: "#DB2777" },
];

const TESTIMONIALS = [
  {
    user: "Nyx_Reads",
    text: "Por fin platiné Elden Ring tras 212 horas. Las lágrimas de cada jefe valieron la pena. GOTY sin discusión, no acepto debate.",
    chip: { label: "COMPLETADO", color: "#3b82f6" },
  },
  {
    user: "PixelDani",
    text: "Acabo de mover Silksong de pendientes a jugando. Si no publico nada en tres meses, ya sabéis dónde estoy.",
    chip: { label: "JUGANDO", color: "#22c55e" },
  },
  {
    user: "Alfues62",
    text: "Mi lista «Joyas de 2 horas» ya tiene 50 juegos. Empiezo a sospechar que mi definición de joya tiene un problema.",
    chip: { label: "LISTA PÚBLICA", color: "#F97316" },
  },
];

/** Carpetas decorativas de colores pastel. */
function Folders({ colors, className = "" }: { colors: string[]; className?: string }) {
  return (
    <div aria-hidden className={`pointer-events-none flex gap-2 ${className}`}>
      {colors.map((c, i) => (
        <span
          key={i}
          className={`h-14 w-11 rounded-lg ${i % 2 ? "rotate-6" : "-rotate-6"} skew-x-[-4deg]`}
          style={{ background: c }}
        />
      ))}
    </div>
  );
}

function MonoCaption({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <p className={`text-[11px] uppercase tracking-[0.2em] text-neutral-400 ${className}`}>{children}</p>
  );
}

/** Mockup principal de la app: pestañas + sidebar + cuadrícula "Jugando ahora". */
function AppMock() {
  return (
    <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-2xl">
      {/* Barra superior */}
      <div className="flex items-center justify-between px-5 pt-4">
        <Logo size="md" as="div" />
        <div className="flex items-center gap-3">
          <SearchIcon className="h-4 w-4 text-neutral-400" />
          <span className="grid h-7 w-7 place-items-center rounded-full bg-neutral-800 text-xs font-semibold text-white">A</span>
        </div>
      </div>

      {/* Pestañas archivador */}
      <div className="mt-3 flex items-end gap-1 border-b border-neutral-200 px-5">
        {MOCK_TABS.map((t) => (
          <span
            key={t.label}
            className={
              t.active
                ? "-mb-px rounded-t-lg border border-b-white border-neutral-200 bg-white px-4 py-2 text-xs font-bold"
                : "rounded-t-md border border-b-0 border-neutral-200 bg-neutral-100 px-4 py-1.5 text-xs font-medium text-neutral-500"
            }
            style={{ borderTop: `2.5px solid ${t.accent}` }}
          >
            {t.label}
          </span>
        ))}
      </div>

      <div className="flex">
        {/* Sidebar */}
        <div className="hidden w-48 shrink-0 border-r border-neutral-100 p-4 sm:block">
          <MonoCaption>Estados</MonoCaption>
          <ul className="mt-2 space-y-1">
            {MOCK_STATES.map((s) => (
              <li
                key={s.label}
                className={`flex items-center justify-between rounded-lg px-2.5 py-1.5 text-sm ${
                  s.active ? "bg-neutral-100 font-semibold" : "text-neutral-600"
                }`}
              >
                <span className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full" style={{ background: s.dot }} />
                  {s.label}
                </span>
                <span className="text-xs text-neutral-400">{s.count}</span>
              </li>
            ))}
          </ul>
          <MonoCaption className="mt-5">Mis listas</MonoCaption>
          <ul className="mt-2 space-y-1 text-sm text-neutral-600">
            <li className="flex items-center justify-between rounded-lg px-2.5 py-1.5">
              <span className="truncate">Roguelikes para el metro</span>
              <span className="text-xs text-neutral-400">12</span>
            </li>
            <li className="flex items-center justify-between rounded-lg px-2.5 py-1.5">
              <span className="truncate">Joyas de menos de 10h</span>
              <span className="text-xs text-neutral-400">8</span>
            </li>
            <li className="px-2.5 py-1.5 text-sm font-medium text-accent">+ Nueva lista</li>
          </ul>
        </div>

        {/* Cuadrícula */}
        <div className="min-w-0 flex-1 p-5">
          <div className="flex items-baseline justify-between">
            <p className="text-lg font-bold">Jugando ahora</p>
            <MonoCaption>1.139 h registradas</MonoCaption>
          </div>
          <div className="mt-4 grid grid-cols-4 gap-3">
            {MOCK_COVERS.map((title) => (
              <div key={title}>
                <div className="relative flex aspect-[3/4] items-center justify-center rounded-lg bg-gradient-to-br from-neutral-700 to-neutral-900">
                  <span className="text-3xl font-bold text-white/15">{title.charAt(0)}</span>
                  <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-green-400 ring-2 ring-black/30" />
                </div>
                <p className="mt-1 truncate text-[11px] font-medium text-neutral-600">{title}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default async function LandingPage() {
  // Con sesión iniciada, la raíz lleva directa a la app.
  const session = await getServerSession(authOptions);
  if (session) redirect("/home");

  return (
    <div className="min-h-screen bg-[#F4F1EC] text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100">
      {/* ------------------------------------------------ Cabecera */}
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <Logo as="div" />
        <nav className="hidden items-center gap-8 text-sm font-medium text-neutral-600 dark:text-neutral-300 md:flex">
          <a href="#caracteristicas" className="transition-colors hover:text-neutral-900 dark:hover:text-white">Características</a>
          <a href="#comunidad" className="transition-colors hover:text-neutral-900 dark:hover:text-white">Comunidad</a>
        </nav>
        <div className="flex items-center gap-3">
          <Link href="/login" className="text-sm font-medium text-neutral-600 transition-colors hover:text-neutral-900 dark:text-neutral-300 dark:hover:text-white">
            Entrar
          </Link>
          <Link href="/register" className="rounded-full bg-neutral-900 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-neutral-700 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200">
            Crear cuenta
          </Link>
        </div>
      </header>

      {/* ------------------------------------------------ Hero */}
      <section className="relative mx-auto max-w-6xl px-6 pt-8 text-center sm:pt-14">
        <Folders colors={["#A7C4E8", "#A8D8B9"]} className="absolute left-8 top-0 hidden opacity-80 lg:flex" />
        <Folders colors={["#F5C79F", "#F2B8CD"]} className="absolute right-8 top-0 hidden opacity-80 lg:flex" />

        <MonoCaption className="!text-accent">Tu archivador de juegos</MonoCaption>
        <h1 className="mx-auto mt-4 max-w-3xl text-5xl font-bold leading-[1.05] tracking-tight sm:text-7xl">
          Tu backlog no va a ordenarse <span className="text-accent">solo</span>.
        </h1>
        <p className="mx-auto mt-6 max-w-xl text-lg text-neutral-500">
          GameTrackr es el archivador de tu vida gamer: estados, listas, horas y
          estadísticas. Deja de apuntar juegos en notas que nunca vuelves a abrir.
        </p>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/register"
            className="inline-flex items-center gap-2 rounded-full bg-accent px-7 py-3.5 font-semibold text-white shadow-lg shadow-accent/30 transition-colors hover:bg-accent-600"
          >
            Empieza gratis <ArrowRightIcon className="h-4 w-4" />
          </Link>
          <a
            href="#caracteristicas"
            className="rounded-full border border-neutral-300 bg-white px-7 py-3.5 font-semibold transition-colors hover:border-accent hover:text-accent dark:border-neutral-700 dark:bg-neutral-900"
          >
            Ver cómo funciona
          </a>
        </div>
        <MonoCaption className="mt-6">Gratis · Sin tarjeta · Tu backlog es tuyo</MonoCaption>

        {/* Mockup de la app */}
        <div className="relative z-10 mx-auto mt-12 max-w-4xl text-left">
          <AppMock />
        </div>
      </section>

      {/* ------------------------------------------------ Características */}
      <section id="caracteristicas" className="mt-[-60px] border-b border-neutral-200 bg-white pb-20 pt-32 dark:border-neutral-800 dark:bg-neutral-900">
        <div className="mx-auto max-w-6xl px-6">
          <MonoCaption className="!text-accent">Qué hace</MonoCaption>
          <h2 className="mt-3 max-w-sm text-3xl font-bold tracking-tight sm:text-4xl">Cada juego en su pestaña.</h2>

          <div className="mt-10 grid gap-6 md:grid-cols-3">
            {/* Estados */}
            <div className="rounded-2xl border border-neutral-200 bg-[#FAF8F5] p-6 dark:border-neutral-700 dark:bg-neutral-800">
              <div className="flex flex-wrap gap-2">
                {[
                  { label: "JUGANDO", color: "#22c55e" },
                  { label: "COMPLETADO", color: "#3b82f6" },
                  { label: "PENDIENTE", color: "#9ca3af" },
                  { label: "ABANDONADO", color: "#ef4444" },
                ].map((s) => (
                  <span key={s.label} className="flex items-center gap-1.5 rounded-full border border-neutral-200 bg-white px-2.5 py-1 text-[10px] font-semibold dark:border-neutral-600 dark:bg-neutral-900">
                    <span className="h-1.5 w-1.5 rounded-full" style={{ background: s.color }} />
                    {s.label}
                  </span>
                ))}
              </div>
              <h3 className="mt-6 text-lg font-bold">Estados sin culpa</h3>
              <p className="mt-2 text-sm leading-relaxed text-neutral-500">
                De «jugando» a «abandonado» sin remordimientos. Mueve juegos de
                pestaña en un clic y sigue con tu vida.
              </p>
            </div>

            {/* Listas */}
            <div className="rounded-2xl border border-neutral-200 bg-[#FAF8F5] p-6 dark:border-neutral-700 dark:bg-neutral-800">
              <div className="space-y-2">
                {[
                  { name: "Roguelikes para el metro", count: 12, color: "#F97316" },
                  { name: "Joyas de menos de 10h", count: 8, color: "#3B82F6" },
                  { name: "Para jugar con amigos", count: 5, color: "#22C55E" },
                ].map((l) => (
                  <div key={l.name} className="flex items-center justify-between rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm dark:border-neutral-600 dark:bg-neutral-900">
                    <span className="flex items-center gap-2 truncate">
                      <span className="h-4 w-1 rounded-full" style={{ background: l.color }} />
                      <span className="truncate">{l.name}</span>
                    </span>
                    <span className="text-xs text-neutral-400">{l.count}</span>
                  </div>
                ))}
              </div>
              <h3 className="mt-6 text-lg font-bold">Listas para lo que quieras</h3>
              <p className="mt-2 text-sm leading-relaxed text-neutral-500">
                Crea listas tan específicas como tu criterio. Nadie va a juzgarte
                por «Joyas de 2 horas».
              </p>
            </div>

            {/* Stats */}
            <div className="rounded-2xl bg-neutral-900 p-6 text-white">
              <MonoCaption>Horas totales</MonoCaption>
              <p className="mt-1 text-4xl font-bold">
                1.139<span className="text-accent">h</span>
              </p>
              <div className="mt-4 space-y-2">
                {[
                  { genre: "RPG", pct: 38, color: "#F97316" },
                  { genre: "Shooter", pct: 24, color: "#3B82F6" },
                  { genre: "Indie", pct: 19, color: "#22C55E" },
                ].map((g) => (
                  <div key={g.genre}>
                    <div className="flex justify-between text-xs text-white/60">
                      <span>{g.genre}</span>
                      <span>{g.pct}%</span>
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/10">
                      <div className="h-full rounded-full" style={{ width: `${g.pct}%`, background: g.color }} />
                    </div>
                  </div>
                ))}
              </div>
              <h3 className="mt-6 text-lg font-bold">Stats de tu vida gamer</h3>
              <p className="mt-2 text-sm leading-relaxed text-white/60">
                Horas, géneros y completismo. Datos suficientes para presumir
                (o para reflexionar).
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------ Comunidad */}
      <section id="comunidad" className="py-20">
        <div className="mx-auto max-w-6xl px-6">
          <MonoCaption className="!text-accent">Comunidad</MonoCaption>
          <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">No juegas solo.</h2>

          <div className="mt-10 grid gap-6 md:grid-cols-3">
            {TESTIMONIALS.map((t) => (
              <div key={t.user} className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm dark:border-neutral-700 dark:bg-neutral-900">
                <div className="flex items-center gap-3">
                  <span className="grid h-9 w-9 place-items-center rounded-full bg-neutral-700 text-sm font-bold text-white">
                    {t.user.charAt(0)}
                  </span>
                  <div>
                    <p className="text-sm font-semibold">{t.user}</p>
                    <p className="text-[10px] text-neutral-400">@{t.user.toLowerCase()}</p>
                  </div>
                </div>
                <p className="mt-4 text-sm leading-relaxed text-neutral-600 dark:text-neutral-300">{t.text}</p>
                <span className="mt-4 inline-flex items-center gap-1.5 rounded-full border border-neutral-200 bg-white px-2.5 py-1 text-[10px] font-semibold dark:border-neutral-600 dark:bg-neutral-900">
                  <span className="h-1.5 w-1.5 rounded-full" style={{ background: t.chip.color }} />
                  {t.chip.label}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ------------------------------------------------ CTA final */}
      <section className="mx-auto max-w-6xl px-6 py-20">
        <div className="relative overflow-hidden rounded-3xl bg-neutral-900 px-8 py-16 text-center text-white">
          <Folders colors={["#7C2D52", "#3B6D11"]} className="absolute left-8 top-8 hidden opacity-60 sm:flex" />
          <Folders colors={["#B45309", "#185FA5"]} className="absolute bottom-8 right-8 hidden opacity-60 sm:flex" />
          <h2 className="mx-auto max-w-lg text-3xl font-bold tracking-tight sm:text-5xl">
            Deja de perder juegos en la memoria.
          </h2>
          <p className="mx-auto mt-4 max-w-md text-white/60">
            Tu primer archivador se monta en dos minutos. El backlog ya lo tienes hecho.
          </p>
          <Link
            href="/register"
            className="mt-8 inline-block rounded-full bg-accent px-8 py-3.5 font-semibold text-white shadow-lg shadow-accent/30 transition-colors hover:bg-accent-600"
          >
            Crear cuenta gratis
          </Link>
          <MonoCaption className="mt-6 !text-white/40">Gratis · Sin tarjeta · Importa desde Steam y PSN</MonoCaption>
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
