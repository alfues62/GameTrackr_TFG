/* eslint-disable @next/next/no-img-element */
"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { PlusIcon, SearchIcon } from "@/components/icons";
import { CreatePostModal } from "@/components/social/CreatePostModal";
import { PostCard } from "@/components/social/PostCard";
import { TopListsCarousel } from "@/components/social/TopListsCarousel";
import api from "@/lib/axios";
import type { Post, PublicUser } from "@/lib/types";

interface Paginated {
  count: number;
  results: Post[];
}

export default function CommunityPage() {
  // Feed único y continuo: se van encadenando páginas al llegar al final en
  // vez de repartirlas en pestañas o en una paginación numerada.
  const [posts, setPosts] = useState<Post[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  // Contador que fuerza la recarga: volver a poner page=1 no basta cuando ya
  // estabas en la primera página, y el feed se quedaba vacío tras un borrado.
  const [refreshKey, setRefreshKey] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const sentinel = useRef<HTMLDivElement>(null);

  const [query, setQuery] = useState("");
  const [users, setUsers] = useState<PublicUser[]>([]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api
      .get<Paginated>("/api/posts/feed/", { params: { page } })
      .then((res) => {
        if (cancelled) return;
        // La primera página reemplaza; las siguientes se acumulan.
        setPosts((prev) => (page === 1 ? res.data.results : [...prev, ...res.data.results]));
        setHasMore(res.data.results.length > 0);
      })
      .catch(() => setHasMore(false))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [page, refreshKey]);

  // Al borrar o crear una publicación se vuelve al principio del feed.
  const reload = useCallback(() => {
    setPosts([]);
    setHasMore(true);
    setPage(1);
    setRefreshKey((k) => k + 1);
  }, []);

  // Carga la siguiente página cuando el centinela del final entra en pantalla.
  useEffect(() => {
    const node = sentinel.current;
    if (!node || loading || !hasMore) return;
    const observer = new IntersectionObserver(
      (entries) => entries[0].isIntersecting && setPage((p) => p + 1),
      { rootMargin: "400px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [loading, hasMore]);

  async function searchUsers(e: React.FormEvent) {
    e.preventDefault();
    const q = query.trim();
    if (!q) {
      setUsers([]);
      return;
    }
    const res = await api
      .get<PublicUser[]>("/api/social/search/", { params: { q } })
      .catch(() => ({ data: [] as PublicUser[] }));
    setUsers(res.data);
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="text-3xl font-bold tracking-tight">Comunidad</h1>

      {/* Búsqueda de jugadores */}
      <form onSubmit={searchUsers} className="relative mt-4">
        <SearchIcon className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-neutral-400" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Busca jugadores…"
          className="w-full rounded-xl border border-neutral-200 bg-white py-3 pl-12 pr-4 outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
        />
      </form>

      {users.length > 0 && (
        <div className="mt-2 space-y-1 rounded-xl border border-neutral-200 bg-white p-2">
          {users.map((u) => (
            <Link key={u.id} href={`/profile/${u.username}`} className="flex items-center gap-3 rounded-lg p-2 hover:bg-neutral-50">
              <span className="grid h-9 w-9 place-items-center overflow-hidden rounded-full bg-neutral-700 text-sm font-semibold text-white">
                {u.avatar_url ? <img src={u.avatar_url} alt="" className="h-full w-full object-cover" /> : u.username.charAt(0).toUpperCase()}
              </span>
              <div className="text-sm">
                <p className="font-medium">{u.username}</p>
                <p className="text-xs text-neutral-400">@{u.username.toLowerCase()}</p>
              </div>
              {u.is_following && <span className="ml-auto text-xs text-accent">Siguiendo</span>}
            </Link>
          ))}
        </div>
      )}

      {/* Listas públicas mejor valoradas */}
      <TopListsCarousel />

      {/* Feed continuo: reseñas, listas publicadas y juegos completados */}
      <div className="mt-8 border-t border-neutral-100 pt-2">
        {posts.map((post) => (
          <PostCard key={post.id} post={post} onChanged={reload} />
        ))}

        {loading && (
          <div className="space-y-4 py-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-64 animate-pulse rounded-2xl bg-neutral-200" />
            ))}
          </div>
        )}

        {!loading && posts.length === 0 && (
          <div className="mt-6 rounded-2xl border border-dashed border-neutral-300 p-12 text-center text-neutral-500">
            Aún no hay publicaciones.
          </div>
        )}

        <div ref={sentinel} aria-hidden className="h-px" />

        {!hasMore && posts.length > 0 && (
          <p className="py-8 text-center text-sm text-neutral-400">No hay más publicaciones.</p>
        )}
      </div>

      {/* Botón flotante de crear post */}
      <button
        onClick={() => setShowCreate(true)}
        aria-label="Nueva publicación"
        className="fixed bottom-8 right-8 z-40 grid h-14 w-14 place-items-center rounded-full bg-accent text-white shadow-lg shadow-accent/40 transition-colors hover:bg-accent-600"
      >
        <PlusIcon className="h-6 w-6" />
      </button>

      {showCreate && <CreatePostModal onClose={() => setShowCreate(false)} onCreated={reload} />}
    </div>
  );
}
