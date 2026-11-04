import React from 'react';
import { redirect } from 'next/navigation';
import { isServerComponentAuthenticated } from '@/lib/auth';
import AppHeader from '@/components/AppHeader';
import RicePayrollView from '@/components/RicePayrollView';

export const metadata = {
  title: 'Tính Lương Nhân Công Nông Sản | XNK Chơn Chính',
  description: 'Hệ thống đối soát mẻ sấy và tính lương nhân công bốc xếp, xuất lúa',
};

export default async function TinhLuongPage() {
  const isAuth = await isServerComponentAuthenticated();
  if (!isAuth) {
    redirect('/login');
  }

  return (
    <div className="min-h-screen bg-slate-50/70 text-slate-900 pb-20 antialiased">
      <AppHeader />

      <main className="mx-auto max-w-7xl px-4 pt-6 sm:px-6">
        <RicePayrollView />
      </main>
    </div>
  );
}

