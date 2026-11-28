'use client';

import React, { useState } from 'react';
import Link from 'next/link';

interface SubTabItem {
  label: string;
  href: string;
  icon: string;
  description: string;
  badge?: string;
}

interface DashboardModule {
  key: string;
  label: string;
  icon: string;
  circleBg: string;
  textColor: string;
  borderColor: string;
  href?: string;
  subTabs?: SubTabItem[];
}

const DASHBOARD_MODULES: DashboardModule[] = [
  {
    key: 'tao-hop-dong',
    label: 'Tạo Hợp Đồng',
    icon: '📄',
    circleBg: 'bg-blue-600',
    textColor: 'text-slate-800',
    borderColor: 'border-slate-200/80 hover:border-blue-300',
    href: '/tao-hop-dong',
  },
  {
    key: 'phuong-tien',
    label: 'Phương Tiện',
    icon: '🚢',
    circleBg: 'bg-emerald-600',
    textColor: 'text-slate-800',
    borderColor: 'border-slate-200/80 hover:border-emerald-300',
    subTabs: [
      {
        label: 'Xếp Phương Tiện',
        href: '/dieu-phoi-pt',
        icon: '🚢',
        description: 'Điều phối phương tiện Nguyên Nguyên & Ngoài theo ngày',
      },
      {
        label: 'Đăng Tài Xe',
        href: '/dang-tai',
        icon: '🚛',
        description: 'Đăng tài xe & đối chiếu phiếu cân',
      },
    ],
  },
  {
    key: 'tinh-luong',
    label: 'Tính Lương',
    icon: '💰',
    circleBg: 'bg-amber-500',
    textColor: 'text-slate-800',
    borderColor: 'border-slate-200/80 hover:border-amber-300',
    subTabs: [
      {
        label: 'Xuất Lúa CS1',
        href: '/tinh-luong',
        icon: '🌾',
        description: 'Tính lương xuất lúa Cơ Sở 1',
      },
      {
        label: 'Nhập Sấy CS1',
        href: '/nhap-say-cs1',
        icon: '🌾',
        description: 'Tính lương nhập sấy Cơ Sở 1',
      },
      {
        label: 'Lương Đội Dương (CS2)',
        href: '/nhap-say',
        icon: '🔥',
        description: 'Tính lương nhập sấy Đội Dương Cơ Sở 2',
      },
      {
        label: 'Nhập Sấy NSX TM',
        href: '/nhap-say-tm',
        icon: '🌾',
        description: 'Tính lương nhập sấy Nông Sản Xanh TM',
      },
      {
        label: 'Xuất NSX TM',
        href: '/xuat-nsx-tm',
        icon: '🚛',
        description: 'Tính lương xuất hàng Nông Sản Xanh TM',
      },
      {
        label: 'Chụm Lò CS1',
        href: '/chum-lo',
        icon: '🏭',
        description: 'Tính lương đội chụm lò Cơ Sở 1',
      },
      {
        label: 'Nhập Trấu (Xe & Ghe)',
        href: '/xuat-trau',
        icon: '🚛',
        description: 'Quét phiếu cân & tính khối lượng trấu xe/ghe',
      },
    ],
  },
  {
    key: 'bao-cao',
    label: 'Báo Cáo',
    icon: '📊',
    circleBg: 'bg-purple-600',
    textColor: 'text-slate-800',
    borderColor: 'border-slate-200/80 hover:border-purple-300',
    subTabs: [
      {
        label: 'Báo Cáo Chưa Xay',
        href: '/bao-cao-chua-xay',
        icon: '🌾',
        description: 'Tổng hợp lúa khô nằm tài & lúa tươi chờ sấy quy đổi KCS',
      },
      {
        label: 'Báo Cáo Thu Mua Lúa',
        href: '/bao-cao-nhap-ngay',
        icon: '📅',
        description: 'Báo cáo lúa tươi & lúa khô nhập theo ngày, phân loại HĐ & PT',
      },
    ],
  },
  {
    key: 'thong-ke',
    label: 'Thống Kê',
    icon: '📈',
    circleBg: 'bg-indigo-600',
    textColor: 'text-slate-800',
    borderColor: 'border-slate-200/80 hover:border-indigo-300',
    href: '/thong-ke-lua',
  },
  {
    key: 'bao-loi-file-lua',
    label: 'Báo Lỗi File Lúa',
    icon: '🔍',
    circleBg: 'bg-rose-500',
    textColor: 'text-slate-800',
    borderColor: 'border-slate-200/80 hover:border-rose-300',
    href: '/kiem-tra-lua',
  },
];

export default function HomeDashboard() {
  const [selectedModule, setSelectedModule] = useState<DashboardModule | null>(null);

  return (
    <main className="mx-auto max-w-4xl px-4 pt-8 pb-20 sm:px-6">
      <div className="mb-8 text-center">
        <h1 className="text-lg sm:text-xl font-black text-slate-800 tracking-widest uppercase">
          TRANG CHỦ
        </h1>
        <p className="mt-1.5 text-xs sm:text-sm text-slate-500 font-medium">
          Chọn chức năng bạn muốn làm việc
        </p>
      </div>

      {/* Grid 6 module cards giống thiết kế mẫu */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 sm:gap-5">
        {DASHBOARD_MODULES.map((mod) => {
          const cardContent = (
            <>
              <div
                className={`flex h-13 w-13 sm:h-14 sm:w-14 items-center justify-center rounded-full ${mod.circleBg} text-white shadow-sm transition-transform duration-200 group-hover:scale-105`}
              >
                <span className="text-2xl leading-none">{mod.icon}</span>
              </div>
              <span className={`text-center text-sm sm:text-base font-bold ${mod.textColor} leading-snug`}>
                {mod.label}
              </span>
              {mod.subTabs && (
                <span className="text-[11px] font-medium text-slate-400">
                  {mod.subTabs.length} mục
                </span>
              )}
            </>
          );

          if (mod.href) {
            return (
              <Link
                key={mod.key}
                href={mod.href}
                className={`group flex flex-col items-center justify-center gap-3 rounded-2xl border ${mod.borderColor} bg-white px-4 py-6 sm:py-7 shadow-xs transition-all duration-200 hover:shadow-md hover:-translate-y-0.5 active:scale-98`}
              >
                {cardContent}
              </Link>
            );
          }

          return (
            <button
              key={mod.key}
              type="button"
              onClick={() => setSelectedModule(mod)}
              className={`group flex flex-col items-center justify-center gap-3 rounded-2xl border ${mod.borderColor} bg-white px-4 py-6 sm:py-7 shadow-xs transition-all duration-200 hover:shadow-md hover:-translate-y-0.5 active:scale-98 cursor-pointer`}
            >
              {cardContent}
            </button>
          );
        })}
      </div>

      {/* Modal chọn tab con khi bấm vào nhóm nhiều chức năng */}
      {selectedModule && selectedModule.subTabs && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/45 backdrop-blur-xs p-0 sm:p-4"
          onClick={() => setSelectedModule(null)}
        >
          <div
            className="w-full sm:max-w-lg rounded-t-3xl sm:rounded-3xl bg-white p-5 sm:p-6 shadow-2xl border border-slate-200/80 max-h-[85vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3 pb-4 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div
                  className={`flex h-10 w-10 items-center justify-center rounded-full ${selectedModule.circleBg} text-white shadow-xs`}
                >
                  <span className="text-lg leading-none">{selectedModule.icon}</span>
                </div>
                <div>
                  <h2 className="text-base sm:text-lg font-black text-slate-900">
                    {selectedModule.label}
                  </h2>
                  <p className="text-xs text-slate-500">
                    Chọn chức năng chi tiết bên dưới
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedModule(null)}
                aria-label="Đóng"
                className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 hover:text-slate-800 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-2.5">
              {selectedModule.subTabs.map((sub) => (
                <Link
                  key={sub.href}
                  href={sub.href}
                  onClick={() => setSelectedModule(null)}
                  className="flex items-center gap-3.5 rounded-2xl border border-slate-200/90 bg-slate-50/70 p-3.5 transition-all hover:border-blue-300 hover:bg-blue-50/50 hover:shadow-xs active:scale-99"
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white shadow-2xs border border-slate-200/70 text-xl">
                    {sub.icon}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-bold text-slate-900">
                      {sub.label}
                    </div>
                    <div className="text-xs text-slate-500 line-clamp-1">
                      {sub.description}
                    </div>
                  </div>
                  <span className="text-slate-400 text-sm font-bold">→</span>
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}

      <p className="mt-10 text-center text-xs text-slate-400">
        Hệ Thống Nội Bộ &bull; CÔNG TY TNHH XNK{' '}
        <span className="font-bold text-slate-500">CHƠN CHÍNH</span>
      </p>
    </main>
  );
}
