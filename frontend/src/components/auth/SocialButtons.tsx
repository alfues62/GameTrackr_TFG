"use client";

import { GoogleIcon, SteamIcon } from "@/components/icons";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

/**
 * Botones de login social. Redirigen (navegación completa) a los endpoints de
 * social-auth del backend Django, que tras autenticar emiten el JWT y devuelven
 * al frontend en /auth/social?access=...&refresh=...
 */
export function SocialButtons() {
  const go = (backend: "google-oauth2" | "steam") => {
    window.location.href = `${API_URL}/api/social/login/${backend}/`;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <span className="h-px flex-1 bg-neutral-200" />
        <span className="text-xs font-medium uppercase tracking-wider text-neutral-400">
          O continúa con
        </span>
        <span className="h-px flex-1 bg-neutral-200" />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => go("steam")}
          className="flex items-center justify-center gap-2 rounded-xl bg-neutral-900 py-3 font-medium text-white transition-colors hover:bg-neutral-800"
        >
          <SteamIcon className="h-5 w-5" />
          Steam
        </button>
        <button
          type="button"
          onClick={() => go("google-oauth2")}
          className="flex items-center justify-center gap-2 rounded-xl border border-neutral-200 py-3 font-medium text-neutral-700 transition-colors hover:bg-neutral-50"
        >
          <GoogleIcon className="h-5 w-5" />
          Google
        </button>
      </div>
    </div>
  );
}
