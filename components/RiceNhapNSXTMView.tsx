'use client';

/**
 * RiceNhapNSXTMView — Quản lý & Tính Lương Nhập Sấy NSX TM (Đội Đức & Đội Quý)
 *
 * Tính năng chính:
 * 1. Nhận 2 file input: File Lúa Tươi + File Lúa Khô.
 * 2. Tự động lọc các mẻ sấy tại NSX TM (Nhà Máy Xay Tân Mỹ / ĐTM).
 * 3. Tự sinh nội dung câu Công việc chuẩn:
 *    - Lúa tươi: Nhập {1 xe / ghe} {phương tiện} {loại lúa} của {khách hàng} (Xe: 25k, Ghe: 15k)
 *    - Lúa khô: Nhập {ghe} {phương tiện} Lúa khô {loại lúa} của {khách hàng} (20k)
 * 4. Phân chia 2 đội linh hoạt:
 *    - Gán tự động xen kẽ 2 ngày (2 ngày ĐỨC, 2 ngày QUÝ)
 *    - Gán xen kẽ ngày chẵn/lẻ
 *    - Gán cả ngày 1-Click
 *    - Toggle đổi đội từng dòng 1-Click
 * 5. Xuất 2 file Excel đầu ra chuẩn mẫu công ty:
 *    - File 1: LƯƠNG ĐỘI ĐỨC-T{mm}.{yyyy}.xlsx
 *    - File 2: LƯƠNG ĐỘI QUÝ-T{mm}.{yyyy}.xlsx
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  NSXTMEntry,
  NSXTMTeamKey,
  NSXTMViewMode,
} from '@/lib/rice-payroll/nsx-tm-types';
import {
  autoAssignAlternating2Days,
  autoAssignAlternating1Day,
} from '@/lib/rice-payroll/nsx-tm-utils';

function formatMoney(num: number): string {
  if (num === 0 || isNaN(num) || !num) return '0';
  return Math.round(num).toLocaleString('vi-VN');
}

export default function RiceNhapNSXTMView() {
  const [allEntries, setAllEntries] = useState<NSXTMEntry[]>([]);
  const [selectedMonthKey, setSelectedMonthKey] = useState<string>('10/2026');
  const [viewMode, setViewMode] = useState<NSXTMViewMode>('ALL');

  // Input file refs
  const fileTuoiRef = useRef<HTMLInputElement>(null);
  const fileKhoRef = useRef<HTMLInputElement>(null);
  const [fileTuoiName, setFileTuoiName] = useState<string>('');
  const [fileKhoName, setFileKhoName] = useState<string>('');

  // Trạng thái xử lý
  const [isParsing, setIsParsing] = useState(false);
  const [parsingType, setParsingType] = useState<'TUOI' | 'KHO' | 'SAMPLE' | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [exportStatusText, setExportStatusText] = useState<string>('');
  const [exportError, setExportError] = useState<string | null>(null);

  // Form thêm công việc thủ công (xuất trấu, xuất gạo, lúa nền...)
  const [showAddManual, setShowAddManual] = useState(false);
  const [manualDate, setManualDate] = useState('01/10/2026');
  const [manualTeam, setManualTeam] = useState<NSXTMTeamKey>('ĐỨC');
  const [manualDesc, setManualDesc] = useState('');
  const [manualKg, setManualKg] = useState('');
  const [manualType, setManualType] = useState<'TRAU' | 'GAO' | 'VO_BON' | 'SAY'>('TRAU');

  // Nhận dữ liệu phiếu cân chuyển từ tab "Quét Phiếu Cân AI"
  const [transferredSlips, setTransferredSlips] = useState<NSXTMEntry[]>([]);
  const [transferredToast, setTransferredToast] = useState<string | null>(null);

  // Lắng nghe dữ liệu chuyển từ tab Quét Phiếu Cân AI (Xuất trấu)
  useEffect(() => {
    const checkTransferred = () => {
      try {
        const raw = localStorage.getItem('nsx_tm_transferred_entries');
        if (raw) {
          const list: NSXTMEntry[] = JSON.parse(raw);
          if (Array.isArray(list) && list.length > 0) {
            setTransferredSlips(list);
          } else {
            setTransferredSlips([]);
          }
        } else {
          setTransferredSlips([]);
        }
      } catch (e) {
        console.error('Lỗi đọc nsx_tm_transferred_entries:', e);
      }
    };

    checkTransferred();
    window.addEventListener('storage', checkTransferred);
    window.addEventListener('focus', checkTransferred);
    return () => {
      window.removeEventListener('storage', checkTransferred);
      window.removeEventListener('focus', checkTransferred);
    };
  }, []);

  // Nạp các phiếu cân đã chuyển vào bảng kê
  const handleAcceptTransferredSlips = () => {
    if (transferredSlips.length === 0) return;
    setAllEntries((prev) => {
      // Giữ nguyên đội mà người dùng đã chỉ định khi phân đội ở tab Quét Phiếu Cân AI
      return [...transferredSlips, ...prev];
    });
    const count = transferredSlips.length;
    const ducC = transferredSlips.filter((s) => s.team === 'ĐỨC').length;
    const quyC = transferredSlips.filter((s) => s.team === 'QUÝ').length;
    localStorage.removeItem('nsx_tm_transferred_entries');
    setTransferredToast(`✅ Đã nạp thành công ${count} phiếu cân vào bảng kê (Đội Đức: ${ducC} mẻ, Đội Quý: ${quyC} mẻ)!`);
    setTransferredSlips([]);
    setTimeout(() => setTransferredToast(null), 5000);
  };

  // Bỏ qua / xóa các phiếu đã chuyển
  const handleDismissTransferredSlips = () => {
    localStorage.removeItem('nsx_tm_transferred_entries');
    setTransferredSlips([]);
  };

  // ─── Khôi phục bảng kê và trạng thái từ localStorage (không mất khi chuyển tab) ─
  useEffect(() => {
    try {
      const saved = localStorage.getItem('nsx_tm_payroll_entries');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setAllEntries(parsed);
        }
      }
      const savedMonth = localStorage.getItem('nsx_tm_selected_month');
      if (savedMonth) setSelectedMonthKey(savedMonth);

      const savedMode = localStorage.getItem('nsx_tm_view_mode');
      if (savedMode === 'ALL' || savedMode === 'ĐỨC' || savedMode === 'QUÝ') {
        setViewMode(savedMode as NSXTMViewMode);
      }
      const savedTuoiName = localStorage.getItem('nsx_tm_file_tuoi_name');
      if (savedTuoiName) setFileTuoiName(savedTuoiName);
      const savedKhoName = localStorage.getItem('nsx_tm_file_kho_name');
      if (savedKhoName) setFileKhoName(savedKhoName);
    } catch (e) {
      console.error('Lỗi khôi phục nsx_tm_payroll_entries:', e);
    }
  }, []);

  // ─── Tự động lưu bảng kê vào localStorage mỗi khi có thay đổi ─────────────
  useEffect(() => {
    try {
      if (allEntries.length > 0) {
        localStorage.setItem('nsx_tm_payroll_entries', JSON.stringify(allEntries));
      } else {
        localStorage.removeItem('nsx_tm_payroll_entries');
      }
    } catch (e) {
      console.error('Lỗi lưu nsx_tm_payroll_entries:', e);
    }
  }, [allEntries]);

  useEffect(() => {
    if (selectedMonthKey) {
      try {
        localStorage.setItem('nsx_tm_selected_month', selectedMonthKey);
      } catch {}
    }
  }, [selectedMonthKey]);

  useEffect(() => {
    if (viewMode) {
      try {
        localStorage.setItem('nsx_tm_view_mode', viewMode);
      } catch {}
    }
  }, [viewMode]);

  useEffect(() => {
    if (fileTuoiName) {
      try {
        localStorage.setItem('nsx_tm_file_tuoi_name', fileTuoiName);
      } catch {}
    }
  }, [fileTuoiName]);

  useEffect(() => {
    if (fileKhoName) {
      try {
        localStorage.setItem('nsx_tm_file_kho_name', fileKhoName);
      } catch {}
    }
  }, [fileKhoName]);

  // Xóa toàn bộ dữ liệu bảng kê để nạp file mới từ đầu
  const handleClearAllEntries = () => {
    if (window.confirm('Bạn có chắc muốn xóa sạch toàn bộ bảng kê hiện tại để bắt đầu nạp lại file mới không?')) {
      setAllEntries([]);
      setFileTuoiName('');
      setFileKhoName('');
      localStorage.removeItem('nsx_tm_payroll_entries');
      localStorage.removeItem('nsx_tm_file_tuoi_name');
      localStorage.removeItem('nsx_tm_file_kho_name');
    }
  };

  // ─── Danh sách các tháng có dữ liệu ─────────────────────────────────────
  const availableMonths = useMemo(() => {
    const set = new Set<string>();
    allEntries.forEach((e) => {
      const parts = (e.date || '').split('/');
      if (parts.length === 3) {
        set.add(`${parts[1]}/${parts[2]}`);
      }
    });
    const arr = Array.from(set);
    arr.sort((a, b) => {
      const [m1, y1] = a.split('/').map(Number);
      const [m2, y2] = b.split('/').map(Number);
      return new Date(y2, m2 - 1).getTime() - new Date(y1, m1 - 1).getTime();
    });
    return arr.length > 0 ? arr : ['10/2026'];
  }, [allEntries]);

  // Cập nhật selectedMonthKey nếu tháng hiện tại không có trong danh sách
  useEffect(() => {
    if (availableMonths.length > 0 && !availableMonths.includes(selectedMonthKey)) {
      setSelectedMonthKey(availableMonths[0]);
    }
  }, [availableMonths, selectedMonthKey]);

  // ─── Lọc theo tháng sấy đã chọn ─────────────────────────────────────────
  const monthEntries = useMemo(() => {
    if (!selectedMonthKey) return allEntries;
    return allEntries.filter((e) => {
      const parts = (e.date || '').split('/');
      if (parts.length !== 3) return false;
      return `${parts[1]}/${parts[2]}` === selectedMonthKey;
    });
  }, [allEntries, selectedMonthKey]);

  // Lọc theo chế độ xem (ALL / ĐỨC / QUÝ)
  const currentEntries = useMemo(() => {
    if (viewMode === 'ALL') return monthEntries;
    return monthEntries.filter((e) => e.team === viewMode);
  }, [monthEntries, viewMode]);

  // Số lượng theo từng đội trong tháng
  const entriesDuc = useMemo(() => monthEntries.filter((e) => e.team === 'ĐỨC'), [monthEntries]);
  const entriesQuy = useMemo(() => monthEntries.filter((e) => e.team === 'QUÝ'), [monthEntries]);

  // ─── Gom nhóm mẻ theo Ngày Nhập/Xuất ────────────────────────────────────
  const groupedByDate = useMemo(() => {
    const map = new Map<string, NSXTMEntry[]>();
    currentEntries.forEach((e) => {
      const d = e.date || 'Chưa có ngày';
      const arr = map.get(d) || [];
      arr.push(e);
      map.set(d, arr);
    });
    return Array.from(map.entries()).sort((a, b) => {
      const [d1, m1, y1] = a[0].split('/').map(Number);
      const [d2, m2, y2] = b[0].split('/').map(Number);
      return new Date(y1, m1 - 1, d1).getTime() - new Date(y2, m2 - 1, d2).getTime();
    });
  }, [currentEntries]);

  // ─── Thống kê KPI ───────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const list = currentEntries;
    let totalKg = 0;
    let totalTons = 0;
    let sayKg = 0;
    let sayTons = 0;
    let sayMoney = 0;
    let khoKg = 0;
    let khoTons = 0;
    let khoMoney = 0;
    let grandMoney = 0;

    list.forEach((e) => {
      totalKg += e.weightKg || 0;
      totalTons += e.roundedTons || 0;
      grandMoney += e.tongThanhTien || 0;

      if (e.source === 'LUA_TUOI') {
        sayKg += e.weightKg || 0;
        sayTons += e.roundedTons || 0;
        sayMoney += e.thanhTienSay || 0;
      } else if (e.source === 'LUA_KHO') {
        khoKg += e.weightKg || 0;
        khoTons += e.roundedTons || 0;
        khoMoney += e.thanhTienLuaKho || 0;
      }
    });

    return {
      totalEntries: list.length,
      totalKg,
      totalTons,
      sayKg,
      sayTons,
      sayMoney,
      khoKg,
      khoTons,
      khoMoney,
      grandMoney,
    };
  }, [currentEntries]);

  // ─── Xử lý Gán Đội ──────────────────────────────────────────────────────
  // 1. Toggle 1 dòng đơn lẻ
  const handleToggleTeam = (id: string) => {
    setAllEntries((prev) =>
      prev.map((e) => {
        if (e.id !== id) return e;
        const nextTeam: NSXTMTeamKey = e.team === 'ĐỨC' ? 'QUÝ' : 'ĐỨC';
        return { ...e, team: nextTeam };
      })
    );
  };

  // 2. Gán cả ngày cho 1 đội
  const handleAssignDayTeam = (dateStr: string, team: NSXTMTeamKey) => {
    setAllEntries((prev) =>
      prev.map((e) => {
        if (e.date !== dateStr) return e;
        return { ...e, team };
      })
    );
  };

  // 3. Gán tự động xen kẽ 2 ngày (2 ngày ĐỨC, 2 ngày QUÝ)
  const handleAssignAlternating2Days = () => {
    setAllEntries((prev) => autoAssignAlternating2Days(prev));
  };

  // 4. Gán tự động xen kẽ 1 ngày (chẵn/lẻ)
  const handleAssignAlternating1Day = () => {
    setAllEntries((prev) => autoAssignAlternating1Day(prev));
  };

  // 5. Cập nhật câu mô tả công việc hoặc số lượng
  const handleUpdateEntryField = (
    id: string,
    field: keyof NSXTMEntry,
    val: any
  ) => {
    setAllEntries((prev) =>
      prev.map((e) => {
        if (e.id !== id) return e;
        const updated = { ...e, [field]: val };

        // Nếu sửa số kg hoặc tấn -> tính lại thành tiền
        if (field === 'weightKg' || field === 'roundedTons') {
          const tons = field === 'roundedTons' ? Number(val) : Math.round(Number(val) / 1000);
          updated.roundedTons = tons;
          if (updated.source === 'LUA_TUOI') {
            const unitPrice = updated.vehicleType === 'XE' ? 25000 : 15000;
            updated.thanhTienSay = tons * unitPrice;
            updated.tongThanhTien = updated.thanhTienSay;
          } else if (updated.source === 'LUA_KHO') {
            updated.thanhTienLuaKho = tons * 20000;
            updated.tongThanhTien = updated.thanhTienLuaKho;
          }
        }

        return updated;
      })
    );
  };

  // 6. Xóa 1 dòng
  const handleRemoveEntry = (id: string) => {
    setAllEntries((prev) => prev.filter((e) => e.id !== id));
  };

  // ─── Thêm công việc thủ công ───────────────────────────────────────────
  const handleAddManualEntry = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualDesc.trim()) return;

    const kg = parseFloat(manualKg) || 0;
    const tons = Math.round(kg / 1000);

    let unitPriceXe = 0;
    let unitPriceGhe = 0;
    let sayMoney = 0;
    let khoMoney = 0;
    let voBonMoney = 0;
    let gaoMoney = 0;
    let trauMoney = 0;
    let total = 0;

    if (manualType === 'TRAU') {
      trauMoney = tons * 11000;
      total = trauMoney;
    } else if (manualType === 'GAO') {
      const bao = Math.round(kg / 50) || tons * 20;
      gaoMoney = bao * 1650;
      total = gaoMoney;
    } else if (manualType === 'VO_BON') {
      voBonMoney = tons * 50000;
      total = voBonMoney;
    } else {
      sayMoney = tons * 15000;
      unitPriceGhe = 15000;
      total = sayMoney;
    }

    const newEntry: NSXTMEntry = {
      id: `manual-${Date.now()}`,
      source: 'MANUAL',
      date: manualDate || '01/10/2026',
      team: manualTeam,
      customerName: '',
      riceType: '',
      vehicleName: '',
      vehicleType: 'GHE',
      jobDescription: manualDesc.trim(),
      weightKg: kg,
      roundedTons: tons,
      unitPriceSayXe: unitPriceXe,
      unitPriceSayGhe: unitPriceGhe,
      thanhTienSay: sayMoney,
      unitPriceLuaKho: 0,
      thanhTienLuaKho: khoMoney,
      unitPriceVoBon: manualType === 'VO_BON' ? 50000 : 0,
      thanhTienVoBon: voBonMoney,
      unitPriceXuatGao: manualType === 'GAO' ? 1650 : 0,
      thanhTienXuatGao: gaoMoney,
      unitPriceXuatTrau: manualType === 'TRAU' ? 11000 : 0,
      thanhTienXuatTrau: trauMoney,
      tongThanhTien: total,
    };

    setAllEntries((prev) => [newEntry, ...prev]);
    setManualDesc('');
    setManualKg('');
    setShowAddManual(false);
  };

  // ─── Nạp dữ liệu mẫu tháng 10 ──────────────────────────────────────────
  const handleLoadSampleData = async () => {
    setIsParsing(true);
    setParsingType('SAMPLE');
    setParseError(null);
    try {
      const res = await fetch('/api/rice-payroll/nsx-tm-parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ useSample: true }),
      });
      if (!res.ok) {
        const text = await res.text();
        let errMsg = 'Không thể nạp dữ liệu mẫu';
        try {
          const json = JSON.parse(text);
          errMsg = json.error || errMsg;
        } catch {
          errMsg = text || errMsg;
        }
        throw new Error(errMsg);
      }
      const data = await res.json();
      setAllEntries(data.entries || []);
      setFileTuoiName('THỊNH_TỔNG SỐ LIỆU NHẬP LÚA TƯƠI 2026.xlsx (Mẫu)');
      setFileKhoName('THỊNH_TỔNG NHẬP LÚA KHÔ NĂM 2026.xlsx (Mẫu)');
    } catch (err) {
      setParseError((err as Error).message);
    } finally {
      setIsParsing(false);
      setParsingType(null);
    }
  };

  // ─── Upload file Lúa Tươi và/hoặc Lúa Khô ──────────────────────────────
  const handleUploadFiles = async (
    fileTuoi?: File | null,
    fileKho?: File | null
  ) => {
    if (!fileTuoi && !fileKho) return;

    setIsParsing(true);
    setParsingType(fileTuoi ? 'TUOI' : 'KHO');
    setParseError(null);

    const formData = new FormData();
    if (fileTuoi) {
      formData.append('fileTuoi', fileTuoi);
      setFileTuoiName(fileTuoi.name);
    }
    if (fileKho) {
      formData.append('fileKho', fileKho);
      setFileKhoName(fileKho.name);
    }

    try {
      const res = await fetch('/api/rice-payroll/nsx-tm-parse', {
        method: 'POST',
        body: formData,
      });
      if (!res.ok) {
        const text = await res.text();
        let errMsg = 'Không thể xử lý file tải lên';
        try {
          const json = JSON.parse(text);
          errMsg = json.error || errMsg;
        } catch {
          errMsg = text || errMsg;
        }
        throw new Error(errMsg);
      }
      const data = await res.json();
      const newItems: NSXTMEntry[] = data.entries || [];

      setAllEntries((prev) => {
        // Nếu upload Lúa Tươi: giữ lại Lúa Khô và Thủ công
        // Nếu upload Lúa Khô: giữ lại Lúa Tươi và Thủ công
        let remaining = prev;
        if (fileTuoi) {
          remaining = remaining.filter((e) => e.source !== 'LUA_TUOI');
        }
        if (fileKho) {
          remaining = remaining.filter((e) => e.source !== 'LUA_KHO');
        }
        const merged = [...remaining, ...newItems];
        return autoAssignAlternating2Days(merged);
      });
    } catch (err) {
      setParseError((err as Error).message);
    } finally {
      setIsParsing(false);
      setParsingType(null);
      if (fileTuoiRef.current) fileTuoiRef.current.value = '';
      if (fileKhoRef.current) fileKhoRef.current.value = '';
    }
  };

  // ─── Xuất file Excel đơn lẻ cho 1 đội ──────────────────────────────────
  const exportSingleTeamExcel = async (team: 'ĐỨC' | 'QUÝ') => {
    const [mStr, yStr] = selectedMonthKey.split('/');
    const month = parseInt(mStr, 10);
    const year = parseInt(yStr, 10);

    const payload = {
      month,
      year,
      targetTeam: team,
      entries: monthEntries,
      preparerName: 'Võ Hoàng Cẩm Tiên',
      approverName: 'Huỳnh Anh Phát Thịnh',
    };

    const res = await fetch('/api/rice-payroll/nsx-tm-export', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || `Xuất file Excel Đội ${team} thất bại`);
    }

    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const mm = String(month).padStart(2, '0');
    const filePrefix = team === 'ĐỨC' ? 'LUONG_THANG_DOI_DUC' : 'LUONG_THANG_DOI_QUY';
    a.download = `${filePrefix}_T${mm}_${year}.xlsx`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
  };

  // ─── Xuất cả 2 file Excel (1 file Đội Đức, 1 file Đội Quý) ─────────────
  const handleExportBothTeams = async () => {
    if (monthEntries.length === 0) {
      alert('Không có mẻ nhập sấy nào trong tháng này để xuất file.');
      return;
    }

    setIsExporting(true);
    setExportError(null);
    setExportStatusText('Đang tạo file Đội Đức...');

    try {
      // 1. Tải file Đội Đức
      await exportSingleTeamExcel('ĐỨC');

      setExportStatusText('Đang tạo file Đội Quý...');
      // Chờ 600ms để trình duyệt tải file 1
      await new Promise((r) => setTimeout(r, 600));

      // 2. Tải file Đội Quý
      await exportSingleTeamExcel('QUÝ');

      setExportStatusText('✅ Đã tải xong 2 file Excel (Đức + Quý)');
      setTimeout(() => setExportStatusText(''), 4000);
    } catch (err) {
      setExportError((err as Error).message);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* ─── Header & Upload Inputs ───────────────────────────────────────── */}
      <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="flex items-center gap-2.5">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 text-xl text-indigo-700 ring-1 ring-indigo-200">
                🏭
              </span>
              <div>
                <h1 className="text-xl font-bold tracking-tight text-slate-900">
                  Nhập Sấy NSX TM (Đội Đức &amp; Đội Quý)
                </h1>
                <p className="text-xs text-slate-500">
                  Kết hợp dữ liệu <strong className="text-slate-700">Lúa Tươi</strong> &amp; <strong className="text-slate-700">Lúa Khô</strong> • Phân chia xen kẽ 2 ngày linh hoạt • Xuất 2 file Excel chuẩn mẫu
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {/* Input File Lúa Tươi */}
            <input
              type="file"
              ref={fileTuoiRef}
              accept=".xlsx,.xls"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleUploadFiles(file, null);
              }}
              className="hidden"
            />
            <button
              onClick={() => fileTuoiRef.current?.click()}
              disabled={isParsing}
              className={`inline-flex items-center gap-2 rounded-xl border px-3.5 py-2 text-xs font-bold shadow-2xs transition-all ${
                parsingType === 'TUOI'
                  ? 'border-indigo-400 bg-indigo-50 text-indigo-700 animate-pulse'
                  : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-50'
              }`}
              title="Tải lên file THỊNH_TỔNG SỐ LIỆU NHẬP LÚA TƯƠI 2026.xlsx"
            >
              <span>{parsingType === 'TUOI' ? '⏳' : '🌾'}</span>
              <span>
                {parsingType === 'TUOI'
                  ? 'Đang đọc Lúa Tươi...'
                  : fileTuoiName
                  ? 'Đổi File Lúa Tươi'
                  : 'Tải File Lúa Tươi'}
              </span>
            </button>

            {/* Input File Lúa Khô */}
            <input
              type="file"
              ref={fileKhoRef}
              accept=".xlsx,.xls"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleUploadFiles(null, file);
              }}
              className="hidden"
            />
            <button
              onClick={() => fileKhoRef.current?.click()}
              disabled={isParsing}
              className={`inline-flex items-center gap-2 rounded-xl border px-3.5 py-2 text-xs font-bold shadow-2xs transition-all ${
                parsingType === 'KHO'
                  ? 'border-amber-400 bg-amber-50 text-amber-700 animate-pulse'
                  : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-50'
              }`}
              title="Tải lên file THỊNH_TỔNG NHẬP LÚA KHÔ NĂM 2026.xlsx"
            >
              <span>{parsingType === 'KHO' ? '⏳' : '🌾'}</span>
              <span>
                {parsingType === 'KHO'
                  ? 'Đang đọc Lúa Khô...'
                  : fileKhoName
                  ? 'Đổi File Lúa Khô'
                  : 'Tải File Lúa Khô'}
              </span>
            </button>

            {/* Nút nạp dữ liệu mẫu */}
            <button
              onClick={handleLoadSampleData}
              disabled={isParsing}
              className={`inline-flex items-center gap-2 rounded-xl border px-3.5 py-2 text-xs font-bold transition-all ${
                parsingType === 'SAMPLE'
                  ? 'border-indigo-400 bg-indigo-100 text-indigo-800 animate-pulse'
                  : 'border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 disabled:opacity-50'
              }`}
              title="Nạp dữ liệu mẫu từ các file có sẵn trên máy (Tháng 10/2026)"
            >
              <span>{parsingType === 'SAMPLE' ? '⏳' : '⚡'}</span>
              <span>{parsingType === 'SAMPLE' ? 'Đang nạp dữ liệu mẫu...' : 'Nạp Dữ Liệu Mẫu'}</span>
            </button>

            {/* Liên kết nhanh sang Quét Phiếu Cân AI */}
            <Link
              href="/xuat-trau?tab=quet-anh-cu"
              className="inline-flex items-center gap-1.5 rounded-xl border border-amber-300 bg-amber-50 px-3.5 py-2 text-xs font-bold text-amber-900 shadow-2xs hover:bg-amber-100 transition-all cursor-pointer"
              title="Mở tab Quét Phiếu Cân AI để chụp & phân đội phiếu cân xuất trấu (Dữ liệu bảng kê được lưu an toàn)"
            >
              <span>📸</span>
              <span>Sang Quét Phiếu Cân AI</span>
              <span>&rarr;</span>
            </Link>

            {/* Nút xóa làm mới dữ liệu nếu đã có dữ liệu */}
            {allEntries.length > 0 && (
              <button
                type="button"
                onClick={handleClearAllEntries}
                className="inline-flex items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2 text-xs font-bold text-rose-700 hover:bg-rose-100 transition-all shadow-2xs cursor-pointer"
                title="Xóa toàn bộ dữ liệu bảng kê hiện tại để nạp lại file mới"
              >
                <span>🗑️</span>
                <span>Làm mới</span>
              </button>
            )}
          </div>
        </div>

        {parseError && (
          <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50 p-2.5 text-xs text-rose-700">
            {parseError}
          </div>
        )}
      </div>

      {/* ─── Banner Nhận Phiếu Cân từ Tab Quét Phiếu Cân AI ─────────────────── */}
      {transferredSlips.length > 0 && (
        <div className="rounded-2xl border-2 border-emerald-400 bg-gradient-to-r from-emerald-50 via-teal-50 to-emerald-100 p-5 shadow-sm">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-xl text-white shadow-xs">
                📥
              </span>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-black uppercase tracking-wider text-emerald-900">
                    Có dữ liệu chuyển từ tab Quét Phiếu Cân AI
                  </span>
                  <span className="rounded-full bg-emerald-600 px-2 py-0.5 text-[11px] font-bold text-white shadow-2xs">
                    {transferredSlips.length} phiếu cân
                  </span>
                </div>
                <p className="mt-1 text-xs text-emerald-900">
                  Các phiếu cân đã được bạn chọn sẵn đội:
                  <span className="ml-1.5 font-bold text-blue-700">
                    🔵 {transferredSlips.filter((s) => s.team === 'ĐỨC').length} mẻ Đội Đức
                  </span>
                  <span className="mx-1.5 text-slate-400">•</span>
                  <span className="font-bold text-emerald-700">
                    🟢 {transferredSlips.filter((s) => s.team === 'QUÝ').length} mẻ Đội Quý
                  </span>
                  . Bạn có muốn nạp vào bảng lương NSX TM ngay không?
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2.5 sm:self-center">
              <button
                type="button"
                onClick={handleAcceptTransferredSlips}
                className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-bold text-white shadow-md hover:bg-emerald-700 active:scale-95 transition-all"
              >
                <span>📥</span>
                <span>Nạp Ngay Vào Bảng Kê</span>
              </button>
              <button
                type="button"
                onClick={handleDismissTransferredSlips}
                className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 transition-all"
                title="Bỏ qua và không nạp các phiếu này"
              >
                Bỏ qua
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Thông báo nạp thành công */}
      {transferredToast && (
        <div className="rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-xs font-semibold text-emerald-800 shadow-2xs">
          {transferredToast}
        </div>
      )}

      {/* ─── Thanh điều khiển Tháng & Phân chia Đội ────────────────────────── */}
      {allEntries.length > 0 && (
        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm space-y-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            {/* Chọn tháng */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500 mr-1">
                Tháng sấy:
              </span>
              {availableMonths.map((mk) => (
                <button
                  key={mk}
                  onClick={() => setSelectedMonthKey(mk)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                    selectedMonthKey === mk
                      ? 'bg-indigo-600 text-white shadow-xs'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  Tháng {mk}
                </button>
              ))}
            </div>

            {/* 3 Chế độ xem Đội */}
            <div className="flex items-center gap-1 rounded-xl bg-slate-100 p-1 border border-slate-200">
              <button
                onClick={() => setViewMode('ALL')}
                className={`rounded-lg px-3.5 py-1.5 text-xs font-bold transition-all ${
                  viewMode === 'ALL'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                📊 Toàn bộ NSX TM ({monthEntries.length})
              </button>
              <button
                onClick={() => setViewMode('ĐỨC')}
                className={`rounded-lg px-3.5 py-1.5 text-xs font-bold transition-all flex items-center gap-1.5 ${
                  viewMode === 'ĐỨC'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-blue-700 hover:bg-blue-50'
                }`}
              >
                <span>🔵</span>
                <span>Đội Anh Đức ({entriesDuc.length})</span>
              </button>
              <button
                onClick={() => setViewMode('QUÝ')}
                className={`rounded-lg px-3.5 py-1.5 text-xs font-bold transition-all flex items-center gap-1.5 ${
                  viewMode === 'QUÝ'
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'text-emerald-700 hover:bg-emerald-50'
                }`}
              >
                <span>🟢</span>
                <span>Đội Anh Quý ({entriesQuy.length})</span>
              </button>
            </div>

            {/* Nút Xuất 2 File Excel */}
            <div className="flex flex-wrap items-center gap-1.5 self-end lg:self-auto">
              <button
                onClick={handleExportBothTeams}
                disabled={isExporting || monthEntries.length === 0}
                className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-bold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50 transition-all"
                title="Tải về 2 file Excel riêng biệt: 1 file Đội Đức & 1 file Đội Quý"
              >
                <span>📥</span>
                <span>
                  {isExporting ? (exportStatusText || 'Đang xuất...') : 'Xuất 2 File Excel (Đức + Quý)'}
                </span>
              </button>

              <button
                type="button"
                onClick={() => exportSingleTeamExcel('ĐỨC')}
                disabled={isExporting || monthEntries.length === 0}
                className="inline-flex items-center gap-1 rounded-xl border border-blue-200 bg-blue-50 px-2.5 py-2 text-xs font-bold text-blue-700 hover:bg-blue-100 disabled:opacity-50 transition-all"
                title="Tải riêng file Excel Đội Đức"
              >
                <span>📄</span>
                <span>File Đức</span>
              </button>

              <button
                type="button"
                onClick={() => exportSingleTeamExcel('QUÝ')}
                disabled={isExporting || monthEntries.length === 0}
                className="inline-flex items-center gap-1 rounded-xl border border-emerald-200 bg-emerald-50 px-2.5 py-2 text-xs font-bold text-emerald-700 hover:bg-emerald-100 disabled:opacity-50 transition-all"
                title="Tải riêng file Excel Đội Quý"
              >
                <span>📄</span>
                <span>File Quý</span>
              </button>
            </div>
          </div>

          {exportStatusText && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/90 p-2.5 text-xs font-semibold text-emerald-800 flex items-center justify-between">
              <span className="flex items-center gap-2">
                <span className="animate-spin">⏳</span>
                <span>{exportStatusText}</span>
              </span>
              <span className="text-[10px] text-emerald-600 font-normal">Trình duyệt sẽ tự động tải file về máy</span>
            </div>
          )}

          {/* Công cụ hỗ trợ gán nhanh */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-slate-100 text-xs">
            <div className="flex items-center gap-2 text-slate-500">
              <span>💡 Mẹo: Nhấp vào nút</span>
              <span className="rounded bg-blue-100 px-1.5 py-0.5 font-bold text-blue-700">ĐỨC</span>
              <span>hoặc</span>
              <span className="rounded bg-emerald-100 px-1.5 py-0.5 font-bold text-emerald-700">QUÝ</span>
              <span>để chuyển đội cho từng mẻ, hoặc gán nhanh cả ngày ở đầu mỗi cụm ngày!</span>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleAssignAlternating2Days}
                className="rounded-lg border border-slate-200 bg-white px-3 py-1 text-xs font-bold text-indigo-700 hover:bg-indigo-50 transition-all"
                title="Gán tự động: 2 ngày ĐỨC, 2 ngày QUÝ luân phiên"
              >
                ⚡ Gán xen kẽ 2 ngày (ĐỨC ⇄ QUÝ)
              </button>
              <button
                onClick={handleAssignAlternating1Day}
                className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-all"
                title="Gán tự động: ngày lẻ = Đội Đức, ngày chẵn = Đội Quý"
              >
                ⚡ Gán xen kẽ 1 ngày
              </button>
              <button
                onClick={() => setShowAddManual(!showAddManual)}
                className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-all"
              >
                {showAddManual ? '✕ Đóng form thêm' : '+ Thêm công việc thủ công'}
              </button>
            </div>
          </div>

          {exportError && (
            <div className="rounded-lg border border-rose-200 bg-rose-50 p-2 text-xs text-rose-700">
              {exportError}
            </div>
          )}
        </div>
      )}

      {/* ─── Form thêm công việc thủ công ─────────────────────────────────── */}
      {showAddManual && (
        <form
          onSubmit={handleAddManualEntry}
          className="rounded-2xl border-2 border-indigo-200 bg-white p-5 shadow-md space-y-4 text-xs animate-in fade-in duration-150"
        >
          <div className="border-b border-slate-100 pb-2">
            <h3 className="font-bold text-slate-800 uppercase tracking-wide">
              Thêm công việc thủ công (Xuất trấu, xuất gạo, lúa nền...)
            </h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3">
            <div>
              <label className="block font-bold text-slate-700 mb-1">Ngày (dd/mm/yyyy):</label>
              <input
                type="text"
                value={manualDate}
                onChange={(e) => setManualDate(e.target.value)}
                placeholder="01/10/2026"
                className="w-full rounded-lg border border-slate-300 p-2 font-medium"
              />
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">Gán cho đội:</label>
              <select
                value={manualTeam}
                onChange={(e) => setManualTeam(e.target.value as NSXTMTeamKey)}
                className="w-full rounded-lg border border-slate-300 p-2 font-bold"
              >
                <option value="ĐỨC">Đội Anh Đức</option>
                <option value="QUÝ">Đội Anh Quý</option>
              </select>
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">Loại công việc:</label>
              <select
                value={manualType}
                onChange={(e) => setManualType(e.target.value as any)}
                className="w-full rounded-lg border border-slate-300 p-2 font-bold text-indigo-700"
              >
                <option value="TRAU">Xuất trấu ghe (11.000đ/tấn)</option>
                <option value="GAO">Xuất gạo lức (1.650đ/bao)</option>
                <option value="VO_BON">Lúa nền vô bồn (50.000đ/tấn)</option>
                <option value="SAY">Sấy khác (15.000đ/tấn)</option>
              </select>
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">Số lượng (Kg):</label>
              <input
                type="number"
                value={manualKg}
                onChange={(e) => setManualKg(e.target.value)}
                placeholder="VD: 55697"
                className="w-full rounded-lg border border-slate-300 p-2 font-mono font-bold"
              />
            </div>

            <div className="sm:col-span-2 md:col-span-5">
              <label className="block font-bold text-slate-700 mb-1">Nội dung công việc:</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={manualDesc}
                  onChange={(e) => setManualDesc(e.target.value)}
                  placeholder="VD: Xuất trấu ghe Được Phường, Xuất 1 xe Gạo lứt OM18..."
                  className="flex-1 rounded-lg border border-slate-300 p-2"
                />
                <button
                  type="submit"
                  disabled={!manualDesc.trim()}
                  className="rounded-lg bg-indigo-600 px-4 py-2 font-bold text-white hover:bg-indigo-700 disabled:opacity-50"
                >
                  + Thêm dòng
                </button>
              </div>
            </div>
          </div>
        </form>
      )}

      {/* ─── KPI Cards ────────────────────────────────────────────────────── */}
      {monthEntries.length > 0 && (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
              {viewMode === 'ALL' ? 'Toàn bộ mẻ sấy NSX TM' : `Mẻ sấy Đội ${viewMode}`}
            </span>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-bold tracking-tight text-slate-900">{stats.totalEntries}</span>
              <span className="text-xs text-slate-500">mẻ/dòng</span>
            </div>
            <div className="mt-1 text-[11px] text-slate-400">Tổng kg: {formatMoney(stats.totalKg)} kg</div>
          </div>

          <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
              Sản lượng quy đổi
            </span>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-bold tracking-tight text-orange-600">{formatMoney(stats.totalTons)}</span>
              <span className="text-xs text-slate-500">tấn</span>
            </div>
            <div className="mt-1 text-[11px] text-slate-500">
              Lúa tươi: {stats.sayTons} tấn • Lúa khô: {stats.khoTons} tấn
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
              Tiền Lúa Tươi + Khô
            </span>
            <div className="mt-2 flex items-baseline gap-1">
              <span className="text-xl font-bold tracking-tight text-indigo-700">
                {formatMoney(stats.sayMoney + stats.khoMoney)}
              </span>
              <span className="text-xs text-slate-500">đ</span>
            </div>
            <div className="mt-1 text-[11px] text-slate-400">
              Sấy: {formatMoney(stats.sayMoney)} đ • Khô: {formatMoney(stats.khoMoney)} đ
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
              Tổng Quyết Toán {viewMode === 'ALL' ? 'Cả 2 Đội' : `Đội ${viewMode}`}
            </span>
            <div className="mt-2 flex items-baseline gap-1">
              <span className="text-2xl font-black tracking-tight text-emerald-700">
                {formatMoney(stats.grandMoney)}
              </span>
              <span className="text-xs text-slate-500">đ</span>
            </div>
            <div className="mt-1 text-[11px] text-emerald-600 font-semibold">
              {viewMode === 'ALL'
                ? `Đức: ${formatMoney(entriesDuc.reduce((s, e) => s + e.tongThanhTien, 0))} đ • Quý: ${formatMoney(entriesQuy.reduce((s, e) => s + e.tongThanhTien, 0))} đ`
                : `Thực nhận lương Đội ${viewMode}`}
            </div>
          </div>
        </div>
      )}

      {/* ─── Bảng Kê Chi Tiết Gom Nhóm Theo Ngày ────────────────────────────── */}
      {monthEntries.length > 0 && (
        <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm">
          <div className="flex flex-col gap-2 border-b border-slate-100 p-4 sm:flex-row sm:items-center sm:justify-between bg-slate-50/50">
            <div>
              <h2 className="text-sm font-bold text-slate-800">
                Bảng Kê Nhập Sấy NSX TM — Tháng {selectedMonthKey} ({currentEntries.length} mẻ)
              </h2>
              <p className="text-[11px] text-slate-500">
                Đang xem: <strong className="text-indigo-700">{viewMode === 'ALL' ? 'Toàn bộ NSX TM' : `Đội ${viewMode}`}</strong> • Nhấp vào nút Đội ở mỗi dòng để chuyển nhanh
              </p>
            </div>

            <div className="flex items-center gap-2 text-xs">
              <span className="rounded-md bg-blue-50 px-2 py-1 text-blue-700 font-bold border border-blue-200">
                Đội Đức: {entriesDuc.length} mẻ
              </span>
              <span className="rounded-md bg-emerald-50 px-2 py-1 text-emerald-700 font-bold border border-emerald-200">
                Đội Quý: {entriesQuy.length} mẻ
              </span>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-100/80 text-[11px] font-bold uppercase tracking-wider text-slate-600">
                  <th className="py-2.5 px-2 text-center w-10">STT</th>
                  <th className="py-2.5 px-2.5 text-center w-24">Ngày Nhập</th>
                  <th className="py-2.5 px-2 text-center w-24">Đội (Click đổi)</th>
                  <th className="py-2.5 px-2 text-center w-20">Nguồn</th>
                  <th className="py-2.5 px-3">Nội Dung Công Việc (Tự sinh / Sửa)</th>
                  <th className="py-2.5 px-2 text-right w-24">Cân (kg)</th>
                  <th className="py-2.5 px-2 text-right w-20">Tấn</th>
                  <th className="py-2.5 px-2 text-right w-24">Đơn Giá</th>
                  <th className="py-2.5 px-2.5 text-right w-28">Thành Tiền</th>
                  <th className="py-2.5 px-1.5 text-center w-8"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-normal">
                {groupedByDate.map(([dateStr, dayEntries]) => {
                  const dayKg = dayEntries.reduce((s, e) => s + e.weightKg, 0);
                  const dayTons = dayEntries.reduce((s, e) => s + e.roundedTons, 0);
                  const dayMoney = dayEntries.reduce((s, e) => s + e.tongThanhTien, 0);

                  return (
                    <React.Fragment key={dateStr}>
                      {/* Header cụm Ngày */}
                      <tr className="bg-indigo-50/40 border-y border-indigo-100 font-semibold text-slate-800">
                        <td colSpan={5} className="py-2 px-3">
                          <div className="flex flex-wrap items-center gap-3">
                            <span className="inline-flex items-center gap-1.5 font-bold text-indigo-900">
                              <span>📅</span>
                              <span>Ngày nhập: {dateStr}</span>
                            </span>
                            <span className="text-slate-400">•</span>
                            <span className="text-[11px] text-slate-600">
                              {dayEntries.length} mẻ — {dayTons} tấn ({formatMoney(dayKg)} kg)
                            </span>
                            <span className="text-slate-400">•</span>
                            <span className="text-[11px] font-mono font-bold text-emerald-800">
                              {formatMoney(dayMoney)} đ
                            </span>
                          </div>
                        </td>
                        <td colSpan={5} className="py-2 px-3 text-right">
                          <div className="inline-flex items-center gap-1.5 text-[11px]">
                            <span className="text-slate-500 font-normal">Gán cả ngày:</span>
                            <button
                              type="button"
                              onClick={() => handleAssignDayTeam(dateStr, 'ĐỨC')}
                              className="rounded-md border border-blue-200 bg-white px-2 py-0.5 font-bold text-blue-700 hover:bg-blue-50 transition-all shadow-2xs"
                              title="Gán toàn bộ các mẻ ngày này cho Đội Anh Đức"
                            >
                              🔵 Cho Đội Đức
                            </button>
                            <button
                              type="button"
                              onClick={() => handleAssignDayTeam(dateStr, 'QUÝ')}
                              className="rounded-md border border-emerald-200 bg-white px-2 py-0.5 font-bold text-emerald-700 hover:bg-emerald-50 transition-all shadow-2xs"
                              title="Gán toàn bộ các mẻ ngày này cho Đội Anh Quý"
                            >
                              🟢 Cho Đội Quý
                            </button>
                          </div>
                        </td>
                      </tr>

                      {/* Các dòng trong ngày */}
                      {dayEntries.map((e, idx) => {
                        const isDuc = e.team === 'ĐỨC';
                        const unitPriceDisplay = e.source === 'LUA_TUOI'
                          ? (e.vehicleType === 'XE' ? '25.000 (Xe)' : '15.000 (Ghe)')
                          : e.source === 'LUA_KHO'
                          ? '20.000 (Khô)'
                          : e.unitPriceXuatTrau
                          ? '11.000 (Trấu)'
                          : formatMoney(e.unitPriceVoBon || e.unitPriceXuatGao || 0);

                        return (
                          <tr key={e.id} className="hover:bg-slate-50/70 transition-colors">
                            <td className="py-2 px-2 text-center text-slate-400 font-mono text-[11px]">
                              {String(idx + 1).padStart(2, '0')}
                            </td>
                            <td className="py-2 px-2.5 text-center font-mono text-slate-700">
                              {e.date}
                            </td>
                            <td className="py-2 px-2 text-center">
                              <button
                                type="button"
                                onClick={() => handleToggleTeam(e.id)}
                                className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-bold transition-all shadow-2xs ${
                                  isDuc
                                    ? 'bg-blue-100 text-blue-800 border border-blue-200 hover:bg-blue-200'
                                    : 'bg-emerald-100 text-emerald-800 border border-emerald-200 hover:bg-emerald-200'
                                }`}
                                title="Nhấp để chuyển đổi giữa Đội Đức và Đội Quý"
                              >
                                <span>{isDuc ? '🔵' : '🟢'}</span>
                                <span>{e.team}</span>
                              </button>
                            </td>
                            <td className="py-2 px-2 text-center">
                              <span
                                className={`inline-flex items-center justify-center rounded-md px-2 py-0.5 text-[11px] font-bold shadow-2xs ${
                                  e.source === 'LUA_TUOI'
                                    ? 'bg-cyan-100 text-cyan-900 border border-cyan-400'
                                    : e.source === 'LUA_KHO'
                                    ? 'bg-amber-100 text-amber-900 border border-amber-400'
                                    : e.riceType === 'Trấu'
                                    ? 'bg-purple-100 text-purple-900 border border-purple-300'
                                    : 'bg-slate-100 text-slate-700 border border-slate-200'
                                }`}
                              >
                                {e.source === 'LUA_TUOI' ? 'Tươi' : e.source === 'LUA_KHO' ? 'Khô' : e.riceType === 'Trấu' ? 'Trấu' : 'Khác'}
                              </span>
                            </td>
                            <td className="py-2 px-3">
                              <input
                                type="text"
                                value={e.jobDescription}
                                onChange={(evt) =>
                                  handleUpdateEntryField(e.id, 'jobDescription', evt.target.value)
                                }
                                className="w-full rounded border border-transparent bg-transparent px-1.5 py-0.5 text-xs text-slate-800 hover:border-slate-300 focus:bg-white focus:border-indigo-500 focus:outline-none"
                              />
                            </td>
                            <td className="py-2 px-2 text-right font-mono font-medium text-slate-600">
                              {formatMoney(e.weightKg)}
                            </td>
                            <td className="py-2 px-2 text-right">
                              <input
                                type="number"
                                value={e.roundedTons}
                                onChange={(evt) =>
                                  handleUpdateEntryField(e.id, 'roundedTons', evt.target.value)
                                }
                                className="w-16 rounded border border-slate-200 bg-white px-1.5 py-0.5 text-xs font-bold text-right text-indigo-700 focus:border-indigo-500 focus:outline-none"
                              />
                            </td>
                            <td className="py-2 px-2 text-right font-mono text-slate-500 text-[11px]">
                              {unitPriceDisplay}
                            </td>
                            <td className="py-2 px-2.5 text-right font-mono font-bold text-slate-900">
                              {formatMoney(e.tongThanhTien)}
                            </td>
                            <td className="py-2 px-1.5 text-center">
                              <button
                                type="button"
                                onClick={() => handleRemoveEntry(e.id)}
                                className="rounded p-1 text-slate-300 hover:bg-rose-50 hover:text-rose-600 transition-all"
                                title="Xóa dòng này"
                              >
                                ✕
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ─── State trống khi chưa có dữ liệu ──────────────────────────────── */}
      {allEntries.length === 0 && !isParsing && (
        <div className="rounded-2xl border-2 border-dashed border-slate-200 bg-white p-12 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-50 text-2xl text-indigo-700">
            🏭
          </div>
          <h3 className="mt-4 text-sm font-bold text-slate-900">
            Chưa có dữ liệu nhập sấy NSX TM
          </h3>
          <p className="mt-1 text-xs text-slate-500 max-w-md mx-auto">
            Vui lòng nhấn nút <strong className="text-slate-700">Tải File Lúa Tươi</strong> và <strong className="text-slate-700">Tải File Lúa Khô</strong>, hoặc nhấn <strong className="text-slate-700">Nạp Dữ Liệu Mẫu</strong> để tự động trích xuất các mẻ sấy NSX TM của Đội Đức &amp; Đội Quý.
          </p>
          <div className="mt-5 flex justify-center gap-3">
            <button
              onClick={handleLoadSampleData}
              className="rounded-xl bg-indigo-600 px-4 py-2.5 text-xs font-semibold text-white shadow-sm hover:bg-indigo-700 transition-all"
            >
              ⚡ Nạp Dữ Liệu Mẫu Tháng 10/2026
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

