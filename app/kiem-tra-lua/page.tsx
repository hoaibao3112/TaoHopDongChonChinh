import React from 'react';
import { redirect } from 'next/navigation';
import { isServerComponentAuthenticated, getServerComponentUserRole } from '@/lib/auth';
import AppHeader from '@/components/AppHeader';
import RiceAuditView from '@/components/RiceAuditView';

export const metadata = {
  title: 'Kiểm Tra Lỗi Nhập Liệu Lúa | XNK Chơn Chính',
  description: 'Rà soát sai sót Mã lô, Tên khách hàng, Giá lúa và Công thức từ 2 file Lúa Tươi & Lúa Khô',
};

export default async function KiemTraLuaPage() {
  const isAuth = await isServerComponentAuthenticated();
  if (!isAuth) {
    redirect('/login?redirect=/kiem-tra-lua');
  }

  const role = await getServerComponentUserRole();
  const canAccess =
    role === 'kiemtra' ||
    role === 'admin' ||
    role === 'payroll' ||
    role === 'baocao' ||
    role === 'contracts';
  if (!canAccess) {
    redirect('/');
  }

  return (
    <div className="min-h-screen bg-slate-50/70 text-slate-900 pb-20 antialiased">
      <AppHeader />

      <main className="mx-auto max-w-7xl px-4 pt-6 sm:px-6">
        <RiceAuditView />
      </main>
    </div>
  );
}
