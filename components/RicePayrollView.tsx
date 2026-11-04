'use client';

import React, { useState, useEffect } from 'react';
import { RiceBatch, DailyReconciliationResult } from '@/lib/rice-payroll/types';

/**
 * Định dạng số tiền VND đồng nhất tuyệt đối giữa Server SSR và Client Browser,
 * loại bỏ hoàn toàn lỗi React Hydration Error #418 do khác biệt locale.
 */
function formatVND(val: number | null | undefined): string {
  if (val === null || val === undefined || isNaN(val)) return '0';
  return Math.round(val).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

export default function RicePayrollView() {
  const [mounted, setMounted] = useState(false);

  // State quản lý nạp dữ liệu Excel
  const [isLoadingFile, setIsLoadingFile] = useState(false);
  const [loadedFileName, setLoadedFileName] = useState<string>('');
  const [allBatches, setAllBatches] = useState<RiceBatch[]>([]);
  const [availableDates, setAvailableDates] = useState<string[]>([]);
  const [facilities, setFacilities] = useState<string[]>([]);

  useEffect(() => {
    setMounted(true);
  }, []);

  // State bộ lọc
  const [selectedFacility, setSelectedFacility] = useState<string>('Cơ sở 1');
  const [selectedDate, setSelectedDate] = useState<string>('30/09/2026');

  // State nhập sổ tay Chú 6 Thanh
  const [tonsCoTro, setTonsCoTro] = useState<number>(168);
  const [priceCoTro, setPriceCoTro] = useState<number>(20000);
  const [tonsKhongTro, setTonsKhongTro] = useState<number>(253);
  const [priceKhongTro, setPriceKhongTro] = useState<number>(16000);

  // State đối soát
  const [isReconciling, setIsReconciling] = useState(false);
  const [reconcileResult, setReconcileResult] = useState<DailyReconciliationResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>('');

  // State danh sách công nhật đã lưu trong tháng
  const [savedLogs, setSavedLogs] = useState<DailyReconciliationResult[]>([]);
  const [isExporting, setIsExporting] = useState(false);

  // Nạp file mẫu 2026 từ hệ thống
  const handleLoadSample = async () => {
    setIsLoadingFile(true);
    setErrorMessage('');
    try {
      const res = await fetch('/api/rice-payroll/parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ useSample: true }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Lỗi khi nạp file mẫu');

      setLoadedFileName(data.fileName);
      setAllBatches(data.batches);
      setAvailableDates(data.dates);
      setFacilities(data.facilities);

      // Nếu có ngày 30/09/2026 thì mặc định chọn
      if (data.dates.includes('30/09/2026')) {
        setSelectedDate('30/09/2026');
      } else if (data.dates.length > 0) {
        setSelectedDate(data.dates[data.dates.length - 1]);
      }
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Lỗi không xác định');
    } finally {
      setIsLoadingFile(false);
    }
  };

  // Upload file từ máy
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsLoadingFile(true);
    setErrorMessage('');
    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch('/api/rice-payroll/parse', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Lỗi khi đọc file Excel');

      setLoadedFileName(data.fileName);
      setAllBatches(data.batches);
      setAvailableDates(data.dates);
      setFacilities(data.facilities);

      if (data.dates.includes('30/09/2026')) {
        setSelectedDate('30/09/2026');
      } else if (data.dates.length > 0) {
        setSelectedDate(data.dates[data.dates.length - 1]);
      }
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Lỗi upload');
    } finally {
      setIsLoadingFile(false);
    }
  };

  // Lọc các mẻ lúa trong ngày đã chọn
  const dayBatches = allBatches.filter((b) => {
    const matchDate = b.dischargeDate === selectedDate || b.dryDate === selectedDate;
    const matchFacility = !selectedFacility || b.dryFacility.toLowerCase().includes(selectedFacility.toLowerCase());
    return matchDate && matchFacility;
  });

  const totalDayActualTons = dayBatches.reduce((s, b) => s + b.roundedTons, 0);

  // Chạy thuật toán tự động ghép mẻ & đối soát
  const handleReconcile = async () => {
    if (dayBatches.length === 0) {
      setErrorMessage(`Không có mẻ lúa nào tại ${selectedFacility} vào ngày ${selectedDate}`);
      return;
    }

    setIsReconciling(true);
    setErrorMessage('');
    try {
      const res = await fetch('/api/rice-payroll/reconcile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          batches: dayBatches,
          report: {
            date: selectedDate,
            tonsCoTro,
            unitPriceCoTro: priceCoTro,
            tonsKhongTro,
            unitPriceKhongTro: priceKhongTro,
          },
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Lỗi đối soát');

      setReconcileResult(data.result);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Lỗi đối soát');
    } finally {
      setIsReconciling(false);
    }
  };

  // Lưu công nhật vào bảng lương tháng
  const handleSaveToMonthly = () => {
    if (!reconcileResult) return;
    // Kiểm tra xem ngày này đã lưu chưa
    const filtered = savedLogs.filter((l) => l.date !== reconcileResult.date);
    setSavedLogs([...filtered, reconcileResult]);
    alert(`Đã lưu công nhật ngày ${reconcileResult.date} vào Bảng Lương Tháng!`);
  };

  // Xuất file Excel báo cáo tháng
  const handleExportExcel = async () => {
    if (savedLogs.length === 0) {
      alert('Chưa có ngày công nào được lưu để xuất báo cáo!');
      return;
    }

    setIsExporting(true);
    try {
      const res = await fetch('/api/rice-payroll/export-monthly', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          month: 10,
          year: 2026,
          teamName: 'ĐỘI CHÚ 6 THANH - XUẤT CS1',
          dailyLogs: savedLogs,
        }),
      });

      if (!res.ok) throw new Error('Lỗi khi xuất Excel');

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Bang_Ke_Luong_T10_2026_Chu_6_Thanh.xlsx`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Lỗi khi xuất file');
    } finally {
      setIsExporting(false);
    }
  };

  // Tổng tiền cả tháng đã lưu
  const monthlyTotalSalary = savedLogs.reduce((s, l) => s + l.totalAmount, 0);
  const monthlyTotalTons = savedLogs.reduce((s, l) => s + l.expectedTonsCoTro + l.expectedTonsKhongTro, 0);

  return (
    <div className="space-y-6">
      {/* 1. THẺ NẠP DỮ LIỆU FILE MASTER EXCEL */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs transition-all">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-100 text-emerald-800 text-base font-bold">
                1
              </span>
              <h2 className="text-base font-bold text-slate-900">
                Nguồn Dữ Liệu: File Excel Master Lúa Tươi
              </h2>
            </div>
            <p className="mt-1 text-xs text-slate-500 pl-10">
              Hệ thống tự động lọc các cột an toàn (Cân nhập sấy, ngày xuống lúa, phương tiện) và áp dụng quy tắc làm tròn &ge; 0.333 tấn.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              onClick={handleLoadSample}
              disabled={isLoadingFile}
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 px-4 py-2 text-xs font-semibold text-white shadow-xs hover:from-emerald-700 hover:to-teal-700 disabled:opacity-50 cursor-pointer transition-all"
            >
              <span>⚡</span>
              <span>{isLoadingFile ? 'Đang đọc...' : 'Nạp File Mẫu 2026 Trong Máy'}</span>
            </button>

            <label className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 cursor-pointer transition-all">
              <span>📁</span>
              <span>Chọn file khác (.xlsx)</span>
              <input
                type="file"
                accept=".xlsx, .xls"
                className="hidden"
                onChange={handleFileUpload}
              />
            </label>
          </div>
        </div>

        {/* Trạng thái file đã nạp */}
        {loadedFileName && (
          <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl bg-emerald-50/80 px-4 py-2.5 border border-emerald-200/60 text-xs text-emerald-900">
            <span className="font-semibold text-emerald-700">✓ Đã nạp thành công:</span>
            <span className="font-medium underline">{loadedFileName}</span>
            <span className="rounded-md bg-white px-2 py-0.5 font-bold shadow-2xs">
              {formatVND(allBatches.length)} mẻ lúa hợp lệ
            </span>
            <span className="text-emerald-700">&bull; {availableDates.length} ngày làm việc</span>
          </div>
        )}

        {errorMessage && (
          <div className="mt-3 rounded-xl bg-red-50 p-3 border border-red-200 text-xs text-red-700">
            ⚠️ {errorMessage}
          </div>
        )}
      </div>

      {/* 2. KHU VỰC NHẬP SỔ TAY CHÚ 6 THANH & ĐỐI SOÁT */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* CỘT TRÁI: FORM NHẬP NHANH SỔ TAY CHÚ (5 CỘT) */}
        <div className="lg:col-span-5 space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-100 text-blue-800 text-sm font-bold">
                  2
                </span>
                <h3 className="text-sm font-bold text-slate-900">
                  Nhập Sổ Tay: Đội Chú 6 Thanh
                </h3>
              </div>
              <span className="rounded-full bg-blue-50 px-2.5 py-0.5 text-[11px] font-semibold text-blue-700">
                Xuất Cơ sở 1
              </span>
            </div>

            <div className="mt-4 space-y-3.5">
              {/* Chọn Ngày làm việc */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Ngày làm việc (xuống lúa / sấy)
                </label>
                {availableDates.length > 0 ? (
                  <select
                    value={selectedDate}
                    onChange={(e) => {
                      setSelectedDate(e.target.value);
                      setReconcileResult(null);
                    }}
                    className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-800 shadow-2xs focus:border-blue-500 focus:outline-none"
                  >
                    {availableDates.map((d) => (
                      <option key={d} value={d}>
                        Ngày {d}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    value={selectedDate}
                    onChange={(e) => setSelectedDate(e.target.value)}
                    placeholder="VD: 30/09/2026"
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs text-slate-800 focus:border-blue-500 focus:outline-none"
                  />
                )}
                <p className="mt-1 text-[11px] text-slate-500">
                  Hệ thống tìm thấy {dayBatches.length} mẻ lúa trong ngày này (Tổng: {formatVND(totalDayActualTons)} tấn).
                </p>
              </div>

              {/* Hàng 1: Xuất có trở */}
              <div className="rounded-xl border border-amber-200/80 bg-amber-50/50 p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-amber-900">
                    🌾 Xuất có trở
                  </span>
                  <span className="text-[11px] font-medium text-amber-700">
                    Đơn giá: {formatVND(priceCoTro)} đ/tấn
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[11px] text-slate-600 block">Số tấn báo</label>
                    <input
                      type="number"
                      value={tonsCoTro || ''}
                      onChange={(e) => setTonsCoTro(Number(e.target.value))}
                      className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-900 focus:border-amber-500 focus:outline-none"
                      placeholder="168"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-slate-600 block">Đơn giá (đ)</label>
                    <input
                      type="number"
                      value={priceCoTro || ''}
                      onChange={(e) => setPriceCoTro(Number(e.target.value))}
                      className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-900 focus:border-amber-500 focus:outline-none"
                    />
                  </div>
                </div>
                <div className="text-right text-xs font-bold text-amber-800">
                  = {formatVND(tonsCoTro * priceCoTro)} đ
                </div>
              </div>

              {/* Hàng 2: Xuất không trở */}
              <div className="rounded-xl border border-indigo-200/80 bg-indigo-50/50 p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-indigo-900">
                    🌾 Xuất 0 trở (Không trở)
                  </span>
                  <span className="text-[11px] font-medium text-indigo-700">
                    Đơn giá: {formatVND(priceKhongTro)} đ/tấn
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[11px] text-slate-600 block">Số tấn báo</label>
                    <input
                      type="number"
                      value={tonsKhongTro || ''}
                      onChange={(e) => setTonsKhongTro(Number(e.target.value))}
                      className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-900 focus:border-indigo-500 focus:outline-none"
                      placeholder="253"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-slate-600 block">Đơn giá (đ)</label>
                    <input
                      type="number"
                      value={priceKhongTro || ''}
                      onChange={(e) => setPriceKhongTro(Number(e.target.value))}
                      className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-900 focus:border-indigo-500 focus:outline-none"
                    />
                  </div>
                </div>
                <div className="text-right text-xs font-bold text-indigo-800">
                  = {formatVND(tonsKhongTro * priceKhongTro)} đ
                </div>
              </div>

              {/* Nút bấm đối soát */}
              <button
                onClick={handleReconcile}
                disabled={isReconciling || allBatches.length === 0}
                className="w-full flex items-center justify-center gap-2 rounded-xl bg-blue-600 py-2.5 text-xs font-bold text-white shadow-xs hover:bg-blue-700 disabled:opacity-50 cursor-pointer transition-all"
              >
                <span>🔍</span>
                <span>{isReconciling ? 'Đang phân tích...' : 'Tự Động Ghép Mẻ & Đối Soát'}</span>
              </button>
            </div>
          </div>

          {/* CARD ĐỐI SOÁT CHÂN TRANG SỔ TAY */}
          {reconcileResult && (
            <div
              className={`rounded-2xl border p-5 shadow-xs transition-all ${
                reconcileResult.isMatched
                  ? 'border-emerald-300 bg-emerald-50/70'
                  : 'border-amber-300 bg-amber-50/70'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-700">
                  Kết Quả Đối Soát Chân Trang Sổ
                </span>
                <span
                  className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold ${
                    reconcileResult.isMatched
                      ? 'bg-emerald-200 text-emerald-900'
                      : 'bg-amber-200 text-amber-900'
                  }`}
                >
                  {reconcileResult.isMatched ? '🟢 Khớp 100%' : '⚠️ Lệch Số Liệu'}
                </span>
              </div>

              <div className="mt-3 flex items-baseline justify-between border-b border-slate-200/70 pb-3">
                <span className="text-xs text-slate-600">Tổng tiền công ngày:</span>
                <span className="text-xl font-extrabold text-slate-900">
                  {formatVND(reconcileResult.totalAmount)} đ
                </span>
              </div>

              <p className="mt-2 text-xs text-slate-700 leading-relaxed">
                {reconcileResult.message}
              </p>

              {reconcileResult.isMatched && (
                <button
                  onClick={handleSaveToMonthly}
                  className="mt-3 w-full rounded-xl bg-emerald-600 py-2 text-xs font-bold text-white shadow-xs hover:bg-emerald-700 cursor-pointer transition-all"
                >
                  💾 Lưu Vào Bảng Lương Tháng
                </button>
              )}
            </div>
          )}
        </div>

        {/* CỘT PHẢI: CHI TIẾT MẺ LÚA ĐÃ GHÉP (7 CỘT) */}
        <div className="lg:col-span-7 space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-teal-100 text-teal-800 text-sm font-bold">
                  3
                </span>
                <h3 className="text-sm font-bold text-slate-900">
                  Chi Tiết Mẻ Lúa Trong Ngày ({selectedDate})
                </h3>
              </div>
              <span className="text-xs text-slate-500">
                {dayBatches.length} mẻ lúa &bull; {formatVND(totalDayActualTons)} tấn
              </span>
            </div>

            {dayBatches.length === 0 ? (
              <div className="py-12 text-center text-xs text-slate-400">
                {allBatches.length === 0
                  ? 'Vui lòng bấm nút "Nạp File Mẫu 2026" ở trên để xem danh sách mẻ lúa.'
                  : `Không có dữ liệu mẻ lúa cho ngày ${selectedDate}. Hãy chọn ngày khác từ danh sách.`}
              </div>
            ) : (
              <div className="mt-3 overflow-x-auto max-h-[460px] overflow-y-auto">
                <table className="w-full text-left text-xs">
                  <thead className="sticky top-0 bg-slate-100 text-[11px] font-bold text-slate-600 uppercase border-b border-slate-200">
                    <tr>
                      <th className="py-2 px-2.5">Mã Lô</th>
                      <th className="py-2 px-2.5">Khách Hàng</th>
                      <th className="py-2 px-2.5">Loại Lúa</th>
                      <th className="py-2 px-2.5">Phương Tiện</th>
                      <th className="py-2 px-2.5 text-right">Cân sấy (kg)</th>
                      <th className="py-2 px-2.5 text-right">Tấn làm tròn</th>
                      <th className="py-2 px-2.5 text-center">Phân loại</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {/* Nếu đã đối soát, hiển thị theo nhóm */}
                    {reconcileResult && reconcileResult.batchesCoTro.length > 0 ? (
                      <>
                        {reconcileResult.batchesCoTro.map((b) => (
                          <tr key={b.id} className="hover:bg-amber-50/50 bg-amber-50/20">
                            <td className="py-2 px-2.5 font-semibold text-slate-900">{b.batchCode}</td>
                            <td className="py-2 px-2.5 text-slate-700">{b.customerName}</td>
                            <td className="py-2 px-2.5 text-slate-600">{b.riceType}</td>
                            <td className="py-2 px-2.5 text-slate-600">{b.dryVehicle || b.vehicleName}</td>
                            <td className="py-2 px-2.5 text-right text-slate-600">{formatVND(b.dryWeightKg)}</td>
                            <td className="py-2 px-2.5 text-right font-bold text-amber-700">{b.roundedTons}</td>
                            <td className="py-2 px-2.5 text-center">
                              <span className="rounded-md bg-amber-100 text-amber-800 px-2 py-0.5 text-[10px] font-bold">
                                Có trở (20k)
                              </span>
                            </td>
                          </tr>
                        ))}
                        {reconcileResult.batchesKhongTro.map((b) => (
                          <tr key={b.id} className="hover:bg-indigo-50/50 bg-indigo-50/20">
                            <td className="py-2 px-2.5 font-semibold text-slate-900">{b.batchCode}</td>
                            <td className="py-2 px-2.5 text-slate-700">{b.customerName}</td>
                            <td className="py-2 px-2.5 text-slate-600">{b.riceType}</td>
                            <td className="py-2 px-2.5 text-slate-600">{b.dryVehicle || b.vehicleName}</td>
                            <td className="py-2 px-2.5 text-right text-slate-600">{formatVND(b.dryWeightKg)}</td>
                            <td className="py-2 px-2.5 text-right font-bold text-indigo-700">{b.roundedTons}</td>
                            <td className="py-2 px-2.5 text-center">
                              <span className="rounded-md bg-indigo-100 text-indigo-800 px-2 py-0.5 text-[10px] font-bold">
                                Không trở (16k)
                              </span>
                            </td>
                          </tr>
                        ))}
                      </>
                    ) : (
                      dayBatches.map((b) => (
                        <tr key={b.id} className="hover:bg-slate-50">
                          <td className="py-2 px-2.5 font-semibold text-slate-900">{b.batchCode}</td>
                          <td className="py-2 px-2.5 text-slate-700">{b.customerName}</td>
                          <td className="py-2 px-2.5 text-slate-600">{b.riceType}</td>
                          <td className="py-2 px-2.5 text-slate-600">{b.dryVehicle || b.vehicleName}</td>
                          <td className="py-2 px-2.5 text-right text-slate-600">{formatVND(b.dryWeightKg)}</td>
                          <td className="py-2 px-2.5 text-right font-bold text-slate-800">{b.roundedTons}</td>
                          <td className="py-2 px-2.5 text-center">
                            <span className="rounded-md bg-slate-100 text-slate-600 px-2 py-0.5 text-[10px]">
                              Chờ ghép
                            </span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 3. BẢNG TỔNG HỢP LƯƠNG THÁNG & NÚT XUẤT EXCEL */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-100 pb-4">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-100 text-indigo-800 text-base font-bold">
              4
            </span>
            <div>
              <h3 className="text-base font-bold text-slate-900">
                Bảng Kê Lương Tháng &bull; Đội Chú 6 Thanh
              </h3>
              <p className="text-xs text-slate-500">
                Đã chốt {savedLogs.length} ngày công &bull; Tổng sản lượng: {formatVND(monthlyTotalTons)} tấn &bull; Tổng lương:{' '}
                <strong className="text-slate-900">{formatVND(monthlyTotalSalary)} đ</strong>
              </p>
            </div>
          </div>

          <button
            onClick={handleExportExcel}
            disabled={isExporting || savedLogs.length === 0}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-700 to-indigo-600 px-4 py-2 text-xs font-bold text-white shadow-xs hover:from-blue-800 hover:to-indigo-700 disabled:opacity-50 cursor-pointer transition-all"
          >
            <span>📥</span>
            <span>{isExporting ? 'Đang kết xuất...' : 'Xuất File Excel (.xlsx) Bảng Lương'}</span>
          </button>
        </div>

        {savedLogs.length === 0 ? (
          <div className="py-10 text-center text-xs text-slate-400">
            Chưa có ngày công nào được lưu. Sau khi bấm <strong>"Tự Động Ghép Mẻ &amp; Đối Soát"</strong> và khớp số liệu, bấm nút <strong>"Lưu Vào Bảng Lương Tháng"</strong> để tổng hợp vào đây.
          </div>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-100 text-[11px] font-bold text-slate-600 uppercase">
                <tr>
                  <th className="py-2.5 px-3">Ngày Làm</th>
                  <th className="py-2.5 px-3 text-right">Có trở (tấn)</th>
                  <th className="py-2.5 px-3 text-right">Tiền có trở</th>
                  <th className="py-2.5 px-3 text-right">Không trở (tấn)</th>
                  <th className="py-2.5 px-3 text-right">Tiền không trở</th>
                  <th className="py-2.5 px-3 text-right">Tổng Ngày (đ)</th>
                  <th className="py-2.5 px-3 text-center">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {savedLogs.map((log) => (
                  <tr key={log.date} className="hover:bg-slate-50">
                    <td className="py-2.5 px-3 font-bold text-slate-900">{log.date}</td>
                    <td className="py-2.5 px-3 text-right text-amber-700 font-semibold">{log.expectedTonsCoTro}</td>
                    <td className="py-2.5 px-3 text-right text-slate-700">{formatVND(log.amountCoTro)} đ</td>
                    <td className="py-2.5 px-3 text-right text-indigo-700 font-semibold">{log.expectedTonsKhongTro}</td>
                    <td className="py-2.5 px-3 text-right text-slate-700">{formatVND(log.amountKhongTro)} đ</td>
                    <td className="py-2.5 px-3 text-right font-extrabold text-slate-900">{formatVND(log.totalAmount)} đ</td>
                    <td className="py-2.5 px-3 text-center">
                      <button
                        onClick={() => setSavedLogs(savedLogs.filter((l) => l.date !== log.date))}
                        className="text-[11px] text-red-600 hover:text-red-800 font-medium cursor-pointer"
                      >
                        Xóa
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-slate-50 font-bold border-t-2 border-slate-200">
                  <td className="py-2.5 px-3 text-slate-900">TỔNG CỘNG</td>
                  <td className="py-2.5 px-3 text-right text-amber-800">
                    {formatVND(savedLogs.reduce((s, l) => s + l.expectedTonsCoTro, 0))}
                  </td>
                  <td className="py-2.5 px-3 text-right text-slate-800">
                    {formatVND(savedLogs.reduce((s, l) => s + l.amountCoTro, 0))} đ
                  </td>
                  <td className="py-2.5 px-3 text-right text-indigo-800">
                    {formatVND(savedLogs.reduce((s, l) => s + l.expectedTonsKhongTro, 0))}
                  </td>
                  <td className="py-2.5 px-3 text-right text-slate-800">
                    {formatVND(savedLogs.reduce((s, l) => s + l.amountKhongTro, 0))} đ
                  </td>
                  <td className="py-2.5 px-3 text-right text-base text-blue-700">
                    {formatVND(monthlyTotalSalary)} đ
                  </td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

