"use client";

import { useState } from "react";
import { ArrowRightIcon } from "@/components/icons";
import { Modal } from "@/components/ui/Modal";
import api from "@/lib/axios";

interface Props {
  onClose: () => void;
  onLinked: (steamId: string) => void;
}

export function SteamLinkModal({ onClose, onLinked }: Props) {
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!value.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const res = await api.post("/api/steam/link/", { steam_id_or_vanity: value.trim() });
      onLinked(res.data.steam_id);
    } catch (err) {
      const detail =
        typeof err === "object" && err !== null && "response" in err
          ? (err as { response?: { data?: { detail?: string } } }).response?.data?.detail
          : undefined;
      setError(detail ?? "No se pudo vincular la cuenta de Steam.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open onClose={onClose} title="Vincular cuenta de Steam">
      <form onSubmit={handleSubmit} className="space-y-4">
        <input
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Steam ID o URL de tu perfil"
          className="w-full rounded-lg border border-neutral-200 px-3 py-2.5 outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
        />

        <div className="rounded-lg bg-neutral-50 p-3 text-sm text-neutral-500">
          <p className="font-medium text-neutral-700">¿Cómo encontrarlo?</p>
          <ul className="mt-1 list-inside list-disc space-y-1">
            <li>Tu perfil de Steam debe estar en modo <span className="font-medium">público</span>.</li>
            <li>Abre tu perfil en Steam y copia la URL: <code>steamcommunity.com/profiles/&lt;ID&gt;</code> o <code>/id/&lt;nombre&gt;</code>.</li>
            <li>Puedes pegar la URL completa, tu nombre personalizado o el ID de 17 dígitos.</li>
          </ul>
          <a
            href="https://help.steampowered.com/es/faqs/view/2816-BE67-5B69-0FEC"
            target="_blank"
            rel="noreferrer"
            className="mt-2 inline-flex items-center gap-1 font-medium text-accent hover:underline"
          >
            Ayuda: encontrar mi Steam ID <ArrowRightIcon className="h-4 w-4" />
          </a>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-neutral-900 px-5 py-2.5 font-semibold text-white transition-colors hover:bg-neutral-800 disabled:opacity-60"
          >
            {saving ? "Vinculando…" : "Vincular y sincronizar"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
