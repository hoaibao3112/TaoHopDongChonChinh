'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  VEHICLE_COLUMNS,
  createDefaultVehicleBoardState,
  getEffectiveCapacityRange,
  normalizeVehicleName,
  sanitizeBoardState,
} from '@/lib/vehicle-board/defaults';
import { buildVehicleBoardExcelBuffer } from '@/lib/vehicle-board/export-excel';
import {
  VehicleBoardState,
  VehicleColumnId,
  VehicleGroup,
  VehicleItem,
} from '@/lib/vehicle-board/types';
import DailyIntakePlanView from './DailyIntakePlanView';

type GroupFilter = 'all' | VehicleGroup;
type BoardSubTab = 'board' | 'daily_plan';

const COLUMN_HEADER_CLASSES: Record<VehicleColumnId, string> = {
  pt_trong: 'bg-yellow-300 text-slate-950 border-yellow-500',
  pt_cho: 'bg-purple-300 text-slate-950 border-purple-400',
  pt_nhan_lua_kho: 'bg-orange-400 text-slate-950 border-orange-500',
  pt_nhan_lua_tuoi: 'bg-green-400 text-slate-950 border-green-500',
  pt_tang_bo: 'bg-teal-700 text-white border-teal-800',
  pt_nhan_gao: 'bg-white text-slate-950 border-slate-400',
};

function getTodayVN(): string {
  const now = new Date();
  const vn = new Date(now.getTime() + 7 * 60 * 60 * 1000);
  return vn.toISOString().slice(0, 10);
}

function shiftDate(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

function formatDateVNLabel(dateStr: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr;
  const [y, m, d] = dateStr.split('-');
  return `${d}/${m}/${y}`;
}

export default function VehicleBoardView() {
  const [selectedDate, setSelectedDate] = useState<string>(getTodayVN);
  const [inheritedFromDate, setInheritedFromDate] = useState<string | null>(null);
  const [board, setBoard] = useState<VehicleBoardState>(() => createDefaultVehicleBoardState());
  const [isLoading, setIsLoading] = useState(true);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);

  // Sub-tab: Bảng 6 cột | Kế hoạch nhận hàng ngày
  const [subTab, setSubTab] = useState<BoardSubTab>('board');

  // Tìm kiếm & lọc
  const [searchTerm, setSearchTerm] = useState('');
  const [groupFilter, setGroupFilter] = useState<GroupFilter>('all');

  // Drag & Drop state
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverCol, setDragOverCol] = useState<VehicleColumnId | null>(null);

  // Mobile UX state
  const [mobileActiveCol, setMobileActiveCol] = useState<VehicleColumnId>('pt_trong');
  const [mobileShowAllCols, setMobileShowAllCols] = useState(false);
  const [movingItem, setMovingItem] = useState<VehicleItem | null>(null);

  // Modal / Form thêm phương tiện ngoài
  const [newExtName, setNewExtName] = useState('');
  const [newExtCapacity, setNewExtCapacity] = useState('100');
  const [newExtCol, setNewExtCol] = useState<VehicleColumnId>('pt_cho');
  const [newExtNote, setNewExtNote] = useState('');

  // Modal sửa ghi chú / tên / tải trọng phương tiện
  const [editingItem, setEditingItem] = useState<VehicleItem | null>(null);
  const [editName, setEditName] = useState('');
  const [editCapacity, setEditCapacity] = useState('150');
  const [editRegNumber, setEditRegNumber] = useState('');
  const [editNote, setEditNote] = useState('');

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/vehicle-board?date=${selectedDate}`, { cache: 'no-store' })
      .then((res) => res.json().then((data) => ({ ok: res.ok, data })))
      .then(({ ok, data }) => {
        if (cancelled) return;
        if (!ok || !data.success || !data.data) {
          throw new Error(data.error || 'Không thể tải dữ liệu xếp phương tiện');
        }
        const loaded = data.data as VehicleBoardState;
        setInheritedFromDate(loaded.inheritedFromDate || null);
        setBoard(sanitizeBoardState(loaded));
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [selectedDate]);

  const handleSelectDate = (nextDate: string) => {
    if (!nextDate || nextDate === selectedDate) return;
    setIsLoading(true);
    setError(null);
    setSaveStatus('idle');
    setSelectedDate(nextDate);
  };

  const persistBoard = (nextBoard: VehicleBoardState, immediate = false) => {
    const clean = sanitizeBoardState({
      ...nextBoard,
      date: selectedDate,
      updatedAt: new Date().toISOString(),
    });
    const cleanWithDate: VehicleBoardState = { ...clean, date: selectedDate };
    setBoard(cleanWithDate);
    setSaveStatus('saving');
    setError(null);

    const doSave = async () => {
      try {
        const res = await fetch('/api/vehicle-board', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ date: selectedDate, state: cleanWithDate }),
        });
        const data = (await res.json()) as { success?: boolean; error?: string; data?: VehicleBoardState };
        if (!res.ok || !data.success) {
          throw new Error(data.error || 'Lỗi lưu dữ liệu');
        }
        setInheritedFromDate(null);
        setSaveStatus('saved');
      } catch (err: unknown) {
        setSaveStatus('error');
        setError(err instanceof Error ? err.message : 'Không thể lưu lên CSDL');
      }
    };

    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    if (immediate) {
      void doSave();
    } else {
      saveTimerRef.current = setTimeout(() => {
        void doSave();
      }, 250);
    }
  };

  /**
   * Di chuyển phương tiện sang cột đích (hoặc đổi vị trí trong cùng cột).
   * Ràng buộc cứng: 1 phương tiện chỉ tồn tại ở 1 nơi duy nhất.
   */
  const moveVehicle = (
    vehicleId: string,
    targetColumnId: VehicleColumnId,
    targetBeforeId?: string
  ) => {
    const moving = board.vehicles.find((v) => v.id === vehicleId);
    if (!moving) return;

    const remaining = board.vehicles.filter((v) => v.id !== vehicleId);
    const destItems = remaining
      .filter((v) => v.columnId === targetColumnId)
      .sort((a, b) => a.order - b.order);

    let insertIdx = destItems.length;
    if (targetBeforeId) {
      const idx = destItems.findIndex((v) => v.id === targetBeforeId);
      if (idx >= 0) insertIdx = idx;
    }

    const updatedMoving: VehicleItem = {
      ...moving,
      columnId: targetColumnId,
    };

    destItems.splice(insertIdx, 0, updatedMoving);
    const reindexedDest = destItems.map((v, idx) => ({ ...v, order: idx }));

    const others = remaining.filter((v) => v.columnId !== targetColumnId);
    persistBoard({
      vehicles: [...others, ...reindexedDest],
      updatedAt: new Date().toISOString(),
    });
  };

  const handleAddExternalVehicle = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = normalizeVehicleName(newExtName);
    if (!cleanName) {
      setError('Vui lòng nhập tên phương tiện.');
      return;
    }

    const duplicate = board.vehicles.find((v) => normalizeVehicleName(v.name) === cleanName);
    if (duplicate) {
      const colLabel = VEHICLE_COLUMNS.find((c) => c.id === duplicate.columnId)?.label || duplicate.columnId;
      setError(`Phương tiện "${cleanName}" đã có ở cột "${colLabel}". Mỗi phương tiện chỉ được ở 1 nơi!`);
      return;
    }

    const slug = cleanName
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    const cap = Math.max(10, parseInt(newExtCapacity, 10) || 100);
    const newItem: VehicleItem = {
      id: `ext-${slug || 'pt'}-${board.vehicles.length + 1}`,
      name: cleanName,
      group: 'external',
      columnId: newExtCol,
      order: 9999,
      capacityTons: cap,
      ...(newExtNote.trim() ? { note: newExtNote.trim() } : {}),
    };

    persistBoard({
      vehicles: [...board.vehicles, newItem],
      updatedAt: new Date().toISOString(),
    }, true);

    setNewExtName('');
    setNewExtNote('');
  };

  const openEditModal = (item: VehicleItem) => {
    setEditingItem(item);
    setEditName(item.name);
    setEditCapacity(String(item.capacityTons || 150));
    setEditRegNumber(item.regNumber || '');
    setEditNote(item.note || '');
  };

  const handleSaveEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingItem) return;

    const cleanName = editingItem.group === 'nguyen_nguyen'
      ? editingItem.name
      : normalizeVehicleName(editName);

    if (!cleanName) {
      setError('Tên phương tiện không được để trống.');
      return;
    }

    const duplicate = board.vehicles.find(
      (v) => v.id !== editingItem.id && normalizeVehicleName(v.name) === cleanName
    );
    if (duplicate) {
      setError(`Tên phương tiện "${cleanName}" đã tồn tại ở cột khác!`);
      return;
    }

    const nextCap = Math.max(10, parseInt(editCapacity, 10) || editingItem.capacityTons);
    const nextReg = editRegNumber.trim();

    const nextVehicles = board.vehicles.map((v) => {
      if (v.id !== editingItem.id) return v;
      const cleanNote = editNote.trim();
      return {
        ...v,
        name: cleanName,
        capacityTons: nextCap,
        regNumber: nextReg || undefined,
        note: cleanNote || undefined,
      };
    });

    persistBoard({
      vehicles: nextVehicles,
      updatedAt: new Date().toISOString(),
    }, true);
    setEditingItem(null);
  };

  const handleSyncFromDailyPlan = (
    assignments: { vehicleId: string; columnId: VehicleColumnId }[]
  ) => {
    const assignMap = new Map(assignments.map((a) => [a.vehicleId, a.columnId]));
    const nextVehicles = board.vehicles.map((v) => {
      const target = assignMap.get(v.id);
      return target ? { ...v, columnId: target } : v;
    });
    persistBoard({
      vehicles: nextVehicles,
      updatedAt: new Date().toISOString(),
    }, true);
  };

  const handleDeleteExternal = (item: VehicleItem) => {
    if (item.group === 'nguyen_nguyen') return;
    if (!window.confirm(`Xóa phương tiện ngoài "${item.name}" khỏi bảng?`)) return;
    persistBoard({
      vehicles: board.vehicles.filter((v) => v.id !== item.id),
      updatedAt: new Date().toISOString(),
    }, true);
  };

  const handleResetDefault = async () => {
    if (!window.confirm(`Khôi phục bảng phương tiện ngày ${formatDateVNLabel(selectedDate)} về mặc định ban đầu?`)) return;
    setSaveStatus('saving');
    setError(null);
    try {
      const res = await fetch('/api/vehicle-board', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: selectedDate, resetDefault: true }),
      });
      const data = (await res.json()) as { success?: boolean; error?: string; data?: VehicleBoardState };
      if (!res.ok || !data.success || !data.data) {
        throw new Error(data.error || 'Không thể khôi phục mặc định');
      }
      setInheritedFromDate(null);
      setBoard(sanitizeBoardState(data.data));
      setSaveStatus('saved');
    } catch (err: unknown) {
      setSaveStatus('error');
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleExportExcel = async () => {
    const buf = await buildVehicleBoardExcelBuffer({ ...board, date: selectedDate });
    const blob = new Blob([buf.buffer as ArrayBuffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `XepPhuongTien_${selectedDate}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const counts = useMemo(() => {
    const nn = board.vehicles.filter((v) => v.group === 'nguyen_nguyen').length;
    const ext = board.vehicles.filter((v) => v.group === 'external').length;
    return { total: board.vehicles.length, nn, ext };
  }, [board.vehicles]);

  const vehiclesByColumn = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    const map: Record<VehicleColumnId, VehicleItem[]> = {
      pt_trong: [],
      pt_cho: [],
      pt_nhan_lua_kho: [],
      pt_nhan_lua_tuoi: [],
      pt_tang_bo: [],
      pt_nhan_gao: [],
    };
    for (const col of VEHICLE_COLUMNS) {
      map[col.id] = board.vehicles
        .filter((v) => {
          if (v.columnId !== col.id) return false;
          if (groupFilter !== 'all' && v.group !== groupFilter) return false;
          if (q) {
            const hay = `${v.name} ${v.note || ''}`.toLowerCase();
            if (!hay.includes(q)) return false;
          }
          return true;
        })
        .sort((a, b) => a.order - b.order);
    }
    return map;
  }, [board.vehicles, searchTerm, groupFilter]);

  const renderVehicleCard = (item: VehicleItem, idx: number, colId: VehicleColumnId) => (
    <div
      key={item.id}
      draggable
      onDragStart={(e) => {
        setDraggedId(item.id);
        e.dataTransfer.setData('text/plain', item.id);
        e.dataTransfer.effectAllowed = 'move';
      }}
      onDragEnd={() => {
        setDraggedId(null);
        setDragOverCol(null);
      }}
      onDragOver={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
      onDrop={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setDragOverCol(null);
        const id = e.dataTransfer.getData('text/plain') || draggedId;
        if (id && id !== item.id) moveVehicle(id, colId, item.id);
        setDraggedId(null);
      }}
      className={`group rounded-xl border p-2 transition-all cursor-grab active:cursor-grabbing ${
        draggedId === item.id
          ? 'opacity-40 border-amber-500 bg-amber-100'
          : item.group === 'nguyen_nguyen'
          ? 'border-amber-300 border-l-4 border-l-red-600 bg-amber-50/85 hover:border-amber-500 hover:bg-amber-50 shadow-2xs'
          : 'border-sky-300 border-l-4 border-l-sky-600 bg-sky-50/85 hover:border-sky-500 hover:bg-sky-50 shadow-2xs'
      }`}
    >
      <div className="flex items-start justify-between gap-1">
        <div className="min-w-0">
          <div
            className={`text-xs font-black leading-snug break-words ${
              item.group === 'nguyen_nguyen' ? 'text-red-700' : 'text-sky-900'
            }`}
          >
            <span className="text-slate-500 font-bold mr-1">{idx + 1}.</span>
            {item.name}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-1 text-[10px]">
            <span
              className={`inline-block rounded px-1.5 py-0.5 font-bold ${
                item.capacityTons >= 195
                  ? 'bg-indigo-100 text-indigo-900 border border-indigo-200'
                  : item.capacityTons >= 120
                  ? 'bg-emerald-100 text-emerald-900 border border-emerald-200'
                  : 'bg-slate-200/80 text-slate-800 border border-slate-300'
              }`}
            >
              {item.capacityTons}T · Chở {getEffectiveCapacityRange(item.capacityTons).minTons}–
              {getEffectiveCapacityRange(item.capacityTons).maxTons}T
            </span>
            {item.regNumber && (
              <span className="font-mono font-semibold text-slate-600">{item.regNumber}</span>
            )}
          </div>
          {item.note && (
            <div className="mt-1 rounded bg-rose-100/80 px-1.5 py-0.5 text-[10px] italic font-bold text-rose-800 leading-tight">
              ({item.note})
            </div>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-0.5 opacity-80 group-hover:opacity-100">
          <button
            type="button"
            onClick={() => openEditModal(item)}
            className="rounded-md p-1 text-[11px] text-slate-500 hover:bg-slate-200 hover:text-slate-900 cursor-pointer"
            title="Sửa ghi chú / tên"
          >
            ✏️
          </button>
          {item.group === 'external' && (
            <button
              type="button"
              onClick={() => handleDeleteExternal(item)}
              className="rounded-md p-1 text-[11px] text-rose-500 hover:bg-rose-100 hover:text-rose-800 cursor-pointer"
              title="Xóa phương tiện ngoài"
            >
              🗑️
            </button>
          )}
        </div>
      </div>

      <div className="mt-2 flex items-center justify-between gap-1.5">
        <span
          className={`rounded px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wide ${
            item.group === 'nguyen_nguyen' ? 'bg-red-600 text-white' : 'bg-sky-600 text-white'
          }`}
        >
          {item.group === 'nguyen_nguyen' ? 'Nguyên Nguyên' : 'PT Ngoài'}
        </span>
        <button
          type="button"
          onClick={() => setMovingItem(item)}
          className="md:hidden rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-black text-slate-800 shadow-2xs active:bg-slate-100 cursor-pointer"
        >
          ⇄ Chuyển cột
        </button>
        <select
          value={item.columnId}
          onChange={(e) => moveVehicle(item.id, e.target.value as VehicleColumnId)}
          aria-label={`Chuyển cột cho ${item.name}`}
          className="hidden md:block rounded border border-slate-200 bg-white px-1 py-0.5 text-[10px] font-semibold text-slate-600 focus:border-amber-400 focus:outline-none cursor-pointer"
        >
          {VEHICLE_COLUMNS.map((c) => (
            <option key={c.id} value={c.id}>
              → {c.shortLabel}
            </option>
          ))}
        </select>
      </div>
    </div>
  );

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-slate-500">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-amber-200 border-t-amber-600 mb-3" />
        <p className="text-sm font-semibold">Đang tải bảng sắp xếp phương tiện...</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Thanh chuyển 2 chế độ + Bộ chọn ngày dùng chung */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setSubTab('board')}
            className={`inline-flex items-center gap-2 rounded-2xl px-4 py-2.5 text-xs sm:text-sm font-black transition-all cursor-pointer ${
              subTab === 'board'
                ? 'bg-slate-900 text-white shadow-sm'
                : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
            }`}
          >
            <span>🚢</span>
            <span>Bảng Xếp Phương Tiện (6 Cột)</span>
          </button>

          <button
            type="button"
            onClick={() => setSubTab('daily_plan')}
            className={`inline-flex items-center gap-2 rounded-2xl px-4 py-2.5 text-xs sm:text-sm font-black transition-all cursor-pointer ${
              subTab === 'daily_plan'
                ? 'bg-emerald-700 text-white shadow-sm'
                : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
            }`}
          >
            <span>📋</span>
            <span>Kế Hoạch Nhận Hàng Ngày</span>
          </button>
        </div>

        <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-1.5 rounded-2xl border border-slate-200 bg-white p-1.5 shadow-2xs w-full lg:w-auto">
          <button
            type="button"
            onClick={() => handleSelectDate(shiftDate(selectedDate, -1))}
            className="rounded-xl px-2.5 py-2 sm:py-1.5 text-xs font-bold text-slate-700 bg-slate-50 sm:bg-transparent hover:bg-slate-100 cursor-pointer text-center"
            title="Xem ngày hôm trước"
          >
            ◀ Hôm trước
          </button>
          <button
            type="button"
            onClick={() => handleSelectDate(shiftDate(selectedDate, 1))}
            className="rounded-xl px-2.5 py-2 sm:py-1.5 text-xs font-bold text-slate-700 bg-slate-50 sm:bg-transparent hover:bg-slate-100 cursor-pointer text-center sm:order-4"
            title="Mở ngày tiếp theo (lấy trạng thái ngày trước để chỉnh tiếp)"
          >
            Ngày sau ▶
          </button>
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => handleSelectDate(e.target.value)}
            aria-label="Chọn ngày điều phối"
            className="rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-1.5 sm:py-1 text-xs font-black text-slate-900 focus:border-amber-500 focus:outline-none sm:order-2"
          />
          <button
            type="button"
            onClick={() => handleSelectDate(getTodayVN())}
            className="rounded-xl bg-amber-50 px-2.5 py-2 sm:py-1.5 text-xs font-bold text-amber-800 hover:bg-amber-100 cursor-pointer text-center sm:order-3"
          >
            Hôm nay
          </button>
        </div>
      </div>

      {subTab === 'daily_plan' ? (
        <DailyIntakePlanView
          planDate={selectedDate}
          onChangeDate={handleSelectDate}
          vehicles={board.vehicles}
          onSyncVehiclesToColumns={handleSyncFromDailyPlan}
        />
      ) : (
        <>
          {/* Header + Tóm tắt + Nút hành động */}
      <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-xs">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-yellow-300 bg-yellow-100 px-3 py-1 text-xs font-bold text-amber-900">
                <span>🚢</span>
                <span>Điều Phối Kéo-Thả Trực Quan</span>
              </span>
              <span className="rounded-full bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 text-[11px] font-bold text-emerald-800">
                Tổng: {counts.total} PT ({counts.nn} Nguyên Nguyên · {counts.ext} PT Ngoài)
              </span>
              {saveStatus === 'saving' && (
                <span className="text-xs font-bold text-amber-600 animate-pulse">⏳ Đang lưu...</span>
              )}
              {saveStatus === 'saved' && (
                <span className="text-xs font-bold text-emerald-700">✅ Đã lưu ngày {formatDateVNLabel(selectedDate)}</span>
              )}
              {inheritedFromDate && (
                <span className="rounded-full bg-indigo-50 border border-indigo-200 px-2.5 py-0.5 text-[11px] font-bold text-indigo-700">
                  📋 Lấy từ ngày {inheritedFromDate === 'default' ? 'mặc định' : formatDateVNLabel(inheritedFromDate)} (sửa ở đây không đổi ngày cũ)
                </span>
              )}
            </div>
            <h1 className="mt-2 text-xl sm:text-2xl font-black tracking-tight text-slate-900">
              Bảng Sắp Xếp Phương Tiện Ngày {formatDateVNLabel(selectedDate)}
            </h1>
            <p className="mt-0.5 text-xs sm:text-sm text-slate-500">
              Kéo thả trực tiếp tên ghe/tàu giữa 6 cột trạng thái (hoặc chọn cột nhanh trên thẻ). Hệ thống tự động đảm bảo không bị trùng ở 2 nơi.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleExportExcel}
              className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-emerald-700 transition cursor-pointer"
            >
              <span>📥</span>
              <span>Xuất Excel</span>
            </button>
            <button
              type="button"
              onClick={handleResetDefault}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 transition cursor-pointer"
            >
              <span>🔄</span>
              <span>Khôi phục mặc định</span>
            </button>
          </div>
        </div>

        {/* Thanh tìm kiếm + lọc + Thêm PT ngoài */}
        <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-12 border-t border-slate-100 pt-4">
          <div className="lg:col-span-5 flex flex-wrap items-center gap-2">
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Tìm tên phương tiện hoặc ghi chú..."
              className="flex-1 min-w-[180px] rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-xs text-slate-900 focus:border-amber-500 focus:bg-white focus:outline-none"
            />
            <select
              value={groupFilter}
              onChange={(e) => setGroupFilter(e.target.value as GroupFilter)}
              className="rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-700"
            >
              <option value="all">Tất cả ({counts.total})</option>
              <option value="nguyen_nguyen">Nguyên Nguyên ({counts.nn})</option>
              <option value="external">PT Ngoài ({counts.ext})</option>
            </select>
          </div>

          <form
            onSubmit={handleAddExternalVehicle}
            className="lg:col-span-7 flex flex-wrap items-center gap-2 rounded-2xl border border-dashed border-amber-300 bg-amber-50/40 px-3 py-2"
          >
            <span className="text-[11px] font-black uppercase text-amber-800">+ PT Ngoài:</span>
            <input
              type="text"
              value={newExtName}
              onChange={(e) => setNewExtName(e.target.value)}
              placeholder="Tên ghe/tàu ngoài..."
              className="flex-1 min-w-[130px] rounded-xl border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-900 focus:border-amber-500 focus:outline-none"
            />
            <input
              type="number"
              min={10}
              value={newExtCapacity}
              onChange={(e) => setNewExtCapacity(e.target.value)}
              placeholder="Tấn"
              title="Khối lượng chở của tàu (tấn)"
              className="w-16 rounded-xl border border-slate-300 bg-white px-2 py-1.5 text-xs font-bold text-slate-900 text-right focus:border-amber-500 focus:outline-none"
            />
            <select
              value={newExtCol}
              onChange={(e) => setNewExtCol(e.target.value as VehicleColumnId)}
              className="rounded-xl border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700"
            >
              {VEHICLE_COLUMNS.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
            <input
              type="text"
              value={newExtNote}
              onChange={(e) => setNewExtNote(e.target.value)}
              placeholder="Ghi chú (nếu có)..."
              className="w-36 rounded-xl border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-900 focus:border-amber-500 focus:outline-none"
            />
            <button
              type="submit"
              className="rounded-xl bg-amber-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-amber-700 transition cursor-pointer"
            >
              Thêm
            </button>
          </form>
        </div>

        {error && (
          <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs font-bold text-rose-800">
            ⚠️ {error}
          </div>
        )}
      </div>

      {/* THANH CHỌN CỘT NHANH TRÊN ĐIỆN THOẠI (2x3) */}
      <div className="md:hidden space-y-2">
        <div className="grid grid-cols-2 gap-2">
          {VEHICLE_COLUMNS.map((col) => {
            const list = vehiclesByColumn[col.id];
            const nnCount = list.filter((v) => v.group === 'nguyen_nguyen').length;
            const extCount = list.filter((v) => v.group === 'external').length;
            const isActive = !mobileShowAllCols && mobileActiveCol === col.id;
            return (
              <button
                key={col.id}
                type="button"
                onClick={() => {
                  setMobileShowAllCols(false);
                  setMobileActiveCol(col.id);
                }}
                className={`rounded-2xl border-2 px-3 py-2.5 text-left transition-all cursor-pointer ${
                  COLUMN_HEADER_CLASSES[col.id]
                } ${isActive ? 'ring-2 ring-slate-900 scale-[1.01] shadow-sm' : 'opacity-80'}`}
              >
                <div className="text-[11px] font-black uppercase leading-tight">{col.shortLabel}</div>
                <div className="mt-0.5 text-xs font-black">
                  {list.length} PT ({nnCount} NN · {extCount} Ngoài)
                </div>
              </button>
            );
          })}
        </div>

        <button
          type="button"
          onClick={() => setMobileShowAllCols((prev) => !prev)}
          className="w-full rounded-xl border border-slate-300 bg-white py-2 text-xs font-bold text-slate-700 shadow-2xs cursor-pointer"
        >
          {mobileShowAllCols ? '📱 Thu gọn về 1 cột' : '📋 Xem tất cả 6 cột cùng lúc'}
        </button>
      </div>

      {/* BẢNG 6 CỘT KÉO-THẢ (ĐÚNG MÀU CHUẨN NHƯ EXCEL) */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 items-start">
        {VEHICLE_COLUMNS.map((col) => {
          const list = vehiclesByColumn[col.id];
          const isOver = dragOverCol === col.id;
          const hiddenOnMobile = !mobileShowAllCols && mobileActiveCol !== col.id;
          return (
            <div
              key={col.id}
              onDragOver={(e) => {
                e.preventDefault();
                if (dragOverCol !== col.id) setDragOverCol(col.id);
              }}
              onDragLeave={() => {
                if (dragOverCol === col.id) setDragOverCol(null);
              }}
              onDrop={(e) => {
                e.preventDefault();
                setDragOverCol(null);
                const id = e.dataTransfer.getData('text/plain') || draggedId;
                if (id) moveVehicle(id, col.id);
                setDraggedId(null);
              }}
              className={`${
                hiddenOnMobile ? 'hidden md:block' : 'block'
              } rounded-2xl border transition-all overflow-hidden bg-white shadow-xs ${
                isOver ? 'border-amber-500 ring-2 ring-amber-300 bg-amber-50/30' : 'border-slate-300'
              }`}
            >
              {/* Header đúng 6 màu chuẩn như Excel */}
              {(() => {
                const nnList = list.filter((v) => v.group === 'nguyen_nguyen');
                const extList = list.filter((v) => v.group === 'external');
                return (
                  <>
                    <div className={`border-b px-2.5 py-2.5 text-center ${COLUMN_HEADER_CLASSES[col.id]}`}>
                      <div className="text-xs font-black uppercase tracking-tight">
                        {col.label}
                      </div>
                      <div className="mt-0.5 text-[11px] font-black">
                        {nnList.length} NN · {extList.length} Ngoài ({list.length} PT)
                      </div>
                    </div>

                    {/* Danh sách phương tiện trong cột — Tách riêng 2 nhóm: Nguyên Nguyên & PT Ngoài */}
                    <div className="min-h-[260px] p-2 space-y-2.5">
                      {list.length === 0 ? (
                        <div className="flex h-32 items-center justify-center rounded-xl border border-dashed border-slate-200 text-[11px] font-medium text-slate-400">
                          Kéo phương tiện vào đây
                        </div>
                      ) : (
                        <>
                          {nnList.length > 0 && (
                            <div className="space-y-1.5">
                              <div className="flex items-center justify-between rounded-lg border border-red-200 bg-red-50 px-2 py-1 text-[10px] font-black uppercase text-red-800">
                                <span>🚢 PT (Nguyên Nguyên)</span>
                                <span className="rounded-full bg-red-600 px-1.5 py-0.2 text-white">
                                  {nnList.length}
                                </span>
                              </div>
                              {nnList.map((item, idx) => renderVehicleCard(item, idx, col.id))}
                            </div>
                          )}

                          {extList.length > 0 && (
                            <div className="space-y-1.5">
                              <div className="flex items-center justify-between rounded-lg border border-sky-200 bg-sky-50 px-2 py-1 text-[10px] font-black uppercase text-sky-900">
                                <span>⚓ PT (Ngoài)</span>
                                <span className="rounded-full bg-sky-600 px-1.5 py-0.2 text-white">
                                  {extList.length}
                                </span>
                              </div>
                              {extList.map((item, idx) => renderVehicleCard(item, idx, col.id))}
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  </>
                );
              })()}
            </div>
          );
        })}
      </div>

      {/* Modal chuyển nhanh cột trên điện thoại (1 chạm) */}
      {movingItem && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/50 p-3 backdrop-blur-2xs"
          onClick={() => setMovingItem(null)}
        >
          <div
            className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-5 shadow-xl space-y-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-[11px] font-bold uppercase text-slate-400">Chuyển trạng thái phương tiện</p>
                <h3 className={`text-base font-black ${movingItem.group === 'nguyen_nguyen' ? 'text-red-700' : 'text-sky-900'}`}>
                  {movingItem.name}
                </h3>
                <p className="text-xs text-slate-500">
                  {movingItem.capacityTons}T · Chở {getEffectiveCapacityRange(movingItem.capacityTons).minTons}–
                  {getEffectiveCapacityRange(movingItem.capacityTons).maxTons}T
                </p>
              </div>
              <button
                type="button"
                onClick={() => setMovingItem(null)}
                className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-600 cursor-pointer"
              >
                Đóng
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2.5 pt-1">
              {VEHICLE_COLUMNS.map((col) => {
                const isCurrent = movingItem.columnId === col.id;
                return (
                  <button
                    key={col.id}
                    type="button"
                    onClick={() => {
                      moveVehicle(movingItem.id, col.id);
                      setMobileActiveCol(col.id);
                      setMovingItem(null);
                    }}
                    className={`rounded-2xl border-2 px-3 py-3 text-left transition-all cursor-pointer ${
                      COLUMN_HEADER_CLASSES[col.id]
                    } ${isCurrent ? 'ring-2 ring-slate-900' : 'opacity-90 active:scale-95'}`}
                  >
                    <div className="text-xs font-black uppercase leading-tight">
                      {isCurrent ? '✓ ' : ''}
                      {col.label}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Modal sửa ghi chú / tên phương tiện */}
      {editingItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-2xs">
          <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-6 shadow-xl">
            <h3 className="text-base font-black text-slate-900">
              Cập nhật thông tin phương tiện
            </h3>
            <form onSubmit={handleSaveEdit} className="mt-4 space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Tên phương tiện
                </label>
                <input
                  type="text"
                  value={editName}
                  disabled={editingItem.group === 'nguyen_nguyen'}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-sm font-bold text-slate-900 disabled:opacity-60"
                />
                {editingItem.group === 'nguyen_nguyen' && (
                  <p className="mt-1 text-[11px] text-slate-400">
                    25 chiếc NGUYÊN NGUYÊN giữ nguyên tên chuẩn công ty.
                  </p>
                )}
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Ghi chú (vd: Xin nghỉ phép đến hết 30/11/2026)
                </label>
                <input
                  type="text"
                  value={editNote}
                  onChange={(e) => setEditNote(e.target.value)}
                  placeholder="Nhập ghi chú nếu có..."
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-amber-500 focus:outline-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Tải trọng tàu (tấn)
                  </label>
                  <input
                    type="number"
                    min={10}
                    value={editCapacity}
                    onChange={(e) => setEditCapacity(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-slate-900 focus:border-amber-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Số đăng ký (nếu có)
                  </label>
                  <input
                    type="text"
                    value={editRegNumber}
                    onChange={(e) => setEditRegNumber(e.target.value)}
                    placeholder="ĐT-21714..."
                    className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-amber-500 focus:outline-none"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingItem(null)}
                  className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="rounded-xl bg-amber-600 px-4 py-2 text-xs font-bold text-white hover:bg-amber-700 cursor-pointer"
                >
                  Lưu thay đổi
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
        </>
      )}
    </div>
  );
}
