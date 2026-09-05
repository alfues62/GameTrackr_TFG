"use client";

import Image from "next/image";
import { useCallback, useEffect, useState } from "react";
import { CheckIcon, PlusIcon, SearchIcon } from "@/components/icons";
import { Modal } from "@/components/ui/Modal";
import api from "@/lib/axios";
import type { Game } from "@/lib/types";

interface Props {
  title: string;
  /** Solo para lectores de pantalla: el botón es un icono sin texto visible. */
  pickLabel?: string;
  onPick: (game: Game) => Promise<void>;
  onClose: () => void;
}

/** Buscador genérico de juegos en IGDB con una acción por resultado.
 *
 * El modal no se cierra al añadir: marca el juego con un tick y deja seguir
 * buscando, que es lo natural cuando se llena una lista de una sentada.
 */
export function GameSearchModal({ title, pickLabel = "Añadir", onPick, onClose }: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Game[]>([]);
  const [searching, setSearching] = useState(false);
  const [busy, setBusy] = useState<number | null>(null);
  const [done, setDone] = useState<number[]>([]);

  const runSearch = useCallback(async (raw: string) => {
    const q = raw.trim();
    if (!q) {
      setResults([]);
      return;
    }
    setSearching(true);
    try {
      const res = await api.get<Game[]>("/api/games/search/", { params: { q, limit: 12 } });
      setResults(res.data);
    } finally {
      setSearching(false);
    }
  }, []);

  // Búsqueda en vivo con debounce: los resultados aparecen al dejar de teclear.
  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setResults([]);
      return;
    }
    const timer = setTimeout(() => runSearch(q), 300);
    return () => clearTimeout(timer);
  }, [query, runSearch]);

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    runSearch(query);
  }

  async function pick(game: Game) {
    setBusy(game.igdb_id);
    try {
      await onPick(game);
      setDone((d) => [...d, game.igdb_id]);
    } finally {
      setBusy(null);
    }
  }

  return (
    <Modal open onClose={onClose} title={title}>
      <form onSubmit={handleSearch} className="relative mb-4">
        <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-neutral-400" />
        <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Busca en IGDB…"
          className="w-full rounded-lg border border-neutral-200 py-2.5 pl-10 pr-4 outline-none focus:border-accent focus:ring-2 focus:ring-accent/20" />
      </form>

      <div className="max-h-80 space-y-2 overflow-y-auto">
        {searching && <p className="text-sm text-neutral-400">Buscando…</p>}
        {!searching && results.length === 0 && (
          <p className="text-sm text-neutral-400">
            {query.trim() ? "No se encontraron juegos." : "Empieza a escribir para buscar."}
          </p>
        )}
        {results.map((game) => {
          const isDone = done.includes(game.igdb_id);
          return (
            <div key={game.igdb_id} className="flex items-center gap-3 rounded-lg border border-neutral-100 p-2">
              <div className="relative h-12 w-9 shrink-0 overflow-hidden rounded bg-neutral-200">
                {game.cover_url && <Image src={game.cover_url} alt="" fill sizes="36px" className="object-cover" />}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{game.title}</p>
                <p className="text-xs text-neutral-400">
                  {game.release_date ? new Date(game.release_date).getFullYear() : "—"}
                </p>
              </div>
              <button
                onClick={() => pick(game)}
                disabled={busy === game.igdb_id || isDone}
                aria-label={isDone ? `${game.title}: ya añadido` : `${pickLabel}: ${game.title}`}
                title={isDone ? "Ya añadido" : pickLabel}
                className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg text-sm font-semibold transition-colors disabled:cursor-default ${
                  isDone
                    ? "bg-neutral-900 text-white"
                    : "bg-accent text-white hover:bg-accent-600 disabled:opacity-70"
                }`}
              >
                {isDone ? (
                  <CheckIcon className="h-4 w-4" />
                ) : busy === game.igdb_id ? (
                  "…"
                ) : (
                  <PlusIcon className="h-4 w-4" />
                )}
              </button>
            </div>
          );
        })}
      </div>
    </Modal>
  );
}
