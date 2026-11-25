'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  DailyIntakeKhoRow,
  DailyIntakeTuoiRow,
  buildDailyIntakeReport,
  parseDailyIntakeKhoExcel,
  parseDailyIntakeTuoiExcel,
  getYesterdayDateStr,
  formatKgVN,
} from '@/lib/rice-payroll/daily-intake-report';

const LOCAL_STORAGE_DAILY_KHO = 'daily_intake_kho_v1';
const LOCAL_STORAGE_DAILY_TUOI = 'daily_intake_tuoi_v1';

export default function BaoCaoNhapNgayView() {
  const [khoRows, setKhoRows] = useState<DailyIntakeKhoRow[]>([]);
  const [tuoiRows, setTuoiRows] = useState<DailyIntakeTuoiRow[]>([]);
  const [dailyDate, setDailyDate] = useState<string>(() => getYesterdayDateStr());
  const [isLoading, setIsLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  const [uploadingKho, setUploadingKho] = useState(false);
  const [uploadingTuoi, setUploadingTuoi] = useState(false);
  const [uploadMsg, setUploadMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const fileKhoRef = useRef<HTMLInputElement>(null);
  const fileTuoiRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let loadedLocal = false;
    try {
      const rawK = localStorage.getItem(LOCAL_STORAGE_DAILY_KHO);
      const rawT = localStorage.getItem(LOCAL_STORAGE_DAILY_TUOI);
      if (rawK && rawT) {
        const pk = JSON.parse(rawK);
        const pt = JSON.parse(rawT);
        if (Array.isArray(pk) && Array.isArray(pt) && (pk.length > 0 || pt.length > 0)) {
          setKhoRows(pk);
          setTuoiRows(pt);
          loadedLocal = true;
        }
      }
    } catch {}

    if (!loadedLocal) {
      fetch('/api/rice-payroll/daily-intake-report')
        .then((res) => res.json())
        .then((json) => {
          if (Array.isArray(json.khoRows)) {
            setKhoRows(json.khoRows);
            try { localStorage.setItem(LOCAL_STORAGE_DAILY_KHO, JSON.stringify(json.khoRows)); } catch {}
          }
          if (Array.isArray(json.tuoiRows)) {
            setTuoiRows(json.tuoiRows);
            try { localStorage.setItem(LOCAL_STORAGE_DAILY_TUOI, JSON.stringify(json.tuoiRows)); } catch {}
          }
        })
        .catch(() => {})
        .finally(() => setIsLoading(false));
    } else {
      setIsLoading(false);
    }
  }, []);

  const availableDates = useMemo(() => {
    const dateSet = new Set<string>();
    khoRows.forEach((r) => r.ngayCan && dateSet.add(r.ngayCan));
    tuoiRows.forEach((r) => r.ngayCan && dateSet.add(r.ngayCan));
    return Array.from(dateSet).sort((a, b) => {
      const [da, ma, ya] = a.split('/').map(Number);
      const [db, mb, yb] = b.split('/').map(Number);
      return Date.UTC(yb || 0, (mb || 1) - 1, db || 1) - Date.UTC(ya || 0, (ma || 1) - 1, da || 1);
    });
  }, [khoRows, tuoiRows]);

  const report = useMemo(() => {
    return buildDailyIntakeReport(khoRows, tuoiRows, dailyDate);
  }, [khoRows, tuoiRows, dailyDate]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(report.zaloText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      alert('Không thể sao chép tự động, vui lòng bôi đen và sao chép thủ công.');
    }
  };

  const handleUploadKho = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingKho(true);
    setUploadMsg(null);
    try {
      const buf = await file.arrayBuffer();
      const rows = parseDailyIntakeKhoExcel(buf);
      if (rows.length === 0) throw new Error('Không tìm thấy dữ liệu hợp lệ trong file Lúa Khô.');
      setKhoRows(rows);
      try { localStorage.setItem(LOCAL_STORAGE_DAILY_KHO, JSON.stringify(rows)); } catch {}
      setUploadMsg({ type: 'success', text: `✅ Đã nạp file Lúa Khô "${file.name}" (${rows.length} dòng).` });
      try {
        const fd = new FormData();
        fd.append('fileKho', file);
        fetch('/api/rice-payroll/unground-report', { method: 'PUT', body: fd }).catch(() => {});
      } catch {}
    } catch (err) {
      setUploadMsg({ type: 'error', text: 'Lỗi đọc file Lúa Khô: ' + (err instanceof Error ? err.message : String(err)) });
    } finally {
      setUploadingKho(false);
      if (fileKhoRef.current) fileKhoRef.current.value = '';
    }
  };

  const handleUploadTuoi = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingTuoi(true);
    setUploadMsg(null);
    try {
      const buf = await file.arrayBuffer();
      const rows = parseDailyIntakeTuoiExcel(buf);
      if (rows.length === 0) throw new Error('Không tìm thấy dữ liệu hợp lệ trong file Lúa Tươi.');
      setTuoiRows(rows);
      try { localStorage.setItem(LOCAL_STORAGE_DAILY_TUOI, JSON.stringify(rows)); } catch {}
      setUploadMsg({ type: 'success', text: `✅ Đã nạp file Lúa Tươi "${file.name}" (${rows.length} dòng).` });
      try {
        const fd = new FormData();
        fd.append('fileTuoi', file);
        fetch('/api/rice-payroll/unground-report', { method: 'PUT', body: fd }).catch(() => {});
      } catch {}
    } catch (err) {
      setUploadMsg({ type: 'error', text: 'Lỗi đọc file Lúa Tươi: ' + (err instanceof Error ? err.message : String(err)) });
    } finally {
      setUploadingTuoi(false);
      if (fileTuoiRef.current) fileTuoiRef.current.value = '';
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-slate-500">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-indigo-200 border-t-indigo-600 mb-3" />
        <p className="text-sm font-semibold">Đang tải dữ liệu Báo Cáo Nhập Ngày...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header & Nạp file nhanh */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div>
          <h1 className="text-xl font-black text-slate-900 flex items-center gap-2">
            <span>📅</span>
            <span>Báo Cáo Lúa Tươi &amp; Lúa Khô Nhập Ngày</span>
          </h1>
          <p className="mt-1 text-xs text-slate-500">
            Tổng hợp số lượng theo ngày cân (mặc định lùi 1 ngày), tách theo HĐ / ngoài HĐ, cơ sở sấy &amp; đếm phương tiện chưa về chờ thanh toán.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={fileKhoRef}
            type="file"
            accept=".xlsx,.xls"
            onChange={handleUploadKho}
            className="hidden"
          />
          <input
            ref={fileTuoiRef}
            type="file"
            accept=".xlsx,.xls"
            onChange={handleUploadTuoi}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileKhoRef.current?.click()}
            disabled={uploadingKho}
            className="rounded-xl border border-amber-300 bg-amber-50 px-3.5 py-2 text-xs font-bold text-amber-900 hover:bg-amber-100 transition cursor-pointer disabled:opacity-50"
          >
            {uploadingKho ? '⏳ Đang đọc...' : '📤 Nạp File Lúa Khô'}
          </button>
          <button
            type="button"
            onClick={() => fileTuoiRef.current?.click()}
            disabled={uploadingTuoi}
            className="rounded-xl border border-emerald-300 bg-emerald-50 px-3.5 py-2 text-xs font-bold text-emerald-900 hover:bg-emerald-100 transition cursor-pointer disabled:opacity-50"
          >
            {uploadingTuoi ? '⏳ Đang đọc...' : '📤 Nạp File Lúa Tươi'}
          </button>
        </div>
      </div>

      {uploadMsg && (
        <div
          className={`rounded-xl border px-4 py-3 text-xs font-semibold ${
            uploadMsg.type === 'success'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
              : 'border-rose-200 bg-rose-50 text-rose-800'
          }`}
        >
          {uploadMsg.text}
        </div>
      )}

      {/* Thanh chọn ngày báo cáo */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-indigo-200 bg-indigo-50/50 p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <label className="text-xs font-bold text-indigo-950 whitespace-nowrap">
              📅 Ngày nhập lúa báo cáo:
            </label>
            <input
              type="text"
              value={dailyDate}
              onChange={(e) => setDailyDate(e.target.value)}
              placeholder="DD/MM/YYYY"
              className="w-32 rounded-lg border border-indigo-300 px-3 py-1.5 text-xs font-bold text-slate-800 focus:border-indigo-500 focus:outline-none bg-white"
            />
          </div>

          {availableDates.length > 0 && (
            <select
              value={availableDates.includes(dailyDate) ? dailyDate : ''}
              onChange={(e) => e.target.value && setDailyDate(e.target.value)}
              className="rounded-lg border border-indigo-200 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white focus:border-indigo-500 focus:outline-none"
            >
              <option value="">-- Chọn ngày có trong file --</option>
              {availableDates.slice(0, 30).map((d) => (
                <option key={d} value={d}>
                  Ngày {d}
                </option>
              ))}
            </select>
          )}

          <button
            type="button"
            onClick={() => setDailyDate(getYesterdayDateStr())}
            className="rounded-lg border border-indigo-300 bg-white px-3 py-1.5 text-xs font-bold text-indigo-700 hover:bg-indigo-50 transition cursor-pointer"
          >
            ⏪ Lùi 1 ngày (Hôm qua)
          </button>
        </div>

        <div className="text-xs text-indigo-700 font-semibold">
          Dữ liệu đang nạp: {tuoiRows.length} dòng tươi + {khoRows.length} dòng khô
        </div>
      </div>

      {/* 4 Thẻ KPI */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-2xl border border-indigo-200 bg-indigo-50/60 p-4 shadow-sm">
          <span className="text-[11px] font-bold uppercase tracking-wider text-indigo-700">
            Tổng Lượng Ngày {report.reportDate}
          </span>
          <div className="mt-2 flex items-baseline gap-1.5">
            <span className="text-2xl font-black text-indigo-900">
              {formatKgVN(report.totalKg)}
            </span>
            <span className="text-xs font-bold text-indigo-700">kg</span>
          </div>
        </div>

        <div className="rounded-2xl border border-emerald-200 bg-emerald-50/50 p-4 shadow-sm">
          <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-700">
            Nhận Theo Hợp Đồng
          </span>
          <div className="mt-2 flex items-baseline gap-1.5">
            <span className="text-2xl font-bold text-emerald-800">
              {formatKgVN(report.contractKg)}
            </span>
            <span className="text-xs font-bold text-emerald-600">kg</span>
          </div>
        </div>

        <div className="rounded-2xl border border-amber-200 bg-amber-50/50 p-4 shadow-sm">
          <span className="text-[11px] font-bold uppercase tracking-wider text-amber-700">
            Nhận Ngoài Hợp Đồng (&apos;00)
          </span>
          <div className="mt-2 flex items-baseline gap-1.5">
            <span className="text-2xl font-bold text-amber-800">
              {formatKgVN(report.outsideContractKg)}
            </span>
            <span className="text-xs font-bold text-amber-600">kg</span>
          </div>
        </div>

        <div className="rounded-2xl border border-rose-200 bg-rose-50/50 p-4 shadow-sm">
          <span className="text-[11px] font-bold uppercase tracking-wider text-rose-700">
            PT Lúa Khô Chưa Về (Chờ TT)
          </span>
          <div className="mt-2 flex items-baseline gap-1.5">
            <span className="text-2xl font-black text-rose-700">
              {String(report.pendingVehicles.count).padStart(2, '0')}
            </span>
            <span className="text-xs font-bold text-rose-600">phương tiện</span>
          </div>
          {report.pendingVehicles.minDate && (
            <div className="mt-1 text-[11px] text-rose-600">
              {report.pendingVehicles.minDate} - {report.pendingVehicles.maxDate}
            </div>
          )}
        </div>
      </div>

      {/* Khung văn bản Zalo */}
      <div className="rounded-3xl border-2 border-indigo-400 bg-gradient-to-br from-indigo-50/70 via-blue-50/40 to-white p-6 shadow-md space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-indigo-200/80 pb-3">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-indigo-600 text-white text-base">
              💬
            </span>
            <div>
              <h2 className="text-sm font-black uppercase tracking-wider text-indigo-950">
                Nội Dung Báo Cáo Nhập Ngày (Gửi Zalo 1 Click)
              </h2>
              <p className="text-[11px] text-indigo-700">
                Bấm nút &quot;Sao Chép&quot; để dán trực tiếp vào Zalo gửi sếp
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleCopy}
            className={`rounded-xl px-5 py-2.5 text-xs font-black shadow-md transition-all flex items-center gap-2 cursor-pointer ${
              copied
                ? 'bg-emerald-600 text-white ring-2 ring-emerald-400 scale-105'
                : 'bg-indigo-700 hover:bg-indigo-800 text-white active:scale-95'
            }`}
          >
            <span>{copied ? '✓' : '📋'}</span>
            <span>{copied ? 'Đã Sao Chép!' : 'Sao Chép Báo Cáo Zalo'}</span>
          </button>
        </div>

        <div className="relative rounded-2xl border border-indigo-300 bg-white p-5 font-mono text-xs sm:text-sm text-slate-800 shadow-inner whitespace-pre-line leading-relaxed">
          {report.zaloText}
        </div>
      </div>

      {/* Bảng chi tiết phương tiện chưa về chờ TT */}
      {report.pendingVehicles.vehicles.length > 0 && (
        <div className="overflow-hidden rounded-2xl border border-rose-200 bg-white shadow-sm">
          <div className="border-b border-rose-100 bg-rose-50/60 px-5 py-3 flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-wider text-rose-900">
              🚢 Chi Tiết Phương Tiện Lúa Khô Chưa Về, Chờ Thanh Toán ({report.pendingVehicles.count} PT)
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-slate-700 font-bold">
                  <th className="px-4 py-2.5">Ngày Cân</th>
                  <th className="px-4 py-2.5">Phương Tiện</th>
                  <th className="px-4 py-2.5">Loại Lúa</th>
                  <th className="px-4 py-2.5 text-right">Số Lượng (kg)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {report.pendingVehicles.vehicles.map((v, idx) => (
                  <tr key={idx} className="hover:bg-rose-50/30">
                    <td className="px-4 py-2 font-mono text-slate-700">{v.ngayCan}</td>
                    <td className="px-4 py-2 font-bold text-slate-900">{v.phuongTien}</td>
                    <td className="px-4 py-2 text-slate-700">{v.loaiLua}</td>
                    <td className="px-4 py-2 text-right font-mono font-semibold text-slate-800">
                      {formatKgVN(v.slKg)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
