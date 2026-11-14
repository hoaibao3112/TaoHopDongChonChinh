'use client';

/**
 * RiceXuatNSXTMView — Quản lý & Tính Lương Xuống Lúa / Xuất Lúa NSX Tân Mỹ (Đội Nam)
 * Chuẩn mẫu theo: LƯƠNG_ĐỘI_NAM-XUẤT_NSX_ĐTM_T10_2026_IN_CHUANMAU.xlsx
 *
 * Tính năng chính:
 * 1. Phân loại đơn giá tự động theo giống lúa:
 *    - Japonica / DS1: Xuất Có Trở 17.000 đ/tấn, Chụm lò 8.000 đ/tấn
 *    - Nếp / Nếp CPC: Xuất Không Trở 11.000 đ/tấn, Chụm lò 11.000 đ/tấn
 *    - Các loại lúa khác: Xuất Không Trở 11.000 đ/tấn, Chụm lò 8.000 đ/tấn
 *    - Vô bồn: 3.000 đ/tấn
 * 2. Bảng tổng hợp KPI (Sheet 2) thời gian thực: Tấn có trở, không trở, chụm lúa, chụm nếp, vô bồn, tổng tiền, tạm ứng, còn lại.
 * 3. Chỉnh sửa số tấn trực tiếp trên từng dòng, tự động tính lại toàn bộ thành tiền.
 * 4. Thêm mẻ thủ công, xóa mẻ, tìm kiếm theo tên khách hàng / loại lúa / số HĐ.
 * 5. Lưu trữ liên tục vào localStorage để không bao giờ mất dữ liệu.
 * 6. Xuất file Excel chuẩn 2 Sheet có công thức SUBTOTAL và SUM chính xác.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { XuatNSXTMEntry, XuatNSXTMSummary, XuatNSXTMExportPayload } from '@/lib/rice-payroll/xuat-nsx-tm-types';
import {
  calculateXuatNSXTMRow,
  calculateXuatNSXTMTotal,
  isJaponica,
  isNep,
} from '@/lib/rice-payroll/xuat-nsx-tm-parser';
import sampleOctoberDataRaw from '@/lib/rice-payroll/sample-october-xuat-nsx-tm.json';

const sampleOctoberData: XuatNSXTMEntry[] = sampleOctoberDataRaw as XuatNSXTMEntry[];

function formatMoney(num: number): string {
  if (!num || isNaN(num)) return '0';
  return Math.round(num).toLocaleString('vi-VN');
}

function extractMonthKey(dateStr?: string): string {
  if (!dateStr) return '';
  const parts = dateStr.trim().split('/');
  if (parts.length === 3) {
    return `${parts[1].padStart(2, '0')}/${parts[2]}`;
  }
  return '';
}

export default function RiceXuatNSXTMView() {
  // ─── State Dữ liệu & Tháng chọn ───────────────────────────────────────────
  const [allEntries, setAllEntries] = useState<XuatNSXTMEntry[]>([]);
  const [selectedMonthKey, setSelectedMonthKey] = useState<string>('10/2026');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [filterType, setFilterType] = useState<'ALL' | 'JAPONICA' | 'NEP' | 'OTHER'>('ALL');

  // Cấu hình người ký & Tạm ứng
  const [nguoiLapBang, setNguoiLapBang] = useState<string>('Võ Hoàng Cẩm Tiên');
  const [nguoiXacNhan, setNguoiXacNhan] = useState<string>('Huỳnh Anh Phát Thịnh');
  const [tamUng, setTamUng] = useState<number>(0);
  const [showConfigModal, setShowConfigModal] = useState<boolean>(false);

  // Trạng thái File & Upload
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isParsing, setIsParsing] = useState<boolean>(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [loadedFileName, setLoadedFileName] = useState<string>('');

  // Trạng thái Xuất Excel
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [exportError, setExportError] = useState<string | null>(null);

  // Form Thêm mẻ thủ công
  const [showAddModal, setShowAddModal] = useState<boolean>(false);
  const [manualSoHD, setManualSoHD] = useState<string>('');
  const [manualNgayXuong, setManualNgayXuong] = useState<string>('01/10/2026');
  const [manualKhachHang, setManualKhachHang] = useState<string>('');
  const [manualLoaiLua, setManualLoaiLua] = useState<string>('NẾP CPC');
  const [manualKg, setManualKg] = useState<string>('');
  const [manualTan, setManualTan] = useState<string>('');
  const [manualPhuongTien, setManualPhuongTien] = useState<string>('VÔ BỒN');
  const [manualGhiChu, setManualGhiChu] = useState<string>('');

  // Toast thông báo
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  // ─── Khởi tạo từ localStorage hoặc Sample Data ───────────────────────────
  useEffect(() => {
    try {
      const saved = localStorage.getItem('xuat_nsx_tm_entries');
      if (saved) {
        const parsed: XuatNSXTMEntry[] = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setAllEntries(parsed);
          setLoadedFileName('Đã khôi phục phiên làm việc trước');
          return;
        }
      }
      // Nếu chưa có, nạp dữ liệu mẫu Tháng 10/2026
      setAllEntries(sampleOctoberData);
      setLoadedFileName('Mẫu chuẩn Đội Nam Tháng 10/2026 (32 mẻ)');
    } catch (e) {
      console.warn('Lỗi đọc localStorage:', e);
      setAllEntries(sampleOctoberData);
    }
  }, []);

  // Tự động lưu vào localStorage mỗi khi allEntries thay đổi
  const saveToLocalStorage = useCallback((entries: XuatNSXTMEntry[]) => {
    try {
      localStorage.setItem('xuat_nsx_tm_entries', JSON.stringify(entries));
    } catch (e) {
      console.warn('Không thể lưu localStorage:', e);
    }
  }, []);

  // ─── Lọc danh sách tháng có sẵn ───────────────────────────────────────────
  const availableMonths = useMemo(() => {
    const set = new Set<string>();
    allEntries.forEach((entry) => {
      const m =
        extractMonthKey(entry.ngayXuongLuaKho) ||
        extractMonthKey(entry.ngayNhapSay) ||
        extractMonthKey(entry.ngayCan);
      if (m) set.add(m);
    });
    // Đảm bảo luôn có 10/2026
    set.add('10/2026');
    const sorted = Array.from(set).sort((a, b) => {
      const [m1, y1] = a.split('/').map(Number);
      const [m2, y2] = b.split('/').map(Number);
      return y2 !== y1 ? y2 - y1 : m2 - m1;
    });
    return sorted;
  }, [allEntries]);

  // ─── Lọc dữ liệu theo tháng và từ khóa tìm kiếm ───────────────────────────
  const filteredEntries = useMemo(() => {
    return allEntries.filter((entry) => {
      // Lọc theo tháng
      if (selectedMonthKey !== 'ALL') {
        const entryMonth =
          extractMonthKey(entry.ngayXuongLuaKho) ||
          extractMonthKey(entry.ngayNhapSay) ||
          extractMonthKey(entry.ngayCan);
        if (entryMonth !== selectedMonthKey) return false;
      }

      // Lọc theo phân loại lúa
      if (filterType === 'JAPONICA' && !isJaponica(entry.loaiLua)) return false;
      if (filterType === 'NEP' && !isNep(entry.loaiLua)) return false;
      if (filterType === 'OTHER' && (isJaponica(entry.loaiLua) || isNep(entry.loaiLua))) return false;

      // Lọc theo từ khóa tìm kiếm
      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase();
        const matchCustomer = entry.khachHang.toLowerCase().includes(q);
        const matchRice = entry.loaiLua.toLowerCase().includes(q);
        const matchHD = (entry.soHD || '').toLowerCase().includes(q);
        const matchDate = (entry.ngayXuongLuaKho || '').toLowerCase().includes(q);
        if (!matchCustomer && !matchRice && !matchHD && !matchDate) return false;
      }

      return true;
    });
  }, [allEntries, selectedMonthKey, filterType, searchTerm]);

  // ─── Tính toán KPI Tổng hợp Khớp Sheet 2 ──────────────────────────────────
  const summary: XuatNSXTMSummary = useMemo(() => {
    return calculateXuatNSXTMTotal(filteredEntries, selectedMonthKey, tamUng);
  }, [filteredEntries, selectedMonthKey, tamUng]);

  // ─── Nạp lại Mẫu Chuẩn Tháng 10/2026 ──────────────────────────────────────
  const handleReloadSampleData = () => {
    if (confirm('Khôi phục lại dữ liệu mẫu Tháng 10/2026 (32 mẻ, 1.589 tấn, 38.183.000 đ)? Dữ liệu chỉnh sửa sẽ được đặt lại theo file mẫu công ty.')) {
      setAllEntries(sampleOctoberData);
      setSelectedMonthKey('10/2026');
      setLoadedFileName('Mẫu chuẩn Đội Nam Tháng 10/2026 (32 mẻ)');
      saveToLocalStorage(sampleOctoberData);
      showToast('Đã khôi phục dữ liệu mẫu Tháng 10/2026 chuẩn 100%!');
    }
  };

  // ─── Xử lý Tải File Excel lên ─────────────────────────────────────────────
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsParsing(true);
    setParseError(null);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch('/api/rice-payroll/xuat-nsx-tm-parse', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Lỗi khi phân tích file Excel');
      }

      if (!data.entries || data.entries.length === 0) {
        throw new Error('Không tìm thấy dữ liệu xuất lúa NSX TM hợp lệ trong file');
      }

      setAllEntries(data.entries);
      setLoadedFileName(file.name);
      saveToLocalStorage(data.entries);

      // Tự động chuyển về tháng đầu tiên tìm thấy
      const firstMonth =
        extractMonthKey(data.entries[0]?.ngayXuongLuaKho) ||
        extractMonthKey(data.entries[0]?.ngayNhapSay) ||
        '10/2026';
      setSelectedMonthKey(firstMonth);

      showToast(`Tải file thành công! Đã trích xuất ${data.entries.length} mẻ xuất lúa NSX TM.`);
    } catch (err: any) {
      console.error(err);
      setParseError(err.message || 'Lỗi đọc file Excel');
    } finally {
      setIsParsing(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // ─── Cập nhật nhanh trực tiếp trên dòng ──────────────────────────────────
  const handleUpdateEntry = (id: string, field: keyof XuatNSXTMEntry, value: any) => {
    setAllEntries((prev) => {
      const updated = prev.map((item) => {
        if (item.id !== id) return item;

        const updatedItem = { ...item, [field]: value };

        // Nếu sửa số tấn hoặc loại lúa, tính lại toàn bộ đơn giá và thành tiền
        if (field === 'soLuongTan' || field === 'loaiLua' || field === 'canNhapSayKg') {
          return calculateXuatNSXTMRow(updatedItem);
        }

        return updatedItem;
      });

      saveToLocalStorage(updated);
      return updated;
    });
  };

  // ─── Xóa một dòng ────────────────────────────────────────────────────────
  const handleDeleteEntry = (id: string) => {
    if (confirm('Bạn có chắc muốn xóa mẻ xuất lúa này?')) {
      setAllEntries((prev) => {
        const next = prev.filter((item) => item.id !== id);
        saveToLocalStorage(next);
        return next;
      });
      showToast('Đã xóa mẻ thành công');
    }
  };

  // ─── Thêm mẻ thủ công ────────────────────────────────────────────────────
  const handleAddManualEntry = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualKhachHang.trim()) {
      alert('Vui lòng nhập tên khách hàng');
      return;
    }

    const kg = parseFloat(manualKg) || 0;
    const tan = manualTan ? parseFloat(manualTan) : Math.round(kg / 1000);

    const newEntry = calculateXuatNSXTMRow({
      id: `manual-tm-${Date.now()}`,
      soHD: manualSoHD.trim(),
      ngayCan: manualNgayXuong,
      khachHang: manualKhachHang.trim(),
      loaiLua: manualLoaiLua.trim(),
      canNhapSayKg: kg,
      ngayXuongLuaKho: manualNgayXuong,
      phuongTienChoLuaKho: manualPhuongTien || 'VÔ BỒN',
      soLuongTan: tan,
      ghiChu: manualGhiChu.trim(),
    });

    setAllEntries((prev) => {
      const next = [newEntry, ...prev];
      saveToLocalStorage(next);
      return next;
    });

    setShowAddModal(false);
    // Reset form
    setManualKhachHang('');
    setManualKg('');
    setManualTan('');
    setManualGhiChu('');
    showToast('Đã thêm mẻ xuống lúa mới vào bảng kê!');
  };

  // ─── Xuất File Excel ─────────────────────────────────────────────────────
  const handleExportExcel = async () => {
    if (filteredEntries.length === 0) {
      alert('Không có dữ liệu trong tháng này để xuất file');
      return;
    }

    setIsExporting(true);
    setExportError(null);

    const payload: XuatNSXTMExportPayload = {
      monthKey: selectedMonthKey === 'ALL' ? '10/2026' : selectedMonthKey,
      entries: filteredEntries,
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
        throw new Error(data.error || 'Lỗi máy chủ khi tạo file Excel');
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const [m, y] = (selectedMonthKey === 'ALL' ? '10/2026' : selectedMonthKey).split('/');
      a.download = `LUONG_DOI_NAM-XUAT_NSX_DTM_T${m.padStart(2, '0')}_${y}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);

      showToast('Đã tải xuống file Excel chuẩn 2 Sheet thành công!');
    } catch (err: any) {
      console.error(err);
      setExportError(err.message || 'Lỗi xuất file Excel');
    } finally {
      setIsExporting(false);
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

      {/* ─── Hero Banner & Toolbar ─────────────────────────────────────────── */}
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
              <strong>Nếp / Lúa thường (11k)</strong>, <strong>Chụm lò (8k - 11k)</strong> và <strong>Vô bồn (3k)</strong>{' '}
              theo đúng biểu mẫu chuẩn của Công ty.
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
              disabled={isParsing}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 shadow-2xs hover:bg-slate-50 transition active:scale-95 cursor-pointer disabled:opacity-50"
            >
              <span>📁</span>
              <span>{isParsing ? 'Đang đọc...' : 'Tải File Excel'}</span>
            </button>

            <button
              type="button"
              onClick={handleReloadSampleData}
              className="inline-flex items-center gap-1.5 rounded-xl border border-blue-200 bg-blue-50/70 px-3.5 py-2 text-xs font-bold text-blue-700 hover:bg-blue-100 transition active:scale-95 cursor-pointer"
              title="Khôi phục nguyên bản 32 mẻ Tháng 10/2026 từ file chuẩn mẫu công ty"
            >
              <span>⚡</span>
              <span>Nạp Mẫu T10/2026</span>
            </button>

            <button
              type="button"
              onClick={() => setShowAddModal(true)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-300 bg-emerald-50 px-3.5 py-2 text-xs font-bold text-emerald-800 hover:bg-emerald-100 transition active:scale-95 cursor-pointer"
            >
              <span>➕</span>
              <span>Thêm Mẻ Xuất</span>
            </button>

            <button
              type="button"
              onClick={() => setShowConfigModal(true)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 transition active:scale-95 cursor-pointer"
              title="Người lập bảng, duyệt ký và tạm ứng"
            >
              <span>⚙️</span>
              <span>Chữ Ký & Tạm Ứng</span>
            </button>

            <button
              type="button"
              onClick={handleExportExcel}
              disabled={isExporting || filteredEntries.length === 0}
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 px-4 py-2 text-xs font-bold text-white shadow-md hover:from-emerald-700 hover:to-teal-700 transition active:scale-95 cursor-pointer disabled:opacity-50"
            >
              <span>📥</span>
              <span>{isExporting ? 'Đang xuất...' : 'Xuất File Excel (2 Sheet)'}</span>
            </button>
          </div>
        </div>

        {/* Nguồn file & Cảnh báo lỗi */}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3 text-xs text-slate-500">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-slate-700">Nguồn dữ liệu:</span>
            <span className="rounded-md bg-slate-100 px-2 py-0.5 font-mono text-[11px] text-slate-700 border border-slate-200">
              {loadedFileName || 'Chưa tải file'}
            </span>
            <span className="text-slate-400">• Tổng cộng: {allEntries.length} mẻ trong bộ nhớ</span>
          </div>

          <div className="flex items-center gap-3">
            <Link
              href="/nhap-say-tm"
              className="text-xs font-bold text-emerald-700 hover:text-emerald-900 underline flex items-center gap-1"
            >
              <span>🌾 Xem Tab Nhập Sấy NSX TM (Đội Đức & Quý) →</span>
            </Link>
          </div>
        </div>

        {parseError && (
          <div className="mt-3 rounded-xl bg-rose-50 p-3 text-xs font-medium text-rose-700 border border-rose-200">
            ⚠️ {parseError}
          </div>
        )}
        {exportError && (
          <div className="mt-3 rounded-xl bg-rose-50 p-3 text-xs font-medium text-rose-700 border border-rose-200">
            ⚠️ {exportError}
          </div>
        )}
      </div>

      {/* ─── Bộ Lọc Tháng & Phân Loại Lúa ──────────────────────────────────── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between rounded-2xl bg-white p-3.5 border border-slate-200 shadow-2xs">
        {/* Month Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
          <span className="text-xs font-bold text-slate-500 px-2">Tháng:</span>
          {availableMonths.map((mKey) => (
            <button
              key={mKey}
              type="button"
              onClick={() => setSelectedMonthKey(mKey)}
              className={`rounded-xl px-3 py-1.5 text-xs font-bold transition cursor-pointer ${
                selectedMonthKey === mKey
                  ? 'bg-amber-600 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              Tháng {mKey}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setSelectedMonthKey('ALL')}
            className={`rounded-xl px-3 py-1.5 text-xs font-bold transition cursor-pointer ${
              selectedMonthKey === 'ALL'
                ? 'bg-slate-900 text-white shadow-xs'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            Tất cả các tháng
          </button>
        </div>

        {/* Search & Rice Category filter */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Lọc loại lúa */}
          <div className="flex items-center rounded-xl bg-slate-100 p-0.5 border border-slate-200 text-xs">
            <button
              type="button"
              onClick={() => setFilterType('ALL')}
              className={`rounded-lg px-2.5 py-1 font-bold cursor-pointer ${
                filterType === 'ALL' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600'
              }`}
            >
              Tất cả
            </button>
            <button
              type="button"
              onClick={() => setFilterType('JAPONICA')}
              className={`rounded-lg px-2.5 py-1 font-bold cursor-pointer ${
                filterType === 'JAPONICA' ? 'bg-blue-600 text-white shadow-2xs' : 'text-slate-600'
              }`}
            >
              Japonica (17k)
            </button>
            <button
              type="button"
              onClick={() => setFilterType('NEP')}
              className={`rounded-lg px-2.5 py-1 font-bold cursor-pointer ${
                filterType === 'NEP' ? 'bg-amber-600 text-white shadow-2xs' : 'text-slate-600'
              }`}
            >
              Nếp (11k)
            </button>
            <button
              type="button"
              onClick={() => setFilterType('OTHER')}
              className={`rounded-lg px-2.5 py-1 font-bold cursor-pointer ${
                filterType === 'OTHER' ? 'bg-teal-600 text-white shadow-2xs' : 'text-slate-600'
              }`}
            >
              Lúa khác
            </button>
          </div>

          {/* Ô tìm kiếm */}
          <div className="relative">
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Tìm khách hàng, số HĐ, loại lúa..."
              className="w-56 sm:w-64 rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-900 placeholder:text-slate-400 focus:border-amber-500 focus:outline-hidden focus:ring-1 focus:ring-amber-500"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                className="absolute right-2.5 top-1.5 text-slate-400 hover:text-slate-600 text-xs cursor-pointer"
              >
                ✕
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ─── BẢNG TỔNG HỢP KPI (KHỚP SHEET 2 CHI LƯƠNG ĐỘI NAM) ───────────── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {/* Card 1: Tổng tấn */}
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs">
          <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
            Tổng Số Tấn Xuống
          </div>
          <div className="mt-1 text-2xl font-black text-slate-900">
            {formatMoney(summary.totalTons)} <span className="text-xs font-bold text-slate-500">tấn</span>
          </div>
          <div className="mt-1 text-[11px] text-slate-400">
            {formatMoney(summary.totalKg)} kg • {summary.totalRows} mẻ
          </div>
        </div>

        {/* Card 2: Xuất có trở (Japonica) */}
        <div className="rounded-2xl border border-blue-200 bg-blue-50/50 p-4 shadow-2xs">
          <div className="text-[11px] font-bold text-blue-700 uppercase tracking-wider">
            Xuất Có Trở (17k)
          </div>
          <div className="mt-1 text-2xl font-black text-blue-900">
            {formatMoney(summary.tonsCoTro)} <span className="text-xs font-bold text-blue-700">tấn</span>
          </div>
          <div className="mt-1 text-xs font-bold text-blue-700">
            = {formatMoney(summary.thanhTienCoTro)} đ
          </div>
        </div>

        {/* Card 3: Xuất không trở (Nếp / Lúa khác) */}
        <div className="rounded-2xl border border-amber-200 bg-amber-50/50 p-4 shadow-2xs">
          <div className="text-[11px] font-bold text-amber-800 uppercase tracking-wider">
            Xuất Không Trở (11k)
          </div>
          <div className="mt-1 text-2xl font-black text-amber-900">
            {formatMoney(summary.tonsKhongTro)} <span className="text-xs font-bold text-amber-800">tấn</span>
          </div>
          <div className="mt-1 text-xs font-bold text-amber-800">
            = {formatMoney(summary.thanhTienKhongTro)} đ
          </div>
        </div>

        {/* Card 4: Chụm lò (Lúa 8k + Nếp 11k) */}
        <div className="rounded-2xl border border-rose-200 bg-rose-50/50 p-4 shadow-2xs">
          <div className="text-[11px] font-bold text-rose-800 uppercase tracking-wider">
            Chụm Lò (8k & 11k)
          </div>
          <div className="mt-1 text-lg font-black text-rose-900">
            {formatMoney(summary.tonsChumLua)}t <span className="text-xs font-semibold text-rose-600">(Lúa)</span> + {formatMoney(summary.tonsChumNep)}t <span className="text-xs font-semibold text-rose-600">(Nếp)</span>
          </div>
          <div className="mt-1 text-xs font-bold text-rose-800">
            = {formatMoney(summary.thanhTienChumLua + summary.thanhTienChumNep)} đ
          </div>
        </div>

        {/* Card 5: Vô bồn (3k) */}
        <div className="rounded-2xl border border-purple-200 bg-purple-50/50 p-4 shadow-2xs">
          <div className="text-[11px] font-bold text-purple-800 uppercase tracking-wider">
            Vô Bồn (3k)
          </div>
          <div className="mt-1 text-2xl font-black text-purple-900">
            {formatMoney(summary.tonsVoBon)} <span className="text-xs font-bold text-purple-800">tấn</span>
          </div>
          <div className="mt-1 text-xs font-bold text-purple-800">
            = {formatMoney(summary.thanhTienVoBon)} đ
          </div>
        </div>

        {/* Card 6: Tổng cộng tiền lương (Hero) */}
        <div className="rounded-2xl border-2 border-emerald-500 bg-gradient-to-br from-emerald-50 to-teal-50 p-4 shadow-md">
          <div className="text-[11px] font-black text-emerald-800 uppercase tracking-wider flex items-center justify-between">
            <span>TỔNG CỘNG LƯƠNG</span>
            {tamUng > 0 && <span className="text-rose-600 text-[10px]">Đã ứng {formatMoney(tamUng)}</span>}
          </div>
          <div className="mt-1 text-2xl font-black text-emerald-900">
            {formatMoney(summary.tongCong)} <span className="text-xs font-bold text-emerald-700">đ</span>
          </div>
          <div className="mt-1 text-xs font-bold text-emerald-800 flex items-center justify-between">
            <span>Còn lại:</span>
            <span className="text-sm font-extrabold text-emerald-950 underline">{formatMoney(summary.conLai)} đ</span>
          </div>
        </div>
      </div>

      {/* ─── BẢNG KÊ CHI TIẾT (KHỚP SHEET 1) ─────────────────────────────────── */}
      <div className="rounded-3xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-3.5 bg-slate-50/70">
          <div className="flex items-center gap-2">
            <span className="text-base">📋</span>
            <h2 className="text-sm sm:text-base font-extrabold text-slate-800">
              Bảng Kê Chi Tiết Xuất Lúa Đội Nam (Tháng {selectedMonthKey})
            </h2>
            <span className="rounded-full bg-slate-200/80 px-2.5 py-0.5 text-xs font-bold text-slate-700">
              {filteredEntries.length} mẻ
            </span>
          </div>

          <div className="text-xs text-slate-500">
            💡 Có thể nhấp trực tiếp vào ô <strong className="text-slate-800">Số Tấn</strong> để sửa số liệu
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-100/80 text-[11px] font-bold text-slate-700 uppercase tracking-wider">
                <th className="py-2.5 px-3 text-center w-12">STT</th>
                <th className="py-2.5 px-3 text-center">Số HĐ</th>
                <th className="py-2.5 px-3">Ngày Cân</th>
                <th className="py-2.5 px-3">Khách Hàng</th>
                <th className="py-2.5 px-3">Loại Lúa</th>
                <th className="py-2.5 px-3 text-right">Cân Nhập (kg)</th>
                <th className="py-2.5 px-3 text-center bg-amber-50/60 text-amber-900 border-x border-amber-200/60">
                  Ngày Xuống Lúa
                </th>
                <th className="py-2.5 px-3 text-center">PT Chở</th>
                <th className="py-2.5 px-3 text-right bg-emerald-50/60 text-emerald-900 border-x border-emerald-200/60">
                  Số Tấn
                </th>
                <th className="py-2.5 px-3 text-right text-blue-900">Xuất Có Trở (17k)</th>
                <th className="py-2.5 px-3 text-right text-amber-900">Xuất K.Trở (11k)</th>
                <th className="py-2.5 px-3 text-right text-rose-900">Chụm Lò</th>
                <th className="py-2.5 px-3 text-right text-purple-900">Vô Bồn (3k)</th>
                <th className="py-2.5 px-3 text-right font-black text-slate-900 bg-slate-100">Thành Tiền</th>
                <th className="py-2.5 px-3">Ghi Chú</th>
                <th className="py-2.5 px-2 text-center w-10">Thao Tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {filteredEntries.length === 0 ? (
                <tr>
                  <td colSpan={16} className="py-12 text-center text-slate-400">
                    Không tìm thấy mẻ xuất lúa nào phù hợp với bộ lọc.
                  </td>
                </tr>
              ) : (
                filteredEntries.map((row, idx) => {
                  const japonica = isJaponica(row.loaiLua);
                  const nep = isNep(row.loaiLua);

                  return (
                    <tr
                      key={row.id}
                      className="hover:bg-slate-50/80 transition-colors group"
                    >
                      {/* STT */}
                      <td className="py-2.5 px-3 text-center text-slate-400 font-mono text-[11px]">
                        {String(idx + 1).padStart(2, '0')}
                      </td>

                      {/* Số HĐ */}
                      <td className="py-2.5 px-3 text-center font-bold text-slate-800">
                        {row.soHD || '-'}
                      </td>

                      {/* Ngày Cân */}
                      <td className="py-2.5 px-3 text-slate-600 whitespace-nowrap">
                        {row.ngayCan || '-'}
                      </td>

                      {/* Khách Hàng */}
                      <td className="py-2.5 px-3 font-bold text-slate-900 whitespace-nowrap">
                        {row.khachHang}
                      </td>

                      {/* Loại Lúa (Badge) */}
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

                      {/* Cân Nhập Sấy (kg) */}
                      <td className="py-2.5 px-3 text-right font-mono text-slate-600 whitespace-nowrap">
                        {row.canNhapSayKg ? formatMoney(row.canNhapSayKg) : '-'}
                      </td>

                      {/* Ngày Xuống Lúa Khô */}
                      <td className="py-2.5 px-3 text-center whitespace-nowrap font-bold text-amber-900 bg-amber-50/30 border-x border-amber-100">
                        {row.ngayXuongLuaKho || '-'}
                      </td>

                      {/* Phương tiện chở */}
                      <td className="py-2.5 px-3 text-center whitespace-nowrap text-slate-600">
                        {row.phuongTienChoLuaKho || 'VÔ BỒN'}
                      </td>

                      {/* Số Tấn (Cho phép sửa trực tiếp) */}
                      <td className="py-1 px-2 text-right bg-emerald-50/30 border-x border-emerald-100">
                        <input
                          type="number"
                          value={row.soLuongTan}
                          onChange={(e) =>
                            handleUpdateEntry(row.id, 'soLuongTan', parseFloat(e.target.value) || 0)
                          }
                          className="w-16 rounded-md border border-transparent hover:border-slate-300 focus:border-emerald-500 bg-transparent px-1.5 py-1 text-right font-bold text-emerald-900 focus:bg-white focus:outline-hidden"
                          title="Nhấp để sửa số tấn"
                        />
                      </td>

                      {/* Xuất có trở (17k) */}
                      <td className="py-2.5 px-3 text-right text-blue-900 font-mono whitespace-nowrap">
                        {row.thanhTienCoTro > 0 ? (
                          <span title={`${row.soLuongTan} tấn × 17.000 đ`}>
                            {formatMoney(row.thanhTienCoTro)}
                          </span>
                        ) : (
                          <span className="text-slate-300">-</span>
                        )}
                      </td>

                      {/* Xuất không trở (11k) */}
                      <td className="py-2.5 px-3 text-right text-amber-900 font-mono whitespace-nowrap">
                        {row.thanhTienKhongTro > 0 ? (
                          <span title={`${row.soLuongTan} tấn × 11.000 đ`}>
                            {formatMoney(row.thanhTienKhongTro)}
                          </span>
                        ) : (
                          <span className="text-slate-300">-</span>
                        )}
                      </td>

                      {/* Chụm lò */}
                      <td className="py-2.5 px-3 text-right text-rose-900 font-mono whitespace-nowrap">
                        {row.thanhTienChum > 0 ? (
                          <span
                            title={`${row.soLuongTan} tấn × ${
                              row.donGiaChumNep > 0 ? '11.000 (Nếp)' : '8.000 (Lúa)'
                            }`}
                          >
                            {formatMoney(row.thanhTienChum)}
                          </span>
                        ) : (
                          <span className="text-slate-300">-</span>
                        )}
                      </td>

                      {/* Vô bồn (3k) */}
                      <td className="py-2.5 px-3 text-right text-purple-900 font-mono whitespace-nowrap">
                        {row.thanhTienVoBon > 0 ? (
                          <span title={`${row.soLuongTan} tấn × 3.000 đ`}>
                            {formatMoney(row.thanhTienVoBon)}
                          </span>
                        ) : (
                          <span className="text-slate-300">-</span>
                        )}
                      </td>

                      {/* Tổng thành tiền */}
                      <td className="py-2.5 px-3 text-right font-black text-slate-900 font-mono bg-slate-50 whitespace-nowrap">
                        {formatMoney(row.tongThanhTien)}
                      </td>

                      {/* Ghi chú */}
                      <td className="py-2.5 px-3 text-slate-500 max-w-[150px] truncate" title={row.ghiChu}>
                        {row.ghiChu || '-'}
                      </td>

                      {/* Thao tác xóa */}
                      <td className="py-2.5 px-2 text-center">
                        <button
                          type="button"
                          onClick={() => handleDeleteEntry(row.id)}
                          className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-rose-600 transition cursor-pointer p-1"
                          title="Xóa mẻ này"
                        >
                          ✕
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
            {filteredEntries.length > 0 && (
              <tfoot>
                <tr className="border-t-2 border-slate-300 bg-amber-50/40 font-bold text-slate-900">
                  <td colSpan={5} className="py-3 px-3 text-center uppercase tracking-wider text-xs">
                    TỔNG CỘNG:
                  </td>
                  <td className="py-3 px-3 text-right font-mono text-xs">
                    {formatMoney(summary.totalKg)}
                  </td>
                  <td className="py-3 px-3"></td>
                  <td className="py-3 px-3"></td>
                  <td className="py-3 px-3 text-right font-mono text-xs font-black text-emerald-900">
                    {formatMoney(summary.totalTons)}
                  </td>
                  <td className="py-3 px-3 text-right font-mono text-xs text-blue-900">
                    {formatMoney(summary.thanhTienCoTro)}
                  </td>
                  <td className="py-3 px-3 text-right font-mono text-xs text-amber-900">
                    {formatMoney(summary.thanhTienKhongTro)}
                  </td>
                  <td className="py-3 px-3 text-right font-mono text-xs text-rose-900">
                    {formatMoney(summary.thanhTienChumLua + summary.thanhTienChumNep)}
                  </td>
                  <td className="py-3 px-3 text-right font-mono text-xs text-purple-900">
                    {formatMoney(summary.thanhTienVoBon)}
                  </td>
                  <td className="py-3 px-3 text-right font-mono text-sm font-black text-emerald-950 bg-amber-100/50">
                    {formatMoney(summary.tongCong)} đ
                  </td>
                  <td colSpan={2}></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

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
                ⚙️ Cấu Hình Chữ Ký & Tạm Ứng
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
                  Người lập bảng (Ký ở cuối Sheet 1):
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
                ℹ️ Các thông tin này sẽ được in trực tiếp vào 2 Sheet của file Excel khi bạn nhấn <strong>Xuất File Excel</strong>.
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowConfigModal(false)}
                className="rounded-xl bg-amber-600 px-4 py-2 text-xs font-bold text-white hover:bg-amber-700 transition cursor-pointer"
              >
                Lưu & Đóng
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── MODAL THÊM MẺ THỦ CÔNG ───────────────────────────────────────────── */}
      {showAddModal && (
        <div
          onClick={() => setShowAddModal(false)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs animate-in fade-in"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl border border-slate-200"
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-extrabold text-slate-900">
                ➕ Thêm Mẻ Xuống Lúa Khô Mới
              </h3>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="text-slate-400 hover:text-slate-600 text-base font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleAddManualEntry} className="mt-4 space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Số HĐ:</label>
                  <input
                    type="text"
                    value={manualSoHD}
                    onChange={(e) => setManualSoHD(e.target.value)}
                    placeholder="ví dụ: 01, 02, 08"
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 font-medium text-slate-900 focus:border-amber-500 focus:outline-hidden"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Ngày Xuống Lúa:</label>
                  <input
                    type="text"
                    value={manualNgayXuong}
                    onChange={(e) => setManualNgayXuong(e.target.value)}
                    placeholder="DD/MM/YYYY"
                    required
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 font-medium text-slate-900 focus:border-amber-500 focus:outline-hidden"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Tên Khách Hàng:</label>
                <input
                  type="text"
                  value={manualKhachHang}
                  onChange={(e) => setManualKhachHang(e.target.value)}
                  placeholder="ví dụ: VŨ THÔNG BÌNH, HẢI HÂN..."
                  required
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 font-medium text-slate-900 focus:border-amber-500 focus:outline-hidden"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Loại Lúa:</label>
                  <select
                    value={manualLoaiLua}
                    onChange={(e) => setManualLoaiLua(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 font-bold text-slate-900 focus:border-amber-500 focus:outline-hidden cursor-pointer"
                  >
                    <option value="NẾP CPC">NẾP CPC (Xuất 11k, Chụm 11k)</option>
                    <option value="NẾP">NẾP (Xuất 11k, Chụm 11k)</option>
                    <option value="JAPONICA-DS1">JAPONICA-DS1 (Có trở 17k, Chụm 8k)</option>
                    <option value="JAPONICA">JAPONICA (Có trở 17k, Chụm 8k)</option>
                    <option value="ST25 ĐL">ST25 ĐL (Xuất 11k, Chụm 8k)</option>
                    <option value="OM18">OM18 (Xuất 11k, Chụm 8k)</option>
                    <option value="LÚA THƯỜNG">LÚA THƯỜNG (Xuất 11k, Chụm 8k)</option>
                  </select>
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Phương Tiện Chở:</label>
                  <input
                    type="text"
                    value={manualPhuongTien}
                    onChange={(e) => setManualPhuongTien(e.target.value)}
                    placeholder="Mặc định: VÔ BỒN"
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 font-medium text-slate-900 focus:border-amber-500 focus:outline-hidden"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Cân Nhập Sấy (kg):</label>
                  <input
                    type="number"
                    value={manualKg}
                    onChange={(e) => {
                      setManualKg(e.target.value);
                      const kgVal = parseFloat(e.target.value) || 0;
                      setManualTan(String(Math.round(kgVal / 1000)));
                    }}
                    placeholder="ví dụ: 75125"
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 font-mono text-slate-900 focus:border-amber-500 focus:outline-hidden"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Số Tấn Quy Đổi:</label>
                  <input
                    type="number"
                    value={manualTan}
                    onChange={(e) => setManualTan(e.target.value)}
                    placeholder="Làm tròn từ kg"
                    required
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 font-bold text-emerald-800 focus:border-amber-500 focus:outline-hidden"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Ghi Chú:</label>
                <input
                  type="text"
                  value={manualGhiChu}
                  onChange={(e) => setManualGhiChu(e.target.value)}
                  placeholder="Ghi chú thêm nếu có..."
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 font-medium text-slate-900 focus:border-amber-500 focus:outline-hidden"
                />
              </div>

              <div className="mt-5 flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="rounded-xl border border-slate-300 px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50 transition cursor-pointer"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="rounded-xl bg-emerald-600 px-5 py-2 text-xs font-bold text-white hover:bg-emerald-700 transition cursor-pointer shadow-xs"
                >
                  Thêm Mẻ
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
