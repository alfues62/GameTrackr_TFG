import { redirect } from "next/navigation";

// Ruta antigua: "Mis juegos" vive ahora en /home.
export default function MyGamesPage() {
  redirect("/home");
}
