'use client';

/**
 * RiceNhapCS1View — Giao diện Quản lý & Tính Lương Nhập Sấy Cơ Sở I (Đội Nghị & Đội Nguyên)
 *
 * Tính năng chính:
 * 1. Lọc mẻ sấy Cơ Sở I từ File Lúa Master theo NGÀY NHẬP SẤY.
 * 2. Phân chia 2 đội (Đội Nghị & Đội Nguyên) làm xen kẽ theo ngày hoặc liên tục:
 *    - Gom nhóm theo Ngày: Có nút gán nhanh 1-Click cả ngày cho Đội Nghị hoặc Đội Nguyên.
 *    - Toggle 1-Click từng mẻ trên cột Đội Nhập.
 *    - Cho phép sửa trực tiếp số Tấn từng dòng.
 * 3. 3 Chế độ xem: Toàn bộ CS1 / Đội Anh Nghị / Đội Anh Nguyên.
 * 4. Quản lý bảng giá lúa, bảng trấu, nước đá, và bảng công nhân riêng cho từng đội.
 * 5. Xuất Excel chuẩn 4 sheets theo đúng mẫu của công ty.
 */

import React, { useCallback, useMemo, useRef, useState } from 'react';
import { RiceBatch } from '@/lib/rice-payroll/types';
import { isCoSo1 } from '@/lib/rice-payroll/facility-filter';
import { roundRiceTons } from '@/lib/rice-payroll/rounding';
import { getMonthKeyFromDate, getSortedMonthKeysFromDates } from '@/lib/rice-payroll/month-utils';
import { RiceTypePrice, NhapTrauItem } from '@/lib/rice-payroll/nhap-types';
import { CS1Batch, CS1TeamKey, CS1ViewMode } from '@/lib/rice-payroll/cs1-types';
import {
  CS1Worker,
  DEFAULT_CS1_RICE_PRICES,
  DEFAULT_DOI_NGHI_WORKERS,
  DEFAULT_DOI_NGUYEN_WORKERS,
  DEFAULT_OCTOBER_TRAU_NGHI,
  DEFAULT_OCTOBER_TRAU_NGUYEN,
} from '@/lib/rice-payroll/team-cs1-workers';

function formatMoney(n: number): string {
  return Math.round(n).toLocaleString('vi-VN');
}

export default function RiceNhapCS1View() {
  // ── State: File & Batches ───────────────────────────────────────────────
  const [allBatches, setAllBatches] = useState<RiceBatch[]>([]);
  const [isParsing, setIsParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── State: Tháng chọn ───────────────────────────────────────────────────
  const [selectedMonthKey, setSelectedMonthKey] = useState<string>('');

  // ── State: Chế độ xem (ALL / NGHỊ / NGUYÊN) ──────────────────────────────
  const [viewMode, setViewMode] = useState<CS1ViewMode>('ALL');

  // ── State: Gán Đội cho từng mẻ (key = batchId, value = 'NGHỊ' | 'NGUYÊN')
  const [teamAssignmentMap, setTeamAssignmentMap] = useState<Record<string, CS1TeamKey>>({});

  // ── State: Tùy chỉnh số Tấn thủ công (key = batchId) ───────────────────
  const [customTonsMap, setCustomTonsMap] = useState<Record<string, number>>({});

  // ── State: Bảng giá loại lúa ────────────────────────────────────────────
  const [ricePrices, setRicePrices] = useState<RiceTypePrice[]>(DEFAULT_CS1_RICE_PRICES);
  const [showPricePanel, setShowPricePanel] = useState(false);
  const [newRiceType, setNewRiceType] = useState('');
  const [newRicePrice, setNewRicePrice] = useState('20000');

  // ── State: Công nhân Đội Nghị & Đội Nguyên ─────────────────────────────
  const [workersNghi, setWorkersNghi] = useState<CS1Worker[]>(DEFAULT_DOI_NGHI_WORKERS);
  const [workersNguyen, setWorkersNguyen] = useState<CS1Worker[]>(DEFAULT_DOI_NGUYEN_WORKERS);
  const [showWorkerAdd, setShowWorkerAdd] = useState(false);
  const [newWorkerName, setNewWorkerName] = useState('');
  const [newWorkerAdvance, setNewWorkerAdvance] = useState('0');
  const [newWorkerAccount, setNewWorkerAccount] = useState('');
  const [newWorkerBank, setNewWorkerBank] = useState('');

  // ── State: Bảng Trấu Đội Nghị & Đội Nguyên ─────────────────────────────
  const [trauNghi, setTrauNghi] = useState<NhapTrauItem[]>(DEFAULT_OCTOBER_TRAU_NGHI);
  const [trauNguyen, setTrauNguyen] = useState<NhapTrauItem[]>(DEFAULT_OCTOBER_TRAU_NGUYEN);
  const [showTrauPanel, setShowTrauPanel] = useState(false);
  const [newTrauDate, setNewTrauDate] = useState('');
  const [newTrauVehicle, setNewTrauVehicle] = useState('ÔNG 5');
  const [newTrauQty, setNewTrauQty] = useState('11');
  const [newTrauPrice, setNewTrauPrice] = useState('27273');

  // ── State: Nước đá thủ công (nếu muốn chỉnh) ────────────────────────────
  const [waterDaysCustom, setWaterDaysCustom] = useState<{ NGHI?: number; NGUYEN?: number }>({});

  // ── State: Xuất Excel ───────────────────────────────────────────────────
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  // ─── Lấy giá cho loại lúa ────────────────────────────────────────────────
  const getPriceForRice = useCallback(
    (riceType: string): number => {
      const rt = (riceType || '').toUpperCase().trim();
      if (!rt) return 20_000;
      const found = ricePrices.find((p) => p.riceType.toUpperCase().trim() === rt);
      if (found) return found.pricePerTon;
      if (rt.includes('ST25') || rt.includes('HP1')) return 23_000;
      return 20_000;
    },
    [ricePrices]
  );

  // ─── Danh sách các tháng có mẻ sấy Cơ Sở I ──────────────────────────────
  const cs1MonthKeys = useMemo(() => {
    const cs1Batches = allBatches.filter((b) => isCoSo1(b.dryFacility) && b.dryDate);
    const dates = cs1Batches.map((b) => b.dryDate);
    return getSortedMonthKeysFromDates(dates);
  }, [allBatches]);

  const applyParsedBatches = useCallback((batches: RiceBatch[]) => {
    setAllBatches(batches);
    const cs1Batches = batches.filter((b) => isCoSo1(b.dryFacility) && b.dryDate);
    const dates = cs1Batches.map((b) => b.dryDate);
    const months = getSortedMonthKeysFromDates(dates);
    if (months.length > 0) setSelectedMonthKey(months[0]);
  }, []);

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

  // ─── Danh sách mẻ sấy Cơ Sở I trong tháng được chọn ────────────────────
  const rawMonthBatches = useMemo<CS1Batch[]>(() => {
    if (!selectedMonthKey) return [];

    return allBatches
      .filter((b) => {
        if (!isCoSo1(b.dryFacility)) return false;
        if (!b.dryDate) return false;
        return getMonthKeyFromDate(b.dryDate) === selectedMonthKey;
      })
      .map((b, idx) => {
        const batchId = b.id || `cs1-${idx}`;
        const autoTons = roundRiceTons(b.dryWeightKg);
        const tons = customTonsMap[batchId] !== undefined ? customTonsMap[batchId] : autoTons;
        const price = getPriceForRice(b.riceType);
        const thanhTien = tons * price;

        // Xác định đội nhập mặc định: nếu đã gán -> lấy gán; nếu purchaser có chữ NGUYÊN -> NGUYÊN; còn lại NGHỊ
        let defaultTeam: CS1TeamKey = 'NGHỊ';
        if (teamAssignmentMap[batchId]) {
          defaultTeam = teamAssignmentMap[batchId];
        } else if ((b.purchaser || '').toUpperCase().includes('NGUYÊN')) {
          defaultTeam = 'NGUYÊN';
        }

        return {
          id: batchId,
          contractNo: String(idx + 1).padStart(2, '0'),
          weighDate: b.weighDate,
          doiNhap: defaultTeam,
          customerName: b.customerName,
          vehicleName: b.vehicleName,
          riceType: b.riceType,
          freshWeightKg: b.freshWeightKg,
          freshBoVehicle: b.freshBoVehicle,
          dryDate: b.dryDate,
          dryFacility: b.dryFacility || 'CƠ SỞ I',
          dryWeightKg: b.dryWeightKg,
          roundedTons: tons,
          pricePerTon: price,
          thanhTien,
        };
      });
  }, [allBatches, selectedMonthKey, customTonsMap, getPriceForRice, teamAssignmentMap]);

  // Lọc theo chế độ xem (ALL / NGHỊ / NGUYÊN)
  const currentBatches = useMemo(() => {
    if (viewMode === 'ALL') return rawMonthBatches;
    return rawMonthBatches.filter((b) => b.doiNhap === viewMode);
  }, [rawMonthBatches, viewMode]);

  // Gom nhóm mẻ theo Ngày Nhập Sấy (dryDate)
  const groupedByDate = useMemo(() => {
    const map = new Map<string, CS1Batch[]>();
    currentBatches.forEach((b) => {
      const d = b.dryDate || 'Chưa có ngày';
      const arr = map.get(d) || [];
      arr.push(b);
      map.set(d, arr);
    });
    return Array.from(map.entries()).sort((a, b) => {
      const [d1, m1, y1] = a[0].split('/').map(Number);
      const [d2, m2, y2] = b[0].split('/').map(Number);
      return new Date(y1, m1 - 1, d1).getTime() - new Date(y2, m2 - 1, d2).getTime();
    });
  }, [currentBatches]);

  // ─── Xử lý Gán Đội nhanh ───────────────────────────────────────────────
  // 1. Toggle 1 mẻ đơn lẻ
  const handleToggleBatchTeam = (batchId: string) => {
    setTeamAssignmentMap((prev) => {
      const current = prev[batchId] || (rawMonthBatches.find((b) => b.id === batchId)?.doiNhap || 'NGHỊ');
      const nextTeam: CS1TeamKey = current === 'NGHỊ' ? 'NGUYÊN' : 'NGHỊ';
      return { ...prev, [batchId]: nextTeam };
    });
  };

  // 2. Gán toàn bộ mẻ trong 1 ngày cho 1 đội
  const handleAssignDayTeam = (dateStr: string, team: CS1TeamKey) => {
    const dayBatches = rawMonthBatches.filter((b) => b.dryDate === dateStr);
    setTeamAssignmentMap((prev) => {
      const next = { ...prev };
      dayBatches.forEach((b) => {
        next[b.id] = team;
      });
      return next;
    });
  };

  // 3. Gán xen kẽ tự động (Ngày lẻ = Đội A, Ngày chẵn = Đội B)
  const handleAutoAlternateTeams = () => {
    if (!window.confirm('Tự động gán: Ngày lẻ ➔ Đội Nghị, Ngày chẵn ➔ Đội Nguyên?')) return;
    setTeamAssignmentMap((prev) => {
      const next = { ...prev };
      rawMonthBatches.forEach((b) => {
        const dayNum = parseInt((b.dryDate || '').split('/')[0], 10);
        if (!isNaN(dayNum)) {
          next[b.id] = dayNum % 2 !== 0 ? 'NGHỊ' : 'NGUYÊN';
        }
      });
      return next;
    });
  };

  // ─── Tùy chỉnh Tấn ──────────────────────────────────────────────────────
  const handleUpdateTons = (batchId: string, val: string) => {
    const cleanStr = val.replace(/[^\d]/g, '');
    const num = cleanStr === '' ? 0 : parseInt(cleanStr, 10);
    setCustomTonsMap((prev) => ({ ...prev, [batchId]: num }));
  };

  const handleResetSingleTons = (batchId: string) => {
    setCustomTonsMap((prev) => {
      const next = { ...prev };
      delete next[batchId];
      return next;
    });
  };

  // ─── Tính toán KPI & Quyết toán ──────────────────────────────────────────
  const batchesNghi = useMemo(() => rawMonthBatches.filter((b) => b.doiNhap === 'NGHỊ'), [rawMonthBatches]);
  const batchesNguyen = useMemo(() => rawMonthBatches.filter((b) => b.doiNhap === 'NGUYÊN'), [rawMonthBatches]);

  // Số ngày làm việc thực tế của từng đội (để tính tiền nước đá 10.000đ/ngày)
  const calcWorkingDays = (batches: CS1Batch[]) => {
    const set = new Set(batches.map((b) => b.dryDate).filter(Boolean));
    return set.size;
  };

  const waterDaysNghi = waterDaysCustom.NGHI ?? (calcWorkingDays(batchesNghi) || 13);
  const waterDaysNguyen = waterDaysCustom.NGUYEN ?? (calcWorkingDays(batchesNguyen) || 13);

  // Thống kê tổng hợp theo đội
  const activeBatches = currentBatches;
  const totalDryKg = useMemo(() => activeBatches.reduce((s, b) => s + b.dryWeightKg, 0), [activeBatches]);
  const totalTons = useMemo(() => activeBatches.reduce((s, b) => s + b.roundedTons, 0), [activeBatches]);
  const totalMoneyLua = useMemo(() => activeBatches.reduce((s, b) => s + b.thanhTien, 0), [activeBatches]);

  const currentTrauItems = viewMode === 'NGHỊ' ? trauNghi : viewMode === 'NGUYÊN' ? trauNguyen : [...trauNghi, ...trauNguyen];
  const totalMoneyTrau = useMemo(() => currentTrauItems.reduce((s, t) => s + t.thanhTien, 0), [currentTrauItems]);

  const currentWaterMoney = viewMode === 'NGHỊ'
    ? waterDaysNghi * 10_000
    : viewMode === 'NGUYÊN'
    ? waterDaysNguyen * 10_000
    : (waterDaysNghi + waterDaysNguyen) * 10_000;

  const grandTotalMoney = totalMoneyLua + totalMoneyTrau + currentWaterMoney;

  const currentWorkers = viewMode === 'NGHỊ' ? workersNghi : viewMode === 'NGUYÊN' ? workersNguyen : [...workersNghi, ...workersNguyen];
  const totalAdvance = useMemo(() => currentWorkers.reduce((s, w) => s + (w.advanceSalary || 0), 0), [currentWorkers]);
  const netRemaining = grandTotalMoney - totalAdvance;

  // ─── Quản lý công nhân ─────────────────────────────────────────────────
  const handleUpdateWorker = (
    team: 'NGHỊ' | 'NGUYÊN',
    id: string,
    field: keyof CS1Worker,
    value: string | number
  ) => {
    const setter = team === 'NGHỊ' ? setWorkersNghi : setWorkersNguyen;
    setter((prev) =>
      prev.map((w) => {
        if (w.id !== id) return w;
        if (field === 'advanceSalary') {
          const num = Number(String(value).replace(/\D/g, '')) || 0;
          return { ...w, advanceSalary: num };
        }
        if (field === 'salaryAmount') {
          const num = Number(String(value).replace(/\D/g, '')) || 0;
          return { ...w, salaryAmount: num };
        }
        if (field === 'name') {
          const strVal = String(value).toUpperCase();
          return { ...w, name: strVal, accountHolder: strVal };
        }
        if (field === 'bankName') {
          return { ...w, bankName: String(value).toUpperCase() };
        }
        return { ...w, [field]: value };
      })
    );
  };

  const handleRemoveWorker = (team: 'NGHỊ' | 'NGUYÊN', id: string) => {
    const setter = team === 'NGHỊ' ? setWorkersNghi : setWorkersNguyen;
    setter((prev) => prev.filter((w) => w.id !== id));
  };

  const handleAddWorker = (team: 'NGHỊ' | 'NGUYÊN') => {
    if (!newWorkerName.trim()) return;
    const newW: CS1Worker = {
      id: `${team.toLowerCase()}-${Date.now()}`,
      name: newWorkerName.trim().toUpperCase(),
      advanceSalary: Number(newWorkerAdvance.replace(/\D/g, '')) || 0,
      salaryAmount: 0,
      accountNumber: newWorkerAccount.trim(),
      bankName: newWorkerBank.trim().toUpperCase(),
      accountHolder: newWorkerName.trim().toUpperCase(),
    };
    const setter = team === 'NGHỊ' ? setWorkersNghi : setWorkersNguyen;
    setter((prev) => [...prev, newW]);
    setNewWorkerName('');
    setNewWorkerAdvance('0');
    setNewWorkerAccount('');
    setNewWorkerBank('');
    setShowWorkerAdd(false);
  };

  // ─── Quản lý Trấu ──────────────────────────────────────────────────────
  const handleAddTrau = (team: 'NGHỊ' | 'NGUYÊN') => {
    const qty = parseFloat(newTrauQty) || 0;
    const price = parseFloat(newTrauPrice) || 0;
    if (qty <= 0) return;
    const item: NhapTrauItem = {
      id: `trau-${Date.now()}`,
      date: newTrauDate || '01/10/2026',
      doiNhap: team,
      phuongTien: newTrauVehicle,
      soLuong: qty,
      donGia: price,
      thanhTien: Math.round(qty * price),
    };
    if (team === 'NGHỊ') setTrauNghi((prev) => [...prev, item]);
    else setTrauNguyen((prev) => [...prev, item]);
  };

  const handleRemoveTrau = (team: 'NGHỊ' | 'NGUYÊN', id: string) => {
    if (team === 'NGHỊ') setTrauNghi((prev) => prev.filter((t) => t.id !== id));
    else setTrauNguyen((prev) => prev.filter((t) => t.id !== id));
  };

  // ─── Xuất file Excel ────────────────────────────────────────────────────
  const handleExportExcel = async () => {
    if (rawMonthBatches.length === 0) {
      alert('Không có mẻ nhập sấy nào trong tháng này để xuất file.');
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
        targetTeam: viewMode,
        batches: rawMonthBatches,
        workersNghi,
        workersNguyen,
        trauNghi,
        trauNguyen,
        waterDaysNghi,
        waterDaysNguyen,
        preparerName: 'Võ Hoàng Cẩm Tiên',
        approverName: 'Huỳnh Hải Long Hồ',
      };

      const res = await fetch('/api/rice-payroll/cs1-export', {
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
      const filePrefix = viewMode === 'NGHỊ' ? 'LUONG_THANG_DOI_NGHI' : viewMode === 'NGUYÊN' ? 'LUONG_THANG_NGUYEN' : 'TONG_HOP_NHAP_SAY_CS1';
      a.download = `${filePrefix}_T${String(month).padStart(2, '0')}_${year}.xlsx`;
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
      {/* ─── Header & Upload bar ─────────────────────────────────────────── */}
      <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="flex items-center gap-2.5">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-50 text-xl text-orange-600 ring-1 ring-orange-200">
                🌾
              </span>
              <div>
                <h1 className="text-xl font-bold tracking-tight text-slate-900">
                  Nhập Sấy Cơ Sở I (Đội Nghị &amp; Đội Nguyên)
                </h1>
                <p className="text-xs text-slate-500">
                  Phân chia &amp; tính lương linh hoạt cho 2 đội nhập sấy Cơ Sở I • Gom nhóm theo <strong className="text-slate-700">Ngày Nhập Sấy</strong>
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <input type="file" ref={fileInputRef} onChange={handleFileUpload} accept=".xlsx,.xls" className="hidden" />
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

      {/* ─── Control Bar: Chọn Tháng & Chọn Đội ──────────────────────────── */}
      {allBatches.length > 0 && (
        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm space-y-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            {/* Chọn tháng */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500 mr-1">
                Tháng sấy:
              </span>
              {cs1MonthKeys.map((mk) => (
                <button
                  key={mk}
                  onClick={() => setSelectedMonthKey(mk)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                    selectedMonthKey === mk
                      ? 'bg-orange-600 text-white shadow-xs'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  Tháng {mk}
                </button>
              ))}
            </div>

            {/* 3 Chế độ xem Đội */}
            <div className="flex items-center gap-1 rounded-xl bg-slate-100 p-1 border border-slate-200">
              <button
                onClick={() => setViewMode('ALL')}
                className={`rounded-lg px-3.5 py-1.5 text-xs font-bold transition-all ${
                  viewMode === 'ALL'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                📊 Toàn bộ CS1 ({rawMonthBatches.length})
              </button>
              <button
                onClick={() => setViewMode('NGHỊ')}
                className={`rounded-lg px-3.5 py-1.5 text-xs font-bold transition-all flex items-center gap-1.5 ${
                  viewMode === 'NGHỊ'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-blue-700 hover:bg-blue-50'
                }`}
              >
                <span>🔵</span>
                <span>Đội Anh Nghị ({batchesNghi.length})</span>
              </button>
              <button
                onClick={() => setViewMode('NGUYÊN')}
                className={`rounded-lg px-3.5 py-1.5 text-xs font-bold transition-all flex items-center gap-1.5 ${
                  viewMode === 'NGUYÊN'
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'text-emerald-700 hover:bg-emerald-50'
                }`}
              >
                <span>🟢</span>
                <span>Đội Anh Nguyên ({batchesNguyen.length})</span>
              </button>
            </div>

            {/* Nút Xuất Excel */}
            <button
              onClick={handleExportExcel}
              disabled={isExporting || rawMonthBatches.length === 0}
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50 transition-all self-end lg:self-auto"
            >
              <span>📥</span>
              <span>
                {isExporting
                  ? 'Đang xuất...'
                  : viewMode === 'NGHỊ'
                  ? 'Xuất Excel Đội Nghị'
                  : viewMode === 'NGUYÊN'
                  ? 'Xuất Excel Đội Nguyên'
                  : 'Xuất Excel Toàn Bộ CS1'}
              </span>
            </button>
          </div>

          {/* Công cụ hỗ trợ gán nhanh */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-slate-100 text-xs">
            <div className="flex items-center gap-2 text-slate-500">
              <span>💡 Mẹo: Nhấp vào nút</span>
              <span className="rounded bg-blue-100 px-1.5 py-0.5 font-bold text-blue-700">NGHỊ</span>
              <span>hoặc</span>
              <span className="rounded bg-emerald-100 px-1.5 py-0.5 font-bold text-emerald-700">NGUYÊN</span>
              <span>ở mỗi dòng để đổi đội, hoặc gán nhanh cả ngày ở đầu mỗi cụm ngày!</span>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleAutoAlternateTeams}
                className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-all"
                title="Gán tự động: ngày lẻ = Đội Nghị, ngày chẵn = Đội Nguyên"
              >
                ⚡ Gán xen kẽ ngày chẵn/lẻ
              </button>
              <button
                onClick={() => setShowPricePanel(!showPricePanel)}
                className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-all"
              >
                {showPricePanel ? 'Ẩn bảng giá lúa' : '⚙️ Bảng giá loại lúa'}
              </button>
            </div>
          </div>

          {exportError && (
            <div className="rounded-lg border border-rose-200 bg-rose-50 p-2 text-xs text-rose-700">
              {exportError}
            </div>
          )}
        </div>
      )}

      {/* ─── Bảng giá loại lúa (Mở rộng) ─────────────────────────────────── */}
      {showPricePanel && (
        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">
              Cấu hình đơn giá theo loại lúa (Cơ Sở I)
            </h3>
            <span className="text-xs text-slate-500">OM18/Japo: 20.000đ • ST25/HP1: 23.000đ</span>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 md:grid-cols-6">
            {ricePrices.map((p) => (
              <div key={p.riceType} className="rounded-xl border border-slate-200 bg-slate-50/50 p-2.5 text-xs">
                <div className="font-bold text-slate-800 truncate" title={p.riceType}>
                  {p.riceType}
                </div>
                <div className="mt-1 flex items-center justify-between">
                  <span className="font-mono font-bold text-orange-700">{formatMoney(p.pricePerTon)}</span>
                  <span className="text-[10px] text-slate-400">đ/tấn</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ─── KPI Cards ──────────────────────────────────────────────────── */}
      {selectedMonthKey && (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
              {viewMode === 'ALL' ? 'Toàn bộ mẻ sấy CS1' : `Mẻ sấy ${viewMode === 'NGHỊ' ? 'Đội Nghị' : 'Đội Nguyên'}`}
            </span>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-bold tracking-tight text-slate-900">{activeBatches.length}</span>
              <span className="text-xs text-slate-500">mẻ</span>
            </div>
            <div className="mt-1 text-[11px] text-slate-400">Tổng kg: {formatMoney(totalDryKg)} kg</div>
          </div>

          <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
              Sản lượng quy đổi
            </span>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-bold tracking-tight text-orange-600">{totalTons}</span>
              <span className="text-xs font-semibold text-orange-600">tấn</span>
            </div>
            <div className="mt-1 text-[11px] text-slate-400">Tiền lúa: {formatMoney(totalMoneyLua)} đ</div>
          </div>

          <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
              Tổng tiền quyết toán
            </span>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-bold tracking-tight text-emerald-700">{formatMoney(grandTotalMoney)}</span>
              <span className="text-xs font-bold text-emerald-600">đ</span>
            </div>
            <div className="mt-1 text-[11px] text-slate-400">Gồm: Lúa + Trấu + Nước đá</div>
          </div>

          <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
              Thực nhận còn lại
            </span>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-bold tracking-tight text-blue-700">{formatMoney(netRemaining)}</span>
              <span className="text-xs font-bold text-blue-600">đ</span>
            </div>
            <div className="mt-1 text-[11px] text-slate-400">Đã trừ tạm ứng: {formatMoney(totalAdvance)} đ</div>
          </div>
        </div>
      )}

      {/* ─── Bảng Mẻ Sấy Gom Nhóm Theo Ngày Nhập Sấy ────────────────────── */}
      {selectedMonthKey && (
        <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm">
          <div className="border-b border-slate-200 bg-slate-50/70 px-5 py-3.5 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-800 flex items-center gap-2">
              <span>🌾</span>
              <span>
                Bảng Kê Nhập Sấy Cơ Sở I — Tháng {selectedMonthKey} ({currentBatches.length} mẻ)
              </span>
            </h2>
            <div className="flex items-center gap-2">
              <span className="rounded-md bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-700 ring-1 ring-inset ring-blue-200">
                Đội Nghị: {batchesNghi.length} mẻ
              </span>
              <span className="rounded-md bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-200">
                Đội Nguyên: {batchesNguyen.length} mẻ
              </span>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-100/70 text-slate-700 font-bold">
                  <th className="px-3 py-2.5 text-center w-12">STT</th>
                  <th className="px-3 py-2.5 text-center">Ngày cân</th>
                  <th className="px-3 py-2.5 text-center w-28">Đội nhập (Click đổi)</th>
                  <th className="px-3 py-2.5">Khách hàng</th>
                  <th className="px-3 py-2.5">Loại lúa</th>
                  <th className="px-3 py-2.5">Phương tiện</th>
                  <th className="px-3 py-2.5 text-center">Ngày nhập sấy</th>
                  <th className="px-3 py-2.5 text-right">Cân sấy (kg)</th>
                  <th className="px-3 py-2.5 text-center font-bold text-rose-700 bg-rose-50/50 min-w-[75px]">Tấn (✏️)</th>
                  <th className="px-3 py-2.5 text-right">Đơn giá</th>
                  <th className="px-3 py-2.5 text-right font-bold text-emerald-700 bg-emerald-50/40">Thành tiền</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {groupedByDate.length > 0 ? (
                  groupedByDate.map(([dateStr, batchesInDate]) => {
                    const dayKg = batchesInDate.reduce((s, b) => s + b.dryWeightKg, 0);
                    const dayTons = batchesInDate.reduce((s, b) => s + b.roundedTons, 0);

                    return (
                      <React.Fragment key={dateStr}>
                        {/* Hàng Header cụm Ngày có 2 nút Gán Nhanh */}
                        <tr className="bg-slate-100/90 border-t border-b border-slate-200">
                          <td colSpan={6} className="px-3 py-1.5 font-bold text-slate-800">
                            📅 Ngày nhập sấy: <span className="text-orange-700">{dateStr}</span> ({batchesInDate.length} mẻ — {dayTons} tấn)
                          </td>
                          <td colSpan={5} className="px-3 py-1.5 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <span className="text-[11px] text-slate-500 mr-1">Gán cả ngày:</span>
                              <button
                                onClick={() => handleAssignDayTeam(dateStr, 'NGHỊ')}
                                className="rounded bg-blue-50 px-2 py-0.5 text-[11px] font-bold text-blue-700 border border-blue-200 hover:bg-blue-600 hover:text-white transition-all shadow-2xs"
                                title={`Gán tất cả mẻ ngày ${dateStr} cho Đội Anh Nghị`}
                              >
                                🔵 Cho Nghị
                              </button>
                              <button
                                onClick={() => handleAssignDayTeam(dateStr, 'NGUYÊN')}
                                className="rounded bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-700 border border-emerald-200 hover:bg-emerald-600 hover:text-white transition-all shadow-2xs"
                                title={`Gán tất cả mẻ ngày ${dateStr} cho Đội Anh Nguyên`}
                              >
                                🟢 Cho Nguyên
                              </button>
                            </div>
                          </td>
                        </tr>

                        {/* Các mẻ trong ngày */}
                        {batchesInDate.map((b, idx) => {
                          const originalBatch = allBatches.find((item) => item.id === b.id);
                          const autoTons = originalBatch ? roundRiceTons(originalBatch.dryWeightKg) : b.roundedTons;
                          const isCustomized = b.roundedTons !== autoTons;
                          const isNghi = b.doiNhap === 'NGHỊ';

                          return (
                            <tr key={b.id} className="hover:bg-slate-50 transition-colors">
                              <td className="px-3 py-2 text-center text-slate-500 font-mono">
                                {b.contractNo || String(idx + 1).padStart(2, '0')}
                              </td>
                              <td className="px-3 py-2 text-center text-slate-600">{b.weighDate || '-'}</td>
                              <td className="px-3 py-2 text-center">
                                <button
                                  type="button"
                                  onClick={() => handleToggleBatchTeam(b.id)}
                                  className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold transition-all shadow-2xs flex items-center justify-center gap-1 mx-auto ${
                                    isNghi
                                      ? 'bg-blue-100 text-blue-800 hover:bg-blue-200 ring-1 ring-blue-300'
                                      : 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200 ring-1 ring-emerald-300'
                                  }`}
                                  title="Nhấp để chuyển đổi đội NGHỊ ⮂ NGUYÊN"
                                >
                                  <span>{isNghi ? '🔵' : '🟢'}</span>
                                  <span>{b.doiNhap}</span>
                                </button>
                              </td>
                              <td className="px-3 py-2 font-medium text-slate-900">{b.customerName || '-'}</td>
                              <td className="px-3 py-2 font-semibold text-slate-700">{b.riceType || '-'}</td>
                              <td className="px-3 py-2 text-slate-600">{b.vehicleName || b.freshBoVehicle || '-'}</td>
                              <td className="px-3 py-2 text-center text-orange-700 font-medium">{b.dryDate}</td>
                              <td className="px-3 py-2 text-right font-mono text-slate-700">
                                {formatMoney(b.dryWeightKg)}
                              </td>
                              <td className="px-2 py-1 text-center bg-rose-50/20">
                                <div className="flex items-center justify-center gap-1">
                                  <input
                                    type="text"
                                    inputMode="numeric"
                                    value={b.roundedTons}
                                    onChange={(e) => handleUpdateTons(b.id, e.target.value)}
                                    className={`w-14 text-center font-bold font-mono rounded px-1 py-0.5 text-xs transition-all focus:outline-none focus:ring-2 focus:ring-rose-500 ${
                                      isCustomized
                                        ? 'bg-amber-100 text-amber-900 border border-amber-400 font-black ring-1 ring-amber-400'
                                        : 'bg-white text-rose-700 border border-slate-200 hover:border-slate-300'
                                    }`}
                                    title={isCustomized ? `Đã chỉnh sửa (tự động: ${autoTons} tấn)` : 'Nhấp để sửa số tấn'}
                                  />
                                  {isCustomized && (
                                    <button
                                      type="button"
                                      onClick={() => handleResetSingleTons(b.id)}
                                      className="text-[11px] text-slate-400 hover:text-rose-600 transition-colors p-0.5"
                                      title={`Khôi phục về ${autoTons} tấn`}
                                    >
                                      ↺
                                    </button>
                                  )}
                                </div>
                              </td>
                              <td className="px-3 py-2 text-right font-mono text-slate-600">
                                {formatMoney(b.pricePerTon)}
                              </td>
                              <td className="px-3 py-2 text-right font-bold font-mono text-emerald-700 bg-emerald-50/20">
                                {formatMoney(b.thanhTien)}
                              </td>
                            </tr>
                          );
                        })}
                      </React.Fragment>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={11} className="px-4 py-8 text-center text-slate-400">
                      Không có mẻ sấy nào trong tháng {selectedMonthKey} với bộ lọc hiện tại
                    </td>
                  </tr>
                )}
              </tbody>
              {currentBatches.length > 0 && (
                <tfoot>
                  <tr className="border-t-2 border-slate-300 bg-amber-50/70 font-bold text-slate-900">
                    <td colSpan={7} className="px-3 py-2.5 text-center uppercase tracking-wide">
                      Tổng cộng ({viewMode === 'ALL' ? 'Toàn bộ CS1' : `Đội ${viewMode}`})
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono text-slate-900">{formatMoney(totalDryKg)}</td>
                    <td className="px-3 py-2.5 text-center font-mono text-rose-700 text-sm">{totalTons}</td>
                    <td className="px-3 py-2.5 text-right font-mono text-slate-500">-</td>
                    <td className="px-3 py-2.5 text-right font-mono text-emerald-800 text-sm">
                      {formatMoney(totalMoneyLua)} đ
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      )}

      {/* ─── Khối Quản lý Công Nhân & Quyết Toán Chi Lương ──────────────── */}
      {selectedMonthKey && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Cột trái 2/3: Danh sách công nhân */}
          <div className="lg:col-span-2 overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm">
            <div className="border-b border-slate-200 bg-slate-50/70 px-5 py-3.5 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-xs font-bold uppercase tracking-wider text-slate-800 flex items-center gap-2">
                  <span>👥</span>
                  <span>
                    Bảng Công Nhân &amp; Tạm Ứng — {viewMode === 'NGUYÊN' ? 'Đội Anh Nguyên' : 'Đội Anh Nghị'}
                  </span>
                </h2>
                <p className="text-[11px] text-slate-500">
                  <span className="text-rose-600 font-semibold">✏️ Cho phép sửa trực tiếp Họ tên, Tạm ứng, STK, Ngân hàng</span>
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowWorkerAdd(!showWorkerAdd)}
                  className="rounded-lg bg-orange-600 px-3 py-1 text-xs font-bold text-white hover:bg-orange-700 transition-all shadow-2xs"
                >
                  {showWorkerAdd ? 'Đóng' : '+ Thêm công nhân'}
                </button>
              </div>
            </div>

            {/* Form thêm công nhân */}
            {showWorkerAdd && (
              <div className="border-b border-slate-200 bg-slate-50 p-4">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
                  <input
                    type="text"
                    placeholder="Họ &amp; Tên công nhân"
                    value={newWorkerName}
                    onChange={(e) => setNewWorkerName(e.target.value)}
                    className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-orange-500"
                  />
                  <input
                    type="text"
                    placeholder="Số tiền tạm ứng"
                    value={newWorkerAdvance}
                    onChange={(e) => setNewWorkerAdvance(e.target.value)}
                    className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-orange-500"
                  />
                  <input
                    type="text"
                    placeholder="Số tài khoản"
                    value={newWorkerAccount}
                    onChange={(e) => setNewWorkerAccount(e.target.value)}
                    className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-orange-500"
                  />
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Ngân hàng"
                      value={newWorkerBank}
                      onChange={(e) => setNewWorkerBank(e.target.value)}
                      className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-orange-500"
                    />
                    <button
                      onClick={() => handleAddWorker(viewMode === 'NGUYÊN' ? 'NGUYÊN' : 'NGHỊ')}
                      className="rounded-lg bg-orange-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-orange-700 transition-all shrink-0"
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
                    <th className="px-3 py-2.5 text-center w-12">Xóa</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {(viewMode === 'NGUYÊN' ? workersNguyen : workersNghi).map((w, idx) => {
                    const currentTeam = viewMode === 'NGUYÊN' ? 'NGUYÊN' : 'NGHỊ';
                    return (
                      <tr key={w.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-2 py-1.5 text-center text-slate-500 font-mono">{idx + 1}</td>
                        <td className="px-2 py-1.5">
                          <input
                            type="text"
                            value={w.name}
                            onChange={(e) => handleUpdateWorker(currentTeam, w.id, 'name', e.target.value)}
                            className="w-full rounded border border-slate-200 bg-white px-2 py-1 text-xs font-bold uppercase text-slate-900 focus:outline-none focus:ring-2 focus:ring-orange-500"
                          />
                        </td>
                        <td className="px-2 py-1.5 text-right">
                          <input
                            type="text"
                            value={formatMoney(w.advanceSalary)}
                            onChange={(e) => handleUpdateWorker(currentTeam, w.id, 'advanceSalary', e.target.value)}
                            className="w-28 rounded border border-slate-200 bg-white px-2 py-1 text-right font-mono text-xs font-bold text-rose-700 focus:outline-none focus:ring-2 focus:ring-orange-500"
                          />
                        </td>
                        <td className="px-2 py-1.5">
                          <input
                            type="text"
                            value={w.accountNumber}
                            onChange={(e) => handleUpdateWorker(currentTeam, w.id, 'accountNumber', e.target.value)}
                            className="w-full rounded border border-slate-200 bg-white px-2 py-1 font-mono text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-orange-500"
                          />
                        </td>
                        <td className="px-2 py-1.5">
                          <input
                            type="text"
                            value={w.bankName}
                            onChange={(e) => handleUpdateWorker(currentTeam, w.id, 'bankName', e.target.value)}
                            className="w-full rounded border border-slate-200 bg-white px-2 py-1 text-xs uppercase text-slate-700 focus:outline-none focus:ring-2 focus:ring-orange-500"
                          />
                        </td>
                        <td className="px-2 py-1.5 text-center">
                          <button
                            type="button"
                            onClick={() => handleRemoveWorker(currentTeam, w.id)}
                            className="rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                          >
                            ✕
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Cột phải 1/3: Quyết toán chi lương */}
          <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm space-y-4">
            <div className="border-b border-slate-100 pb-3">
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                Bảng Kê Quyết Toán Lương CS1
              </h2>
              <p className="text-[11px] text-slate-500">
                Đang xem: <strong className="text-orange-700">{viewMode === 'ALL' ? 'Toàn bộ CS1' : `Đội ${viewMode}`}</strong>
              </p>
            </div>

            <div className="space-y-3 text-xs">
              <div className="flex items-center justify-between py-1 border-b border-slate-100">
                <span className="text-slate-600">Tiền lúa nhập sấy:</span>
                <span className="font-bold font-mono text-slate-900">{formatMoney(totalMoneyLua)} đ</span>
              </div>

              <div className="flex items-center justify-between py-1 border-b border-slate-100">
                <span className="text-slate-600">Tiền nhập trấu ({currentTrauItems.length} chuyến):</span>
                <span className="font-bold font-mono text-slate-900">{formatMoney(totalMoneyTrau)} đ</span>
              </div>

              <div className="flex items-center justify-between py-1 border-b border-slate-100">
                <span className="text-slate-600">
                  Tiền nước đá (
                  {viewMode === 'NGHỊ' ? `${waterDaysNghi} ngày` : viewMode === 'NGUYÊN' ? `${waterDaysNguyen} ngày` : 'cả 2 đội'}
                  ):
                </span>
                <span className="font-bold font-mono text-slate-900">{formatMoney(currentWaterMoney)} đ</span>
              </div>

              <div className="flex items-center justify-between py-1.5 border-b border-slate-200 bg-emerald-50/50 px-2 rounded-lg">
                <span className="font-bold text-emerald-900">Tổng cộng thành tiền:</span>
                <span className="font-bold text-emerald-700 font-mono text-sm">
                  {formatMoney(grandTotalMoney)} đ
                </span>
              </div>

              <div className="flex items-center justify-between py-1 border-b border-slate-100 px-2">
                <span className="text-rose-700 font-medium">Trừ tạm ứng:</span>
                <span className="font-bold text-rose-600 font-mono">- {formatMoney(totalAdvance)} đ</span>
              </div>

              <div className="flex items-center justify-between py-2 border-t-2 border-slate-900 bg-amber-50 px-3 rounded-xl mt-4">
                <span className="font-bold text-slate-900 uppercase tracking-wide">Còn lại thực chi:</span>
                <span className="font-black text-rose-700 font-mono text-base">
                  {formatMoney(netRemaining)} đ
                </span>
              </div>
            </div>

            <div className="pt-2">
              <button
                onClick={handleExportExcel}
                disabled={isExporting || rawMonthBatches.length === 0}
                className="w-full rounded-xl bg-emerald-600 py-3 text-xs font-bold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50 transition-all flex items-center justify-center gap-2"
              >
                <span>📥</span>
                <span>
                  {isExporting
                    ? 'Đang tạo Excel...'
                    : viewMode === 'NGHỊ'
                    ? 'Xuất File Excel Đội Nghị'
                    : viewMode === 'NGUYÊN'
                    ? 'Xuất File Excel Đội Nguyên'
                    : 'Xuất File Excel Toàn Bộ CS1'}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── State trống khi chưa nạp file ───────────────────────────────── */}
      {allBatches.length === 0 && !isParsing && (
        <div className="rounded-2xl border-2 border-dashed border-slate-200 bg-white p-12 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-orange-50 text-2xl text-orange-600">
            🌾
          </div>
          <h3 className="mt-4 text-sm font-bold text-slate-900">Chưa có dữ liệu nhập sấy Cơ Sở I</h3>
          <p className="mt-1 text-xs text-slate-500 max-w-md mx-auto">
            Vui lòng nhấn nút <strong className="text-slate-700">Tải File Lúa Master</strong> để tải file Excel lúa, hoặc nhấn <strong className="text-slate-700">Nạp Dữ Liệu Mẫu</strong> để xem trước số liệu Đội Nghị &amp; Đội Nguyên.
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

