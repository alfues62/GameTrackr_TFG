"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import api from "@/lib/axios";

interface Props {
  onClose: () => void;
  onLinked: (onlineId: string) => void;
}

export function PsnLinkModal({ onClose, onLinked }: Props) {
  const [npsso, setNpsso] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!npsso.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const res = await api.post("/api/psn/link/", { npsso: npsso.trim() });
      onLinked(res.data.psn_online_id);
    } catch (err) {
      const detail =
        typeof err === "object" && err !== null && "response" in err
          ? (err as { response?: { data?: { detail?: string } } }).response?.data?.detail
          : undefined;
      setError(detail ?? "No se pudo vincular la cuenta de PSN.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open onClose={onClose} title="Vincular cuenta de PlayStation">
      <form onSubmit={handleSubmit} className="space-y-4">
        <input
          autoFocus
          value={npsso}
          onChange={(e) => setNpsso(e.target.value)}
          placeholder="Pega aquí tu token NPSSO (64 caracteres)"
          className="w-full rounded-lg border border-neutral-200 px-3 py-2.5 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
        />

        <div className="rounded-lg bg-neutral-50 p-3 text-sm text-neutral-500">
          <p className="font-medium text-neutral-700">¿Cómo obtener el token?</p>
          <ol className="mt-1 list-inside list-decimal space-y-1">
            <li>
              Inicia sesión en{" "}
              <a href="https://www.playstation.com/" target="_blank" rel="noreferrer" className="font-medium text-accent hover:underline">
                playstation.com
              </a>{" "}
              con tu cuenta.
            </li>
            <li>
              En la misma ventana, abre{" "}
              <a
                href="https://ca.account.sony.com/api/v1/ssocookie"
                target="_blank"
                rel="noreferrer"
                className="font-medium text-accent hover:underline"
              >
                ca.account.sony.com/api/v1/ssocookie
              </a>
              .
            </li>
            <li>Copia el valor de <code>npsso</code> (64 caracteres) y pégalo arriba.</li>
          </ol>
          <p className="mt-2 text-xs text-neutral-400">
            El token caduca cada ~2 meses; si la sincronización falla, repite estos pasos.
            Sony no ofrece un inicio de sesión oficial para apps de terceros.
          </p>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-neutral-900 px-5 py-2.5 font-semibold text-white transition-colors hover:bg-neutral-800 disabled:opacity-60"
          >
            {saving ? "Vinculando…" : "Vincular cuenta"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
