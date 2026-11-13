'use client';

/**
 * RiceChumLoView — Giao diện Quản lý & Tính Lương Chụm Lò Cơ Sở 1
 *
 * Dữ liệu nguồn: Trích xuất từ file Master Lúa (Cơ sở sấy = CƠ SỞ I, theo NGÀY NHẬP SẤY)
 * Căn cứ mẫu chuẩn: TONG_HOP_DOI_CHỤM LÒ_T10_2026_XONG.xlsx
 */

import React, { useCallback, useMemo, useRef, useState } from 'react';
import { RiceBatch } from '@/lib/rice-payroll/types';
import { isCoSo1 } from '@/lib/rice-payroll/facility-filter';
import { roundRiceTons } from '@/lib/rice-payroll/rounding';
import { getMonthKeyFromDate, getSortedMonthKeysFromDates } from '@/lib/rice-payroll/month-utils';
import { ChumLoBatch } from '@/lib/rice-payroll/chum-lo-types';
import {
  ChumLoWorker,
  DEFAULT_CHUM_LO_WORKERS,
  DEFAULT_CHUM_LO_UNIT_PRICE,
} from '@/lib/rice-payroll/team-chum-lo-workers';

function formatMoney(n: number): string {
  return Math.round(n).toLocaleString('vi-VN');
}

export default function RiceChumLoView() {
  // ── State: File & Batches ───────────────────────────────────────────────
  const [allBatches, setAllBatches] = useState<RiceBatch[]>([]);
  const [isParsing, setIsParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── State: Tháng chọn ───────────────────────────────────────────────────
  const [selectedMonthKey, setSelectedMonthKey] = useState<string>('');

  // ── State: Đơn giá chụm lò (VNĐ/tấn) ────────────────────────────────────
  const [unitPrice, setUnitPrice] = useState<number>(DEFAULT_CHUM_LO_UNIT_PRICE);

  // ── State: Điều chỉnh số Tấn thủ công theo từng mẻ (key = batch.id) ────
  const [customTonsMap, setCustomTonsMap] = useState<Record<string, number>>({});

  // ── State: Danh sách công nhân đội chụm lò ─────────────────────────────
  const [workers, setWorkers] = useState<ChumLoWorker[]>(DEFAULT_CHUM_LO_WORKERS);

  // ── State: Form thêm công nhân ──────────────────────────────────────────
  const [showAddWorker, setShowAddWorker] = useState(false);
  const [newWorkerName, setNewWorkerName] = useState('');
  const [newWorkerAdvance, setNewWorkerAdvance] = useState('2000000');
  const [newWorkerAccount, setNewWorkerAccount] = useState('');
  const [newWorkerBank, setNewWorkerBank] = useState('');

  // ── State: Xuất Excel ───────────────────────────────────────────────────
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  // ─── Danh sách tất cả các tháng có mẻ sấy Cơ Sở I ───────────────────────
  const cs1MonthKeys = useMemo(() => {
    const cs1Batches = allBatches.filter((b) => isCoSo1(b.dryFacility) && b.dryDate);
    const dates = cs1Batches.map((b) => b.dryDate);
    return getSortedMonthKeysFromDates(dates);
  }, [allBatches]);

  // Cập nhật tháng mặc định khi parse xong
  const applyParsedBatches = useCallback((batches: RiceBatch[]) => {
    setAllBatches(batches);
    const cs1Batches = batches.filter((b) => isCoSo1(b.dryFacility) && b.dryDate);
    const dates = cs1Batches.map((b) => b.dryDate);
    const months = getSortedMonthKeysFromDates(dates);
    if (months.length > 0) {
      setSelectedMonthKey(months[0]);
    } else {
      setSelectedMonthKey('');
    }
  }, []);

  // Nạp dữ liệu mẫu từ server
  const loadSampleData = useCallback(async () => {
    setIsParsing(true);
    setParseError(null);
    try {
      const res = await fetch('/api/rice-payroll/parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ useSample: true }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Không thể nạp dữ liệu mẫu');
      }
      const data = await res.json();
      applyParsedBatches(data.batches || []);
    } catch (err) {
      setParseError((err as Error).message);
    } finally {
      setIsParsing(false);
    }
  }, [applyParsedBatches]);

  // Upload file Excel master từ máy người dùng
  const handleFileUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      setIsParsing(true);
      setParseError(null);
      const formData = new FormData();
      formData.append('file', file);

      try {
        const res = await fetch('/api/rice-payroll/parse', {
          method: 'POST',
          body: formData,
        });
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || 'Không thể đọc file Excel');
        }
        const data = await res.json();
        applyParsedBatches(data.batches || []);
      } catch (err) {
        setParseError((err as Error).message);
      } finally {
        setIsParsing(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    },
    [applyParsedBatches]
  );

  // ─── Danh sách các mẻ chụm lò Cơ Sở I thuộc tháng được chọn ────────────
  const currentChumLoBatches = useMemo<ChumLoBatch[]>(() => {
    if (!selectedMonthKey) return [];

    return allBatches
      .filter((b) => {
        if (!isCoSo1(b.dryFacility)) return false;
        if (!b.dryDate) return false;
        return getMonthKeyFromDate(b.dryDate) === selectedMonthKey;
      })
      .map((b, idx) => {
        const batchId = b.id || `chum-lo-${idx}`;
        const autoTons = roundRiceTons(b.dryWeightKg);
        const tons = customTonsMap[batchId] !== undefined ? customTonsMap[batchId] : autoTons;
        const thanhTien = tons * unitPrice;
        return {
          id: batchId,
          contractNo: String(idx + 1).padStart(2, '0'),
          weighDate: b.weighDate,
          doiNhap: b.purchaser || 'NGHỊ / NGUYÊN',
          customerName: b.customerName,
          vehicleName: b.vehicleName,
          riceType: b.riceType,
          freshWeightKg: b.freshWeightKg,
          freshBoVehicle: b.freshBoVehicle,
          dryDate: b.dryDate,
          dryFacility: b.dryFacility || 'CƠ SỞ I',
          dryWeightKg: b.dryWeightKg,
          roundedTons: tons,
          unitPrice,
          thanhTien,
        };
      });
  }, [allBatches, selectedMonthKey, unitPrice, customTonsMap]);

  // Đếm số mẻ đã được điều chỉnh Tấn thủ công trong tháng hiện tại
  const customizedTonsCount = useMemo(() => {
    return currentChumLoBatches.filter((b) => {
      const originalBatch = allBatches.find((item) => item.id === b.id);
      if (!originalBatch) return false;
      const autoTons = roundRiceTons(originalBatch.dryWeightKg);
      return b.roundedTons !== autoTons;
    }).length;
  }, [currentChumLoBatches, allBatches]);

  // Cập nhật số tấn cho từng mẻ
  const handleUpdateTons = (batchId: string, val: string) => {
    const cleanStr = val.replace(/[^\d]/g, '');
    const num = cleanStr === '' ? 0 : parseInt(cleanStr, 10);
    setCustomTonsMap((prev) => ({
      ...prev,
      [batchId]: num,
    }));
  };

  // Khôi phục 1 mẻ về số tấn tự động
  const handleResetSingleTons = (batchId: string) => {
    setCustomTonsMap((prev) => {
      const next = { ...prev };
      delete next[batchId];
      return next;
    });
  };

  // Khôi phục toàn bộ mẻ trong tháng về số tấn tự động
  const handleResetAllTons = () => {
    if (window.confirm('Khôi phục tất cả số tấn về giá trị làm tròn tự động ban đầu?')) {
      setCustomTonsMap((prev) => {
        const next = { ...prev };
        for (const b of currentChumLoBatches) {
          delete next[b.id];
        }
        return next;
      });
    }
  };

  // ─── Tổng hợp số liệu KPI ────────────────────────────────────────────────
  const totalDryKg = useMemo(
    () => currentChumLoBatches.reduce((sum, b) => sum + b.dryWeightKg, 0),
    [currentChumLoBatches]
  );
  const totalTons = useMemo(
    () => currentChumLoBatches.reduce((sum, b) => sum + b.roundedTons, 0),
    [currentChumLoBatches]
  );
  const totalThanhTien = useMemo(
    () => currentChumLoBatches.reduce((sum, b) => sum + b.thanhTien, 0),
    [currentChumLoBatches]
  );
  const totalAdvance = useMemo(
    () => workers.reduce((sum, w) => sum + w.advanceSalary, 0),
    [workers]
  );
  const netRemaining = totalThanhTien - totalAdvance;

  // ─── Quản lý công nhân ─────────────────────────────────────────────────
  const handleUpdateAdvance = (id: string, val: string) => {
    const num = Number(val.replace(/\D/g, '')) || 0;
    setWorkers((prev) =>
      prev.map((w) => (w.id === id ? { ...w, advanceSalary: num } : w))
    );
  };

  const handleRemoveWorker = (id: string) => {
    setWorkers((prev) => prev.filter((w) => w.id !== id));
  };

  const handleAddWorker = () => {
    if (!newWorkerName.trim()) return;
    const newW: ChumLoWorker = {
      id: `worker-${Date.now()}`,
      name: newWorkerName.trim().toUpperCase(),
      advanceSalary: Number(newWorkerAdvance.replace(/\D/g, '')) || 0,
      accountNumber: newWorkerAccount.trim(),
      bankName: newWorkerBank.trim().toUpperCase(),
      accountHolder: newWorkerName.trim().toUpperCase(),
    };
    setWorkers((prev) => [...prev, newW]);
    setNewWorkerName('');
    setNewWorkerAdvance('2000000');
    setNewWorkerAccount('');
    setNewWorkerBank('');
    setShowAddWorker(false);
  };

  // ─── Xuất file Excel ────────────────────────────────────────────────────
  const handleExportExcel = async () => {
    if (currentChumLoBatches.length === 0) {
      alert('Không có mẻ chụm lò nào trong tháng này để xuất file.');
      return;
    }

    const [mStr, yStr] = selectedMonthKey.split('/');
    const month = parseInt(mStr, 10);
    const year = parseInt(yStr, 10);

    setIsExporting(true);
    setExportError(null);

    try {
      const payload = {
        month,
        year,
        batches: currentChumLoBatches,
        workers,
        unitPrice,
        preparerName: 'Võ Hoàng Cẩm Tiên',
        approverName: 'Huỳnh Hải Long Hồ',
      };

      const res = await fetch('/api/rice-payroll/chum-lo-export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Xuất file Excel thất bại');
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `TONG_HOP_DOI_CHUM_LO_T${String(month).padStart(2, '0')}_${year}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setExportError((err as Error).message);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* ─── Header bar & Upload ─────────────────────────────────────────── */}
      <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="flex items-center gap-2.5">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-50 text-xl text-rose-600 ring-1 ring-rose-200">
                🏭
              </span>
              <div>
                <h1 className="text-xl font-bold tracking-tight text-slate-900">
                  Tính Lương Chụm Lò Cơ Sở 1 (Đội Nguyên)
                </h1>
                <p className="text-xs text-slate-500">
                  Lọc địa điểm nhập sấy <strong className="text-rose-700">CƠ SỞ I</strong> • Nhóm tính lương theo <strong className="text-slate-700">NGÀY NHẬP SẤY</strong>
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileUpload}
              accept=".xlsx,.xls"
              className="hidden"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isParsing}
              className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-xs font-semibold text-white shadow-sm hover:bg-slate-800 disabled:opacity-50 transition-all"
            >
              <span>📁</span>
              <span>{isParsing ? 'Đang đọc file...' : 'Tải File Lúa Master'}</span>
            </button>

            <button
              onClick={loadSampleData}
              disabled={isParsing}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition-all"
            >
              <span>⚡</span>
              <span>Nạp Dữ Liệu Mẫu</span>
            </button>
          </div>
        </div>

        {parseError && (
          <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">
            <strong>Lỗi nạp dữ liệu:</strong> {parseError}
          </div>
        )}
      </div>

      {/* ─── Control Bar: Chọn tháng & Đơn giá ───────────────────────────── */}
      {allBatches.length > 0 && (
        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            {/* Chọn tháng */}
            <div className="flex flex-wrap items-center gap-3">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Tháng nhập sấy:
              </label>
              {cs1MonthKeys.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {cs1MonthKeys.map((mk) => (
                    <button
                      key={mk}
                      onClick={() => setSelectedMonthKey(mk)}
                      className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                        selectedMonthKey === mk
                          ? 'bg-rose-600 text-white shadow-xs'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900'
                      }`}
                    >
                      Tháng {mk}
                    </button>
                  ))}
                </div>
              ) : (
                <span className="text-xs text-amber-600">
                  Không tìm thấy mẻ sấy Cơ Sở I nào trong file!
                </span>
              )}
            </div>

            {/* Đơn giá chụm lò */}
            <div className="flex items-center gap-3 self-end sm:self-auto">
              <label className="text-xs font-bold text-slate-600 whitespace-nowrap">
                Đơn giá chụm lò:
              </label>
              <div className="relative">
                <input
                  type="number"
                  value={unitPrice}
                  onChange={(e) => setUnitPrice(Math.max(0, Number(e.target.value)))}
                  step={500}
                  className="w-28 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-right text-xs font-bold text-rose-700 focus:bg-white focus:outline-none focus:ring-2 focus:ring-rose-500"
                />
                <span className="ml-1 text-[11px] text-slate-500">đ/tấn</span>
              </div>

              {/* Nút Xuất Excel */}
              <button
                onClick={handleExportExcel}
                disabled={isExporting || currentChumLoBatches.length === 0}
                className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50 transition-all"
              >
                <span>📊</span>
                <span>{isExporting ? 'Đang xuất...' : 'Xuất Excel'}</span>
              </button>
            </div>
          </div>

          {exportError && (
            <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50 p-2 text-xs text-rose-700">
              {exportError}
            </div>
          )}
        </div>
      )}

      {/* ─── KPI Cards ──────────────────────────────────────────────────── */}
      {selectedMonthKey && (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
              Số mẻ nhập sấy CS1
            </span>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-bold tracking-tight text-slate-900">
                {currentChumLoBatches.length}
              </span>
              <span className="text-xs text-slate-500">mẻ sấy</span>
            </div>
            <div className="mt-1 text-[11px] text-slate-400">
              Tổng: {formatMoney(totalDryKg)} kg
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
              Sản lượng quy đổi
            </span>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-bold tracking-tight text-rose-700">
                {totalTons}
              </span>
              <span className="text-xs font-semibold text-rose-600">tấn</span>
            </div>
            <div className="mt-1 text-[11px] text-slate-400">
              Làm tròn theo quy tắc chuẩn
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
              Tổng tiền chụm lò
            </span>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-bold tracking-tight text-emerald-700">
                {formatMoney(totalThanhTien)}
              </span>
              <span className="text-xs font-bold text-emerald-600">đ</span>
            </div>
            <div className="mt-1 text-[11px] text-slate-400">
              Đơn giá: {formatMoney(unitPrice)} đ/tấn
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
              Thực nhận còn lại
            </span>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-bold tracking-tight text-blue-700">
                {formatMoney(netRemaining)}
              </span>
              <span className="text-xs font-bold text-blue-600">đ</span>
            </div>
            <div className="mt-1 text-[11px] text-slate-400">
              Đã trừ tạm ứng: {formatMoney(totalAdvance)} đ
            </div>
          </div>
        </div>
      )}

      {/* ─── Bảng 1: Chi tiết các mẻ sấy Cơ Sở 1 ───────────────────────── */}
      {selectedMonthKey && (
        <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm">
          <div className="border-b border-slate-200 bg-slate-50/70 px-5 py-3.5 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-800 flex items-center gap-2">
                <span>🌾</span>
                <span>
                  Danh sách mẻ nhập sấy Cơ Sở I — Tháng {selectedMonthKey} ({currentChumLoBatches.length} mẻ)
                </span>
              </h2>
              {customizedTonsCount > 0 && (
                <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-[10px] font-bold text-amber-800 ring-1 ring-inset ring-amber-400">
                  ✏️ Đã sửa {customizedTonsCount} mẻ
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              {customizedTonsCount > 0 && (
                <button
                  onClick={handleResetAllTons}
                  className="rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800 hover:bg-amber-100 transition-all flex items-center gap-1 shadow-2xs"
                  title="Khôi phục toàn bộ số tấn về giá trị làm tròn tự động"
                >
                  <span>↺</span>
                  <span>Khôi phục Tấn tự động</span>
                </button>
              )}
              <span className="rounded-md bg-rose-50 px-2 py-0.5 text-[11px] font-semibold text-rose-700 ring-1 ring-inset ring-rose-200">
                Sheet: Chụm Lò
              </span>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-100/70 text-slate-700 font-bold">
                  <th className="px-3 py-2.5 text-center w-12">STT</th>
                  <th className="px-3 py-2.5 text-center">Ngày cân</th>
                  <th className="px-3 py-2.5 text-center">Đội nhập</th>
                  <th className="px-3 py-2.5">Khách hàng</th>
                  <th className="px-3 py-2.5">Loại lúa</th>
                  <th className="px-3 py-2.5">Phương tiện</th>
                  <th className="px-3 py-2.5 text-center">Ngày nhập sấy</th>
                  <th className="px-3 py-2.5 text-center">Cơ sở</th>
                  <th className="px-3 py-2.5 text-right">Cân sấy (kg)</th>
                  <th className="px-3 py-2 text-center font-bold text-rose-700 bg-rose-50/70 min-w-[85px]">
                    <div className="flex flex-col items-center">
                      <span>Tấn</span>
                      <span className="text-[9px] font-normal text-rose-600">✏️ Sửa được</span>
                    </div>
                  </th>
                  <th className="px-3 py-2.5 text-right">Đơn giá</th>
                  <th className="px-3 py-2.5 text-right font-bold text-emerald-700 bg-emerald-50/40">Thành tiền</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {currentChumLoBatches.length > 0 ? (
                  currentChumLoBatches.map((b, idx) => (
                    <tr key={b.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="px-3 py-2 text-center text-slate-500 font-mono">
                        {String(idx + 1).padStart(2, '0')}
                      </td>
                      <td className="px-3 py-2 text-center text-slate-600">{b.weighDate || '-'}</td>
                      <td className="px-3 py-2 text-center font-medium text-slate-700">{b.doiNhap || '-'}</td>
                      <td className="px-3 py-2 font-medium text-slate-900">{b.customerName || '-'}</td>
                      <td className="px-3 py-2 font-semibold text-slate-700">{b.riceType || '-'}</td>
                      <td className="px-3 py-2 text-slate-600">{b.vehicleName || b.freshBoVehicle || '-'}</td>
                      <td className="px-3 py-2 text-center font-medium text-rose-700">{b.dryDate}</td>
                      <td className="px-3 py-2 text-center text-slate-500">{b.dryFacility}</td>
                      <td className="px-3 py-2 text-right font-mono text-slate-700">
                        {formatMoney(b.dryWeightKg)}
                      </td>
                      <td className="px-2 py-1 text-center bg-rose-50/20">
                        {(() => {
                          const originalBatch = allBatches.find((item) => item.id === b.id);
                          const autoTons = originalBatch ? roundRiceTons(originalBatch.dryWeightKg) : b.roundedTons;
                          const isCustomized = b.roundedTons !== autoTons;
                          return (
                            <div className="flex items-center justify-center gap-1">
                              <input
                                type="text"
                                inputMode="numeric"
                                value={b.roundedTons}
                                onChange={(e) => handleUpdateTons(b.id, e.target.value)}
                                className={`w-14 text-center font-bold font-mono rounded px-1 py-0.5 text-xs transition-all focus:outline-none focus:ring-2 focus:ring-rose-500 ${
                                  isCustomized
                                    ? 'bg-amber-100 text-amber-900 border border-amber-400 shadow-2xs font-black ring-1 ring-amber-400'
                                    : 'bg-white text-rose-700 border border-slate-200 hover:border-slate-300'
                                }`}
                                title={
                                  isCustomized
                                    ? `Đã điều chỉnh thủ công (tự động: ${autoTons} tấn)`
                                    : 'Nhấp để điều chỉnh số tấn theo ý muốn'
                                }
                              />
                              {isCustomized && (
                                <button
                                  type="button"
                                  onClick={() => handleResetSingleTons(b.id)}
                                  className="text-[11px] text-slate-400 hover:text-rose-600 transition-colors p-0.5"
                                  title={`Khôi phục về ${autoTons} tấn tự động`}
                                >
                                  ↺
                                </button>
                              )}
                            </div>
                          );
                        })()}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-slate-600">
                        {formatMoney(b.unitPrice)}
                      </td>
                      <td className="px-3 py-2 text-right font-bold font-mono text-emerald-700 bg-emerald-50/20">
                        {formatMoney(b.thanhTien)}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={12} className="px-4 py-8 text-center text-slate-400">
                      Chưa có mẻ nhập sấy Cơ Sở I nào trong tháng {selectedMonthKey}
                    </td>
                  </tr>
                )}
              </tbody>
              {currentChumLoBatches.length > 0 && (
                <tfoot>
                  <tr className="border-t-2 border-slate-300 bg-amber-50/60 font-bold text-slate-900">
                    <td colSpan={8} className="px-3 py-2.5 text-center uppercase tracking-wide">
                      Tổng cộng
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono text-slate-900">
                      {formatMoney(totalDryKg)}
                    </td>
                    <td className="px-3 py-2.5 text-center font-mono text-rose-700 text-sm">
                      {totalTons}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono text-slate-600">
                      {formatMoney(unitPrice)}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono text-emerald-800 text-sm">
                      {formatMoney(totalThanhTien)} đ
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      )}

      {/* ─── Bảng 2 & 3: Đội công nhân & Quyết toán chi lương ─────────── */}
      {selectedMonthKey && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Cột trái 2/3: Danh sách công nhân & tạm ứng */}
          <div className="lg:col-span-2 overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm">
            <div className="border-b border-slate-200 bg-slate-50/70 px-5 py-3.5 flex items-center justify-between">
              <div>
                <h2 className="text-xs font-bold uppercase tracking-wider text-slate-800 flex items-center gap-2">
                  <span>👥</span>
                  <span>Đội Công Nhân Chụm Lò — Cơ Sở 1</span>
                </h2>
                <p className="text-[11px] text-slate-500">
                  Sheet: ỨL ĐỘI NGUYÊN T0{selectedMonthKey.replace('/', '.')}
                </p>
              </div>

              <button
                onClick={() => setShowAddWorker(!showAddWorker)}
                className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-all"
              >
                {showAddWorker ? 'Đóng' : '+ Thêm công nhân'}
              </button>
            </div>

            {/* Form thêm công nhân */}
            {showAddWorker && (
              <div className="border-b border-slate-200 bg-slate-50 p-4">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
                  <input
                    type="text"
                    placeholder="Họ &amp; Tên công nhân"
                    value={newWorkerName}
                    onChange={(e) => setNewWorkerName(e.target.value)}
                    className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-rose-500"
                  />
                  <input
                    type="text"
                    placeholder="Số tiền tạm ứng"
                    value={newWorkerAdvance}
                    onChange={(e) => setNewWorkerAdvance(e.target.value)}
                    className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-rose-500"
                  />
                  <input
                    type="text"
                    placeholder="Số tài khoản"
                    value={newWorkerAccount}
                    onChange={(e) => setNewWorkerAccount(e.target.value)}
                    className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-rose-500"
                  />
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Ngân hàng"
                      value={newWorkerBank}
                      onChange={(e) => setNewWorkerBank(e.target.value)}
                      className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-rose-500"
                    />
                    <button
                      onClick={handleAddWorker}
                      className="rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-rose-700 transition-all shrink-0"
                    >
                      Lưu
                    </button>
                  </div>
                </div>
              </div>
            )}

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-100/70 text-slate-700 font-bold">
                    <th className="px-3 py-2.5 text-center w-10">STT</th>
                    <th className="px-3 py-2.5">Họ &amp; Tên</th>
                    <th className="px-3 py-2.5 text-right">Tạm ứng</th>
                    <th className="px-3 py-2.5">Số tài khoản</th>
                    <th className="px-3 py-2.5">Ngân hàng</th>
                    <th className="px-3 py-2.5 text-center w-12">Thao tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {workers.map((w, idx) => (
                    <tr key={w.id} className="hover:bg-slate-50/80">
                      <td className="px-3 py-2 text-center text-slate-500">{idx + 1}</td>
                      <td className="px-3 py-2 font-bold text-slate-900">{w.name}</td>
                      <td className="px-3 py-2 text-right">
                        <input
                          type="text"
                          value={formatMoney(w.advanceSalary)}
                          onChange={(e) => handleUpdateAdvance(w.id, e.target.value)}
                          className="w-24 rounded border border-slate-200 px-1.5 py-0.5 text-right font-mono font-bold text-rose-700 focus:outline-none focus:ring-1 focus:ring-rose-500"
                        />
                      </td>
                      <td className="px-3 py-2 font-mono text-slate-600">{w.accountNumber || '-'}</td>
                      <td className="px-3 py-2 text-slate-600">{w.bankName || '-'}</td>
                      <td className="px-3 py-2 text-center">
                        <button
                          onClick={() => handleRemoveWorker(w.id)}
                          className="text-slate-400 hover:text-rose-600 transition-colors"
                          title="Xóa công nhân"
                        >
                          ✕
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-slate-200 bg-slate-50 font-bold">
                    <td colSpan={2} className="px-3 py-2.5 text-center uppercase tracking-wide">
                      Tổng tạm ứng
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono text-rose-700 text-sm">
                      {formatMoney(totalAdvance)} đ
                    </td>
                    <td colSpan={3} className="px-3 py-2.5 text-slate-400 text-[11px]">
                      {workers.length} nhân công
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* Cột phải 1/3: Bảng kê quyết toán lương */}
          <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm space-y-4">
            <div className="border-b border-slate-100 pb-3">
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                Bảng Kê Quyết Toán Lương Chụm Lò
              </h2>
              <p className="text-[11px] text-slate-500">Tháng {selectedMonthKey}</p>
            </div>

            <div className="space-y-3 text-xs">
              <div className="flex items-center justify-between py-1 border-b border-slate-100">
                <span className="text-slate-600">Tổng sản lượng sấy:</span>
                <span className="font-bold text-slate-900">{totalTons} tấn</span>
              </div>

              <div className="flex items-center justify-between py-1 border-b border-slate-100">
                <span className="text-slate-600">Đơn giá chụm lò:</span>
                <span className="font-bold text-slate-900">{formatMoney(unitPrice)} đ/tấn</span>
              </div>

              <div className="flex items-center justify-between py-1.5 border-b border-slate-200 bg-emerald-50/50 px-2 rounded-lg">
                <span className="font-bold text-emerald-900">Tổng thành tiền:</span>
                <span className="font-bold text-emerald-700 font-mono text-sm">
                  {formatMoney(totalThanhTien)} đ
                </span>
              </div>

              <div className="flex items-center justify-between py-1 border-b border-slate-100 px-2">
                <span className="text-rose-700 font-medium">Trừ tạm ứng:</span>
                <span className="font-bold text-rose-600 font-mono">
                  - {formatMoney(totalAdvance)} đ
                </span>
              </div>

              <div className="flex items-center justify-between py-2 border-t-2 border-slate-900 bg-amber-50 px-3 rounded-xl mt-4">
                <span className="font-bold text-slate-900 uppercase tracking-wide">
                  Còn lại thực chi:
                </span>
                <span className="font-black text-rose-700 font-mono text-base">
                  {formatMoney(netRemaining)} đ
                </span>
              </div>
            </div>

            <div className="pt-2">
              <button
                onClick={handleExportExcel}
                disabled={isExporting || currentChumLoBatches.length === 0}
                className="w-full rounded-xl bg-emerald-600 py-3 text-xs font-bold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50 transition-all flex items-center justify-center gap-2"
              >
                <span>📥</span>
                <span>{isExporting ? 'Đang tạo Excel...' : 'Tải File Excel Quyết Toán'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── State trống chưa có dữ liệu ─────────────────────────────────── */}
      {allBatches.length === 0 && !isParsing && (
        <div className="rounded-2xl border-2 border-dashed border-slate-200 bg-white p-12 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-rose-50 text-2xl text-rose-600">
            🏭
          </div>
          <h3 className="mt-4 text-sm font-bold text-slate-900">
            Chưa có dữ liệu nhập sấy lúa
          </h3>
          <p className="mt-1 text-xs text-slate-500 max-w-md mx-auto">
            Vui lòng nhấn nút <strong className="text-slate-700">Tải File Lúa Master</strong> để tải file Excel lúa, hoặc nhấn <strong className="text-slate-700">Nạp Dữ Liệu Mẫu</strong> để xem trước số liệu Chụm Lò Cơ Sở 1.
          </p>
          <div className="mt-5 flex justify-center gap-3">
            <button
              onClick={() => fileInputRef.current?.click()}
              className="rounded-xl bg-slate-900 px-4 py-2.5 text-xs font-semibold text-white shadow-sm hover:bg-slate-800 transition-all"
            >
              Chọn File Excel Lúa
            </button>
            <button
              onClick={loadSampleData}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-all"
            >
              Nạp Dữ Liệu Mẫu
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

