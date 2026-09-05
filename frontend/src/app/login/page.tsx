"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { useEffect, useState } from "react";
import { AuthShell } from "@/components/auth/AuthShell";
import { SocialButtons } from "@/components/auth/SocialButtons";
import { TextField } from "@/components/auth/TextField";
import { ArrowRightIcon, CloseIcon, LockIcon, MailIcon } from "@/components/icons";

// Códigos de error del login social (los envía el backend en ?social_error=).
const SOCIAL_ERRORS: Record<string, string> = {
  already_associated:
    "Esa cuenta de Google o Steam ya está vinculada a otro usuario de GameTrackr. Entra con tu email y contraseña.",
  cancelled: "Has cancelado el inicio de sesión con el proveedor.",
  forbidden: "El proveedor ha denegado el acceso a tu cuenta.",
  failed: "No se pudo completar el inicio de sesión social. Inténtalo de nuevo.",
};

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [socialError, setSocialError] = useState<string | null>(null);
  const [next, setNext] = useState<string | null>(null);

  // Si el backend nos devuelve de un login social fallido, muestra el motivo.
  // Y si venimos con ?next= (p. ej. desde la vinculación de Steam), recuérdalo.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("social_error");
    const nextParam = params.get("next");
    // Solo rutas internas, para evitar redirecciones abiertas.
    if (nextParam && nextParam.startsWith("/")) setNext(nextParam);
    if (!code) return;
    window.history.replaceState({}, "", "/login");
    setSocialError(SOCIAL_ERRORS[code] ?? SOCIAL_ERRORS.failed);
  }, []);

  // Validación de formato de email (cliente). No sustituye a la del backend.
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    // Validación previa: evitamos llamar al backend con datos obviamente inválidos.
    if (!EMAIL_RE.test(email.trim())) {
      setError("Introduce un correo electrónico válido.");
      return;
    }
    if (!password) {
      setError("La contraseña es obligatoria.");
      return;
    }

    setLoading(true);
    const res = await signIn("credentials", { email, password, redirect: false });

    setLoading(false);
    if (res?.ok) {
      router.push(next ?? "/");
      router.refresh();
    } else {
      setError("Email o contraseña incorrectos.");
    }
  }

  return (
    <>
      {socialError && (
        <div className="fixed inset-x-0 top-6 z-50 flex justify-center px-4">
          <div
            role="alert"
            className="flex w-full max-w-md items-start gap-3 rounded-xl border border-red-200 bg-white p-4 shadow-xl dark:border-red-900 dark:bg-neutral-900"
          >
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-red-100 font-bold text-red-600 dark:bg-red-950">
              !
            </span>
            <div className="flex-1 text-sm">
              <p className="font-semibold">No se pudo iniciar sesión</p>
              <p className="mt-0.5 text-neutral-500 dark:text-neutral-400">{socialError}</p>
            </div>
            <button
              onClick={() => setSocialError(null)}
              aria-label="Cerrar aviso"
              className="text-neutral-400 transition-colors hover:text-neutral-600"
            >
              <CloseIcon className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    <AuthShell
      eyebrow="Tu archivador de juegos"
      title="Bienvenido de nuevo"
      subtitle="Entra para seguir clasificando lo que juegas."
      footer={
        <>
          ¿No tienes cuenta?{" "}
          <Link href="/register" className="font-semibold text-accent hover:underline">
            Crea una gratis
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-5">
        <TextField
          id="email"
          type="email"
          label="Correo electrónico"
          placeholder="tucorreo@gmail.com"
          icon={<MailIcon className="h-5 w-5" />}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          required
        />

        <TextField
          id="password"
          type={showPassword ? "text" : "password"}
          label="Contraseña"
          placeholder="••••••••••"
          icon={<LockIcon className="h-5 w-5" />}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          required
          labelAddon={
            <Link href="/forgot-password" className="text-sm font-medium text-accent hover:underline">
              ¿La olvidaste?
            </Link>
          }
          trailing={
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="text-sm text-neutral-400 hover:text-neutral-600"
            >
              {showPassword ? "Ocultar" : "Mostrar"}
            </button>
          }
        />

        <label className="flex items-center gap-2 text-sm text-neutral-600">
          <input
            type="checkbox"
            checked={remember}
            onChange={(e) => setRemember(e.target.checked)}
            className="h-4 w-4 rounded border-neutral-300 accent-[#F97316]"
          />
          Mantener la sesión iniciada
        </label>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-accent py-3 font-semibold text-white shadow-lg shadow-accent/30 transition-colors hover:bg-accent-600 disabled:opacity-60"
        >
          {loading ? "Entrando…" : "Entrar"}
          {!loading && <ArrowRightIcon className="h-4 w-4" />}
        </button>
      </form>

      <div className="mt-6">
        <SocialButtons />
      </div>
    </AuthShell>
    </>
  );
}
