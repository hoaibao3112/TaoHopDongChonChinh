import React from 'react';
import { redirect } from 'next/navigation';
import { isServerComponentAuthenticated } from '@/lib/auth';
import AppHeader from '@/components/AppHeader';
import BaoCaoChuaXayView from '@/components/BaoCaoChuaXayView';

export const metadata = {
  title: 'Báo Cáo Lúa Khô Chưa Xay | XNK Chơn Chính',
  description: 'Báo cáo tổng hợp lượng lúa khô chưa xay theo đầu lúa khô (lúa khô nằm tài và lúa tươi chờ sấy quy đổi KCS)',
};

export default async function BaoCaoChuaXayPage() {
  const isAuth = await isServerComponentAuthenticated();
  if (!isAuth) {
    redirect('/login');
  }

  return (
    <div className="min-h-screen bg-slate-50/70 text-slate-900 pb-20 antialiased">
      <AppHeader />

      <main className="mx-auto max-w-7xl px-4 pt-6 sm:px-6">
        <BaoCaoChuaXayView />
      </main>
    </div>
  );
}
