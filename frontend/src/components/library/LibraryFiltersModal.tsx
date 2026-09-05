"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import type { UserGame } from "@/lib/types";

export interface LibraryFilters {
  text: string;
  genres: string[];
  platforms: string[];
  yearFrom: string;
  yearTo: string;
  /** Solo juegos sin una sola hora registrada: el backlog de verdad. */
  onlyUnplayed: boolean;
}

export const EMPTY_FILTERS: LibraryFilters = {
  text: "",
  genres: [],
  platforms: [],
  yearFrom: "",
  yearTo: "",
  onlyUnplayed: false,
};

/** Cuántos criterios hay puestos, para el contador del botón. */
export function countActiveFilters(f: LibraryFilters): number {
  return (
    (f.text.trim() ? 1 : 0) +
    f.genres.length +
    f.platforms.length +
    (f.yearFrom ? 1 : 0) +
    (f.yearTo ? 1 : 0) +
    (f.onlyUnplayed ? 1 : 0)
  );
}

/** Géneros y plataformas que existen de verdad en la biblioteca del usuario. */
export function filterOptions(library: UserGame[]) {
  const genres = new Set<string>();
  const platforms = new Set<string>();
  for (const ug of library) {
    for (const g of ug.game.genres ?? []) genres.add(g);
    const p = ug.platform || ug.game.platforms?.[0];
    if (p) platforms.add(p);
  }
  // Array.from y no spread: el target de TS del proyecto no itera Sets.
  return {
    genres: Array.from(genres).sort((a, b) => a.localeCompare(b)),
    platforms: Array.from(platforms).sort((a, b) => a.localeCompare(b)),
  };
}

function Chip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${
        active
          ? "border-accent bg-accent text-white"
          : "border-neutral-200 bg-white text-neutral-600 hover:border-accent hover:text-accent"
      }`}
    >
      {label}
    </button>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-2 text-xs uppercase tracking-wider text-neutral-400">{title}</p>
      {children}
    </div>
  );
}

const fieldCls =
  "w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20";

/**
 * Filtros de la biblioteca. Trabaja sobre un borrador y solo lo devuelve al
 * aplicar, para que trastear con las opciones no reordene la lista de detrás a
 * cada clic.
 */
export function LibraryFiltersModal({
  value,
  options,
  onApply,
  onClose,
}: {
  value: LibraryFilters;
  options: ReturnType<typeof filterOptions>;
  onApply: (filters: LibraryFilters) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<LibraryFilters>(value);

  function toggle(key: "genres" | "platforms", item: string) {
    setDraft((d) => ({
      ...d,
      [key]: d[key].includes(item) ? d[key].filter((x) => x !== item) : [...d[key], item],
    }));
  }

  return (
    <Modal open onClose={onClose} title="Filtrar biblioteca">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onApply(draft);
          onClose();
        }}
        className="space-y-5"
      >
        <Section title="Título">
          <input
            autoFocus
            value={draft.text}
            onChange={(e) => setDraft({ ...draft, text: e.target.value })}
            placeholder="Busca por nombre…"
            className={fieldCls}
          />
        </Section>

        {options.genres.length > 0 && (
          <Section title="Género">
            <div className="flex flex-wrap gap-2">
              {options.genres.map((g) => (
                <Chip key={g} label={g} active={draft.genres.includes(g)} onClick={() => toggle("genres", g)} />
              ))}
            </div>
          </Section>
        )}

        {options.platforms.length > 0 && (
          <Section title="Plataforma">
            <div className="flex flex-wrap gap-2">
              {options.platforms.map((p) => (
                <Chip key={p} label={p} active={draft.platforms.includes(p)} onClick={() => toggle("platforms", p)} />
              ))}
            </div>
          </Section>
        )}

        <Section title="Año de salida">
          <div className="flex items-center gap-2">
            <input
              type="number"
              inputMode="numeric"
              placeholder="Desde"
              value={draft.yearFrom}
              onChange={(e) => setDraft({ ...draft, yearFrom: e.target.value })}
              className={fieldCls}
            />
            <span className="text-neutral-400">–</span>
            <input
              type="number"
              inputMode="numeric"
              placeholder="Hasta"
              value={draft.yearTo}
              onChange={(e) => setDraft({ ...draft, yearTo: e.target.value })}
              className={fieldCls}
            />
          </div>
        </Section>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={draft.onlyUnplayed}
            onChange={(e) => setDraft({ ...draft, onlyUnplayed: e.target.checked })}
            className="h-4 w-4 accent-accent"
          />
          Solo los que no he empezado
        </label>

        <div className="flex items-center justify-between pt-2">
          <button
            type="button"
            onClick={() => setDraft(EMPTY_FILTERS)}
            className="text-sm font-medium text-neutral-500 hover:underline"
          >
            Limpiar filtros
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-full px-5 py-2 text-sm font-semibold text-neutral-600 transition-colors hover:bg-neutral-100"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="rounded-full bg-accent px-6 py-2 text-sm font-semibold text-white transition-colors hover:bg-accent-600"
            >
              Aplicar
            </button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
