"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import api from "@/lib/axios";

/**
 * Publica una lista en el feed de la comunidad, dejando al autor acompañarla de
 * un texto propio. Si lo deja en blanco, el backend pone uno por defecto.
 */
export function ShareListModal({
  list,
  onClose,
  onShared,
}: {
  list: { id: number; name: string };
  onClose: () => void;
  onShared: (mensaje: string) => void;
}) {
  const [content, setContent] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSending(true);
    setError(null);
    try {
      await api.post(`/api/lists/${list.id}/share/`, { content: content.trim() });
      onShared("Publicada en el feed de la comunidad.");
      onClose();
    } catch (err) {
      const detail =
        typeof err === "object" && err !== null && "response" in err
          ? (err as { response?: { data?: { detail?: string } } }).response?.data?.detail
          : undefined;
      // El error se queda dentro del diálogo: cerrarlo perdería lo escrito.
      setError(detail ?? "No se pudo publicar la lista.");
    } finally {
      setSending(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={`Publicar «${list.name}»`}>
      <form onSubmit={submit} className="space-y-4">
        <textarea
          autoFocus
          rows={3}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Cuenta algo sobre tu lista (opcional)…"
          className="w-full resize-none rounded-lg border border-neutral-200 px-3 py-2.5 text-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
        />
        <p className="text-sm text-neutral-500">
          Aparecerá en el feed de la comunidad y cualquiera podrá verla y comentarla.
        </p>
        {error && <p className="text-sm text-pink-600">{error}</p>}
        <div className="flex items-center justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="rounded-full px-5 py-2 text-sm font-semibold text-neutral-600 transition-colors hover:bg-neutral-100"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={sending}
            className="rounded-full bg-accent px-6 py-2 text-sm font-semibold text-white transition-colors hover:bg-accent-600 disabled:opacity-50"
          >
            {sending ? "Publicando…" : "Publicar"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
