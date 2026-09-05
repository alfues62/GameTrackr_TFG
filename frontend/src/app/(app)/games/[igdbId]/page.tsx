/* eslint-disable @next/next/no-img-element */
"use client";

import Image from "next/image";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ChevronLeftIcon, PencilIcon, PlusIcon, StarIcon, SteamIcon } from "@/components/icons";
import { AddToListModal } from "@/components/library/AddToListModal";
import { GameProgressModal } from "@/components/library/GameProgressModal";
import { Stars } from "@/components/library/Stars";
import { CommentThread } from "@/components/social/CommentThread";
import { Select } from "@/components/ui/Select";
import api, { asList } from "@/lib/axios";
import { categoryBadge, formatHours, isUnreleased, STATUS_META, STATUS_ORDER } from "@/lib/library";
import { useAuth } from "@/hooks/useAuth";
import type { Game, GameReview, LibraryStatus, UserGame } from "@/lib/types";

function Eyebrow({ children }: { children: React.ReactNode }) {
  return <p className="text-xs uppercase tracking-[0.15em] text-neutral-400">{children}</p>;
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const d = Math.floor(diff / 86400000);
  if (d <= 0) return "hoy";
  if (d < 7) return `hace ${d} d`;
  if (d < 30) return `hace ${Math.floor(d / 7)} sem`;
  if (d < 365) return `hace ${Math.floor(d / 30)} mes`;
  return `hace ${Math.floor(d / 365)} a`;
}

function StarInput({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map((s) => (
        <button
          key={s}
          type="button"
          onClick={() => onChange(s)}
          className={s <= value ? "text-accent" : "text-neutral-300 hover:text-accent/50"}
          aria-label={`${s} estrellas`}
        >
          <StarIcon filled={s <= value} className="h-6 w-6" />
        </button>
      ))}
    </div>
  );
}

export default function GameDetailPage() {
  const params = useParams<{ igdbId: string }>();
  const igdbId = params?.igdbId;

  const [game, setGame] = useState<Game | null>(null);
  const [pageStatus, setPageStatus] = useState<"loading" | "ok" | "notfound" | "error">("loading");

  const [myEntry, setMyEntry] = useState<UserGame | null>(null);
  const [reviews, setReviews] = useState<GameReview[]>([]);
  const { user } = useAuth();

  const [editing, setEditing] = useState(false);
  const [showAddList, setShowAddList] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [busy, setBusy] = useState(false);

  const [reviewStars, setReviewStars] = useState(0);
  const [reviewText, setReviewText] = useState("");
  // Con una reseña ya publicada el formulario se esconde: se abre a propósito
  // desde el botón de editar, para no repetir el texto justo encima de él.
  const [editingReview, setEditingReview] = useState(false);

  const loadEntryAndReviews = useCallback(async () => {
    if (!igdbId) return;
    const [mine, revs] = await Promise.all([
      api.get<UserGame[]>("/api/library/", { params: { game: igdbId } }).catch(() => ({ data: [] as UserGame[] })),
      api.get<GameReview[]>(`/api/games/${igdbId}/reviews/`).catch(() => ({ data: [] as GameReview[] })),
    ]);
    const entry = asList<UserGame>(mine.data)[0] ?? null;
    setMyEntry(entry);
    setReviews(revs.data);
    if (entry) {
      setReviewText(entry.review ?? "");
      setReviewStars(entry.user_rating != null ? Math.round(entry.user_rating / 2) : 0);
    }
  }, [igdbId]);

  useEffect(() => {
    if (!igdbId) return;
    (async () => {
      try {
        const res = await api.get<Game>(`/api/games/${igdbId}/`);
        setGame(res.data);
        setPageStatus("ok");
        loadEntryAndReviews();
      } catch (err) {
        const code =
          typeof err === "object" && err !== null && "response" in err
            ? (err as { response?: { status?: number } }).response?.status
            : undefined;
        setPageStatus(code === 404 ? "notfound" : "error");
      }
    })();
  }, [igdbId, loadEntryAndReviews]);

  async function addToLibrary(status: LibraryStatus = "playing") {
    if (!game) return;
    setBusy(true);
    try {
      await api.post("/api/library/", { igdb_id: game.igdb_id, status });
      await loadEntryAndReviews();
    } finally {
      setBusy(false);
    }
  }

  async function changeStatus(status: LibraryStatus) {
    if (!myEntry) return;
    setBusy(true);
    try {
      await api.patch(`/api/library/${myEntry.id}/`, { status });
      await loadEntryAndReviews();
    } finally {
      setBusy(false);
    }
  }

  async function removeFromLibrary() {
    if (!myEntry) return;
    setBusy(true);
    try {
      await api.delete(`/api/library/${myEntry.id}/`);
      setMyEntry(null);
      setConfirmRemove(false);
      await loadEntryAndReviews();
    } finally {
      setBusy(false);
    }
  }

  async function publishReview(e: React.FormEvent) {
    e.preventDefault();
    if (!game || (!reviewText.trim() && reviewStars === 0)) return;
    setBusy(true);
    const payload = { user_rating: reviewStars > 0 ? reviewStars * 2 : null, review: reviewText.trim() || null };
    try {
      if (myEntry) {
        await api.patch(`/api/library/${myEntry.id}/`, payload);
      } else {
        await api.post("/api/library/", { igdb_id: game.igdb_id, status: unreleased ? "wishlist" : "playing", ...payload });
      }
      await loadEntryAndReviews();
      setEditingReview(false);
    } finally {
      setBusy(false);
    }
  }

  /** Descarta los cambios y deja lo que hubiera guardado. */
  function cancelReviewEdit() {
    setReviewText(myEntry?.review ?? "");
    setReviewStars(myEntry?.user_rating != null ? Math.round(myEntry.user_rating / 2) : 0);
    setEditingReview(false);
  }

  if (pageStatus === "loading") {
    return (
      <div className="mx-auto max-w-5xl px-6 py-10">
        <div className="h-96 animate-pulse rounded-2xl bg-neutral-200" />
      </div>
    );
  }

  if (pageStatus !== "ok" || !game) {
    return (
      <div className="mx-auto max-w-5xl px-6 py-20 text-center">
        <p className="text-lg font-medium">
          {pageStatus === "notfound" ? "Juego no encontrado." : "No se pudo cargar el juego."}
        </p>
        <Link href="/explore" className="mt-4 inline-flex items-center gap-1 font-medium text-accent hover:underline">
          <ChevronLeftIcon className="h-4 w-4" /> Volver a explorar
        </Link>
      </div>
    );
  }

  const igdbOver10 = game.igdb_rating != null ? game.igdb_rating / 10 : null;
  const initial = game.title.charAt(0).toUpperCase();
  const unreleased = isUnreleased(game);
  const categoryLabel = categoryBadge(game.category);

  // Distribución de valoraciones de la comunidad: incluye tanto quien escribió
  // una reseña como quien solo puso nota (el backend ya trae ambos casos).
  const rated = reviews.filter((r) => r.user_rating != null).map((r) => r.user_rating as number);
  const communityAvg = rated.length ? rated.reduce((s, r) => s + r, 0) / rated.length : null;
  // La lista de "reseñas de la comunidad", en cambio, solo muestra quien escribió texto.
  const writtenReviews = reviews.filter((r) => r.review && r.review.trim());
  const buckets = [0, 0, 0, 0, 0];
  rated.forEach((r) => {
    const star = Math.min(5, Math.max(1, Math.round(r / 2)));
    buckets[star - 1] += 1;
  });
  const maxBucket = Math.max(1, ...buckets);

  return (
    <div>
      {/* Banner */}
      <div className="relative h-64 overflow-hidden">
        {game.cover_url && <Image src={game.cover_url} alt="" aria-hidden fill sizes="100vw" className="object-cover opacity-40 blur-xl" />}
        <div className="absolute inset-0 bg-gradient-to-b from-neutral-900/40 to-neutral-50" />
        <div className="absolute inset-x-0 top-0 mx-auto max-w-5xl px-6 py-4">
          <Link href="/explore" className="inline-flex items-center gap-1 text-sm font-medium text-white drop-shadow hover:underline">
            <ChevronLeftIcon className="h-4 w-4" /> Volver a explorar
          </Link>
        </div>
      </div>

      <div className="mx-auto max-w-5xl px-6 pb-12">
        {/* Portada + título */}
        <div className="-mt-28 flex flex-col gap-6 sm:flex-row sm:items-end">
          <div className="relative aspect-[3/4] w-44 shrink-0 overflow-hidden rounded-2xl bg-gradient-to-br from-neutral-700 to-neutral-900 shadow-xl">
            <span className="absolute inset-0 flex select-none items-center justify-center text-7xl font-bold text-white/10">{initial}</span>
            {game.cover_url && <Image src={game.cover_url} alt={game.title} fill sizes="176px" className="object-cover" />}
          </div>

          <div className="space-y-2 pb-2">
            <h1 className="flex flex-wrap items-center gap-2.5 text-4xl font-bold tracking-tight">
              {game.title}
              {categoryLabel && (
                <span className="rounded bg-neutral-900 px-2 py-0.5 align-middle text-xs font-semibold uppercase tracking-wide text-white">
                  {categoryLabel}
                </span>
              )}
            </h1>
            <div className="flex flex-wrap items-center gap-3 text-sm text-neutral-500">
              {game.release_date && <span>Lanzamiento {new Date(game.release_date).getFullYear()}</span>}
              {igdbOver10 != null && (
                <span className="flex items-center gap-1">
                  <Stars rating={igdbOver10} /> {igdbOver10.toFixed(1)}
                </span>
              )}
              {myEntry && (
                <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${STATUS_META[myEntry.status].badge}`}>
                  <span className="h-1.5 w-1.5 rounded-full" style={{ background: STATUS_META[myEntry.status].dot }} />
                  {STATUS_META[myEntry.status].label}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Cuerpo */}
        <div className="mt-10 grid gap-8 lg:grid-cols-[1fr_320px]">
          {/* Columna principal */}
          <div className="space-y-8">
            {game.genres.length > 0 && (
              <section>
                <Eyebrow>Géneros</Eyebrow>
                <div className="mt-3 flex flex-wrap gap-2">
                  {game.genres.map((g) => (
                    <span key={g} className="rounded-full border border-neutral-200 bg-white px-3 py-1 text-sm">{g}</span>
                  ))}
                </div>
              </section>
            )}

            {game.platforms.length > 0 && (
              <section>
                <Eyebrow>Plataformas</Eyebrow>
                <div className="mt-3 flex flex-wrap gap-2">
                  {game.platforms.map((p) => (
                    <span key={p} className="rounded-full border border-neutral-200 bg-white px-3 py-1 text-sm text-neutral-600">{p}</span>
                  ))}
                </div>
              </section>
            )}

            {game.description && (
              <section>
                <Eyebrow>Sinopsis</Eyebrow>
                <p className="mt-3 leading-relaxed text-neutral-700">{game.description}</p>
              </section>
            )}

            {/* Valoración */}
            <section className="rounded-2xl border border-neutral-200 bg-white p-6">
              <div className="flex items-end gap-8">
                <div className="shrink-0 text-center">
                  <p className="text-5xl font-bold text-accent">
                    {communityAvg != null ? communityAvg.toFixed(1) : igdbOver10?.toFixed(1) ?? "—"}
                  </p>
                  <Stars rating={communityAvg ?? igdbOver10} className="text-sm" />
                  <p className="mt-1 text-xs text-neutral-400">
                    {communityAvg != null ? `${rated.length} valoraciones` : "valoración IGDB"}
                  </p>
                  {communityAvg != null && igdbOver10 != null && (
                    <p className="mt-2 border-t border-neutral-100 pt-2 text-xs text-neutral-500">
                      IGDB <span className="font-semibold text-neutral-700">{igdbOver10.toFixed(1)}</span>
                    </p>
                  )}
                </div>
                {rated.length > 0 ? (
                  <div className="flex flex-1 items-end gap-2">
                    {buckets.map((b, i) => (
                      <div key={i} className="flex flex-1 flex-col items-center gap-1">
                        <div className="w-full overflow-hidden rounded-md bg-neutral-100" style={{ height: 80 }}>
                          <div className="w-full rounded-md bg-gradient-to-t from-accent-600 to-accent"
                            style={{ height: `${(b / maxBucket) * 100}%`, marginTop: `${100 - (b / maxBucket) * 100}%` }} />
                        </div>
                        <span className="flex items-center gap-0.5 text-[10px] text-neutral-400">{i + 1}<StarIcon filled className="h-2.5 w-2.5 text-accent" /></span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="flex-1 text-sm text-neutral-400">Aún no hay valoraciones de la comunidad.</p>
                )}
              </div>
            </section>

            {/* Reseñas */}
            <section>
              <Eyebrow>Reseñas de la comunidad</Eyebrow>
              {myEntry?.review && !editingReview ? null : (
                <form onSubmit={publishReview} className="mt-3">
                  <StarInput value={reviewStars} onChange={setReviewStars} />
                  <textarea
                    value={reviewText}
                    onChange={(e) => setReviewText(e.target.value)}
                    placeholder="Comparte tu opinión sobre el juego…"
                    rows={2}
                    className="mt-2 w-full resize-none border-x-0 border-t-0 border-b border-neutral-200 bg-transparent px-0 py-1.5 text-sm outline-none transition-colors focus:border-accent"
                  />
                  <div className="mt-2 flex items-center justify-end gap-3">
                    {editingReview && (
                      <button
                        type="button"
                        onClick={cancelReviewEdit}
                        className="text-xs font-medium text-neutral-400 transition-colors hover:text-neutral-600"
                      >
                        Cancelar
                      </button>
                    )}
                    {/* El botón solo existe en el DOM si hay algo que enviar: texto o estrellas. */}
                    {(reviewText.trim() || reviewStars > 0) && (
                      <button type="submit" disabled={busy}
                        className="animate-fade-in rounded-full bg-accent px-4 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-accent-600 disabled:cursor-default disabled:opacity-60">
                        {myEntry?.review ? "Actualizar reseña" : "Publicar reseña"}
                      </button>
                    )}
                  </div>
                </form>
              )}

              <div className="mt-4 space-y-4">
                {writtenReviews.length === 0 && <p className="text-sm text-neutral-400">Sé el primero en reseñar este juego.</p>}
                {writtenReviews.map((r) => (
                  <div key={r.id} className="flex gap-3">
                    <span className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-full bg-neutral-700 text-sm font-semibold text-white">
                      {r.user.avatar_url ? <img src={r.user.avatar_url} alt="" className="h-full w-full object-cover" /> : r.user.username.charAt(0).toUpperCase()}
                    </span>
                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <p className="text-sm">
                          <span className="font-medium">{r.user.username}</span>{" "}
                          {r.user_rating != null && <Stars rating={r.user_rating} className="text-xs" />}
                        </p>
                        <span className="flex items-center gap-2">
                          <span className="text-xs text-neutral-400">{timeAgo(r.updated_at)}</span>
                          {/* La reseña propia se edita desde aquí, sin un formulario
                              abierto encima repitiendo lo que ya se lee debajo. */}
                          {String(r.user.id) === String(user?.id ?? "") && (
                            <button
                              onClick={() => setEditingReview(true)}
                              aria-label="Editar mi reseña"
                              title="Editar mi reseña"
                              className="text-neutral-300 transition-colors hover:text-accent"
                            >
                              <PencilIcon className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </span>
                      </div>
                      <p className="mt-1 text-sm text-neutral-600">{r.review}</p>
                      <div className="mt-2">
                        <CommentThread
                          endpoint={`/api/games/${igdbId}/reviews/${r.id}/comments/`}
                          initialCount={r.comments_count}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>

          {/* Sidebar */}
          <aside className="space-y-4">
            <div className="rounded-2xl border border-neutral-200 bg-white p-5">
              <Eyebrow>En tu biblioteca</Eyebrow>

              {myEntry ? (
                <>
                  <div className="mt-3">
                    <Select
                      value={myEntry.status}
                      onChange={(v) => changeStatus(v as LibraryStatus)}
                      disabled={busy || unreleased}
                      ariaLabel="Estado en tu biblioteca"
                      options={
                        unreleased
                          ? [{ value: "wishlist", label: STATUS_META.wishlist.label }]
                          : STATUS_ORDER.map((s) => ({ value: s, label: STATUS_META[s].label }))
                      }
                    />
                  </div>
                  {unreleased && (
                    <p className="mt-1.5 text-xs text-neutral-400">Aún no ha salido: solo puede estar en la wishlist.</p>
                  )}

                  {myEntry.is_from_steam && (
                    <span className="mt-3 inline-flex items-center gap-1 rounded bg-neutral-900 px-2 py-0.5 text-[10px] font-medium text-white">
                      <SteamIcon className="h-3 w-3" /> Importado de Steam
                    </span>
                  )}

                  <div className="mt-5 grid grid-cols-2 gap-4">
                    <div>
                      <Eyebrow>Plataforma</Eyebrow>
                      <p className="mt-1 font-medium">{myEntry.platform || game.platforms[0] || "—"}</p>
                    </div>
                    <div>
                      <Eyebrow>Horas</Eyebrow>
                      <p className="mt-1 font-medium">{formatHours(myEntry.hours_played)}</p>
                    </div>
                    <div>
                      <Eyebrow>Completado</Eyebrow>
                      <p className="mt-1 font-medium">{Math.round(myEntry.completion_percentage)}%</p>
                    </div>
                    <div>
                      <Eyebrow>Tu nota</Eyebrow>
                      <p className="mt-1 font-medium">{myEntry.user_rating != null ? myEntry.user_rating.toFixed(1) : "—"}</p>
                    </div>
                  </div>

                  <div className="mt-5 flex gap-2">
                    {confirmRemove ? (
                      <>
                        <button onClick={removeFromLibrary} disabled={busy} className="flex-1 rounded-lg bg-pink-600 py-2 text-sm font-semibold text-white transition-colors hover:bg-pink-700 disabled:opacity-50">
                          Confirmar
                        </button>
                        <button onClick={() => setConfirmRemove(false)} className="flex-1 rounded-lg border border-neutral-200 py-2 text-sm font-medium transition-colors hover:border-neutral-400">
                          Cancelar
                        </button>
                      </>
                    ) : (
                      <>
                        <button onClick={() => setEditing(true)} className="flex-1 rounded-lg border border-neutral-200 py-2 text-sm font-medium transition-colors hover:border-accent hover:text-accent">
                          Editar
                        </button>
                        <button onClick={() => setConfirmRemove(true)} disabled={busy} className="flex-1 rounded-lg border border-neutral-200 py-2 text-sm font-medium text-pink-600 transition-colors hover:border-pink-300 disabled:opacity-50">
                          Quitar
                        </button>
                      </>
                    )}
                  </div>
                </>
              ) : (
                <button onClick={() => addToLibrary(unreleased ? "wishlist" : "playing")} disabled={busy}
                  className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-accent py-2.5 font-semibold text-white transition-colors hover:bg-accent-600 disabled:opacity-60">
                  <PlusIcon className="h-4 w-4" /> {unreleased ? "Añadir a la wishlist" : "Añadir a biblioteca"}
                </button>
              )}
            </div>

            <button onClick={() => setShowAddList(true)}
              className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl border border-neutral-200 bg-white py-3 font-semibold transition-colors hover:border-accent hover:text-accent">
              <PlusIcon className="h-4 w-4" /> Añadir a una lista
            </button>
          </aside>
        </div>
      </div>

      {editing && myEntry && (
        <GameProgressModal userGame={myEntry} onClose={() => setEditing(false)} onChanged={loadEntryAndReviews} />
      )}
      {showAddList && <AddToListModal igdbId={game.igdb_id} onClose={() => setShowAddList(false)} />}
    </div>
  );
}
