import React from 'react';
import { redirect } from 'next/navigation';
import { isServerComponentAuthenticated } from '@/lib/auth';
import { COMPANY_A } from '@/lib/company-config';
import ContractForm from '@/components/ContractForm';

export default async function HomePage() {
  const isAuth = await isServerComponentAuthenticated();
  if (!isAuth) {
    redirect('/login');
  }

  return (
    <div className="min-h-screen bg-gray-50/60 pb-16">
      {/* Top Navigation */}
      <header className="sticky top-0 z-20 border-b border-gray-200/80 bg-white/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-600 text-lg text-white shadow-sm">
              📄
            </span>
            <div>
              <h1 className="text-sm font-bold text-gray-900 sm:text-base leading-tight">
                Tạo Hợp Đồng Mua Bán Hàng Hóa
              </h1>
              <p className="text-xs text-gray-500">
                Xuất file Word (.docx) chuẩn mẫu
              </p>
            </div>
          </div>

          <form action="/api/auth/logout" method="POST">
            <button
              type="submit"
              className="rounded-xl border border-gray-200 bg-white px-3.5 py-1.5 text-xs font-semibold text-gray-600 transition hover:bg-gray-50 hover:text-red-600 cursor-pointer"
            >
              Đăng xuất
            </button>
          </form>
        </div>
      </header>

      {/* Main Container */}
      <main className="mx-auto max-w-5xl px-4 pt-6 sm:px-6">
        {/* Banner thông tin BÊN A cố định */}
        <div className="mb-6 rounded-2xl border border-blue-200 bg-gradient-to-br from-blue-50/80 to-indigo-50/50 p-5 shadow-xs sm:p-6">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
            <div>
              <div className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-2.5 py-1 text-xs font-bold text-white uppercase tracking-wider mb-2">
                🏢 BÊN A (BÊN BÁN) — THÔNG TIN CỐ ĐỊNH
              </div>
              <h2 className="text-lg font-black text-gray-900 tracking-tight">
                {COMPANY_A.name}
              </h2>
              <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5 text-xs text-gray-700">
                <p><strong className="font-semibold text-gray-900">Địa chỉ:</strong> {COMPANY_A.address}</p>
                <p><strong className="font-semibold text-gray-900">Điện thoại:</strong> {COMPANY_A.phone}</p>
                <p><strong className="font-semibold text-gray-900">Mã số thuế:</strong> {COMPANY_A.mst}</p>
                <p>
                  <strong className="font-semibold text-gray-900">Đại diện:</strong> {COMPANY_A.representative} — {COMPANY_A.title}{' '}
                  <span className="italic text-gray-500">{COMPANY_A.authorizationNote}</span>
                </p>
                <p><strong className="font-semibold text-gray-900">Số tài khoản:</strong> {COMPANY_A.bankAccount}</p>
                <p><strong className="font-semibold text-gray-900">Ngân hàng:</strong> {COMPANY_A.bankName}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Form nhập liệu */}
        <ContractForm />
      </main>
    </div>
  );
}
