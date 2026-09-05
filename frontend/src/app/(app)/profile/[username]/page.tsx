/* eslint-disable @next/next/no-img-element */
"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ChevronLeftIcon, LockIcon } from "@/components/icons";
import { PostCard } from "@/components/social/PostCard";
import { useAuth } from "@/hooks/useAuth";
import api, { asList } from "@/lib/axios";
import { formatHours } from "@/lib/library";
import type { GameList, Post, PublicProfile } from "@/lib/types";

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="text-center">
      <p className="text-2xl font-bold">{value}</p>
      <p className="text-xs uppercase tracking-wider text-neutral-400">{label}</p>
    </div>
  );
}

export default function PublicProfilePage() {
  const params = useParams<{ username: string }>();
  const username = params?.username;
  const { user } = useAuth();

  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [lists, setLists] = useState<GameList[]>([]);
  const [pageStatus, setPageStatus] = useState<"loading" | "ok" | "notfound">("loading");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!username) return;
    try {
      const prof = await api.get<PublicProfile>(`/api/social/users/${username}/`);
      setProfile(prof.data);
      setPageStatus("ok");
      // Perfil privado: no pedimos ni mostramos su contenido (posts/listas).
      if (prof.data.is_private) {
        setPosts([]);
        setLists([]);
        return;
      }
      const [p, l] = await Promise.all([
        api.get<{ results: Post[] }>("/api/posts/", { params: { user: prof.data.user.id } }).catch(() => ({ data: { results: [] as Post[] } })),
        api.get<GameList[]>("/api/lists/", { params: { user: prof.data.user.id } }).catch(() => ({ data: [] as GameList[] })),
      ]);
      setPosts(p.data.results ?? []);
      setLists(asList<GameList>(l.data).filter((list) => list.is_public));
    } catch {
      setPageStatus("notfound");
    }
  }, [username]);

  useEffect(() => {
    load();
  }, [load]);

  async function toggleFollow() {
    if (!profile) return;
    setBusy(true);
    const following = profile.user.is_following;
    try {
      if (following) await api.delete(`/api/social/unfollow/${profile.user.id}/`);
      else await api.post(`/api/social/follow/${profile.user.id}/`);
      setProfile((pr) => (pr ? { ...pr, user: { ...pr.user, is_following: !following } } : pr));
    } finally {
      setBusy(false);
    }
  }

  if (pageStatus === "loading") {
    return <div className="mx-auto max-w-2xl px-4 py-10"><div className="h-40 animate-pulse rounded-2xl bg-neutral-200" /></div>;
  }
  if (pageStatus === "notfound" || !profile) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-20 text-center">
        <p className="text-lg font-medium">Usuario no encontrado.</p>
        <Link href="/community" className="mt-4 inline-flex items-center gap-1 font-medium text-accent hover:underline"><ChevronLeftIcon className="h-4 w-4" /> Volver a la comunidad</Link>
      </div>
    );
  }

  const isSelf = String(profile.user.id) === String(user?.id ?? "");

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      {/* Cabecera */}
      <div className="rounded-2xl border border-neutral-200 bg-white p-6">
        <div className="flex items-center gap-4">
          <span className="grid h-20 w-20 place-items-center overflow-hidden rounded-2xl bg-neutral-700 text-3xl font-semibold text-white">
            {profile.user.avatar_url ? <img src={profile.user.avatar_url} alt="" className="h-full w-full object-cover" /> : profile.user.username.charAt(0).toUpperCase()}
          </span>
          <div className="flex-1">
            <h1 className="text-2xl font-bold">{profile.user.username}</h1>
            <p className="text-xs text-neutral-400">@{profile.user.username.toLowerCase()}</p>
            {profile.user.bio && <p className="mt-1 text-sm text-neutral-600">{profile.user.bio}</p>}
          </div>
          {!isSelf && (
            <button onClick={toggleFollow} disabled={busy}
              className={`rounded-lg px-5 py-2 text-sm font-semibold transition-colors disabled:opacity-60 ${
                profile.user.is_following ? "border border-neutral-200 hover:border-pink-300 hover:text-pink-600" : "bg-accent text-white hover:bg-accent-600"
              }`}>
              {profile.user.is_following ? "Siguiendo" : "Seguir"}
            </button>
          )}
        </div>

        {profile.is_private || !profile.stats ? (
          <div className="mt-6 border-t border-neutral-100 pt-6 text-center">
            <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-neutral-100 text-neutral-500"><LockIcon className="h-6 w-6" /></span>
            <p className="mt-3 font-semibold">Este perfil es privado</p>
            <p className="mx-auto mt-1 max-w-xs text-sm text-neutral-400">Su biblioteca, sus listas y sus publicaciones no son visibles.</p>
          </div>
        ) : (
          <div className="mt-6 flex justify-around border-t border-neutral-100 pt-4">
            <Stat label="Juegos" value={profile.stats.total_games} />
            <Stat label="Completados" value={profile.stats.completed_games} />
            <Stat label="Horas" value={formatHours(profile.stats.total_hours)} />
          </div>
        )}
      </div>

      {/* Listas públicas */}
      {!profile.is_private && lists.length > 0 && (
        <section className="mt-8">
          <p className="text-xs uppercase tracking-[0.15em] text-neutral-400">Listas públicas</p>
          <div className="mt-3 flex gap-3 overflow-x-auto pb-2">
            {lists.map((list) => (
              <Link key={list.id} href={`/lists/${list.id}`}
                className="relative flex h-32 w-28 shrink-0 flex-col justify-end overflow-hidden rounded-2xl bg-gradient-to-br from-neutral-700 to-neutral-900 p-3 text-white transition-transform hover:scale-[1.02]">
                <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-4xl font-bold text-white/10">{list.name.charAt(0).toUpperCase()}</span>
                <p className="relative truncate text-sm font-semibold">{list.name}</p>
                <p className="relative text-[10px] text-white/60">{list.games.length} juegos</p>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Posts */}
      {!profile.is_private && (
      <section className="mt-8">
        <p className="text-xs uppercase tracking-[0.15em] text-neutral-400">Publicaciones</p>
        {posts.length === 0 ? (
          <p className="mt-4 text-sm text-neutral-400">Este usuario aún no ha publicado nada.</p>
        ) : (
          <div className="mt-2">
            {posts.map((post, i) => (
              <PostCard key={post.id} post={post} index={i} onChanged={load} />
            ))}
          </div>
        )}
      </section>
      )}
    </div>
  );
}
