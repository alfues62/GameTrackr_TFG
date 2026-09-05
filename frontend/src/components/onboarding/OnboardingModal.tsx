"use client";

import { useState } from "react";
import { ChevronLeftIcon, CompassIcon, PlayIcon, SearchIcon, SteamIcon } from "@/components/icons";
import api from "@/lib/axios";

const STEPS = [
  {
    icon: <PlayIcon className="h-7 w-7" />,
    title: "¡Bienvenido a GameTrackr!",
    body: "Sigue, organiza y analiza tu biblioteca de videojuegos en un solo sitio, con datos de IGDB y Steam.",
  },
  {
    icon: <SearchIcon className="h-7 w-7" />,
    title: "Añade tu primer juego",
    body: "Desde Explorar o Biblioteca puedes buscar cualquier juego del catálogo y añadirlo con un clic.",
    search: true,
  },
  {
    icon: <SteamIcon className="h-7 w-7" />,
    title: "Conecta Steam",
    body: "Vincula tu cuenta de Steam en Ajustes para importar automáticamente tu biblioteca, horas jugadas y logros.",
  },
  {
    icon: <CompassIcon className="h-7 w-7" />,
    title: "¡Todo listo!",
    body: "Explora recomendaciones a tu medida, comparte reseñas y descubre lo que juega la comunidad.",
  },
];

export function OnboardingModal({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState(0);
  const last = step === STEPS.length - 1;
  const current = STEPS[step];

  async function finish() {
    await api.patch("/api/auth/me/", { has_completed_onboarding: true }).catch(() => {});
    onDone();
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" />
      <div className="relative w-full max-w-md rounded-2xl bg-white p-8 shadow-xl dark:bg-neutral-900">
        <button onClick={finish} className="absolute right-5 top-5 text-sm font-medium text-neutral-400 hover:text-neutral-700">
          Saltar
        </button>

        <div key={step} style={{ animation: "fadeInUp 0.3s ease" }} className="text-center">
          <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-accent/10 text-accent">{current.icon}</div>
          <h2 className="mt-5 text-2xl font-bold">{current.title}</h2>
          <p className="mt-2 text-neutral-500">{current.body}</p>
          {current.search && (
            <div className="relative mt-5">
              <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-neutral-300" />
              <div className="rounded-xl border border-neutral-200 py-3 pl-10 text-left text-sm text-neutral-300 dark:border-neutral-700">
                Busca un juego: Zelda, Hollow Knight…
              </div>
            </div>
          )}
        </div>

        {/* Progreso */}
        <div className="mt-8 flex items-center justify-center gap-2">
          {STEPS.map((_, i) => (
            <span key={i} className={`h-2 rounded-full transition-all ${i === step ? "w-6 bg-accent" : "w-2 bg-neutral-200 dark:bg-neutral-700"}`} />
          ))}
        </div>

        {/* Navegación */}
        <div className="mt-6 flex items-center justify-between">
          <button onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0}
            className="inline-flex items-center gap-1 text-sm font-medium text-neutral-500 hover:text-neutral-800 disabled:invisible">
            <ChevronLeftIcon className="h-4 w-4" /> Atrás
          </button>
          {last ? (
            <button onClick={finish} className="rounded-lg bg-accent px-6 py-2.5 font-semibold text-white hover:bg-accent-600">Empezar</button>
          ) : (
            <button onClick={() => setStep((s) => s + 1)} className="rounded-lg bg-accent px-6 py-2.5 font-semibold text-white hover:bg-accent-600">Siguiente</button>
          )}
        </div>
      </div>
    </div>
  );
}
