/* eslint-disable @next/next/no-img-element */
"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import type { ReactNode } from "react";
import { CheckIcon, ChevronRightIcon, CloseIcon, CommentIcon, HeartIcon, PlayIcon, ShareIcon } from "@/components/icons";
import { ListCard } from "@/components/social/ListCard";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import { useAuth } from "@/hooks/useAuth";
import api from "@/lib/axios";
import { timeAgo } from "@/lib/time";
import type { Post, PostType } from "@/lib/types";

const BADGE: Record<PostType, { label: string; color: string } | null> = {
  update: { label: "Jugando", color: "#525252" },
  achievement: { label: "Completado", color: "#525252" },
  // Reseñas y listas no llevan etiqueta: el propio contenido ya se explica.
  review: null,
  list: null,
  general: null,
};

function Action({ children, count, active, onClick, title, label }: { children: ReactNode; count?: number; active?: boolean; onClick?: () => void; title?: string; label?: string }) {
  return (
    <button
      onClick={onClick}
      title={title}
      aria-label={label}
      className={`flex items-center gap-1.5 text-sm transition-colors ${active ? "text-accent" : "text-neutral-400 hover:text-neutral-700"}`}
    >
      {children}
      {count != null && <span className="text-xs">{count}</span>}
    </button>
  );
}

function ActionLink({ children, count, href, label }: { children: ReactNode; count?: number; href: string; label?: string }) {
  return (
    <Link href={href} aria-label={label} className="flex items-center gap-1.5 text-sm text-neutral-400 transition-colors hover:text-neutral-700">
      {children}
      {count != null && <span className="text-xs">{count}</span>}
    </Link>
  );
}

/**
 * `linkComments`: en el feed, "Comentar" lleva a la página del post (no se ven
 * todos los comentarios ahí, solo el contador). En la propia página del post
 * se pasa `false` y el hilo completo se renderiza aparte, debajo de la tarjeta.
 */
export function PostCard({ post, onChanged, linkComments = true }: { post: Post; index?: number; onChanged?: () => void; linkComments?: boolean }) {
  const { user } = useAuth();
  const confirm = useConfirm();
  const [liked, setLiked] = useState(post.is_liked);
  const [likes, setLikes] = useState(post.likes_count);
  const [shared, setShared] = useState(false);

  const isOwn = String(post.user.id) === String(user?.id ?? "");
  const badge = BADGE[post.post_type];
  const game = post.related_game;
  const list = post.related_list;

  async function toggleLike() {
    const next = !liked;
    setLiked(next);
    setLikes((n) => n + (next ? 1 : -1));
    try {
      if (next) await api.post(`/api/posts/${post.id}/like/`);
      else await api.delete(`/api/posts/${post.id}/like/`);
    } catch {
      setLiked(!next);
      setLikes((n) => n + (next ? -1 : 1));
    }
  }

  async function remove() {
    const ok = await confirm({
      title: "¿Borrar esta publicación?",
      message: "Se perderá junto con sus me gusta y sus comentarios.",
      confirmLabel: "Borrar",
      tone: "danger",
    });
    if (!ok) return;
    await api.delete(`/api/posts/${post.id}/`);
    onChanged?.();
  }

  // Aún no hay permalink de post: compartimos el perfil del autor. En móvil se
  // abre el diálogo nativo; en escritorio se copia al portapapeles.
  async function sharePost() {
    const url = `${window.location.origin}/profile/${post.user.username}`;
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ title: `${post.user.username} · GameTrackr`, url });
      } catch {
        /* el usuario cerró el diálogo nativo */
      }
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      setShared(true);
      setTimeout(() => setShared(false), 1800);
    } catch {
      /* portapapeles no disponible */
    }
  }

  return (
    <article className="border-b border-neutral-100 py-5">
      {/* Cabecera */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href={`/profile/${post.user.username}`}>
            <span className="grid h-10 w-10 place-items-center overflow-hidden rounded-full bg-neutral-700 text-sm font-semibold text-white">
              {post.user.avatar_url ? <img src={post.user.avatar_url} alt="" className="h-full w-full object-cover" /> : post.user.username.charAt(0).toUpperCase()}
            </span>
          </Link>
          <div className="text-sm">
            <Link href={`/profile/${post.user.username}`} className="font-semibold hover:underline">{post.user.username}</Link>
            <span className="ml-2 text-xs text-neutral-400">@{post.user.username.toLowerCase()} · {timeAgo(post.created_at)}</span>
          </div>
        </div>
        {isOwn && (
          <button onClick={remove} className="text-neutral-300 transition-colors hover:text-pink-600" aria-label="Eliminar publicación">
            <CloseIcon className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Pill de contexto para 'jugando' */}
      {post.post_type === "update" && game && (
        <div className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-neutral-100 px-3 py-1 text-xs font-medium text-neutral-600">
          <PlayIcon className="h-2.5 w-2.5" /> Está jugando a {game.title}
        </div>
      )}

      {/* Texto */}
      {post.content && <p className="mt-3 leading-relaxed text-neutral-800">{post.content}</p>}

      {/* Lista compartida: la tarjeta hace de banner y lleva a la lista */}
      {list && (
        <div className="mt-3">
          <ListCard list={list} layout="wide" />
        </div>
      )}

      {/* Banner del juego relacionado */}
      {game && (
        // aspect-[3/1]: la misma proporción que el mosaico de ListCard, para que
        // las dos clases de publicación tengan la misma altura en el feed.
        <Link href={`/games/${game.igdb_id}`} className="relative mt-3 flex aspect-[3/1] items-end overflow-hidden rounded-2xl bg-gradient-to-br from-neutral-700 to-neutral-900">
          <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-8xl font-bold text-white/10">{game.title.charAt(0).toUpperCase()}</span>
          {game.cover_url && <Image src={game.cover_url} alt="" fill sizes="(max-width: 768px) 100vw, 600px" className="object-cover opacity-70" />}
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
          {badge && (
            <span className="absolute left-4 top-4 inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-white" style={{ background: badge.color }}>
              <PlayIcon className="h-2.5 w-2.5" /> {badge.label}
            </span>
          )}
          <div className="relative p-4 text-white">
            <p className="text-2xl font-bold">{game.title}</p>
            <p className="flex items-center gap-1 text-xs text-white/70">
              {game.release_date ? `${new Date(game.release_date).getFullYear()} · ` : ""}Ver ficha <ChevronRightIcon className="h-3 w-3" />
            </p>
          </div>
        </Link>
      )}

      {/* Image_url adjunta (si no hay juego) */}
      {!game && post.image_url && (
        <img src={post.image_url} alt="" className="mt-3 max-h-96 w-full rounded-2xl object-cover" />
      )}

      {/* Acciones */}
      <div className="mt-3 flex items-center gap-8">
        {linkComments ? (
          <ActionLink count={post.comments_count} href={`/community/posts/${post.id}`} label="Ver comentarios">
            <CommentIcon className="h-[18px] w-[18px]" />
          </ActionLink>
        ) : (
          <Action count={post.comments_count} label="Comentarios"><CommentIcon className="h-[18px] w-[18px]" /></Action>
        )}
        <Action count={likes} active={liked} onClick={toggleLike} label="Me gusta"><HeartIcon filled={liked} className="h-[18px] w-[18px]" /></Action>
        <Action active={shared} onClick={sharePost} title={shared ? "Enlace copiado" : "Compartir"} label="Compartir">
          {shared ? <CheckIcon className="h-[18px] w-[18px]" /> : <ShareIcon className="h-[18px] w-[18px]" />}
        </Action>
      </div>
    </article>
  );
}
