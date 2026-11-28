'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  VEHICLE_COLUMNS,
  createEmptyDailyPlan,
  getEffectiveCapacityRange,
} from '@/lib/vehicle-board/defaults';
import { buildDailyPlanExcelBuffer } from '@/lib/vehicle-board/export-plan-excel';
import { parseDailyPlanFromExcelPaste } from '@/lib/vehicle-board/parse-plan-tsv';
import {
  DailyIntakePlan,
  DailyPlanRow,
  VehicleColumnId,
  VehicleItem,
} from '@/lib/vehicle-board/types';

interface DailyIntakePlanViewProps {
  planDate: string;
  onChangeDate: (nextDate: string) => void;
  vehicles: VehicleItem[];
  onSyncVehiclesToColumns: (assignments: { vehicleId: string; columnId: VehicleColumnId }[]) => void;
}

function formatDateVNLabel(dateStr: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr;
  const [y, m, d] = dateStr.split('-');
  return `${d}/${m}/${y}`;
}

function inferTargetColumn(riceType: string): VehicleColumnId {
  const up = riceType.toUpperCase();
  if (up.includes('GẠO') || up.includes('GAO')) return 'pt_nhan_gao';
  if (up.includes('KHÔ') || up.includes('KHO')) return 'pt_nhan_lua_kho';
  if (up.includes('TĂNG BO') || up.includes('TANG BO')) return 'pt_tang_bo';
  return 'pt_nhan_lua_tuoi';
}

export default function DailyIntakePlanView({
  planDate,
  onChangeDate,
  vehicles,
  onSyncVehiclesToColumns,
}: DailyIntakePlanViewProps) {
  const [plan, setPlan] = useState<DailyIntakePlan>(() => createEmptyDailyPlan(planDate));
  const [inheritedFromDate, setInheritedFromDate] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  // Modal chọn phương tiện cho 1 dòng
  const [pickingRowId, setPickingRowId] = useState<string | null>(null);
  const [pickerSearch, setPickerSearch] = useState('');

  // Modal dán dữ liệu từ Excel
  const [showPasteModal, setShowPasteModal] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [pasteMode, setPasteMode] = useState<'replace' | 'append'>('replace');

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rowSeqRef = useRef(2);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/vehicle-board/plan?date=${planDate}`, { cache: 'no-store' })
      .then((res) => res.json().then((data) => ({ ok: res.ok, data })))
      .then(({ ok, data }) => {
        if (cancelled) return;
        if (!ok || !data.success || !data.data) {
          throw new Error(data.error || 'Không thể tải kế hoạch nhận hàng');
        }
        setInheritedFromDate(data.inheritedFromDate || null);
        setPlan(data.data as DailyIntakePlan);
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
  }, [planDate]);

  const handleDateChange = (nextDate: string) => {
    if (!nextDate || nextDate === planDate) return;
    setIsLoading(true);
    setError(null);
    setSyncMessage(null);
    setInheritedFromDate(null);
    onChangeDate(nextDate);
  };

  const persistPlan = (nextPlan: DailyIntakePlan, immediate = false) => {
    setPlan(nextPlan);
    setSaveStatus('saving');
    setError(null);

    const doSave = async () => {
      try {
        const res = await fetch('/api/vehicle-board/plan', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ plan: nextPlan }),
        });
        const data = (await res.json()) as { success?: boolean; error?: string };
        if (!res.ok || !data.success) {
          throw new Error(data.error || 'Lỗi lưu kế hoạch');
        }
        setInheritedFromDate(null);
        setSaveStatus('saved');
      } catch (err: unknown) {
        setSaveStatus('error');
        setError(err instanceof Error ? err.message : 'Không thể lưu kế hoạch');
      }
    };

    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    if (immediate) {
      void doSave();
    } else {
      saveTimerRef.current = setTimeout(() => {
        void doSave();
      }, 350);
    }
  };

  const vehicleMap = useMemo(() => new Map(vehicles.map((v) => [v.id, v])), [vehicles]);

  // Bản đồ kiểm tra phương tiện nào đã được gán ở dòng nào trong ngày
  const assignedRowByVehicle = useMemo(() => {
    const map = new Map<string, { rowId: string; rowIndex: number; supplier: string }>();
    plan.rows.forEach((r, idx) => {
      for (const vid of r.vehicleIds) {
        map.set(vid, { rowId: r.id, rowIndex: idx + 1, supplier: r.supplier });
      }
    });
    return map;
  }, [plan.rows]);

  const updateRow = (rowId: string, patch: Partial<DailyPlanRow>) => {
    const oldRow = plan.rows.find((r) => r.id === rowId);
    const nextRows = plan.rows.map((r) => (r.id === rowId ? { ...r, ...patch } : r));
    persistPlan({ ...plan, rows: nextRows });

    if (
      oldRow &&
      patch.riceType !== undefined &&
      oldRow.vehicleIds.length > 0 &&
      inferTargetColumn(patch.riceType) !== inferTargetColumn(oldRow.riceType)
    ) {
      const nextCol = inferTargetColumn(patch.riceType);
      onSyncVehiclesToColumns(oldRow.vehicleIds.map((vid) => ({ vehicleId: vid, columnId: nextCol })));
    }
  };

  const addRow = () => {
    rowSeqRef.current += 1;
    const newRow: DailyPlanRow = {
      id: `plan-${planDate}-${rowSeqRef.current}-${plan.rows.length + 1}`,
      kcs: '',
      supplier: '',
      contractNo: '',
      riceType: '',
      quantityKg: 0,
      pricePerKg: 0,
      location: '',
      note: '',
      vehicleIds: [],
    };
    persistPlan({ ...plan, rows: [...plan.rows, newRow] }, true);
  };

  const removeRow = (rowId: string) => {
    const targetRow = plan.rows.find((r) => r.id === rowId);
    if (targetRow && targetRow.vehicleIds.length > 0) {
      onSyncVehiclesToColumns(
        targetRow.vehicleIds.map((vid) => ({ vehicleId: vid, columnId: 'pt_trong' }))
      );
    }

    if (plan.rows.length <= 1) {
      updateRow(rowId, {
        kcs: '',
        supplier: '',
        contractNo: '',
        riceType: '',
        quantityKg: 0,
        pricePerKg: 0,
        location: '',
        note: '',
        vehicleIds: [],
        receiveNote: '',
      });
      return;
    }
    persistPlan({ ...plan, rows: plan.rows.filter((r) => r.id !== rowId) }, true);
  };

  const toggleVehicleInRow = (rowId: string, vehicleId: string) => {
    const targetRow = plan.rows.find((r) => r.id === rowId);
    if (!targetRow) return;

    const alreadyInThisRow = targetRow.vehicleIds.includes(vehicleId);
    if (alreadyInThisRow) {
      updateRow(rowId, {
        vehicleIds: targetRow.vehicleIds.filter((id) => id !== vehicleId),
      });
      onSyncVehiclesToColumns([{ vehicleId, columnId: 'pt_trong' }]);
      return;
    }

    const existingOwner = assignedRowByVehicle.get(vehicleId);
    if (existingOwner && existingOwner.rowId !== rowId) {
      const vName = vehicleMap.get(vehicleId)?.name || vehicleId;
      setError(
        `Phương tiện "${vName}" đã được gán cho dòng #${existingOwner.rowIndex} (${
          existingOwner.supplier || 'chưa ghi NCC'
        }). Mỗi phương tiện chỉ đi 1 nơi!`
      );
      return;
    }

    updateRow(rowId, {
      vehicleIds: [...targetRow.vehicleIds, vehicleId],
    });
    const targetCol = inferTargetColumn(targetRow.riceType);
    onSyncVehiclesToColumns([{ vehicleId, columnId: targetCol }]);
  };

  const handleSyncToBoard = () => {
    const assignments: { vehicleId: string; columnId: VehicleColumnId }[] = [];
    for (const row of plan.rows) {
      if (row.vehicleIds.length === 0) continue;
      const targetCol = inferTargetColumn(row.riceType);
      for (const vid of row.vehicleIds) {
        assignments.push({ vehicleId: vid, columnId: targetCol });
      }
    }
    if (assignments.length === 0) {
      setError('Chưa có phương tiện nào được gán trong kế hoạch hôm nay để đồng bộ.');
      return;
    }
    onSyncVehiclesToColumns(assignments);
    setSyncMessage(
      `Đã đồng bộ ${assignments.length} phương tiện từ Kế hoạch ngày ${planDate} sang Bảng 6 Cột!`
    );
  };

  const handleExportExcel = async () => {
    const buf = await buildDailyPlanExcelBuffer(plan, vehicles);
    const blob = new Blob([buf.buffer as ArrayBuffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `KeHoachNhanHang_${planDate}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleApplyPaste = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = parseDailyPlanFromExcelPaste(pasteText, planDate);
    if (parsed.length === 0) {
      setError('Không đọc được dòng dữ liệu hợp lệ nào. Hãy copy nguyên bảng từ Excel rồi dán vào.');
      return;
    }

    const baseRows =
      pasteMode === 'append'
        ? plan.rows.filter(
            (r) => r.kcs || r.supplier || r.riceType || r.quantityKg > 0 || r.note || r.vehicleIds.length > 0
          )
        : [];
    const nextRows = [...baseRows, ...parsed];
    persistPlan({ ...plan, rows: nextRows }, true);
    setShowPasteModal(false);
    setPasteText('');
    setSyncMessage(`Đã nạp ${parsed.length} dòng từ Excel vào kế hoạch ngày ${planDate}!`);
  };

  const totals = useMemo(() => {
    let totalKg = 0;
    let totalMoney = 0;
    let totalAssignedVehicles = 0;
    for (const r of plan.rows) {
      totalKg += r.quantityKg || 0;
      totalMoney += (r.quantityKg || 0) * (r.pricePerKg || 0);
      totalAssignedVehicles += r.vehicleIds.length;
    }
    return { totalKg, totalMoney, totalAssignedVehicles };
  }, [plan.rows]);

  const pickingRow = useMemo(
    () => plan.rows.find((r) => r.id === pickingRowId) || null,
    [plan.rows, pickingRowId]
  );

  // Sắp xếp danh sách phương tiện khi chọn: ưu tiên PT TRỐNG -> PT CHỜ -> khác
  const sortedVehiclesForPicker = useMemo(() => {
    const colPriority: Record<VehicleColumnId, number> = {
      pt_trong: 0,
      pt_cho: 1,
      pt_tang_bo: 2,
      pt_nhan_lua_tuoi: 3,
      pt_nhan_lua_kho: 4,
      pt_nhan_gao: 5,
    };
    const q = pickerSearch.trim().toLowerCase();
    return vehicles
      .filter((v) => {
        if (!q) return true;
        return `${v.name} ${v.regNumber || ''} ${v.capacityTons}`.toLowerCase().includes(q);
      })
      .sort((a, b) => {
        const pa = colPriority[a.columnId] ?? 9;
        const pb = colPriority[b.columnId] ?? 9;
        if (pa !== pb) return pa - pb;
        return a.name.localeCompare(b.name, 'vi');
      });
  }, [vehicles, pickerSearch]);

  return (
    <div className="space-y-4">
      {/* Thanh điều khiển kế hoạch ngày */}
      <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-xs">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-800">
                <span>📋</span>
                <span>Kế Hoạch Nhận Hàng Hằng Ngày</span>
              </span>
              <span className="rounded-full bg-amber-50 border border-amber-200 px-2.5 py-0.5 text-[11px] font-bold text-amber-800">
                Quy chuẩn chở: 80% – 85% tải trọng tàu
              </span>
              {saveStatus === 'saving' && (
                <span className="text-xs font-bold text-amber-600 animate-pulse">⏳ Đang lưu...</span>
              )}
              {saveStatus === 'saved' && (
                <span className="text-xs font-bold text-emerald-700">✅ Đã lưu ngày {formatDateVNLabel(planDate)}</span>
              )}
              {inheritedFromDate && (
                <span className="rounded-full bg-indigo-50 border border-indigo-200 px-2.5 py-0.5 text-[11px] font-bold text-indigo-700">
                  📋 Lấy từ ngày {formatDateVNLabel(inheritedFromDate)} (sửa ở đây không đổi ngày cũ)
                </span>
              )}
            </div>
            <h2 className="mt-2 text-lg sm:text-xl font-black text-slate-900">
              Điều Phối Phương Tiện Nhận Hàng Ngày {formatDateVNLabel(planDate)}
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Gán tàu/ghe nhận hàng cho từng nhà cung cấp, tự động kiểm tra sức chở thực tế (80–85%), chống trùng tàu trong ngày và đồng bộ sang Bảng 6 Cột.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-1.5 rounded-xl border border-slate-300 bg-slate-50 px-3 py-1.5 text-xs font-bold text-slate-800">
              <span>📅 Ngày:</span>
              <input
                type="date"
                value={planDate}
                onChange={(e) => handleDateChange(e.target.value)}
                className="bg-transparent font-black text-slate-900 focus:outline-none"
              />
            </label>

            <button
              type="button"
              onClick={() => {
                setPasteText('');
                setShowPasteModal(true);
              }}
              className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3.5 py-2 text-xs font-bold text-white shadow-xs hover:bg-indigo-700 transition cursor-pointer"
              title="Copy bảng từ Excel rồi dán nhanh vào đây"
            >
              <span>📋</span>
              <span>Dán từ Excel</span>
            </button>

            <button
              type="button"
              onClick={handleSyncToBoard}
              className="inline-flex items-center gap-1.5 rounded-xl bg-amber-600 px-3.5 py-2 text-xs font-bold text-white shadow-xs hover:bg-amber-700 transition cursor-pointer"
              title="Tự động chuyển các phương tiện đã gán sang cột Nhận Lúa Khô / Tươi trên Bảng 6 Cột"
            >
              <span>🔄</span>
              <span>Đồng bộ sang Bảng 6 Cột</span>
            </button>

            <button
              type="button"
              onClick={handleExportExcel}
              className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-bold text-white shadow-xs hover:bg-emerald-700 transition cursor-pointer"
            >
              <span>📥</span>
              <span>Xuất Excel Kế Hoạch</span>
            </button>
          </div>
        </div>

        {error && (
          <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs font-bold text-rose-800">
            ⚠️ {error}
          </div>
        )}
        {syncMessage && (
          <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-xs font-bold text-emerald-800">
            ✅ {syncMessage}
          </div>
        )}
      </div>

      {/* Bảng Kế Hoạch Nhận Hàng */}
      <div className="rounded-3xl border border-slate-200 bg-white shadow-xs overflow-hidden">
        {isLoading ? (
          <div className="py-16 text-center text-xs font-semibold text-slate-500">
            Đang tải kế hoạch ngày {planDate}...
          </div>
        ) : (
          <>
          {/* GIAO DIỆN ĐIỆN THOẠI: DẠNG THẺ DỌC DỄ BẤM, KHÔNG CẦN VUỐT NGANG */}
          <div className="md:hidden divide-y divide-slate-200">
            {plan.rows.map((row, idx) => {
              const amount = (row.quantityKg || 0) * (row.pricePerKg || 0);
              const needTons = (row.quantityKg || 0) / 1000;
              const assignedVehicles = row.vehicleIds
                .map((vid) => vehicleMap.get(vid))
                .filter((v): v is VehicleItem => Boolean(v));
              const sumCap = assignedVehicles.reduce((s, v) => s + v.capacityTons, 0);
              const eff = getEffectiveCapacityRange(sumCap);

              let loadStatus: { text: string; cls: string } | null = null;
              if (needTons > 0 && assignedVehicles.length > 0) {
                if (eff.maxTons < needTons) {
                  const lack = Math.ceil(needTons - eff.maxTons);
                  loadStatus = {
                    text: `⚠️ Thiếu ~${lack}T (Chở 80-85%: ${eff.minTons}-${eff.maxTons}T / Cần ${needTons}T)`,
                    cls: 'text-rose-700 bg-rose-50 border-rose-200',
                  };
                } else if (eff.minTons >= needTons) {
                  loadStatus = {
                    text: `✅ Đủ tải (Chở 80-85%: ${eff.minTons}-${eff.maxTons}T / Cần ${needTons}T)`,
                    cls: 'text-emerald-700 bg-emerald-50 border-emerald-200',
                  };
                } else {
                  loadStatus = {
                    text: `🟡 Vừa sát tải (Chở 80-85%: ${eff.minTons}-${eff.maxTons}T / Cần ${needTons}T)`,
                    cls: 'text-amber-800 bg-amber-50 border-amber-200',
                  };
                }
              }

              return (
                <div key={`m-${row.id}`} className="p-3.5 space-y-2.5 bg-white">
                  <div className="flex items-center justify-between gap-2">
                    <span className="rounded-lg bg-slate-900 px-2.5 py-0.5 text-xs font-black text-white">
                      #{idx + 1}
                    </span>
                    <button
                      type="button"
                      onClick={() => removeRow(row.id)}
                      className="rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1 text-xs font-bold text-rose-700 cursor-pointer"
                    >
                      🗑️ Xóa
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <span className="text-[10px] font-bold uppercase text-slate-400">KCS</span>
                      <input
                        type="text"
                        value={row.kcs}
                        onChange={(e) => updateRow(row.id, { kcs: e.target.value })}
                        placeholder="KCS..."
                        className="mt-0.5 w-full rounded-xl border border-slate-200 px-2.5 py-2 text-xs font-bold uppercase"
                      />
                    </div>
                    <div>
                      <span className="text-[10px] font-bold uppercase text-slate-400">Số HĐ</span>
                      <input
                        type="text"
                        value={row.contractNo}
                        onChange={(e) => updateRow(row.id, { contractNo: e.target.value })}
                        placeholder="03 Vụ..."
                        className="mt-0.5 w-full rounded-xl border border-slate-200 px-2.5 py-2 text-xs"
                      />
                    </div>
                    <div className="col-span-2">
                      <span className="text-[10px] font-bold uppercase text-slate-400">Nhà Cung Cấp</span>
                      <input
                        type="text"
                        value={row.supplier}
                        onChange={(e) => updateRow(row.id, { supplier: e.target.value })}
                        placeholder="Nhà cung cấp..."
                        className="mt-0.5 w-full rounded-xl border border-slate-200 px-2.5 py-2 text-xs font-bold uppercase"
                      />
                    </div>
                    <div>
                      <span className="text-[10px] font-bold uppercase text-slate-400">Loại Lúa</span>
                      <input
                        type="text"
                        value={row.riceType}
                        onChange={(e) => updateRow(row.id, { riceType: e.target.value })}
                        placeholder="OM18 TƯƠI..."
                        className="mt-0.5 w-full rounded-xl border border-slate-200 px-2.5 py-2 text-xs font-bold uppercase"
                      />
                    </div>
                    <div>
                      <span className="text-[10px] font-bold uppercase text-slate-400">Số Lượng (KG)</span>
                      <input
                        type="number"
                        min={0}
                        step={1000}
                        value={row.quantityKg || ''}
                        onChange={(e) =>
                          updateRow(row.id, { quantityKg: parseFloat(e.target.value) || 0 })
                        }
                        placeholder="0"
                        className="mt-0.5 w-full rounded-xl border border-slate-200 px-2.5 py-2 text-right font-mono text-xs font-bold text-rose-700"
                      />
                    </div>
                    <div>
                      <span className="text-[10px] font-bold uppercase text-slate-400">Giá Hết Phí</span>
                      <input
                        type="number"
                        min={0}
                        step={10}
                        value={row.pricePerKg || ''}
                        onChange={(e) =>
                          updateRow(row.id, { pricePerKg: parseFloat(e.target.value) || 0 })
                        }
                        placeholder="0"
                        className="mt-0.5 w-full rounded-xl border border-slate-200 px-2.5 py-2 text-right font-mono text-xs font-bold text-rose-700"
                      />
                    </div>
                    <div className="flex flex-col justify-end rounded-xl bg-slate-50 px-2.5 py-2 text-right">
                      <span className="text-[10px] font-bold uppercase text-slate-400">Thành Tiền</span>
                      <span className="font-mono text-xs font-black text-slate-900">
                        {amount > 0 ? `${amount.toLocaleString('vi-VN')} đ` : '—'}
                      </span>
                    </div>
                    <div className="col-span-2">
                      <span className="text-[10px] font-bold uppercase text-slate-400">Địa Điểm</span>
                      <input
                        type="text"
                        value={row.location}
                        onChange={(e) => updateRow(row.id, { location: e.target.value })}
                        placeholder="Kênh / Xã / Tỉnh..."
                        className="mt-0.5 w-full rounded-xl border border-slate-200 px-2.5 py-2 text-xs"
                      />
                    </div>
                  </div>

                  {/* Khối Phương Tiện Nhận Hàng nổi bật trên điện thoại */}
                  <div className="rounded-2xl border border-amber-300 bg-yellow-50/70 p-3 space-y-2">
                    <div className="text-[11px] font-black uppercase text-amber-950">
                      🚢 Phương Tiện Nhận Hàng
                    </div>
                    {assignedVehicles.length > 0 && (
                      <div className="space-y-1.5">
                        {assignedVehicles.map((v, vIdx) => {
                          const r = getEffectiveCapacityRange(v.capacityTons);
                          return (
                            <div
                              key={v.id}
                              className={`flex items-center justify-between gap-2 rounded-xl border px-2.5 py-2 text-xs ${
                                v.group === 'nguyen_nguyen'
                                  ? 'border-amber-300 border-l-4 border-l-red-600 bg-amber-50'
                                  : 'border-sky-300 border-l-4 border-l-sky-600 bg-sky-50'
                              }`}
                            >
                              <span
                                className={`font-black truncate ${
                                  v.group === 'nguyen_nguyen' ? 'text-red-700' : 'text-sky-900'
                                }`}
                              >
                                {vIdx + 1}. {v.name} ({r.minTons}–{r.maxTons}T)
                              </span>
                              <button
                                type="button"
                                onClick={() => toggleVehicleInRow(row.id, v.id)}
                                className="rounded-lg bg-white px-2 py-1 text-xs font-bold text-rose-600 border border-rose-200 cursor-pointer"
                              >
                                ✕
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {loadStatus && (
                      <div className={`rounded-xl border px-2.5 py-1.5 text-[11px] font-bold ${loadStatus.cls}`}>
                        {loadStatus.text}
                      </div>
                    )}

                    <button
                      type="button"
                      onClick={() => {
                        setPickingRowId(row.id);
                        setPickerSearch('');
                      }}
                      className="w-full rounded-xl bg-amber-600 py-2.5 text-xs font-black text-white shadow-2xs active:bg-amber-700 cursor-pointer"
                    >
                      + Chọn Phương Tiện Nhận Hàng
                    </button>

                    <input
                      type="text"
                      value={row.receiveNote || ''}
                      onChange={(e) => updateRow(row.id, { receiveNote: e.target.value })}
                      placeholder="Ghi chú nhận hàng (điền tay)..."
                      className="w-full rounded-xl border border-amber-200 bg-white px-3 py-2 text-xs text-slate-900"
                    />
                  </div>
                </div>
              );
            })}

            {/* Tổng cộng & Thêm dòng trên điện thoại */}
            <div className="bg-slate-100 p-4 space-y-2.5">
              <div className="flex items-center justify-between text-xs font-black">
                <span>TỔNG ({plan.rows.length} dòng):</span>
                <span className="font-mono text-rose-700">
                  {totals.totalKg.toLocaleString('vi-VN')} kg · {totals.totalMoney.toLocaleString('vi-VN')} đ
                </span>
              </div>
              <button
                type="button"
                onClick={addRow}
                className="w-full rounded-xl bg-slate-900 py-2.5 text-xs font-black text-white cursor-pointer"
              >
                + Thêm dòng kế hoạch
              </button>
            </div>
          </div>

          {/* GIAO DIỆN MÁY TÍNH: BẢNG 13 CỘT */}
          <div className="hidden md:block overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-xs">
              <thead className="bg-slate-50 text-[11px] font-black uppercase text-slate-700">
                <tr>
                  <th className="px-2 py-3 text-center w-10">STT</th>
                  <th className="px-2 py-3 text-left w-24">KCS</th>
                  <th className="px-2 py-3 text-left min-w-[150px]">Nhà Cung Cấp</th>
                  <th className="px-2 py-3 text-left w-28">Số HĐ</th>
                  <th className="px-2 py-3 text-left w-36">Loại Lúa</th>
                  <th className="px-2 py-3 text-right w-28">Số Lượng (KG)</th>
                  <th className="px-2 py-3 text-right w-24 text-rose-700">Giá Hết Phí</th>
                  <th className="px-2 py-3 text-right w-32">Thành Tiền</th>
                  <th className="px-2 py-3 text-left min-w-[180px]">Địa Điểm</th>
                  <th className="px-2 py-3 text-left w-36">Ghi Chú</th>
                  <th className="px-2.5 py-3 text-center min-w-[230px] bg-yellow-300 text-slate-950 border-l border-slate-300">
                    Phương Tiện Nhận Hàng
                  </th>
                  <th className="px-2.5 py-3 text-center min-w-[180px] bg-yellow-200 text-slate-950 border-l border-slate-300">
                    Ghi Chú Nhận Hàng
                  </th>
                  <th className="px-2 py-3 w-10" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {plan.rows.map((row, idx) => {
                  const amount = (row.quantityKg || 0) * (row.pricePerKg || 0);
                  const needTons = (row.quantityKg || 0) / 1000;
                  const assignedVehicles = row.vehicleIds
                    .map((vid) => vehicleMap.get(vid))
                    .filter((v): v is VehicleItem => Boolean(v));
                  const sumCap = assignedVehicles.reduce((s, v) => s + v.capacityTons, 0);
                  const eff = getEffectiveCapacityRange(sumCap);

                  let loadStatus: { text: string; cls: string } | null = null;
                  if (needTons > 0 && assignedVehicles.length > 0) {
                    if (eff.maxTons < needTons) {
                      const lack = Math.ceil(needTons - eff.maxTons);
                      loadStatus = {
                        text: `⚠️ Thiếu ~${lack}T (Chở 80-85%: ${eff.minTons}-${eff.maxTons}T / Cần ${needTons}T)`,
                        cls: 'text-rose-700 bg-rose-50 border-rose-200',
                      };
                    } else if (eff.minTons >= needTons) {
                      loadStatus = {
                        text: `✅ Đủ tải (Chở 80-85%: ${eff.minTons}-${eff.maxTons}T / Cần ${needTons}T)`,
                        cls: 'text-emerald-700 bg-emerald-50 border-emerald-200',
                      };
                    } else {
                      loadStatus = {
                        text: `🟡 Vừa sát tải (Chở 80-85%: ${eff.minTons}-${eff.maxTons}T / Cần ${needTons}T)`,
                        cls: 'text-amber-800 bg-amber-50 border-amber-200',
                      };
                    }
                  }

                  return (
                    <tr key={row.id} className="hover:bg-slate-50/70 align-top">
                      <td className="px-2 py-2.5 text-center font-bold text-slate-500">{idx + 1}</td>
                      <td className="px-1.5 py-2">
                        <input
                          type="text"
                          value={row.kcs}
                          onChange={(e) => updateRow(row.id, { kcs: e.target.value })}
                          placeholder="KCS..."
                          className="w-full rounded-lg border border-slate-200 px-2 py-1 text-xs font-bold uppercase focus:border-amber-500 focus:outline-none"
                        />
                      </td>
                      <td className="px-1.5 py-2">
                        <input
                          type="text"
                          value={row.supplier}
                          onChange={(e) => updateRow(row.id, { supplier: e.target.value })}
                          placeholder="Nhà cung cấp..."
                          className="w-full rounded-lg border border-slate-200 px-2 py-1 text-xs font-semibold uppercase focus:border-amber-500 focus:outline-none"
                        />
                      </td>
                      <td className="px-1.5 py-2">
                        <input
                          type="text"
                          value={row.contractNo}
                          onChange={(e) => updateRow(row.id, { contractNo: e.target.value })}
                          placeholder="03 Vụ..."
                          className="w-full rounded-lg border border-slate-200 px-2 py-1 text-xs focus:border-amber-500 focus:outline-none"
                        />
                      </td>
                      <td className="px-1.5 py-2">
                        <input
                          type="text"
                          value={row.riceType}
                          onChange={(e) => updateRow(row.id, { riceType: e.target.value })}
                          placeholder="OM18 TƯƠI..."
                          className="w-full rounded-lg border border-slate-200 px-2 py-1 text-xs font-semibold uppercase focus:border-amber-500 focus:outline-none"
                        />
                      </td>
                      <td className="px-1.5 py-2">
                        <input
                          type="number"
                          min={0}
                          step={1000}
                          value={row.quantityKg || ''}
                          onChange={(e) =>
                            updateRow(row.id, { quantityKg: parseFloat(e.target.value) || 0 })
                          }
                          placeholder="0"
                          className="w-full rounded-lg border border-slate-200 px-2 py-1 text-right font-mono font-bold text-rose-700 focus:border-amber-500 focus:outline-none"
                        />
                      </td>
                      <td className="px-1.5 py-2">
                        <input
                          type="number"
                          min={0}
                          step={10}
                          value={row.pricePerKg || ''}
                          onChange={(e) =>
                            updateRow(row.id, { pricePerKg: parseFloat(e.target.value) || 0 })
                          }
                          placeholder="0"
                          className="w-full rounded-lg border border-slate-200 px-2 py-1 text-right font-mono font-bold text-rose-700 focus:border-amber-500 focus:outline-none"
                        />
                      </td>
                      <td className="px-2 py-2.5 text-right font-mono font-bold text-slate-900 whitespace-nowrap">
                        {amount > 0 ? amount.toLocaleString('vi-VN') : '—'}
                      </td>
                      <td className="px-1.5 py-2">
                        <input
                          type="text"
                          value={row.location}
                          onChange={(e) => updateRow(row.id, { location: e.target.value })}
                          placeholder="Kênh / Xã / Tỉnh..."
                          className="w-full rounded-lg border border-slate-200 px-2 py-1 text-xs focus:border-amber-500 focus:outline-none"
                        />
                      </td>
                      <td className="px-1.5 py-2">
                        <input
                          type="text"
                          value={row.note}
                          onChange={(e) => updateRow(row.id, { note: e.target.value })}
                          placeholder="Ghi chú..."
                          className="w-full rounded-lg border border-slate-200 px-2 py-1 text-xs text-rose-700 font-semibold focus:border-amber-500 focus:outline-none"
                        />
                      </td>
                      <td className="px-2 py-2 border-l border-slate-200 bg-yellow-50/40 space-y-1.5">
                        {assignedVehicles.length > 0 && (
                          <div className="space-y-1">
                            {assignedVehicles.map((v, vIdx) => {
                              const r = getEffectiveCapacityRange(v.capacityTons);
                              return (
                                <div
                                  key={v.id}
                                  className={`flex items-center justify-between gap-1 rounded-lg border px-2 py-1 text-[11px] ${
                                    v.group === 'nguyen_nguyen'
                                      ? 'border-amber-300 border-l-4 border-l-red-600 bg-amber-50/80'
                                      : 'border-sky-300 border-l-4 border-l-sky-600 bg-sky-50/80'
                                  }`}
                                >
                                  <span
                                    className={`font-black truncate ${
                                      v.group === 'nguyen_nguyen' ? 'text-red-700' : 'text-sky-900'
                                    }`}
                                  >
                                    {vIdx + 1}. {v.name}{' '}
                                    <span className="font-semibold text-slate-600">
                                      ({r.minTons}–{r.maxTons}T)
                                    </span>
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => toggleVehicleInRow(row.id, v.id)}
                                    className="text-rose-500 hover:text-rose-800 font-bold cursor-pointer"
                                    title="Bỏ phương tiện này khỏi dòng"
                                  >
                                    ✕
                                  </button>
                                </div>
                              );
                            })}
                          </div>
                        )}

                        {loadStatus && (
                          <div className={`rounded-lg border px-2 py-1 text-[10px] font-bold ${loadStatus.cls}`}>
                            {loadStatus.text}
                          </div>
                        )}

                        <button
                          type="button"
                          onClick={() => {
                            setPickingRowId(row.id);
                            setPickerSearch('');
                          }}
                          className="w-full rounded-lg border border-dashed border-amber-400 bg-white px-2 py-1 text-[11px] font-bold text-amber-800 hover:bg-amber-50 transition cursor-pointer"
                        >
                          + Chọn PT nhận hàng
                        </button>
                      </td>
                      <td className="px-1.5 py-2 border-l border-slate-200 bg-yellow-50/30">
                        <textarea
                          rows={2}
                          value={row.receiveNote || ''}
                          onChange={(e) => updateRow(row.id, { receiveNote: e.target.value })}
                          placeholder="Ghi chú nhận hàng..."
                          className="w-full rounded-lg border border-amber-200 bg-white px-2 py-1 text-xs text-slate-900 focus:border-amber-500 focus:outline-none resize-y"
                        />
                      </td>
                      <td className="px-1.5 py-2 text-center">
                        <button
                          type="button"
                          onClick={() => removeRow(row.id)}
                          className="rounded-lg p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600 cursor-pointer"
                          title="Xóa dòng"
                        >
                          🗑️
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="bg-slate-100 border-t-2 border-slate-300 font-black text-xs">
                  <td colSpan={5} className="px-3 py-3 text-right uppercase text-slate-800">
                    TỔNG CỘNG ({plan.rows.length} dòng):
                  </td>
                  <td className="px-2 py-3 text-right font-mono text-rose-700">
                    {totals.totalKg.toLocaleString('vi-VN')}
                  </td>
                  <td className="px-2 py-3" />
                  <td className="px-2 py-3 text-right font-mono text-slate-900">
                    {totals.totalMoney.toLocaleString('vi-VN')}
                  </td>
                  <td colSpan={2} className="px-3 py-3 text-left text-slate-600 font-semibold">
                    Đã điều {totals.totalAssignedVehicles} lượt phương tiện
                  </td>
                  <td colSpan={3} className="px-2 py-2 text-right">
                    <button
                      type="button"
                      onClick={addRow}
                      className="rounded-xl bg-slate-900 px-3 py-1.5 text-xs font-bold text-white hover:bg-slate-800 cursor-pointer"
                    >
                      + Thêm dòng
                    </button>
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
          </>
        )}
      </div>

      {/* Modal chọn phương tiện cho dòng kế hoạch */}
      {pickingRow && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-2xs">
          <div className="flex max-h-[85vh] w-full max-w-2xl flex-col rounded-3xl border border-slate-200 bg-white p-5 shadow-xl">
            <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-black text-slate-900">
                  Chọn Phương Tiện Nhận Hàng — {pickingRow.supplier || 'Dòng kế hoạch'}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Cần chở:{' '}
                  <strong className="text-rose-700">
                    {((pickingRow.quantityKg || 0) / 1000).toLocaleString('vi-VN')} tấn
                  </strong>{' '}
                  · Loại lúa: <strong>{pickingRow.riceType || '—'}</strong> · Chỉ hiện sức chở thực tế (80%–85%)
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPickingRowId(null)}
                className="rounded-xl border border-slate-200 px-3 py-1 text-xs font-bold text-slate-600 hover:bg-slate-100 cursor-pointer"
              >
                Đóng
              </button>
            </div>

            <div className="my-3">
              <input
                type="text"
                value={pickerSearch}
                onChange={(e) => setPickerSearch(e.target.value)}
                placeholder="Tìm nhanh tên tàu/ghe, biển số, tải trọng..."
                autoFocus
                className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3.5 py-2 text-xs focus:border-amber-500 focus:bg-white focus:outline-none"
              />
            </div>

            <div className="flex-1 overflow-y-auto grid grid-cols-1 sm:grid-cols-2 gap-2 pr-1">
              {sortedVehiclesForPicker.map((v) => {
                const isSelectedHere = pickingRow.vehicleIds.includes(v.id);
                const ownerElsewhere = assignedRowByVehicle.get(v.id);
                const isTaken = Boolean(ownerElsewhere && ownerElsewhere.rowId !== pickingRow.id);
                const eff = getEffectiveCapacityRange(v.capacityTons);
                const colLabel =
                  VEHICLE_COLUMNS.find((c) => c.id === v.columnId)?.shortLabel || v.columnId;

                return (
                  <button
                    key={v.id}
                    type="button"
                    disabled={isTaken}
                    onClick={() => toggleVehicleInRow(pickingRow.id, v.id)}
                    className={`flex items-center justify-between gap-2 rounded-xl border p-2.5 text-left transition-all ${
                      isSelectedHere
                        ? 'border-emerald-500 bg-emerald-50 ring-2 ring-emerald-200 cursor-pointer'
                        : isTaken
                        ? 'border-slate-200 bg-slate-100 opacity-55 cursor-not-allowed'
                        : v.group === 'nguyen_nguyen'
                        ? 'border-amber-300 border-l-4 border-l-red-600 bg-amber-50/70 hover:bg-amber-50 cursor-pointer'
                        : 'border-sky-300 border-l-4 border-l-sky-600 bg-sky-50/70 hover:bg-sky-50 cursor-pointer'
                    }`}
                  >
                    <div className="min-w-0">
                      <div
                        className={`text-xs font-black truncate ${
                          v.group === 'nguyen_nguyen' ? 'text-red-700' : 'text-sky-900'
                        }`}
                      >
                        {isSelectedHere ? '✅ ' : ''}
                        {v.name}
                      </div>
                      <div className="text-[11px] text-slate-600">
                        Tàu {v.capacityTons}T ·{' '}
                        <strong className="text-emerald-700">
                          Chở {eff.minTons}–{eff.maxTons}T
                        </strong>
                        {v.regNumber ? ` · ${v.regNumber}` : ''}
                      </div>
                      {v.note && (
                        <div className="text-[10px] italic text-rose-600 truncate">({v.note})</div>
                      )}
                      {isTaken && ownerElsewhere && (
                        <div className="text-[10px] font-bold text-rose-700">
                          Đã gán dòng #{ownerElsewhere.rowIndex} ({ownerElsewhere.supplier || 'NCC'})
                        </div>
                      )}
                    </div>
                    <span
                      className={`shrink-0 rounded-md px-2 py-0.5 text-[10px] font-bold ${
                        v.columnId === 'pt_trong'
                          ? 'bg-emerald-100 text-emerald-800'
                          : v.columnId === 'pt_cho'
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {colLabel}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Modal Dán Dữ Liệu Từ Excel */}
      {showPasteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-2xs">
          <div className="w-full max-w-2xl rounded-3xl border border-slate-200 bg-white p-6 shadow-xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-base font-black text-slate-900">
                  📋 Dán Nhanh Kế Hoạch Từ Excel
                </h3>
                <p className="mt-1 text-xs text-slate-500">
                  Copy các dòng từ file Excel (gồm các cột STT, KCS, Nhà Cung Cấp, Số HĐ, Loại Lúa, Số Lượng, Giá, Thành Tiền, Địa Điểm, Ghi Chú) rồi bấm Ctrl+V vào ô dưới đây. Hệ thống tự động bỏ dòng tiêu đề/tổng cộng và giữ nguyên cột PT Nhận Hàng + Ghi Chú Nhận Hàng để bạn chọn.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowPasteModal(false)}
                className="rounded-xl border border-slate-200 px-3 py-1 text-xs font-bold text-slate-600 hover:bg-slate-100 cursor-pointer"
              >
                Đóng
              </button>
            </div>

            <form onSubmit={handleApplyPaste} className="mt-4 space-y-3">
              <textarea
                rows={8}
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
                placeholder="Dán dữ liệu copy từ Excel vào đây (Ctrl+V)..."
                autoFocus
                className="w-full rounded-2xl border border-slate-300 bg-slate-50 p-3 font-mono text-xs text-slate-900 focus:border-indigo-500 focus:bg-white focus:outline-none"
              />

              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-4 text-xs font-semibold text-slate-700">
                  <label className="inline-flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="radio"
                      name="pasteMode"
                      checked={pasteMode === 'replace'}
                      onChange={() => setPasteMode('replace')}
                    />
                    <span>Thay thế bảng hiện tại</span>
                  </label>
                  <label className="inline-flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="radio"
                      name="pasteMode"
                      checked={pasteMode === 'append'}
                      onChange={() => setPasteMode('append')}
                    />
                    <span>Thêm nối tiếp vào cuối bảng</span>
                  </label>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowPasteModal(false)}
                    className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 cursor-pointer"
                  >
                    Hủy
                  </button>
                  <button
                    type="submit"
                    disabled={!pasteText.trim()}
                    className="rounded-xl bg-indigo-600 px-5 py-2 text-xs font-bold text-white hover:bg-indigo-700 disabled:opacity-50 cursor-pointer"
                  >
                    Nạp vào bảng
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
