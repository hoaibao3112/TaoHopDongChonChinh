'use client';

import React, { useState } from 'react';
import NhapTrauView from './NhapTrauView';
import HuskPayrollView from './HuskPayrollView';

export default function HuskContainerView() {
  const [activeTab, setActiveTab] = useState<'nhap-trau-moi' | 'quet-anh-cu'>('nhap-trau-moi');

  return (
    <div className="space-y-6">
      {/* Tab Switcher */}
      <div className="flex items-center justify-between border-b border-slate-200 pb-3">
        <div className="flex items-center gap-2 bg-slate-100/90 p-1 rounded-2xl border border-slate-200/80">
          <button
            type="button"
            onClick={() => setActiveTab('nhap-trau-moi')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
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
            onClick={() => setActiveTab('quet-anh-cu')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
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

      {/* View Content */}
      {activeTab === 'nhap-trau-moi' ? <NhapTrauView /> : <HuskPayrollView />}
    </div>
  );
}
