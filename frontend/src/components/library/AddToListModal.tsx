"use client";

import { useEffect, useState } from "react";
import { CheckIcon, PlusIcon } from "@/components/icons";
import { Modal } from "@/components/ui/Modal";
import { useAuth } from "@/hooks/useAuth";
import api, { asList } from "@/lib/axios";
import type { GameList } from "@/lib/types";

interface Props {
  igdbId: number;
  onClose: () => void;
}

export function AddToListModal({ igdbId, onClose }: Props) {
  const { user } = useAuth();
  const [lists, setLists] = useState<GameList[]>([]);
  const [added, setAdded] = useState<number[]>([]);
  const [busy, setBusy] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get<GameList[] | { results: GameList[] }>("/api/lists/")
      .then((r) => {
        const own = asList<GameList>(r.data).filter((l) => String(l.user?.id ?? "") === String(user?.id ?? ""));
        setLists(own);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [user?.id]);

  async function addTo(list: GameList) {
    setBusy(list.id);
    try {
      await api.post(`/api/lists/${list.id}/games/`, { igdb_id: igdbId });
      setAdded((a) => [...a, list.id]);
    } finally {
      setBusy(null);
    }
  }

  return (
    <Modal open onClose={onClose} title="Añadir a una lista">
      {loading ? (
        <p className="text-sm text-neutral-400">Cargando…</p>
      ) : lists.length === 0 ? (
        <p className="text-sm text-neutral-500">
          Aún no tienes listas. Créalas desde la sección <span className="font-medium">Biblioteca</span>.
        </p>
      ) : (
        <div className="space-y-2">
          {lists.map((list) => {
            const done = added.includes(list.id);
            return (
              <div key={list.id} className="flex items-center justify-between rounded-lg border border-neutral-100 px-3 py-2">
                <div>
                  <p className="text-sm font-medium">{list.name}</p>
                  <p className="text-xs text-neutral-400">
                    {list.games.length} juegos · {list.is_public ? "Pública" : "Privada"}
                  </p>
                </div>
                <button
                  onClick={() => addTo(list)}
                  disabled={busy === list.id || done}
                  className={`inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors ${
                    done ? "bg-green-100 text-green-700" : "bg-accent text-white hover:bg-accent-600"
                  } disabled:opacity-70`}
                >
                  {done ? <><CheckIcon className="h-4 w-4" /> Añadido</> : busy === list.id ? "…" : <><PlusIcon className="h-4 w-4" /> Añadir</>}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </Modal>
  );
}
