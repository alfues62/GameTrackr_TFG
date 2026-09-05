import type { ReactNode } from "react";
import { Logo } from "@/components/Logo";

interface AuthShellProps {
  eyebrow: string;
  title: string;
  subtitle: string;
  children: ReactNode;
  footer: ReactNode;
}

export function AuthShell({ eyebrow, title, subtitle, children, footer }: AuthShellProps) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-neutral-50 p-4">
      <div className="w-full max-w-md rounded-2xl border border-neutral-200 bg-white p-8 shadow-sm sm:p-10">
        <Logo />

        <p className="mt-8 text-xs font-semibold uppercase tracking-[0.2em] text-accent">
          {eyebrow}
        </p>
        <h1 className="mt-2 text-3xl font-bold text-neutral-900 sm:text-4xl">{title}</h1>
        <p className="mt-2 text-neutral-500">{subtitle}</p>

        <div className="mt-8">{children}</div>

        <p className="mt-8 text-center text-sm text-neutral-500">{footer}</p>
      </div>
    </main>
  );
}
