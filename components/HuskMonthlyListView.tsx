'use client';

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import Link from 'next/link';
import ExcelJS from 'exceljs';
import { HuskMonthlyRecord, extractMonthKey } from '@/lib/husk/monthlyTypes';
import { roundRiceTons } from '@/lib/rice-payroll/rounding';
import { parseHuskFromPayrollExcel } from '@/lib/husk/payrollHuskParser';

interface HuskMonthlyListViewProps {
  initialMonth?: string;
  onNavigateToTab?: (tab: 'nhap-trau-moi' | 'quet-anh-cu') => void;
}

const COMMON_MONTHS = [
  '10/2026',
  '11/2026',
  '12/2026',
  '09/2026',
  '08/2026',
  '07/2026',
  '06/2026',
  '05/2026',
  '04/2026',
  '03/2026',
  '02/2026',
  '01/2026',
];

export default function HuskMonthlyListView({
  initialMonth = '10/2026',
  onNavigateToTab,
}: HuskMonthlyListViewProps) {
  // ─── State ────────────────────────────────────────────────────────────────
  const [selectedMonth, setSelectedMonth] = useState<string>(initialMonth);
  const [customMonthInput, setCustomMonthInput] = useState<string>('');
  const [records, setRecords] = useState<HuskMonthlyRecord[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isDeleting, setIsDeleting] = useState<string | null>(null);
  const [isUpdating, setIsUpdating] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Filter state
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [teamFilter, setTeamFilter] = useState<'ALL' | 'ĐỨC' | 'QUÝ'>('ALL');
  const [typeFilter, setTypeFilter] = useState<'ALL' | 'XE' | 'GHE'>('ALL');

  // Delete modal state
  const [recordToDelete, setRecordToDelete] = useState<HuskMonthlyRecord | null>(null);
  const [showClearAllModal, setShowClearAllModal] = useState<boolean>(false);

  // Tải file tính lương để tách xuất trấu
  const payrollInputRef = useRef<HTMLInputElement>(null);
  const [isImportingPayroll, setIsImportingPayroll] = useState<boolean>(false);
  const [importedPreview, setImportedPreview] = useState<HuskMonthlyRecord[] | null>(null);

  // Nhập trấu thủ công (hỗ trợ nhiều hàng giống tab Nhập Trấu Mới)
  interface ManualRowDraft {
    id: string;
    date: string;
    team: 'ĐỨC' | 'QUÝ';
    type: 'XE' | 'GHE';
    vehicle: string;
    customer: string;
    weightKg: string;
    unitPrice: string;
    note: string;
  }
  const makeEmptyManualRow = (
    dateStr: string,
    teamVal: 'ĐỨC' | 'QUÝ' = 'ĐỨC',
    typeVal: 'XE' | 'GHE' = 'XE'
  ): ManualRowDraft => ({
    id: `m-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    date: dateStr,
    team: teamVal,
    type: typeVal,
    vehicle: '',
    customer: '',
    weightKg: '',
    unitPrice: typeVal === 'GHE' ? '7000' : '11000',
    note: '',
  });

  const [showManualForm, setShowManualForm] = useState<boolean>(false);
  const [isSavingManual, setIsSavingManual] = useState<boolean>(false);
  const [manualDefaultDate, setManualDefaultDate] = useState<string>(() => {
    const [mm, yyyy] = initialMonth.split('/');
    return `01/${mm || '11'}/${yyyy || '2026'}`;
  });
  const [manualDefaultTeam, setManualDefaultTeam] = useState<'ĐỨC' | 'QUÝ'>('ĐỨC');
  const [manualDefaultType, setManualDefaultType] = useState<'XE' | 'GHE'>('XE');
  const [manualRows, setManualRows] = useState<ManualRowDraft[]>(() => {
    const [mm, yyyy] = initialMonth.split('/');
    const d = `01/${mm || '11'}/${yyyy || '2026'}`;
    return [makeEmptyManualRow(d), makeEmptyManualRow(d), makeEmptyManualRow(d)];
  });

  // Xem & Chỉnh sửa từng mẻ trong CSDL
  const [viewingRecord, setViewingRecord] = useState<HuskMonthlyRecord | null>(null);
  const [editingRecord, setEditingRecord] = useState<HuskMonthlyRecord | null>(null);
  const [isSavingEdit, setIsSavingEdit] = useState<boolean>(false);

  // ─── Tải dữ liệu từ API CSDL theo tháng ────────────────────────────────────
  const fetchMonthRecords = useCallback(async (month: string) => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const res = await fetch(`/api/husk/monthly?month=${encodeURIComponent(month)}`);
      if (!res.ok) {
        throw new Error(`Lỗi máy chủ (${res.status})`);
      }
      const data = await res.json();
      if (data.success && Array.isArray(data.items)) {
        setRecords(data.items);
      } else {
        setRecords([]);
      }
    } catch (err: unknown) {
      console.error('[HuskMonthlyListView] Fetch error:', err);
      setErrorMessage(
        'Không thể tải dữ liệu xuất trấu Tháng ' +
          month +
          ': ' +
          (err instanceof Error ? err.message : String(err))
      );
      setRecords([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedMonth) {
      fetchMonthRecords(selectedMonth);
    }
  }, [selectedMonth, fetchMonthRecords]);

  // ─── Xóa một mẻ trấu ─────────────────────────────────────────────────────
  const handleDeleteRecord = async (record: HuskMonthlyRecord) => {
    setIsDeleting(record.id);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      const res = await fetch(
        `/api/husk/monthly?month=${encodeURIComponent(selectedMonth)}&id=${encodeURIComponent(record.id)}`,
        { method: 'DELETE' }
      );
      const data = await res.json();
      if (data.success && Array.isArray(data.items)) {
        setRecords(data.items);
        setSuccessMessage(`✅ Đã xóa mẻ trấu của khách "${record.customer}" thành công!`);
      } else {
        throw new Error(data.error || 'Xóa mẻ trấu thất bại');
      }
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setIsDeleting(null);
      setRecordToDelete(null);
    }
  };

  // ─── Xóa toàn bộ tháng ────────────────────────────────────────────────────
  const handleClearAllMonth = async () => {
    setIsDeleting('ALL');
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      const res = await fetch(
        `/api/husk/monthly?month=${encodeURIComponent(selectedMonth)}&all=true`,
        { method: 'DELETE' }
      );
      const data = await res.json();
      if (data.success) {
        setRecords([]);
        setSuccessMessage(`✅ Đã xóa toàn bộ số liệu xuất trấu của Tháng ${selectedMonth}!`);
      } else {
        throw new Error(data.error || 'Xóa tháng thất bại');
      }
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setIsDeleting(null);
      setShowClearAllModal(false);
    }
  };

  // ─── Chuyển nhanh Đội (Đức <-> Quý) ───────────────────────────────────────
  const handleToggleTeam = async (record: HuskMonthlyRecord) => {
    const newTeam: 'ĐỨC' | 'QUÝ' = record.team === 'ĐỨC' ? 'QUÝ' : 'ĐỨC';
    setIsUpdating(record.id);
    setErrorMessage(null);
    try {
      const res = await fetch('/api/husk/monthly', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          monthKey: selectedMonth,
          item: { id: record.id, team: newTeam },
        }),
      });
      const data = await res.json();
      if (data.success && Array.isArray(data.items)) {
        setRecords(data.items);
        setSuccessMessage(`Đã đổi mẻ của "${record.customer}" sang Đội ${newTeam}!`);
      } else {
        throw new Error(data.error || 'Cập nhật đội thất bại');
      }
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setIsUpdating(null);
    }
  };

  // ─── Xuất Excel Danh Sách Tháng ───────────────────────────────────────────
  const handleExportExcel = async () => {
    if (records.length === 0) return;
    try {
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet(`Trấu Tháng ${selectedMonth.replace('/', '-')}`, {
        views: [{ showGridLines: true }],
      });

      // Header row
      ws.columns = [
        { header: 'STT', key: 'stt', width: 8 },
        { header: 'NGÀY', key: 'date', width: 14 },
        { header: 'ĐỘI PHỤ TRÁCH', key: 'team', width: 16 },
        { header: 'LOẠI', key: 'type', width: 10 },
        { header: 'PHƯƠNG TIỆN / BIỂN SỐ', key: 'vehicle', width: 22 },
        { header: 'KHÁCH HÀNG', key: 'customer', width: 24 },
        { header: 'TRỌNG LƯỢNG (KG)', key: 'kg', width: 18 },
        { header: 'SỐ TẤN', key: 'tons', width: 14 },
        { header: 'ĐƠN GIÁ (Đ/TẤN)', key: 'unitPrice', width: 18 },
        { header: 'THÀNH TIỀN (VNĐ)', key: 'amount', width: 20 },
        { header: 'DIỄN GIẢI CÔNG VIỆC', key: 'desc', width: 32 },
        { header: 'GHI CHÚ', key: 'note', width: 24 },
      ];

      // Title row
      ws.spliceRows(1, 0, [
        `BẢNG KÊ CHI TIẾT XUẤT TRẤU THÁNG ${selectedMonth} (TỰ ĐỘNG ĐIỀN NSX TM)`,
      ]);
      ws.mergeCells('A1:L1');
      const titleCell = ws.getCell('A1');
      titleCell.font = { name: 'Calibri', size: 14, bold: true, color: { argb: 'FFFFFFFF' } };
      titleCell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFD97706' }, // Amber 600
      };
      titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
      ws.getRow(1).height = 32;

      // Header styling
      const headerRow = ws.getRow(2);
      headerRow.height = 26;
      headerRow.eachCell((cell) => {
        cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FF1F2937' }, // Dark slate
        };
        cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      });

      // Data rows
      filteredRecords.forEach((r, idx) => {
        const row = ws.addRow({
          stt: idx + 1,
          date: r.date,
          team: `Đội ${r.team}`,
          type: r.type,
          vehicle: r.vehicle,
          customer: r.customer,
          kg: r.weightKg,
          tons: r.tons,
          unitPrice: r.unitPrice,
          amount: r.amount,
          desc: r.description || '',
          note: r.note || '',
        });

        row.getCell('stt').alignment = { horizontal: 'center' };
        row.getCell('date').alignment = { horizontal: 'center' };
        row.getCell('team').alignment = { horizontal: 'center' };
        row.getCell('type').alignment = { horizontal: 'center' };
        row.getCell('kg').numFmt = '#,##0';
        row.getCell('tons').numFmt = '#,##0.0';
        row.getCell('unitPrice').numFmt = '#,##0';
        row.getCell('amount').numFmt = '#,##0';
      });

      // Summary row
      const summaryRow = ws.addRow({
        stt: '',
        date: '',
        team: 'TỔNG CỘNG',
        type: '',
        vehicle: '',
        customer: `${filteredRecords.length} mẻ`,
        kg: summary.totalKg,
        tons: summary.totalTons,
        unitPrice: '',
        amount: summary.totalAmount,
        desc: '',
        note: '',
      });
      summaryRow.height = 24;
      summaryRow.eachCell((cell) => {
        cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFB45309' } };
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFFEF3C7' },
        };
      });
      summaryRow.getCell('kg').numFmt = '#,##0';
      summaryRow.getCell('tons').numFmt = '#,##0.0';
      summaryRow.getCell('amount').numFmt = '#,##0';

      const buffer = await wb.xlsx.writeBuffer();
      const blob = new Blob([buffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `DS_XUAT_TRAU_THANG_${selectedMonth.replace('/', '_')}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err: unknown) {
      setErrorMessage(
        'Không thể xuất file Excel: ' + (err instanceof Error ? err.message : String(err))
      );
    }
  };

  // ─── Lọc danh sách mẻ trấu ────────────────────────────────────────────────
  const filteredRecords = useMemo(() => {
    return records.filter((r) => {
      // Filter by team
      if (teamFilter !== 'ALL' && r.team !== teamFilter) return false;

      // Filter by vehicle type
      if (typeFilter !== 'ALL' && r.type !== typeFilter) return false;

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const customerMatch = (r.customer || '').toLowerCase().includes(q);
        const vehicleMatch = (r.vehicle || '').toLowerCase().includes(q);
        const descMatch = (r.description || '').toLowerCase().includes(q);
        const dateMatch = (r.date || '').toLowerCase().includes(q);
        if (!customerMatch && !vehicleMatch && !descMatch && !dateMatch) return false;
      }

      return true;
    });
  }, [records, teamFilter, typeFilter, searchQuery]);

  // ─── Thống kê tổng hợp ────────────────────────────────────────────────────
  const summary = useMemo(() => {
    const totalCount = filteredRecords.length;
    const totalKg = filteredRecords.reduce((sum, r) => sum + (r.weightKg || 0), 0);
    const totalTons = filteredRecords.reduce((sum, r) => sum + (r.tons || 0), 0);
    const totalAmount = filteredRecords.reduce((sum, r) => sum + (r.amount || 0), 0);

    const ducRecords = filteredRecords.filter((r) => r.team === 'ĐỨC');
    const ducCount = ducRecords.length;
    const ducTons = ducRecords.reduce((sum, r) => sum + (r.tons || 0), 0);
    const ducAmount = ducRecords.reduce((sum, r) => sum + (r.amount || 0), 0);

    const quyRecords = filteredRecords.filter((r) => r.team === 'QUÝ');
    const quyCount = quyRecords.length;
    const quyTons = quyRecords.reduce((sum, r) => sum + (r.tons || 0), 0);
    const quyAmount = quyRecords.reduce((sum, r) => sum + (r.amount || 0), 0);

    const xeCount = filteredRecords.filter((r) => r.type === 'XE').length;
    const gheCount = filteredRecords.filter((r) => r.type === 'GHE').length;

    return {
      totalCount,
      totalKg,
      totalTons: Math.round(totalTons * 10) / 10,
      totalAmount,
      ducCount,
      ducTons: Math.round(ducTons * 10) / 10,
      ducAmount,
      quyCount,
      quyTons: Math.round(quyTons * 10) / 10,
      quyAmount,
      xeCount,
      gheCount,
    };
  }, [filteredRecords]);

  // ─── Đọc file tính lương Excel & tách Xuất Trấu ──────────────────────────
  const handlePayrollFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setErrorMessage(null);
    setSuccessMessage(null);
    setIsImportingPayroll(true);
    try {
      const buf = await file.arrayBuffer();
      const parsed = parseHuskFromPayrollExcel(buf);
      if (parsed.length === 0) {
        throw new Error('Không tìm thấy dòng Xuất Trấu nào trong file tính lương này!');
      }
      setImportedPreview(parsed);
    } catch (err: unknown) {
      setErrorMessage('Lỗi đọc file tính lương: ' + (err instanceof Error ? err.message : String(err)));
      setImportedPreview(null);
    } finally {
      setIsImportingPayroll(false);
      if (payrollInputRef.current) payrollInputRef.current.value = '';
    }
  };

  const handleConfirmImportPayroll = async () => {
    if (!importedPreview || importedPreview.length === 0) return;
    setIsImportingPayroll(true);
    setErrorMessage(null);
    try {
      const res = await fetch('/api/husk/monthly', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: importedPreview }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Không thể lưu vào CSDL');
      }
      const savedMonths: string[] = Array.isArray(data.savedMonths) ? data.savedMonths : [selectedMonth];
      const targetMonth = savedMonths[0] || selectedMonth;
      setImportedPreview(null);
      setSuccessMessage(
        `✅ Đã tách và lưu thành công ${importedPreview.length} mẻ xuất trấu vào CSDL (Tháng ${savedMonths.join(', ')})!`
      );
      if (targetMonth !== selectedMonth) {
        setSelectedMonth(targetMonth);
      } else {
        await fetchMonthRecords(targetMonth);
      }
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setIsImportingPayroll(false);
    }
  };

  // ─── Nhập trấu thủ công (Bảng nhiều hàng giống bên Nhập Trấu Mới) ──────────
  const handleUpdateManualRow = (id: string, field: keyof ManualRowDraft, value: string) => {
    setManualRows((prev) =>
      prev.map((row) => {
        if (row.id !== id) return row;
        const updated = { ...row, [field]: value };
        if (field === 'type') {
          updated.unitPrice = value === 'GHE' ? '7000' : '11000';
        }
        return updated;
      })
    );
  };

  const handleApplyManualDefaults = () => {
    setManualRows((prev) =>
      prev.map((row) => ({
        ...row,
        date: manualDefaultDate,
        team: manualDefaultTeam,
        type: manualDefaultType,
        unitPrice: manualDefaultType === 'GHE' ? '7000' : '11000',
      }))
    );
  };

  const handleAddManualRows = (count: number) => {
    const news = Array.from({ length: count }, () =>
      makeEmptyManualRow(manualDefaultDate, manualDefaultTeam, manualDefaultType)
    );
    setManualRows((prev) => [...prev, ...news]);
  };

  const handleRemoveManualRow = (id: string) => {
    setManualRows((prev) => (prev.length > 1 ? prev.filter((r) => r.id !== id) : prev));
  };

  const handleSaveManualRows = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    const validRows = manualRows.filter((r) => {
      const kg = parseFloat(r.weightKg.replace(/[^\d.]/g, '')) || 0;
      return kg > 0;
    });

    if (validRows.length === 0) {
      setErrorMessage('Vui lòng nhập trọng lượng (Kg) lớn hơn 0 cho ít nhất 1 dòng!');
      return;
    }

    const itemsToSave: HuskMonthlyRecord[] = [];
    for (const row of validRows) {
      const mKey = extractMonthKey(row.date) || selectedMonth;
      if (!row.date.trim() || !mKey) {
        setErrorMessage('Có dòng bị sai định dạng ngày (cần dạng DD/MM/YYYY, vd: 15/11/2026).');
        return;
      }
      const weightKg = parseFloat(row.weightKg.replace(/[^\d.]/g, '')) || 0;
      const unitPrice = parseFloat(row.unitPrice.replace(/[^\d.]/g, '')) || (row.type === 'GHE' ? 7000 : 11000);
      const tons = roundRiceTons(weightKg);
      const amount = Math.round(tons * unitPrice);
      const cleanCustomer = row.customer.trim().toUpperCase() || 'KHÁCH LẺ';
      const cleanVehicle =
        row.vehicle.trim().toUpperCase() || (row.type === 'GHE' ? `Ghe ${cleanCustomer}` : 'Xe');

      itemsToSave.push({
        id: `manual-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        date: row.date.trim(),
        monthKey: mKey,
        team: row.team,
        customer: cleanCustomer,
        vehicle: cleanVehicle,
        type: row.type,
        weightKg,
        tons,
        unitPrice,
        amount,
        note: row.note.trim() || 'Nhập trấu thủ công',
        description:
          row.type === 'GHE'
            ? `Xuất trấu ghe ${cleanCustomer}`
            : `Xuất một xe trấu ${cleanVehicle} của ${cleanCustomer}`.replace(/\s+/g, ' ').trim(),
        sourceTab: 'NHAP_MOI',
      });
    }

    setIsSavingManual(true);
    try {
      const res = await fetch('/api/husk/monthly', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: itemsToSave }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Lỗi lưu mẻ trấu thủ công');
      }
      const savedMonths: string[] = Array.isArray(data.savedMonths) ? data.savedMonths : [selectedMonth];
      const targetMonth = savedMonths[0] || selectedMonth;
      setManualRows([
        makeEmptyManualRow(manualDefaultDate, manualDefaultTeam, manualDefaultType),
        makeEmptyManualRow(manualDefaultDate, manualDefaultTeam, manualDefaultType),
        makeEmptyManualRow(manualDefaultDate, manualDefaultTeam, manualDefaultType),
      ]);
      setShowManualForm(false);
      setSuccessMessage(
        `✅ Đã lưu thành công ${itemsToSave.length} mẻ xuất trấu vào CSDL (Tháng ${savedMonths.join(', ')})!`
      );
      if (targetMonth !== selectedMonth) {
        setSelectedMonth(targetMonth);
      } else {
        await fetchMonthRecords(targetMonth);
      }
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSavingManual(false);
    }
  };

  // ─── Lưu chỉnh sửa 1 mẻ trấu ──────────────────────────────────────────────
  const handleSaveEditRecord = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingRecord) return;
    setIsSavingEdit(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      const res = await fetch('/api/husk/monthly', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          monthKey: selectedMonth,
          item: editingRecord,
        }),
      });
      const data = await res.json();
      if (data.success && Array.isArray(data.items)) {
        setRecords(data.items);
        setSuccessMessage(`✅ Đã cập nhật mẻ trấu của "${editingRecord.customer}"!`);
        setEditingRecord(null);
      } else {
        throw new Error(data.error || 'Cập nhật mẻ trấu thất bại');
      }
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSavingEdit(false);
    }
  };

  // Handle custom month submit
  const handleApplyCustomMonth = () => {
    const clean = customMonthInput.trim();
    const match = clean.match(/^(\d{1,2})\/(\d{4})$/);
    if (!match) {
      setErrorMessage('Định dạng tháng không hợp lệ. Vui lòng nhập đúng dạng MM/YYYY (vd: 10/2026)');
      return;
    }
    const mm = String(parseInt(match[1], 10)).padStart(2, '0');
    const yyyy = match[2];
    const key = `${mm}/${yyyy}`;
    setSelectedMonth(key);
    setCustomMonthInput('');
    setErrorMessage(null);
  };

  return (
    <div className="space-y-6">
      {/* ─── Top Header Card ──────────────────────────────────────────────── */}
      <div className="rounded-3xl border border-amber-200/90 bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-orange-500/10 p-6 sm:p-8 backdrop-blur-md shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-tr from-amber-600 to-orange-600 text-3xl text-white shadow-lg shadow-amber-500/25 ring-4 ring-amber-100">
              📊
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                  Danh Sách Xuất Trấu Đã Lưu CSDL Theo Tháng
                </h1>
                <span className="rounded-full bg-amber-600 text-white text-[10px] px-2.5 py-0.5 font-bold shadow-2xs">
                  CSDL THÁNG
                </span>
              </div>
              <p className="text-xs sm:text-sm text-slate-600 mt-1">
                Xem lại toàn bộ các mẻ trấu đã lưu trong CSDL của{' '}
                <strong className="text-amber-900 font-bold">Tháng {selectedMonth}</strong> — Tự động
                đồng bộ sang phân hệ <strong className="text-indigo-800">Nhập Sấy NSX TM</strong>.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={payrollInputRef}
              type="file"
              accept=".xlsx,.xls"
              onChange={handlePayrollFileChange}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => payrollInputRef.current?.click()}
              disabled={isImportingPayroll}
              className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-violet-600 to-purple-700 hover:from-violet-700 hover:to-purple-800 text-white px-3.5 py-2 text-xs font-bold shadow-xs transition-all cursor-pointer active:scale-95 disabled:opacity-50"
              title="Tải file Excel bảng lương (Đội Đức / Đội Quý) để tự động tách và lưu các dòng Xuất Trấu vào CSDL"
            >
              <span>{isImportingPayroll ? '⏳' : '📤'}</span>
              <span>Tải File Tính Lương</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setShowManualForm((prev) => !prev);
                const [mm, yyyy] = selectedMonth.split('/');
                if (mm && yyyy) {
                  const d = `01/${mm}/${yyyy}`;
                  setManualDefaultDate(d);
                  setManualRows((rows) =>
                    rows.map((r) => (r.weightKg ? r : { ...r, date: d }))
                  );
                }
              }}
              className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-700 hover:to-orange-700 text-white px-3.5 py-2 text-xs font-bold shadow-xs transition-all cursor-pointer active:scale-95"
              title="Mở bảng nhập nhiều dòng xuất trấu xe/ghe vào CSDL tháng"
            >
              <span>➕</span>
              <span>Nhập Thủ Công</span>
            </button>

            <button
              type="button"
              onClick={() => fetchMonthRecords(selectedMonth)}
              disabled={isLoading}
              className="inline-flex items-center gap-1.5 rounded-xl bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 px-3.5 py-2 text-xs font-bold shadow-xs transition-all cursor-pointer active:scale-95 disabled:opacity-50"
              title="Tải lại dữ liệu mới nhất từ CSDL"
            >
              <span>{isLoading ? '⏳' : '🔄'}</span>
              <span>Làm Mới</span>
            </button>

            <button
              type="button"
              onClick={handleExportExcel}
              disabled={records.length === 0}
              className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-700 hover:to-teal-800 disabled:opacity-50 text-white px-3.5 py-2 text-xs font-bold shadow-xs transition-all cursor-pointer active:scale-95"
              title="Xuất bảng kê chi tiết ra file Excel"
            >
              <span>📥</span>
              <span>Xuất Excel Tháng {selectedMonth}</span>
            </button>

            <Link
              href="/nhap-say-tm"
              className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-indigo-600 to-blue-700 hover:from-indigo-700 hover:to-blue-800 text-white px-3.5 py-2 text-xs font-bold shadow-xs transition-all cursor-pointer active:scale-95"
              title="Chuyển đến phân hệ Nhập Sấy NSX TM để xem bảng tính lương Đội Đức & Đội Quý"
            >
              <span>🌾</span>
              <span>Mở Nhập Sấy NSX TM &rarr;</span>
            </Link>
          </div>
        </div>

        {/* ─── Thanh Chọn Tháng ────────────────────────────────────────────── */}
        <div className="mt-6 pt-5 border-t border-amber-200/60 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs font-bold text-slate-700 mr-1 flex items-center gap-1">
              <span>📅</span> Chọn tháng:
            </span>
            {COMMON_MONTHS.slice(0, 6).map((mk) => (
              <button
                key={mk}
                type="button"
                onClick={() => setSelectedMonth(mk)}
                className={`rounded-xl px-3 py-1.5 text-xs font-bold transition-all cursor-pointer ${
                  selectedMonth === mk
                    ? 'bg-gradient-to-r from-amber-600 to-orange-600 text-white shadow-md shadow-amber-600/20 ring-2 ring-amber-300'
                    : 'bg-white/80 hover:bg-white text-slate-700 border border-slate-200 hover:border-amber-300 shadow-2xs'
                }`}
              >
                Tháng {mk}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-xl px-2.5 py-1 shadow-2xs">
              <span className="text-[11px] text-slate-400 font-semibold">Khác:</span>
              <input
                type="text"
                placeholder="MM/YYYY (vd: 01/2026)"
                value={customMonthInput}
                onChange={(e) => setCustomMonthInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleApplyCustomMonth()}
                className="w-28 text-xs font-bold text-slate-800 focus:outline-none placeholder:font-normal placeholder:text-slate-400"
              />
              <button
                type="button"
                onClick={handleApplyCustomMonth}
                className="text-xs font-bold text-amber-700 hover:text-amber-900 px-1 py-0.5 rounded cursor-pointer"
              >
                Xem
              </button>
            </div>

            {records.length > 0 && (
              <button
                type="button"
                onClick={() => setShowClearAllModal(true)}
                className="text-[11px] font-bold text-red-600 hover:text-red-800 hover:bg-red-50 border border-red-200 rounded-xl px-2.5 py-1.5 transition cursor-pointer"
                title="Xóa toàn bộ số liệu xuất trấu của tháng này"
              >
                🗑️ Xóa Tháng
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Thông báo Thành công / Lỗi */}
      {successMessage && (
        <div className="rounded-2xl bg-emerald-50 border border-emerald-200 p-4 text-xs font-semibold text-emerald-800 flex items-center justify-between shadow-xs animate-in fade-in">
          <div className="flex items-center gap-2">
            <span className="text-base">✅</span>
            <span>{successMessage}</span>
          </div>
          <button
            type="button"
            onClick={() => setSuccessMessage(null)}
            className="text-slate-400 hover:text-slate-600 text-sm cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      {errorMessage && (
        <div className="rounded-2xl bg-red-50 border border-red-200 p-4 text-xs font-semibold text-red-800 flex items-center justify-between shadow-xs animate-in fade-in">
          <div className="flex items-center gap-2">
            <span className="text-base">⚠️</span>
            <span>{errorMessage}</span>
          </div>
          <button
            type="button"
            onClick={() => setErrorMessage(null)}
            className="text-slate-400 hover:text-slate-600 text-sm cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      {/* ─── Preview Bóc Tách Từ File Tính Lương ───────────────────────────── */}
      {importedPreview && importedPreview.length > 0 && (
        <div className="rounded-3xl border-2 border-violet-300 bg-gradient-to-br from-violet-50 via-purple-50/40 to-white p-5 shadow-md space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-violet-200 pb-3">
            <div>
              <h3 className="text-sm font-black text-violet-950 flex items-center gap-2">
                <span>📤</span>
                <span>
                  Đã bóc tách {importedPreview.length} mẻ Xuất Trấu từ file tính lương (
                  {importedPreview.reduce((s, r) => s + r.tons, 0).toLocaleString('vi-VN')} tấn &bull;{' '}
                  {importedPreview.reduce((s, r) => s + r.amount, 0).toLocaleString('vi-VN')} đ)
                </span>
              </h3>
              <p className="text-xs text-violet-700 mt-0.5">
                Các tháng phát hiện:{' '}
                <strong>
                  {Array.from(new Set(importedPreview.map((r) => r.monthKey))).join(', ')}
                </strong>
                . Bấm &quot;Xác Nhận Lưu CSDL&quot; để cập nhật ngay vào cơ sở dữ liệu theo tháng.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setImportedPreview(null)}
                className="rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50 cursor-pointer"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={handleConfirmImportPayroll}
                disabled={isImportingPayroll}
                className="rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 px-4 py-2 text-xs font-black text-white shadow-md hover:from-violet-700 hover:to-indigo-700 disabled:opacity-50 cursor-pointer"
              >
                {isImportingPayroll ? '⏳ Đang lưu...' : '💾 Xác Nhận Lưu Vào CSDL'}
              </button>
            </div>
          </div>

          <div className="max-h-56 overflow-y-auto rounded-xl border border-violet-200 bg-white">
            <table className="w-full text-left text-xs">
              <thead className="bg-violet-50 text-[11px] font-bold text-violet-900 sticky top-0">
                <tr>
                  <th className="px-3 py-2">Ngày</th>
                  <th className="px-3 py-2">Tháng</th>
                  <th className="px-3 py-2">Đội</th>
                  <th className="px-3 py-2">Phương Tiện</th>
                  <th className="px-3 py-2">Khách Hàng</th>
                  <th className="px-3 py-2 text-right">Kg</th>
                  <th className="px-3 py-2 text-right">Tấn</th>
                  <th className="px-3 py-2 text-right">Thành Tiền</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {importedPreview.map((r, idx) => (
                  <tr key={idx} className="hover:bg-violet-50/40">
                    <td className="px-3 py-1.5 font-mono">{r.date}</td>
                    <td className="px-3 py-1.5 font-bold text-violet-700">{r.monthKey}</td>
                    <td className="px-3 py-1.5 font-bold">{r.team}</td>
                    <td className="px-3 py-1.5 font-mono">{r.vehicle}</td>
                    <td className="px-3 py-1.5 font-semibold">{r.customer}</td>
                    <td className="px-3 py-1.5 text-right font-mono">{r.weightKg.toLocaleString('vi-VN')}</td>
                    <td className="px-3 py-1.5 text-right font-bold">{r.tons}</td>
                    <td className="px-3 py-1.5 text-right font-bold text-emerald-700">
                      {r.amount.toLocaleString('vi-VN')} đ
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ─── Form Nhập Trấu Thủ Công (Bảng nhiều hàng giống Nhập Trấu Mới) ── */}
      {showManualForm && (
        <form
          onSubmit={handleSaveManualRows}
          className="rounded-3xl border-2 border-amber-300 bg-gradient-to-br from-amber-50/80 via-orange-50/30 to-white p-5 shadow-md space-y-4"
        >
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-amber-200 pb-3">
            <div>
              <h3 className="text-sm font-black text-amber-950 flex items-center gap-2">
                <span>➕</span>
                <span>Bảng Nhập Xuất Trấu Thủ Công (Nhiều Dòng - Xe &amp; Ghe)</span>
              </h3>
              <p className="text-xs text-amber-800 mt-0.5">
                Cài nhanh thông số mặc định hoặc thêm nhiều dòng Xe/Ghe cùng lúc, tự động quy đổi số tấn &amp; lưu thẳng vào CSDL tháng.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowManualForm(false)}
              className="text-xs font-bold text-slate-500 hover:text-slate-800 cursor-pointer"
            >
              ✕ Đóng
            </button>
          </div>

          {/* Thanh cài nhanh mặc định */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-white/90 p-3">
            <div className="flex flex-wrap items-center gap-2.5 text-xs">
              <div className="flex items-center gap-1.5">
                <span className="font-bold text-slate-700">Ngày nhanh:</span>
                <input
                  type="text"
                  value={manualDefaultDate}
                  onChange={(e) => setManualDefaultDate(e.target.value)}
                  placeholder="DD/MM/YYYY"
                  className="w-28 rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-semibold text-slate-800"
                />
              </div>

              <div className="flex items-center gap-1.5">
                <span className="font-bold text-slate-700">Đội:</span>
                <select
                  value={manualDefaultTeam}
                  onChange={(e) => setManualDefaultTeam(e.target.value as 'ĐỨC' | 'QUÝ')}
                  className="rounded-lg border border-slate-300 px-2 py-1 text-xs font-bold text-slate-800"
                >
                  <option value="ĐỨC">ĐỨC</option>
                  <option value="QUÝ">QUÝ</option>
                </select>
              </div>

              <div className="flex items-center gap-1.5">
                <span className="font-bold text-slate-700">Loại:</span>
                <div className="inline-flex rounded-lg border border-slate-300 bg-slate-100 p-0.5">
                  <button
                    type="button"
                    onClick={() => setManualDefaultType('XE')}
                    className={`px-2.5 py-0.5 rounded-md text-xs font-bold transition-all cursor-pointer ${
                      manualDefaultType === 'XE' ? 'bg-white text-blue-700 shadow-2xs' : 'text-slate-600'
                    }`}
                  >
                    Xe (11.000đ)
                  </button>
                  <button
                    type="button"
                    onClick={() => setManualDefaultType('GHE')}
                    className={`px-2.5 py-0.5 rounded-md text-xs font-bold transition-all cursor-pointer ${
                      manualDefaultType === 'GHE' ? 'bg-white text-emerald-700 shadow-2xs' : 'text-slate-600'
                    }`}
                  >
                    Ghe (7.000đ)
                  </button>
                </div>
              </div>

              <button
                type="button"
                onClick={handleApplyManualDefaults}
                className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-[11px] cursor-pointer"
              >
                Áp dụng tất cả
              </button>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => handleAddManualRows(1)}
                className="rounded-lg border border-amber-300 bg-amber-50 hover:bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-900 cursor-pointer"
              >
                + Thêm 1 dòng
              </button>
              <button
                type="button"
                onClick={() => handleAddManualRows(5)}
                className="rounded-lg border border-amber-300 bg-amber-50 hover:bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-900 cursor-pointer"
              >
                + Thêm 5 dòng
              </button>
            </div>
          </div>

          {/* Bảng nhập nhiều hàng */}
          <div className="overflow-x-auto rounded-2xl border border-amber-200 bg-white">
            <table className="w-full text-left text-xs">
              <thead className="bg-amber-50/90 text-[11px] font-bold text-amber-950 border-b border-amber-200">
                <tr>
                  <th className="px-2.5 py-2 text-center w-10">STT</th>
                  <th className="px-2.5 py-2 w-28">Ngày</th>
                  <th className="px-2.5 py-2 w-24">Đội</th>
                  <th className="px-2.5 py-2 w-24">Loại</th>
                  <th className="px-2.5 py-2 min-w-[130px]">Biển Số / Tên Ghe</th>
                  <th className="px-2.5 py-2 min-w-[150px]">Khách Hàng</th>
                  <th className="px-2.5 py-2 w-28 text-right">Trọng Lượng (Kg)</th>
                  <th className="px-2.5 py-2 w-20 text-right">Số Tấn</th>
                  <th className="px-2.5 py-2 w-24 text-right">Đơn Giá</th>
                  <th className="px-2.5 py-2 w-28 text-right">Thành Tiền</th>
                  <th className="px-2.5 py-2 min-w-[120px]">Ghi Chú</th>
                  <th className="px-2.5 py-2 text-center w-12">Xóa</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {manualRows.map((row, idx) => {
                  const kg = parseFloat(row.weightKg.replace(/[^\d.]/g, '')) || 0;
                  const price = parseFloat(row.unitPrice.replace(/[^\d.]/g, '')) || 0;
                  const tons = roundRiceTons(kg);
                  const amount = Math.round(tons * price);
                  return (
                    <tr key={row.id} className="hover:bg-amber-50/30">
                      <td className="px-2.5 py-1.5 text-center text-slate-400 font-bold">{idx + 1}</td>
                      <td className="px-1.5 py-1.5">
                        <input
                          type="text"
                          value={row.date}
                          onChange={(e) => handleUpdateManualRow(row.id, 'date', e.target.value)}
                          placeholder="DD/MM/YYYY"
                          className="w-full rounded-lg border border-slate-200 px-2 py-1 text-xs font-mono focus:border-amber-500 focus:outline-none"
                        />
                      </td>
                      <td className="px-1.5 py-1.5">
                        <select
                          value={row.team}
                          onChange={(e) => handleUpdateManualRow(row.id, 'team', e.target.value)}
                          className="w-full rounded-lg border border-slate-200 px-1.5 py-1 text-xs font-bold focus:border-amber-500 focus:outline-none"
                        >
                          <option value="ĐỨC">ĐỨC</option>
                          <option value="QUÝ">QUÝ</option>
                        </select>
                      </td>
                      <td className="px-1.5 py-1.5">
                        <select
                          value={row.type}
                          onChange={(e) => handleUpdateManualRow(row.id, 'type', e.target.value)}
                          className="w-full rounded-lg border border-slate-200 px-1.5 py-1 text-xs font-bold focus:border-amber-500 focus:outline-none"
                        >
                          <option value="XE">🚛 Xe</option>
                          <option value="GHE">🚤 Ghe</option>
                        </select>
                      </td>
                      <td className="px-1.5 py-1.5">
                        <input
                          type="text"
                          value={row.vehicle}
                          onChange={(e) => handleUpdateManualRow(row.id, 'vehicle', e.target.value)}
                          placeholder={row.type === 'GHE' ? 'Tên ghe...' : 'VD: 50H 65334'}
                          className="w-full rounded-lg border border-slate-200 px-2 py-1 text-xs font-semibold focus:border-amber-500 focus:outline-none"
                        />
                      </td>
                      <td className="px-1.5 py-1.5">
                        <input
                          type="text"
                          value={row.customer}
                          onChange={(e) => handleUpdateManualRow(row.id, 'customer', e.target.value)}
                          placeholder="Khách hàng..."
                          className="w-full rounded-lg border border-slate-200 px-2 py-1 text-xs font-semibold focus:border-amber-500 focus:outline-none"
                        />
                      </td>
                      <td className="px-1.5 py-1.5">
                        <input
                          type="number"
                          min={0}
                          value={row.weightKg}
                          onChange={(e) => handleUpdateManualRow(row.id, 'weightKg', e.target.value)}
                          placeholder="Kg..."
                          className="w-full rounded-lg border border-slate-200 px-2 py-1 text-xs font-mono text-right font-bold focus:border-amber-500 focus:outline-none"
                        />
                      </td>
                      <td className="px-2 py-1.5 text-right font-mono font-bold text-amber-800">
                        {tons > 0 ? tons : '—'}
                      </td>
                      <td className="px-1.5 py-1.5">
                        <input
                          type="number"
                          min={0}
                          value={row.unitPrice}
                          onChange={(e) => handleUpdateManualRow(row.id, 'unitPrice', e.target.value)}
                          className="w-full rounded-lg border border-slate-200 px-2 py-1 text-xs font-mono text-right focus:border-amber-500 focus:outline-none"
                        />
                      </td>
                      <td className="px-2 py-1.5 text-right font-mono font-bold text-emerald-700">
                        {amount > 0 ? `${amount.toLocaleString('vi-VN')} đ` : '—'}
                      </td>
                      <td className="px-1.5 py-1.5">
                        <input
                          type="text"
                          value={row.note}
                          onChange={(e) => handleUpdateManualRow(row.id, 'note', e.target.value)}
                          placeholder="Ghi chú"
                          className="w-full rounded-lg border border-slate-200 px-2 py-1 text-xs focus:border-amber-500 focus:outline-none"
                        />
                      </td>
                      <td className="px-1.5 py-1.5 text-center">
                        <button
                          type="button"
                          onClick={() => handleRemoveManualRow(row.id)}
                          className="rounded p-1 text-slate-400 hover:text-red-600 cursor-pointer"
                          title="Xóa dòng này"
                        >
                          🗑️
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            <div className="text-xs font-semibold text-amber-900">
              Số dòng hợp lệ (có Kg &gt; 0):{' '}
              <strong>
                {manualRows.filter((r) => (parseFloat(r.weightKg) || 0) > 0).length} dòng
              </strong>
            </div>
            <button
              type="submit"
              disabled={isSavingManual}
              className="rounded-xl bg-gradient-to-r from-amber-600 to-orange-600 px-5 py-2.5 text-xs font-black text-white shadow-md hover:from-amber-700 hover:to-orange-700 disabled:opacity-50 cursor-pointer"
            >
              {isSavingManual ? '⏳ Đang lưu...' : '💾 Lưu Tất Cả Vào CSDL'}
            </button>
          </div>
        </form>
      )}

      {/* ─── Metric Summary Cards ─────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5">
        <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase">Tổng Mẻ Trấu</span>
            <span className="text-lg">📦</span>
          </div>
          <div className="text-2xl font-black text-slate-900 mt-2">
            {summary.totalCount} <span className="text-xs font-normal text-slate-500">mẻ</span>
          </div>
          <div className="text-[11px] text-slate-500 mt-1">
            {summary.xeCount} xe • {summary.gheCount} ghe
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase">Khối Lượng</span>
            <span className="text-lg">⚖️</span>
          </div>
          <div className="text-2xl font-black text-amber-700 mt-2">
            {summary.totalTons.toLocaleString('vi-VN')}{' '}
            <span className="text-xs font-normal text-slate-500">tấn</span>
          </div>
          <div className="text-[11px] text-slate-500 mt-1">
            {summary.totalKg.toLocaleString('vi-VN')} kg
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase">Tổng Tiền Công</span>
            <span className="text-lg">💰</span>
          </div>
          <div className="text-2xl font-black text-emerald-700 mt-2">
            {summary.totalAmount.toLocaleString('vi-VN')}{' '}
            <span className="text-xs font-normal text-slate-500">đ</span>
          </div>
          <div className="text-[11px] text-slate-500 mt-1">Chuẩn 11.000đ &amp; 7.000đ/tấn</div>
        </div>

        {/* Đội Đức */}
        <div className="rounded-2xl border border-blue-200/80 bg-gradient-to-br from-blue-50/60 to-indigo-50/40 p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-blue-800 uppercase flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-blue-600 inline-block" /> Đội Đức
            </span>
            <span className="text-xs font-bold text-blue-700 bg-blue-100 rounded-md px-1.5 py-0.5">
              {summary.ducCount} mẻ
            </span>
          </div>
          <div className="text-xl font-black text-blue-900 mt-2">
            {summary.ducAmount.toLocaleString('vi-VN')} <span className="text-xs font-normal">đ</span>
          </div>
          <div className="text-[11px] text-blue-700 mt-1 font-medium">
            {summary.ducTons.toLocaleString('vi-VN')} tấn
          </div>
        </div>

        {/* Đội Quý */}
        <div className="rounded-2xl border border-emerald-200/80 bg-gradient-to-br from-emerald-50/60 to-teal-50/40 p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-emerald-800 uppercase flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-emerald-600 inline-block" /> Đội Quý
            </span>
            <span className="text-xs font-bold text-emerald-700 bg-emerald-100 rounded-md px-1.5 py-0.5">
              {summary.quyCount} mẻ
            </span>
          </div>
          <div className="text-xl font-black text-emerald-900 mt-2">
            {summary.quyAmount.toLocaleString('vi-VN')}{' '}
            <span className="text-xs font-normal">đ</span>
          </div>
          <div className="text-[11px] text-emerald-700 mt-1 font-medium">
            {summary.quyTons.toLocaleString('vi-VN')} tấn
          </div>
        </div>
      </div>

      {/* ─── Search & Filter Toolbar ──────────────────────────────────────── */}
      <div className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-1 max-w-md">
          <div className="relative w-full">
            <input
              type="text"
              placeholder="🔍 Tìm khách hàng, biển số xe, ghe, ngày..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-slate-50/70 py-2 pl-3 pr-8 text-xs font-medium text-slate-800 focus:bg-white focus:border-amber-400 focus:ring-2 focus:ring-amber-200/50 focus:outline-none transition-all placeholder:text-slate-400"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs"
              >
                ✕
              </button>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Lọc theo đội */}
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl text-xs font-bold">
            <span className="text-slate-400 text-[11px] px-1.5">Đội:</span>
            <button
              type="button"
              onClick={() => setTeamFilter('ALL')}
              className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                teamFilter === 'ALL'
                  ? 'bg-white text-slate-900 shadow-2xs font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Tất cả
            </button>
            <button
              type="button"
              onClick={() => setTeamFilter('ĐỨC')}
              className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                teamFilter === 'ĐỨC'
                  ? 'bg-blue-600 text-white shadow-2xs font-bold'
                  : 'text-slate-600 hover:text-blue-700'
              }`}
            >
              Đức
            </button>
            <button
              type="button"
              onClick={() => setTeamFilter('QUÝ')}
              className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                teamFilter === 'QUÝ'
                  ? 'bg-emerald-600 text-white shadow-2xs font-bold'
                  : 'text-slate-600 hover:text-emerald-700'
              }`}
            >
              Quý
            </button>
          </div>

          {/* Lọc theo loại phương tiện */}
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl text-xs font-bold">
            <span className="text-slate-400 text-[11px] px-1.5">Loại:</span>
            <button
              type="button"
              onClick={() => setTypeFilter('ALL')}
              className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                typeFilter === 'ALL'
                  ? 'bg-white text-slate-900 shadow-2xs font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Tất cả
            </button>
            <button
              type="button"
              onClick={() => setTypeFilter('XE')}
              className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                typeFilter === 'XE'
                  ? 'bg-amber-600 text-white shadow-2xs font-bold'
                  : 'text-slate-600 hover:text-amber-800'
              }`}
            >
              Xe
            </button>
            <button
              type="button"
              onClick={() => setTypeFilter('GHE')}
              className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                typeFilter === 'GHE'
                  ? 'bg-teal-600 text-white shadow-2xs font-bold'
                  : 'text-slate-600 hover:text-teal-800'
              }`}
            >
              Ghe
            </button>
          </div>
        </div>
      </div>

      {/* ─── Main Table Card ──────────────────────────────────────────────── */}
      <div className="rounded-3xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="p-16 text-center text-slate-500">
            <div className="inline-block animate-spin text-3xl mb-3">🔄</div>
            <p className="text-sm font-semibold">Đang tải dữ liệu xuất trấu Tháng {selectedMonth} từ CSDL...</p>
          </div>
        ) : filteredRecords.length === 0 ? (
          <div className="p-16 text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-50 text-3xl text-amber-600 mb-4 ring-8 ring-amber-50/50">
              📭
            </div>
            <h3 className="text-base font-bold text-slate-900">
              {records.length === 0
                ? `Tháng ${selectedMonth} chưa có mẻ xuất trấu nào trong CSDL`
                : 'Không tìm thấy mẻ trấu nào khớp với bộ lọc'}
            </h3>
            <p className="text-xs text-slate-500 max-w-md mx-auto mt-1.5">
              {records.length === 0
                ? 'Khi bạn nhập trấu ở tab "Nhập Trấu Mới" hoặc quét phiếu AI và nhấn "Lưu CSDL", các mẻ trấu sẽ tự động hiển thị tại đây và tự động điền sang phân hệ Nhập Sấy NSX TM.'
                : 'Thử điều chỉnh lại từ khóa tìm kiếm hoặc bỏ chọn các bộ lọc Đội / Loại phương tiện.'}
            </p>

            {records.length === 0 && (
              <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
                <button
                  type="button"
                  onClick={() => payrollInputRef.current?.click()}
                  className="rounded-xl bg-gradient-to-r from-violet-600 to-purple-700 text-white px-4 py-2 text-xs font-bold shadow-md shadow-violet-600/20 hover:from-violet-700 hover:to-purple-800 transition cursor-pointer"
                >
                  📤 Tải File Tính Lương (Tách Xuất Trấu)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowManualForm(true);
                    const [mm, yyyy] = selectedMonth.split('/');
                    if (mm && yyyy) setManualDefaultDate(`01/${mm}/${yyyy}`);
                  }}
                  className="rounded-xl bg-gradient-to-r from-amber-600 to-orange-600 text-white px-4 py-2 text-xs font-bold shadow-md shadow-amber-600/20 hover:from-amber-700 hover:to-orange-700 transition cursor-pointer"
                >
                  ➕ Nhập Trấu Thủ Công
                </button>
                {onNavigateToTab && (
                  <>
                    <button
                      type="button"
                      onClick={() => onNavigateToTab('nhap-trau-moi')}
                      className="rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 px-4 py-2 text-xs font-bold transition cursor-pointer"
                    >
                      🚛 Nhập Trấu Mới Ngay
                    </button>
                    <button
                      type="button"
                      onClick={() => onNavigateToTab('quet-anh-cu')}
                      className="rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 px-4 py-2 text-xs font-bold transition cursor-pointer"
                    >
                      📸 Quét Phiếu Cân AI
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-600">
              <thead className="bg-slate-50/90 text-[11px] font-black uppercase tracking-wider text-slate-700 border-b border-slate-200">
                <tr>
                  <th scope="col" className="px-3.5 py-3 text-center w-12">STT</th>
                  <th scope="col" className="px-3.5 py-3 text-center w-24">Ngày</th>
                  <th scope="col" className="px-3.5 py-3 text-center w-28">Đội</th>
                  <th scope="col" className="px-3.5 py-3 text-center w-16">Loại</th>
                  <th scope="col" className="px-3.5 py-3">Phương Tiện</th>
                  <th scope="col" className="px-3.5 py-3 font-black text-slate-900">Khách Hàng</th>
                  <th scope="col" className="px-3.5 py-3 text-right">Trọng Lượng (Kg)</th>
                  <th scope="col" className="px-3.5 py-3 text-right font-black text-amber-800">Số Tấn</th>
                  <th scope="col" className="px-3.5 py-3 text-right">Đơn Giá</th>
                  <th scope="col" className="px-3.5 py-3 text-right font-black text-emerald-800">Thành Tiền</th>
                  <th scope="col" className="px-3.5 py-3">Diễn Giải / Ghi Chú</th>
                  <th scope="col" className="px-3.5 py-3 text-center w-20">Thao Tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {filteredRecords.map((r, index) => {
                  const isDuc = r.team === 'ĐỨC';
                  const isTruck = r.type === 'XE';

                  return (
                    <tr
                      key={r.id || `row-${index}`}
                      className="hover:bg-amber-50/40 transition-colors group"
                    >
                      <td className="px-3.5 py-2.5 text-center text-slate-400 font-bold">
                        {index + 1}
                      </td>
                      <td className="px-3.5 py-2.5 text-center font-bold text-slate-800 whitespace-nowrap">
                        {r.date}
                      </td>
                      <td className="px-3.5 py-2.5 text-center whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => handleToggleTeam(r)}
                          disabled={isUpdating === r.id}
                          className={`rounded-lg px-2.5 py-1 text-[11px] font-black transition-all cursor-pointer shadow-2xs ${
                            isDuc
                              ? 'bg-blue-50 text-blue-800 border border-blue-200 hover:bg-blue-100'
                              : 'bg-emerald-50 text-emerald-800 border border-emerald-200 hover:bg-emerald-100'
                          }`}
                          title="Nhấn để đổi nhanh sang đội còn lại"
                        >
                          {isUpdating === r.id ? '⏳...' : `Đội ${r.team}`}
                          <span className="text-[9px] text-slate-400 ml-1">⇄</span>
                        </button>
                      </td>
                      <td className="px-3.5 py-2.5 text-center whitespace-nowrap">
                        <span
                          className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold ${
                            isTruck
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-teal-100 text-teal-800'
                          }`}
                        >
                          {isTruck ? '🚛 Xe' : '🚤 Ghe'}
                        </span>
                      </td>
                      <td className="px-3.5 py-2.5 font-bold text-slate-800">
                        {r.vehicle}
                      </td>
                      <td className="px-3.5 py-2.5 font-bold text-slate-900">
                        {r.customer}
                      </td>
                      <td className="px-3.5 py-2.5 text-right font-mono text-slate-700">
                        {(r.weightKg || 0).toLocaleString('vi-VN')}
                      </td>
                      <td className="px-3.5 py-2.5 text-right font-mono font-bold text-amber-800">
                        {(r.tons || 0).toLocaleString('vi-VN')}
                      </td>
                      <td className="px-3.5 py-2.5 text-right font-mono text-slate-600">
                        {(r.unitPrice || 11000).toLocaleString('vi-VN')}
                      </td>
                      <td className="px-3.5 py-2.5 text-right font-mono font-black text-emerald-700">
                        {(r.amount || 0).toLocaleString('vi-VN')} đ
                      </td>
                      <td className="px-3.5 py-2.5 text-[11px] text-slate-500 max-w-xs truncate">
                        {r.description || r.note || '—'}
                      </td>
                      <td className="px-3.5 py-2.5 text-center whitespace-nowrap">
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => setViewingRecord(r)}
                            className="rounded-lg p-1.5 text-slate-500 hover:text-indigo-700 hover:bg-indigo-50 transition-colors cursor-pointer"
                            title="Xem chi tiết mẻ trấu này"
                          >
                            👁️
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingRecord({ ...r })}
                            className="rounded-lg p-1.5 text-slate-500 hover:text-amber-700 hover:bg-amber-50 transition-colors cursor-pointer"
                            title="Chỉnh sửa mẻ trấu này"
                          >
                            ✏️
                          </button>
                          <button
                            type="button"
                            onClick={() => setRecordToDelete(r)}
                            disabled={isDeleting === r.id}
                            className="rounded-lg p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
                            title="Xóa mẻ trấu này khỏi CSDL tháng"
                          >
                            🗑️
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="bg-amber-50/70 border-t-2 border-amber-200 text-xs font-black text-slate-800">
                <tr>
                  <td colSpan={5} className="px-3.5 py-3 text-right uppercase tracking-wider text-amber-900">
                    Tổng cộng ({filteredRecords.length} mẻ):
                  </td>
                  <td className="px-3.5 py-3" />
                  <td className="px-3.5 py-3 text-right font-mono">
                    {summary.totalKg.toLocaleString('vi-VN')} kg
                  </td>
                  <td className="px-3.5 py-3 text-right font-mono text-amber-900 text-sm">
                    {summary.totalTons.toLocaleString('vi-VN')} tấn
                  </td>
                  <td className="px-3.5 py-3" />
                  <td className="px-3.5 py-3 text-right font-mono text-emerald-900 text-sm">
                    {summary.totalAmount.toLocaleString('vi-VN')} đ
                  </td>
                  <td colSpan={2} className="px-3.5 py-3 text-[11px] text-slate-500 font-normal">
                    Đức: {summary.ducCount} mẻ ({summary.ducTons}t) • Quý: {summary.quyCount} mẻ ({summary.quyTons}t)
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {/* ─── Modal Xem Chi Tiết 1 Mẻ ──────────────────────────────────────── */}
      {viewingRecord && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
                <span>👁️</span>
                <span>Chi Tiết Mẻ Xuất Trấu</span>
              </h3>
              <button
                type="button"
                onClick={() => setViewingRecord(null)}
                className="text-slate-400 hover:text-slate-700 text-sm font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs bg-slate-50 rounded-2xl p-4 border border-slate-200/70">
              <div>
                <span className="text-slate-400 block">Ngày cân</span>
                <strong className="text-slate-900 font-mono">{viewingRecord.date}</strong>
              </div>
              <div>
                <span className="text-slate-400 block">Tháng CSDL</span>
                <strong className="text-indigo-700">{viewingRecord.monthKey}</strong>
              </div>
              <div>
                <span className="text-slate-400 block">Đội phụ trách</span>
                <strong className="text-slate-900">Đội {viewingRecord.team}</strong>
              </div>
              <div>
                <span className="text-slate-400 block">Loại phương tiện</span>
                <strong className="text-slate-900">{viewingRecord.type === 'GHE' ? '🚤 Ghe' : '🚛 Xe'}</strong>
              </div>
              <div>
                <span className="text-slate-400 block">Biển số / Tên ghe</span>
                <strong className="text-slate-900">{viewingRecord.vehicle}</strong>
              </div>
              <div>
                <span className="text-slate-400 block">Khách hàng</span>
                <strong className="text-slate-900">{viewingRecord.customer}</strong>
              </div>
              <div>
                <span className="text-slate-400 block">Trọng lượng</span>
                <strong className="text-slate-900 font-mono">{(viewingRecord.weightKg || 0).toLocaleString('vi-VN')} kg</strong>
              </div>
              <div>
                <span className="text-slate-400 block">Số tấn quy đổi</span>
                <strong className="text-amber-800 font-mono">{viewingRecord.tons} tấn</strong>
              </div>
              <div>
                <span className="text-slate-400 block">Đơn giá</span>
                <strong className="text-slate-900 font-mono">{(viewingRecord.unitPrice || 11000).toLocaleString('vi-VN')} đ/tấn</strong>
              </div>
              <div>
                <span className="text-slate-400 block">Thành tiền</span>
                <strong className="text-emerald-700 font-mono text-sm">{(viewingRecord.amount || 0).toLocaleString('vi-VN')} đ</strong>
              </div>
              <div className="col-span-2">
                <span className="text-slate-400 block">Diễn giải công việc</span>
                <span className="text-slate-800 font-medium">{viewingRecord.description || '—'}</span>
              </div>
              <div className="col-span-2">
                <span className="text-slate-400 block">Ghi chú</span>
                <span className="text-slate-700">{viewingRecord.note || '—'}</span>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  const rec = viewingRecord;
                  setViewingRecord(null);
                  setEditingRecord({ ...rec });
                }}
                className="rounded-xl bg-amber-600 hover:bg-amber-700 px-4 py-2 text-xs font-bold text-white cursor-pointer"
              >
                ✏️ Chỉnh Sửa Mẻ Này
              </button>
              <button
                type="button"
                onClick={() => setViewingRecord(null)}
                className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 cursor-pointer"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Modal Chỉnh Sửa 1 Mẻ ─────────────────────────────────────────── */}
      {editingRecord && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs">
          <form
            onSubmit={handleSaveEditRecord}
            className="w-full max-w-xl rounded-3xl bg-white p-6 shadow-2xl space-y-4"
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
                <span>✏️</span>
                <span>Chỉnh Sửa Mẻ Xuất Trấu</span>
              </h3>
              <button
                type="button"
                onClick={() => setEditingRecord(null)}
                className="text-slate-400 hover:text-slate-700 text-sm font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Ngày Cân</label>
                <input
                  type="text"
                  required
                  value={editingRecord.date}
                  onChange={(e) => setEditingRecord({ ...editingRecord, date: e.target.value })}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 font-mono font-semibold"
                />
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">Đội Phụ Trách</label>
                <select
                  value={editingRecord.team}
                  onChange={(e) => setEditingRecord({ ...editingRecord, team: e.target.value as 'ĐỨC' | 'QUÝ' })}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 font-bold"
                >
                  <option value="ĐỨC">Đội ĐỨC</option>
                  <option value="QUÝ">Đội QUÝ</option>
                </select>
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">Loại Phương Tiện</label>
                <select
                  value={editingRecord.type}
                  onChange={(e) => {
                    const newType = e.target.value as 'XE' | 'GHE';
                    const newPrice = newType === 'GHE' ? 7000 : 11000;
                    const tons = roundRiceTons(editingRecord.weightKg);
                    setEditingRecord({
                      ...editingRecord,
                      type: newType,
                      unitPrice: newPrice,
                      tons,
                      amount: Math.round(tons * newPrice),
                    });
                  }}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 font-bold"
                >
                  <option value="XE">🚛 Xe (11.000đ/tấn)</option>
                  <option value="GHE">🚤 Ghe (7.000đ/tấn)</option>
                </select>
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">Biển Số / Tên Ghe</label>
                <input
                  type="text"
                  value={editingRecord.vehicle}
                  onChange={(e) => setEditingRecord({ ...editingRecord, vehicle: e.target.value })}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 font-semibold"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block font-bold text-slate-700 mb-1">Khách Hàng</label>
                <input
                  type="text"
                  required
                  value={editingRecord.customer}
                  onChange={(e) => setEditingRecord({ ...editingRecord, customer: e.target.value })}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 font-semibold"
                />
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">Trọng Lượng (Kg)</label>
                <input
                  type="number"
                  required
                  min={1}
                  value={editingRecord.weightKg}
                  onChange={(e) => {
                    const kg = Number(e.target.value) || 0;
                    const tons = roundRiceTons(kg);
                    const amount = Math.round(tons * (editingRecord.unitPrice || 11000));
                    setEditingRecord({ ...editingRecord, weightKg: kg, tons, amount });
                  }}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 font-mono font-bold"
                />
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">Số Tấn (Quy Đổi)</label>
                <input
                  type="number"
                  step="0.1"
                  value={editingRecord.tons}
                  onChange={(e) => {
                    const tons = Number(e.target.value) || 0;
                    const amount = Math.round(tons * (editingRecord.unitPrice || 11000));
                    setEditingRecord({ ...editingRecord, tons, amount });
                  }}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 font-mono font-bold text-amber-800"
                />
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">Đơn Giá (đ/tấn)</label>
                <input
                  type="number"
                  value={editingRecord.unitPrice}
                  onChange={(e) => {
                    const unitPrice = Number(e.target.value) || 0;
                    const amount = Math.round((editingRecord.tons || 0) * unitPrice);
                    setEditingRecord({ ...editingRecord, unitPrice, amount });
                  }}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 font-mono font-bold"
                />
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">Thành Tiền (đ)</label>
                <input
                  type="number"
                  value={editingRecord.amount}
                  onChange={(e) => setEditingRecord({ ...editingRecord, amount: Number(e.target.value) || 0 })}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 font-mono font-bold text-emerald-700"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block font-bold text-slate-700 mb-1">Diễn Giải Công Việc</label>
                <input
                  type="text"
                  value={editingRecord.description || ''}
                  onChange={(e) => setEditingRecord({ ...editingRecord, description: e.target.value })}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block font-bold text-slate-700 mb-1">Ghi Chú</label>
                <input
                  type="text"
                  value={editingRecord.note || ''}
                  onChange={(e) => setEditingRecord({ ...editingRecord, note: e.target.value })}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setEditingRecord(null)}
                className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 cursor-pointer"
              >
                Hủy
              </button>
              <button
                type="submit"
                disabled={isSavingEdit}
                className="rounded-xl bg-gradient-to-r from-amber-600 to-orange-600 px-5 py-2 text-xs font-black text-white shadow-md hover:from-amber-700 hover:to-orange-700 disabled:opacity-50 cursor-pointer"
              >
                {isSavingEdit ? '⏳ Đang lưu...' : '💾 Lưu Thay Đổi'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ─── Modal Xác Nhận Xóa 1 Mẻ ──────────────────────────────────────── */}
      {recordToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs animate-in fade-in">
          <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-red-100 text-2xl text-red-600">
                ⚠️
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Xác nhận xóa mẻ xuất trấu?
                </h3>
                <p className="text-xs text-slate-500">
                  Thao tác này sẽ xóa mẻ trấu khỏi CSDL Tháng {selectedMonth}.
                </p>
              </div>
            </div>

            <div className="rounded-2xl bg-slate-50 border border-slate-200 p-3.5 text-xs space-y-1.5 font-medium">
              <div className="flex justify-between">
                <span className="text-slate-500">Ngày:</span>
                <span className="font-bold text-slate-800">{recordToDelete.date}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Khách hàng:</span>
                <span className="font-bold text-slate-900">{recordToDelete.customer}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Phương tiện:</span>
                <span className="font-bold text-slate-800">{recordToDelete.vehicle} ({recordToDelete.type})</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Đội phụ trách:</span>
                <span className="font-bold text-blue-700">Đội {recordToDelete.team}</span>
              </div>
              <div className="flex justify-between border-t border-slate-200 pt-1.5">
                <span className="text-slate-500">Số lượng &amp; Tiền:</span>
                <span className="font-bold text-emerald-700">
                  {recordToDelete.tons} tấn ({(recordToDelete.amount || 0).toLocaleString('vi-VN')} đ)
                </span>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setRecordToDelete(null)}
                disabled={isDeleting !== null}
                className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 transition cursor-pointer"
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                onClick={() => handleDeleteRecord(recordToDelete)}
                disabled={isDeleting !== null}
                className="rounded-xl bg-red-600 px-4 py-2 text-xs font-bold text-white hover:bg-red-700 transition cursor-pointer shadow-md shadow-red-600/20"
              >
                {isDeleting ? 'Đang xóa...' : 'Xác nhận xóa'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Modal Xác Nhận Xóa Toàn Bộ Tháng ─────────────────────────────── */}
      {showClearAllModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs animate-in fade-in">
          <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-red-100 text-2xl text-red-600">
                🚨
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Xóa toàn bộ số liệu Tháng {selectedMonth}?
                </h3>
                <p className="text-xs text-slate-500">
                  Hành động này sẽ xóa tất cả {records.length} mẻ xuất trấu đã lưu trong CSDL của tháng này.
                </p>
              </div>
            </div>

            <div className="rounded-2xl bg-red-50 border border-red-200 p-3.5 text-xs text-red-800">
              ⚠️ <strong>Lưu ý quan trọng:</strong> Sau khi xóa, phân hệ Nhập Sấy NSX TM sẽ không còn nạp các mẻ trấu của Tháng {selectedMonth} nữa. Bạn sẽ cần nhập lại nếu muốn tính tiền xuất trấu cho các đội.
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowClearAllModal(false)}
                disabled={isDeleting !== null}
                className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 transition cursor-pointer"
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                onClick={handleClearAllMonth}
                disabled={isDeleting !== null}
                className="rounded-xl bg-red-600 px-4 py-2 text-xs font-bold text-white hover:bg-red-700 transition cursor-pointer shadow-md shadow-red-600/20"
              >
                {isDeleting === 'ALL' ? 'Đang xóa...' : 'Đồng ý xóa hết tháng'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
