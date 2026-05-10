"use client";

import Link from "next/link";
import type { Route } from "next";
import { usePathname } from "next/navigation";

type AppNavTab = {
  href: Route;
  label: string;
  kicker: string;
  accent: string;
};

const TABS: AppNavTab[] = [
  {
    href: "/dashboard",
    label: "Dashboard",
    kicker: "Today",
    accent: "bg-orange-500",
  },
  {
    href: "/checkin",
    label: "Check-in",
    kicker: "Readiness",
    accent: "bg-emerald-500",
  },
  {
    href: "/calendar",
    label: "Calendar",
    kicker: "Plan",
    accent: "bg-amber-500",
  },
  { href: "/coach", label: "Coach", kicker: "Goals", accent: "bg-rose-500" },
  {
    href: "/activities",
    label: "Activities",
    kicker: "History",
    accent: "bg-sky-500",
  },
  {
    href: "/profile",
    label: "Profile",
    kicker: "Athlete",
    accent: "bg-neutral-500",
  },
];

export function AppNavTabs({ className = "" }: { className?: string }) {
  const pathname = usePathname();

  return (
    <nav aria-label="App navigation" className={className}>
      <div className="flex flex-wrap gap-2">
        {TABS.map((tab) => {
          const href = tab.href as string;
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={active ? "page" : undefined}
              className={`group inline-flex min-w-[8.25rem] items-center gap-2 rounded-md border px-3 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-2 ${
                active
                  ? "border-orange-300 bg-orange-50 text-orange-950 shadow-sm"
                  : "border-neutral-200 bg-white text-neutral-600 hover:border-neutral-300 hover:bg-neutral-50 hover:text-neutral-950"
              }`}
            >
              <span
                aria-hidden="true"
                className={`h-2.5 w-2.5 rounded-full ${tab.accent} ${active ? "opacity-100" : "opacity-55 group-hover:opacity-90"}`}
              />
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold leading-tight">
                  {tab.label}
                </span>
                <span className="block truncate text-[10px] uppercase tracking-wide text-neutral-400">
                  {tab.kicker}
                </span>
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
