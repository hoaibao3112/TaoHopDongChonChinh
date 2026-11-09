import React from 'react';
import { redirect } from 'next/navigation';
import { isServerComponentAuthenticated } from '@/lib/auth';
import AppHeader from '@/components/AppHeader';
import HuskPayrollView from '@/components/HuskPayrollView';

export const metadata = {
  title: 'Xuất Trấu & Quét Phiếu Cân | XNK Chơn Chính',
  description: 'Hệ thống tự động quét phiếu cân bằng AI và ghi bảng kê tính lương xuất trấu',
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
        <HuskPayrollView />
      </main>
    </div>
  );
}

