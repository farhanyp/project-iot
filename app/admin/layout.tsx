"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
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

  const navLinks = [
    { label: "Dashboard", href: "/admin" },
    { label: "Manajemen Perangkat", href: "/admin/devices" },
    { label: "Log Aktivitas", href: "/admin/logs" },
  ];

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans">
      {/* Top Navbar */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30 shadow-xs">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <Link href="/admin" className="flex items-center gap-2 font-bold text-lg text-slate-900">
              <span className="p-1.5 rounded-lg bg-blue-600 text-white font-mono text-sm">WV</span>
              <span>WaterVend Admin</span>
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

          <div className="flex items-center gap-3 text-sm">
            <Link
              href="/"
              className="hidden sm:inline-block px-3 py-1.5 rounded-md border border-slate-300 text-slate-700 hover:bg-slate-50 text-xs font-medium"
            >
              Layar Kiosk Konsumen ↗
            </Link>

            {user && (
              <span className="text-xs text-slate-500 font-mono hidden md:inline-block">
                {user.username} ({user.role})
              </span>
            )}

            <button
              type="button"
              onClick={handleLogout}
              className="px-3 py-1.5 rounded-md bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 text-xs font-semibold cursor-pointer transition-colors"
            >
              Keluar
            </button>
          </div>
        </div>

        {/* Mobile Navigation bar */}
        <div className="md:hidden flex border-t border-slate-100 px-4 py-2 gap-2 overflow-x-auto text-xs bg-slate-50">
          {navLinks.map((link) => {
            const isActive = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`px-3 py-1 rounded-md font-medium shrink-0 ${
                  isActive ? "bg-white text-slate-900 shadow-xs font-bold" : "text-slate-600"
                }`}
              >
                {link.label}
              </Link>
            );
          })}
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-6xl w-full mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
        {children}
      </main>
    </div>
  );
}
