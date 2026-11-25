'use client';

import React, { useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';

export default function ChiNgocPasswordGate() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ password }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Mật khẩu không đúng');
      }

      if (data.role !== 'chingoc' && data.role !== 'admin') {
        throw new Error('Mật khẩu này không có quyền truy cập Báo Cáo Nhập Ngày');
      }

      router.refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Đã có lỗi xảy ra');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-900 px-4 py-12 relative overflow-hidden">
      <div className="absolute -top-32 -left-32 w-96 h-96 bg-indigo-600/20 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-32 -right-32 w-96 h-96 bg-blue-600/20 rounded-full blur-3xl pointer-events-none" />

      <div className="w-full max-w-md space-y-8 rounded-3xl border border-white/10 bg-slate-800/90 p-8 shadow-2xl backdrop-blur-xl sm:p-10 relative z-10 text-white">
        <div className="text-center">
          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-2xl bg-white p-2 shadow-lg shadow-indigo-500/20 ring-1 ring-white/20">
            <Image
              src="/logo.png"
              alt="Logo XNK Chơn Chính"
              width={80}
              height={80}
              className="h-full w-full object-contain"
              priority
            />
          </div>
          <h2 className="mt-5 text-xl font-black tracking-tight text-white sm:text-2xl">
            Báo Cáo Lúa Tươi &amp; Khô Nhập Ngày
          </h2>
          <p className="mt-1 text-xs text-indigo-200">
            Hệ thống nội bộ &bull; <span className="font-bold text-emerald-400">CÔNG TY TNHH XNK</span>{' '}
            <span className="font-black text-rose-300">CHƠN CHÍNH</span>
          </p>
        </div>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          {error && (
            <div className="rounded-2xl border border-rose-500/50 bg-rose-950/80 p-3.5 text-xs font-semibold text-rose-200 shadow-2xs">
              ⚠️ {error}
            </div>
          )}

          <div>
            <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-indigo-200">
              Mật khẩu truy cập
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Nhập mật khẩu (chingoc)..."
              required
              autoFocus
              className="w-full rounded-xl border border-slate-700 bg-slate-900/90 px-4 py-3 text-sm text-white shadow-2xs transition-all focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 placeholder:text-slate-500"
            />
          </div>

          <button
            type="submit"
            disabled={isSubmitting || !password}
            className="w-full flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-blue-600 px-4 py-3.5 text-sm font-bold text-white shadow-lg shadow-indigo-600/30 transition-all hover:opacity-95 active:scale-[0.99] disabled:opacity-50 cursor-pointer"
          >
            {isSubmitting ? 'Đang kiểm tra...' : 'Mở Báo Cáo Nhập Ngày'}
          </button>
        </form>
      </div>
    </div>
  );
}
