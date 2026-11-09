'use client';

import React, { useState, useRef, useMemo, ChangeEvent } from 'react';
import { ScannedSlipItem, HuskSettings, DEFAULT_HUSK_SETTINGS } from '@/lib/husk/types';
import { calculateHuskTons } from '@/lib/husk/tonnage';
import { formatWorkDescription, parseVehicle } from '@/lib/husk/plate';
import { groupSlipsIfEnabled } from '@/lib/husk/merger';

export default function HuskPayrollView() {
  // ─── File & Settings State ────────────────────────────────────────────────
  const [excelFile, setExcelFile] = useState<File | null>(null);
  const [selectedImages, setSelectedImages] = useState<File[]>([]);
  const [settings, setSettings] = useState<HuskSettings>(DEFAULT_HUSK_SETTINGS);
  const [showSettings, setShowSettings] = useState<boolean>(false);

  // ─── Processing State ─────────────────────────────────────────────────────
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [scanProgress, setScanProgress] = useState<number>(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // ─── Data State ───────────────────────────────────────────────────────────
  const [scannedSlips, setScannedSlips] = useState<ScannedSlipItem[]>([]);
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  const fileExcelInputRef = useRef<HTMLInputElement>(null);
  const imagesInputRef = useRef<HTMLInputElement>(null);

  // ─── Handlers Chọn File Excel ─────────────────────────────────────────────
  const handleExcelChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setExcelFile(file);
      setErrorMessage(null);
    }
  };

  // ─── Handlers Chọn Ảnh Phiếu Cân ──────────────────────────────────────────
  const handleImagesChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const files = Array.from(e.target.files);
      if (files.length > 30) {
        setErrorMessage('Tối đa 30 ảnh cho mỗi lượt quét. Vui lòng chọn lại.');
        return;
      }
      setSelectedImages(files);
      setErrorMessage(null);
    }
  };

  // ─── Quét Phiếu Cân (Gửi sang API OCR) ────────────────────────────────────
  const handleScanSlips = async () => {
    if (selectedImages.length === 0) {
      setErrorMessage('Vui lòng chọn hoặc chụp ảnh phiếu cân trước.');
      return;
    }

    setIsScanning(true);
    setScanProgress(20);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const formData = new FormData();
      if (excelFile) {
        formData.append('excelFile', excelFile);
      }
      formData.append('unitPrice', String(settings.unitPrice));
      formData.append('sheetName', settings.sheetName);

      selectedImages.forEach((file) => {
        formData.append('images', file);
      });

      setScanProgress(50);
      const res = await fetch('/api/husk/scan', {
        method: 'POST',
        body: formData,
      });

      setScanProgress(80);
      let data: any = {};
      try {
        data = await res.json();
      } catch {
        throw new Error(`Máy chủ phản hồi mã lỗi ${res.status}. Vui lòng kiểm tra lại kết nối mạng hoặc thử lại với ít ảnh hơn.`);
      }

      if (!res.ok) {
        throw new Error(data.error || `Quá trình quét phiếu gặp sự cố (mã lỗi ${res.status}).`);
      }

      setScannedSlips(data.slips || []);
      setScanProgress(100);
      setSuccessMessage(`Đã đọc thành công ${data.totalScanned || 0} phiếu cân.`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMessage(msg);
    } finally {
      setIsScanning(false);
    }
  };

  // ─── Chỉnh Sửa Trực Tiếp Trên Bảng ────────────────────────────────────────
  const handleFieldChange = (id: string, field: keyof ScannedSlipItem, value: unknown) => {
    setScannedSlips((prev) =>
      prev.map((slip) => {
        if (slip.id !== id) return slip;

        const updated = { ...slip, [field]: value };

        // Nếu sửa NetKg -> tự động tính lại tấn và thành tiền
        if (field === 'weightNetKg') {
          const kg = Number(value) || 0;
          updated.tons = calculateHuskTons(kg);
          updated.amount = Math.round(updated.tons * updated.unitPrice);
        }

        // Nếu sửa xe hoặc khách -> cập nhật lại mô tả cột D
        if (field === 'vehicle' || field === 'customer') {
          const vInfo = parseVehicle(updated.vehicle);
          updated.description = formatWorkDescription(vInfo.normalized, updated.customer);
        }

        return updated;
      })
    );
  };

  const handleToggleSelectAll = (checked: boolean) => {
    setScannedSlips((prev) => prev.map((s) => ({ ...s, selected: checked })));
  };

  // ─── Danh Sách Dòng Dự Kiến Ghi (Sau Khi Áp Dụng Tùy Chọn Gộp) ─────────────
  const previewRows = useMemo(() => {
    const selected = scannedSlips.filter((s) => s.selected);
    return groupSlipsIfEnabled(selected, settings.mergeTrips, settings.unitPrice);
  }, [scannedSlips, settings.mergeTrips, settings.unitPrice]);

  const summary = useMemo(() => {
    const totalKg = previewRows.reduce((sum, r) => sum + (r.weightNetKg || 0), 0);
    const totalTons = previewRows.reduce((sum, r) => sum + (r.tons || 0), 0);
    const totalAmount = previewRows.reduce((sum, r) => sum + (r.amount || 0), 0);
    return {
      count: previewRows.length,
      totalKg,
      totalTons: Number(totalTons.toFixed(1)),
      totalAmount,
    };
  }, [previewRows]);

  // ─── Ghi Vào Excel & Tải Về File Cập Nhật ─────────────────────────────────
  const handleExportExcel = async () => {
    if (!excelFile) {
      setErrorMessage('Vui lòng tải lên file Excel lương cần cập nhật.');
      return;
    }

    if (previewRows.length === 0) {
      setErrorMessage('Chưa có phiếu cân nào được chọn để ghi.');
      return;
    }

    setIsExporting(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const formData = new FormData();
      formData.append('excelFile', excelFile);
      formData.append('slips', JSON.stringify(scannedSlips));
      formData.append('settings', JSON.stringify(settings));

      const res = await fetch('/api/husk/export', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Xuất file Excel thất bại.');
      }

      // Tải file về máy người dùng
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const originalName = excelFile.name.replace(/\.[^/.]+$/, '');
      a.download = `${originalName}_cap_nhat.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);

      const insertedCount = res.headers.get('X-Inserted-Count') || previewRows.length;
      setSuccessMessage(`Đã ghi thành công ${insertedCount} dòng trấu vào file Excel!`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMessage(msg);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6 pb-20">
      {/* ─── Header Tiêu Đề ──────────────────────────────────────────────── */}
      <div className="rounded-2xl bg-gradient-to-r from-amber-700 via-amber-800 to-amber-900 p-6 text-white shadow-xl shadow-amber-950/10">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-3xl">🌾</span>
              <h1 className="text-2xl font-black tracking-tight sm:text-3xl">
                Quét Phiếu Cân &amp; Tính Lương Xuất Trấu
              </h1>
            </div>
            <p className="mt-1.5 text-sm text-amber-200/90 sm:text-base">
              Chụp ảnh phiếu cân &rarr; AI tự động đọc dữ liệu &rarr; Ghi chính xác vào file Excel lương (giữ nguyên liên kết, công thức &amp; định dạng).
            </p>
          </div>

          <button
            type="button"
            onClick={() => setShowSettings(!showSettings)}
            className="flex items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-4 py-2.5 text-xs font-semibold backdrop-blur-md transition hover:bg-white/20 sm:self-start"
          >
            <span>⚙️</span>
            <span>Cài Đặt Đơn Giá &amp; Sheet</span>
          </button>
        </div>

        {/* Bảng Cài Đặt (Collapsible) */}
        {showSettings && (
          <div className="mt-6 rounded-xl border border-white/20 bg-black/20 p-4 backdrop-blur-md">
            <h3 className="text-sm font-bold text-amber-100">Cấu hình tính lương xuất trấu</h3>
            <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <label className="block text-xs font-medium text-amber-200">Đơn giá xuất trấu (VNĐ/tấn):</label>
                <input
                  type="number"
                  value={settings.unitPrice}
                  onChange={(e) => setSettings({ ...settings, unitPrice: Number(e.target.value) || 11000 })}
                  className="mt-1 w-full rounded-lg border border-amber-300/40 bg-white/10 px-3 py-1.5 text-sm font-bold text-white focus:outline-none focus:ring-2 focus:ring-amber-400"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-amber-200">Tên sheet Excel đích:</label>
                <input
                  type="text"
                  value={settings.sheetName}
                  onChange={(e) => setSettings({ ...settings, sheetName: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-amber-300/40 bg-white/10 px-3 py-1.5 text-sm font-bold text-white focus:outline-none focus:ring-2 focus:ring-amber-400"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-amber-200">Tên đội mặc định (Cột ĐỘI):</label>
                <input
                  type="text"
                  value={settings.defaultTeam}
                  onChange={(e) => setSettings({ ...settings, defaultTeam: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-amber-300/40 bg-white/10 px-3 py-1.5 text-sm font-bold text-white focus:outline-none focus:ring-2 focus:ring-amber-400"
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ─── Thông Báo Lỗi / Thành Công ─────────────────────────────────── */}
      {errorMessage && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-medium text-red-800 shadow-sm">
          ⚠️ <strong>Lỗi:</strong> {errorMessage}
        </div>
      )}

      {successMessage && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-medium text-emerald-800 shadow-sm">
          ✅ <strong>Thành công:</strong> {successMessage}
        </div>
      )}

      {/* ─── BƯỚC 1 & 2: TẢI FILE EXCEL & CHỌN ẢNH PHIẾU CÂN ─────────────── */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        {/* Bước 1: File Excel */}
        <div className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div>
            <div className="flex items-center gap-3">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-amber-100 text-sm font-black text-amber-900">
                1
              </span>
              <h2 className="text-base font-bold text-slate-900">Chọn file Excel bảng kê lương</h2>
            </div>
            <p className="mt-1.5 text-xs text-slate-500">
              Tải file Excel gốc (chứa sheet &ldquo;QUÝ&rdquo;). Hệ thống sẽ đọc dòng cuối và dời chữ ký tự động.
            </p>

            <div
              onClick={() => fileExcelInputRef.current?.click()}
              className="mt-4 flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-200 bg-slate-50/70 p-6 transition hover:border-amber-500 hover:bg-amber-50/30"
            >
              <input
                ref={fileExcelInputRef}
                type="file"
                accept=".xlsx,.xls"
                onChange={handleExcelChange}
                className="hidden"
              />
              <span className="text-3xl">📊</span>
              <p className="mt-2 text-sm font-semibold text-slate-700">
                {excelFile ? excelFile.name : 'Bấm vào đây để chọn file Excel (.xlsx)'}
              </p>
              <p className="text-xs text-slate-400">
                {excelFile ? `${(excelFile.size / 1024).toFixed(1)} KB` : 'Hoặc kéo thả file vào đây'}
              </p>
            </div>
          </div>
        </div>

        {/* Bước 2: Ảnh Phiếu Cân */}
        <div className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div>
            <div className="flex items-center gap-3">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-amber-100 text-sm font-black text-amber-900">
                2
              </span>
              <h2 className="text-base font-bold text-slate-900">Chụp hoặc tải ảnh phiếu cân</h2>
            </div>
            <p className="mt-1.5 text-xs text-slate-500">
              Có thể chọn tối đa 30 ảnh cùng lúc. Trên điện thoại có thể chụp trực tiếp bằng máy ảnh.
            </p>

            <div
              onClick={() => imagesInputRef.current?.click()}
              className="mt-4 flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-amber-300 bg-amber-50/40 p-6 transition hover:border-amber-600 hover:bg-amber-50/70"
            >
              <input
                ref={imagesInputRef}
                type="file"
                accept="image/*"
                multiple
                capture="environment"
                onChange={handleImagesChange}
                className="hidden"
              />
              <span className="text-3xl">📸</span>
              <p className="mt-2 text-sm font-semibold text-amber-900">
                {selectedImages.length > 0
                  ? `Đã chọn ${selectedImages.length} ảnh phiếu cân`
                  : 'Bấm để chụp / chọn ảnh phiếu cân'}
              </p>
              <p className="text-xs text-amber-700/80">Cho phép chọn nhiều ảnh, định dạng JPG/PNG</p>
            </div>
          </div>

          <button
            type="button"
            disabled={selectedImages.length === 0 || isScanning}
            onClick={handleScanSlips}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-amber-600 py-3 text-sm font-bold text-white shadow-md shadow-amber-600/20 transition hover:bg-amber-700 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            {isScanning ? (
              <>
                <svg className="h-4 w-4 animate-spin text-white" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
                <span>AI đang đọc phiếu ({scanProgress}%)...</span>
              </>
            ) : (
              <>
                <span>⚡</span>
                <span>Quét {selectedImages.length > 0 ? selectedImages.length : ''} phiếu cân</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* ─── BƯỚC 3: BẢNG KIỂM TRA & DUYỆT PHIẾU CÂN ───────────────────────── */}
      {scannedSlips.length > 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex items-center gap-3">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-amber-100 text-sm font-black text-amber-900">
                  3
                </span>
                <h2 className="text-lg font-bold text-slate-900">
                  Kiểm tra &amp; Chỉnh sửa thông tin phiếu cân ({scannedSlips.length} phiếu)
                </h2>
              </div>
              <p className="mt-1 text-xs text-slate-500">
                Các ô có cảnh báo nghi ngờ được tô màu viền cam/đỏ. Bạn có thể sửa trực tiếp vào ô trước khi ghi.
              </p>
            </div>

            {/* Checkbox gộp chuyến */}
            <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-100">
              <input
                type="checkbox"
                checked={settings.mergeTrips}
                onChange={(e) => setSettings({ ...settings, mergeTrips: e.target.checked })}
                className="h-4 w-4 rounded text-amber-600 focus:ring-amber-500"
              />
              <span>Gộp phiếu cùng ngày + xe + khách thành 1 dòng</span>
            </label>
          </div>

          {/* Bảng Dữ Liệu Chi Tiết */}
          <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full min-w-[900px] border-collapse text-left text-xs">
              <thead className="bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-600">
                <tr>
                  <th className="p-3 text-center">
                    <input
                      type="checkbox"
                      checked={scannedSlips.length > 0 && scannedSlips.every((s) => s.selected)}
                      onChange={(e) => handleToggleSelectAll(e.target.checked)}
                      className="h-4 w-4 rounded text-amber-600 focus:ring-amber-500"
                    />
                    <span className="ml-1">Ghi?</span>
                  </th>
                  <th className="p-3 text-center">Ảnh</th>
                  <th className="p-3">Ngày</th>
                  <th className="p-3">Khách hàng</th>
                  <th className="p-3">Số xe / Ghe</th>
                  <th className="p-3 text-right">Kg Hàng</th>
                  <th className="p-3 text-right">Tấn (cắt 1 số lẻ)</th>
                  <th className="p-3">Mô tả dự kiến (Cột D)</th>
                  <th className="p-3">Tình trạng / Cảnh báo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 bg-white font-medium">
                {scannedSlips.map((slip) => {
                  const hasWarning = slip.warnings.length > 0;
                  return (
                    <tr
                      key={slip.id}
                      className={`transition-colors ${
                        !slip.selected
                          ? 'bg-slate-50/70 text-slate-400 opacity-60'
                          : hasWarning
                          ? 'bg-amber-50/40 hover:bg-amber-50/70'
                          : 'hover:bg-slate-50'
                      }`}
                    >
                      {/* Checkbox Ghi */}
                      <td className="p-3 text-center">
                        <input
                          type="checkbox"
                          checked={slip.selected}
                          onChange={(e) => handleFieldChange(slip.id, 'selected', e.target.checked)}
                          className="h-4 w-4 rounded text-amber-600 focus:ring-amber-500"
                        />
                      </td>

                      {/* Ảnh Thumbnail */}
                      <td className="p-3 text-center">
                        {slip.thumbnailBase64 ? (
                          <img
                            src={slip.thumbnailBase64}
                            alt="Phiếu cân"
                            onClick={() => setPreviewImage(slip.thumbnailBase64 || null)}
                            className="h-10 w-10 cursor-pointer rounded-lg border border-slate-200 object-cover shadow-2xs transition hover:scale-110"
                          />
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>

                      {/* Ngày */}
                      <td className="p-2">
                        <input
                          type="text"
                          value={slip.date}
                          onChange={(e) => handleFieldChange(slip.id, 'date', e.target.value)}
                          className="w-24 rounded border border-slate-200 px-2 py-1 text-xs font-semibold focus:border-amber-500 focus:outline-none"
                        />
                      </td>

                      {/* Khách hàng */}
                      <td className="p-2">
                        <input
                          type="text"
                          value={slip.customer}
                          onChange={(e) => handleFieldChange(slip.id, 'customer', e.target.value)}
                          className="w-28 rounded border border-slate-200 px-2 py-1 text-xs font-semibold focus:border-amber-500 focus:outline-none"
                        />
                      </td>

                      {/* Xe / Ghe */}
                      <td className="p-2">
                        <input
                          type="text"
                          value={slip.vehicle}
                          onChange={(e) => handleFieldChange(slip.id, 'vehicle', e.target.value)}
                          className="w-28 rounded border border-slate-200 px-2 py-1 text-xs font-semibold focus:border-amber-500 focus:outline-none"
                        />
                      </td>

                      {/* Kg Hàng */}
                      <td className="p-2 text-right">
                        <input
                          type="number"
                          value={slip.weightNetKg}
                          onChange={(e) => handleFieldChange(slip.id, 'weightNetKg', Number(e.target.value))}
                          className="w-20 rounded border border-slate-200 px-2 py-1 text-right text-xs font-bold text-slate-900 focus:border-amber-500 focus:outline-none"
                        />
                      </td>

                      {/* Tấn */}
                      <td className="p-3 text-right font-bold text-amber-700">{slip.tons.toFixed(1)}</td>

                      {/* Mô tả Cột D */}
                      <td className="p-2">
                        <input
                          type="text"
                          value={slip.description}
                          onChange={(e) => handleFieldChange(slip.id, 'description', e.target.value)}
                          className="w-full min-w-[220px] rounded border border-slate-200 px-2 py-1 text-xs text-slate-800 focus:border-amber-500 focus:outline-none"
                        />
                      </td>

                      {/* Cảnh báo */}
                      <td className="p-3">
                        {hasWarning ? (
                          <div className="space-y-1">
                            {slip.warnings.map((w, idx) => (
                              <span
                                key={idx}
                                className="inline-block rounded-md bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800 ring-1 ring-amber-300"
                              >
                                ⚠️ {w}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600">
                            ✓ Hợp lệ
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* ─── TỔNG KẾT & XUẤT FILE EXCEL ───────────────────────────────── */}
          <div className="mt-6 flex flex-col items-start justify-between gap-4 rounded-xl border border-amber-200 bg-amber-50/60 p-4 sm:flex-row sm:items-center">
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-amber-900">
                Tổng cộng đợt ghi này ({summary.count} dòng trấu)
              </p>
              <div className="mt-1 flex flex-wrap items-baseline gap-4 text-sm text-slate-700">
                <span>
                  Tổng khối lượng: <strong>{summary.totalKg.toLocaleString()} kg</strong>
                </span>
                <span>
                  Số tấn: <strong>{summary.totalTons.toFixed(1)} tấn</strong>
                </span>
                <span>
                  Thành tiền: <strong className="text-base text-amber-800">{summary.totalAmount.toLocaleString()} VNĐ</strong>
                </span>
              </div>
            </div>

            <button
              type="button"
              disabled={isExporting || summary.count === 0 || !excelFile}
              onClick={handleExportExcel}
              className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-700 px-6 py-3 text-sm font-bold text-white shadow-lg shadow-emerald-700/20 transition hover:from-emerald-700 hover:to-teal-800 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              {isExporting ? (
                <>
                  <svg className="h-4 w-4 animate-spin text-white" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                  <span>Đang ghi file Excel...</span>
                </>
              ) : (
                <>
                  <span>📥</span>
                  <span>Ghi vào Excel &amp; Tải file về</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* ─── Modal Xem Phóng To Ảnh Phiếu Cân ─────────────────────────────── */}
      {previewImage && (
        <div
          onClick={() => setPreviewImage(null)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-xs"
        >
          <div className="relative max-h-[90vh] max-w-[90vw] overflow-hidden rounded-2xl bg-white p-2 shadow-2xl">
            <button
              type="button"
              onClick={() => setPreviewImage(null)}
              className="absolute top-3 right-3 flex h-8 w-8 items-center justify-center rounded-full bg-black/60 text-white transition hover:bg-black"
            >
              ✕
            </button>
            <img src={previewImage} alt="Phóng to phiếu cân" className="max-h-[85vh] object-contain rounded-xl" />
          </div>
        </div>
      )}
    </div>
  );
}

