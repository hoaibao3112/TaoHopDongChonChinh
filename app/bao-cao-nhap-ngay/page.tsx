import React from 'react';
import { getServerComponentUserRole, isServerComponentAuthenticated } from '@/lib/auth';
import AppHeader from '@/components/AppHeader';
import BaoCaoNhapNgayView from '@/components/BaoCaoNhapNgayView';
import ChiNgocPasswordGate from './ChiNgocPasswordGate';

export const metadata = {
  title: 'Báo Cáo Nhập Ngày (Lúa Tươi & Khô) | XNK Chơn Chính',
  description: 'Báo cáo tổng hợp lượng lúa tươi và lúa khô nhập theo ngày, phân loại hợp đồng và phương tiện chưa về chờ thanh toán',
};

export default async function BaoCaoNhapNgayPage() {
  const isAuth = await isServerComponentAuthenticated();
  const role = await getServerComponentUserRole();

  // Yêu cầu mật khẩu "chingoc" hoặc tài khoản quản trị "admin"
  const hasAccess = isAuth && (role === 'chingoc' || role === 'admin');

  if (!hasAccess) {
    return <ChiNgocPasswordGate />;
  }

  return (
    <div className="min-h-screen bg-slate-50/70 text-slate-900 pb-20 antialiased">
      <AppHeader />

      <main className="mx-auto max-w-7xl px-4 pt-6 sm:px-6">
        <BaoCaoNhapNgayView />
      </main>
    </div>
  );
}
