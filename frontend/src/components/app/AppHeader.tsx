"use client";

import Link from "next/link";
import { Logo } from "@/components/Logo";
import { useAuth } from "@/hooks/useAuth";

export function AppHeader() {
  const { user } = useAuth();
  const name = user?.username ?? user?.name ?? "Usuario";
  const initial = name.charAt(0).toUpperCase();

  return (
    <header className="flex items-center justify-between px-10 pt-5">
      <Logo href="/home" />

      <Link
        href="/profile"
        className="flex items-center gap-2 rounded-lg p-1 transition-colors hover:bg-neutral-200/60 dark:hover:bg-neutral-800"
      >
        <span className="grid h-9 w-9 place-items-center rounded-lg bg-neutral-700 text-sm font-semibold text-white">
          {initial}
        </span>
        <span className="hidden text-sm font-medium sm:block">{name}</span>
      </Link>
    </header>
  );
}
