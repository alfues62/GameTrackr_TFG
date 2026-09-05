"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_ITEMS } from "./nav";

export function BottomNav() {
  const pathname = usePathname();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 flex border-t border-neutral-200 bg-white lg:hidden dark:border-neutral-800 dark:bg-neutral-900">
      {NAV_ITEMS.map(({ href, label, Icon }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link key={href} href={href} aria-label={label}
            className={`flex flex-1 items-center justify-center py-3 transition-colors ${active ? "text-accent" : "text-neutral-400"}`}>
            <Icon className="h-6 w-6" />
          </Link>
        );
      })}
    </nav>
  );
}
