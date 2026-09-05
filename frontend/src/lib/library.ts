import type { Game, LibraryStatus } from "./types";

export const STATUS_META: Record<
  LibraryStatus,
  { label: string; dot: string; badge: string; bar: string }
> = {
  // Monocromo: el estado se distingue por su etiqueta, no por color.
  playing: { label: "Jugando", dot: "#a3a3a3", badge: "bg-neutral-100 text-neutral-600", bar: "#d4d4d4" },
  completed: { label: "Completado", dot: "#a3a3a3", badge: "bg-neutral-100 text-neutral-600", bar: "#d4d4d4" },
  backlog: { label: "Backlog", dot: "#a3a3a3", badge: "bg-neutral-100 text-neutral-600", bar: "#d4d4d4" },
  wishlist: { label: "Wishlist", dot: "#a3a3a3", badge: "bg-neutral-100 text-neutral-600", bar: "#d4d4d4" },
  abandoned: { label: "Abandonado", dot: "#a3a3a3", badge: "bg-neutral-100 text-neutral-600", bar: "#d4d4d4" },
};

export const STATUS_ORDER: LibraryStatus[] = ["playing", "completed", "backlog", "wishlist", "abandoned"];

/**
 * Un juego con fecha de lanzamiento confirmada y todavía futura solo puede
 * añadirse a la wishlist (ver UserGameSerializer.validate en el backend, que
 * es quien realmente lo hace cumplir). Sin fecha NO cuenta como "sin salir":
 * IGDB no siempre la trae aunque el juego ya lleve tiempo a la venta.
 */
export function isUnreleased(game: Pick<Game, "release_date">): boolean {
  if (!game.release_date) return false;
  return new Date(game.release_date) > new Date();
}

// Subconjunto del enum `category` de IGDB (ver Game.Category en el backend)
// que nos interesa mostrar como badge: el resto de valores (mod, port,
// remaster…) no se distinguen en la UI.
const DLC_CATEGORIES = new Set([1, 2, 4]); // dlc_addon, expansion, standalone_expansion
const COLLECTION_CATEGORIES = new Set([3, 13]); // bundle, pack

/** Etiqueta de "DLC" o "Colección" para un juego, o null si es un juego base normal. */
export function categoryBadge(category: number | null | undefined): "DLC" | "Colección" | null {
  if (category == null) return null;
  if (DLC_CATEGORIES.has(category)) return "DLC";
  if (COLLECTION_CATEGORIES.has(category)) return "Colección";
  return null;
}

/** Convierte horas (float) a "Xh Ym" como en el mockup. */
export function formatHours(hours: number): string {
  const min = Math.round((hours || 0) * 60);
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0 && m === 0) return "0h";
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}
