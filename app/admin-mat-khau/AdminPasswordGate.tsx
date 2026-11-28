'use client';

import React, { useState } from 'react';
import Image from 'next/image';

export default function AdminPasswordGate() {
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
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

      if (data.role !== 'admin') {
        throw new Error('Mật khẩu này không có quyền truy cập Trang Admin Quản Lý Mật Khẩu (yêu cầu mật khẩu hoaibao)');
      }

      window.location.assign('/admin-mat-khau');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Đã có lỗi xảy ra');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-900 px-4 py-12 relative overflow-hidden">
      <div className="absolute -top-32 -left-32 w-96 h-96 bg-rose-600/20 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-32 -right-32 w-96 h-96 bg-orange-600/20 rounded-full blur-3xl pointer-events-none" />

      <div className="w-full max-w-md space-y-8 rounded-3xl border border-white/10 bg-slate-800/90 p-8 shadow-2xl backdrop-blur-xl sm:p-10 relative z-10 text-white">
        <div className="text-center">
          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-2xl bg-white p-2 shadow-lg shadow-rose-500/20 ring-1 ring-white/20">
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
            Admin Quản Lý Mật Khẩu
          </h2>
          <p className="mt-1 text-xs text-rose-200">
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
            <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-rose-200">
              Mật khẩu Admin (hoaibao)
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Nhập mật khẩu hoaibao..."
                required
                autoFocus
                className="w-full rounded-xl border border-slate-700 bg-slate-900/90 pl-4 pr-11 py-3 text-sm text-white shadow-2xs transition-all focus:border-rose-500 focus:outline-none focus:ring-2 focus:ring-rose-500/30 placeholder:text-slate-500"
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                className="absolute inset-y-0 right-0 flex items-center px-3 text-slate-400 hover:text-white cursor-pointer"
              >
                {showPassword ? (
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                  </svg>
                ) : (
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                )}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={isSubmitting || !password}
            className="w-full flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-rose-600 to-orange-600 px-4 py-3.5 text-sm font-bold text-white shadow-lg shadow-rose-600/30 transition-all hover:opacity-95 active:scale-[0.99] disabled:opacity-50 cursor-pointer"
          >
            {isSubmitting ? 'Đang kiểm tra...' : 'Mở Trang Quản Lý Mật Khẩu'}
          </button>
        </form>
      </div>
    </div>
  );
}
