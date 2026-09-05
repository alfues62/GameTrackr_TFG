"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ChevronLeftIcon, CloseIcon, PlusIcon } from "@/components/icons";
import { GameCard } from "@/components/GameCard";
import { GameSearchModal } from "@/components/library/GameSearchModal";
import { ListModal } from "@/components/library/ListModal";
import { ShareListModal } from "@/components/library/ShareListModal";
import { CommentThread } from "@/components/social/CommentThread";
import { ListLikeButton } from "@/components/social/ListCard";
import { useAuth } from "@/hooks/useAuth";
import api from "@/lib/axios";
import type { Game, GameList } from "@/lib/types";

export default function ListDetailPage() {
  const params = useParams<{ listId: string }>();
  const listId = params?.listId;
  const router = useRouter();
  const { user } = useAuth();

  const [list, setList] = useState<GameList | null>(null);
  const [pageStatus, setPageStatus] = useState<"loading" | "ok" | "notfound" | "error">("loading");
  const [showEdit, setShowEdit] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const [shareMsg, setShareMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!listId) return;
    try {
      const res = await api.get<GameList>(`/api/lists/${listId}/`);
      setList(res.data);
      setPageStatus("ok");
    } catch (err) {
      const code =
        typeof err === "object" && err !== null && "response" in err
          ? (err as { response?: { status?: number } }).response?.status
          : undefined;
      setPageStatus(code === 404 ? "notfound" : "error");
    }
  }, [listId]);

  useEffect(() => {
    load();
  }, [load]);

  const isOwner = !!list?.user && String(list.user.id) === String(user?.id ?? "");

  async function removeGame(game: Game) {
    if (!list) return;
    await api.delete(`/api/lists/${list.id}/games/${game.id}/`);
    load();
  }

  async function addGame(game: Game) {
    if (!list) return;
    await api.post(`/api/lists/${list.id}/games/`, { igdb_id: game.igdb_id });
    load();
  }

  if (pageStatus === "loading") {
    return (
      <div className="mx-auto max-w-[90rem] px-6 lg:px-10 py-10">
        <div className="h-72 animate-pulse rounded-2xl bg-neutral-200" />
      </div>
    );
  }

  if (pageStatus !== "ok" || !list) {
    return (
      <div className="mx-auto max-w-[90rem] px-6 lg:px-10 py-20 text-center">
        <p className="text-lg font-medium">
          {pageStatus === "notfound" ? "Lista no encontrada." : "No se pudo cargar la lista."}
        </p>
        <Link href="/library" className="mt-4 inline-flex items-center gap-1 font-medium text-accent hover:underline">
          <ChevronLeftIcon className="h-4 w-4" /> Volver a biblioteca
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[90rem] px-6 lg:px-10 py-8">
      <Link href="/library" className="inline-flex items-center gap-1 text-sm font-medium text-accent hover:underline">
        <ChevronLeftIcon className="h-4 w-4" /> Volver a biblioteca
      </Link>

      <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-4xl font-bold tracking-tight">{list.name}</h1>
          {list.description && <p className="mt-2 max-w-xl text-neutral-500">{list.description}</p>}
          <div className="mt-2 flex items-center gap-3 text-xs text-neutral-400">
            <span>
              {list.games.length} juegos · {list.is_public ? "Pública" : "Privada"}
            </span>
            <ListLikeButton list={list} />
          </div>
        </div>

        {isOwner && (
          <div className="flex gap-2">
            <button onClick={() => setShowAdd(true)} className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-accent-600">
              <PlusIcon className="h-4 w-4" /> Añadir juegos
            </button>
            {list.is_public && (
              <button
                onClick={() => setShowShare(true)}
                className="rounded-lg border border-neutral-200 bg-white px-4 py-2 text-sm font-medium transition-colors hover:border-accent hover:text-accent"
              >
                Publicar en el feed
              </button>
            )}
            <button onClick={() => setShowEdit(true)} className="rounded-lg border border-neutral-200 bg-white px-4 py-2 text-sm font-medium transition-colors hover:border-accent hover:text-accent">
              Editar lista
            </button>
          </div>
        )}
      </div>

      {shareMsg && <p className="mt-3 text-sm text-neutral-500">{shareMsg}</p>}

      {list.games.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-dashed border-neutral-300 p-12 text-center text-neutral-500">
          Esta lista está vacía.
          {isOwner && <> Pulsa <span className="font-medium text-accent">+ Añadir juegos</span> para empezar.</>}
        </div>
      ) : (
        <div className="mt-8 grid grid-cols-3 gap-4 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6">
          {list.games.map((game, i) => (
            <div key={game.igdb_id} className="group relative">
              <GameCard game={game} index={i} />
              {isOwner && (
                <button
                  onClick={() => removeGame(game)}
                  aria-label="Quitar de la lista"
                  className="absolute right-2 top-2 z-10 grid h-7 w-7 place-items-center rounded-full bg-black/60 text-white opacity-0 transition-opacity hover:bg-black/80 group-hover:opacity-100"
                >
                  <CloseIcon className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      <section className="mt-10 border-t border-neutral-100 pt-6">
        <h2 className="text-lg font-semibold">Comentarios</h2>
        <div className="mt-3">
          <CommentThread
            endpoint={`/api/lists/${list.id}/comments/`}
            initialCount={list.comments_count}
            collapsible={false}
            emptyLabel="Sé el primero en comentar esta lista."
          />
        </div>
      </section>

      {showShare && (
        <ShareListModal list={list} onClose={() => setShowShare(false)} onShared={setShareMsg} />
      )}

      {showEdit && (
        <ListModal
          list={list}
          onClose={() => setShowEdit(false)}
          onChanged={load}
          // replace y no push: el atrás no debe volver a una lista que ya no existe.
          onDeleted={() => router.replace("/library")}
        />
      )}
      {showAdd && (
        <GameSearchModal title="Añadir juegos a la lista" onPick={addGame} onClose={() => setShowAdd(false)} />
      )}
    </div>
  );
}
