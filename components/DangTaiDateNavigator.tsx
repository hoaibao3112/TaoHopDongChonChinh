'use client';

import React, { useMemo, useState } from 'react';

interface DangTaiDateNavigatorProps {
  selectedDate: string; // YYYY-MM-DD
  todayStr: string;     // YYYY-MM-DD
  onSelectDate: (isoDate: string) => void;
}

const WEEKDAY_LABELS = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];

function parseIso(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

function toIso(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function getMondayOfWeek(d: Date): Date {
  const copy = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const day = copy.getDay(); // 0 = CN, 1 = T2...
  const diff = day === 0 ? -6 : 1 - day;
  copy.setDate(copy.getDate() + diff);
  return copy;
}

function getIsoWeekNumber(d: Date): number {
  const temp = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = temp.getUTCDay() || 7;
  temp.setUTCDate(temp.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(temp.getUTCFullYear(), 0, 1));
  return Math.ceil(((temp.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

export default function DangTaiDateNavigator({
  selectedDate,
  todayStr,
  onSelectDate,
}: DangTaiDateNavigatorProps) {
  const [showMonthGrid, setShowMonthGrid] = useState(false);

  const selectedObj = useMemo(() => parseIso(selectedDate), [selectedDate]);
  const selectedYear = selectedObj.getFullYear();
  const selectedMonth = selectedObj.getMonth() + 1; // 1..12

  // 7 ngày (T2 -> CN) của tuần chứa selectedDate
  const weekDays = useMemo(() => {
    const monday = getMondayOfWeek(selectedObj);
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i);
      const iso = toIso(d);
      const dd = String(d.getDate()).padStart(2, '0');
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      return {
        iso,
        weekday: WEEKDAY_LABELS[i],
        shortDate: `${dd}/${mm}`,
        isToday: iso === todayStr,
        isSelected: iso === selectedDate,
        isOtherMonth: d.getMonth() + 1 !== selectedMonth,
      };
    });
  }, [selectedObj, selectedDate, todayStr, selectedMonth]);

  const weekNum = useMemo(() => getIsoWeekNumber(selectedObj), [selectedObj]);

  // Lưới lịch cả tháng (đủ hàng từ T2 -> CN)
  const monthCells = useMemo(() => {
    const firstOfMonth = new Date(selectedYear, selectedMonth - 1, 1);
    const startMonday = getMondayOfWeek(firstOfMonth);
    const cells: {
      iso: string;
      dayNum: number;
      inMonth: boolean;
      isToday: boolean;
      isSelected: boolean;
    }[] = [];

    for (let i = 0; i < 42; i++) {
      const d = new Date(
        startMonday.getFullYear(),
        startMonday.getMonth(),
        startMonday.getDate() + i
      );
      const iso = toIso(d);
      cells.push({
        iso,
        dayNum: d.getDate(),
        inMonth: d.getMonth() + 1 === selectedMonth,
        isToday: iso === todayStr,
        isSelected: iso === selectedDate,
      });
    }
    // Bỏ hàng cuối nếu toàn bộ thuộc tháng sau
    if (cells.slice(35).every((c) => !c.inMonth)) {
      return cells.slice(0, 35);
    }
    return cells;
  }, [selectedYear, selectedMonth, todayStr, selectedDate]);

  const years = useMemo(() => {
    const base = new Date().getFullYear();
    return [base - 1, base, base + 1];
  }, []);

  const handleShiftWeek = (deltaWeeks: number) => {
    const next = new Date(
      selectedObj.getFullYear(),
      selectedObj.getMonth(),
      selectedObj.getDate() + deltaWeeks * 7
    );
    onSelectDate(toIso(next));
  };

  const handleChangeMonthYear = (newMonth: number, newYear: number) => {
    const maxDay = new Date(newYear, newMonth, 0).getDate();
    const clampedDay = Math.min(selectedObj.getDate(), maxDay);
    onSelectDate(toIso(new Date(newYear, newMonth - 1, clampedDay)));
  };

  return (
    <div className="rounded-3xl border border-slate-200/90 bg-white p-4 shadow-xs space-y-3">
      {/* Hàng 1: Chọn Tháng / Năm / Tuần / Hôm nay / Mở Lịch Tháng */}
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-black text-slate-700 flex items-center gap-1.5">
            <span>🗓️</span>
            <span>Chọn Thời Gian:</span>
          </span>

          {/* Tháng */}
          <select
            value={selectedMonth}
            onChange={(e) => handleChangeMonthYear(Number(e.target.value), selectedYear)}
            className="rounded-xl border border-slate-300 bg-slate-50 px-2.5 py-1.5 text-xs font-bold text-slate-900 focus:border-blue-500 focus:bg-white focus:outline-none cursor-pointer"
          >
            {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
              <option key={m} value={m}>
                Tháng {m}
              </option>
            ))}
          </select>

          {/* Năm */}
          <select
            value={selectedYear}
            onChange={(e) => handleChangeMonthYear(selectedMonth, Number(e.target.value))}
            className="rounded-xl border border-slate-300 bg-slate-50 px-2.5 py-1.5 text-xs font-bold text-slate-900 focus:border-blue-500 focus:bg-white focus:outline-none cursor-pointer"
          >
            {years.map((y) => (
              <option key={y} value={y}>
                Năm {y}
              </option>
            ))}
          </select>

          {/* Điều hướng Tuần */}
          <div className="inline-flex items-center rounded-xl border border-slate-200 bg-slate-50 p-0.5">
            <button
              type="button"
              onClick={() => handleShiftWeek(-1)}
              className="rounded-lg px-2.5 py-1 text-xs font-bold text-slate-700 hover:bg-white hover:shadow-2xs transition cursor-pointer"
              title="Lùi 1 tuần"
            >
              ◀ Tuần trước
            </button>
            <span className="px-2.5 text-xs font-black text-blue-800">
              Tuần {weekNum} ({weekDays[0]?.shortDate} – {weekDays[6]?.shortDate})
            </span>
            <button
              type="button"
              onClick={() => handleShiftWeek(1)}
              className="rounded-lg px-2.5 py-1 text-xs font-bold text-slate-700 hover:bg-white hover:shadow-2xs transition cursor-pointer"
              title="Tiến 1 tuần"
            >
              Tuần sau ▶
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onSelectDate(todayStr)}
            className={`rounded-xl px-3 py-1.5 text-xs font-bold transition cursor-pointer ${
              selectedDate === todayStr
                ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                : 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-2xs'
            }`}
          >
            📍 Hôm Nay
          </button>

          <button
            type="button"
            onClick={() => setShowMonthGrid((prev) => !prev)}
            className={`rounded-xl border px-3 py-1.5 text-xs font-bold transition cursor-pointer ${
              showMonthGrid
                ? 'border-blue-500 bg-blue-50 text-blue-800'
                : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
            }`}
          >
            {showMonthGrid ? '▲ Ẩn Lịch Tháng' : '📅 Xem Lịch Cả Tháng'}
          </button>
        </div>
      </div>

      {/* Hàng 2: 7 ngày trong Tuần (Thứ 2 -> Chủ Nhật) */}
      <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
        {weekDays.map((d) => (
          <button
            key={d.iso}
            type="button"
            onClick={() => onSelectDate(d.iso)}
            className={`flex flex-col items-center justify-center rounded-2xl py-2 px-1 border transition-all cursor-pointer ${
              d.isSelected
                ? 'bg-blue-600 border-blue-600 text-white shadow-md shadow-blue-600/20 scale-[1.02]'
                : d.isToday
                ? 'bg-emerald-50 border-emerald-300 text-emerald-900 hover:bg-emerald-100'
                : 'bg-slate-50/70 border-slate-200 text-slate-700 hover:bg-slate-100'
            }`}
          >
            <span
              className={`text-[10px] font-bold uppercase ${
                d.isSelected ? 'text-blue-100' : d.isToday ? 'text-emerald-700' : 'text-slate-400'
              }`}
            >
              {d.weekday}
              {d.isToday ? ' • Nay' : ''}
            </span>
            <span className="text-xs sm:text-sm font-black mt-0.5">{d.shortDate}</span>
          </button>
        ))}
      </div>

      {/* Hàng 3 (Mở rộng): Lịch cả tháng */}
      {showMonthGrid && (
        <div className="pt-2 border-t border-slate-200">
          <div className="grid grid-cols-7 gap-1 mb-1">
            {WEEKDAY_LABELS.map((w) => (
              <div
                key={w}
                className="text-center text-[11px] font-black uppercase text-slate-400 py-1"
              >
                {w}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {monthCells.map((c) => (
              <button
                key={c.iso}
                type="button"
                onClick={() => {
                  onSelectDate(c.iso);
                  setShowMonthGrid(false);
                }}
                className={`rounded-xl py-2 text-xs font-bold transition cursor-pointer ${
                  c.isSelected
                    ? 'bg-blue-600 text-white font-black shadow-sm'
                    : c.isToday
                    ? 'bg-emerald-100 text-emerald-900 border border-emerald-300 font-black'
                    : c.inMonth
                    ? 'bg-slate-50 hover:bg-blue-50 text-slate-800'
                    : 'bg-white text-slate-300 hover:bg-slate-50'
                }`}
              >
                {c.dayNum}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
