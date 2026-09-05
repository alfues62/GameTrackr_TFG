"use client";

import { useCallback, useEffect, useState } from "react";
import { GameCard } from "@/components/GameCard";
import { DiscoveryQueue } from "@/components/explore/DiscoveryQueue";
import { ReleaseCarousel } from "@/components/explore/ReleaseCarousel";
import { ChevronLeftIcon, ChevronRightIcon, SearchIcon } from "@/components/icons";
import api from "@/lib/axios";
import type { Game } from "@/lib/types";

// Catálogo genérico: 8 filas de 7 carátulas por página.
const CATALOG_PAGE_SIZE = 56;
// Resultados de búsqueda: 3 filas de 7 por página.
const SEARCH_PAGE_SIZE = 21;

type FetchResult = { games: Game[]; notConfigured: boolean };

async function fetchGames(path: string, params?: Record<string, unknown>): Promise<FetchResult> {
  try {
    const res = await api.get<Game[]>(path, { params });
    return { games: res.data, notConfigured: false };
  } catch (err) {
    const status =
      typeof err === "object" && err !== null && "response" in err
        ? (err as { response?: { status?: number } }).response?.status
        : undefined;
    return { games: [], notConfigured: status === 503 };
  }
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="mb-4 text-xl font-bold tracking-tight">{children}</h2>;
}

function CardGrid({ games }: { games: Pick<Game, "igdb_id" | "title" | "cover_url" | "igdb_rating" | "category">[] }) {
  return (
    <div className="grid grid-cols-3 gap-4 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-7">
      {games.map((game, i) => (
        <GameCard key={game.igdb_id} game={game} index={i} />
      ))}
    </div>
  );
}

function GridSkeleton({ count = 7 }: { count?: number }) {
  return (
    <div className="grid grid-cols-3 gap-4 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-7">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="aspect-[3/4] animate-pulse rounded-2xl bg-neutral-200 dark:bg-neutral-800" />
      ))}
    </div>
  );
}

export default function ExplorePage() {
  const [catalog, setCatalog] = useState<Game[]>([]);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [notConfigured, setNotConfigured] = useState(false);
  const [loadingCatalog, setLoadingCatalog] = useState(true);

  const [queryInput, setQueryInput] = useState("");
  const [activeQuery, setActiveQuery] = useState("");
  const [results, setResults] = useState<Game[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchPage, setSearchPage] = useState(0);
  const [searchHasMore, setSearchHasMore] = useState(false);

  // Catálogo genérico paginado
  const loadCatalog = useCallback(async (p: number) => {
    setLoadingCatalog(true);
    const res = await fetchGames("/api/games/popular/", {
      limit: CATALOG_PAGE_SIZE,
      offset: p * CATALOG_PAGE_SIZE,
    });
    setCatalog(res.games);
    setHasMore(res.games.length === CATALOG_PAGE_SIZE);
    setNotConfigured((prev) => prev || res.notConfigured);
    setLoadingCatalog(false);
  }, []);

  useEffect(() => {
    loadCatalog(page);
  }, [page, loadCatalog]);

  function goToPage(p: number) {
    setPage(p);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const runSearch = useCallback(async (raw: string, p: number = 0) => {
    const q = raw.trim();
    if (!q) {
      setActiveQuery("");
      setResults([]);
      setSearchPage(0);
      return;
    }
    setSearching(true);
    setActiveQuery(q);
    setSearchPage(p);
    const res = await fetchGames("/api/games/search/", {
      q,
      limit: SEARCH_PAGE_SIZE,
      offset: p * SEARCH_PAGE_SIZE,
    });
    setResults(res.games);
    setSearchHasMore(res.games.length === SEARCH_PAGE_SIZE);
    setSearching(false);
  }, []);

  function goToSearchPage(p: number) {
    runSearch(activeQuery, p);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  // Búsqueda con debounce de 300 ms: se dispara al dejar de teclear, no en cada
  // pulsación, para no machacar la API de IGDB.
  useEffect(() => {
    const q = queryInput.trim();
    if (!q) {
      setActiveQuery("");
      setResults([]);
      return;
    }
    const timer = setTimeout(() => runSearch(q), 300);
    return () => clearTimeout(timer);
  }, [queryInput, runSearch]);

  function handleSearch(e: React.FormEvent) {
    // Pulsar Enter busca de inmediato, sin esperar a que salte el debounce.
    e.preventDefault();
    runSearch(queryInput);
  }

  const showSections = page === 0 && !activeQuery;

  return (
    <div className="mx-auto max-w-[90rem] px-6 lg:px-10 py-8">
      {/* Encabezado */}
      <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">Descubre nuevos juegos</h1>

      {/* Cola de descubrimiento: la tanda diaria de recomendaciones, una a una */}
      {showSections && (
        <div className="mt-6">
          <DiscoveryQueue />
        </div>
      )}

      {/* BÚSQUEDA */}
      <section className="mt-8">
        <form onSubmit={handleSearch} className="relative mx-auto max-w-2xl">
          <SearchIcon className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-neutral-400" />
          <input
            value={queryInput}
            onChange={(e) => setQueryInput(e.target.value)}
            placeholder="Busca un juego: Halo, Zelda, Hollow Knight…"
            className="w-full rounded-full border border-neutral-200 bg-white py-4 pl-12 pr-6 text-neutral-900 shadow-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
          />
        </form>
      </section>

      {/* RESULTADOS o SECCIONES */}
      {activeQuery ? (
        <section className="mt-10">
          <div className="mb-4 flex items-center justify-between">
            <SectionTitle>Resultados para «{activeQuery}»</SectionTitle>
            <button
              onClick={() => {
                setActiveQuery("");
                setQueryInput("");
              }}
              className="text-sm font-medium text-accent hover:underline"
            >
              Limpiar
            </button>
          </div>
          {searching ? (
            <GridSkeleton count={7} />
          ) : results.length > 0 ? (
            <CardGrid games={results} />
          ) : (
            <p className="text-neutral-500">No se encontraron juegos.</p>
          )}

          {(searchPage > 0 || searchHasMore) && (
            <div className="mt-10 flex items-center justify-center gap-2 text-sm">
              <button
                onClick={() => goToSearchPage(Math.max(0, searchPage - 1))}
                disabled={searchPage === 0 || searching}
                className="inline-flex items-center gap-1 rounded-lg border border-neutral-300 bg-white px-4 py-2 transition-colors hover:border-accent hover:text-accent disabled:opacity-40"
              >
                <ChevronLeftIcon className="h-4 w-4" /> Anterior
              </button>
              <span className="grid h-9 w-9 place-items-center rounded-lg bg-accent font-semibold text-white">
                {searchPage + 1}
              </span>
              <button
                onClick={() => goToSearchPage(searchPage + 1)}
                disabled={!searchHasMore || searching}
                className="inline-flex items-center gap-1 rounded-lg border border-neutral-300 bg-white px-4 py-2 transition-colors hover:border-accent hover:text-accent disabled:opacity-40"
              >
                Siguiente <ChevronRightIcon className="h-4 w-4" />
              </button>
            </div>
          )}
        </section>
      ) : (
        <>
          {/* Próximos lanzamientos: carrusel con fechas (solo en la primera página) */}
          {showSections && <ReleaseCarousel />}

          {notConfigured && showSections && (
            <p className="mt-6 rounded-xl border border-dashed border-neutral-300 p-4 text-sm text-neutral-500">
              IGDB no está configurado. Añade <code>IGDB_CLIENT_ID</code> e{" "}
              <code>IGDB_CLIENT_SECRET</code> al <code>.env</code>.
            </p>
          )}

          {/* Catálogo genérico: 8 filas, paginado */}
          <section className="mt-10">
            <SectionTitle>{page === 0 ? "Catálogo" : `Catálogo · página ${page + 1}`}</SectionTitle>
            {loadingCatalog ? <GridSkeleton count={21} /> : <CardGrid games={catalog} />}

            <div className="mt-10 flex items-center justify-center gap-2 text-sm">
              <button
                onClick={() => goToPage(Math.max(0, page - 1))}
                disabled={page === 0}
                className="inline-flex items-center gap-1 rounded-lg border border-neutral-300 bg-white px-4 py-2 transition-colors hover:border-accent hover:text-accent disabled:opacity-40"
              >
                <ChevronLeftIcon className="h-4 w-4" /> Anterior
              </button>
              <span className="grid h-9 w-9 place-items-center rounded-lg bg-accent font-semibold text-white">
                {page + 1}
              </span>
              <button
                onClick={() => goToPage(page + 1)}
                disabled={!hasMore}
                className="inline-flex items-center gap-1 rounded-lg border border-neutral-300 bg-white px-4 py-2 transition-colors hover:border-accent hover:text-accent disabled:opacity-40"
              >
                Siguiente <ChevronRightIcon className="h-4 w-4" />
              </button>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
