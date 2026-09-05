"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ChevronLeftIcon } from "@/components/icons";
import { PostCard } from "@/components/social/PostCard";
import { CommentThread } from "@/components/social/CommentThread";
import api from "@/lib/axios";
import type { Post } from "@/lib/types";

export default function PostDetailPage() {
  const params = useParams<{ postId: string }>();
  const router = useRouter();
  const postId = params?.postId;

  const [post, setPost] = useState<Post | null>(null);
  const [pageStatus, setPageStatus] = useState<"loading" | "ok" | "notfound" | "error">("loading");

  const load = useCallback(async () => {
    if (!postId) return;
    try {
      const res = await api.get<Post>(`/api/posts/${postId}/`);
      setPost(res.data);
      setPageStatus("ok");
    } catch (err) {
      const code =
        typeof err === "object" && err !== null && "response" in err
          ? (err as { response?: { status?: number } }).response?.status
          : undefined;
      setPageStatus(code === 404 ? "notfound" : "error");
    }
  }, [postId]);

  useEffect(() => {
    load();
  }, [load]);

  if (pageStatus === "loading") {
    return (
      <div className="mx-auto max-w-2xl px-4 py-8">
        <div className="h-64 animate-pulse rounded-2xl bg-neutral-200" />
      </div>
    );
  }

  if (pageStatus !== "ok" || !post) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-20 text-center">
        <p className="text-lg font-medium">
          {pageStatus === "notfound" ? "Publicación no encontrada." : "No se pudo cargar la publicación."}
        </p>
        <Link href="/community" className="mt-4 inline-flex items-center gap-1 font-medium text-accent hover:underline">
          <ChevronLeftIcon className="h-4 w-4" /> Volver a comunidad
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <Link href="/community" className="inline-flex items-center gap-1 text-sm font-medium text-accent hover:underline">
        <ChevronLeftIcon className="h-4 w-4" /> Volver a comunidad
      </Link>

      <div className="mt-4">
        <PostCard post={post} linkComments={false} onChanged={() => router.push("/community")} />
      </div>

      <section className="mt-4">
        <h2 className="text-lg font-semibold">Comentarios</h2>
        <div className="mt-3">
          <CommentThread
            endpoint={`/api/posts/${post.id}/comments/`}
            initialCount={post.comments_count}
            collapsible={false}
            emptyLabel="Sé el primero en comentar esta publicación."
          />
        </div>
      </section>
    </div>
  );
}
