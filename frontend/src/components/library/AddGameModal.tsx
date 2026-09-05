"use client";

import api from "@/lib/axios";
import { isUnreleased } from "@/lib/library";
import type { Game } from "@/lib/types";

import { GameSearchModal } from "./GameSearchModal";

interface Props {
  onClose: () => void;
  onAdded: () => void;
}

/** Añade juegos a la biblioteca del usuario.
 *
 * Es el mismo buscador que usan las listas (GameSearchModal) con otra acción,
 * en vez de una copia del mismo formulario: así el tick, el poder seguir
 * añadiendo y el estilo se mantienen iguales en toda la aplicación.
 */
export function AddGameModal({ onClose, onAdded }: Props) {
  async function add(game: Game) {
    await api.post("/api/library/", {
      igdb_id: game.igdb_id,
      // Un juego sin salir todavía entra como deseado, no como pendiente.
      status: isUnreleased(game) ? "wishlist" : "backlog",
    });
    onAdded();
  }

  return (
    <GameSearchModal
      title="Añadir juego"
      pickLabel="Añadir a la biblioteca"
      onPick={add}
      onClose={onClose}
    />
  );
}
