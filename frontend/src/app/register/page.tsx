"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { useState } from "react";
import { AuthShell } from "@/components/auth/AuthShell";
import { SocialButtons } from "@/components/auth/SocialButtons";
import { TextField } from "@/components/auth/TextField";
import { LockIcon, MailIcon, UserIcon } from "@/components/icons";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export default function RegisterPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password !== confirm) {
      setError("Las contraseñas no coinciden.");
      return;
    }

    setLoading(true);
    const res = await fetch(`${API_URL}/api/auth/register/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, email, password }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      const firstError =
        data.email?.[0] ?? data.username?.[0] ?? data.password?.[0] ?? "No se pudo crear la cuenta.";
      setError(firstError);
      setLoading(false);
      return;
    }

    // Cuenta creada: iniciamos sesión automáticamente.
    const login = await signIn("credentials", { email, password, redirect: false });
    setLoading(false);
    if (login?.ok) {
      router.push("/");
      router.refresh();
    } else {
      router.push("/login");
    }
  }

  return (
    <AuthShell
      eyebrow="Tu archivador de juegos"
      title="Crea tu cuenta"
      subtitle="Empieza a registrar y clasificar todo lo que juegas."
      footer={
        <>
          ¿Ya tienes cuenta?{" "}
          <Link href="/login" className="font-semibold text-accent hover:underline">
            Inicia sesión
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-5">
        <TextField
          id="username"
          type="text"
          label="Nombre de usuario"
          placeholder="tu_usuario"
          icon={<UserIcon className="h-5 w-5" />}
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoComplete="username"
          required
        />

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
          type="password"
          label="Contraseña"
          placeholder="••••••••••"
          icon={<LockIcon className="h-5 w-5" />}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="new-password"
          required
        />

        <TextField
          id="confirm"
          type="password"
          label="Confirmar contraseña"
          placeholder="••••••••••"
          icon={<LockIcon className="h-5 w-5" />}
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          autoComplete="new-password"
          required
        />

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-xl bg-accent py-3 font-semibold text-white shadow-lg shadow-accent/30 transition-colors hover:bg-accent-600 disabled:opacity-60"
        >
          {loading ? "Creando cuenta…" : "Registrarse"}
        </button>
      </form>

      <div className="mt-6">
        <SocialButtons />
      </div>
    </AuthShell>
  );
}
