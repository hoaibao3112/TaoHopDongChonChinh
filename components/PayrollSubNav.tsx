'use client';

/**
 * PayrollSubNav — Thanh điều hướng nhanh giữa các màn hình tính lương
 *
 * Hiển thị bên dưới AppHeader trên tất cả các trang tính lương.
 * Mỗi tab gắn với 1 URL, tự động highlight trang hiện tại.
 */

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

interface PayrollTab {
  href: string;
  label: string;
  emoji: string;
  description: string;
  color: 'blue' | 'amber' | 'emerald' | 'violet' | 'rose' | 'orange';
}

const PAYROLL_TABS: PayrollTab[] = [
  {
    href: '/tinh-luong',
    label: 'Xuất Lúa CS1/CS2',
    emoji: '🌾',
    description: 'Đội Chú 6 & Đội Dương',
    color: 'blue',
  },
  {
    href: '/nhap-say-cs1',
    label: 'Nhập Sấy CS1',
    emoji: '🏭',
    description: 'Đội Nghị & Đội Nguyên',
    color: 'amber',
  },
  {
    href: '/nhap-say',
    label: 'Nhập Sấy CS2',
    emoji: '🏗️',
    description: 'Đội Dương — Nhập & Xuất',
    color: 'orange',
  },
  {
    href: '/chum-lo',
    label: 'Chụm Lò CS1',
    emoji: '🔥',
    description: 'Đội Nguyên',
    color: 'rose',
  },
  {
    href: '/nhap-say-tm',
    label: 'Nhập Sấy NSX TM',
    emoji: '🚛',
    description: 'Đội Đức & Đội Quý',
    color: 'emerald',
  },
  {
    href: '/xuat-nsx-tm',
    label: 'Xuất NSX TM',
    emoji: '📦',
    description: 'Đội Nam',
    color: 'violet',
  },
];

const COLOR_ACTIVE: Record<PayrollTab['color'], string> = {
  blue: 'bg-blue-50 text-blue-800 border-blue-300 shadow-blue-100',
  amber: 'bg-amber-50 text-amber-800 border-amber-300 shadow-amber-100',
  emerald: 'bg-emerald-50 text-emerald-800 border-emerald-300 shadow-emerald-100',
  violet: 'bg-violet-50 text-violet-800 border-violet-300 shadow-violet-100',
  rose: 'bg-rose-50 text-rose-800 border-rose-300 shadow-rose-100',
  orange: 'bg-orange-50 text-orange-800 border-orange-300 shadow-orange-100',
};

const COLOR_INDICATOR: Record<PayrollTab['color'], string> = {
  blue: 'bg-blue-500',
  amber: 'bg-amber-500',
  emerald: 'bg-emerald-500',
  violet: 'bg-violet-500',
  rose: 'bg-rose-500',
  orange: 'bg-orange-500',
};

export default function PayrollSubNav() {
  const pathname = usePathname();

  return (
    <div className="border-b border-slate-200/60 bg-gradient-to-r from-slate-50 to-white">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        {/* Label */}
        <div className="flex items-center gap-2 pb-0 pt-2">
          <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
            Phân hệ tính lương
          </span>
        </div>

        {/* Scrollable tab row */}
        <div className="flex gap-1.5 overflow-x-auto pb-2 pt-1.5 scrollbar-none">
          {PAYROLL_TABS.map((tab) => {
            const isActive = pathname === tab.href || pathname.startsWith(tab.href + '/');
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={`group flex shrink-0 items-center gap-2 rounded-xl border px-3 py-1.5 text-xs font-semibold transition-all duration-150 ${
                  isActive
                    ? `${COLOR_ACTIVE[tab.color]} border shadow-sm`
                    : 'border-transparent bg-white/0 text-slate-500 hover:bg-white hover:border-slate-200 hover:text-slate-800 hover:shadow-xs'
                }`}
              >
                {/* Chấm màu khi active */}
                {isActive && (
                  <span
                    className={`h-1.5 w-1.5 shrink-0 rounded-full ${COLOR_INDICATOR[tab.color]} animate-pulse`}
                  />
                )}
                <span className="text-sm leading-none">{tab.emoji}</span>
                <span className="font-semibold leading-tight">{tab.label}</span>
                <span
                  className={`hidden sm:inline text-[10px] font-normal leading-tight ${
                    isActive ? 'opacity-70' : 'opacity-0 group-hover:opacity-60'
                  } transition-opacity`}
                >
                  {tab.description}
                </span>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
