"use client";

import { createContext, useCallback, useContext, useRef, useState } from "react";
import type { ReactNode } from "react";

export interface ConfirmOptions {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "default" | "danger";
}

type Ask = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<Ask | null>(null);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const resolver = useRef<((ok: boolean) => void) | null>(null);

  const ask = useCallback<Ask>((opts) => {
    setOptions(opts);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  const close = useCallback((ok: boolean) => {
    resolver.current?.(ok);
    resolver.current = null;
    setOptions(null);
  }, []);

  return (
    <ConfirmContext.Provider value={ask}>
      {children}
      {options && <ConfirmDialog options={options} onClose={close} />}
    </ConfirmContext.Provider>
  );
}

function ConfirmDialog({
  options,
  onClose,
}: {
  options: ConfirmOptions;
  onClose: (ok: boolean) => void;
}) {
  const danger = options.tone === "danger";
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={() => onClose(false)} />
      <div
        role="alertdialog"
        aria-modal="true"
        aria-label={options.title}
        className="relative w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl"
      >
        <h2 className="text-lg font-bold">{options.title}</h2>
        {options.message && <p className="mt-2 text-sm text-neutral-500">{options.message}</p>}
        <div className="mt-6 flex items-center justify-end gap-2">
          <button
            onClick={() => onClose(false)}
            className="rounded-full px-5 py-2 text-sm font-semibold text-neutral-600 transition-colors hover:bg-neutral-100"
          >
            {options.cancelLabel ?? "Cancelar"}
          </button>
          <button
            autoFocus
            onClick={() => onClose(true)}
            className={`rounded-full px-6 py-2 text-sm font-semibold text-white transition-colors ${
              danger ? "bg-pink-600 hover:bg-pink-700" : "bg-accent hover:bg-accent-600"
            }`}
          >
            {options.confirmLabel ?? "Aceptar"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function useConfirm(): Ask {
  const ask = useContext(ConfirmContext);
  if (!ask) throw new Error("useConfirm necesita estar dentro de <ConfirmProvider>");
  return ask;
}
