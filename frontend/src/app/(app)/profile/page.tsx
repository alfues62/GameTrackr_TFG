/* eslint-disable @next/next/no-img-element */
"use client";

import Link from "next/link";
import { signOut } from "next-auth/react";
import { useEffect, useState } from "react";
import { ChevronRightIcon, MoreIcon, PlaystationIcon, SteamIcon } from "@/components/icons";
import { PsnLinkModal } from "@/components/psn/PsnLinkModal";
import { SteamLinkModal } from "@/components/steam/SteamLinkModal";
import { Modal } from "@/components/ui/Modal";
import api from "@/lib/axios";

interface Me {
  username: string;
  email: string;
  avatar_url: string | null;
  bio: string | null;
  steam_id: string | null;
  is_steam_linked: boolean;
  psn_online_id: string;
  is_psn_linked: boolean;
  is_public_profile: boolean;
}

const inputCls =
  "w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/20";

export default function ProfilePage() {
  const [me, setMe] = useState<Me | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [connOpen, setConnOpen] = useState(false);

  const [showPwd, setShowPwd] = useState(false);
  const [pwd, setPwd] = useState({ current: "", next: "" });
  const [pwdMsg, setPwdMsg] = useState<string | null>(null);

  const [showSteamLink, setShowSteamLink] = useState(false);
  const [steamMsg, setSteamMsg] = useState<string | null>(null);
  const [showPsnLink, setShowPsnLink] = useState(false);
  const [psnMsg, setPsnMsg] = useState<string | null>(null);

  useEffect(() => {
    api.get<Me>("/api/auth/me/").then((r) => setMe(r.data)).catch(() => {});
  }, []);

  function setField<K extends keyof Me>(k: K, v: Me[K]) {
    setMe((m) => (m ? { ...m, [k]: v } : m));
  }

  async function changePassword() {
    setPwdMsg(null);
    try {
      await api.post("/api/auth/password/", { current_password: pwd.current, new_password: pwd.next });
      setPwd({ current: "", next: "" });
      setPwdMsg("Contraseña actualizada.");
      setTimeout(() => setShowPwd(false), 900);
    } catch (err) {
      const detail = (err as { response?: { data?: { detail?: string } } }).response?.data?.detail;
      setPwdMsg(detail ?? "No se pudo cambiar la contraseña.");
    }
  }

  async function syncSteam() {
    setSteamMsg("Sincronizando…");
    try {
      const res = await api.post("/api/steam/sync/", {});
      setSteamMsg(`Sincronizados ${res.data.synced} juegos (${res.data.new} nuevos).`);
    } catch {
      setSteamMsg("No se pudo sincronizar.");
    }
  }
  async function disconnectSteam() {
    await api.delete("/api/steam/link/").catch(() => {});
    setField("is_steam_linked", false);
    setField("steam_id", null);
    setSteamMsg(null);
  }

  async function syncPsn() {
    setPsnMsg("Sincronizando…");
    try {
      const res = await api.post("/api/psn/sync/", {});
      setPsnMsg(`Sincronizados ${res.data.synced} juegos (${res.data.new} nuevos).`);
    } catch (err) {
      const detail = (err as { response?: { data?: { detail?: string } } }).response?.data?.detail;
      setPsnMsg(detail ?? "No se pudo sincronizar.");
    }
  }
  async function disconnectPsn() {
    await api.delete("/api/psn/link/").catch(() => {});
    setField("is_psn_linked", false);
    setField("psn_online_id", "");
    setPsnMsg(null);
  }

  if (!me) {
    return <div className="mx-auto max-w-2xl px-6 py-10"><div className="h-40 animate-pulse rounded-2xl bg-neutral-200" /></div>;
  }

  const initial = me.username.charAt(0).toUpperCase();

  // Fila de una plataforma dentro del menú de conexiones.
  function ConnRow({
    icon, name, linked, detail, onConnect, onSync, onDisconnect, msg,
  }: {
    icon: React.ReactNode; name: string; linked: boolean; detail?: string;
    onConnect: () => void; onSync: () => void; onDisconnect: () => void; msg: string | null;
  }) {
    return (
      <div className="border-b border-neutral-100 px-4 py-3 last:border-0">
        <div className="flex items-center justify-between gap-3">
          <span className="flex items-center gap-2 text-sm font-medium">{icon} {name}</span>
          {linked ? (
            <span className="text-[10px] uppercase tracking-wider text-green-600">Vinculada</span>
          ) : (
            <button onClick={onConnect} className="text-xs font-semibold text-accent hover:underline">Conectar</button>
          )}
        </div>
        {linked && (
          <>
            {detail && <p className="mt-1 truncate text-[11px] text-neutral-400">{detail}</p>}
            <div className="mt-2 flex gap-2">
              <button onClick={onSync} className="rounded-md border border-neutral-200 px-2.5 py-1 text-xs font-medium hover:border-accent hover:text-accent">Sincronizar</button>
              <button onClick={onDisconnect} className="rounded-md border border-neutral-200 px-2.5 py-1 text-xs font-medium text-pink-600 hover:border-pink-300">Desconectar</button>
            </div>
          </>
        )}
        {msg && <p className="mt-1.5 text-xs text-neutral-500">{msg}</p>}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-6 py-8">
      {/* Cabecera del perfil (solo lectura) */}
      <div className="rounded-2xl border border-neutral-200 bg-white p-6">
        <div className="flex items-start gap-5">
          <span className="grid h-20 w-20 shrink-0 place-items-center overflow-hidden rounded-2xl bg-neutral-700 text-3xl font-semibold text-white">
            {me.avatar_url ? <img src={me.avatar_url} alt="" className="h-full w-full object-cover" /> : initial}
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-2xl font-bold tracking-tight">{me.username}</h1>
            <p className="truncate text-sm text-neutral-500">{me.email}</p>
            {me.bio && <p className="mt-2 text-sm text-neutral-600">{me.bio}</p>}
          </div>

          {/* Menú de tres puntos: editar perfil / cambiar contraseña */}
          <div className="relative">
            <button
              onClick={() => setMenuOpen((v) => !v)}
              aria-label="Opciones de perfil"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              className="grid h-9 w-9 place-items-center rounded-lg text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-700"
            >
              <MoreIcon className="h-5 w-5" />
            </button>
            {menuOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
                <div role="menu" className="absolute right-0 top-full z-20 mt-1 w-52 overflow-hidden rounded-xl border border-neutral-200 bg-white py-1 shadow-lg">
                  <Link href="/profile/editar" role="menuitem" className="block px-4 py-2.5 text-sm hover:bg-neutral-50">Editar perfil</Link>
                  <button role="menuitem" onClick={() => { setShowPwd(true); setPwdMsg(null); setMenuOpen(false); }} className="block w-full px-4 py-2.5 text-left text-sm hover:bg-neutral-50">Cambiar contraseña</button>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Acciones: conexiones (menú) y cerrar sesión (botón propio) */}
        <div className="mt-5 flex flex-wrap items-center justify-end gap-2">
          <div className="relative">
            <button
              onClick={() => setConnOpen((v) => !v)}
              aria-haspopup="menu"
              aria-expanded={connOpen}
              className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-200 px-4 py-2 text-sm font-medium transition-colors hover:border-accent hover:text-accent"
            >
              Conexiones <ChevronRightIcon className="h-3.5 w-3.5 rotate-90" />
            </button>
            {connOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setConnOpen(false)} />
                <div role="menu" className="absolute right-0 top-full z-20 mt-1 w-72 overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-lg">
                  <p className="border-b border-neutral-100 px-4 py-2 text-[10px] uppercase tracking-wider text-neutral-400">Vincular cuentas</p>
                  <ConnRow
                    icon={<SteamIcon className="h-4 w-4" />} name="Steam" linked={me.is_steam_linked} detail={me.steam_id ?? undefined}
                    onConnect={() => setShowSteamLink(true)} onSync={syncSteam} onDisconnect={disconnectSteam} msg={steamMsg}
                  />
                  <ConnRow
                    icon={<PlaystationIcon className="h-4 w-4" />} name="PlayStation" linked={me.is_psn_linked} detail={me.psn_online_id || undefined}
                    onConnect={() => setShowPsnLink(true)} onSync={syncPsn} onDisconnect={disconnectPsn} msg={psnMsg}
                  />
                </div>
              </>
            )}
          </div>

          <button
            onClick={() => signOut({ callbackUrl: "/" })}
            className="rounded-lg border border-neutral-200 px-4 py-2 text-sm font-medium text-pink-600 transition-colors hover:border-pink-300"
          >
            Cerrar sesión
          </button>
        </div>
      </div>

      {/* Modal de cambio de contraseña */}
      {showPwd && (
        <Modal open onClose={() => setShowPwd(false)} title="Cambiar contraseña">
          <div className="space-y-3">
            <input type="password" placeholder="Contraseña actual" value={pwd.current} onChange={(e) => setPwd({ ...pwd, current: e.target.value })} className={inputCls} />
            <input type="password" placeholder="Nueva contraseña" value={pwd.next} onChange={(e) => setPwd({ ...pwd, next: e.target.value })} className={inputCls} />
            {pwdMsg && <p className="text-sm text-neutral-500">{pwdMsg}</p>}
            <div className="flex justify-end gap-2 pt-1">
              <button onClick={() => setShowPwd(false)} className="rounded-lg border border-neutral-200 px-4 py-2 text-sm font-medium hover:border-neutral-400">Cancelar</button>
              <button onClick={changePassword} disabled={!pwd.current || !pwd.next} className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent-600 disabled:opacity-60">Actualizar</button>
            </div>
          </div>
        </Modal>
      )}

      {showSteamLink && (
        <SteamLinkModal
          onClose={() => setShowSteamLink(false)}
          onLinked={(id) => {
            setField("is_steam_linked", true);
            setField("steam_id", id);
            setShowSteamLink(false);
            setSteamMsg("Cuenta vinculada. Tu biblioteca se está importando en segundo plano…");
          }}
        />
      )}
      {showPsnLink && (
        <PsnLinkModal
          onClose={() => setShowPsnLink(false)}
          onLinked={(onlineId) => {
            setField("is_psn_linked", true);
            setField("psn_online_id", onlineId);
            setShowPsnLink(false);
          }}
        />
      )}
    </div>
  );
}
