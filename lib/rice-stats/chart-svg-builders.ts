import {
  BuyerStat,
  CostBreakdownStat,
  DailyIntakePoint,
  FacilityDryStat,
  FinancialSummaryStat,
  MillingProgressStat,
  RegionStat,
  RiceMonthlyStatsResult,
  RiceVarietyStat,
} from './types';

export const CHART_FONT = "'Segoe UI', 'Roboto', 'Helvetica Neue', Arial, sans-serif";

const PALETTE = [
  '#059669',
  '#D97706',
  '#2563EB',
  '#7C3AED',
  '#DB2777',
  '#0891B2',
  '#65A30D',
  '#EA580C',
  '#4F46E5',
  '#64748B',
];

function escapeXml(str: string): string {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function fmtTons(kg: number): string {
  return (kg / 1000).toLocaleString('vi-VN', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
}

function fmtMoneyShort(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)} tỷ`;
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(1)} tr`;
  return `${Math.round(n).toLocaleString('vi-VN')} đ`;
}

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return {
    x: cx + r * Math.cos(rad),
    y: cy + r * Math.sin(rad),
  };
}

function describeDonutArc(
  cx: number,
  cy: number,
  rOuter: number,
  rInner: number,
  startAngle: number,
  endAngle: number
): string {
  const sweep = endAngle - startAngle;
  if (sweep >= 359.99) {
    return [
      `M ${cx} ${cy - rOuter}`,
      `A ${rOuter} ${rOuter} 0 1 1 ${cx - 0.01} ${cy - rOuter}`,
      `L ${cx - 0.01} ${cy - rInner}`,
      `A ${rInner} ${rInner} 0 1 0 ${cx} ${cy - rInner}`,
      'Z',
    ].join(' ');
  }
  const p1 = polarToCartesian(cx, cy, rOuter, startAngle);
  const p2 = polarToCartesian(cx, cy, rOuter, endAngle);
  const p3 = polarToCartesian(cx, cy, rInner, endAngle);
  const p4 = polarToCartesian(cx, cy, rInner, startAngle);
  const largeArc = sweep > 180 ? 1 : 0;

  return [
    `M ${p1.x.toFixed(2)} ${p1.y.toFixed(2)}`,
    `A ${rOuter} ${rOuter} 0 ${largeArc} 1 ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`,
    `L ${p3.x.toFixed(2)} ${p3.y.toFixed(2)}`,
    `A ${rInner} ${rInner} 0 ${largeArc} 0 ${p4.x.toFixed(2)} ${p4.y.toFixed(2)}`,
    'Z',
  ].join(' ');
}

function buildDonutSvg(params: {
  width?: number;
  height?: number;
  title: string;
  subtitle?: string;
  centerLabel: string;
  centerValue: string;
  slices: { label: string; value: number; displayValue: string; color?: string }[];
}): string {
  const width = params.width ?? 620;
  const height = params.height ?? 320;
  const valid = params.slices.filter((s) => s.value > 0);
  const total = valid.reduce((sum, s) => sum + s.value, 0);

  const cx = 135;
  const cy = 182;
  const rOuter = 92;
  const rInner = 54;

  let currentAngle = 0;
  const paths: string[] = [];
  const legends: string[] = [];

  if (total > 0) {
    valid.slice(0, 8).forEach((s, idx) => {
      const pct = s.value / total;
      const sweep = pct * 360;
      const color = s.color || PALETTE[idx % PALETTE.length];
      if (sweep > 0.5) {
        paths.push(
          `<path d="${describeDonutArc(cx, cy, rOuter, rInner, currentAngle, currentAngle + sweep)}" fill="${color}" stroke="#FFFFFF" stroke-width="1.5"/>`
        );
      }
      currentAngle += sweep;

      const ly = 96 + idx * 26;
      const shortLabel = s.label.length > 22 ? `${s.label.slice(0, 20)}..` : s.label;
      legends.push(`
        <rect x="275" y="${ly - 10}" width="12" height="12" rx="3" fill="${color}"/>
        <text x="295" y="${ly}" font-family="${CHART_FONT}" font-size="12" font-weight="700" fill="#1E293B">${escapeXml(shortLabel)}</text>
        <text x="${width - 20}" y="${ly}" text-anchor="end" font-family="${CHART_FONT}" font-size="12" font-weight="700" fill="#0F172A">${escapeXml(s.displayValue)} (${(pct * 100).toFixed(1)}%)</text>
      `);
    });
  } else {
    paths.push(
      `<circle cx="${cx}" cy="${cy}" r="${(rOuter + rInner) / 2}" fill="none" stroke="#E2E8F0" stroke-width="${rOuter - rInner}"/>`
    );
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    <rect x="1" y="1" width="${width - 2}" height="${height - 2}" rx="14" fill="#FFFFFF" stroke="#CBD5E1" stroke-width="1.5"/>
    <rect x="1" y="1" width="${width - 2}" height="52" rx="14" fill="#F8FAFC"/>
    <text x="20" y="27" font-family="${CHART_FONT}" font-size="15" font-weight="800" fill="#0F172A">${escapeXml(params.title)}</text>
    ${params.subtitle ? `<text x="20" y="45" font-family="${CHART_FONT}" font-size="11" fill="#64748B">${escapeXml(params.subtitle)}</text>` : ''}
    ${paths.join('\n')}
    <text x="${cx}" y="${cy - 5}" text-anchor="middle" font-family="${CHART_FONT}" font-size="11" font-weight="700" fill="#64748B">${escapeXml(params.centerLabel)}</text>
    <text x="${cx}" y="${cy + 14}" text-anchor="middle" font-family="${CHART_FONT}" font-size="14" font-weight="800" fill="#0F172A">${escapeXml(params.centerValue)}</text>
    ${legends.join('\n')}
  </svg>`;
}

export function buildDailyStackedChartSvg(data: DailyIntakePoint[], periodLabel: string): string {
  const width = 900;
  const height = 320;
  const items = data.slice(-28);
  const maxKg = Math.max(...items.map((d) => d.totalKg), 1);

  const chartLeft = 56;
  const chartRight = width - 24;
  const chartTop = 76;
  const chartBottom = 276;
  const chartHeight = chartBottom - chartTop;
  const plotWidth = chartRight - chartLeft;

  const gridLines: string[] = [];
  for (let i = 0; i <= 4; i++) {
    const y = chartBottom - (chartHeight * i) / 4;
    const valTons = fmtTons((maxKg * i) / 4);
    gridLines.push(`
      <line x1="${chartLeft}" y1="${y}" x2="${chartRight}" y2="${y}" stroke="#E2E8F0" stroke-dasharray="3,3"/>
      <text x="${chartLeft - 8}" y="${y + 4}" text-anchor="end" font-family="${CHART_FONT}" font-size="10" fill="#64748B">${valTons}t</text>
    `);
  }

  const bars: string[] = [];
  if (items.length > 0) {
    const slotW = plotWidth / items.length;
    const barW = Math.min(26, Math.max(8, slotW * 0.62));
    items.forEach((d, idx) => {
      const x = chartLeft + idx * slotW + (slotW - barW) / 2;
      const totalH = Math.max(3, (d.totalKg / maxKg) * chartHeight);
      const freshH = d.totalKg > 0 ? (d.freshKg / d.totalKg) * totalH : 0;
      const dryH = d.totalKg > 0 ? (d.dryKg / d.totalKg) * totalH : 0;

      const freshY = chartBottom - freshH;
      const dryY = freshY - dryH;

      bars.push(`
        ${freshH > 0 ? `<rect x="${x.toFixed(1)}" y="${freshY.toFixed(1)}" width="${barW.toFixed(1)}" height="${freshH.toFixed(1)}" rx="2" fill="#059669"/>` : ''}
        ${dryH > 0 ? `<rect x="${x.toFixed(1)}" y="${dryY.toFixed(1)}" width="${barW.toFixed(1)}" height="${dryH.toFixed(1)}" rx="2" fill="#D97706"/>` : ''}
        <text x="${(x + barW / 2).toFixed(1)}" y="${(chartBottom - totalH - 5).toFixed(1)}" text-anchor="middle" font-family="${CHART_FONT}" font-size="9" font-weight="700" fill="#334155">${fmtTons(d.totalKg)}</text>
        <text x="${(x + barW / 2).toFixed(1)}" y="${chartBottom + 16}" text-anchor="middle" font-family="${CHART_FONT}" font-size="9" fill="#475569">${escapeXml(d.date.slice(0, 5))}</text>
      `);
    });
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    <rect x="1" y="1" width="${width - 2}" height="${height - 2}" rx="14" fill="#FFFFFF" stroke="#CBD5E1" stroke-width="1.5"/>
    <rect x="1" y="1" width="${width - 2}" height="52" rx="14" fill="#F8FAFC"/>
    <text x="20" y="27" font-family="${CHART_FONT}" font-size="15" font-weight="800" fill="#0F172A">BIỂU ĐỒ SẢN LƯỢNG NHẬP THEO NGÀY (${escapeXml(periodLabel)})</text>
    <text x="20" y="45" font-family="${CHART_FONT}" font-size="11" fill="#64748B">Đơn vị trên cột: Tấn lúa • Hiển thị tối đa 28 ngày gần nhất trong kỳ</text>
    <rect x="${width - 210}" y="18" width="12" height="12" rx="3" fill="#059669"/>
    <text x="${width - 193}" y="28" font-family="${CHART_FONT}" font-size="11" font-weight="700" fill="#065F46">Lúa Tươi</text>
    <rect x="${width - 115}" y="18" width="12" height="12" rx="3" fill="#D97706"/>
    <text x="${width - 98}" y="28" font-family="${CHART_FONT}" font-size="11" font-weight="700" fill="#92400E">Lúa Khô</text>
    ${gridLines.join('\n')}
    <line x1="${chartLeft}" y1="${chartBottom}" x2="${chartRight}" y2="${chartBottom}" stroke="#94A3B8"/>
    ${bars.join('\n')}
  </svg>`;
}

export function buildVarietyDonutSvg(varieties: RiceVarietyStat[]): string {
  const top = varieties.slice(0, 7);
  const otherKg = varieties.slice(7).reduce((s, v) => s + v.totalKg, 0);
  const slices = top.map((v, idx) => ({
    label: v.variety,
    value: v.totalKg,
    displayValue: `${fmtTons(v.totalKg)}t`,
    color: PALETTE[idx % PALETTE.length],
  }));
  if (otherKg > 0) {
    slices.push({ label: 'Loại khác', value: otherKg, displayValue: `${fmtTons(otherKg)}t`, color: '#94A3B8' });
  }
  const totalKg = varieties.reduce((s, v) => s + v.totalKg, 0);

  return buildDonutSvg({
    title: 'CƠ CẤU TỶ TRỌNG THEO LOẠI LÚA',
    subtitle: 'Phân bổ sản lượng lúa tươi & lúa khô theo giống lúa',
    centerLabel: 'Tổng Lúa',
    centerValue: `${fmtTons(totalKg)}t`,
    slices,
  });
}

export function buildBuyerRankingSvg(buyers: BuyerStat[]): string {
  const width = 640;
  const height = 340;
  const top = buyers.slice(0, 8);
  const maxKg = Math.max(...top.map((b) => b.totalKg), 1);

  const bars = top
    .map((b, idx) => {
      const y = 84 + idx * 31;
      const barAreaW = 290;
      const freshW = (b.freshKg / maxKg) * barAreaW;
      const dryW = (b.dryKg / maxKg) * barAreaW;
      const label = b.buyer.length > 16 ? `${b.buyer.slice(0, 15)}..` : b.buyer;
      return `
        <text x="18" y="${y + 13}" font-family="${CHART_FONT}" font-size="11.5" font-weight="700" fill="#1E293B">${idx + 1}. ${escapeXml(label)}</text>
        <rect x="165" y="${y + 2}" width="${barAreaW}" height="14" rx="4" fill="#F1F5F9"/>
        ${freshW > 0 ? `<rect x="165" y="${y + 2}" width="${freshW.toFixed(1)}" height="14" rx="4" fill="#059669"/>` : ''}
        ${dryW > 0 ? `<rect x="${(165 + freshW).toFixed(1)}" y="${y + 2}" width="${dryW.toFixed(1)}" height="14" rx="4" fill="#D97706"/>` : ''}
        <text x="${width - 18}" y="${y + 13}" text-anchor="end" font-family="${CHART_FONT}" font-size="11" font-weight="700" fill="#0F172A">${fmtTons(b.totalKg)}t • ${fmtMoneyShort(b.totalAmount)}</text>
      `;
    })
    .join('\n');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    <rect x="1" y="1" width="${width - 2}" height="${height - 2}" rx="14" fill="#FFFFFF" stroke="#CBD5E1" stroke-width="1.5"/>
    <rect x="1" y="1" width="${width - 2}" height="52" rx="14" fill="#F8FAFC"/>
    <text x="18" y="27" font-family="${CHART_FONT}" font-size="15" font-weight="800" fill="#0F172A">TOP NHÂN VIÊN THU MUA TRONG KỲ</text>
    <text x="18" y="45" font-family="${CHART_FONT}" font-size="11" fill="#64748B">Xanh: Lúa Tươi • Cam: Lúa Khô</text>
    ${bars}
  </svg>`;
}

export function buildRegionChartSvg(regions: RegionStat[]): string {
  const width = 620;
  const height = 340;
  const top = regions.slice(0, 8);
  const maxKg = Math.max(...top.map((r) => r.totalKg), 1);

  const bars = top
    .map((r, idx) => {
      const y = 84 + idx * 31;
      const barAreaW = 240;
      const w = Math.max(4, (r.totalKg / maxKg) * barAreaW);
      const label = r.region.length > 22 ? `${r.region.slice(0, 20)}..` : r.region;
      return `
        <text x="18" y="${y + 13}" font-family="${CHART_FONT}" font-size="11" font-weight="700" fill="#1E293B">${escapeXml(label)}</text>
        <rect x="200" y="${y + 2}" width="${barAreaW}" height="14" rx="4" fill="#F1F5F9"/>
        <rect x="200" y="${y + 2}" width="${w.toFixed(1)}" height="14" rx="4" fill="#2563EB"/>
        <text x="${width - 18}" y="${y + 13}" text-anchor="end" font-family="${CHART_FONT}" font-size="11" font-weight="700" fill="#1E40AF">${fmtTons(r.totalKg)}t (${r.avgFreightPerKg} đ/kg)</text>
      `;
    })
    .join('\n');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    <rect x="1" y="1" width="${width - 2}" height="${height - 2}" rx="14" fill="#FFFFFF" stroke="#CBD5E1" stroke-width="1.5"/>
    <rect x="1" y="1" width="${width - 2}" height="52" rx="14" fill="#F8FAFC"/>
    <text x="18" y="27" font-family="${CHART_FONT}" font-size="15" font-weight="800" fill="#0F172A">TOP VÙNG / ĐỊA ĐIỂM CÂN LÚA</text>
    <text x="18" y="45" font-family="${CHART_FONT}" font-size="11" fill="#64748B">Sản lượng (tấn) &amp; Cước vận chuyển bình quân (đ/kg)</text>
    ${bars}
  </svg>`;
}

export function buildCostDonutSvg(cost: CostBreakdownStat): string {
  return buildDonutSvg({
    title: 'CƠ CẤU TỶ TRỌNG TOÀN BỘ CHI PHÍ',
    subtitle: `Giá thành BQ Tươi: ${cost.fresh.realUnitCostPerKg.toLocaleString('vi-VN')} đ/kg • Khô: ${cost.dry.realUnitCostPerKg.toLocaleString('vi-VN')} đ/kg`,
    centerLabel: 'Tổng Chi',
    centerValue: fmtMoneyShort(cost.grandTotalCost),
    slices: [
      { label: 'Tiền lúa tươi gốc', value: cost.fresh.riceAmount, displayValue: fmtMoneyShort(cost.fresh.riceAmount), color: '#059669' },
      { label: 'Tiền lúa khô gốc', value: cost.dry.riceAmount, displayValue: fmtMoneyShort(cost.dry.riceAmount), color: '#D97706' },
      { label: 'Cước VC mua & khô', value: cost.fresh.inboundFreight + cost.dry.dryFreight, displayValue: fmtMoneyShort(cost.fresh.inboundFreight + cost.dry.dryFreight), color: '#2563EB' },
      { label: 'Tăng bo & Công đoàn', value: cost.fresh.transshipmentFreight + cost.fresh.laborUnionCost, displayValue: fmtMoneyShort(cost.fresh.transshipmentFreight + cost.fresh.laborUnionCost), color: '#7C3AED' },
      { label: 'Sấy & Xuất trả VAT', value: cost.fresh.dryingCostVat5 + cost.fresh.exportReturnCostVat8, displayValue: fmtMoneyShort(cost.fresh.dryingCostVat5 + cost.fresh.exportReturnCostVat8), color: '#DB2777' },
      { label: 'Chi phí khác', value: cost.dry.otherCosts, displayValue: fmtMoneyShort(cost.dry.otherCosts), color: '#64748B' },
    ],
  });
}

export function buildFacilityLossSvg(facilities: FacilityDryStat[]): string {
  const width = 680;
  const height = 310;
  const top = facilities.slice(0, 7);
  const maxInput = Math.max(...top.map((f) => f.inputFreshKg), 1);

  const bars = top
    .map((f, idx) => {
      const y = 80 + idx * 31;
      const barAreaW = 260;
      const w = Math.max(4, (f.inputFreshKg / maxInput) * barAreaW);
      return `
        <text x="18" y="${y + 13}" font-family="${CHART_FONT}" font-size="11.5" font-weight="700" fill="#1E293B">${escapeXml(f.facility.slice(0, 20))}</text>
        <rect x="190" y="${y + 2}" width="${barAreaW}" height="14" rx="4" fill="#F1F5F9"/>
        <rect x="190" y="${y + 2}" width="${w.toFixed(1)}" height="14" rx="4" fill="#E11D48"/>
        <text x="${width - 18}" y="${y + 13}" text-anchor="end" font-family="${CHART_FONT}" font-size="11" font-weight="700" fill="#0F172A">${fmtTons(f.inputFreshKg)}t • Hao ${f.lossPercent}% • Thu hồi ${f.avgRecoveryPercent}%</text>
      `;
    })
    .join('\n');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    <rect x="1" y="1" width="${width - 2}" height="${height - 2}" rx="14" fill="#FFFFFF" stroke="#CBD5E1" stroke-width="1.5"/>
    <rect x="1" y="1" width="${width - 2}" height="52" rx="14" fill="#FFF1F2"/>
    <text x="18" y="27" font-family="${CHART_FONT}" font-size="15" font-weight="800" fill="#881337">HIỆU SUẤT &amp; HAO HỤT THEO CƠ SỞ SẤY</text>
    <text x="18" y="45" font-family="${CHART_FONT}" font-size="11" fill="#9F1239">Khối lượng tiếp nhận (tấn), % hao hụt cân nhập và % thu hồi sau sấy</text>
    ${bars}
  </svg>`;
}

export function buildMillingDonutSvg(milling: MillingProgressStat): string {
  return buildDonutSvg({
    title: 'TIẾN ĐỘ XAY SÁT & PHÂN BỔ KÊNH XAY',
    subtitle: `Đã xay: ${milling.milledLots}/${milling.totalLots} lô (${milling.milledPercentByWeight}%) • Lưu kho BQ: ${milling.avgStorageDays} ngày`,
    centerLabel: 'Đã Xay',
    centerValue: `${milling.milledPercentByWeight}%`,
    slices: [
      { label: 'Lúa tươi xay Máy 1', value: milling.freshMilledMay1Kg, displayValue: `${fmtTons(milling.freshMilledMay1Kg)}t`, color: '#059669' },
      { label: 'Lúa tươi xay Máy 2', value: milling.freshMilledMay2Kg, displayValue: `${fmtTons(milling.freshMilledMay2Kg)}t`, color: '#0891B2' },
      { label: 'Lúa tươi xay NSX', value: milling.freshMilledNsxKg, displayValue: `${fmtTons(milling.freshMilledNsxKg)}t`, color: '#2563EB' },
      { label: 'Lúa khô đã xay', value: milling.dryMilledKg, displayValue: `${fmtTons(milling.dryMilledKg)}t`, color: '#7C3AED' },
      { label: 'Tồn tươi chưa xay', value: milling.unmilledFreshKg, displayValue: `${fmtTons(milling.unmilledFreshKg)}t`, color: '#F59E0B' },
      { label: 'Tồn khô chưa xay', value: milling.unmilledDryKg, displayValue: `${fmtTons(milling.unmilledDryKg)}t`, color: '#EF4444' },
    ],
  });
}

export function buildFinancialDonutSvg(financial: FinancialSummaryStat): string {
  const slices = financial.banks.slice(0, 7).map((b, idx) => ({
    label: b.bank,
    value: Math.max(0, b.totalPaid),
    displayValue: fmtMoneyShort(b.totalPaid),
    color: PALETTE[idx % PALETTE.length],
  }));

  return buildDonutSvg({
    title: 'PHÂN BỔ THANH TOÁN THEO NGÂN HÀNG',
    subtitle: `Tổng tiền hàng: ${fmtMoneyShort(financial.totalAmount)} • Tạm ứng: ${fmtMoneyShort(financial.totalAdvance)} • Trừ cọc: ${fmtMoneyShort(financial.totalDepositDeducted)}`,
    centerLabel: 'Thực Trả',
    centerValue: fmtMoneyShort(financial.totalPayable),
    slices,
  });
}

export interface RiceChartSvgSpecs {
  daily: { svg: string; width: number; height: number };
  variety: { svg: string; width: number; height: number };
  buyer: { svg: string; width: number; height: number };
  region: { svg: string; width: number; height: number };
  cost: { svg: string; width: number; height: number };
  facility: { svg: string; width: number; height: number };
  milling: { svg: string; width: number; height: number };
  financial: { svg: string; width: number; height: number };
}

export function buildAllChartSvgSpecs(stats: RiceMonthlyStatsResult): RiceChartSvgSpecs {
  const periodLabel = stats.monthKey === 'ALL' ? 'CẢ NĂM 2026' : `THÁNG ${stats.monthKey}`;
  return {
    daily: { svg: buildDailyStackedChartSvg(stats.dailyTrend, periodLabel), width: 900, height: 320 },
    variety: { svg: buildVarietyDonutSvg(stats.varieties), width: 620, height: 320 },
    buyer: { svg: buildBuyerRankingSvg(stats.buyers), width: 640, height: 340 },
    region: { svg: buildRegionChartSvg(stats.regions), width: 620, height: 340 },
    cost: { svg: buildCostDonutSvg(stats.costBreakdown), width: 620, height: 320 },
    facility: { svg: buildFacilityLossSvg(stats.facilities), width: 680, height: 310 },
    milling: { svg: buildMillingDonutSvg(stats.milling), width: 620, height: 320 },
    financial: { svg: buildFinancialDonutSvg(stats.financial), width: 620, height: 320 },
  };
}
