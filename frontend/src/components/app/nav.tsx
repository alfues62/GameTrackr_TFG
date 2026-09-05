import type { SVGProps } from "react";
import { CompassIcon, GamepadIcon, LibraryIcon, UsersIcon } from "@/components/icons";

export interface NavItem {
  href: string;
  label: string;
  Icon: (props: SVGProps<SVGSVGElement>) => JSX.Element;
  /** Color de la pestaña, como las etiquetas de un organizador de carpetas. */
  accent: string;
}

// Acento único (naranja de la marca); la activa se ve al frente y las inactivas
// atenuadas por su nivel de profundidad en AppTabs.
export const NAV_ITEMS: NavItem[] = [
  { href: "/home", label: "Mis juegos", Icon: GamepadIcon, accent: "#F97316" },
  { href: "/library", label: "Biblioteca", Icon: LibraryIcon, accent: "#F97316" },
  { href: "/explore", label: "Explorar", Icon: CompassIcon, accent: "#F97316" },
  { href: "/community", label: "Comunidad", Icon: UsersIcon, accent: "#F97316" },
];
