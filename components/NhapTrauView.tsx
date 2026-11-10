'use client';

import React, { useState, useRef, useMemo, ChangeEvent } from 'react';
import ExcelJS from 'exceljs';
import {
  ShipmentEntry,
  WorkbookMetadata,
  VehicleType,
  NoteType,
  CustomerSheetMeta,
  ContractInfo,
} from '@/lib/nhap-trau/types';
import {
  UNIT_PRICE_XE,
  UNIT_PRICE_GHE,
  DEFAULT_TEAM,
  NOTE_OPTIONS,
} from '@/lib/nhap-trau/config';
import { readWorkbook } from '@/lib/nhap-trau/excelReader';
import { writeShipments } from '@/lib/nhap-trau/excelWriter';
import { validateBatchEntries, normalizeVehicleName } from '@/lib/nhap-trau/validator';

export default function NhapTrauView() {
  // ─── Step State ─────────────────────────────────────────────────────────────
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3>(1);

  // ─── Workbook & File State ─────────────────────────────────────────────────
  const [excelFile, setExcelFile] = useState<File | null>(null);
  const [rawFileBuffer, setRawFileBuffer] = useState<ArrayBuffer | null>(null);
  const [metadata, setMetadata] = useState<WorkbookMetadata | null>(null);
  const [isReadingFile, setIsReadingFile] = useState<boolean>(false);

  // ─── Batch Quick Settings ──────────────────────────────────────────────────
  const [defaultDate, setDefaultDate] = useState<string>(
    new Date().toISOString().split('T')[0]
  );
  const [defaultTeam, setDefaultTeam] = useState<string>(DEFAULT_TEAM);
  const [defaultType, setDefaultType] = useState<VehicleType>('Xe');
  const [defaultNote, setDefaultNote] = useState<NoteType>('HĐ');

  // ─── Entries State ─────────────────────────────────────────────────────────
  const [entries, setEntries] = useState<ShipmentEntry[]>([
    {
      id: 'entry-1',
      date: new Date().toISOString().split('T')[0],
      team: DEFAULT_TEAM,
      vehicleName: '',
      type: 'Xe',
      weightKg: 0,
      customer: '',
      targetSheetName: '',
      contractRow: undefined,
      note: 'HĐ',
    },
  ]);

  // ─── Processing & Output State ─────────────────────────────────────────────
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // ─── Step 1: Handle Excel Upload & Scan ──────────────────────────────────────
  const handleFileUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.xlsx')) {
      setErrorMessage('Vui lòng chọn file Excel có định dạng .xlsx');
      return;
    }

    setExcelFile(file);
    setIsReadingFile(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const arrayBuffer = await file.arrayBuffer();
      const { metadata: meta } = await readWorkbook(arrayBuffer);
      setRawFileBuffer(arrayBuffer);
      setMetadata(meta);

      // Nếu đã có tab khách hàng đầu tiên, set làm mặc định cho dòng 1 (ưu tiên HĐ cuối cùng đang chạy)
      if (meta.customerSheets.length > 0 && entries.length > 0) {
        const firstSheet =
          meta.customerSheets.find((s) => s.state === 'visible' && s.contracts.length > 0) ||
          meta.customerSheets[0];
        const latestContract =
          firstSheet.contracts.length > 0
            ? firstSheet.contracts[firstSheet.contracts.length - 1]
            : undefined;
        setEntries((prev) =>
          prev.map((row, idx) =>
            idx === 0
              ? {
                  ...row,
                  customer: firstSheet.customerName,
                  targetSheetName: firstSheet.sheetName,
                  contractRow: latestContract?.row,
                }
              : row
          )
        );
      }

      setSuccessMessage(
        `Đã đọc thành công file "${file.name}" với ${meta.totalSheets} sheets. Dòng cuối sổ tổng hiện tại: ${meta.mainSheetLastRow}.`
      );
      setCurrentStep(2);
    } catch (err) {
      console.error('[Excel Read Error]:', err);
      setErrorMessage(
        err instanceof Error ? err.message : 'Không thể đọc cấu trúc file Excel này.'
      );
    } finally {
      setIsReadingFile(false);
    }
  };

  // ─── Step 2: Row Management & Auto Fill ─────────────────────────────────────
  const addNewRow = () => {
    const newId = `entry-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    const lastEntry = entries[entries.length - 1];

    setEntries((prev) => [
      ...prev,
      {
        id: newId,
        date: defaultDate || lastEntry?.date || new Date().toISOString().split('T')[0],
        team: defaultTeam || lastEntry?.team || DEFAULT_TEAM,
        vehicleName: '',
        type: defaultType || lastEntry?.type || 'Xe',
        weightKg: 0,
        customer: lastEntry?.customer || '',
        targetSheetName: lastEntry?.targetSheetName || '',
        contractRow: lastEntry?.contractRow,
        note: defaultNote || lastEntry?.note || 'HĐ',
      },
    ]);
  };

  const removeRow = (index: number) => {
    if (entries.length <= 1) {
      setErrorMessage('Cần ít nhất một dòng dữ liệu.');
      return;
    }
    setEntries((prev) => prev.filter((_, idx) => idx !== index));
  };

  const updateEntryField = <K extends keyof ShipmentEntry>(
    index: number,
    field: K,
    value: ShipmentEntry[K]
  ) => {
    setEntries((prev) => {
      const updated = [...prev];
      const current = { ...updated[index], [field]: value };

      // Nếu đổi khách hàng -> tự động cập nhật tab khách tương ứng
      if (field === 'targetSheetName' && metadata) {
        const targetSheet = metadata.customerSheets.find((s) => s.sheetName === value);
        if (targetSheet) {
          current.customer = targetSheet.customerName;
          if (targetSheet.contracts && targetSheet.contracts.length > 0) {
            current.contractRow = targetSheet.contracts[targetSheet.contracts.length - 1].row;
          } else {
            current.contractRow = undefined;
          }
        }
      }

      updated[index] = current;
      return updated;
    });
  };

  // ─── Quick Apply Defaults ──────────────────────────────────────────────────
  const applyDefaultsToAll = () => {
    setEntries((prev) =>
      prev.map((row) => ({
        ...row,
        date: defaultDate || row.date,
        team: defaultTeam || row.team,
        type: defaultType || row.type,
        note: defaultNote || row.note,
      }))
    );
  };

  // ─── Summary Calculations ──────────────────────────────────────────────────
  const summary = useMemo(() => {
    let totalXeKg = 0;
    let countXe = 0;
    let totalGheKg = 0;
    let countGhe = 0;

    for (const entry of entries) {
      const kg = Number(entry.weightKg) || 0;
      if (entry.type === 'Xe') {
        totalXeKg += kg;
        countXe++;
      } else {
        totalGheKg += kg;
        countGhe++;
      }
    }

    const wageXe = totalXeKg * UNIT_PRICE_XE;
    const wageGhe = totalGheKg * UNIT_PRICE_GHE;
    const totalWage = wageXe + wageGhe;
    const totalKg = totalXeKg + totalGheKg;

    return {
      totalEntries: entries.length,
      countXe,
      totalXeKg,
      wageXe,
      countGhe,
      totalGheKg,
      wageGhe,
      totalKg,
      totalWage,
    };
  }, [entries]);

  // ─── Validation Result ─────────────────────────────────────────────────────
  const validationResult = useMemo(() => {
    if (!metadata) return null;
    return validateBatchEntries(entries, metadata);
  }, [entries, metadata]);

  // ─── Step 3: Write & Download Updated Excel ────────────────────────────────
  const handleExportUpdatedExcel = async () => {
    if (!rawFileBuffer || !metadata) {
      setErrorMessage('Chưa có dữ liệu file Excel hợp lệ. Vui lòng tải lại file Excel.');
      return;
    }

    if (validationResult?.hasErrors) {
      setErrorMessage('Vui lòng sửa các lỗi bắt buộc trước khi lưu file.');
      return;
    }

    setIsExporting(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      // Nạp mới từ buffer gốc để đảm bảo mọi lần xuất đều sạch sẽ, không cộng dồn
      const freshWorkbook = new ExcelJS.Workbook();
      await freshWorkbook.xlsx.load(rawFileBuffer);

      const result = await writeShipments(freshWorkbook, entries, metadata);

      if (result.success && result.updatedBuffer) {
        // Tải file về máy người dùng
        const blob = new Blob([result.updatedBuffer as BlobPart], {
          type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        const nowStr = new Date().toISOString().split('T')[0];
        a.href = url;
        a.download = `BÁO_CÁO_TRẤU_ĐÃ_CẬP_NHẬT_${nowStr}.xlsx`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        setSuccessMessage(
          `🎉 Đã xuất thành công! Đã ghi ${result.insertedMainCount} dòng vào Sổ tổng "Xuat Trấu Cty" và ${result.insertedCustomerCount} dòng vào các tab khách hàng tương ứng.`
        );
      }
    } catch (err) {
      console.error('[Export Error]:', err);
      setErrorMessage(
        err instanceof Error
          ? err.message
          : 'Đã xảy ra lỗi trong quá trình ghi dữ liệu vào file Excel.'
      );
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* ─── Top Header Card ──────────────────────────────────────────────── */}
      <div className="rounded-3xl border border-amber-200/90 bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-orange-500/10 p-6 sm:p-8 backdrop-blur-md shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-tr from-amber-600 to-orange-600 text-3xl text-white shadow-lg shadow-amber-500/25 ring-4 ring-amber-100">
              🚛
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-black text-slate-900 tracking-tight sm:text-3xl">
                  Nhập Phiếu Xuất Trấu
                </h1>
                <span className="rounded-full bg-amber-600 text-white text-[11px] font-bold px-2.5 py-0.5 shadow-2xs">
                  Sổ Tổng &amp; Tab Khách
                </span>
              </div>
              <p className="mt-1 text-sm text-slate-600">
                Nhập phiếu xuất trấu hàng ngày theo Xe (11đ/kg) &amp; Ghe (7đ/kg). App tự động ghi đồng thời vào Sổ tổng và Tab hợp đồng của khách.
              </p>
            </div>
          </div>

          {/* Stepper Pill Indicator */}
          <div className="flex items-center gap-2 bg-white/80 p-1.5 rounded-2xl border border-slate-200/80 shadow-2xs self-start md:self-auto">
            <button
              onClick={() => setCurrentStep(1)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                currentStep === 1
                  ? 'bg-amber-600 text-white shadow-xs'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <span>1</span>
              <span>Chọn File Excel</span>
            </button>
            <span className="text-slate-300">→</span>
            <button
              onClick={() => metadata && setCurrentStep(2)}
              disabled={!metadata}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                currentStep === 2
                  ? 'bg-amber-600 text-white shadow-xs'
                  : metadata
                  ? 'text-slate-600 hover:bg-slate-100'
                  : 'text-slate-300 cursor-not-allowed'
              }`}
            >
              <span>2</span>
              <span>Nhập Phiếu</span>
            </button>
            <span className="text-slate-300">→</span>
            <button
              onClick={() => metadata && setCurrentStep(3)}
              disabled={!metadata}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                currentStep === 3
                  ? 'bg-amber-600 text-white shadow-xs'
                  : metadata
                  ? 'text-slate-600 hover:bg-slate-100'
                  : 'text-slate-300 cursor-not-allowed'
              }`}
            >
              <span>3</span>
              <span>Lưu &amp; Tải Về</span>
            </button>
          </div>
        </div>
      </div>

      {/* ─── Global Notification Banners ──────────────────────────────────── */}
      {errorMessage && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50/95 p-4 text-sm font-semibold text-rose-800 shadow-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span>⚠️</span>
            <span>{errorMessage}</span>
          </div>
          <button
            onClick={() => setErrorMessage(null)}
            className="text-rose-500 hover:text-rose-800 text-xs font-bold px-2 py-1"
          >
            Đóng
          </button>
        </div>
      )}

      {successMessage && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50/95 p-4 text-sm font-semibold text-emerald-800 shadow-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span>✅</span>
            <span>{successMessage}</span>
          </div>
          <button
            onClick={() => setSuccessMessage(null)}
            className="text-emerald-500 hover:text-emerald-800 text-xs font-bold px-2 py-1"
          >
            Đóng
          </button>
        </div>
      )}

      {/* ─── STEP 1: UPLOAD FILE EXCEL GỐC ─────────────────────────────────── */}
      {currentStep === 1 && (
        <div className="rounded-3xl border border-slate-200 bg-white p-6 sm:p-10 shadow-sm space-y-6">
          <div className="text-center max-w-xl mx-auto space-y-2">
            <h2 className="text-xl font-bold text-slate-900">
              Bước 1: Chọn File Excel Báo Cáo Trấu Gốc
            </h2>
            <p className="text-xs text-slate-500">
              File .xlsx chứa sổ tổng <strong>"Xuat Trấu Cty"</strong> và các tab hợp đồng khách hàng. File gốc của bạn sẽ không bao giờ bị ghi đè hay sửa đổi trên máy tính.
            </p>
          </div>

          <div
            onClick={() => fileInputRef.current?.click()}
            className="border-2 border-dashed border-amber-300 hover:border-amber-500 bg-amber-50/40 hover:bg-amber-50/70 rounded-3xl p-8 sm:p-12 text-center cursor-pointer transition-all max-w-2xl mx-auto group"
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx"
              onChange={handleFileUpload}
              className="hidden"
            />
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-white shadow-md text-3xl group-hover:scale-105 transition-transform">
              📊
            </div>
            <h3 className="mt-4 text-base font-bold text-slate-800">
              {excelFile ? excelFile.name : 'Nhấp hoặc Kéo thả file Excel vào đây'}
            </h3>
            <p className="mt-1 text-xs text-slate-500">
              {excelFile
                ? `${(excelFile.size / 1024 / 1024).toFixed(2)} MB • Nhấp để đổi file khác`
                : 'Chỉ hỗ trợ file định dạng .xlsx'}
            </p>
            {isReadingFile && (
              <div className="mt-4 inline-flex items-center gap-2 text-xs font-bold text-amber-700 bg-amber-100 px-4 py-1.5 rounded-full animate-pulse">
                <span>⏳</span>
                <span>Đang phân tích cấu trúc 31 sheets trong file...</span>
              </div>
            )}
          </div>

          {metadata && (
            <div className="max-w-2xl mx-auto bg-slate-50 border border-slate-200/80 rounded-2xl p-5 space-y-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center justify-between">
                <span>Thông tin file đã đọc</span>
                <span className="text-emerald-700 font-bold">Sẵn sàng nhập liệu</span>
              </h4>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
                <div className="bg-white p-3 rounded-xl border border-slate-200">
                  <div className="text-lg font-black text-slate-900">{metadata.totalSheets}</div>
                  <div className="text-[11px] text-slate-500 font-medium">Tổng Sheets</div>
                </div>
                <div className="bg-white p-3 rounded-xl border border-slate-200">
                  <div className="text-lg font-black text-amber-700">{metadata.mainSheetLastRow}</div>
                  <div className="text-[11px] text-slate-500 font-medium">Dòng cuối Sổ Tổng</div>
                </div>
                <div className="bg-white p-3 rounded-xl border border-slate-200">
                  <div className="text-lg font-black text-indigo-700">{metadata.customerSheets.length}</div>
                  <div className="text-[11px] text-slate-500 font-medium">Tab Khách Hàng</div>
                </div>
                <div className="bg-white p-3 rounded-xl border border-slate-200">
                  <div className="text-lg font-black text-emerald-700">
                    {metadata.customerSheets.reduce((sum, s) => sum + s.contracts.length, 0)}
                  </div>
                  <div className="text-[11px] text-slate-500 font-medium">Hợp Đồng Hợp Lệ</div>
                </div>
              </div>

              <div className="pt-2 flex justify-end">
                <button
                  onClick={() => setCurrentStep(2)}
                  className="px-5 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold shadow-md shadow-amber-500/20 cursor-pointer flex items-center gap-1.5"
                >
                  <span>Chuyển sang Bước 2: Nhập Phiếu</span>
                  <span>→</span>
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ─── STEP 2: MULTI-ROW BATCH FORM ─────────────────────────────────── */}
      {currentStep === 2 && (
        <div className="space-y-4">
          {/* Sticky Toolbar */}
          <div className="sticky top-16 z-20 rounded-2xl border border-slate-200 bg-white/95 p-4 shadow-md backdrop-blur-md space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-3 text-xs">
                <div className="flex items-center gap-1.5">
                  <span className="font-bold text-slate-700">Ngày nhanh:</span>
                  <input
                    type="date"
                    value={defaultDate}
                    onChange={(e) => setDefaultDate(e.target.value)}
                    className="rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-800"
                  />
                </div>

                <div className="flex items-center gap-1.5">
                  <span className="font-bold text-slate-700">Đội:</span>
                  <input
                    type="text"
                    value={defaultTeam}
                    onChange={(e) => setDefaultTeam(e.target.value)}
                    className="w-20 rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-800"
                  />
                </div>

                <div className="flex items-center gap-1.5">
                  <span className="font-bold text-slate-700">Loại:</span>
                  <div className="inline-flex rounded-lg border border-slate-300 bg-slate-100 p-0.5">
                    <button
                      type="button"
                      onClick={() => setDefaultType('Xe')}
                      className={`px-2.5 py-0.5 rounded-md text-xs font-bold transition-all ${
                        defaultType === 'Xe' ? 'bg-white text-blue-700 shadow-2xs' : 'text-slate-600'
                      }`}
                    >
                      Xe (11đ)
                    </button>
                    <button
                      type="button"
                      onClick={() => setDefaultType('Ghe')}
                      className={`px-2.5 py-0.5 rounded-md text-xs font-bold transition-all ${
                        defaultType === 'Ghe' ? 'bg-white text-emerald-700 shadow-2xs' : 'text-slate-600'
                      }`}
                    >
                      Ghe (7đ)
                    </button>
                  </div>
                </div>

                <div className="flex items-center gap-1.5">
                  <span className="font-bold text-slate-700">Ghi chú:</span>
                  <select
                    value={defaultNote}
                    onChange={(e) => setDefaultNote(e.target.value as NoteType)}
                    className="rounded-lg border border-slate-300 px-2 py-1 text-xs font-medium text-slate-800"
                  >
                    {NOTE_OPTIONS.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                </div>

                <button
                  type="button"
                  onClick={applyDefaultsToAll}
                  className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-[11px] cursor-pointer"
                  title="Áp dụng ngày, đội, loại và ghi chú nhanh cho tất cả các dòng bên dưới"
                >
                  Áp dụng tất cả
                </button>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={addNewRow}
                  className="px-3.5 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs shadow-xs cursor-pointer flex items-center gap-1"
                >
                  <span>+</span>
                  <span>Thêm Dòng</span>
                </button>
                <button
                  type="button"
                  onClick={() => setCurrentStep(3)}
                  className="px-4 py-1.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-bold text-xs shadow-md shadow-emerald-600/20 cursor-pointer flex items-center gap-1.5"
                >
                  <span>Xem Lại &amp; Lưu</span>
                  <span>→</span>
                </button>
              </div>
            </div>
          </div>

          {/* Table Container */}
          <div className="overflow-x-auto rounded-3xl border border-slate-200 bg-white shadow-sm">
            <table className="w-full text-left text-xs text-slate-700">
              <thead className="bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-600 border-b border-slate-200">
                <tr>
                  <th className="py-3 px-3 w-12 text-center">STT</th>
                  <th className="py-3 px-3 w-32">Ngày</th>
                  <th className="py-3 px-3 w-20">Đội</th>
                  <th className="py-3 px-3 w-28">Loại</th>
                  <th className="py-3 px-3 w-40">Biển Số / Tên Ghe</th>
                  <th className="py-3 px-3 w-32 text-right">Số Lượng (kg)</th>
                  <th className="py-3 px-3 w-48">Tab Khách Hàng</th>
                  <th className="py-3 px-3 w-48">Hợp Đồng</th>
                  <th className="py-3 px-3 w-28">Ghi Chú</th>
                  <th className="py-3 px-2 w-10 text-center"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {entries.map((entry, index) => {
                  const isXe = entry.type === 'Xe';
                  const selectedSheet = metadata?.customerSheets.find(
                    (s) => s.sheetName === entry.targetSheetName
                  );
                  const selectedContract = selectedSheet?.contracts.find(
                    (c) => c.row === entry.contractRow
                  );

                  return (
                    <tr
                      key={entry.id}
                      className="hover:bg-amber-50/40 transition-colors"
                    >
                      {/* STT */}
                      <td className="py-2 px-3 text-center font-bold text-slate-400">
                        {index + 1}
                      </td>

                      {/* Ngày */}
                      <td className="py-2 px-2">
                        <input
                          type="date"
                          value={entry.date}
                          onChange={(e) => updateEntryField(index, 'date', e.target.value)}
                          className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs text-slate-900 focus:border-amber-500 focus:outline-none"
                        />
                      </td>

                      {/* Đội */}
                      <td className="py-2 px-2">
                        <input
                          type="text"
                          value={entry.team}
                          onChange={(e) => updateEntryField(index, 'team', e.target.value)}
                          className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs font-semibold text-slate-900 focus:border-amber-500 focus:outline-none uppercase"
                        />
                      </td>

                      {/* Loại (Xe / Ghe) */}
                      <td className="py-2 px-2">
                        <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5">
                          <button
                            type="button"
                            onClick={() => updateEntryField(index, 'type', 'Xe')}
                            className={`px-2 py-1 rounded text-[11px] font-bold cursor-pointer transition-all ${
                              isXe
                                ? 'bg-blue-600 text-white shadow-2xs'
                                : 'text-slate-600 hover:text-slate-900'
                            }`}
                          >
                            Xe (11đ)
                          </button>
                          <button
                            type="button"
                            onClick={() => updateEntryField(index, 'type', 'Ghe')}
                            className={`px-2 py-1 rounded text-[11px] font-bold cursor-pointer transition-all ${
                              !isXe
                                ? 'bg-emerald-600 text-white shadow-2xs'
                                : 'text-slate-600 hover:text-slate-900'
                            }`}
                          >
                            Ghe (7đ)
                          </button>
                        </div>
                      </td>

                      {/* Tên Phương Tiện */}
                      <td className="py-2 px-2">
                        <input
                          type="text"
                          placeholder={isXe ? 'VD: 63H-02309' : 'VD: Ghe Được Phường'}
                          value={entry.vehicleName}
                          onChange={(e) => updateEntryField(index, 'vehicleName', e.target.value)}
                          className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-bold text-slate-900 focus:border-amber-500 focus:outline-none"
                        />
                      </td>

                      {/* Số Lượng (kg) */}
                      <td className="py-2 px-2 text-right">
                        <input
                          type="number"
                          step="10"
                          min="0"
                          placeholder="0"
                          value={entry.weightKg || ''}
                          onChange={(e) =>
                            updateEntryField(index, 'weightKg', parseFloat(e.target.value) || 0)
                          }
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              addNewRow();
                            }
                          }}
                          className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-black text-right text-slate-900 focus:border-amber-500 focus:outline-none"
                        />
                      </td>

                      {/* Tab Khách Hàng */}
                      <td className="py-2 px-2">
                        <select
                          value={entry.targetSheetName}
                          onChange={(e) => updateEntryField(index, 'targetSheetName', e.target.value)}
                          className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs font-semibold text-slate-800 focus:border-amber-500 focus:outline-none"
                        >
                          <option value="">-- Chọn Tab Khách --</option>
                          {metadata?.customerSheets.map((sheet) => (
                            <option key={sheet.sheetName} value={sheet.sheetName}>
                              {sheet.sheetName} ({sheet.contracts.length} HĐ)
                            </option>
                          ))}
                        </select>
                      </td>

                      {/* Hợp Đồng */}
                      <td className="py-2 px-2">
                        <select
                          value={entry.contractRow || ''}
                          disabled={!selectedSheet || selectedSheet.contracts.length === 0}
                          onChange={(e) =>
                            updateEntryField(
                              index,
                              'contractRow',
                              e.target.value ? parseInt(e.target.value, 10) : undefined
                            )
                          }
                          className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs text-slate-800 focus:border-amber-500 focus:outline-none disabled:opacity-50"
                        >
                          <option value="">-- Chọn Hợp Đồng --</option>
                          {selectedSheet?.contracts.map((c) => (
                            <option key={c.row} value={c.row}>
                              {c.label} {c.remainingKg ? `(Tồn: ${c.remainingKg.toLocaleString()}kg)` : ''}
                            </option>
                          ))}
                        </select>
                      </td>

                      {/* Ghi Chú */}
                      <td className="py-2 px-2">
                        <select
                          value={entry.note}
                          onChange={(e) => updateEntryField(index, 'note', e.target.value as NoteType)}
                          className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs text-slate-800 focus:border-amber-500 focus:outline-none"
                        >
                          {NOTE_OPTIONS.map((opt) => (
                            <option key={opt} value={opt}>
                              {opt}
                            </option>
                          ))}
                        </select>
                      </td>

                      {/* Nút Xóa Dòng */}
                      <td className="py-2 px-2 text-center">
                        <button
                          type="button"
                          onClick={() => removeRow(index)}
                          className="text-slate-400 hover:text-rose-600 font-bold text-sm px-1.5 py-0.5 rounded cursor-pointer"
                          title="Xóa dòng này"
                        >
                          ✕
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>

              {/* Table Footer: Running Totals */}
              <tfoot className="bg-slate-50/90 font-bold text-slate-800 border-t-2 border-slate-200">
                <tr>
                  <td colSpan={3} className="py-3 px-3 text-xs">
                    Tổng cộng: <strong>{summary.totalEntries} phiếu</strong>
                  </td>
                  <td colSpan={2} className="py-3 px-2 text-xs">
                    Xe: {summary.countXe} chuyến ({summary.totalXeKg.toLocaleString()} kg) • Ghe: {summary.countGhe} chuyến ({summary.totalGheKg.toLocaleString()} kg)
                  </td>
                  <td className="py-3 px-3 text-right text-xs font-black text-amber-900">
                    {summary.totalKg.toLocaleString()} kg
                  </td>
                  <td colSpan={4} className="py-3 px-3 text-right text-xs font-black text-emerald-800">
                    Tiền công: {summary.totalWage.toLocaleString()} đ
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* ─── STEP 3: REVIEW, WARNINGS & DOWNLOAD ──────────────────────────── */}
      {currentStep === 3 && (
        <div className="rounded-3xl border border-slate-200 bg-white p-6 sm:p-10 shadow-sm space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-5">
            <div>
              <h2 className="text-xl font-bold text-slate-900">
                Bước 3: Kiểm Tra Lại Dữ Liệu &amp; Tải File Excel Mới
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Rà soát các cảnh báo trước khi xuất file. Hệ thống sẽ ghi đồng thời vào Sổ tổng và các tab khách hàng tương ứng.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setCurrentStep(2)}
              className="px-3.5 py-1.5 rounded-xl border border-slate-300 text-slate-700 text-xs font-bold hover:bg-slate-50 cursor-pointer self-start sm:self-auto"
            >
              ← Quay Lại Sửa Dữ Liệu
            </button>
          </div>

          {/* Validation Warnings List */}
          {validationResult && validationResult.totalWarnings > 0 && (
            <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-4 space-y-2">
              <h4 className="text-xs font-bold text-amber-900 uppercase tracking-wider flex items-center gap-1.5">
                <span>⚠️</span>
                <span>Phát hiện {validationResult.totalWarnings} cảnh báo (Không chặn xuất file):</span>
              </h4>
              <ul className="list-disc list-inside text-xs text-amber-800 space-y-1">
                {validationResult.entriesValidation.flatMap((ev) =>
                  ev.result.warnings.map((w, wIdx) => (
                    <li key={`${ev.index}-${wIdx}`}>
                      <strong>Phiếu #{ev.index + 1}:</strong> {w.message}
                    </li>
                  ))
                )}
              </ul>
            </div>
          )}

          {/* Validation Errors List */}
          {validationResult && validationResult.hasErrors && (
            <div className="rounded-2xl border border-rose-200 bg-rose-50/90 p-4 space-y-2">
              <h4 className="text-xs font-bold text-rose-900 uppercase tracking-wider flex items-center gap-1.5">
                <span>⛔</span>
                <span>Các lỗi bắt buộc cần sửa trước khi xuất:</span>
              </h4>
              <ul className="list-disc list-inside text-xs text-rose-800 space-y-1">
                {validationResult.entriesValidation.flatMap((ev) =>
                  ev.result.errors.map((e, eIdx) => (
                    <li key={`${ev.index}-${eIdx}`}>
                      <strong>Phiếu #{ev.index + 1}:</strong> {e.message}
                    </li>
                  ))
                )}
              </ul>
            </div>
          )}

          {/* Summary KPI Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200/80">
              <div className="text-xs text-slate-500 font-semibold">Tổng chuyến trấu</div>
              <div className="text-2xl font-black text-slate-900 mt-1">{summary.totalEntries}</div>
              <div className="text-[11px] text-slate-400 mt-0.5">
                {summary.countXe} Xe • {summary.countGhe} Ghe
              </div>
            </div>

            <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200/80">
              <div className="text-xs text-slate-500 font-semibold">Khối lượng Xe (11đ)</div>
              <div className="text-2xl font-black text-blue-700 mt-1">
                {summary.totalXeKg.toLocaleString()} <span className="text-sm font-bold text-slate-500">kg</span>
              </div>
              <div className="text-[11px] text-blue-600 font-semibold mt-0.5">
                = {summary.wageXe.toLocaleString()} đ
              </div>
            </div>

            <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200/80">
              <div className="text-xs text-slate-500 font-semibold">Khối lượng Ghe (7đ)</div>
              <div className="text-2xl font-black text-emerald-700 mt-1">
                {summary.totalGheKg.toLocaleString()} <span className="text-sm font-bold text-slate-500">kg</span>
              </div>
              <div className="text-[11px] text-emerald-600 font-semibold mt-0.5">
                = {summary.wageGhe.toLocaleString()} đ
              </div>
            </div>

            <div className="bg-gradient-to-tr from-amber-50 to-orange-50 rounded-2xl p-4 border border-amber-200">
              <div className="text-xs text-amber-800 font-semibold">Tổng Tiền Công</div>
              <div className="text-2xl font-black text-amber-900 mt-1">
                {summary.totalWage.toLocaleString()} <span className="text-sm font-bold text-amber-700">đ</span>
              </div>
              <div className="text-[11px] text-amber-700 font-semibold mt-0.5">
                Tổng cộng {summary.totalKg.toLocaleString()} kg
              </div>
            </div>
          </div>

          {/* Preview Destination Table */}
          {metadata && entries.length > 0 && (
            <div className="overflow-x-auto rounded-2xl border border-slate-200">
              <div className="bg-slate-50 px-4 py-2.5 border-b border-slate-200 flex items-center justify-between">
                <span className="text-xs font-bold text-slate-700">
                  📍 Xem trước vị trí sẽ điền đồng thời vào Sổ tổng &amp; Tab con của khách hàng:
                </span>
                <span className="text-[11px] font-semibold text-emerald-700">
                  Sổ tổng bắt đầu từ dòng {metadata.mainSheetLastRow + 1} (Ngay trước hộp báo cáo)
                </span>
              </div>
              <table className="w-full text-left text-xs text-slate-700">
                <thead className="bg-slate-50/60 text-[11px] font-bold text-slate-500 border-b border-slate-200">
                  <tr>
                    <th className="py-2 px-3">#</th>
                    <th className="py-2 px-3">Ngày</th>
                    <th className="py-2 px-3">Phương Tiện &amp; Loại</th>
                    <th className="py-2 px-3 text-right">Số Lượng (kg)</th>
                    <th className="py-2 px-3">Ghi vào Sổ Tổng</th>
                    <th className="py-2 px-3">Ghi vào Tab Con Khách Hàng</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {entries.map((entry, idx) => {
                    const sheetMeta = metadata.customerSheets.find(
                      (s) => s.sheetName === entry.targetSheetName
                    );
                    const contractMeta = sheetMeta?.contracts.find(
                      (c) => c.row === entry.contractRow
                    );
                    // Tính xem có mấy phiếu trước đó cùng vào 1 HĐ để preview chính xác số dòng
                    const prevSameContractCount = entries
                      .slice(0, idx)
                      .filter(
                        (e) =>
                          e.targetSheetName === entry.targetSheetName &&
                          e.contractRow === entry.contractRow
                      ).length;
                    const baseRowInTab = contractMeta
                      ? contractMeta.lastUsedRow !== undefined &&
                        contractMeta.lastUsedRow >= contractMeta.dataRowStart
                        ? contractMeta.lastUsedRow + 1
                        : contractMeta.dataRowStart
                      : null;
                    const targetTabRow =
                      baseRowInTab !== null ? baseRowInTab + prevSameContractCount : null;

                    return (
                      <tr key={entry.id} className="hover:bg-slate-50/70">
                        <td className="py-2 px-3 font-bold text-slate-400">{idx + 1}</td>
                        <td className="py-2 px-3 font-medium">{entry.date}</td>
                        <td className="py-2 px-3">
                          <span className="font-bold text-slate-900">{entry.vehicleName}</span>{' '}
                          <span className="text-[11px] text-slate-500">({entry.type})</span>
                        </td>
                        <td className="py-2 px-3 text-right font-black text-slate-900">
                          {entry.weightKg.toLocaleString()} kg
                        </td>
                        <td className="py-2 px-3">
                          <span className="inline-flex items-center gap-1 rounded-md bg-blue-50 px-2 py-0.5 text-[11px] font-bold text-blue-800 border border-blue-200">
                            Dòng {metadata.mainSheetLastRow + 1 + idx}
                          </span>{' '}
                          <span className="text-[11px] text-slate-500">
                            ({sheetMeta?.mainCustomerName || entry.customer})
                          </span>
                        </td>
                        <td className="py-2 px-3">
                          {entry.targetSheetName ? (
                            <div>
                              <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-800 border border-emerald-200">
                                {entry.targetSheetName}
                                {targetTabRow ? ` • Dòng ${targetTabRow}` : ''}
                              </span>
                              {contractMeta && (
                                <div className="text-[10px] text-slate-400 mt-0.5">
                                  {contractMeta.label}
                                </div>
                              )}
                            </div>
                          ) : (
                            <span className="text-rose-600 text-[11px] font-bold">Chưa chọn Tab</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Export Action Card */}
          <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-6 text-center space-y-4">
            <div className="max-w-md mx-auto space-y-1">
              <h3 className="text-base font-bold text-slate-900">
                Sẵn sàng cập nhật vào file Excel
              </h3>
              <p className="text-xs text-slate-500">
                Hệ thống sẽ giữ nguyên vẹn 100% công thức, format, sheet ẩn, và tự động mở rộng vùng SUM của từng hợp đồng.
              </p>
            </div>

            <button
              type="button"
              disabled={isExporting || Boolean(validationResult?.hasErrors)}
              onClick={handleExportUpdatedExcel}
              className="inline-flex items-center justify-center gap-2 px-8 py-4 rounded-2xl bg-gradient-to-r from-amber-600 via-orange-600 to-amber-700 hover:opacity-95 text-white font-black text-base shadow-lg shadow-amber-600/25 transition-all active:scale-[0.99] disabled:opacity-50 disabled:shadow-none cursor-pointer"
            >
              {isExporting ? (
                <>
                  <svg className="h-5 w-5 animate-spin text-white" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                  </svg>
                  <span>Đang xử lý &amp; ghi file Excel...</span>
                </>
              ) : (
                <>
                  <span>📥</span>
                  <span>LƯU TẤT CẢ &amp; TẢI FILE EXCEL ĐÃ CẬP NHẬT</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

