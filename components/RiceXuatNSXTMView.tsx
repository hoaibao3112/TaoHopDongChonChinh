'use client';

/**
 * RiceXuatNSXTMView — Quản lý & Tính Lương Xuống Lúa / Xuất Lúa NSX Tân Mỹ (Đội Nam)
 * Chuẩn mẫu theo: LƯƠNG_ĐỘI_NAM-XUẤT_NSX_ĐTM_T10_2026_IN_CHUANMAU.xlsx
 *
 * Kiến trúc đồng bộ chuẩn 100% với phân hệ Xuất Lúa CS1 (RicePayrollView):
 * 1. Tự động đọc dữ liệu nền từ File Lúa Master (2.902 mẻ lúa 2026) hoặc tải file mới lên.
 * 2. Tự động lọc tất cả mẻ xuất tại Nhà Máy NSX Tân Mỹ (NSX TM / NSX ĐTM / CCĐTM).
 * 3. Hỗ trợ tính lương ĐẦY ĐỦ CHO TẤT CẢ CÁC THÁNG (Tháng 10, Tháng 11, Tháng 12, ...).
 * 4. 2 Chế độ xem:
 *    - Tab 1: 📝 Bảng Lương Ngày • Đội Nam (Gom theo từng ngày có mẻ xuống lúa, chọn Có trở 17k / Không trở 11k / Cả hai).
 *             Fix triệt để lỗi nhập Cả hai: các ô nhập số lượng độc lập, không tự xóa và không biến mất!
 *    - Tab 2: 🌾 Chi Tiết Mẻ Lúa Từ File (Liệt kê tất cả mẻ trong tháng, toggle Có trở / Không trở, sửa số tấn).
 * 5. Bảng tổng hợp KPI (Sheet 2): Xuất có trở (17k), Xuất không trở (11k), Chụm lò lúa (8k), Chụm lò nếp (11k), Vô bồn (3k), Tổng cộng, Tạm ứng, Còn lại.
 * 6. Xuất file Excel chuẩn 2 Sheet có công thức SUBTOTAL và SUM chính xác.
 */

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { RiceBatch } from '@/lib/rice-payroll/types';
import { isNSXTM } from '@/lib/rice-payroll/facility-filter';
import { roundRiceTons } from '@/lib/rice-payroll/rounding';
import {
  XuatNSXTMEntry,
  XuatNSXTMSummary,
  XuatNSXTMExportPayload,
} from '@/lib/rice-payroll/xuat-nsx-tm-types';
import {
  isJaponica,
  isNep,
  batchToXuatNSXTMEntry,
} from '@/lib/rice-payroll/xuat-nsx-tm-parser';
import {
  getMonthKeyFromDate,
  getSortedMonthKeysFromDates,
} from '@/lib/rice-payroll/month-utils';

function formatVND(val: number | null | undefined): string {
  if (val === null || val === undefined || isNaN(val)) return '0';
  return Math.round(val)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

interface NSXTMDayRow {
  id: string;
  date: string; // "01/10/2026"
  tonsCoTro: number;
  priceCoTro: number;
  tonsKhongTro: number;
  priceKhongTro: number;
  mode?: 'coTro' | 'khongTro' | 'caHai';
}

function newDayRow(date = ''): NSXTMDayRow {
  return {
    id: Math.random().toString(36).slice(2),
    date,
    tonsCoTro: 0,
    priceCoTro: 17000,
    tonsKhongTro: 0,
    priceKhongTro: 11000,
    mode: 'coTro',
  };
}

export default function RiceXuatNSXTMView() {
  // ─── Dữ liệu nền từ File Lúa Master ───────────────────────────────────────
  const [isLoadingFile, setIsLoadingFile] = useState(true);
  const [loadedFileName, setLoadedFileName] = useState<string>('');
  const [allBatches, setAllBatches] = useState<RiceBatch[]>([]);
  const [fileError, setFileError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ─── Tháng chọn & Tab xem ────────────────────────────────────────────────
  const [selectedMonthKey, setSelectedMonthKey] = useState<string>('10/2026');
  const [activeTab, setActiveTab] = useState<'notebook' | 'batches'>('notebook');

  // Đơn giá chuẩn Đội Nam NSX TM
  const masterPriceCoTro = 17000;
  const masterPriceKhongTro = 11000;

  // ─── Danh sách ngày lương (Sổ tay Đội Nam) ────────────────────────────────
  const [rows, setRows] = useState<NSXTMDayRow[]>([newDayRow('01/10/2026')]);

  // Overrides riêng cho từng mẻ lúa (key = batch.id)
  const [batchOverrides, setBatchOverrides] = useState<
    Record<string, { isCoTro: boolean; tons?: number }>
  >({});

  // Xem chi tiết mẻ của 1 ngày (Modal)
  const [detailRow, setDetailRow] = useState<NSXTMDayRow | null>(null);

  // Cấu hình chữ ký & Tạm ứng
  const [nguoiLapBang, setNguoiLapBang] = useState<string>('Võ Hoàng Cẩm Tiên');
  const [nguoiXacNhan, setNguoiXacNhan] = useState<string>('Huỳnh Anh Phát Thịnh');
  const [tamUng, setTamUng] = useState<number>(0);
  const [showConfigModal, setShowConfigModal] = useState<boolean>(false);

  // Trạng thái xuất file
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  // ─── TỰ ĐỘNG NẠP CÁC NGÀY XUỐNG LÚA TRONG THÁNG TỪ FILE MASTER ───────────
  const populateMonthDays = useCallback(
    (monthKey: string, batches: RiceBatch[]) => {
      const tmBatchesInMonth = batches.filter(
        (b) =>
          isNSXTM(b.dryFacility) &&
          getMonthKeyFromDate(b.dischargeDate || b.dryDate || b.weighDate) === monthKey
      );

      // Danh sách các ngày duy nhất có mẻ xuống lúa
      const validDates: string[] = Array.from(
        new Set(
          tmBatchesInMonth
            .map((b) => b.dischargeDate || b.dryDate || b.weighDate)
            .filter((d): d is string => Boolean(d))
        )
      ).sort((a: string, b: string) => {
        const [d1 = 1, m1 = 1, y1 = 2026] = (a || '').split('/').map(Number);
        const [d2 = 1, m2 = 1, y2 = 2026] = (b || '').split('/').map(Number);
        const dt1 = new Date(y1, m1 - 1, d1).getTime();
        const dt2 = new Date(y2, m2 - 1, d2).getTime();
        return dt1 - dt2;
      });

      if (validDates.length === 0) {
        setRows([
          {
            ...newDayRow(monthKey ? `01/${monthKey}` : ''),
            priceCoTro: masterPriceCoTro,
            priceKhongTro: masterPriceKhongTro,
          },
        ]);
        setDetailRow(null);
        return;
      }

      const newRows: NSXTMDayRow[] = validDates.map((d) => {
        const dayBatches = tmBatchesInMonth.filter(
          (b) => (b.dischargeDate || b.dryDate || b.weighDate) === d
        );

        let tonsCo = 0;
        let tonsKhong = 0;

        dayBatches.forEach((b) => {
          const t = b.roundedTons || roundRiceTons(b.dryWeightKg);
          const isCo = isJaponica(b.riceType);
          if (isCo) tonsCo += t;
          else tonsKhong += t;
        });

        const initialMode: 'coTro' | 'khongTro' | 'caHai' =
          tonsCo > 0 && tonsKhong > 0
            ? 'caHai'
            : tonsKhong > 0
            ? 'khongTro'
            : 'coTro';

        return {
          ...newDayRow(d),
          tonsCoTro: tonsCo,
          tonsKhongTro: tonsKhong,
          mode: initialMode,
          priceCoTro: masterPriceCoTro,
          priceKhongTro: masterPriceKhongTro,
        };
      });

      setRows(newRows);
      setDetailRow(null);
    },
    [masterPriceCoTro, masterPriceKhongTro]
  );

  // ─── 1. TỰ ĐỘNG NẠP DỮ LIỆU NỀN TỪ MASTER EXCEL FILE ─────────────────────
  useEffect(() => {
    let isMounted = true;
    async function loadMasterData() {
      setIsLoadingFile(true);
      setFileError('');
      try {
        const res = await fetch('/api/rice-payroll/parse', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ useSample: true }),
        });

        if (!res.ok) {
          throw new Error(`Máy chủ phản hồi mã lỗi ${res.status}`);
        }

        const data = await res.json();
        if (!isMounted) return;

        const loadedBatches: RiceBatch[] = data.batches || [];
        setLoadedFileName(data.fileName || 'THỊNH_TỔNG SỐ LIỆU NHẬP LÚA TƯƠI 2026');
        setAllBatches(loadedBatches);

        // Lấy danh sách tháng có mẻ tại NSX TM
        const tmMonths = getSortedMonthKeysFromDates(
          loadedBatches
            .filter((b) => isNSXTM(b.dryFacility) && (b.dischargeDate || b.dryDate || b.weighDate))
            .map((b) => b.dischargeDate || b.dryDate || b.weighDate)
        );

        const initialMonth = tmMonths.includes('10/2026')
          ? '10/2026'
          : tmMonths[0] || '10/2026';

        setSelectedMonthKey(initialMonth);
        populateMonthDays(initialMonth, loadedBatches);
      } catch (err: unknown) {
        if (!isMounted) return;
        setFileError((err as Error).message || 'Không thể tải dữ liệu mẻ lúa');
      } finally {
        if (isMounted) setIsLoadingFile(false);
      }
    }

    loadMasterData();
    return () => {
      isMounted = false;
    };
  }, [populateMonthDays]);

  // ─── 2. DANH SÁCH CÁC THÁNG CÓ MẺ XUẤT TẠI NSX TM ────────────────────────
  const availableMonths = useMemo(() => {
    const dates = allBatches
      .filter((b) => isNSXTM(b.dryFacility) && (b.dischargeDate || b.dryDate || b.weighDate))
      .map((b) => b.dischargeDate || b.dryDate || b.weighDate);

    const list = getSortedMonthKeysFromDates(dates);
    if (!list.includes('10/2026')) list.unshift('10/2026');
    return list;
  }, [allBatches]);

  // ─── 3. LỌC TOÀN BỘ MẺ LÚA TRONG THÁNG CHỌN CHO NSX TM ───────────────────
  const monthBatches = useMemo(() => {
    return allBatches.filter((b) => {
      if (!isNSXTM(b.dryFacility)) return false;
      const date = b.dischargeDate || b.dryDate || b.weighDate;
      return getMonthKeyFromDate(date) === selectedMonthKey;
    });
  }, [allBatches, selectedMonthKey]);

  // Chuyển tháng
  const handleSelectMonth = (newMonth: string) => {
    setSelectedMonthKey(newMonth);
    setBatchOverrides({});
    populateMonthDays(newMonth, allBatches);
  };

  // ─── 5. SỬA SỐ TẤN TRỰC TIẾP TRÊN DÒNG NGÀY (FIX BUG CẢ HAI) ──────────────
  const handleTonsChange = useCallback(
    (rowId: string, field: 'coTro' | 'khongTro', valStr: string) => {
      const val = valStr === '' ? 0 : Math.max(0, Number(valStr));
      const targetRow = rows.find((r) => r.id === rowId);
      if (!targetRow) return;

      // Ưu tiên mode đã lưu trong targetRow.mode (không để bị reset khi sửa số)
      const currentMode: 'coTro' | 'khongTro' | 'caHai' =
        targetRow.mode ??
        (targetRow.tonsCoTro > 0 && targetRow.tonsKhongTro > 0
          ? 'caHai'
          : targetRow.tonsKhongTro > 0 && targetRow.tonsCoTro === 0
          ? 'khongTro'
          : targetRow.tonsCoTro > 0 && targetRow.tonsKhongTro === 0
          ? 'coTro'
          : field === 'coTro'
          ? 'coTro'
          : 'khongTro');

      let newCo = targetRow.tonsCoTro;
      let newKhong = targetRow.tonsKhongTro;

      if (currentMode === 'coTro') {
        newCo = val;
        newKhong = 0;
      } else if (currentMode === 'khongTro') {
        newKhong = val;
        newCo = 0;
      } else {
        // 'caHai': Cho phép người dùng sửa độc lập từng ô, KHÔNG BAO GIỜ xóa ô còn lại!
        if (field === 'coTro') {
          newCo = val;
        } else {
          newKhong = val;
        }
      }

      setRows((prev) =>
        prev.map((r) =>
          r.id === rowId
            ? {
                ...r,
                tonsCoTro: newCo,
                tonsKhongTro: newKhong,
                mode: currentMode,
              }
            : r
        )
      );
    },
    [rows]
  );

  // Đổi mode Có trở / Không trở / Cả hai cho 1 ngày
  const handleSetRowMode = useCallback(
    (rowId: string, newMode: 'coTro' | 'khongTro' | 'caHai', dayFileTons: number) => {
      const targetRow = rows.find((r) => r.id === rowId);
      const total =
        (targetRow ? targetRow.tonsCoTro + targetRow.tonsKhongTro : 0) ||
        (dayFileTons > 0 ? dayFileTons : 0);

      let newCo = 0;
      let newKhong = 0;

      if (newMode === 'coTro') {
        newCo = total;
        newKhong = 0;
      } else if (newMode === 'khongTro') {
        newCo = 0;
        newKhong = total;
      } else {
        // 'caHai': Giữ nguyên cả 2 ô hoặc chia đôi
        if (targetRow && targetRow.tonsCoTro > 0 && targetRow.tonsKhongTro > 0) {
          newCo = targetRow.tonsCoTro;
          newKhong = targetRow.tonsKhongTro;
        } else if (targetRow && targetRow.tonsCoTro > 0) {
          newCo = targetRow.tonsCoTro;
          newKhong = 0;
        } else if (targetRow && targetRow.tonsKhongTro > 0) {
          newCo = 0;
          newKhong = targetRow.tonsKhongTro;
        } else {
          newCo = Math.round(total / 2);
          newKhong = Math.max(0, total - newCo);
        }
      }

      setRows((prev) =>
        prev.map((r) =>
          r.id === rowId
            ? {
                ...r,
                tonsCoTro: newCo,
                tonsKhongTro: newKhong,
                mode: newMode,
              }
            : r
        )
      );
    },
    [rows]
  );

  // ─── 6. CHỈNH SỬA TỪNG MẺ LÚA TRONG TAB 2 (CHI TIẾT MẺ TỪ FILE) ───────────
  const handleBatchToggleCoTro = (batchId: string, currentIsCoTro: boolean) => {
    const nextIsCo = !currentIsCoTro;
    setBatchOverrides((prev) => ({
      ...prev,
      [batchId]: {
        isCoTro: nextIsCo,
        tons: prev[batchId]?.tons,
      },
    }));
  };

  const handleBatchTonsChange = (batchId: string, tonsVal: number) => {
    const safeTons = Math.max(0, tonsVal);
    setBatchOverrides((prev) => ({
      ...prev,
      [batchId]: {
        isCoTro: prev[batchId]?.isCoTro ?? false,
        tons: safeTons,
      },
    }));
  };

  // Tự động gán toàn bộ mẻ theo giống lúa (Japonica 17k, Nếp/Lúa khác 11k)
  const handleAutoClassifyByRiceType = () => {
    const next: Record<string, { isCoTro: boolean; tons?: number }> = {};
    monthBatches.forEach((b) => {
      next[b.id] = {
        isCoTro: isJaponica(b.riceType),
        tons: batchOverrides[b.id]?.tons ?? (b.roundedTons || roundRiceTons(b.dryWeightKg)),
      };
    });
    setBatchOverrides(next);
    populateMonthDays(selectedMonthKey, allBatches);
    showToast('Đã tự động gán toàn bộ mẻ theo giống lúa chuẩn!');
  };

  // ─── 7. CHUYỂN ĐỔI MẺ TRONG THÁNG THÀNH XuatNSXTMEntry ĐẦY ĐỦ ─────────────
  const fullMonthEntries: XuatNSXTMEntry[] = useMemo(() => {
    return monthBatches.map((b) => {
      const ov = batchOverrides[b.id];
      return batchToXuatNSXTMEntry(b, ov);
    });
  }, [monthBatches, batchOverrides]);

  // ─── 8. TÍNH BẢNG TỔNG HỢP KPI KHỚP SHEET 2 ──────────────────────────────
  const summary: XuatNSXTMSummary = useMemo(() => {
    let totalTonsCo = 0;
    let totalTonsKhong = 0;

    rows.forEach((r) => {
      totalTonsCo += r.tonsCoTro || 0;
      totalTonsKhong += r.tonsKhongTro || 0;
    });

    let tonsChumLua = 0;
    let tonsChumNep = 0;
    const tonsVoBon = totalTonsCo + totalTonsKhong;

    if (fullMonthEntries.length > 0) {
      fullMonthEntries.forEach((e) => {
        if (isNep(e.loaiLua)) {
          tonsChumNep += e.soLuongTan;
        } else {
          tonsChumLua += e.soLuongTan;
        }
      });
      const batchTotal = fullMonthEntries.reduce((s, e) => s + e.soLuongTan, 0);
      if (batchTotal > 0 && tonsVoBon > 0 && tonsVoBon !== batchTotal) {
        const ratio = tonsVoBon / batchTotal;
        tonsChumLua = Math.round(tonsChumLua * ratio);
        tonsChumNep = Math.max(0, tonsVoBon - tonsChumLua);
      }
    } else {
      tonsChumLua = totalTonsCo;
      tonsChumNep = totalTonsKhong;
    }

    const thanhTienCoTro = totalTonsCo * masterPriceCoTro;
    const thanhTienKhongTro = totalTonsKhong * masterPriceKhongTro;
    const thanhTienChumLua = tonsChumLua * 8000;
    const thanhTienChumNep = tonsChumNep * 11000;
    const thanhTienVoBon = tonsVoBon * 3000;

    const tongCong =
      thanhTienCoTro + thanhTienKhongTro + thanhTienChumLua + thanhTienChumNep + thanhTienVoBon;
    const conLai = Math.max(0, tongCong - tamUng);

    const totalKg = fullMonthEntries.reduce((s, e) => s + (e.canNhapSayKg || 0), 0);

    return {
      monthKey: selectedMonthKey,
      totalRows: fullMonthEntries.length,
      totalKg,
      totalTons: tonsVoBon,
      tonsCoTro: totalTonsCo,
      priceCoTro: masterPriceCoTro,
      thanhTienCoTro,
      tonsKhongTro: totalTonsKhong,
      priceKhongTro: masterPriceKhongTro,
      thanhTienKhongTro,
      tonsChumLua,
      priceChumLua: 8000,
      thanhTienChumLua,
      tonsChumNep,
      priceChumNep: 11000,
      thanhTienChumNep,
      tonsVoBon,
      priceVoBon: 3000,
      thanhTienVoBon,
      tongCong,
      tamUng,
      conLai,
    };
  }, [rows, fullMonthEntries, selectedMonthKey, masterPriceCoTro, masterPriceKhongTro, tamUng]);

  // ─── 9. XUẤT FILE EXCEL CHUẨN 2 SHEET ─────────────────────────────────────
  const handleExportExcel = async () => {
    if (fullMonthEntries.length === 0) {
      alert(`Không có mẻ lúa NSX TM nào trong tháng ${selectedMonthKey} để xuất file`);
      return;
    }

    setIsExporting(true);
    setExportError(null);

    const payload: XuatNSXTMExportPayload = {
      monthKey: selectedMonthKey,
      entries: fullMonthEntries,
      summary,
      nguoiLapBang,
      nguoiXacNhan,
      tamUng,
    };

    try {
      const res = await fetch('/api/rice-payroll/xuat-nsx-tm-export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Lỗi khi tạo file Excel');
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const [m, y] = selectedMonthKey.split('/');
      a.download = `LUONG_DOI_NAM-XUAT_NSX_DTM_T${m.padStart(2, '0')}_${y}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);

      showToast(`Đã xuất file Excel Tháng ${selectedMonthKey} thành công!`);
    } catch (err: unknown) {
      console.error(err);
      setExportError((err as Error).message || 'Lỗi xuất file Excel');
    } finally {
      setIsExporting(false);
    }
  };

  // ─── 10. TẢI FILE EXCEL MỚI LÊN ──────────────────────────────────────────
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsLoadingFile(true);
    setFileError('');

    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch('/api/rice-payroll/parse', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Lỗi khi phân tích file');
      }

      const loadedBatches: RiceBatch[] = data.batches || [];
      setLoadedFileName(file.name);
      setAllBatches(loadedBatches);

      const tmMonths = getSortedMonthKeysFromDates(
        loadedBatches
          .filter((b) => isNSXTM(b.dryFacility) && (b.dischargeDate || b.dryDate || b.weighDate))
          .map((b) => b.dischargeDate || b.dryDate || b.weighDate)
      );

      const nextMonth = tmMonths[0] || '10/2026';
      setSelectedMonthKey(nextMonth);
      populateMonthDays(nextMonth, loadedBatches);
      showToast(`Tải file ${file.name} thành công! Có ${loadedBatches.length} mẻ.`);
    } catch (err: unknown) {
      console.error(err);
      setFileError((err as Error).message || 'Lỗi đọc file Excel');
    } finally {
      setIsLoadingFile(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <div className="space-y-6 pb-24">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-5 right-5 z-50 flex items-center gap-3 rounded-2xl bg-slate-900/95 px-5 py-3 text-sm font-semibold text-white shadow-2xl backdrop-blur-md animate-in fade-in slide-in-from-top-3 border border-white/10">
          <span className="text-emerald-400 text-lg">✅</span>
          <span>{toastMessage}</span>
        </div>
      )}

      {/* ─── Hero Header & Công Cụ ─────────────────────────────────────────── */}
      <div className="rounded-3xl border border-slate-200/80 bg-white p-5 sm:p-6 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-xl bg-amber-500/10 p-2 text-2xl text-amber-700">🚛</span>
              <h1 className="text-xl sm:text-2xl font-black tracking-tight text-slate-900">
                Xuống Lúa / Xuất Lúa NSX Tân Mỹ (Đội Nam)
              </h1>
              <span className="rounded-full bg-amber-100 px-3 py-0.5 text-xs font-black text-amber-800 border border-amber-300">
                NSX TM • ĐỘI NAM
              </span>
            </div>
            <p className="text-xs sm:text-sm text-slate-500 max-w-3xl">
              Hệ thống theo dõi chi tiết từng mẻ xuống lúa khô, phân loại tự động <strong>Japonica (17k)</strong>,{' '}
              <strong>Nếp / Lúa thường (11k)</strong>, <strong>Chụm lò (8k & 11k)</strong> và <strong>Vô bồn (3k)</strong>{' '}
              khớp 100% biểu mẫu công ty, tính được mọi tháng trong năm.
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileUpload}
              accept=".xlsx,.xls"
              className="hidden"
            />

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isLoadingFile}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 shadow-2xs hover:bg-slate-50 transition active:scale-95 cursor-pointer disabled:opacity-50"
            >
              <span>📁</span>
              <span>{isLoadingFile ? 'Đang đọc...' : 'Tải File Excel Mới'}</span>
            </button>

            <button
              type="button"
              onClick={handleAutoClassifyByRiceType}
              className="inline-flex items-center gap-1.5 rounded-xl border border-blue-200 bg-blue-50/70 px-3.5 py-2 text-xs font-bold text-blue-700 hover:bg-blue-100 transition active:scale-95 cursor-pointer"
              title="Tự động phân loại mẻ theo giống lúa: Japonica -> 17k, Nếp/Khác -> 11k"
            >
              <span>⚡</span>
              <span>Tự Động Tính Theo File Lúa</span>
            </button>

            <button
              type="button"
              onClick={() => setShowConfigModal(true)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 transition active:scale-95 cursor-pointer"
            >
              <span>⚙️</span>
              <span>Chữ Ký & Tạm Ứng</span>
            </button>

            <button
              type="button"
              onClick={handleExportExcel}
              disabled={isExporting || fullMonthEntries.length === 0}
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 px-4 py-2 text-xs font-bold text-white shadow-md hover:from-emerald-700 hover:to-teal-700 transition active:scale-95 cursor-pointer disabled:opacity-50"
            >
              <span>📥</span>
              <span>{isExporting ? 'Đang xuất...' : `Xuất File Excel T${selectedMonthKey}`}</span>
            </button>
          </div>
        </div>

        {/* Nguồn file & Thanh chọn tháng */}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3 text-xs text-slate-500">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-slate-700">File nguồn:</span>
            <span className="rounded-md bg-slate-100 px-2 py-0.5 font-mono text-[11px] text-slate-700 border border-slate-200">
              {loadedFileName || 'Đang tải file mẫu...'}
            </span>
            <span className="text-slate-400">
              • Tổng cộng: {allBatches.length} mẻ • NSX TM: {monthBatches.length} mẻ trong tháng {selectedMonthKey}
            </span>
          </div>

          {/* Month Selector Dropdown */}
          <div className="flex items-center gap-2">
            <span className="font-bold text-slate-700">Chọn Tháng:</span>
            <select
              value={selectedMonthKey}
              onChange={(e) => handleSelectMonth(e.target.value)}
              className="rounded-xl border-2 border-amber-500 bg-amber-50/60 px-3 py-1.5 text-xs font-extrabold text-amber-900 focus:outline-hidden cursor-pointer"
            >
              {availableMonths.map((m) => {
                const count = allBatches.filter(
                  (b) =>
                    isNSXTM(b.dryFacility) &&
                    getMonthKeyFromDate(b.dischargeDate || b.dryDate || b.weighDate) === m
                ).length;
                return (
                  <option key={m} value={m}>
                    Tháng {m} ({count} mẻ)
                  </option>
                );
              })}
            </select>
          </div>
        </div>

        {fileError && (
          <div className="mt-3 rounded-xl bg-rose-50 p-3 text-xs font-medium text-rose-700 border border-rose-200">
            ⚠️ {fileError}
          </div>
        )}
        {exportError && (
          <div className="mt-3 rounded-xl bg-rose-50 p-3 text-xs font-medium text-rose-700 border border-rose-200">
            ⚠️ {exportError}
          </div>
        )}
      </div>

      {/* ─── BẢNG TỔNG HỢP KPI (KHỚP SHEET 2 CHI LƯƠNG ĐỘI NAM) ───────────── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {/* Card 1: Tổng tấn */}
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs">
          <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
            Tổng Tấn Xuống
          </div>
          <div className="mt-1 text-2xl font-black text-slate-900">
            {formatVND(summary.totalTons)} <span className="text-xs font-bold text-slate-500">tấn</span>
          </div>
          <div className="mt-1 text-[11px] text-slate-400">
            {formatVND(summary.totalKg)} kg • {summary.totalRows} mẻ
          </div>
        </div>

        {/* Card 2: Xuất có trở (Japonica) */}
        <div className="rounded-2xl border border-blue-200 bg-blue-50/50 p-4 shadow-2xs">
          <div className="text-[11px] font-bold text-blue-700 uppercase tracking-wider">
            Xuất Có Trở (17k)
          </div>
          <div className="mt-1 text-2xl font-black text-blue-900">
            {formatVND(summary.tonsCoTro)} <span className="text-xs font-bold text-blue-700">tấn</span>
          </div>
          <div className="mt-1 text-xs font-bold text-blue-700">
            = {formatVND(summary.thanhTienCoTro)} đ
          </div>
        </div>

        {/* Card 3: Xuất không trở (Nếp / Lúa khác) */}
        <div className="rounded-2xl border border-amber-200 bg-amber-50/50 p-4 shadow-2xs">
          <div className="text-[11px] font-bold text-amber-800 uppercase tracking-wider">
            Xuất Không Trở (11k)
          </div>
          <div className="mt-1 text-2xl font-black text-amber-900">
            {formatVND(summary.tonsKhongTro)} <span className="text-xs font-bold text-amber-800">tấn</span>
          </div>
          <div className="mt-1 text-xs font-bold text-amber-800">
            = {formatVND(summary.thanhTienKhongTro)} đ
          </div>
        </div>

        {/* Card 4: Chụm lò (Lúa 8k + Nếp 11k) */}
        <div className="rounded-2xl border border-rose-200 bg-rose-50/50 p-4 shadow-2xs">
          <div className="text-[11px] font-bold text-rose-800 uppercase tracking-wider">
            Chụm Lò (8k & 11k)
          </div>
          <div className="mt-1 text-lg font-black text-rose-900">
            {formatVND(summary.tonsChumLua)}t <span className="text-xs font-semibold text-rose-600">(Lúa)</span> + {formatVND(summary.tonsChumNep)}t <span className="text-xs font-semibold text-rose-600">(Nếp)</span>
          </div>
          <div className="mt-1 text-xs font-bold text-rose-800">
            = {formatVND(summary.thanhTienChumLua + summary.thanhTienChumNep)} đ
          </div>
        </div>

        {/* Card 5: Vô bồn (3k) */}
        <div className="rounded-2xl border border-purple-200 bg-purple-50/50 p-4 shadow-2xs">
          <div className="text-[11px] font-bold text-purple-800 uppercase tracking-wider">
            Vô Bồn (3k)
          </div>
          <div className="mt-1 text-2xl font-black text-purple-900">
            {formatVND(summary.tonsVoBon)} <span className="text-xs font-bold text-purple-800">tấn</span>
          </div>
          <div className="mt-1 text-xs font-bold text-purple-800">
            = {formatVND(summary.thanhTienVoBon)} đ
          </div>
        </div>

        {/* Card 6: Tổng cộng tiền lương (Hero) */}
        <div className="rounded-2xl border-2 border-emerald-500 bg-gradient-to-br from-emerald-50 to-teal-50 p-4 shadow-md">
          <div className="text-[11px] font-black text-emerald-800 uppercase tracking-wider flex items-center justify-between">
            <span>TỔNG CỘNG LƯƠNG</span>
            {tamUng > 0 && <span className="text-rose-600 text-[10px]">Đã ứng {formatVND(tamUng)}</span>}
          </div>
          <div className="mt-1 text-2xl font-black text-emerald-900">
            {formatVND(summary.tongCong)} <span className="text-xs font-bold text-emerald-700">đ</span>
          </div>
          <div className="mt-1 text-xs font-bold text-emerald-800 flex items-center justify-between">
            <span>Còn lại:</span>
            <span className="text-sm font-extrabold text-emerald-950 underline">{formatVND(summary.conLai)} đ</span>
          </div>
        </div>
      </div>

      {/* ─── 2 TABS CHUYỂN ĐỔI CHẾ ĐỘ XEM ─────────────────────────────────── */}
      <div className="flex items-center gap-2 rounded-2xl bg-slate-200/70 p-1.5 w-fit border border-slate-300">
        <button
          type="button"
          onClick={() => setActiveTab('notebook')}
          className={`flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-bold transition-all cursor-pointer ${
            activeTab === 'notebook'
              ? 'bg-white text-amber-900 shadow-xs'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <span>📝</span>
          <span>Bảng Lương Ngày • Đội Nam ({rows.length} ngày)</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('batches')}
          className={`flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-bold transition-all cursor-pointer ${
            activeTab === 'batches'
              ? 'bg-white text-blue-900 shadow-xs'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <span>🌾</span>
          <span>Chi Tiết Mẻ Lúa Từ File ({monthBatches.length} mẻ • NSX TM)</span>
        </button>
      </div>

      {/* ─── TAB 1: BẢNG LƯƠNG NGÀY (SỔ TAY ĐỘI NAM) ───────────────────────── */}
      {activeTab === 'notebook' && (
        <div className="rounded-3xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-3.5 bg-slate-50/70">
            <div className="flex items-center gap-2">
              <span className="text-base">📅</span>
              <h2 className="text-sm sm:text-base font-extrabold text-slate-800">
                Sổ Tay Bảng Lương Ngày Đội Nam • Tháng {selectedMonthKey}
              </h2>
              <span className="rounded-full bg-slate-200/80 px-2.5 py-0.5 text-xs font-bold text-slate-700">
                {rows.length} ngày
              </span>
            </div>

            <div className="text-xs text-slate-500">
              💡 Bấm nút <strong className="text-amber-800">Cả hai</strong> để nhập đồng thời số tấn Có trở &amp; Không trở mà không bị mất ô nhập!
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-100/80 text-[11px] font-bold text-slate-700 uppercase tracking-wider">
                  <th className="py-2.5 px-3 text-center w-12">STT</th>
                  <th className="py-2.5 px-3">Ngày Xuống Lúa</th>
                  <th className="py-2.5 px-3 text-center">Số Mẻ &amp; Tấn Gốc</th>
                  <th className="py-2.5 px-3 text-center w-64">Chế Độ Xuất</th>
                  <th className="py-2.5 px-3 text-center bg-amber-50/60 text-amber-900 border-x border-amber-200/60">
                    Tấn Có Trở (17k)
                  </th>
                  <th className="py-2.5 px-3 text-center bg-indigo-50/60 text-indigo-900 border-x border-indigo-200/60">
                    Tấn K.Trở (11k)
                  </th>
                  <th className="py-2.5 px-3 text-right">Thành Tiền Xuất</th>
                  <th className="py-2.5 px-3 text-right text-rose-900">Chụm Lò</th>
                  <th className="py-2.5 px-3 text-right text-purple-900">Vô Bồn</th>
                  <th className="py-2.5 px-3 text-right font-black text-slate-900 bg-slate-100">Tổng Ngày</th>
                  <th className="py-2.5 px-3 text-center w-24">Chi Tiết</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="py-12 text-center text-slate-400">
                      Không có ngày nào trong tháng này.
                    </td>
                  </tr>
                ) : (
                  rows.map((row, idx) => {
                    const dayBatches = monthBatches.filter(
                      (b) => (b.dischargeDate || b.dryDate || b.weighDate) === row.date
                    );
                    const originalTons = dayBatches.reduce(
                      (s, b) => s + (b.roundedTons || roundRiceTons(b.dryWeightKg)),
                      0
                    );

                    const rowMode =
                      row.mode ??
                      (row.tonsCoTro > 0 && row.tonsKhongTro > 0
                        ? 'caHai'
                        : row.tonsKhongTro > 0 && row.tonsCoTro === 0
                        ? 'khongTro'
                        : 'coTro');

                    const tienXuat =
                      row.tonsCoTro * row.priceCoTro + row.tonsKhongTro * row.priceKhongTro;

                    // Tính Chụm lò ngày
                    let dayChumLua = 0;
                    let dayChumNep = 0;
                    dayBatches.forEach((b) => {
                      const t = b.roundedTons || roundRiceTons(b.dryWeightKg);
                      if (isNep(b.riceType)) dayChumNep += t;
                      else dayChumLua += t;
                    });
                    const totalTonsRow = row.tonsCoTro + row.tonsKhongTro;
                    const tienChum = dayChumLua * 8000 + dayChumNep * 11000;
                    const tienVoBon = totalTonsRow * 3000;
                    const tongNgay = tienXuat + tienChum + tienVoBon;

                    return (
                      <tr key={row.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-2.5 px-3 text-center text-slate-400 font-mono text-[11px]">
                          {String(idx + 1).padStart(2, '0')}
                        </td>

                        <td className="py-2.5 px-3 font-bold text-slate-900 whitespace-nowrap">
                          {row.date || 'Chưa chọn'}
                        </td>

                        <td className="py-2.5 px-3 text-center whitespace-nowrap">
                          <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-700">
                            🌾 {dayBatches.length} mẻ • {originalTons}t gốc
                          </span>
                        </td>

                        {/* 3 Nút Chế độ xuất: Có trở | Không trở | Cả hai */}
                        <td className="py-2 px-3">
                          <div className="flex items-center p-0.5 rounded-lg bg-slate-100 border border-slate-200">
                            <button
                              type="button"
                              onClick={() => handleSetRowMode(row.id, 'coTro', originalTons)}
                              className={`flex-1 py-1 text-[10px] font-bold rounded-md transition cursor-pointer ${
                                rowMode === 'coTro'
                                  ? 'bg-amber-500 text-white shadow-2xs'
                                  : 'text-slate-600 hover:text-slate-900'
                              }`}
                            >
                              🌾 Có trở
                            </button>
                            <button
                              type="button"
                              onClick={() => handleSetRowMode(row.id, 'khongTro', originalTons)}
                              className={`flex-1 py-1 text-[10px] font-bold rounded-md transition cursor-pointer ${
                                rowMode === 'khongTro'
                                  ? 'bg-indigo-600 text-white shadow-2xs'
                                  : 'text-slate-600 hover:text-slate-900'
                              }`}
                            >
                              🌾 Không trở
                            </button>
                            <button
                              type="button"
                              onClick={() => handleSetRowMode(row.id, 'caHai', originalTons)}
                              className={`flex-1 py-1 text-[10px] font-bold rounded-md transition cursor-pointer ${
                                rowMode === 'caHai'
                                  ? 'bg-emerald-600 text-white shadow-2xs'
                                  : 'text-slate-600 hover:text-slate-900'
                              }`}
                            >
                              ⚖️ Cả hai
                            </button>
                          </div>
                        </td>

                        {/* Tấn Có Trở */}
                        <td className="py-1 px-2 text-center bg-amber-50/30 border-x border-amber-100">
                          {rowMode === 'khongTro' ? (
                            <div
                              onClick={() => handleSetRowMode(row.id, 'caHai', originalTons)}
                              className="w-full rounded-md border border-dashed border-slate-200 bg-slate-50/50 py-1 text-center font-bold text-slate-300 cursor-pointer hover:border-amber-400 hover:text-amber-800"
                              title="Bấm để bật Cả hai"
                            >
                              -
                            </div>
                          ) : (
                            <input
                              type="number"
                              min={0}
                              value={row.tonsCoTro === 0 ? '' : row.tonsCoTro}
                              onChange={(e) => handleTonsChange(row.id, 'coTro', e.target.value)}
                              placeholder="0"
                              className="w-20 rounded-md border border-amber-300 bg-white px-2 py-1 text-center font-bold text-amber-900 focus:border-amber-500 focus:outline-hidden"
                            />
                          )}
                        </td>

                        {/* Tấn Không Trở */}
                        <td className="py-1 px-2 text-center bg-indigo-50/30 border-x border-indigo-100">
                          {rowMode === 'coTro' ? (
                            <div
                              onClick={() => handleSetRowMode(row.id, 'caHai', originalTons)}
                              className="w-full rounded-md border border-dashed border-slate-200 bg-slate-50/50 py-1 text-center font-bold text-slate-300 cursor-pointer hover:border-indigo-400 hover:text-indigo-800"
                              title="Bấm để bật Cả hai"
                            >
                              -
                            </div>
                          ) : (
                            <input
                              type="number"
                              min={0}
                              value={row.tonsKhongTro === 0 ? '' : row.tonsKhongTro}
                              onChange={(e) => handleTonsChange(row.id, 'khongTro', e.target.value)}
                              placeholder="0"
                              className="w-20 rounded-md border border-indigo-300 bg-white px-2 py-1 text-center font-bold text-indigo-900 focus:border-indigo-500 focus:outline-hidden"
                            />
                          )}
                        </td>

                        {/* Tiền Xuất */}
                        <td className="py-2.5 px-3 text-right font-mono font-semibold text-slate-900 whitespace-nowrap">
                          {formatVND(tienXuat)} đ
                        </td>

                        {/* Chụm lò */}
                        <td className="py-2.5 px-3 text-right font-mono text-rose-900 whitespace-nowrap">
                          {formatVND(tienChum)} đ
                        </td>

                        {/* Vô bồn */}
                        <td className="py-2.5 px-3 text-right font-mono text-purple-900 whitespace-nowrap">
                          {formatVND(tienVoBon)} đ
                        </td>

                        {/* Tổng Ngày */}
                        <td className="py-2.5 px-3 text-right font-mono font-black text-slate-900 bg-slate-50 whitespace-nowrap">
                          {formatVND(tongNgay)} đ
                        </td>

                        {/* Xem chi tiết */}
                        <td className="py-2 px-2 text-center">
                          <button
                            type="button"
                            onClick={() => setDetailRow(row)}
                            className="rounded-lg bg-blue-50 px-2.5 py-1 text-[11px] font-bold text-blue-700 hover:bg-blue-100 transition cursor-pointer"
                          >
                            🔍 {dayBatches.length} mẻ
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ─── TAB 2: CHI TIẾT MẺ LÚA TỪ FILE (ĐẦY ĐỦ NHƯ CS1) ───────────────── */}
      {activeTab === 'batches' && (
        <div className="rounded-3xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-3.5 bg-slate-50/70">
            <div className="flex items-center gap-2">
              <span className="text-base">🌾</span>
              <h2 className="text-sm sm:text-base font-extrabold text-slate-800">
                Toàn Bộ Mẻ Lúa Thực Tế NSX TM • Tháng {selectedMonthKey}
              </h2>
              <span className="rounded-full bg-slate-200/80 px-2.5 py-0.5 text-xs font-bold text-slate-700">
                {fullMonthEntries.length} mẻ
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleAutoClassifyByRiceType}
                className="rounded-xl bg-blue-50 border border-blue-200 px-3 py-1.5 text-xs font-bold text-blue-700 hover:bg-blue-100 transition cursor-pointer"
              >
                ⚡ Gán Tự Động Theo Giống Lúa
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-100/80 text-[11px] font-bold text-slate-700 uppercase tracking-wider">
                  <th className="py-2.5 px-3 text-center w-12">STT</th>
                  <th className="py-2.5 px-3">Mã Lô</th>
                  <th className="py-2.5 px-3">Khách Hàng</th>
                  <th className="py-2.5 px-3">Giống Lúa</th>
                  <th className="py-2.5 px-3 text-right">Cân Nhập (kg)</th>
                  <th className="py-2.5 px-3 text-center bg-amber-50/60 text-amber-900 border-x border-amber-200/60">
                    Ngày Xuống Lúa
                  </th>
                  <th className="py-2.5 px-3 text-center">PT Chở</th>
                  <th className="py-2.5 px-3 text-right bg-emerald-50/60 text-emerald-900 border-x border-emerald-200/60">
                    Số Tấn
                  </th>
                  <th className="py-2.5 px-3 text-center">Phân Loại Xuất</th>
                  <th className="py-2.5 px-3 text-right">Đơn Giá Xuất</th>
                  <th className="py-2.5 px-3 text-right text-rose-900">Chụm Lò</th>
                  <th className="py-2.5 px-3 text-right text-purple-900">Vô Bồn</th>
                  <th className="py-2.5 px-3 text-right font-black text-slate-900 bg-slate-100">Thành Tiền</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {fullMonthEntries.length === 0 ? (
                  <tr>
                    <td colSpan={13} className="py-12 text-center text-slate-400">
                      Không có mẻ lúa NSX TM nào trong tháng {selectedMonthKey}.
                    </td>
                  </tr>
                ) : (
                  fullMonthEntries.map((row, idx) => {
                    const japonica = isJaponica(row.loaiLua);
                    const nep = isNep(row.loaiLua);
                    const isCoTro = row.donGiaCoTro > 0;

                    return (
                      <tr key={row.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-2.5 px-3 text-center text-slate-400 font-mono text-[11px]">
                          {String(idx + 1).padStart(2, '0')}
                        </td>

                        <td className="py-2.5 px-3 font-mono font-bold text-slate-800">
                          {row.maLo || '-'}
                        </td>

                        <td className="py-2.5 px-3 font-bold text-slate-900 whitespace-nowrap">
                          {row.khachHang}
                        </td>

                        <td className="py-2.5 px-3 whitespace-nowrap">
                          <span
                            className={`inline-block rounded-md px-2 py-0.5 text-[11px] font-bold ${
                              japonica
                                ? 'bg-blue-100 text-blue-900 border border-blue-300'
                                : nep
                                ? 'bg-amber-100 text-amber-900 border border-amber-300'
                                : 'bg-teal-100 text-teal-900 border border-teal-300'
                            }`}
                          >
                            {row.loaiLua}
                          </span>
                        </td>

                        <td className="py-2.5 px-3 text-right font-mono text-slate-600 whitespace-nowrap">
                          {row.canNhapSayKg ? formatVND(row.canNhapSayKg) : '-'}
                        </td>

                        <td className="py-2.5 px-3 text-center whitespace-nowrap font-bold text-amber-900 bg-amber-50/30 border-x border-amber-100">
                          {row.ngayXuongLuaKho || '-'}
                        </td>

                        <td className="py-2.5 px-3 text-center whitespace-nowrap text-slate-600">
                          {row.phuongTienChoLuaKho || 'VÔ BỒN'}
                        </td>

                        {/* Sửa số tấn mẻ trực tiếp */}
                        <td className="py-1 px-2 text-right bg-emerald-50/30 border-x border-emerald-100">
                          <input
                            type="number"
                            min={0}
                            value={row.soLuongTan}
                            onChange={(e) =>
                              handleBatchTonsChange(row.id, parseFloat(e.target.value) || 0)
                            }
                            className="w-16 rounded-md border border-slate-200 bg-white px-1.5 py-1 text-right font-bold text-emerald-900 focus:border-emerald-500 focus:outline-hidden"
                          />
                        </td>

                        {/* Toggle Có trở / Không trở */}
                        <td className="py-2 px-3 text-center">
                          <button
                            type="button"
                            onClick={() => handleBatchToggleCoTro(row.id, isCoTro)}
                            className={`rounded-lg px-2.5 py-1 text-[11px] font-bold transition cursor-pointer ${
                              isCoTro
                                ? 'bg-blue-600 text-white shadow-2xs'
                                : 'bg-amber-500 text-white shadow-2xs'
                            }`}
                          >
                            {isCoTro ? '🌾 Có trở (17k)' : '🌾 Không trở (11k)'}
                          </button>
                        </td>

                        <td className="py-2.5 px-3 text-right font-mono whitespace-nowrap">
                          {formatVND(isCoTro ? row.thanhTienCoTro : row.thanhTienKhongTro)} đ
                        </td>

                        <td className="py-2.5 px-3 text-right font-mono text-rose-900 whitespace-nowrap">
                          {formatVND(row.thanhTienChum)} đ
                        </td>

                        <td className="py-2.5 px-3 text-right font-mono text-purple-900 whitespace-nowrap">
                          {formatVND(row.thanhTienVoBon)} đ
                        </td>

                        <td className="py-2.5 px-3 text-right font-mono font-black text-slate-900 bg-slate-50 whitespace-nowrap">
                          {formatVND(row.tongThanhTien)} đ
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ─── MODAL XEM CHI TIẾT CÁC MẺ TRONG 1 NGÀY ──────────────────────────── */}
      {detailRow && (
        <div
          onClick={() => setDetailRow(null)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs animate-in fade-in"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-3xl rounded-3xl bg-white p-6 shadow-2xl border border-slate-200 max-h-[90vh] flex flex-col"
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-extrabold text-slate-900">
                  🌾 Chi Tiết Mẻ Xuống Lúa Ngày {detailRow.date}
                </h3>
                <p className="text-xs text-slate-500">
                  Các mẻ lúa thực tế của ngày này tại Nhà máy NSX Tân Mỹ
                </p>
              </div>
              <button
                type="button"
                onClick={() => setDetailRow(null)}
                className="text-slate-400 hover:text-slate-600 text-base font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="mt-4 flex-1 overflow-y-auto">
              {monthBatches.filter(
                (b) => (b.dischargeDate || b.dryDate || b.weighDate) === detailRow.date
              ).length === 0 ? (
                <div className="py-8 text-center text-xs text-slate-400">
                  Không có mẻ nào trong file lúa vào ngày này.
                </div>
              ) : (
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-bold text-slate-700">
                      <th className="py-2 px-3">Mã Lô</th>
                      <th className="py-2 px-3">Khách Hàng</th>
                      <th className="py-2 px-3">Giống Lúa</th>
                      <th className="py-2 px-3 text-right">Cân Nhập (kg)</th>
                      <th className="py-2 px-3 text-right">Số Tấn</th>
                      <th className="py-2 px-3 text-center">Phân Loại</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {monthBatches
                      .filter((b) => (b.dischargeDate || b.dryDate || b.weighDate) === detailRow.date)
                      .map((b) => {
                        const ov = batchOverrides[b.id];
                        const t = ov?.tons ?? (b.roundedTons || roundRiceTons(b.dryWeightKg));
                        const isCo = ov?.isCoTro ?? isJaponica(b.riceType);

                        return (
                          <tr key={b.id}>
                            <td className="py-2 px-3 font-mono font-bold text-slate-800">
                              {b.batchCode}
                            </td>
                            <td className="py-2 px-3 font-bold text-slate-900">{b.customerName}</td>
                            <td className="py-2 px-3">{b.riceType}</td>
                            <td className="py-2 px-3 text-right font-mono">
                              {formatVND(b.dryWeightKg)}
                            </td>
                            <td className="py-2 px-3 text-right font-mono font-bold text-emerald-800">
                              {t}t
                            </td>
                            <td className="py-2 px-3 text-center">
                              <span
                                className={`rounded-md px-2 py-0.5 text-[10px] font-bold ${
                                  isCo
                                    ? 'bg-blue-100 text-blue-900'
                                    : 'bg-amber-100 text-amber-900'
                                }`}
                              >
                                {isCo ? 'Có trở (17k)' : 'Không trở (11k)'}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              )}
            </div>

            <div className="mt-4 flex justify-end border-t border-slate-100 pt-3">
              <button
                type="button"
                onClick={() => setDetailRow(null)}
                className="rounded-xl bg-slate-900 px-4 py-2 text-xs font-bold text-white hover:bg-slate-800 transition cursor-pointer"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── MODAL CẤU HÌNH CHỮ KÝ & TẠM ỨNG ──────────────────────────────────── */}
      {showConfigModal && (
        <div
          onClick={() => setShowConfigModal(false)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs animate-in fade-in"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl border border-slate-200"
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-extrabold text-slate-900">
                ⚙️ Cấu Hình Chữ Ký &amp; Tạm Ứng
              </h3>
              <button
                type="button"
                onClick={() => setShowConfigModal(false)}
                className="text-slate-400 hover:text-slate-600 text-base font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="mt-4 space-y-4 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Người lập bảng (Ký cuối Sheet 1):
                </label>
                <input
                  type="text"
                  value={nguoiLapBang}
                  onChange={(e) => setNguoiLapBang(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 font-medium text-slate-900 focus:border-amber-500 focus:outline-hidden"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Xác nhận / Người duyệt:
                </label>
                <input
                  type="text"
                  value={nguoiXacNhan}
                  onChange={(e) => setNguoiXacNhan(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 font-medium text-slate-900 focus:border-amber-500 focus:outline-hidden"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Số tiền tạm ứng Đội Nam (VND) (Trừ vào Sheet 2):
                </label>
                <input
                  type="number"
                  value={tamUng}
                  onChange={(e) => setTamUng(parseFloat(e.target.value) || 0)}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 font-bold text-rose-700 focus:border-amber-500 focus:outline-hidden text-sm"
                />
              </div>

              <div className="rounded-xl bg-slate-50 p-3 text-slate-500 leading-relaxed">
                ℹ️ Thông tin này được ghi trực tiếp vào 2 Sheet của file Excel khi bạn nhấn <strong>Xuất File Excel</strong>.
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowConfigModal(false)}
                className="rounded-xl bg-amber-600 px-4 py-2 text-xs font-bold text-white hover:bg-amber-700 transition cursor-pointer"
              >
                Lưu &amp; Đóng
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
