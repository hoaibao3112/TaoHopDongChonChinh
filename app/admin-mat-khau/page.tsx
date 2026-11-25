import React from 'react';
import { cookies } from 'next/headers';
import {
  SESSION_COOKIE_NAME,
  computePasswordVersion,
  verifySessionJwt,
} from '@/lib/auth';
import { getRolePasswords } from '@/lib/passwordStore';
import AppHeader from '@/components/AppHeader';
import AdminPasswordsView from '@/components/AdminPasswordsView';
import AdminPasswordGate from './AdminPasswordGate';

export const metadata = {
  title: 'Admin Quản Lý Mật Khẩu | XNK Chơn Chính',
  description: 'Quản lý và thay đổi mật khẩu truy cập cho toàn bộ các tab phân hệ',
};

export default async function AdminMatKhauPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  const payload = token ? verifySessionJwt(token) : null;

  let hasAccess = !!payload && (payload.role === 'contracts' || payload.role === 'admin');

  if (hasAccess && payload?.role === 'contracts' && payload.pv) {
    const currentMap = await getRolePasswords();
    if (payload.pv !== computePasswordVersion(currentMap.contracts)) {
      hasAccess = false;
    }
  }

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
