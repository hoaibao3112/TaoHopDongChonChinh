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
      if (
        val === 'payroll' ||
        val === 'contracts' ||
        val === 'admin' ||
        val === 'husk' ||
        val === 'baocao' ||
        val === 'dangtai'
      ) {
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
    <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/95 backdrop-blur-md transition-all shadow-xs">
      {/* ── TẦNG 1: LOGO & TÊN CÔNG TY TRẢI DÀI NGANG MÀN HÌNH + THÔNG TIN USER ── */}
      <div className="w-full px-4 sm:px-6 lg:px-8 py-2.5">
        <div className="flex items-center justify-between gap-4">
          {/* Logo + Tên công ty trải dài ngang */}
          <div className="flex items-center gap-3.5 min-w-0">
            {/* Logo */}
            <div className="flex h-12 w-12 sm:h-13 sm:w-13 shrink-0 items-center justify-center rounded-2xl bg-white shadow-xs ring-1 ring-slate-200 p-1.5 overflow-hidden">
              <Image
                src="/logo.png"
                alt="Logo XNK Chơn Chính"
                width={48}
                height={48}
                className="h-full w-full object-contain"
                priority
              />
            </div>

            {/* Khối tên trải dài ngang đẹp mắt */}
            <div className="flex flex-col justify-center min-w-0">
              <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
                <span className="text-[11px] sm:text-[13px] font-black uppercase tracking-wider text-emerald-700 leading-tight">
                  CÔNG TY TNHH XUẤT NHẬP KHẨU
                </span>
                <span className="text-lg sm:text-2xl font-black tracking-tight text-red-700 uppercase leading-none drop-shadow-2xs">
                  CHƠN CHÍNH
                </span>
                <span className="hidden md:inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700 ring-1 ring-inset ring-emerald-600/20">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  Hệ thống nội bộ
                </span>
              </div>
              <p className="text-[11px] text-slate-400 font-medium hidden sm:block mt-0.5">
                Hợp đồng &amp; Tính lương nhân công nông sản
              </p>
            </div>
          </div>

          {/* User Role Badge & Đăng Xuất */}
          <div className="flex items-center gap-2.5 shrink-0">
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
                className="group flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 shadow-2xs transition-all hover:border-red-200 hover:bg-red-50 hover:text-red-700 cursor-pointer"
                title="Đăng xuất khỏi hệ thống"
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
      </div>

      {/* ── TẦNG 2: THANH MENU TABS DÀI RỘNG NGANG MÀN HÌNH ── */}
      <div className="w-full border-t border-slate-100 bg-slate-50/70 px-4 sm:px-6 lg:px-8 py-1.5">
        <nav className="flex items-center gap-1 overflow-x-auto no-scrollbar scrollbar-none">
          {canAccessContracts && (
            <Link
              href="/"
              className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                isContract
                  ? 'bg-white text-blue-700 shadow-xs ring-1 ring-blue-500/20 font-bold'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-white/80'
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
                    ? 'bg-white text-amber-800 shadow-xs ring-1 ring-amber-500/20 font-bold'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-white/80'
                }`}
              >
                <span>🌾</span>
                <span>Xuất Lúa CS1</span>
              </Link>

              <Link
                href="/nhap-say-cs1"
                className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                  isNhapSayCS1
                    ? 'bg-white text-orange-800 shadow-xs ring-1 ring-orange-500/20 font-bold'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-white/80'
                }`}
              >
                <span>🌾</span>
                <span>Nhập Sấy CS1</span>
              </Link>

              <Link
                href="/nhap-say"
                className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                  isNhapSay
                    ? 'bg-white text-orange-700 shadow-xs ring-1 ring-orange-500/20 font-bold'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-white/80'
                }`}
              >
                <span>🔥</span>
                <span>Lương Đội Dương (CS2)</span>
              </Link>

              <Link
                href="/nhap-say-tm"
                className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                  isNhapSayTM
                    ? 'bg-white text-emerald-800 shadow-xs ring-1 ring-emerald-500/30 font-bold'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-white/80'
                }`}
              >
                <span>🌾</span>
                <span>Nhập Sấy NSX TM</span>
                <span className="rounded-full bg-emerald-600 text-white text-[9px] px-1.5 py-0.5 font-bold shadow-2xs">
                  Mới
                </span>
              </Link>

              <Link
                href="/xuat-nsx-tm"
                className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                  isXuatNSXTM
                    ? 'bg-white text-amber-800 shadow-xs ring-1 ring-amber-500/30 font-bold'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-white/80'
                }`}
              >
                <span>🚛</span>
                <span>Xuất NSX TM</span>
                <span className="rounded-full bg-amber-600 text-white text-[9px] px-1.5 py-0.5 font-bold shadow-2xs">
                  Mới
                </span>
              </Link>

              <Link
                href="/chum-lo"
                className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                  isChumLo
                    ? 'bg-white text-rose-700 shadow-xs ring-1 ring-rose-500/20 font-bold'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-white/80'
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
                  ? 'bg-white text-amber-900 shadow-xs ring-1 ring-amber-400 font-bold'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-white/80'
              }`}
            >
              <span>🚛</span>
              <span>Nhập Trấu (Xe &amp; Ghe)</span>
              <span className="rounded-full bg-amber-600 text-white text-[9px] px-1.5 py-0.5 font-bold shadow-2xs">
                Mới
              </span>
            </Link>
          )}

          {canAccessBaoCao && (
            <Link
              href="/bao-cao-chua-xay"
              className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                isBaoCao
                  ? 'bg-white text-emerald-800 shadow-xs ring-2 ring-emerald-500/40 font-black'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-white/80'
              }`}
            >
              <span>🌾</span>
              <span>Báo Cáo Chưa Xay</span>
              <span className="rounded-full bg-emerald-600 text-white text-[9px] px-1.5 py-0.5 font-bold shadow-2xs">
                Mới
              </span>
            </Link>
          )}

          {canAccessDangTai && (
            <Link
              href="/dang-tai"
              className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                isDangTai
                  ? 'bg-white text-blue-900 shadow-xs ring-2 ring-blue-500/40 font-black'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-white/80'
              }`}
            >
              <span>🚛</span>
              <span>Đăng Tài Xe</span>
              <span className="rounded-full bg-blue-600 text-white text-[9px] px-1.5 py-0.5 font-bold shadow-2xs">
                Mới
              </span>
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}
