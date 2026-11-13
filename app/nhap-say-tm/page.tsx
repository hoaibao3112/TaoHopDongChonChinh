import React from 'react';
import { redirect } from 'next/navigation';
import { isServerComponentAuthenticated } from '@/lib/auth';
import AppHeader from '@/components/AppHeader';
import RiceNhapNSXTMView from '@/components/RiceNhapNSXTMView';

export const metadata = {
  title: 'Nhập Sấy NSX Tân Mỹ | XNK Chơn Chính',
  description: 'Hệ thống bảng kê và tính lương nhập sấy lúa NSX Tân Mỹ - Đội Đức & Đội Quý (Lúa tươi & Lúa khô)',
};

export default async function NhapSayTMPage() {
  const isAuth = await isServerComponentAuthenticated();
  if (!isAuth) {
    redirect('/login');
  }

  return (
    <div className="min-h-screen bg-slate-50/70 text-slate-900 pb-20 antialiased">
      <AppHeader />

      <main className="mx-auto max-w-7xl px-4 pt-6 sm:px-6">
        <RiceNhapNSXTMView />
      </main>
    </div>
  );
}

