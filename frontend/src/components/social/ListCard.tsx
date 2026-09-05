"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { HeartIcon } from "@/components/icons";
import api from "@/lib/axios";
import type { GameListCard } from "@/lib/types";

/** `tile` para el carrusel (columna estrecha); `wide` para el feed, a todo el ancho. */
export type Layout = "tile" | "wide";

// Reparto interior del mosaico según cuántas portadas haya. Las clases van
// escritas enteras y no compuestas al vuelo, porque Tailwind rastrea el código
// como texto y no generaría una clase construida con una plantilla.
const TILE_SHAPE: Record<number, string> = {
  0: "grid-cols-1 grid-rows-1",
  1: "grid-cols-1 grid-rows-1",
  2: "grid-cols-2 grid-rows-1",
  3: "grid-cols-2 grid-rows-2",
  4: "grid-cols-2 grid-rows-2",
};

const WIDE_SHAPE: Record<number, string> = {
  0: "grid-cols-1",
  1: "grid-cols-1",
  2: "grid-cols-2",
  3: "grid-cols-3",
  4: "grid-cols-4",
};

/**
 * Mosaico de portadas de una lista.
 *
 * El hueco exterior conserva siempre la misma proporción, para que todas las
 * tarjetas tengan la misma silueta, pero se reparte por dentro según cuántas
 * portadas haya: una ocupa todo, dos van a mitades, tres dejan la primera a lo
 * alto en un lateral y las otras dos apiladas en el otro, y cuatro forman la
 * cuadrícula. Así no quedan huecos negros salvo que la lista esté vacía.
 */
export function CoverMosaic({
  covers,
  layout = "tile",
  rounded = true,
}: {
  covers: string[];
  layout?: Layout;
  /** A false cuando el mosaico va a ras del borde de una tarjeta que ya redondea. */
  rounded?: boolean;
}) {
  const shown = covers.slice(0, 4);
  const aspect = layout === "wide" ? "aspect-[3/1]" : "aspect-[4/3]";
  const shape = (layout === "wide" ? WIDE_SHAPE : TILE_SHAPE)[shown.length];
  // Una lista vacía sigue siendo un único bloque negro.
  const cells: (string | null)[] = shown.length ? shown : [null];

  return (
    <div
      className={`grid ${aspect} ${shape} overflow-hidden bg-neutral-900 ${rounded ? "rounded-xl" : ""}`}
    >
      {cells.map((cover, i) => (
        <div
          key={i}
          className={`relative bg-neutral-900 ${
            // Con tres, la primera ocupa un lateral entero.
            layout === "tile" && shown.length === 3 && i === 0 ? "row-span-2" : ""
          }`}
        >
          {cover && (
            <Image src={cover} alt="" fill sizes="(max-width: 768px) 50vw, 320px" className="object-cover" />
          )}
        </div>
      ))}
    </div>
  );
}

/** Lo mínimo para pintar el corazón: sirve igual una GameList que una GameListCard. */
interface Likeable {
  id: number;
  likes_count: number;
  is_liked: boolean;
}

/** Botón de me gusta de una lista. Optimista: revierte si la API falla. */
export function ListLikeButton({ list, className = "" }: { list: Likeable; className?: string }) {
  const [liked, setLiked] = useState(list.is_liked);
  const [count, setCount] = useState(list.likes_count);

  async function toggle(e: React.MouseEvent) {
    // La tarjeta entera es un enlace: el corazón no debe navegar.
    e.preventDefault();
    e.stopPropagation();
    const next = !liked;
    setLiked(next);
    setCount((n) => n + (next ? 1 : -1));
    try {
      if (next) await api.post(`/api/lists/${list.id}/like/`);
      else await api.delete(`/api/lists/${list.id}/like/`);
    } catch {
      setLiked(!next);
      setCount((n) => n + (next ? -1 : 1));
    }
  }

  return (
    <button
      onClick={toggle}
      aria-label={liked ? "Quitar me gusta" : "Me gusta"}
      className={`flex items-center gap-1.5 text-sm transition-colors ${
        liked ? "text-accent" : "text-neutral-400 hover:text-neutral-700"
      } ${className}`}
    >
      <HeartIcon filled={liked} className="h-4 w-4" />
      <span className="text-xs">{count}</span>
    </button>
  );
}

/** Tarjeta de lista: mosaico, nombre, autor y me gusta. Sin etiquetas ni subtítulos. */
export function ListCard({ list, layout = "tile" }: { list: GameListCard; layout?: Layout }) {
  return (
    <Link
      href={`/lists/${list.id}`}
      className="group block rounded-2xl border border-neutral-200 bg-white p-3 transition-colors hover:border-accent"
    >
      <CoverMosaic covers={list.preview_covers} layout={layout} />
      <p className="mt-3 line-clamp-2 font-semibold leading-snug">{list.name}</p>
      <div className="mt-2 flex items-center justify-between gap-2">
        <p className="truncate text-xs text-neutral-400">
          {list.user ? `@${list.user.username}` : "—"} · {list.games_count}{" "}
          {list.games_count === 1 ? "juego" : "juegos"}
        </p>
        <ListLikeButton list={list} />
      </div>
    </Link>
  );
}
