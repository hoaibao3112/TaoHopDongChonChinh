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
    <div className="min-h-screen bg-slate-50/70 text-slate-900 pb-20 antialiased">
      {/* Top Header */}
      <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/85 backdrop-blur-md transition-all shadow-xs">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-tr from-blue-700 to-indigo-600 text-xl text-white shadow-md shadow-blue-500/20 ring-1 ring-white/30">
              📄
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-bold text-slate-900 sm:text-lg leading-tight tracking-tight">
                  Tạo Hợp Đồng Mua Bán Hàng Hóa
                </h1>
                <span className="hidden sm:inline-flex items-center rounded-md bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-600/20">
                  Chuẩn DOCX
                </span>
              </div>
              <p className="text-xs text-slate-500">
                Hệ thống tự động kết xuất văn bản pháp lý &bull; Công ty TNHH XNK Chơn Chính
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <form action="/api/auth/logout" method="POST">
              <button
                type="submit"
                className="group flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-semibold text-slate-600 shadow-2xs transition-all hover:border-red-200 hover:bg-red-50 hover:text-red-700 cursor-pointer"
              >
                <svg className="w-3.5 h-3.5 text-slate-400 group-hover:text-red-600 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
                <span>Đăng xuất</span>
              </button>
            </form>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="mx-auto max-w-6xl px-4 pt-6 sm:px-6">
        {/* Banner Bên A (Bên Bán) Cố Định - Kiểu dáng Doanh Nghiệp Sang Trọng */}
        <section className="mb-8 overflow-hidden rounded-3xl border border-blue-200/80 bg-gradient-to-br from-white via-blue-50/40 to-indigo-50/30 p-6 sm:p-7 shadow-sm shadow-blue-500/5 relative">
          <div className="absolute top-0 right-0 -mt-8 -mr-8 h-40 w-40 rounded-full bg-blue-100/40 blur-2xl pointer-events-none" />

          <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-6 relative z-10">
            <div className="flex-1 space-y-3">
              <div className="inline-flex items-center gap-2 rounded-full bg-blue-100/80 px-3 py-1 text-xs font-bold text-blue-800 tracking-wide">
                <span className="flex h-2 w-2 rounded-full bg-blue-600 animate-pulse" />
                🏢 BÊN A (BÊN BÁN) — THÔNG TIN CỐ ĐỊNH TRÊN HỢP ĐỒNG
              </div>

              <h2 className="text-xl font-black text-slate-900 tracking-tight sm:text-2xl">
                {COMPANY_A.name}
              </h2>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-2.5 pt-2 text-sm text-slate-600">
                <div className="flex items-start gap-2">
                  <span className="text-slate-400 font-semibold min-w-[70px]">Trụ sở:</span>
                  <span className="font-medium text-slate-800">{COMPANY_A.address}</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-slate-400 font-semibold min-w-[70px]">Mã số thuế:</span>
                  <span className="font-semibold text-slate-900 font-mono tracking-wide">{COMPANY_A.mst}</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-slate-400 font-semibold min-w-[70px]">Điện thoại:</span>
                  <span className="font-medium text-slate-800">{COMPANY_A.phone}</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-slate-400 font-semibold min-w-[70px]">Đại diện:</span>
                  <span className="font-medium text-slate-800">
                    <strong className="text-blue-900 font-bold">{COMPANY_A.representative}</strong> — {COMPANY_A.title}{' '}
                    <span className="text-xs text-slate-500 italic font-normal">{COMPANY_A.authorizationNote}</span>
                  </span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-slate-400 font-semibold min-w-[70px]">Người ký HĐ:</span>
                  <span className="font-medium text-slate-800">
                    <strong className="text-blue-900 font-bold">{COMPANY_A.signerName}</strong>
                    <span className="ml-2 inline-flex items-center rounded-full bg-green-50 px-2 py-0.5 text-[10px] font-semibold text-green-700 ring-1 ring-inset ring-green-600/20">
                      Ký hợp đồng
                    </span>
                  </span>
                </div>
                <div className="flex items-start gap-2 md:col-span-2">
                  <span className="text-slate-400 font-semibold min-w-[70px]">Tài khoản:</span>
                  <span className="font-medium text-slate-800">
                    <strong className="font-mono text-slate-900">{COMPANY_A.bankAccount}</strong> tại{' '}
                    <strong className="text-slate-900">{COMPANY_A.bankName}</strong>
                  </span>
                </div>
              </div>
            </div>

            <div className="shrink-0 rounded-2xl bg-white/90 p-4 border border-blue-100 shadow-2xs flex flex-col justify-center items-center text-center max-w-[200px]">
              <div className="h-12 w-12 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center font-bold text-lg mb-2">
                MB
              </div>
              <p className="text-xs font-semibold text-slate-800">MB Bank CN Đồng Tháp</p>
              <p className="text-[11px] text-slate-500 mt-0.5 font-mono">0709 777 89 777</p>
            </div>
          </div>
        </section>

        {/* Biểu mẫu hợp đồng chính */}
        <ContractForm />
      </main>
    </div>
  );
}
