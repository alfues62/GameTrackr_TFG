"use client";

import { useState } from "react";
import { ChevronRightIcon, PlusIcon } from "@/components/icons";
import { ImageDropzone } from "@/components/ui/ImageDropzone";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import { Modal } from "@/components/ui/Modal";
import { Select } from "@/components/ui/Select";
import api from "@/lib/axios";
import type { GameList } from "@/lib/types";

interface Props {
  list: GameList | null; // null = crear
  onClose: () => void;
  onChanged: () => void;
  /** Se llama en lugar de onChanged al eliminar. Quien esté mostrando la lista
   *  que acaba de borrarse necesita navegar, no recargarla y toparse con un 404. */
  onDeleted?: () => void;
}

const fieldCls =
  "w-full rounded-lg border border-neutral-200 px-3 py-2.5 outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20 dark:border-neutral-700 dark:bg-neutral-800";

export function ListModal({ list, onClose, onChanged, onDeleted }: Props) {
  const confirm = useConfirm();
  const isEdit = list !== null;
  const [name, setName] = useState(list?.name ?? "");
  const [description, setDescription] = useState(list?.description ?? "");
  const [coverUrl, setCoverUrl] = useState(list?.cover_url ?? "");
  const [isPublic, setIsPublic] = useState(list?.is_public ?? true);
  const [showCover, setShowCover] = useState(!!list?.cover_url);
  const [saving, setSaving] = useState(false);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    const payload = {
      name: name.trim(),
      description: description.trim() || null,
      cover_url: coverUrl.trim() || null,
      is_public: isPublic,
    };
    try {
      if (isEdit) {
        await api.patch(`/api/lists/${list.id}/`, payload);
      } else {
        await api.post("/api/lists/", payload);
      }
      onChanged();
      onClose();
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!list) return;
    const ok = await confirm({
      title: `¿Eliminar "${list.name}"?`,
      message: "La lista y sus comentarios desaparecerán. Tus juegos no se tocan.",
      confirmLabel: "Eliminar",
      tone: "danger",
    });
    if (!ok) return;
    setSaving(true);
    try {
      await api.delete(`/api/lists/${list.id}/`);
      (onDeleted ?? onChanged)();
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={isEdit ? "Editar lista" : "Nueva lista"}>
      <form onSubmit={handleSave} className="space-y-4">
        {/* Título */}
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          placeholder="Elige un título"
          className={fieldCls}
        />

        {/* Descripción (opcional) */}
        <textarea
          rows={2}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Descripción (opcional)"
          className={`${fieldCls} resize-none text-sm`}
        />

        {/* Visibilidad */}
        <div>
          <span className="mb-1.5 block text-xs text-neutral-400">Visibilidad</span>
          <Select
            value={isPublic ? "public" : "private"}
            onChange={(v) => setIsPublic(v === "public")}
            ariaLabel="Visibilidad"
            options={[
              { value: "public", label: "Pública" },
              { value: "private", label: "Privada" },
            ]}
          />
        </div>

        {/* Portada: sección desplegable para no ocupar espacio si no se usa */}
        <div>
          <button
            type="button"
            onClick={() => setShowCover((v) => !v)}
            className="flex w-full items-center justify-between rounded-lg text-left text-sm font-medium text-neutral-600 hover:text-neutral-900"
          >
            <span className="flex items-center gap-1.5">
              {!showCover && !coverUrl && <PlusIcon className="h-4 w-4 text-accent" />}
              {coverUrl ? "Portada · añadida" : "Añadir una portada"}
            </span>
            <ChevronRightIcon className={`h-4 w-4 text-neutral-400 transition-transform ${showCover ? "-rotate-90" : "rotate-90"}`} />
          </button>
          {showCover && (
            <div className="mt-2">
              <ImageDropzone value={coverUrl || null} onChange={(u) => setCoverUrl(u ?? "")} shape="wide" />
            </div>
          )}
        </div>

        {/* Acciones */}
        <div className="flex items-center justify-between pt-2">
          {isEdit ? (
            <button
              type="button"
              onClick={handleDelete}
              disabled={saving}
              className="text-sm font-medium text-pink-600 hover:underline disabled:opacity-50"
            >
              Eliminar lista
            </button>
          ) : (
            <span />
          )}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-full px-5 py-2 text-sm font-semibold text-neutral-600 transition-colors hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving || !name.trim()}
              className="rounded-full bg-accent px-6 py-2 text-sm font-semibold text-white transition-colors hover:bg-accent-600 disabled:opacity-50"
            >
              {saving ? "Guardando…" : isEdit ? "Guardar" : "Crear"}
            </button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
