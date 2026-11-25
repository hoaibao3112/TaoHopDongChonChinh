import React from 'react';
import { redirect } from 'next/navigation';
import { isServerComponentAuthenticated, getServerComponentUserRole } from '@/lib/auth';
import AppHeader from '@/components/AppHeader';
import RiceMonthlyStatsView from '@/components/RiceMonthlyStatsView';

export const metadata = {
  title: 'Thống Kê Tổng Hợp Lúa Tháng | XNK Chơn Chính',
  description: 'Phân tích tổng hợp sản lượng, nhân viên thu mua, chi phí, hao hụt, tiến độ xay và công nợ từ file Lúa Tươi & Lúa Khô',
};

export default async function ThongKeLuaPage() {
  const isAuth = await isServerComponentAuthenticated();
  if (!isAuth) {
    redirect('/login');
  }

  const role = await getServerComponentUserRole();
  const canAccess =
    role === 'admin' || role === 'payroll' || role === 'baocao' || role === 'contracts';
  if (!canAccess) {
    redirect('/');
  }

  return (
    <div className="min-h-screen bg-slate-50/70 text-slate-900 pb-20 antialiased">
      <AppHeader />

      <main className="mx-auto max-w-7xl px-4 pt-6 sm:px-6">
        <RiceMonthlyStatsView />
      </main>
    </div>
  );
}
