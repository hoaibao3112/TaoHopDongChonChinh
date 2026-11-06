'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { RiceBatch, DailyReconciliationResult } from '@/lib/rice-payroll/types';
import { isCoSo1 } from '@/lib/rice-payroll/facility-filter';
import { getDefaultClassification, getDefaultTons } from '@/lib/rice-payroll/sample-classification';
import { roundRiceTons } from '@/lib/rice-payroll/rounding';
import { allocateSmartRiceTons } from '@/lib/rice-payroll/smart-round-allocation';

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Định dạng số tiền VND đồng nhất tuyệt đối giữa Server SSR và Client Browser,
 * loại bỏ hoàn toàn lỗi React Hydration Error #418 do khác biệt locale.
 */
function formatVND(val: number | null | undefined): string {
  if (val === null || val === undefined || isNaN(val)) return '0';
  return Math.round(val)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

// ─── Types ───────────────────────────────────────────────────────────────────

interface DayRow {
  id: string;
  date: string; // "30/09/2026"
  tonsCoTro: number;
  priceCoTro: number;
  tonsKhongTro: number;
  priceKhongTro: number;
  status: 'idle' | 'loading' | 'matched' | 'mismatch' | 'error';
  result: DailyReconciliationResult | null;
  errorMsg: string;
}

function newRow(date = ''): DayRow {
  return {
    id: Math.random().toString(36).slice(2),
    date,
    tonsCoTro: 0,
    priceCoTro: 20000,
    tonsKhongTro: 0,
    priceKhongTro: 16000,
    status: 'idle',
    result: null,
    errorMsg: '',
  };
}

/**
 * Tăng 1 ngày cho chuỗi DD/MM/YYYY (hỗ trợ chuyển giao qua tháng kế tiếp)
 */
function addOneDay(dateStr: string): string {
  if (!dateStr) return '';
  const parts = dateStr.split('/').map(Number);
  if (parts.length === 3 && !isNaN(parts[0]) && !isNaN(parts[1]) && !isNaN(parts[2])) {
    const dt = new Date(parts[2], parts[1] - 1, parts[0]);
    dt.setDate(dt.getDate() + 1);
    const d = String(dt.getDate()).padStart(2, '0');
    const m = String(dt.getMonth() + 1).padStart(2, '0');
    const y = dt.getFullYear();
    return `${d}/${m}/${y}`;
  }
  return '';
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: DayRow['status'] }) {
  if (status === 'idle')
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-500">
        ⬜ Chờ nhập
      </span>
    );
  if (status === 'loading')
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-1 text-[11px] font-semibold text-blue-600 animate-pulse">
        🔄 Đang ghép...
      </span>
    );
  if (status === 'matched')
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-bold text-emerald-700">
        ✅ Khớp 100%
      </span>
    );
  if (status === 'mismatch')
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-bold text-amber-700">
        ⚠️ Lệch số
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2.5 py-1 text-[11px] font-bold text-red-600">
      ❌ Lỗi
    </span>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export default function RicePayrollView() {
  // ── Dữ liệu nền (Tự động nạp sẵn) ──
  const [isLoadingFile, setIsLoadingFile] = useState(true);
  const [loadedFileName, setLoadedFileName] = useState<string>('');
  const [allBatches, setAllBatches] = useState<RiceBatch[]>([]);
  const [allDates, setAllDates] = useState<string[]>([]);
  const [fileError, setFileError] = useState('');
  const [showFileUploader, setShowFileUploader] = useState(false);

  // ── Chọn Tháng / Năm tính lương ──
  const [selectedMonthKey, setSelectedMonthKey] = useState<string>('10/2026'); // MM/YYYY

  // ── Đơn giá mặc định toàn tháng (Nhập 1 lần, tự động áp dụng cho tất cả các ngày) ──
  const [masterPriceCoTro, setMasterPriceCoTro] = useState<number>(20000);
  const [masterPriceKhongTro, setMasterPriceKhongTro] = useState<number>(16000);

  // ── Bảng ngày công trong tháng (Mặc định ngày 01/10/2026 ngay từ đầu) ──
  const [rows, setRows] = useState<DayRow[]>([newRow('01/10/2026')]);

  // ── Chế độ xem: 'notebook' (Sổ tay ngày Chú 6) hoặc 'batches' (🌾 Chi tiết mẻ lúa thực tế) ──
  const [activeTab, setActiveTab] = useState<'notebook' | 'batches'>('notebook');

  // ── Phân loại mẻ lúa thực tế (override thủ công của user) ──
  const [batchOverrides, setBatchOverrides] = useState<Record<string, { isCoTro: boolean; tons?: number }>>({});

  // ── Tự động cân đối số tấn (nhập Có trở tự tính Không trở và ngược lại) ──
  const [autoBalance, setAutoBalance] = useState<boolean>(true);

  // ── Tìm kiếm & lọc ở Tab mẻ lúa ──
  const [batchSearch, setBatchSearch] = useState('');
  const [batchFilterType, setBatchFilterType] = useState<'all' | 'coTro' | 'khongTro'>('all');

  // ── Chi tiết mẻ đang xem ──
  const [detailRow, setDetailRow] = useState<DayRow | null>(null);

  // ── Danh sách đã lưu tháng ──
  const [savedLogs, setSavedLogs] = useState<DailyReconciliationResult[]>([]);
  const [isExporting, setIsExporting] = useState(false);

  // Cơ sở mặc định
  const selectedFacility = 'Cơ sở 1';

  // ─── TỰ ĐỘNG NẠP DỮ LIỆU NỀN KHI MỞ TRANG ──────────────────────────────────
  const loadData = useCallback(async (useSample = true, file?: File) => {
    setIsLoadingFile(true);
    setFileError('');
    try {
      let res: Response;
      if (file) {
        const formData = new FormData();
        formData.append('file', file);
        res = await fetch('/api/rice-payroll/parse', { method: 'POST', body: formData });
      } else {
        res = await fetch('/api/rice-payroll/parse', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ useSample: true }),
        });
      }

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Lỗi khi nạp dữ liệu mẻ lúa');

      setLoadedFileName(data.fileName);
      setAllBatches(data.batches || []);
      setAllDates(data.dates || []);

      // Tìm tháng mới nhất có dữ liệu để chọn mặc định
      const months = new Set<string>();
      (data.dates || []).forEach((d: string) => {
        const parts = d.split('/');
        if (parts.length === 3) months.add(`${parts[1]}/${parts[2]}`);
      });
      const sortedMonths = Array.from(months).sort().reverse();
      if (sortedMonths.length > 0) {
        // Ưu tiên tháng 10/2026 hoặc 09/2026 nếu có
        if (sortedMonths.includes('10/2026')) {
          setSelectedMonthKey('10/2026');
        } else if (sortedMonths.includes('09/2026')) {
          setSelectedMonthKey('09/2026');
        } else {
          setSelectedMonthKey(sortedMonths[0]);
        }
      }
    } catch (err) {
      setFileError(err instanceof Error ? err.message : 'Không thể nạp dữ liệu');
    } finally {
      setIsLoadingFile(false);
    }
  }, []);

  useEffect(() => {
    loadData(true);
  }, [loadData]);

  
  // ─── Danh sách tất cả các ngày xuống lúa thực tế tại Cơ sở I ─────────────────
  const cs1DischargeDates = useMemo(() => {
    const set = new Set<string>();
    allBatches.forEach((b) => {
      if (isCoSo1(b.dryFacility) && b.dischargeDate) {
        set.add(b.dischargeDate);
      }
    });
    return Array.from(set).sort((a, b) => {
      const [d1, m1, y1] = a.split('/').map(Number);
      const [d2, m2, y2] = b.split('/').map(Number);
      return new Date(y1, m1 - 1, d1).getTime() - new Date(y2, m2 - 1, d2).getTime();
    });
  }, [allBatches]);

  // ─── Danh sách các tháng có lúa xuống tại Cơ sở I ─────────────────────────────
  const availableMonths = useMemo(() => {
    const set = new Set<string>();
    cs1DischargeDates.forEach((d) => {
      const parts = d.split('/');
      if (parts.length === 3) set.add(`${parts[1]}/${parts[2]}`);
    });
    return Array.from(set).sort().reverse(); // Mới nhất lên đầu
  }, [cs1DischargeDates]);

  // ─── Danh sách ngày thuộc tháng đang chọn (SẮP XẾP TĂNG DẦN: TỪ NGÀY 01 ĐẾN 30/31) ──
  const datesInSelectedMonth = useMemo(() => {
    if (!selectedMonthKey) return [];
    return cs1DischargeDates.filter((d) => d.endsWith(`/${selectedMonthKey}`));
  }, [cs1DischargeDates, selectedMonthKey]);

  // ─── Danh sách tất cả các mẻ lúa thực tế tại Cơ sở I thuộc tháng đang chọn ─────
  const monthBatches = useMemo(() => {
    if (!selectedMonthKey) return [];
    return allBatches.filter(
      (b) => isCoSo1(b.dryFacility) && (b.dischargeDate || '').endsWith(`/${selectedMonthKey}`)
    );
  }, [allBatches, selectedMonthKey]);

  // ─── TỰ ĐỘNG NẠP CÁC NGÀY XUẤT LÚA THỰC TẾ TRONG THÁNG TỪ FILE MASTER ──────────
  const populateMonthDays = useCallback(
    (monthKey: string, batches: RiceBatch[]) => {
      const isOct2026 = monthKey === '10/2026';
      const validDates = Array.from(
        new Set(
          batches
            .filter((b) => isCoSo1(b.dryFacility) && (b.dischargeDate || '').endsWith(`/${monthKey}`))
            .map((b) => b.dischargeDate)
        )
      ).sort((a, b) => {
        const [d1, m1, y1] = a.split('/').map(Number);
        const [d2, m2, y2] = b.split('/').map(Number);
        return new Date(y1, m1 - 1, d1).getTime() - new Date(y2, m2 - 1, d2).getTime();
      });

      if (validDates.length === 0) return;

      const newRows: DayRow[] = validDates.map((d) => {
        const dayBatches = batches.filter(
          (b) => isCoSo1(b.dryFacility) && b.dischargeDate === d
        );
        let tonsCo = 0;
        let tonsKhong = 0;

        if (isOct2026) {
          dayBatches.forEach((b) => {
            const isCo = getDefaultClassification(b);
            const t = getDefaultTons(b);
            if (isCo) tonsCo += t;
            else tonsKhong += t;
          });
        } else {
          // Các tháng khác: mặc định lấy tổng số tấn của ngày
          const dayTons = dayBatches.reduce((s, b) => s + b.roundedTons, 0);
          tonsCo = dayTons;
          tonsKhong = 0;
        }

        return {
          ...newRow(d),
          tonsCoTro: tonsCo,
          tonsKhongTro: tonsKhong,
          priceCoTro: masterPriceCoTro,
          priceKhongTro: masterPriceKhongTro,
        };
      });

      setRows(newRows);
      setDetailRow(null);
      setSavedLogs([]);
    },
    [masterPriceCoTro, masterPriceKhongTro]
  );

  // Khi nạp dữ liệu xong lần đầu hoặc khi có dữ liệu, tự động nạp các ngày công của tháng
  const hasInitializedRef = React.useRef(false);
  useEffect(() => {
    if (allBatches.length > 0 && selectedMonthKey && !hasInitializedRef.current) {
      hasInitializedRef.current = true;
      populateMonthDays(selectedMonthKey, allBatches);
    }
  }, [allBatches, selectedMonthKey, populateMonthDays]);

  // ─── Danh sách mẻ lúa hiển thị ở Tab 2 (theo tìm kiếm và bộ lọc) ────────────
  const filteredMonthBatches = useMemo(() => {
    return monthBatches.filter((b) => {
      // 1. Lọc theo text tìm kiếm (khách hàng, ghe, loại lúa, ngày)
      if (batchSearch) {
        const q = batchSearch.toLowerCase();
        const match =
          (b.customerName || '').toLowerCase().includes(q) ||
          (b.vehicleName || '').toLowerCase().includes(q) ||
          (b.dryVehicle || '').toLowerCase().includes(q) ||
          (b.riceType || '').toLowerCase().includes(q) ||
          (b.dischargeDate || '').includes(q);
        if (!match) return false;
      }
      // 2. Lọc theo loại Có trở / Không trở
      if (batchFilterType !== 'all') {
        const isCoTro =
          batchOverrides[b.id]?.isCoTro !== undefined
            ? batchOverrides[b.id].isCoTro
            : getDefaultClassification(b);
        if (batchFilterType === 'coTro' && !isCoTro) return false;
        if (batchFilterType === 'khongTro' && isCoTro) return false;
      }
      return true;
    });
  }, [monthBatches, batchSearch, batchFilterType, batchOverrides]);

  // ─── Danh sách ngày mở rộng (bao gồm cả các ngày cuối tháng trước & đầu tháng sau) ──
  const nearbyDates = useMemo(() => {
    if (!selectedMonthKey) return { current: [], prev: [], next: [] };
    const [currM, currY] = selectedMonthKey.split('/').map(Number);

    // Tháng trước
    const prevDate = new Date(currY, currM - 2, 1);
    const prevKey = `${String(prevDate.getMonth() + 1).padStart(2, '0')}/${prevDate.getFullYear()}`;
    const prevList = cs1DischargeDates.filter((d) => d.endsWith(`/${prevKey}`));
    const prevMonthDates = prevList.slice(-5); // 5 ngày cuối tháng trước

    // Tháng sau
    const nextDate = new Date(currY, currM, 1);
    const nextKey = `${String(nextDate.getMonth() + 1).padStart(2, '0')}/${nextDate.getFullYear()}`;
    const nextList = cs1DischargeDates.filter((d) => d.endsWith(`/${nextKey}`));
    const nextMonthDates = nextList.slice(0, 5); // 5 ngày đầu tháng sau

    return {
      current: datesInSelectedMonth,
      prev: prevMonthDates,
      next: nextMonthDates,
    };
  }, [cs1DischargeDates, selectedMonthKey, datesInSelectedMonth]);

  // Khi đổi tháng, tự động nạp toàn bộ các ngày làm việc thực tế từ file lúa
  const handleSelectMonth = (monthKey: string) => {
    setSelectedMonthKey(monthKey);
    populateMonthDays(monthKey, allBatches);
  };

  // ─── Thao tác bảng ngày & Cập nhật đơn giá toàn bộ ─────────────────────────

  const updateRow = useCallback((id: string, patch: Partial<DayRow>) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }, []);

  // Cập nhật số tấn Có trở / Không trở với tính năng tự động phân bổ làm tròn thông minh
  const handleTonsChange = useCallback(
    (rowId: string, field: 'coTro' | 'khongTro', valStr: string) => {
      const val = valStr === '' ? 0 : Math.max(0, Number(valStr));
      const targetRow = rows.find((r) => r.id === rowId);
      if (!targetRow) return;

      const dayBatches = monthBatches.filter((b) => b.dischargeDate === targetRow.date);
      const fileBaseTons = dayBatches.reduce((s, b) => s + (b.roundedTons || roundRiceTons(b.dryWeightKg)), 0);

      // Xác định mode hiện tại của dòng
      const currentMode =
        targetRow.tonsCoTro > 0 && targetRow.tonsKhongTro === 0
          ? 'coTro'
          : targetRow.tonsKhongTro > 0 && targetRow.tonsCoTro === 0
          ? 'khongTro'
          : targetRow.tonsCoTro > 0 && targetRow.tonsKhongTro > 0
          ? 'caHai'
          : field === 'coTro'
          ? 'coTro'
          : 'khongTro';

      let newCo = targetRow.tonsCoTro;
      let newKhong = targetRow.tonsKhongTro;

      if (currentMode === 'coTro') {
        newCo = val;
        newKhong = 0;
      } else if (currentMode === 'khongTro') {
        newKhong = val;
        newCo = 0;
      } else {
        // 'caHai'
        if (field === 'coTro') {
          newCo = val;
        } else {
          newKhong = val;
        }
      }

      const targetDayTotal = newCo + newKhong;

      // Nếu ngày đó có mẻ lúa thực tế trong file và targetDayTotal > 0:
      // Tự động tìm mẻ phù hợp nhất để làm tròn lên/xuống bù trừ cho khớp targetDayTotal
      if (dayBatches.length > 0 && targetDayTotal > 0) {
        const alloc = allocateSmartRiceTons(dayBatches, targetDayTotal);
        setBatchOverrides((prevOv) => {
          const next = { ...prevOv };
          dayBatches.forEach((b) => {
            const isCo =
              currentMode === 'coTro'
                ? true
                : currentMode === 'khongTro'
                ? false
                : (prevOv[b.id]?.isCoTro ?? getDefaultClassification(b));
            next[b.id] = {
              isCoTro: isCo,
              tons: alloc.batchOverrides[b.id]?.tons ?? b.roundedTons,
            };
          });
          return next;
        });
      }

      setRows((prev) =>
        prev.map((r) =>
          r.id === rowId
            ? {
                ...r,
                tonsCoTro: newCo,
                tonsKhongTro: newKhong,
                status: 'idle',
                errorMsg: '',
              }
            : r
        )
      );
    },
    [rows, monthBatches]
  );

  // Khôi phục số tấn của 1 ngày về đúng file gốc
  const handleResetDayTons = useCallback(
    (rowDate: string) => {
      const dayBatches = monthBatches.filter((b) => b.dischargeDate === rowDate);
      if (dayBatches.length === 0) return;

      // Xóa overrides của các mẻ trong ngày này để trở về file gốc
      setBatchOverrides((prev) => {
        const next = { ...prev };
        dayBatches.forEach((b) => {
          delete next[b.id];
        });
        return next;
      });

      // Đặt lại số tấn của dòng về chuẩn file gốc
      setRows((prev) =>
        prev.map((r) => {
          if (r.date !== rowDate) return r;
          const isOct2026 = selectedMonthKey === '10/2026';
          let sumCo = 0;
          let sumKhong = 0;

          if (isOct2026) {
            dayBatches.forEach((b) => {
              const isCo = getDefaultClassification(b);
              const t = getDefaultTons(b);
              if (isCo) sumCo += t;
              else sumKhong += t;
            });
          } else {
            sumCo = dayBatches.reduce((s, b) => s + b.roundedTons, 0);
            sumKhong = 0;
          }

          return {
            ...r,
            tonsCoTro: sumCo,
            tonsKhongTro: sumKhong,
            status: 'idle',
            errorMsg: '',
          };
        })
      );
    },
    [monthBatches, selectedMonthKey]
  );

  // Điều chỉnh số tấn trực tiếp của 1 mẻ lúa trong Tab 2
  const handleBatchTonsChange = useCallback(
    (batch: RiceBatch, newTonsVal: number) => {
      const tons = Math.max(0, newTonsVal);
      const isCoTro =
        batchOverrides[batch.id]?.isCoTro !== undefined
          ? batchOverrides[batch.id].isCoTro
          : getDefaultClassification(batch);

      setBatchOverrides((prev) => ({
        ...prev,
        [batch.id]: { isCoTro, tons },
      }));

      // Đồng bộ về dòng Sổ tay ngày tương ứng
      if (batch.dischargeDate) {
        setRows((prevRows) =>
          prevRows.map((r) => {
            if (r.date !== batch.dischargeDate) return r;
            const dayBatches = monthBatches.filter((b) => b.dischargeDate === r.date);
            let sumCo = 0;
            let sumKhong = 0;

            dayBatches.forEach((b) => {
              const bTons = b.id === batch.id ? tons : (batchOverrides[b.id]?.tons ?? getDefaultTons(b));
              const bIsCo =
                b.id === batch.id
                  ? isCoTro
                  : batchOverrides[b.id]?.isCoTro !== undefined
                  ? batchOverrides[b.id].isCoTro
                  : getDefaultClassification(b);
              if (bIsCo) sumCo += bTons;
              else sumKhong += bTons;
            });

            return {
              ...r,
              tonsCoTro: sumCo,
              tonsKhongTro: sumKhong,
              status: 'idle',
              errorMsg: '',
            };
          })
        );
      }
    },
    [batchOverrides, monthBatches]
  );

  // Chọn chế độ xuất cho ngày: 'coTro' (100% Có trở) | 'khongTro' (100% Không trở) | 'caHai' (Chia cả 2)
  const handleSetRowMode = useCallback(
    (rowId: string, newMode: 'coTro' | 'khongTro' | 'caHai', dayFileTons: number, rowDate: string) => {
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
        // 'caHai': nếu 1 bên đang = 0, chia 50/50 để user dễ gõ tiếp
        if (targetRow && targetRow.tonsCoTro > 0 && targetRow.tonsKhongTro > 0) {
          newCo = targetRow.tonsCoTro;
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
                status: 'idle',
                errorMsg: '',
              }
            : r
        )
      );

      // Đồng bộ sang mẻ lúa thực tế trong ngày (nếu chọn 100% Có hoặc 100% Không)
      if (rowDate && (newMode === 'coTro' || newMode === 'khongTro')) {
        const dayBatches = monthBatches.filter((b) => b.dischargeDate === rowDate);
        if (dayBatches.length > 0) {
          setBatchOverrides((prev) => {
            const next = { ...prev };
            dayBatches.forEach((b) => {
              next[b.id] = {
                isCoTro: newMode === 'coTro',
                tons: prev[b.id]?.tons ?? getDefaultTons(b),
              };
            });
            return next;
          });
        }
      }
    },
    [rows, monthBatches]
  );

  // Chuyển đổi phân loại của một mẻ lúa thực tế và đồng bộ tự động về Sổ tay ngày
  const handleToggleBatch = useCallback(
    (batch: RiceBatch, newIsCoTro: boolean) => {
      const tons = batchOverrides[batch.id]?.tons ?? getDefaultTons(batch);
      setBatchOverrides((prev) => ({
        ...prev,
        [batch.id]: { isCoTro: newIsCoTro, tons },
      }));

      // Cập nhật lại số tấn tương ứng trong bảng Sổ tay ngày
      if (batch.dischargeDate) {
        setRows((prevRows) => {
          return prevRows.map((r) => {
            if (r.date !== batch.dischargeDate) return r;

            const dayBatches = monthBatches.filter((b) => b.dischargeDate === r.date);
            let sumCo = 0;
            let sumKhong = 0;

            dayBatches.forEach((b) => {
              const bTons = b.id === batch.id ? tons : (batchOverrides[b.id]?.tons ?? getDefaultTons(b));
              const bIsCo =
                b.id === batch.id
                  ? newIsCoTro
                  : batchOverrides[b.id]?.isCoTro !== undefined
                  ? batchOverrides[b.id].isCoTro
                  : getDefaultClassification(b);
              if (bIsCo) sumCo += bTons;
              else sumKhong += bTons;
            });

            return {
              ...r,
              tonsCoTro: sumCo,
              tonsKhongTro: sumKhong,
              status: 'idle',
              errorMsg: '',
            };
          });
        });
      }
    },
    [batchOverrides, monthBatches]
  );

  // Gán hàng loạt toàn bộ mẻ trong tháng thành Có trở hoặc Không trở
  const handleSetAllBatches = useCallback(
    (newIsCoTro: boolean) => {
      const nextOverrides: Record<string, { isCoTro: boolean; tons?: number }> = {};
      monthBatches.forEach((b) => {
        nextOverrides[b.id] = {
          isCoTro: newIsCoTro,
          tons: batchOverrides[b.id]?.tons ?? getDefaultTons(b),
        };
      });
      setBatchOverrides(nextOverrides);

      // Cập nhật tất cả các ngày trong Sổ tay
      setRows((prevRows) =>
        prevRows.map((r) => {
          const dayBatches = monthBatches.filter((b) => b.dischargeDate === r.date);
          const dayTons = dayBatches.reduce(
            (s, b) => s + (nextOverrides[b.id]?.tons ?? getDefaultTons(b)),
            0
          );
          return {
            ...r,
            tonsCoTro: newIsCoTro ? dayTons : 0,
            tonsKhongTro: newIsCoTro ? 0 : dayTons,
            status: 'idle',
            errorMsg: '',
          };
        })
      );
    },
    [monthBatches, batchOverrides]
  );

  // Khôi phục tất cả mẻ về phân loại chuẩn mẫu tháng 10
  const handleResetBatchesToSample = useCallback(() => {
    setBatchOverrides({});
    populateMonthDays(selectedMonthKey, allBatches);
  }, [populateMonthDays, selectedMonthKey, allBatches]);

  // Thay đổi đơn giá áp dụng cho TẤT CẢ các dòng trong tháng
  const handleMasterPriceChange = (type: 'coTro' | 'khongTro', newPrice: number) => {
    if (type === 'coTro') {
      setMasterPriceCoTro(newPrice);
      setRows((prev) => prev.map((r) => ({ ...r, priceCoTro: newPrice })));
    } else {
      setMasterPriceKhongTro(newPrice);
      setRows((prev) => prev.map((r) => ({ ...r, priceKhongTro: newPrice })));
    }
  };

  // Thêm ngày: Tự động tăng lên 1 ngày và tự động kế thừa đơn giá đã cài đặt
  const addRow = () => {
    const lastRow = rows[rows.length - 1];
    let nextDate = '';
    if (lastRow?.date) {
      nextDate = addOneDay(lastRow.date);
    } else if (datesInSelectedMonth.length > 0) {
      nextDate = datesInSelectedMonth[0];
    } else {
      nextDate = `01/${selectedMonthKey}`;
    }
    setRows((prev) => [
      ...prev,
      {
        ...newRow(nextDate),
        priceCoTro: masterPriceCoTro,
        priceKhongTro: masterPriceKhongTro,
      },
    ]);
  };

  const removeRow = (id: string) => {
    setRows((prev) => prev.filter((r) => r.id !== id));
    if (detailRow?.id === id) setDetailRow(null);
  };

  // ─── LỌC MẺ LÚA CHO ĐỘI CHÚ 6 THANH ─────────────────────────────────────────
  // Quy tắc nghiệp vụ bắt buộc:
  // 1. Chỉ lọc tại CƠ SỞ I (Cơ sở 1)
  // 2. Bắt buộc so khớp theo đúng cột "NGÀY XUỐNG LÚA KHÔ (NHẬN XUẤT TRẢ)" (b.dischargeDate)
  // 3. Số tấn được làm tròn từ cột "CÂN NHẬP SẤY (KG)" (>= 333 kg làm tròn lên)
  const getDayBatches = (date: string) =>
    allBatches.filter((b) => {
      // 1. Phải là Cơ sở I
      if (!isCoSo1(b.dryFacility)) return false;

      // 2. Chú 6 Thanh là Đội Xuất Lúa: Bắt buộc so khớp theo đúng cột "NGÀY XUỐNG LÚA KHÔ (NHẬN XUẤT TRẢ)"
      // Tuyệt đối không lấy ngày nhập sấy hay ngày cân tươi
      return b.dischargeDate === date;
    });

  // ─── Ghép mẻ 1 ngày ───────────────────────────────────────────────────────
  const handleReconcileRow = async (row: DayRow) => {
    const effectiveDate = row.date && row.date.trim() ? row.date.trim() : (datesInSelectedMonth[0] || `01/${selectedMonthKey}`);
    if (!row.date || !row.date.trim()) {
      updateRow(row.id, { date: effectiveDate });
    }
    const dayBatches = getDayBatches(effectiveDate);
    if (dayBatches.length === 0) {
      updateRow(row.id, {
        status: 'error',
        errorMsg: `Không có mẻ lúa nào tại ${selectedFacility} ngày ${effectiveDate}`,
      });
      return;
    }
    updateRow(row.id, { status: 'loading', errorMsg: '' });
    try {
      const res = await fetch('/api/rice-payroll/reconcile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          batches: dayBatches,
          report: {
            date: row.date,
            tonsCoTro: row.tonsCoTro,
            unitPriceCoTro: row.priceCoTro,
            tonsKhongTro: row.tonsKhongTro,
            unitPriceKhongTro: row.priceKhongTro,
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Lỗi đối soát');
      const result: DailyReconciliationResult = data.result;
      const newStatus: DayRow['status'] = result.isMatched ? 'matched' : 'mismatch';
      updateRow(row.id, {
        status: newStatus,
        result,
        errorMsg: '',
      });
      setDetailRow({ ...row, result, status: newStatus });

      // TỰ ĐỘNG ĐƯA VÀO BẢNG LƯƠNG THÁNG NGAY KHI GHÉP KHỚP (Không cần bắt user bấm nút 💾 thủ công)
      if (result.isMatched) {
        setSavedLogs((prev) => {
          const filtered = prev.filter((l) => l.date !== result.date);
          return [...filtered, result];
        });
      }
    } catch (err) {
      updateRow(row.id, {
        status: 'error',
        errorMsg: err instanceof Error ? err.message : 'Lỗi đối soát',
      });
    }
  };

  // ─── Ghép mẻ hàng loạt ────────────────────────────────────────────────────
  const handleReconcileAll = async () => {
    for (const row of rows) {
      if (row.status === 'matched') continue;
      await handleReconcileRow(row);
    }
  };

  // ─── Lưu ngày vào bảng lương tháng ───────────────────────────────────────
  const handleSaveRow = (row: DayRow) => {
    if (!row.result) return;
    setSavedLogs((prev) => {
      const filtered = prev.filter((l) => l.date !== row.result!.date);
      return [...filtered, row.result!];
    });
  };

  // ─── Danh sách công nhật có hiệu lực (Tự động liên kết NGAY KHI GÕ SỐ TẤN) ──
  const effectiveLogs = useMemo<DailyReconciliationResult[]>(() => {
    // Lấy tất cả các dòng người dùng đã nhập số tấn > 0 (không bị chặn bởi chuỗi ngày trống)
    const validRows = rows.filter((r) => r.tonsCoTro > 0 || r.tonsKhongTro > 0);
    if (validRows.length === 0) {
      return savedLogs;
    }

    return validRows.map((r, index) => {
      // Nếu đã bấm ghép mẻ thì dùng kết quả ghép chi tiết
      if (r.result) return r.result;

      // Xác định ngày hợp lệ: nếu ô ngày trống, tự động lấy ngày tương ứng trong tháng hoặc 01/MM/YYYY
      const dateVal = r.date && r.date.trim() ? r.date.trim() : (datesInSelectedMonth[index] || `01/${selectedMonthKey}`);

      // Nếu vừa gõ số xong mà chưa bấm ghép, vẫn lập tức tính tiền chuẩn và cho phép xuất Excel
      const amountCoTro = (r.tonsCoTro || 0) * (r.priceCoTro || 0);
      const amountKhongTro = (r.tonsKhongTro || 0) * (r.priceKhongTro || 0);
      return {
        date: dateVal,
        expectedTonsCoTro: r.tonsCoTro || 0,
        expectedTonsKhongTro: r.tonsKhongTro || 0,
        unitPriceCoTro: r.priceCoTro || masterPriceCoTro || 20000,
        unitPriceKhongTro: r.priceKhongTro || masterPriceKhongTro || 16000,
        amountCoTro,
        amountKhongTro,
        totalAmount: amountCoTro + amountKhongTro,
        isMatched: false,
        batchesCoTro: [],
        batchesKhongTro: [],
        unmatchedBatches: [],
        message: 'Số liệu sổ tay nhập trực tiếp',
      };
    });
  }, [rows, savedLogs, datesInSelectedMonth, selectedMonthKey, masterPriceCoTro, masterPriceKhongTro]);

  // ─── Xuất Excel bảng lương tháng ─────────────────────────────────────────
  const handleExportExcel = async () => {
    setIsExporting(true);
    try {
      // Kiểm tra tính hợp lệ cơ bản trước khi xuất
      const totalEnteredTons = rows.reduce((s, r) => s + (r.tonsCoTro || 0) + (r.tonsKhongTro || 0), 0);
      if (totalEnteredTons === 0 && monthBatches.length === 0) {
        alert('⚠️ Chưa có dữ liệu số tấn nào được nhập. Vui lòng nhập số tấn trước khi xuất Excel!');
        setIsExporting(false);
        return;
      }

      const hasNegative = rows.some((r) => r.tonsCoTro < 0 || r.tonsKhongTro < 0);
      if (hasNegative) {
        alert('⚠️ Số tấn không được là số âm. Vui lòng kiểm tra lại!');
        setIsExporting(false);
        return;
      }

      const [m, y] = selectedMonthKey.split('/').map(Number);

      // Chuẩn bị danh sách mẻ lúa thực tế từ File Lúa Master (Cơ sở I)
      const itemsToExport = monthBatches.map((b) => {
        const isCoTro =
          batchOverrides[b.id]?.isCoTro !== undefined
            ? batchOverrides[b.id].isCoTro
            : getDefaultClassification(b);
        const roundedTons =
          batchOverrides[b.id]?.tons !== undefined
            ? batchOverrides[b.id].tons!
            : getDefaultTons(b);
        const unitPrice = isCoTro ? masterPriceCoTro : masterPriceKhongTro;

        return {
          weighDate: b.weighDate || b.dryDate || '',
          purchaser: b.purchaser || '',
          customer: b.customerName || '',
          vehicle: b.vehicleName || '',
          riceType: b.riceType || 'OM18',
          freshWeightKg: b.freshWeightKg || null,
          freshBoVehicle: b.freshBoVehicle || '',
          dryDate: b.dryDate || '',
          dryFacility: b.dryFacility || 'CƠ SỞ I',
          dryWeightKg: b.dryWeightKg,
          roundedTons,
          dischargeDate: b.dischargeDate || '',
          dryVehicle: b.dryVehicle || '',
          isCoTro,
          unitPrice,
        };
      });

      const res = await fetch('/api/rice-payroll/export-monthly', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          month: m || 10,
          year: y || 2026,
          teamName: 'ĐỘI CHÚ 6 THANH - XUẤT CS1',
          items: itemsToExport,
          dailyLogs: effectiveLogs,
        }),
      });
      if (!res.ok) throw new Error('Lỗi khi xuất Excel');
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `DOI_THANH-XUAT_CS1_T${String(m || 10).padStart(2, '0')}_${y || 2026}_HOAN_CHINH.xlsx`;
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

  // ─── Computed ─────────────────────────────────────────────────────────────
  const monthlyTotal = effectiveLogs.reduce((s, l) => s + l.totalAmount, 0);

  const monthCoTroBatchesTons = useMemo(() => {
    return monthBatches
      .filter((b) => (batchOverrides[b.id]?.isCoTro !== undefined ? batchOverrides[b.id].isCoTro : getDefaultClassification(b)))
      .reduce((s, b) => s + (batchOverrides[b.id]?.tons ?? getDefaultTons(b)), 0);
  }, [monthBatches, batchOverrides]);

  const monthKhongTroBatchesTons = useMemo(() => {
    return monthBatches
      .filter((b) => !(batchOverrides[b.id]?.isCoTro !== undefined ? batchOverrides[b.id].isCoTro : getDefaultClassification(b)))
      .reduce((s, b) => s + (batchOverrides[b.id]?.tons ?? getDefaultTons(b)), 0);
  }, [monthBatches, batchOverrides]);

  const displayTotalAmount =
    monthlyTotal > 0
      ? monthlyTotal
      : monthCoTroBatchesTons * masterPriceCoTro + monthKhongTroBatchesTons * masterPriceKhongTro;

  const displayTonsCoTro =
    effectiveLogs.length > 0
      ? effectiveLogs.reduce((s, l) => s + l.expectedTonsCoTro, 0)
      : monthCoTroBatchesTons;

  const displayTonsKhongTro =
    effectiveLogs.length > 0
      ? effectiveLogs.reduce((s, l) => s + l.expectedTonsKhongTro, 0)
      : monthKhongTroBatchesTons;

  const displayTotalTons = displayTonsCoTro + displayTonsKhongTro;
  const [currentMonthNum, currentYearNum] = selectedMonthKey.split('/');

  return (
    <div className="space-y-5">
      {/* ══════════════════════════════════════════════════════════════════════
          THANH ĐIỀU KHIỂN CHÍNH: CHỌN THÁNG TÍNH LƯƠNG & TRẠNG THÁI DỮ LIỆU
      ══════════════════════════════════════════════════════════════════════ */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          
          {/* Cụm chọn tháng */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 text-white shadow-xs">
              📅
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  Kỳ Tính Lương
                </span>
                <span className="rounded-md bg-blue-50 px-2 py-0.5 text-[11px] font-bold text-blue-700">
                  Đội Chú 6 Thanh &bull; Cơ sở 1
                </span>
              </div>
              
              <div className="mt-1 flex items-center gap-2">
                <label htmlFor="month-select" className="text-xs font-medium text-slate-700">
                  Chọn tháng:
                </label>
                <select
                  id="month-select"
                  value={selectedMonthKey}
                  onChange={(e) => handleSelectMonth(e.target.value)}
                  className="rounded-xl border-2 border-blue-500 bg-blue-50/50 px-3 py-1.5 text-sm font-extrabold text-blue-900 focus:outline-none focus:bg-white shadow-2xs"
                >
                  {availableMonths.map((m) => (
                    <option key={m} value={m}>
                      Tháng {m} ({allDates.filter((d) => d.endsWith(`/${m}`)).length} ngày lúa)
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Cụm thông tin nền & nút mở rộng */}
          <div className="flex items-center justify-between md:justify-end gap-3 border-t md:border-t-0 pt-3 md:pt-0 border-slate-100">
            {isLoadingFile ? (
              <div className="flex items-center gap-2 text-xs text-blue-600 font-semibold animate-pulse">
                <span>🔄</span>
                <span>Đang tải dữ liệu lúa...</span>
              </div>
            ) : (
              <div className="text-right">
                <div className="flex items-center gap-1.5 justify-end">
                  <span className="h-2 w-2 rounded-full bg-emerald-500"></span>
                  <span className="text-xs font-semibold text-slate-700">
                    Dữ liệu sẵn sàng: {allBatches.length.toLocaleString()} mẻ
                  </span>
                </div>
                <p className="text-[11px] text-slate-400">
                  Tháng {selectedMonthKey} có {datesInSelectedMonth.length} ngày xuất lúa
                </p>
              </div>
            )}

            <button
              onClick={() => setShowFileUploader(!showFileUploader)}
              className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-[11px] font-semibold text-slate-600 hover:bg-slate-100 cursor-pointer"
              title="Đổi file Excel khác nếu có"
            >
              ⚙ {showFileUploader ? 'Đóng' : 'Đổi file'}
            </button>
          </div>
        </div>

        {/* Panel đổi file (chỉ hiện khi người dùng bấm 'Đổi file') */}
        {showFileUploader && (
          <div className="mt-4 pt-3 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2 bg-slate-50 p-3 rounded-xl">
            <span className="text-xs text-slate-600">
              Đang dùng file: <strong>{loadedFileName || 'File mẫu 2026'}</strong>
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => loadData(true)}
                className="rounded-lg bg-emerald-600 px-3 py-1 text-xs font-bold text-white hover:bg-emerald-700 cursor-pointer"
              >
                Nạp lại file 2026
              </button>
              <label className="rounded-lg border border-slate-300 bg-white px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100 cursor-pointer">
                Chọn file .xlsx khác
                <input
                  type="file"
                  accept=".xlsx,.xls"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) loadData(false, f);
                  }}
                />
              </label>
            </div>
          </div>
        )}

        {fileError && (
          <div className="mt-3 rounded-xl bg-red-50 border border-red-200 p-2.5 text-xs text-red-700">
            ⚠️ {fileError}
          </div>
        )}
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          BẢNG NHẬP NHANH CÔNG NHẬT & CHI TIẾT MẺ LÚA TỪ FILE MASTER
      ══════════════════════════════════════════════════════════════════════ */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-xs overflow-hidden">
        {/* Header bảng & Tabs chuyển đổi */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div>
            <h2 className="text-sm font-bold text-slate-900">
              Quản Lý Công Nhật & Mẻ Lúa &bull; Tháng {selectedMonthKey} &bull; Cơ sở I
            </h2>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Đọc tự động từ <strong>File Lúa Master</strong>. Nhập số tấn sổ tay hoặc xem chi tiết từng mẻ lúa thực tế.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => populateMonthDays(selectedMonthKey, allBatches)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-800 hover:bg-emerald-100 cursor-pointer transition-all shadow-2xs"
              title="Tự động nạp đủ tất cả các ngày có xuất lúa trong tháng từ file lúa"
            >
              ⚡ Nạp {datesInSelectedMonth.length} ngày từ File Lúa
            </button>
            {activeTab === 'notebook' && (
              <>
                <button
                  type="button"
                  onClick={addRow}
                  className="inline-flex items-center gap-1 rounded-xl border border-blue-300 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-100 cursor-pointer transition-all"
                >
                  ＋ Thêm ngày
                </button>
                <button
                  type="button"
                  onClick={handleReconcileAll}
                  disabled={allBatches.length === 0}
                  className="inline-flex items-center gap-1 rounded-xl bg-blue-600 px-3.5 py-1.5 text-xs font-bold text-white hover:bg-blue-700 disabled:opacity-40 cursor-pointer transition-all shadow-xs"
                >
                  🔍 Ghép Tất Cả
                </button>
              </>
            )}
          </div>
        </div>

        {/* Thanh chuyển đổi Tabs */}
        <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-50 border-b border-slate-200 px-5 py-2.5">
          <div className="flex rounded-xl bg-slate-200/80 p-1 gap-1">
            <button
              type="button"
              onClick={() => setActiveTab('notebook')}
              className={`flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'notebook'
                  ? 'bg-white text-blue-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              📝 Sổ Tay Chú 6 ({rows.length} ngày)
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('batches')}
              className={`flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'batches'
                  ? 'bg-white text-blue-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              🌾 Chi Tiết Mẻ Lúa Từ File ({monthBatches.length} mẻ • Cơ sở I)
            </button>
          </div>

          <div className="text-[11px] text-slate-500 font-medium">
            {activeTab === 'notebook' ? (
              <span>Gõ số tấn Có trở / Không trở theo ngày rồi bấm Ghép Mẻ</span>
            ) : (
              <span>Xem 52 mẻ lúa thực tế và bấm nút chuyển Có trở / Không trở</span>
            )}
          </div>
        </div>

        {/* ── CÀI ĐẶT ĐƠN GIÁ TOÀN BỘ THÁNG (Nhập 1 lần, tự động áp dụng tất cả các ngày) ── */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-gradient-to-r from-amber-50/70 via-slate-50 to-indigo-50/70 border-b border-slate-200/80 px-5 py-3">
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-amber-500 text-white text-[11px] font-bold">
              ₫
            </span>
            <div>
              <span className="text-xs font-bold text-slate-800">
                Đơn Giá Tháng {selectedMonthKey}
              </span>
              <p className="text-[11px] text-slate-500">
                Chỉ cần điền 1 lần tại đây &bull; Tự động áp dụng cho tất cả các ngày bên dưới
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 bg-white border border-amber-300 rounded-xl px-3 py-1.5 shadow-2xs">
              <span className="text-xs font-bold text-amber-800 whitespace-nowrap">
                🌾 Có trở:
              </span>
              <input
                type="number"
                min={0}
                step={1000}
                value={masterPriceCoTro || ''}
                onWheel={(e) => e.currentTarget.blur()}
                onChange={(e) => handleMasterPriceChange('coTro', Number(e.target.value))}
                className="w-24 text-xs font-extrabold text-amber-900 text-center focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              />
              <span className="text-xs text-slate-500 font-semibold">đ/tấn</span>
            </div>

            <div className="flex items-center gap-2 bg-white border border-indigo-300 rounded-xl px-3 py-1.5 shadow-2xs">
              <span className="text-xs font-bold text-indigo-800 whitespace-nowrap">
                🌾 Không trở:
              </span>
              <input
                type="number"
                min={0}
                step={1000}
                value={masterPriceKhongTro || ''}
                onWheel={(e) => e.currentTarget.blur()}
                onChange={(e) => handleMasterPriceChange('khongTro', Number(e.target.value))}
                className="w-24 text-xs font-extrabold text-indigo-900 text-center focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              />
              <span className="text-xs text-slate-500 font-semibold">đ/tấn</span>
            </div>

            <label className="flex items-center gap-1.5 bg-white border border-blue-200 rounded-xl px-3 py-1.5 shadow-2xs cursor-pointer select-none hover:bg-blue-50/50 transition-colors" title="Khi nhập Có trở sẽ tự động tính số tấn Không trở còn lại và ngược lại">
              <input
                type="checkbox"
                checked={autoBalance}
                onChange={(e) => setAutoBalance(e.target.checked)}
                className="h-4 w-4 rounded border-blue-400 text-blue-600 focus:ring-blue-500 cursor-pointer"
              />
              <span className="text-xs font-bold text-blue-900">
                ⚖️ Tự cân đối số tấn
              </span>
            </label>
          </div>
        </div>

        {activeTab === 'notebook' ? (
          <>
            {/* ── Bảng Desktop ── */}
            <div className="hidden lg:block overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-[11px] font-bold uppercase text-slate-500 border-b border-slate-200">
              <tr>
                <th className="py-2.5 px-3 w-40">Ngày làm việc</th>
                <th className="py-2.5 px-3 text-center text-amber-700">Có trở (tấn)</th>
                <th className="py-2.5 px-3 text-center text-amber-700">Đơn giá (đ)</th>
                <th className="py-2.5 px-3 text-right text-amber-700">Tiền có trở</th>
                <th className="py-2.5 px-3 text-center text-indigo-700">Không trở (tấn)</th>
                <th className="py-2.5 px-3 text-center text-indigo-700">Đơn giá (đ)</th>
                <th className="py-2.5 px-3 text-right text-indigo-700">Tiền không trở</th>
                <th className="py-2.5 px-3 text-right font-extrabold text-slate-700">Tổng ngày</th>
                <th className="py-2.5 px-3 text-center">Trạng thái</th>
                <th className="py-2.5 px-3 text-center">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((row) => {
                const dayBatches = monthBatches.filter((b) => b.dischargeDate === row.date);
                const originalFileTons = dayBatches.reduce(
                  (s, b) => s + (b.roundedTons || roundRiceTons(b.dryWeightKg)),
                  0
                );
                const dayFileTons = dayBatches.reduce(
                  (s, b) => s + (batchOverrides[b.id]?.tons ?? getDefaultTons(b)),
                  0
                );
                const rowTotalTons = row.tonsCoTro + row.tonsKhongTro;
                const diffTons = originalFileTons > 0 && rowTotalTons > 0 ? rowTotalTons - originalFileTons : 0;
                const previewCoTro = row.tonsCoTro * row.priceCoTro;
                const previewKhongTro = row.tonsKhongTro * row.priceKhongTro;
                const previewTotal = previewCoTro + previewKhongTro;
                const isActive = detailRow?.id === row.id;

                // Xác định chế độ xuất: 'coTro' (chỉ có trở) | 'khongTro' (chỉ không trở) | 'caHai' (vừa có vừa không)
                const rowMode: 'coTro' | 'khongTro' | 'caHai' =
                  row.tonsCoTro > 0 && row.tonsKhongTro === 0
                    ? 'coTro'
                    : row.tonsKhongTro > 0 && row.tonsCoTro === 0
                    ? 'khongTro'
                    : row.tonsCoTro > 0 && row.tonsKhongTro > 0
                    ? 'caHai'
                    : 'coTro';

                return (
                  <tr
                    key={row.id}
                    className={`transition-colors ${
                      isActive
                        ? 'bg-blue-50/70'
                        : row.status === 'error'
                        ? 'bg-red-50/40 hover:bg-red-50'
                        : diffTons !== 0
                        ? 'bg-blue-50/20 hover:bg-blue-50/40'
                        : row.status === 'matched'
                        ? 'bg-emerald-50/40 hover:bg-emerald-50/60'
                        : row.status === 'mismatch'
                        ? 'bg-amber-50/40 hover:bg-amber-50/60'
                        : 'hover:bg-slate-50/80'
                    }`}
                  >
                    {/* Chọn Ngày làm việc + Chọn nhanh 3 Chế độ (Có trở / Không trở / Cả hai) */}
                    <td className="py-2.5 px-3">
                      <div className="flex items-center gap-1">
                        <input
                          type="text"
                          value={row.date}
                          onChange={(e) =>
                            updateRow(row.id, {
                              date: e.target.value.trim(),
                              status: 'idle',
                              result: null,
                              errorMsg: '',
                            })
                          }
                          placeholder={`01/${selectedMonthKey}`}
                          className="w-28 rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs font-semibold text-slate-800 focus:border-blue-500 focus:outline-none"
                          title="Gõ ngày hoặc bấm nút ▼ bên cạnh để chọn"
                        />
                        <select
                          value=""
                          onChange={(e) => {
                            if (e.target.value) {
                              updateRow(row.id, {
                                date: e.target.value,
                                status: 'idle',
                                result: null,
                                errorMsg: '',
                              });
                            }
                          }}
                          className="rounded-lg border border-slate-300 bg-slate-50 px-1 py-1.5 text-xs text-slate-600 hover:bg-slate-100 focus:outline-none cursor-pointer"
                          title="Chọn ngày nhanh"
                        >
                          <option value="">▼</option>
                          <optgroup label={`Tháng ${selectedMonthKey} (Ngày 01 -> 31)`}>
                            {datesInSelectedMonth.map((d) => (
                              <option key={d} value={d}>
                                Ngày {d}
                              </option>
                            ))}
                          </optgroup>
                          {nearbyDates.prev.length > 0 && (
                            <optgroup label="Cuối tháng trước">
                              {nearbyDates.prev.map((d) => (
                                <option key={d} value={d}>
                                  Ngày {d} (Tháng trước)
                                </option>
                              ))}
                            </optgroup>
                          )}
                          {nearbyDates.next.length > 0 && (
                            <optgroup label="Đầu tháng sau">
                              {nearbyDates.next.map((d) => (
                                <option key={d} value={d}>
                                  Ngày {d} (Tháng sau)
                                </option>
                              ))}
                            </optgroup>
                          )}
                        </select>
                      </div>

                      {/* Bộ chọn 3 trường hợp: Có trở | Không trở | Cả hai */}
                      <div className="mt-1.5 flex items-center p-0.5 rounded-lg bg-slate-100 border border-slate-200 shadow-2xs">
                        <button
                          type="button"
                          onClick={() => handleSetRowMode(row.id, 'coTro', dayFileTons, row.date)}
                          className={`flex-1 py-1 px-1 rounded-md text-[10px] font-bold text-center transition-all cursor-pointer ${
                            rowMode === 'coTro'
                              ? 'bg-amber-500 text-white shadow-2xs'
                              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
                          }`}
                          title="Trường hợp 1: Toàn bộ là Có trở (Không trở = 0)"
                        >
                          🌾 Có trở
                        </button>
                        <button
                          type="button"
                          onClick={() => handleSetRowMode(row.id, 'khongTro', dayFileTons, row.date)}
                          className={`flex-1 py-1 px-1 rounded-md text-[10px] font-bold text-center transition-all cursor-pointer ${
                            rowMode === 'khongTro'
                              ? 'bg-indigo-600 text-white shadow-2xs'
                              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
                          }`}
                          title="Trường hợp 2: Toàn bộ là Không trở (Có trở = 0)"
                        >
                          🌾 Không trở
                        </button>
                        <button
                          type="button"
                          onClick={() => handleSetRowMode(row.id, 'caHai', dayFileTons, row.date)}
                          className={`flex-1 py-1 px-1 rounded-md text-[10px] font-bold text-center transition-all cursor-pointer ${
                            rowMode === 'caHai'
                              ? 'bg-blue-600 text-white shadow-2xs'
                              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
                          }`}
                          title="Trường hợp 3: Cả hai (vừa có trở vừa không trở)"
                        >
                          ⚖️ Cả hai
                        </button>
                      </div>

                      {dayBatches.length > 0 && (
                        <div className="mt-1 flex items-center justify-between text-[10px] gap-1 flex-wrap">
                          <div className="flex items-center gap-1">
                            <span
                              className="font-semibold text-emerald-700 truncate"
                              title="Mẻ lúa và số tấn cân sấy từ file lúa"
                            >
                              🌾 {dayBatches.length} mẻ &bull; Gốc <strong>{originalFileTons}t</strong>
                            </span>
                            {diffTons !== 0 && (
                              <span
                                className={`px-1.5 py-0.2 rounded text-[10px] font-bold ${
                                  diffTons > 0
                                    ? 'bg-blue-100 text-blue-800 border border-blue-200'
                                    : 'bg-amber-100 text-amber-800 border border-amber-200'
                                }`}
                                title={`Đã điều chỉnh ${diffTons > 0 ? '+' : ''}${diffTons}t so với file gốc`}
                              >
                                {diffTons > 0 ? `+${diffTons}t` : `${diffTons}t`} vi vu
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-1">
                            {diffTons !== 0 && (
                              <button
                                type="button"
                                onClick={() => handleResetDayTons(row.date)}
                                className="text-blue-600 hover:text-blue-800 font-bold px-1 py-0.5 text-[9px] cursor-pointer rounded hover:bg-blue-50"
                                title="Khôi phục lại số tấn gốc từ file lúa"
                              >
                                ↺ Về gốc
                              </button>
                            )}
                            {(row.tonsCoTro > 0 || row.tonsKhongTro > 0) && (
                              <button
                                type="button"
                                onClick={() =>
                                  updateRow(row.id, {
                                    tonsCoTro: 0,
                                    tonsKhongTro: 0,
                                    status: 'idle',
                                    errorMsg: '',
                                  })
                                }
                                className="text-slate-400 hover:text-slate-600 font-bold px-1 py-0.5 text-[9px] cursor-pointer"
                                title="Xóa trắng số tấn về 0"
                              >
                                ✕ Xóa
                              </button>
                            )}
                          </div>
                        </div>
                      )}
                    </td>

                    {/* Có trở: tấn */}
                    <td className="py-2 px-3">
                      {rowMode === 'khongTro' ? (
                        <div
                          onClick={() => handleSetRowMode(row.id, 'caHai', dayFileTons, row.date)}
                          title="Ngày này là 100% Không trở. Bấm vào đây để chuyển sang Cả hai"
                          className="w-full rounded-lg border border-dashed border-slate-200 bg-slate-50/70 px-2 py-1.5 text-center text-xs font-semibold text-slate-300 hover:border-amber-300 hover:bg-amber-50/40 hover:text-amber-700 transition-all cursor-pointer"
                        >
                          -
                        </div>
                      ) : (
                        <input
                          type="number"
                          min={0}
                          value={row.tonsCoTro === 0 ? '' : row.tonsCoTro}
                          onWheel={(e) => e.currentTarget.blur()}
                          onChange={(e) =>
                            handleTonsChange(row.id, 'coTro', e.target.value)
                          }
                          placeholder="0"
                          className={`w-full rounded-lg border px-2 py-1.5 text-center text-xs font-bold focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none transition-all ${
                            diffTons !== 0 && rowMode === 'coTro'
                              ? diffTons > 0
                                ? 'border-blue-400 bg-blue-50/60 text-blue-900 focus:border-blue-500'
                                : 'border-amber-400 bg-amber-50/60 text-amber-900 focus:border-amber-500'
                              : 'border-amber-300 bg-amber-50/40 text-amber-900 focus:border-amber-500 focus:bg-white'
                          }`}
                        />
                      )}
                    </td>

                    {/* Có trở: giá */}
                    <td className="py-2 px-3">
                      {rowMode === 'khongTro' ? (
                        <div className="text-center text-xs text-slate-300">-</div>
                      ) : (
                        <input
                          type="number"
                          min={0}
                          step={1000}
                          value={row.priceCoTro || ''}
                          onWheel={(e) => e.currentTarget.blur()}
                          onChange={(e) =>
                            updateRow(row.id, { priceCoTro: Number(e.target.value) })
                          }
                          className="w-full rounded-lg border border-amber-200 bg-white px-2 py-1.5 text-center text-xs text-slate-700 focus:border-amber-400 focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        />
                      )}
                    </td>

                    {/* Tiền có trở */}
                    <td className="py-2 px-3 text-right font-semibold text-amber-700 whitespace-nowrap">
                      {rowMode === 'khongTro' ? (
                        <span className="text-slate-300">-</span>
                      ) : (
                        `${formatVND(previewCoTro)} đ`
                      )}
                    </td>

                    {/* Không trở: tấn */}
                    <td className="py-2 px-3">
                      {rowMode === 'coTro' ? (
                        <div
                          onClick={() => handleSetRowMode(row.id, 'caHai', dayFileTons, row.date)}
                          title="Ngày này là 100% Có trở. Bấm vào đây để chuyển sang Cả hai"
                          className="w-full rounded-lg border border-dashed border-slate-200 bg-slate-50/70 px-2 py-1.5 text-center text-xs font-semibold text-slate-300 hover:border-indigo-300 hover:bg-indigo-50/40 hover:text-indigo-700 transition-all cursor-pointer"
                        >
                          -
                        </div>
                      ) : (
                        <input
                          type="number"
                          min={0}
                          value={row.tonsKhongTro === 0 ? '' : row.tonsKhongTro}
                          onWheel={(e) => e.currentTarget.blur()}
                          onChange={(e) =>
                            handleTonsChange(row.id, 'khongTro', e.target.value)
                          }
                          placeholder="0"
                          className={`w-full rounded-lg border px-2 py-1.5 text-center text-xs font-bold focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none transition-all ${
                            diffTons !== 0 && rowMode === 'khongTro'
                              ? diffTons > 0
                                ? 'border-blue-400 bg-blue-50/60 text-blue-900 focus:border-blue-500'
                                : 'border-amber-400 bg-amber-50/60 text-amber-900 focus:border-amber-500'
                              : 'border-indigo-300 bg-indigo-50/40 text-indigo-900 focus:border-indigo-500 focus:bg-white'
                          }`}
                        />
                      )}
                    </td>

                    {/* Không trở: giá */}
                    <td className="py-2 px-3">
                      {rowMode === 'coTro' ? (
                        <div className="text-center text-xs text-slate-300">-</div>
                      ) : (
                        <input
                          type="number"
                          min={0}
                          step={1000}
                          value={row.priceKhongTro || ''}
                          onWheel={(e) => e.currentTarget.blur()}
                          onChange={(e) =>
                            updateRow(row.id, { priceKhongTro: Number(e.target.value) })
                          }
                          className="w-full rounded-lg border border-indigo-200 bg-white px-2 py-1.5 text-center text-xs text-slate-700 focus:border-indigo-400 focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        />
                      )}
                    </td>

                    {/* Tiền không trở */}
                    <td className="py-2 px-3 text-right font-semibold text-indigo-700 whitespace-nowrap">
                      {rowMode === 'coTro' ? (
                        <span className="text-slate-300">-</span>
                      ) : (
                        `${formatVND(previewKhongTro)} đ`
                      )}
                    </td>

                    {/* Tổng ngày */}
                    <td className="py-2 px-3 text-right font-extrabold text-slate-900 text-sm whitespace-nowrap">
                      {formatVND(previewTotal)}&thinsp;đ
                    </td>

                    {/* Trạng thái */}
                    <td className="py-2 px-3 text-center">
                      <StatusBadge status={row.status} />
                      {row.errorMsg && (
                        <p className="mt-1 text-[10px] text-red-600 font-bold text-left max-w-40 bg-red-50 p-1 rounded border border-red-200">
                          ⚠️ {row.errorMsg}
                        </p>
                      )}
                    </td>

                    {/* Thao tác */}
                    <td className="py-2 px-3">
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          onClick={() => handleReconcileRow(row)}
                          disabled={row.status === 'loading' || allBatches.length === 0}
                          title="Ghép mẻ ngày này"
                          className="rounded-lg bg-blue-600 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-blue-700 disabled:opacity-40 cursor-pointer transition-colors"
                        >
                          🔍
                        </button>

                        {row.result && (
                          <button
                            onClick={() =>
                              setDetailRow(detailRow?.id === row.id ? null : { ...row })
                            }
                            title="Xem chi tiết mẻ"
                            className="rounded-lg border border-slate-300 bg-slate-50 px-2.5 py-1 text-[11px] font-bold text-slate-600 hover:bg-slate-100 cursor-pointer transition-colors"
                          >
                            👁
                          </button>
                        )}

                        {row.status === 'matched' && row.result && (
                          <button
                            onClick={() => handleSaveRow(row)}
                            title="Lưu vào bảng lương tháng"
                            className="rounded-lg bg-emerald-600 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-emerald-700 cursor-pointer transition-colors"
                          >
                            💾
                          </button>
                        )}

                        <button
                          onClick={() => removeRow(row.id)}
                          disabled={rows.length === 1}
                          title="Xóa hàng này"
                          className="rounded-lg border border-red-200 bg-red-50 px-2.5 py-1 text-[11px] font-bold text-red-500 hover:bg-red-100 disabled:opacity-30 cursor-pointer transition-colors"
                        >
                          🗑
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>

            {/* Footer tổng preview */}
            <tfoot>
              <tr className="bg-slate-50 border-t-2 border-slate-200 font-bold text-xs">
                <td className="py-3 px-3 text-slate-700 uppercase tracking-wide">
                  Tổng tạm ({rows.length} ngày)
                </td>
                <td className="py-3 px-3 text-center text-amber-800">
                  {rows.reduce((s, r) => s + r.tonsCoTro, 0)} tấn
                </td>
                <td />
                <td className="py-3 px-3 text-right text-amber-800 whitespace-nowrap">
                  {formatVND(rows.reduce((s, r) => s + r.tonsCoTro * r.priceCoTro, 0))}&thinsp;đ
                </td>
                <td className="py-3 px-3 text-center text-indigo-800">
                  {rows.reduce((s, r) => s + r.tonsKhongTro, 0)} tấn
                </td>
                <td />
                <td className="py-3 px-3 text-right text-indigo-800 whitespace-nowrap">
                  {formatVND(rows.reduce((s, r) => s + r.tonsKhongTro * r.priceKhongTro, 0))}&thinsp;đ
                </td>
                <td className="py-3 px-3 text-right text-base text-blue-700 whitespace-nowrap">
                  {formatVND(
                    rows.reduce(
                      (s, r) =>
                        s + r.tonsCoTro * r.priceCoTro + r.tonsKhongTro * r.priceKhongTro,
                      0
                    )
                  )}&thinsp;đ
                </td>
                <td />
                <td />
              </tr>
            </tfoot>
          </table>
        </div>

        {/* ── Thẻ Mobile ── */}
        <div className="lg:hidden divide-y divide-slate-100">
          {rows.map((row) => {
            const dayBatches = monthBatches.filter((b) => b.dischargeDate === row.date);
            const originalFileTons = dayBatches.reduce(
              (s, b) => s + (b.roundedTons || roundRiceTons(b.dryWeightKg)),
              0
            );
            const dayFileTons = dayBatches.reduce(
              (s, b) => s + (batchOverrides[b.id]?.tons ?? getDefaultTons(b)),
              0
            );
            const rowTotalTons = row.tonsCoTro + row.tonsKhongTro;
            const diffTons = originalFileTons > 0 && rowTotalTons > 0 ? rowTotalTons - originalFileTons : 0;
            const previewCoTro = row.tonsCoTro * row.priceCoTro;
            const previewKhongTro = row.tonsKhongTro * row.priceKhongTro;
            const previewTotal = previewCoTro + previewKhongTro;

            // Xác định chế độ xuất: 'coTro' | 'khongTro' | 'caHai'
            const rowMode: 'coTro' | 'khongTro' | 'caHai' =
              row.tonsCoTro > 0 && row.tonsKhongTro === 0
                ? 'coTro'
                : row.tonsKhongTro > 0 && row.tonsCoTro === 0
                ? 'khongTro'
                : row.tonsCoTro > 0 && row.tonsKhongTro > 0
                ? 'caHai'
                : 'coTro';

            return (
              <div key={row.id} className={`p-4 space-y-3 ${diffTons !== 0 ? 'bg-blue-50/20' : ''}`}>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex-1 flex items-center gap-1.5">
                    <input
                      type="text"
                      value={row.date}
                      onChange={(e) =>
                        updateRow(row.id, {
                          date: e.target.value.trim(),
                          status: 'idle',
                          result: null,
                          errorMsg: '',
                        })
                      }
                      placeholder={`01/${selectedMonthKey}`}
                      className="flex-1 rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-800 focus:border-blue-500 focus:outline-none"
                    />
                    <select
                      value=""
                      onChange={(e) => {
                        if (e.target.value) {
                          updateRow(row.id, {
                            date: e.target.value,
                            status: 'idle',
                            result: null,
                            errorMsg: '',
                          });
                        }
                      }}
                      className="rounded-xl border border-slate-300 bg-slate-50 px-2 py-2 text-xs text-slate-600 focus:outline-none cursor-pointer"
                    >
                      <option value="">▼</option>
                      <optgroup label={`Tháng ${selectedMonthKey} (Ngày 01 -> 31)`}>
                        {datesInSelectedMonth.map((d) => (
                          <option key={d} value={d}>
                            Ngày {d}
                          </option>
                        ))}
                      </optgroup>
                      {nearbyDates.prev.length > 0 && (
                        <optgroup label="Cuối tháng trước">
                          {nearbyDates.prev.map((d) => (
                            <option key={d} value={d}>
                              Ngày {d} (Tháng trước)
                            </option>
                          ))}
                        </optgroup>
                      )}
                      {nearbyDates.next.length > 0 && (
                        <optgroup label="Đầu tháng sau">
                          {nearbyDates.next.map((d) => (
                            <option key={d} value={d}>
                              Ngày {d} (Tháng sau)
                            </option>
                          ))}
                        </optgroup>
                      )}
                    </select>
                  </div>
                  <StatusBadge status={row.status} />
                </div>

                {/* 3 Trường Hợp: Có trở | Không trở | Cả hai */}
                <div className="flex items-center p-1 rounded-xl bg-slate-100 border border-slate-200 gap-1 text-xs font-bold">
                  <button
                    type="button"
                    onClick={() => handleSetRowMode(row.id, 'coTro', dayFileTons, row.date)}
                    className={`flex-1 py-1.5 rounded-lg text-center transition-all cursor-pointer ${
                      rowMode === 'coTro'
                        ? 'bg-amber-500 text-white shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    🌾 Có trở
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSetRowMode(row.id, 'khongTro', dayFileTons, row.date)}
                    className={`flex-1 py-1.5 rounded-lg text-center transition-all cursor-pointer ${
                      rowMode === 'khongTro'
                        ? 'bg-indigo-600 text-white shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    🌾 Không trở
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSetRowMode(row.id, 'caHai', dayFileTons, row.date)}
                    className={`flex-1 py-1.5 rounded-lg text-center transition-all cursor-pointer ${
                      rowMode === 'caHai'
                        ? 'bg-blue-600 text-white shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    ⚖️ Cả hai
                  </button>
                </div>

                {dayBatches.length > 0 && (
                  <div className="flex items-center justify-between text-xs bg-slate-50 p-2 rounded-xl border border-slate-200 gap-1 flex-wrap">
                    <div className="flex items-center gap-1.5">
                      <span className="font-bold text-emerald-700">
                        🌾 {dayBatches.length} mẻ &bull; Gốc <strong>{originalFileTons}t</strong>
                      </span>
                      {diffTons !== 0 && (
                        <span
                          className={`px-1.5 py-0.2 rounded text-[10px] font-bold ${
                            diffTons > 0 ? 'bg-blue-100 text-blue-800' : 'bg-amber-100 text-amber-800'
                          }`}
                        >
                          {diffTons > 0 ? `+${diffTons}t` : `${diffTons}t`} vi vu
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      {diffTons !== 0 && (
                        <button
                          type="button"
                          onClick={() => handleResetDayTons(row.date)}
                          className="text-blue-600 hover:text-blue-800 font-bold px-1.5 py-0.5 text-[11px] cursor-pointer"
                        >
                          ↺ Về gốc
                        </button>
                      )}
                      {(row.tonsCoTro > 0 || row.tonsKhongTro > 0) && (
                        <button
                          type="button"
                          onClick={() =>
                            updateRow(row.id, {
                              tonsCoTro: 0,
                              tonsKhongTro: 0,
                              status: 'idle',
                              errorMsg: '',
                            })
                          }
                          className="text-slate-500 hover:text-slate-700 font-bold px-1.5 py-0.5 text-[11px] cursor-pointer"
                        >
                          ✕ Xóa
                        </button>
                      )}
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                  {rowMode === 'khongTro' ? (
                    <div
                      onClick={() => handleSetRowMode(row.id, 'caHai', dayFileTons, row.date)}
                      className="rounded-xl border border-dashed border-slate-200 bg-slate-50/70 p-3 text-center text-xs text-slate-400 font-semibold cursor-pointer hover:border-amber-300 hover:bg-amber-50/40 hover:text-amber-700 flex flex-col justify-center items-center gap-1"
                    >
                      <span className="text-[11px] font-bold text-slate-400">🌾 Có trở</span>
                      <span className="text-sm font-extrabold text-slate-300">-</span>
                      <span className="text-[10px] text-amber-700">(Bấm bật cả hai)</span>
                    </div>
                  ) : (
                    <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-3 space-y-2">
                      <p className="text-[11px] font-bold text-amber-800">🌾 Có trở</p>
                      <div className="grid grid-cols-2 gap-1.5">
                        <div>
                          <label className="text-[10px] text-slate-500">Tấn</label>
                          <input
                            type="number"
                            min={0}
                            value={row.tonsCoTro === 0 ? '' : row.tonsCoTro}
                            onWheel={(e) => e.currentTarget.blur()}
                            onChange={(e) =>
                              handleTonsChange(row.id, 'coTro', e.target.value)
                            }
                            placeholder="0"
                            className={`w-full rounded-lg border px-2 py-1.5 text-center text-xs font-bold text-amber-900 focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ${
                              diffTons !== 0 && rowMode === 'coTro'
                                ? 'border-blue-400 bg-blue-50/60'
                                : 'border-amber-300'
                            }`}
                          />
                        </div>
                        <div>
                          <label className="text-[10px] text-slate-500">Giá</label>
                          <input
                            type="number"
                            min={0}
                            step={1000}
                            value={row.priceCoTro || ''}
                            onWheel={(e) => e.currentTarget.blur()}
                            onChange={(e) =>
                              updateRow(row.id, { priceCoTro: Number(e.target.value) })
                            }
                            className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-center text-xs text-slate-700 focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                          />
                        </div>
                      </div>
                      <p className="text-right text-xs font-bold text-amber-800">
                        = {formatVND(previewCoTro)} đ
                      </p>
                    </div>
                  )}

                  {rowMode === 'coTro' ? (
                    <div
                      onClick={() => handleSetRowMode(row.id, 'caHai', dayFileTons, row.date)}
                      className="rounded-xl border border-dashed border-slate-200 bg-slate-50/70 p-3 text-center text-xs text-slate-400 font-semibold cursor-pointer hover:border-indigo-300 hover:bg-indigo-50/40 hover:text-indigo-700 flex flex-col justify-center items-center gap-1"
                    >
                      <span className="text-[11px] font-bold text-slate-400">🌾 Không trở</span>
                      <span className="text-sm font-extrabold text-slate-300">-</span>
                      <span className="text-[10px] text-indigo-700">(Bấm bật cả hai)</span>
                    </div>
                  ) : (
                    <div className="rounded-xl border border-indigo-200 bg-indigo-50/50 p-3 space-y-2">
                      <p className="text-[11px] font-bold text-indigo-800">🌾 Không trở</p>
                      <div className="grid grid-cols-2 gap-1.5">
                        <div>
                          <label className="text-[10px] text-slate-500">Tấn</label>
                          <input
                            type="number"
                            min={0}
                            value={row.tonsKhongTro === 0 ? '' : row.tonsKhongTro}
                            onWheel={(e) => e.currentTarget.blur()}
                            onChange={(e) =>
                              handleTonsChange(row.id, 'khongTro', e.target.value)
                            }
                            placeholder="0"
                            className={`w-full rounded-lg border px-2 py-1.5 text-center text-xs font-bold text-indigo-900 focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ${
                              diffTons !== 0 && rowMode === 'khongTro'
                                ? 'border-blue-400 bg-blue-50/60'
                                : 'border-indigo-300'
                            }`}
                          />
                        </div>
                        <div>
                          <label className="text-[10px] text-slate-500">Giá</label>
                          <input
                            type="number"
                            min={0}
                            step={1000}
                            value={row.priceKhongTro || ''}
                            onWheel={(e) => e.currentTarget.blur()}
                            onChange={(e) =>
                              updateRow(row.id, { priceKhongTro: Number(e.target.value) })
                            }
                            className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-center text-xs text-slate-700 focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                          />
                        </div>
                      </div>
                      <p className="text-right text-xs font-bold text-indigo-800">
                        = {formatVND(previewKhongTro)} đ
                      </p>
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-sm font-extrabold text-slate-900">
                    Tổng: {formatVND(previewTotal)} đ
                  </span>
                  <div className="flex gap-1.5">
                    <button
                      onClick={() => handleReconcileRow(row)}
                      disabled={row.status === 'loading' || allBatches.length === 0}
                      className="rounded-lg bg-blue-600 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-blue-700 disabled:opacity-40 cursor-pointer"
                    >
                      🔍 Ghép
                    </button>
                    {row.result && (
                      <button
                        onClick={() => setDetailRow(detailRow?.id === row.id ? null : { ...row })}
                        className="rounded-lg border border-slate-300 bg-slate-50 px-3 py-1.5 text-[11px] font-bold text-slate-600 hover:bg-slate-100 cursor-pointer"
                      >
                        👁
                      </button>
                    )}
                    {row.status === 'matched' && row.result && (
                      <button
                        onClick={() => handleSaveRow(row)}
                        className="rounded-lg bg-emerald-600 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-emerald-700 cursor-pointer"
                      >
                        💾
                      </button>
                    )}
                    <button
                      onClick={() => removeRow(row.id)}
                      disabled={rows.length === 1}
                      className="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-[11px] font-bold text-red-500 hover:bg-red-100 disabled:opacity-30 cursor-pointer"
                    >
                      🗑
                    </button>
                  </div>
                </div>

                {row.errorMsg && (
                  <p className="text-[11px] font-bold text-red-600 bg-red-50 border border-red-200 rounded-lg p-2">
                    ⚠️ {row.errorMsg}
                  </p>
                )}
              </div>
            );
          })}

          <div className="p-4">
            <button
              onClick={addRow}
              className="w-full rounded-xl border-2 border-dashed border-blue-200 py-3 text-xs font-semibold text-blue-600 hover:border-blue-400 hover:bg-blue-50 cursor-pointer transition-all"
            >
              ＋ Thêm ngày
            </button>
          </div>
        </div>
          </>
        ) : (
          <div className="p-4 space-y-4">
            {/* Thanh công cụ tìm kiếm và lọc mẻ lúa */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-slate-50 p-3 rounded-xl border border-slate-200">
              <div className="flex items-center gap-2 flex-1 max-w-md">
                <span className="text-slate-400 text-xs">🔍</span>
                <input
                  type="text"
                  value={batchSearch}
                  onChange={(e) => setBatchSearch(e.target.value)}
                  placeholder="Tìm theo Khách hàng, Ghe/Tàu, Loại lúa, Ngày xuất..."
                  className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[11px] font-bold text-slate-500 mr-1">Lọc:</span>
                <button
                  type="button"
                  onClick={() => setBatchFilterType('all')}
                  className={`px-2.5 py-1 text-xs rounded-lg font-bold transition-all cursor-pointer ${
                    batchFilterType === 'all'
                      ? 'bg-blue-600 text-white shadow-2xs'
                      : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  Tất cả ({monthBatches.length})
                </button>
                <button
                  type="button"
                  onClick={() => setBatchFilterType('coTro')}
                  className={`px-2.5 py-1 text-xs rounded-lg font-bold transition-all cursor-pointer ${
                    batchFilterType === 'coTro'
                      ? 'bg-amber-500 text-white shadow-2xs'
                      : 'bg-white border border-amber-200 text-amber-800 hover:bg-amber-50'
                  }`}
                >
                  🌾 Có trở ({monthBatches.filter((b) => (batchOverrides[b.id]?.isCoTro !== undefined ? batchOverrides[b.id].isCoTro : getDefaultClassification(b))).length})
                </button>
                <button
                  type="button"
                  onClick={() => setBatchFilterType('khongTro')}
                  className={`px-2.5 py-1 text-xs rounded-lg font-bold transition-all cursor-pointer ${
                    batchFilterType === 'khongTro'
                      ? 'bg-indigo-600 text-white shadow-2xs'
                      : 'bg-white border border-indigo-200 text-indigo-800 hover:bg-indigo-50'
                  }`}
                >
                  🌾 Không trở ({monthBatches.filter((b) => !(batchOverrides[b.id]?.isCoTro !== undefined ? batchOverrides[b.id].isCoTro : getDefaultClassification(b))).length})
                </button>

                <div className="hidden sm:block h-4 w-px bg-slate-200 mx-1" />

                <button
                  type="button"
                  onClick={() => handleSetAllBatches(true)}
                  className="px-2.5 py-1 text-xs font-bold rounded-lg bg-amber-50 border border-amber-200 text-amber-900 hover:bg-amber-100 transition-all cursor-pointer shadow-2xs"
                  title="Gán toàn bộ 52 mẻ lúa trong tháng thành Có trở"
                >
                  ＋ Tất cả Có trở
                </button>
                <button
                  type="button"
                  onClick={() => handleSetAllBatches(false)}
                  className="px-2.5 py-1 text-xs font-bold rounded-lg bg-indigo-50 border border-indigo-200 text-indigo-900 hover:bg-indigo-100 transition-all cursor-pointer shadow-2xs"
                  title="Gán toàn bộ 52 mẻ lúa trong tháng thành Không trở"
                >
                  ＋ Tất cả Không trở
                </button>
                <button
                  type="button"
                  onClick={handleResetBatchesToSample}
                  className="px-2.5 py-1 text-xs font-bold rounded-lg bg-slate-100 border border-slate-200 text-slate-700 hover:bg-slate-200 transition-all cursor-pointer shadow-2xs"
                  title="Khôi phục phân loại theo file mẫu tháng 10 chuẩn (1.586t Có trở, 1.703t Không trở)"
                >
                  🔄 Chuẩn mẫu T10
                </button>
              </div>
            </div>

            {/* Bảng chi tiết 52 mẻ lúa thực tế */}
            <div className="overflow-x-auto rounded-xl border border-slate-200 shadow-2xs max-h-[600px] overflow-y-auto">
              <table className="w-full text-left text-xs">
                <thead className="sticky top-0 bg-[#1F4E78] text-white text-[11px] font-bold uppercase z-10">
                  <tr>
                    <th className="py-2.5 px-2 text-center w-10">STT</th>
                    <th className="py-2.5 px-2.5 text-center">Ngày cân</th>
                    <th className="py-2.5 px-3">Khách hàng</th>
                    <th className="py-2.5 px-3">Phương tiện</th>
                    <th className="py-2.5 px-2 text-center">Loại lúa</th>
                    <th className="py-2.5 px-2.5 text-right">Cân tươi (kg)</th>
                    <th className="py-2.5 px-2.5 text-center">Ngày sấy</th>
                    <th className="py-2.5 px-2.5 text-right">Cân sấy (kg)</th>
                    <th className="py-2.5 px-2 text-center text-amber-200">Tấn</th>
                    <th className="py-2.5 px-2.5 text-center text-amber-200">Ngày xuất (Chú 6)</th>
                    <th className="py-2.5 px-3">Ghe chở lúa khô</th>
                    <th className="py-2.5 px-3 text-center">Phân loại đơn giá</th>
                    <th className="py-2.5 px-3 text-right">Thành tiền</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredMonthBatches.length === 0 ? (
                    <tr>
                      <td colSpan={13} className="py-8 text-center text-slate-400">
                        Không tìm thấy mẻ lúa nào phù hợp với bộ lọc
                      </td>
                    </tr>
                  ) : (
                    filteredMonthBatches.map((b, idx) => {
                      const isCoTro =
                        batchOverrides[b.id]?.isCoTro !== undefined
                          ? batchOverrides[b.id].isCoTro
                          : getDefaultClassification(b);
                      const tons =
                        batchOverrides[b.id]?.tons !== undefined
                          ? batchOverrides[b.id].tons!
                          : getDefaultTons(b);
                      const baseTons = b.roundedTons || roundRiceTons(b.dryWeightKg);
                      const batchDiff = tons - baseTons;
                      const unitPrice = isCoTro ? masterPriceCoTro : masterPriceKhongTro;
                      const amount = tons * unitPrice;
                      return (
                        <tr
                          key={b.id}
                          className={`transition-colors ${
                            idx % 2 === 1 ? 'bg-slate-50/50' : 'bg-white'
                          } hover:bg-blue-50/40`}
                        >
                          <td className="py-2 px-2 text-center font-bold text-slate-500">{idx + 1}</td>
                          <td className="py-2 px-2.5 text-center text-slate-600">{b.weighDate || b.dryDate}</td>
                          <td className="py-2 px-3 font-semibold text-slate-900">{b.customerName}</td>
                          <td className="py-2 px-3 text-slate-700">{b.vehicleName}</td>
                          <td className="py-2 px-2 text-center font-medium text-slate-600">{b.riceType}</td>
                          <td className="py-2 px-2.5 text-right text-slate-600">
                            {b.freshWeightKg ? b.freshWeightKg.toLocaleString() : '-'}
                          </td>
                          <td className="py-2 px-2.5 text-center text-slate-600">{b.dryDate}</td>
                          <td className="py-2 px-2.5 text-right font-medium text-slate-800">
                            {b.dryWeightKg.toLocaleString()}
                          </td>
                          <td className="py-1.5 px-1.5 text-center bg-blue-50/30">
                            <div className="inline-flex flex-col items-center gap-0.5">
                              <input
                                type="number"
                                min={0}
                                value={tons}
                                onWheel={(e) => e.currentTarget.blur()}
                                onChange={(e) => handleBatchTonsChange(b, Number(e.target.value))}
                                className={`w-14 rounded-lg border text-center font-extrabold text-xs py-1 transition-all [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ${
                                  batchDiff !== 0
                                    ? batchDiff > 0
                                      ? 'border-blue-500 bg-blue-100/80 text-blue-900 ring-1 ring-blue-300'
                                      : 'border-amber-500 bg-amber-100/80 text-amber-900 ring-1 ring-amber-300'
                                    : 'border-slate-300 bg-white text-slate-800 focus:border-blue-500 focus:bg-white'
                                }`}
                                title={`Cân sấy: ${b.dryWeightKg.toLocaleString()}kg (dư ${b.dryWeightKg % 1000}kg). Gốc file: ${baseTons}t. Bấm để chỉnh trực tiếp nếu muốn.`}
                              />
                              {batchDiff !== 0 && (
                                <span
                                  className={`text-[9px] font-bold px-1.5 py-0.2 rounded-full ${
                                    batchDiff > 0
                                      ? 'text-blue-700 bg-blue-100'
                                      : 'text-amber-700 bg-amber-100'
                                  }`}
                                  title={`Gốc file: ${baseTons}t -> Đã chỉnh: ${tons}t`}
                                >
                                  {batchDiff > 0 ? `+${batchDiff}t` : `${batchDiff}t`}
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="py-2 px-2.5 text-center font-bold text-emerald-800 bg-emerald-50/50">
                            {b.dischargeDate}
                          </td>
                          <td className="py-2 px-3 text-slate-700">{b.dryVehicle || '-'}</td>
                          <td className="py-2 px-3 text-center">
                            <div className="inline-flex rounded-lg border border-slate-300 p-0.5 bg-slate-100 shadow-2xs">
                              <button
                                type="button"
                                onClick={() => handleToggleBatch(b, true)}
                                className={`px-2 py-1 text-[11px] font-bold rounded-md transition-all cursor-pointer ${
                                  isCoTro
                                    ? 'bg-amber-500 text-white shadow-2xs'
                                    : 'text-slate-600 hover:text-slate-900'
                                }`}
                                title="Tính giá Có trở"
                              >
                                🌾 Có trở ({formatVND(masterPriceCoTro)})
                              </button>
                              <button
                                type="button"
                                onClick={() => handleToggleBatch(b, false)}
                                className={`px-2 py-1 text-[11px] font-bold rounded-md transition-all cursor-pointer ${
                                  !isCoTro
                                    ? 'bg-indigo-600 text-white shadow-2xs'
                                    : 'text-slate-600 hover:text-slate-900'
                                }`}
                                title="Tính giá Không trở"
                              >
                                🌾 Không trở ({formatVND(masterPriceKhongTro)})
                              </button>
                            </div>
                          </td>
                          <td className="py-2 px-3 text-right font-extrabold text-slate-900 whitespace-nowrap">
                            {formatVND(amount)} đ
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
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          PANEL CHI TIẾT MẺ LÚA ĐÃ GHÉP (khi nhấn 👁)
      ══════════════════════════════════════════════════════════════════════ */}
      {detailRow?.result && (
        <div
          className={`rounded-2xl border p-5 shadow-xs ${
            detailRow.result.isMatched
              ? 'border-emerald-300 bg-emerald-50/60'
              : 'border-amber-300 bg-amber-50/60'
          }`}
        >
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-bold text-slate-900">
                Chi tiết ghép mẻ — Ngày {detailRow.result.date}
              </span>
              <StatusBadge status={detailRow.status} />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-lg font-extrabold text-slate-900 whitespace-nowrap">
                {formatVND(detailRow.result.totalAmount)} đ
              </span>
              <button
                onClick={() => setDetailRow(null)}
                className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs text-slate-500 hover:bg-slate-100 cursor-pointer"
              >
                ✕ Đóng
              </button>
            </div>
          </div>

          <p className="text-xs text-slate-700 mb-4 leading-relaxed">
            {detailRow.result.message}
          </p>

          <div className="overflow-x-auto max-h-72 overflow-y-auto rounded-xl border border-slate-200">
            <table className="w-full text-left text-xs">
              <thead className="sticky top-0 bg-slate-100 text-[11px] font-bold uppercase text-slate-600 border-b border-slate-200">
                <tr>
                  <th className="py-2 px-3">Mã Lô</th>
                  <th className="py-2 px-3">Khách Hàng</th>
                  <th className="py-2 px-3">Loại Lúa</th>
                  <th className="py-2 px-3 text-right">Cân sấy (kg)</th>
                  <th className="py-2 px-3 text-right">Tấn làm tròn</th>
                  <th className="py-2 px-3 text-center">Phân loại</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {detailRow.result.batchesCoTro.map((b) => (
                  <tr key={b.id} className="bg-amber-50/30 hover:bg-amber-50/60">
                    <td className="py-2 px-3 font-semibold text-slate-900">{b.batchCode}</td>
                    <td className="py-2 px-3 text-slate-700">{b.customerName}</td>
                    <td className="py-2 px-3 text-slate-600">{b.riceType}</td>
                    <td className="py-2 px-3 text-right text-slate-600">{formatVND(b.dryWeightKg)}</td>
                    <td className="py-2 px-3 text-right font-bold text-amber-700">{b.roundedTons}</td>
                    <td className="py-2 px-3 text-center">
                      <span className="rounded-md bg-amber-100 text-amber-800 px-2 py-0.5 text-[10px] font-bold">
                        Có trở
                      </span>
                    </td>
                  </tr>
                ))}
                {detailRow.result.batchesKhongTro.map((b) => (
                  <tr key={b.id} className="bg-indigo-50/30 hover:bg-indigo-50/60">
                    <td className="py-2 px-3 font-semibold text-slate-900">{b.batchCode}</td>
                    <td className="py-2 px-3 text-slate-700">{b.customerName}</td>
                    <td className="py-2 px-3 text-slate-600">{b.riceType}</td>
                    <td className="py-2 px-3 text-right text-slate-600">{formatVND(b.dryWeightKg)}</td>
                    <td className="py-2 px-3 text-right font-bold text-indigo-700">{b.roundedTons}</td>
                    <td className="py-2 px-3 text-center">
                      <span className="rounded-md bg-indigo-100 text-indigo-800 px-2 py-0.5 text-[10px] font-bold">
                        Không trở
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          BẢNG LƯƠNG CHỐT TRONG THÁNG & XUẤT EXCEL
      ══════════════════════════════════════════════════════════════════════ */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-xs overflow-hidden">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div>
            <h2 className="text-sm font-bold text-slate-900">
              Bảng Kê Lương Tháng {selectedMonthKey} &bull; Đội Chú 6 Thanh
            </h2>
            <p className="text-[11px] text-slate-400 mt-0.5">
              {effectiveLogs.length > 0 || monthBatches.length > 0 ? (
                <>
                  Đã chốt{' '}
                  <strong>{effectiveLogs.length > 0 ? effectiveLogs.length : monthBatches.length}</strong>{' '}
                  {effectiveLogs.length > 0 ? 'ngày công' : 'mẻ lúa thực tế'} &bull; Tổng tiền lương:{' '}
                  <strong className="text-blue-700 font-extrabold">
                    {formatVND(displayTotalAmount)} đ
                  </strong>
                </>
              ) : (
                'Bấm nút ⚡ Nạp ngày từ File Lúa để tự động chốt lương'
              )}
            </p>
          </div>
          <button
            onClick={handleExportExcel}
            disabled={isExporting || (effectiveLogs.length === 0 && monthBatches.length === 0)}
            className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-blue-700 to-indigo-600 px-4 py-2 text-xs font-bold text-white shadow-xs hover:from-blue-800 hover:to-indigo-700 disabled:opacity-40 cursor-pointer transition-all"
          >
            📥 {isExporting ? 'Đang kết xuất...' : `Xuất Excel Tháng ${selectedMonthKey}`}
          </button>
        </div>

        {effectiveLogs.length === 0 && monthBatches.length === 0 ? (
          <div className="py-12 text-center text-xs text-slate-400">
            Chưa có ngày công nào trong Tháng {selectedMonthKey} được nhập. Hãy điền số tấn ở bảng trên rồi bấm <strong>&quot;📥 Xuất Excel&quot;</strong>, hệ thống sẽ kết xuất bảng kê hoàn chỉnh!
          </div>
        ) : (
          <div>
            {/* Thanh TỔNG CỘNG mô phỏng Hàng 3 trong File Excel Master */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 bg-amber-50/80 border-b border-amber-200 p-3 text-xs">
              <div className="rounded-lg bg-white p-2.5 border border-amber-200 shadow-2xs">
                <span className="text-[10px] uppercase font-bold text-slate-500">🌾 Cân sấy (Tấn)</span>
                <p className="text-sm font-extrabold text-slate-900 mt-0.5">
                  {displayTotalTons} tấn
                </p>
              </div>
              <div className="rounded-lg bg-white p-2.5 border border-amber-200 shadow-2xs">
                <span className="text-[10px] uppercase font-bold text-amber-700">
                  🌾 Có Trở ({displayTonsCoTro}t)
                </span>
                <p className="text-sm font-extrabold text-amber-800 mt-0.5">
                  {formatVND(displayTonsCoTro * masterPriceCoTro)}&thinsp;đ
                </p>
              </div>
              <div className="rounded-lg bg-white p-2.5 border border-indigo-200 shadow-2xs">
                <span className="text-[10px] uppercase font-bold text-indigo-700">
                  🌾 Không Trở ({displayTonsKhongTro}t)
                </span>
                <p className="text-sm font-extrabold text-indigo-800 mt-0.5">
                  {formatVND(displayTonsKhongTro * masterPriceKhongTro)}&thinsp;đ
                </p>
              </div>
              <div className="rounded-lg bg-amber-400 p-2.5 border border-amber-500 shadow-2xs">
                <span className="text-[10px] uppercase font-bold text-amber-950">💰 TỔNG CỘNG LƯƠNG</span>
                <p className="text-base font-black text-amber-950 mt-0.5">
                  {formatVND(displayTotalAmount)}&thinsp;đ
                </p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-[11px] font-bold uppercase text-slate-500 border-b border-slate-200">
                  <tr>
                    <th className="py-2.5 px-3">Ngày Làm</th>
                    <th className="py-2.5 px-3 text-right text-amber-700">Có trở (tấn)</th>
                    <th className="py-2.5 px-3 text-right text-amber-700">Tiền có trở</th>
                    <th className="py-2.5 px-3 text-right text-indigo-700">Không trở (tấn)</th>
                    <th className="py-2.5 px-3 text-right text-indigo-700">Tiền không trở</th>
                    <th className="py-2.5 px-3 text-right font-extrabold text-slate-700">Tổng ngày</th>
                    <th className="py-2.5 px-3 text-center">Xóa</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {effectiveLogs.map((log) => (
                    <tr key={log.date} className="hover:bg-slate-50">
                      <td className="py-2.5 px-3 font-bold text-slate-900">{log.date}</td>
                      <td className="py-2.5 px-3 text-right text-amber-700 font-semibold">{log.expectedTonsCoTro}</td>
                      <td className="py-2.5 px-3 text-right text-slate-700 whitespace-nowrap">{formatVND(log.amountCoTro)}&thinsp;đ</td>
                      <td className="py-2.5 px-3 text-right text-indigo-700 font-semibold">{log.expectedTonsKhongTro}</td>
                      <td className="py-2.5 px-3 text-right text-slate-700 whitespace-nowrap">{formatVND(log.amountKhongTro)}&thinsp;đ</td>
                      <td className="py-2.5 px-3 text-right font-extrabold text-slate-900 whitespace-nowrap">{formatVND(log.totalAmount)}&thinsp;đ</td>
                      <td className="py-2.5 px-3 text-center">
                        <button
                          onClick={() =>
                            setSavedLogs((prev) => prev.filter((l) => l.date !== log.date))
                          }
                          className="text-[11px] text-red-500 hover:text-red-700 font-semibold cursor-pointer"
                        >
                          Xóa
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-slate-50 border-t-2 border-slate-200 font-bold text-xs">
                    <td className="py-3 px-3 text-slate-700 uppercase">
                      Tổng cộng Tháng {selectedMonthKey}
                    </td>
                    <td className="py-3 px-3 text-right text-amber-800">
                      {effectiveLogs.reduce((s, l) => s + l.expectedTonsCoTro, 0)} tấn
                    </td>
                    <td className="py-3 px-3 text-right text-slate-800 whitespace-nowrap">
                      {formatVND(effectiveLogs.reduce((s, l) => s + l.amountCoTro, 0))}&thinsp;đ
                    </td>
                    <td className="py-3 px-3 text-right text-indigo-800">
                      {effectiveLogs.reduce((s, l) => s + l.expectedTonsKhongTro, 0)} tấn
                    </td>
                    <td className="py-3 px-3 text-right text-slate-800 whitespace-nowrap">
                      {formatVND(effectiveLogs.reduce((s, l) => s + l.amountKhongTro, 0))}&thinsp;đ
                    </td>
                    <td className="py-3 px-3 text-right text-base text-blue-700 whitespace-nowrap">
                      {formatVND(monthlyTotal)}&thinsp;đ
                    </td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
