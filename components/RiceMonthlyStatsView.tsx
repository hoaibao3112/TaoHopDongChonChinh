'use client';

import React, { useState, useMemo } from 'react';
import { RiceMonthlyStatsResult } from '@/lib/rice-stats/types';

type ActiveTab = 'overview' | 'buyers' | 'costs' | 'loss' | 'milling' | 'financial';

function fmtNum(n: number, decimals = 0): string {
  return n.toLocaleString('vi-VN', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function fmtTons(kg: number): string {
  return fmtNum(kg / 1000, 2);
}

function fmtMoney(n: number): string {
  return `${Math.round(n).toLocaleString('vi-VN')} đ`;
}

export default function RiceMonthlyStatsView() {
  const [freshFile, setFreshFile] = useState<File | null>(null);
  const [dryFile, setDryFile] = useState<File | null>(null);
  const [useLocalSample, setUseLocalSample] = useState(false);
  const [monthKey, setMonthKey] = useState<string>('');
  const [activeTab, setActiveTab] = useState<ActiveTab>('overview');
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<RiceMonthlyStatsResult | null>(null);

  const runAnalysis = async (opts?: {
    overrideMonth?: string;
    localSample?: boolean;
    fFile?: File | null;
    dFile?: File | null;
  }) => {
    const f = opts?.fFile !== undefined ? opts.fFile : freshFile;
    const d = opts?.dFile !== undefined ? opts.dFile : dryFile;
    const useSample = opts?.localSample !== undefined ? opts.localSample : useLocalSample;
    const targetMonth = opts?.overrideMonth !== undefined ? opts.overrideMonth : monthKey;

    if (!f && !d && !useSample) {
      setError('Vui lòng chọn ít nhất 1 file Excel Lúa Tươi hoặc Lúa Khô (hoặc bấm Nạp file mặc định).');
      return;
    }

    setError(null);
    setIsLoading(true);
    try {
      const fd = new FormData();
      if (f) fd.append('freshFile', f);
      if (d) fd.append('dryFile', d);
      if (useSample) fd.append('useLocalSample', 'true');
      if (targetMonth) fd.append('monthKey', targetMonth);

      const res = await fetch('/api/rice-stats/analyze', {
        method: 'POST',
        body: fd,
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Không thể phân tích dữ liệu');
      }
      setStats(json.data);
      setMonthKey(json.data.monthKey);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Lỗi phân tích file');
    } finally {
      setIsLoading(false);
    }
  };

  const handleLoadLocalSample = () => {
    setUseLocalSample(true);
    runAnalysis({ localSample: true, overrideMonth: monthKey || '' });
  };

  const handleExportExcel = async () => {
    if (!stats) return;
    setIsExporting(true);
    setError(null);
    try {
      const res = await fetch('/api/rice-stats/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stats }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || 'Lỗi xuất Excel');
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Thong_Ke_Lua_${(stats.monthKey || 'ALL').replace(/\//g, '_')}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Lỗi xuất Excel');
    } finally {
      setIsExporting(false);
    }
  };

  const q = searchTerm.trim().toLowerCase();

  const filteredSuppliers = useMemo(() => {
    if (!stats) return [];
    const list = q
      ? stats.suppliers.filter((s) => s.supplier.toLowerCase().includes(q))
      : stats.suppliers;
    return list.slice(0, 40);
  }, [stats, q]);

  const filteredLossAlerts = useMemo(() => {
    if (!stats) return [];
    return q
      ? stats.lossAlerts.filter(
          (a) =>
            a.supplier.toLowerCase().includes(q) ||
            a.lotCode.toLowerCase().includes(q) ||
            a.buyer.toLowerCase().includes(q)
        )
      : stats.lossAlerts;
  }, [stats, q]);

  const filteredDebtAlerts = useMemo(() => {
    if (!stats) return [];
    return q
      ? stats.financial.debtAlerts.filter(
          (d) =>
            d.supplier.toLowerCase().includes(q) ||
            d.lotCode.toLowerCase().includes(q) ||
            d.buyer.toLowerCase().includes(q)
        )
      : stats.financial.debtAlerts;
  }, [stats, q]);

  const maxDailyKg = useMemo(() => {
    if (!stats || stats.dailyTrend.length === 0) return 1;
    return Math.max(...stats.dailyTrend.map((d) => d.totalKg), 1);
  }, [stats]);

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="rounded-3xl border border-emerald-200/80 bg-gradient-to-r from-emerald-50 via-teal-50/50 to-white p-6 shadow-sm flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-600 text-3xl text-white shadow-lg shadow-emerald-500/20">
            📊
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
              Thống Kê Tổng Hợp Lúa Tươi &amp; Lúa Khô Theo Tháng
            </h1>
            <p className="text-xs sm:text-sm text-slate-600 mt-1">
              Phân tích 6 nhóm chỉ số: Sản lượng &amp; Loại lúa • Thu mua &amp; Vùng • Chi phí &amp; Giá thành • Hao hụt &amp; KCS • Tiến độ xay • Công nợ
            </p>
          </div>
        </div>

        {stats && (
          <button
            type="button"
            onClick={handleExportExcel}
            disabled={isExporting}
            className="rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2.5 text-xs sm:text-sm font-bold shadow-sm transition cursor-pointer disabled:opacity-50"
          >
            {isExporting ? '⏳ Đang tạo file...' : '📥 Xuất Excel Tổng Hợp (6 Sheets)'}
          </button>
        )}
      </div>

      {/* Upload & Filter Panel */}
      <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-xs space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="rounded-2xl border border-dashed border-emerald-300 bg-emerald-50/40 p-4">
            <label className="block text-xs font-black uppercase tracking-wider text-emerald-800 mb-2">
              🌾 File Nhập Lúa Tươi (LUA TUOI)
            </label>
            <input
              type="file"
              accept=".xlsx,.xls"
              onChange={(e) => {
                const file = e.target.files?.[0] || null;
                setFreshFile(file);
                if (file) setUseLocalSample(false);
              }}
              className="block w-full text-xs text-slate-600 file:mr-3 file:rounded-xl file:border-0 file:bg-emerald-600 file:px-3 file:py-2 file:text-xs file:font-bold file:text-white hover:file:bg-emerald-700 cursor-pointer"
            />
            {freshFile && (
              <p className="mt-1.5 text-[11px] font-semibold text-emerald-700">
                Đã chọn: {freshFile.name}
              </p>
            )}
          </div>

          <div className="rounded-2xl border border-dashed border-amber-300 bg-amber-50/40 p-4">
            <label className="block text-xs font-black uppercase tracking-wider text-amber-800 mb-2">
              🌾 File Nhập Lúa Khô (LUA KHÔ)
            </label>
            <input
              type="file"
              accept=".xlsx,.xls"
              onChange={(e) => {
                const file = e.target.files?.[0] || null;
                setDryFile(file);
                if (file) setUseLocalSample(false);
              }}
              className="block w-full text-xs text-slate-600 file:mr-3 file:rounded-xl file:border-0 file:bg-amber-600 file:px-3 file:py-2 file:text-xs file:font-bold file:text-white hover:file:bg-amber-700 cursor-pointer"
            />
            {dryFile && (
              <p className="mt-1.5 text-[11px] font-semibold text-amber-700">
                Đã chọn: {dryFile.name}
              </p>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={() => runAnalysis()}
              disabled={isLoading}
              className="rounded-xl bg-slate-900 hover:bg-slate-800 text-white px-5 py-2.5 text-xs sm:text-sm font-bold shadow-sm transition cursor-pointer disabled:opacity-50"
            >
              {isLoading ? '⏳ Đang phân tích...' : '🔍 Phân Tích File Đã Chọn'}
            </button>

            <button
              type="button"
              onClick={handleLoadLocalSample}
              disabled={isLoading}
              className="rounded-xl border border-emerald-300 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 px-4 py-2.5 text-xs sm:text-sm font-bold transition cursor-pointer disabled:opacity-50"
            >
              ⚡ Nạp 2 File Mặc Định Trên Hệ Thống
            </button>
          </div>

          {stats && stats.availableMonths.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-600">Chọn Tháng:</span>
              <select
                value={monthKey}
                onChange={(e) => {
                  const m = e.target.value;
                  setMonthKey(m);
                  runAnalysis({ overrideMonth: m });
                }}
                className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs sm:text-sm font-bold text-slate-900 focus:border-emerald-500 focus:outline-none"
              >
                <option value="ALL">Tất cả các tháng (Cả năm)</option>
                {stats.availableMonths.map((m) => (
                  <option key={m} value={m}>
                    Tháng {m}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {error && (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 p-3.5 text-xs font-bold text-rose-800">
            ⚠️ {error}
          </div>
        )}
      </div>

      {/* Results Dashboard */}
      {stats && (
        <div className="space-y-5">
          {/* Top KPI Summary */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="rounded-2xl border border-emerald-200 bg-white p-4 shadow-xs">
              <p className="text-[11px] font-bold uppercase text-slate-500">Tổng Sản Lượng Nhập</p>
              <p className="mt-1 text-2xl font-black text-emerald-700">
                {fmtTons(stats.overview.combinedTotalKg)} <span className="text-sm font-bold">tấn</span>
              </p>
              <p className="mt-1 text-xs text-slate-500">
                {stats.overview.combinedTotalLots} lô (Tươi: {fmtTons(stats.overview.freshTotalKg)}t • Khô: {fmtTons(stats.overview.dryTotalKg)}t)
              </p>
            </div>

            <div className="rounded-2xl border border-blue-200 bg-white p-4 shadow-xs">
              <p className="text-[11px] font-bold uppercase text-slate-500">Tổng Tiền Lúa &amp; Chi Phí</p>
              <p className="mt-1 text-xl font-black text-blue-700">
                {fmtMoney(stats.costBreakdown.grandTotalCost)}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                BQ Tươi: {fmtNum(stats.costBreakdown.fresh.realUnitCostPerKg)} đ/kg • BQ Khô: {fmtNum(stats.costBreakdown.dry.realUnitCostPerKg)} đ/kg
              </p>
            </div>

            <div className="rounded-2xl border border-rose-200 bg-white p-4 shadow-xs">
              <p className="text-[11px] font-bold uppercase text-slate-500">Hao Hụt &amp; Cảnh Báo</p>
              <p className="mt-1 text-2xl font-black text-rose-700">
                {fmtNum(stats.totalFreshLossKg + stats.totalDryLossKg)} <span className="text-sm font-bold">kg</span>
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Tươi: {stats.totalFreshLossPercent}% • {stats.lossAlerts.length} lô bất thường
              </p>
            </div>

            <div className="rounded-2xl border border-violet-200 bg-white p-4 shadow-xs">
              <p className="text-[11px] font-bold uppercase text-slate-500">Tiến Độ Xay &amp; Công Nợ</p>
              <p className="mt-1 text-2xl font-black text-violet-700">
                {stats.milling.milledPercentByWeight}% <span className="text-sm font-bold">đã xay</span>
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Chưa TT: {stats.financial.unpaidCount} lô ({fmtMoney(stats.financial.unpaidAmount)})
              </p>
            </div>
          </div>

          {/* 6 Tabs Navigation + Search */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-2.5 shadow-xs">
            <div className="flex flex-wrap gap-1.5">
              {(
                [
                  { id: 'overview', label: '1. Sản Lượng & Loại Lúa' },
                  { id: 'buyers', label: '2. Thu Mua & Vùng' },
                  { id: 'costs', label: '3. Chi Phí & Giá Thành' },
                  { id: 'loss', label: '4. Hao Hụt, Sấy & KCS' },
                  { id: 'milling', label: '5. Tiến Độ Xay Sát' },
                  { id: 'financial', label: '6. Tài Chính & Công Nợ' },
                ] as { id: ActiveTab; label: string }[]
              ).map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setActiveTab(t.id)}
                  className={`rounded-xl px-3.5 py-2 text-xs font-bold transition cursor-pointer ${
                    activeTab === t.id
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Tìm mã lô, NCC, nhân viên..."
              className="w-full sm:w-56 rounded-xl border border-slate-300 px-3 py-1.5 text-xs focus:border-emerald-500 focus:outline-none"
            />
          </div>

          {/* TAB 1: OVERVIEW & VARIETIES & DAILY TREND */}
          {activeTab === 'overview' && (
            <div className="space-y-5">
              {/* Daily Intake Chart */}
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
                <h3 className="text-sm font-black text-slate-900 mb-3">
                  Biểu Đồ Sản Lượng Nhập Theo Ngày ({stats.monthKey === 'ALL' ? 'Cả năm' : `Tháng ${stats.monthKey}`})
                </h3>
                {stats.dailyTrend.length === 0 ? (
                  <p className="text-xs text-slate-500">Không có dữ liệu ngày trong kỳ.</p>
                ) : (
                  <div className="flex items-end gap-1.5 h-44 overflow-x-auto pb-2 pt-4">
                    {stats.dailyTrend.map((d) => {
                      const heightPct = Math.max(4, Math.round((d.totalKg / maxDailyKg) * 100));
                      return (
                        <div
                          key={d.date}
                          className="flex flex-col items-center min-w-[28px] flex-1 group"
                          title={`${d.date}: ${fmtTons(d.totalKg)} tấn (${d.lots} lô)`}
                        >
                          <span className="text-[9px] font-bold text-slate-500 opacity-0 group-hover:opacity-100 transition">
                            {fmtTons(d.totalKg)}t
                          </span>
                          <div className="w-full flex flex-col justify-end h-32 bg-slate-100 rounded-t-md overflow-hidden">
                            <div
                              style={{ height: `${heightPct}%` }}
                              className="w-full bg-gradient-to-t from-emerald-600 to-teal-400 rounded-t-md transition-all"
                            />
                          </div>
                          <span className="mt-1 text-[10px] font-semibold text-slate-600">
                            {d.date.slice(0, 5)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Varieties Table */}
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs overflow-x-auto">
                <h3 className="text-sm font-black text-slate-900 mb-3">Cơ Cấu &amp; Đơn Giá Theo Loại Lúa</h3>
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 text-slate-500 uppercase text-[11px]">
                      <th className="py-2 pr-3">Loại Lúa</th>
                      <th className="py-2 pr-3">Nguồn</th>
                      <th className="py-2 pr-3 text-right">Số Lô</th>
                      <th className="py-2 pr-3 text-right">Lúa Tươi (Tấn)</th>
                      <th className="py-2 pr-3 text-right">Lúa Khô (Tấn)</th>
                      <th className="py-2 pr-3 text-right">Tổng (Tấn)</th>
                      <th className="py-2 pr-3 text-right">Tỷ Trọng</th>
                      <th className="py-2 pr-3 text-right">Giá BQ</th>
                      <th className="py-2 text-right">Min - Max</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {stats.varieties.map((v) => (
                      <tr key={v.variety} className="hover:bg-slate-50">
                        <td className="py-2.5 pr-3 font-bold text-slate-900">{v.variety}</td>
                        <td className="py-2.5 pr-3">{v.source}</td>
                        <td className="py-2.5 pr-3 text-right">{v.lots}</td>
                        <td className="py-2.5 pr-3 text-right">{fmtTons(v.freshKg)}</td>
                        <td className="py-2.5 pr-3 text-right">{fmtTons(v.dryKg)}</td>
                        <td className="py-2.5 pr-3 text-right font-bold text-emerald-700">{fmtTons(v.totalKg)}</td>
                        <td className="py-2.5 pr-3 text-right">{v.sharePercent}%</td>
                        <td className="py-2.5 pr-3 text-right font-semibold">{fmtNum(v.avgPrice)} đ</td>
                        <td className="py-2.5 text-right text-slate-500">
                          {fmtNum(v.minPrice)} - {fmtNum(v.maxPrice)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 2: BUYERS, SUPPLIERS & REGIONS */}
          {activeTab === 'buyers' && (
            <div className="space-y-5">
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs overflow-x-auto">
                <h3 className="text-sm font-black text-slate-900 mb-3">Bảng Xếp Hạng Nhân Viên Thu Mua</h3>
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 text-slate-500 uppercase text-[11px]">
                      <th className="py-2 pr-3">Nhân Viên</th>
                      <th className="py-2 pr-3 text-right">Lô Tươi</th>
                      <th className="py-2 pr-3 text-right">Tươi (Tấn)</th>
                      <th className="py-2 pr-3 text-right">Lô Khô</th>
                      <th className="py-2 pr-3 text-right">Khô (Tấn)</th>
                      <th className="py-2 pr-3 text-right">Tổng (Tấn)</th>
                      <th className="py-2 pr-3 text-right">Tổng Tiền</th>
                      <th className="py-2 pr-3 text-right">Giá BQ</th>
                      <th className="py-2 text-right">% Hao Hụt</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {stats.buyers.map((b) => (
                      <tr key={b.buyer} className="hover:bg-slate-50">
                        <td className="py-2.5 pr-3 font-bold text-slate-900">{b.buyer}</td>
                        <td className="py-2.5 pr-3 text-right">{b.freshLots}</td>
                        <td className="py-2.5 pr-3 text-right">{fmtTons(b.freshKg)}</td>
                        <td className="py-2.5 pr-3 text-right">{b.dryLots}</td>
                        <td className="py-2.5 pr-3 text-right">{fmtTons(b.dryKg)}</td>
                        <td className="py-2.5 pr-3 text-right font-bold text-emerald-700">{fmtTons(b.totalKg)}</td>
                        <td className="py-2.5 pr-3 text-right">{fmtMoney(b.totalAmount)}</td>
                        <td className="py-2.5 pr-3 text-right">{fmtNum(b.avgPrice)} đ</td>
                        <td className="py-2.5 text-right">{b.avgLossPercent}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs overflow-x-auto">
                  <h3 className="text-sm font-black text-slate-900 mb-3">Top Nhà Cung Cấp / Khách Hàng</h3>
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 text-slate-500 uppercase text-[11px]">
                        <th className="py-2 pr-2">Khách Hàng</th>
                        <th className="py-2 pr-2 text-right">Lô</th>
                        <th className="py-2 pr-2 text-right">Tổng (Tấn)</th>
                        <th className="py-2 text-right">Giá BQ</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredSuppliers.map((s) => (
                        <tr key={s.supplier} className="hover:bg-slate-50">
                          <td className="py-2 pr-2 font-semibold text-slate-900">{s.supplier}</td>
                          <td className="py-2 pr-2 text-right">{s.lots}</td>
                          <td className="py-2 pr-2 text-right font-bold text-blue-700">{fmtTons(s.totalKg)}</td>
                          <td className="py-2 text-right">{fmtNum(s.avgPrice)} đ</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs overflow-x-auto">
                  <h3 className="text-sm font-black text-slate-900 mb-3">Thống Kê Theo Vùng / Địa Điểm Cân</h3>
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 text-slate-500 uppercase text-[11px]">
                        <th className="py-2 pr-2">Khu Vực</th>
                        <th className="py-2 pr-2 text-right">Lô</th>
                        <th className="py-2 pr-2 text-right">Tổng (Tấn)</th>
                        <th className="py-2 text-right">Cước VC BQ</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {stats.regions.slice(0, 30).map((r) => (
                        <tr key={r.region} className="hover:bg-slate-50">
                          <td className="py-2 pr-2 font-semibold text-slate-900">{r.region}</td>
                          <td className="py-2 pr-2 text-right">{r.lots}</td>
                          <td className="py-2 pr-2 text-right font-bold text-emerald-700">{fmtTons(r.totalKg)}</td>
                          <td className="py-2 text-right">{fmtNum(r.avgFreightPerKg)} đ/kg</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: COST STRUCTURE */}
          {activeTab === 'costs' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              <div className="rounded-2xl border border-emerald-200 bg-white p-5 shadow-xs space-y-3">
                <h3 className="text-sm font-black text-emerald-900">Chi Phí &amp; Giá Thành Lúa Tươi Qua Sấy</h3>
                <div className="divide-y divide-slate-100 text-xs">
                  <div className="py-2 flex justify-between"><span>Tiền lúa lọt lòng phương tiện</span><span className="font-bold">{fmtMoney(stats.costBreakdown.fresh.riceAmount)}</span></div>
                  <div className="py-2 flex justify-between"><span>Cước vận chuyển mua vào</span><span className="font-bold">{fmtMoney(stats.costBreakdown.fresh.inboundFreight)}</span></div>
                  <div className="py-2 flex justify-between"><span>Cước tăng bo lúa tươi nhập sấy</span><span className="font-bold">{fmtMoney(stats.costBreakdown.fresh.transshipmentFreight)}</span></div>
                  <div className="py-2 flex justify-between"><span>Công đoàn bốc xếp tăng bo</span><span className="font-bold">{fmtMoney(stats.costBreakdown.fresh.laborUnionCost)}</span></div>
                  <div className="py-2 flex justify-between"><span>Tiền sấy (đã gồm VAT 5%)</span><span className="font-bold">{fmtMoney(stats.costBreakdown.fresh.dryingCostVat5)}</span></div>
                  <div className="py-2 flex justify-between"><span>Tiền xuất trả (đã gồm VAT 8%)</span><span className="font-bold">{fmtMoney(stats.costBreakdown.fresh.exportReturnCostVat8)}</span></div>
                  <div className="py-3 flex justify-between text-sm font-black text-emerald-800 bg-emerald-50 px-3 rounded-xl mt-2">
                    <span>Tổng Chi Phí ({fmtTons(stats.costBreakdown.fresh.totalKg)} tấn)</span>
                    <span>{fmtMoney(stats.costBreakdown.fresh.totalAllCosts)}</span>
                  </div>
                  <div className="py-2 flex justify-between text-xs font-bold text-slate-700">
                    <span>Đơn giá thành thực tế bình quân</span>
                    <span className="text-emerald-700 font-black">{fmtNum(stats.costBreakdown.fresh.realUnitCostPerKg)} đ/kg</span>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-amber-200 bg-white p-5 shadow-xs space-y-3">
                <h3 className="text-sm font-black text-amber-900">Chi Phí &amp; Giá Thành Lúa Khô Mua Trực Tiếp</h3>
                <div className="divide-y divide-slate-100 text-xs">
                  <div className="py-2 flex justify-between"><span>Tiền lúa khô</span><span className="font-bold">{fmtMoney(stats.costBreakdown.dry.riceAmount)}</span></div>
                  <div className="py-2 flex justify-between"><span>Cước vận chuyển lúa khô</span><span className="font-bold">{fmtMoney(stats.costBreakdown.dry.dryFreight)}</span></div>
                  <div className="py-2 flex justify-between"><span>Chi phí khác</span><span className="font-bold">{fmtMoney(stats.costBreakdown.dry.otherCosts)}</span></div>
                  <div className="py-3 flex justify-between text-sm font-black text-amber-800 bg-amber-50 px-3 rounded-xl mt-2">
                    <span>Tổng Chi Phí Tới Nhà Máy ({fmtTons(stats.costBreakdown.dry.totalKg)} tấn)</span>
                    <span>{fmtMoney(stats.costBreakdown.dry.totalFactoryCost)}</span>
                  </div>
                  <div className="py-2 flex justify-between text-xs font-bold text-slate-700">
                    <span>Đơn giá thành thực tế tới nhà máy</span>
                    <span className="text-amber-700 font-black">{fmtNum(stats.costBreakdown.dry.realUnitCostPerKg)} đ/kg</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: LOSS, FACILITIES & KCS */}
          {activeTab === 'loss' && (
            <div className="space-y-5">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs overflow-x-auto">
                  <h3 className="text-sm font-black text-slate-900 mb-3">Hiệu Suất Theo Cơ Sở Sấy</h3>
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 text-slate-500 uppercase text-[11px]">
                        <th className="py-2 pr-2">Cơ Sở Sấy</th>
                        <th className="py-2 pr-2 text-right">Lô</th>
                        <th className="py-2 pr-2 text-right">Tươi (Tấn)</th>
                        <th className="py-2 pr-2 text-right">Hao Hụt (Kg)</th>
                        <th className="py-2 text-right">% Thu Hồi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {stats.facilities.map((f) => (
                        <tr key={f.facility} className="hover:bg-slate-50">
                          <td className="py-2 pr-2 font-bold text-slate-900">{f.facility}</td>
                          <td className="py-2 pr-2 text-right">{f.lots}</td>
                          <td className="py-2 pr-2 text-right">{fmtTons(f.inputFreshKg)}</td>
                          <td className="py-2 pr-2 text-right text-rose-700 font-semibold">{fmtNum(f.lossKg)}</td>
                          <td className="py-2 text-right font-bold text-emerald-700">{f.avgRecoveryPercent}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs overflow-x-auto">
                  <h3 className="text-sm font-black text-slate-900 mb-3">Chất Lượng KCS Bình Quân Theo Loại Lúa</h3>
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 text-slate-500 uppercase text-[11px]">
                        <th className="py-2 pr-2">Loại Lúa</th>
                        <th className="py-2 pr-2 text-right">Số Mẫu</th>
                        <th className="py-2 pr-2 text-right">Mất %</th>
                        <th className="py-2 pr-2 text-right">Tổng Thu</th>
                        <th className="py-2 text-right">Đầu Gạo</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {stats.kcsByVariety.map((k) => (
                        <tr key={k.variety} className="hover:bg-slate-50">
                          <td className="py-2 pr-2 font-bold text-slate-900">{k.variety}</td>
                          <td className="py-2 pr-2 text-right">{k.sampleCount}</td>
                          <td className="py-2 pr-2 text-right">{k.avgLossPercent}%</td>
                          <td className="py-2 pr-2 text-right font-semibold">{k.avgTotalYieldKg}</td>
                          <td className="py-2 text-right font-bold text-blue-700">{k.avgHeadRiceKg}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="rounded-2xl border border-rose-200 bg-white p-5 shadow-xs overflow-x-auto">
                <h3 className="text-sm font-black text-rose-800 mb-3">
                  ⚠️ Cảnh Báo Lô Hao Hụt Cao / Cân Lỗi ({filteredLossAlerts.length} lô)
                </h3>
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 text-slate-500 uppercase text-[11px]">
                      <th className="py-2 pr-2">Nguồn</th>
                      <th className="py-2 pr-2">Ngày</th>
                      <th className="py-2 pr-2">Mã Lô</th>
                      <th className="py-2 pr-2">Nhà Cung Cấp</th>
                      <th className="py-2 pr-2">NV Thu Mua</th>
                      <th className="py-2 pr-2 text-right">KL (Kg)</th>
                      <th className="py-2 pr-2 text-right">Hao Hụt (Kg)</th>
                      <th className="py-2">Lý Do / Ghi Chú</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredLossAlerts.map((a, idx) => (
                      <tr key={`${a.lotCode}-${idx}`} className="hover:bg-rose-50/40">
                        <td className="py-2 pr-2 font-semibold">{a.source}</td>
                        <td className="py-2 pr-2">{a.date}</td>
                        <td className="py-2 pr-2 font-mono">{a.lotCode}</td>
                        <td className="py-2 pr-2 font-semibold">{a.supplier}</td>
                        <td className="py-2 pr-2">{a.buyer}</td>
                        <td className="py-2 pr-2 text-right">{fmtNum(a.weightKg)}</td>
                        <td className="py-2 pr-2 text-right font-bold text-rose-700">{fmtNum(a.lossKg)} ({a.lossPercent}%)</td>
                        <td className="py-2 text-rose-700 font-medium">{a.reason} {a.note !== '-' ? `(${a.note})` : ''}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 5: MILLING PROGRESS */}
          {activeTab === 'milling' && (
            <div className="space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                  <p className="text-[11px] font-bold text-slate-500 uppercase">Đã Xay / Tổng Lô</p>
                  <p className="mt-1 text-xl font-black text-emerald-700">
                    {stats.milling.milledLots} / {stats.milling.totalLots} lô
                  </p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                  <p className="text-[11px] font-bold text-slate-500 uppercase">Xay Máy 1 / Máy 2 / NSX</p>
                  <p className="mt-1 text-xs font-bold text-slate-800">
                    M1: {fmtTons(stats.milling.freshMilledMay1Kg)}t • M2: {fmtTons(stats.milling.freshMilledMay2Kg)}t • NSX: {fmtTons(stats.milling.freshMilledNsxKg)}t
                  </p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                  <p className="text-[11px] font-bold text-slate-500 uppercase">Tồn Chưa Xay</p>
                  <p className="mt-1 text-xl font-black text-amber-700">
                    {fmtTons(stats.milling.unmilledFreshKg + stats.milling.unmilledDryKg)} tấn
                  </p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                  <p className="text-[11px] font-bold text-slate-500 uppercase">Lưu Kho Trung Bình</p>
                  <p className="mt-1 text-xl font-black text-blue-700">
                    {stats.milling.avgStorageDays} ngày
                  </p>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs overflow-x-auto">
                <h3 className="text-sm font-black text-slate-900 mb-3">
                  Danh Sách Lô Nhập Trong Kỳ Chưa Có Ngày Xay ({stats.milling.unmilledLots} lô)
                </h3>
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 text-slate-500 uppercase text-[11px]">
                      <th className="py-2 pr-2">Nguồn</th>
                      <th className="py-2 pr-2">Ngày Cân</th>
                      <th className="py-2 pr-2">Mã Lô</th>
                      <th className="py-2 pr-2">Nhà Cung Cấp</th>
                      <th className="py-2 pr-2">Loại Lúa</th>
                      <th className="py-2 pr-2 text-right">KL (Kg)</th>
                      <th className="py-2 pr-2">NV Thu Mua</th>
                      <th className="py-2">Cơ Sở</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {stats.milling.unmilledItems.map((u, idx) => (
                      <tr key={`${u.lotCode}-${idx}`} className="hover:bg-slate-50">
                        <td className="py-2 pr-2 font-semibold">{u.source}</td>
                        <td className="py-2 pr-2">{u.date}</td>
                        <td className="py-2 pr-2 font-mono">{u.lotCode}</td>
                        <td className="py-2 pr-2 font-semibold">{u.supplier}</td>
                        <td className="py-2 pr-2">{u.variety}</td>
                        <td className="py-2 pr-2 text-right font-bold">{fmtNum(u.weightKg)}</td>
                        <td className="py-2 pr-2">{u.buyer}</td>
                        <td className="py-2">{u.facility}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 6: FINANCIAL & DEBT */}
          {activeTab === 'financial' && (
            <div className="space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                  <p className="text-[11px] font-bold text-slate-500 uppercase">Tổng Tiền Hàng</p>
                  <p className="mt-1 text-lg font-black text-slate-900">{fmtMoney(stats.financial.totalAmount)}</p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                  <p className="text-[11px] font-bold text-slate-500 uppercase">Đã Tạm Ứng</p>
                  <p className="mt-1 text-lg font-black text-blue-700">{fmtMoney(stats.financial.totalAdvance)}</p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                  <p className="text-[11px] font-bold text-slate-500 uppercase">Đã Trừ Cọc</p>
                  <p className="mt-1 text-lg font-black text-amber-700">{fmtMoney(stats.financial.totalDepositDeducted)}</p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                  <p className="text-[11px] font-bold text-slate-500 uppercase">Còn Thanh Toán</p>
                  <p className="mt-1 text-lg font-black text-emerald-700">{fmtMoney(stats.financial.totalPayable)}</p>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs overflow-x-auto">
                  <h3 className="text-sm font-black text-slate-900 mb-3">Thanh Toán Theo Ngân Hàng</h3>
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 text-slate-500 uppercase text-[11px]">
                        <th className="py-2 pr-2">Ngân Hàng</th>
                        <th className="py-2 pr-2 text-right">Giao Dịch</th>
                        <th className="py-2 text-right">Số Tiền</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {stats.financial.banks.map((b) => (
                        <tr key={b.bank} className="hover:bg-slate-50">
                          <td className="py-2 pr-2 font-bold">{b.bank}</td>
                          <td className="py-2 pr-2 text-right">{b.count}</td>
                          <td className="py-2 text-right font-semibold">{fmtMoney(b.totalPaid)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="lg:col-span-2 rounded-2xl border border-amber-200 bg-white p-5 shadow-xs overflow-x-auto">
                  <h3 className="text-sm font-black text-amber-900 mb-3">
                    Cảnh Báo Công Nợ / Chưa Thanh Toán / Hoàn Tiền ({filteredDebtAlerts.length} lô)
                  </h3>
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 text-slate-500 uppercase text-[11px]">
                        <th className="py-2 pr-2">Nguồn</th>
                        <th className="py-2 pr-2">Ngày</th>
                        <th className="py-2 pr-2">Nhà Cung Cấp</th>
                        <th className="py-2 pr-2">NV</th>
                        <th className="py-2 pr-2 text-right">Thanh Toán</th>
                        <th className="py-2">Trạng Thái</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredDebtAlerts.map((d, idx) => (
                        <tr key={`${d.lotCode}-${idx}`} className="hover:bg-amber-50/40">
                          <td className="py-2 pr-2 font-semibold">{d.source}</td>
                          <td className="py-2 pr-2">{d.date}</td>
                          <td className="py-2 pr-2 font-semibold">{d.supplier}</td>
                          <td className="py-2 pr-2">{d.buyer}</td>
                          <td className={`py-2 pr-2 text-right font-bold ${d.payable < 0 ? 'text-rose-700' : 'text-amber-800'}`}>
                            {fmtMoney(d.payable)}
                          </td>
                          <td className="py-2 font-semibold">{d.alertType}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
