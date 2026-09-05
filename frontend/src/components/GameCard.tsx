import Image from "next/image";
import Link from "next/link";
import { StarIcon } from "@/components/icons";
import { categoryBadge } from "@/lib/library";
import type { Game } from "@/lib/types";

type GameCardData = Pick<Game, "igdb_id" | "title" | "cover_url" | "igdb_rating" | "category">;

export function GameCard({ game }: { game: GameCardData; index?: number }) {
  const initial = game.title.charAt(0).toUpperCase();
  const badge = categoryBadge(game.category);

  return (
    <Link
      href={`/games/${game.igdb_id}`}
      className="group relative block aspect-[3/4] overflow-hidden rounded-2xl bg-gradient-to-br from-neutral-700 to-neutral-900"
    >
      {/* Inicial grande de fondo */}
      <span className="absolute inset-0 flex select-none items-center justify-center text-7xl font-bold text-white/10">
        {initial}
      </span>

      {/* Portada, aplica lazy loading por defecto. */}
      {game.cover_url && (
        <Image
          src={game.cover_url}
          alt={game.title}
          fill
          sizes="(max-width: 768px) 33vw, 200px"
          className="object-cover transition-transform duration-300 group-hover:scale-105"
        />
      )}

      {badge && (
        <span className="absolute left-2 top-2 rounded bg-neutral-900/80 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
          {badge}
        </span>
      )}

      {/* Título */}
      <div className="absolute inset-x-0 bottom-0 translate-y-2 bg-gradient-to-t from-black/90 via-black/50 to-transparent p-3 opacity-0 transition-all duration-300 group-hover:translate-y-0 group-hover:opacity-100">
        <p className="line-clamp-2 text-sm font-semibold text-white">{game.title}</p>
        {game.igdb_rating != null && (
          <p className="mt-0.5 flex items-center gap-1 text-xs font-medium text-amber-300">
            <StarIcon filled className="h-3 w-3" />
            {(game.igdb_rating / 10).toFixed(1)}
          </p>
        )}
      </div>
    </Link>
  );
}
