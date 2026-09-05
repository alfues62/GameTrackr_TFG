"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ChevronLeftIcon, ChevronRightIcon } from "@/components/icons";
import api from "@/lib/axios";
import { categoryBadge } from "@/lib/library";
import { formatReleaseDate } from "@/lib/time";
import type { Game } from "@/lib/types";

/**
 * Carrusel de próximos lanzamientos (estilo Opera GX): una fila de portadas
 * en horizontal con su fecha de salida debajo, ordenadas cronológicamente.
 * Selección curada por expectación (hypes de IGDB): los más esperados primero,
 * llegando también a títulos conocidos aunque no superventas.
 */
export function ReleaseCarousel() {
  const [games, setGames] = useState<Game[] | null>(null);
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api
      .get<Game[]>("/api/games/upcoming/", { params: { limit: 28 } })
      .then((r) => setGames(r.data))
      .catch(() => setGames([]));
  }, []);

  function scroll(dir: -1 | 1) {
    scroller.current?.scrollBy({ left: dir * 320, behavior: "smooth" });
  }

  if (games !== null && games.length === 0) return null;

  return (
    <section className="mt-10">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-xl font-bold tracking-tight">Próximos lanzamientos</h2>
        <div className="flex items-center gap-2">
          <button
            onClick={() => scroll(-1)}
            aria-label="Anterior"
            className="grid h-8 w-8 place-items-center rounded-full border border-neutral-200 bg-white text-neutral-500 transition-colors hover:border-accent hover:text-accent"
          >
            <ChevronLeftIcon className="h-4 w-4" />
          </button>
          <button
            onClick={() => scroll(1)}
            aria-label="Siguiente"
            className="grid h-8 w-8 place-items-center rounded-full border border-neutral-200 bg-white text-neutral-500 transition-colors hover:border-accent hover:text-accent"
          >
            <ChevronRightIcon className="h-4 w-4" />
          </button>
        </div>
      </div>

      {games === null ? (
        <div className="flex gap-4 overflow-hidden pb-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="aspect-[3/4] w-36 shrink-0 animate-pulse rounded-2xl bg-neutral-200 dark:bg-neutral-800" />
          ))}
        </div>
      ) : (
        <div ref={scroller} className="scrollbar-slim flex gap-4 overflow-x-auto pb-3">
          {games.map((game) => {
            const badge = categoryBadge(game.category);
            return (
            <Link key={game.igdb_id} href={`/games/${game.igdb_id}`} className="group w-36 shrink-0">
              <div className="relative aspect-[3/4] overflow-hidden rounded-2xl bg-gradient-to-br from-neutral-700 to-neutral-900">
                <span className="absolute inset-0 flex select-none items-center justify-center text-6xl font-bold text-white/10">
                  {game.title.charAt(0).toUpperCase()}
                </span>
                {game.cover_url && (
                  <Image
                    src={game.cover_url}
                    alt={game.title}
                    fill
                    sizes="144px"
                    className="object-cover transition-transform duration-300 group-hover:scale-105"
                  />
                )}
                {badge && (
                  <span className="absolute left-2 top-2 rounded bg-neutral-900/80 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
                    {badge}
                  </span>
                )}
              </div>
              <p className="mt-2 text-xs font-semibold text-accent">
                {game.release_date ? formatReleaseDate(game.release_date) : "PRÓXIMAMENTE"}
              </p>
              <p className="truncate text-sm font-medium">{game.title}</p>
            </Link>
            );
          })}
        </div>
      )}
    </section>
  );
}
