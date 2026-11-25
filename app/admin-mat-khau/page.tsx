import React from 'react';
import { getServerComponentUserRole, isServerComponentAuthenticated } from '@/lib/auth';
import AppHeader from '@/components/AppHeader';
import AdminPasswordsView from '@/components/AdminPasswordsView';
import AdminPasswordGate from './AdminPasswordGate';

export const metadata = {
  title: 'Admin Quản Lý Mật Khẩu | XNK Chơn Chính',
  description: 'Quản lý và thay đổi mật khẩu truy cập cho toàn bộ các tab phân hệ',
};

export default async function AdminMatKhauPage() {
  const isAuth = await isServerComponentAuthenticated();
  const role = await getServerComponentUserRole();

  // Yêu cầu mật khẩu "chonchinh" (role contracts) hoặc tài khoản quản trị "admin"
  const hasAccess = isAuth && (role === 'contracts' || role === 'admin');

  if (!hasAccess) {
    return <AdminPasswordGate />;
  }

  return (
    <div className="min-h-screen bg-slate-50/70 text-slate-900 pb-20 antialiased">
      <AppHeader />

      <main className="mx-auto max-w-6xl px-4 pt-6 sm:px-6">
        <AdminPasswordsView />
      </main>
    </div>
  );
}
