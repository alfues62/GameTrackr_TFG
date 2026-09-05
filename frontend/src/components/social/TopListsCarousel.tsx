"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronLeftIcon, ChevronRightIcon } from "@/components/icons";
import { ListCard } from "@/components/social/ListCard";
import api from "@/lib/axios";
import type { GameListCard } from "@/lib/types";

/**
 * Carrusel de las listas públicas mejor valoradas de la comunidad, ordenadas
 * por me gusta. Solo aparecen aquí las listas marcadas como públicas; llegar
 * al feed, en cambio, exige que su autor las publique a mano.
 */
export function TopListsCarousel() {
  const [lists, setLists] = useState<GameListCard[] | null>(null);
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api
      .get<GameListCard[]>("/api/lists/top/")
      .then((r) => setLists(r.data))
      .catch(() => setLists([]));
  }, []);

  function scroll(dir: -1 | 1) {
    scroller.current?.scrollBy({ left: dir * 340, behavior: "smooth" });
  }

  // Sin listas públicas no hay sección: mejor eso que un carrusel vacío.
  if (lists !== null && lists.length === 0) return null;

  return (
    <section className="mt-8">
      <div className="mb-4 flex items-center justify-between gap-4">
        <h2 className="text-xl font-bold tracking-tight">Listas mejor valoradas</h2>
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

      {lists === null ? (
        <div className="flex gap-4 overflow-hidden pb-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-64 w-56 shrink-0 animate-pulse rounded-2xl bg-neutral-200" />
          ))}
        </div>
      ) : (
        <div ref={scroller} className="scrollbar-slim flex gap-4 overflow-x-auto pb-3">
          {lists.map((list) => (
            <div key={list.id} className="w-56 shrink-0">
              <ListCard list={list} />
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
