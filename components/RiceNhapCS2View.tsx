'use client';

/**
 * RiceNhapCS2View — UI nhập sấy Đội Dương Cơ Sở II
 *
 * UI riêng biệt với RicePayrollView (xuất).
 * Luồng:
 *   1. Upload file Excel master → parse → hiển thị mẻ nhập theo tháng
 *   2. Panel giá loại lúa: thêm/sửa/xóa loại lúa + giá/tấn
 *   3. Auto-tính thành tiền nhập + chụm lò
 *   4. Xuất Excel bảng tổng hợp nhập sấy
 */

import React, { useCallback, useMemo, useRef, useState } from 'react';
import { RiceBatch } from '@/lib/rice-payroll/types';
import { isCoSo2 } from '@/lib/rice-payroll/facility-filter';
import { roundRiceTons } from '@/lib/rice-payroll/rounding';
import {
  DEFAULT_CHUM_LO_PRICE,
  DEFAULT_RICE_PRICES,
  getPriceForRiceType,
} from '@/lib/rice-payroll/rice-price-config';
import { RiceTypePrice, NhapBatch, NhapSummary, NhapTrauItem } from '@/lib/rice-payroll/nhap-types';
import { DEFAULT_OCTOBER_TRAU_ITEMS } from '@/lib/rice-payroll/nhap-trau-config';

// ─── Helpers ────────────────────────────────────────────────────────────────

function parseDate(s: string): Date {
  const [d, m, y] = s.split('/').map(Number);
  return new Date(y, m - 1, d);
}

function formatMoney(n: number): string {
  return n.toLocaleString('vi-VN');
}

function getMonthKey(dateStr: string): string {
  // "dd/MM/yyyy" -> "MM/yyyy"
  const parts = dateStr.split('/');
  if (parts.length < 3) return '';
  return `${parts[1]}/${parts[2]}`;
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function RiceNhapCS2View() {
  // ── State: file & parse ──────────────────────────────────────────────────
  const [allBatches, setAllBatches] = useState<RiceBatch[]>([]);
  const [isParsing, setIsParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── State: tháng chọn ───────────────────────────────────────────────────
  const [selectedMonthKey, setSelectedMonthKey] = useState<string>('');

  // ── State: giá loại lúa & trấu & phụ cấp ───────────────────────────────────
  const [ricePrices, setRicePrices] = useState<RiceTypePrice[]>(DEFAULT_RICE_PRICES);
  const [chumLoPrice, setChumLoPrice] = useState<number>(DEFAULT_CHUM_LO_PRICE);
  const [newRiceType, setNewRiceType] = useState('');
  const [newPrice, setNewPrice] = useState('');
  const [showPricePanel, setShowPricePanel] = useState(true);

  // Nhập Trấu & Quyết toán
  const [trauItems, setTrauItems] = useState<NhapTrauItem[]>(DEFAULT_OCTOBER_TRAU_ITEMS);
  const [managementSalary, setManagementSalary] = useState<number>(6_000_000);
  const [iceUnitPricePerDay, setIceUnitPricePerDay] = useState<number>(10_000);
  const [showTrauPanel, setShowTrauPanel] = useState(false);

  // Form thêm chuyến trấu mới
  const [newTrauDate, setNewTrauDate] = useState('');
  const [newTrauVehicle, setNewTrauVehicle] = useState('ÔNG 5');
  const [newTrauTons, setNewTrauTons] = useState('');
  const [newTrauPrice, setNewTrauPrice] = useState('27273');

  // ── State: xuất Excel ───────────────────────────────────────────────────
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  // ─── Parse file Excel ───────────────────────────────────────────────────
  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsParsing(true);
    setParseError(null);
    setAllBatches([]);
    setSelectedMonthKey('');

    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch('/api/rice-payroll/parse', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Lỗi không xác định' }));
        throw new Error(err.error ?? 'Lỗi parse file');
      }

      const data = await res.json() as { batches: RiceBatch[] };
      setAllBatches(data.batches ?? []);
    } catch (err) {
      setParseError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsParsing(false);
    }
  }, []);

  // ─── Lọc CS2 theo dryDate ───────────────────────────────────────────────
  const cs2Batches = useMemo(
    () => allBatches.filter((b) => isCoSo2(b.dryFacility) && b.dryDate),
    [allBatches],
  );

  // ─── Danh sách tháng có nhập CS2 ────────────────────────────────────────
  const availableMonths = useMemo(() => {
    const monthSet = new Set<string>();
    cs2Batches.forEach((b) => {
      const mk = getMonthKey(b.dryDate);
      if (mk) monthSet.add(mk);
    });
    // Sort: MM/yyyy ascending
    return Array.from(monthSet).sort((a, b) => {
      const [ma, ya] = a.split('/').map(Number);
      const [mb, yb] = b.split('/').map(Number);
      return ya !== yb ? ya - yb : ma - mb;
    });
  }, [cs2Batches]);

  // ─── Mẻ của tháng được chọn ─────────────────────────────────────────────
  const monthBatches = useMemo(
    () => cs2Batches.filter((b) => getMonthKey(b.dryDate) === selectedMonthKey),
    [cs2Batches, selectedMonthKey],
  );

  // ─── Tính NhapBatch (thành tiền) ────────────────────────────────────────
  const nhapBatches = useMemo((): NhapBatch[] => {
    return monthBatches
      .slice()
      .sort((a, b) => parseDate(a.dryDate).getTime() - parseDate(b.dryDate).getTime())
      .map((b, idx) => {
        const tons = roundRiceTons(b.dryWeightKg);
        const pricePerTon = getPriceForRiceType(b.riceType, ricePrices);
        const thanhTienNhap = tons * pricePerTon;
        const thanhTienChumLo = tons * chumLoPrice;
        const tongThanhTien = thanhTienNhap + thanhTienChumLo;
        return {
          id: b.id ?? `nhap-${idx}`,
          doiNhap: 'DƯƠNG',
          customerName: b.customerName,
          riceType: b.riceType,
          freshBoVehicle: b.freshBoVehicle ?? '',
          dryDate: b.dryDate,
          dryFacility: b.dryFacility,
          dryWeightKg: b.dryWeightKg,
          roundedTons: tons,
          pricePerTon,
          thanhTienNhap,
          chumLoUnitPrice: chumLoPrice,
          thanhTienChumLo,
          tongThanhTien,
        };
      });
  }, [monthBatches, ricePrices, chumLoPrice]);

  // ─── Tổng kết ───────────────────────────────────────────────────────────
  const summary = useMemo((): NhapSummary => {
    const totalThanhTienNhap = nhapBatches.reduce((s, b) => s + b.thanhTienNhap, 0);
    const totalThanhTienChumLo = nhapBatches.reduce((s, b) => s + b.thanhTienChumLo, 0);
    return {
      totalKg:            nhapBatches.reduce((s, b) => s + b.dryWeightKg, 0),
      totalTons:          nhapBatches.reduce((s, b) => s + b.roundedTons, 0),
      totalThanhTienNhap,
      totalThanhTienChumLo,
      grandTotal:         totalThanhTienNhap + totalThanhTienChumLo,
    };
  }, [nhapBatches]);

  // ─── Phát hiện loại lúa chưa có giá ────────────────────────────────────
  const unknownRiceTypes = useMemo(() => {
    const known = new Set(ricePrices.map((p) => p.riceType.trim().toUpperCase()));
    const unknown = new Set<string>();
    nhapBatches.forEach((b) => {
      if (b.riceType && !known.has(b.riceType.trim().toUpperCase())) {
        unknown.add(b.riceType);
      }
    });
    return Array.from(unknown);
  }, [nhapBatches, ricePrices]);

  // ─── Quản lý giá loại lúa ───────────────────────────────────────────────
  const handleAddRicePrice = () => {
    const type = newRiceType.trim();
    const price = parseInt(newPrice.replace(/\D/g, ''), 10);
    if (!type || isNaN(price) || price <= 0) return;

    setRicePrices((prev) => {
      const existing = prev.findIndex(
        (p) => p.riceType.trim().toUpperCase() === type.toUpperCase(),
      );
      if (existing >= 0) {
        const updated = [...prev];
        updated[existing] = { riceType: type, pricePerTon: price };
        return updated;
      }
      return [...prev, { riceType: type, pricePerTon: price }];
    });
    setNewRiceType('');
    setNewPrice('');
  };

  const handleUpdatePrice = (riceType: string, newPriceVal: number) => {
    setRicePrices((prev) =>
      prev.map((p) =>
        p.riceType.trim().toUpperCase() === riceType.trim().toUpperCase()
          ? { ...p, pricePerTon: newPriceVal }
          : p,
      ),
    );
  };

  const handleDeleteRiceType = (riceType: string) => {
    setRicePrices((prev) =>
      prev.filter((p) => p.riceType.trim().toUpperCase() !== riceType.trim().toUpperCase()),
    );
  };

  // ─── Quản lý chuyến nhập trấu ──────────────────────────────────────────
  const handleAddTrauItem = () => {
    const tons = parseFloat(newTrauTons);
    const price = parseInt(newTrauPrice.replace(/\D/g, ''), 10);
    if (!newTrauDate || isNaN(tons) || tons <= 0 || isNaN(price) || price <= 0) return;

    const newItem: NhapTrauItem = {
      id: `trau-${Date.now()}`,
      date: newTrauDate,
      doiNhap: 'DƯƠNG',
      phuongTien: newTrauVehicle.trim() || 'ÔNG 5',
      soLuong: tons,
      donGia: price,
      thanhTien: Math.round(tons * price),
    };

    setTrauItems((prev) => [...prev, newItem]);
    setNewTrauDate('');
    setNewTrauTons('');
  };

  const handleDeleteTrauItem = (id: string) => {
    setTrauItems((prev) => prev.filter((t) => t.id !== id));
  };

  // ─── Xuất Excel ─────────────────────────────────────────────────────────
  const handleExportExcel = async () => {
    if (!selectedMonthKey || nhapBatches.length === 0) return;
    setIsExporting(true);
    setExportError(null);

    try {
      const [mm, yyyy] = selectedMonthKey.split('/').map(Number);
      const payload = {
        month: mm,
        year: yyyy,
        batches: nhapBatches,
        chumLoUnitPrice: chumLoPrice,
        trauItems,
        managementSalary,
        iceUnitPricePerDay,
      };

      const res = await fetch('/api/rice-payroll/nhap-export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Lỗi không xác định' }));
        throw new Error(err.error ?? 'Xuất thất bại');
      }

      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = url;
      a.download = `TONG_HOP_DOI_DUONG_CS2_NHAP_T${String(mm).padStart(2,'0')}_${yyyy}_HOAN_CHINH.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setExportError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsExporting(false);
    }
  };

  // ─── Render ──────────────────────────────────────────────────────────────
  const [selectedMonth, selectedYear] = selectedMonthKey
    ? selectedMonthKey.split('/').map(Number)
    : [0, 0];

  return (
    <div className="space-y-6">

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="rounded-2xl bg-gradient-to-r from-amber-600 to-orange-500 px-6 py-5 shadow-lg shadow-amber-200/50">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <span className="text-2xl">🌾</span>
              <h1 className="text-xl font-extrabold text-white tracking-tight">
                Nhập Sấy — Đội Dương Cơ Sở II
              </h1>
              <span className="rounded-full bg-white/20 text-white text-xs font-bold px-2.5 py-0.5 ring-1 ring-white/30">
                CS2
              </span>
            </div>
            <p className="text-amber-100 text-sm">
              Tổng hợp lúa nhập sấy theo ngày nhập · Tính thành tiền theo loại lúa + chụm lò
            </p>
          </div>

          {/* Summary pills */}
          {selectedMonthKey && nhapBatches.length > 0 && (
            <div className="flex flex-wrap gap-2">
              <div className="rounded-xl bg-white/15 px-3 py-2 text-center backdrop-blur-sm ring-1 ring-white/20">
                <div className="text-xs text-amber-100 font-medium">Số mẻ</div>
                <div className="text-lg font-black text-white">{nhapBatches.length}</div>
              </div>
              <div className="rounded-xl bg-white/15 px-3 py-2 text-center backdrop-blur-sm ring-1 ring-white/20">
                <div className="text-xs text-amber-100 font-medium">Tổng tấn</div>
                <div className="text-lg font-black text-white">{summary.totalTons.toLocaleString('vi-VN')}</div>
              </div>
              <div className="rounded-xl bg-white/15 px-3 py-2 text-center backdrop-blur-sm ring-1 ring-white/20">
                <div className="text-xs text-amber-100 font-medium">Nhập sấy</div>
                <div className="text-lg font-black text-white">{formatMoney(summary.totalThanhTienNhap)}đ</div>
              </div>
              <div className="rounded-xl bg-white/15 px-3 py-2 text-center backdrop-blur-sm ring-1 ring-white/20">
                <div className="text-xs text-amber-100 font-medium">Chụm lò</div>
                <div className="text-lg font-black text-white">{formatMoney(summary.totalThanhTienChumLo)}đ</div>
              </div>
              <div className="rounded-xl bg-white/25 px-3.5 py-2 text-center backdrop-blur-sm ring-2 ring-white/40">
                <div className="text-xs text-yellow-100 font-bold uppercase tracking-wider">Tổng cộng</div>
                <div className="text-lg font-black text-yellow-200">{formatMoney(summary.grandTotal)}đ</div>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-6 items-start">

        {/* ── Main column ─────────────────────────────────────────────────── */}
        <div className="space-y-5">

          {/* Upload file */}
          <div className="rounded-2xl border border-amber-200/70 bg-white shadow-sm p-5">
            <h2 className="text-sm font-bold text-slate-700 mb-3 flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-amber-100 text-amber-700 text-xs font-black">1</span>
              Upload File Excel Master
            </h2>

            <div
              className="relative cursor-pointer rounded-xl border-2 border-dashed border-amber-300/70 bg-amber-50/50 px-6 py-8 text-center hover:border-amber-400 hover:bg-amber-50 transition-all"
              onClick={() => fileInputRef.current?.click()}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls"
                className="hidden"
                onChange={handleFileChange}
              />
              <span className="text-3xl mb-2 block">📂</span>
              <p className="text-sm font-semibold text-slate-700">
                {isParsing ? 'Đang đọc file...' : 'Chọn hoặc kéo thả file Excel'}
              </p>
              <p className="text-xs text-slate-500 mt-1">
                File tổng hợp lúa master (.xlsx) · Lọc tự động Cơ Sở II theo cột Địa điểm sấy
              </p>
              {allBatches.length > 0 && (
                <p className="mt-2 text-xs font-semibold text-amber-700">
                  ✅ Đã đọc {allBatches.length} mẻ · {cs2Batches.length} mẻ CS2
                </p>
              )}
            </div>

            {parseError && (
              <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                ⚠️ {parseError}
              </div>
            )}
          </div>

          {/* Chọn tháng */}
          {availableMonths.length > 0 && (
            <div className="rounded-2xl border border-amber-200/70 bg-white shadow-sm p-5">
              <h2 className="text-sm font-bold text-slate-700 mb-3 flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-amber-100 text-amber-700 text-xs font-black">2</span>
                Chọn Tháng Nhập Sấy
              </h2>
              <div className="flex flex-wrap gap-2">
                {availableMonths.map((mk) => {
                  const [mo, yr] = mk.split('/');
                  const count = cs2Batches.filter((b) => getMonthKey(b.dryDate) === mk).length;
                  return (
                    <button
                      key={mk}
                      onClick={() => setSelectedMonthKey(mk)}
                      className={`rounded-xl border px-4 py-2.5 text-sm font-semibold transition-all ${
                        selectedMonthKey === mk
                          ? 'border-amber-500 bg-amber-500 text-white shadow-md shadow-amber-200'
                          : 'border-amber-200 bg-white text-slate-700 hover:border-amber-400 hover:bg-amber-50'
                      }`}
                    >
                      Tháng {mo}/{yr}
                      <span className={`ml-2 text-xs rounded-full px-1.5 py-0.5 ${
                        selectedMonthKey === mk ? 'bg-white/20 text-white' : 'bg-amber-100 text-amber-700'
                      }`}>
                        {count} mẻ
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Warning: loại lúa chưa có giá */}
          {unknownRiceTypes.length > 0 && (
            <div className="rounded-xl border border-orange-300 bg-orange-50 px-4 py-3 flex items-start gap-3">
              <span className="text-orange-500 text-lg mt-0.5">⚠️</span>
              <div>
                <p className="text-sm font-bold text-orange-800">Loại lúa chưa có giá:</p>
                <p className="text-sm text-orange-700 mt-0.5">
                  {unknownRiceTypes.join(', ')} — Thêm giá trong panel bên phải để tính chính xác.
                </p>
              </div>
            </div>
          )}

          {/* Bảng dữ liệu nhập sấy */}
          {nhapBatches.length > 0 && (
            <div className="rounded-2xl border border-amber-200/70 bg-white shadow-sm overflow-hidden">
              <div className="flex items-center justify-between px-5 py-4 border-b border-amber-100">
                <h2 className="text-sm font-bold text-slate-700 flex items-center gap-2">
                  <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-amber-100 text-amber-700 text-xs font-black">3</span>
                  Bảng Nhập Sấy Tháng {selectedMonth}/{selectedYear}
                  <span className="text-xs font-normal text-slate-500">· {nhapBatches.length} mẻ · Đội Dương CS2</span>
                </h2>
                <button
                  onClick={handleExportExcel}
                  disabled={isExporting}
                  className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-green-600 to-emerald-600 px-4 py-2 text-xs font-bold text-white shadow-sm hover:from-green-700 hover:to-emerald-700 disabled:opacity-50 transition-all cursor-pointer"
                >
                  {isExporting ? (
                    <>⏳ Đang xuất...</>
                  ) : (
                    <>📥 Xuất Excel 4 Sheet</>
                  )}
                </button>
              </div>

              {exportError && (
                <div className="mx-5 mt-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  ⚠️ {exportError}
                </div>
              )}

              <div className="overflow-x-auto">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="bg-gradient-to-r from-amber-600 to-orange-500 text-white">
                      <th className="px-2 py-2.5 text-center font-bold whitespace-nowrap">#</th>
                      <th className="px-2 py-2.5 text-center font-bold whitespace-nowrap">ĐỢI NHẬP</th>
                      <th className="px-3 py-2.5 text-left font-bold whitespace-nowrap">KHÁCH HÀNG</th>
                      <th className="px-2 py-2.5 text-center font-bold whitespace-nowrap">LOẠI LÚA</th>
                      <th className="px-2 py-2.5 text-center font-bold whitespace-nowrap">PHƯƠNG TIỆN</th>
                      <th className="px-2 py-2.5 text-center font-bold whitespace-nowrap">NGÀY NHẬP SẤY</th>
                      <th className="px-2 py-2.5 text-center font-bold whitespace-nowrap">ĐỊA ĐIỂM SẤY</th>
                      <th className="px-2 py-2.5 text-right font-bold whitespace-nowrap">CÂN (KG)</th>
                      <th className="px-2 py-2.5 text-right font-bold whitespace-nowrap bg-amber-500/30">CÂN (TẤN)</th>
                      <th className="px-2 py-2.5 text-right font-bold whitespace-nowrap">ĐƠN GIÁ NHẬP</th>
                      <th className="px-2 py-2.5 text-right font-bold whitespace-nowrap">THÀNH TIỀN NHẬP</th>
                      <th className="px-2 py-2.5 text-right font-bold whitespace-nowrap">ĐƠN GIÁ CHỤM LÒ</th>
                      <th className="px-2 py-2.5 text-right font-bold whitespace-nowrap">THÀNH TIỀN CHỤM LÒ</th>
                      <th className="px-3 py-2.5 text-right font-black whitespace-nowrap bg-orange-700/60 text-yellow-200">TỔNG CỘNG (VNĐ)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {nhapBatches.map((batch, idx) => (
                      <tr
                        key={batch.id}
                        className={`border-b border-amber-100/70 hover:bg-amber-50/40 transition-colors ${
                          idx % 2 === 0 ? 'bg-white' : 'bg-amber-50/20'
                        } ${batch.pricePerTon === 0 ? 'bg-red-50' : ''}`}
                      >
                        <td className="px-2 py-2 text-center text-slate-400 font-medium">{idx + 1}</td>
                        <td className="px-2 py-2 text-center font-semibold text-amber-700">{batch.doiNhap}</td>
                        <td className="px-3 py-2 text-left font-medium text-slate-800">{batch.customerName || '—'}</td>
                        <td className="px-2 py-2 text-center">
                          <span className={`inline-block rounded-md px-1.5 py-0.5 text-[11px] font-semibold ${
                            batch.pricePerTon === 0
                              ? 'bg-red-100 text-red-700 ring-1 ring-red-300'
                              : 'bg-blue-50 text-blue-700 ring-1 ring-blue-200'
                          }`}>
                            {batch.riceType || '—'}
                          </span>
                        </td>
                        <td className="px-2 py-2 text-center text-slate-600">{batch.freshBoVehicle || '—'}</td>
                        <td className="px-2 py-2 text-center font-mono text-slate-700">{batch.dryDate}</td>
                        <td className="px-2 py-2 text-center text-slate-600">{batch.dryFacility}</td>
                        <td className="px-2 py-2 text-right font-mono text-slate-700">{batch.dryWeightKg.toLocaleString('vi-VN')}</td>
                        <td className="px-2 py-2 text-right font-black text-amber-700 bg-amber-50/50">{batch.roundedTons}</td>
                        <td className="px-2 py-2 text-right font-semibold text-slate-700">
                          {batch.pricePerTon > 0 ? `${formatMoney(batch.pricePerTon)}đ` : (
                            <span className="text-red-500 font-bold">! Chưa có giá</span>
                          )}
                        </td>
                        <td className="px-2 py-2 text-right font-semibold text-emerald-700">
                          {batch.thanhTienNhap > 0 ? `${formatMoney(batch.thanhTienNhap)}đ` : '—'}
                        </td>
                        <td className="px-2 py-2 text-right text-slate-600">{formatMoney(batch.chumLoUnitPrice)}đ</td>
                        <td className="px-2 py-2 text-right font-semibold text-orange-700">{formatMoney(batch.thanhTienChumLo)}đ</td>
                        <td className="px-3 py-2 text-right font-black text-red-700 bg-amber-100/40">
                          {formatMoney(batch.tongThanhTien ?? (batch.thanhTienNhap + batch.thanhTienChumLo))}đ
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-gradient-to-r from-amber-100 to-orange-100 border-t-2 border-amber-400 font-black text-sm">
                      <td colSpan={7} className="px-3 py-3 text-right text-amber-900">TỔNG CỘNG</td>
                      <td className="px-2 py-3 text-right text-amber-900 font-mono">{summary.totalKg.toLocaleString('vi-VN')}</td>
                      <td className="px-2 py-3 text-right text-amber-900 bg-amber-200/40">{summary.totalTons.toLocaleString('vi-VN')}</td>
                      <td className="px-2 py-3 text-right text-amber-900">—</td>
                      <td className="px-2 py-3 text-right text-emerald-800">{formatMoney(summary.totalThanhTienNhap)}đ</td>
                      <td className="px-2 py-3 text-right text-amber-900">—</td>
                      <td className="px-2 py-3 text-right text-orange-800">{formatMoney(summary.totalThanhTienChumLo)}đ</td>
                      <td className="px-3 py-3 text-right text-red-800 bg-amber-300/40 font-black">
                        {formatMoney(summary.grandTotal)}đ
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}

          {/* Empty state */}
          {!isParsing && allBatches.length === 0 && (
            <div className="rounded-2xl border-2 border-dashed border-amber-200/70 bg-amber-50/30 py-16 text-center">
              <span className="text-5xl mb-4 block">🌾</span>
              <p className="text-base font-bold text-slate-700">Chưa có dữ liệu nhập sấy</p>
              <p className="text-sm text-slate-500 mt-1">Upload file Excel master để bắt đầu</p>
            </div>
          )}
        </div>

        {/* ── Right panel: Giá loại lúa ───────────────────────────────────── */}
        <div className="space-y-4">

          {/* Giá chụm lò */}
          <div className="rounded-2xl border border-orange-200 bg-white shadow-sm p-5">
            <h3 className="text-sm font-bold text-slate-700 mb-3 flex items-center gap-2">
              🔥 Giá Chụm Lò (đ/tấn)
              <span className="text-xs font-normal text-slate-500">· Áp dụng mọi loại lúa</span>
            </h3>
            <div className="flex items-center gap-2">
              <input
                type="number"
                value={chumLoPrice}
                onChange={(e) => setChumLoPrice(parseInt(e.target.value) || 11_000)}
                step={500}
                min={0}
                className="flex-1 rounded-xl border border-orange-200 bg-orange-50/50 px-3 py-2 text-sm font-bold text-orange-800 focus:outline-none focus:ring-2 focus:ring-orange-300 text-right"
              />
              <span className="text-sm text-slate-500 font-medium">đ/tấn</span>
            </div>
          </div>

          {/* Giá loại lúa */}
          <div className="rounded-2xl border border-amber-200 bg-white shadow-sm overflow-hidden">
            <button
              onClick={() => setShowPricePanel((v) => !v)}
              className="w-full flex items-center justify-between px-5 py-4 bg-gradient-to-r from-amber-50 to-orange-50 border-b border-amber-100 hover:bg-amber-100/50 transition-colors"
            >
              <h3 className="text-sm font-bold text-slate-700 flex items-center gap-2">
                💰 Giá Theo Loại Lúa
                <span className="rounded-full bg-amber-200 text-amber-800 text-[11px] font-bold px-2 py-0.5">
                  {ricePrices.length} loại
                </span>
              </h3>
              <span className="text-slate-400 text-xs">{showPricePanel ? '▲' : '▼'}</span>
            </button>

            {showPricePanel && (
              <div className="p-4 space-y-3">
                {/* Danh sách giá */}
                <div className="space-y-1.5">
                  {ricePrices.map((item) => (
                    <div key={item.riceType} className="flex items-center gap-2 group">
                      <span className="flex-1 text-xs font-semibold text-slate-700 truncate">{item.riceType}</span>
                      <input
                        type="number"
                        value={item.pricePerTon}
                        step={500}
                        min={0}
                        onChange={(e) =>
                          handleUpdatePrice(item.riceType, parseInt(e.target.value) || 0)
                        }
                        className="w-24 rounded-lg border border-amber-200 bg-amber-50/50 px-2 py-1 text-xs font-bold text-amber-800 text-right focus:outline-none focus:ring-1 focus:ring-amber-400"
                      />
                      <span className="text-xs text-slate-400">đ</span>
                      <button
                        onClick={() => handleDeleteRiceType(item.riceType)}
                        className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-600 text-xs font-bold transition-opacity"
                        title="Xóa loại lúa này"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>

                {/* Thêm loại lúa mới */}
                <div className="pt-3 border-t border-amber-100">
                  <p className="text-[11px] font-bold text-slate-500 mb-2">Thêm loại lúa mới:</p>
                  <div className="flex flex-col gap-2">
                    <input
                      type="text"
                      value={newRiceType}
                      onChange={(e) => setNewRiceType(e.target.value)}
                      placeholder="Tên loại lúa (vd: OM380)"
                      className="rounded-lg border border-amber-200 bg-amber-50/40 px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-amber-400"
                      onKeyDown={(e) => e.key === 'Enter' && handleAddRicePrice()}
                    />
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        value={newPrice}
                        onChange={(e) => setNewPrice(e.target.value)}
                        placeholder="Giá (vd: 20000)"
                        step={500}
                        className="flex-1 rounded-lg border border-amber-200 bg-amber-50/40 px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-amber-400"
                        onKeyDown={(e) => e.key === 'Enter' && handleAddRicePrice()}
                      />
                      <button
                        onClick={handleAddRicePrice}
                        disabled={!newRiceType.trim() || !newPrice}
                        className="rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-bold text-white hover:bg-amber-600 disabled:opacity-40 transition-colors"
                      >
                        + Thêm
                      </button>
                    </div>
                  </div>
                </div>

                {/* Quick add từ loại chưa có giá */}
                {unknownRiceTypes.length > 0 && (
                  <div className="pt-2 border-t border-red-100">
                    <p className="text-[11px] font-bold text-red-500 mb-2">⚠️ Chưa có giá:</p>
                    {unknownRiceTypes.map((rt) => (
                      <button
                        key={rt}
                        onClick={() => setNewRiceType(rt)}
                        className="mb-1 flex items-center gap-1 text-[11px] text-red-600 hover:text-red-800 font-semibold"
                      >
                        → {rt}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Nhập Trấu & Quyết toán phụ cấp */}
          <div className="rounded-2xl border border-yellow-200 bg-white shadow-sm overflow-hidden">
            <button
              onClick={() => setShowTrauPanel((v) => !v)}
              className="w-full flex items-center justify-between px-5 py-4 bg-gradient-to-r from-yellow-50 to-amber-50 border-b border-yellow-100 hover:bg-yellow-100/50 transition-colors"
            >
              <h3 className="text-sm font-bold text-slate-700 flex items-center gap-2">
                🌾 Nhập Trấu & Phụ Cấp
                <span className="rounded-full bg-yellow-200 text-yellow-800 text-[11px] font-bold px-2 py-0.5">
                  {trauItems.length} chuyến
                </span>
              </h3>
              <span className="text-slate-400 text-xs">{showTrauPanel ? '▲' : '▼'}</span>
            </button>

            {showTrauPanel && (
              <div className="p-4 space-y-3">
                {/* Danh sách chuyến trấu */}
                <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                  {trauItems.map((t) => (
                    <div key={t.id} className="flex items-center justify-between gap-1 text-xs p-1.5 rounded-lg bg-yellow-50/50 border border-yellow-100">
                      <div>
                        <div className="font-bold text-slate-800">{t.phuongTien}</div>
                        <div className="text-[10px] text-slate-500">{t.date} · {t.soLuong} tấn</div>
                      </div>
                      <div className="text-right">
                        <div className="font-bold text-amber-700">{formatMoney(t.thanhTien)}đ</div>
                        <button
                          onClick={() => handleDeleteTrauItem(t.id)}
                          className="text-[10px] text-red-500 hover:underline"
                        >
                          Xóa
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Thêm chuyến trấu */}
                <div className="pt-2 border-t border-yellow-100 space-y-2">
                  <p className="text-[11px] font-bold text-slate-500">Thêm chuyến trấu:</p>
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="text"
                      placeholder="Ngày (dd/mm/yyyy)"
                      value={newTrauDate}
                      onChange={(e) => setNewTrauDate(e.target.value)}
                      className="rounded-lg border border-yellow-200 bg-yellow-50/30 px-2 py-1 text-xs"
                    />
                    <input
                      type="text"
                      placeholder="Phương tiện (ÔNG 5)"
                      value={newTrauVehicle}
                      onChange={(e) => setNewTrauVehicle(e.target.value)}
                      className="rounded-lg border border-yellow-200 bg-yellow-50/30 px-2 py-1 text-xs"
                    />
                    <input
                      type="number"
                      placeholder="Số tấn (22)"
                      value={newTrauTons}
                      onChange={(e) => setNewTrauTons(e.target.value)}
                      className="rounded-lg border border-yellow-200 bg-yellow-50/30 px-2 py-1 text-xs"
                    />
                    <input
                      type="number"
                      placeholder="Đơn giá (27273)"
                      value={newTrauPrice}
                      onChange={(e) => setNewTrauPrice(e.target.value)}
                      className="rounded-lg border border-yellow-200 bg-yellow-50/30 px-2 py-1 text-xs"
                    />
                  </div>
                  <button
                    onClick={handleAddTrauItem}
                    disabled={!newTrauDate || !newTrauTons}
                    className="w-full rounded-lg bg-yellow-600 py-1.5 text-xs font-bold text-white hover:bg-yellow-700 disabled:opacity-40"
                  >
                    + Thêm Chuyến Trấu
                  </button>
                </div>

                {/* Phụ cấp quản lý & nước đá */}
                <div className="pt-2 border-t border-yellow-100 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs text-slate-600">Lương quản lý:</span>
                    <input
                      type="number"
                      value={managementSalary}
                      step={500000}
                      onChange={(e) => setManagementSalary(parseInt(e.target.value) || 0)}
                      className="w-28 rounded-lg border border-yellow-200 px-2 py-1 text-xs font-bold text-slate-800 text-right"
                    />
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs text-slate-600">Nước đá/ngày:</span>
                    <input
                      type="number"
                      value={iceUnitPricePerDay}
                      step={1000}
                      onChange={(e) => setIceUnitPricePerDay(parseInt(e.target.value) || 0)}
                      className="w-28 rounded-lg border border-yellow-200 px-2 py-1 text-xs font-bold text-slate-800 text-right"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Tổng kết */}
          {nhapBatches.length > 0 && (
            <div className="rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-green-50 p-5 shadow-sm">
              <h3 className="text-sm font-bold text-slate-700 mb-3">📊 Tổng Kết Tháng {selectedMonth}/{selectedYear}</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between items-center">
                  <span className="text-slate-600">Tổng KG</span>
                  <span className="font-bold text-slate-800">{summary.totalKg.toLocaleString('vi-VN')} kg</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-600">Tổng Tấn</span>
                  <span className="font-black text-amber-700 text-base">{summary.totalTons.toLocaleString('vi-VN')} t</span>
                </div>
                <div className="h-px bg-emerald-200 my-2" />
                <div className="flex justify-between items-center">
                  <span className="text-slate-600">Thành tiền nhập</span>
                  <span className="font-bold text-emerald-700">{formatMoney(summary.totalThanhTienNhap)}đ</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-600">Thành tiền chụm lò</span>
                  <span className="font-bold text-orange-700">{formatMoney(summary.totalThanhTienChumLo)}đ</span>
                </div>
                <div className="h-px bg-emerald-200 my-2" />
                <div className="flex justify-between items-center border-t border-emerald-300 pt-2">
                  <span className="font-bold text-slate-700">Tổng cộng</span>
                  <span className="font-black text-emerald-800 text-base">
                    {formatMoney(summary.totalThanhTienNhap + summary.totalThanhTienChumLo)}đ
                  </span>
                </div>
              </div>

              <button
                onClick={handleExportExcel}
                disabled={isExporting || nhapBatches.length === 0}
                className="mt-4 w-full flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-green-600 to-emerald-600 py-3 text-sm font-bold text-white shadow-sm hover:from-green-700 hover:to-emerald-700 disabled:opacity-50 transition-all cursor-pointer"
              >
                {isExporting ? '⏳ Đang xuất 4 Sheet...' : '📥 Xuất Excel 4 Sheet (Lúa, Trấu, ỨL, CL)'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

