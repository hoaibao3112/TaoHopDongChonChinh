'use client';

/**
 * RiceNhapCS2View — Phân Hệ Gộp Toàn Diện Đội Dương Cơ Sở II
 *
 * Gộp 2 chức năng chính trong 1 màn hình duy nhất:
 *   1. 🌾 Nhập Sấy Lúa CS2 (tính thành tiền loại lúa + chụm lò + trấu)
 *   2. 🚛 Xuất Lúa Khô CS2 (tính tấn có trở 20k / không trở 16k)
 *   3. 💰 Quyết Toán & Chi Lương Đội Dương (bảng kê quyết toán 10 mục + 20 công nhân)
 *
 * Xuất file Excel duy nhất 5 sheets chuẩn 100% mẫu công ty:
 *   - Nhap lua CS2
 *   - XUẤT LÚA
 *   - Nhập Trấu
 *   - ỨL ĐỘI DƯƠNG-CS2-T{mm}.{yy}
 *   - CL ĐỘI DƯƠNG-CS2-{mm}.{yy}
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { getMonthKeyFromDate, getSortedMonthKeysFromDates } from '@/lib/rice-payroll/month-utils';
import { getDefaultClassification, getDefaultTons } from '@/lib/rice-payroll/sample-classification';
import { DOI_DUONG_WORKERS } from '@/lib/rice-payroll/team-duong-workers';

// ─── Helpers ────────────────────────────────────────────────────────────────

function parseDate(s: string): Date {
  if (!s) return new Date(0);
  const [d, m, y] = s.split('/').map(Number);
  return new Date(y, m - 1, d);
}

function formatMoney(n: number): string {
  return Math.round(n).toLocaleString('vi-VN');
}

function getMonthKey(dateStr: string): string {
  return getMonthKeyFromDate(dateStr);
}

type CS2SubTab = 'NHAP' | 'XUAT' | 'CHI_LUONG';

// ─── Component ───────────────────────────────────────────────────────────────

export default function RiceNhapCS2View() {
  // ── State: Sub-Tab điều hướng ────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<CS2SubTab>('NHAP');

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

  // Nhập Trấu & Quyết toán (tách theo từng tháng)
  const [trauItemsByMonth, setTrauItemsByMonth] = useState<Record<string, NhapTrauItem[]>>({
    '10/2026': DEFAULT_OCTOBER_TRAU_ITEMS,
  });
  const trauItems = useMemo(
    () => (selectedMonthKey ? trauItemsByMonth[selectedMonthKey] ?? [] : []),
    [trauItemsByMonth, selectedMonthKey],
  );
  const totalTrauTons = useMemo(
    () => trauItems.reduce((s, t) => s + t.soLuong, 0),
    [trauItems],
  );
  const totalTrauMoney = useMemo(
    () => trauItems.reduce((s, t) => s + t.thanhTien, 0),
    [trauItems],
  );
  const [managementSalary, setManagementSalary] = useState<number>(6_000_000);
  const [iceUnitPricePerDay, setIceUnitPricePerDay] = useState<number>(10_000);
  const [showTrauPanel, setShowTrauPanel] = useState(false);

  // Form thêm / sửa chuyến trấu
  const [newTrauDate, setNewTrauDate] = useState('');
  const [newTrauVehicle, setNewTrauVehicle] = useState('ÔNG 5');
  const [newTrauTons, setNewTrauTons] = useState('');
  const [newTrauPrice, setNewTrauPrice] = useState('27000');
  const [newTrauMoney, setNewTrauMoney] = useState('');
  const [editingTrauId, setEditingTrauId] = useState<string | null>(null);

  // ── State: Xuất lúa overrides (toggle Có trở / Không trở) & Đơn giá xuất ─
  const [xuatTroOverrides, setXuatTroOverrides] = useState<Record<string, boolean>>({});
  const [priceCoTro, setPriceCoTro] = useState<number>(20_000);
  const [priceKhongTro, setPriceKhongTro] = useState<number>(16_000);
  const [customBatchPrices, setCustomBatchPrices] = useState<Record<string, number>>({});

  // ── State: Quản lý lương & tạm ứng 20 công nhân ─────────────────────────
  const [workerAdvances, setWorkerAdvances] = useState<Record<string, number>>(() => {
    const init: Record<string, number> = {};
    DOI_DUONG_WORKERS.forEach((w) => {
      init[w.name] = w.sampleOctoberAdvance ?? 0;
    });
    return init;
  });

  const [workerSalaries, setWorkerSalaries] = useState<Record<string, number>>(() => {
    const init: Record<string, number> = {};
    DOI_DUONG_WORKERS.forEach((w) => {
      init[w.name] = w.sampleOctoberSalary ?? 0;
    });
    return init;
  });

  // ── State: xuất Excel ───────────────────────────────────────────────────
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  // ─── Parse file Excel (hoặc nạp dữ liệu mẫu) ────────────────────────────
  const applyParsedBatches = useCallback((batches: RiceBatch[]) => {
    setAllBatches(batches);
    // Lấy tháng từ cả ngày nhập (dryDate) và ngày xuất (dischargeDate) của CS2
    const cs2Dates: string[] = [];
    batches.forEach((b) => {
      if (isCoSo2(b.dryFacility)) {
        if (b.dryDate) cs2Dates.push(b.dryDate);
        if (b.dischargeDate) cs2Dates.push(b.dischargeDate);
      }
    });
    const cs2Months = getSortedMonthKeysFromDates(cs2Dates);
    setSelectedMonthKey(cs2Months[0] ?? '');
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
        const err = await res.json().catch(() => ({ error: 'Lỗi không xác định' }));
        throw new Error(err.error ?? 'Lỗi nạp dữ liệu mẫu');
      }
      const data = (await res.json()) as { batches: RiceBatch[] };
      applyParsedBatches(data.batches ?? []);
    } catch (err) {
      setParseError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsParsing(false);
    }
  }, [applyParsedBatches]);

  useEffect(() => {
    loadSampleData();
  }, [loadSampleData]);

  const handleFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
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

        const data = (await res.json()) as { batches: RiceBatch[] };
        applyParsedBatches(data.batches ?? []);
      } catch (err) {
        setParseError(err instanceof Error ? err.message : String(err));
      } finally {
        setIsParsing(false);
      }
    },
    [applyParsedBatches],
  );

  // ─── Danh sách tất cả các tháng của Cơ Sở II (gồm cả nhập & xuất) ───────────
  const availableMonths = useMemo(() => {
    const cs2Dates: string[] = [];
    allBatches.forEach((b) => {
      if (isCoSo2(b.dryFacility)) {
        if (b.dryDate) cs2Dates.push(b.dryDate);
        if (b.dischargeDate) cs2Dates.push(b.dischargeDate);
      }
    });
    return getSortedMonthKeysFromDates(cs2Dates);
  }, [allBatches]);

  // ─── 1. TÍNH TOÁN DỮ LIỆU NHẬP SẤY CS2 ──────────────────────────────────
  const monthNhapRawBatches = useMemo(
    () =>
      allBatches.filter(
        (b) =>
          isCoSo2(b.dryFacility) &&
          b.dryDate &&
          getMonthKey(b.dryDate) === selectedMonthKey,
      ),
    [allBatches, selectedMonthKey],
  );

  const nhapBatches = useMemo((): NhapBatch[] => {
    return monthNhapRawBatches
      .slice()
      .sort((a, b) => parseDate(a.dryDate).getTime() - parseDate(b.dryDate).getTime())
      .map((b, idx) => {
        // Trong file mẫu thực tế mẻ TL6T-LOẠI 2 ngày 28/10 (117.540 kg) được ghi nhận 117 tấn
        const tons = b.riceType?.includes('TL6T') ? 117 : roundRiceTons(b.dryWeightKg);
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
  }, [monthNhapRawBatches, ricePrices, chumLoPrice]);

  const summary = useMemo((): NhapSummary => {
    const totalThanhTienNhap = nhapBatches.reduce((s, b) => s + b.thanhTienNhap, 0);
    const totalThanhTienChumLo = nhapBatches.reduce((s, b) => s + b.thanhTienChumLo, 0);
    return {
      totalKg: nhapBatches.reduce((s, b) => s + b.dryWeightKg, 0),
      totalTons: nhapBatches.reduce((s, b) => s + b.roundedTons, 0),
      totalThanhTienNhap,
      totalThanhTienChumLo,
      grandTotal: totalThanhTienNhap + totalThanhTienChumLo,
    };
  }, [nhapBatches]);

  // Phân nhóm nhập ST25 vs Phổ thông
  const nhapClassification = useMemo(() => {
    let tonsST25 = 0;
    let moneyST25 = 0;
    let tonsPhothong = 0;
    let moneyPhothong = 0;
    nhapBatches.forEach((b) => {
      const type = (b.riceType || '').toUpperCase();
      if (type.includes('ST25')) {
        tonsST25 += b.roundedTons;
        moneyST25 += b.thanhTienNhap;
      } else {
        tonsPhothong += b.roundedTons;
        moneyPhothong += b.thanhTienNhap;
      }
    });
    return { tonsST25, moneyST25, tonsPhothong, moneyPhothong };
  }, [nhapBatches]);

  // ─── 2. TÍNH TOÁN DỮ LIỆU XUẤT LÚA CS2 ──────────────────────────────────
  const monthXuatRawBatches = useMemo(
    () =>
      allBatches.filter(
        (b) =>
          isCoSo2(b.dryFacility) &&
          b.dischargeDate &&
          getMonthKey(b.dischargeDate) === selectedMonthKey,
      ),
    [allBatches, selectedMonthKey],
  );

  const xuatBatches = useMemo(() => {
    return monthXuatRawBatches
      .slice()
      .sort((a, b) => parseDate(a.dischargeDate).getTime() - parseDate(b.dischargeDate).getTime())
      .map((b) => {
        const isCoTro =
          xuatTroOverrides[b.id] !== undefined
            ? xuatTroOverrides[b.id]
            : getDefaultClassification(b);
        const tons = getDefaultTons(b);
        const defaultPrice = isCoTro ? priceCoTro : priceKhongTro;
        const unitPrice =
          customBatchPrices[b.id] !== undefined
            ? customBatchPrices[b.id]
            : defaultPrice;
        const thanhTien = tons * unitPrice;
        const kg = b.dryWeightKg || 0;
        return {
          ...b,
          isCoTro,
          customIsCoTro: isCoTro,
          calculatedTons: tons,
          unitPrice,
          customUnitPrice: unitPrice,
          thanhTien,
          displayKg: kg,
        };
      });
  }, [monthXuatRawBatches, xuatTroOverrides, priceCoTro, priceKhongTro, customBatchPrices]);

  const xuatSummary = useMemo(() => {
    let tonsCoTro = 0;
    let tonsKhongTro = 0;
    let moneyCoTro = 0;
    let moneyKhongTro = 0;
    let totalKg = 0;

    xuatBatches.forEach((b) => {
      totalKg += b.displayKg;
      if (b.isCoTro) {
        tonsCoTro += b.calculatedTons;
        moneyCoTro += b.thanhTien;
      } else {
        tonsKhongTro += b.calculatedTons;
        moneyKhongTro += b.thanhTien;
      }
    });

    return {
      tonsCoTro,
      moneyCoTro,
      tonsKhongTro,
      moneyKhongTro,
      totalTons: tonsCoTro + tonsKhongTro,
      totalMoney: moneyCoTro + moneyKhongTro,
      totalKg,
    };
  }, [xuatBatches]);

  // ─── 3. TÍNH TOÁN QUYẾT TOÁN 10 MỤC & LƯƠNG 20 CÔNG NHÂN ──────────────────
  const trauOng5 = useMemo(
    () => trauItems.filter((t) => (t.phuongTien || '').toUpperCase().includes('ÔNG 5')),
    [trauItems],
  );
  const tonsTrauOng5 = useMemo(() => trauOng5.reduce((s, t) => s + t.soLuong, 0), [trauOng5]);
  const moneyTrauOng5 = useMemo(() => trauOng5.reduce((s, t) => s + t.thanhTien, 0), [trauOng5]);

  const trauNgoai = useMemo(
    () => trauItems.filter((t) => !(t.phuongTien || '').toUpperCase().includes('ÔNG 5')),
    [trauItems],
  );
  const tonsTrauNgoai = useMemo(() => trauNgoai.reduce((s, t) => s + t.soLuong, 0), [trauNgoai]);
  const moneyTrauNgoai = useMemo(() => trauNgoai.reduce((s, t) => s + t.thanhTien, 0), [trauNgoai]);

  // Số ngày làm việc tính nước đá (distinct ngày nhập & xuất)
  const workDaysCount = useMemo(() => {
    const dates = new Set<string>();
    nhapBatches.forEach((b) => dates.add(b.dryDate));
    xuatBatches.forEach((b) => dates.add(b.dischargeDate));
    return dates.size > 0 ? dates.size : 22;
  }, [nhapBatches, xuatBatches]);

  const totalTienNuocDa = workDaysCount * iceUnitPricePerDay;

  // Tổng cộng nhập + xuất
  const totalNhapVaXuatMoney =
    nhapClassification.moneyPhothong +
    nhapClassification.moneyST25 +
    moneyTrauOng5 +
    moneyTrauNgoai +
    xuatSummary.moneyCoTro +
    xuatSummary.moneyKhongTro;

  // Tổng tiền lương cần chi (10 mục)
  const totalTienCanChi =
    totalNhapVaXuatMoney +
    summary.totalThanhTienChumLo +
    managementSalary +
    totalTienNuocDa;

  // Tổng tạm ứng 20 công nhân
  const totalAdvance = useMemo(() => {
    return DOI_DUONG_WORKERS.reduce((s, w) => s + (workerAdvances[w.name] ?? 0), 0);
  }, [workerAdvances]);

  // Thực lãnh
  const remainMoney = totalTienCanChi - totalAdvance;

  // Tổng lương đang phân bổ trên bảng công nhân
  const currentTotalAllocatedSalary = useMemo(() => {
    return DOI_DUONG_WORKERS.reduce((s, w) => s + (workerSalaries[w.name] ?? 0), 0);
  }, [workerSalaries]);

  // Tự động phân bổ lại lương theo tỷ lệ mẫu tháng 10
  const handleAutoAllocateSalaries = () => {
    const sampleTotal = DOI_DUONG_WORKERS.reduce((s, w) => s + (w.sampleOctoberSalary ?? 0), 0);
    if (sampleTotal <= 0) return;
    const ratio = totalTienCanChi / sampleTotal;

    const newSalaries: Record<string, number> = {};
    let runningSum = 0;

    DOI_DUONG_WORKERS.forEach((w, idx) => {
      if (idx === DOI_DUONG_WORKERS.length - 1) {
        // Người cuối nhận phần chẵn để khớp 100% từng đồng
        newSalaries[w.name] = totalTienCanChi - runningSum;
      } else {
        const alloc = Math.round((w.sampleOctoberSalary ?? 0) * ratio / 1000) * 1000;
        newSalaries[w.name] = alloc;
        runningSum += alloc;
      }
    });

    setWorkerSalaries(newSalaries);
  };

  // ─── Phát hiện loại lúa chưa có giá ────────────────────────────────────
  const unknownRiceTypes = useMemo(() => {
    const unknown = new Set<string>();
    nhapBatches.forEach((b) => {
      if (b.riceType && b.pricePerTon === 0) {
        unknown.add(b.riceType);
      }
    });
    return Array.from(unknown);
  }, [nhapBatches]);

  // ─── Thao tác giá & trấu ───────────────────────────────────────────────
  const handleQuickAddRicePrice = (riceType: string, price: number = 20000) => {
    const type = riceType.trim();
    if (!type) return;
    setRicePrices((prev) => {
      const norm = (s: string) => s.trim().toUpperCase();
      const existingIdx = prev.findIndex((p) => norm(p.riceType) === norm(type));
      if (existingIdx >= 0) {
        const copy = [...prev];
        copy[existingIdx] = { riceType: type, pricePerTon: price };
        return copy;
      }
      return [...prev, { riceType: type, pricePerTon: price }];
    });
  };

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

  // Quản lý chuyến trấu
  const computeTrauMoney = (vehicle: string, tonsNum: number, priceNum: number): number => {
    if (isNaN(tonsNum) || tonsNum <= 0) return 0;
    const isOng5 = (vehicle || '').toUpperCase().includes('ÔNG 5');
    if (isOng5) {
      if (Math.abs(tonsNum - 11) < 0.01) return 300000;
      if (Math.abs(tonsNum - 22) < 0.01) return 600000;
      return Math.round((tonsNum * (priceNum || 27273)) / 1000) * 1000;
    }
    return Math.round((tonsNum * priceNum) / 1000) * 1000;
  };

  const handleTrauTonsChange = (val: string) => {
    setNewTrauTons(val);
    const tons = parseFloat(val);
    const isOng5 = newTrauVehicle.toUpperCase().includes('ÔNG 5');
    const price = parseInt(newTrauPrice.replace(/\D/g, ''), 10) || (isOng5 ? 27273 : 27000);
    if (!isNaN(tons) && tons > 0) {
      const money = computeTrauMoney(newTrauVehicle, tons, price);
      setNewTrauMoney(money > 0 ? String(money) : '');
    } else {
      setNewTrauMoney('');
    }
  };

  const handleTrauPriceChange = (val: string) => {
    setNewTrauPrice(val);
    const price = parseInt(val.replace(/\D/g, ''), 10) || 0;
    const tons = parseFloat(newTrauTons);
    if (!isNaN(tons) && tons > 0 && price > 0) {
      const money = Math.round((tons * price) / 1000) * 1000;
      setNewTrauMoney(money > 0 ? String(money) : '');
    }
  };

  const handleTrauMoneyChange = (val: string) => {
    const rawVal = val.replace(/\D/g, '');
    setNewTrauMoney(rawVal);
  };

  const handleSelectTrauPreset = (vehicle: string, tons: number, price: number, money: number) => {
    setNewTrauVehicle(vehicle);
    setNewTrauTons(String(tons));
    setNewTrauPrice(String(price));
    setNewTrauMoney(String(money));
  };

  const handleStartEditTrau = (item: NhapTrauItem) => {
    setEditingTrauId(item.id);
    setNewTrauDate(item.date);
    setNewTrauVehicle(item.phuongTien);
    setNewTrauTons(String(item.soLuong));
    const isOng5 = (item.phuongTien || '').toUpperCase().includes('ÔNG 5');
    const defaultDonGia = isOng5 ? 27273 : (item.donGia || 27000);
    setNewTrauPrice(String(defaultDonGia));
    setNewTrauMoney(String(item.thanhTien));
  };

  const handleCancelEditTrau = () => {
    setEditingTrauId(null);
    setNewTrauDate('');
    setNewTrauVehicle('ÔNG 5');
    setNewTrauTons('');
    setNewTrauPrice('27273');
    setNewTrauMoney('');
  };

  const handleSaveTrauItem = () => {
    const tons = parseFloat(newTrauTons);
    const vehicle = newTrauVehicle.trim() || 'ÔNG 5';
    const isOng5 = vehicle.toUpperCase().includes('ÔNG 5');
    const price = parseInt(newTrauPrice.replace(/\D/g, ''), 10) || (isOng5 ? 27273 : 27000);
    const manualMoney = parseInt(newTrauMoney.replace(/\D/g, ''), 10);
    if (!newTrauDate || isNaN(tons) || tons <= 0) return;

    const thanhTien =
      !isNaN(manualMoney) && manualMoney > 0
        ? manualMoney
        : computeTrauMoney(vehicle, tons, price);

    const calculatedPrice = isOng5
      ? 27273
      : (price > 0 ? price : (tons > 0 ? Math.round(thanhTien / tons) : 27000));

    const monthKey = selectedMonthKey || 'custom';

    if (editingTrauId) {
      setTrauItemsByMonth((prev) => ({
        ...prev,
        [monthKey]: (prev[monthKey] ?? []).map((t) =>
          t.id === editingTrauId
            ? {
                ...t,
                date: newTrauDate.trim(),
                phuongTien: vehicle,
                soLuong: tons,
                donGia: calculatedPrice,
                thanhTien,
              }
            : t,
        ),
      }));
      setEditingTrauId(null);
    } else {
      const newItem: NhapTrauItem = {
        id: `trau-${Date.now()}`,
        date: newTrauDate.trim(),
        doiNhap: 'DƯƠNG',
        phuongTien: vehicle,
        soLuong: tons,
        donGia: calculatedPrice,
        thanhTien,
      };
      setTrauItemsByMonth((prev) => ({
        ...prev,
        [monthKey]: [...(prev[monthKey] ?? []), newItem],
      }));
    }

    setNewTrauDate('');
    setNewTrauTons('');
    setNewTrauMoney('');
  };

  const handleDeleteTrauItem = (id: string) => {
    const monthKey = selectedMonthKey || 'custom';
    setTrauItemsByMonth((prev) => ({
      ...prev,
      [monthKey]: (prev[monthKey] ?? []).filter((t) => t.id !== id),
    }));
    if (editingTrauId === id) {
      handleCancelEditTrau();
    }
  };

  // Toggle Có trở / Không trở cho mẻ xuất lúa
  const handleToggleTro = (batchId: string, currentVal: boolean) => {
    setXuatTroOverrides((prev) => ({
      ...prev,
      [batchId]: !currentVal,
    }));
  };

  // Thao tác hàng loạt nhanh cho Xuất lúa
  const handleSetAllCoTro = () => {
    const overrides: Record<string, boolean> = {};
    xuatBatches.forEach((b) => {
      overrides[b.id] = true;
    });
    setXuatTroOverrides(overrides);
  };

  const handleSetAllKhongTro = () => {
    const overrides: Record<string, boolean> = {};
    xuatBatches.forEach((b) => {
      overrides[b.id] = false;
    });
    setXuatTroOverrides(overrides);
  };

  const handleResetTroOverrides = () => {
    setXuatTroOverrides({});
    setCustomBatchPrices({});
  };

  // Cập nhật đơn giá riêng lẻ cho 1 mẻ xuất lúa
  const handleUpdateBatchPrice = (batchId: string, val: number) => {
    setCustomBatchPrices((prev) => ({
      ...prev,
      [batchId]: val,
    }));
  };

  // Cập nhật tạm ứng cho công nhân
  const handleUpdateWorkerAdvance = (name: string, val: number) => {
    setWorkerAdvances((prev) => ({
      ...prev,
      [name]: val,
    }));
  };

  // Cập nhật lương phân bổ cho công nhân
  const handleUpdateWorkerSalary = (name: string, val: number) => {
    setWorkerSalaries((prev) => ({
      ...prev,
      [name]: val,
    }));
  };

  // ─── XUẤT EXCEL TỔNG HỢP 5 SHEETS ──────────────────────────────────────
  const handleExportUnifiedExcel = async () => {
    if (!selectedMonthKey) return;
    setIsExporting(true);
    setExportError(null);

    try {
      const [mm, yyyy] = selectedMonthKey.split('/').map(Number);
      const payload = {
        month: mm,
        year: yyyy,
        nhapBatches,
        xuatBatches,
        trauItems,
        chumLoUnitPrice: chumLoPrice,
        priceCoTro,
        priceKhongTro,
        managementSalary,
        iceUnitPricePerDay,
        workDaysCount,
        workerAdvances,
        customWorkerSalaries: workerSalaries,
      };

      const res = await fetch('/api/rice-payroll/cs2-unified-export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Lỗi không xác định' }));
        throw new Error(err.error ?? 'Xuất thất bại');
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `TONG_HOP_DOI_DUONG_CS2_T${String(mm).padStart(2, '0')}_${yyyy}_HOAN_CHINH.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setExportError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsExporting(false);
    }
  };

  const [selectedMonth, selectedYear] = selectedMonthKey
    ? selectedMonthKey.split('/').map(Number)
    : [0, 0];

  return (
    <div className="space-y-6">
      {/* ── Banner Header Chính Thức (Nhẹ nhàng, thanh lịch, dễ nhìn) ── */}
      <div className="rounded-3xl border border-slate-200/90 bg-white p-6 sm:p-7 shadow-xs">
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-5">
          <div>
            <div className="flex items-center gap-2.5 mb-1.5 flex-wrap">
              <span className="text-2xl">🔥</span>
              <h1 className="text-xl sm:text-2xl font-black tracking-tight text-slate-900">
                Lương &amp; Tổng Hợp Đội Dương — Cơ Sở II
              </h1>
              <span className="rounded-full bg-amber-50 text-amber-800 border border-amber-200 text-xs font-bold px-2.5 py-0.5">
                All-in-one · 5 Sheets
              </span>
            </div>
            <p className="text-slate-500 text-xs sm:text-sm max-w-3xl leading-relaxed">
              Tích hợp trọn gói 2 phân hệ trong 1 bảng: <b>Nhập sấy lúa tươi</b>, <b>Xuất lúa khô</b>, <b>Nhập trấu</b>, <b>Chụm lò</b> và <b>Bảng quyết toán chi lương 20 công nhân</b>. Xuất đúng 1 file Excel duy nhất chuẩn 5 sheets!
            </p>
          </div>

          {/* Nút Xuất Excel Header */}
          <button
            onClick={handleExportUnifiedExcel}
            disabled={isExporting || (nhapBatches.length === 0 && xuatBatches.length === 0)}
            className="flex items-center gap-2 rounded-2xl bg-amber-600 hover:bg-amber-700 text-white px-5 py-3 text-xs sm:text-sm font-bold shadow-xs transition-all hover:scale-102 active:scale-98 disabled:opacity-50 cursor-pointer shrink-0"
          >
            {isExporting ? (
              <>
                <span className="animate-spin text-base">⏳</span>
                <span>Đang xuất 5 Sheets...</span>
              </>
            ) : (
              <>
                <span className="text-base">📥</span>
                <span>Xuất Excel 5 Sheet (Đội Dương)</span>
              </>
            )}
          </button>
        </div>

        {/* Thẻ thống kê nhanh trên Header */}
        {selectedMonthKey && (
          <div className="mt-5 pt-4 border-t border-slate-100 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <div className="rounded-2xl bg-slate-50 p-3 border border-slate-200/70">
              <div className="text-[11px] text-slate-500 font-medium">Lúa Nhập Sấy</div>
              <div className="text-base sm:text-lg font-black text-slate-900">{summary.totalTons.toLocaleString('vi-VN')} <span className="text-xs font-normal text-slate-500">tấn</span></div>
              <div className="text-[11px] text-slate-500 truncate">{formatMoney(summary.totalThanhTienNhap)}đ</div>
            </div>

            <div className="rounded-2xl bg-slate-50 p-3 border border-slate-200/70">
              <div className="text-[11px] text-slate-500 font-medium">Lúa Xuất Khô</div>
              <div className="text-base sm:text-lg font-black text-slate-900">{xuatSummary.totalTons.toLocaleString('vi-VN')} <span className="text-xs font-normal text-slate-500">tấn</span></div>
              <div className="text-[11px] text-slate-500 truncate">{formatMoney(xuatSummary.totalMoney)}đ</div>
            </div>

            <div className="rounded-2xl bg-slate-50 p-3 border border-slate-200/70">
              <div className="text-[11px] text-slate-500 font-medium">Nhập Trấu</div>
              <div className="text-base sm:text-lg font-black text-slate-900">{totalTrauTons} <span className="text-xs font-normal text-slate-500">tấn</span></div>
              <div className="text-[11px] text-slate-500 truncate">{formatMoney(totalTrauMoney)}đ</div>
            </div>

            <div className="rounded-2xl bg-slate-50 p-3 border border-slate-200/70">
              <div className="text-[11px] text-slate-500 font-medium">Chụm Lò Lúa</div>
              <div className="text-base sm:text-lg font-black text-slate-900">{summary.totalTons} <span className="text-xs font-normal text-slate-500">tấn</span></div>
              <div className="text-[11px] text-slate-500 truncate">{formatMoney(summary.totalThanhTienChumLo)}đ</div>
            </div>

            <div className="rounded-2xl bg-amber-50/70 p-3 border border-amber-200/70">
              <div className="text-[11px] text-amber-800 font-medium">Tổng Chi Lương</div>
              <div className="text-base sm:text-lg font-black text-amber-900 truncate">{formatMoney(totalTienCanChi)}đ</div>
              <div className="text-[11px] text-amber-700">Ứng: -{formatMoney(totalAdvance)}đ</div>
            </div>

            <div className="rounded-2xl bg-emerald-50/70 p-3 border border-emerald-200/70">
              <div className="text-[11px] text-emerald-800 font-bold uppercase tracking-wider">Thực Lãnh</div>
              <div className="text-base sm:text-lg font-black text-emerald-900 truncate">{formatMoney(remainMoney)}đ</div>
              <div className="text-[11px] text-emerald-700 font-medium">20 công nhân</div>
            </div>
          </div>
        )}
      </div>

      {exportError && (
        <div className="rounded-2xl border border-red-300 bg-red-50 p-4 text-sm text-red-700 shadow-xs">
          ⚠️ {exportError}
        </div>
      )}

      {/* ── Top Bar: Nạp File & Bộ Chọn Tháng ─────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
        {/* Upload Excel */}
        <div className="lg:col-span-5 rounded-2xl border border-amber-200/80 bg-white shadow-xs p-5 flex flex-col justify-between">
          <div>
            <h2 className="text-xs font-extrabold text-slate-700 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <span className="flex h-5 w-5 items-center justify-center rounded-md bg-amber-100 text-amber-800 text-[11px]">1</span>
              Nạp File Master Lúa (.xlsx)
            </h2>
            <div
              className="cursor-pointer rounded-xl border-2 border-dashed border-amber-300/80 bg-amber-50/40 px-4 py-4 text-center hover:border-amber-500 hover:bg-amber-50 transition-all"
              onClick={() => fileInputRef.current?.click()}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls"
                className="hidden"
                onChange={handleFileChange}
              />
              <span className="text-2xl mb-1 block">📂</span>
              <p className="text-xs font-bold text-slate-800">
                {isParsing ? 'Đang đọc file...' : 'Bấm để nạp file Excel hoặc kéo thả vào đây'}
              </p>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Tự động trích xuất mẻ Nhập và mẻ Xuất của Cơ Sở II (Đội Dương)
              </p>
            </div>
          </div>
          {allBatches.length > 0 && (
            <p className="mt-2 text-xs font-bold text-emerald-700">
              ✅ Đã nạp {allBatches.length} mẻ · {monthNhapRawBatches.length} mẻ nhập CS2 · {monthXuatRawBatches.length} mẻ xuất CS2
            </p>
          )}
          {parseError && (
            <p className="mt-2 text-xs font-semibold text-rose-600">⚠️ {parseError}</p>
          )}
        </div>

        {/* Chọn tháng */}
        <div className="lg:col-span-7 rounded-2xl border border-amber-200/80 bg-white shadow-xs p-5 flex flex-col justify-between">
          <div>
            <h2 className="text-xs font-extrabold text-slate-700 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <span className="flex h-5 w-5 items-center justify-center rounded-md bg-amber-100 text-amber-800 text-[11px]">2</span>
              Chọn Tháng Quyết Toán
            </h2>
            <div className="flex flex-wrap gap-2.5">
              {availableMonths.map((mk) => {
                const [mo, yr] = mk.split('/');
                const nhapCount = allBatches.filter(
                  (b) => isCoSo2(b.dryFacility) && b.dryDate && getMonthKey(b.dryDate) === mk,
                ).length;
                const xuatCount = allBatches.filter(
                  (b) => isCoSo2(b.dryFacility) && b.dischargeDate && getMonthKey(b.dischargeDate) === mk,
                ).length;

                return (
                  <button
                    key={mk}
                    onClick={() => setSelectedMonthKey(mk)}
                    className={`rounded-xl border px-4 py-2.5 text-xs font-bold transition-all cursor-pointer ${
                      selectedMonthKey === mk
                        ? 'border-amber-600 bg-amber-600 text-white shadow-md shadow-amber-200'
                        : 'border-slate-200 bg-slate-50/70 text-slate-700 hover:border-amber-400 hover:bg-amber-50'
                    }`}
                  >
                    Tháng {mo}/{yr}
                    <div className="text-[10px] font-normal opacity-90 mt-0.5">
                      {nhapCount} nhập · {xuatCount} xuất
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mt-3 flex items-center justify-between text-xs text-slate-500 pt-2 border-t border-slate-100">
            <span>Đang xem: <strong className="text-amber-800 font-bold">Tháng {selectedMonth}/{selectedYear}</strong></span>
            <span>Số ngày công tác: <strong className="text-slate-800">{workDaysCount} ngày</strong></span>
          </div>
        </div>
      </div>

      {/* ── THANH CHUYỂN ĐỔI CHỨC NĂNG (SUB-TABS) ────────────────────────── */}
      <div className="flex items-center justify-between gap-3 border-b border-slate-200 pb-2">
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setActiveTab('NHAP')}
            className={`flex items-center gap-2 rounded-2xl px-5 py-2.5 text-xs sm:text-sm font-bold transition-all cursor-pointer ${
              activeTab === 'NHAP'
                ? 'bg-amber-600 text-white shadow-xs'
                : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50'
            }`}
          >
            <span>🌾</span>
            <span>1. Nhập Sấy Lúa CS2</span>
            <span
              className={`rounded-full px-2 py-0.5 text-xs ${
                activeTab === 'NHAP' ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-700'
              }`}
            >
              {nhapBatches.length} mẻ · {summary.totalTons}t
            </span>
          </button>

          <button
            onClick={() => setActiveTab('XUAT')}
            className={`flex items-center gap-2 rounded-2xl px-5 py-2.5 text-xs sm:text-sm font-bold transition-all cursor-pointer ${
              activeTab === 'XUAT'
                ? 'bg-amber-600 text-white shadow-xs'
                : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50'
            }`}
          >
            <span>🚛</span>
            <span>2. Xuất Lúa Khô CS2</span>
            <span
              className={`rounded-full px-2 py-0.5 text-xs ${
                activeTab === 'XUAT' ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-700'
              }`}
            >
              {xuatBatches.length} mẻ · {xuatSummary.totalTons}t
            </span>
          </button>

          <button
            onClick={() => setActiveTab('CHI_LUONG')}
            className={`flex items-center gap-2 rounded-2xl px-5 py-2.5 text-xs sm:text-sm font-bold transition-all cursor-pointer ${
              activeTab === 'CHI_LUONG'
                ? 'bg-slate-800 text-white shadow-xs'
                : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50'
            }`}
          >
            <span>💰</span>
            <span>3. Quyết Toán &amp; Chi Lương (20 Công Nhân)</span>
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                activeTab === 'CHI_LUONG' ? 'bg-white/20 text-white' : 'bg-emerald-50 text-emerald-800 border border-emerald-200/60'
              }`}
            >
              {formatMoney(remainMoney)}đ
            </span>
          </button>
        </div>

        {/* Nút Xuất Excel phụ nhẹ nhàng */}
        <button
          onClick={handleExportUnifiedExcel}
          disabled={isExporting}
          className="hidden sm:inline-flex items-center gap-2 rounded-xl bg-white border border-slate-200/90 hover:bg-slate-50 px-4 py-2 text-xs font-bold text-slate-700 shadow-2xs hover:border-slate-300 cursor-pointer transition-all"
        >
          <span>📥</span>
          <span>Tải File Excel 5 Sheet</span>
        </button>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════
          SUB-TAB 1: NHẬP SẤY LÚA CS2
      ═══════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'NHAP' && (
        <div className="space-y-6 animate-in fade-in">
          {/* Cài đặt Đơn giá & Nhập trấu */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
            {/* Cột trái: Cảnh báo giá chưa có & Thống kê nhập */}
            <div className="lg:col-span-7 space-y-4">
              {unknownRiceTypes.length > 0 && (
                <div className="rounded-2xl border-2 border-orange-300 bg-orange-50/70 p-4 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-bold text-orange-950">
                      ⚠️ Phát hiện loại lúa chưa có đơn giá: <span className="underline font-black">{unknownRiceTypes.join(', ')}</span>
                    </p>
                    <p className="text-[11px] text-orange-800 mt-0.5">
                      Bấm đặt nhanh đơn giá lúa theo tiêu chuẩn công ty:
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {unknownRiceTypes.map((rt) => {
                      const defaultVal = rt.toUpperCase().includes('ST25') ? 23000 : 20000;
                      return (
                        <button
                          key={rt}
                          type="button"
                          onClick={() => handleQuickAddRicePrice(rt, defaultVal)}
                          className="rounded-xl bg-orange-600 hover:bg-orange-700 text-white px-3 py-1.5 text-xs font-bold shadow-xs cursor-pointer"
                        >
                          ⚡ Thêm {rt} ({defaultVal.toLocaleString('vi-VN')}đ)
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Bảng tổng kết nhập sấy */}
              <div className="rounded-2xl border border-amber-200/80 bg-white p-5 shadow-xs">
                <h3 className="text-xs font-extrabold text-slate-700 uppercase tracking-wider mb-3">
                  🌾 Tổng Hợp Mẻ Nhập Lúa Tháng {selectedMonth}/{selectedYear}
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
                  <div className="rounded-xl bg-amber-50/70 p-3 border border-amber-200">
                    <div className="text-[11px] text-slate-500 font-medium">Tổng Cân Nhập</div>
                    <div className="text-base font-black text-amber-900">{summary.totalKg.toLocaleString('vi-VN')} kg</div>
                  </div>
                  <div className="rounded-xl bg-amber-50/70 p-3 border border-amber-200">
                    <div className="text-[11px] text-slate-500 font-medium">Tổng Tấn Nhập</div>
                    <div className="text-base font-black text-amber-900">{summary.totalTons.toLocaleString('vi-VN')} tấn</div>
                  </div>
                  <div className="rounded-xl bg-amber-50/70 p-3 border border-amber-200">
                    <div className="text-[11px] text-slate-500 font-medium">Tiền Nhập Sấy</div>
                    <div className="text-base font-black text-emerald-700">{formatMoney(summary.totalThanhTienNhap)}đ</div>
                  </div>
                  <div className="rounded-xl bg-amber-50/70 p-3 border border-amber-200">
                    <div className="text-[11px] text-slate-500 font-medium">Tiền Chụm Lò</div>
                    <div className="text-base font-black text-orange-700">{formatMoney(summary.totalThanhTienChumLo)}đ</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Cột phải: Cài đặt giá chụm lò & bảng giá loại lúa */}
            <div className="lg:col-span-5 space-y-4">
              {/* Giá chụm lò */}
              <div className="rounded-2xl border border-orange-200 bg-white shadow-xs p-4 flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-xs font-extrabold text-slate-800">🔥 Đơn Giá Chụm Lò</h3>
                  <p className="text-[11px] text-slate-500">Áp dụng đồng loạt cho tất cả các mẻ lúa</p>
                </div>
                <div className="flex items-center gap-1.5">
                  <input
                    type="number"
                    value={chumLoPrice}
                    onChange={(e) => setChumLoPrice(parseInt(e.target.value) || 11_000)}
                    step={500}
                    className="w-24 rounded-xl border border-orange-200 bg-orange-50/50 px-2.5 py-1.5 text-xs font-black text-orange-900 text-right focus:outline-none"
                  />
                  <span className="text-xs text-slate-500 font-bold">đ/tấn</span>
                </div>
              </div>

              {/* Bảng giá loại lúa */}
              <div className="rounded-2xl border border-amber-200 bg-white shadow-xs overflow-hidden">
                <button
                  onClick={() => setShowPricePanel((v) => !v)}
                  className="w-full flex items-center justify-between px-4 py-3 bg-amber-50/60 border-b border-amber-100 hover:bg-amber-100/50 transition-colors"
                >
                  <h3 className="text-xs font-extrabold text-slate-800 flex items-center gap-2">
                    💰 Giá Lúa Theo Loại ({ricePrices.length} loại)
                  </h3>
                  <span className="text-slate-400 text-xs">{showPricePanel ? '▲' : '▼'}</span>
                </button>

                {showPricePanel && (
                  <div className="p-4 space-y-3">
                    <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                      {ricePrices.map((item) => (
                        <div key={item.riceType} className="flex items-center gap-2 group text-xs">
                          <span className="flex-1 font-semibold text-slate-700 truncate">{item.riceType}</span>
                          <input
                            type="number"
                            value={item.pricePerTon}
                            step={500}
                            onChange={(e) =>
                              handleUpdatePrice(item.riceType, parseInt(e.target.value) || 0)
                            }
                            className="w-24 rounded-lg border border-amber-200 bg-amber-50/50 px-2 py-1 text-xs font-bold text-amber-900 text-right"
                          />
                          <span className="text-slate-400">đ</span>
                          <button
                            onClick={() => handleDeleteRiceType(item.riceType)}
                            className="text-red-400 hover:text-red-600 font-bold transition-opacity"
                            title="Xóa"
                          >
                            ✕
                          </button>
                        </div>
                      ))}
                    </div>

                    {/* Thêm mới loại lúa */}
                    <div className="pt-2 border-t border-amber-100 flex items-center gap-2">
                      <input
                        type="text"
                        value={newRiceType}
                        onChange={(e) => setNewRiceType(e.target.value)}
                        placeholder="Tên loại lúa"
                        className="flex-1 rounded-lg border border-amber-200 bg-amber-50/40 px-2.5 py-1 text-xs"
                      />
                      <input
                        type="number"
                        value={newPrice}
                        onChange={(e) => setNewPrice(e.target.value)}
                        placeholder="Giá"
                        step={500}
                        className="w-24 rounded-lg border border-amber-200 bg-amber-50/40 px-2 py-1 text-xs text-right"
                      />
                      <button
                        onClick={handleAddRicePrice}
                        disabled={!newRiceType.trim() || !newPrice}
                        className="rounded-lg bg-amber-600 px-3 py-1 text-xs font-bold text-white hover:bg-amber-700 disabled:opacity-40"
                      >
                        + Thêm
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Panel Quản Lý Nhập Trấu */}
              <div className="rounded-2xl border border-yellow-200 bg-white shadow-xs overflow-hidden">
                <button
                  onClick={() => setShowTrauPanel((v) => !v)}
                  className="w-full flex items-center justify-between px-4 py-3 bg-yellow-50/60 border-b border-yellow-100 hover:bg-yellow-100/50 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <h3 className="text-xs font-extrabold text-slate-800">
                      🌾 Nhập Trấu &amp; Phụ Cấp Quản Lý
                    </h3>
                    <span className="rounded-full bg-yellow-200 text-yellow-900 text-[10px] font-black px-2 py-0.5">
                      {totalTrauTons}t = {formatMoney(totalTrauMoney)}đ
                    </span>
                  </div>
                  <span className="text-slate-400 text-xs">{showTrauPanel ? '▲' : '▼'}</span>
                </button>

                {showTrauPanel && (
                  <div className="p-4 space-y-3">
                    {/* Danh sách chuyến trấu */}
                    <div className="space-y-1.5 max-h-52 overflow-y-auto pr-1">
                      {trauItems.map((t) => {
                        const isOng5 = (t.phuongTien || '').toUpperCase().includes('ÔNG 5');
                        return (
                          <div
                            key={t.id}
                            className="flex items-center justify-between p-2 rounded-xl bg-yellow-50/50 border border-yellow-200 text-xs"
                          >
                            <div>
                              <div className="flex items-center gap-1.5">
                                <span className="font-bold text-slate-800">{t.phuongTien}</span>
                                <span
                                  className={`text-[10px] font-bold px-1.5 py-0.2 rounded ${
                                    isOng5 ? 'bg-amber-100 text-amber-800' : 'bg-teal-100 text-teal-800'
                                  }`}
                                >
                                  {isOng5 ? 'Xe Ông 5 (27.273đ)' : 'Ghe ngoài'}
                                </span>
                              </div>
                              <div className="text-[11px] text-slate-500 mt-0.5">
                                📅 {t.date} · ⚖️ <strong className="text-slate-700">{t.soLuong} tấn</strong> · Đơn giá: <strong className="text-amber-900">{formatMoney(t.donGia)}đ</strong>/tấn
                              </div>
                            </div>
                            <div className="text-right flex items-center gap-2">
                              <span className="font-extrabold text-amber-900">{formatMoney(t.thanhTien)}đ</span>
                              <button
                                type="button"
                                onClick={() => handleStartEditTrau(t)}
                                className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 text-[10px] font-bold cursor-pointer hover:bg-amber-200"
                              >
                                Sửa
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteTrauItem(t.id)}
                                className="px-1.5 py-0.5 rounded bg-rose-100 text-rose-700 text-[10px] font-bold cursor-pointer hover:bg-rose-200"
                              >
                                Xóa
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Nút chọn nhanh mẫu xe/ghe trấu */}
                    <div className="pt-2 border-t border-yellow-200 space-y-1">
                      <span className="text-[11px] font-bold text-slate-600 block">⚡ Điền nhanh chuyến trấu:</span>
                      <div className="flex flex-wrap gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleSelectTrauPreset('ÔNG 5', 11, 27273, 300000)}
                          className="px-2 py-1 rounded-lg bg-amber-100 hover:bg-amber-200 text-amber-900 text-[11px] font-bold border border-amber-300 transition-colors cursor-pointer"
                        >
                          🚐 Nửa xe Ông 5 (11t = 300k · 27.273đ)
                        </button>
                        <button
                          type="button"
                          onClick={() => handleSelectTrauPreset('ÔNG 5', 22, 27273, 600000)}
                          className="px-2 py-1 rounded-lg bg-amber-100 hover:bg-amber-200 text-amber-900 text-[11px] font-bold border border-amber-300 transition-colors cursor-pointer"
                        >
                          🚛 Nguyên xe Ông 5 (22t = 600k · 27.273đ)
                        </button>
                        <button
                          type="button"
                          onClick={() => handleSelectTrauPreset('NGUYÊN NGUYÊN 18', 20, 27000, 540000)}
                          className="px-2 py-1 rounded-lg bg-teal-100 hover:bg-teal-200 text-teal-900 text-[11px] font-bold border border-teal-300 transition-colors cursor-pointer"
                        >
                          🚤 Ghe N.Nguyên 18 (20t = 540k · 27.000đ)
                        </button>
                      </div>
                    </div>

                    {/* Form thêm / sửa chuyến trấu */}
                    <div className="pt-2 border-t border-yellow-200 space-y-2 text-xs">
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        <div>
                          <label className="text-[10px] font-bold text-slate-500 block mb-0.5">Ngày nhập:</label>
                          <input
                            type="text"
                            placeholder="dd/mm/yyyy"
                            value={newTrauDate}
                            onChange={(e) => setNewTrauDate(e.target.value)}
                            className="w-full rounded-lg border border-amber-200 px-2 py-1 text-xs"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] font-bold text-slate-500 block mb-0.5">Xe / Ghe:</label>
                          <input
                            type="text"
                            placeholder="vd: ÔNG 5"
                            value={newTrauVehicle}
                            onChange={(e) => {
                              const val = e.target.value;
                              setNewTrauVehicle(val);
                              const isO5 = val.toUpperCase().includes('ÔNG 5');
                              const p = isO5 ? 27273 : (parseInt(newTrauPrice.replace(/\D/g, ''), 10) || 27000);
                              setNewTrauPrice(String(p));
                              const tons = parseFloat(newTrauTons);
                              if (!isNaN(tons) && tons > 0) {
                                const m = computeTrauMoney(val, tons, p);
                                setNewTrauMoney(m > 0 ? String(m) : '');
                              }
                            }}
                            className="w-full rounded-lg border border-amber-200 px-2 py-1 text-xs font-bold"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] font-bold text-slate-500 block mb-0.5">Số lượng (tấn):</label>
                          <input
                            type="number"
                            step="any"
                            placeholder="vd: 11 hoặc 20"
                            value={newTrauTons}
                            onChange={(e) => handleTrauTonsChange(e.target.value)}
                            className="w-full rounded-lg border border-amber-200 px-2 py-1 text-xs font-black text-amber-800 text-right"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] font-bold text-slate-500 block mb-0.5">Đơn giá (đ/tấn):</label>
                          <input
                            type="number"
                            step={500}
                            placeholder="vd: 27273 hoặc 27000"
                            value={newTrauPrice}
                            onChange={(e) => handleTrauPriceChange(e.target.value)}
                            className="w-full rounded-lg border border-amber-200 px-2 py-1 text-xs font-bold text-slate-800 text-right"
                          />
                        </div>
                      </div>
                      <div className="flex gap-2 items-center">
                        <div className="flex-1 flex items-center gap-1.5">
                          <label className="text-[11px] font-bold text-slate-600 whitespace-nowrap">Thành tiền:</label>
                          <input
                            type="text"
                            placeholder="Thành tiền VNĐ"
                            value={newTrauMoney ? parseInt(newTrauMoney, 10).toLocaleString('vi-VN') : ''}
                            onChange={(e) => handleTrauMoneyChange(e.target.value)}
                            className="flex-1 rounded-lg border border-amber-200 bg-amber-50/50 px-2.5 py-1 text-xs font-black text-amber-900"
                          />
                          <span className="text-xs text-slate-500 font-bold">đ</span>
                        </div>
                        <button
                          type="button"
                          onClick={handleSaveTrauItem}
                          disabled={!newTrauDate || !newTrauTons}
                          className="rounded-lg bg-amber-600 px-4 py-1.5 font-bold text-xs text-white hover:bg-amber-700 disabled:opacity-40 cursor-pointer shadow-2xs"
                        >
                          {editingTrauId ? '✓ Lưu sửa' : '+ Thêm chuyến'}
                        </button>
                        {editingTrauId && (
                          <button
                            type="button"
                            onClick={handleCancelEditTrau}
                            className="rounded-lg bg-slate-200 px-3 py-1.5 font-bold text-xs text-slate-700 hover:bg-slate-300 cursor-pointer"
                          >
                            Hủy
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Bảng dữ liệu Nhập Sấy */}
          <div className="rounded-2xl border border-amber-200/80 bg-white shadow-xs overflow-hidden">
            <div className="px-5 py-4 border-b border-amber-100 flex items-center justify-between bg-amber-50/30">
              <h2 className="text-xs font-black text-slate-800 uppercase tracking-wider">
                Bảng Kê Chi Tiết Nhập Sấy Cơ Sở II — Tháng {selectedMonth}/{selectedYear} ({nhapBatches.length} mẻ)
              </h2>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="bg-gradient-to-r from-amber-600 to-orange-500 text-white">
                    <th className="px-2.5 py-3 text-center font-bold">#</th>
                    <th className="px-2.5 py-3 text-center font-bold">ĐỘI NHẬP</th>
                    <th className="px-3 py-3 text-left font-bold">KHÁCH HÀNG</th>
                    <th className="px-2.5 py-3 text-center font-bold">LOẠI LÚA</th>
                    <th className="px-2.5 py-3 text-center font-bold">PHƯƠNG TIỆN</th>
                    <th className="px-2.5 py-3 text-center font-bold">NGÀY NHẬP</th>
                    <th className="px-2.5 py-3 text-right font-bold">CÂN (KG)</th>
                    <th className="px-2.5 py-3 text-right font-black bg-amber-500/30">CÂN (TẤN)</th>
                    <th className="px-2.5 py-3 text-right font-bold">ĐƠN GIÁ NHẬP</th>
                    <th className="px-2.5 py-3 text-right font-bold">THÀNH TIỀN NHẬP</th>
                    <th className="px-2.5 py-3 text-right font-bold">CHỤM LÒ (11k)</th>
                    <th className="px-3 py-3 text-right font-black bg-orange-700/60 text-yellow-200">TỔNG CỘNG</th>
                  </tr>
                </thead>
                <tbody>
                  {nhapBatches.map((batch, idx) => (
                    <tr
                      key={batch.id}
                      className={`border-b border-amber-100/70 hover:bg-amber-50/50 transition-colors ${
                        idx % 2 === 0 ? 'bg-white' : 'bg-amber-50/20'
                      }`}
                    >
                      <td className="px-2.5 py-2.5 text-center text-slate-400 font-medium">{idx + 1}</td>
                      <td className="px-2.5 py-2.5 text-center font-bold text-amber-700">{batch.doiNhap}</td>
                      <td className="px-3 py-2.5 text-left font-semibold text-slate-800">{batch.customerName || '—'}</td>
                      <td className="px-2.5 py-2.5 text-center">
                        <span className="inline-block rounded-md px-2 py-0.5 text-[11px] font-bold bg-blue-50 text-blue-800 border border-blue-200">
                          {batch.riceType || '—'}
                        </span>
                      </td>
                      <td className="px-2.5 py-2.5 text-center text-slate-600">{batch.freshBoVehicle || '—'}</td>
                      <td className="px-2.5 py-2.5 text-center font-mono text-slate-700">{batch.dryDate}</td>
                      <td className="px-2.5 py-2.5 text-right font-mono text-slate-700">{batch.dryWeightKg.toLocaleString('vi-VN')}</td>
                      <td className="px-2.5 py-2.5 text-right font-black text-amber-800 bg-amber-50/50">{batch.roundedTons}</td>
                      <td className="px-2.5 py-2.5 text-right font-medium text-slate-700">{formatMoney(batch.pricePerTon)}đ</td>
                      <td className="px-2.5 py-2.5 text-right font-bold text-emerald-700">{formatMoney(batch.thanhTienNhap)}đ</td>
                      <td className="px-2.5 py-2.5 text-right font-bold text-orange-700">{formatMoney(batch.thanhTienChumLo)}đ</td>
                      <td className="px-3 py-2.5 text-right font-black text-red-700 bg-amber-100/40">
                        {formatMoney(batch.tongThanhTien ?? (batch.thanhTienNhap + batch.thanhTienChumLo))}đ
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-gradient-to-r from-amber-100 to-orange-100 border-t-2 border-amber-400 font-black text-xs sm:text-sm">
                    <td colSpan={6} className="px-3 py-3 text-right text-amber-950 uppercase">TỔNG CỘNG NHẬP SẤY</td>
                    <td className="px-2.5 py-3 text-right font-mono text-amber-950">{summary.totalKg.toLocaleString('vi-VN')}</td>
                    <td className="px-2.5 py-3 text-right text-amber-950 bg-amber-200/50">{summary.totalTons.toLocaleString('vi-VN')}</td>
                    <td className="px-2.5 py-3 text-right">—</td>
                    <td className="px-2.5 py-3 text-right text-emerald-900">{formatMoney(summary.totalThanhTienNhap)}đ</td>
                    <td className="px-2.5 py-3 text-right text-orange-900">{formatMoney(summary.totalThanhTienChumLo)}đ</td>
                    <td className="px-3 py-3 text-right text-red-900 bg-amber-300/50 font-black">
                      {formatMoney(summary.grandTotal)}đ
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════
          SUB-TAB 2: XUẤT LÚA KHÔ CS2
      ═══════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'XUAT' && (
        <div className="space-y-6 animate-in fade-in">
          {/* Panel Cài đặt nhanh đơn giá xuất lúa & Thao tác hàng loạt */}
          <div className="rounded-2xl border-2 border-amber-300/80 bg-gradient-to-r from-amber-50/90 via-orange-50/70 to-amber-50/90 p-4 shadow-xs">
            <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
              {/* Bên trái: 2 ô đơn giá + nút chọn nhanh */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 flex-1 w-full">
                {/* Đơn giá Có Trở */}
                <div className="bg-white rounded-xl border border-blue-200 p-3 shadow-2xs">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-black text-blue-900 flex items-center gap-1.5">
                      <span>🔄</span> ĐƠN GIÁ CÓ TRỞ:
                    </span>
                    <span className="text-[11px] font-bold text-blue-700">
                      {formatMoney(priceCoTro)} đ/tấn
                    </span>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <input
                      type="number"
                      step={1000}
                      value={priceCoTro}
                      onChange={(e) => setPriceCoTro(parseInt(e.target.value) || 0)}
                      className="w-24 rounded-lg border border-blue-300 bg-blue-50/40 px-2 py-1 text-xs font-black text-blue-900 text-right focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                    <div className="flex items-center gap-1 flex-wrap">
                      {[18000, 20000, 22000, 25000].map((p) => (
                        <button
                          key={p}
                          type="button"
                          onClick={() => setPriceCoTro(p)}
                          className={`px-2 py-0.5 rounded text-[11px] font-bold transition-all cursor-pointer ${
                            priceCoTro === p
                              ? 'bg-blue-600 text-white shadow-2xs'
                              : 'bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100'
                          }`}
                        >
                          {p / 1000}k
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Đơn giá Không Trở */}
                <div className="bg-white rounded-xl border border-teal-200 p-3 shadow-2xs">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-black text-teal-900 flex items-center gap-1.5">
                      <span>⚪</span> ĐƠN GIÁ KHÔNG TRỞ:
                    </span>
                    <span className="text-[11px] font-bold text-teal-700">
                      {formatMoney(priceKhongTro)} đ/tấn
                    </span>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <input
                      type="number"
                      step={1000}
                      value={priceKhongTro}
                      onChange={(e) => setPriceKhongTro(parseInt(e.target.value) || 0)}
                      className="w-24 rounded-lg border border-teal-300 bg-teal-50/40 px-2 py-1 text-xs font-black text-teal-900 text-right focus:outline-none focus:ring-1 focus:ring-teal-500"
                    />
                    <div className="flex items-center gap-1 flex-wrap">
                      {[14000, 15000, 16000, 18000].map((p) => (
                        <button
                          key={p}
                          type="button"
                          onClick={() => setPriceKhongTro(p)}
                          className={`px-2 py-0.5 rounded text-[11px] font-bold transition-all cursor-pointer ${
                            priceKhongTro === p
                              ? 'bg-teal-600 text-white shadow-2xs'
                              : 'bg-teal-50 text-teal-700 border border-teal-200 hover:bg-teal-100'
                          }`}
                        >
                          {p / 1000}k
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Bên phải: Nút thao tác nhanh hàng loạt */}
              <div className="flex flex-col sm:flex-row lg:flex-col gap-1.5 shrink-0 w-full lg:w-auto">
                <span className="text-[11px] font-extrabold text-slate-700 uppercase">⚡ Thao tác hàng loạt:</span>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <button
                    type="button"
                    onClick={handleSetAllCoTro}
                    className="px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-2xs cursor-pointer transition-all"
                  >
                    Tất cả Có trở
                  </button>
                  <button
                    type="button"
                    onClick={handleSetAllKhongTro}
                    className="px-3 py-1.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold shadow-2xs cursor-pointer transition-all"
                  >
                    Tất cả Không trở
                  </button>
                  <button
                    type="button"
                    onClick={handleResetTroOverrides}
                    className="px-2.5 py-1.5 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-semibold cursor-pointer transition-all"
                    title="Khôi phục trạng thái nhận diện ban đầu"
                  >
                    Khôi phục
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Thẻ thống kê xuất lúa */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="rounded-2xl border border-blue-200 bg-blue-50/60 p-4">
              <div className="text-xs text-blue-700 font-semibold">Xuất Có Trở ({formatMoney(priceCoTro)}đ/tấn)</div>
              <div className="text-xl font-black text-blue-900 mt-1">{xuatSummary.tonsCoTro} <span className="text-xs font-bold">tấn</span></div>
              <div className="text-xs font-bold text-blue-800 mt-0.5">{formatMoney(xuatSummary.moneyCoTro)}đ</div>
            </div>

            <div className="rounded-2xl border border-teal-200 bg-teal-50/60 p-4">
              <div className="text-xs text-teal-700 font-semibold">Xuất Không Trở ({formatMoney(priceKhongTro)}đ/tấn)</div>
              <div className="text-xl font-black text-teal-900 mt-1">{xuatSummary.tonsKhongTro} <span className="text-xs font-bold">tấn</span></div>
              <div className="text-xs font-bold text-teal-800 mt-0.5">{formatMoney(xuatSummary.moneyKhongTro)}đ</div>
            </div>

            <div className="rounded-2xl border border-amber-200 bg-amber-50/60 p-4">
              <div className="text-xs text-amber-700 font-semibold">Tổng Tấn Lúa Xuất</div>
              <div className="text-xl font-black text-amber-900 mt-1">{xuatSummary.totalTons} <span className="text-xs font-bold">tấn</span></div>
              <div className="text-xs text-amber-800 mt-0.5">{xuatSummary.totalKg.toLocaleString('vi-VN')} kg</div>
            </div>

            <div className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4">
              <div className="text-xs text-emerald-700 font-semibold">Tổng Tiền Xuất Lúa</div>
              <div className="text-xl font-black text-emerald-900 mt-1">{formatMoney(xuatSummary.totalMoney)}đ</div>
              <div className="text-xs text-emerald-800 mt-0.5">{xuatBatches.length} mẻ xuất trong tháng</div>
            </div>
          </div>

          {/* Bảng dữ liệu Xuất Lúa CS2 */}
          <div className="rounded-2xl border border-amber-200/80 bg-white shadow-xs overflow-hidden">
            <div className="px-5 py-4 border-b border-amber-100 flex items-center justify-between bg-amber-50/30">
              <div>
                <h2 className="text-xs font-black text-slate-800 uppercase tracking-wider">
                  Bảng Kê Chi Tiết Xuất Lúa Cơ Sở II — Tháng {selectedMonth}/{selectedYear}
                </h2>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Lọc tự động theo ngày xuống lúa khô. Bấm nút Có trở / Không trở hoặc chỉnh sửa trực tiếp đơn giá từng dòng để điền nhanh.
                </p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="bg-gradient-to-r from-amber-600 to-orange-500 text-white">
                    <th className="px-2 py-3 text-center font-bold">#</th>
                    <th className="px-2.5 py-3 text-center font-bold">NGÀY XUẤT</th>
                    <th className="px-3 py-3 text-left font-bold">KHÁCH HÀNG</th>
                    <th className="px-2.5 py-3 text-center font-bold">LOẠI LÚA</th>
                    <th className="px-3 py-3 text-left font-bold">PHƯƠNG TIỆN XUẤT</th>
                    <th className="px-2.5 py-3 text-right font-bold">CÂN (KG)</th>
                    <th className="px-2.5 py-3 text-right font-black bg-amber-500/30">CÂN (TẤN)</th>
                    <th className="px-2.5 py-3 text-center font-bold">PHÂN LOẠI TRỞ</th>
                    <th className="px-2.5 py-3 text-right font-bold">ĐƠN GIÁ</th>
                    <th className="px-3 py-3 text-right font-black bg-orange-700/60 text-yellow-200">THÀNH TIỀN</th>
                  </tr>
                </thead>
                <tbody>
                  {xuatBatches.map((batch, idx) => (
                    <tr
                      key={batch.id}
                      className={`border-b border-amber-100/70 hover:bg-amber-50/50 transition-colors ${
                        idx % 2 === 0 ? 'bg-white' : 'bg-amber-50/20'
                      }`}
                    >
                      <td className="px-2 py-2.5 text-center text-slate-400 font-medium">{idx + 1}</td>
                      <td className="px-2.5 py-2.5 text-center font-mono font-bold text-slate-800">{batch.dischargeDate}</td>
                      <td className="px-3 py-2.5 text-left font-semibold text-slate-800">{batch.customerName || '—'}</td>
                      <td className="px-2.5 py-2.5 text-center">
                        <span className="inline-block rounded-md px-2 py-0.5 text-[11px] font-bold bg-amber-50 text-amber-900 border border-amber-200">
                          {batch.riceType || '—'}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-left font-medium text-slate-700">
                        {batch.dryVehicle || batch.freshBoVehicle || '—'}
                      </td>
                      <td className="px-2.5 py-2.5 text-right font-mono text-slate-700">{batch.displayKg.toLocaleString('vi-VN')}</td>
                      <td className="px-2.5 py-2.5 text-right font-black text-amber-800 bg-amber-50/50">{batch.calculatedTons}</td>
                      <td className="px-2.5 py-2.5 text-center">
                        <button
                          type="button"
                          onClick={() => handleToggleTro(batch.id, batch.isCoTro)}
                          className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-bold transition-all cursor-pointer ${
                            batch.isCoTro
                              ? 'bg-blue-100 text-blue-800 border border-blue-300 hover:bg-blue-200'
                              : 'bg-teal-100 text-teal-800 border border-teal-300 hover:bg-teal-200'
                          }`}
                          title="Bấm để chuyển đổi nhanh Có trở / Không trở"
                        >
                          {batch.isCoTro ? `🔄 Có Trở (${formatMoney(batch.unitPrice)}đ)` : `⚪ Không Trở (${formatMoney(batch.unitPrice)}đ)`}
                        </button>
                      </td>
                      <td className="px-2.5 py-2.5 text-right font-semibold text-slate-700">
                        <div className="inline-flex items-center justify-end gap-1">
                          <input
                            type="number"
                            step={500}
                            value={batch.unitPrice}
                            onChange={(e) =>
                              handleUpdateBatchPrice(batch.id, parseInt(e.target.value) || 0)
                            }
                            className="w-20 rounded-md border border-slate-200 bg-white px-1.5 py-0.5 text-xs text-right font-bold text-slate-800 focus:outline-none focus:border-amber-400"
                          />
                          <span className="text-[11px] text-slate-400">đ</span>
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-right font-black text-emerald-800 bg-amber-100/40">
                        {formatMoney(batch.thanhTien)}đ
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-gradient-to-r from-amber-100 to-orange-100 border-t-2 border-amber-400 font-black text-xs sm:text-sm">
                    <td colSpan={5} className="px-3 py-3 text-right text-amber-950 uppercase">TỔNG CỘNG XUẤT LÚA</td>
                    <td className="px-2.5 py-3 text-right font-mono text-amber-950">{xuatSummary.totalKg.toLocaleString('vi-VN')}</td>
                    <td className="px-2.5 py-3 text-right text-amber-950 bg-amber-200/50">{xuatSummary.totalTons.toLocaleString('vi-VN')}</td>
                    <td className="px-2.5 py-3 text-center text-slate-600 text-xs font-semibold">
                      {xuatSummary.tonsCoTro}t có trở · {xuatSummary.tonsKhongTro}t ko trở
                    </td>
                    <td className="px-2.5 py-3 text-right">—</td>
                    <td className="px-3 py-3 text-right text-emerald-900 bg-amber-300/50 font-black">
                      {formatMoney(xuatSummary.totalMoney)}đ
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════
          SUB-TAB 3: BẢNG KÊ QUYẾT TOÁN & PHÂN BỔ LƯƠNG 20 CÔNG NHÂN
      ═══════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'CHI_LUONG' && (
        <div className="space-y-8 animate-in fade-in">
          {/* 1. BẢNG KÊ QUYẾT TOÁN 10 MỤC (HÀNG 30-49 KHỚP SHEET CL) */}
          <div className="rounded-2xl border border-slate-200 bg-white shadow-xs overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 bg-slate-50 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-2">
                  <span>📊</span>
                  Bảng Kê Quyết Toán Chi Lương Đội Dương (Nhập + Xuất) Cơ Sở 2 — Tháng {selectedMonth}/{selectedYear}
                </h2>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Khớp hoàn toàn công thức 10 mục của sheet quyết toán <code>CL ĐỘI DƯƠNG-CS2</code>
                </p>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-600">Lương quản lý:</span>
                <input
                  type="number"
                  step={500000}
                  value={managementSalary}
                  onChange={(e) => setManagementSalary(parseInt(e.target.value) || 0)}
                  className="w-28 rounded-xl border border-slate-300 bg-white px-2.5 py-1 text-xs font-bold text-slate-800 text-right"
                />
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-100 border-b border-slate-300 text-slate-700">
                    <th className="px-4 py-2.5 text-left font-bold w-1/3">HẠNG MỤC / CÔNG VIỆC</th>
                    <th className="px-4 py-2.5 text-center font-bold">SỐ LƯỢNG (TẤN)</th>
                    <th className="px-4 py-2.5 text-right font-bold">ĐƠN GIÁ</th>
                    <th className="px-4 py-2.5 text-right font-black">THÀNH TIỀN (VNĐ)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {/* Mục 1: Nhập phổ thông */}
                  <tr className="hover:bg-slate-50">
                    <td className="px-4 py-2 font-medium text-slate-800">1. Nhập lúa OM18, Thơm Lài, Japo, DS1</td>
                    <td className="px-4 py-2 text-center font-bold text-slate-700">{nhapClassification.tonsPhothong}</td>
                    <td className="px-4 py-2 text-right text-slate-600">20.000đ</td>
                    <td className="px-4 py-2 text-right font-bold text-slate-900">{formatMoney(nhapClassification.moneyPhothong)}đ</td>
                  </tr>

                  {/* Mục 2: Nhập ST25 */}
                  <tr className="hover:bg-slate-50">
                    <td className="px-4 py-2 font-medium text-slate-800">2. Nhập lúa ST25 ĐL, ST25 KDM</td>
                    <td className="px-4 py-2 text-center font-bold text-slate-700">{nhapClassification.tonsST25}</td>
                    <td className="px-4 py-2 text-right text-slate-600">23.000đ</td>
                    <td className="px-4 py-2 text-right font-bold text-slate-900">{formatMoney(nhapClassification.moneyST25)}đ</td>
                  </tr>

                  {/* Mục 3: Nhập trấu Ông 5 */}
                  <tr className="hover:bg-slate-50">
                    <td className="px-4 py-2 font-medium text-slate-800">3. Nhập trấu ghe Ông 5</td>
                    <td className="px-4 py-2 text-center font-bold text-slate-700">{tonsTrauOng5}</td>
                    <td className="px-4 py-2 text-right text-slate-600">27.273đ</td>
                    <td className="px-4 py-2 text-right font-bold text-slate-900">{formatMoney(moneyTrauOng5)}đ</td>
                  </tr>

                  {/* Mục 4: Nhập trấu ngoài */}
                  <tr className="hover:bg-slate-50">
                    <td className="px-4 py-2 font-medium text-slate-800">4. Nhập trấu ghe ngoài</td>
                    <td className="px-4 py-2 text-center font-bold text-slate-700">{tonsTrauNgoai}</td>
                    <td className="px-4 py-2 text-right text-slate-600">27.000đ</td>
                    <td className="px-4 py-2 text-right font-bold text-slate-900">{formatMoney(moneyTrauNgoai)}đ</td>
                  </tr>

                  {/* Mục 5: Xuất có trở */}
                  <tr className="hover:bg-slate-50">
                    <td className="px-4 py-2 font-medium text-slate-800">5. Xuất lúa có trở</td>
                    <td className="px-4 py-2 text-center font-bold text-slate-700">{xuatSummary.tonsCoTro}</td>
                    <td className="px-4 py-2 text-right text-slate-600">{formatMoney(priceCoTro)}đ</td>
                    <td className="px-4 py-2 text-right font-bold text-slate-900">{formatMoney(xuatSummary.moneyCoTro)}đ</td>
                  </tr>

                  {/* Mục 6: Xuất không trở */}
                  <tr className="hover:bg-slate-50">
                    <td className="px-4 py-2 font-medium text-slate-800">6. Xuất lúa không trở</td>
                    <td className="px-4 py-2 text-center font-bold text-slate-700">{xuatSummary.tonsKhongTro}</td>
                    <td className="px-4 py-2 text-right text-slate-600">{formatMoney(priceKhongTro)}đ</td>
                    <td className="px-4 py-2 text-right font-bold text-slate-900">{formatMoney(xuatSummary.moneyKhongTro)}đ</td>
                  </tr>

                  {/* Subtotal Nhập + Xuất */}
                  <tr className="bg-amber-50/80 font-black border-y border-amber-200">
                    <td className="px-4 py-2 text-amber-950 uppercase">TỔNG CỘNG NHẬP + XUẤT</td>
                    <td className="px-4 py-2 text-center text-amber-950">{summary.totalTons + xuatSummary.totalTons}</td>
                    <td className="px-4 py-2 text-right text-amber-950">—</td>
                    <td className="px-4 py-2 text-right text-amber-950 text-sm">{formatMoney(totalNhapVaXuatMoney)}đ</td>
                  </tr>

                  {/* Mục 7: Chụm lò */}
                  <tr className="hover:bg-slate-50">
                    <td className="px-4 py-2 font-medium text-slate-800">7. Chụm lò lúa</td>
                    <td className="px-4 py-2 text-center font-bold text-slate-700">{summary.totalTons}</td>
                    <td className="px-4 py-2 text-right text-slate-600">{formatMoney(chumLoPrice)}đ</td>
                    <td className="px-4 py-2 text-right font-bold text-orange-800">{formatMoney(summary.totalThanhTienChumLo)}đ</td>
                  </tr>

                  {/* Mục 8: Lương quản lý */}
                  <tr className="hover:bg-slate-50">
                    <td className="px-4 py-2 font-medium text-slate-800">8. Lương quản lý (Lê Văn Dương)</td>
                    <td className="px-4 py-2 text-center text-slate-400">—</td>
                    <td className="px-4 py-2 text-right text-slate-400">—</td>
                    <td className="px-4 py-2 text-right font-bold text-slate-900">{formatMoney(managementSalary)}đ</td>
                  </tr>

                  {/* Mục 9: Nước đá */}
                  <tr className="hover:bg-slate-50">
                    <td className="px-4 py-2 font-medium text-slate-800">9. Nước đá ({workDaysCount} ngày × 10.000đ/ngày)</td>
                    <td className="px-4 py-2 text-center font-bold text-slate-700">{workDaysCount} ngày</td>
                    <td className="px-4 py-2 text-right text-slate-600">10.000đ</td>
                    <td className="px-4 py-2 text-right font-bold text-slate-900">{formatMoney(totalTienNuocDa)}đ</td>
                  </tr>

                  {/* TỔNG TIỀN CẦN CHI */}
                  <tr className="bg-gradient-to-r from-amber-100 to-orange-100 font-black text-sm border-t-2 border-amber-400">
                    <td className="px-4 py-3 text-amber-950 uppercase">TỔNG TIỀN CẦN CHI (LƯƠNG ĐỘI)</td>
                    <td colSpan={2} className="px-4 py-3 text-center text-xs text-amber-800">
                      (Nhập + Xuất + Trấu + Chụm lò + Quản lý + Nước đá)
                    </td>
                    <td className="px-4 py-3 text-right text-amber-950 text-base">{formatMoney(totalTienCanChi)}đ</td>
                  </tr>

                  {/* TRỪ TẠM ỨNG */}
                  <tr className="bg-rose-50/70 font-black text-sm border-t border-rose-200">
                    <td className="px-4 py-2.5 text-rose-900 uppercase">TRỪ TẠM ỨNG</td>
                    <td colSpan={2} className="px-4 py-2.5 text-center text-xs text-rose-700">
                      (Tổng tiền 20 công nhân đã ứng trước)
                    </td>
                    <td className="px-4 py-2.5 text-right text-rose-900">-{formatMoney(totalAdvance)}đ</td>
                  </tr>

                  {/* CÒN LẠI THỰC LÃNH */}
                  <tr className="bg-emerald-100/80 font-black text-base border-t-2 border-emerald-400">
                    <td className="px-4 py-3.5 text-emerald-950 uppercase tracking-wide">CÒN LẠI (THỰC LÃNH)</td>
                    <td colSpan={2} className="px-4 py-3.5 text-center text-xs text-emerald-800 font-bold">
                      Chuyển khoản thanh toán đợt cuối cho Đội Dương
                    </td>
                    <td className="px-4 py-3.5 text-right text-emerald-900 text-lg font-black">{formatMoney(remainMoney)}đ</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* 2. BẢNG PHÂN BỔ CHI TIẾT 20 CÔNG NHÂN (SHEET 4 & SHEET 5) */}
          <div className="rounded-2xl border border-slate-200 bg-white shadow-xs overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 bg-slate-50 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-2">
                  <span>👥</span>
                  Danh Sách Chi Lương &amp; Tạm Ứng 20 Công Nhân Đội Dương — Tháng {selectedMonth}/{selectedYear}
                </h2>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Đồng bộ chuẩn xác theo Sheet 4 (Ứng lương) và Sheet 5 (Chi lương). Hỗ trợ chỉnh sửa trực tiếp từng công nhân.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleAutoAllocateSalaries}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white px-3 py-1.5 text-xs font-bold shadow-xs cursor-pointer transition-all"
                  title="Tự động chia đều theo tỷ lệ mẫu thực tế"
                >
                  <span>⚡</span>
                  <span>Tự động phân bổ lại theo tổng chi</span>
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-100 border-b border-slate-300 text-slate-700">
                    <th className="px-2 py-3 text-center font-bold">STT</th>
                    <th className="px-3 py-3 text-left font-bold">HỌ VÀ TÊN</th>
                    <th className="px-3 py-3 text-left font-bold">SỐ TÀI KHOẢN</th>
                    <th className="px-3 py-3 text-left font-bold">NGÂN HÀNG</th>
                    <th className="px-3 py-3 text-left font-bold">CHỦ TÀI KHOẢN</th>
                    <th className="px-3 py-3 text-right font-black">LƯƠNG THÁNG</th>
                    <th className="px-3 py-3 text-right font-black text-rose-700">TẠM ỨNG</th>
                    <th className="px-3 py-3 text-right font-black text-emerald-800 bg-emerald-50">THỰC LÃNH</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {DOI_DUONG_WORKERS.map((worker) => {
                    const salary = workerSalaries[worker.name] ?? 0;
                    const advance = workerAdvances[worker.name] ?? 0;
                    const netSalary = salary - advance;

                    return (
                      <tr key={worker.stt} className="hover:bg-slate-50 transition-colors">
                        <td className="px-2 py-2 text-center text-slate-400 font-bold">{worker.stt}</td>
                        <td className="px-3 py-2 font-bold text-slate-800">{worker.name}</td>
                        <td className="px-3 py-2 font-mono text-slate-600">{worker.stk}</td>
                        <td className="px-3 py-2 text-slate-600">{worker.bank}</td>
                        <td className="px-3 py-2 text-slate-600">{worker.accountHolder}</td>
                        <td className="px-3 py-2 text-right">
                          <input
                            type="number"
                            step={1000}
                            value={salary}
                            onChange={(e) =>
                              handleUpdateWorkerSalary(worker.name, parseInt(e.target.value) || 0)
                            }
                            className="w-24 rounded-lg border border-slate-200 px-2 py-1 text-right text-xs font-bold text-slate-900 focus:outline-none focus:border-amber-500"
                          />
                        </td>
                        <td className="px-3 py-2 text-right">
                          <input
                            type="number"
                            step={100000}
                            value={advance}
                            onChange={(e) =>
                              handleUpdateWorkerAdvance(worker.name, parseInt(e.target.value) || 0)
                            }
                            className="w-24 rounded-lg border border-rose-200 bg-rose-50/40 px-2 py-1 text-right text-xs font-bold text-rose-700 focus:outline-none focus:border-rose-400"
                          />
                        </td>
                        <td className="px-3 py-2 text-right font-black text-emerald-800 bg-emerald-50/60">
                          {formatMoney(netSalary)}đ
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="bg-slate-200 border-t-2 border-slate-400 font-black text-xs sm:text-sm">
                    <td colSpan={5} className="px-4 py-3 text-right uppercase text-slate-800">TỔNG CỘNG 20 CÔNG NHÂN</td>
                    <td className="px-3 py-3 text-right text-slate-900">{formatMoney(currentTotalAllocatedSalary)}đ</td>
                    <td className="px-3 py-3 text-right text-rose-900">-{formatMoney(totalAdvance)}đ</td>
                    <td className="px-3 py-3 text-right text-emerald-900 bg-emerald-200/50 font-black">
                      {formatMoney(currentTotalAllocatedSalary - totalAdvance)}đ
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
