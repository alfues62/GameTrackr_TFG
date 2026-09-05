"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ChevronLeftIcon } from "@/components/icons";
import { ImageDropzone } from "@/components/ui/ImageDropzone";
import api from "@/lib/axios";

interface Me {
  username: string;
  email: string;
  avatar_url: string | null;
  bio: string | null;
  is_public_profile: boolean;
}

const inputCls =
  "w-full rounded-lg border border-neutral-200 bg-white px-3 py-2.5 outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20";
const labelCls = "mb-1.5 block text-xs uppercase tracking-wider text-neutral-400";

export default function EditProfilePage() {
  const router = useRouter();
  const [loaded, setLoaded] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [bio, setBio] = useState("");
  const [isPublic, setIsPublic] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<Me>("/api/auth/me/")
      .then((r) => {
        setAvatarUrl(r.data.avatar_url);
        setUsername(r.data.username);
        setEmail(r.data.email);
        setBio(r.data.bio ?? "");
        setIsPublic(r.data.is_public_profile);
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await api.patch("/api/auth/me/", {
        username: username.trim(),
        email: email.trim(),
        bio: bio.trim() || null,
        avatar_url: avatarUrl,
        is_public_profile: isPublic,
      });
      router.push("/profile");
      router.refresh();
    } catch (err) {
      const d = (err as { response?: { data?: Record<string, unknown> } })?.response?.data;
      const msg =
        (d?.detail as string) ||
        (Array.isArray(d?.email) ? (d?.email as string[])[0] : undefined) ||
        (Array.isArray(d?.username) ? (d?.username as string[])[0] : undefined) ||
        "No se pudo guardar. Revisa los datos.";
      setError(msg);
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-6 py-8">
      <Link href="/profile" className="inline-flex items-center gap-1 text-sm font-medium text-accent hover:underline">
        <ChevronLeftIcon className="h-4 w-4" /> Volver al perfil
      </Link>

      <div className="mt-4 rounded-2xl border border-neutral-200 bg-white p-6">
        <h1 className="text-2xl font-bold tracking-tight">Editar perfil</h1>

        {loaded ? (
          <form onSubmit={save} className="mt-6 space-y-5">
            <div>
              <label className={labelCls}>Foto de perfil</label>
              <ImageDropzone value={avatarUrl} onChange={setAvatarUrl} shape="circle" />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className={labelCls}>Nombre de usuario</label>
                <input className={inputCls} value={username} onChange={(e) => setUsername(e.target.value)} required />
              </div>
              <div>
                <label className={labelCls}>Email</label>
                <input className={inputCls} type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
              </div>
            </div>

            <div>
              <label className={labelCls}>Bio (opcional)</label>
              <textarea className={`${inputCls} resize-none`} rows={3} value={bio} onChange={(e) => setBio(e.target.value)} placeholder="Cuéntale a la gente qué juegas…" />
            </div>

            {/* Privacidad */}
            <div className="flex items-center justify-between border-t border-neutral-100 pt-4">
              <p className="text-sm font-medium">Perfil público</p>
              <button type="button" onClick={() => setIsPublic((v) => !v)} aria-pressed={isPublic}
                className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${isPublic ? "bg-accent" : "bg-neutral-300"}`}>
                <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${isPublic ? "left-[22px]" : "left-0.5"}`} />
              </button>
            </div>

            {error && <p className="text-sm text-red-600">{error}</p>}

            <div className="flex gap-3 pt-1">
              <button type="submit" disabled={saving} className="rounded-lg bg-accent px-6 py-2.5 font-semibold text-white transition-colors hover:bg-accent-600 disabled:opacity-60">
                {saving ? "Guardando…" : "Guardar cambios"}
              </button>
              <button type="button" onClick={() => router.push("/profile")} className="rounded-lg border border-neutral-200 px-6 py-2.5 font-medium transition-colors hover:border-neutral-400">
                Cancelar
              </button>
            </div>
          </form>
        ) : (
          <div className="mt-6 h-64 animate-pulse rounded-xl bg-neutral-100" />
        )}
      </div>
    </div>
  );
}
