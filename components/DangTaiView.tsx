'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import Image from 'next/image';
import { XeDangTai, DangTaiSummary, OcrBangDangTaiItem } from '@/lib/dang-tai/types';
import { formatPlateDisplay, normalizePlate, isValidPlateFormat, normalizeEstimatedWeight } from '@/lib/dang-tai/plate';
import DriverCombobox from '@/components/DriverCombobox';
import { compressImageForOcr } from '@/lib/dang-tai/compressImage';

function getTodayString(): string {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function getCurrentTimeString(): string {
  const now = new Date();
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

interface ScanResultItem {
  fileName: string;
  success: boolean;
  matched?: boolean;
  isValidOrder?: boolean;
  warningMessage?: string;
  error?: string;
  phieu?: {
    soPhieu?: string;
    soXe?: string;
    tlHangKg?: number;
    tlXeKg?: number;
    tlXeHangKg?: number;
    ngayGioCan?: string;
    loaiHang?: string;
    khachHang?: string;
    ghiChu?: string;
  };
  updatedXe?: XeDangTai;
}

export default function DangTaiView() {
  const [selectedDate, setSelectedDate] = useState<string>(getTodayString);
  const [items, setItems] = useState<XeDangTai[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'cho_can' | 'da_can' | 'sai_stt'>('all');

  // Quản lý Modal
  const [showAddModal, setShowAddModal] = useState<boolean>(false);
  const [showBulkModal, setShowBulkModal] = useState<boolean>(false);
  const [editingTruck, setEditingTruck] = useState<XeDangTai | null>(null);
  const [viewingImage, setViewingImage] = useState<string | null>(null);
  const [viewingImageRotation, setViewingImageRotation] = useState<number>(0);
  const [viewingImageZoom, setViewingImageZoom] = useState<number>(1);

  // Form đăng tài xe
  const [formBienSo, setFormBienSo] = useState<string>('');
  const [formNhaCungCap, setFormNhaCungCap] = useState<string>('');
  const [formLoaiLua, setFormLoaiLua] = useState<string>('5451');
  const [formSoLuong, setFormSoLuong] = useState<string>('');
  const [formTenTaiXe, setFormTenTaiXe] = useState<string>('');
  const [formSdtTaiXe, setFormSdtTaiXe] = useState<string>('');
  const [formGioDangTai, setFormGioDangTai] = useState<string>(getCurrentTimeString);
  const [formGhiChu, setFormGhiChu] = useState<string>('');
  const [formStt, setFormStt] = useState<number>(1);

  // Form thêm nhanh hàng loạt
  const [bulkText, setBulkText] = useState<string>('');

  // Trạng thái Quét Phiếu AI
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [scanResults, setScanResults] = useState<ScanResultItem[]>([]);
  const [showScanResultModal, setShowScanResultModal] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Trạng thái Quét Sổ Đăng Tài Viết Tay
  const [isScanningLog, setIsScanningLog] = useState<boolean>(false);
  const [logPreviewItems, setLogPreviewItems] = useState<OcrBangDangTaiItem[]>([]);
  const [logPreviewImage, setLogPreviewImage] = useState<string | null>(null);
  const [showLogPreviewModal, setShowLogPreviewModal] = useState<boolean>(false);
  const [logImageZoom, setLogImageZoom] = useState<number>(1);
  const [logImageRotation, setLogImageRotation] = useState<number>(0);
  const logFileInputRef = useRef<HTMLInputElement>(null);

  // Báo cáo Zalo Nhanh (Trưa 11h30 & Chiều 17h00)
  const [showZaloReportModal, setShowZaloReportModal] = useState<boolean>(false);
  const [zaloReportShift, setZaloReportShift] = useState<'trua' | 'chieu'>('trua');
  const [zaloReportOnlyMorning, setZaloReportOnlyMorning] = useState<boolean>(false);
  const [zaloReportText, setZaloReportText] = useState<string>('');

  // Đảo vị trí hàng xe trên bảng (STT gốc giữ nguyên)
  const [reorderingTruck, setReorderingTruck] = useState<XeDangTai | null>(null);
  const [targetRowInput, setTargetRowInput] = useState<number>(1);

  // Thông báo toast
  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'success' | 'warning' | 'error' } | null>(null);

  const showToast = (text: string, type: 'success' | 'warning' | 'error' = 'success') => {
    setToastMessage({ text, type });
    setTimeout(() => setToastMessage(null), 5000);
  };

  // Tải dữ liệu từ API
  const loadData = async (date: string) => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/dang-tai?date=${encodeURIComponent(date)}`);
      if (!res.ok) throw new Error('Không thể tải dữ liệu');
      const data = await res.json();
      if (data.items) {
        setItems(data.items);
      }
    } catch (err) {
      console.error(err);
      showToast('Lỗi tải danh sách xe đăng tài', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData(selectedDate);
  }, [selectedDate]);

  // Thống kê tổng hợp
  const summary: DangTaiSummary = useMemo(() => {
    const tongXe = items.length;
    const daCanXe = items.filter((x) => x.trangThai === 'da_can' || x.trangThai === 'sai_stt');
    const daCan = daCanXe.length;
    const choCan = items.filter((x) => x.trangThai === 'cho_can').length;
    const saiStt = items.filter((x) => x.trangThai === 'sai_stt' || x.canHopLeSTT === false).length;

    const tongKgUocTinh = items.reduce((sum, x) => sum + (x.soLuongUocTinh || 0), 0);
    const tongKgThucTe = daCanXe.reduce((sum, x) => sum + (x.tlHangKg || 0), 0);
    const tongChenhLechKg = tongKgThucTe - daCanXe.reduce((sum, x) => sum + (x.soLuongUocTinh || 0), 0);

    return {
      ngay: selectedDate,
      tongXe,
      daCan,
      choCan,
      saiStt,
      tongKgUocTinh,
      tongKgThucTe,
      tongChenhLechKg,
    };
  }, [items, selectedDate]);

  // Lọc và tìm kiếm danh sách
  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      // Bộ lọc trạng thái
      if (statusFilter === 'cho_can' && item.trangThai !== 'cho_can') return false;
      if (statusFilter === 'da_can' && item.trangThai !== 'da_can' && item.trangThai !== 'sai_stt') return false;
      if (statusFilter === 'sai_stt' && item.trangThai !== 'sai_stt' && item.canHopLeSTT !== false) return false;

      // Bộ lọc tìm kiếm
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const qPlate = normalizePlate(q);
        const matchPlate = normalizePlate(item.bienSoXe).includes(qPlate);
        const matchDriver = (item.tenTaiXe || '').toLowerCase().includes(q);
        const matchPhone = (item.sdtTaiXe || '').includes(q);
        const matchRice = (item.loaiLua || '').toLowerCase().includes(q);
        const matchTicket = (item.soPhieuCan || '').toLowerCase().includes(q);
        if (!matchPlate && !matchDriver && !matchPhone && !matchRice && !matchTicket) {
          return false;
        }
      }

      return true;
    });
  }, [items, statusFilter, searchQuery]);

  // Mở modal thêm xe mới
  const handleOpenAddModal = () => {
    const nextStt = items.length > 0 ? Math.max(...items.map((x) => x.stt || 0)) + 1 : 1;
    setFormStt(nextStt);
    setFormBienSo('');
    setFormNhaCungCap('');
    setFormLoaiLua('5451');
    setFormSoLuong('');
    setFormTenTaiXe('');
    setFormSdtTaiXe('');
    setFormGioDangTai(getCurrentTimeString());
    setFormGhiChu('');
    setEditingTruck(null);
    setShowAddModal(true);
  };

  // Mở modal chỉnh sửa xe
  const handleOpenEditModal = (truck: XeDangTai) => {
    setEditingTruck(truck);
    setFormStt(truck.stt);
    setFormBienSo(truck.bienSoXe);
    setFormNhaCungCap(truck.nhaCungCap || truck.khachHangCan || '');
    setFormLoaiLua(truck.loaiLua || '5451');
    setFormSoLuong(truck.soLuongUocTinh ? String(truck.soLuongUocTinh) : '');
    setFormTenTaiXe(truck.tenTaiXe || '');
    setFormSdtTaiXe(truck.sdtTaiXe || '');
    setFormGioDangTai(truck.gioDangTai || getCurrentTimeString());
    setFormGhiChu(truck.ghiChu || '');
    setShowAddModal(true);
  };

  // Lưu thông tin xe (thêm mới hoặc sửa)
  const handleSaveTruck = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formBienSo.trim()) {
      showToast('Vui lòng nhập biển số xe', 'error');
      return;
    }

    const cleanPlate = formatPlateDisplay(formBienSo);
    const uocTinhKg = parseInt(formSoLuong.replace(/[^0-9]/g, ''), 10) || 0;

    let updatedList: XeDangTai[] = [];

    if (editingTruck) {
      // Cập nhật
      const chenhLech =
        editingTruck.tlHangKg !== undefined ? editingTruck.tlHangKg - uocTinhKg : editingTruck.chenhLechKg;

      const updated: XeDangTai = {
        ...editingTruck,
        stt: formStt,
        bienSoXe: cleanPlate,
        nhaCungCap: formNhaCungCap.trim() || undefined,
        loaiLua: formLoaiLua.trim() || '5451',
        soLuongUocTinh: uocTinhKg,
        tenTaiXe: formTenTaiXe.trim() || undefined,
        sdtTaiXe: formSdtTaiXe.trim() || undefined,
        gioDangTai: formGioDangTai || getCurrentTimeString(),
        ghiChu: formGhiChu.trim() || undefined,
        chenhLechKg: chenhLech,
        updatedAt: new Date().toISOString(),
      };
      updatedList = items.map((x) => (x.id === editingTruck.id ? updated : x));
    } else {
      // Thêm mới
      const newTruck: XeDangTai = {
        id: `truck_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        stt: formStt,
        ngayDangTai: selectedDate,
        gioDangTai: formGioDangTai || getCurrentTimeString(),
        bienSoXe: cleanPlate,
        nhaCungCap: formNhaCungCap.trim() || undefined,
        loaiLua: formLoaiLua.trim() || '5451',
        soLuongUocTinh: uocTinhKg,
        tenTaiXe: formTenTaiXe.trim() || undefined,
        sdtTaiXe: formSdtTaiXe.trim() || undefined,
        ghiChu: formGhiChu.trim() || undefined,
        trangThai: 'cho_can',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      updatedList = [...items, newTruck];
    }

    setItems(updatedList);
    setShowAddModal(false);

    try {
      await fetch('/api/dang-tai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'save_all',
          date: selectedDate,
          items: updatedList,
        }),
      });
      showToast(editingTruck ? 'Đã cập nhật thông tin xe' : 'Đã đăng tài xe mới thành công');
    } catch {
      showToast('Lỗi lưu dữ liệu máy chủ', 'error');
    }
  };

  // Di chuyển thứ tự hàng xe (đổi vị trí trên bảng nhưng giữ nguyên STT gốc)
  const handleMoveRow = async (truckId: string, direction: -1 | 1) => {
    const currentIndex = items.findIndex((x) => x.id === truckId);
    if (currentIndex === -1) return;
    const targetIndex = currentIndex + direction;
    if (targetIndex < 0 || targetIndex >= items.length) return;

    const newItems = [...items];
    const [movedItem] = newItems.splice(currentIndex, 1);
    newItems.splice(targetIndex, 0, movedItem);

    setItems(newItems);

    try {
      await fetch('/api/dang-tai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'save_all',
          date: selectedDate,
          items: newItems,
        }),
      });
      showToast(`Đã chuyển xe STT ${movedItem.stt} (${movedItem.bienSoXe}) sang hàng số ${targetIndex + 1}!`);
    } catch {
      showToast('Lỗi lưu thứ tự lên máy chủ', 'error');
    }
  };

  // Mở modal đổi vị trí bất kỳ
  const handleOpenReorderModal = (truck: XeDangTai) => {
    const currentIndex = items.findIndex((x) => x.id === truck.id);
    setReorderingTruck(truck);
    setTargetRowInput(currentIndex >= 0 ? currentIndex + 1 : 1);
  };

  // Xác nhận đổi vị trí hàng đến hàng số targetRowNumber
  const handleConfirmReorder = async (targetRowNumber: number) => {
    if (!reorderingTruck) return;
    const currentIndex = items.findIndex((x) => x.id === reorderingTruck.id);
    if (currentIndex === -1) return;
    const targetIndex = targetRowNumber - 1;
    if (targetIndex < 0 || targetIndex >= items.length) {
      showToast(`Vui lòng nhập vị trí hợp lệ từ 1 đến ${items.length}`, 'error');
      return;
    }

    if (targetIndex === currentIndex) {
      setReorderingTruck(null);
      return;
    }

    const newItems = [...items];
    const [movedItem] = newItems.splice(currentIndex, 1);
    newItems.splice(targetIndex, 0, movedItem);

    setItems(newItems);
    setReorderingTruck(null);

    try {
      await fetch('/api/dang-tai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'save_all',
          date: selectedDate,
          items: newItems,
        }),
      });
      showToast(`Đã chuyển xe STT ${movedItem.stt} (${movedItem.bienSoXe}) từ hàng ${currentIndex + 1} sang hàng ${targetRowNumber}!`);
    } catch {
      showToast('Lỗi lưu thứ tự lên máy chủ', 'error');
    }
  };

  // Xóa xe đăng tài
  const handleDeleteTruck = async (id: string, plate: string) => {
    if (!confirm(`Bạn có chắc chắn muốn xóa xe ${plate} khỏi danh sách đăng tài?`)) return;

    const updatedList = items.filter((x) => x.id !== id);
    setItems(updatedList);

    try {
      await fetch('/api/dang-tai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'delete_truck',
          date: selectedDate,
          id,
        }),
      });
      showToast(`Đã xóa xe ${plate}`);
    } catch {
      showToast('Lỗi khi xóa xe', 'error');
    }
  };

  // Thêm nhanh nhiều xe (từ text paste)
  const handleBulkAdd = async () => {
    if (!bulkText.trim()) return;

    const lines = bulkText.split('\n').filter((l) => l.trim().length > 0);
    let nextStt = items.length > 0 ? Math.max(...items.map((x) => x.stt || 0)) + 1 : 1;
    const newTrucks: XeDangTai[] = [];

    for (const line of lines) {
      // Phân tích dòng text
      // Ví dụ: "70H-03268 32 tấn 5451 Anh Lâm 0912345678"
      // hoặc "66C12345, 30000, OM18"
      const parts = line.split(/[\t,;|\s]+/).filter(Boolean);
      if (parts.length === 0) continue;

      let plate = parts[0];
      // Nếu phần tử đầu là số STT, thì plate là phần tử 2
      let lineStt = nextStt;
      if (/^\d+$/.test(parts[0]) && parts.length > 1) {
        lineStt = parseInt(parts[0], 10);
        plate = parts[1];
      }

      // Tìm loại lúa và số lượng
      let uocTinh = 30000;
      let loaiLua = '5451';
      let ten = '';
      let sdt = '';

      for (let i = 1; i < parts.length; i++) {
        const p = parts[i];
        // Tìm số lượng (tấn hoặc kg)
        if (p.toLowerCase().includes('tấn')) {
          const num = parseFloat(p.replace(/[^0-9.]/g, ''));
          if (!isNaN(num)) uocTinh = Math.round(num * 1000);
        } else if (/^\d{4,6}$/.test(p)) {
          uocTinh = parseInt(p, 10);
        } else if (/^(5451|OM18|OM5451|ST24|ST25|DT8|ĐÀI THƠM|IR50404|RV)/i.test(p)) {
          loaiLua = p.toUpperCase();
        } else if (/^(0[3|5|7|8|9][0-9]{8})$/.test(p)) {
          sdt = p;
        } else if (p.length > 1 && !ten) {
          ten = p;
        }
      }

      newTrucks.push({
        id: `truck_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        stt: lineStt,
        ngayDangTai: selectedDate,
        gioDangTai: getCurrentTimeString(),
        bienSoXe: formatPlateDisplay(plate),
        loaiLua,
        soLuongUocTinh: uocTinh,
        tenTaiXe: ten || undefined,
        sdtTaiXe: sdt || undefined,
        trangThai: 'cho_can',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      nextStt = Math.max(nextStt, lineStt) + 1;
    }

    if (newTrucks.length === 0) {
      showToast('Không tìm thấy thông tin xe hợp lệ', 'error');
      return;
    }

    const updatedList = [...items, ...newTrucks];
    setItems(updatedList);
    setShowBulkModal(false);
    setBulkText('');

    try {
      await fetch('/api/dang-tai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'save_all',
          date: selectedDate,
          items: updatedList,
        }),
      });
      showToast(`Đã thêm nhanh ${newTrucks.length} xe vào danh sách`);
    } catch {
      showToast('Lỗi lưu danh sách lên máy chủ', 'error');
    }
  };

  // Quét phiếu cân bằng AI (Tự động nén ảnh trên Client để chống 504 Timeout Vercel)
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawFiles = e.target.files;
    if (!rawFiles || rawFiles.length === 0) return;

    setIsScanning(true);
    try {
      const formData = new FormData();
      formData.append('date', selectedDate);
      formData.append('currentItems', JSON.stringify(items));

      // Nén ảnh trên Client: Giảm từ 10MB xuống ~250KB, giúp upload cực nhanh và không bị timeout 504
      for (let i = 0; i < rawFiles.length; i++) {
        const file = rawFiles[i];
        const compressedBlob = await compressImageForOcr(file, 1600);
        formData.append('images', compressedBlob, file.name);
      }

      const res = await fetch('/api/dang-tai/scan', {
        method: 'POST',
        body: formData,
      });

      const resText = await res.text();
      let data: any = null;
      try {
        data = JSON.parse(resText);
      } catch {
        if (res.status === 504) {
          throw new Error('Máy chủ bị Timeout 504 (quá thời gian xử lý Vercel). Hãy thử quét 1-2 phiếu một lần để nhanh hơn.');
        }
        throw new Error(`Lỗi máy chủ (${res.status}): ${resText.slice(0, 100)}`);
      }

      if (!res.ok) throw new Error(data?.error || 'Lỗi khi quét phiếu');

      if (data.updatedList) {
        setItems(data.updatedList);
      }
      if (data.results) {
        setScanResults(data.results);
        setShowScanResultModal(true);
      }

      showToast(`Đã quét xong ${rawFiles.length} phiếu cân!`);
    } catch (err: unknown) {
      console.error(err);
      showToast(err instanceof Error ? err.message : 'Lỗi khi quét phiếu cân', 'error');
    } finally {
      setIsScanning(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // Quét Sổ Đăng Tài Viết Tay Bằng AI (Tự động nén ảnh trên Client để chống 504 Timeout Vercel)
  const handleLogFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsScanningLog(true);
    try {
      const compressedBlob = await compressImageForOcr(file, 1800);
      const formData = new FormData();
      formData.append('image', compressedBlob, file.name);

      const res = await fetch('/api/dang-tai/scan-log', {
        method: 'POST',
        body: formData,
      });

      const resText = await res.text();
      let data: any = null;
      try {
        data = JSON.parse(resText);
      } catch {
        if (res.status === 504) {
          throw new Error('Máy chủ bị Timeout 504 khi đọc sổ viết tay. Vui lòng chụp gần hơn và thử lại.');
        }
        throw new Error(`Lỗi máy chủ (${res.status}): ${resText.slice(0, 100)}`);
      }

      if (!res.ok) throw new Error(data?.error || 'Lỗi khi đọc ảnh sổ đăng tài');

      if (data.items) {
        setLogPreviewItems(data.items);
        setLogPreviewImage(data.previewImage || null);
        setLogImageZoom(1);
        setShowLogPreviewModal(true);
      }

      showToast(`Đã nhận diện ${data.items?.length || 0} xe! Vui lòng đối chiếu với ảnh và xác nhận.`);
    } catch (err: unknown) {
      console.error(err);
      showToast(err instanceof Error ? err.message : 'Lỗi khi đọc ảnh sổ đăng tài', 'error');
    } finally {
      setIsScanningLog(false);
      if (logFileInputRef.current) logFileInputRef.current.value = '';
    }
  };

  // Thay đổi trực tiếp trên bảng xem trước sổ đăng tài
  const handleLogItemChange = (
    tempId: string,
    field: keyof OcrBangDangTaiItem,
    value: any
  ) => {
    setLogPreviewItems((prev) =>
      prev.map((item) => {
        if (item.tempId !== tempId) return item;
        const updated = { ...item, [field]: value };

        // Nếu sửa biển số, tự động kiểm tra lại regex
        if (field === 'bienSoXe') {
          const cleanPlate = String(value || '').trim();
          updated.isValidPlate = isValidPlateFormat(cleanPlate);
        }

        // Nếu sửa số lượng ước tính
        if (field === 'soLuongUocTinh') {
          updated.soLuongUocTinh = normalizeEstimatedWeight(value);
        }

        return updated;
      })
    );
  };

  // Thêm dòng mới vào bảng xem trước
  const handleAddLogItem = () => {
    const nextStt = logPreviewItems.length > 0 ? Math.max(...logPreviewItems.map((x) => x.stt || 0)) + 1 : 1;
    const newItem: OcrBangDangTaiItem = {
      tempId: `temp_${Date.now()}_manual`,
      stt: nextStt,
      gioDangTai: getCurrentTimeString(),
      bienSoXe: '',
      loaiLua: '5451',
      soLuongUocTinh: 30000,
      confidence: 'high',
      uncertainFields: [],
      isValidPlate: false,
    };
    setLogPreviewItems((prev) => [...prev, newItem]);
  };

  // Xóa dòng khỏi bảng xem trước
  const handleDeleteLogItem = (tempId: string) => {
    setLogPreviewItems((prev) => prev.filter((x) => x.tempId !== tempId));
  };

  // Xác nhận lưu dữ liệu từ sổ đăng tài vào hệ thống
  const handleConfirmLogItems = async () => {
    if (logPreviewItems.length === 0) return;

    // Kiểm tra xem có dòng nào biển số trống không
    const emptyPlates = logPreviewItems.filter((x) => !x.bienSoXe.trim());
    if (emptyPlates.length > 0) {
      showToast(`Có ${emptyPlates.length} dòng chưa điền biển số xe. Vui lòng kiểm tra lại!`, 'error');
      return;
    }

    const invalidPlates = logPreviewItems.filter((x) => !x.isValidPlate);
    if (invalidPlates.length > 0) {
      if (
        !confirm(
          `Có ${invalidPlates.length} xe có biển số không đúng định dạng chuẩn (ô màu đỏ). Bạn có chắc chắn muốn lưu không?`
        )
      ) {
        return;
      }
    }

    // Chuyển đổi thành XeDangTai
    const newTrucks: XeDangTai[] = logPreviewItems.map((item, idx) => ({
      id: `truck_${Date.now()}_${idx}_${Math.random().toString(36).slice(2, 6)}`,
      stt: item.stt,
      ngayDangTai: selectedDate,
      gioDangTai: item.gioDangTai || getCurrentTimeString(),
      bienSoXe: formatPlateDisplay(item.bienSoXe),
      nhaCungCap: item.nhaCungCap || undefined,
      loaiLua: item.loaiLua || '5451',
      soLuongUocTinh: item.soLuongUocTinh || 0,
      tenTaiXe: item.tenTaiXe,
      sdtTaiXe: item.sdtTaiXe,
      ghiChu: item.ghiChu,
      trangThai: 'cho_can',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }));

    const updatedList = [...items, ...newTrucks];
    setItems(updatedList);
    setShowLogPreviewModal(false);

    try {
      await fetch('/api/dang-tai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'save_all',
          date: selectedDate,
          items: updatedList,
        }),
      });
      showToast(`✅ Đã thêm thành công ${newTrucks.length} xe vào bảng đăng tài!`);
    } catch {
      showToast('Lỗi lưu dữ liệu máy chủ', 'error');
    }
  };

  // Xuất file Excel
  const handleExportExcel = () => {
    window.open(`/api/dang-tai/export?date=${encodeURIComponent(selectedDate)}`, '_blank');
  };

  // Tạo nội dung tin nhắn Báo Cáo Zalo (Trưa 11h30 & Chiều 17h00)
  const generateZaloReport = (
    shift: 'trua' | 'chieu',
    onlyMorning: boolean = false,
    trucksList: XeDangTai[] = items
  ): string => {
    const parts = selectedDate.split('-');
    const dateVi = parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : selectedDate;

    let targetTrucks = trucksList;
    if (shift === 'trua' && onlyMorning) {
      targetTrucks = trucksList.filter((t) => !t.gioDangTai || t.gioDangTai <= '11:30');
    }

    const tongXe = targetTrucks.length;
    const daCanXe = targetTrucks.filter((x) => x.trangThai === 'da_can' || x.trangThai === 'sai_stt');
    const daCan = daCanXe.length;
    const choCanXe = targetTrucks.filter((x) => x.trangThai === 'cho_can');
    const choCan = choCanXe.length;

    const tongKgUocTinh = targetTrucks.reduce((sum, x) => sum + (x.soLuongUocTinh || 0), 0);
    const tongKgThucTe = daCanXe.reduce((sum, x) => sum + (x.tlHangKg || 0), 0);
    const tongTanUocTinh = (tongKgUocTinh / 1000).toLocaleString('vi-VN', {
      maximumFractionDigits: 1,
      minimumFractionDigits: 1,
    });
    const tongTanThucTe = (tongKgThucTe / 1000).toLocaleString('vi-VN', {
      maximumFractionDigits: 1,
      minimumFractionDigits: 1,
    });

    const waitingPlatesStr =
      choCan > 0
        ? choCanXe.map((x) => x.bienSoXe).join(', ')
        : shift === 'trua'
        ? 'Đã cân hết xe ca sáng'
        : 'Không có xe tồn, đã cân hết 100%';

    const riceGroups: Record<string, { count: number; kg: number }> = {};
    for (const t of targetTrucks) {
      const rawName = (t.loaiLua || '5451').trim();
      const key = rawName.toUpperCase();
      if (!riceGroups[key]) {
        riceGroups[key] = { count: 0, kg: 0 };
      }
      riceGroups[key].count += 1;
      const kgVal = t.tlHangKg && t.tlHangKg > 0 ? t.tlHangKg : t.soLuongUocTinh || 0;
      riceGroups[key].kg += kgVal;
    }

    const varietyLines = Object.entries(riceGroups)
      .sort((a, b) => b[1].count - a[1].count)
      .map(([name, data]) => {
        const tan = (data.kg / 1000).toLocaleString('vi-VN', {
          maximumFractionDigits: 1,
          minimumFractionDigits: 1,
        });
        const prefix = name.toLowerCase().startsWith('lúa') ? name : `Lúa ${name}`;
        return `  - ${prefix}: ${data.count} xe (${tan} tấn)`;
      });

    const varietyStr =
      varietyLines.length > 0 ? varietyLines.join('\n') : '  - Chưa có thông tin loại lúa';

    if (shift === 'trua') {
      return `🚛 BÁO CÁO ĐĂNG TÀI & NHẬP LÚA (CA TRƯA 11H30) - NGÀY ${dateVi}
🏢 Đơn vị: CÔNG TY XNK CHƠN CHÍNH
----------------------------------
• Tổng xe đăng ký: ${tongXe} xe (~${tongTanUocTinh} tấn ước tính của tài xế)
• Đã cân hoàn tất: ${daCan} xe (Thực cân: ${tongTanThucTe} tấn)
• Đang chờ cân: ${choCan} xe (${waitingPlatesStr})
🌾 CHI TIẾT THEO LOẠI LÚA:
${varietyStr}
----------------------------------`;
    }

    return `🚛 BÁO CÁO ĐĂNG TÀI & NHẬP LÚA (CA CHIỀU 17H00) - NGÀY ${dateVi}
🏢 Đơn vị: CÔNG TY XNK CHƠN CHÍNH
----------------------------------
• Tổng xe đăng ký: ${tongXe} xe (~${tongTanUocTinh} tấn ước tính của tài xế)
• Đã cân hoàn tất: ${daCan} xe (Thực cân: ${tongTanThucTe} tấn)
• Xe còn tồn / chưa cân: ${choCan} xe (${waitingPlatesStr})
🌾 CHI TIẾT THEO LOẠI LÚA:
${varietyStr}
----------------------------------`;
  };

  const handleOpenZaloModal = (shift: 'trua' | 'chieu' = 'trua') => {
    setZaloReportShift(shift);
    setZaloReportText(generateZaloReport(shift, zaloReportOnlyMorning));
    setShowZaloReportModal(true);
  };

  const handleChangeZaloShift = (newShift: 'trua' | 'chieu', newOnlyMorning: boolean = zaloReportOnlyMorning) => {
    setZaloReportShift(newShift);
    setZaloReportOnlyMorning(newOnlyMorning);
    setZaloReportText(generateZaloReport(newShift, newOnlyMorning));
  };

  const handleCopyZaloReport = async () => {
    try {
      await navigator.clipboard.writeText(zaloReportText);
      showToast(
        `Đã sao chép ${zaloReportShift === 'trua' ? 'Báo Cáo Trưa (11h30)' : 'Báo Cáo Chiều (17h00)'}! Mở Zalo dán ngay.`
      );
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = zaloReportText;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      showToast('Đã sao chép báo cáo Zalo!');
    }
  };

  return (
    <div className="space-y-6 pb-20">
      {/* Toast Notification */}
      {toastMessage && (
        <div
          className={`fixed bottom-6 right-6 z-50 flex items-center gap-3 rounded-2xl px-5 py-3.5 shadow-2xl backdrop-blur-md transition-all text-sm font-bold border ${
            toastMessage.type === 'success'
              ? 'bg-emerald-900/90 text-white border-emerald-500'
              : toastMessage.type === 'warning'
              ? 'bg-amber-900/90 text-white border-amber-500'
              : 'bg-rose-900/90 text-white border-rose-500'
          }`}
        >
          <span>
            {toastMessage.type === 'success' ? '✅' : toastMessage.type === 'warning' ? '⚠️' : '❌'}
          </span>
          <span>{toastMessage.text}</span>
        </div>
      )}

      {/* TOP HEADER & TITLE */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between rounded-3xl bg-gradient-to-r from-blue-900 via-indigo-900 to-slate-900 p-6 sm:p-8 text-white shadow-xl shadow-blue-950/20">
        <div>
          <div className="flex items-center gap-3">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10 text-2xl backdrop-blur-md ring-1 ring-white/20">
              🚛
            </span>
            <div>
              <h1 className="text-xl sm:text-2xl font-black tracking-tight">
                Hệ Thống Tự Động Đăng Tài &amp; Quét Phiếu Cân Xe Lúa
              </h1>
              <p className="text-xs sm:text-sm text-blue-200 font-medium">
                Quản lý số thứ tự tài, kiểm tra thứ tự cân STT, tự động đọc phiếu &amp; tính chênh lệch sản lượng
              </p>
            </div>
          </div>
        </div>

        {/* Action Controls Top Right */}
        <div className="flex flex-wrap items-center gap-2.5 sm:self-center">
          {/* Chọn ngày */}
          <div className="flex items-center gap-2 rounded-2xl bg-white/10 px-3.5 py-2 ring-1 ring-white/20 backdrop-blur-md">
            <span className="text-xs font-semibold text-blue-200">📅 Ngày:</span>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="bg-transparent text-xs font-bold text-white focus:outline-none cursor-pointer"
            />
          </div>

          {/* Nút Báo Cáo Zalo (11h30 & 17h00) */}
          <button
            onClick={() => handleOpenZaloModal('trua')}
            className="flex items-center gap-2 rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 px-4 py-2.5 text-xs font-bold text-white shadow-md shadow-blue-900/30 transition-all active:scale-95 cursor-pointer"
          >
            <span>📱</span>
            <span>Báo Cáo Zalo (11h30 &amp; 17h)</span>
          </button>

          {/* Nút Xuất Excel */}
          <button
            onClick={handleExportExcel}
            className="flex items-center gap-2 rounded-2xl bg-emerald-600 hover:bg-emerald-500 px-4 py-2.5 text-xs font-bold text-white shadow-md shadow-emerald-950/30 transition-all active:scale-95 cursor-pointer"
          >
            <span>📊</span>
            <span>Xuất Excel</span>
          </button>
        </div>
      </div>

      {/* BÁO CÁO THỐNG KÊ NHANH (CARDS) */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5 sm:gap-4">
        {/* Card 1: Tổng xe */}
        <div
          onClick={() => setStatusFilter('all')}
          className={`group relative overflow-hidden rounded-3xl p-5 border transition-all cursor-pointer ${
            statusFilter === 'all'
              ? 'bg-blue-50/80 border-blue-400 ring-2 ring-blue-500/20 shadow-md'
              : 'bg-white border-slate-200 hover:border-blue-300 shadow-2xs'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Tổng Xe Đăng Tài</span>
            <span className="text-lg">🚛</span>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl sm:text-3xl font-black text-slate-900">{summary.tongXe}</span>
            <span className="text-xs font-bold text-slate-500">chiếc</span>
          </div>
          <div className="mt-1 text-[11px] text-slate-400">
            Ước tính: {(summary.tongKgUocTinh / 1000).toFixed(1)} tấn
          </div>
        </div>

        {/* Card 2: Đã Cân */}
        <div
          onClick={() => setStatusFilter('da_can')}
          className={`group relative overflow-hidden rounded-3xl p-5 border transition-all cursor-pointer ${
            statusFilter === 'da_can'
              ? 'bg-emerald-50/80 border-emerald-400 ring-2 ring-emerald-500/20 shadow-md'
              : 'bg-white border-slate-200 hover:border-emerald-300 shadow-2xs'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-emerald-700 uppercase tracking-wider">Đã Cân</span>
            <span className="text-lg">✅</span>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl sm:text-3xl font-black text-emerald-700">{summary.daCan}</span>
            <span className="text-xs font-bold text-emerald-600">xe</span>
          </div>
          <div className="mt-1 text-[11px] font-semibold text-emerald-700">
            Thực tế: {summary.tongKgThucTe.toLocaleString('vi-VN')} kg ({ (summary.tongKgThucTe / 1000).toFixed(1) } tấn)
          </div>
        </div>

        {/* Card 3: CÒN CHƯA CÂN (ĐANG CHỜ) */}
        <div
          onClick={() => setStatusFilter('cho_can')}
          className={`group relative overflow-hidden rounded-3xl p-5 border transition-all cursor-pointer ${
            statusFilter === 'cho_can'
              ? 'bg-amber-50/90 border-amber-400 ring-2 ring-amber-500/30 shadow-md'
              : 'bg-white border-amber-200 hover:border-amber-400 shadow-2xs'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-amber-800 uppercase tracking-wider">Còn Chưa Cân</span>
            <span className="text-lg">⏳</span>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl sm:text-3xl font-black text-amber-700">{summary.choCan}</span>
            <span className="text-xs font-bold text-amber-600">xe đang chờ</span>
          </div>
          <div className="mt-1 text-[11px] font-medium text-amber-700">
            Bấm để xem danh sách chờ
          </div>
        </div>

        {/* Card 4: Cảnh Báo Sai Thứ Tự STT */}
        <div
          onClick={() => setStatusFilter('sai_stt')}
          className={`group relative overflow-hidden rounded-3xl p-5 border transition-all cursor-pointer ${
            statusFilter === 'sai_stt'
              ? 'bg-rose-50/80 border-rose-400 ring-2 ring-rose-500/20 shadow-md'
              : 'bg-white border-slate-200 hover:border-rose-300 shadow-2xs'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-rose-700 uppercase tracking-wider">Cân Lệch STT</span>
            <span className="text-lg">⚠️</span>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl sm:text-3xl font-black text-rose-700">{summary.saiStt}</span>
            <span className="text-xs font-bold text-rose-600">phiếu lệch</span>
          </div>
          <div className="mt-1 text-[11px] text-rose-600">
            {summary.saiStt > 0 ? 'Cần kiểm tra lại lượt cân' : 'Đúng thứ tự 100%'}
          </div>
        </div>

        {/* Card 5: Chênh Lệch Thực Tế vs Ước Tính */}
        <div className="col-span-2 sm:col-span-1 rounded-3xl bg-white p-5 border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Độ Chênh Lệch</span>
            <span className="text-lg">⚖️</span>
          </div>
          <div className="mt-3 flex items-baseline gap-1.5">
            <span
              className={`text-2xl sm:text-3xl font-black ${
                summary.tongChenhLechKg > 0
                  ? 'text-blue-700'
                  : summary.tongChenhLechKg < 0
                  ? 'text-rose-600'
                  : 'text-slate-700'
              }`}
            >
              {summary.tongChenhLechKg > 0 ? '+' : ''}
              {summary.tongChenhLechKg.toLocaleString('vi-VN')}
            </span>
            <span className="text-xs font-bold text-slate-500">kg</span>
          </div>
          <div className="mt-1 text-[11px] text-slate-500">
            (Cân thực tế - Ước tính tài)
          </div>
        </div>
      </div>

      {/* THANH THAO TÁC CHÍNH (ACTION BAR) */}
      <div className="flex flex-col gap-4 rounded-3xl border border-slate-200 bg-white p-4 sm:p-5 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Nhóm nút thêm xe & quét ảnh */}
          <div className="flex flex-wrap items-center gap-2.5">
            {/* Nút Đăng tài xe mới */}
            <button
              onClick={handleOpenAddModal}
              className="flex items-center gap-2 rounded-2xl bg-blue-600 hover:bg-blue-700 px-4 py-2.5 text-xs font-bold text-white shadow-md shadow-blue-500/20 transition-all active:scale-95 cursor-pointer"
            >
              <span className="text-sm font-bold">+</span>
              <span>Đăng Tài Xe Mới</span>
            </button>

            {/* Nút Thêm nhanh nhiều xe (Paste Zalo/Excel) */}
            <button
              onClick={() => setShowBulkModal(true)}
              className="flex items-center gap-2 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-700 px-3.5 py-2.5 text-xs font-bold transition-all border border-slate-200 cursor-pointer"
            >
              <span>📋</span>
              <span>Dán Nhanh Từ Zalo</span>
            </button>

            {/* Nút Quét Sổ Đăng Tài Viết Tay Bằng AI (Có bước xem trước và sửa lỗi) */}
            <label className="flex items-center gap-2 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:opacity-95 text-white px-4 py-2.5 text-xs font-bold shadow-md shadow-emerald-500/20 transition-all cursor-pointer active:scale-95">
              {isScanningLog ? (
                <>
                  <svg className="h-4 w-4 animate-spin text-white" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                  </svg>
                  <span>AI Đang Đọc Sổ...</span>
                </>
              ) : (
                <>
                  <span className="text-sm">📸</span>
                  <span>Quét Sổ Đăng Tài (AI)</span>
                </>
              )}
              <input
                ref={logFileInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                onChange={handleLogFileChange}
                disabled={isScanningLog}
                className="hidden"
              />
            </label>

            {/* Nút Quét Phiếu Cân Bằng AI (Tự động đọc biển số, trọng lượng & kiểm tra STT) */}
            <label className="flex items-center gap-2 rounded-2xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:opacity-95 text-white px-4 py-2.5 text-xs font-bold shadow-md shadow-indigo-500/20 transition-all cursor-pointer active:scale-95">
              {isScanning ? (
                <>
                  <svg className="h-4 w-4 animate-spin text-white" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                  </svg>
                  <span>AI Đang Phân Tích Phiếu...</span>
                </>
              ) : (
                <>
                  <span className="text-sm">📷</span>
                  <span>Tự Động Quét Phiếu Cân (AI)</span>
                </>
              )}
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="image/*"
                capture="environment"
                onChange={handleFileChange}
                disabled={isScanning}
                className="hidden"
              />
            </label>
          </div>

          {/* Ô Tìm Kiếm Nhanh */}
          <div className="relative w-full sm:w-72">
            <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 pointer-events-none text-slate-400">
              🔍
            </span>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Tìm biển số, loại lúa, tài xế..."
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 pl-10 pr-4 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-100 transition-all"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400 hover:text-slate-600 text-xs"
              >
                ✕
              </button>
            )}
          </div>
        </div>

        {/* Bộ lọc tab trạng thái */}
        <div className="flex flex-wrap items-center gap-1.5 border-t border-slate-100 pt-3">
          <span className="text-xs font-semibold text-slate-400 mr-2">Lọc trạng thái:</span>
          <button
            onClick={() => setStatusFilter('all')}
            className={`rounded-xl px-3 py-1 text-xs font-bold transition-all cursor-pointer ${
              statusFilter === 'all'
                ? 'bg-slate-900 text-white shadow-2xs'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            Tất cả ({items.length})
          </button>
          <button
            onClick={() => setStatusFilter('cho_can')}
            className={`rounded-xl px-3 py-1 text-xs font-bold transition-all cursor-pointer ${
              statusFilter === 'cho_can'
                ? 'bg-amber-600 text-white shadow-2xs'
                : 'bg-amber-50 text-amber-800 hover:bg-amber-100'
            }`}
          >
            ⏳ Đang chờ cân ({summary.choCan})
          </button>
          <button
            onClick={() => setStatusFilter('da_can')}
            className={`rounded-xl px-3 py-1 text-xs font-bold transition-all cursor-pointer ${
              statusFilter === 'da_can'
                ? 'bg-emerald-600 text-white shadow-2xs'
                : 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
            }`}
          >
            ✅ Đã cân ({summary.daCan})
          </button>
          <button
            onClick={() => setStatusFilter('sai_stt')}
            className={`rounded-xl px-3 py-1 text-xs font-bold transition-all cursor-pointer ${
              statusFilter === 'sai_stt'
                ? 'bg-rose-600 text-white shadow-2xs'
                : 'bg-rose-50 text-rose-800 hover:bg-rose-100'
            }`}
          >
            ⚠️ Cân lệch STT ({summary.saiStt})
          </button>
        </div>
      </div>

      {/* BẢNG DANH SÁCH XE ĐĂNG TÀI & KẾT QUẢ CÂN */}
      <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-100/80 text-slate-700 font-bold">
                <th className="py-3.5 px-3 text-center w-28">Vị Trí / STT</th>
                <th className="py-3.5 px-3 text-center">Giờ Đăng Tài</th>
                <th className="py-3.5 px-4">Biển Số Xe</th>
                <th className="py-3.5 px-3">Nhà Cung Cấp</th>
                <th className="py-3.5 px-3">Loại Lúa</th>
                <th className="py-3.5 px-4 text-right">Ước Tính (Kg)</th>
                <th className="py-3.5 px-3">Tài Xế</th>
                <th className="py-3.5 px-3">Số Điện Thoại</th>
                <th className="py-3.5 px-3 text-center">Giờ Cân</th>
                <th className="py-3.5 px-3 text-center">Số Phiếu</th>
                <th className="py-3.5 px-4 text-right">TL Hàng Cân (Kg)</th>
                <th className="py-3.5 px-4 text-right">Chênh Lệch</th>
                <th className="py-3.5 px-3 text-center">Trạng Thái</th>
                <th className="py-3.5 px-4">Ghi Chú / Cảnh Báo</th>
                <th className="py-3.5 px-3 text-center">Thao Tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                <tr>
                  <td colSpan={15} className="py-12 text-center text-slate-400">
                    <div className="flex items-center justify-center gap-2">
                      <svg className="h-5 w-5 animate-spin text-blue-600" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                      </svg>
                      <span>Đang tải danh sách đăng tài...</span>
                    </div>
                  </td>
                </tr>
              ) : filteredItems.length === 0 ? (
                <tr>
                  <td colSpan={15} className="py-12 text-center text-slate-400">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <span className="text-3xl">🚛</span>
                      <p className="font-semibold text-slate-600">Chưa có xe nào trong danh sách đăng tài ngày này</p>
                      <p className="text-xs text-slate-400">Bấm &quot;+ Đăng Tài Xe Mới&quot; hoặc &quot;Dán Nhanh Từ Zalo&quot; để thêm xe</p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredItems.map((item) => {
                  const isDaCan = item.trangThai === 'da_can' || item.trangThai === 'sai_stt';
                  const isSaiStt = item.trangThai === 'sai_stt' || item.canHopLeSTT === false;

                  return (
                    <tr
                      key={item.id}
                      className={`transition-colors hover:bg-slate-50/80 ${
                        isSaiStt ? 'bg-rose-50/40' : isDaCan ? 'bg-emerald-50/20' : ''
                      }`}
                    >
                      {/* Vị Trí & STT (Cho phép đảo vị trí hàng nhưng giữ nguyên STT gốc) */}
                      <td className="py-2.5 px-2 text-center">
                        {(() => {
                          const realIndex = items.findIndex((x) => x.id === item.id);
                          const isFirst = realIndex <= 0;
                          const isLast = realIndex === -1 || realIndex >= items.length - 1;

                          return (
                            <div className="flex items-center justify-center gap-1.5">
                              {/* Nút bấm đảo nhanh Lên / Xuống 1 hàng */}
                              <div className="flex flex-col gap-0.5">
                                <button
                                  type="button"
                                  onClick={() => handleMoveRow(item.id, -1)}
                                  disabled={isFirst}
                                  title={isFirst ? 'Đang ở đầu bảng' : 'Đẩy xe này lên 1 hàng'}
                                  className="h-4 w-4 rounded flex items-center justify-center text-[10px] text-slate-500 hover:text-blue-700 hover:bg-blue-100 disabled:opacity-20 disabled:hover:bg-transparent cursor-pointer disabled:cursor-not-allowed transition-colors"
                                >
                                  ▲
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleMoveRow(item.id, 1)}
                                  disabled={isLast}
                                  title={isLast ? 'Đang ở cuối bảng' : 'Hạ xe này xuống 1 hàng'}
                                  className="h-4 w-4 rounded flex items-center justify-center text-[10px] text-slate-500 hover:text-blue-700 hover:bg-blue-100 disabled:opacity-20 disabled:hover:bg-transparent cursor-pointer disabled:cursor-not-allowed transition-colors"
                                >
                                  ▼
                                </button>
                              </div>

                              {/* Huy hiệu STT gốc - Bấm vào để mở hộp thoại chuyển đến hàng bất kỳ */}
                              <button
                                type="button"
                                onClick={() => handleOpenReorderModal(item)}
                                title={`STT ${item.stt} (Đang ở hàng #${realIndex + 1}) - Bấm để chuyển đến hàng khác`}
                                className="inline-flex flex-col items-center justify-center px-2 py-0.5 min-w-[38px] rounded-xl bg-slate-900 hover:bg-blue-600 text-white shadow-2xs transition-all cursor-pointer group"
                              >
                                <span className="text-xs font-black tracking-tight">{item.stt}</span>
                                <span className="text-[9px] text-slate-300 group-hover:text-blue-100 leading-none font-medium">
                                  #{realIndex >= 0 ? realIndex + 1 : '?'}
                                </span>
                              </button>
                            </div>
                          );
                        })()}
                      </td>

                      {/* Giờ đăng tài (người dùng điền) */}
                      <td className="py-3 px-3 text-center text-slate-700 font-mono font-bold text-xs">
                        {item.gioDangTai || '—'}
                      </td>

                      {/* Biển số xe */}
                      <td className="py-3 px-4 font-black">
                        <span className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 py-1 text-sm tracking-wider font-mono text-slate-900 shadow-2xs">
                          🚛 {item.bienSoXe}
                        </span>
                      </td>

                      {/* Nhà Cung Cấp (Khách hàng từ phiếu cân hoặc nhập) */}
                      <td className="py-3 px-3">
                        {item.nhaCungCap || item.khachHangCan ? (
                          <span className="inline-flex items-center gap-1 rounded-lg bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-900 border border-amber-200 shadow-2xs">
                            🏢 {item.nhaCungCap || item.khachHangCan}
                          </span>
                        ) : (
                          <span className="text-slate-400 italic text-[11px]">Chờ cân...</span>
                        )}
                      </td>

                      {/* Loại lúa */}
                      <td className="py-3 px-3 font-bold text-slate-700">
                        <span className="rounded-lg bg-slate-100 px-2 py-0.5 text-xs text-slate-800">
                          {item.loaiLua}
                        </span>
                      </td>

                      {/* Ước tính từ khách / tài (Kg) */}
                      <td className="py-3 px-4 text-right font-bold text-slate-700">
                        {item.soLuongUocTinh ? item.soLuongUocTinh.toLocaleString('vi-VN') : 0}
                      </td>

                      {/* Tên tài xế (Chọn từ combobox) */}
                      <td className="py-3 px-3">
                        <span className="font-semibold text-slate-900">{item.tenTaiXe || '—'}</span>
                      </td>

                      {/* SĐT tài xế (Tự ra khi chọn combobox) */}
                      <td className="py-3 px-3">
                        {item.sdtTaiXe ? (
                          <a
                            href={`tel:${item.sdtTaiXe}`}
                            className="inline-flex items-center gap-1 text-xs font-mono font-bold text-blue-600 hover:text-blue-800 hover:underline"
                            title="Gọi tài xế"
                          >
                            📞 {item.sdtTaiXe}
                          </a>
                        ) : (
                          <span className="text-slate-300 text-xs">—</span>
                        )}
                      </td>

                      {/* Giờ cân (Thời gian in trên phiếu cân thực tế) */}
                      <td className="py-3 px-3 text-center">
                        {item.ngayGioCan ? (
                          <div className="flex flex-col items-center">
                            <span className="font-mono text-xs font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-md border border-indigo-200">
                              ⏱️ {item.ngayGioCan.includes(' ') ? item.ngayGioCan.split(' ')[1] : item.ngayGioCan}
                            </span>
                            {item.ngayGioCan.includes(' ') && (
                              <span className="text-[10px] text-slate-400 font-mono mt-0.5">
                                {item.ngayGioCan.split(' ')[0]}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-300 italic text-[11px]">Chờ cân...</span>
                        )}
                      </td>

                      {/* Số phiếu cân */}
                      <td className="py-3 px-3 text-center">
                        {item.soPhieuCan ? (
                          <span className="inline-flex items-center rounded-lg bg-blue-100 px-2.5 py-0.5 font-mono text-xs font-bold text-blue-800">
                            #{item.soPhieuCan}
                          </span>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>

                      {/* Trọng lượng hàng cân thực tế */}
                      <td className="py-3 px-4 text-right font-black">
                        {item.tlHangKg ? (
                          <div className="text-emerald-700 text-sm">
                            {item.tlHangKg.toLocaleString('vi-VN')}
                            <span className="text-[10px] text-slate-400 font-normal ml-1">kg</span>
                          </div>
                        ) : (
                          <span className="text-slate-300 font-normal">Chờ cân...</span>
                        )}
                      </td>

                      {/* Chênh lệch */}
                      <td className="py-3 px-4 text-right font-bold">
                        {item.chenhLechKg !== undefined ? (
                          <span
                            className={`inline-flex items-center rounded-lg px-2 py-0.5 text-xs font-black ${
                              item.chenhLechKg > 0
                                ? 'bg-blue-50 text-blue-700'
                                : item.chenhLechKg < 0
                                ? 'bg-rose-50 text-rose-700'
                                : 'bg-slate-100 text-slate-700'
                            }`}
                          >
                            {item.chenhLechKg > 0 ? '+' : ''}
                            {item.chenhLechKg.toLocaleString('vi-VN')} kg
                          </span>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>

                      {/* Trạng thái */}
                      <td className="py-3 px-3 text-center">
                        {isSaiStt ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2.5 py-0.5 text-[11px] font-bold text-rose-800 shadow-2xs">
                            ⚠️ Cân lệch STT
                          </span>
                        ) : isDaCan ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-[11px] font-bold text-emerald-800 shadow-2xs">
                            ✅ Đã cân
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-[11px] font-bold text-amber-800 shadow-2xs">
                            ⏳ Chờ cân
                          </span>
                        )}
                      </td>

                      {/* Ghi chú / Lời cảnh báo */}
                      <td className="py-3 px-4 max-w-xs">
                        {item.canhBaoSTT && (
                          <div className="text-rose-600 font-bold text-[11px] mb-1">
                            {item.canhBaoSTT}
                          </div>
                        )}
                        {item.ghiChu && (
                          <div className="text-slate-600 text-xs italic">
                            {item.ghiChu}
                          </div>
                        )}
                        {item.ngayGioCan && (
                          <div className="text-[10px] text-slate-400">
                            🕒 Cân lúc: {item.ngayGioCan}
                          </div>
                        )}
                      </td>

                      {/* Thao tác */}
                      <td className="py-3 px-3 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          {item.anhPhieuCan && (
                            <button
                              onClick={() => {
                                setViewingImage(item.anhPhieuCan || null);
                                setViewingImageRotation(0);
                                setViewingImageZoom(1);
                              }}
                              title="Xem ảnh phiếu cân gốc"
                              className="rounded-lg p-1.5 text-blue-600 hover:bg-blue-50 transition-colors cursor-pointer"
                            >
                              🖼️
                            </button>
                          )}
                          <button
                            onClick={() => handleOpenReorderModal(item)}
                            title="Đổi vị trí hàng xe trên bảng (giữ nguyên STT)"
                            className="rounded-lg p-1.5 text-indigo-600 hover:bg-indigo-50 transition-colors cursor-pointer"
                          >
                            ⇅
                          </button>
                          <button
                            onClick={() => handleOpenEditModal(item)}
                            title="Chỉnh sửa thông tin"
                            className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 transition-colors cursor-pointer"
                          >
                            ✏️
                          </button>
                          <button
                            onClick={() => handleDeleteTruck(item.id, item.bienSoXe)}
                            title="Xóa xe"
                            className="rounded-lg p-1.5 text-rose-500 hover:bg-rose-50 transition-colors cursor-pointer"
                          >
                            🗑️
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL THÊM / CHỈNH SỬA XE ĐĂNG TÀI */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="w-full max-w-lg rounded-3xl bg-white p-6 sm:p-8 shadow-2xl relative">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <h3 className="text-lg font-bold text-slate-900">
                {editingTruck ? '✏️ Chỉnh Sửa Xe Đăng Tài' : '🚛 Đăng Tài Xe Mới'}
              </h3>
              <button
                onClick={() => setShowAddModal(false)}
                className="rounded-full p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveTruck} className="mt-5 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">STT Lượt Tài</label>
                  <input
                    type="number"
                    min={1}
                    value={formStt}
                    onChange={(e) => setFormStt(parseInt(e.target.value, 10) || 1)}
                    required
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm font-bold text-slate-900 focus:border-blue-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Giờ Đăng Tài <span className="text-blue-600 font-semibold">(tự điền/sửa)</span>
                  </label>
                  <input
                    type="time"
                    value={formGioDangTai}
                    onChange={(e) => setFormGioDangTai(e.target.value)}
                    required
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Biển Số Xe <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={formBienSo}
                    onChange={(e) => setFormBienSo(e.target.value.toUpperCase())}
                    placeholder="VD: 70H-03268"
                    required
                    autoFocus
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm font-mono font-bold text-slate-900 focus:border-blue-500 focus:outline-none uppercase"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Nhà Cung Cấp <span className="text-slate-400 font-normal">(Khách hàng trên phiếu cân)</span>
                </label>
                <input
                  type="text"
                  value={formNhaCungCap}
                  onChange={(e) => setFormNhaCungCap(e.target.value)}
                  placeholder="VD: A LAM TAY NINH (hoặc tự động cập nhật khi quét phiếu cân)"
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Loại Lúa</label>
                  <input
                    type="text"
                    value={formLoaiLua}
                    onChange={(e) => setFormLoaiLua(e.target.value)}
                    placeholder="VD: 5451, OM18, Đài Thơm"
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Ước Lượng Tính Của Khách (Kg)
                  </label>
                  <input
                    type="text"
                    value={formSoLuong}
                    onChange={(e) => setFormSoLuong(e.target.value)}
                    placeholder="VD: 32000 hoặc 32 tấn"
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Tài Xế (Chọn từ danh bạ thông minh)
                  </label>
                  <DriverCombobox
                    value={formTenTaiXe}
                    phoneValue={formSdtTaiXe}
                    onSelect={(name, phone) => {
                      setFormTenTaiXe(name);
                      if (phone) setFormSdtTaiXe(phone);
                    }}
                    placeholder="Gõ tên tài xế (không dấu)..."
                    inputClassName="text-sm font-semibold"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    SĐT Tài Xế <span className="text-blue-600 font-semibold">(tự động ra khi chọn)</span>
                  </label>
                  <input
                    type="text"
                    value={formSdtTaiXe}
                    onChange={(e) => setFormSdtTaiXe(e.target.value)}
                    placeholder="VD: 0987778797"
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm font-mono font-semibold text-slate-900 focus:border-blue-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Ghi Chú</label>
                <textarea
                  value={formGhiChu}
                  onChange={(e) => setFormGhiChu(e.target.value)}
                  placeholder="Ghi chú thêm về xe, khách hàng..."
                  rows={2}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="rounded-xl px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 cursor-pointer"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="rounded-xl bg-blue-600 hover:bg-blue-700 px-5 py-2.5 text-xs font-bold text-white shadow-md shadow-blue-500/20 cursor-pointer"
                >
                  {editingTruck ? 'Lưu Thay Đổi' : 'Xác Nhận Đăng Tài'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL BÁO CÁO ZALO NHANH (TRƯA 11H30 & CHIỀU 17H00) */}
      {showZaloReportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="w-full max-w-xl rounded-3xl bg-white p-6 sm:p-7 shadow-2xl relative">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div className="flex items-center gap-2">
                <span className="text-2xl">📱</span>
                <div>
                  <h3 className="text-lg font-black text-slate-900">Báo Cáo Zalo Nhanh</h3>
                  <p className="text-xs text-slate-500">Định dạng chuẩn gửi Ban Giám Đốc &amp; Nhóm Điều Phối</p>
                </div>
              </div>
              <button
                onClick={() => setShowZaloReportModal(false)}
                className="rounded-full p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600 cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Chọn Ca Báo Cáo: Trưa 11h30 vs Chiều 17h00 */}
            <div className="mt-4 flex rounded-2xl bg-slate-100 p-1.5 gap-1.5">
              <button
                type="button"
                onClick={() => handleChangeZaloShift('trua', zaloReportOnlyMorning)}
                className={`flex-1 flex items-center justify-center gap-2 rounded-xl py-2.5 text-xs font-bold transition-all cursor-pointer ${
                  zaloReportShift === 'trua'
                    ? 'bg-amber-500 text-white shadow-md shadow-amber-500/20'
                    : 'text-slate-600 hover:bg-slate-200/70'
                }`}
              >
                <span>☀️</span>
                <span>Báo Cáo Trưa (11h30)</span>
              </button>

              <button
                type="button"
                onClick={() => handleChangeZaloShift('chieu', false)}
                className={`flex-1 flex items-center justify-center gap-2 rounded-xl py-2.5 text-xs font-bold transition-all cursor-pointer ${
                  zaloReportShift === 'chieu'
                    ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20'
                    : 'text-slate-600 hover:bg-slate-200/70'
                }`}
              >
                <span>🌅</span>
                <span>Báo Cáo Chiều (17h00)</span>
              </button>
            </div>

            {/* Tùy chọn lọc ca sáng cho ca trưa */}
            {zaloReportShift === 'trua' && (
              <div className="mt-3 flex items-center justify-between bg-amber-50 rounded-xl px-3.5 py-2 border border-amber-200 text-xs">
                <label className="flex items-center gap-2 text-amber-900 font-semibold cursor-pointer">
                  <input
                    type="checkbox"
                    checked={zaloReportOnlyMorning}
                    onChange={(e) => handleChangeZaloShift('trua', e.target.checked)}
                    className="h-4 w-4 rounded border-amber-300 text-amber-600 focus:ring-amber-500"
                  />
                  <span>Chỉ tính các xe đăng tài trước 11:30</span>
                </label>
                <span className="text-[11px] text-amber-700">
                  {zaloReportOnlyMorning ? 'Đang lọc trước 11h30' : 'Đang tính tất cả xe'}
                </span>
              </div>
            )}

            {/* Vùng xem trước và cho phép sửa văn bản */}
            <div className="mt-4">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-bold text-slate-700">
                  Nội dung tin nhắn (bạn có thể gõ thêm ghi chú nếu cần):
                </span>
                <button
                  type="button"
                  onClick={() => setZaloReportText(generateZaloReport(zaloReportShift, zaloReportOnlyMorning))}
                  className="text-[11px] font-bold text-blue-600 hover:underline cursor-pointer"
                >
                  🔄 Tạo lại mẫu gốc
                </button>
              </div>
              <textarea
                value={zaloReportText}
                onChange={(e) => setZaloReportText(e.target.value)}
                rows={11}
                className="w-full rounded-2xl border border-slate-300 bg-slate-900 p-4 font-mono text-xs text-emerald-400 focus:border-blue-500 focus:outline-none shadow-inner leading-relaxed select-all"
              />
            </div>

            {/* Các nút hành động */}
            <div className="mt-5 flex items-center justify-between gap-3 pt-3 border-t border-slate-100">
              <span className="text-[11px] text-slate-400">
                💡 Bấm copy xong chỉ cần qua Zalo ấn <strong>Ctrl + V</strong> để gửi.
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowZaloReportModal(false)}
                  className="rounded-xl px-4 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-100 cursor-pointer"
                >
                  Đóng
                </button>
                <button
                  type="button"
                  onClick={handleCopyZaloReport}
                  className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 px-5 py-2.5 text-xs font-bold text-white shadow-md shadow-emerald-500/20 active:scale-95 cursor-pointer"
                >
                  <span>📋</span>
                  <span>Sao Chép Vào Zalo</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL THÊM NHANH HÀNG LOẠT (PASTE TỪ ZALO) */}
      {showBulkModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="w-full max-w-xl rounded-3xl bg-white p-6 sm:p-8 shadow-2xl relative">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div>
                <h3 className="text-lg font-bold text-slate-900">📋 Dán Danh Sách Nhanh Từ Zalo / Excel</h3>
                <p className="text-xs text-slate-500">Mỗi xe trên 1 dòng, hệ thống tự động bóc tách biển số &amp; sản lượng</p>
              </div>
              <button
                onClick={() => setShowBulkModal(false)}
                className="rounded-full p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="mt-4 space-y-4">
              <div className="rounded-2xl bg-blue-50/80 p-3.5 border border-blue-200 text-xs text-blue-900">
                <p className="font-bold mb-1">💡 Mẹo dán định dạng:</p>
                <p>Bạn có thể copy danh sách xe từ Zalo, ví dụ:</p>
                <code className="block bg-white p-2 rounded-lg mt-1 font-mono text-[11px] text-slate-700 border border-blue-100">
                  70H-03268 32 tấn 5451 Tài A Lâm 0987778797<br />
                  66C-12345 30 tấn OM18 Tài Nam<br />
                  68C-54321 35000 5451
                </code>
              </div>

              <textarea
                value={bulkText}
                onChange={(e) => setBulkText(e.target.value)}
                placeholder="Dán nội dung danh sách xe vào đây..."
                rows={8}
                className="w-full rounded-2xl border border-slate-300 p-3.5 text-xs font-mono text-slate-900 focus:border-blue-500 focus:outline-none"
              />

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowBulkModal(false)}
                  className="rounded-xl px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 cursor-pointer"
                >
                  Hủy
                </button>
                <button
                  type="button"
                  onClick={handleBulkAdd}
                  className="rounded-xl bg-blue-600 hover:bg-blue-700 px-5 py-2.5 text-xs font-bold text-white shadow-md shadow-blue-500/20 cursor-pointer"
                >
                  Tự Động Thêm Vào Danh Sách
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL KẾT QUẢ QUÉT PHIẾU CÂN VÀ CẢNH BÁO THỨ TỰ */}
      {showScanResultModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="w-full max-w-2xl rounded-3xl bg-white p-6 sm:p-8 shadow-2xl relative">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div>
                <h3 className="text-lg font-bold text-slate-900">📷 Kết Quả Quét Phiếu Cân Bằng AI</h3>
                <p className="text-xs text-slate-500">Đối soát thứ tự STT và cập nhật tự động vào bảng</p>
              </div>
              <button
                onClick={() => setShowScanResultModal(false)}
                className="rounded-full p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="mt-5 space-y-4 max-h-[60vh] overflow-y-auto pr-1">
              {scanResults.map((res, idx) => (
                <div
                  key={idx}
                  className={`rounded-2xl p-4 border transition-all ${
                    !res.success
                      ? 'bg-rose-50 border-rose-300'
                      : !res.isValidOrder
                      ? 'bg-amber-50 border-amber-300'
                      : 'bg-emerald-50 border-emerald-300'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-base font-bold">
                          {!res.success ? '❌' : !res.isValidOrder ? '⚠️' : '✅'}
                        </span>
                        <span className="font-bold text-sm text-slate-900">
                          {res.phieu?.soXe ? `Xe ${res.phieu.soXe}` : res.fileName}
                        </span>
                        {res.phieu?.soPhieu && (
                          <span className="rounded-md bg-blue-100 px-2 py-0.5 text-xs font-mono font-bold text-blue-800">
                            Số phiếu: #{res.phieu.soPhieu}
                          </span>
                        )}
                      </div>

                      {/* Thông báo cảnh báo nổi bật */}
                      {res.warningMessage && (
                        <div className="mt-2.5 rounded-xl bg-rose-100/80 p-3 text-xs font-bold text-rose-900 border border-rose-200">
                          {res.warningMessage}
                        </div>
                      )}

                      {/* Chi tiết dữ liệu đã bóc tách & tự động điền */}
                      {res.phieu && (
                        <div className="mt-2.5 grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs text-slate-700 bg-white/70 p-2.5 rounded-xl border border-slate-200/60 font-medium">
                          <div>
                            <span className="text-slate-400">Trọng lượng hàng: </span>
                            <span className="font-bold text-emerald-700">
                              {res.phieu.tlHangKg ? res.phieu.tlHangKg.toLocaleString('vi-VN') : 0} kg
                            </span>
                          </div>
                          <div>
                            <span className="text-slate-400">Trọng lượng xe: </span>
                            <span>{res.phieu.tlXeKg ? res.phieu.tlXeKg.toLocaleString('vi-VN') : 0} kg</span>
                          </div>
                          <div>
                            <span className="text-slate-400">Xe + hàng: </span>
                            <span>{res.phieu.tlXeHangKg ? res.phieu.tlXeHangKg.toLocaleString('vi-VN') : 0} kg</span>
                          </div>
                          {res.phieu.loaiHang && (
                            <div>
                              <span className="text-slate-400">Loại hàng: </span>
                              <span className="font-bold">{res.phieu.loaiHang}</span>
                            </div>
                          )}
                          {res.phieu.khachHang && (
                            <div>
                              <span className="text-slate-400">Khách hàng: </span>
                              <span>{res.phieu.khachHang}</span>
                            </div>
                          )}
                          {res.phieu.ngayGioCan && (
                            <div>
                              <span className="text-slate-400">Giờ cân: </span>
                              <span>{res.phieu.ngayGioCan}</span>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Ghi nhận tự động điền */}
                      {res.matched && (
                        <div className="mt-2 text-xs font-semibold text-emerald-800">
                          ✓ Đã tự động điền thông tin cân vào đúng biển số xe {res.phieu?.soXe} trên bảng đăng tài.
                        </div>
                      )}

                      {res.error && (
                        <div className="mt-2 text-xs text-rose-700 font-semibold">
                          Lỗi: {res.error}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-6 flex justify-end border-t border-slate-100 pt-4">
              <button
                onClick={() => setShowScanResultModal(false)}
                className="rounded-xl bg-slate-900 hover:bg-slate-800 px-6 py-2.5 text-xs font-bold text-white shadow-md cursor-pointer"
              >
                Đã hiểu &amp; Đóng
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL XEM TRƯỚC VÀ SOÁT LỖI SỔ ĐĂNG TÀI VIẾT TAY (AI OCR) */}
      {showLogPreviewModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-2 sm:p-4 overflow-y-auto">
          <div className="w-full max-w-7xl max-h-[95vh] rounded-3xl bg-white p-5 sm:p-7 shadow-2xl flex flex-col overflow-hidden">
            {/* Header Modal */}
            <div className="flex items-center justify-between border-b border-slate-200 pb-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xl">📋</span>
                  <h3 className="text-lg font-black text-slate-900">
                    Đối Chiếu &amp; Soát Lỗi Sổ Đăng Tài Viết Tay
                  </h3>
                  <span className="rounded-full bg-blue-100 text-blue-800 text-xs px-2.5 py-0.5 font-bold">
                    {logPreviewItems.length} xe
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  Quét ảnh để hỗ trợ nhập nhanh - Hãy đối chiếu với ảnh gốc và sửa các ô nghi ngờ trước khi lưu
                </p>
              </div>
              <button
                onClick={() => setShowLogPreviewModal(false)}
                className="rounded-full p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600 cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Banner Hướng Dẫn & Quy Tắc Kiểm Soát Rủi Ro */}
            <div className="mt-3.5 grid grid-cols-1 sm:grid-cols-3 gap-2.5 rounded-2xl bg-slate-50 p-3 border border-slate-200 text-xs text-slate-700">
              <div className="flex items-start gap-2">
                <span className="text-rose-600 font-bold">🔴 Tô đỏ:</span>
                <span>
                  <strong>Sai định dạng biển số VN</strong> (Regex <code className="bg-rose-100 text-rose-800 px-1 py-0.5 rounded">^\d&#123;2&#125;[A-Z]...</code>) hoặc thiếu tỉnh như 00463, 03773.
                </span>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-amber-600 font-bold">🟡 Tô vàng:</span>
                <span>
                  <strong>Nghi ngờ nét chữ</strong> các cặp số dễ nhầm: <strong>1/7, 0/6, 3/8, 4/9</strong>. Vui lòng soi lại ảnh!
                </span>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-blue-600 font-bold">⚖️ Chuẩn hóa tải:</span>
                <span>
                  Tự động đổi <strong>34T / 34 tấn</strong> thành <strong>34.000 kg</strong> (số nguyên).
                </span>
              </div>
            </div>

            {/* Split Screen Container: Bên Trái Ảnh Gốc - Bên Phải Bảng Sửa Dữ Liệu */}
            <div className="mt-4 flex-1 grid grid-cols-1 lg:grid-cols-12 gap-4 overflow-hidden min-h-[480px]">
              {/* CỘT TRÁI: ẢNH CHỤP SỔ GỐC (CÓ ZOOM & PAN) */}
              <div className="lg:col-span-5 flex flex-col rounded-2xl border border-slate-200 bg-slate-900 overflow-hidden relative">
                {/* Thanh điều khiển Zoom */}
                <div className="flex items-center justify-between bg-slate-800/90 px-3 py-2 text-xs text-white z-10">
                  <span className="font-bold flex items-center gap-1.5">
                    <span>🖼️ Ảnh sổ gốc</span>
                    <span className="text-slate-400 text-[11px]">
                      {logImageRotation !== 0 ? `(${logImageRotation}°)` : ''} ({Math.round(logImageZoom * 100)}%)
                    </span>
                  </span>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setLogImageRotation((r) => (r - 90 + 360) % 360)}
                      className="rounded-lg bg-slate-700 hover:bg-slate-600 px-2 py-1 text-xs font-bold text-white cursor-pointer"
                      title="Xoay trái (-90°)"
                    >
                      ⟲ Trái
                    </button>
                    <button
                      type="button"
                      onClick={() => setLogImageRotation((r) => (r + 90) % 360)}
                      className="rounded-lg bg-blue-600 hover:bg-blue-500 px-2 py-1 text-xs font-bold text-white cursor-pointer shadow-xs"
                      title="Xoay phải (+90°)"
                    >
                      ⟳ Phải
                    </button>
                    <button
                      type="button"
                      onClick={() => setLogImageZoom((z) => Math.max(0.5, z - 0.25))}
                      className="rounded-lg bg-slate-700 hover:bg-slate-600 px-2 py-1 text-xs font-bold cursor-pointer"
                      title="Thu nhỏ"
                    >
                      ➖
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setLogImageZoom(1);
                        setLogImageRotation(0);
                      }}
                      className="rounded-lg bg-slate-700 hover:bg-slate-600 px-2 py-1 text-xs font-bold cursor-pointer"
                      title="Đặt lại góc xoay và kích thước"
                    >
                      100%
                    </button>
                    <button
                      type="button"
                      onClick={() => setLogImageZoom((z) => Math.min(3, z + 0.25))}
                      className="rounded-lg bg-slate-700 hover:bg-slate-600 px-2 py-1 text-xs font-bold cursor-pointer"
                      title="Phóng to"
                    >
                      ➕
                    </button>
                  </div>
                </div>

                {/* Vùng hiển thị ảnh có cuộn */}
                <div className="flex-1 overflow-auto p-4 flex items-center justify-center bg-slate-950">
                  {logPreviewImage ? (
                    <div
                      style={{
                        transform: `scale(${logImageZoom}) rotate(${logImageRotation}deg)`,
                        transformOrigin: 'center center',
                        transition: 'transform 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
                      }}
                      className="w-full flex justify-center items-center"
                    >
                      <Image
                        src={logPreviewImage}
                        alt="Ảnh sổ đăng tài gốc"
                        width={800}
                        height={1200}
                        unoptimized
                        className="max-w-full h-auto object-contain rounded-lg shadow-lg select-none"
                      />
                    </div>
                  ) : (
                    <span className="text-slate-400 text-xs">Không có ảnh xem trước</span>
                  )}
                </div>
              </div>

              {/* CỘT PHẢI: BẢNG SỬA TAY VÀ SOÁT LỖI TRỰC TIẾP */}
              <div className="lg:col-span-7 flex flex-col rounded-2xl border border-slate-200 bg-white overflow-hidden">
                <div className="flex items-center justify-between bg-slate-100 px-4 py-2.5 border-b border-slate-200">
                  <div className="text-xs font-bold text-slate-800 flex items-center gap-2">
                    <span>✏️ Bảng Dữ Liệu Sửa Trực Tiếp</span>
                    <span className="text-slate-500 font-normal">
                      (Click ô để sửa - Biển số sai sẽ tự động mất đỏ khi gõ đúng)
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={handleAddLogItem}
                    className="flex items-center gap-1 rounded-xl bg-blue-600 hover:bg-blue-700 text-white px-2.5 py-1 text-xs font-bold cursor-pointer"
                  >
                    <span>+ Thêm Dòng</span>
                  </button>
                </div>

                <div className="flex-1 overflow-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="sticky top-0 bg-slate-50 border-b border-slate-200 z-10">
                      <tr className="text-slate-600 font-bold">
                        <th className="py-2.5 px-2 text-center w-12">STT</th>
                        <th className="py-2.5 px-2 text-center w-16">Giờ</th>
                        <th className="py-2.5 px-3 w-36">
                          Biển Số Xe <span className="text-rose-500">*</span>
                        </th>
                        <th className="py-2.5 px-2 w-32">Nhà Cung Cấp</th>
                        <th className="py-2.5 px-2 w-20">Lúa</th>
                        <th className="py-2.5 px-3 text-right w-28">Ước Tính (Kg)</th>
                        <th className="py-2.5 px-2">Tài Xế</th>
                        <th className="py-2.5 px-2">SĐT</th>
                        <th className="py-2.5 px-2 w-24">Cảnh Báo</th>
                        <th className="py-2.5 px-2 text-center w-10">Xóa</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {logPreviewItems.map((item, idx) => {
                        const isInvalidPlate = !item.isValidPlate;
                        const isUncertainPlate = item.uncertainFields.includes('bienSoXe');

                        return (
                          <tr key={item.tempId} className="hover:bg-slate-50/70">
                            {/* STT */}
                            <td className="py-2 px-1 text-center">
                              <input
                                type="number"
                                min={1}
                                value={item.stt}
                                onChange={(e) =>
                                  handleLogItemChange(item.tempId, 'stt', parseInt(e.target.value, 10) || idx + 1)
                                }
                                className="w-10 text-center font-bold text-xs bg-slate-100 rounded-md py-1 border border-slate-200"
                              />
                            </td>

                            {/* Giờ đăng tài */}
                            <td className="py-2 px-1 text-center">
                              <input
                                type="text"
                                value={item.gioDangTai}
                                onChange={(e) => handleLogItemChange(item.tempId, 'gioDangTai', e.target.value)}
                                className="w-14 text-center text-xs bg-slate-50 rounded-md py-1 border border-slate-200"
                              />
                            </td>

                            {/* Biển số xe (TÔ ĐỎ NẾU SAI REGEX, TÔ VÀNG NẾU NGHI NGỜ 1/7, 0/6, 3/8, 4/9) */}
                            <td className="py-2 px-2">
                              <div className="relative">
                                <input
                                  type="text"
                                  value={item.bienSoXe}
                                  onChange={(e) =>
                                    handleLogItemChange(item.tempId, 'bienSoXe', e.target.value.toUpperCase())
                                  }
                                  placeholder="VD: 70H-03268"
                                  className={`w-full font-mono text-xs font-bold rounded-lg px-2.5 py-1.5 uppercase transition-all ${
                                    isInvalidPlate
                                      ? 'bg-rose-100 border-2 border-rose-500 text-rose-950 ring-2 ring-rose-200'
                                      : isUncertainPlate
                                      ? 'bg-amber-100 border-2 border-amber-500 text-amber-950 ring-2 ring-amber-200'
                                      : 'bg-white border border-slate-300 text-slate-900 focus:border-blue-500'
                                  }`}
                                />
                                {isInvalidPlate && (
                                  <span
                                    title="Biển số chưa đúng định dạng chuẩn xe VN (^\d{2}[A-Z]...)"
                                    className="absolute -top-2 right-1 rounded-full bg-rose-600 text-white text-[9px] px-1 font-bold"
                                  >
                                    Sai Regex
                                  </span>
                                )}
                                {!isInvalidPlate && isUncertainPlate && (
                                  <span
                                    title={item.canhBao || 'Nghi ngờ nét chữ 1/7, 0/6, 3/8, 4/9'}
                                    className="absolute -top-2 right-1 rounded-full bg-amber-600 text-white text-[9px] px-1 font-bold"
                                  >
                                    Soi lại
                                  </span>
                                )}
                              </div>
                            </td>

                            {/* Nhà Cung Cấp (Khách hàng) */}
                            <td className="py-2 px-1">
                              <input
                                type="text"
                                value={item.nhaCungCap || ''}
                                onChange={(e) => handleLogItemChange(item.tempId, 'nhaCungCap', e.target.value)}
                                placeholder="Khách hàng/NCC"
                                className="w-full text-xs bg-white rounded-md px-1.5 py-1 border border-slate-200"
                              />
                            </td>

                            {/* Loại lúa */}
                            <td className="py-2 px-1">
                              <input
                                type="text"
                                value={item.loaiLua}
                                onChange={(e) => handleLogItemChange(item.tempId, 'loaiLua', e.target.value)}
                                className="w-full text-xs font-semibold bg-white rounded-md px-1.5 py-1 border border-slate-200"
                              />
                            </td>

                            {/* Số lượng ước tính (Tự động chuẩn hóa tấn -> kg) */}
                            <td className="py-2 px-2 text-right">
                              <input
                                type="text"
                                value={item.soLuongUocTinh ? item.soLuongUocTinh.toLocaleString('vi-VN') : ''}
                                onChange={(e) =>
                                  handleLogItemChange(item.tempId, 'soLuongUocTinh', e.target.value)
                                }
                                placeholder="VD: 34T hoặc 34000"
                                className="w-full text-right text-xs font-bold bg-white rounded-md px-2 py-1 border border-slate-200 text-slate-800"
                              />
                            </td>

                            {/* Tên tài xế (Combobox tìm kiếm & thêm danh bạ tại chỗ) */}
                            <td className="py-2 px-1 min-w-[150px]">
                              <DriverCombobox
                                value={item.tenTaiXe || ''}
                                phoneValue={item.sdtTaiXe || ''}
                                onSelect={(name, phone) => {
                                  handleLogItemChange(item.tempId, 'tenTaiXe', name);
                                  if (phone) handleLogItemChange(item.tempId, 'sdtTaiXe', phone);
                                }}
                                placeholder="Tài xế..."
                                inputClassName="py-1 px-2 text-xs"
                              />
                            </td>

                            {/* SĐT */}
                            <td className="py-2 px-1 w-28">
                              <input
                                type="text"
                                value={item.sdtTaiXe || ''}
                                onChange={(e) => handleLogItemChange(item.tempId, 'sdtTaiXe', e.target.value)}
                                placeholder="SĐT"
                                className="w-full text-xs font-mono bg-white rounded-md px-1.5 py-1 border border-slate-200"
                              />
                            </td>

                            {/* Cảnh báo ghi chú nếu có */}
                            <td className="py-2 px-2">
                              {item.canhBao ? (
                                <span className="text-[10px] text-amber-800 font-semibold leading-tight line-clamp-2" title={item.canhBao}>
                                  ⚠️ {item.canhBao}
                                </span>
                              ) : (
                                <span className="text-[10px] text-emerald-700 font-bold">✓ Rõ nét</span>
                              )}
                            </td>

                            {/* Nút xóa dòng */}
                            <td className="py-2 px-1 text-center">
                              <button
                                type="button"
                                onClick={() => handleDeleteLogItem(item.tempId)}
                                className="text-slate-400 hover:text-rose-600 rounded p-1"
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
              </div>
            </div>

            {/* Footer Modal: Tổng kết & Nút Xác Nhận */}
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-3">
              <div className="flex items-center gap-3 text-xs">
                <span className="font-bold text-slate-700">
                  Tổng cộng: <strong className="text-blue-700 font-black">{logPreviewItems.length} xe</strong>
                </span>
                {logPreviewItems.some((x) => !x.isValidPlate) && (
                  <span className="rounded-md bg-rose-100 text-rose-800 px-2.5 py-0.5 font-bold">
                    ⚠️ Có {logPreviewItems.filter((x) => !x.isValidPlate).length} xe chưa khớp định dạng biển số VN
                  </span>
                )}
                {logPreviewItems.some((x) => x.uncertainFields.length > 0) && (
                  <span className="rounded-md bg-amber-100 text-amber-900 px-2.5 py-0.5 font-bold">
                    🟡 Có {logPreviewItems.filter((x) => x.uncertainFields.length > 0).length} ô nghi ngờ nét chữ viết tay
                  </span>
                )}
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setShowLogPreviewModal(false)}
                  className="rounded-xl px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 cursor-pointer"
                >
                  Hủy Bỏ
                </button>
                <button
                  type="button"
                  onClick={handleConfirmLogItems}
                  className="rounded-xl bg-emerald-600 hover:bg-emerald-700 px-5 py-2.5 text-xs font-bold text-white shadow-lg shadow-emerald-600/30 transition-all active:scale-95 cursor-pointer"
                >
                  ✅ Xác Nhận Đăng Tài ({logPreviewItems.length} Xe) Vào Hệ Thống
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL ĐẢO VỊ TRÍ HÀNG XE TRÊN BẢNG (STT GỐC GIỮ NGUYÊN) */}
      {reorderingTruck && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-fadeIn">
          <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl border border-slate-100">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <div className="flex items-center gap-2">
                <span className="text-xl">⇅</span>
                <h3 className="font-black text-slate-900 text-base">Đổi Vị Trí Hàng Trên Bảng</h3>
              </div>
              <button
                type="button"
                onClick={() => setReorderingTruck(null)}
                className="text-slate-400 hover:text-slate-600 rounded-lg p-1 text-sm cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="mb-4 rounded-2xl bg-blue-50/70 border border-blue-100 p-3.5 text-xs text-blue-900 space-y-1.5">
              <div className="font-bold flex items-center gap-2 text-blue-950 flex-wrap">
                <span>🚛 Biển số: <strong className="font-mono bg-white px-2 py-0.5 rounded-md border border-blue-200 text-slate-900">{reorderingTruck.bienSoXe}</strong></span>
                <span>•</span>
                <span>STT đăng tài: <strong className="bg-slate-900 text-white px-2 py-0.5 rounded-md font-mono">STT {reorderingTruck.stt}</strong></span>
              </div>
              <p className="text-blue-800">
                Vị trí hiện tại: Hàng số <strong>{items.findIndex((x) => x.id === reorderingTruck.id) + 1}</strong> trên tổng {items.length} xe.
              </p>
              <div className="text-slate-600 text-[11px] pt-1 border-t border-blue-100/60 leading-relaxed">
                💡 <em>STT đăng tài của xe (<strong>STT {reorderingTruck.stt}</strong>) sẽ được <strong>GIỮ NGUYÊN</strong>, chỉ vị trí hiển thị và thứ tự ưu tiên cân trên bảng được chuyển đến hàng bạn chọn.</em>
              </div>
            </div>

            <div className="space-y-3 mb-6">
              <label className="block text-xs font-bold text-slate-700">
                Chuyển xe này đến vị trí hàng số:
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={1}
                  max={items.length}
                  value={targetRowInput}
                  onChange={(e) => {
                    const val = parseInt(e.target.value, 10);
                    setTargetRowInput(isNaN(val) ? 1 : val);
                  }}
                  className="w-24 text-center rounded-xl border border-slate-300 py-2 font-black text-xl text-blue-600 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none"
                />
                <span className="text-xs text-slate-500 font-semibold">/ Tổng cộng {items.length} hàng</span>
              </div>

              {/* Phím tắt chọn nhanh vị trí */}
              <div className="flex flex-wrap gap-1.5 pt-1">
                <button
                  type="button"
                  onClick={() => setTargetRowInput(1)}
                  className="rounded-lg bg-slate-100 hover:bg-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-700 cursor-pointer"
                >
                  ⬆ Lên đầu (Hàng 1)
                </button>
                <button
                  type="button"
                  onClick={() => setTargetRowInput((prev) => Math.max(1, prev - 1))}
                  className="rounded-lg bg-slate-100 hover:bg-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-700 cursor-pointer"
                >
                  ▲ Lên 1 hàng
                </button>
                <button
                  type="button"
                  onClick={() => setTargetRowInput((prev) => Math.min(items.length, prev + 1))}
                  className="rounded-lg bg-slate-100 hover:bg-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-700 cursor-pointer"
                >
                  ▼ Xuống 1 hàng
                </button>
                <button
                  type="button"
                  onClick={() => setTargetRowInput(items.length)}
                  className="rounded-lg bg-slate-100 hover:bg-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-700 cursor-pointer"
                >
                  ⬇ Xuống cuối (Hàng {items.length})
                </button>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setReorderingTruck(null)}
                className="rounded-xl px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 cursor-pointer"
              >
                Hủy Bỏ
              </button>
              <button
                type="button"
                onClick={() => handleConfirmReorder(targetRowInput)}
                className="rounded-xl bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 text-xs font-bold cursor-pointer shadow-md shadow-blue-600/30 transition-all active:scale-95"
              >
                Xác Nhận Chuyển Vị Trí
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL XEM ẢNH PHIẾU CÂN GỐC (HỖ TRỢ XOAY TRÁI, XOAY PHẢI, PHÓNG TO, THU NHỎ) */}
      {viewingImage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-2 sm:p-5 overflow-hidden animate-fadeIn">
          <div className="relative w-full max-w-5xl h-[92vh] rounded-3xl bg-slate-900 border border-white/10 shadow-2xl flex flex-col overflow-hidden">
            {/* Thanh công cụ Toolbar trên đầu */}
            <div className="flex flex-wrap items-center justify-between bg-slate-800/95 px-4 py-3 border-b border-white/10 text-white z-10 gap-2">
              <div className="flex items-center gap-2">
                <span className="text-lg">🖼️</span>
                <span className="text-xs sm:text-sm font-bold">Xem Ảnh Phiếu Cân Gốc</span>
                <span className="rounded-md bg-slate-700 text-slate-300 text-[11px] px-2 py-0.5 font-mono">
                  {viewingImageRotation !== 0 ? `Xoay ${viewingImageRotation}°` : '0°'} | {Math.round(viewingImageZoom * 100)}%
                </span>
              </div>

              {/* Các nút thao tác xoay và phóng to thu nhỏ */}
              <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                {/* Nút Xoay Trái (-90°) */}
                <button
                  type="button"
                  onClick={() => setViewingImageRotation((r) => (r - 90 + 360) % 360)}
                  className="flex items-center gap-1.5 rounded-xl bg-slate-700 hover:bg-slate-600 px-3 py-1.5 text-xs font-bold transition-all cursor-pointer text-white shadow-xs active:scale-95"
                  title="Xoay ngược chiều kim đồng hồ (-90°)"
                >
                  <span className="text-sm">⟲</span>
                  <span className="hidden sm:inline">Xoay Trái</span>
                </button>

                {/* Nút Xoay Phải (+90°) */}
                <button
                  type="button"
                  onClick={() => setViewingImageRotation((r) => (r + 90) % 360)}
                  className="flex items-center gap-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 px-3 py-1.5 text-xs font-bold transition-all cursor-pointer text-white shadow-md shadow-blue-500/30 active:scale-95"
                  title="Xoay theo chiều kim đồng hồ (+90°)"
                >
                  <span className="text-sm">⟳</span>
                  <span className="hidden sm:inline">Xoay Phải</span>
                </button>

                <div className="h-4 w-px bg-slate-600 mx-1 hidden sm:block" />

                {/* Thu nhỏ */}
                <button
                  type="button"
                  onClick={() => setViewingImageZoom((z) => Math.max(0.4, z - 0.2))}
                  className="rounded-xl bg-slate-700 hover:bg-slate-600 px-2.5 py-1.5 text-xs font-bold cursor-pointer transition-colors"
                  title="Thu nhỏ"
                >
                  ➖
                </button>

                {/* Đặt lại */}
                <button
                  type="button"
                  onClick={() => {
                    setViewingImageZoom(1);
                    setViewingImageRotation(0);
                  }}
                  className="rounded-xl bg-slate-700 hover:bg-slate-600 px-2.5 py-1.5 text-xs font-bold cursor-pointer transition-colors"
                  title="Đặt lại góc xoay và kích thước ban đầu"
                >
                  Đặt lại
                </button>

                {/* Phóng to */}
                <button
                  type="button"
                  onClick={() => setViewingImageZoom((z) => Math.min(3, z + 0.2))}
                  className="rounded-xl bg-slate-700 hover:bg-slate-600 px-2.5 py-1.5 text-xs font-bold cursor-pointer transition-colors"
                  title="Phóng to"
                >
                  ➕
                </button>

                {/* Đóng Modal */}
                <button
                  type="button"
                  onClick={() => setViewingImage(null)}
                  className="rounded-xl bg-rose-600 hover:bg-rose-500 text-white px-3 py-1.5 text-xs font-bold ml-1 sm:ml-2 cursor-pointer shadow-md shadow-rose-600/30 transition-colors"
                  title="Đóng cửa sổ"
                >
                  ✕ Đóng
                </button>
              </div>
            </div>

            {/* Vùng hiển thị ảnh có thể xoay và cuộn zoom */}
            <div className="flex-1 overflow-auto p-4 flex items-center justify-center bg-slate-950/90">
              <div
                style={{
                  transform: `scale(${viewingImageZoom}) rotate(${viewingImageRotation}deg)`,
                  transformOrigin: 'center center',
                  transition: 'transform 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
                }}
                className="flex items-center justify-center"
              >
                <Image
                  src={viewingImage}
                  alt="Ảnh phiếu cân gốc"
                  width={900}
                  height={1200}
                  unoptimized
                  className="max-h-[78vh] w-auto max-w-full object-contain rounded-xl shadow-2xl select-none"
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
