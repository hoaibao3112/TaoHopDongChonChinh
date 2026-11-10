import React from 'react';
import { redirect } from 'next/navigation';
import { isServerComponentAuthenticated } from '@/lib/auth';
import AppHeader from '@/components/AppHeader';
import HuskContainerView from '@/components/HuskContainerView';

export const metadata = {
  title: 'Nhập Trấu & Báo Cáo Xuất Trấu | XNK Chơn Chính',
  description: 'Hệ thống nhập phiếu xuất trấu hàng ngày theo Xe và Ghe, tự động ghi Sổ tổng và Tab khách',
};

export default async function XuatTrauPage() {
  const isAuth = await isServerComponentAuthenticated();
  if (!isAuth) {
    redirect('/login');
  }

  return (
    <div className="min-h-screen bg-slate-50/70 text-slate-900 pb-20 antialiased">
      <AppHeader />

      <main className="mx-auto max-w-7xl px-4 pt-6 sm:px-6">
        <HuskContainerView />
      </main>
    </div>
  );
}
