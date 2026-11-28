import React from 'react';
import { redirect } from 'next/navigation';
import { isServerComponentAuthenticated } from '@/lib/auth';
import AppHeader from '@/components/AppHeader';
import HomeDashboard from '@/components/HomeDashboard';

export default async function HomePage() {
  const isAuth = await isServerComponentAuthenticated();
  if (!isAuth) {
    redirect('/login');
  }

  return (
    <div className="min-h-screen bg-slate-50 antialiased">
      <AppHeader />
      <HomeDashboard />
    </div>
  );
}
