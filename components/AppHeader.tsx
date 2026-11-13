'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { UserRole } from '@/lib/auth';

export default function AppHeader() {
  const pathname = usePathname();
  const [role, setRole] = useState<UserRole | null>(null);

  useEffect(() => {
    // Đọc cookie phân quyền trên client
    const match = document.cookie.match(/(?:^|; )auth_user_role=([^;]*)/);
    const val = match ? (decodeURIComponent(match[1]) as UserRole) : null;
    if (val === 'payroll' || val === 'contracts' || val === 'admin' || val === 'husk') {
      setRole(val);
    }
  }, []);

  const isContract = pathname === '/' || pathname.startsWith('/contracts');
  const isPayroll = pathname.startsWith('/tinh-luong');
  const isNhapSay = pathname.startsWith('/nhap-say');
  const isChumLo = pathname.startsWith('/chum-lo');
  const isXuatTrau = pathname.startsWith('/xuat-trau');

  // Quyền truy cập các tab
  const canAccessContracts = role === 'contracts' || role === 'admin' || role === null;
  const canAccessPayroll = role === 'payroll' || role === 'admin' || role === null;
  const canAccessHusk = role === 'husk' || role === 'payroll' || role === 'admin' || role === null;

  return (
    <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/90 backdrop-blur-md transition-all shadow-xs">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-2.5 sm:px-6">
        {/* Left: Branding & Nav Tabs */}
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-tr from-blue-700 to-indigo-600 text-xl text-white shadow-md shadow-blue-500/20 ring-1 ring-white/30">
              🌾
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-base font-bold text-slate-900 leading-tight tracking-tight">
                  XNK Chơn Chính
                </span>
                <span className="hidden md:inline-flex items-center rounded-md bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-600/20">
                  Hệ thống nội bộ
                </span>
              </div>
              <p className="text-xs text-slate-500 hidden sm:block">
                Hợp đồng &amp; Tính lương nhân công nông sản
              </p>
            </div>
          </div>

          {/* Navigation Tabs (Hiển thị phân quyền theo vai trò) */}
          <nav className="flex items-center gap-1 rounded-xl bg-slate-100/80 p-1 border border-slate-200/70">
            {canAccessContracts && (
              <Link
                href="/"
                className={`flex items-center gap-2 rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-all ${isContract
                    ? 'bg-white text-blue-700 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
                  }`}
              >
                <span>📄</span>
                <span>Tạo Hợp Đồng</span>
              </Link>
            )}

            {canAccessPayroll && (
              <>
                <Link
                  href="/tinh-luong"
                  className={`flex items-center gap-2 rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-all ${isPayroll
                      ? 'bg-white text-amber-700 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
                    }`}
                >
                  <span>🌾</span>
                  <span>Xuất Lúa (CS1 & CS2)</span>
                </Link>

                <Link
                  href="/nhap-say"
                  className={`flex items-center gap-2 rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-all ${isNhapSay
                      ? 'bg-white text-orange-700 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
                    }`}
                >
                  <span>🔥</span>
                  <span>Nhập Sấy CS2</span>
                </Link>

                <Link
                  href="/chum-lo"
                  className={`flex items-center gap-2 rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-all ${isChumLo
                      ? 'bg-white text-rose-700 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
                    }`}
                >
                  <span>🏭</span>
                  <span>Chụm Lò CS1</span>
                </Link>
              </>
            )}

            {canAccessHusk && (
              <Link
                href="/xuat-trau"
                className={`flex items-center gap-2 rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-all ${isXuatTrau
                    ? 'bg-white text-amber-900 shadow-xs ring-1 ring-amber-400'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
                  }`}
              >
                <span>🚛</span>
                <span>Nhập Trấu (Xe &amp; Ghe)</span>
                <span className="rounded-full bg-amber-600 text-white text-[10px] px-2 py-0.5 font-bold shadow-2xs">
                  Mới
                </span>
              </Link>
            )}
          </nav>
        </div>

        {/* Right: User Role Badge & Logout */}
        <div className="flex items-center gap-3">
          {role === 'payroll' && (
            <div className="hidden sm:inline-flex items-center gap-1.5 rounded-xl border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-bold text-amber-800 shadow-2xs">
              <span>👤</span>
              <span>Hoài Bảo (Tính Lương)</span>
            </div>
          )}

          {role === 'contracts' && (
            <div className="hidden sm:inline-flex items-center gap-1.5 rounded-xl border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-bold text-blue-800 shadow-2xs">
              <span>👤</span>
              <span>Chơn Chính (Hợp Đồng)</span>
            </div>
          )}

          {role === 'husk' && (
            <div className="hidden sm:inline-flex items-center gap-1.5 rounded-xl border border-amber-300 bg-amber-50 px-3 py-1 text-xs font-bold text-amber-900 shadow-2xs">
              <span>🚛</span>
              <span>Đội Trấu (teamlua)</span>
            </div>
          )}

          {role === 'admin' && (
            <div className="hidden sm:inline-flex items-center gap-1.5 rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-1 text-xs font-bold text-indigo-800 shadow-2xs">
              <span>👑</span>
              <span>Quản Trị Viên</span>
            </div>
          )}

          <form action="/api/auth/logout" method="POST">
            <button
              type="submit"
              className="group flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-semibold text-slate-600 shadow-2xs transition-all hover:border-red-200 hover:bg-red-50 hover:text-red-700 cursor-pointer"
            >
              <svg
                className="w-3.5 h-3.5 text-slate-400 group-hover:text-red-600 transition-colors"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
                />
              </svg>
              <span className="hidden sm:inline">Đăng xuất</span>
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
