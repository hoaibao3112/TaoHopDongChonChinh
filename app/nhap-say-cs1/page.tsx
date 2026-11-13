import React from 'react';
import { redirect } from 'next/navigation';
import { isServerComponentAuthenticated } from '@/lib/auth';
import AppHeader from '@/components/AppHeader';
import RiceNhapCS1View from '@/components/RiceNhapCS1View';

export const metadata = {
  title: 'Nhập Sấy Cơ Sở I | XNK Chơn Chính',
  description: 'Hệ thống bảng kê và tính lương nhập sấy lúa Cơ Sở I - Đội Nghị & Đội Nguyên',
};

export default async function NhapSayCS1Page() {
  const isAuth = await isServerComponentAuthenticated();
  if (!isAuth) {
    redirect('/login');
  }

  return (
    <div className="min-h-screen bg-slate-50/70 text-slate-900 pb-20 antialiased">
      <AppHeader />

      <main className="mx-auto max-w-7xl px-4 pt-6 sm:px-6">
        <RiceNhapCS1View />
      </main>
    </div>
  );
}

