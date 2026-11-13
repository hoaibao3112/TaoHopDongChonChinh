import { NextRequest, NextResponse } from 'next/server';
import XLSX from 'xlsx-js-style';
import { isRequestAuthenticated } from '@/lib/auth';
import { CS1Batch, CS1ExportPayload } from '@/lib/rice-payroll/cs1-types';
import { CS1Worker } from '@/lib/rice-payroll/team-cs1-workers';
import { NhapTrauItem } from '@/lib/rice-payroll/nhap-types';

export const runtime = 'nodejs';

// ─── Font & Style constants ──────────────────────────────────────────────────
const FONT_NAME = 'Times New Roman';

const BORDER_THIN: XLSX.CellStyle['border'] = {
  top:    { style: 'thin', color: { rgb: '000000' } },
  bottom: { style: 'thin', color: { rgb: '000000' } },
  left:   { style: 'thin', color: { rgb: '000000' } },
  right:  { style: 'thin', color: { rgb: '000000' } },
};

const BORDER_MEDIUM_BOTTOM: XLSX.CellStyle['border'] = {
  top:    { style: 'thin',   color: { rgb: '000000' } },
  bottom: { style: 'medium', color: { rgb: '000000' } },
  left:   { style: 'thin',   color: { rgb: '000000' } },
  right:  { style: 'thin',   color: { rgb: '000000' } },
};

const FMT_MONEY  = '#,##0;\\-#,##0;\\-';
const FMT_NUMBER = '#,##0;\\-#,##0;\\-';

function styleTitle(isTotal = false): XLSX.CellStyle {
  return {
    font: { name: FONT_NAME, bold: true, sz: isTotal ? 11 : 13, color: { rgb: isTotal ? 'CC0000' : '1F3864' } },
    alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
    fill: { fgColor: { rgb: isTotal ? 'FFF2CC' : 'BDD7EE' }, patternType: 'solid' },
    border: BORDER_THIN,
  };
}

function styleHeader(): XLSX.CellStyle {
  return {
    font: { name: FONT_NAME, bold: true, sz: 10, color: { rgb: '1F3864' } },
    alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
    fill: { fgColor: { rgb: 'D6E4F0' }, patternType: 'solid' },
    border: BORDER_MEDIUM_BOTTOM,
  };
}

function styleData(align: 'left' | 'center' | 'right' = 'center', bold = false): XLSX.CellStyle {
  return {
    font: { name: FONT_NAME, bold, sz: 10 },
    alignment: { horizontal: align, vertical: 'center', wrapText: true },
    fill: { fgColor: { rgb: 'FFFFFF' }, patternType: 'solid' },
    border: BORDER_THIN,
  };
}

function styleMoney(bold = false): XLSX.CellStyle {
  return {
    font: { name: FONT_NAME, bold, sz: 10, color: { rgb: bold ? 'CC0000' : '000000' } },
    alignment: { horizontal: 'right', vertical: 'center' },
    fill: { fgColor: { rgb: bold ? 'FFF2CC' : 'FFFFFF' }, patternType: 'solid' },
    border: BORDER_THIN,
    numFmt: FMT_MONEY,
  };
}

function styleNumber(bold = false): XLSX.CellStyle {
  return {
    font: { name: FONT_NAME, bold, sz: 10, color: { rgb: bold ? 'CC0000' : '000000' } },
    alignment: { horizontal: 'right', vertical: 'center' },
    fill: { fgColor: { rgb: bold ? 'FFF2CC' : 'FFFFFF' }, patternType: 'solid' },
    border: BORDER_THIN,
    numFmt: FMT_NUMBER,
  };
}

function setCell(
  ws: XLSX.WorkSheet,
  addr: string,
  type: XLSX.ExcelDataType,
  value: string | number,
  style: XLSX.CellStyle,
  numFmt?: string,
) {
  ws[addr] = { t: type, v: value, s: style, ...(numFmt ? { z: numFmt } : {}) };
}

// ─── Tạo 4 Sheet chuẩn cho 1 đội (Nghị hoặc Nguyên) ─────────────────────────
function buildTeamSheets(
  wb: XLSX.WorkBook,
  teamName: 'NGHỊ' | 'NGUYÊN',
  month: number,
  year: number,
  teamBatches: CS1Batch[],
  workers: CS1Worker[],
  trauItems: NhapTrauItem[],
  waterDays: number,
  preparerName: string,
  approverName: string,
) {
  const mm = String(month).padStart(2, '0');
  const yyyy = String(year);
  const isNghi = teamName === 'NGHỊ';
  const teamLabel = isNghi ? 'ĐỘI NGHỊ' : 'ĐỘI NGUYÊN';

  // Thống kê lúa theo nhóm giá động từ dữ liệu mẻ sấy
  let totalFreshKg = 0;
  let totalDryKg = 0;
  let totalTons = 0;
  let totalMoneyLua = 0;

  teamBatches.forEach((b) => {
    totalFreshKg += b.freshWeightKg || 0;
    totalDryKg += b.dryWeightKg;
    totalTons += b.roundedTons;
    totalMoneyLua += b.thanhTien;
  });

  // Thống kê Trấu
  const trauOng5 = trauItems.filter((t) => t.phuongTien.toUpperCase().includes('ÔNG 5'));
  const tonsTrauOng5 = trauOng5.reduce((s, t) => s + t.soLuong, 0);
  const moneyTrauOng5 = trauOng5.reduce((s, t) => s + t.thanhTien, 0);
  const unitPriceOng5 = tonsTrauOng5 > 0 ? Math.round(moneyTrauOng5 / tonsTrauOng5) : 27273;

  const trauNgoai = trauItems.filter((t) => !t.phuongTien.toUpperCase().includes('ÔNG 5'));
  const tonsTrauNgoai = trauNgoai.reduce((s, t) => s + t.soLuong, 0);
  const moneyTrauNgoai = trauNgoai.reduce((s, t) => s + t.thanhTien, 0);
  const unitPriceNgoai = tonsTrauNgoai > 0 ? Math.round(moneyTrauNgoai / tonsTrauNgoai) : 27000;

  const totalMoneyTrau = moneyTrauOng5 + moneyTrauNgoai;
  const tienNuocDa = waterDays * 10_000;
  const tongQuyetToan = totalMoneyLua + totalMoneyTrau + tienNuocDa;
  const totalAdvance = workers.reduce((s, w) => s + (w.advanceSalary || 0), 0);
  const netRemaining = tongQuyetToan - totalAdvance;

  // =========================================================================
  // SHEET 1: Nhập Lúa
  // =========================================================================
  const ws1: XLSX.WorkSheet = {};
  ws1['!type'] = 'sheet';
  ws1['!cols'] = [
    { wch: 8 },  // A: SỐ HĐ
    { wch: 13 }, // B: NGÀY CÂN
    { wch: 12 }, // C: ĐỘI NHẬP
    { wch: 24 }, // D: KHÁCH HÀNG
    { wch: 15 }, // E: PHƯƠNG TIỆN
    { wch: 16 }, // F: LOẠI LÚA
    { wch: 14 }, // G: SỐ LƯỢNG (KG)
    { wch: 24 }, // H: PHƯƠNG TIỆN TĂNG BO LÚA TƯƠI
    { wch: 14 }, // I: NGÀY NHẬP SẤY
    { wch: 15 }, // J: ĐỊA ĐIỂM SẤY
    { wch: 15 }, // K: CÂN NHẬP SẤY (KG)
    { wch: 14 }, // L: CÂN NHẬP SẤY (TẤN)
    { wch: 16 }, // M: ĐƠN GIÁ SẤY
    { wch: 18 }, // N: THÀNH TIỀN
  ];
  ws1['!rows'] = [{ hpt: 36 }, { hpt: 26 }, { hpt: 45 }];

  const title1 = isNghi
    ? `NHẬP SẤY CƠ SỞ I - ĐỘI NGHỊ THÁNG ${mm}/${yyyy}`
    : `NHẬP SẤY CƠ SỞ I XNK ĐỘI NHẬP  ANH NGUYÊN  T${mm}/${yyyy}`;
  setCell(ws1, 'A1', 's', title1, {
    font: { name: FONT_NAME, bold: true, sz: 13, color: { rgb: '1F3864' } },
    alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
    fill: { fgColor: { rgb: 'BDD7EE' }, patternType: 'solid' },
    border: BORDER_THIN,
  });
  for (const c of ['B','C','D','E','F','G','H','I','J','K','L','M','N']) {
    setCell(ws1, `${c}1`, 's', '', { fill: { fgColor: { rgb: 'BDD7EE' }, patternType: 'solid' }, border: BORDER_THIN });
  }

  // Row 2: TỔNG CỘNG
  const totStyle = styleTitle(true);
  for (const c of ['A','B','C','D']) setCell(ws1, `${c}2`, 's', '', totStyle);
  setCell(ws1, 'E2', 's', 'TỔNG CỘNG', totStyle);
  setCell(ws1, 'F2', 's', '', totStyle);
  setCell(ws1, 'G2', 'n', totalFreshKg > 0 ? totalFreshKg : 0, { ...totStyle, numFmt: FMT_NUMBER });
  for (const c of ['H','I','J']) setCell(ws1, `${c}2`, 's', '', totStyle);
  setCell(ws1, 'K2', 'n', totalDryKg, { ...totStyle, numFmt: FMT_NUMBER });
  setCell(ws1, 'L2', 'n', totalTons, { ...totStyle, numFmt: FMT_NUMBER });
  setCell(ws1, 'M2', 's', '', totStyle);
  setCell(ws1, 'N2', 'n', totalMoneyLua, { ...totStyle, numFmt: FMT_MONEY });

  // Row 3: Headers
  const headers1: [string, string][] = [
    ['A3', 'SỐ HĐ'],
    ['B3', 'NGÀY\nCÂN'],
    ['C3', 'ĐỘI NHẬP'],
    ['D3', 'KHÁCH HÀNG'],
    ['E3', 'PHƯƠNG TIỆN'],
    ['F3', 'LOẠI LÚA'],
    ['G3', 'SỐ LƯỢNG\n(KG)'],
    ['H3', 'PHƯƠNG TIỆN TĂNG BO\nLÚA TƯƠI NHẬP SẤY'],
    ['I3', 'NGÀY NHẬP SẤY'],
    ['J3', 'ĐỊA ĐIỂM SẤY\n(CƠ SỞ SẤY)'],
    ['K3', 'CÂN NHẬP SẤY\n(KG)'],
    ['L3', 'CÂN NHẬP SẤY\n(TẤN)'],
    ['M3', 'ĐƠN GIÁ SẤY\n(VNĐ)'],
    ['N3', 'THÀNH TIỀN\n(VNĐ)'],
  ];
  for (const [addr, text] of headers1) {
    setCell(ws1, addr, 's', text, styleHeader());
  }

  // Rows 4.. Data
  teamBatches.forEach((b, idx) => {
    const r = idx + 4;
    ws1['!rows']!.push({ hpt: 20 });
    setCell(ws1, `A${r}`, 's', b.contractNo || String(idx + 1).padStart(2, '0'), styleData('center'));
    setCell(ws1, `B${r}`, 's', b.weighDate || '', styleData('center'));
    setCell(ws1, `C${r}`, 's', teamName, styleData('center'));
    setCell(ws1, `D${r}`, 's', b.customerName || '', styleData('left'));
    setCell(ws1, `E${r}`, 's', b.vehicleName || '', styleData('center'));
    setCell(ws1, `F${r}`, 's', b.riceType || '', styleData('center'));
    setCell(ws1, `G${r}`, 'n', b.freshWeightKg || 0, styleNumber());
    setCell(ws1, `H${r}`, 's', b.freshBoVehicle || '', styleData('center'));
    setCell(ws1, `I${r}`, 's', b.dryDate || '', styleData('center'));
    setCell(ws1, `J${r}`, 's', b.dryFacility || 'CƠ SỞ I', styleData('center'));
    setCell(ws1, `K${r}`, 'n', b.dryWeightKg, styleNumber());
    setCell(ws1, `L${r}`, 'n', b.roundedTons, styleNumber(true));
    setCell(ws1, `M${r}`, 'n', b.pricePerTon, styleMoney());
    setCell(ws1, `N${r}`, 'n', b.thanhTien, styleMoney(true));
  });

  const signRow1 = teamBatches.length + 6;
  const nameRow1 = signRow1 + 4;
  setCell(ws1, `D${signRow1}`, 's', 'Người lập bảng', { font: { name: FONT_NAME, bold: true, sz: 11 }, alignment: { horizontal: 'center' } });
  setCell(ws1, `J${signRow1}`, 's', 'Xác nhận', { font: { name: FONT_NAME, bold: true, sz: 11 }, alignment: { horizontal: 'center' } });
  setCell(ws1, `D${nameRow1}`, 's', preparerName, { font: { name: FONT_NAME, bold: true, sz: 11 }, alignment: { horizontal: 'center' } });
  setCell(ws1, `J${nameRow1}`, 's', approverName, { font: { name: FONT_NAME, bold: true, sz: 11 }, alignment: { horizontal: 'center' } });

  ws1['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 13 } }];
  ws1['!ref'] = `A1:N${nameRow1 + 1}`;
  const sheet1Name = isNghi ? 'Nhập lúa Anh Nghị' : 'Nhap lua CS1';
  XLSX.utils.book_append_sheet(wb, ws1, sheet1Name);

  // =========================================================================
  // SHEET 2: Nhập Trấu
  // =========================================================================
  const ws2: XLSX.WorkSheet = {};
  ws2['!type'] = 'sheet';
  ws2['!cols'] = [
    { wch: 6 },  // A: STT
    { wch: 14 }, // B: NGÀY
    { wch: 12 }, // C: ĐỘI NHẬP
    { wch: 20 }, // D: PHƯƠNG TIỆN
    { wch: 14 }, // E: SỐ LƯỢNG (TẤN)
    { wch: 16 }, // F: ĐƠN GIÁ
    { wch: 18 }, // G: THÀNH TIỀN
  ];
  ws2['!rows'] = [{ hpt: 30 }, { hpt: 24 }, { hpt: 26 }];

  const title2 = isNghi
    ? `NHẬP TRẤU CS 1- ĐỘI NGHỊ THÁNG ${mm}/${yyyy}`
    : `NHẬP TRẤU ĐỘI NGUYÊN THÁNG ${mm} CS1/${yyyy}`;
  setCell(ws2, 'A1', 's', title2, {
    font: { name: FONT_NAME, bold: true, sz: 13, color: { rgb: '1F3864' } },
    alignment: { horizontal: 'center', vertical: 'center' },
    fill: { fgColor: { rgb: 'BDD7EE' }, patternType: 'solid' },
    border: BORDER_THIN,
  });
  for (const c of ['B','C','D','E','F','G']) {
    setCell(ws2, `${c}1`, 's', '', { fill: { fgColor: { rgb: 'BDD7EE' }, patternType: 'solid' }, border: BORDER_THIN });
  }

  // Row 2: TỔNG CỘNG
  setCell(ws2, 'A2', 's', '', totStyle);
  setCell(ws2, 'B2', 's', 'TỔNG CỘNG :', totStyle);
  for (const c of ['C','D']) setCell(ws2, `${c}2`, 's', '', totStyle);
  setCell(ws2, 'E2', 'n', tonsTrauOng5 + tonsTrauNgoai, { ...totStyle, numFmt: FMT_NUMBER });
  setCell(ws2, 'F2', 's', '', totStyle);
  setCell(ws2, 'G2', 'n', totalMoneyTrau, { ...totStyle, numFmt: FMT_MONEY });

  // Row 3: Headers
  const headers2: [string, string][] = [
    ['A3', 'STT'],
    ['B3', 'NGÀY'],
    ['C3', 'ĐỘI NHẬP'],
    ['D3', 'PHƯƠNG TIỆN'],
    ['E3', 'SỐ LƯỢNG'],
    ['F3', 'ĐƠN GIÁ'],
    ['G3', 'THÀNH TIỀN'],
  ];
  for (const [addr, text] of headers2) setCell(ws2, addr, 's', text, styleHeader());

  trauItems.forEach((t, idx) => {
    const r = idx + 4;
    ws2['!rows']!.push({ hpt: 20 });
    setCell(ws2, `A${r}`, 'n', idx + 1, styleData('center'));
    setCell(ws2, `B${r}`, 's', t.date, styleData('center'));
    setCell(ws2, `C${r}`, 's', teamName, styleData('center'));
    setCell(ws2, `D${r}`, 's', t.phuongTien, styleData('left'));
    setCell(ws2, `E${r}`, 'n', t.soLuong, styleNumber(true));
    setCell(ws2, `F${r}`, 'n', t.donGia, styleMoney());
    setCell(ws2, `G${r}`, 'n', t.thanhTien, styleMoney(true));
  });

  ws2['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 6 } }];
  ws2['!ref'] = `A1:G${trauItems.length + 5}`;
  const sheet2Name = isNghi ? 'Nhập Trấu' : 'Nhập Trấu Nguyên';
  XLSX.utils.book_append_sheet(wb, ws2, sheet2Name);

  // =========================================================================
  // SHEET 3: Ứng Lương
  // =========================================================================
  const ws3: XLSX.WorkSheet = {};
  ws3['!type'] = 'sheet';
  ws3['!cols'] = [
    { wch: 6 },  // A: STT
    { wch: 28 }, // B: HỌ & TÊN
    { wch: 18 }, // C: TẠM ỨNG
    { wch: 18 }, // D: STK
    { wch: 24 }, // E: NGÂN HÀNG
    { wch: 24 }, // F: CHỦ TK
  ];
  ws3['!rows'] = [{ hpt: 30 }, { hpt: 26 }];

  const title3 = `DANH SÁCH ỨNG LƯƠNG ${teamLabel} NHẬP SẤY CƠ SỞ 1 THÁNG ${mm}/${yyyy}`;
  setCell(ws3, 'A1', 's', title3, {
    font: { name: FONT_NAME, bold: true, sz: 13, color: { rgb: '1F3864' } },
    alignment: { horizontal: 'center', vertical: 'center' },
    fill: { fgColor: { rgb: 'BDD7EE' }, patternType: 'solid' },
    border: BORDER_THIN,
  });
  for (const c of ['B','C','D','E','F']) setCell(ws3, `${c}1`, 's', '', { fill: { fgColor: { rgb: 'BDD7EE' }, patternType: 'solid' }, border: BORDER_THIN });

  setCell(ws3, 'A2', 's', 'STT', styleHeader());
  setCell(ws3, 'B2', 's', 'HỌ & TÊN', styleHeader());
  setCell(ws3, 'C2', 's', 'SỐ TIỀN\nTẠM ỨNG', styleHeader());
  setCell(ws3, 'D2', 's', 'SỐ TÀI KHOẢN', styleHeader());
  setCell(ws3, 'E2', 's', 'NGÂN HÀNG', styleHeader());
  setCell(ws3, 'F2', 's', 'CHỦ TÀI KHOẢN', styleHeader());

  workers.forEach((w, idx) => {
    const r = idx + 3;
    ws3['!rows']!.push({ hpt: 22 });
    setCell(ws3, `A${r}`, 'n', idx + 1, styleData('center'));
    setCell(ws3, `B${r}`, 's', w.name, styleData('left', true));
    setCell(ws3, `C${r}`, 'n', w.advanceSalary, styleMoney(true));
    setCell(ws3, `D${r}`, 's', w.accountNumber, styleData('center'));
    setCell(ws3, `E${r}`, 's', w.bankName, styleData('left'));
    setCell(ws3, `F${r}`, 's', w.accountHolder, styleData('left'));
  });

  const totAdvRow = workers.length + 3;
  setCell(ws3, `A${totAdvRow}`, 's', '', totStyle);
  setCell(ws3, `B${totAdvRow}`, 's', 'TỔNG CỘNG', totStyle);
  setCell(ws3, `C${totAdvRow}`, 'n', totalAdvance, { ...totStyle, numFmt: FMT_MONEY });
  for (const c of ['D','E','F']) setCell(ws3, `${c}${totAdvRow}`, 's', '', totStyle);

  ws3['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 5 } }];
  ws3['!ref'] = `A1:F${totAdvRow + 2}`;
  const sheet3Name = `ỨL ${teamLabel} T${mm}.${yyyy}`;
  XLSX.utils.book_append_sheet(wb, ws3, sheet3Name);

  // =========================================================================
  // SHEET 4: Chi Lương & Bảng Kê Quyết Toán
  // =========================================================================
  const ws4: XLSX.WorkSheet = {};
  ws4['!type'] = 'sheet';
  ws4['!cols'] = [
    { wch: 6 },  // A: STT
    { wch: 30 }, // B: HỌ & TÊN
    { wch: 16 }, // C: SỐ TIỀN
    { wch: 18 }, // D: TẠM ỨNG
    { wch: 18 }, // E: CÒN LẠI
    { wch: 18 }, // F: SỐ TÀI KHOẢN
    { wch: 24 }, // G: NGÂN HÀNG
    { wch: 24 }, // H: CHỦ TÀI KHOẢN
  ];
  ws4['!rows'] = [{ hpt: 30 }, { hpt: 26 }];

  const title4 = `DANH SÁCH CHI LƯƠNG ${teamLabel} NHẬP SẤY CƠ SỞ 1 THÁNG ${mm}/${yyyy}`;
  setCell(ws4, 'A1', 's', title4, {
    font: { name: FONT_NAME, bold: true, sz: 13, color: { rgb: '1F3864' } },
    alignment: { horizontal: 'center', vertical: 'center' },
    fill: { fgColor: { rgb: 'BDD7EE' }, patternType: 'solid' },
    border: BORDER_THIN,
  });
  for (const c of ['B','C','D','E','F','G','H']) setCell(ws4, `${c}1`, 's', '', { fill: { fgColor: { rgb: 'BDD7EE' }, patternType: 'solid' }, border: BORDER_THIN });

  setCell(ws4, 'A2', 's', 'STT', styleHeader());
  setCell(ws4, 'B2', 's', 'HỌ & TÊN', styleHeader());
  setCell(ws4, 'C2', 's', 'SỐ TIỀN', styleHeader());
  setCell(ws4, 'D2', 's', 'SỐ TIỀN\nTẠM ỨNG', styleHeader());
  setCell(ws4, 'E2', 's', 'CÒN LẠI', styleHeader());
  setCell(ws4, 'F2', 's', 'SỐ TÀI KHOẢN', styleHeader());
  setCell(ws4, 'G2', 's', 'NGÂN HÀNG', styleHeader());
  setCell(ws4, 'H2', 's', 'CHỦ TÀI KHOẢN', styleHeader());

  let totalPaidWorkers = 0;
  workers.forEach((w, idx) => {
    const r = idx + 3;
    const salary = w.salaryAmount || 0;
    const remaining = salary - (w.advanceSalary || 0);
    totalPaidWorkers += salary;
    ws4['!rows']!.push({ hpt: 22 });
    setCell(ws4, `A${r}`, 'n', idx + 1, styleData('center'));
    setCell(ws4, `B${r}`, 's', w.name, styleData('left', true));
    setCell(ws4, `C${r}`, 'n', salary, styleMoney());
    setCell(ws4, `D${r}`, 'n', w.advanceSalary, styleMoney());
    setCell(ws4, `E${r}`, 'n', remaining, styleMoney(true));
    setCell(ws4, `F${r}`, 's', w.accountNumber, styleData('center'));
    setCell(ws4, `G${r}`, 's', w.bankName, styleData('left'));
    setCell(ws4, `H${r}`, 's', w.accountHolder, styleData('left'));
  });

  const totWorkerRow = workers.length + 3;
  setCell(ws4, `A${totWorkerRow}`, 's', '', totStyle);
  setCell(ws4, `B${totWorkerRow}`, 's', 'TỔNG CỘNG', totStyle);
  setCell(ws4, `C${totWorkerRow}`, 'n', totalPaidWorkers, { ...totStyle, numFmt: FMT_MONEY });
  setCell(ws4, `D${totWorkerRow}`, 'n', totalAdvance, { ...totStyle, numFmt: FMT_MONEY });
  setCell(ws4, `E${totWorkerRow}`, 'n', totalPaidWorkers - totalAdvance, { ...totStyle, numFmt: FMT_MONEY });
  for (const c of ['F','G','H']) setCell(ws4, `${c}${totWorkerRow}`, 's', '', totStyle);

  // Chữ ký
  const signRow4 = totWorkerRow + 3;
  const nameRow4 = signRow4 + 4;
  setCell(ws4, `B${signRow4}`, 's', 'Người lập bảng', { font: { name: FONT_NAME, bold: true, sz: 11 }, alignment: { horizontal: 'center' } });
  setCell(ws4, `F${signRow4}`, 's', 'Xác nhận', { font: { name: FONT_NAME, bold: true, sz: 11 }, alignment: { horizontal: 'center' } });
  setCell(ws4, `B${nameRow4}`, 's', preparerName, { font: { name: FONT_NAME, bold: true, sz: 11 }, alignment: { horizontal: 'center' } });
  setCell(ws4, `F${nameRow4}`, 's', approverName, { font: { name: FONT_NAME, bold: true, sz: 11 }, alignment: { horizontal: 'center' } });

  // Bảng kê quyết toán lương phía dưới
  const sumHeaderRow = nameRow4 + 2;
  const sumTitle = `BẢNG KÊ ${teamLabel} NHẬP SẤY CƠ SỞ 1 THÁNG ${mm}/${yyyy}`;
  setCell(ws4, `B${sumHeaderRow}`, 's', sumTitle, {
    font: { name: FONT_NAME, bold: true, sz: 12, color: { rgb: '1F3864' } },
    alignment: { horizontal: 'center', vertical: 'center' },
    fill: { fgColor: { rgb: 'BDD7EE' }, patternType: 'solid' },
    border: BORDER_THIN,
  });
  for (const c of ['C','D','E']) setCell(ws4, `${c}${sumHeaderRow}`, 's', '', { fill: { fgColor: { rgb: 'BDD7EE' }, patternType: 'solid' }, border: BORDER_THIN });

  const rHead = sumHeaderRow + 1;
  setCell(ws4, `B${rHead}`, 's', 'NHẬP+XUẤT', styleHeader());
  setCell(ws4, `C${rHead}`, 's', 'SỐ LƯỢNG (TẤN)', styleHeader());
  setCell(ws4, `D${rHead}`, 's', 'ĐƠN GIÁ (ĐỒNG/TẤN)', styleHeader());
  setCell(ws4, `E${rHead}`, 's', 'THÀNH TIỀN', styleHeader());

  // Nhóm các mẻ lúa theo đơn giá thực tế đã tính
  const priceGroupMap = new Map<number, { types: Set<string>; tons: number; money: number }>();
  teamBatches.forEach((b) => {
    const price = b.pricePerTon || 20000;
    const grp = priceGroupMap.get(price) || { types: new Set<string>(), tons: 0, money: 0 };
    if (b.riceType) grp.types.add(b.riceType.trim());
    grp.tons += b.roundedTons;
    grp.money += b.thanhTien;
    priceGroupMap.set(price, grp);
  });
  const sortedPriceGroups = Array.from(priceGroupMap.entries()).sort((a, b) => a[0] - b[0]);

  let currentR = rHead;
  if (sortedPriceGroups.length > 0) {
    sortedPriceGroups.forEach(([price, grp]) => {
      currentR++;
      const typeListStr = Array.from(grp.types).slice(0, 6).join(', ');
      const label = `NHẬP LÚA ${typeListStr ? `(${typeListStr})` : ''}`;
      setCell(ws4, `B${currentR}`, 's', label, styleData('left'));
      setCell(ws4, `C${currentR}`, 'n', grp.tons, styleNumber(true));
      setCell(ws4, `D${currentR}`, 'n', price, styleMoney());
      setCell(ws4, `E${currentR}`, 'n', grp.money, styleMoney(true));
    });
  } else {
    currentR++;
    setCell(ws4, `B${currentR}`, 's', 'NHẬP LÚA (OM18, JAPO, THƠM LÀI...)', styleData('left'));
    setCell(ws4, `C${currentR}`, 'n', 0, styleNumber(true));
    setCell(ws4, `D${currentR}`, 'n', 20000, styleMoney());
    setCell(ws4, `E${currentR}`, 'n', 0, styleMoney(true));
  }

  // Dòng: Trấu Ông 5
  currentR++;
  setCell(ws4, `B${currentR}`, 's', 'NHẬP TRẤU ÔNG 5', styleData('left'));
  setCell(ws4, `C${currentR}`, 'n', tonsTrauOng5, styleNumber(true));
  setCell(ws4, `D${currentR}`, 'n', unitPriceOng5, styleMoney());
  setCell(ws4, `E${currentR}`, 'n', moneyTrauOng5, styleMoney(true));

  // Dòng: Trấu ghe ngoài
  currentR++;
  setCell(ws4, `B${currentR}`, 's', 'NHẬP TRẤU GHE NGOÀI', styleData('left'));
  setCell(ws4, `C${currentR}`, 'n', tonsTrauNgoai, styleNumber(true));
  setCell(ws4, `D${currentR}`, 'n', unitPriceNgoai, styleMoney());
  setCell(ws4, `E${currentR}`, 'n', moneyTrauNgoai, styleMoney(true));

  // Dòng: Nước đá
  currentR++;
  setCell(ws4, `B${currentR}`, 's', 'NƯỚC ĐÁ (10.000Đ/ngày làm việc)', styleData('left'));
  setCell(ws4, `C${currentR}`, 'n', waterDays, styleNumber(true));
  setCell(ws4, `D${currentR}`, 'n', 10_000, styleMoney());
  setCell(ws4, `E${currentR}`, 'n', tienNuocDa, styleMoney(true));

  // Tổng cộng
  currentR++;
  setCell(ws4, `B${currentR}`, 's', 'TỔNG CỘNG :', styleData('left', true));
  setCell(ws4, `C${currentR}`, 's', '', styleData());
  setCell(ws4, `D${currentR}`, 's', '', styleData());
  setCell(ws4, `E${currentR}`, 'n', tongQuyetToan, styleMoney(true));

  // Trừ ứng
  currentR++;
  setCell(ws4, `B${currentR}`, 's', 'TRỪ ỨNG :', styleData('left', true));
  setCell(ws4, `C${currentR}`, 's', '', styleData());
  setCell(ws4, `D${currentR}`, 's', '', styleData());
  setCell(ws4, `E${currentR}`, 'n', totalAdvance, styleMoney());

  // Còn lại
  currentR++;
  setCell(ws4, `B${currentR}`, 's', 'CÒN LẠI :', {
    ...styleData('left', true),
    font: { name: FONT_NAME, bold: true, sz: 11, color: { rgb: 'CC0000' } },
    fill: { fgColor: { rgb: 'FFF2CC' }, patternType: 'solid' },
  });
  setCell(ws4, `C${currentR}`, 's', '', { fill: { fgColor: { rgb: 'FFF2CC' }, patternType: 'solid' }, border: BORDER_THIN });
  setCell(ws4, `D${currentR}`, 's', '', { fill: { fgColor: { rgb: 'FFF2CC' }, patternType: 'solid' }, border: BORDER_THIN });
  setCell(ws4, `E${currentR}`, 'n', netRemaining, {
    ...styleMoney(true),
    font: { name: FONT_NAME, bold: true, sz: 11, color: { rgb: 'CC0000' } },
    fill: { fgColor: { rgb: 'FFF2CC' }, patternType: 'solid' },
  });

  ws4['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 7 } },
    { s: { r: sumHeaderRow - 1, c: 1 }, e: { r: sumHeaderRow - 1, c: 4 } },
  ];
  ws4['!ref'] = `A1:H${currentR + 1}`;
  const sheet4Name = `CL ${teamLabel} T${mm}.${yyyy}`;
  XLSX.utils.book_append_sheet(wb, ws4, sheet4Name);
}

// ─── POST handler ────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  if (!isRequestAuthenticated(req)) {
    return NextResponse.json({ error: 'Chưa xác thực phiên đăng nhập' }, { status: 401 });
  }

  try {
    const body: CS1ExportPayload = await req.json();
    const {
      month = 10,
      year = 2026,
      targetTeam = 'ALL',
      batches = [],
      workersNghi = [],
      workersNguyen = [],
      trauNghi = [],
      trauNguyen = [],
      waterDaysNghi = 13,
      waterDaysNguyen = 13,
      preparerName = 'Võ Hoàng Cẩm Tiên',
      approverName = 'Huỳnh Hải Long Hồ',
    } = body;

    const mm = String(month).padStart(2, '0');
    const yyyy = String(year);
    const wb = XLSX.utils.book_new();

    const batchesNghi = batches.filter((b) => b.doiNhap === 'NGHỊ');
    const batchesNguyen = batches.filter((b) => b.doiNhap === 'NGUYÊN');

    let fileName = '';

    if (targetTeam === 'NGHỊ') {
      buildTeamSheets(wb, 'NGHỊ', month, year, batchesNghi, workersNghi, trauNghi, waterDaysNghi, preparerName, approverName);
      fileName = `LUONG_THANG_${mm}_DOI_NGHI.xlsx`;
    } else if (targetTeam === 'NGUYÊN') {
      buildTeamSheets(wb, 'NGUYÊN', month, year, batchesNguyen, workersNguyen, trauNguyen, waterDaysNguyen, preparerName, approverName);
      fileName = `LUONG_THANG_${mm}_NGUYEN.xlsx`;
    } else {
      // Xuất cả 2 đội vào 1 file
      buildTeamSheets(wb, 'NGHỊ', month, year, batchesNghi, workersNghi, trauNghi, waterDaysNghi, preparerName, approverName);
      buildTeamSheets(wb, 'NGUYÊN', month, year, batchesNguyen, workersNguyen, trauNguyen, waterDaysNguyen, preparerName, approverName);
      fileName = `TONG_HOP_NHAP_SAY_CS1_T${mm}_${yyyy}.xlsx`;
    }

    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    return new NextResponse(buf, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${fileName}"`,
      },
    });
  } catch (error) {
    console.error('Lỗi xuất Excel CS1:', error);
    return NextResponse.json(
      { error: (error as Error).message || 'Không thể tạo file Excel CS1' },
      { status: 500 }
    );
  }
}

