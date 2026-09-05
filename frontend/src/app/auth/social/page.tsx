"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { Suspense, useEffect } from "react";

function SocialCallback() {
  const params = useSearchParams();
  const router = useRouter();

  useEffect(() => {
    const access = params.get("access");
    const refresh = params.get("refresh");

    if (!access) {
      router.replace("/login?error=social");
      return;
    }

    signIn("social", { access, refresh: refresh ?? "", redirect: false }).then((res) => {
      if (!res?.ok) {
        router.replace("/login?error=social");
        return;
      }
      // Si el login se inició para vincular un Steam pendiente (marca puesta
      // por /auth/steam-link), volvemos allí para completar la vinculación
      // automáticamente en lugar de ir a la home.
      const pendingSteam = sessionStorage.getItem("steam_link_auto");
      router.replace(
        pendingSteam
          ? `/auth/steam-link?partial_token=${encodeURIComponent(pendingSteam)}`
          : "/"
      );
    });
  }, [params, router]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-neutral-50">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-neutral-300 border-t-accent" />
      <p className="text-neutral-500">Completando el inicio de sesión…</p>
    </div>
  );
}

export default function SocialAuthPage() {
  return (
    <Suspense fallback={null}>
      <SocialCallback />
    </Suspense>
  );
}
