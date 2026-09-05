"use client";

import { useState } from "react";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import { Modal } from "@/components/ui/Modal";
import { Select } from "@/components/ui/Select";
import { isUnreleased, STATUS_META, STATUS_ORDER } from "@/lib/library";
import api from "@/lib/axios";
import type { LibraryStatus, UserGame } from "@/lib/types";

interface Props {
  userGame: UserGame;
  onClose: () => void;
  onChanged: () => void;
}

export function GameProgressModal({ userGame, onClose, onChanged }: Props) {
  const confirm = useConfirm();
  const [status, setStatus] = useState<LibraryStatus>(userGame.status);
  const [hours, setHours] = useState(String(userGame.hours_played ?? 0));
  const [completion, setCompletion] = useState(String(userGame.completion_percentage ?? 0));
  const [rating, setRating] = useState(userGame.user_rating != null ? String(userGame.user_rating) : "");
  const [review, setReview] = useState(userGame.review ?? "");
  const [platform, setPlatform] = useState(userGame.platform ?? "");
  const [saving, setSaving] = useState(false);

  const gamePlatforms = userGame.game.platforms ?? [];
  const unreleased = isUnreleased(userGame.game);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api.patch(`/api/library/${userGame.id}/`, {
        status,
        hours_played: parseFloat(hours) || 0,
        completion_percentage: parseFloat(completion) || 0,
        user_rating: rating === "" ? null : parseFloat(rating),
        review: review.trim() || null,
        platform,
      });
      onChanged();
      onClose();
    } finally {
      setSaving(false);
    }
  }

  async function handleRemove() {
    const ok = await confirm({
      title: "¿Quitar este juego de tu biblioteca?",
      message: "Se perderán las horas, la nota y la reseña que tengas guardadas.",
      confirmLabel: "Quitar",
      tone: "danger",
    });
    if (!ok) return;
    setSaving(true);
    try {
      await api.delete(`/api/library/${userGame.id}/`);
      onChanged();
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={userGame.game.title}>
      <form onSubmit={handleSave} className="space-y-4">
        <div>
          <label className="mb-2 block text-xs uppercase tracking-wider text-neutral-400">Estado</label>
          <div className="grid grid-cols-2 gap-2">
            {STATUS_ORDER.map((s) => {
              const disabled = unreleased && s !== "wishlist";
              return (
                <button
                  type="button"
                  key={s}
                  disabled={disabled}
                  onClick={() => setStatus(s)}
                  title={disabled ? "Este juego aún no ha salido: solo puedes ponerlo en la wishlist" : undefined}
                  className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                    status === s
                      ? "border-accent bg-accent/10 text-accent-700"
                      : disabled
                        ? "cursor-not-allowed border-neutral-100 text-neutral-300"
                        : "border-neutral-200 hover:border-neutral-300"
                  }`}
                >
                  {STATUS_META[s].label}
                </button>
              );
            })}
          </div>
          {unreleased && (
            <p className="mt-2 text-xs text-neutral-400">Este juego aún no ha salido: solo puede estar en la wishlist.</p>
          )}
        </div>

        <div>
          <span className="mb-2 block text-xs uppercase tracking-wider text-neutral-400">Plataforma</span>
          {gamePlatforms.length > 0 ? (
            <Select
              value={platform}
              onChange={setPlatform}
              ariaLabel="Plataforma"
              options={[
                { value: "", label: "Sin especificar" },
                ...gamePlatforms.map((p) => ({ value: p, label: p })),
                ...(platform && !gamePlatforms.includes(platform) ? [{ value: platform, label: platform }] : []),
              ]}
            />
          ) : (
            <input value={platform} onChange={(e) => setPlatform(e.target.value)} placeholder="PC, PS5…"
              className="w-full rounded-lg border border-neutral-200 px-3 py-2 outline-none focus:border-accent focus:ring-2 focus:ring-accent/20" />
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="mb-2 block text-xs uppercase tracking-wider text-neutral-400">Horas</span>
            <input type="number" min="0" step="0.1" value={hours} onChange={(e) => setHours(e.target.value)}
              className="w-full rounded-lg border border-neutral-200 px-3 py-2 outline-none focus:border-accent focus:ring-2 focus:ring-accent/20" />
          </label>
          <label className="block">
            <span className="mb-2 block text-xs uppercase tracking-wider text-neutral-400">Completado %</span>
            <input type="number" min="0" max="100" value={completion} onChange={(e) => setCompletion(e.target.value)}
              className="w-full rounded-lg border border-neutral-200 px-3 py-2 outline-none focus:border-accent focus:ring-2 focus:ring-accent/20" />
          </label>
        </div>

        <label className="block">
          <span className="mb-2 block text-xs uppercase tracking-wider text-neutral-400">Tu nota (0–10)</span>
          <input type="number" min="0" max="10" step="0.5" value={rating} onChange={(e) => setRating(e.target.value)} placeholder="Sin valorar"
            className="w-full rounded-lg border border-neutral-200 px-3 py-2 outline-none focus:border-accent focus:ring-2 focus:ring-accent/20" />
        </label>

        <label className="block">
          <span className="mb-2 block text-xs uppercase tracking-wider text-neutral-400">Reseña</span>
          <textarea rows={3} value={review} onChange={(e) => setReview(e.target.value)} placeholder="Opcional…"
            className="w-full resize-none rounded-lg border border-neutral-200 px-3 py-2 outline-none focus:border-accent focus:ring-2 focus:ring-accent/20" />
        </label>

        <div className="flex items-center justify-between pt-2">
          <button type="button" onClick={handleRemove} disabled={saving}
            className="text-sm font-medium text-pink-600 hover:underline disabled:opacity-50">
            Quitar de biblioteca
          </button>
          <button type="submit" disabled={saving}
            className="rounded-lg bg-accent px-5 py-2 font-semibold text-white transition-colors hover:bg-accent-600 disabled:opacity-60">
            {saving ? "Guardando…" : "Guardar"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
