'use client';

import React, { useState, useCallback } from 'react';
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
  // ── Dữ liệu Excel nền ──
  const [isLoadingFile, setIsLoadingFile] = useState(false);
  const [loadedFileName, setLoadedFileName] = useState<string>('');
  const [allBatches, setAllBatches] = useState<RiceBatch[]>([]);
  const [availableDates, setAvailableDates] = useState<string[]>([]);
  const [fileError, setFileError] = useState('');

  // ── Bảng ngày công ──
  const [rows, setRows] = useState<DayRow[]>([newRow()]);

  // ── Chi tiết mẻ đang xem ──
  const [detailRow, setDetailRow] = useState<DayRow | null>(null);

  // ── Danh sách đã lưu tháng ──
  const [savedLogs, setSavedLogs] = useState<DailyReconciliationResult[]>([]);
  const [isExporting, setIsExporting] = useState(false);

  // ── Cơ sở mặc định ──
  const selectedFacility = 'Cơ sở 1';

  // ─── Load dữ liệu ─────────────────────────────────────────────────────────

  const handleLoadSample = async () => {
    setIsLoadingFile(true);
    setFileError('');
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
    } catch (err) {
      setFileError(err instanceof Error ? err.message : 'Lỗi không xác định');
    } finally {
      setIsLoadingFile(false);
    }
  };

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
      if (!res.ok) throw new Error(data.error || 'Lỗi khi đọc file Excel');
      setLoadedFileName(data.fileName);
      setAllBatches(data.batches);
      setAvailableDates(data.dates);
    } catch (err) {
      setFileError(err instanceof Error ? err.message : 'Lỗi upload');
    } finally {
      setIsLoadingFile(false);
    }
  };

  // ─── Thao tác bảng ngày ───────────────────────────────────────────────────

  const updateRow = useCallback(
    (id: string, patch: Partial<DayRow>) => {
      setRows((prev) =>
        prev.map((r) => (r.id === id ? { ...r, ...patch } : r))
      );
    },
    []
  );

  const addRow = () => {
    setRows((prev) => [...prev, newRow()]);
  };

  const removeRow = (id: string) => {
    setRows((prev) => prev.filter((r) => r.id !== id));
    if (detailRow?.id === id) setDetailRow(null);
  };

  const getDayBatches = (date: string) =>
    allBatches.filter((b) => {
      const matchDate =
        b.dischargeDate === date || b.dryDate === date;
      const matchFacility = b.dryFacility
        .toLowerCase()
        .includes(selectedFacility.toLowerCase());
      return matchDate && matchFacility;
    });

  // ─── Ghép mẻ 1 ngày ───────────────────────────────────────────────────────

  const handleReconcileRow = async (row: DayRow) => {
    if (!row.date) {
      updateRow(row.id, { status: 'error', errorMsg: 'Chưa nhập ngày' });
      return;
    }
    const dayBatches = getDayBatches(row.date);
    if (dayBatches.length === 0) {
      updateRow(row.id, {
        status: 'error',
        errorMsg: `Không có mẻ lúa nào tại ${selectedFacility} trong ngày ${row.date}`,
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
    } catch (err) {
      updateRow(row.id, {
        status: 'error',
        errorMsg: err instanceof Error ? err.message : 'Lỗi đối soát',
      });
    }
  };

  // ─── Ghép mẻ hàng loạt tất cả ────────────────────────────────────────────

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

  // ─── Xuất Excel bảng lương tháng ─────────────────────────────────────────

  const handleExportExcel = async () => {
    if (savedLogs.length === 0) return;
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

  // ─── Computed ─────────────────────────────────────────────────────────────

  const monthlyTotal = savedLogs.reduce((s, l) => s + l.totalAmount, 0);

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="space-y-5">

      {/* ══════════════════════════════════════════════════════════════════════
          BƯỚC 1 — NẠP FILE MASTER EXCEL
      ══════════════════════════════════════════════════════════════════════ */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700 text-xs font-bold">
                1
              </span>
              <h2 className="text-sm font-bold text-slate-900">
                Nạp File Dữ Liệu Mẻ Lúa (Excel Master)
              </h2>
            </div>
            {loadedFileName ? (
              <p className="mt-1 pl-9 text-xs text-emerald-700 font-medium">
                ✓ {loadedFileName} — {allBatches.length.toLocaleString()} mẻ &bull;{' '}
                {availableDates.length} ngày làm việc
              </p>
            ) : (
              <p className="mt-1 pl-9 text-xs text-slate-400">
                Chưa nạp dữ liệu. Nhấn nút để bắt đầu.
              </p>
            )}
          </div>

          <div className="flex flex-wrap gap-2 pl-9 sm:pl-0">
            <button
              onClick={handleLoadSample}
              disabled={isLoadingFile}
              className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 px-4 py-2 text-xs font-semibold text-white shadow-xs hover:from-emerald-700 hover:to-teal-700 disabled:opacity-50 cursor-pointer transition-all"
            >
              ⚡ {isLoadingFile ? 'Đang đọc...' : 'Nạp File Mẫu 2026'}
            </button>
            <label className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 cursor-pointer transition-all">
              📁 Chọn file khác
              <input
                type="file"
                accept=".xlsx,.xls"
                className="hidden"
                onChange={handleFileUpload}
              />
            </label>
          </div>
        </div>

        {fileError && (
          <div className="mt-3 rounded-xl bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">
            ⚠️ {fileError}
          </div>
        )}
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          BƯỚC 2 — BẢNG NHẬP NHANH NHIỀU NGÀY
      ══════════════════════════════════════════════════════════════════════ */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-xs overflow-hidden">

        {/* Header bảng */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-100 text-blue-700 text-xs font-bold">
              2
            </span>
            <div>
              <h2 className="text-sm font-bold text-slate-900">
                Nhập Sổ Tay — Đội Chú 6 Thanh &bull; Xuất Cơ sở 1
              </h2>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Mỗi hàng = 1 ngày. Nhập xong bấm <strong>Ghép Mẻ</strong> từng hàng hoặc <strong>Ghép Tất Cả</strong>.
              </p>
            </div>
          </div>
          <div className="flex gap-2 pl-9 sm:pl-0">
            <button
              onClick={addRow}
              className="inline-flex items-center gap-1.5 rounded-xl border border-blue-300 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-100 cursor-pointer transition-all"
            >
              ＋ Thêm ngày
            </button>
            <button
              onClick={handleReconcileAll}
              disabled={allBatches.length === 0}
              className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-blue-700 disabled:opacity-40 cursor-pointer transition-all"
            >
              🔍 Ghép Tất Cả
            </button>
          </div>
        </div>

        {/* ── Desktop table ── */}
        <div className="hidden lg:block overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-[11px] font-bold uppercase text-slate-500 border-b border-slate-200">
              <tr>
                <th className="py-2.5 px-3 w-36">Ngày làm việc</th>
                <th className="py-2.5 px-3 text-center text-amber-700">Có trở (tấn)</th>
                <th className="py-2.5 px-3 text-center text-amber-700">Giá/tấn (đ)</th>
                <th className="py-2.5 px-3 text-right text-amber-700">Tiền có trở</th>
                <th className="py-2.5 px-3 text-center text-indigo-700">Không trở (tấn)</th>
                <th className="py-2.5 px-3 text-center text-indigo-700">Giá/tấn (đ)</th>
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
                        ? 'bg-blue-50/60'
                        : row.status === 'matched'
                        ? 'bg-emerald-50/40 hover:bg-emerald-50/60'
                        : row.status === 'mismatch'
                        ? 'bg-amber-50/40 hover:bg-amber-50/60'
                        : row.status === 'error'
                        ? 'bg-red-50/40 hover:bg-red-50'
                        : 'hover:bg-slate-50/80'
                    }`}
                  >
                    {/* Ngày */}
                    <td className="py-2 px-3">
                      {availableDates.length > 0 ? (
                        <select
                          value={row.date}
                          onChange={(e) =>
                            updateRow(row.id, {
                              date: e.target.value,
                              status: 'idle',
                              result: null,
                            })
                          }
                          className="w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs font-semibold text-slate-800 focus:border-blue-500 focus:outline-none"
                        >
                          <option value="">— Chọn ngày —</option>
                          {availableDates.map((d) => (
                            <option key={d} value={d}>
                              {d}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <input
                          type="text"
                          value={row.date}
                          onChange={(e) =>
                            updateRow(row.id, {
                              date: e.target.value,
                              status: 'idle',
                              result: null,
                            })
                          }
                          placeholder="30/09/2026"
                          className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-xs font-semibold text-slate-800 focus:border-blue-500 focus:outline-none"
                        />
                      )}
                    </td>

                    {/* Có trở: tấn */}
                    <td className="py-2 px-3">
                      <input
                        type="number"
                        min={0}
                        value={row.tonsCoTro || ''}
                        onChange={(e) =>
                          updateRow(row.id, {
                            tonsCoTro: Number(e.target.value),
                            status: 'idle',
                            result: null,
                          })
                        }
                        placeholder="168"
                        className="w-full rounded-lg border border-amber-300 bg-amber-50/40 px-2 py-1.5 text-center text-xs font-bold text-amber-900 focus:border-amber-500 focus:outline-none focus:bg-white"
                      />
                    </td>

                    {/* Có trở: giá */}
                    <td className="py-2 px-3">
                      <input
                        type="number"
                        min={0}
                        step={1000}
                        value={row.priceCoTro || ''}
                        onChange={(e) =>
                          updateRow(row.id, {
                            priceCoTro: Number(e.target.value),
                          })
                        }
                        className="w-full rounded-lg border border-amber-200 bg-white px-2 py-1.5 text-center text-xs text-slate-700 focus:border-amber-400 focus:outline-none"
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
                        onChange={(e) =>
                          updateRow(row.id, {
                            tonsKhongTro: Number(e.target.value),
                            status: 'idle',
                            result: null,
                          })
                        }
                        placeholder="253"
                        className="w-full rounded-lg border border-indigo-300 bg-indigo-50/40 px-2 py-1.5 text-center text-xs font-bold text-indigo-900 focus:border-indigo-500 focus:outline-none focus:bg-white"
                      />
                    </td>

                    {/* Không trở: giá */}
                    <td className="py-2 px-3">
                      <input
                        type="number"
                        min={0}
                        step={1000}
                        value={row.priceKhongTro || ''}
                        onChange={(e) =>
                          updateRow(row.id, {
                            priceKhongTro: Number(e.target.value),
                          })
                        }
                        className="w-full rounded-lg border border-indigo-200 bg-white px-2 py-1.5 text-center text-xs text-slate-700 focus:border-indigo-400 focus:outline-none"
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
                        <p className="mt-1 text-[10px] text-red-500 text-left max-w-32">
                          {row.errorMsg}
                        </p>
                      )}
                    </td>

                    {/* Thao tác */}
                    <td className="py-2 px-3">
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          onClick={() => handleReconcileRow(row)}
                          disabled={
                            row.status === 'loading' || allBatches.length === 0
                          }
                          title="Ghép mẻ ngày này"
                          className="rounded-lg bg-blue-600 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-blue-700 disabled:opacity-40 cursor-pointer transition-colors"
                        >
                          🔍
                        </button>

                        {row.result && (
                          <button
                            onClick={() =>
                              setDetailRow(
                                detailRow?.id === row.id ? null : { ...row }
                              )
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
                  Tổng cộng ({rows.length} ngày)
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

        {/* ── Mobile cards ── */}
        <div className="lg:hidden divide-y divide-slate-100">
          {rows.map((row) => {
            const previewCoTro = row.tonsCoTro * row.priceCoTro;
            const previewKhongTro = row.tonsKhongTro * row.priceKhongTro;
            const previewTotal = previewCoTro + previewKhongTro;
            return (
              <div key={row.id} className="p-4 space-y-3">
                {/* Ngày + trạng thái */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex-1">
                    {availableDates.length > 0 ? (
                      <select
                        value={row.date}
                        onChange={(e) =>
                          updateRow(row.id, {
                            date: e.target.value,
                            status: 'idle',
                            result: null,
                          })
                        }
                        className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-800 focus:border-blue-500 focus:outline-none"
                      >
                        <option value="">— Chọn ngày —</option>
                        {availableDates.map((d) => (
                          <option key={d} value={d}>
                            Ngày {d}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type="text"
                        value={row.date}
                        onChange={(e) =>
                          updateRow(row.id, {
                            date: e.target.value,
                            status: 'idle',
                            result: null,
                          })
                        }
                        placeholder="30/09/2026"
                        className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-800 focus:border-blue-500 focus:outline-none"
                      />
                    )}
                  </div>
                  <StatusBadge status={row.status} />
                </div>

                {/* Hai hàng nhập */}
                <div className="grid grid-cols-2 gap-3">
                  {/* Có trở */}
                  <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-3 space-y-2">
                    <p className="text-[11px] font-bold text-amber-800">🌾 Có trở</p>
                    <div className="grid grid-cols-2 gap-1.5">
                      <div>
                        <label className="text-[10px] text-slate-500">Tấn</label>
                        <input
                          type="number"
                          min={0}
                          value={row.tonsCoTro || ''}
                          onChange={(e) =>
                            updateRow(row.id, {
                              tonsCoTro: Number(e.target.value),
                              status: 'idle',
                              result: null,
                            })
                          }
                          placeholder="168"
                          className="w-full rounded-lg border border-amber-300 px-2 py-1.5 text-center text-xs font-bold text-amber-900 focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] text-slate-500">Giá</label>
                        <input
                          type="number"
                          min={0}
                          step={1000}
                          value={row.priceCoTro || ''}
                          onChange={(e) =>
                            updateRow(row.id, { priceCoTro: Number(e.target.value) })
                          }
                          className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-center text-xs text-slate-700 focus:outline-none"
                        />
                      </div>
                    </div>
                    <p className="text-right text-xs font-bold text-amber-800">
                      = {formatVND(previewCoTro)} đ
                    </p>
                  </div>

                  {/* Không trở */}
                  <div className="rounded-xl border border-indigo-200 bg-indigo-50/50 p-3 space-y-2">
                    <p className="text-[11px] font-bold text-indigo-800">🌾 Không trở</p>
                    <div className="grid grid-cols-2 gap-1.5">
                      <div>
                        <label className="text-[10px] text-slate-500">Tấn</label>
                        <input
                          type="number"
                          min={0}
                          value={row.tonsKhongTro || ''}
                          onChange={(e) =>
                            updateRow(row.id, {
                              tonsKhongTro: Number(e.target.value),
                              status: 'idle',
                              result: null,
                            })
                          }
                          placeholder="253"
                          className="w-full rounded-lg border border-indigo-300 px-2 py-1.5 text-center text-xs font-bold text-indigo-900 focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] text-slate-500">Giá</label>
                        <input
                          type="number"
                          min={0}
                          step={1000}
                          value={row.priceKhongTro || ''}
                          onChange={(e) =>
                            updateRow(row.id, { priceKhongTro: Number(e.target.value) })
                          }
                          className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-center text-xs text-slate-700 focus:outline-none"
                        />
                      </div>
                    </div>
                    <p className="text-right text-xs font-bold text-indigo-800">
                      = {formatVND(previewKhongTro)} đ
                    </p>
                  </div>
                </div>

                {/* Tổng ngày + buttons */}
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

          {/* Thêm ngày (mobile) */}
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
          PANEL CHI TIẾT MẺ LÚA (khi nhấn 👁)
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
                ✕
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
          BƯỚC 3 — BẢNG LƯƠNG THÁNG
      ══════════════════════════════════════════════════════════════════════ */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-xs overflow-hidden">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-100 text-indigo-700 text-xs font-bold">
              3
            </span>
            <div>
              <h2 className="text-sm font-bold text-slate-900">
                Bảng Kê Lương Tháng &bull; Đội Chú 6 Thanh
              </h2>
              <p className="text-[11px] text-slate-400 mt-0.5">
                {savedLogs.length > 0 ? (
                  <>
                    {savedLogs.length} ngày công đã chốt &bull; Tổng lương:{' '}
                    <strong className="text-blue-700 font-extrabold">
                      {formatVND(monthlyTotal)} đ
                    </strong>
                  </>
                ) : (
                  'Bấm 💾 để lưu ngày vào bảng lương'
                )}
              </p>
            </div>
          </div>
          <button
            onClick={handleExportExcel}
            disabled={isExporting || savedLogs.length === 0}
            className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-blue-700 to-indigo-600 px-4 py-2 text-xs font-bold text-white shadow-xs hover:from-blue-800 hover:to-indigo-700 disabled:opacity-40 cursor-pointer transition-all"
          >
            📥 {isExporting ? 'Đang kết xuất...' : 'Xuất Excel (.xlsx)'}
          </button>
        </div>

        {savedLogs.length === 0 ? (
          <div className="py-12 text-center text-xs text-slate-400">
            Chưa có ngày công nào được lưu. Ghép mẻ từng ngày và nhấn 💾 để chốt vào bảng lương.
          </div>
        ) : (
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
                {savedLogs.map((log) => (
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
                  <td className="py-3 px-3 text-slate-700 uppercase">Tổng cộng</td>
                  <td className="py-3 px-3 text-right text-amber-800">
                    {savedLogs.reduce((s, l) => s + l.expectedTonsCoTro, 0)} tấn
                  </td>
                  <td className="py-3 px-3 text-right text-slate-800 whitespace-nowrap">
                    {formatVND(savedLogs.reduce((s, l) => s + l.amountCoTro, 0))}&thinsp;đ
                  </td>
                  <td className="py-3 px-3 text-right text-indigo-800">
                    {savedLogs.reduce((s, l) => s + l.expectedTonsKhongTro, 0)} tấn
                  </td>
                  <td className="py-3 px-3 text-right text-slate-800 whitespace-nowrap">
                    {formatVND(savedLogs.reduce((s, l) => s + l.amountKhongTro, 0))}&thinsp;đ
                  </td>
                  <td className="py-3 px-3 text-right text-base text-blue-700 whitespace-nowrap">
                    {formatVND(monthlyTotal)}&thinsp;đ
                  </td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
