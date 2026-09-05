"use client";

import { useCallback, useEffect, useState } from "react";
import { Area, AreaChart, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useAuth } from "@/hooks/useAuth";
import api from "@/lib/axios";
import { formatHours } from "@/lib/library";
import type { DashboardStats } from "@/lib/types";

// Escala monocroma: naranja de la marca degradando a neutros (sin arcoíris).
const GENRE_COLORS = ["#F97316", "#FB923C", "#FDBA74", "#FED7AA", "#d4d4d4", "#a3a3a3", "#737373", "#525252"];
const PLATFORM_COLORS = GENRE_COLORS;
// La porción que agrupa el resto de géneros; el backend la nombra igual.
const OTHERS_LABEL = "Otros";
const OTHERS_COLOR = "#404040";

/** "Otros" siempre va en el mismo gris, no en el color que le tocase por orden. */
function genreColor(genre: string, i: number): string {
  return genre === OTHERS_LABEL ? OTHERS_COLOR : GENRE_COLORS[i % GENRE_COLORS.length];
}
const MONTHS = ["ENE", "FEB", "MAR", "ABR", "MAY", "JUN", "JUL", "AGO", "SEP", "OCT", "NOV", "DIC"];

// Recharts pinta el tooltip dentro del contenedor del gráfico y sin z-index
// propio, así que quedaba por debajo de la etiqueta central del donut. Con el
// z-index se resuelve el solape, y de paso los dos gráficos comparten estilo.
const TOOLTIP_WRAPPER = { zIndex: 20, outline: "none" };
const TOOLTIP_CONTENT = {
  borderRadius: "0.75rem",
  border: "1px solid #e5e5e5",
  boxShadow: "0 8px 24px rgb(0 0 0 / 0.10)",
  padding: "0.5rem 0.75rem",
  fontSize: "0.8125rem",
};

function monthShort(ym: string): string {
  const m = parseInt(ym.split("-")[1] ?? "1", 10);
  return MONTHS[m - 1] ?? "";
}

/** Porcentaje del donut. Un género con horas nunca debe leerse como 0 %: si no
 *  llega a medio punto se muestra "<1%" en vez de redondear a cero. */
function sharePct(hours: number, total: number): string {
  const p = (hours / total) * 100;
  if (p > 0 && p < 0.5) return "<1%";
  return `${Math.round(p)}%`;
}

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm ${className}`}>{children}</div>;
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return <p className="text-xs uppercase tracking-[0.15em] text-neutral-400">{children}</p>;
}

/** Titulo de tarjeta redactado como frase, en vez de una etiqueta suelta. */
function CardTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="text-base font-semibold text-neutral-800">{children}</h2>;
}

function Kpi({ label, value }: { label: string; value: number }) {
  return (
    <Card>
      <Eyebrow>{label}</Eyebrow>
      <p className="mt-1 text-3xl font-bold">{value}</p>
    </Card>
  );
}

export function Dashboard() {
  const { user } = useAuth();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    const s = await api.get<DashboardStats>("/api/stats/dashboard/").catch(() => null);
    if (s) setStats(s.data);
    setLoading(false);
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  if (loading || !stats) {
    return (
      <div className="mx-auto max-w-[90rem] px-6 py-8 lg:px-10">
        <div className="h-96 animate-pulse rounded-2xl bg-neutral-200" />
      </div>
    );
  }

  const username = user?.username ?? user?.name ?? "jugador";
  const genreTotal = stats.hours_by_genre.reduce((s, g) => s + g.hours, 0) || 1;
  const maxPlatform = Math.max(1, ...stats.platform_distribution.map((p) => p.count));
  const maxTopHours = Math.max(1, ...stats.top_games_by_hours.map((g) => g.hours));
  const lineData = stats.playtime_over_time.map((p) => ({ name: monthShort(p.month), hours: p.hours }));
  // La actividad se mide comparando lecturas del contador de horas, así que
  // hasta que no haya una segunda lectura de algún juego no hay nada que pintar.
  const hasActivity = lineData.some((p) => p.hours > 0);
  const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);
  const completedShare = stats.total_games ? (stats.completed_games / stats.total_games) * 100 : 0;

  return (
    <div className="mx-auto max-w-[90rem] px-6 py-8 lg:px-10">
      {/* Cabecera */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">Hola, {username}</h1>
          <p className="mt-2 text-neutral-500">
            {stats.playing_games === 0
              ? "Ahora mismo no tienes ningún juego en marcha."
              : `Tienes ${stats.playing_games} ${plural(stats.playing_games, "juego en marcha", "juegos en marcha")} ahora mismo.`}
          </p>
        </div>
      </div>

      {/* KPIs. En móvil se ocultan: los cuatro recuentos ocupaban toda la
          primera pantalla y empujaban abajo las tarjetas que sí informan. */}
      <div className="mt-6 hidden grid-cols-2 gap-4 sm:grid lg:grid-cols-4">
        <Kpi label="En tu biblioteca" value={stats.total_games} />
        <Kpi label="Jugando ahora" value={stats.playing_games} />
        <Kpi label="Ya completados" value={stats.completed_games} />
        <Kpi label="Pendientes" value={stats.backlog_games} />
      </div>

      {/* Horas + completismo */}
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Las dos tarjetas son columnas flex: el grid ya las iguala en altura y
            así la barra queda anclada abajo sin descuadrar el número de al lado. */}
        <Card className="flex flex-col bg-accent/5">
          {stats.total_hours === 0 ? (
            <>
              <CardTitle>Todavía no has registrado ninguna hora</CardTitle>
              <p className="mt-2 text-sm text-neutral-500">
                Sincroniza tu biblioteca o anota tus horas a mano y aparecerán aquí.
              </p>
            </>
          ) : (
            <>
              <p className="text-sm text-neutral-500">En total has jugado</p>
              <p className="mt-1 text-4xl font-bold text-accent">{formatHours(stats.total_hours)}</p>
            </>
          )}
        </Card>
        <Card className="flex flex-col">
          <p className="text-sm text-neutral-500">Has completado</p>
          <p className="mt-1 text-4xl font-bold">
            {stats.completed_games} de {stats.total_games}{" "}
            <span className="text-2xl font-semibold text-neutral-400">
              {plural(stats.total_games, "juego", "juegos")}
            </span>
          </p>
          {/* pt-4 asegura la separación mínima; mt-auto la baja si sobra sitio. */}
          <div className="mt-auto pt-4">
            <div className="h-2 overflow-hidden rounded-full bg-neutral-100">
              <div className="h-full rounded-full bg-accent" style={{ width: `${completedShare}%` }} />
            </div>
          </div>
        </Card>
      </div>

      {/* Géneros + plataformas */}
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardTitle>Los géneros a los que más juegas</CardTitle>
          <div className="mt-3 flex flex-wrap items-center gap-4">
            <div className="relative h-44 w-44 shrink-0">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={stats.hours_by_genre} dataKey="hours" nameKey="genre" innerRadius={55} outerRadius={80} paddingAngle={2} stroke="none">
                    {stats.hours_by_genre.map((_, i) => (
                      <Cell key={i} fill={genreColor(stats.hours_by_genre[i].genre, i)} />
                    ))}
                  </Pie>
                  <Tooltip
                    wrapperStyle={TOOLTIP_WRAPPER}
                    contentStyle={TOOLTIP_CONTENT}
                    itemStyle={{ color: "#404040" }}
                    formatter={(value) => `${Math.round(Number(value))} h`}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="pointer-events-none absolute inset-0 z-0 flex flex-col items-center justify-center">
                <span className="text-2xl font-bold">{stats.genre_count}</span>
                <span className="text-[10px] uppercase tracking-wider text-neutral-400">
                  {plural(stats.genre_count, "Género", "Géneros")}
                </span>
              </div>
            </div>
            <ul className="grid flex-1 grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
              {stats.hours_by_genre.map((g, i) => (
                <li key={g.genre} className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2 truncate">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: genreColor(g.genre, i) }} />
                    <span className="truncate">{g.genre}</span>
                  </span>
                  <span className="text-xs text-neutral-400">{sharePct(g.hours, genreTotal)}</span>
                </li>
              ))}
            </ul>
          </div>
        </Card>

        <Card>
          <CardTitle>En qué plataformas tienes tus juegos</CardTitle>
          <div className="mt-4 space-y-3">
            {stats.platform_distribution.map((p, i) => (
              <div key={p.platform}>
                <div className="flex items-center justify-between text-sm">
                  <span className="truncate">{p.platform}</span>
                  <span className="text-xs text-neutral-400">{p.count}</span>
                </div>
                <div className="mt-1 h-2 overflow-hidden rounded-full bg-neutral-100">
                  <div className="h-full rounded-full" style={{ width: `${(p.count / maxPlatform) * 100}%`, background: PLATFORM_COLORS[i % PLATFORM_COLORS.length] }} />
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Actividad mensual */}
      <Card className="mt-4">
        <CardTitle>Cuánto has jugado cada mes</CardTitle>
        {/* Se pinta siempre, aunque esté en ceros: decir "sincroniza tu biblioteca"
            cuando el usuario ya la tiene sincronizada (solo falta una segunda
            lectura del contador para poder calcular una diferencia) confundía
            más de lo que ayudaba. */}
        <div className="mt-4 h-64">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={lineData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="grad-orange" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#F97316" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#F97316" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="name" tickLine={false} axisLine={false} fontSize={11} stroke="#9CA3AF" />
              <YAxis hide domain={[0, (max: number) => (max > 0 ? max : 1)]} />
              <Tooltip
                wrapperStyle={TOOLTIP_WRAPPER}
                contentStyle={TOOLTIP_CONTENT}
                itemStyle={{ color: "#404040" }}
                formatter={(value) => `${Math.round(Number(value))} h`}
              />
              <Area type="monotone" dataKey="hours" stroke="#F97316" strokeWidth={2.5} fill="url(#grad-orange)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        {!hasActivity && (
          <p className="mt-2 text-center text-xs text-neutral-400">
            Todavía no hay una segunda lectura de horas con la que calcular actividad: se rellenará en la próxima sincronización.
          </p>
        )}
      </Card>

      {/* Top más jugados */}
      <Card className="mt-4">
        <CardTitle>Tus juegos con más horas</CardTitle>
        <div className="mt-4 grid grid-cols-1 gap-x-8 gap-y-4 lg:grid-cols-2">
          {stats.top_games_by_hours.map((g) => (
            <div key={g.title}>
              <div className="flex items-center justify-between">
                <span className="truncate font-medium">{g.title}</span>
                <span className="ml-2 shrink-0 text-xs text-neutral-400">{formatHours(g.hours)}</span>
              </div>
              <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-neutral-100">
                <div className="h-full rounded-full bg-accent" style={{ width: `${(g.hours / maxTopHours) * 100}%` }} />
              </div>
            </div>
          ))}
        </div>
      </Card>

    </div>
  );
}
