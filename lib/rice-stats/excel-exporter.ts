import ExcelJS from 'exceljs';
import { RiceMonthlyStatsResult } from './types';
import { renderAllChartsServerFallback } from './excel-chart-renderer';

const FONT = 'Arial';

const THIN_BORDER: Partial<ExcelJS.Borders> = {
  top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
  bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
  left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
  right: { style: 'thin', color: { argb: 'FFCBD5E1' } },
};

function setupSheetPrint(ws: ExcelJS.Worksheet, tabColorArgb: string) {
  ws.properties.tabColor = { argb: tabColorArgb };
  ws.views = [{ showGridLines: true }];
  ws.pageSetup = {
    paperSize: 9, // A4
    orientation: 'landscape',
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
  };
}

function addBanner(
  ws: ExcelJS.Worksheet,
  colCount: number,
  title: string,
  subtitle: string,
  accentArgb: string
) {
  const lastCol = ws.getColumn(colCount).letter;

  ws.mergeCells(`A1:${lastCol}1`);
  const r1 = ws.getRow(1);
  r1.height = 24;
  const c1 = ws.getCell('A1');
  c1.value = 'CÔNG TY TNHH XUẤT NHẬP KHẨU CHƠN CHÍNH • HỆ THỐNG THỐNG KÊ LÚA NỘI BỘ';
  c1.font = { name: FONT, size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
  c1.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: accentArgb } };
  c1.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };

  ws.mergeCells(`A2:${lastCol}2`);
  const r2 = ws.getRow(2);
  r2.height = 30;
  const c2 = ws.getCell('A2');
  c2.value = title;
  c2.font = { name: FONT, size: 15, bold: true, color: { argb: 'FF0F172A' } };
  c2.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
  c2.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };

  ws.mergeCells(`A3:${lastCol}3`);
  const r3 = ws.getRow(3);
  r3.height = 20;
  const c3 = ws.getCell('A3');
  c3.value = subtitle;
  c3.font = { name: FONT, size: 10, italic: true, color: { argb: 'FF475569' } };
  c3.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
  c3.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
  c3.border = { bottom: { style: 'medium', color: { argb: accentArgb } } };
}

function styleTableHeader(row: ExcelJS.Row, colCount: number, fillArgb: string) {
  row.height = 28;
  for (let c = 1; c <= colCount; c++) {
    const cell = row.getCell(c);
    cell.font = { name: FONT, size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fillArgb } };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.border = THIN_BORDER;
  }
}

function styleDataRow(
  row: ExcelJS.Row,
  colCount: number,
  isEven: boolean,
  options?: { numCols?: number[]; decimalCols?: number[]; pctCols?: number[]; boldCols?: number[]; isTotal?: boolean; totalFillArgb?: string }
) {
  row.height = options?.isTotal ? 26 : 22;
  const bg = options?.isTotal
    ? options.totalFillArgb || 'FFE2E8F0'
    : isEven
    ? 'FFF8FAFC'
    : 'FFFFFFFF';

  for (let c = 1; c <= colCount; c++) {
    const cell = row.getCell(c);
    const isBold = options?.isTotal || options?.boldCols?.includes(c);
    cell.font = {
      name: FONT,
      size: 10,
      bold: Boolean(isBold),
      color: { argb: 'FF0F172A' },
    };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
    cell.border = THIN_BORDER;

    if (options?.numCols?.includes(c)) {
      cell.numFmt = '#,##0';
      cell.alignment = { horizontal: 'right', vertical: 'middle' };
    } else if (options?.decimalCols?.includes(c)) {
      cell.numFmt = '#,##0.00';
      cell.alignment = { horizontal: 'right', vertical: 'middle' };
    } else if (options?.pctCols?.includes(c)) {
      cell.numFmt = '0.00"%"';
      cell.alignment = { horizontal: 'right', vertical: 'middle' };
    } else {
      cell.alignment = { horizontal: c === 1 ? 'left' : 'center', vertical: 'middle' };
    }
  }
}

function addSectionHeading(ws: ExcelJS.Worksheet, rowIdx: number, colCount: number, text: string, accentArgb: string) {
  const lastCol = ws.getColumn(colCount).letter;
  ws.mergeCells(`A${rowIdx}:${lastCol}${rowIdx}`);
  const row = ws.getRow(rowIdx);
  row.height = 24;
  const cell = row.getCell(1);
  cell.value = text;
  cell.font = { name: FONT, size: 11, bold: true, color: { argb: accentArgb } };
  cell.alignment = { horizontal: 'left', vertical: 'middle' };
  cell.border = { bottom: { style: 'thin', color: { argb: accentArgb } } };
}

function embedChartImage(
  wb: ExcelJS.Workbook,
  ws: ExcelJS.Worksheet,
  pngBuffer: Buffer,
  col: number,
  row: number,
  width: number,
  height: number
) {
  const imageId = wb.addImage({
    buffer: pngBuffer as unknown as ExcelJS.Buffer,
    extension: 'png',
  });
  ws.addImage(imageId, {
    tl: { col, row },
    ext: { width, height },
  });
}

export async function buildRiceStatsExcelBuffer(
  stats: RiceMonthlyStatsResult,
  clientChartImages?: Record<string, string>
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'XNK Chơn Chính';
  wb.created = new Date();

  const periodLabel = stats.monthKey === 'ALL' ? 'CẢ NĂM 2026' : `THÁNG ${stats.monthKey}`;
  const exportTime = `Xuất lúc: ${new Date().toLocaleString('vi-VN')}`;

  // Ưu tiên ảnh PNG render chuẩn font Unicode từ trình duyệt; fallback sharp trên server
  const charts = await renderAllChartsServerFallback(stats, clientChartImages);
  const {
    daily: dailyPng,
    variety: varietyPng,
    buyer: buyerPng,
    region: regionPng,
    cost: costPng,
    facility: facilityPng,
    milling: millingPng,
    financial: financialPng,
  } = charts;

  // ============================================================================
  // SHEET 1: TỔNG QUAN & CƠ CẤU LOẠI LÚA
  // ============================================================================
  const ws1 = wb.addWorksheet('1. Tong Quan & Loai Lua');
  setupSheetPrint(ws1, 'FF059669');
  ws1.columns = [
    { width: 26 },
    { width: 14 },
    { width: 14 },
    { width: 17 },
    { width: 17 },
    { width: 17 },
    { width: 14 },
    { width: 18 },
    { width: 14 },
    { width: 14 },
  ];
  addBanner(
    ws1,
    10,
    `BÁO CÁO TỔNG QUAN & CƠ CẤU LOẠI LÚA — ${periodLabel}`,
    `Tổng hợp số liệu Lúa Tươi & Lúa Khô • ${exportTime}`,
    'FF065F46'
  );

  // KPI Cards Row (Rows 5-6)
  const kpiCards = [
    { cols: 'A5:B5', valCols: 'A6:B6', label: 'TỔNG SẢN LƯỢNG NHẬP', val: `${(stats.overview.combinedTotalKg / 1000).toLocaleString('vi-VN', { maximumFractionDigits: 2 })} tấn`, bg: 'FFECFDF5', fg: 'FF065F46' },
    { cols: 'C5:D5', valCols: 'C6:D6', label: 'TỔNG TIỀN & CHI PHÍ', val: `${Math.round(stats.costBreakdown.grandTotalCost).toLocaleString('vi-VN')} đ`, bg: 'FFEFF6FF', fg: 'FF1E40AF' },
    { cols: 'E5:F5', valCols: 'E6:F6', label: 'HAO HỤT CÂN NHẬP', val: `${Math.round(stats.totalFreshLossKg + stats.totalDryLossKg).toLocaleString('vi-VN')} kg (${stats.totalFreshLossPercent}%)`, bg: 'FFFFF1F2', fg: 'FF9F1239' },
    { cols: 'G5:H5', valCols: 'G6:H6', label: 'TIẾN ĐỘ XAY SÁT', val: `${stats.milling.milledPercentByWeight}% (${stats.milling.milledLots}/${stats.milling.totalLots} lô)`, bg: 'FFF5F3FF', fg: 'FF5B21B6' },
    { cols: 'I5:J5', valCols: 'I6:J6', label: 'CHƯA THANH TOÁN', val: `${stats.financial.unpaidCount} lô (${Math.round(stats.financial.unpaidAmount).toLocaleString('vi-VN')} đ)`, bg: 'FFFFFBEB', fg: 'FF92400E' },
  ];
  ws1.getRow(5).height = 19;
  ws1.getRow(6).height = 26;
  for (const k of kpiCards) {
    ws1.mergeCells(k.cols);
    ws1.mergeCells(k.valCols);
    const lc = ws1.getCell(k.cols.split(':')[0]);
    lc.value = k.label;
    lc.font = { name: FONT, size: 9, bold: true, color: { argb: 'FF475569' } };
    lc.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: k.bg } };
    lc.alignment = { horizontal: 'center', vertical: 'middle' };
    lc.border = { top: { style: 'thin', color: { argb: 'FFCBD5E1' } }, left: { style: 'thin', color: { argb: 'FFCBD5E1' } }, right: { style: 'thin', color: { argb: 'FFCBD5E1' } } };

    const vc = ws1.getCell(k.valCols.split(':')[0]);
    vc.value = k.val;
    vc.font = { name: FONT, size: 11, bold: true, color: { argb: k.fg } };
    vc.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: k.bg } };
    vc.alignment = { horizontal: 'center', vertical: 'middle' };
    vc.border = { bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } }, left: { style: 'thin', color: { argb: 'FFCBD5E1' } }, right: { style: 'thin', color: { argb: 'FFCBD5E1' } } };
  }

  // Summary table
  addSectionHeading(ws1, 8, 10, 'I. TỔNG HỢP SẢN LƯỢNG NHẬP TRONG KỲ', 'FF065F46');
  const s1H = ws1.getRow(9);
  s1H.values = ['PHÂN LOẠI LÚA', 'SỐ LÔ', 'SẢN LƯỢNG (KG)', 'SẢN LƯỢNG (TẤN)', 'THÀNH TIỀN LÚA (VNĐ)', 'ĐƠN GIÁ BQ (Đ/KG)'];
  styleTableHeader(s1H, 6, 'FF0F766E');

  const ovRows = [
    ['Lúa Tươi Nhập Sấy', stats.overview.freshLots, stats.overview.freshTotalKg, Number((stats.overview.freshTotalKg / 1000).toFixed(2)), stats.overview.freshTotalAmount, stats.overview.freshAvgPrice],
    ['Lúa Khô Mua Trực Tiếp', stats.overview.dryLots, stats.overview.dryTotalKg, Number((stats.overview.dryTotalKg / 1000).toFixed(2)), stats.overview.dryTotalAmount, stats.overview.dryAvgPrice],
    ['TỔNG CỘNG TOÀN KỲ', stats.overview.combinedTotalLots, stats.overview.combinedTotalKg, Number((stats.overview.combinedTotalKg / 1000).toFixed(2)), stats.overview.combinedTotalAmount, stats.overview.combinedTotalKg > 0 ? Math.round(stats.overview.combinedTotalAmount / stats.overview.combinedTotalKg) : 0],
  ];
  ovRows.forEach((vals, idx) => {
    const r = ws1.getRow(10 + idx);
    r.values = vals;
    styleDataRow(r, 6, idx % 2 === 1, {
      numCols: [2, 3, 5, 6],
      decimalCols: [4],
      boldCols: [1],
      isTotal: idx === 2,
      totalFillArgb: 'FFD1FAE5',
    });
  });

  // Varieties table
  addSectionHeading(ws1, 14, 10, 'II. CƠ CẤU & ĐƠN GIÁ THEO TỪNG LOẠI LÚA', 'FF1D4ED8');
  const vHeader = ws1.getRow(15);
  vHeader.values = ['LOẠI LÚA', 'NGUỒN', 'SỐ LÔ', 'LÚA TƯƠI (KG)', 'LÚA KHÔ (KG)', 'TỔNG (KG)', 'TỶ TRỌNG', 'THÀNH TIỀN (VNĐ)', 'GIÁ BQ', 'MIN - MAX'];
  styleTableHeader(vHeader, 10, 'FF1D4ED8');

  stats.varieties.forEach((v, idx) => {
    const r = ws1.getRow(16 + idx);
    r.values = [
      v.variety,
      v.source,
      v.lots,
      v.freshKg,
      v.dryKg,
      v.totalKg,
      v.sharePercent,
      v.totalAmount,
      v.avgPrice,
      `${v.minPrice.toLocaleString('vi-VN')} - ${v.maxPrice.toLocaleString('vi-VN')}`,
    ];
    styleDataRow(r, 10, idx % 2 === 1, {
      numCols: [3, 4, 5, 6, 8, 9],
      pctCols: [7],
      boldCols: [1, 6],
    });
  });

  const s1ChartTopRow = 17 + stats.varieties.length;
  addSectionHeading(ws1, s1ChartTopRow, 10, 'III. BIỂU ĐỒ MINH HỌA TRỰC QUAN', 'FF0F766E');
  embedChartImage(wb, ws1, dailyPng, 0, s1ChartTopRow + 1, 760, 270);
  embedChartImage(wb, ws1, varietyPng, 5.2, s1ChartTopRow + 1, 520, 270);

  // ============================================================================
  // SHEET 2: NHÂN VIÊN THU MUA, NHÀ CUNG CẤP & VÙNG
  // ============================================================================
  const ws2 = wb.addWorksheet('2. Thu Mua & Vung');
  setupSheetPrint(ws2, 'FFD97706');
  ws2.columns = [
    { width: 28 },
    { width: 12 },
    { width: 16 },
    { width: 12 },
    { width: 16 },
    { width: 18 },
    { width: 22 },
    { width: 14 },
    { width: 14 },
  ];
  addBanner(ws2, 9, `NHÂN VIÊN THU MUA, NHÀ CUNG CẤP & VÙNG NGUYÊN LIỆU — ${periodLabel}`, exportTime, 'FFB45309');

  addSectionHeading(ws2, 5, 9, 'I. BẢNG XẾP HẠNG NHÂN VIÊN THU MUA', 'FFB45309');
  const bHead = ws2.getRow(6);
  bHead.values = ['NHÂN VIÊN THU MUA', 'LÔ TƯƠI', 'LÚA TƯƠI (KG)', 'LÔ KHÔ', 'LÚA KHÔ (KG)', 'TỔNG KG', 'TỔNG TIỀN (VNĐ)', 'GIÁ BQ', '% HAO HỤT'];
  styleTableHeader(bHead, 9, 'FFB45309');

  stats.buyers.forEach((b, idx) => {
    const r = ws2.getRow(7 + idx);
    r.values = [b.buyer, b.freshLots, b.freshKg, b.dryLots, b.dryKg, b.totalKg, b.totalAmount, b.avgPrice, b.avgLossPercent];
    styleDataRow(r, 9, idx % 2 === 1, { numCols: [2, 3, 4, 5, 6, 7, 8], pctCols: [9], boldCols: [1, 6] });
  });

  const regHeadingRow = 8 + stats.buyers.length;
  addSectionHeading(ws2, regHeadingRow, 9, 'II. THỐNG KÊ THEO VÙNG / ĐỊA ĐIỂM CÂN', 'FF0369A1');
  const regHead = ws2.getRow(regHeadingRow + 1);
  regHead.values = ['VÙNG / ĐỊA ĐIỂM CÂN', 'SỐ LÔ', 'LÚA TƯƠI (KG)', 'LÚA KHÔ (KG)', 'TỔNG KG', 'TỔNG CƯỚC VC (VNĐ)', 'CƯỚC BQ (Đ/KG)'];
  styleTableHeader(regHead, 7, 'FF0369A1');

  const topRegions = stats.regions.slice(0, 35);
  topRegions.forEach((reg, idx) => {
    const r = ws2.getRow(regHeadingRow + 2 + idx);
    r.values = [reg.region, reg.lots, reg.freshKg, reg.dryKg, reg.totalKg, reg.totalFreight, reg.avgFreightPerKg];
    styleDataRow(r, 7, idx % 2 === 1, { numCols: [2, 3, 4, 5, 6, 7], boldCols: [1, 5] });
  });

  const s2ChartRow = regHeadingRow + 3 + topRegions.length;
  addSectionHeading(ws2, s2ChartRow, 9, 'III. BIỂU ĐỒ XẾP HẠNG THU MUA & VÙNG NGUYÊN LIỆU', 'FFB45309');
  embedChartImage(wb, ws2, buyerPng, 0, s2ChartRow + 1, 560, 300);
  embedChartImage(wb, ws2, regionPng, 4.5, s2ChartRow + 1, 550, 300);

  // ============================================================================
  // SHEET 3: CHI PHÍ & GIÁ THÀNH THỰC TẾ
  // ============================================================================
  const ws3 = wb.addWorksheet('3. Chi Phi & Gia Thanh');
  setupSheetPrint(ws3, 'FF4F46E5');
  ws3.columns = [{ width: 18 }, { width: 38 }, { width: 22 }, { width: 32 }];
  addBanner(ws3, 4, `PHÂN TÍCH CHI PHÍ & GIÁ THÀNH THỰC TẾ — ${periodLabel}`, exportTime, 'FF4338CA');

  addSectionHeading(ws3, 5, 4, 'I. CẤU THÀNH CHI PHÍ LÚA TƯƠI & LÚA KHÔ VỀ TỚI NHÀ MÁY', 'FF4338CA');
  const cHead = ws3.getRow(6);
  cHead.values = ['NHÓM LÚA', 'KHOẢN MỤC CHI PHÍ', 'SỐ TIỀN (VNĐ)', 'GHI CHÚ / ĐƠN GIÁ'];
  styleTableHeader(cHead, 4, 'FF4338CA');

  const cb = stats.costBreakdown;
  const costRows: [string, string, number, string, boolean][] = [
    ['Lúa Tươi', 'Tiền lúa lọt lòng phương tiện', cb.fresh.riceAmount, '', false],
    ['Lúa Tươi', 'Cước vận chuyển mua vào', cb.fresh.inboundFreight, '', false],
    ['Lúa Tươi', 'Cước tăng bo lúa tươi nhập sấy', cb.fresh.transshipmentFreight, '', false],
    ['Lúa Tươi', 'Công đoàn bốc xếp tăng bo', cb.fresh.laborUnionCost, '', false],
    ['Lúa Tươi', 'Tiền sấy (đã gồm VAT 5%)', cb.fresh.dryingCostVat5, '', false],
    ['Lúa Tươi', 'Tiền xuất trả (đã gồm VAT 8%)', cb.fresh.exportReturnCostVat8, '', false],
    ['Lúa Tươi', 'TỔNG CHI PHÍ LÚA TƯƠI', cb.fresh.totalAllCosts, `Giá thành BQ: ${cb.fresh.realUnitCostPerKg.toLocaleString('vi-VN')} đ/kg`, true],
    ['Lúa Khô', 'Tiền lúa khô mua vào', cb.dry.riceAmount, '', false],
    ['Lúa Khô', 'Cước vận chuyển lúa khô', cb.dry.dryFreight, '', false],
    ['Lúa Khô', 'Chi phí khác', cb.dry.otherCosts, '', false],
    ['Lúa Khô', 'TỔNG CHI PHÍ LÚA KHÔ TỚI NHÀ MÁY', cb.dry.totalFactoryCost, `Giá thành BQ: ${cb.dry.realUnitCostPerKg.toLocaleString('vi-VN')} đ/kg`, true],
    ['TỔNG HỢP', 'TỔNG CHI PHÍ TOÀN BỘ TRONG KỲ', cb.grandTotalCost, 'Đã gồm toàn bộ tiền lúa, cước & sấy', true],
  ];

  costRows.forEach((cr, idx) => {
    const r = ws3.getRow(7 + idx);
    r.values = [cr[0], cr[1], cr[2], cr[3]];
    styleDataRow(r, 4, idx % 2 === 1, {
      numCols: [3],
      boldCols: [1, 2],
      isTotal: cr[4],
      totalFillArgb: cr[0] === 'TỔNG HỢP' ? 'FFE0E7FF' : 'FFF1F5F9',
    });
  });

  addSectionHeading(ws3, 20, 4, 'II. BIỂU ĐỒ CƠ CẤU TỶ TRỌNG CHI PHÍ', 'FF4338CA');
  embedChartImage(wb, ws3, costPng, 0, 21, 620, 320);

  // ============================================================================
  // SHEET 4: HAO HỤT, CƠ SỞ SẤY & KCS
  // ============================================================================
  const ws4 = wb.addWorksheet('4. Hao Hut & Say');
  setupSheetPrint(ws4, 'FFE11D48');
  ws4.columns = [
    { width: 22 }, { width: 13 }, { width: 18 }, { width: 22 }, { width: 16 },
    { width: 14 }, { width: 18 }, { width: 14 }, { width: 13 }, { width: 28 },
  ];
  addBanner(ws4, 10, `HAO HỤT CÂN NHẬP, CƠ SỞ SẤY & CẢNH BÁO — ${periodLabel}`, exportTime, 'FFBE123C');

  addSectionHeading(ws4, 5, 10, 'I. HIỆU SUẤT THEO CƠ SỞ SẤY', 'FFBE123C');
  const fHead = ws4.getRow(6);
  fHead.values = ['CƠ SỞ SẤY', 'SỐ LÔ', 'NHẬP TƯƠI (KG)', 'CÂN NHẬP SẤY (KG)', 'HAO HỤT (KG)', '% HAO HỤT', 'LÚA KHÔ SAU SẤY (KG)', '% THU HỒI BQ'];
  styleTableHeader(fHead, 8, 'FFBE123C');

  stats.facilities.forEach((f, idx) => {
    const r = ws4.getRow(7 + idx);
    r.values = [f.facility, f.lots, f.inputFreshKg, f.scaleDryInputKg, f.lossKg, f.lossPercent, f.outputDryKg, f.avgRecoveryPercent];
    styleDataRow(r, 8, idx % 2 === 1, { numCols: [2, 3, 4, 5, 7], pctCols: [6, 8], boldCols: [1] });
  });

  const facChartRow = 8 + stats.facilities.length;
  embedChartImage(wb, ws4, facilityPng, 0, facChartRow, 660, 290);

  const alertStartRow = facChartRow + 17;
  addSectionHeading(ws4, alertStartRow, 10, `II. DANH SÁCH CẢNH BÁO HAO HỤT CAO / CÂN LỖI (${stats.lossAlerts.length} LÔ)`, 'FF9F1239');
  const aHead = ws4.getRow(alertStartRow + 1);
  aHead.values = ['NGUỒN', 'NGÀY', 'MÃ LÔ', 'NHÀ CUNG CẤP', 'PHƯƠNG TIỆN', 'LOẠI LÚA', 'KHỐI LƯỢNG (KG)', 'HAO HỤT (KG)', '% HAO HỤT', 'LÝ DO CẢNH BÁO'];
  styleTableHeader(aHead, 10, 'FF9F1239');

  stats.lossAlerts.forEach((a, idx) => {
    const r = ws4.getRow(alertStartRow + 2 + idx);
    r.values = [a.source, a.date, a.lotCode, a.supplier, a.vehicle, a.variety, a.weightKg, a.lossKg, a.lossPercent, a.reason];
    styleDataRow(r, 10, idx % 2 === 1, { numCols: [7, 8], pctCols: [9], boldCols: [3, 8] });
    r.getCell(8).font = { name: FONT, size: 10, bold: true, color: { argb: 'FFBE123C' } };
  });

  // ============================================================================
  // SHEET 5: TIẾN ĐỘ XAY SÁT & LÔ CHƯA XAY
  // ============================================================================
  const ws5 = wb.addWorksheet('5. Tien Do Xay Sat');
  setupSheetPrint(ws5, 'FF047857');
  ws5.columns = [
    { width: 32 }, { width: 15 }, { width: 18 }, { width: 26 }, { width: 15 }, { width: 16 }, { width: 16 }, { width: 20 },
  ];
  addBanner(ws5, 8, `TIẾN ĐỘ XAY SÁT & DANH SÁCH LÔ CHƯA XAY — ${periodLabel}`, exportTime, 'FF047857');

  addSectionHeading(ws5, 5, 8, 'I. TỔNG HỢP TIẾN ĐỘ XAY SÁT', 'FF047857');
  const mHead = ws5.getRow(6);
  mHead.values = ['CHỈ TIÊU XAY SÁT', 'GIÁ TRỊ'];
  styleTableHeader(mHead, 2, 'FF047857');

  const millRows: [string, number, boolean][] = [
    ['Tổng số lô trong kỳ', stats.milling.totalLots, false],
    ['Số lô đã xay', stats.milling.milledLots, false],
    ['Số lô chưa xay', stats.milling.unmilledLots, false],
    ['Tỷ lệ đã xay theo sản lượng (%)', stats.milling.milledPercentByWeight, true],
    ['Lúa tươi xay Máy 1 (kg)', stats.milling.freshMilledMay1Kg, false],
    ['Lúa tươi xay Máy 2 (kg)', stats.milling.freshMilledMay2Kg, false],
    ['Lúa tươi xay NSX (kg)', stats.milling.freshMilledNsxKg, false],
    ['Lúa khô đã xay (kg)', stats.milling.dryMilledKg, false],
    ['Tồn lúa tươi chưa xay (kg)', stats.milling.unmilledFreshKg, false],
    ['Tồn lúa khô chưa xay (kg)', stats.milling.unmilledDryKg, false],
    ['Số ngày lưu kho trung bình', stats.milling.avgStorageDays, false],
  ];
  millRows.forEach((mr, idx) => {
    const r = ws5.getRow(7 + idx);
    r.values = [mr[0], mr[1]];
    styleDataRow(r, 2, idx % 2 === 1, {
      numCols: mr[2] || mr[0].includes('lưu kho') ? undefined : [2],
      pctCols: mr[2] ? [2] : undefined,
      decimalCols: mr[0].includes('lưu kho') ? [2] : undefined,
      boldCols: [1, 2],
    });
  });

  embedChartImage(wb, ws5, millingPng, 2.3, 5, 580, 295);

  addSectionHeading(ws5, 22, 8, `II. DANH SÁCH LÔ CHƯA CÓ NGÀY XAY (${stats.milling.unmilledLots} LÔ)`, 'FF065F46');
  const uHead = ws5.getRow(23);
  uHead.values = ['NGUỒN', 'NGÀY CÂN', 'MÃ LÔ', 'NHÀ CUNG CẤP', 'LOẠI LÚA', 'KHỐI LƯỢNG (KG)', 'NV THU MUA', 'CƠ SỞ'];
  styleTableHeader(uHead, 8, 'FF065F46');

  stats.milling.unmilledItems.forEach((u, idx) => {
    const r = ws5.getRow(24 + idx);
    r.values = [u.source, u.date, u.lotCode, u.supplier, u.variety, u.weightKg, u.buyer, u.facility];
    styleDataRow(r, 8, idx % 2 === 1, { numCols: [6], boldCols: [4, 6] });
  });

  // ============================================================================
  // SHEET 6: TÀI CHÍNH, TẠM ỨNG & CÔNG NỢ
  // ============================================================================
  const ws6 = wb.addWorksheet('6. Tai Chinh & Cong No');
  setupSheetPrint(ws6, 'FF7C3AED');
  ws6.columns = [
    { width: 22 }, { width: 15 }, { width: 18 }, { width: 26 }, { width: 16 },
    { width: 18 }, { width: 16 }, { width: 16 }, { width: 18 }, { width: 14 }, { width: 24 },
  ];
  addBanner(ws6, 11, `TÀI CHÍNH, TẠM ỨNG & CÔNG NỢ THANH TOÁN — ${periodLabel}`, exportTime, 'FF6D28D9');

  const fin = stats.financial;
  addSectionHeading(ws6, 5, 11, 'I. THANH TOÁN THEO NGÂN HÀNG', 'FF6D28D9');
  const bkHead = ws6.getRow(6);
  bkHead.values = ['NGÂN HÀNG', 'SỐ GIAO DỊCH', 'TỔNG THANH TOÁN (VNĐ)'];
  styleTableHeader(bkHead, 3, 'FF6D28D9');

  fin.banks.forEach((b, idx) => {
    const r = ws6.getRow(7 + idx);
    r.values = [b.bank, b.count, b.totalPaid];
    styleDataRow(r, 3, idx % 2 === 1, { numCols: [2, 3], boldCols: [1] });
  });

  embedChartImage(wb, ws6, financialPng, 3.3, 5, 590, 300);

  const debtStartRow = Math.max(22, 9 + fin.banks.length);
  addSectionHeading(ws6, debtStartRow, 11, `II. CẢNH BÁO CÔNG NỢ / CHƯA THANH TOÁN / HOÀN TIỀN (${fin.debtAlerts.length} LÔ)`, 'FF7C3AED');
  const dHead = ws6.getRow(debtStartRow + 1);
  dHead.values = ['NGUỒN', 'NGÀY CÂN', 'MÃ LÔ', 'NHÀ CUNG CẤP', 'NV THU MUA', 'TIỀN HÀNG', 'TẠM ỨNG', 'TRỪ CỌC', 'THANH TOÁN', 'NGÂN HÀNG', 'TRẠNG THÁI'];
  styleTableHeader(dHead, 11, 'FF7C3AED');

  fin.debtAlerts.forEach((d, idx) => {
    const r = ws6.getRow(debtStartRow + 2 + idx);
    r.values = [d.source, d.date, d.lotCode, d.supplier, d.buyer, d.amount, d.advance, d.depositDeducted, d.payable, d.bank, d.alertType];
    styleDataRow(r, 11, idx % 2 === 1, { numCols: [6, 7, 8, 9], boldCols: [4, 9] });
    r.getCell(9).font = {
      name: FONT,
      size: 10,
      bold: true,
      color: { argb: d.payable < 0 ? 'FFBE123C' : 'FFB45309' },
    };
  });

  const outBuf = await wb.xlsx.writeBuffer();
  return Buffer.from(outBuf);
}
