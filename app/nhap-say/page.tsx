import React from 'react';
import { redirect } from 'next/navigation';
import { isServerComponentAuthenticated } from '@/lib/auth';
import AppHeader from '@/components/AppHeader';
import RiceNhapCS2View from '@/components/RiceNhapCS2View';

export const metadata = {
  title: 'Nhập Sấy Đội Dương CS2 | XNK Chơn Chính',
  description: 'Hệ thống bảng kê và tính lương nhập sấy lúa Cơ Sở II - Đội Dương',
};

export default async function NhapSayPage() {
  const isAuth = await isServerComponentAuthenticated();
  if (!isAuth) {
    redirect('/login');
  }

  return (
    <div className="min-h-screen bg-slate-50/70 text-slate-900 pb-20 antialiased">
      <AppHeader />

      <main className="mx-auto max-w-7xl px-4 pt-6 sm:px-6">
        <RiceNhapCS2View />
      </main>
    </div>
  );
}

