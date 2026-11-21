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
  const canAccessBaoCao = role === 'baocao' || role === 'admin';
  const canAccessDangTai = role === 'dangtai' || role === 'admin';

  return (
    <header className="sticky top-0 z-30 shadow-sm">
      {/* ── Tầng 1: Banner Logo Full Width ─────────────────────────────── */}
      <div className="w-full bg-gradient-to-r from-emerald-900 via-emerald-800 to-emerald-900 relative overflow-hidden">
        {/* Hiệu ứng nền trang trí */}
        <div className="absolute inset-0 opacity-10 pointer-events-none">
          <div className="absolute -left-20 -top-10 h-48 w-48 rounded-full bg-white/30 blur-3xl" />
          <div className="absolute right-1/4 -top-8 h-32 w-32 rounded-full bg-yellow-300/40 blur-2xl" />
          <div className="absolute right-10 top-0 h-24 w-24 rounded-full bg-emerald-400/50 blur-xl" />
        </div>

        <div className={`relative mx-auto flex ${isDangTai ? 'w-full px-4 sm:px-6 lg:px-10' : 'max-w-screen-2xl px-6 sm:px-8'} items-center justify-between py-2`}>
          {/* Logo + Tên công ty */}
          <div className="flex items-center gap-3 sm:gap-4">
            {/* Logo */}
            <div className="flex h-10 w-10 sm:h-12 sm:w-12 shrink-0 items-center justify-center rounded-xl bg-white shadow-md ring-2 ring-white/30 p-1 overflow-hidden">
              <Image
                src="/logo.png"
                alt="Logo XNK Chơn Chính"
                width={44}
                height={44}
                className="h-full w-full object-contain"
                priority
              />
            </div>

            {/* Tên công ty */}
            <div className="flex flex-col justify-center">
              <span className="text-[9px] sm:text-[11px] font-black uppercase tracking-[0.2em] text-emerald-200 leading-tight">
                CÔNG TY TNHH XUẤT NHẬP KHẨU
              </span>
              <span className="text-lg sm:text-2xl font-black tracking-tight text-white uppercase leading-none drop-shadow-sm">
                CHƠN CHÍNH
              </span>
              <span className="hidden sm:block text-[10px] text-emerald-300/80 font-medium mt-0.5 tracking-wide">
                Hợp đồng · Tính lương nhân công nông sản
              </span>
            </div>

            {/* Divider dọc */}
            <div className="hidden lg:block w-px h-10 bg-white/20 mx-2" />

            {/* Badge hệ thống */}
            <span className="hidden lg:inline-flex items-center gap-1.5 rounded-full bg-white/10 border border-white/20 px-3 py-1 text-[11px] font-semibold text-emerald-100 backdrop-blur-sm">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Hệ thống nội bộ
            </span>
          </div>

          {/* Right: User Role Badge + Logout */}
          <div className="flex items-center gap-2 sm:gap-3">
            {role === 'dangtai' && (
              <div className="hidden sm:inline-flex items-center gap-1.5 rounded-xl border border-blue-300/50 bg-blue-900/40 px-3 py-1 text-xs font-bold text-blue-100 backdrop-blur-sm">
                <span>🚛</span>
                <span>Đăng Tài Lúa Xe</span>
              </div>
            )}
            {role === 'baocao' && (
              <div className="hidden sm:inline-flex items-center gap-1.5 rounded-xl border border-emerald-300/50 bg-emerald-900/40 px-3 py-1 text-xs font-bold text-emerald-100 backdrop-blur-sm">
                <span>📊</span>
                <span>Báo Cáo Chưa Xay</span>
              </div>
            )}
            {role === 'payroll' && (
              <div className="hidden sm:inline-flex items-center gap-1.5 rounded-xl border border-amber-300/50 bg-amber-900/40 px-3 py-1 text-xs font-bold text-amber-100 backdrop-blur-sm">
                <span>👤</span>
                <span>Hoài Bảo (Tính Lương)</span>
              </div>
            )}
            {role === 'contracts' && (
              <div className="hidden sm:inline-flex items-center gap-1.5 rounded-xl border border-blue-300/50 bg-blue-900/40 px-3 py-1 text-xs font-bold text-blue-100 backdrop-blur-sm">
                <span>👤</span>
                <span>Chơn Chính (Hợp Đồng)</span>
              </div>
            )}
            {role === 'husk' && (
              <div className="hidden sm:inline-flex items-center gap-1.5 rounded-xl border border-amber-300/50 bg-amber-900/40 px-3 py-1 text-xs font-bold text-amber-100 backdrop-blur-sm">
                <span>🚛</span>
                <span>Đội Trấu (teamlua)</span>
              </div>
            )}
            {role === 'admin' && (
              <div className="hidden sm:inline-flex items-center gap-1.5 rounded-xl border border-indigo-300/50 bg-indigo-900/40 px-3 py-1 text-xs font-bold text-indigo-100 backdrop-blur-sm">
                <span>👑</span>
                <span>Quản Trị Viên</span>
              </div>
            )}

            <form action="/api/auth/logout" method="POST">
              <button
                type="submit"
                className="group flex items-center gap-1.5 rounded-xl border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-semibold text-white/90 backdrop-blur-sm transition-all hover:bg-red-600/80 hover:border-red-400/50 hover:text-white cursor-pointer"
              >
                <svg
                  className="w-3.5 h-3.5 text-white/70 group-hover:text-white transition-colors"
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
      </div>

      {/* ── Tầng 2: Navigation Tabs ─────────────────────────────────────── */}
      <div className="w-full border-b border-slate-200/80 bg-white/95 backdrop-blur-md">
        <div className={`mx-auto ${isDangTai ? 'w-full px-4 sm:px-6 lg:px-10' : 'max-w-screen-2xl px-6 sm:px-8'}`}>
          <nav className="flex items-center gap-0.5 overflow-x-auto scrollbar-none py-1">
            {canAccessContracts && (
              <Link
                href="/"
                className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                  isContract
                    ? 'bg-blue-50 text-blue-700 border border-blue-200'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
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
                  className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                    isPayroll
                      ? 'bg-amber-50 text-amber-700 border border-amber-200'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                  }`}
                >
                  <span>🌾</span>
                  <span>Xuất Lúa CS1</span>
                </Link>

                <Link
                  href="/nhap-say-cs1"
                  className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                    isNhapSayCS1
                      ? 'bg-orange-50 text-orange-800 border border-orange-200'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                  }`}
                >
                  <span>🌾</span>
                  <span>Nhập Sấy CS1</span>
                </Link>

                <Link
                  href="/nhap-say"
                  className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                    isNhapSay
                      ? 'bg-orange-50 text-orange-700 border border-orange-200'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                  }`}
                >
                  <span>🔥</span>
                  <span>Lương Đội Dương (CS2)</span>
                </Link>

                <Link
                  href="/nhap-say-tm"
                  className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                    isNhapSayTM
                      ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                  }`}
                >
                  <span>🌾</span>
                  <span>Nhập Sấy NSX TM</span>
                  <span className="rounded-full bg-emerald-600 text-white text-[9px] px-1.5 py-0.5 font-bold">Mới</span>
                </Link>

                <Link
                  href="/xuat-nsx-tm"
                  className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                    isXuatNSXTM
                      ? 'bg-amber-50 text-amber-800 border border-amber-200'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                  }`}
                >
                  <span>🚛</span>
                  <span>Xuất NSX TM</span>
                  <span className="rounded-full bg-amber-600 text-white text-[9px] px-1.5 py-0.5 font-bold">Mới</span>
                </Link>

                <Link
                  href="/chum-lo"
                  className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                    isChumLo
                      ? 'bg-rose-50 text-rose-700 border border-rose-200'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
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
                className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                  isXuatTrau
                    ? 'bg-amber-50 text-amber-900 border border-amber-300'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                <span>🚛</span>
                <span>Nhập Trấu (Xe &amp; Ghe)</span>
                <span className="rounded-full bg-amber-600 text-white text-[9px] px-2 py-0.5 font-bold">Mới</span>
              </Link>
            )}

            {canAccessBaoCao && (
              <Link
                href="/bao-cao-chua-xay"
                className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                  isBaoCao
                    ? 'bg-emerald-50 text-emerald-800 border border-emerald-200 font-black'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                <span>🌾</span>
                <span>Báo Cáo Chưa Xay</span>
                <span className="rounded-full bg-emerald-600 text-white text-[9px] px-1.5 py-0.5 font-bold">Mới</span>
              </Link>
            )}

            {canAccessDangTai && (
              <Link
                href="/dang-tai"
                className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                  isDangTai
                    ? 'bg-blue-50 text-blue-900 border border-blue-200 font-black'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                <span>🚛</span>
                <span>Đăng Tài Xe</span>
                <span className="rounded-full bg-blue-600 text-white text-[9px] px-1.5 py-0.5 font-bold">Mới</span>
              </Link>
            )}
          </nav>
        </div>
      </div>
    </header>
  );
}


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
            <div className="flex flex-col justify-center">
              <span className="text-[10px] sm:text-[11px] font-black uppercase tracking-wider text-emerald-700 leading-tight">
                CÔNG TY TNHH XUẤT NHẬP KHẨU
              </span>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-base sm:text-lg font-black tracking-tight text-red-700 uppercase leading-none">
                  CHƠN CHÍNH
                </span>
                <span className="hidden md:inline-flex items-center rounded-md bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700 ring-1 ring-inset ring-emerald-600/20">
                  Hệ thống nội bộ
                </span>
              </div>
              <p className="text-[10px] text-slate-400 hidden lg:block font-medium mt-0.5">
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
