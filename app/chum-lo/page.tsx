import React from 'react';
import { redirect } from 'next/navigation';
import { isServerComponentAuthenticated } from '@/lib/auth';
import AppHeader from '@/components/AppHeader';
import RiceChumLoView from '@/components/RiceChumLoView';

export const metadata = {
  title: 'Chụm Lò Cơ Sở 1 | XNK Chơn Chính',
  description: 'Hệ thống bảng kê và tính lương chụm lò lúa Cơ Sở I - Đội Nguyên',
};

export default async function ChumLoPage() {
  const isAuth = await isServerComponentAuthenticated();
  if (!isAuth) {
    redirect('/login');
  }

  return (
    <div className="min-h-screen bg-slate-50/70 text-slate-900 pb-20 antialiased">
      <AppHeader />

      <main className="mx-auto max-w-7xl px-4 pt-6 sm:px-6">
        <RiceChumLoView />
      </main>
    </div>
  );
}

