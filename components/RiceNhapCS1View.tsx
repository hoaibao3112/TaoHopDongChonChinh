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

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  const [workerTab, setWorkerTab] = useState<CS1TeamKey>('NGHỊ');

  useEffect(() => {
    if (viewMode === 'NGHỊ' || viewMode === 'NGUYÊN') {
      setWorkerTab(viewMode);
    }
  }, [viewMode]);

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
  const [newTrauQty, setNewTrauQty] = useState('');
  const [newTrauPrice, setNewTrauPrice] = useState('27273');
  const [newTrauMoney, setNewTrauMoney] = useState('');
  const [editingTrauId, setEditingTrauId] = useState<string | null>(null);

  const computeTrauMoney = (vehicle: string, tonsNum: number, priceNum: number): number => {
    if (isNaN(tonsNum) || tonsNum <= 0) return 0;
    const isOng5 = (vehicle || '').toUpperCase().includes('ÔNG 5');
    if (isOng5) {
      if (Math.abs(tonsNum - 11) < 0.01) return 300000;
      if (Math.abs(tonsNum - 22) < 0.01) return 600000;
      return Math.round((tonsNum * (priceNum || 27273)) / 1000) * 1000;
    }
    return Math.round((tonsNum * (priceNum || 27000)) / 1000) * 1000;
  };

  const handleTrauTonsChange = (val: string) => {
    setNewTrauQty(val);
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
    const tons = parseFloat(newTrauQty);
    if (!isNaN(tons) && tons > 0 && price > 0) {
      const money = Math.round((tons * price) / 1000) * 1000;
      setNewTrauMoney(money > 0 ? String(money) : '');
    }
  };

  const handleSelectTrauPreset = (vehicle: string, tons: number, price: number, money: number) => {
    setNewTrauVehicle(vehicle);
    setNewTrauQty(String(tons));
    setNewTrauPrice(String(price));
    setNewTrauMoney(String(money));
  };

  const handleStartEditTrau = (item: NhapTrauItem) => {
    setEditingTrauId(item.id);
    setNewTrauDate(item.date);
    setNewTrauVehicle(item.phuongTien);
    setNewTrauQty(String(item.soLuong));
    const isOng5 = (item.phuongTien || '').toUpperCase().includes('ÔNG 5');
    const defaultDonGia = isOng5 ? 27273 : (item.donGia || 27000);
    setNewTrauPrice(String(defaultDonGia));
    setNewTrauMoney(String(item.thanhTien));
  };

  const handleCancelEditTrau = () => {
    setEditingTrauId(null);
    setNewTrauDate('');
    setNewTrauVehicle('ÔNG 5');
    setNewTrauQty('');
    setNewTrauPrice('27273');
    setNewTrauMoney('');
  };

  const handleSaveTrauItem = () => {
    const tons = parseFloat(newTrauQty);
    const vehicle = newTrauVehicle.trim().toUpperCase() || 'ÔNG 5';
    const isOng5 = vehicle.includes('ÔNG 5');
    const price = parseInt(newTrauPrice.replace(/\D/g, ''), 10) || (isOng5 ? 27273 : 27000);
    const manualMoney = parseInt(newTrauMoney.replace(/\D/g, ''), 10);
    if (!newTrauDate.trim() || isNaN(tons) || tons <= 0) return;

    const thanhTien =
      !isNaN(manualMoney) && manualMoney > 0
        ? manualMoney
        : computeTrauMoney(vehicle, tons, price);

    const calculatedPrice = isOng5
      ? 27273
      : (price > 0 ? price : (tons > 0 ? Math.round(thanhTien / tons) : 27000));

    const setter = workerTab === 'NGUYÊN' ? setTrauNguyen : setTrauNghi;

    if (editingTrauId) {
      setter((prev) =>
        prev.map((t) =>
          t.id === editingTrauId
            ? {
                ...t,
                date: newTrauDate.trim(),
                phuongTien: vehicle,
                soLuong: tons,
                donGia: calculatedPrice,
                thanhTien,
              }
            : t
        )
      );
      setEditingTrauId(null);
    } else {
      const newItem: NhapTrauItem = {
        id: `trau-${Date.now()}`,
        date: newTrauDate.trim(),
        doiNhap: workerTab,
        phuongTien: vehicle,
        soLuong: tons,
        donGia: calculatedPrice,
        thanhTien,
      };
      setter((prev) => [...prev, newItem]);
    }
    setNewTrauDate('');
    setNewTrauQty('');
    setNewTrauMoney('');
  };

  // ── State: Nước đá thủ công (nếu muốn chỉnh) ────────────────────────────
  const [waterDaysCustom, setWaterDaysCustom] = useState<{ NGHI?: number; NGUYEN?: number }>({});

  // ── State: Mẻ thêm thủ công / Tách mẻ sấy dở dang ───────────────────────
  const [manualBatches, setManualBatches] = useState<CS1Batch[]>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('cs1_manual_batches');
        if (saved) return JSON.parse(saved);
      } catch {}
    }
    return [];
  });

  const saveManualBatches = useCallback((updater: (prev: CS1Batch[]) => CS1Batch[]) => {
    setManualBatches((prev) => {
      const next = updater(prev);
      try {
        localStorage.setItem('cs1_manual_batches', JSON.stringify(next));
      } catch {}
      return next;
    });
  }, []);

  // ── State: Modal Tách Mẻ / Thêm Thông Tin Mẻ Sấy ────────────────────────
  const [splitModal, setSplitModal] = useState<{
    isOpen: boolean;
    mode: 'SPLIT' | 'ADD_NEW';
    sourceBatch?: CS1Batch;
    date: string;
    team: CS1TeamKey;
    customerName: string;
    riceType: string;
    vehicleName: string;
    tons: string;
    kg: string;
    pricePerTon: string;
    note: string;
    autoDeductOrigin: boolean;
  }>({
    isOpen: false,
    mode: 'SPLIT',
    date: '',
    team: 'NGUYÊN',
    customerName: '',
    riceType: 'L5451',
    vehicleName: '',
    tons: '',
    kg: '',
    pricePerTon: '20000',
    note: '',
    autoDeductOrigin: true,
  });

  // ── State: Sổ tay ghi chú nhanh CS1 (Góc dưới cùng bên phải) ───────────────
  const [quickNoteOpen, setQuickNoteOpen] = useState(false);
  const [quickNoteText, setQuickNoteText] = useState('');
  const [quickNoteSavedAt, setQuickNoteSavedAt] = useState<string>('');
  const [quickNoteSyncing, setQuickNoteSyncing] = useState<boolean>(false);
  const quickNoteTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Tải ghi chú CS1 từ Cloud (Upstash Redis)
  const fetchCloudNoteCS1 = useCallback(async () => {
    try {
      const res = await fetch('/api/quick-notes?scope=cs1', { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        if (data.text !== undefined && data.text !== null) {
          setQuickNoteText(data.text);
          if (data.updatedAt) setQuickNoteSavedAt(data.updatedAt);
          try {
            localStorage.setItem('cs1_quick_notes', data.text);
            if (data.updatedAt) localStorage.setItem('cs1_quick_notes_time', data.updatedAt);
          } catch {}
        }
      }
    } catch (e) {
      console.warn('Lỗi đọc ghi chú CS1 từ Cloud:', e);
    }
  }, []);

  // Đọc ghi chú từ cache localStorage trước, sau đó đồng bộ ngay từ Cloud
  useEffect(() => {
    try {
      const savedNote = localStorage.getItem('cs1_quick_notes');
      if (savedNote !== null) setQuickNoteText(savedNote);
      const savedTime = localStorage.getItem('cs1_quick_notes_time');
      if (savedTime) setQuickNoteSavedAt(savedTime);
    } catch {}

    fetchCloudNoteCS1();

    // Tự động tải lại khi quay lại tab trình duyệt
    const onFocus = () => fetchCloudNoteCS1();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [fetchCloudNoteCS1]);

  const handleUpdateQuickNote = (text: string) => {
    setQuickNoteText(text);
    setQuickNoteSyncing(true);

    try {
      localStorage.setItem('cs1_quick_notes', text);
    } catch {}

    if (quickNoteTimerRef.current) {
      clearTimeout(quickNoteTimerRef.current);
    }

    quickNoteTimerRef.current = setTimeout(async () => {
      try {
        const res = await fetch('/api/quick-notes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ scope: 'cs1', text }),
        });
        if (res.ok) {
          const data = await res.json();
          if (data.updatedAt) {
            setQuickNoteSavedAt(data.updatedAt);
            try {
              localStorage.setItem('cs1_quick_notes_time', data.updatedAt);
            } catch {}
          }
        }
      } catch (e) {
        console.error('Lỗi đồng bộ ghi chú CS1 lên Cloud:', e);
      } finally {
        setQuickNoteSyncing(false);
      }
    }, 700);
  };

  // ── State: Xuất Excel ───────────────────────────────────────────────────
  const [isExporting, setIsExporting] = useState(false);
  const [exportStatusText, setExportStatusText] = useState<string>('');
  const [exportError, setExportError] = useState<string | null>(null);

  // Đọc bảng giá đã lưu từ localStorage khi mở trang
  useEffect(() => {
    try {
      const saved = localStorage.getItem('cs1_rice_prices');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setRicePrices(parsed);
        }
      }
    } catch (e) {
      console.warn('Lỗi đọc bảng giá lúa từ localStorage:', e);
    }
  }, []);

  // ─── Xử lý Bảng Giá Loại Lúa ──────────────────────────────────────────
  const handleUpdateRicePrice = (riceType: string, price: number) => {
    setRicePrices((prev) => {
      const next = prev.map((p) => (p.riceType === riceType ? { ...p, pricePerTon: price } : p));
      try {
        localStorage.setItem('cs1_rice_prices', JSON.stringify(next));
      } catch {}
      return next;
    });
  };

  const handleAddRicePrice = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const cleanType = newRiceType.trim().toUpperCase();
    const price = parseFloat(newRicePrice) || 20000;
    if (!cleanType) return;

    setRicePrices((prev) => {
      const exists = prev.some((p) => p.riceType.toUpperCase() === cleanType);
      let next: RiceTypePrice[];
      if (exists) {
        next = prev.map((p) => (p.riceType.toUpperCase() === cleanType ? { ...p, pricePerTon: price } : p));
      } else {
        next = [...prev, { riceType: cleanType, pricePerTon: price }];
      }
      try {
        localStorage.setItem('cs1_rice_prices', JSON.stringify(next));
      } catch {}
      return next;
    });
    setNewRiceType('');
    setNewRicePrice('20000');
  };

  const handleRemoveRicePrice = (riceType: string) => {
    setRicePrices((prev) => {
      const next = prev.filter((p) => p.riceType !== riceType);
      try {
        localStorage.setItem('cs1_rice_prices', JSON.stringify(next));
      } catch {}
      return next;
    });
  };

  const handleResetRicePrices = () => {
    if (confirm('Khôi phục toàn bộ bảng giá các loại lúa về cấu hình mặc định?')) {
      setRicePrices(DEFAULT_CS1_RICE_PRICES);
      try {
        localStorage.removeItem('cs1_rice_prices');
      } catch {}
    }
  };

  // ─── Lấy giá cho loại lúa ────────────────────────────────────────────────
  const getPriceForRice = useCallback(
    (riceType: string): number => {
      const rt = (riceType || '').toUpperCase().trim();
      if (!rt) return 20_000;
      const found = ricePrices.find((p) => p.riceType.toUpperCase().trim() === rt);
      if (found) return found.pricePerTon;
      const partial = ricePrices.find((p) => {
        const conf = p.riceType.toUpperCase().trim();
        return conf && (rt.includes(conf) || conf.includes(rt));
      });
      if (partial) return partial.pricePerTon;
      if (rt.includes('ST25') || rt.includes('HP1')) return 23_000;
      return 20_000;
    },
    [ricePrices]
  );

  // ─── Danh sách các tháng có mẻ sấy Cơ Sở I ──────────────────────────────
  const cs1MonthKeys = useMemo(() => {
    const cs1Batches = allBatches.filter((b) => isCoSo1(b.dryFacility) && b.dryDate);
    const dates = [
      ...cs1Batches.map((b) => b.dryDate),
      ...manualBatches.map((b) => b.dryDate),
    ];
    return getSortedMonthKeysFromDates(dates);
  }, [allBatches, manualBatches]);

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

    const fromMaster = allBatches
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
          isManual: false,
        };
      });

    const fromManual = manualBatches
      .filter((b) => b.dryDate && getMonthKeyFromDate(b.dryDate) === selectedMonthKey)
      .map((b, idx) => {
        const tons = customTonsMap[b.id] !== undefined ? customTonsMap[b.id] : b.roundedTons;
        const team = teamAssignmentMap[b.id] || b.doiNhap;
        const price = b.pricePerTon || getPriceForRice(b.riceType);
        const thanhTien = tons * price;
        return {
          ...b,
          contractNo: b.contractNo || `+${idx + 1}`,
          doiNhap: team,
          roundedTons: tons,
          pricePerTon: price,
          thanhTien,
          isManual: true,
        };
      });

    const parseDateKey = (dateStr?: string) => {
      if (!dateStr) return 0;
      const parts = dateStr.trim().split('/');
      if (parts.length >= 3) {
        const d = parseInt(parts[0], 10) || 0;
        const m = parseInt(parts[1], 10) || 0;
        let y = parseInt(parts[2], 10) || 0;
        if (y < 100) y += 2000;
        return y * 10000 + m * 100 + d;
      }
      return 0;
    };

    return [...fromMaster, ...fromManual].sort((a, b) => {
      const kA = parseDateKey(a.dryDate || a.weighDate);
      const kB = parseDateKey(b.dryDate || b.weighDate);
      return kA - kB;
    });
  }, [allBatches, selectedMonthKey, customTonsMap, getPriceForRice, teamAssignmentMap, manualBatches]);

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

  // ─── Xử lý Tách Mẻ / Thêm Thông Tin Mẻ Sấy Dở Dang ───────────────────────
  // 1. Mở modal khi bấm dấu + ở trước Ngày Nhập Sấy của 1 mẻ cụ thể
  const handleOpenSplitModal = (batch: CS1Batch) => {
    const otherTeam: CS1TeamKey = batch.doiNhap === 'NGHỊ' ? 'NGUYÊN' : 'NGHỊ';
    const price = batch.pricePerTon || getPriceForRice(batch.riceType);
    const teamLabel = otherTeam === 'NGHỊ' ? 'Đội Nghị' : 'Đội Nguyên';
    setSplitModal({
      isOpen: true,
      mode: 'SPLIT',
      sourceBatch: batch,
      date: batch.dryDate || '',
      team: otherTeam,
      customerName: batch.customerName || '',
      riceType: batch.riceType || '',
      vehicleName: batch.vehicleName || batch.freshBoVehicle || '',
      tons: '',
      kg: '',
      pricePerTon: String(price),
      note: `Làm tiếp mẻ ${batch.customerName || ''} (${batch.roundedTons}t) ngày ${batch.dryDate || ''} cho ${teamLabel}`,
      autoDeductOrigin: true,
    });
  };

  // 2. Mở modal khi bấm dấu + ở Header nhóm ngày
  const handleOpenAddDayModal = (dateStr: string) => {
    setSplitModal({
      isOpen: true,
      mode: 'ADD_NEW',
      sourceBatch: undefined,
      date: dateStr,
      team: 'NGHỊ',
      customerName: '',
      riceType: 'L5451',
      vehicleName: '',
      tons: '',
      kg: '',
      pricePerTon: '20000',
      note: `Nhập sấy phát sinh ngày ${dateStr} - Đội Nghị`,
      autoDeductOrigin: false,
    });
  };

  // 2b. Chuyển đổi đội trong modal và tự động cập nhật lại câu ghi chú nếu đang dùng ghi chú mặc định
  const handleSelectTeamInModal = (newTeam: CS1TeamKey) => {
    setSplitModal((prev) => {
      let nextNote = prev.note;
      const teamLabel = newTeam === 'NGHỊ' ? 'Đội Nghị' : 'Đội Nguyên';
      const prevTeamLabel = newTeam === 'NGHỊ' ? 'Đội Nguyên' : 'Đội Nghị';

      if (!nextNote.trim() || nextNote.includes(prevTeamLabel)) {
        if (prev.mode === 'SPLIT' && prev.sourceBatch) {
          nextNote = `Làm tiếp mẻ ${prev.sourceBatch.customerName || ''} (${prev.sourceBatch.roundedTons}t) ngày ${prev.sourceBatch.dryDate || ''} cho ${teamLabel}`;
        } else {
          nextNote = `Nhập sấy phát sinh ngày ${prev.date} - ${teamLabel}`;
        }
      }

      return {
        ...prev,
        team: newTeam,
        note: nextNote,
      };
    });
  };

  // 3. Xác nhận thêm / tách mẻ từ modal
  const handleSubmitSplitModal = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const tonsNum = parseFloat(splitModal.tons.replace(/[^\d.]/g, '')) || 0;
    if (!splitModal.date.trim()) {
      alert('Vui lòng nhập Ngày nhập sấy!');
      return;
    }
    if (tonsNum <= 0) {
      alert('Vui lòng nhập Số tấn lớn hơn 0!');
      return;
    }
    const priceNum = parseInt(splitModal.pricePerTon.replace(/\D/g, ''), 10) || 20000;
    const kgNum = parseInt(splitModal.kg.replace(/\D/g, ''), 10) || Math.round(tonsNum * 1000);

    if (splitModal.mode === 'SPLIT' && splitModal.sourceBatch) {
      const src = splitModal.sourceBatch;
      const originTons = src.roundedTons;

      // Nếu tick tự động trừ mẻ gốc
      if (splitModal.autoDeductOrigin) {
        const remainingTons = Math.max(0, originTons - tonsNum);
        setCustomTonsMap((prev) => ({
          ...prev,
          [src.id]: remainingTons,
        }));
      }

      const newBatchId = `split-${src.id}-${Date.now()}`;
      const newBatch: CS1Batch = {
        id: newBatchId,
        contractNo: `${src.contractNo || '00'}+`,
        weighDate: src.weighDate,
        doiNhap: splitModal.team,
        customerName: splitModal.customerName.trim() || src.customerName,
        vehicleName: splitModal.vehicleName.trim() || src.vehicleName,
        riceType: splitModal.riceType.trim() || src.riceType,
        freshWeightKg: 0,
        dryDate: splitModal.date.trim(),
        dryFacility: 'CƠ SỞ I',
        dryWeightKg: kgNum,
        roundedTons: tonsNum,
        pricePerTon: priceNum,
        thanhTien: tonsNum * priceNum,
        isManual: true,
        splitFromId: src.id,
        originalTonsBeforeSplit: originTons,
        note: splitModal.note.trim() || 'Tách mẻ làm tiếp',
      };

      saveManualBatches((prev) => [...prev, newBatch]);
    } else {
      const newBatchId = `manual-cs1-${Date.now()}`;
      const newBatch: CS1Batch = {
        id: newBatchId,
        contractNo: `+${manualBatches.length + 1}`,
        weighDate: splitModal.date.trim(),
        doiNhap: splitModal.team,
        customerName: splitModal.customerName.trim() || 'Khách thêm ngoài',
        vehicleName: splitModal.vehicleName.trim(),
        riceType: splitModal.riceType.trim() || 'L5451',
        freshWeightKg: 0,
        dryDate: splitModal.date.trim(),
        dryFacility: 'CƠ SỞ I',
        dryWeightKg: kgNum,
        roundedTons: tonsNum,
        pricePerTon: priceNum,
        thanhTien: tonsNum * priceNum,
        isManual: true,
        note: splitModal.note.trim(),
      };

      saveManualBatches((prev) => [...prev, newBatch]);
    }

    setSplitModal((prev) => ({ ...prev, isOpen: false }));
  };

  // 4. Xóa mẻ thủ công
  const handleDeleteManualBatch = (batch: CS1Batch) => {
    if (!window.confirm(`Bạn có chắc muốn xóa dòng mẻ "${batch.customerName}" (${batch.roundedTons} tấn) không?`)) return;

    // Nếu mẻ này được tách từ mẻ gốc, hỏi hoàn trả tấn
    if (batch.splitFromId && batch.originalTonsBeforeSplit !== undefined) {
      if (window.confirm(`Mẻ này được tách từ mẻ gốc. Bạn có muốn hoàn trả lại ${batch.roundedTons} tấn cho mẻ gốc không?`)) {
        setCustomTonsMap((prev) => {
          const currentSrcTons = prev[batch.splitFromId!] !== undefined
            ? prev[batch.splitFromId!]
            : (allBatches.find((b) => b.id === batch.splitFromId)?.dryWeightKg
                ? roundRiceTons(allBatches.find((b) => b.id === batch.splitFromId)!.dryWeightKg)
                : 0);
          return {
            ...prev,
            [batch.splitFromId!]: currentSrcTons + batch.roundedTons,
          };
        });
      }
    }

    saveManualBatches((prev) => prev.filter((b) => b.id !== batch.id));
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

  // ─── Hàm xuất file Excel cho 1 đội đơn lẻ ──────────────────────────────
  const exportSingleTeamExcel = async (team: 'NGHỊ' | 'NGUYÊN') => {
    const [mStr, yStr] = selectedMonthKey.split('/');
    const month = parseInt(mStr, 10);
    const year = parseInt(yStr, 10);

    const payload = {
      month,
      year,
      targetTeam: team,
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
      throw new Error(err.error || `Xuất file Excel Đội ${team} thất bại`);
    }

    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const mm = String(month).padStart(2, '0');
    const filePrefix = team === 'NGHỊ' ? 'LUONG_THANG_DOI_NGHI' : 'LUONG_THANG_NGUYEN';
    a.download = `${filePrefix}_T${mm}_${year}.xlsx`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
  };

  // ─── Tải đồng thời 2 file Excel: 1 file Đội Nghị, 1 file Đội Nguyên ────────
  const handleExportBothTeams = async () => {
    if (rawMonthBatches.length === 0) {
      alert('Không có mẻ nhập sấy nào trong tháng này để xuất file.');
      return;
    }

    setIsExporting(true);
    setExportError(null);
    setExportStatusText('Đang tạo file Đội Nghị...');

    try {
      // 1. Tải file Đội Nghị
      await exportSingleTeamExcel('NGHỊ');

      setExportStatusText('Đang tạo file Đội Nguyên...');
      // Chờ 600ms để trình duyệt xử lý file 1
      await new Promise((resolve) => setTimeout(resolve, 600));

      // 2. Tải file Đội Nguyên
      await exportSingleTeamExcel('NGUYÊN');

      setExportStatusText('✅ Đã tải xong 2 file Excel (Nghị + Nguyên)');
      setTimeout(() => setExportStatusText(''), 4000);
    } catch (err) {
      setExportError((err as Error).message);
    } finally {
      setIsExporting(false);
    }
  };

  // ─── Xuất file Excel linh hoạt ──────────────────────────────────────────
  const handleExportExcel = async (specificTeam?: 'NGHỊ' | 'NGUYÊN') => {
    if (rawMonthBatches.length === 0) {
      alert('Không có mẻ nhập sấy nào trong tháng này để xuất file.');
      return;
    }

    const target = specificTeam || (viewMode === 'ALL' ? null : viewMode);
    if (!target) {
      // Nếu đang xem Toàn bộ CS1 -> Xuất luôn 2 file Excel riêng biệt
      await handleExportBothTeams();
      return;
    }

    setIsExporting(true);
    setExportError(null);
    setExportStatusText(`Đang xuất file Đội ${target}...`);
    try {
      await exportSingleTeamExcel(target);
      setExportStatusText(`✅ Đã tải xong file Đội ${target}`);
      setTimeout(() => setExportStatusText(''), 3000);
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

            {/* Nút Xuất Excel: Xuất 2 file riêng biệt hoặc xuất theo đội */}
            <div className="flex flex-wrap items-center gap-1.5 self-end lg:self-auto">
              <button
                onClick={() => handleExportBothTeams()}
                disabled={isExporting || rawMonthBatches.length === 0}
                className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-bold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50 transition-all"
                title="Tải về đồng thời 2 file Excel riêng biệt: 1 file Đội Nghị & 1 file Đội Nguyên"
              >
                <span>📥</span>
                <span>
                  {isExporting ? (exportStatusText || 'Đang xuất...') : 'Xuất 2 File Excel (Nghị + Nguyên)'}
                </span>
              </button>

              <button
                type="button"
                onClick={() => handleExportExcel('NGHỊ')}
                disabled={isExporting || rawMonthBatches.length === 0}
                className="inline-flex items-center gap-1 rounded-xl border border-blue-200 bg-blue-50 px-2.5 py-2 text-xs font-bold text-blue-700 hover:bg-blue-100 disabled:opacity-50 transition-all"
                title="Tải riêng file Excel Đội Nghị"
              >
                <span>📄</span>
                <span>File Nghị</span>
              </button>

              <button
                type="button"
                onClick={() => handleExportExcel('NGUYÊN')}
                disabled={isExporting || rawMonthBatches.length === 0}
                className="inline-flex items-center gap-1 rounded-xl border border-emerald-200 bg-emerald-50 px-2.5 py-2 text-xs font-bold text-emerald-700 hover:bg-emerald-100 disabled:opacity-50 transition-all"
                title="Tải riêng file Excel Đội Nguyên"
              >
                <span>📄</span>
                <span>File Nguyên</span>
              </button>
            </div>
          </div>

          {/* Thông báo tiến trình xuất Excel */}
          {exportStatusText && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/90 p-2.5 text-xs font-semibold text-emerald-800 flex items-center justify-between">
              <span className="flex items-center gap-2">
                <span className="animate-spin">⏳</span>
                <span>{exportStatusText}</span>
              </span>
              <span className="text-[10px] text-emerald-600 font-normal">Trình duyệt sẽ tự động tải file về máy</span>
            </div>
          )}

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
                className={`rounded-lg border px-3 py-1 text-xs font-bold transition-all flex items-center gap-1.5 ${
                  showPricePanel
                    ? 'border-orange-500 bg-orange-50 text-orange-700 shadow-2xs'
                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                }`}
              >
                <span>⚙️</span>
                <span>{showPricePanel ? 'Đóng form giá lúa' : 'Cập nhật giá loại lúa'}</span>
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

      {/* ─── Bảng giá loại lúa & Form Cập Nhật Giá Tự Động ────────────────── */}
      {showPricePanel && (
        <div className="rounded-2xl border-2 border-orange-300 bg-white p-5 shadow-lg space-y-4 animate-in fade-in duration-200">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-orange-100 text-orange-700 text-sm font-bold">
                  🌾
                </span>
                <h3 className="text-sm font-bold uppercase tracking-wider text-slate-900">
                  Form Cập Nhật Đơn Giá Theo Loại Lúa (Cơ Sở I)
                </h3>
              </div>
              <p className="text-xs text-slate-500 mt-1">
                💡 Khi cập nhật đơn giá, hệ thống <strong className="text-emerald-700">tự động tính lại toàn bộ mẻ sấy</strong> và đồng bộ vào <strong className="text-emerald-700">2 file Excel khi xuất ra</strong>.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleResetRicePrices}
                className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 transition-all"
                title="Khôi phục về bảng giá gốc mặc định"
              >
                🔄 Khôi phục mặc định
              </button>
              <button
                type="button"
                onClick={() => setShowPricePanel(false)}
                className="rounded-lg border border-slate-200 bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-200 transition-all"
              >
                ✕ Đóng
              </button>
            </div>
          </div>

          {/* Form thêm loại lúa mới */}
          <form
            onSubmit={handleAddRicePrice}
            className="flex flex-wrap items-end gap-3 rounded-xl border border-orange-100 bg-orange-50/70 p-3.5 text-xs"
          >
            <div className="flex-1 min-w-[200px]">
              <label className="block font-bold text-slate-700 mb-1">
                Tên Loại Lúa Mới:
              </label>
              <input
                type="text"
                placeholder="VD: OM5451, ST24, ĐÀI THƠM..."
                value={newRiceType}
                onChange={(e) => setNewRiceType(e.target.value)}
                className="w-full rounded-lg border border-orange-200 bg-white px-3 py-1.5 text-xs font-bold uppercase text-slate-800 focus:border-orange-500 focus:outline-none"
              />
            </div>

            <div className="w-48 min-w-[150px]">
              <label className="block font-bold text-slate-700 mb-1">
                Đơn Giá (VNĐ/tấn):
              </label>
              <div className="relative">
                <input
                  type="number"
                  step="500"
                  placeholder="VD: 20000"
                  value={newRicePrice}
                  onChange={(e) => setNewRicePrice(e.target.value)}
                  className="w-full rounded-lg border border-orange-200 bg-white px-3 py-1.5 text-xs font-black text-orange-800 focus:border-orange-500 focus:outline-none"
                />
                <span className="absolute right-2.5 top-1.5 text-[10px] font-bold text-slate-400 pointer-events-none">
                  đ/tấn
                </span>
              </div>
            </div>

            <button
              type="submit"
              disabled={!newRiceType.trim()}
              className="rounded-lg bg-orange-600 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-orange-700 disabled:opacity-50 transition-all"
            >
              + Thêm Loại Lúa
            </button>
          </form>

          {/* Danh sách các loại lúa cho phép chỉnh sửa giá trực tiếp */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span className="font-bold text-slate-700">
                Bảng giá hiện tại ({ricePrices.length} loại lúa) — Nhập giá mới vào ô bên dưới:
              </span>
              <span className="text-[11px] text-slate-400">
                Phổ thông: 20.000đ • ST25/HP1: 23.000đ
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 max-h-[340px] overflow-y-auto pr-1">
              {ricePrices.map((p) => (
                <div
                  key={p.riceType}
                  className="rounded-xl border border-slate-200 bg-slate-50/40 p-3 shadow-2xs hover:border-orange-300 transition-all space-y-2"
                >
                  <div className="flex items-center justify-between gap-1">
                    <span className="inline-block rounded-md bg-white border border-slate-200 px-2 py-0.5 text-xs font-bold text-slate-800 truncate" title={p.riceType}>
                      🌾 {p.riceType}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleRemoveRicePrice(p.riceType)}
                      className="rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600 transition-all text-xs"
                      title="Xóa loại lúa này"
                    >
                      ✕
                    </button>
                  </div>

                  <div className="flex items-center gap-2">
                    <div className="relative flex-1">
                      <input
                        type="number"
                        step="500"
                        value={p.pricePerTon}
                        onChange={(e) => {
                          const val = parseFloat(e.target.value) || 0;
                          handleUpdateRicePrice(p.riceType, val);
                        }}
                        className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-black text-orange-700 text-right focus:border-orange-500 focus:outline-none"
                      />
                      <span className="absolute left-2 top-1 text-[10px] text-slate-400 font-medium">
                        Giá:
                      </span>
                    </div>
                    <span className="text-[11px] font-bold text-slate-500 shrink-0">
                      đ/tấn
                    </span>
                  </div>
                </div>
              ))}
            </div>
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
                        {/* Hàng Header cụm Ngày có nút Thêm mẻ và 2 nút Gán Nhanh */}
                        <tr className="bg-slate-100/90 border-t border-b border-slate-200">
                          <td colSpan={6} className="px-3 py-1.5 font-bold text-slate-800">
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => handleOpenAddDayModal(dateStr)}
                                className="inline-flex items-center gap-1 rounded bg-orange-600 hover:bg-orange-700 text-white px-2 py-0.5 text-[11px] font-bold transition-all shadow-2xs"
                                title={`Thêm mẻ mới vào ngày ${dateStr}`}
                              >
                                <span>+</span>
                                <span>Thêm mẻ</span>
                              </button>
                              <span>
                                📅 Ngày nhập sấy: <span className="text-orange-700">{dateStr}</span> ({batchesInDate.length} mẻ — {dayTons} tấn)
                              </span>
                            </div>
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
                                <div className="flex items-center justify-center gap-1">
                                  <span>{b.contractNo || String(idx + 1).padStart(2, '0')}</span>
                                  {b.isManual && (
                                    <button
                                      type="button"
                                      onClick={() => handleDeleteManualBatch(b)}
                                      className="text-slate-400 hover:text-rose-600 p-0.5 transition-colors"
                                      title="Xóa mẻ thủ công này"
                                    >
                                      🗑️
                                    </button>
                                  )}
                                </div>
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
                              <td className="px-3 py-2 font-medium text-slate-900">
                                <div className="flex flex-col">
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <span>{b.customerName || '-'}</span>
                                    {b.isManual && (
                                      <span
                                        className={`rounded px-1.5 py-0.2 text-[10px] font-bold ${
                                          b.splitFromId
                                            ? 'bg-amber-100 text-amber-800 border border-amber-300'
                                            : 'bg-indigo-100 text-indigo-800 border border-indigo-300'
                                        }`}
                                      >
                                        {b.splitFromId ? '🏷️ Tách mẻ' : '🏷️ Thêm tay'}
                                      </span>
                                    )}
                                  </div>
                                  {b.note && (
                                    <span className="text-[10px] text-slate-400 italic">
                                      📝 {b.note}
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td className="px-3 py-2 font-semibold text-slate-700">{b.riceType || '-'}</td>
                              <td className="px-3 py-2 text-slate-600">{b.vehicleName || b.freshBoVehicle || '-'}</td>
                              <td className="px-3 py-2 text-center text-orange-700 font-medium">
                                <div className="inline-flex items-center justify-center gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() => handleOpenSplitModal(b)}
                                    className="w-5 h-5 rounded-full bg-orange-100 hover:bg-orange-600 hover:text-white text-orange-700 text-xs font-black flex items-center justify-center border border-orange-300 transition-all shadow-2xs cursor-pointer"
                                    title="Bấm dấu + để điền thêm thông tin / tách mẻ sấy dở dang cho đội khác"
                                  >
                                    +
                                  </button>
                                  <span>{b.dryDate}</span>
                                </div>
                              </td>
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
            <div className="border-b border-slate-200 bg-slate-50/70 px-5 py-3.5 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-xs font-bold uppercase tracking-wider text-slate-800 flex items-center gap-2">
                  <span>👥</span>
                  <span>
                    Bảng Công Nhân &amp; Tạm Ứng — {workerTab === 'NGUYÊN' ? 'Đội Anh Nguyên' : 'Đội Anh Nghị'}
                  </span>
                </h2>
                <p className="text-[11px] text-slate-500">
                  <span className="text-rose-600 font-semibold">✏️ Cho phép sửa trực tiếp Họ tên, Tạm ứng, STK, Ngân hàng</span>
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {/* Tab chuyển qua lại giữa Đội Anh Nghị và Đội Anh Nguyên */}
                <div className="flex items-center gap-1 rounded-xl bg-slate-200/70 p-1">
                  <button
                    type="button"
                    onClick={() => setWorkerTab('NGHỊ')}
                    className={`rounded-lg px-3 py-1 text-xs font-bold transition-all cursor-pointer ${
                      workerTab === 'NGHỊ'
                        ? 'bg-blue-600 text-white shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    👷 Đội Anh Nghị ({workersNghi.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setWorkerTab('NGUYÊN')}
                    className={`rounded-lg px-3 py-1 text-xs font-bold transition-all cursor-pointer ${
                      workerTab === 'NGUYÊN'
                        ? 'bg-emerald-600 text-white shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    👷 Đội Anh Nguyên ({workersNguyen.length})
                  </button>
                </div>

                <button
                  onClick={() => setShowWorkerAdd(!showWorkerAdd)}
                  className="rounded-lg bg-orange-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-orange-700 transition-all shadow-2xs cursor-pointer"
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
                      onClick={() => handleAddWorker(workerTab)}
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
                  {(workerTab === 'NGUYÊN' ? workersNguyen : workersNghi).map((w, idx) => {
                    const currentTeam = workerTab;
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
                <span className="text-slate-600 flex items-center gap-1.5">
                  <span>Tiền nhập trấu ({currentTrauItems.length} chuyến):</span>
                  <button
                    type="button"
                    onClick={() => setShowTrauPanel((prev) => !prev)}
                    className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-800 hover:bg-amber-200 cursor-pointer"
                  >
                    {showTrauPanel ? 'Ẩn bảng trấu' : '👁️ Xem/Sửa'}
                  </button>
                </span>
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

            <div className="pt-2 space-y-2">
              <button
                onClick={() => handleExportBothTeams()}
                disabled={isExporting || rawMonthBatches.length === 0}
                className="w-full rounded-xl bg-emerald-600 py-3 text-xs font-bold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50 transition-all flex items-center justify-center gap-2"
                title="Tải về cả 2 file Excel riêng biệt: 1 file Đội Nghị & 1 file Đội Nguyên"
              >
                <span>📥</span>
                <span>
                  {isExporting ? (exportStatusText || 'Đang tạo Excel...') : 'Xuất 2 File Excel (Nghị + Nguyên)'}
                </span>
              </button>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => handleExportExcel('NGHỊ')}
                  disabled={isExporting || rawMonthBatches.length === 0}
                  className="rounded-lg border border-blue-200 bg-blue-50 py-2 text-xs font-bold text-blue-700 hover:bg-blue-100 disabled:opacity-50 transition-all"
                  title="Tải riêng file Excel Đội Nghị"
                >
                  📄 File Đội Nghị
                </button>
                <button
                  type="button"
                  onClick={() => handleExportExcel('NGUYÊN')}
                  disabled={isExporting || rawMonthBatches.length === 0}
                  className="rounded-lg border border-emerald-200 bg-emerald-50 py-2 text-xs font-bold text-emerald-700 hover:bg-emerald-100 disabled:opacity-50 transition-all"
                  title="Tải riêng file Excel Đội Nguyên"
                >
                  📄 File Đội Nguyên
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── Bảng Chi Tiết Nhập Trấu CS1 (Đội Nghị & Đội Nguyên - Giống CS2) ── */}
      {selectedMonthKey && showTrauPanel && (
        <div className="rounded-2xl border-2 border-yellow-300 bg-white p-5 shadow-md space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-yellow-100 pb-3">
            <div>
              <h3 className="text-sm font-black uppercase tracking-wider text-amber-950 flex items-center gap-2">
                <span>🌾</span>
                <span>
                  Quản Lý Nhập Trấu CS1 — {workerTab === 'NGUYÊN' ? 'Đội Anh Nguyên' : 'Đội Anh Nghị'}
                </span>
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Xe <strong>Ông 5</strong> mặc định <strong>27.273đ/tấn</strong> (11t = 300k · 22t = 600k), ghe/xe ngoài mặc định <strong>27.000đ/tấn</strong>. Tự động cộng vào lương &amp; xuất sheet Nhập Trấu.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1 rounded-xl bg-slate-100 p-1">
                <button
                  type="button"
                  onClick={() => { setWorkerTab('NGHỊ'); handleCancelEditTrau(); }}
                  className={`rounded-lg px-3 py-1 text-xs font-bold cursor-pointer ${
                    workerTab === 'NGHỊ' ? 'bg-blue-600 text-white shadow-xs' : 'text-slate-600'
                  }`}
                >
                  Đội Nghị ({trauNghi.length})
                </button>
                <button
                  type="button"
                  onClick={() => { setWorkerTab('NGUYÊN'); handleCancelEditTrau(); }}
                  className={`rounded-lg px-3 py-1 text-xs font-bold cursor-pointer ${
                    workerTab === 'NGUYÊN' ? 'bg-emerald-600 text-white shadow-xs' : 'text-slate-600'
                  }`}
                >
                  Đội Nguyên ({trauNguyen.length})
                </button>
              </div>
              <button
                type="button"
                onClick={() => setShowTrauPanel(false)}
                className="rounded-lg border border-slate-200 bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-200 cursor-pointer"
              >
                ✕ Đóng
              </button>
            </div>
          </div>

          {/* Danh sách chuyến trấu */}
          <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
            {(workerTab === 'NGUYÊN' ? trauNguyen : trauNghi).map((t) => {
              const isOng5 = (t.phuongTien || '').toUpperCase().includes('ÔNG 5');
              return (
                <div
                  key={t.id}
                  className="flex items-center justify-between p-2.5 rounded-xl bg-yellow-50/50 border border-yellow-200 text-xs"
                >
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="font-bold text-slate-800">{t.phuongTien}</span>
                      <span
                        className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                          isOng5 ? 'bg-amber-100 text-amber-800' : 'bg-teal-100 text-teal-800'
                        }`}
                      >
                        {isOng5 ? 'Xe Ông 5 (27.273đ)' : `Ghe ngoài (${formatMoney(t.donGia)}đ)`}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-500 mt-0.5">
                      📅 {t.date} · ⚖️ <strong className="text-slate-700">{t.soLuong} tấn</strong> · Đơn giá:{' '}
                      <strong className="text-amber-900">{formatMoney(t.donGia)}đ</strong>/tấn
                    </div>
                  </div>
                  <div className="text-right flex items-center gap-2">
                    <span className="font-extrabold text-amber-900">{formatMoney(t.thanhTien)}đ</span>
                    <button
                      type="button"
                      onClick={() => handleStartEditTrau(t)}
                      className="px-2 py-1 rounded bg-amber-100 text-amber-800 text-[11px] font-bold cursor-pointer hover:bg-amber-200"
                    >
                      Sửa
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (workerTab === 'NGUYÊN') {
                          setTrauNguyen((prev) => prev.filter((x) => x.id !== t.id));
                        } else {
                          setTrauNghi((prev) => prev.filter((x) => x.id !== t.id));
                        }
                      }}
                      className="px-2 py-1 rounded bg-rose-100 text-rose-700 text-[11px] font-bold cursor-pointer hover:bg-rose-200"
                    >
                      Xóa
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Nút chọn nhanh mẫu xe/ghe trấu (giống CS2) */}
          <div className="pt-2 border-t border-yellow-200 space-y-1.5">
            <span className="text-[11px] font-bold text-slate-600 block">⚡ Điền nhanh chuyến trấu:</span>
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => handleSelectTrauPreset('ÔNG 5', 11, 27273, 300000)}
                className="px-2.5 py-1 rounded-lg bg-amber-100 hover:bg-amber-200 text-amber-900 text-[11px] font-bold border border-amber-300 transition-colors cursor-pointer"
              >
                🚐 Nửa xe Ông 5 (11t = 300k · 27.273đ)
              </button>
              <button
                type="button"
                onClick={() => handleSelectTrauPreset('ÔNG 5', 22, 27273, 600000)}
                className="px-2.5 py-1 rounded-lg bg-amber-100 hover:bg-amber-200 text-amber-900 text-[11px] font-bold border border-amber-300 transition-colors cursor-pointer"
              >
                🚛 Nguyên xe Ông 5 (22t = 600k · 27.273đ)
              </button>
              <button
                type="button"
                onClick={() => handleSelectTrauPreset('TÀU ĐÔ 49', 19, 27000, 513000)}
                className="px-2.5 py-1 rounded-lg bg-teal-100 hover:bg-teal-200 text-teal-900 text-[11px] font-bold border border-teal-300 transition-colors cursor-pointer"
              >
                🚤 Tàu Đô 49 (19t = 513k · 27.000đ)
              </button>
              <button
                type="button"
                onClick={() => handleSelectTrauPreset('GHE NGOÀI', 20, 27000, 540000)}
                className="px-2.5 py-1 rounded-lg bg-teal-100 hover:bg-teal-200 text-teal-900 text-[11px] font-bold border border-teal-300 transition-colors cursor-pointer"
              >
                🚤 Ghe ngoài (20t = 540k · 27.000đ)
              </button>
            </div>
          </div>

          {/* Form thêm / sửa chuyến trấu */}
          <div className="pt-2 border-t border-yellow-200 space-y-2.5 text-xs">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              <div>
                <label className="text-[10px] font-bold text-slate-500 block mb-0.5">Ngày nhập:</label>
                <input
                  type="text"
                  placeholder="dd/mm/yyyy"
                  value={newTrauDate}
                  onChange={(e) => setNewTrauDate(e.target.value)}
                  className="w-full rounded-lg border border-amber-200 px-2.5 py-1.5 text-xs font-mono"
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
                    const p = isO5 ? 27273 : 27000;
                    setNewTrauPrice(String(p));
                    const tons = parseFloat(newTrauQty);
                    if (!isNaN(tons) && tons > 0) {
                      const m = computeTrauMoney(val, tons, p);
                      setNewTrauMoney(m > 0 ? String(m) : '');
                    }
                  }}
                  className="w-full rounded-lg border border-amber-200 px-2.5 py-1.5 text-xs font-bold uppercase"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-500 block mb-0.5">Số lượng (tấn):</label>
                <input
                  type="number"
                  step="any"
                  placeholder="vd: 11 hoặc 20"
                  value={newTrauQty}
                  onChange={(e) => handleTrauTonsChange(e.target.value)}
                  className="w-full rounded-lg border border-amber-200 px-2.5 py-1.5 text-xs font-black text-amber-800 text-right"
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
                  className="w-full rounded-lg border border-amber-200 px-2.5 py-1.5 text-xs font-bold text-slate-800 text-right"
                />
              </div>
            </div>
            <div className="flex flex-wrap gap-2 items-center">
              <div className="flex-1 min-w-[200px] flex items-center gap-1.5">
                <label className="text-[11px] font-bold text-slate-600 whitespace-nowrap">Thành tiền:</label>
                <input
                  type="text"
                  placeholder="Thành tiền VNĐ"
                  value={newTrauMoney ? parseInt(newTrauMoney, 10).toLocaleString('vi-VN') : ''}
                  onChange={(e) => setNewTrauMoney(e.target.value.replace(/\D/g, ''))}
                  className="flex-1 rounded-lg border border-amber-200 bg-amber-50/50 px-2.5 py-1.5 text-xs font-black text-amber-900"
                />
                <span className="text-xs text-slate-500 font-bold">đ</span>
              </div>
              <button
                type="button"
                onClick={handleSaveTrauItem}
                disabled={!newTrauDate.trim() || !newTrauQty}
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

      {/* ─── Modal Điền Thêm Thông Tin / Tách Mẻ Sấy Dở Dang ──────────────── */}
      {splitModal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden space-y-0">
            {/* Modal Header */}
            <div className="bg-gradient-to-r from-orange-600 to-amber-600 px-5 py-4 text-white flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/20 text-base font-bold">
                  ➕
                </span>
                <div>
                  <h3 className="text-sm font-bold tracking-tight">
                    {splitModal.mode === 'SPLIT'
                      ? 'Điền Thêm Thông Tin / Tách Mẻ Sấy Dở Dang'
                      : 'Thêm Mẻ Nhập Sấy Mới Vào Ngày'}
                  </h3>
                  <p className="text-[11px] text-orange-100">
                    {splitModal.mode === 'SPLIT'
                      ? 'Bữa đó sấy chưa hết hoặc qua ngày đội khác vào làm tiếp'
                      : `Thêm dòng mẻ thủ công vào ngày ${splitModal.date}`}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSplitModal((prev) => ({ ...prev, isOpen: false }))}
                className="h-7 w-7 rounded-lg bg-white/10 hover:bg-white/20 text-white flex items-center justify-center font-bold text-sm transition-all"
              >
                ✕
              </button>
            </div>

            {/* Modal Body */}
            <form onSubmit={handleSubmitSplitModal} className="p-5 space-y-4 text-xs">
              {/* Thẻ thông tin mẻ gốc nếu là SPLIT */}
              {splitModal.mode === 'SPLIT' && splitModal.sourceBatch && (
                <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-3 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-amber-800">
                      🌾 Thông tin mẻ gốc đang tách:
                    </span>
                    <span className="rounded bg-amber-200/80 px-1.5 py-0.5 text-[10px] font-bold text-amber-900 font-mono">
                      {splitModal.sourceBatch.contractNo || 'Mẻ gốc'}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-slate-700 pt-1">
                    <div>
                      <span className="text-slate-500">Khách hàng: </span>
                      <strong className="text-slate-900">{splitModal.sourceBatch.customerName || '-'}</strong>
                    </div>
                    <div>
                      <span className="text-slate-500">Loại lúa: </span>
                      <strong className="text-slate-900">{splitModal.sourceBatch.riceType || '-'}</strong>
                    </div>
                    <div>
                      <span className="text-slate-500">Phương tiện: </span>
                      <span className="text-slate-800">{splitModal.sourceBatch.vehicleName || '-'}</span>
                    </div>
                    <div>
                      <span className="text-slate-500">Ngày sấy gốc: </span>
                      <strong className="text-orange-700">{splitModal.sourceBatch.dryDate}</strong>
                    </div>
                    <div>
                      <span className="text-slate-500">Đội ban đầu: </span>
                      <span className={`inline-flex items-center gap-1 font-bold ${
                        splitModal.sourceBatch.doiNhap === 'NGHỊ' ? 'text-blue-700' : 'text-emerald-700'
                      }`}>
                        {splitModal.sourceBatch.doiNhap === 'NGHỊ' ? '🔵 Đội Nghị' : '🟢 Đội Nguyên'}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500">Sản lượng gốc: </span>
                      <strong className="text-rose-700 text-sm font-mono">{splitModal.sourceBatch.roundedTons} tấn</strong>
                    </div>
                  </div>
                </div>
              )}

              {/* Hàng 1: Ngày nhập sấy + Chọn Đội */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Ngày nhập sấy <span className="text-rose-500">*</span>:
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="dd/mm/yyyy (vd: 16/11/2026)"
                    value={splitModal.date}
                    onChange={(e) => setSplitModal((prev) => ({ ...prev, date: e.target.value }))}
                    className="w-full rounded-lg border border-slate-300 px-3 py-1.5 font-medium text-slate-800 focus:border-orange-500 focus:ring-1 focus:ring-orange-500 focus:outline-none"
                  />
                  <span className="text-[10px] text-slate-400 mt-0.5 block">
                    Có thể là cùng ngày hoặc ngày hôm sau khi đội khác vào làm
                  </span>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Đội phụ trách <span className="text-rose-500">*</span>:
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => handleSelectTeamInModal('NGHỊ')}
                      className={`rounded-lg py-1.5 px-2 font-bold text-xs flex items-center justify-center gap-1 border transition-all ${
                        splitModal.team === 'NGHỊ'
                          ? 'border-blue-500 bg-blue-50 text-blue-800 ring-2 ring-blue-400 font-black'
                          : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      <span>🔵</span>
                      <span>Đội Nghị</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSelectTeamInModal('NGUYÊN')}
                      className={`rounded-lg py-1.5 px-2 font-bold text-xs flex items-center justify-center gap-1 border transition-all ${
                        splitModal.team === 'NGUYÊN'
                          ? 'border-emerald-500 bg-emerald-50 text-emerald-800 ring-2 ring-emerald-400 font-black'
                          : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      <span>🟢</span>
                      <span>Đội Nguyên</span>
                    </button>
                  </div>
                  <span className="text-[10px] text-slate-400 mt-0.5 block">
                    Đội nhận mẻ / phần việc này
                  </span>
                </div>
              </div>

              {/* Hàng 2: Cân sấy (kg) & Số tấn (quy đổi tự động / cho phép sửa) & Đơn giá */}
              <div className="grid grid-cols-3 gap-2.5">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Cân sấy (kg):
                  </label>
                  <input
                    type="text"
                    placeholder="VD: 56355"
                    value={splitModal.kg}
                    onChange={(e) => {
                      const kgVal = e.target.value;
                      const kgNum = parseFloat(kgVal.replace(/[^\d.]/g, '')) || 0;
                      const autoTons = kgNum > 0 ? roundRiceTons(kgNum) : 0;
                      setSplitModal((prev) => ({
                        ...prev,
                        kg: kgVal,
                        tons: autoTons > 0 ? String(autoTons) : (kgVal.trim() === '' ? '' : prev.tons),
                      }));
                    }}
                    className="w-full rounded-lg border border-slate-300 px-3 py-1.5 font-mono text-slate-800 focus:border-orange-500 focus:outline-none"
                  />
                  <span className="text-[10px] text-slate-400 mt-0.5 block">
                    Nhập kg sẽ tự đổi ra tấn
                  </span>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Số tấn <span className="text-rose-500">*</span>:
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    required
                    placeholder="VD: 56"
                    value={splitModal.tons}
                    onChange={(e) => {
                      const val = e.target.value;
                      const num = parseFloat(val.replace(/[^\d.]/g, '')) || 0;
                      setSplitModal((prev) => ({
                        ...prev,
                        tons: val,
                        kg: prev.kg ? prev.kg : (num > 0 ? String(Math.round(num * 1000)) : ''),
                      }));
                    }}
                    className="w-full rounded-lg border-2 border-rose-300 bg-rose-50/30 px-3 py-1.5 font-mono font-bold text-rose-700 focus:border-rose-500 focus:outline-none"
                  />
                  <span className="text-[10px] text-rose-600 font-semibold mt-0.5 block">
                    ✏️ Có thể sửa trực tiếp
                  </span>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Đơn giá (đ/tấn):
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={splitModal.pricePerTon}
                    onChange={(e) => setSplitModal((prev) => ({ ...prev, pricePerTon: e.target.value }))}
                    className="w-full rounded-lg border border-slate-300 px-3 py-1.5 font-mono font-semibold text-emerald-700 focus:border-orange-500 focus:outline-none"
                  />
                  <span className="text-[10px] text-slate-400 mt-0.5 block">
                    Theo giá loại lúa
                  </span>
                </div>
              </div>

              {/* Thành tiền tính nhẩm */}
              {(() => {
                const tNum = parseFloat(splitModal.tons.replace(/[^\d.]/g, '')) || 0;
                const pNum = parseInt(splitModal.pricePerTon.replace(/\D/g, ''), 10) || 0;
                const totalMoney = tNum * pNum;
                return (
                  <div className="flex items-center justify-between rounded-lg bg-emerald-50 px-3 py-2 border border-emerald-200">
                    <span className="font-semibold text-emerald-800">Thành tiền tạm tính:</span>
                    <span className="font-mono font-bold text-emerald-700 text-sm">
                      {formatMoney(totalMoney)} đ
                    </span>
                  </div>
                );
              })()}

              {/* Hàng 3: Khách hàng & Loại lúa & Phương tiện */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Khách hàng:</label>
                  <input
                    type="text"
                    value={splitModal.customerName}
                    onChange={(e) => setSplitModal((prev) => ({ ...prev, customerName: e.target.value }))}
                    className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-slate-800 focus:border-orange-500 focus:outline-none uppercase"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Loại lúa:</label>
                  <input
                    type="text"
                    value={splitModal.riceType}
                    onChange={(e) => {
                      const rt = e.target.value;
                      const matchedPrice = getPriceForRice(rt);
                      setSplitModal((prev) => ({
                        ...prev,
                        riceType: rt,
                        pricePerTon: String(matchedPrice),
                      }));
                    }}
                    className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-slate-800 focus:border-orange-500 focus:outline-none uppercase font-semibold"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Phương tiện / Xe:</label>
                  <input
                    type="text"
                    value={splitModal.vehicleName}
                    onChange={(e) => setSplitModal((prev) => ({ ...prev, vehicleName: e.target.value }))}
                    className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-slate-800 focus:border-orange-500 focus:outline-none uppercase"
                  />
                </div>
              </div>

              {/* Ghi chú */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="font-bold text-slate-700">Ghi chú (Tự động điền &amp; Có thể sửa):</label>
                  <span className="text-[10px] text-emerald-600 font-medium">✓ Đã tự điền nội dung</span>
                </div>
                <input
                  type="text"
                  placeholder="VD: Ngày 16/11 làm chưa hết, ngày 17/11 Đội Nguyên vào làm tiếp"
                  value={splitModal.note}
                  onChange={(e) => setSplitModal((prev) => ({ ...prev, note: e.target.value }))}
                  className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-slate-700 focus:border-orange-500 focus:outline-none"
                />
                {/* Các nút bấm chọn nhanh ghi chú */}
                <div className="flex flex-wrap items-center gap-1.5 mt-2">
                  <span className="text-[10px] font-bold text-slate-400">Chọn nhanh:</span>
                  {[
                    'Sấy chưa hết hôm sau làm tiếp',
                    'Xe đến trễ qua ngày sấy tiếp',
                    'Đổi ca Đội khác phụ trách',
                    'Nhập phát sinh ngoài bảng master',
                  ].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setSplitModal((prev) => ({ ...prev, note: preset }))}
                      className="rounded bg-slate-100 hover:bg-orange-100 hover:text-orange-800 text-slate-600 px-2 py-0.5 text-[10px] border border-slate-200 transition-all cursor-pointer font-medium"
                    >
                      + {preset}
                    </button>
                  ))}
                </div>
              </div>

              {/* Tùy chọn tự động trừ số tấn khỏi mẻ gốc (chỉ hiển thị khi SPLIT) */}
              {splitModal.mode === 'SPLIT' && splitModal.sourceBatch && (
                <div className="rounded-xl border border-blue-200 bg-blue-50/70 p-3">
                  <label className="flex items-start gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={splitModal.autoDeductOrigin}
                      onChange={(e) => setSplitModal((prev) => ({ ...prev, autoDeductOrigin: e.target.checked }))}
                      className="mt-0.5 h-4 w-4 rounded border-blue-300 text-blue-600 focus:ring-blue-500"
                    />
                    <div className="text-slate-700">
                      <span className="font-bold text-blue-900 block">
                        Tự động trừ số tấn của mẻ gốc
                      </span>
                      {(() => {
                        const originTons = splitModal.sourceBatch.roundedTons;
                        const splitTons = parseFloat(splitModal.tons.replace(/[^\d.]/g, '')) || 0;
                        const remain = Math.max(0, originTons - splitTons);
                        return (
                          <span className="text-[11px] text-blue-800 block mt-0.5">
                            Khi chọn, mẻ gốc ({originTons} tấn) sẽ tự động trừ đi {splitTons} tấn và còn lại{' '}
                            <strong className="text-rose-700 font-mono font-bold">{remain} tấn</strong>. Dòng mẻ mới này nhận{' '}
                            <strong className="text-emerald-700 font-mono font-bold">{splitTons} tấn</strong>.
                          </span>
                        );
                      })()}
                    </div>
                  </label>
                </div>
              )}

              {/* Modal Footer / Actions */}
              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setSplitModal((prev) => ({ ...prev, isOpen: false }))}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 transition-all"
                >
                  Hủy Bỏ
                </button>
                <button
                  type="submit"
                  className="rounded-xl bg-orange-600 hover:bg-orange-700 text-white px-5 py-2 text-xs font-bold shadow-md transition-all flex items-center gap-1.5"
                >
                  <span>✓</span>
                  <span>
                    {splitModal.mode === 'SPLIT' ? 'Xác Nhận Tách / Thêm Mẻ Này' : 'Thêm Mẻ Vào Bảng'}
                  </span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── Nút Nổi & Sổ Tay Ghi Chú Nhanh CS1 (Góc dưới cùng bên phải) ── */}
      <div className="fixed bottom-6 right-6 z-40 flex flex-col items-end">
        {quickNoteOpen ? (
          <div className="w-80 sm:w-96 rounded-2xl bg-white shadow-2xl border-2 border-amber-300 overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-200">
            {/* Header */}
            <div className="bg-gradient-to-r from-amber-500 to-orange-500 px-4 py-3 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-base">📝</span>
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider">Sổ Ghi Chú CS1</h4>
                  <span className="text-[10px] text-amber-100 flex items-center gap-1">
                    <span>☁️ Đồng bộ trực tuyến (Ai vào cũng thấy)</span>
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => fetchCloudNoteCS1()}
                  className="h-6 px-1.5 rounded-lg bg-white/20 hover:bg-white/30 text-white flex items-center justify-center text-[10px] font-bold transition-all cursor-pointer"
                  title="Nhấn để tải nội dung mới nhất nếu người khác vừa sửa"
                >
                  🔄 Tải mới
                </button>
                <button
                  type="button"
                  onClick={() => setQuickNoteOpen(false)}
                  className="h-6 w-6 rounded-lg bg-white/20 hover:bg-white/30 text-white flex items-center justify-center text-xs font-bold transition-all cursor-pointer"
                  title="Đóng ghi chú"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Body */}
            <div className="p-3.5 space-y-2.5">
              <textarea
                value={quickNoteText}
                onChange={(e) => handleUpdateQuickNote(e.target.value)}
                placeholder="Ghi chú lại bất cứ thông tin cần nhớ tại CS1 (vd: Ngày 16/11 xe 70C 12017 anh Nghị sấy dở 14 tấn qua ngày 17 anh Nguyên làm tiếp; lưu ý công nợ; dặn dò thợ lò...)"
                rows={6}
                className="w-full rounded-xl border border-amber-200 bg-amber-50/30 p-2.5 text-xs text-slate-800 placeholder-slate-400 focus:border-amber-500 focus:bg-white focus:outline-none resize-none"
              />

              <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1 border-t border-slate-100">
                <span className="flex items-center gap-1 font-medium">
                  {quickNoteSyncing ? (
                    <span className="text-amber-600 animate-pulse">☁️ Đang đồng bộ...</span>
                  ) : quickNoteSavedAt ? (
                    <span className="text-emerald-700">☁️ Đã đồng bộ lúc {quickNoteSavedAt}</span>
                  ) : (
                    <span>☁️ Tự động đồng bộ</span>
                  )}
                </span>
                {quickNoteText && (
                  <button
                    type="button"
                    onClick={() => {
                      if (window.confirm('Bạn có muốn xóa sạch nội dung sổ ghi chú này cho tất cả mọi người không?')) {
                        handleUpdateQuickNote('');
                      }
                    }}
                    className="text-rose-500 hover:text-rose-700 font-semibold cursor-pointer"
                  >
                    Xóa ghi chú
                  </button>
                )}
              </div>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setQuickNoteOpen(true)}
            className="group flex items-center gap-2 rounded-full bg-gradient-to-r from-amber-500 to-orange-500 px-4 py-3 text-white shadow-xl hover:shadow-2xl hover:scale-105 active:scale-95 border-2 border-white ring-4 ring-amber-200/60 transition-all cursor-pointer font-bold text-xs"
            title="Mở sổ ghi chú CS1 (Đồng bộ mọi người)"
          >
            <span className="text-base group-hover:rotate-12 transition-transform">📝</span>
            <span>Ghi chú CS1</span>
            {quickNoteText.trim() && (
              <span className="flex h-2.5 w-2.5 rounded-full bg-emerald-300 ring-2 ring-white animate-pulse" />
            )}
          </button>
        )}
      </div>
    </div>
  );
}

