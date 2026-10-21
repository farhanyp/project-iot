"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

export interface NavLinkItem {
  label: string;
  href: string;
}

export const DEFAULT_ADMIN_NAV_LINKS: NavLinkItem[] = [
  { label: "Dashboard", href: "/admin" },
  { label: "Transaksi", href: "/admin/transactions" },
  { label: "Manajemen Perangkat", href: "/admin/devices" },
  { label: "Paket Menu Air", href: "/admin/packages" },
  { label: "Uji Sensor & Buzzer", href: "/admin/sensor-test" },
  { label: "Log Aktivitas", href: "/admin/logs" },
];

export interface HeadbarProps {
  title?: string;
  badge?: string;
  navLinks?: NavLinkItem[];
  kioskHref?: string;
}

export default function Headbar({
  title = "WaterVend Admin",
  badge = "WV",
  navLinks = DEFAULT_ADMIN_NAV_LINKS,
  kioskHref = "/",
}: HeadbarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<{ username: string; role: string } | null>(null);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.user) setUser(data.user);
      })
      .catch(() => {});
  }, []);

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/admin/login");
    router.refresh();
  };

  return (
    <header className="bg-white border-b border-slate-200 sticky top-0 z-30 shadow-xs">
      <div className="max-w-6xl mx-auto px-3 sm:px-6 h-14 sm:h-16 flex items-center justify-between">
        <div className="flex items-center gap-4 sm:gap-6">
          <Link href="/admin" className="flex items-center gap-2 font-bold text-base sm:text-lg text-slate-900">
            <span className="p-1 sm:p-1.5 rounded-lg bg-blue-600 text-white font-mono text-xs sm:text-sm">{badge}</span>
            <span className="truncate max-w-[160px] sm:max-w-none">{title}</span>
          </Link>

          <nav className="hidden md:flex items-center gap-1 text-sm">
            {navLinks.map((link) => {
              const isActive = pathname === link.href;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`px-3 py-1.5 rounded-md font-medium transition-colors ${
                    isActive
                      ? "bg-slate-100 text-slate-900 font-semibold"
                      : "text-slate-600 hover:text-slate-900 hover:bg-slate-50"
                  }`}
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="flex items-center gap-2 sm:gap-3 text-xs sm:text-sm">
          {kioskHref && (
            <Link
              href={kioskHref}
              className="hidden sm:inline-block px-3 py-1.5 rounded-md border border-slate-300 text-slate-700 hover:bg-slate-50 text-xs font-medium"
            >
              Layar Kiosk ↗
            </Link>
          )}

          {user && (
            <span className="text-xs text-slate-500 font-mono hidden lg:inline-block">
              {user.username} ({user.role})
            </span>
          )}

          <button
            type="button"
            onClick={handleLogout}
            className="px-2.5 py-1.5 sm:px-3 sm:py-1.5 rounded-md bg-red-50 hover:bg-red-100 active:bg-red-200 text-red-700 border border-red-200 text-xs font-semibold cursor-pointer transition-colors"
          >
            Keluar
          </button>
        </div>
      </div>

      {/* Mobile Navigation bar with touch scrolling */}
      <div className="md:hidden flex border-t border-slate-100 px-3 py-2 gap-1.5 overflow-x-auto text-xs bg-slate-50 scrollbar-none items-center">
        {navLinks.map((link) => {
          const isActive = pathname === link.href;
          return (
            <Link
              key={link.href}
              href={link.href}
              className={`px-3 py-1.5 rounded-lg font-medium shrink-0 transition-colors whitespace-nowrap active:scale-95 ${
                isActive
                  ? "bg-blue-600 text-white shadow-xs font-semibold"
                  : "bg-white text-slate-700 border border-slate-200 hover:bg-slate-100"
              }`}
            >
              {link.label}
            </Link>
          );
        })}
        {kioskHref && (
          <Link
            href={kioskHref}
            className="px-3 py-1.5 rounded-lg font-medium shrink-0 bg-blue-50 text-blue-700 border border-blue-200 whitespace-nowrap active:scale-95 text-xs"
          >
            Kiosk ↗
          </Link>
        )}
      </div>
    </header>
  );
}

export { Headbar as AdminHeadbar };
