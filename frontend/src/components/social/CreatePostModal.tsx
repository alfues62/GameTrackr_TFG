"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { SearchIcon } from "@/components/icons";
import { ImageDropzone } from "@/components/ui/ImageDropzone";
import { Modal } from "@/components/ui/Modal";
import api from "@/lib/axios";
import type { Game, PostType } from "@/lib/types";

const TYPES: { value: PostType; label: string }[] = [
  { value: "general", label: "General" },
  { value: "update", label: "Jugando" },
  { value: "review", label: "Reseña" },
];

export function CreatePostModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [content, setContent] = useState("");
  const [postType, setPostType] = useState<PostType>("general");
  const [imageUrl, setImageUrl] = useState("");
  const [game, setGame] = useState<Game | null>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Game[]>([]);
  const [saving, setSaving] = useState(false);

  // Búsqueda en vivo con debounce del juego a adjuntar.
  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      const res = await api.get<Game[]>("/api/games/search/", { params: { q, limit: 6 } }).catch(() => ({ data: [] as Game[] }));
      setResults(res.data);
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!content.trim()) return;
    setSaving(true);
    try {
      await api.post("/api/posts/", {
        content: content.trim(),
        post_type: postType,
        related_game_id: game?.id ?? null,
        image_url: imageUrl.trim() || null,
      });
      onCreated();
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open onClose={onClose} title="Nueva publicación">
      <form onSubmit={submit} className="space-y-4">
        <textarea autoFocus value={content} onChange={(e) => setContent(e.target.value)} rows={3} placeholder="¿Qué estás jugando?"
          className="w-full resize-none rounded-lg border border-neutral-200 p-3 outline-none focus:border-accent focus:ring-2 focus:ring-accent/20" />

        <div className="flex gap-2">
          {TYPES.map((t) => (
            <button type="button" key={t.value} onClick={() => setPostType(t.value)}
              className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ${postType === t.value ? "border-accent bg-accent/10 text-accent-700" : "border-neutral-200"}`}>
              {t.label}
            </button>
          ))}
        </div>

        {/* Juego relacionado */}
        {game ? (
          <div className="flex items-center justify-between rounded-lg border border-neutral-200 p-2">
            <div className="flex items-center gap-2">
              <div className="relative h-10 w-8 overflow-hidden rounded bg-neutral-200">
                {game.cover_url && <Image src={game.cover_url} alt="" fill sizes="32px" className="object-cover" />}
              </div>
              <span className="text-sm font-medium">{game.title}</span>
            </div>
            <button type="button" onClick={() => setGame(null)} className="text-sm text-neutral-400 hover:text-pink-600">Quitar</button>
          </div>
        ) : (
          <div>
            <div className="relative">
              <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
              <input value={query} onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") e.preventDefault(); }}
                placeholder="Adjunta un juego (opcional)…"
                className="w-full rounded-lg border border-neutral-200 py-2 pl-9 pr-3 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/20" />
            </div>
            {results.length > 0 && (
              <div className="mt-2 max-h-40 space-y-1 overflow-y-auto">
                {results.map((r) => (
                  <button type="button" key={r.igdb_id} onClick={() => { setGame(r); setResults([]); setQuery(""); }}
                    className="flex w-full items-center gap-2 rounded-lg p-1.5 text-left text-sm hover:bg-neutral-50">
                    <div className="relative h-9 w-7 overflow-hidden rounded bg-neutral-200">
                      {r.cover_url && <Image src={r.cover_url} alt="" fill sizes="28px" className="object-cover" />}
                    </div>
                    <span className="truncate">{r.title}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <ImageDropzone value={imageUrl || null} onChange={(u) => setImageUrl(u ?? "")} shape="wide" label="Imagen (opcional)" />

        <div className="flex justify-end">
          <button type="submit" disabled={saving || !content.trim()}
            className="rounded-full bg-accent px-6 py-2.5 font-semibold text-white transition-colors hover:bg-accent-600 disabled:opacity-60">
            {saving ? "Publicando…" : "Publicar"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
