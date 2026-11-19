'use client';

import React, { useState, useEffect, useMemo, useRef, useTransition } from 'react';
import {
  UngroundKhoBatch,
  UngroundTuoiBatch,
  buildUngroundReport,
} from '@/lib/rice-payroll/unground-report-parser';
import sampleUngroundData from '@/data/sample-unground-data.json';

function formatMoney(num: number): string {
  return new Intl.NumberFormat('vi-VN').format(Math.round(num));
}

function formatVNDateTime(isoString: string): string {
  try {
    const d = new Date(isoString);
    return d.toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour12: false });
  } catch {
    return isoString;
  }
}

interface FileMeta {
  kho: { name: string; updatedAt: string } | null;
  tuoi: { name: string; updatedAt: string } | null;
  khoPath: string | null;
  tuoiPath: string | null;
}

export default function BaoCaoChuaXayView() {
  const [isPending, startTransition] = useTransition();
  const [isLoading, setIsLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  // Dữ liệu mẻ
  const [khoBatches, setKhoBatches] = useState<UngroundKhoBatch[]>([]);
  const [tuoiBatches, setTuoiBatches] = useState<UngroundTuoiBatch[]>([]);

  // Metadata file server
  const [fileMeta, setFileMeta] = useState<FileMeta | null>(null);

  // Trạng thái upload lên server
  const [uploadingKho, setUploadingKho] = useState(false);
  const [uploadingTuoi, setUploadingTuoi] = useState(false);
  const [uploadMessage, setUploadMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Bộ lọc — khởi tạo bằng giá trị tĩnh, cập nhật sau mount để tránh hydration mismatch
  const [reportDate, setReportDate] = useState<string>('');
  const [selectedMonth, setSelectedMonth] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'SUMMARY' | 'KHO' | 'TUOI' | 'UPLOAD'>('SUMMARY');

  // Set ngày/tháng hiện tại sau khi mount (client-only) để tránh SSR mismatch
  useEffect(() => {
    const today = new Date();
    const d = String(today.getDate()).padStart(2, '0');
    const m = String(today.getMonth() + 1).padStart(2, '0');
    const y = today.getFullYear();
    setReportDate(`${d}/${m}/${y}`);
    setSelectedMonth(`${m}/${y}`);
  }, []);

  // Bản đồ tùy chỉnh % hao hụt cho từng loại lúa
  const [customLossMap, setCustomLossMap] = useState<Record<string, number>>({});

  // Input file refs
  const fileKhoInputRef = useRef<HTMLInputElement>(null);
  const fileTuoiInputRef = useRef<HTMLInputElement>(null);

  // Nạp dữ liệu khi mở trang
  useEffect(() => {
    async function loadData() {
      setIsLoading(true);
      try {
        const res = await fetch('/api/rice-payroll/unground-report');
        if (res.ok) {
          const json = await res.json();
          if (Array.isArray(json.kho) && json.kho.length > 0) {
            setKhoBatches(json.kho);
          } else {
            setKhoBatches(sampleUngroundData.kho as UngroundKhoBatch[]);
          }
          if (Array.isArray(json.tuoi) && json.tuoi.length > 0) {
            setTuoiBatches(json.tuoi);
          } else {
            setTuoiBatches(sampleUngroundData.tuoi as UngroundTuoiBatch[]);
          }
          if (json.fileMeta) setFileMeta(json.fileMeta);
        } else {
          // Fallback static
          setKhoBatches(sampleUngroundData.kho as UngroundKhoBatch[]);
          setTuoiBatches(sampleUngroundData.tuoi as UngroundTuoiBatch[]);
        }
      } catch (e) {
        console.warn('Lỗi fetch unground report, dùng fallback:', e);
        setKhoBatches(sampleUngroundData.kho as UngroundKhoBatch[]);
        setTuoiBatches(sampleUngroundData.tuoi as UngroundTuoiBatch[]);
      } finally {
        setIsLoading(false);
      }
    }

    loadData();
  }, []);

  // Danh sách các tháng có trong lúa tươi
  const availableMonths = useMemo(() => {
    const set = new Set<string>();
    tuoiBatches.forEach((b) => {
      const d = b.ngayNhapSay || b.ngayCan;
      if (d) {
        const parts = d.split('/');
        if (parts.length === 3) {
          set.add(`${parts[1].padStart(2, '0')}/${parts[2]}`);
        }
      }
    });
    return Array.from(set).sort().reverse();
  }, [tuoiBatches]);

  // Khi danh sách tháng load xong, nếu selectedMonth chưa có trong danh sách → chọn tháng mới nhất
  useEffect(() => {
    if (availableMonths.length > 0 && selectedMonth !== 'ALL' && !availableMonths.includes(selectedMonth)) {
      setSelectedMonth(availableMonths[0]);
    }
  }, [availableMonths, selectedMonth]);

  // Lọc lúa tươi theo tháng đã chọn (nếu chọn 'ALL' thì lấy hết)
  const filteredTuoiBatches = useMemo(() => {
    if (selectedMonth === 'ALL') return tuoiBatches;
    return tuoiBatches.filter((b) => {
      const d = b.ngayNhapSay || b.ngayCan;
      return d && d.includes(`/${selectedMonth}`);
    });
  }, [tuoiBatches, selectedMonth]);

  // Tính toán báo cáo
  const report = useMemo(() => {
    return buildUngroundReport(khoBatches, filteredTuoiBatches, reportDate, customLossMap);
  }, [khoBatches, filteredTuoiBatches, reportDate, customLossMap]);

  // Sao chép báo cáo Zalo
  const handleCopyZalo = async () => {
    try {
      await navigator.clipboard.writeText(report.zaloText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      alert('Không thể sao chép tự động, vui lòng chọn văn bản và sao chép thủ công.');
    }
  };

  // Cập nhật % hao hụt KCS cho 1 loại lúa
  const handleUpdateLoss = (loaiLua: string, valStr: string) => {
    const num = parseFloat(valStr.replace(/[^\d.]/g, ''));
    if (!isNaN(num) && num >= 0 && num <= 100) {
      setCustomLossMap((prev) => ({ ...prev, [loaiLua]: num }));
    }
  };

  // Khôi phục % hao hụt mặc định
  const handleResetLossMap = () => {
    setCustomLossMap({});
  };

  // Upload file lúa khô lên server (lưu vĩnh viễn - tải trang sau vẫn đúng)
  const handleUploadKho = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingKho(true);
    setUploadMessage(null);
    try {
      const formData = new FormData();
      formData.append('fileKho', file);
      const res = await fetch('/api/rice-payroll/unground-report', {
        method: 'PUT',
        body: formData,
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Lỗi server');
      // Reload dữ liệu từ server
      const reloadRes = await fetch('/api/rice-payroll/unground-report');
      if (reloadRes.ok) {
        const reloaded = await reloadRes.json();
        if (Array.isArray(reloaded.kho) && reloaded.kho.length > 0) setKhoBatches(reloaded.kho);
        if (reloaded.fileMeta) setFileMeta(reloaded.fileMeta);
      }
      setUploadMessage({ type: 'success', text: `✅ Đã lưu file lúa khô "${file.name}" lên server! (${json.saved?.kho?.count ?? 0} mẻ). Từ nay tải trang tự động cập nhật.` });
    } catch (err) {
      setUploadMessage({ type: 'error', text: 'Lỗi lưu file lúa khô: ' + (err instanceof Error ? err.message : String(err)) });
    } finally {
      setUploadingKho(false);
      if (fileKhoInputRef.current) fileKhoInputRef.current.value = '';
    }
  };

  // Upload file lúa tươi lên server (lưu vĩnh viễn)
  const handleUploadTuoi = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingTuoi(true);
    setUploadMessage(null);
    try {
      const formData = new FormData();
      formData.append('fileTuoi', file);
      const res = await fetch('/api/rice-payroll/unground-report', {
        method: 'PUT',
        body: formData,
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Lỗi server');
      // Reload dữ liệu từ server
      const reloadRes = await fetch('/api/rice-payroll/unground-report');
      if (reloadRes.ok) {
        const reloaded = await reloadRes.json();
        if (Array.isArray(reloaded.tuoi) && reloaded.tuoi.length > 0) setTuoiBatches(reloaded.tuoi);
        if (reloaded.fileMeta) setFileMeta(reloaded.fileMeta);
      }
      setUploadMessage({ type: 'success', text: `✅ Đã lưu file lúa tươi "${file.name}" lên server! (${json.saved?.tuoi?.count ?? 0} mẻ). Từ nay tải trang tự động cập nhật.` });
    } catch (err) {
      setUploadMessage({ type: 'error', text: 'Lỗi lưu file lúa tươi: ' + (err instanceof Error ? err.message : String(err)) });
    } finally {
      setUploadingTuoi(false);
      if (fileTuoiInputRef.current) fileTuoiInputRef.current.value = '';
    }
  };

  // Xuất file Excel báo cáo
  const handleExportExcel = async () => {
    setIsExporting(true);
    try {
      const res = await fetch('/api/rice-payroll/unground-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          khoBatches,
          tuoiBatches: filteredTuoiBatches,
          reportDate,
          customLossMap,
          exportExcel: true,
        }),
      });

      if (!res.ok) throw new Error('Lỗi server khi xuất Excel');

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `BAO_CAO_LUA_CHUA_XAY_${reportDate.replace(/\//g, '-')}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (e) {
      alert('Lỗi xuất Excel: ' + (e instanceof Error ? e.message : String(e)));
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="space-y-6 pb-20 animate-in fade-in duration-200">
      {/* ─── Header Tiêu Đề Phân Hệ ────────────────────────────────────── */}
      <div className="rounded-3xl border border-emerald-200 bg-gradient-to-r from-emerald-700 via-teal-700 to-emerald-800 p-6 text-white shadow-xl">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/20 text-lg font-bold">
                🌾
              </span>
              <span className="rounded-full bg-emerald-500/40 px-3 py-1 text-xs font-bold uppercase tracking-wider text-emerald-100 ring-1 ring-white/20">
                Phân hệ nội bộ chuyên biệt
              </span>
            </div>
            <h1 className="mt-2 text-xl sm:text-2xl font-black tracking-tight text-white">
              Báo Cáo Lượng Lúa Khô CHƯA XAY (Ước Tính Theo Đầu Lúa Khô)
            </h1>
            <p className="mt-1 text-xs sm:text-sm text-emerald-100/90 max-w-2xl">
              Tự động gom lọc <strong>Lúa khô chưa xay (ngày xay blank)</strong> và{' '}
              <strong>Lúa tươi chờ sấy (máy 1, máy 2, NSX blank)</strong> quy đổi theo % hao hụt KCS.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleExportExcel}
              disabled={isExporting || isLoading}
              className="rounded-xl bg-white px-4 py-2.5 text-xs font-bold text-emerald-800 shadow-md hover:bg-emerald-50 disabled:opacity-50 transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <span>📥</span>
              <span>{isExporting ? 'Đang tạo Excel...' : 'Xuất File Excel'}</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('UPLOAD')}
              className="rounded-xl border border-white/30 bg-white/10 px-4 py-2.5 text-xs font-bold text-white hover:bg-white/20 transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <span>📤</span>
              <span>Cập Nhật File</span>
            </button>
          </div>
        </div>

        {/* Trạng thái file server */}
        {fileMeta && (fileMeta.kho || fileMeta.tuoi) && (
          <div className="mt-3 flex flex-wrap gap-2 border-t border-white/20 pt-3">
            {fileMeta.kho && (
              <span className="rounded-lg bg-white/15 px-2.5 py-1 text-[11px] text-white/90 flex items-center gap-1">
                🌾 <span className="font-bold">Khô:</span> <span className="truncate max-w-[180px]">{fileMeta.kho.name}</span>
                <span className="opacity-70">· {formatVNDateTime(fileMeta.kho.updatedAt).split(',')[0]}</span>
              </span>
            )}
            {fileMeta.tuoi && (
              <span className="rounded-lg bg-white/15 px-2.5 py-1 text-[11px] text-white/90 flex items-center gap-1">
                🌱 <span className="font-bold">Tươi:</span> <span className="truncate max-w-[180px]">{fileMeta.tuoi.name}</span>
                <span className="opacity-70">· {formatVNDateTime(fileMeta.tuoi.updatedAt).split(',')[0]}</span>
              </span>
            )}
          </div>
        )}
      </div>

      {/* ─── Thanh Tùy Chỉnh Ngày & Bộ Lọc ──────────────────────────────── */}
      <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          {/* Ô nhập Ngày báo cáo */}
          <div className="flex items-center gap-2">
            <label className="text-xs font-bold text-slate-700 whitespace-nowrap">
              📅 Ngày báo cáo:
            </label>
            <input
              type="text"
              value={reportDate}
              onChange={(e) => setReportDate(e.target.value)}
              placeholder="dd/mm/yyyy"
              className="w-32 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-bold text-slate-800 focus:border-emerald-500 focus:outline-none"
            />
          </div>

          {/* Chọn Tháng Lúa Tươi */}
          <div className="flex items-center gap-2">
            <label className="text-xs font-bold text-slate-700 whitespace-nowrap">
              🌾 Tháng mẻ tươi:
            </label>
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-bold text-slate-800 focus:border-emerald-500 focus:outline-none bg-white"
            >
              {availableMonths.map((m, idx) => (
                <option key={m} value={m}>
                  Tháng {m} {idx === 0 ? '(Tháng mới nhất)' : ''}
                </option>
              ))}
              <option value="ALL">Tất cả các tháng ({tuoiBatches.length} mẻ)</option>
            </select>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs">
          <span className="rounded-md bg-amber-50 px-2 py-1 font-semibold text-amber-800 border border-amber-200">
            Lúa khô nằm tài: {khoBatches.length} mẻ
          </span>
          <span className="rounded-md bg-emerald-50 px-2 py-1 font-semibold text-emerald-800 border border-emerald-200">
            Lúa tươi lọc được: {filteredTuoiBatches.length} mẻ
          </span>
        </div>
      </div>

      {/* ─── KHỐI VĂN BẢN BÁO CÁO GỬI ZALO (Đúng 100% mẫu người dùng) ───── */}
      <div className="rounded-3xl border-2 border-emerald-400 bg-gradient-to-br from-emerald-50/70 via-teal-50/50 to-white p-6 shadow-md space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-emerald-200/80 pb-3">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-600 text-white text-base">
              💬
            </span>
            <div>
              <h2 className="text-sm font-black uppercase tracking-wider text-emerald-950">
                Nội Dung Báo Cáo Chuẩn (Gửi Zalo 1 Click)
              </h2>
              <p className="text-[11px] text-emerald-700">
                Bấm nút &quot;Sao chép&quot; để dán trực tiếp vào Zalo gửi sếp hoặc đối tác
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleCopyZalo}
            className={`rounded-xl px-5 py-2.5 text-xs font-black shadow-md transition-all flex items-center gap-2 cursor-pointer ${
              copied
                ? 'bg-emerald-600 text-white ring-2 ring-emerald-400 scale-105'
                : 'bg-emerald-700 hover:bg-emerald-800 text-white hover:scale-102 active:scale-95'
            }`}
          >
            <span>{copied ? '✓' : '📋'}</span>
            <span>{copied ? 'Đã Sao Chép Vào Bộ Nhớ Tạm!' : 'Sao Chép Báo Cáo Zalo'}</span>
          </button>
        </div>

        {/* Khung văn bản mẫu Zalo */}
        <div className="relative rounded-2xl border border-emerald-300 bg-white p-5 font-mono text-xs sm:text-sm text-slate-800 shadow-inner whitespace-pre-line leading-relaxed">
          {report.zaloText}
        </div>
      </div>

      {/* ─── 4 Thẻ KPI Tổng Hợp ─────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4 shadow-sm">
          <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-700">
            Tổng Lúa Khô Quy Đổi
          </span>
          <div className="mt-2 flex items-baseline gap-1.5">
            <span className="text-3xl font-black text-emerald-800">{report.totalDryHeadTons}</span>
            <span className="text-xs font-bold text-emerald-700">tấn</span>
          </div>
          <div className="mt-1 text-[11px] text-emerald-600 font-mono">
            {formatMoney(report.totalDryHeadKg)} kg
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
            Lúa Khô Nằm Tài
          </span>
          <div className="mt-2 flex items-baseline gap-1.5">
            <span className="text-3xl font-bold text-slate-800">{report.totalKhoTons}</span>
            <span className="text-xs font-bold text-slate-600">tấn</span>
          </div>
          <div className="mt-1 text-[11px] text-slate-400 font-mono">
            {formatMoney(report.totalKhoKg)} kg (chưa xay)
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
            Lúa Tươi Chờ Sấy
          </span>
          <div className="mt-2 flex items-baseline gap-1.5">
            <span className="text-3xl font-bold text-orange-600">{report.totalTuoiConvertedTons}</span>
            <span className="text-xs font-bold text-orange-600">tấn khô</span>
          </div>
          <div className="mt-1 text-[11px] text-slate-400 font-mono">
            Từ {formatMoney(report.totalTuoiKg)} kg tươi
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
            Tổng Số Lô / Mẻ
          </span>
          <div className="mt-2 flex items-baseline gap-1.5">
            <span className="text-3xl font-bold text-blue-700">
              {khoBatches.length + filteredTuoiBatches.length}
            </span>
            <span className="text-xs font-bold text-blue-600">mẻ</span>
          </div>
          <div className="mt-1 text-[11px] text-slate-400">
            {report.items.filter((i) => i.totalDryHeadTons > 0).length} loại lúa
          </div>
        </div>
      </div>

      {/* ─── Navigation Sub-Tabs ────────────────────────────────────────── */}
      <div className="flex border-b border-slate-200 gap-2">
        <button
          onClick={() => setActiveTab('SUMMARY')}
          className={`py-2.5 px-4 text-xs font-bold border-b-2 transition-all cursor-pointer ${
            activeTab === 'SUMMARY'
              ? 'border-emerald-600 text-emerald-800'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          📊 Bảng Tổng Hợp &amp; Tùy Chỉnh KCS
        </button>
        <button
          onClick={() => setActiveTab('KHO')}
          className={`py-2.5 px-4 text-xs font-bold border-b-2 transition-all cursor-pointer ${
            activeTab === 'KHO'
              ? 'border-emerald-600 text-emerald-800'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          🌾 Danh Sách Lúa Khô Nằm Tài ({khoBatches.length})
        </button>
        <button
          onClick={() => setActiveTab('TUOI')}
          className={`py-2.5 px-4 text-xs font-bold border-b-2 transition-all cursor-pointer ${
            activeTab === 'TUOI'
              ? 'border-emerald-600 text-emerald-800'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          🌾 Danh Sách Lúa Tươi Chờ Sấy ({filteredTuoiBatches.length})
        </button>
        <button
          onClick={() => setActiveTab('UPLOAD')}
          className={`py-2.5 px-4 text-xs font-bold border-b-2 transition-all cursor-pointer ${
            activeTab === 'UPLOAD'
              ? 'border-emerald-600 text-emerald-800'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          📁 Nạp File Mới
        </button>
      </div>

      {/* ─── TAB 1: BẢNG TỔNG HỢP & TÙY CHỈNH KCS ───────────────────────── */}
      {activeTab === 'SUMMARY' && (
        <div className="space-y-4">
          <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm">
            <div className="border-b border-slate-200 bg-slate-50/70 px-5 py-3.5 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                  Bảng Thống Kê Chi Tiết Từng Loại Lúa
                </h3>
                <p className="text-[11px] text-slate-500">
                  💡 Bạn có thể sửa trực tiếp cột <strong>% Hao Hụt KCS</strong> bên dưới để tính lại quy đổi
                  tương ứng
                </p>
              </div>

              {Object.keys(customLossMap).length > 0 && (
                <button
                  type="button"
                  onClick={handleResetLossMap}
                  className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-100 transition-all"
                >
                  🔄 Khôi phục % KCS mặc định
                </button>
              )}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-100/70 text-slate-700 font-bold">
                    <th className="px-3 py-2.5 text-center w-12">STT</th>
                    <th className="px-3 py-2.5">Loại Lúa</th>
                    <th className="px-3 py-2.5 text-right">Lúa Khô Nằm Tài (kg)</th>
                    <th className="px-3 py-2.5 text-center font-bold text-slate-700">Khô (tấn)</th>
                    <th className="px-3 py-2.5 text-right">Lúa Tươi Chờ Sấy (kg)</th>
                    <th className="px-3 py-2.5 text-center bg-amber-50/70 text-amber-900 min-w-[100px]">
                      % KCS Hao Hụt (✏️)
                    </th>
                    <th className="px-3 py-2.5 text-right text-rose-700">Hao Hụt (kg)</th>
                    <th className="px-3 py-2.5 text-center font-bold text-orange-700 bg-orange-50/40">
                      Tươi Quy Đổi (tấn)
                    </th>
                    <th className="px-3 py-2.5 text-right font-black text-emerald-800 bg-emerald-50/50 text-sm">
                      Tổng Đầu Lúa Khô (Tấn)
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {report.items.map((it, idx) => {
                    const isCustom = customLossMap[it.loaiLua] !== undefined;

                    return (
                      <tr key={it.loaiLua} className="hover:bg-slate-50 transition-colors">
                        <td className="px-3 py-2.5 text-center text-slate-400 font-mono">
                          {String(idx + 1).padStart(2, '0')}
                        </td>
                        <td className="px-3 py-2.5 font-bold text-slate-900">{it.loaiLua}</td>
                        <td className="px-3 py-2.5 text-right font-mono text-slate-700">
                          {formatMoney(it.khoKg)}
                        </td>
                        <td className="px-3 py-2.5 text-center font-mono font-semibold text-slate-800">
                          {it.khoTons}
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono text-slate-700">
                          {formatMoney(it.tuoiKg)}
                        </td>
                        <td className="px-3 py-2 text-center bg-amber-50/40">
                          <div className="flex items-center justify-center gap-1">
                            <input
                              type="text"
                              inputMode="numeric"
                              value={it.kcsLossPercent}
                              onChange={(e) => handleUpdateLoss(it.loaiLua, e.target.value)}
                              className={`w-14 text-center font-bold font-mono rounded px-1 py-0.5 text-xs transition-all focus:outline-none focus:ring-2 focus:ring-amber-500 ${
                                isCustom
                                  ? 'bg-amber-100 text-amber-900 border border-amber-400 font-black'
                                  : 'bg-white text-slate-800 border border-slate-200'
                              }`}
                            />
                            <span className="text-[11px] font-bold text-slate-500">%</span>
                          </div>
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono text-rose-600">
                          -{formatMoney(it.lossKg)}
                        </td>
                        <td className="px-3 py-2.5 text-center font-mono font-bold text-orange-700 bg-orange-50/20">
                          {it.convertedDryTons}
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono font-black text-emerald-800 bg-emerald-50/30 text-sm">
                          {it.totalDryHeadTons} tấn
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-slate-300 bg-emerald-50/70 font-black text-slate-900">
                    <td colSpan={2} className="px-3 py-3 text-center uppercase tracking-wide">
                      TỔNG CỘNG
                    </td>
                    <td className="px-3 py-3 text-right font-mono">{formatMoney(report.totalKhoKg)}</td>
                    <td className="px-3 py-3 text-center font-mono text-slate-900">{report.totalKhoTons}</td>
                    <td className="px-3 py-3 text-right font-mono">{formatMoney(report.totalTuoiKg)}</td>
                    <td className="px-3 py-3 text-center text-slate-500">-</td>
                    <td className="px-3 py-3 text-right font-mono text-rose-700">
                      -{formatMoney(report.items.reduce((s, it) => s + it.lossKg, 0))}
                    </td>
                    <td className="px-3 py-3 text-center font-mono text-orange-700">
                      {report.totalTuoiConvertedTons}
                    </td>
                    <td className="px-3 py-3 text-right font-mono text-emerald-900 text-base">
                      {report.totalDryHeadTons} TẤN
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ─── TAB 2: DANH SÁCH LÚA KHÔ NẰM TÀI ──────────────────────────── */}
      {activeTab === 'KHO' && (
        <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm">
          <div className="border-b border-slate-200 bg-slate-50/70 px-5 py-3.5">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">
              Chi Tiết Mẻ Lúa Khô Chưa Xay ({khoBatches.length} mẻ — Cột Ngày Xay trống)
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-100/70 text-slate-700 font-bold">
                  <th className="px-3 py-2.5 text-center w-12">STT</th>
                  <th className="px-3 py-2.5 text-center">Ngày Cân</th>
                  <th className="px-3 py-2.5">Khách Hàng / NCC</th>
                  <th className="px-3 py-2.5">Phương Tiện</th>
                  <th className="px-3 py-2.5">Loại Lúa</th>
                  <th className="px-3 py-2.5 text-right">Số Lượng (kg)</th>
                  <th className="px-3 py-2.5 text-center">Tấn</th>
                  <th className="px-3 py-2.5 text-center text-rose-600">Trạng Thái Xay</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {khoBatches.length > 0 ? (
                  khoBatches.map((b, idx) => (
                    <tr key={b.id} className="hover:bg-slate-50">
                      <td className="px-3 py-2 text-center text-slate-400 font-mono">
                        {String(idx + 1).padStart(2, '0')}
                      </td>
                      <td className="px-3 py-2 text-center text-slate-700">{b.ngayCan}</td>
                      <td className="px-3 py-2 font-medium text-slate-900">{b.khachHang || '-'}</td>
                      <td className="px-3 py-2 text-slate-600">{b.xe || '-'}</td>
                      <td className="px-3 py-2 font-bold text-slate-800">{b.loaiLua}</td>
                      <td className="px-3 py-2 text-right font-mono text-slate-800">
                        {formatMoney(b.slKg)}
                      </td>
                      <td className="px-3 py-2 text-center font-mono font-bold text-emerald-700">
                        {Math.round(b.slKg / 1000)}
                      </td>
                      <td className="px-3 py-2 text-center">
                        <span className="rounded bg-rose-50 px-2 py-0.5 text-[10px] font-bold text-rose-700 border border-rose-200">
                          Chưa xay (Blank)
                        </span>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-slate-400">
                      Không có mẻ lúa khô nào chưa xay
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ─── TAB 3: DANH SÁCH LÚA TƯƠI CHỜ SẤY ──────────────────────────── */}
      {activeTab === 'TUOI' && (
        <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm">
          <div className="border-b border-slate-200 bg-slate-50/70 px-5 py-3.5 flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">
              Chi Tiết Mẻ Lúa Tươi Chờ Sấy ({filteredTuoiBatches.length} mẻ — Máy 1, 2, NSX đều trống)
            </h3>
            <span className="text-xs text-slate-500">
              Đang lọc: <strong>Tháng {selectedMonth}</strong>
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-100/70 text-slate-700 font-bold">
                  <th className="px-3 py-2.5 text-center w-12">STT</th>
                  <th className="px-3 py-2.5 text-center">Ngày Cân</th>
                  <th className="px-3 py-2.5 text-center">Ngày Nhập Sấy</th>
                  <th className="px-3 py-2.5">Khách Hàng</th>
                  <th className="px-3 py-2.5">Phương Tiện</th>
                  <th className="px-3 py-2.5">Loại Lúa</th>
                  <th className="px-3 py-2.5 text-right">Số Lượng (kg)</th>
                  <th className="px-3 py-2.5 text-center">KCS (%)</th>
                  <th className="px-3 py-2.5 text-center text-rose-600">Ngày Xay</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredTuoiBatches.length > 0 ? (
                  filteredTuoiBatches.map((b, idx) => (
                    <tr key={b.id} className="hover:bg-slate-50">
                      <td className="px-3 py-2 text-center text-slate-400 font-mono">
                        {String(idx + 1).padStart(2, '0')}
                      </td>
                      <td className="px-3 py-2 text-center text-slate-700">{b.ngayCan}</td>
                      <td className="px-3 py-2 text-center text-orange-700 font-medium">{b.ngayNhapSay || '-'}</td>
                      <td className="px-3 py-2 font-medium text-slate-900">{b.khachHang || '-'}</td>
                      <td className="px-3 py-2 text-slate-600">{b.xe || '-'}</td>
                      <td className="px-3 py-2 font-bold text-slate-800">{b.loaiLua}</td>
                      <td className="px-3 py-2 text-right font-mono text-slate-800">
                        {formatMoney(b.slKg)}
                      </td>
                      <td className="px-3 py-2 text-center font-mono font-bold text-amber-700">
                        {b.kcsPercent ? `${b.kcsPercent}%` : b.kcsRaw || '-'}
                      </td>
                      <td className="px-3 py-2 text-center">
                        <span className="rounded bg-rose-50 px-2 py-0.5 text-[10px] font-bold text-rose-700 border border-rose-200">
                          Chưa xay (Blank)
                        </span>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={9} className="px-4 py-8 text-center text-slate-400">
                      Không có mẻ lúa tươi nào chưa xay trong tháng {selectedMonth}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ─── TAB 4: NẠP FILE MỚI ────────────────────────────────────────── */}
      {activeTab === 'UPLOAD' && (
        <div className="space-y-4">
          {/* Thông báo kết quả upload */}
          {uploadMessage && (
            <div
              className={`rounded-xl px-4 py-3 text-sm font-semibold flex items-start gap-2 ${
                uploadMessage.type === 'success'
                  ? 'bg-emerald-50 border border-emerald-300 text-emerald-800'
                  : 'bg-rose-50 border border-rose-300 text-rose-800'
              }`}
            >
              <span className="mt-0.5 shrink-0">{uploadMessage.type === 'success' ? '✅' : '❌'}</span>
              <span>{uploadMessage.text}</span>
              <button
                type="button"
                onClick={() => setUploadMessage(null)}
                className="ml-auto shrink-0 text-xs opacity-60 hover:opacity-100"
              >✕</button>
            </div>
          )}

          {/* Hướng dẫn */}
          <div className="rounded-xl bg-blue-50 border border-blue-200 px-4 py-3 text-xs text-blue-800">
            <p className="font-bold mb-1">💡 Hướng dẫn: Upload 1 lần — dùng mãi</p>
            <p>Khi bạn upload file mới, hệ thống sẽ <strong>lưu vĩnh viễn vào server</strong>. Từ đó khi mở trang hoặc F5 trang sẽ tự động đọc file mới nhất — không cần upload lại mỗi ngày nữa.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Box nạp file Lúa Khô */}
            <div className="rounded-2xl border-2 border-dashed border-amber-300 bg-amber-50/30 p-6 text-center space-y-3">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-100 text-amber-800 text-2xl font-bold">
                🌾
              </div>
              <h3 className="text-sm font-bold text-slate-900">Cập Nhật File Lúa Khô (.xlsx)</h3>
              <p className="text-xs text-slate-500">
                Hệ thống sẽ tự động lọc cột <strong>Ngày xay</strong> thành blank để tìm lúa khô nằm tài.
              </p>

              {/* Trạng thái file đang dùng */}
              {fileMeta?.kho ? (
                <div className="rounded-lg bg-amber-100 border border-amber-200 px-3 py-2 text-left">
                  <p className="text-[11px] font-bold text-amber-900">📂 File đang dùng:</p>
                  <p className="text-[11px] text-amber-800 truncate font-mono">{fileMeta.kho.name}</p>
                  <p className="text-[10px] text-amber-600 mt-0.5">🕐 Cập nhật: {formatVNDateTime(fileMeta.kho.updatedAt)}</p>
                </div>
              ) : (
                <div className="rounded-lg bg-slate-100 border border-slate-200 px-3 py-2 text-left">
                  <p className="text-[11px] text-slate-500">📂 Chưa có file lưu trên server (đang dùng file mặc định)</p>
                </div>
              )}

              <input
                type="file"
                ref={fileKhoInputRef}
                onChange={handleUploadKho}
                accept=".xlsx,.xls"
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileKhoInputRef.current?.click()}
                disabled={uploadingKho}
                className="rounded-xl bg-amber-600 hover:bg-amber-700 disabled:opacity-60 text-white px-4 py-2 text-xs font-bold transition-all shadow-sm flex items-center gap-2 mx-auto"
              >
                {uploadingKho ? (
                  <><span className="animate-spin">⏳</span> Đang lưu...</>
                ) : (
                  <><span>📤</span> Cập Nhật File Lúa Khô</>
                )}
              </button>
            </div>

            {/* Box nạp file Lúa Tươi */}
            <div className="rounded-2xl border-2 border-dashed border-emerald-300 bg-emerald-50/30 p-6 text-center space-y-3">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-800 text-2xl font-bold">
                🌱
              </div>
              <h3 className="text-sm font-bold text-slate-900">Cập Nhật File Lúa Tươi (.xlsx)</h3>
              <p className="text-xs text-slate-500">
                Hệ thống sẽ lọc <strong>Ngày xay máy 1, máy 2, NSX</strong> thành blank và tính hao hụt KCS.
              </p>

              {/* Trạng thái file đang dùng */}
              {fileMeta?.tuoi ? (
                <div className="rounded-lg bg-emerald-100 border border-emerald-200 px-3 py-2 text-left">
                  <p className="text-[11px] font-bold text-emerald-900">📂 File đang dùng:</p>
                  <p className="text-[11px] text-emerald-800 truncate font-mono">{fileMeta.tuoi.name}</p>
                  <p className="text-[10px] text-emerald-600 mt-0.5">🕐 Cập nhật: {formatVNDateTime(fileMeta.tuoi.updatedAt)}</p>
                </div>
              ) : (
                <div className="rounded-lg bg-slate-100 border border-slate-200 px-3 py-2 text-left">
                  <p className="text-[11px] text-slate-500">📂 Chưa có file lưu trên server (đang dùng file mặc định)</p>
                </div>
              )}

              <input
                type="file"
                ref={fileTuoiInputRef}
                onChange={handleUploadTuoi}
                accept=".xlsx,.xls"
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileTuoiInputRef.current?.click()}
                disabled={uploadingTuoi}
                className="rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white px-4 py-2 text-xs font-bold transition-all shadow-sm flex items-center gap-2 mx-auto"
              >
                {uploadingTuoi ? (
                  <><span className="animate-spin">⏳</span> Đang lưu...</>
                ) : (
                  <><span>📤</span> Cập Nhật File Lúa Tươi</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
