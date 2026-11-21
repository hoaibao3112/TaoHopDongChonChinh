'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { UserRole } from '@/lib/auth';

export default function AppHeader() {
  const pathname = usePathname();
  const [role, setRole] = useState<UserRole | null>(() => {
    if (typeof document !== 'undefined') {
      const match = document.cookie.match(/(?:^|; )auth_user_role=([^;]*)/);
      const val = match ? (decodeURIComponent(match[1]) as UserRole) : null;
      if (val === 'payroll' || val === 'contracts' || val === 'admin' || val === 'husk' || val === 'baocao' || val === 'dangtai') {
        return val;
      }
    }
    return null;
  });

  const isContract = pathname === '/' || pathname.startsWith('/contracts');
  const isPayroll = pathname.startsWith('/tinh-luong');
  const isNhapSay = pathname === '/nhap-say';
  const isNhapSayCS1 = pathname.startsWith('/nhap-say-cs1');
  const isNhapSayTM = pathname.startsWith('/nhap-say-tm');
  const isXuatNSXTM = pathname.startsWith('/xuat-nsx-tm');
  const isChumLo = pathname.startsWith('/chum-lo');
  const isXuatTrau = pathname.startsWith('/xuat-trau');
  const isBaoCao = pathname.startsWith('/bao-cao-chua-xay');
  const isDangTai = pathname.startsWith('/dang-tai');

  // Quyền truy cập các tab
  const canAccessContracts = role === 'contracts' || role === 'admin' || role === null;
  const canAccessPayroll = role === 'payroll' || role === 'admin' || role === null;
  const canAccessHusk = role === 'husk' || role === 'payroll' || role === 'admin' || role === null;
  // Tab Báo Cáo Chưa Xay: CHỈ hiện khi đăng nhập mật khẩu baocao hoặc admin (KHÔNG hiện khi nhập hoaibao)
  const canAccessBaoCao = role === 'baocao' || role === 'admin';
  // Tab Đăng Tài: CHỈ hiện khi đăng nhập mật khẩu dangtai hoặc admin
  const canAccessDangTai = role === 'dangtai' || role === 'admin';

  return (
    <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/90 backdrop-blur-md transition-all shadow-xs">
      <div className={`mx-auto flex ${isDangTai ? 'w-full px-3 sm:px-6 lg:px-8' : 'max-w-7xl px-4 sm:px-6'} items-center justify-between py-2.5`}>
        {/* Left: Branding & Nav Tabs */}
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white shadow-xs ring-1 ring-slate-200/90 p-1 overflow-hidden">
              <Image
                src="/logo.png"
                alt="Logo XNK Chơn Chính"
                width={40}
                height={40}
                className="h-full w-full object-contain"
                priority
              />
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
                  <span>Xuất Lúa CS1</span>
                </Link>

                <Link
                  href="/nhap-say-cs1"
                  className={`flex items-center gap-2 rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-all ${
                    isNhapSayCS1
                      ? 'bg-white text-orange-800 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
                  }`}
                >
                  <span>🌾</span>
                  <span>Nhập Sấy CS1</span>
                </Link>

                <Link
                  href="/nhap-say"
                  className={`flex items-center gap-2 rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-all ${
                    isNhapSay
                      ? 'bg-white text-orange-700 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
                  }`}
                >
                  <span>🔥</span>
                  <span>Lương Đội Dương (CS2)</span>
                </Link>

                <Link
                  href="/nhap-say-tm"
                  className={`flex items-center gap-2 rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-all ${
                    isNhapSayTM
                      ? 'bg-white text-emerald-800 shadow-xs ring-1 ring-emerald-500/30'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
                  }`}
                >
                  <span>🌾</span>
                  <span>Nhập Sấy NSX TM</span>
                  <span className="rounded-full bg-emerald-600 text-white text-[10px] px-1.5 py-0.5 font-bold shadow-2xs">
                    Mới
                  </span>
                </Link>

                <Link
                  href="/xuat-nsx-tm"
                  className={`flex items-center gap-2 rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-all ${
                    isXuatNSXTM
                      ? 'bg-white text-amber-800 shadow-xs ring-1 ring-amber-500/30'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
                  }`}
                >
                  <span>🚛</span>
                  <span>Xuất NSX TM</span>
                  <span className="rounded-full bg-amber-600 text-white text-[10px] px-1.5 py-0.5 font-bold shadow-2xs">
                    Mới
                  </span>
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

            {canAccessBaoCao && (
              <Link
                href="/bao-cao-chua-xay"
                className={`flex items-center gap-2 rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-all ${
                  isBaoCao
                    ? 'bg-white text-emerald-800 shadow-xs ring-2 ring-emerald-500/40 font-black'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
                }`}
              >
                <span>🌾</span>
                <span>Báo Cáo Chưa Xay</span>
                <span className="rounded-full bg-emerald-600 text-white text-[10px] px-1.5 py-0.5 font-bold shadow-2xs">
                  Mới
                </span>
              </Link>
            )}

            {canAccessDangTai && (
              <Link
                href="/dang-tai"
                className={`flex items-center gap-2 rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-all ${
                  isDangTai
                    ? 'bg-white text-blue-900 shadow-xs ring-2 ring-blue-500/40 font-black'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
                }`}
              >
                <span>🚛</span>
                <span>Đăng Tài Xe</span>
                <span className="rounded-full bg-blue-600 text-white text-[10px] px-1.5 py-0.5 font-bold shadow-2xs">
                  Mới
                </span>
              </Link>
            )}
          </nav>
        </div>

        {/* Right: User Role Badge & Logout */}
        <div className="flex items-center gap-3">
          {role === 'dangtai' && (
            <div className="hidden sm:inline-flex items-center gap-1.5 rounded-xl border border-blue-300 bg-blue-50 px-3 py-1 text-xs font-bold text-blue-900 shadow-2xs">
              <span>🚛</span>
              <span>Đăng Tài Lúa Xe</span>
            </div>
          )}

          {role === 'baocao' && (
            <div className="hidden sm:inline-flex items-center gap-1.5 rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-900 shadow-2xs">
              <span>📊</span>
              <span>Báo Cáo Chưa Xay</span>
            </div>
          )}

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
