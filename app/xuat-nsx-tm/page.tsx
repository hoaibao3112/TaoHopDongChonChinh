import React from 'react';
import { redirect } from 'next/navigation';
import { isServerComponentAuthenticated } from '@/lib/auth';
import AppHeader from '@/components/AppHeader';
import RiceXuatNSXTMView from '@/components/RiceXuatNSXTMView';

export const metadata = {
  title: 'Xuống Lúa NSX Tân Mỹ (Đội Nam) | XNK Chơn Chính',
  description: 'Hệ thống bảng kê và tính lương xuất lúa khô, chụm lò, vô bồn NSX Tân Mỹ - Đội Nam',
};

export default async function XuatNSXTMPage() {
  const isAuth = await isServerComponentAuthenticated();
  if (!isAuth) {
    redirect('/login');
  }

  return (
    <div className="min-h-screen bg-slate-50/70 text-slate-900 pb-20 antialiased">
      <AppHeader />

      <main className="mx-auto max-w-7xl px-4 pt-6 sm:px-6">
        <RiceXuatNSXTMView />
      </main>
    </div>
  );
}
