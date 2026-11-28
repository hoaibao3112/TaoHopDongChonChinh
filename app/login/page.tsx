'use client';

import React, { useState, Suspense } from 'react';
import Image from 'next/image';
import { useSearchParams } from 'next/navigation';

function LoginFormContent() {
  const searchParams = useSearchParams();

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

      const data = (await res.json()) as {
        error?: string;
        success?: boolean;
        redirectUrl?: string;
        role?: string;
      };

      if (!res.ok) {
        throw new Error(data.error || 'Mật khẩu không đúng');
      }

      // Nếu người dùng đi từ 1 link cụ thể (?redirect=/dieu-phoi-pt...) -> ưu tiên quay lại đúng link đó
      const rawRedirect = searchParams.get('redirect');
      const safeRedirect =
        rawRedirect && rawRedirect.startsWith('/') && !rawRedirect.startsWith('//') && rawRedirect !== '/login'
          ? rawRedirect
          : null;
      const targetUrl =
        safeRedirect && safeRedirect !== '/' ? safeRedirect : data.redirectUrl || safeRedirect || '/';
      window.location.assign(targetUrl);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Đã có lỗi xảy ra');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-12 relative overflow-hidden">
      <div className="absolute -top-32 -left-32 w-96 h-96 bg-blue-100 rounded-full blur-3xl pointer-events-none opacity-60" />
      <div className="absolute -bottom-32 -right-32 w-96 h-96 bg-indigo-100 rounded-full blur-3xl pointer-events-none opacity-60" />

      <div className="w-full max-w-md space-y-8 rounded-3xl border border-slate-200/90 bg-white/95 p-8 shadow-xl shadow-slate-200/50 backdrop-blur-md sm:p-10 relative z-10">
        <div className="text-center">
          <div className="mx-auto flex h-24 w-24 items-center justify-center rounded-2xl bg-white p-2 shadow-lg shadow-emerald-500/10 ring-1 ring-slate-200">
            <Image
              src="/logo.png"
              alt="Logo XNK Chơn Chính"
              width={96}
              height={96}
              className="h-full w-full object-contain"
              priority
            />
          </div>
          <h2 className="mt-5 text-2xl font-black tracking-tight text-slate-900 sm:text-3xl">
            Hệ Thống Nội Bộ
          </h2>
          <p className="mt-2 text-xs text-slate-500 font-medium">
            Quản trị &amp; Điều hành &bull; <span className="font-bold text-emerald-700">CÔNG TY TNHH XNK</span> <span className="font-black text-red-700">CHƠN CHÍNH</span>
          </p>
        </div>

        <form onSubmit={handleSubmit} className="mt-8 space-y-5">
          {error && (
            <div className="rounded-2xl border border-rose-200 bg-rose-50/90 p-3.5 text-xs font-semibold text-rose-800 shadow-2xs">
              ⚠️ {error}
            </div>
          )}

          <div>
            <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-700">
              Mật khẩu truy cập
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Nhập mật khẩu hệ thống..."
                required
                autoFocus
                className="w-full rounded-xl border border-slate-300 bg-white pl-4 pr-11 py-3 text-sm text-slate-900 shadow-2xs transition-all focus:border-blue-600 focus:outline-none focus:ring-3 focus:ring-blue-100 placeholder:text-slate-400"
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                title={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                className="absolute inset-y-0 right-0 flex items-center px-3 text-slate-400 hover:text-slate-700 cursor-pointer"
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
            className="w-full flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-4 py-3.5 text-sm font-bold text-white shadow-md shadow-blue-500/20 transition-all hover:opacity-95 active:scale-[0.99] disabled:opacity-50 disabled:shadow-none cursor-pointer"
          >
            {isSubmitting ? (
              <>
                <svg className="h-4 w-4 animate-spin text-white" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                </svg>
                <span>Đang xác thực...</span>
              </>
            ) : (
              <span>Đăng nhập hệ thống</span>
            )}
          </button>
        </form>

        <div className="border-t border-slate-100 pt-5 text-center text-xs text-slate-400">
          Bảo vệ bằng cookie phiên &bull; Tuân thủ an ninh dữ liệu
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center text-sm text-slate-500">Đang tải...</div>}>
      <LoginFormContent />
    </Suspense>
  );
}
