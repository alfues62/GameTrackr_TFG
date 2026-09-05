"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { GameCard } from "@/components/GameCard";
import { ChevronLeftIcon, ChevronRightIcon, FilterIcon, GridIcon, PencilIcon, PlaystationIcon, PlusIcon, RowsIcon, ShareIcon, SteamIcon } from "@/components/icons";
import { AddGameModal } from "@/components/library/AddGameModal";
import { GameProgressModal } from "@/components/library/GameProgressModal";
import { GameSearchModal } from "@/components/library/GameSearchModal";
import {
  countActiveFilters,
  EMPTY_FILTERS,
  filterOptions,
  LibraryFiltersModal,
  type LibraryFilters,
} from "@/components/library/LibraryFiltersModal";
import { ListModal } from "@/components/library/ListModal";
import { ShareListModal } from "@/components/library/ShareListModal";
import { Tooltip } from "@/components/ui/Tooltip";
import { CoverMosaic } from "@/components/social/ListCard";
import { SteamSyncBanner } from "@/components/library/SteamSyncBanner";
import { useAuth } from "@/hooks/useAuth";
import api, { fetchAll } from "@/lib/axios";
import { formatHours, STATUS_META, STATUS_ORDER } from "@/lib/library";
import type { Game, GameList, LibraryStatus, UserGame } from "@/lib/types";

const PAGE_SIZE = 12;

function CoverThumb({ game, size = "row" }: { game: Game; size?: "row" | "tile" }) {
  const dims = size === "row" ? "h-12 w-9" : "h-full w-full";
  return (
    <div className={`relative ${dims} shrink-0 overflow-hidden rounded-md bg-gradient-to-br from-neutral-700 to-neutral-900`}>
      <span className="absolute inset-0 grid place-items-center text-lg font-bold text-white/15">
        {game.title.charAt(0).toUpperCase()}
      </span>
      {game.cover_url && <Image src={game.cover_url} alt="" fill sizes="48px" className="object-cover" />}
    </div>
  );
}

/** Badge con la plataforma de origen de una entrada sincronizada. */
function SourceBadge({ userGame }: { userGame: UserGame }) {
  const source = userGame.sync_source || (userGame.is_from_steam ? "steam" : "");
  if (!source) return null;
  const meta = {
    steam: { label: "Steam", Icon: SteamIcon, bg: "bg-neutral-900" },
      psn: { label: "PSN", Icon: PlaystationIcon, bg: "bg-[#00439C]" },
  }[source];
  return (
    <span className={`inline-flex shrink-0 items-center gap-1 rounded ${meta.bg} px-1.5 py-0.5 text-[10px] font-medium text-white`}>
      <meta.Icon className="h-3 w-3" /> {meta.label}
    </span>
  );
}

type Entry = { game: Game; ug: UserGame | null };

/** Tarjeta de la vista general: sirve igual para un estado que para una lista. */
function OverviewCard({
  name,
  subtitle,
  count,
  coverUrl,
  covers,
  onOpen,
}: {
  name: string;
  subtitle: string;
  count: number;
  coverUrl?: string | null;
  covers: string[];
  onOpen: () => void;
}) {
  return (
    <button
      onClick={onOpen}
      className="group flex flex-col overflow-hidden rounded-2xl border border-neutral-200 bg-white text-left shadow-sm transition-colors hover:border-accent"
    >
      <div className="relative w-full overflow-hidden">
        {coverUrl ? (
          <div className="relative aspect-[4/3] w-full bg-neutral-100">
            <Image src={coverUrl} alt="" fill sizes="360px" className="object-cover" />
          </div>
        ) : (
          <CoverMosaic rounded={false} covers={covers} />
        )}
        <span className="absolute bottom-2 right-2 rounded bg-black/60 px-1.5 py-0.5 text-[11px] font-medium text-white">
          {count} {count === 1 ? "juego" : "juegos"}
        </span>
      </div>
      <div className="flex items-center justify-between gap-2 px-4 py-3">
        <div className="min-w-0">
          <p className="truncate font-semibold">{name}</p>
          <p className="text-xs text-neutral-400">{subtitle}</p>
        </div>
        <ChevronRightIcon className="h-4 w-4 shrink-0 text-neutral-300 transition-colors group-hover:text-accent" />
      </div>
    </button>
  );
}

export default function LibraryPage() {
  const [library, setLibrary] = useState<UserGame[]>([]);
  const [lists, setLists] = useState<GameList[]>([]);
  const [loading, setLoading] = useState(true);

  const { user } = useAuth();

  // La biblioteca se ve de tres maneras: la vista general con las tarjetas de
  // cada estado y cada lista, un estado concreto, o una lista concreta.
  const [activeStatus, setActiveStatus] = useState<LibraryStatus | null>(null);
  const [selectedListId, setSelectedListId] = useState<number | null>(null);
  const [showOverview, setShowOverview] = useState(true);
  const [filterText, setFilterText] = useState("");
  const [view, setView] = useState<"list" | "grid">("list");
  const [page, setPage] = useState(0);

  const [editing, setEditing] = useState<UserGame | null>(null);
  const [showAddGame, setShowAddGame] = useState(false);
  const [listModal, setListModal] = useState<{ open: boolean; list: GameList | null }>({ open: false, list: null });
  const [filters, setFilters] = useState<LibraryFilters>(EMPTY_FILTERS);
  const [showFilters, setShowFilters] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const [shareMsg, setShareMsg] = useState<string | null>(null);

  function openOverview() {
    setShowOverview(true);
    setActiveStatus(null);
    setSelectedListId(null);
  }

  function openStatus(status: LibraryStatus) {
    setShowOverview(false);
    setActiveStatus(status);
    setSelectedListId(null);
  }

  function openList(id: number) {
    setShowOverview(false);
    setActiveStatus(null);
    setSelectedListId(id);
  }

  const reload = useCallback(async () => {
    const [lib, ls] = await Promise.all([
      fetchAll<UserGame>("/api/library/", { sort: "hours" }).catch(() => [] as UserGame[]),
      fetchAll<GameList>("/api/lists/").catch(() => [] as GameList[]),
    ]);
    setLibrary(lib);
    setLists(ls);
    setLoading(false);
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  useEffect(() => {
    setPage(0);
  }, [activeStatus, filterText, filters, selectedListId]);

  // El aviso de "publicada" es de una lista concreta: al cambiar de lista sobra.
  useEffect(() => {
    setShareMsg(null);
  }, [selectedListId]);

  const selectedList = useMemo(() => lists.find((l) => l.id === selectedListId) ?? null, [lists, selectedListId]);

  // Con una lista seleccionada, "añadir" significa añadir a esa lista y no a la
  // biblioteca: antes abría el buscador de biblioteca y el juego nunca llegaba.
  async function addGameToList(game: Game) {
    if (!selectedList) return;
    await api.post(`/api/lists/${selectedList.id}/games/`, { igdb_id: game.igdb_id });
    reload();
  }

  // Solo las listas creadas por el usuario (el endpoint también trae públicas ajenas).
  const ownLists = useMemo(
    () => (user?.id ? lists.filter((l) => String(l.user?.id ?? "") === user.id) : lists),
    [lists, user?.id],
  );

  // Vista "Mis listas": las listas propias, filtrables por nombre.
  const overviewLists = useMemo(() => {
    const q = filterText.trim().toLowerCase();
    return q ? ownLists.filter((l) => l.name.toLowerCase().includes(q)) : ownLists;
  }, [ownLists, filterText]);

  const counts = useMemo(() => {
    const c: Record<"all" | LibraryStatus, number> = { all: library.length, playing: 0, completed: 0, backlog: 0, wishlist: 0, abandoned: 0 };
    library.forEach((ug) => { c[ug.status] += 1; });
    return c;
  }, [library]);

  const totalHours = useMemo(() => library.reduce((s, ug) => s + (ug.hours_played || 0), 0), [library]);
  const options = useMemo(() => filterOptions(library), [library]);

  // Cuatro carátulas por estado, las que pinta el mosaico de su tarjeta.
  const coversByStatus = useMemo(() => {
    const acc: Record<string, string[]> = {};
    for (const status of STATUS_ORDER) acc[status] = [];
    for (const ug of library) {
      const cover = ug.game.cover_url;
      if (cover && acc[ug.status] && acc[ug.status].length < 4) acc[ug.status].push(cover);
    }
    return acc;
  }, [library]);
  const activeFilters = countActiveFilters(filters);

  // Entradas a mostrar: la biblioteca filtrada por estado, o los juegos de la
  // lista seleccionada (cruzados con la biblioteca para el progreso si lo hay).
  const entries: Entry[] = useMemo(() => {
    let base: Entry[];
    if (selectedList) {
      const byId = new Map(library.map((ug) => [ug.game.igdb_id, ug]));
      base = selectedList.games.map((g) => ({ game: g, ug: byId.get(g.igdb_id) ?? null }));
    } else {
      let items = library;
      if (activeStatus) items = items.filter((ug) => ug.status === activeStatus);
      base = items.map((ug) => ({ game: ug.game, ug }));
    }
    // Dentro de una lista no se filtra: son pocos juegos y elegidos a mano.
    if (selectedList) return base;
    const q = filters.text.trim().toLowerCase();
    const desde = filters.yearFrom ? parseInt(filters.yearFrom, 10) : null;
    const hasta = filters.yearTo ? parseInt(filters.yearTo, 10) : null;
    return base.filter(({ game, ug }) => {
      if (q && !game.title.toLowerCase().includes(q)) return false;
      if (filters.genres.length && !(game.genres ?? []).some((g) => filters.genres.includes(g))) return false;
      if (filters.platforms.length) {
        const plataforma = ug?.platform || game.platforms?.[0] || "";
        if (!filters.platforms.includes(plataforma)) return false;
      }
      if (desde !== null || hasta !== null) {
        const anyo = game.release_date ? new Date(game.release_date).getFullYear() : null;
        if (anyo === null) return false;
        if (desde !== null && anyo < desde) return false;
        if (hasta !== null && anyo > hasta) return false;
      }
      if (filters.onlyUnplayed && (ug?.hours_played ?? 0) > 0) return false;
      return true;
    });
  }, [selectedList, library, activeStatus, filters]);

  const pageCount = Math.max(1, Math.ceil(entries.length / PAGE_SIZE));
  const pageItems = entries.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);

  const stateItems = useMemo(() => {
    const todos = STATUS_ORDER.map((s) => ({ key: s, label: STATUS_META[s].label, count: counts[s] }));
    const q = filterText.trim().toLowerCase();
    return q ? todos.filter((s) => s.label.toLowerCase().includes(q)) : todos;
  }, [counts, filterText]);

  return (
    <div className="mx-auto max-w-6xl px-6 py-8 lg:px-10">
      {/* Sin barra lateral, este es el único camino de vuelta al resumen. */}
      {!showOverview && (
        <button
          onClick={openOverview}
          className="mb-4 inline-flex items-center gap-1 text-sm font-medium text-accent transition-colors hover:underline"
        >
          <ChevronLeftIcon className="h-4 w-4" /> Volver
        </button>
      )}

      <div className="flex flex-wrap items-end justify-between gap-4">
        {selectedList ? (
          <div>
            <h1 className="text-4xl font-bold tracking-tight">{selectedList.name}</h1>
            <p className="mt-2 text-neutral-500">
              {selectedList.games.length} juegos · {selectedList.is_public ? "Pública" : "Privada"}
            </p>
          </div>
        ) : activeStatus ? (
          <div>
            <h1 className="text-4xl font-bold tracking-tight">{STATUS_META[activeStatus].label}</h1>
            <p className="mt-2 text-neutral-500">
              {counts[activeStatus]} {counts[activeStatus] === 1 ? "juego" : "juegos"}
            </p>
          </div>
        ) : (
          <div>
            <h1 className="text-4xl font-bold tracking-tight">Mi biblioteca</h1>
            <p className="mt-2 text-neutral-500">
              {counts.all} juegos seguidos · {formatHours(totalHours)} jugadas
            </p>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2">
          {/* La vista general se filtra por nombre; un estado, con el
              diálogo de filtros. Dentro de una lista no se filtra. */}
          {showOverview && (
            <input
              value={filterText}
              onChange={(e) => setFilterText(e.target.value)}
              placeholder="Buscar una lista…"
              className="rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
            />
          )}
          {activeStatus && (
            <button
              onClick={() => setShowFilters(true)}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-4 py-2 text-sm font-medium transition-colors ${
                activeFilters
                  ? "border-accent text-accent"
                  : "border-neutral-200 bg-white text-neutral-600 hover:border-accent hover:text-accent"
              }`}
            >
              <FilterIcon className="h-4 w-4" /> Filtrar
              {activeFilters > 0 && (
                <span className="grid h-5 min-w-5 place-items-center rounded-full bg-accent px-1 text-xs font-semibold text-white">
                  {activeFilters}
                </span>
              )}
            </button>
          )}
          {showOverview ? (
            <button
              onClick={() => setListModal({ open: true, list: null })}
              aria-label="Nueva lista"
              title="Nueva lista"
              className="grid h-[38px] w-[38px] place-items-center rounded-lg bg-accent text-white transition-colors hover:bg-accent-600"
            >
              <PlusIcon className="h-4 w-4" />
            </button>
          ) : (
            <>
              <div className="flex overflow-hidden rounded-lg border border-neutral-200">
                <button
                  onClick={() => setView("list")}
                  aria-label="Vista de lista"
                  title="Vista de lista"
                  aria-pressed={view === "list"}
                  className={`grid h-[38px] w-[38px] place-items-center ${view === "list" ? "bg-accent text-white" : "bg-white text-neutral-600"}`}
                >
                  <RowsIcon className="h-4 w-4" />
                </button>
                <button
                  onClick={() => setView("grid")}
                  aria-label="Vista de cuadrícula"
                  title="Vista de cuadrícula"
                  aria-pressed={view === "grid"}
                  className={`grid h-[38px] w-[38px] place-items-center ${view === "grid" ? "bg-accent text-white" : "bg-white text-neutral-600"}`}
                >
                  <GridIcon className="h-4 w-4" />
                </button>
              </div>
              {/* Gestión de la lista aquí mismo: compartirla y editarla. */}
              {selectedList && (
                <>
                  {/* aria-disabled y no disabled: un botón deshabilitado no
                      recibe foco ni hover, y entonces no hay forma de contar
                      por qué no se puede pulsar. */}
                  <Tooltip
                    label={
                      selectedList.is_public
                        ? "Publicar en el feed de la comunidad"
                        : "Esta lista es privada. Hazla pública desde Editar lista para poder compartirla."
                    }
                  >
                    <button
                      onClick={() => selectedList.is_public && setShowShare(true)}
                      aria-disabled={!selectedList.is_public}
                      aria-label="Publicar la lista en el feed"
                      className={`grid h-[38px] w-[38px] place-items-center rounded-lg border border-neutral-200 bg-white transition-colors ${
                        selectedList.is_public
                          ? "text-neutral-600 hover:border-accent hover:text-accent"
                          : "cursor-not-allowed text-neutral-300"
                      }`}
                    >
                      <ShareIcon className="h-4 w-4" />
                    </button>
                  </Tooltip>
                  <button
                    onClick={() => setListModal({ open: true, list: selectedList })}
                    aria-label="Editar la lista"
                    title="Editar la lista"
                    className="grid h-[38px] w-[38px] place-items-center rounded-lg border border-neutral-200 bg-white text-neutral-600 transition-colors hover:border-accent hover:text-accent"
                  >
                    <PencilIcon className="h-4 w-4" />
                  </button>
                </>
              )}
              <button
                onClick={() => setShowAddGame(true)}
                aria-label={selectedList ? "Añadir juegos a la lista" : "Añadir juego"}
                title={selectedList ? "Añadir juegos a la lista" : "Añadir juego"}
                className="grid h-[38px] w-[38px] place-items-center rounded-lg bg-accent text-white transition-colors hover:bg-accent-600"
              >
                <PlusIcon className="h-4 w-4" />
              </button>
            </>
          )}
        </div>
      </div>

      {/* Progreso de la importación de Steam (si hay una en curso) */}
      <SteamSyncBanner onFinished={reload} />

      {shareMsg && selectedList && <p className="mt-3 text-sm text-neutral-500">{shareMsg}</p>}

      {loading ? (
        <div className="mt-4 h-96 animate-pulse rounded-2xl bg-neutral-200" />
      ) : showOverview ? (
        // Estados y listas propias en una sola rejilla: para el usuario son
        // lo mismo -sitios donde están sus juegos- y separarlos en dos
        // secciones solo añadía encabezados sin información.
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {stateItems.map((s) => (
            <OverviewCard
              key={s.key}
              name={s.label}
              subtitle="Lista de estado"
              count={s.count}
              covers={coversByStatus[s.key] ?? []}
              onOpen={() => openStatus(s.key)}
            />
          ))}
          {overviewLists.map((list) => (
            <OverviewCard
              key={list.id}
              name={list.name}
              subtitle={list.is_public ? "Lista pública" : "Lista privada"}
              count={list.games.length}
              coverUrl={list.cover_url}
              covers={list.games.map((g) => g.cover_url).filter((c): c is string => !!c).slice(0, 4)}
              onOpen={() => openList(list.id)}
            />
          ))}
        </div>
      ) : pageItems.length === 0 ? (
        <div className="mt-4 rounded-2xl border border-dashed border-neutral-300 p-12 text-center text-neutral-500">
          {selectedList ? (
            "Esta lista está vacía."
          ) : (
            <>No hay juegos aquí. Pulsa <span className="font-medium text-accent">Añadir juego</span> para empezar.</>
          )}
        </div>
      ) : view === "grid" ? (
        <div className="mt-4 grid grid-cols-3 gap-4 sm:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
          {pageItems.map(({ game }, i) => (
            <GameCard key={game.igdb_id} game={game} index={i} />
          ))}
        </div>
      ) : (
        <div className="mt-4 divide-y divide-neutral-100 rounded-2xl bg-white p-2 shadow-sm">
          {pageItems.map(({ game, ug }) => (
            <div key={game.igdb_id} className="flex items-center gap-4 rounded-xl px-3 py-3 transition-colors hover:bg-neutral-50">
              <Link href={`/games/${game.igdb_id}`} className="shrink-0" aria-label={`Ver ficha de ${game.title}`}>
                <CoverThumb game={game} />
              </Link>
              {ug ? (
                <button onClick={() => setEditing(ug)} className="flex flex-1 items-center gap-4 text-left" aria-label={`Editar ${game.title}`}>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate font-semibold">{game.title}</p>
                      <SourceBadge userGame={ug} />
                    </div>
                    <p className="text-xs text-neutral-400">
                      {game.release_date ? new Date(game.release_date).getFullYear() : "—"} · {ug.platform || game.platforms[0] || "PC"}
                    </p>
                  </div>
                  <span className="w-16 text-right text-sm text-neutral-500">{formatHours(ug.hours_played)}</span>
                </button>
              ) : (
                <Link href={`/games/${game.igdb_id}`} className="flex flex-1 items-center gap-4">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{game.title}</p>
                    <p className="text-xs text-neutral-400">
                      {game.release_date ? new Date(game.release_date).getFullYear() : "—"} · {game.platforms[0] || "PC"}
                    </p>
                  </div>
                  <span className="text-xs text-neutral-400">No en tu biblioteca</span>
                </Link>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Paginación */}
      {!showOverview && pageCount > 1 && (
        <div className="mt-8 flex items-center justify-center gap-2 text-sm">
          <button onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0}
            className="inline-flex items-center gap-1 rounded-lg border border-neutral-300 bg-white px-4 py-2 transition-colors hover:border-accent hover:text-accent disabled:opacity-40">
            <ChevronLeftIcon className="h-4 w-4" /> Anterior
          </button>
          {Array.from({ length: pageCount }).map((_, i) => (
            <button key={i} onClick={() => setPage(i)}
              className={`grid h-9 w-9 place-items-center rounded-lg ${i === page ? "bg-accent font-semibold text-white" : "border border-neutral-300 bg-white"}`}>
              {i + 1}
            </button>
          ))}
          <button onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))} disabled={page >= pageCount - 1}
            className="inline-flex items-center gap-1 rounded-lg border border-neutral-300 bg-white px-4 py-2 transition-colors hover:border-accent hover:text-accent disabled:opacity-40">
            Siguiente <ChevronRightIcon className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Modales */}
      {editing && <GameProgressModal userGame={editing} onClose={() => setEditing(null)} onChanged={reload} />}
      {showShare && selectedList && (
        <ShareListModal
          list={selectedList}
          onClose={() => setShowShare(false)}
          onShared={setShareMsg}
        />
      )}

      {showFilters && (
        <LibraryFiltersModal
          value={filters}
          options={options}
          onApply={setFilters}
          onClose={() => setShowFilters(false)}
        />
      )}

      {showAddGame &&
        (selectedList ? (
          <GameSearchModal
            title={`Añadir juegos a "${selectedList.name}"`}
            pickLabel="Añadir a la lista"
            onPick={addGameToList}
            onClose={() => setShowAddGame(false)}
          />
        ) : (
          <AddGameModal onClose={() => setShowAddGame(false)} onAdded={reload} />
        ))}
      {listModal.open && (
        <ListModal
          list={listModal.list}
          onClose={() => setListModal({ open: false, list: null })}
          onChanged={reload}
          onDeleted={() => {
            setSelectedListId(null);
            reload();
          }}
        />
      )}
    </div>
  );
}
