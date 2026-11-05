'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { RiceBatch, DailyReconciliationResult } from '@/lib/rice-payroll/types';

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

/**
 * Kiểm tra xem địa điểm sấy có phải Cơ sở I (Cơ sở 1) hay không
 */
function isCoSo1(facility: string): boolean {
  if (!facility) return false;
  const f = facility.toUpperCase().trim();
  return (
    f === 'CƠ SỞ I' ||
    f === 'CƠ SỞ 1' ||
    f.includes('CƠ SỞ I') ||
    f.includes('CƠ SỞ 1') ||
    f.includes('CS1') ||
    f.includes('CS 1')
  );
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

  // ── Bảng ngày công trong tháng ──
  const [rows, setRows] = useState<DayRow[]>([newRow()]);

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

  // Khi đổi tháng, tự động set ngày cho hàng đầu tiên là ngày đầu tiên của tháng (Ngày 01)
  const handleSelectMonth = (monthKey: string) => {
    setSelectedMonthKey(monthKey);
    const validDates = cs1DischargeDates.filter((d) => d.endsWith(`/${monthKey}`));
    // Mặc định ngày đầu tiên trong tháng (ví dụ 01/10/2026)
    setRows([
      {
        ...newRow(validDates[0] || `01/${monthKey}`),
        priceCoTro: masterPriceCoTro,
        priceKhongTro: masterPriceKhongTro,
      },
    ]);
    setDetailRow(null);
    setSavedLogs([]); // Reset bảng lương tháng khi chuyển sang tháng khác
  };

  // ─── Thao tác bảng ngày & Cập nhật đơn giá toàn bộ ─────────────────────────

  const updateRow = useCallback((id: string, patch: Partial<DayRow>) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }, []);

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
    if (!row.date) {
      updateRow(row.id, { status: 'error', errorMsg: 'Chưa chọn ngày làm việc' });
      return;
    }
    const dayBatches = getDayBatches(row.date);
    if (dayBatches.length === 0) {
      updateRow(row.id, {
        status: 'error',
        errorMsg: `Không có mẻ lúa nào tại ${selectedFacility} ngày ${row.date}`,
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
    // Lấy tất cả các dòng người dùng đã nhập (có ngày và có số tấn > 0)
    const validRows = rows.filter((r) => r.date && (r.tonsCoTro > 0 || r.tonsKhongTro > 0));
    if (validRows.length === 0) {
      return savedLogs;
    }

    return validRows.map((r) => {
      // Nếu đã bấm ghép mẻ thì dùng kết quả ghép chi tiết
      if (r.result) return r.result;

      // Nếu vừa gõ số xong mà chưa bấm ghép, vẫn lập tức tính tiền chuẩn và cho phép xuất Excel
      const amountCoTro = (r.tonsCoTro || 0) * (r.priceCoTro || 0);
      const amountKhongTro = (r.tonsKhongTro || 0) * (r.priceKhongTro || 0);
      return {
        date: r.date,
        expectedTonsCoTro: r.tonsCoTro || 0,
        expectedTonsKhongTro: r.tonsKhongTro || 0,
        unitPriceCoTro: r.priceCoTro || 0,
        unitPriceKhongTro: r.priceKhongTro || 0,
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
  }, [rows, savedLogs]);

  // ─── Xuất Excel bảng lương tháng ─────────────────────────────────────────
  const handleExportExcel = async () => {
    const logsToExport = effectiveLogs;
    if (logsToExport.length === 0) {
      alert('Vui lòng điền số tấn của các ngày công trước khi bấm xuất Excel!');
      return;
    }
    setIsExporting(true);
    try {
      const [m, y] = selectedMonthKey.split('/').map(Number);
      const res = await fetch('/api/rice-payroll/export-monthly', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          month: m || 10,
          year: y || 2026,
          teamName: 'ĐỘI CHÚ 6 THANH - XUẤT CS1',
          dailyLogs: logsToExport,
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
          BẢNG NHẬP NHANH CÔNG NHẬT TRONG THÁNG
      ══════════════════════════════════════════════════════════════════════ */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-xs overflow-hidden">
        {/* Header bảng */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div>
            <h2 className="text-sm font-bold text-slate-900">
              Nhập Sổ Tay Chú 6 Thanh &bull; Tháng {selectedMonthKey}
            </h2>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Chỉ hiển thị các ngày trong <strong>Tháng {selectedMonthKey}</strong>. Gõ số tấn rồi bấm <strong>Ghép Mẻ</strong>.
            </p>
          </div>

          <div className="flex gap-2">
            <button
              onClick={addRow}
              className="inline-flex items-center gap-1.5 rounded-xl border border-blue-300 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-100 cursor-pointer transition-all"
            >
              ＋ Thêm ngày
            </button>
            <button
              onClick={handleReconcileAll}
              disabled={allBatches.length === 0}
              className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-3.5 py-1.5 text-xs font-bold text-white hover:bg-blue-700 disabled:opacity-40 cursor-pointer transition-all shadow-xs"
            >
              🔍 Ghép Tất Cả
            </button>
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
          </div>
        </div>

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
                const previewCoTro = row.tonsCoTro * row.priceCoTro;
                const previewKhongTro = row.tonsKhongTro * row.priceKhongTro;
                const previewTotal = previewCoTro + previewKhongTro;
                const isActive = detailRow?.id === row.id;
                return (
                  <tr
                    key={row.id}
                    className={`transition-colors ${
                      isActive
                        ? 'bg-blue-50/70'
                        : row.status === 'matched'
                        ? 'bg-emerald-50/40 hover:bg-emerald-50/60'
                        : row.status === 'mismatch'
                        ? 'bg-amber-50/40 hover:bg-amber-50/60'
                        : row.status === 'error'
                        ? 'bg-red-50/40 hover:bg-red-50'
                        : 'hover:bg-slate-50/80'
                    }`}
                  >
                    {/* Chọn Ngày làm việc (Cho phép gõ tự do + Chọn dropdown phân nhóm tháng trước/này/sau) */}
                    <td className="py-2 px-3">
                      <div className="flex items-center gap-1">
                        <input
                          type="text"
                          value={row.date}
                          onChange={(e) =>
                            updateRow(row.id, {
                              date: e.target.value.trim(),
                              status: 'idle',
                              result: null,
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
                    </td>

                    {/* Có trở: tấn */}
                    <td className="py-2 px-3">
                      <input
                        type="number"
                        min={0}
                        value={row.tonsCoTro || ''}
                        onWheel={(e) => e.currentTarget.blur()}
                        onChange={(e) =>
                          updateRow(row.id, {
                            tonsCoTro: Number(e.target.value),
                            status: 'idle',
                            result: null,
                          })
                        }
                        placeholder="168"
                        className="w-full rounded-lg border border-amber-300 bg-amber-50/40 px-2 py-1.5 text-center text-xs font-bold text-amber-900 focus:border-amber-500 focus:outline-none focus:bg-white [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      />
                    </td>

                    {/* Có trở: giá */}
                    <td className="py-2 px-3">
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
                    </td>

                    {/* Tiền có trở */}
                    <td className="py-2 px-3 text-right font-semibold text-amber-700 whitespace-nowrap">
                      {formatVND(previewCoTro)}&thinsp;đ
                    </td>

                    {/* Không trở: tấn */}
                    <td className="py-2 px-3">
                      <input
                        type="number"
                        min={0}
                        value={row.tonsKhongTro || ''}
                        onWheel={(e) => e.currentTarget.blur()}
                        onChange={(e) =>
                          updateRow(row.id, {
                            tonsKhongTro: Number(e.target.value),
                            status: 'idle',
                            result: null,
                          })
                        }
                        placeholder="253"
                        className="w-full rounded-lg border border-indigo-300 bg-indigo-50/40 px-2 py-1.5 text-center text-xs font-bold text-indigo-900 focus:border-indigo-500 focus:outline-none focus:bg-white [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      />
                    </td>

                    {/* Không trở: giá */}
                    <td className="py-2 px-3">
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
                    </td>

                    {/* Tiền không trở */}
                    <td className="py-2 px-3 text-right font-semibold text-indigo-700 whitespace-nowrap">
                      {formatVND(previewKhongTro)}&thinsp;đ
                    </td>

                    {/* Tổng ngày */}
                    <td className="py-2 px-3 text-right font-extrabold text-slate-900 text-sm whitespace-nowrap">
                      {formatVND(previewTotal)}&thinsp;đ
                    </td>

                    {/* Trạng thái */}
                    <td className="py-2 px-3 text-center">
                      <StatusBadge status={row.status} />
                      {row.errorMsg && (
                        <p className="mt-1 text-[10px] text-red-500 text-left max-w-36">
                          {row.errorMsg}
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
            const previewCoTro = row.tonsCoTro * row.priceCoTro;
            const previewKhongTro = row.tonsKhongTro * row.priceKhongTro;
            const previewTotal = previewCoTro + previewKhongTro;
            return (
              <div key={row.id} className="p-4 space-y-3">
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

                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-3 space-y-2">
                    <p className="text-[11px] font-bold text-amber-800">🌾 Có trở</p>
                    <div className="grid grid-cols-2 gap-1.5">
                      <div>
                        <label className="text-[10px] text-slate-500">Tấn</label>
                        <input
                          type="number"
                          min={0}
                          value={row.tonsCoTro || ''}
                          onWheel={(e) => e.currentTarget.blur()}
                          onChange={(e) =>
                            updateRow(row.id, {
                              tonsCoTro: Number(e.target.value),
                              status: 'idle',
                              result: null,
                            })
                          }
                          placeholder="168"
                          className="w-full rounded-lg border border-amber-300 px-2 py-1.5 text-center text-xs font-bold text-amber-900 focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
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

                  <div className="rounded-xl border border-indigo-200 bg-indigo-50/50 p-3 space-y-2">
                    <p className="text-[11px] font-bold text-indigo-800">🌾 Không trở</p>
                    <div className="grid grid-cols-2 gap-1.5">
                      <div>
                        <label className="text-[10px] text-slate-500">Tấn</label>
                        <input
                          type="number"
                          min={0}
                          value={row.tonsKhongTro || ''}
                          onWheel={(e) => e.currentTarget.blur()}
                          onChange={(e) =>
                            updateRow(row.id, {
                              tonsKhongTro: Number(e.target.value),
                              status: 'idle',
                              result: null,
                            })
                          }
                          placeholder="253"
                          className="w-full rounded-lg border border-indigo-300 px-2 py-1.5 text-center text-xs font-bold text-indigo-900 focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
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
                  <p className="text-[11px] text-red-500">{row.errorMsg}</p>
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
              {effectiveLogs.length > 0 ? (
                <>
                  Đã chốt <strong>{effectiveLogs.length}</strong> ngày công &bull; Tổng tiền lương:{' '}
                  <strong className="text-blue-700 font-extrabold">
                    {formatVND(monthlyTotal)} đ
                  </strong>
                </>
              ) : (
                'Bấm nút 🔍 Ghép Tất Cả ở bảng trên để kiểm tra mẻ lúa và tự động chốt lương'
              )}
            </p>
          </div>
          <button
            onClick={handleExportExcel}
            disabled={isExporting || effectiveLogs.length === 0}
            className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-blue-700 to-indigo-600 px-4 py-2 text-xs font-bold text-white shadow-xs hover:from-blue-800 hover:to-indigo-700 disabled:opacity-40 cursor-pointer transition-all"
          >
            📥 {isExporting ? 'Đang kết xuất...' : `Xuất Excel Tháng ${selectedMonthKey}`}
          </button>
        </div>

        {effectiveLogs.length === 0 ? (
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
                  {effectiveLogs.reduce((s, l) => s + l.expectedTonsCoTro + l.expectedTonsKhongTro, 0)} tấn
                </p>
              </div>
              <div className="rounded-lg bg-white p-2.5 border border-amber-200 shadow-2xs">
                <span className="text-[10px] uppercase font-bold text-amber-700">🌾 Tiền Có Trở</span>
                <p className="text-sm font-extrabold text-amber-800 mt-0.5">
                  {formatVND(effectiveLogs.reduce((s, l) => s + l.amountCoTro, 0))}&thinsp;đ
                </p>
              </div>
              <div className="rounded-lg bg-white p-2.5 border border-indigo-200 shadow-2xs">
                <span className="text-[10px] uppercase font-bold text-indigo-700">🌾 Tiền Không Trở</span>
                <p className="text-sm font-extrabold text-indigo-800 mt-0.5">
                  {formatVND(effectiveLogs.reduce((s, l) => s + l.amountKhongTro, 0))}&thinsp;đ
                </p>
              </div>
              <div className="rounded-lg bg-amber-400 p-2.5 border border-amber-500 shadow-2xs">
                <span className="text-[10px] uppercase font-bold text-amber-950">💰 TỔNG CỘNG LƯƠNG</span>
                <p className="text-base font-black text-amber-950 mt-0.5">
                  {formatVND(monthlyTotal)}&thinsp;đ
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
