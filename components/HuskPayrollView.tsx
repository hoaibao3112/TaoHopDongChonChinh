'use client';

import React, { useState, useRef, useMemo, useEffect, ChangeEvent } from 'react';
import Link from 'next/link';
import { ScannedSlipItem, HuskSettings, DEFAULT_HUSK_SETTINGS } from '@/lib/husk/types';
import { calculateHuskTons } from '@/lib/husk/tonnage';
import { formatWorkDescription, parseVehicle } from '@/lib/husk/plate';
import { groupSlipsIfEnabled } from '@/lib/husk/merger';
import { NSXTMEntry, NSXTMTeamKey } from '@/lib/rice-payroll/nsx-tm-types';
import { extractMonthKey, HuskMonthlyRecord } from '@/lib/husk/monthlyTypes';
import {
  saveSlipOriginalImage,
  getSlipOriginalImageUrl,
  getSlipOriginalImageUrlWithFallback,
  deleteSlipOriginalImage,
  clearAllSlipImages,
} from '@/lib/husk/imageStore';

const POPULAR_CUSTOMERS = [
  'CÔ LIỄU',
  'TRANG BẾN TRE',
  'CHỊ 7',
  'PHAN TIẾN',
  'NAM HH',
  'CHỊ MAI (TBN)',
  'CẨM THANH XUÂN',
  'ĐĂNG THÀNH PHÁT',
  'TRÂM ANH',
  'CHỊ BÉ BA',
  'MY TÂM',
  'ĐƯỢC PHƯỜNG',
];

export default function HuskPayrollView({
  onOpenMonthlyView,
}: {
  onOpenMonthlyView?: (monthKey: string) => void;
} = {}) {
  // ─── File & Settings State ────────────────────────────────────────────────
  const [excelFile, setExcelFile] = useState<File | null>(null);
  const [selectedImages, setSelectedImages] = useState<File[]>([]);
  const [settings, setSettings] = useState<HuskSettings>(DEFAULT_HUSK_SETTINGS);
  const [isTeamManuallyEdited, setIsTeamManuallyEdited] = useState<boolean>(false);
  const [showSettings, setShowSettings] = useState<boolean>(false);

  // ─── Processing State ─────────────────────────────────────────────────────
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [isSavingDb, setIsSavingDb] = useState<boolean>(false);
  const [scanProgress, setScanProgress] = useState<number>(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);
  const [transferredInfo, setTransferredInfo] = useState<{ count: number; ducCount: number; quyCount: number } | null>(null);

  // ─── Data State ───────────────────────────────────────────────────────────
  const [scannedSlips, setScannedSlips] = useState<ScannedSlipItem[]>([]);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [previewRotation, setPreviewRotation] = useState<number>(0);
  const [previewZoom, setPreviewZoom] = useState<number>(1);
  const [activePreviewSlip, setActivePreviewSlip] = useState<ScannedSlipItem | null>(null);
  const [isUsingOriginalImage, setIsUsingOriginalImage] = useState<boolean>(false);
  const replaceImageInputRef = useRef<HTMLInputElement>(null);

  // Map lưu ảnh gốc kích thước lớn khi người dùng chọn file trên máy
  const fileUrlMap = useRef<Map<string, string>>(new Map());

  // Mở modal xem ảnh to nhất có thể và đặt lại góc quay
  const handleOpenPreview = async (slipOrUrl: ScannedSlipItem | string) => {
    if (typeof slipOrUrl === 'string') {
      setActivePreviewSlip(null);
      setPreviewImage(slipOrUrl);
      setIsUsingOriginalImage(false);
      setPreviewRotation(0);
      setPreviewZoom(1);
      return;
    }

    setActivePreviewSlip(slipOrUrl);

    // 1. Kiểm tra blob url trong memory
    let highResUrl = slipOrUrl.id ? fileUrlMap.current.get(slipOrUrl.id) : null;
    if (!highResUrl && slipOrUrl.fileName) {
      highResUrl = fileUrlMap.current.get(slipOrUrl.fileName) || fileUrlMap.current.get(slipOrUrl.fileName.toLowerCase());
    }

    // 2. Kiểm tra trong IndexedDB (ảnh gốc lưu bền vững trên máy người dùng)
    if (!highResUrl) {
      highResUrl = await getSlipOriginalImageUrlWithFallback([
        slipOrUrl.id,
        slipOrUrl.fileName,
        slipOrUrl.fileName?.toLowerCase(),
      ]);
    }

    // 3. Fallback sang thumbnailBase64 nếu không tìm thấy ảnh gốc
    const finalUrl = highResUrl || slipOrUrl.thumbnailBase64 || '';
    if (!finalUrl) return;

    if (highResUrl && slipOrUrl.id) {
      fileUrlMap.current.set(slipOrUrl.id, highResUrl);
    }

    setPreviewImage(finalUrl);
    setIsUsingOriginalImage(Boolean(highResUrl));
    setPreviewRotation(0);
    setPreviewZoom(1);
  };

  // Thay thế hoặc cập nhật ảnh gốc siêu nét cho phiếu đang xem
  const handleReplaceSlipImage = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !activePreviewSlip) return;

    try {
      const url = URL.createObjectURL(file);
      fileUrlMap.current.set(activePreviewSlip.id, url);
      if (activePreviewSlip.fileName) {
        fileUrlMap.current.set(activePreviewSlip.fileName, url);
        fileUrlMap.current.set(activePreviewSlip.fileName.toLowerCase(), url);
      }
      await saveSlipOriginalImage(activePreviewSlip.id, file);
      if (activePreviewSlip.fileName) {
        await saveSlipOriginalImage(activePreviewSlip.fileName, file);
        await saveSlipOriginalImage(activePreviewSlip.fileName.toLowerCase(), file);
      }

      setPreviewImage(url);
      setIsUsingOriginalImage(true);

      // Cập nhật thumbnail trong danh sách phiếu bằng canvas (nhỏ gọn ~160px để không làm tràn localStorage)
      if (typeof window !== 'undefined') {
        const img = new window.Image();
        img.src = url;
        img.onload = () => {
          try {
            const canvas = document.createElement('canvas');
            const maxDim = 160;
            let w = img.width;
            let h = img.height;
            if (w > h) {
              if (w > maxDim) {
                h = Math.round((h * maxDim) / w);
                w = maxDim;
              }
            } else {
              if (h > maxDim) {
                w = Math.round((w * maxDim) / h);
                h = maxDim;
              }
            }
            canvas.width = Math.max(w, 1);
            canvas.height = Math.max(h, 1);
            const ctx = canvas.getContext('2d');
            if (ctx) {
              ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
              const smallThumb = canvas.toDataURL('image/jpeg', 0.8);
              setScannedSlips((prev) =>
                prev.map((s) => (s.id === activePreviewSlip.id ? { ...s, thumbnailBase64: smallThumb } : s))
              );
            }
          } catch {}
        };
      }

      setSuccessMessage('✅ Đã nạp ảnh gốc siêu nét 100% cho phiếu cân!');
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err) {
      console.error('Lỗi cập nhật ảnh:', err);
    }
  };

  // Lắng nghe phím tắt xoay và đóng modal ảnh (ESC, ←, →, +, -, 0)
  React.useEffect(() => {
    if (!previewImage) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setPreviewImage(null);
      } else if (e.key === 'ArrowLeft') {
        setPreviewRotation((prev) => (prev - 90 + 360) % 360);
      } else if (e.key === 'ArrowRight') {
        setPreviewRotation((prev) => (prev + 90) % 360);
      } else if (e.key === '+' || e.key === '=') {
        setPreviewZoom((prev) => Math.min(Number((prev + 0.25).toFixed(2)), 4));
      } else if (e.key === '-' || e.key === '_') {
        setPreviewZoom((prev) => Math.max(Number((prev - 0.25).toFixed(2)), 1));
      } else if (e.key === '0') {
        setPreviewZoom(1);
        setPreviewRotation(0);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [previewImage]);

  // ─── Modal Thêm Phiếu Cân Thủ Công (Ghe / Xe) ─────────────────────────────
  const [showManualModal, setShowManualModal] = useState<boolean>(false);
  const [manualType, setManualType] = useState<'GHE' | 'XE'>('GHE');
  const [manualDate, setManualDate] = useState<string>('');
  const [manualCustomer, setManualCustomer] = useState<string>('');
  const [manualVehicle, setManualVehicle] = useState<string>('');
  const [manualKg, setManualKg] = useState<string>('');
  const [manualTeam, setManualTeam] = useState<'ĐỨC' | 'QUÝ'>('ĐỨC');
  const [manualDesc, setManualDesc] = useState<string>('');
  const [isDescCustomized, setIsDescCustomized] = useState<boolean>(false);

  // Lấy ngày gợi ý: lấy từ phiếu gần nhất hoặc ngày hôm nay
  const getDefaultDateStr = () => {
    if (scannedSlips.length > 0 && scannedSlips[0].date) {
      return scannedSlips[0].date;
    }
    const now = new Date();
    const d = String(now.getDate()).padStart(2, '0');
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const y = now.getFullYear();
    return `${d}/${m}/${y}`;
  };

  const updateAutoDescription = (vName: string, cust: string, type: 'GHE' | 'XE') => {
    const vTrim = vName.trim();
    const cTrim = cust.trim();
    if (!vTrim && !cTrim) {
      setManualDesc('');
      return;
    }
    const defaultV = vTrim || (type === 'GHE' ? 'Ghe' : 'Xe');
    const desc = formatWorkDescription(defaultV, cTrim || 'khách');
    setManualDesc(desc);
  };

  const handleOpenManualModal = (type: 'GHE' | 'XE' = 'GHE') => {
    setManualType(type);
    const dateToUse = manualDate || getDefaultDateStr();
    setManualDate(dateToUse);
    setManualTeam(settings.defaultTeam === 'QUÝ' ? 'QUÝ' : 'ĐỨC');
    setIsDescCustomized(false);
    updateAutoDescription(manualVehicle, manualCustomer, type);
    setShowManualModal(true);
  };

  const handleAddManualSlip = (continueAdding: boolean = false) => {
    const kgNum = Number(manualKg) || 0;
    if (kgNum <= 0) {
      setErrorMessage('Vui lòng nhập khối lượng Kg hàng lớn hơn 0.');
      return;
    }

    const vName = manualVehicle.trim();
    const custName = manualCustomer.trim().toUpperCase();
    const dateStr = manualDate.trim() || getDefaultDateStr();
    const team = manualTeam;

    const tons = calculateHuskTons(kgNum);
    const effectiveUnitPrice = manualType === 'GHE' ? 7000 : (settings.unitPrice || 11000);
    const amount = Math.round(tons * effectiveUnitPrice);

    const finalDesc = manualDesc.trim() || formatWorkDescription(vName || (manualType === 'GHE' ? 'Ghe' : 'Xe'), custName);

    const newSlip: ScannedSlipItem = {
      id: `manual-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      fileName: `Nhập tay (${manualType === 'GHE' ? 'Ghe' : 'Xe'})`,
      selected: true,
      customer: custName || 'KHÁCH HÀNG',
      vehicle: vName || (manualType === 'GHE' ? 'Ghe' : 'Xe'),
      productType: 'Trấu',
      direction: 'Xuất',
      date: dateStr,
      weightGrossKg: kgNum,
      weightTareKg: 0,
      weightNetKg: kgNum,
      tons,
      unitPrice: effectiveUnitPrice,
      amount,
      description: finalDesc,
      targetTeam: team,
      warnings: [],
      isDuplicateExisting: false,
      isDuplicateInBatch: false,
    };

    setScannedSlips((prev) => [newSlip, ...prev]);
    setErrorMessage(null);
    setSuccessMessage(`✅ Đã thêm phiếu ${manualType === 'GHE' ? 'Ghe' : 'Xe'} (${vName || custName}) ${kgNum.toLocaleString()} kg vào danh sách!`);
    setTimeout(() => setSuccessMessage(null), 3500);

    if (continueAdding) {
      setManualVehicle('');
      setManualKg('');
      setManualDesc('');
      setIsDescCustomized(false);
    } else {
      setShowManualModal(false);
      setManualVehicle('');
      setManualKg('');
      setManualDesc('');
      setIsDescCustomized(false);
    }
  };

  const handleDeleteSlip = (id: string) => {
    deleteSlipOriginalImage(id);
    setScannedSlips((prev) => prev.filter((s) => s.id !== id));
  };

  // ─── Khôi phục danh sách phiếu cân đã quét từ localStorage (không mất khi chuyển tab) ─
  React.useEffect(() => {
    try {
      const saved = localStorage.getItem('husk_scanned_slips_cache');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setScannedSlips(parsed);
        }
      }
    } catch (e) {
      console.error('Lỗi đọc husk_scanned_slips_cache:', e);
    }
  }, []);

  // ─── Tự động lưu cache mỗi khi danh sách phiếu cân thay đổi (Bảo vệ tràn hạn mức Quota) ──
  React.useEffect(() => {
    try {
      if (scannedSlips.length > 0) {
        try {
          localStorage.setItem('husk_scanned_slips_cache', JSON.stringify(scannedSlips));
        } catch (storageErr) {
          // Khi QuotaExceededError (do dung lượng base64 lớn), lưu bản nhẹ chỉ giữ dữ liệu chữ và thumbnail nhỏ
          console.warn('LocalStorage quota exceeded, tự động tinh gọn danh sách phiếu lưu cache:', storageErr);
          const lightweightSlips = scannedSlips.map(({ thumbnailBase64, ...rest }) => ({
            ...rest,
            thumbnailBase64: thumbnailBase64 && thumbnailBase64.length < 35000 ? thumbnailBase64 : undefined,
          }));
          try {
            localStorage.setItem('husk_scanned_slips_cache', JSON.stringify(lightweightSlips));
          } catch {
            // Nếu vẫn tràn thì chỉ lưu dữ liệu chữ
            const metaOnlySlips = scannedSlips.map(({ thumbnailBase64, ...rest }) => rest);
            localStorage.setItem('husk_scanned_slips_cache', JSON.stringify(metaOnlySlips));
          }
        }
      } else {
        localStorage.removeItem('husk_scanned_slips_cache');
      }
    } catch (e) {
      console.error('Lỗi lưu husk_scanned_slips_cache:', e);
    }
  }, [scannedSlips]);

  // Xóa danh sách phiếu để quét lại đợt mới
  const handleClearScannedSlips = () => {
    if (window.confirm('Bạn có chắc muốn xóa danh sách phiếu cân đã quét này để quét đợt mới không?')) {
      clearAllSlipImages();
      fileUrlMap.current.clear();
      setScannedSlips([]);
      localStorage.removeItem('husk_scanned_slips_cache');
      setSuccessMessage('Đã làm mới danh sách phiếu cân!');
      setTimeout(() => setSuccessMessage(null), 3000);
    }
  };

  const fileExcelInputRef = useRef<HTMLInputElement>(null);
  const imagesInputRef = useRef<HTMLInputElement>(null);

  // ─── Handlers Chọn File Excel ─────────────────────────────────────────────
  const handleExcelChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setExcelFile(file);
      setIsTeamManuallyEdited(false);
      setErrorMessage(null);
    }
  };

  // ─── Handlers Chọn Ảnh Phiếu Cân ──────────────────────────────────────────
  const handleImagesChange = async (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const files = Array.from(e.target.files);
      if (files.length > 30) {
        setErrorMessage('Tối đa 30 ảnh cho mỗi lượt quét. Vui lòng chọn lại.');
        return;
      }
      // Lưu lại URL ảnh gốc trong bộ nhớ và IndexedDB để xem phóng to 100% cực nét
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        try {
          const url = URL.createObjectURL(file);
          fileUrlMap.current.set(file.name, url);
          fileUrlMap.current.set(file.name.toLowerCase(), url);
          fileUrlMap.current.set(`temp_idx_${i}`, url);
          await saveSlipOriginalImage(file.name, file);
          await saveSlipOriginalImage(file.name.toLowerCase(), file);
        } catch {}
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

      // Lưu trữ ảnh gốc siêu nét theo ID phiếu để xem lại luôn rõ 100%
      const slipsList: ScannedSlipItem[] = data.slips || [];
      for (let idx = 0; idx < slipsList.length; idx++) {
        const s = slipsList[idx];
        const matchedFile = selectedImages.find((f) => f.name === s.fileName) || selectedImages[idx];
        if (matchedFile) {
          try {
            await saveSlipOriginalImage(s.id, matchedFile);
            if (s.fileName) {
              await saveSlipOriginalImage(s.fileName, matchedFile);
              await saveSlipOriginalImage(s.fileName.toLowerCase(), matchedFile);
            }
            const url = fileUrlMap.current.get(matchedFile.name) || URL.createObjectURL(matchedFile);
            fileUrlMap.current.set(s.id, url);
            if (s.fileName) {
              fileUrlMap.current.set(s.fileName, url);
              fileUrlMap.current.set(s.fileName.toLowerCase(), url);
            }
          } catch {}
        }
      }

      setScannedSlips((prev) => {
        // Giữ lại các phiếu nhập tay đã có sẵn trước đó
        const existingManual = prev.filter((s) => !s.thumbnailBase64);
        return [...(data.slips || []), ...existingManual];
      });
      if (!isTeamManuallyEdited && data.detectedTeam) {
        setSettings((prev) => ({
          ...prev,
          defaultTeam: data.detectedTeam,
          ...(data.detectedSheetName ? { sheetName: data.detectedSheetName } : {}),
        }));
      }
      setScanProgress(100);
      setSuccessMessage(
        `Đã đọc thành công ${data.totalScanned || 0} phiếu cân.${
          !isTeamManuallyEdited && data.detectedTeam
            ? ` Tự nhận diện đội: ${data.detectedTeam}.`
            : ''
        }`
      );
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

        // Nếu sửa Tấn trực tiếp -> cập nhật lại tấn và thành tiền
        if (field === 'tons') {
          const t = typeof value === 'number' ? value : parseFloat(String(value)) || 0;
          updated.tons = t;
          updated.amount = Math.round(t * updated.unitPrice);
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

  // ─── Đổi đội cho từng phiếu cân (Click trực tiếp) ─────────────────────────
  const handleToggleSlipTeam = (slipId: string) => {
    const defaultTeamKey = settings.defaultTeam === 'QUÝ' ? 'QUÝ' : 'ĐỨC';
    setScannedSlips((prev) =>
      prev.map((s) => {
        if (s.id !== slipId) return s;
        const current = s.targetTeam || defaultTeamKey;
        const nextTeam: 'ĐỨC' | 'QUÝ' = current === 'ĐỨC' ? 'QUÝ' : 'ĐỨC';
        return { ...s, targetTeam: nextTeam };
      })
    );
  };

  // ─── Gán toàn bộ phiếu cân đã chọn cho 1 đội ─────────────────────────────
  const handleAssignSelectedTeam = (team: 'ĐỨC' | 'QUÝ') => {
    setScannedSlips((prev) =>
      prev.map((s) => (s.selected ? { ...s, targetTeam: team } : s))
    );
    setCopyFeedback(`Đã chuyển toàn bộ các phiếu đã chọn sang Đội ${team}!`);
    setTimeout(() => setCopyFeedback(null), 3000);
  };

  // ─── Copy 1 dòng phiếu cân vào Clipboard ──────────────────────────────────
  const handleCopySingleSlip = async (slip: ScannedSlipItem) => {
    const defaultTeamKey = settings.defaultTeam === 'QUÝ' ? 'QUÝ' : 'ĐỨC';
    const team = slip.targetTeam || defaultTeamKey;
    const text = `${slip.date}\t${team}\t${slip.description}\t${slip.customer}\t${slip.vehicle}\t${slip.weightNetKg}\t${slip.tons}\t${slip.unitPrice}\t${slip.amount}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopyFeedback(`Đã sao chép phiếu ${slip.vehicle || slip.customer}!`);
      setTimeout(() => setCopyFeedback(null), 2500);
    } catch {
      prompt('Sao chép dòng phiếu cân:', text);
    }
  };

  // ─── Copy toàn bộ phiếu cân đã chọn ───────────────────────────────────────
  const handleCopyAllSelected = async () => {
    if (previewRows.length === 0) {
      setErrorMessage('Chưa có phiếu cân nào được chọn để sao chép.');
      return;
    }
    const defaultTeamKey = settings.defaultTeam === 'QUÝ' ? 'QUÝ' : 'ĐỨC';
    const headers = 'Ngày\tĐội\tCông Việc\tKhách Hàng\tPhương Tiện\tSố Kg\tTấn\tĐơn Giá\tThành Tiền';
    const lines = previewRows.map((s) => {
      const team = s.targetTeam || defaultTeamKey;
      return `${s.date}\t${team}\t${s.description}\t${s.customer}\t${s.vehicle}\t${s.weightNetKg}\t${s.tons}\t${s.unitPrice}\t${s.amount}`;
    });
    const fullText = `${headers}\n${lines.join('\n')}`;

    try {
      await navigator.clipboard.writeText(fullText);
      setCopyFeedback(`✅ Đã sao chép ${previewRows.length} dòng phiếu cân vào bộ nhớ tạm (dán trực tiếp vào Excel hoặc Zalo)!`);
      setTimeout(() => setCopyFeedback(null), 4000);
    } catch {
      prompt('Sao chép danh sách phiếu cân:', fullText);
    }
  };

  // ─── Lưu Trấu Vào CSDL Theo Tháng (Đồng Bộ Sang Nhập Sấy NSX TM) ────────
  const handleSaveToMonthlyDb = async (showSuccessToast = true) => {
    if (previewRows.length === 0) {
      if (showSuccessToast) setErrorMessage('Không có phiếu trấu nào được chọn để lưu vào CSDL.');
      return;
    }

    setIsSavingDb(true);
    const defaultTeamKey: 'ĐỨC' | 'QUÝ' = settings.defaultTeam === 'QUÝ' ? 'QUÝ' : 'ĐỨC';
    const payload: HuskMonthlyRecord[] = previewRows.map((s) => {
      const team: 'ĐỨC' | 'QUÝ' = s.targetTeam === 'QUÝ' ? 'QUÝ' : (s.targetTeam === 'ĐỨC' ? 'ĐỨC' : defaultTeamKey);
      const isTruck = parseVehicle(s.vehicle).isTruck;
      const vType = isTruck ? 'XE' : 'GHE';
      const tons = s.tons || (s.weightNetKg ? Math.round((s.weightNetKg / 1000) * 100) / 100 : 0);
      const unitPrice = s.unitPrice || 11000;
      const amount = s.amount || Math.round(tons * unitPrice);
      const dateStr = s.date || '01/10/2026';
      const mKey = extractMonthKey(dateStr);

      return {
        id: `husk-ai-${s.id}-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        date: dateStr,
        monthKey: mKey,
        team,
        customer: s.customer || 'Khách hàng',
        vehicle: s.vehicle || (isTruck ? 'Xe' : 'Ghe'),
        type: vType,
        weightKg: s.weightNetKg || 0,
        tons,
        unitPrice,
        amount,
        description: s.description || (vType === 'GHE' ? `Xuất trấu ghe ${s.customer}` : `Xuất một xe trấu ${s.vehicle} của ${s.customer}`),
        note: s.thumbnailBase64 ? `Phiếu cân xuất trấu AI (${team})` : `Phiếu cân xuất trấu (${team})`,
        sourceTab: 'QUET_AI' as const,
      };
    });

    try {
      const res = await fetch('/api/husk/monthly', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: payload }),
      });
      const data = await res.json();
      if (data.success) {
        if (showSuccessToast) {
          setSuccessMessage(
            `💾 Đã lưu thành công ${payload.length} phiếu trấu vào CSDL theo tháng! Khi mở "Nhập Sấy NSX TM", hệ thống sẽ tự động điền các mẻ này vào bảng lương.`
          );
        }
      } else {
        if (showSuccessToast) {
          setErrorMessage('Lỗi lưu CSDL trấu: ' + (data.error || 'Không xác định'));
        }
      }
    } catch (err) {
      console.error('[Husk DB Save Error]:', err);
      if (showSuccessToast) {
        setErrorMessage('Không thể kết nối đến máy chủ lưu CSDL trấu: ' + String(err));
      }
    } finally {
      setIsSavingDb(false);
    }
  };

  // ─── Đưa sang Nhập Sấy Nông Sản Xanh (NSX TM) ────────────────────────────
  const handleTransferToNSXTM = (teamOverride?: 'ĐỨC' | 'QUÝ') => {
    if (previewRows.length === 0) {
      setErrorMessage('Chưa có phiếu cân nào được chọn để đưa sang Nhập Sấy NSX TM.');
      return;
    }

    const defaultTeamKey: NSXTMTeamKey = settings.defaultTeam === 'QUÝ' ? 'QUÝ' : 'ĐỨC';
    let countDuc = 0;
    let countQuy = 0;

    const newEntries: NSXTMEntry[] = previewRows.map((s) => {
      const team: NSXTMTeamKey = teamOverride || s.targetTeam || defaultTeamKey;
      if (team === 'ĐỨC') countDuc++;
      else countQuy++;

      const unitPrice = s.unitPrice || 11000;
      const tons = s.tons || 0;
      const amount = s.amount || Math.round(tons * unitPrice);

      const isTruck = parseVehicle(s.vehicle).isTruck;
      const vType = isTruck ? 'XE' : 'GHE';

      return {
        id: `ocr-trau-${s.id}-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        source: 'MANUAL',
        date: s.date || '01/10/2026',
        team,
        customerName: s.customer,
        riceType: 'Trấu',
        vehicleName: s.vehicle,
        vehicleType: vType,
        jobDescription: s.description || (vType === 'GHE' ? `Xuất trấu ghe ${s.customer}` : `Xuất một xe trấu ${s.vehicle} của ${s.customer}`),
        weightKg: s.weightNetKg,
        roundedTons: tons,
        unitPriceXuatTrau: unitPrice,
        thanhTienXuatTrau: amount,
        thanhTienSay: 0,
        thanhTienLuaKho: 0,
        tongThanhTien: amount,
        facility: 'NSX TM',
        note: s.thumbnailBase64 ? `Phiếu cân xuất trấu AI (${team})` : `Phiếu cân xuất trấu nhập tay (${team})`,
      };
    });

    try {
      const stored = localStorage.getItem('nsx_tm_transferred_entries');
      let current: NSXTMEntry[] = [];
      if (stored) {
        current = JSON.parse(stored);
      }
      localStorage.setItem('nsx_tm_transferred_entries', JSON.stringify([...newEntries, ...current]));
      setTransferredInfo({
        count: newEntries.length,
        ducCount: countDuc,
        quyCount: countQuy,
      });
      setSuccessMessage(
        `✅ Đã đưa thành công ${newEntries.length} phiếu cân sang Nhập Sấy NSX TM (Đức: ${countDuc} phiếu, Quý: ${countQuy} phiếu) và lưu vào CSDL!`
      );
      // Đồng thời tự động đồng bộ vào CSDL theo tháng cho NSX TM
      handleSaveToMonthlyDb(false).catch(() => {});
    } catch (e) {
      setErrorMessage('Không thể lưu vào bộ nhớ trình duyệt: ' + String(e));
    }
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

      // Tự động lưu vào CSDL theo tháng để liên thông sang Nhập Sấy NSX TM
      handleSaveToMonthlyDb(false).catch(() => {});
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

          <div className="flex flex-wrap items-center gap-2.5 sm:self-start">
            <Link
              href="/nhap-say-tm"
              className="inline-flex items-center gap-1.5 rounded-xl border border-amber-300/40 bg-white/15 px-4 py-2.5 text-xs font-bold text-white shadow-2xs backdrop-blur-md transition hover:bg-white/25 active:scale-95"
              title="Chuyển sang Bảng Kê Nhập Sấy NSX TM (Đội Đức & Đội Quý) - Dữ liệu luôn được lưu giữ an toàn"
            >
              <span>🏭</span>
              <span>Sang Nhập Sấy NSX TM</span>
              <span>&rarr;</span>
            </Link>

            <button
              type="button"
              onClick={() => setShowSettings(!showSettings)}
              className="flex items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-4 py-2.5 text-xs font-semibold backdrop-blur-md transition hover:bg-white/20"
            >
              <span>⚙️</span>
              <span>Cài Đặt Đơn Giá &amp; Sheet</span>
            </button>
          </div>
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
                  onChange={(e) => {
                    setIsTeamManuallyEdited(true);
                    setSettings({ ...settings, defaultTeam: e.target.value });
                  }}
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
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-amber-600 py-3 text-sm font-bold text-white shadow-md shadow-amber-600/20 transition hover:bg-amber-700 disabled:cursor-not-allowed disabled:bg-slate-300 cursor-pointer"
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

          {/* Thêm nhanh phương tiện bằng tay (thường dùng cho phiếu Ghe) */}
          <div className="mt-3 flex items-center justify-between gap-2 rounded-xl bg-amber-50/70 border border-amber-200/80 p-2.5">
            <div className="flex items-center gap-2">
              <span className="text-xl">⛵</span>
              <div className="text-left">
                <p className="text-xs font-bold text-amber-950">Không có ảnh hoặc phiếu Ghe?</p>
                <p className="text-[11px] text-amber-800">Thêm phương tiện bằng tay nhanh chóng</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => handleOpenManualModal('GHE')}
              className="inline-flex items-center gap-1.5 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-bold text-white shadow-2xs hover:bg-amber-700 transition cursor-pointer"
            >
              <span>+ Thêm phiếu Ghe / Xe</span>
            </button>
          </div>
        </div>
      </div>

      {/* ─── KHI CHƯA CÓ PHIẾU CÂN: HƯỚNG DẪN & NÚT THÊM TAY NHANH ────────── */}
      {scannedSlips.length === 0 && (
        <div className="rounded-2xl border-2 border-dashed border-slate-200 bg-white/70 p-8 text-center shadow-xs">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-50 text-2xl text-amber-700 border border-amber-200/70">
            🌾
          </div>
          <h3 className="mt-3 text-sm font-bold text-slate-800">Chưa có phiếu cân nào trong đợt này</h3>
          <p className="mt-1 text-xs text-slate-500 max-w-md mx-auto">
            Bạn có thể tải ảnh chụp phiếu cân ở Bước 2 để AI quét tự động, hoặc bấm nút bên dưới để nhập nhanh phiếu Ghe/Xe bằng tay.
          </p>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              onClick={() => handleOpenManualModal('GHE')}
              className="inline-flex items-center gap-2 rounded-xl bg-amber-600 px-4 py-2.5 text-xs font-bold text-white shadow-md shadow-amber-600/20 hover:bg-amber-700 transition cursor-pointer"
            >
              <span>⛵</span>
              <span>Thêm phiếu Ghe bằng tay</span>
            </button>
            <button
              type="button"
              onClick={() => handleOpenManualModal('XE')}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-xs font-bold text-slate-700 shadow-2xs hover:bg-slate-50 transition cursor-pointer"
            >
              <span>🚛</span>
              <span>Thêm phiếu Xe bằng tay</span>
            </button>
          </div>
        </div>
      )}

      {/* ─── BƯỚC 3: BẢNG KIỂM TRA & DUYỆT PHIẾU CÂN ───────────────────────── */}
      {scannedSlips.length > 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="flex items-center gap-3">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-amber-100 text-sm font-black text-amber-900">
                  3
                </span>
                <h2 className="text-lg font-bold text-slate-900">
                  Kiểm tra &amp; Phân Đội phiếu cân ({scannedSlips.length} phiếu)
                </h2>
              </div>
              <p className="mt-1 text-xs text-slate-500">
                Bạn có thể chọn đội cho từng phiếu, sao chép nội dung hoặc đưa trực tiếp sang phân hệ Nhập Sấy NSX TM.
              </p>
            </div>

            {/* Checkbox gộp chuyến */}
            <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-100 self-start lg:self-auto">
              <input
                type="checkbox"
                checked={settings.mergeTrips}
                onChange={(e) => setSettings({ ...settings, mergeTrips: e.target.checked })}
                className="h-4 w-4 rounded text-amber-600 focus:ring-amber-500"
              />
              <span>Gộp phiếu cùng ngày + xe + khách</span>
            </label>
          </div>

          {/* Thanh công cụ: Copy & Chuyển sang Nhập Sấy NSX TM */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-indigo-100 bg-gradient-to-r from-indigo-50/60 via-blue-50/40 to-slate-50 p-3">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleCopyAllSelected}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 shadow-2xs hover:bg-slate-50 transition cursor-pointer"
                title="Sao chép toàn bộ các phiếu đã chọn để dán vào Excel hoặc Zalo"
              >
                <span>📋</span>
                <span>Copy {previewRows.length} phiếu đã chọn</span>
              </button>

              <button
                type="button"
                onClick={handleClearScannedSlips}
                className="inline-flex items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700 hover:bg-rose-100 transition shadow-2xs cursor-pointer"
                title="Xóa danh sách phiếu cân đã quét để làm đợt mới"
              >
                <span>🗑️</span>
                <span>Làm mới</span>
              </button>

              <button
                type="button"
                onClick={() => handleOpenManualModal('GHE')}
                className="inline-flex items-center gap-1.5 rounded-xl border border-amber-400 bg-amber-500 text-white px-3.5 py-2 text-xs font-bold shadow-2xs hover:bg-amber-600 transition cursor-pointer"
                title="Thêm phiếu cân bằng tay (thường dùng cho phiếu Ghe)"
              >
                <span>⛵</span>
                <span>+ Thêm phiếu tay (Ghe/Xe)</span>
              </button>

              <div className="flex items-center rounded-xl bg-white p-1 border border-slate-200 shadow-2xs">
                <span className="text-[11px] font-bold text-slate-500 px-2">Gán nhanh:</span>
                <button
                  type="button"
                  onClick={() => handleAssignSelectedTeam('ĐỨC')}
                  className="rounded-lg bg-blue-50 border border-blue-200 px-2.5 py-1 text-xs font-bold text-blue-700 hover:bg-blue-100 transition shadow-2xs cursor-pointer"
                >
                  🔵 Cho Đội Đức
                </button>
                <button
                  type="button"
                  onClick={() => handleAssignSelectedTeam('QUÝ')}
                  className="ml-1 rounded-lg bg-emerald-50 border border-emerald-200 px-2.5 py-1 text-xs font-bold text-emerald-700 hover:bg-emerald-100 transition shadow-2xs cursor-pointer"
                >
                  🟢 Cho Đội Quý
                </button>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {onOpenMonthlyView && (
                <button
                  type="button"
                  onClick={() => {
                    const firstDate = previewRows[0]?.date;
                    const mKey = extractMonthKey(firstDate) || '10/2026';
                    onOpenMonthlyView(mKey);
                  }}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-white border border-indigo-200 px-3.5 py-2 text-xs font-bold text-indigo-700 shadow-xs hover:bg-indigo-50 transition cursor-pointer"
                  title="Xem danh sách tất cả mẻ trấu đã lưu trong CSDL của tháng"
                >
                  <span>📋</span>
                  <span>Xem DS CSDL Tháng</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => handleSaveToMonthlyDb(true)}
                disabled={isSavingDb || previewRows.length === 0}
                className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 px-4 py-2 text-xs font-bold text-white shadow-md shadow-purple-600/25 hover:from-purple-700 hover:to-indigo-700 disabled:opacity-50 transition cursor-pointer"
                title="Lưu số liệu trấu vào CSDL để tự động điền sang Nhập Sấy NSX TM khi chọn tháng tương ứng"
              >
                <span>{isSavingDb ? '⏳' : '💾'}</span>
                <span>Lưu CSDL Tháng (Tự Động Điền Sang NSX TM)</span>
              </button>

              <button
                type="button"
                onClick={() => handleTransferToNSXTM()}
                className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-blue-700 px-4 py-2 text-xs font-bold text-white shadow-md shadow-indigo-600/25 hover:from-indigo-700 hover:to-blue-800 transition cursor-pointer"
                title="Đưa các phiếu đã chọn vào bảng tính lương Nhập Sấy NSX TM (tự động phân bổ đúng theo Đội Đức hoặc Quý)"
              >
                <span>🌾</span>
                <span>Đưa sang Nhập Sấy NSX TM ({previewRows.length} phiếu)</span>
                <span>&rarr;</span>
              </button>
            </div>
          </div>

          {/* Toast thông báo đã Copy */}
          {copyFeedback && (
            <div className="rounded-xl bg-emerald-50 border border-emerald-200 px-3.5 py-2 text-xs font-semibold text-emerald-800 shadow-2xs animate-in fade-in">
              {copyFeedback}
            </div>
          )}

          {/* Banner thông báo đã chuyển sang NSX TM thành công */}
          {transferredInfo && (
            <div className="rounded-xl bg-gradient-to-r from-emerald-50 to-teal-50 border-2 border-emerald-300 p-4 shadow-sm flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 animate-in fade-in">
              <div className="flex items-center gap-3">
                <span className="text-2xl">🌾</span>
                <div>
                  <h4 className="text-sm font-bold text-emerald-950">
                    Đã đưa thành công {transferredInfo.count} phiếu cân vào Nhập Sấy NSX TM!
                  </h4>
                  <p className="text-xs text-emerald-800">
                    Phân bổ: <strong>Đội Đức ({transferredInfo.ducCount} phiếu)</strong> • <strong>Đội Quý ({transferredInfo.quyCount} phiếu)</strong>
                  </p>
                </div>
              </div>
              <Link
                href="/nhap-say-tm"
                className="inline-flex items-center gap-2 rounded-xl bg-emerald-700 px-4 py-2 text-xs font-bold text-white shadow-md hover:bg-emerald-800 transition self-start sm:self-auto"
              >
                <span>🌾 Mở Nhập Sấy NSX TM</span>
                <span>&rarr;</span>
              </Link>
            </div>
          )}

          {/* Bảng Dữ Liệu Chi Tiết */}
          <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full min-w-[950px] border-collapse text-left text-xs">
              <thead className="bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-600">
                <tr>
                  <th className="p-3 text-center w-12">
                    <input
                      type="checkbox"
                      checked={scannedSlips.length > 0 && scannedSlips.every((s) => s.selected)}
                      onChange={(e) => handleToggleSelectAll(e.target.checked)}
                      className="h-4 w-4 rounded text-amber-600 focus:ring-amber-500 cursor-pointer"
                    />
                    <span className="ml-1">Ghi?</span>
                  </th>
                  <th className="p-3 text-center w-28">Đội (Click đổi)</th>
                  <th className="p-3 text-center w-14">Ảnh</th>
                  <th className="p-3 w-28">Ngày</th>
                  <th className="p-3 w-32">Khách hàng</th>
                  <th className="p-3 w-32">Số xe / Ghe</th>
                  <th className="p-3 text-right w-24">Kg Hàng</th>
                  <th className="p-3 text-right w-20">Tấn</th>
                  <th className="p-3">Mô tả dự kiến</th>
                  <th className="p-3 text-center w-20">Copy</th>
                  <th className="p-3 w-32">Cảnh báo</th>
                  <th className="p-3 text-center w-12">Xóa</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 bg-white font-medium">
                {scannedSlips.map((slip) => {
                  const hasWarning = slip.warnings.length > 0;
                  const currentTeam = slip.targetTeam || (settings.defaultTeam === 'QUÝ' ? 'QUÝ' : 'ĐỨC');
                  const isDuc = currentTeam === 'ĐỨC';

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
                          className="h-4 w-4 rounded text-amber-600 focus:ring-amber-500 cursor-pointer"
                        />
                      </td>

                      {/* Phân Đội (Click Đổi) */}
                      <td className="p-2 text-center">
                        <button
                          type="button"
                          onClick={() => handleToggleSlipTeam(slip.id)}
                          className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold shadow-2xs transition-all cursor-pointer ${
                            isDuc
                              ? 'bg-blue-100 text-blue-800 border border-blue-200 hover:bg-blue-200'
                              : 'bg-emerald-100 text-emerald-800 border border-emerald-200 hover:bg-emerald-200'
                          }`}
                          title="Nhấp để đổi giữa Đội Đức và Đội Quý"
                        >
                          <span>{isDuc ? '🔵 ĐỨC' : '🟢 QUÝ'}</span>
                        </button>
                      </td>

                      {/* Ảnh Thumbnail hoặc Icon Phiếu Thêm Tay */}
                      <td className="p-3 text-center">
                        {slip.thumbnailBase64 ? (
                          <div className="relative inline-block group">
                            <img
                              src={slip.thumbnailBase64}
                              alt="Phiếu cân"
                              onClick={() => handleOpenPreview(slip)}
                              className="h-10 w-10 cursor-pointer rounded-lg border border-slate-200 object-cover shadow-2xs transition group-hover:scale-110 group-hover:border-amber-500 group-hover:shadow-md mx-auto"
                            />
                            <button
                              type="button"
                              onClick={() => handleOpenPreview(slip)}
                              className="absolute inset-0 flex items-center justify-center bg-black/40 text-white opacity-0 group-hover:opacity-100 rounded-lg transition text-xs cursor-pointer"
                              title="Bấm để xem và xoay ảnh to nhất"
                            >
                              🔍
                            </button>
                          </div>
                        ) : (
                          <span
                            className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-amber-100 text-amber-900 border border-amber-300/80 font-bold text-sm shadow-2xs mx-auto"
                            title={`Phiếu ${slip.vehicle?.toUpperCase().includes('GHE') || !parseVehicle(slip.vehicle).isTruck ? 'Ghe' : 'Xe'} thêm thủ công bằng tay`}
                          >
                            {slip.vehicle?.toUpperCase().includes('GHE') || !parseVehicle(slip.vehicle).isTruck ? '⛵' : '🚛'}
                          </span>
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

                      {/* Tấn (Cho phép điều chỉnh trực tiếp) */}
                      <td className="p-2 text-right">
                        <input
                          type="number"
                          step="0.1"
                          min={0}
                          value={slip.tons}
                          onChange={(e) =>
                            handleFieldChange(
                              slip.id,
                              'tons',
                              e.target.value === '' ? 0 : parseFloat(e.target.value) || 0
                            )
                          }
                          className="w-16 rounded border border-slate-200 bg-amber-50/50 px-1.5 py-1 text-right text-xs font-bold text-amber-700 hover:border-amber-400 focus:bg-white focus:border-amber-500 focus:outline-none transition shadow-2xs"
                          title="Bấm để điều chỉnh số tấn theo thực tế (tự động cập nhật Thành tiền & Tổng cộng)"
                        />
                      </td>

                      {/* Mô tả Cột D */}
                      <td className="p-2">
                        <input
                          type="text"
                          value={slip.description}
                          onChange={(e) => handleFieldChange(slip.id, 'description', e.target.value)}
                          className="w-full min-w-[200px] rounded border border-slate-200 px-2 py-1 text-xs text-slate-800 focus:border-amber-500 focus:outline-none"
                        />
                      </td>

                      {/* Nút Copy Dòng */}
                      <td className="p-2 text-center">
                        <button
                          type="button"
                          onClick={() => handleCopySingleSlip(slip)}
                          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-100 transition shadow-2xs cursor-pointer"
                          title="Sao chép phiếu này vào clipboard"
                        >
                          📋
                        </button>
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

                      {/* Nút Xóa Dòng */}
                      <td className="p-2 text-center">
                        <button
                          type="button"
                          onClick={() => handleDeleteSlip(slip.id)}
                          className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-600 transition cursor-pointer"
                          title="Xóa phiếu này khỏi danh sách"
                        >
                          ✕
                        </button>
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

      {/* ─── Modal Thêm Phiếu Cân Thủ Công (Ghe / Xe) ────────────────────── */}
      {showManualModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs animate-in fade-in">
          <div className="relative w-full max-w-xl rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden">
            {/* Header */}
            <div className="bg-gradient-to-r from-amber-700 via-amber-800 to-amber-900 p-5 text-white flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <span className="text-2xl">{manualType === 'GHE' ? '⛵' : '🚛'}</span>
                <div>
                  <h3 className="text-base font-bold">Thêm Phiếu Cân Thủ Công</h3>
                  <p className="text-xs text-amber-200/90">
                    {manualType === 'GHE' ? 'Nhập phiếu Ghe chở trấu (Mặc định)' : 'Nhập phiếu Xe tải chở trấu'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowManualModal(false)}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 transition cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Body */}
            <div className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
              {/* 1. Chọn loại phương tiện */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">Loại phương tiện:</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setManualType('GHE');
                      if (!isDescCustomized) {
                        updateAutoDescription(manualVehicle, manualCustomer, 'GHE');
                      }
                    }}
                    className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl border text-xs font-bold transition cursor-pointer ${
                      manualType === 'GHE'
                        ? 'border-amber-600 bg-amber-50 text-amber-900 ring-2 ring-amber-500/30'
                        : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <span>⛵</span>
                    <span>Ghe (Mặc định)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setManualType('XE');
                      if (!isDescCustomized) {
                        updateAutoDescription(manualVehicle, manualCustomer, 'XE');
                      }
                    }}
                    className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl border text-xs font-bold transition cursor-pointer ${
                      manualType === 'XE'
                        ? 'border-amber-600 bg-amber-50 text-amber-900 ring-2 ring-amber-500/30'
                        : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <span>🚛</span>
                    <span>Xe tải</span>
                  </button>
                </div>
              </div>

              {/* 2. Ngày & Đội */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Ngày cân (DD/MM/YYYY): <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={manualDate}
                    onChange={(e) => setManualDate(e.target.value)}
                    placeholder="VD: 10/11/2026"
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-800 focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Phân Đội:</label>
                  <div className="grid grid-cols-2 gap-1.5">
                    <button
                      type="button"
                      onClick={() => setManualTeam('ĐỨC')}
                      className={`py-2 px-2 rounded-xl border text-xs font-bold transition cursor-pointer ${
                        manualTeam === 'ĐỨC'
                          ? 'border-blue-500 bg-blue-50 text-blue-800 ring-2 ring-blue-400/30'
                          : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      🔵 Đội Đức
                    </button>
                    <button
                      type="button"
                      onClick={() => setManualTeam('QUÝ')}
                      className={`py-2 px-2 rounded-xl border text-xs font-bold transition cursor-pointer ${
                        manualTeam === 'QUÝ'
                          ? 'border-emerald-500 bg-emerald-50 text-emerald-800 ring-2 ring-emerald-400/30'
                          : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      🟢 Đội Quý
                    </button>
                  </div>
                </div>
              </div>

              {/* 3. Khách hàng */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Khách hàng: <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={manualCustomer}
                  list="husk-popular-customers-list"
                  onChange={(e) => {
                    const val = e.target.value;
                    setManualCustomer(val);
                    if (!isDescCustomized) {
                      updateAutoDescription(manualVehicle, val, manualType);
                    }
                  }}
                  placeholder="VD: CÔ LIỄU, TRANG BẾN TRE, CHỊ 7..."
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-800 focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 focus:outline-none uppercase"
                />
                <datalist id="husk-popular-customers-list">
                  {POPULAR_CUSTOMERS.map((c) => (
                    <option key={c} value={c} />
                  ))}
                </datalist>

                {/* Gợi ý chọn nhanh khách quen */}
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {POPULAR_CUSTOMERS.slice(0, 7).map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => {
                        setManualCustomer(c);
                        if (!isDescCustomized) {
                          updateAutoDescription(manualVehicle, c, manualType);
                        }
                      }}
                      className="rounded-md bg-slate-100 hover:bg-amber-100 text-slate-700 hover:text-amber-900 border border-slate-200 px-2 py-0.5 text-[10px] font-semibold transition cursor-pointer"
                    >
                      {c}
                    </button>
                  ))}
                </div>
              </div>

              {/* 4. Tên Ghe / Biển số Xe */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  {manualType === 'GHE' ? 'Tên Ghe / Tàu:' : 'Biển số Xe tải:'}
                </label>
                <input
                  type="text"
                  value={manualVehicle}
                  onChange={(e) => {
                    const val = e.target.value;
                    setManualVehicle(val);
                    if (!isDescCustomized) {
                      updateAutoDescription(val, manualCustomer, manualType);
                    }
                  }}
                  placeholder={manualType === 'GHE' ? 'VD: Ghe Út Em, Ghe An Giang, Ghe Cẩm...' : 'VD: 62H 01966, 63H 05099...'}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-800 focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 focus:outline-none"
                />
              </div>

              {/* 5. Khối lượng Kg hàng */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Khối lượng hàng (Kg): <span className="text-rose-500">*</span>
                </label>
                <input
                  type="number"
                  value={manualKg}
                  onChange={(e) => setManualKg(e.target.value)}
                  placeholder="VD: 25000 (cho ghe) hoặc 6960 (cho xe)"
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm font-bold text-slate-900 focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 focus:outline-none"
                />

                {/* Tính toán tự động hiển thị */}
                {Number(manualKg) > 0 && (
                  <div className="mt-2 rounded-xl bg-amber-50 border border-amber-200/80 p-2.5 flex items-center justify-between text-xs">
                    <div>
                      <span className="text-slate-600">Quy đổi: </span>
                      <strong className="text-amber-900 font-bold">
                        {calculateHuskTons(Number(manualKg)).toFixed(1)} tấn
                      </strong>
                    </div>
                    <div>
                      <span className="text-slate-600">Thành tiền ({manualType === 'GHE' ? '7.000đ/tấn (Ghe)' : `${(settings.unitPrice || 11000).toLocaleString()}đ/tấn (Xe)`}): </span>
                      <strong className="text-emerald-700 font-bold">
                        {Math.round(calculateHuskTons(Number(manualKg)) * (manualType === 'GHE' ? 7000 : (settings.unitPrice || 11000))).toLocaleString()} VNĐ
                      </strong>
                    </div>
                  </div>
                )}
              </div>

              {/* 6. Mô tả công việc (Cột D) */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-bold text-slate-700">Mô tả công việc (Cột D Excel):</label>
                  <button
                    type="button"
                    onClick={() => {
                      setIsDescCustomized(false);
                      updateAutoDescription(manualVehicle, manualCustomer, manualType);
                    }}
                    className="text-[10px] text-amber-700 hover:underline cursor-pointer"
                  >
                    Tạo lại tự động
                  </button>
                </div>
                <input
                  type="text"
                  value={manualDesc}
                  onChange={(e) => {
                    setIsDescCustomized(true);
                    setManualDesc(e.target.value);
                  }}
                  placeholder="Tự động sinh khi nhập khách và phương tiện..."
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs font-medium text-slate-800 focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 focus:outline-none"
                />
              </div>
            </div>

            {/* Footer Buttons */}
            <div className="bg-slate-50 p-4 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-2.5">
              <button
                type="button"
                onClick={() => setShowManualModal(false)}
                className="w-full sm:w-auto rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition cursor-pointer"
              >
                Hủy
              </button>

              <div className="flex w-full sm:w-auto items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleAddManualSlip(true)}
                  className="w-full sm:w-auto rounded-xl border border-amber-300 bg-amber-50 px-3.5 py-2 text-xs font-bold text-amber-900 hover:bg-amber-100 transition cursor-pointer"
                  title="Thêm phiếu này và tiếp tục giữ form để nhập thêm phiếu ghe tiếp theo"
                >
                  + Thêm &amp; Nhập tiếp
                </button>
                <button
                  type="button"
                  onClick={() => handleAddManualSlip(false)}
                  className="w-full sm:w-auto rounded-xl bg-gradient-to-r from-amber-600 to-amber-700 px-4 py-2 text-xs font-bold text-white shadow-md shadow-amber-600/20 hover:from-amber-700 hover:to-amber-800 transition cursor-pointer"
                >
                  + Thêm vào danh sách
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── Modal Xem Phóng To & Xoay Ảnh Phiếu Cân (To Nhất & Sắc Nét 100%) ── */}
      {previewImage && (
        <div
          onClick={() => setPreviewImage(null)}
          className="fixed inset-0 z-50 flex flex-col items-center bg-black/95 p-2 sm:p-4 backdrop-blur-md animate-in fade-in select-none"
        >
          {/* Thanh công cụ điều khiển trên cùng */}
          <div
            onClick={(e) => e.stopPropagation()}
            className="mb-2 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-white/20 bg-slate-900/95 px-4 py-2.5 text-white shadow-2xl backdrop-blur-lg w-full shrink-0"
          >
            <div className="flex items-center gap-2 text-xs font-bold text-amber-300 flex-wrap">
              <span className="text-base">📸</span>
              <span className="text-sm font-extrabold text-white">Xem Chi Tiết Phiếu Cân</span>
              {isUsingOriginalImage ? (
                <span className="rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-400/40 px-2.5 py-0.5 text-[11px] font-bold inline-flex items-center gap-1">
                  <span>✨</span> Ảnh gốc nét 100%
                </span>
              ) : (
                <span className="rounded-full bg-amber-500/20 text-amber-300 border border-amber-400/40 px-2.5 py-0.5 text-[11px] font-bold inline-flex items-center gap-1">
                  <span>⚠️</span> Ảnh cache (Có thể mờ)
                </span>
              )}
              <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] text-slate-300">
                Góc xoay: {previewRotation}°
              </span>
              <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] text-slate-300">
                Tỉ lệ: {Math.round(previewZoom * 100)}%
              </span>
            </div>

            {/* Các nút xoay, phóng to & đổi ảnh gốc */}
            <div className="flex items-center gap-2 flex-wrap">
              {/* Nút nạp lại ảnh gốc cực nét nếu ảnh hiện tại mờ */}
              {activePreviewSlip && (
                <button
                  type="button"
                  onClick={() => replaceImageInputRef.current?.click()}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-amber-400 bg-amber-500 px-3 py-1.5 text-xs font-extrabold text-slate-950 hover:bg-amber-400 transition active:scale-95 cursor-pointer shadow-md"
                  title="Chọn lại file ảnh chụp gốc từ máy để xem rõ nét 100%"
                >
                  <span>📷</span>
                  <span>Chọn ảnh rõ nét</span>
                </button>
              )}
              <input
                ref={replaceImageInputRef}
                type="file"
                accept="image/*"
                onChange={handleReplaceSlipImage}
                className="hidden"
              />

              {/* Quay trái 90° */}
              <button
                type="button"
                onClick={() => setPreviewRotation((prev) => (prev - 90 + 360) % 360)}
                className="inline-flex items-center gap-1 rounded-xl border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-bold text-white shadow-2xs hover:bg-amber-500 hover:text-slate-950 transition active:scale-95 cursor-pointer"
                title="Quay trái 90° (Phím mũi tên trái ←)"
              >
                <span className="text-sm">↺</span>
                <span className="hidden sm:inline">Quay trái</span>
              </button>

              {/* Quay phải 90° */}
              <button
                type="button"
                onClick={() => setPreviewRotation((prev) => (prev + 90) % 360)}
                className="inline-flex items-center gap-1 rounded-xl border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-bold text-white shadow-2xs hover:bg-amber-500 hover:text-slate-950 transition active:scale-95 cursor-pointer"
                title="Quay phải 90° (Phím mũi tên phải →)"
              >
                <span className="text-sm">↻</span>
                <span className="hidden sm:inline">Quay phải</span>
              </button>

              {/* Zoom presets */}
              <div className="flex items-center rounded-xl bg-white/10 border border-white/20 p-0.5">
                <button
                  type="button"
                  onClick={() => setPreviewZoom((prev) => Math.max(Number((prev - 0.25).toFixed(2)), 1))}
                  className="px-2.5 py-1 text-xs font-bold text-white hover:bg-white/20 rounded-lg transition cursor-pointer"
                  title="Thu nhỏ (-)"
                >
                  −
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewZoom(1)}
                  className={`px-2.5 py-1 text-xs font-bold rounded-lg transition cursor-pointer ${
                    previewZoom === 1 ? 'bg-amber-500 text-slate-950 font-extrabold' : 'text-slate-300 hover:text-white'
                  }`}
                  title="Vừa vặn màn hình (100%)"
                >
                  100%
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewZoom(1.5)}
                  className={`px-2.5 py-1 text-xs font-bold rounded-lg transition cursor-pointer ${
                    previewZoom === 1.5 ? 'bg-amber-500 text-slate-950 font-extrabold' : 'text-slate-300 hover:text-white'
                  }`}
                  title="Phóng to 150%"
                >
                  150%
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewZoom(2)}
                  className={`px-2.5 py-1 text-xs font-bold rounded-lg transition cursor-pointer ${
                    previewZoom === 2 ? 'bg-amber-500 text-slate-950 font-extrabold' : 'text-slate-300 hover:text-white'
                  }`}
                  title="Phóng to 200% đọc rõ chữ số"
                >
                  200%
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewZoom((prev) => Math.min(Number((prev + 0.25).toFixed(2)), 4))}
                  className="px-2.5 py-1 text-xs font-bold text-white hover:bg-white/20 rounded-lg transition cursor-pointer"
                  title="Phóng to (+)"
                >
                  +
                </button>
              </div>

              {/* Đặt lại */}
              {(previewRotation !== 0 || previewZoom !== 1) && (
                <button
                  type="button"
                  onClick={() => {
                    setPreviewRotation(0);
                    setPreviewZoom(1);
                  }}
                  className="rounded-xl border border-amber-400/50 bg-amber-500/20 px-2.5 py-1.5 text-xs font-bold text-amber-300 hover:bg-amber-500 hover:text-slate-950 transition cursor-pointer"
                  title="Đặt lại ban đầu (0°, 100%)"
                >
                  ⟲ Đặt lại
                </button>
              )}

              {/* Nút đóng */}
              <button
                type="button"
                onClick={() => setPreviewImage(null)}
                className="ml-1 flex h-8 w-8 items-center justify-center rounded-xl bg-rose-600 text-white hover:bg-rose-500 transition active:scale-95 cursor-pointer font-bold shadow-md"
                title="Đóng (ESC)"
              >
                ✕
              </button>
            </div>
          </div>

          {/* Cảnh báo nếu đang dùng ảnh cache mờ */}
          {!isUsingOriginalImage && activePreviewSlip && (
            <div
              onClick={(e) => e.stopPropagation()}
              className="mb-2 w-full flex items-center justify-between gap-2 rounded-xl bg-amber-500/20 border border-amber-400/50 px-4 py-2 text-xs text-amber-200 backdrop-blur-md"
            >
              <span>
                ⚠️ Ảnh hiện tại đang hiển thị từ bộ nhớ tạm nên có thể bị giảm độ nét. Nhấn <strong>"Chọn ảnh rõ nét"</strong> để nạp lại ảnh gốc từ máy và xem rõ từng chữ số 100%.
              </span>
              <button
                type="button"
                onClick={() => replaceImageInputRef.current?.click()}
                className="shrink-0 rounded-lg bg-amber-400 px-3 py-1 font-bold text-slate-950 hover:bg-amber-300 transition cursor-pointer shadow-xs"
              >
                📷 Nạp ảnh gốc ngay
              </button>
            </div>
          )}

          {/* Vùng hiển thị ảnh - Chiếm trọn khung hình to nhất và cuộn được khi zoom */}
          <div
            onClick={(e) => e.stopPropagation()}
            onWheel={(e) => {
              if (e.deltaY < 0) {
                setPreviewZoom((prev) => Math.min(Number((prev + 0.25).toFixed(2)), 4));
              } else {
                setPreviewZoom((prev) => Math.max(Number((prev - 0.25).toFixed(2)), 1));
              }
            }}
            className="relative flex flex-1 min-h-0 w-full items-center justify-center overflow-auto rounded-2xl bg-black/90 border border-white/10 shadow-2xl p-2"
            title="Nhấp vào ảnh để phóng to/thu nhỏ nhanh • Cuộn chuột hoặc bấm nút +/− để chỉnh tỉ lệ"
          >
            <div
              className="flex h-full w-full items-center justify-center transition-transform duration-150 ease-out m-auto"
              style={{
                transform: `rotate(${previewRotation}deg) scale(${previewZoom})`,
                transformOrigin: 'center center',
                transition: 'transform 0.15s ease-out',
              }}
            >
              <img
                src={previewImage}
                alt="Phóng to phiếu cân"
                onClick={() => setPreviewZoom((prev) => (prev > 1.2 ? 1 : 1.75))}
                style={{
                  height: previewRotation % 180 !== 0 ? 'auto' : 'calc(100vh - 170px)',
                  width: previewRotation % 180 !== 0 ? 'calc(100vh - 170px)' : 'auto',
                  maxHeight: previewRotation % 180 !== 0 ? '80vw' : 'calc(100vh - 150px)',
                  maxWidth: previewRotation % 180 !== 0 ? 'calc(100vh - 150px)' : '95vw',
                  minHeight: previewRotation % 180 !== 0 ? '300px' : '480px',
                  objectFit: 'contain',
                }}
                className={`w-auto object-contain rounded-xl shadow-2xl select-none block border border-white/10 transition-all ${
                  previewZoom > 1 ? 'cursor-zoom-out' : 'cursor-zoom-in'
                }`}
              />
            </div>
          </div>

          {/* Hướng dẫn tiện ích dưới cùng */}
          <div className="mt-1.5 shrink-0 text-center text-[11px] text-slate-300 flex items-center justify-center gap-3 flex-wrap">
            <span>💡 Mẹo: Nhấp vào ảnh để phóng to <strong>175%</strong></span>
            <span>•</span>
            <span>Cuộn chuột hoặc bấm <strong>+</strong> / <strong>−</strong> để chỉnh tỉ lệ</span>
            <span>•</span>
            <span>Phím <strong>←</strong> / <strong>→</strong> để quay ảnh 90°</span>
            <span>•</span>
            <span>Phím <strong>0</strong> để đặt lại</span>
            <span>•</span>
            <span>Phím <strong>ESC</strong> để đóng</span>
            {!isUsingOriginalImage && activePreviewSlip && (
              <>
                <span>•</span>
                <button
                  type="button"
                  onClick={() => replaceImageInputRef.current?.click()}
                  className="text-amber-400 font-bold underline hover:text-amber-300 cursor-pointer"
                >
                  Bấm vào đây để chọn lại ảnh gốc cực nét 📸
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

