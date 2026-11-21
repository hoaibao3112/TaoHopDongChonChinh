import React from 'react';
import { getServerComponentUserRole, isServerComponentAuthenticated } from '@/lib/auth';
import AppHeader from '@/components/AppHeader';
import DangTaiView from '@/components/DangTaiView';
import DangTaiPasswordGate from './DangTaiPasswordGate';

export const metadata = {
  title: 'Hệ Thống Tự Động Đăng Tài Xe Lúa | XNK Chơn Chính',
  description: 'Quản lý thứ tự tài xe về nhập, tự động quét phiếu cân AI và đối soát thứ tự STT',
};

export default async function DangTaiPage() {
  const isAuth = await isServerComponentAuthenticated();
  const role = await getServerComponentUserRole();

  // Yêu cầu mật khẩu "dangtai" hoặc tài khoản quản trị "admin"
  const hasAccess = isAuth && (role === 'dangtai' || role === 'admin');

  if (!hasAccess) {
    return <DangTaiPasswordGate />;
  }

  return (
    <div className="min-h-screen bg-slate-50/70 text-slate-900 pb-20 antialiased">
      <AppHeader />

      <main className="w-full px-2 sm:px-4 lg:px-6 pt-3 sm:pt-5">
        <DangTaiView />
      </main>
    </div>
  );
}
