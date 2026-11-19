import React from 'react';
import dynamic from 'next/dynamic';
import { redirect } from 'next/navigation';
import { isServerComponentAuthenticated } from '@/lib/auth';
import AppHeader from '@/components/AppHeader';

const BaoCaoChuaXayView = dynamic(() => import('@/components/BaoCaoChuaXayView'), {
  ssr: false,
  loading: () => (
    <div className="flex flex-col items-center justify-center py-24 text-emerald-800">
      <div className="h-10 w-10 animate-spin rounded-full border-4 border-emerald-600 border-t-transparent shadow-sm" />
      <p className="mt-4 text-sm font-bold text-slate-700">Đang tải báo cáo lúa chưa xay...</p>
      <p className="text-xs text-slate-500">Tự động nạp dữ liệu mẻ lúa đã lưu</p>
    </div>
  ),
});

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
