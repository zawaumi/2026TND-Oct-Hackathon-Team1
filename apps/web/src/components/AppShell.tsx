"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { Logo } from "@/components/Logo";
import { useProfile } from "@/lib/useProfile";

export type NavKey = "home" | "lessons" | "knowledge" | "settings";

/** 共通ナビの項目（docs/04 の 1.2）。PCとスマホで名前が少し違う */
const ITEMS: { key: NavKey; href: string; pc: string; sp: string; icon: (p: { className?: string }) => ReactNode }[] = [
  { key: "home", href: "/", pc: "ホーム", sp: "ホーム", icon: HomeIcon },
  { key: "lessons", href: "/lessons/", pc: "学習内容を選ぶ", sp: "学習内容", icon: BookIcon },
  { key: "knowledge", href: "/knowledge/", pc: "知識マップ", sp: "知識マップ", icon: MapIcon },
  { key: "settings", href: "/settings/", pc: "設定", sp: "設定", icon: GearIcon },
];

/**
 * ナビを出す画面の外枠。PCは上のナビバー、スマホは下のタブバー（ADR-025）。
 * ホーム・学習ルーム・ログインでは使わない。
 */
export function AppShell({ active, children }: { active: NavKey; children: ReactNode }) {
  const { profile } = useProfile();
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-20 hidden h-14 shrink-0 items-center border-b border-line bg-card px-7 lg:flex">
        <Link href="/" aria-label="ホームへ" className="shrink-0">
          <Logo className="h-[24px]" />
        </Link>
        <nav aria-label="メイン" className="flex flex-1 justify-center">
          <ul className="flex gap-2">
            {ITEMS.map((it) => (
              <li key={it.key}>
                <Link
                  href={it.href}
                  aria-current={it.key === active ? "page" : undefined}
                  className={`block rounded-full px-4 py-2 text-[14px] ${
                    it.key === active ? "bg-[#DCE4FD] font-bold text-link" : "text-ink hover:bg-soft"
                  }`}
                >
                  {it.pc}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <Link href="/settings/" className="flex shrink-0 items-center gap-2 text-[13.5px] text-ink">
          <span className="size-7 rounded-full bg-[#DCE1F5]" aria-hidden="true" />
          {profile?.nickname ?? ""}
        </Link>
      </header>

      <div className="flex flex-1 flex-col pb-[calc(64px+env(safe-area-inset-bottom))] lg:pb-0">{children}</div>

      <nav
        aria-label="メイン"
        className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-card pb-[env(safe-area-inset-bottom)] lg:hidden"
      >
        <ul className="grid h-16 grid-cols-4">
          {ITEMS.map((it) => {
            const Icon = it.icon;
            const on = it.key === active;
            return (
              <li key={it.key}>
                <Link
                  href={it.href}
                  aria-current={on ? "page" : undefined}
                  className={`flex h-full flex-col items-center justify-center gap-1 text-[11px] ${
                    on ? "font-bold text-link" : "text-sub"
                  }`}
                >
                  <Icon className="size-6" />
                  {it.sp}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}

const stroke = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

function HomeIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" {...stroke}>
      <path d="M4 11l8-6.5 8 6.5M6 9.5V20h12V9.5" />
    </svg>
  );
}

function BookIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" {...stroke}>
      <path d="M12 7c-2-1.5-4.5-2-8-2v13c3.5 0 6 .5 8 2 2-1.5 4.5-2 8-2V5c-3.5 0-6 .5-8 2zM12 7v13" />
    </svg>
  );
}

function MapIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" {...stroke}>
      <circle cx="6" cy="6" r="2.5" />
      <circle cx="18" cy="8" r="2.5" />
      <circle cx="10" cy="18" r="2.5" />
      <path d="M8.3 7.2l7.4 1M7 8.3l2.2 7.4M16.4 10l-4.6 6.2" />
    </svg>
  );
}

function GearIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" {...stroke}>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M5.6 18.4l1.8-1.8M16.6 7.4l1.8-1.8" />
    </svg>
  );
}
