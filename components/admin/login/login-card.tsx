"use client";

import Link from "next/link";

export interface LoginCardProps {
  username: string;
  setUsername: (val: string) => void;
  password: string;
  setPassword: (val: string) => void;
  loading: boolean;
  error: string | null;
  onSubmit: (e: React.FormEvent) => void;
}

export default function LoginCard({
  username,
  setUsername,
  password,
  setPassword,
  loading,
  error,
  onSubmit,
}: LoginCardProps) {
  return (
    <div className="w-full max-w-sm bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 shadow-sm space-y-4 sm:space-y-5">
      <div className="text-center space-y-1">
        <div className="inline-block p-1.5 sm:p-2 rounded-lg bg-blue-50 text-blue-700 font-bold text-base sm:text-lg mb-0.5">
          WaterVend
        </div>
        <h1 className="text-lg sm:text-xl font-bold text-slate-900">Login Pengelola</h1>
        <p className="text-xs text-slate-500 leading-relaxed">
          Masukkan akun admin untuk mengakses kontrol dispenser
        </p>
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 text-red-800 rounded-lg text-xs font-medium">
          {error}
        </div>
      )}

      <form onSubmit={onSubmit} className="space-y-3.5 sm:space-y-4 text-sm">
        <div>
          <label className="block text-slate-700 font-medium mb-1 text-xs sm:text-sm" htmlFor="username">
            Username
          </label>
          <input
            id="username"
            type="text"
            required
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="admin"
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
          />
        </div>

        <div>
          <label className="block text-slate-700 font-medium mb-1 text-xs sm:text-sm" htmlFor="password">
            Password
          </label>
          <input
            id="password"
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-blue-600 hover:bg-blue-700 active:bg-blue-800 disabled:opacity-50 text-white font-medium py-2.5 rounded-lg text-sm transition-colors shadow-sm cursor-pointer active:scale-95"
        >
          {loading ? "Memproses..." : "Masuk ke Panel Admin"}
        </button>
      </form>

      <div className="text-center pt-2 border-t border-slate-100">
        <Link href="/" className="text-xs text-blue-600 hover:underline">
          ← Kembali ke Kiosk Pembelian Air
        </Link>
      </div>
    </div>
  );
}
