"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useCallback, useEffect, useState } from "react";
import { AuthShell } from "@/components/auth/AuthShell";
import { SteamIcon } from "@/components/icons";
import api from "@/lib/axios";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
// Marca de intención: puesta al pulsar «Ya tengo cuenta», leída al volver del
// login para completar la vinculación sin pedir otro clic.
const AUTO_LINK_KEY = "steam_link_auto";

/**
 * Pantalla intermedia del primer login con un Steam sin vincular.
 *
 * Steam no comparte el email de la cuenta, así que el backend no puede saber
 * si este Steam pertenece a un usuario existente. El pipeline se pausa y aquí
 * el usuario decide: vincularlo a su cuenta (si elige «ya tengo cuenta», tras
 * identificarse la vinculación y la importación de su biblioteca se completan
 * solas) o crear una cuenta nueva reanudando el pipeline.
 */
export default function SteamLinkPage() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const [token, setToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setToken(new URLSearchParams(window.location.search).get("partial_token"));
  }, []);

  const username =
    (session?.user as { username?: string; name?: string } | undefined)?.username ??
    session?.user?.name ??
    null;

  const linkToMyAccount = useCallback(async () => {
    if (!token) return;
    setBusy(true);
    setError(null);
    try {
      await api.post("/api/steam/claim-partial/", { partial_token: token });
      router.push("/library");
    } catch (err) {
      const detail = (err as { response?: { data?: { detail?: string } } }).response?.data?.detail;
      setError(detail ?? "No se pudo completar la vinculación.");
      setBusy(false);
    }
  }, [token, router]);

  // Al volver del login con la marca de intención puesta, vincular sin más clics.
  useEffect(() => {
    if (!token || status !== "authenticated") return;
    if (sessionStorage.getItem(AUTO_LINK_KEY) !== token) return;
    sessionStorage.removeItem(AUTO_LINK_KEY);
    linkToMyAccount();
  }, [token, status, linkToMyAccount]);

  function goToLogin() {
    if (!token) return;
    sessionStorage.setItem(AUTO_LINK_KEY, token);
    const currentUrl = `/auth/steam-link?partial_token=${encodeURIComponent(token)}`;
    router.push(`/login?next=${encodeURIComponent(currentUrl)}`);
  }

  function createNewAccount() {
    if (!token) return;
    window.location.href = `${API_URL}/api/social/complete/steam/?partial_token=${encodeURIComponent(token)}&create_account=1`;
  }

  return (
    <AuthShell
      eyebrow="Login con Steam"
      title="Esta cuenta de Steam no está vinculada"
      subtitle="Steam no nos dice tu email, así que dinos tú: ¿ya tienes cuenta en GameTrackr?"
      footer={
        <>
          ¿Te has perdido?{" "}
          <Link href="/login" className="font-semibold text-accent hover:underline">
            Volver al inicio de sesión
          </Link>
        </>
      }
    >
      {token === null ? (
        <p className="rounded-lg bg-neutral-50 p-4 text-sm text-neutral-500">
          Falta el token de vinculación. Vuelve a intentar entrar con Steam.
        </p>
      ) : busy ? (
        <div className="rounded-xl bg-neutral-50 px-6 py-8 text-center">
          <SteamIcon className="mx-auto h-8 w-8 animate-pulse text-neutral-700" />
          <p className="mt-3 font-semibold">Vinculando tu cuenta de Steam…</p>
          <p className="mt-1 text-sm text-neutral-500">
            Tu biblioteca se importará automáticamente en unos instantes.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {status === "authenticated" ? (
            <button
              onClick={linkToMyAccount}
              className="flex w-full items-center justify-center gap-3 rounded-xl bg-neutral-900 px-6 py-3.5 font-semibold text-white transition-colors hover:bg-neutral-800"
            >
              <SteamIcon className="h-5 w-5 shrink-0" />
              <span>Vincular a mi cuenta{username ? ` (${username})` : ""}</span>
            </button>
          ) : (
            <button
              onClick={goToLogin}
              className="flex w-full items-center justify-center gap-3 rounded-xl bg-neutral-900 px-6 py-3.5 font-semibold text-white transition-colors hover:bg-neutral-800"
            >
              <SteamIcon className="h-5 w-5 shrink-0" />
              <span>Ya tengo cuenta: iniciar sesión</span>
            </button>
          )}

          <button
            onClick={createNewAccount}
            className="w-full rounded-xl border border-neutral-200 px-6 py-3.5 font-semibold transition-colors hover:border-accent hover:text-accent"
          >
            Crear una cuenta nueva con este Steam
          </button>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <p className="pt-1 text-xs leading-relaxed text-neutral-400">
            En ambos casos tu biblioteca de Steam se importará automáticamente.
            Si vinculas, entrarás siempre en tu cuenta de siempre tanto con
            Steam como con tu email.
          </p>
        </div>
      )}
    </AuthShell>
  );
}
