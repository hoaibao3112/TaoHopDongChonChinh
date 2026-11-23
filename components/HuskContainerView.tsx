'use client';

import React, { useState } from 'react';
import NhapTrauView from './NhapTrauView';
import HuskPayrollView from './HuskPayrollView';
import HuskMonthlyListView from './HuskMonthlyListView';

export type HuskSubTab = 'nhap-trau-moi' | 'quet-anh-cu' | 'danh-sach-thang';

export default function HuskContainerView() {
  const [activeTab, setActiveTab] = useState<HuskSubTab>(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const tabParam = params.get('tab');
      if (tabParam === 'quet-anh-cu' || tabParam === 'quet-anh' || tabParam === 'ai') {
        return 'quet-anh-cu';
      }
      if (tabParam === 'danh-sach' || tabParam === 'monthly' || tabParam === 'csdl') {
        return 'danh-sach-thang';
      }
      const savedTab = localStorage.getItem('husk_active_subtab');
      if (savedTab === 'quet-anh-cu' || savedTab === 'nhap-trau-moi' || savedTab === 'danh-sach-thang') {
        return savedTab as HuskSubTab;
      }
    }
    return 'nhap-trau-moi';
  });

  const [targetMonth, setTargetMonth] = useState<string>('10/2026');

  const handleSelectTab = (tab: HuskSubTab) => {
    setActiveTab(tab);
    if (typeof window !== 'undefined') {
      localStorage.setItem('husk_active_subtab', tab);
    }
  };

  const handleOpenMonthlyView = (monthKey: string) => {
    if (monthKey) setTargetMonth(monthKey);
    handleSelectTab('danh-sach-thang');
  };

  return (
    <div className="space-y-6">
      {/* ─── Tab Switcher ─────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-200 pb-3 gap-3">
        <div className="flex flex-wrap items-center gap-1.5 bg-slate-100/90 p-1.5 rounded-2xl border border-slate-200/80">
          <button
            type="button"
            onClick={() => handleSelectTab('nhap-trau-moi')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'nhap-trau-moi'
                ? 'bg-white text-amber-900 shadow-xs ring-1 ring-amber-400'
                : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
            }`}
          >
            <span>🚛</span>
            <span>Nhập Trấu Mới (Xe 11đ &amp; Ghe 7đ)</span>
            <span className="rounded-full bg-amber-600 text-white text-[10px] px-2 py-0.5 font-bold shadow-2xs">
              MỚI
            </span>
          </button>

          <button
            type="button"
            onClick={() => handleSelectTab('danh-sach-thang')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'danh-sach-thang'
                ? 'bg-white text-indigo-950 shadow-xs ring-1 ring-indigo-400'
                : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
            }`}
          >
            <span>📋</span>
            <span>Xem Trấu Đã Lưu CSDL Theo Tháng</span>
            <span className="rounded-full bg-indigo-600 text-white text-[10px] px-2 py-0.5 font-bold shadow-2xs">
              CSDL
            </span>
          </button>

          <button
            type="button"
            onClick={() => handleSelectTab('quet-anh-cu')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'quet-anh-cu'
                ? 'bg-white text-slate-900 shadow-xs ring-1 ring-slate-300'
                : 'text-slate-500 hover:text-slate-800 hover:bg-white/50'
            }`}
          >
            <span>📸</span>
            <span>Quét Phiếu Cân AI (Cũ)</span>
          </button>
        </div>
      </div>

      {/* ─── View Content ─────────────────────────────────────────────────── */}
      {activeTab === 'nhap-trau-moi' && (
        <NhapTrauView onOpenMonthlyView={handleOpenMonthlyView} />
      )}
      {activeTab === 'danh-sach-thang' && (
        <HuskMonthlyListView
          initialMonth={targetMonth}
          onNavigateToTab={(t) => handleSelectTab(t)}
        />
      )}
      {activeTab === 'quet-anh-cu' && (
        <HuskPayrollView onOpenMonthlyView={handleOpenMonthlyView} />
      )}
    </div>
  );
}
