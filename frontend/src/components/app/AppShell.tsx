"use client";

import type { ReactNode } from "react";
import { OnboardingGate } from "@/components/onboarding/OnboardingGate";
import { AppFooter } from "./AppFooter";
import { AppHeader } from "./AppHeader";
import { AppTabs } from "./AppTabs";
import { BottomNav } from "./BottomNav";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-neutral-50 pb-16 text-neutral-900 lg:pb-0 dark:bg-neutral-950 dark:text-neutral-100">
      <AppHeader />
      <AppTabs />
      <main className="flex-1 pb-8">{children}</main>
      <AppFooter />
      <BottomNav />
      <OnboardingGate />
    </div>
  );
}
