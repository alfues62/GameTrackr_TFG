"use client";

import { useEffect, useState } from "react";
import { ChevronRightIcon, CommentIcon } from "@/components/icons";
import api from "@/lib/axios";
import { timeAgo } from "@/lib/time";
import type { Comment } from "@/lib/types";

function Avatar({ user, size = "h-7 w-7" }: { user: Comment["user"]; size?: string }) {
  return (
    <span className={`${size} grid shrink-0 place-items-center overflow-hidden rounded-full bg-neutral-700 text-[11px] font-semibold text-white`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {user.avatar_url ? <img src={user.avatar_url} alt="" className="h-full w-full object-cover" /> : user.username.charAt(0).toUpperCase()}
    </span>
  );
}

function CommentForm({
  onSubmit,
  placeholder = "Escribe un comentario…",
  autoFocus = false,
  compact = false,
}: {
  onSubmit: (content: string) => Promise<void>;
  placeholder?: string;
  autoFocus?: boolean;
  compact?: boolean;
}) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim() || busy) return;
    setBusy(true);
    try {
      await onSubmit(text.trim());
      setText("");
    } finally {
      setBusy(false);
    }
  }

  const hasText = text.trim().length > 0;

  return (
    <form onSubmit={submit} className="flex items-end gap-2">
      <input
        autoFocus={autoFocus}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={placeholder}
        className={`flex-1 border-x-0 border-t-0 border-b border-neutral-200 bg-transparent px-0 outline-none transition-colors focus:border-accent ${compact ? "py-1 text-xs" : "py-1.5 text-sm"}`}
      />
      {/* El btn solo existe en el DOM al escribir algo entra con una anim */}
      {hasText && (
        <button
          type="submit"
          disabled={busy}
          className={`ml-2 shrink-0 animate-fade-in whitespace-nowrap rounded-full bg-accent font-semibold text-white transition-colors hover:bg-accent-600 disabled:cursor-default disabled:opacity-60 ${compact ? "px-2.5 py-1 text-xs" : "px-3 py-1.5 text-sm"}`}
        >
          Enviar
        </button>
      )}
    </form>
  );
}

function ReplyRow({ reply }: { reply: Comment }) {
  return (
    <div className="flex gap-2">
      <Avatar user={reply.user} size="h-6 w-6" />
      <div className="min-w-0">
        <p className="text-xs">
          <span className="font-medium text-neutral-700">{reply.user.username}</span>{" "}
          <span className="text-neutral-400">{timeAgo(reply.created_at)}</span>
        </p>
        <p className="mt-0.5 text-xs leading-relaxed text-neutral-600">{reply.content}</p>
      </div>
    </div>
  );
}

function CommentItem({
  comment,
  endpoint,
  onReplyPosted,
}: {
  comment: Comment;
  endpoint: string;
  onReplyPosted: () => void;
}) {
  const [repliesCount, setRepliesCount] = useState(comment.replies_count);
  const [showReplies, setShowReplies] = useState(false);
  const [repliesLoaded, setRepliesLoaded] = useState(false);
  const [replies, setReplies] = useState<Comment[]>([]);
  const [showReplyForm, setShowReplyForm] = useState(false);

  async function toggleReplies() {
    const next = !showReplies;
    setShowReplies(next);
    if (next && !repliesLoaded) {
      const res = await api
        .get<Comment[]>(endpoint, { params: { parent: comment.id } })
        .catch(() => ({ data: [] as Comment[] }));
      setReplies(res.data);
      setRepliesLoaded(true);
    }
  }

  async function postReply(content: string) {
    const res = await api.post<Comment>(endpoint, { content, parent: comment.id });
    setReplies((r) => [...r, res.data]);
    setRepliesCount((n) => n + 1);
    setShowReplies(true);
    setRepliesLoaded(true);
    setShowReplyForm(false);
    onReplyPosted();
  }

  return (
    <div className="flex gap-2.5">
      <Avatar user={comment.user} />
      <div className="min-w-0 flex-1">
        <p className="text-sm">
          <span className="font-medium text-neutral-800">{comment.user.username}</span>{" "}
          <span className="text-xs text-neutral-400">{timeAgo(comment.created_at)}</span>
        </p>
        <p className="mt-0.5 text-sm leading-relaxed text-neutral-600">{comment.content}</p>

        <div className="mt-1 flex items-center gap-3">
          <button
            onClick={() => setShowReplyForm((v) => !v)}
            className="text-xs font-medium text-neutral-400 transition-colors hover:text-neutral-700"
          >
            Responder
          </button>
        </div>

        {showReplyForm && (
          <div className="mt-2">
            <CommentForm onSubmit={postReply} placeholder="Responder…" autoFocus compact />
          </div>
        )}

        {repliesCount > 0 && (
          <button
            onClick={toggleReplies}
            className="mt-2 flex items-center gap-1 text-xs font-medium text-neutral-500 transition-colors hover:text-neutral-800"
          >
            <ChevronRightIcon className={`h-3 w-3 transition-transform ${showReplies ? "rotate-90" : ""}`} />
            {repliesCount} respuesta{repliesCount === 1 ? "" : "s"}
          </button>
        )}

        {showReplies && (
          <div className="mt-3 space-y-3 border-l border-neutral-100 pl-3">
            {replies.map((r) => (
              <ReplyRow key={r.id} reply={r} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function CommentThread({
  endpoint,
  initialCount = 0,
  collapsible = true,
  emptyLabel = "Sé el primero en comentar.",
}: {
  endpoint: string;
  initialCount?: number;
  collapsible?: boolean;
  emptyLabel?: string;
}) {
  const [open, setOpen] = useState(!collapsible);
  const [loaded, setLoaded] = useState(false);
  const [comments, setComments] = useState<Comment[]>([]);
  const [count, setCount] = useState(initialCount);

  async function load() {
    const res = await api.get<Comment[]>(endpoint).catch(() => ({ data: [] as Comment[] }));
    setComments(res.data);
    setLoaded(true);
  }

  useEffect(() => {
    if (!collapsible) load();
  }, [endpoint]);

  async function toggle() {
    const next = !open;
    setOpen(next);
    if (next && !loaded) await load();
  }

  async function postComment(content: string) {
    const res = await api.post<Comment>(endpoint, { content });
    setComments((c) => [...c, res.data]);
    setCount((n) => n + 1);
  }

  return (
    <div>
      {collapsible && (
        <button
          onClick={toggle}
          className="flex items-center gap-1.5 text-sm text-neutral-400 transition-colors hover:text-neutral-700"
        >
          <CommentIcon className="h-4 w-4" />
          {count > 0 ? `${count} comentario${count === 1 ? "" : "s"}` : "Comentar"}
        </button>
      )}

      {open && (
        <div className={collapsible ? "mt-3 space-y-4 border-t border-neutral-100 pt-3" : "space-y-4"}>
          <CommentForm onSubmit={postComment} />
          {loaded && comments.length === 0 && <p className="text-sm text-neutral-400">{emptyLabel}</p>}
          {comments.map((c) => (
            <CommentItem key={c.id} comment={c} endpoint={endpoint} onReplyPosted={() => setCount((n) => n + 1)} />
          ))}
        </div>
      )}
    </div>
  );
}
