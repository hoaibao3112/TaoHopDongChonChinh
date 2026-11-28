import React from 'react';
import { redirect } from 'next/navigation';
import { isServerComponentAuthenticated, getServerComponentUserRole } from '@/lib/auth';
import AppHeader from '@/components/AppHeader';
import VehicleBoardView from '@/components/VehicleBoardView';

export const metadata = {
  title: 'Xếp Phương Tiện (Kéo Thả) | XNK Chơn Chính',
  description: 'Bảng điều phối 25 chiếc Nguyên Nguyên & phương tiện ngoài qua 6 trạng thái',
};

export default async function DieuPhoiPhuongTienPage() {
  const isAuth = await isServerComponentAuthenticated();
  if (!isAuth) {
    redirect('/login?redirect=/dieu-phoi-pt');
  }

  const role = await getServerComponentUserRole();
  const canAccess =
    role === 'dangtai' ||
    role === 'admin' ||
    role === 'contracts' ||
    role === 'payroll';
  if (!canAccess) {
    redirect('/');
  }

  return (
    <div className="min-h-screen bg-slate-50/70 text-slate-900 pb-20 antialiased">
      <AppHeader />

      <main className="mx-auto max-w-[1600px] px-4 pt-6 sm:px-6">
        <VehicleBoardView />
      </main>
    </div>
  );
}
