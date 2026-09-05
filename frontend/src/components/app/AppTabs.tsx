"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_ITEMS } from "./nav";

/**
 * Navegación principal con estética de archivador: cada sección es una carpeta
 * con su etiqueta de color. La activa está "sacada" (más alta, con sombra) y
 * las demás retroceden en escalera según su distancia a la activa: cuanto más
 * lejos, más bajas, apagadas y hundidas en el cajón.
 * Ocupa el ancho completo, con Ajustes separado a la derecha.
 * En móvil se oculta (navega BottomNav).
 */

// Niveles de profundidad para pestañas inactivas, por distancia a la activa
// (1 = justo detrás). `alpha` atenúa la etiqueta de color en hex.
const DEPTH = [
  {
    py: "py-3",
    tone: "bg-neutral-100 text-neutral-600 dark:bg-neutral-900 dark:text-neutral-300",
    alpha: "",
  },
  {
    py: "py-2.5",
    tone: "bg-neutral-200/70 text-neutral-500 dark:bg-neutral-900/70 dark:text-neutral-400",
    alpha: "CC",
  },
  {
    py: "py-2",
    tone: "bg-neutral-200 text-neutral-400 dark:bg-neutral-800/60 dark:text-neutral-500",
    alpha: "99",
  },
  {
    py: "py-1.5",
    tone: "bg-neutral-300/60 text-neutral-400/80 dark:bg-neutral-800/40 dark:text-neutral-600",
    alpha: "66",
  },
];

export function AppTabs() {
  const pathname = usePathname();
  const activeIndex = NAV_ITEMS.findIndex(
    ({ href }) => pathname === href || pathname.startsWith(`${href}/`)
  );

  return (
    <nav aria-label="Navegación principal" className="mt-6 hidden px-10 lg:block">
      <div className="flex items-end gap-1.5 border-b border-neutral-200 dark:border-neutral-800">
        {NAV_ITEMS.map(({ href, label, accent }, index) => {
          const active = index === activeIndex;
          // En rutas fuera de las pestañas (p. ej. /profile) no hay activa:
          // todas al mismo nivel intermedio.
          const distance = activeIndex === -1 ? 1 : Math.min(Math.abs(index - activeIndex), DEPTH.length);
          const depth = DEPTH[distance - 1];

          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={`${
                active
                  ? "-mb-px rounded-t-xl border border-neutral-200 border-b-neutral-50 bg-neutral-50 px-8 py-3.5 text-sm font-bold shadow-[0_-5px_14px_-6px_rgba(0,0,0,0.25)] dark:border-neutral-800 dark:border-b-neutral-950 dark:bg-neutral-950 dark:shadow-[0_-5px_14px_-6px_rgba(0,0,0,0.7)]"
                  : `rounded-t-lg border border-b-0 border-neutral-200 px-6 text-sm font-medium transition-all dark:border-neutral-800 ${depth.py} ${depth.tone} hover:bg-neutral-200/70 hover:pb-3 hover:text-neutral-800 dark:hover:bg-neutral-800 dark:hover:text-neutral-200`
              }`}
              style={{ borderTop: `3px solid ${accent}${active ? "" : depth.alpha}` }}
            >
              {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
