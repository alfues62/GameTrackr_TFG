"use client";

import { useEffect, useRef, useState } from "react";
import { CloseIcon, SteamIcon } from "@/components/icons";
import api from "@/lib/axios";

type SyncStatus = {
  status: "idle" | "running" | "done" | "error";
  done?: number;
  total?: number | null;
  synced?: number;
  new?: number;
  errors?: number;
};

/**
 * Banner de progreso de la importación de Steam. Consulta el estado publicado
 * por el backend cada 2,5s mientras la sincronización corre en segundo plano,
 * muestra la barra "34 de 83", y al terminar refresca la biblioteca y se
 * despide con un resumen.
 */
export function SteamSyncBanner({ onFinished }: { onFinished: () => void }) {
  const [state, setState] = useState<SyncStatus | null>(null);
  const [visible, setVisible] = useState(true);
  const notified = useRef(false);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    let cancelled = false;

    async function poll() {
      try {
        const res = await api.get<SyncStatus>("/api/steam/sync/status/");
        if (cancelled) return;
        setState(res.data);
        if (res.data.status === "running") {
          timer = setTimeout(poll, 2500);
        } else if (res.data.status === "done" && !notified.current) {
          notified.current = true;
          onFinished();
          timer = setTimeout(() => setVisible(false), 6000);
        }
      } catch {
        /* sin sesión o error puntual: no se muestra nada */
      }
    }

    poll();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [onFinished]);

  if (!visible || !state || state.status === "idle") return null;

  if (state.status === "error") {
    return (
      <div className="mt-6 flex items-center gap-3 rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm dark:border-red-900 dark:bg-red-950/40">
        <SteamIcon className="h-5 w-5 shrink-0 text-red-600" />
        <p>
          La importación de Steam falló. Puedes reintentarla desde{" "}
          <span className="font-semibold">Ajustes → Steam → Sincronizar ahora</span>.
        </p>
        <button onClick={() => setVisible(false)} aria-label="Cerrar" className="ml-auto text-neutral-400 hover:text-neutral-600"><CloseIcon className="h-4 w-4" /></button>
      </div>
    );
  }

  if (state.status === "done") {
    return (
      <div className="mt-6 flex items-center gap-3 rounded-2xl border border-green-200 bg-green-50 px-5 py-4 text-sm dark:border-green-900 dark:bg-green-950/40">
        <SteamIcon className="h-5 w-5 shrink-0 text-green-700" />
        <p>
          <span className="font-semibold">Biblioteca de Steam importada:</span>{" "}
          {state.synced ?? 0} juegos ({state.new ?? 0} nuevos)
          {(state.errors ?? 0) > 0 && ` · ${state.errors} sin ficha en IGDB`}.
        </p>
        <button onClick={() => setVisible(false)} aria-label="Cerrar" className="ml-auto text-neutral-400 hover:text-neutral-600"><CloseIcon className="h-4 w-4" /></button>
      </div>
    );
  }

  // running
  const pct = state.total ? Math.round(((state.done ?? 0) / state.total) * 100) : null;
  return (
    <div className="mt-6 rounded-2xl border border-neutral-200 bg-white px-5 py-4 dark:border-neutral-800 dark:bg-neutral-900">
      <div className="flex items-center gap-3">
        <SteamIcon className="h-5 w-5 shrink-0 animate-pulse" />
        <p className="text-sm font-medium">
          Importando tu biblioteca de Steam…
          {state.total ? (
            <span className="ml-1 text-neutral-500">
              {state.done ?? 0} de {state.total}
            </span>
          ) : (
            <span className="ml-1 text-neutral-500">contactando con Steam…</span>
          )}
        </p>
        {pct !== null && <span className="ml-auto text-sm text-neutral-400">{pct}%</span>}
      </div>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-neutral-100 dark:bg-neutral-800">
        {pct !== null ? (
          <div className="h-full rounded-full bg-accent transition-[width] duration-500" style={{ width: `${pct}%` }} />
        ) : (
          <div className="h-full w-1/3 animate-pulse rounded-full bg-accent/60" />
        )}
      </div>
    </div>
  );
}
