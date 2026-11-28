'use client';

import React, { useMemo, useState } from 'react';
import { analyzeRiceAudit } from '@/lib/rice-audit/audit-engine';
import { buildAuditReportWorkbookBuffer } from '@/lib/rice-audit/export-excel';
import {
  AuditCategory,
  AuditSeverity,
  RiceAuditResult,
  RiceFileSource,
} from '@/lib/rice-audit/types';

type ViewMode = 'issues' | 'mappings';

const CATEGORY_META: Record<AuditCategory, { label: string; icon: string; badgeClass: string }> = {
  lot_code: {
    label: 'Mã Lô',
    icon: '🏷️',
    badgeClass: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  },
  customer: {
    label: 'Khách Hàng',
    icon: '👤',
    badgeClass: 'bg-sky-50 text-sky-700 border-sky-200',
  },
  price: {
    label: 'Giá Tiền',
    icon: '💰',
    badgeClass: 'bg-amber-50 text-amber-800 border-amber-200',
  },
  formula_payment: {
    label: 'Công Thức & TT',
    icon: '🧮',
    badgeClass: 'bg-purple-50 text-purple-700 border-purple-200',
  },
  contract: {
    label: 'Đối Chiếu HĐ',
    icon: '📜',
    badgeClass: 'bg-rose-50 text-rose-700 border-rose-200',
  },
};

const SEVERITY_META: Record<AuditSeverity, { label: string; badgeClass: string; rowAccent: string }> = {
  error: {
    label: 'Nghiêm trọng',
    badgeClass: 'bg-rose-100 text-rose-800 border-rose-300',
    rowAccent: 'border-l-4 border-l-rose-500',
  },
  warning: {
    label: 'Cảnh báo',
    badgeClass: 'bg-amber-100 text-amber-800 border-amber-300',
    rowAccent: 'border-l-4 border-l-amber-400',
  },
  info: {
    label: 'Lưu ý',
    badgeClass: 'bg-slate-100 text-slate-700 border-slate-300',
    rowAccent: 'border-l-4 border-l-slate-300',
  },
};

const PAGE_SIZE = 80;

export default function RiceAuditView() {
  const [freshFile, setFreshFile] = useState<File | null>(null);
  const [dryFile, setDryFile] = useState<File | null>(null);
  const [contractFile, setContractFile] = useState<File | null>(null);
  const [priceDeviationPct, setPriceDeviationPct] = useState<number>(6);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<RiceAuditResult | null>(null);

  // Bộ lọc hiển thị
  const [viewMode, setViewMode] = useState<ViewMode>('issues');
  const [monthFilter, setMonthFilter] = useState<string>('all');
  const [sourceFilter, setSourceFilter] = useState<'all' | RiceFileSource>('all');
  const [categoryFilter, setCategoryFilter] = useState<'all' | AuditCategory>('all');
  const [severityFilter, setSeverityFilter] = useState<'all' | AuditSeverity>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [onlyDirtyMappings, setOnlyDirtyMappings] = useState(true);
  const [page, setPage] = useState(1);

  const runClientAudit = async (
    fFile: File | null,
    dFile: File | null,
    cFile: File | null,
    pct: number
  ) => {
    if (!fFile && !dFile) {
      setError('Vui lòng chọn ít nhất 1 file Excel Lúa Tươi hoặc Lúa Khô.');
      return;
    }
    setError(null);
    setIsLoading(true);
    try {
      const [freshBuf, dryBuf, contractBuf] = await Promise.all([
        fFile ? fFile.arrayBuffer().then((ab) => new Uint8Array(ab)) : Promise.resolve(null),
        dFile ? dFile.arrayBuffer().then((ab) => new Uint8Array(ab)) : Promise.resolve(null),
        cFile ? cFile.arrayBuffer().then((ab) => new Uint8Array(ab)) : Promise.resolve(null),
      ]);
      const auditRes = analyzeRiceAudit({
        freshBuffer: freshBuf,
        dryBuffer: dryBuf,
        contractBuffer: contractBuf,
        priceDeviationPct: pct,
      });
      setResult(auditRes);
      setMonthFilter('all');
      setPage(1);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Không thể đọc file Excel.');
    } finally {
      setIsLoading(false);
    }
  };

  const runServerSampleAudit = async () => {
    setError(null);
    setIsLoading(true);
    try {
      const res = await fetch('/api/rice-audit/sample', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ priceDeviationPct }),
      });
      const data = (await res.json()) as { success?: boolean; error?: string; data?: RiceAuditResult };
      if (!res.ok || !data.data) {
        throw new Error(data.error || 'Không thể nạp file mẫu từ máy chủ');
      }
      setResult(data.data);
      setMonthFilter('all');
      setPage(1);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Lỗi khi nạp file mẫu.');
    } finally {
      setIsLoading(false);
    }
  };

  const selectedMonthMeta = useMemo(() => {
    if (!result || monthFilter === 'all') return null;
    return result.availableMonths.find((m) => m.key === monthFilter) || null;
  }, [result, monthFilter]);

  const monthScopedIssues = useMemo(() => {
    if (!result) return [];
    if (monthFilter === 'all') return result.issues;
    return result.issues.filter((iss) => iss.monthKey === monthFilter);
  }, [result, monthFilter]);

  const scopedStats = useMemo(() => {
    if (!result) return null;
    const freshRows = selectedMonthMeta ? selectedMonthMeta.freshRows : result.summary.totalFreshRows;
    const dryRows = selectedMonthMeta ? selectedMonthMeta.dryRows : result.summary.totalDryRows;
    const bySeverity: Record<AuditSeverity, number> = { error: 0, warning: 0, info: 0 };
    const byCategory: Record<AuditCategory, number> = {
      lot_code: 0,
      customer: 0,
      price: 0,
      formula_payment: 0,
      contract: 0,
    };
    const bySource: Record<RiceFileSource, number> = { fresh: 0, dry: 0 };

    for (const iss of monthScopedIssues) {
      bySeverity[iss.severity]++;
      byCategory[iss.category]++;
      bySource[iss.source]++;
    }

    return {
      freshRows,
      dryRows,
      totalIssues: monthScopedIssues.length,
      bySeverity,
      byCategory,
      bySource,
    };
  }, [result, selectedMonthMeta, monthScopedIssues]);

  const filteredIssues = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return monthScopedIssues.filter((iss) => {
      if (sourceFilter !== 'all' && iss.source !== sourceFilter) return false;
      if (categoryFilter !== 'all' && iss.category !== categoryFilter) return false;
      if (severityFilter !== 'all' && iss.severity !== severityFilter) return false;
      if (q) {
        const hay = `${iss.rowNumber} ${iss.lotCode} ${iss.customer} ${iss.riceType} ${iss.buyer} ${iss.title} ${iss.detail}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [monthScopedIssues, sourceFilter, categoryFilter, severityFilter, searchTerm]);

  const filteredMappings = useMemo(() => {
    if (!result) return [];
    const q = searchTerm.trim().toLowerCase();
    return result.customerMappings.filter((m) => {
      if (onlyDirtyMappings && m.prefixes.length <= 1 && m.variants.length <= 1) return false;
      if (q) {
        const hay = `${m.customerNormalized} ${m.prefixes.map((p) => p.prefix).join(' ')} ${m.variants.join(' ')}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [result, onlyDirtyMappings, searchTerm]);

  const totalPages = Math.max(1, Math.ceil(filteredIssues.length / PAGE_SIZE));
  const pagedIssues = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return filteredIssues.slice(start, start + PAGE_SIZE);
  }, [filteredIssues, page]);

  const handleExportExcel = () => {
    if (!result) return;
    const monthLabel = selectedMonthMeta ? selectedMonthMeta.label : 'Tất cả các tháng';
    const buf = buildAuditReportWorkbookBuffer(result, filteredIssues, monthLabel);
    const blob = new Blob([buf.buffer as ArrayBuffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const suffix = monthFilter === 'all' ? new Date().toISOString().slice(0, 10) : `Thang_${monthFilter}`;
    a.download = `BaoCao_KiemTraLoi_Lua_${suffix}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* Banner tiêu đề */}
      <div className="rounded-3xl border border-slate-200/90 bg-white p-6 shadow-xs">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-xs font-bold text-rose-700">
              <span>🔍</span>
              <span>Kiểm Soát Chất Lượng Nhập Liệu Hằng Ngày</span>
            </div>
            <h1 className="mt-2.5 text-xl font-black tracking-tight text-slate-900 sm:text-2xl">
              Kiểm Tra Lỗi File Lúa Tươi &amp; Lúa Khô
            </h1>
            <p className="mt-1 text-xs sm:text-sm text-slate-500">
              Tự động rà soát sai sót <strong className="text-slate-700">Mã lô</strong> (trùng, lệch ngày, nhầm khách),{' '}
              <strong className="text-slate-700">Tên khách hàng</strong> (dư dấu cách, sai dấu, gõ nhầm),{' '}
              <strong className="text-slate-700">Giá tiền</strong> (thiếu giá, nhầm số 0, lệch mặt bằng giá) và{' '}
              <strong className="text-slate-700">Công thức</strong>.
            </p>
          </div>

          {result && (
            <button
              type="button"
              onClick={handleExportExcel}
              className="inline-flex shrink-0 items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-4 py-2.5 text-xs sm:text-sm font-bold text-white shadow-sm transition-all hover:bg-emerald-700 cursor-pointer"
            >
              <span>📥</span>
              <span>Xuất Excel Báo Cáo ({filteredIssues.length} lỗi)</span>
            </button>
          )}
        </div>

        {/* Khu vực chọn file & cấu hình */}
        <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-12">
          <label className="lg:col-span-3 flex flex-col justify-between rounded-2xl border border-dashed border-slate-300 bg-slate-50/70 p-4 hover:border-emerald-400 hover:bg-emerald-50/30 transition-colors cursor-pointer">
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-emerald-700">
                1. File Nhập Lúa Tươi (.xlsx)
              </span>
              <p className="mt-1 text-xs text-slate-500 truncate">
                {freshFile ? `✅ ${freshFile.name}` : 'Chọn file TỔNG SỐ LIỆU NHẬP LÚA TƯƠI...'}
              </p>
            </div>
            <input
              type="file"
              accept=".xlsx,.xls"
              onChange={(e) => setFreshFile(e.target.files?.[0] || null)}
              className="mt-2.5 block w-full text-xs text-slate-600 file:mr-3 file:rounded-xl file:border-0 file:bg-white file:px-3 file:py-1.5 file:text-xs file:font-bold file:text-slate-700 file:shadow-2xs hover:file:bg-slate-100"
            />
          </label>

          <label className="lg:col-span-3 flex flex-col justify-between rounded-2xl border border-dashed border-slate-300 bg-slate-50/70 p-4 hover:border-amber-400 hover:bg-amber-50/30 transition-colors cursor-pointer">
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-amber-700">
                2. File Nhập Lúa Khô (.xlsx)
              </span>
              <p className="mt-1 text-xs text-slate-500 truncate">
                {dryFile ? `✅ ${dryFile.name}` : 'Chọn file TỔNG NHẬP LÚA KHÔ...'}
              </p>
            </div>
            <input
              type="file"
              accept=".xlsx,.xls"
              onChange={(e) => setDryFile(e.target.files?.[0] || null)}
              className="mt-2.5 block w-full text-xs text-slate-600 file:mr-3 file:rounded-xl file:border-0 file:bg-white file:px-3 file:py-1.5 file:text-xs file:font-bold file:text-slate-700 file:shadow-2xs hover:file:bg-slate-100"
            />
          </label>

          <label className="lg:col-span-3 flex flex-col justify-between rounded-2xl border border-dashed border-indigo-300 bg-indigo-50/30 p-4 hover:border-indigo-500 hover:bg-indigo-50/60 transition-colors cursor-pointer">
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-indigo-700">
                3. File Hợp Đồng Lúa (Tùy chọn)
              </span>
              <p className="mt-1 text-xs text-slate-500 truncate">
                {contractFile ? `✅ ${contractFile.name}` : 'Chọn HỢP ĐỒNG LÚA NĂM 2026...'}
              </p>
            </div>
            <input
              type="file"
              accept=".xlsx,.xls"
              onChange={(e) => setContractFile(e.target.files?.[0] || null)}
              className="mt-2.5 block w-full text-xs text-slate-600 file:mr-3 file:rounded-xl file:border-0 file:bg-white file:px-3 file:py-1.5 file:text-xs file:font-bold file:text-slate-700 file:shadow-2xs hover:file:bg-slate-100"
            />
          </label>

          <div className="lg:col-span-3 flex flex-col justify-between rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
            <div className="flex items-center justify-between gap-2">
              <label className="text-xs font-bold text-slate-700" htmlFor="deviation-pct">
                Ngưỡng lệch giá (±%):
              </label>
              <input
                id="deviation-pct"
                type="number"
                min={1}
                max={50}
                value={priceDeviationPct}
                onChange={(e) => setPriceDeviationPct(Math.max(1, Math.min(50, Number(e.target.value) || 6)))}
                className="w-16 rounded-xl border border-slate-300 bg-white px-2 py-1 text-center text-xs font-bold text-slate-900"
              />
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={isLoading || (!freshFile && !dryFile)}
                onClick={() => runClientAudit(freshFile, dryFile, contractFile, priceDeviationPct)}
                className="flex-1 rounded-xl bg-rose-600 px-3 py-2 text-xs font-bold text-white shadow-xs transition-all hover:bg-rose-700 disabled:opacity-50 cursor-pointer"
              >
                {isLoading ? 'Đang quét...' : '🔍 Kiểm Tra'}
              </button>
              <button
                type="button"
                disabled={isLoading}
                onClick={runServerSampleAudit}
                className="rounded-xl border border-slate-300 bg-white px-2.5 py-2 text-xs font-bold text-slate-700 shadow-2xs transition-all hover:bg-slate-100 disabled:opacity-50 cursor-pointer"
                title="Đọc trực tiếp 3 file Excel đang lưu trên máy chủ (nếu có)"
              >
                Nạp mẫu
              </button>
            </div>
          </div>
        </div>

        {error && (
          <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-semibold text-rose-800">
            ⚠️ {error}
          </div>
        )}
      </div>

      {/* Kết quả */}
      {result && scopedStats && (
        <>
          {/* Thẻ tóm tắt (tự động cập nhật theo Tháng/Năm đang chọn) */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs">
              <p className="text-[11px] font-bold uppercase text-slate-400">
                {selectedMonthMeta ? `Dòng ${selectedMonthMeta.label}` : 'Dòng đã quét'}
              </p>
              <p className="mt-1 text-xl font-black text-slate-900">
                {(scopedStats.freshRows + scopedStats.dryRows).toLocaleString('vi-VN')}
              </p>
              <p className="mt-0.5 text-[11px] text-slate-500">
                Tươi: {scopedStats.freshRows.toLocaleString('vi-VN')} · Khô:{' '}
                {scopedStats.dryRows.toLocaleString('vi-VN')}
              </p>
            </div>

            <div className="rounded-2xl border border-rose-200 bg-rose-50/60 p-4 shadow-2xs">
              <p className="text-[11px] font-bold uppercase text-rose-600">Nghiêm trọng</p>
              <p className="mt-1 text-xl font-black text-rose-700">
                {scopedStats.bySeverity.error.toLocaleString('vi-VN')}
              </p>
              <p className="mt-0.5 text-[11px] text-rose-600/80">Trùng mã, lệch ngày, thiếu giá...</p>
            </div>

            <div className="rounded-2xl border border-amber-200 bg-amber-50/60 p-4 shadow-2xs">
              <p className="text-[11px] font-bold uppercase text-amber-700">Cảnh báo</p>
              <p className="mt-1 text-xl font-black text-amber-800">
                {scopedStats.bySeverity.warning.toLocaleString('vi-VN')}
              </p>
              <p className="mt-0.5 text-[11px] text-amber-700/80">Lệch giá, nhầm tiền tố, mất CT...</p>
            </div>

            <div className="rounded-2xl border border-indigo-200 bg-white p-4 shadow-2xs">
              <p className="text-[11px] font-bold uppercase text-indigo-600">🏷️ Lỗi Mã Lô</p>
              <p className="mt-1 text-xl font-black text-slate-900">
                {scopedStats.byCategory.lot_code.toLocaleString('vi-VN')}
              </p>
              <p className="mt-0.5 text-[11px] text-slate-500">Trùng, lệch ngày, sai khách</p>
            </div>

            <div className="rounded-2xl border border-sky-200 bg-white p-4 shadow-2xs">
              <p className="text-[11px] font-bold uppercase text-sky-600">👤 Khách Hàng</p>
              <p className="mt-1 text-xl font-black text-slate-900">
                {scopedStats.byCategory.customer.toLocaleString('vi-VN')}
              </p>
              <p className="mt-0.5 text-[11px] text-slate-500">Dấu cách, lỗi dấu, chính tả</p>
            </div>

            <div className="rounded-2xl border border-amber-200 bg-white p-4 shadow-2xs">
              <p className="text-[11px] font-bold uppercase text-amber-700">💰 Giá · CT · HĐ</p>
              <p className="mt-1 text-xl font-black text-slate-900">
                {(scopedStats.byCategory.price + scopedStats.byCategory.formula_payment + scopedStats.byCategory.contract).toLocaleString('vi-VN')}
              </p>
              <p className="mt-0.5 text-[11px] text-slate-500">
                Giá: {scopedStats.byCategory.price} · CT: {scopedStats.byCategory.formula_payment} · HĐ: {scopedStats.byCategory.contract}
              </p>
            </div>
          </div>

          {/* Thanh chuyển chế độ + Bộ lọc */}
          <div className="rounded-3xl border border-slate-200 bg-white p-4 sm:p-5 shadow-xs space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setViewMode('issues')}
                  className={`rounded-xl px-3.5 py-2 text-xs font-bold transition-all cursor-pointer ${
                    viewMode === 'issues'
                      ? 'bg-slate-900 text-white shadow-xs'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  📋 Danh Sách Lỗi ({filteredIssues.length})
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('mappings')}
                  className={`rounded-xl px-3.5 py-2 text-xs font-bold transition-all cursor-pointer ${
                    viewMode === 'mappings'
                      ? 'bg-slate-900 text-white shadow-xs'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  🔗 Đối Chiếu Khách Hàng ↔ Tiền Tố ({filteredMappings.length})
                </button>
              </div>

              <input
                type="text"
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setPage(1);
                }}
                placeholder="Tìm theo dòng, mã lô, khách hàng, loại lúa..."
                className="w-full sm:w-72 rounded-xl border border-slate-300 bg-slate-50 px-3.5 py-2 text-xs text-slate-900 focus:border-rose-500 focus:bg-white focus:outline-none"
              />
            </div>

            {viewMode === 'issues' ? (
              <>
                {/* Bộ lọc chi tiết */}
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <select
                    value={monthFilter}
                    onChange={(e) => {
                      setMonthFilter(e.target.value);
                      setPage(1);
                    }}
                    className="rounded-xl border border-rose-300 bg-rose-50 px-3 py-1.5 font-bold text-rose-800"
                    title="Lọc kiểm tra lỗi theo từng Tháng / Năm"
                  >
                    <option value="all">📅 Tất cả các tháng ({result.summary.totalIssues} lỗi)</option>
                    {result.availableMonths.map((m) => (
                      <option key={m.key} value={m.key}>
                        📅 {m.label} ({(m.freshRows + m.dryRows).toLocaleString('vi-VN')} dòng)
                      </option>
                    ))}
                  </select>

                  <select
                    value={sourceFilter}
                    onChange={(e) => {
                      setSourceFilter(e.target.value as 'all' | RiceFileSource);
                      setPage(1);
                    }}
                    className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 font-semibold text-slate-700"
                  >
                    <option value="all">Tất cả file ({scopedStats.totalIssues})</option>
                    <option value="fresh">Lúa Tươi ({scopedStats.bySource.fresh})</option>
                    <option value="dry">Lúa Khô ({scopedStats.bySource.dry})</option>
                  </select>

                  <select
                    value={categoryFilter}
                    onChange={(e) => {
                      setCategoryFilter(e.target.value as 'all' | AuditCategory);
                      setPage(1);
                    }}
                    className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 font-semibold text-slate-700"
                  >
                    <option value="all">Tất cả nhóm lỗi</option>
                    <option value="lot_code">🏷️ Mã Lô ({scopedStats.byCategory.lot_code})</option>
                    <option value="customer">👤 Khách Hàng ({scopedStats.byCategory.customer})</option>
                    <option value="price">💰 Giá Tiền ({scopedStats.byCategory.price})</option>
                    <option value="contract">📜 Đối Chiếu HĐ ({scopedStats.byCategory.contract})</option>
                    <option value="formula_payment">
                      🧮 Công Thức &amp; TT ({scopedStats.byCategory.formula_payment})
                    </option>
                  </select>

                  <select
                    value={severityFilter}
                    onChange={(e) => {
                      setSeverityFilter(e.target.value as 'all' | AuditSeverity);
                      setPage(1);
                    }}
                    className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 font-semibold text-slate-700"
                  >
                    <option value="all">Tất cả mức độ</option>
                    <option value="error">🔴 Nghiêm trọng ({scopedStats.bySeverity.error})</option>
                    <option value="warning">🟠 Cảnh báo ({scopedStats.bySeverity.warning})</option>
                    <option value="info">⚪ Lưu ý ({scopedStats.bySeverity.info})</option>
                  </select>
                </div>

                {/* Bảng danh sách lỗi */}
                {pagedIssues.length === 0 ? (
                  <div className="rounded-2xl border border-emerald-200 bg-emerald-50/50 p-8 text-center text-sm font-semibold text-emerald-800">
                    ✅ Không phát hiện lỗi nào khớp với bộ lọc hiện tại.
                  </div>
                ) : (
                  <div className="overflow-x-auto rounded-2xl border border-slate-200">
                    <table className="min-w-full divide-y divide-slate-200 text-left text-xs">
                      <thead className="bg-slate-50 text-[11px] font-bold uppercase text-slate-500">
                        <tr>
                          <th className="px-3 py-2.5">File / Dòng</th>
                          <th className="px-3 py-2.5">Mức độ / Nhóm</th>
                          <th className="px-3 py-2.5">Thông tin dòng</th>
                          <th className="px-3 py-2.5">Giá / Tham chiếu</th>
                          <th className="px-3 py-2.5">Chi tiết lỗi &amp; Gợi ý sửa</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 bg-white">
                        {pagedIssues.map((iss) => {
                          const sev = SEVERITY_META[iss.severity];
                          const cat = CATEGORY_META[iss.category];
                          return (
                            <tr key={iss.id} className={`hover:bg-slate-50/80 ${sev.rowAccent}`}>
                              <td className="px-3 py-2.5 whitespace-nowrap align-top">
                                <span
                                  className={`inline-block rounded-md px-2 py-0.5 text-[10px] font-bold ${
                                    iss.source === 'fresh'
                                      ? 'bg-emerald-100 text-emerald-800'
                                      : 'bg-amber-100 text-amber-800'
                                  }`}
                                >
                                  {iss.sourceLabel}
                                </span>
                                <div className="mt-1 font-mono text-xs font-black text-slate-900">
                                  Dòng {iss.rowNumber}
                                </div>
                                <div className="text-[10px] text-slate-400">{iss.dateStr || '—'}</div>
                              </td>

                              <td className="px-3 py-2.5 whitespace-nowrap align-top space-y-1">
                                <div>
                                  <span
                                    className={`inline-block rounded-full border px-2 py-0.5 text-[10px] font-bold ${sev.badgeClass}`}
                                  >
                                    {sev.label}
                                  </span>
                                </div>
                                <div>
                                  <span
                                    className={`inline-block rounded-full border px-2 py-0.5 text-[10px] font-semibold ${cat.badgeClass}`}
                                  >
                                    {cat.icon} {cat.label}
                                  </span>
                                </div>
                              </td>

                              <td className="px-3 py-2.5 align-top max-w-[230px]">
                                <div className="font-mono font-bold text-slate-900">
                                  {iss.lotCode || <span className="text-rose-600">(Trống mã lô)</span>}
                                </div>
                                <div className="mt-0.5 font-semibold text-slate-700 truncate" title={iss.customer}>
                                  {iss.customer || <span className="text-rose-600">(Trống khách)</span>}
                                </div>
                                <div className="mt-0.5 text-[11px] text-slate-500">
                                  {iss.riceType || '—'}
                                  {iss.contractNo ? ` · HĐ: ${iss.contractNo}` : ''}
                                  {iss.buyer ? ` · NV: ${iss.buyer}` : ''}
                                  {iss.quantityKg ? ` · ${iss.quantityKg.toLocaleString('vi-VN')} kg` : ''}
                                </div>
                              </td>

                              <td className="px-3 py-2.5 whitespace-nowrap align-top">
                                <div className="font-bold text-slate-900">
                                  {iss.price !== null ? `${iss.price.toLocaleString('vi-VN')} đ` : '—'}
                                </div>
                                {iss.expectedPrice ? (
                                  <div className="mt-0.5 text-[11px] font-semibold text-emerald-700">
                                    TB kỳ: {iss.expectedPrice.toLocaleString('vi-VN')} đ
                                  </div>
                                ) : null}
                              </td>

                              <td className="px-3 py-2.5 align-top min-w-[280px]">
                                <div className="font-bold text-slate-900">{iss.title}</div>
                                <div className="mt-0.5 text-slate-600">{iss.detail}</div>
                                <div className="mt-1 text-[11px] font-medium text-emerald-700">
                                  💡 {iss.suggestion}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Phân trang */}
                {totalPages > 1 && (
                  <div className="flex items-center justify-between pt-2 text-xs text-slate-600">
                    <span>
                      Trang <strong>{page}</strong> / {totalPages} (Tổng {filteredIssues.length} mục)
                    </span>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        disabled={page <= 1}
                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                        className="rounded-lg border border-slate-200 bg-white px-3 py-1 font-semibold hover:bg-slate-50 disabled:opacity-40 cursor-pointer"
                      >
                        Trước
                      </button>
                      <button
                        type="button"
                        disabled={page >= totalPages}
                        onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                        className="rounded-lg border border-slate-200 bg-white px-3 py-1 font-semibold hover:bg-slate-50 disabled:opacity-40 cursor-pointer"
                      >
                        Sau
                      </button>
                    </div>
                  </div>
                )}
              </>
            ) : (
              /* Tab Đối Chiếu Khách Hàng ↔ Tiền Tố */
              <div className="space-y-3">
                <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={onlyDirtyMappings}
                    onChange={(e) => setOnlyDirtyMappings(e.target.checked)}
                    className="rounded border-slate-300"
                  />
                  <span>Chỉ hiện khách hàng có nhiều tiền tố mã lô hoặc nhiều biến thể tên</span>
                </label>

                <div className="overflow-x-auto rounded-2xl border border-slate-200">
                  <table className="min-w-full divide-y divide-slate-200 text-left text-xs">
                    <thead className="bg-slate-50 text-[11px] font-bold uppercase text-slate-500">
                      <tr>
                        <th className="px-3 py-2.5">Khách Hàng Chuẩn</th>
                        <th className="px-3 py-2.5">Số dòng</th>
                        <th className="px-3 py-2.5">Tiền tố chính</th>
                        <th className="px-3 py-2.5">Tất cả tiền tố đang dùng</th>
                        <th className="px-3 py-2.5">Biến thể tên đang gõ</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                      {filteredMappings.slice(0, 200).map((m) => (
                        <tr key={m.customerNormalized} className="hover:bg-slate-50">
                          <td className="px-3 py-2.5 font-bold text-slate-900">{m.customerNormalized}</td>
                          <td className="px-3 py-2.5 font-mono">{m.rowCount}</td>
                          <td className="px-3 py-2.5 font-mono font-bold text-emerald-700">
                            {m.dominantPrefix || '—'}
                          </td>
                          <td className="px-3 py-2.5">
                            <div className="flex flex-wrap gap-1">
                              {m.prefixes.map((p) => (
                                <span
                                  key={p.prefix}
                                  className={`rounded-md px-2 py-0.5 font-mono text-[11px] font-semibold ${
                                    p.prefix === m.dominantPrefix
                                      ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                                      : 'bg-rose-50 text-rose-700 border border-rose-200'
                                  }`}
                                >
                                  {p.prefix} ({p.count})
                                </span>
                              ))}
                            </div>
                          </td>
                          <td className="px-3 py-2.5 text-slate-600">
                            {m.variants.map((v) => `"${v}"`).join(' | ')}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
