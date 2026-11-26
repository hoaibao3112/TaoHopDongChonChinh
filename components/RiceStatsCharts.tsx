'use client';

import React, { useState } from 'react';
import {
  BuyerStat,
  ContractMonthlyStats,
  CostBreakdownStat,
  DailyIntakePoint,
  FacilityDryStat,
  FinancialSummaryStat,
  KcsVarietyStat,
  MillingProgressStat,
  RegionStat,
  RiceVarietyStat,
} from '@/lib/rice-stats/types';

export const CHART_PALETTE = [
  '#059669', // emerald-600
  '#d97706', // amber-600
  '#2563eb', // blue-600
  '#7c3aed', // violet-600
  '#db2777', // pink-600
  '#0891b2', // cyan-600
  '#65a30d', // lime-600
  '#ea580c', // orange-600
  '#4f46e5', // indigo-600
  '#64748b', // slate-500
];

function fmtTons(kg: number): string {
  return (kg / 1000).toLocaleString('vi-VN', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 2,
  });
}

function fmtMoneyShort(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)} tỷ`;
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(1)} tr`;
  return `${Math.round(n).toLocaleString('vi-VN')} đ`;
}

export interface DonutSlice {
  label: string;
  value: number;
  displayValue: string;
  color?: string;
}

export function DonutChart({
  title,
  subtitle,
  slices,
  centerLabel,
  centerValue,
}: {
  title: string;
  subtitle?: string;
  slices: DonutSlice[];
  centerLabel: string;
  centerValue: string;
}) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const validSlices = slices.filter((s) => s.value > 0);
  const total = validSlices.reduce((sum, s) => sum + s.value, 0);

  const radius = 56;
  const circumference = 2 * Math.PI * radius;
  let cumulativePercent = 0;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs flex flex-col justify-between">
      <div>
        <h3 className="text-sm font-black text-slate-900">{title}</h3>
        {subtitle && <p className="text-[11px] text-slate-500 mt-0.5">{subtitle}</p>}
      </div>

      {total <= 0 ? (
        <p className="py-12 text-center text-xs text-slate-400">Chưa có dữ liệu</p>
      ) : (
        <div className="mt-4 flex flex-col sm:flex-row items-center gap-6">
          <div className="relative h-40 w-40 shrink-0">
            <svg viewBox="0 0 140 140" className="h-full w-full -rotate-90">
              <circle
                cx="70"
                cy="70"
                r={radius}
                fill="none"
                stroke="#f1f5f9"
                strokeWidth="20"
              />
              {validSlices.map((s, idx) => {
                const pct = s.value / total;
                const dashLength = pct * circumference;
                const dashOffset = -cumulativePercent * circumference;
                cumulativePercent += pct;
                const color = s.color || CHART_PALETTE[idx % CHART_PALETTE.length];
                const isHovered = hoveredIdx === idx;
                return (
                  <circle
                    key={s.label}
                    cx="70"
                    cy="70"
                    r={radius}
                    fill="none"
                    stroke={color}
                    strokeWidth={isHovered ? 24 : 20}
                    strokeDasharray={`${dashLength} ${circumference}`}
                    strokeDashoffset={dashOffset}
                    className="transition-all duration-200 cursor-pointer"
                    onMouseEnter={() => setHoveredIdx(idx)}
                    onMouseLeave={() => setHoveredIdx(null)}
                  />
                );
              })}
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none px-3">
              <span className="text-[10px] font-bold uppercase text-slate-400">
                {hoveredIdx !== null && validSlices[hoveredIdx]
                  ? validSlices[hoveredIdx].label
                  : centerLabel}
              </span>
              <span className="text-sm font-black text-slate-900 leading-tight mt-0.5">
                {hoveredIdx !== null && validSlices[hoveredIdx]
                  ? `${((validSlices[hoveredIdx].value / total) * 100).toFixed(1)}%`
                  : centerValue}
              </span>
            </div>
          </div>

          <div className="flex-1 w-full space-y-1.5 max-h-48 overflow-y-auto pr-1">
            {validSlices.map((s, idx) => {
              const pct = ((s.value / total) * 100).toFixed(1);
              const color = s.color || CHART_PALETTE[idx % CHART_PALETTE.length];
              return (
                <div
                  key={s.label}
                  onMouseEnter={() => setHoveredIdx(idx)}
                  onMouseLeave={() => setHoveredIdx(null)}
                  className={`flex items-center justify-between gap-2 rounded-lg px-2 py-1 text-xs transition cursor-pointer ${
                    hoveredIdx === idx ? 'bg-slate-100' : ''
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className="h-2.5 w-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: color }}
                    />
                    <span className="font-semibold text-slate-700 truncate">{s.label}</span>
                  </div>
                  <div className="shrink-0 text-right">
                    <span className="font-bold text-slate-900">{s.displayValue}</span>
                    <span className="ml-1.5 text-[11px] text-slate-500">({pct}%)</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export function DailyStackedBarChart({
  data,
  monthLabel,
}: {
  data: DailyIntakePoint[];
  monthLabel: string;
}) {
  const [hovered, setHovered] = useState<DailyIntakePoint | null>(null);
  const maxKg = Math.max(...data.map((d) => d.totalKg), 1);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <div>
          <h3 className="text-sm font-black text-slate-900">
            Biểu Đồ Sản Lượng Nhập Theo Ngày ({monthLabel})
          </h3>
          <p className="text-[11px] text-slate-500 mt-0.5">
            Rê chuột vào từng cột để xem chi tiết sản lượng Lúa Tươi &amp; Lúa Khô trong ngày
          </p>
        </div>

        <div className="flex items-center gap-4 text-xs font-bold">
          <span className="inline-flex items-center gap-1.5 text-emerald-700">
            <span className="h-3 w-3 rounded-sm bg-emerald-500" />
            Lúa Tươi
          </span>
          <span className="inline-flex items-center gap-1.5 text-amber-700">
            <span className="h-3 w-3 rounded-sm bg-amber-500" />
            Lúa Khô
          </span>
        </div>
      </div>

      {hovered && (
        <div className="mb-3 rounded-xl border border-emerald-200 bg-emerald-50/70 px-3.5 py-2 text-xs flex flex-wrap items-center gap-x-5 gap-y-1">
          <span className="font-black text-slate-900">📅 Ngày {hovered.date}</span>
          <span className="font-bold text-emerald-700">Lúa Tươi: {fmtTons(hovered.freshKg)} tấn</span>
          <span className="font-bold text-amber-700">Lúa Khô: {fmtTons(hovered.dryKg)} tấn</span>
          <span className="font-black text-slate-900">
            Tổng: {fmtTons(hovered.totalKg)} tấn ({hovered.lots} lô)
          </span>
        </div>
      )}

      {data.length === 0 ? (
        <p className="py-10 text-center text-xs text-slate-400">Không có dữ liệu ngày trong kỳ.</p>
      ) : (
        <div className="flex items-end gap-1.5 h-52 overflow-x-auto pb-2 pt-4">
          {data.map((d) => {
            const totalPct = Math.max(4, Math.round((d.totalKg / maxKg) * 100));
            const freshRatio = d.totalKg > 0 ? (d.freshKg / d.totalKg) * 100 : 0;
            const dryRatio = d.totalKg > 0 ? (d.dryKg / d.totalKg) * 100 : 0;
            return (
              <div
                key={d.date}
                onMouseEnter={() => setHovered(d)}
                onMouseLeave={() => setHovered(null)}
                className="flex flex-col items-center min-w-[30px] flex-1 group cursor-pointer"
              >
                <span className="text-[9px] font-bold text-slate-500 mb-1 opacity-75 group-hover:opacity-100 group-hover:text-emerald-700">
                  {fmtTons(d.totalKg)}
                </span>
                <div className="w-full flex flex-col justify-end h-36 bg-slate-100/80 rounded-t-md overflow-hidden">
                  <div
                    style={{ height: `${totalPct}%` }}
                    className="w-full flex flex-col justify-end rounded-t-md overflow-hidden transition-all duration-200 group-hover:brightness-105"
                  >
                    {dryRatio > 0 && (
                      <div
                        style={{ height: `${dryRatio}%` }}
                        className="w-full bg-amber-500"
                      />
                    )}
                    {freshRatio > 0 && (
                      <div
                        style={{ height: `${freshRatio}%` }}
                        className="w-full bg-emerald-500"
                      />
                    )}
                  </div>
                </div>
                <span className="mt-1.5 text-[10px] font-semibold text-slate-600">
                  {d.date.slice(0, 5)}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function VarietyDonutChart({ varieties }: { varieties: RiceVarietyStat[] }) {
  const top = varieties.slice(0, 6);
  const othersKg = varieties.slice(6).reduce((s, v) => s + v.totalKg, 0);
  const slices: DonutSlice[] = top.map((v, i) => ({
    label: v.variety,
    value: v.totalKg,
    displayValue: `${fmtTons(v.totalKg)}t`,
    color: CHART_PALETTE[i % CHART_PALETTE.length],
  }));
  if (othersKg > 0) {
    slices.push({
      label: 'Loại khác',
      value: othersKg,
      displayValue: `${fmtTons(othersKg)}t`,
      color: '#94a3b8',
    });
  }
  const totalKg = varieties.reduce((s, v) => s + v.totalKg, 0);

  return (
    <DonutChart
      title="Tỷ Trọng Cơ Cấu Theo Loại Lúa"
      subtitle="Rê chuột vào biểu đồ tròn hoặc tên giống lúa để xem %"
      slices={slices}
      centerLabel="Tổng Lúa"
      centerValue={`${fmtTons(totalKg)} tấn`}
    />
  );
}

export function BuyerRankingChart({ buyers }: { buyers: BuyerStat[] }) {
  const top = buyers.slice(0, 10);
  const maxKg = Math.max(...top.map((b) => b.totalKg), 1);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
        <div>
          <h3 className="text-sm font-black text-slate-900">Biểu Đồ Top Nhân Viên Thu Mua</h3>
          <p className="text-[11px] text-slate-500">So sánh sản lượng Lúa Tươi &amp; Lúa Khô (tấn)</p>
        </div>
        <div className="flex items-center gap-3 text-[11px] font-bold">
          <span className="inline-flex items-center gap-1 text-emerald-700">
            <span className="h-2.5 w-2.5 rounded-xs bg-emerald-500" /> Tươi
          </span>
          <span className="inline-flex items-center gap-1 text-amber-700">
            <span className="h-2.5 w-2.5 rounded-xs bg-amber-500" /> Khô
          </span>
        </div>
      </div>

      <div className="space-y-3">
        {top.map((b, idx) => {
          const freshPct = (b.freshKg / maxKg) * 100;
          const dryPct = (b.dryKg / maxKg) * 100;
          return (
            <div key={b.buyer} className="space-y-1">
              <div className="flex justify-between text-xs">
                <span className="font-bold text-slate-800">
                  {idx + 1}. {b.buyer}
                </span>
                <span className="font-bold text-slate-700">
                  {fmtTons(b.totalKg)} tấn{' '}
                  <span className="text-slate-400 font-normal">({fmtMoneyShort(b.totalAmount)})</span>
                </span>
              </div>
              <div className="h-3 w-full rounded-full bg-slate-100 overflow-hidden flex">
                {freshPct > 0 && (
                  <div
                    style={{ width: `${freshPct}%` }}
                    className="h-full bg-emerald-500 transition-all"
                    title={`Lúa tươi: ${fmtTons(b.freshKg)} tấn`}
                  />
                )}
                {dryPct > 0 && (
                  <div
                    style={{ width: `${dryPct}%` }}
                    className="h-full bg-amber-500 transition-all"
                    title={`Lúa khô: ${fmtTons(b.dryKg)} tấn`}
                  />
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function RegionBarChart({ regions }: { regions: RegionStat[] }) {
  const top = regions.slice(0, 8);
  const maxKg = Math.max(...top.map((r) => r.totalKg), 1);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
      <h3 className="text-sm font-black text-slate-900">Biểu Đồ Sản Lượng Theo Vùng Thu Mua</h3>
      <p className="text-[11px] text-slate-500 mb-4">Top 8 khu vực / địa điểm cân lớn nhất</p>

      <div className="space-y-3">
        {top.map((r) => {
          const pct = Math.max(2, (r.totalKg / maxKg) * 100);
          return (
            <div key={r.region} className="space-y-1">
              <div className="flex justify-between text-xs gap-2">
                <span className="font-semibold text-slate-800 truncate">{r.region}</span>
                <span className="shrink-0 font-bold text-blue-700">
                  {fmtTons(r.totalKg)}t <span className="text-slate-400 font-normal">({r.avgFreightPerKg} đ/kg)</span>
                </span>
              </div>
              <div className="h-2.5 w-full rounded-full bg-slate-100 overflow-hidden">
                <div
                  style={{ width: `${pct}%` }}
                  className="h-full rounded-full bg-gradient-to-r from-blue-600 to-cyan-500"
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function CostCharts({ cost }: { cost: CostBreakdownStat }) {
  const slices: DonutSlice[] = [
    { label: 'Tiền lúa tươi gốc', value: cost.fresh.riceAmount, displayValue: fmtMoneyShort(cost.fresh.riceAmount), color: '#059669' },
    { label: 'Tiền lúa khô gốc', value: cost.dry.riceAmount, displayValue: fmtMoneyShort(cost.dry.riceAmount), color: '#d97706' },
    { label: 'Cước VC mua vào & khô', value: cost.fresh.inboundFreight + cost.dry.dryFreight, displayValue: fmtMoneyShort(cost.fresh.inboundFreight + cost.dry.dryFreight), color: '#2563eb' },
    { label: 'Tăng bo & Công đoàn', value: cost.fresh.transshipmentFreight + cost.fresh.laborUnionCost, displayValue: fmtMoneyShort(cost.fresh.transshipmentFreight + cost.fresh.laborUnionCost), color: '#7c3aed' },
    { label: 'Tiền sấy & Xuất trả VAT', value: cost.fresh.dryingCostVat5 + cost.fresh.exportReturnCostVat8, displayValue: fmtMoneyShort(cost.fresh.dryingCostVat5 + cost.fresh.exportReturnCostVat8), color: '#db2777' },
    { label: 'Chi phí khác', value: cost.dry.otherCosts, displayValue: fmtMoneyShort(cost.dry.otherCosts), color: '#64748b' },
  ];

  const maxUnit = Math.max(cost.fresh.realUnitCostPerKg, cost.dry.realUnitCostPerKg, 1);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
      <DonutChart
        title="Cơ Cấu Tỷ Trọng Toàn Bộ Chi Phí"
        subtitle="Phân bổ tiền lúa gốc, vận chuyển, tăng bo và chi phí sấy"
        slices={slices}
        centerLabel="Tổng Chi"
        centerValue={fmtMoneyShort(cost.grandTotalCost)}
      />

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs flex flex-col justify-center space-y-5">
        <div>
          <h3 className="text-sm font-black text-slate-900">So Sánh Giá Thành Thực Tế Về Tới Nhà Máy</h3>
          <p className="text-[11px] text-slate-500 mt-0.5">
            Bao gồm toàn bộ tiền lúa + cước vận chuyển + tăng bo + sấy (đ/kg)
          </p>
        </div>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <div className="flex justify-between text-xs font-bold">
              <span className="text-emerald-800">🌾 Lúa Tươi Qua Sấy</span>
              <span className="text-emerald-700 font-black">
                {cost.fresh.realUnitCostPerKg.toLocaleString('vi-VN')} đ/kg
              </span>
            </div>
            <div className="h-5 w-full rounded-xl bg-slate-100 overflow-hidden">
              <div
                style={{ width: `${Math.round((cost.fresh.realUnitCostPerKg / maxUnit) * 100)}%` }}
                className="h-full bg-gradient-to-r from-emerald-500 to-teal-500 rounded-xl"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="flex justify-between text-xs font-bold">
              <span className="text-amber-800">🌾 Lúa Khô Mua Trực Tiếp</span>
              <span className="text-amber-700 font-black">
                {cost.dry.realUnitCostPerKg.toLocaleString('vi-VN')} đ/kg
              </span>
            </div>
            <div className="h-5 w-full rounded-xl bg-slate-100 overflow-hidden">
              <div
                style={{ width: `${Math.round((cost.dry.realUnitCostPerKg / maxUnit) * 100)}%` }}
                className="h-full bg-gradient-to-r from-amber-500 to-orange-500 rounded-xl"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function LossAndKcsCharts({
  facilities,
  kcs,
}: {
  facilities: FacilityDryStat[];
  kcs: KcsVarietyStat[];
}) {
  const maxInput = Math.max(...facilities.map((f) => f.inputFreshKg), 1);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
        <h3 className="text-sm font-black text-slate-900">Biểu Đồ Sản Lượng &amp; Hao Hụt Theo Cơ Sở Sấy</h3>
        <p className="text-[11px] text-slate-500 mb-4">So sánh khối lượng tiếp nhận và % hao hụt cân nhập</p>
        <div className="space-y-3">
          {facilities.slice(0, 8).map((f) => (
            <div key={f.facility} className="space-y-1">
              <div className="flex justify-between text-xs">
                <span className="font-bold text-slate-800">{f.facility}</span>
                <span className="font-bold text-slate-700">
                  {fmtTons(f.inputFreshKg)}t{' '}
                  <span className="text-rose-600">(Hao: {f.lossPercent}%)</span>
                </span>
              </div>
              <div className="h-2.5 w-full rounded-full bg-slate-100 overflow-hidden">
                <div
                  style={{ width: `${Math.max(3, (f.inputFreshKg / maxInput) * 100)}%` }}
                  className="h-full rounded-full bg-gradient-to-r from-rose-500 to-orange-500"
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
        <h3 className="text-sm font-black text-slate-900">Biểu Đồ Chỉ Số KCS Theo Loại Lúa</h3>
        <p className="text-[11px] text-slate-500 mb-4">So sánh Tổng Thu (xanh) &amp; Đầu Gạo (tím)</p>
        <div className="space-y-3">
          {kcs.slice(0, 8).map((k) => {
            const maxVal = Math.max(k.avgTotalYieldKg, k.avgHeadRiceKg, 100);
            const totalW = Math.min(100, (k.avgTotalYieldKg / Math.max(maxVal, 75)) * 100);
            const headW = Math.min(100, (k.avgHeadRiceKg / Math.max(maxVal, 75)) * 100);
            return (
              <div key={k.variety} className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="font-bold text-slate-800">{k.variety}</span>
                  <span className="text-slate-600 font-semibold">
                    Tổng thu: <b className="text-blue-700">{k.avgTotalYieldKg}</b> • Đầu gạo: <b className="text-violet-700">{k.avgHeadRiceKg}</b>
                  </span>
                </div>
                <div className="space-y-1">
                  <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden">
                    <div style={{ width: `${totalW}%` }} className="h-full bg-blue-500 rounded-full" />
                  </div>
                  <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden">
                    <div style={{ width: `${headW}%` }} className="h-full bg-violet-500 rounded-full" />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function MillingCharts({ milling }: { milling: MillingProgressStat }) {
  const totalKg =
    milling.freshMilledMay1Kg +
    milling.freshMilledMay2Kg +
    milling.freshMilledNsxKg +
    milling.dryMilledKg +
    milling.unmilledFreshKg +
    milling.unmilledDryKg;

  const slices: DonutSlice[] = [
    { label: 'Lúa tươi xay Máy 1', value: milling.freshMilledMay1Kg, displayValue: `${fmtTons(milling.freshMilledMay1Kg)}t`, color: '#059669' },
    { label: 'Lúa tươi xay Máy 2', value: milling.freshMilledMay2Kg, displayValue: `${fmtTons(milling.freshMilledMay2Kg)}t`, color: '#0891b2' },
    { label: 'Lúa tươi xay NSX', value: milling.freshMilledNsxKg, displayValue: `${fmtTons(milling.freshMilledNsxKg)}t`, color: '#2563eb' },
    { label: 'Lúa khô đã xay', value: milling.dryMilledKg, displayValue: `${fmtTons(milling.dryMilledKg)}t`, color: '#7c3aed' },
    { label: 'Tồn tươi chưa xay', value: milling.unmilledFreshKg, displayValue: `${fmtTons(milling.unmilledFreshKg)}t`, color: '#f59e0b' },
    { label: 'Tồn khô chưa xay', value: milling.unmilledDryKg, displayValue: `${fmtTons(milling.unmilledDryKg)}t`, color: '#ef4444' },
  ];

  const radius = 52;
  const circ = 2 * Math.PI * radius;
  const pct = Math.min(100, Math.max(0, milling.milledPercentByWeight));
  const dash = (pct / 100) * circ;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs flex items-center gap-6">
        <div className="relative h-36 w-36 shrink-0">
          <svg viewBox="0 0 130 130" className="h-full w-full -rotate-90">
            <circle cx="65" cy="65" r={radius} fill="none" stroke="#e2e8f0" strokeWidth="14" />
            <circle
              cx="65"
              cy="65"
              r={radius}
              fill="none"
              stroke="#059669"
              strokeWidth="14"
              strokeLinecap="round"
              strokeDasharray={`${dash} ${circ}`}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-2xl font-black text-emerald-700">{pct}%</span>
            <span className="text-[10px] font-bold uppercase text-slate-500">Đã Xay</span>
          </div>
        </div>
        <div className="space-y-2 text-xs">
          <h3 className="text-sm font-black text-slate-900">Tiến Độ Xay Sát Trong Kỳ</h3>
          <p className="text-slate-600">
            Đã xay: <b className="text-emerald-700">{milling.milledLots} lô</b> • Chưa xay:{' '}
            <b className="text-rose-600">{milling.unmilledLots} lô</b>
          </p>
          <p className="text-slate-600">
            Thời gian lưu kho trung bình: <b className="text-blue-700">{milling.avgStorageDays} ngày</b>
          </p>
        </div>
      </div>

      <DonutChart
        title="Phân Bổ Sản Lượng Theo Kênh Xay & Tồn Kho"
        slices={slices}
        centerLabel="Tổng Lượng"
        centerValue={`${fmtTons(totalKg)} tấn`}
      />
    </div>
  );
}

export function FinancialCharts({ financial }: { financial: FinancialSummaryStat }) {
  const bankSlices: DonutSlice[] = financial.banks.slice(0, 7).map((b, idx) => ({
    label: b.bank,
    value: Math.max(0, b.totalPaid),
    displayValue: fmtMoneyShort(b.totalPaid),
    color: CHART_PALETTE[idx % CHART_PALETTE.length],
  }));

  const maxFlow = Math.max(
    financial.totalAmount,
    financial.totalAdvance,
    financial.totalDepositDeducted,
    financial.totalPayable,
    1
  );

  const flowBars = [
    { label: 'Tổng Tiền Hàng', val: financial.totalAmount, color: 'bg-slate-700' },
    { label: 'Đã Tạm Ứng', val: financial.totalAdvance, color: 'bg-blue-600' },
    { label: 'Đã Trừ Cọc', val: financial.totalDepositDeducted, color: 'bg-amber-500' },
    { label: 'Còn Thanh Toán', val: financial.totalPayable, color: 'bg-emerald-600' },
  ];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs space-y-4">
        <div>
          <h3 className="text-sm font-black text-slate-900">Biểu Đồ Dòng Tiền Thanh Toán</h3>
          <p className="text-[11px] text-slate-500">So sánh Tiền hàng, Tạm ứng, Trừ cọc và Thực trả</p>
        </div>
        <div className="space-y-3">
          {flowBars.map((fb) => (
            <div key={fb.label} className="space-y-1">
              <div className="flex justify-between text-xs font-bold">
                <span className="text-slate-700">{fb.label}</span>
                <span className="text-slate-900">{fmtMoneyShort(fb.val)}</span>
              </div>
              <div className="h-3.5 w-full rounded-full bg-slate-100 overflow-hidden">
                <div
                  style={{ width: `${Math.max(2, Math.round((Math.max(0, fb.val) / maxFlow) * 100))}%` }}
                  className={`h-full rounded-full ${fb.color}`}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      <DonutChart
        title="Tỷ Trọng Thanh Toán Theo Ngân Hàng"
        slices={bankSlices}
        centerLabel="Thực Trả"
        centerValue={fmtMoneyShort(financial.totalPayable)}
      />
    </div>
  );
}

export function ContractCharts({ contracts }: { contracts: ContractMonthlyStats }) {
  const maxForecastKg = Math.max(...contracts.forecastByDate.map((f) => f.expectedKg), 1);
  const maxKcsKg = Math.max(...contracts.kcsRanking.map((k) => k.totalContractKg), 1);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <DonutChart
          title="Tiến Độ Giao Hàng Theo Hợp Đồng"
          subtitle={`Hoàn thành ${contracts.completionPercent}% trên tổng ${fmtTons(contracts.totalContractKg)} tấn đã ký`}
          slices={[
            { label: 'Đã nhận thực tế', value: contracts.totalReceivedKg, displayValue: `${fmtTons(contracts.totalReceivedKg)}t`, color: '#059669' },
            { label: 'Còn lại chưa giao', value: Math.max(0, contracts.totalRemainingKg), displayValue: `${fmtTons(Math.max(0, contracts.totalRemainingKg))}t`, color: '#F59E0B' },
          ]}
          centerLabel="Hoàn Thành"
          centerValue={`${contracts.completionPercent}%`}
        />

        <DonutChart
          title="Đối Chiếu Nhập Trong HĐ vs Mua Ngoài"
          subtitle="Dựa trên cột Số HĐ từ 2 file Lúa Tươi & Lúa Khô trong kỳ"
          slices={[
            { label: 'Nhập theo Hợp Đồng', value: contracts.crossCheck.inContractKg, displayValue: `${fmtTons(contracts.crossCheck.inContractKg)}t`, color: '#2563EB' },
            { label: 'Mua ngoài Hợp Đồng (00)', value: contracts.crossCheck.outsideContractKg, displayValue: `${fmtTons(contracts.crossCheck.outsideContractKg)}t`, color: '#EC4899' },
          ]}
          centerLabel="Trong HĐ"
          centerValue={`${contracts.crossCheck.inContractPercent}%`}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
          <h3 className="text-sm font-black text-slate-900">Biểu Đồ Dự Báo Lịch Nhận Hàng Theo Ngày</h3>
          <p className="text-[11px] text-slate-500 mb-3">
            Lượng lúa dự kiến về theo ngày (tấn) giúp bố trí lò sấy &amp; tăng bo
          </p>
          {contracts.forecastByDate.length === 0 ? (
            <p className="py-10 text-center text-xs text-slate-400">Chưa có lịch nhận hàng dự kiến trong kỳ.</p>
          ) : (
            <div className="flex items-end gap-1.5 h-44 overflow-x-auto pb-2 pt-4">
              {contracts.forecastByDate.slice(0, 28).map((f) => {
                const pct = Math.max(5, Math.round((f.expectedKg / maxForecastKg) * 100));
                return (
                  <div
                    key={f.date}
                    className="flex flex-col items-center min-w-[28px] flex-1 group"
                    title={`${f.date}: Dự kiến ${fmtTons(f.expectedKg)}t (${f.contractCount} HĐ)`}
                  >
                    <span className="text-[9px] font-bold text-slate-500 mb-1">
                      {fmtTons(f.expectedKg)}
                    </span>
                    <div className="w-full flex flex-col justify-end h-28 bg-slate-100 rounded-t-md overflow-hidden">
                      <div
                        style={{ height: `${pct}%` }}
                        className="w-full bg-gradient-to-t from-sky-600 to-cyan-400 rounded-t-md"
                      />
                    </div>
                    <span className="mt-1 text-[10px] font-semibold text-slate-600">
                      {f.date.slice(0, 5)}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
          <h3 className="text-sm font-black text-slate-900">Xếp Hạng KCS Ký Hợp Đồng</h3>
          <p className="text-[11px] text-slate-500 mb-3">Sản lượng ký HĐ &amp; tỷ lệ hoàn thành nhận hàng</p>
          <div className="space-y-2.5">
            {contracts.kcsRanking.slice(0, 8).map((k) => (
              <div key={k.kcs} className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="font-bold text-slate-800">{k.kcs} ({k.contractCount} HĐ)</span>
                  <span className="font-bold text-sky-700">
                    {fmtTons(k.totalContractKg)}t <span className="text-emerald-700">({k.completionPercent}%)</span>
                  </span>
                </div>
                <div className="h-2.5 w-full rounded-full bg-slate-100 overflow-hidden">
                  <div
                    style={{ width: `${Math.max(3, (k.totalContractKg / maxKcsKg) * 100)}%` }}
                    className="h-full rounded-full bg-gradient-to-r from-sky-600 to-indigo-500"
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
