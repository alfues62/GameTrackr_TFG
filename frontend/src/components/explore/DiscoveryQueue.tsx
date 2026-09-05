"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ChevronLeftIcon, ChevronRightIcon, StarIcon } from "@/components/icons";
import api from "@/lib/axios";
import { categoryBadge } from "@/lib/library";
import type { Recommendation } from "@/lib/types";

/**
 * Cola de descubrimiento (estilo Steam / Letterboxd): la tanda diaria de
 * recomendaciones se recorre con flechas o sola. El segmento activo de la
 * barra se rellena como una historia de Instagram y, al completarse, avanza
 * (en bucle: tras el último juego vuelve el primero). Pasar el ratón por
 * encima pausa el avance. Tocar la tarjeta abre la ficha del juego.
 */
export function DiscoveryQueue() {
  const [recs, setRecs] = useState<Recommendation[] | null>(null);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    api
      .get<Recommendation[]>("/api/recommendations/", { params: { n: 10 } })
      .then((r) => setRecs(r.data))
      .catch(() => setRecs([]));
  }, []);

  if (recs === null) {
    return <div className="h-[480px] animate-pulse rounded-2xl bg-neutral-200 dark:bg-neutral-800 md:h-[400px]" />;
  }
  if (recs.length === 0) return null;

  const total = recs.length;
  const rec = recs[index % total];
  const badge = categoryBadge(rec.category);

  const next = () => setIndex((i) => (i + 1) % total);
  const prev = () => setIndex((i) => (i - 1 + total) % total);

  return (
    <section
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      className="group relative flex h-[480px] items-end overflow-hidden rounded-2xl bg-neutral-900 text-white shadow-lg md:h-[400px]"
    >
      {/* Fondo: portada difuminada */}
      {rec.cover_url && (
        <Image
          key={rec.igdb_id}
          src={rec.cover_url}
          alt=""
          aria-hidden
          fill
          sizes="(max-width: 768px) 100vw, 1000px"
          className="object-cover opacity-30 blur-sm"
        />
      )}
      <div className="absolute inset-0 bg-gradient-to-r from-neutral-950 via-neutral-950/80 to-transparent" />

      {/* Toda la tarjeta lleva a la ficha */}
      <Link href={`/games/${rec.igdb_id}`} aria-label={`Ver ficha de ${rec.title}`} className="absolute inset-0 z-[1]" />

      {/* Progreso tipo historias: el segmento activo se rellena y avanza al completarse */}
      <div className="pointer-events-none absolute inset-x-6 top-5 z-[2] flex items-center gap-3 sm:inset-x-16">
        <div className="flex flex-1 gap-1">
          {recs.map((r, i) => (
            <span key={r.igdb_id} className="relative h-1 flex-1 overflow-hidden rounded-full bg-white/20">
              {i < index && <span className="absolute inset-0 rounded-full bg-accent" />}
              {i === index && (
                <span
                  key={`fill-${index}`}
                  onAnimationEnd={next}
                  style={{ animationPlayState: paused ? "paused" : "running" }}
                  className="absolute inset-y-0 left-0 rounded-full bg-white/90 animate-[discovery-fill_8s_linear_forwards]"
                />
              )}
            </span>
          ))}
        </div>
        <span className="shrink-0 text-xs text-white/60">
          {index + 1} / {total}
        </span>
      </div>

      {/* Carátula a la derecha */}
      {rec.cover_url && (
        <div className="pointer-events-none absolute left-1/2 top-12 z-[2] w-36 -translate-x-1/2 md:left-auto md:right-12 md:top-1/2 md:w-40 md:translate-x-0 md:-translate-y-1/2 lg:w-44">
          <div className="relative aspect-[3/4] overflow-hidden rounded-xl border border-white/10 shadow-2xl transition-transform duration-300 group-hover:scale-[1.03]">
            <Image src={rec.cover_url} alt={rec.title} fill sizes="176px" className="object-cover" />
            {badge && (
              <span className="absolute left-2 top-2 rounded bg-neutral-900/80 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
                {badge}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Flechas laterales (en bucle) */}
      <button
        onClick={prev}
        aria-label="Anterior"
        className="absolute left-3 top-1/2 z-[3] grid h-10 w-10 -translate-y-1/2 place-items-center rounded-full border border-white/20 bg-black/40 text-white/80 transition-colors hover:bg-black/70 hover:text-white disabled:opacity-40"
      >
        <ChevronLeftIcon className="h-5 w-5" />
      </button>
      <button
        onClick={next}
        aria-label="Siguiente"
        className="absolute right-3 top-1/2 z-[3] grid h-10 w-10 -translate-y-1/2 place-items-center rounded-full border border-white/20 bg-black/40 text-white/80 transition-colors hover:bg-black/70 hover:text-white disabled:opacity-40"
      >
        <ChevronRightIcon className="h-5 w-5" />
      </button>

      {/* Contenido (altura fija: título y metadatos acotados para no solaparse) */}
      <div className="pointer-events-none relative z-[2] w-full max-w-2xl space-y-3 p-6 sm:p-16 sm:pb-12 md:pr-64">
        <p className="truncate text-sm font-medium text-accent">{rec.reason}</p>
        <h2 className="line-clamp-2 text-3xl font-bold sm:text-4xl">{rec.title}</h2>
        <p className="flex items-center gap-2 text-sm text-white/70">
          {badge && (
            <span className="rounded bg-white/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
              {badge}
            </span>
          )}
          {rec.igdb_rating != null && (
            <span className="inline-flex items-center gap-1"><StarIcon filled className="h-3.5 w-3.5 text-amber-300" />{(rec.igdb_rating / 10).toFixed(1)}</span>
          )}
          {rec.genres.length > 0 && <span>{rec.genres.slice(0, 3).join(" · ")}</span>}
        </p>
      </div>
    </section>
  );
}
