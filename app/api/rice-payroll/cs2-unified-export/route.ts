import { NextRequest, NextResponse } from 'next/server';
import XLSX from 'xlsx-js-style';
import { finalizeWorkbookWithPrintSetup } from '@/lib/excel/excelPrintHelper';
import { isRequestAuthenticated } from '@/lib/auth';
import { NhapBatch, NhapTrauItem } from '@/lib/rice-payroll/nhap-types';
import { RiceBatch } from '@/lib/rice-payroll/types';
import { DOI_DUONG_WORKERS } from '@/lib/rice-payroll/team-duong-workers';
import { DEFAULT_OCTOBER_TRAU_ITEMS } from '@/lib/rice-payroll/nhap-trau-config';
import { roundRiceTons } from '@/lib/rice-payroll/rounding';
import { getDefaultClassification, getDefaultTons } from '@/lib/rice-payroll/sample-classification';

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
    font: { name: FONT_NAME, bold: true, sz: isTotal ? 12 : 13, color: { rgb: isTotal ? 'CC0000' : '1F3864' } },
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

function styleTons(highlight = false): XLSX.CellStyle {
  return {
    font: { name: FONT_NAME, bold: highlight, sz: 10, color: { rgb: highlight ? 'CC0000' : '000000' } },
    alignment: { horizontal: 'center', vertical: 'center' },
    fill: { fgColor: { rgb: highlight ? 'E2EFDA' : 'FFFFFF' }, patternType: 'solid' },
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

export interface CS2UnifiedExportPayload {
  month?: number;
  year?: number;
  nhapBatches?: NhapBatch[];
  xuatBatches?: RiceBatch[];
  trauItems?: NhapTrauItem[];
  chumLoUnitPrice?: number;
  managementSalary?: number;
  iceUnitPricePerDay?: number;
  workDaysCount?: number;
  workerAdvances?: Record<string, number>;
  customWorkerSalaries?: Record<string, number>;
}

export async function POST(req: NextRequest) {
  if (!isRequestAuthenticated(req)) {
    return NextResponse.json({ error: 'Chưa xác thực phiên đăng nhập' }, { status: 401 });
  }

  try {
    const body: CS2UnifiedExportPayload = await req.json();
    const {
      month = 10,
      year = 2026,
      nhapBatches = [],
      xuatBatches = [],
      chumLoUnitPrice = 11_000,
      managementSalary = 6_000_000,
      iceUnitPricePerDay = 10_000,
      workerAdvances = {},
      customWorkerSalaries = {},
    } = body;

    const isOct2026 = month === 10 && year === 2026;
    const trauItems = body.trauItems ?? (isOct2026 ? DEFAULT_OCTOBER_TRAU_ITEMS : []);

    const mm   = String(month).padStart(2, '0');
    const yy   = String(year).slice(-2);
    const yyyy = String(year);

    // ── 1. SẮP XẾP VÀ TÍNH TOÁN NHẬP SẤY ────────────────────────────────────
    const sortedNhap = [...nhapBatches].sort((a, b) => {
      const parseD = (s: string) => {
        const [d, m, y] = s.split('/').map(Number);
        return new Date(y, m - 1, d).getTime();
      };
      return parseD(a.dryDate) - parseD(b.dryDate);
    });

    const totalNhapKg            = sortedNhap.reduce((s, b) => s + b.dryWeightKg, 0);
    const totalNhapTons          = sortedNhap.reduce((s, b) => s + b.roundedTons, 0);
    const totalThanhTienNhap     = sortedNhap.reduce((s, b) => s + b.thanhTienNhap, 0);
    const totalThanhTienChumLo   = sortedNhap.reduce((s, b) => s + b.thanhTienChumLo, 0);
    const totalTongTienNhap      = totalThanhTienNhap + totalThanhTienChumLo;

    // Phân nhóm lúa nhập
    let tonsST25 = 0;
    let moneyST25 = 0;
    let tonsPhothong = 0;
    let moneyPhothong = 0;
    sortedNhap.forEach((b) => {
      const type = (b.riceType || '').toUpperCase();
      if (type.includes('ST25')) {
        tonsST25 += b.roundedTons;
        moneyST25 += b.thanhTienNhap ?? b.roundedTons * (b.pricePerTon || 23_000);
      } else {
        tonsPhothong += b.roundedTons;
        moneyPhothong += b.thanhTienNhap ?? b.roundedTons * (b.pricePerTon || 20_000);
      }
    });
    const unitPriceST25 = tonsST25 > 0 ? Math.round(moneyST25 / tonsST25) : 23_000;
    const unitPricePhothong = tonsPhothong > 0 ? Math.round(moneyPhothong / tonsPhothong) : 20_000;

    // ── 2. SẮP XẾP VÀ TÍNH TOÁN XUẤT LÚA ────────────────────────────────────
    const sortedXuat = [...xuatBatches].sort((a, b) => {
      const parseD = (s: string) => {
        if (!s) return 0;
        const [d, m, y] = s.split('/').map(Number);
        return new Date(y, m - 1, d).getTime();
      };
      return parseD(a.dischargeDate || a.weighDate || '') - parseD(b.dischargeDate || b.weighDate || '');
    });

    let tonsCoTro = 0;
    let tonsKhongTro = 0;
    sortedXuat.forEach((b) => {
      const isCo = (b as unknown as { customIsCoTro?: boolean }).customIsCoTro !== undefined
        ? Boolean((b as unknown as { customIsCoTro?: boolean }).customIsCoTro)
        : getDefaultClassification(b);
      const t = (b as unknown as { customTons?: number }).customTons !== undefined
        ? Number((b as unknown as { customTons?: number }).customTons)
        : getDefaultTons(b);
      if (isCo) tonsCoTro += t;
      else tonsKhongTro += t;
    });

    const moneyCoTro = tonsCoTro * 20_000;
    const moneyKhongTro = tonsKhongTro * 16_000;
    const totalXuatMoney = moneyCoTro + moneyKhongTro;
    const totalXuatTons = tonsCoTro + tonsKhongTro;
    const totalXuatKg = sortedXuat.reduce((s, b) => s + (b.dryWeightKg || 0), 0);

    // ── 3. TÍNH TOÁN TRẤU & CHI PHÍ KHÁC ────────────────────────────────────
    const trauOng5 = trauItems.filter((t) => (t.phuongTien || '').toUpperCase().includes('ÔNG 5'));
    const tonsTrauOng5 = trauOng5.reduce((s, t) => s + t.soLuong, 0);
    const moneyTrauOng5 = trauOng5.reduce((s, t) => s + t.thanhTien, 0);

    const trauNgoai = trauItems.filter((t) => !(t.phuongTien || '').toUpperCase().includes('ÔNG 5'));
    const tonsTrauNgoai = trauNgoai.reduce((s, t) => s + t.soLuong, 0);
    const moneyTrauNgoai = trauNgoai.reduce((s, t) => s + t.thanhTien, 0);

    const totalTrauTons = tonsTrauOng5 + tonsTrauNgoai;
    const totalTrauMoney = moneyTrauOng5 + moneyTrauNgoai;

    // Số ngày làm việc (nước đá)
    const nhapDates = sortedNhap.map((b) => b.dryDate).filter(Boolean);
    const xuatDates = sortedXuat.map((b) => b.dischargeDate).filter(Boolean);
    const allWorkDates = Array.from(new Set([...nhapDates, ...xuatDates]));
    const workDays = body.workDaysCount ?? (allWorkDates.length > 0 ? allWorkDates.length : 22);
    const totalTienNuocDa = workDays * iceUnitPricePerDay;

    // TỔNG TIỀN QUYẾT TOÁN CẢ NHẬP + XUẤT + TRẤU + CHỤM LÒ + QL + NƯỚC ĐÁ
    const totalNhapVaXuatMoney = moneyPhothong + moneyST25 + moneyTrauOng5 + moneyTrauNgoai + moneyCoTro + moneyKhongTro;
    const totalTienCanChi = totalNhapVaXuatMoney + totalThanhTienChumLo + managementSalary + totalTienNuocDa;

    // TỔNG HỢP CÔNG NHÂN & TẠM ỨNG
    const workers = DOI_DUONG_WORKERS;
    let totalAdvanceMoney = 0;
    workers.forEach((w) => {
      const adv = workerAdvances[w.name] !== undefined
        ? workerAdvances[w.name]
        : (isOct2026 ? (w.sampleOctoberAdvance ?? 0) : 0);
      totalAdvanceMoney += adv;
    });

    const wb = XLSX.utils.book_new();

    // =========================================================================
    // SHEET 1: Nhap lua CS2
    // =========================================================================
    const ws1: XLSX.WorkSheet = {};
    ws1['!type'] = 'sheet';
    ws1['!cols'] = [
      { wch: 10 }, { wch: 18 }, { wch: 16 }, { wch: 22 }, { wch: 13 },
      { wch: 12 }, { wch: 13 }, { wch: 11 }, { wch: 13 }, { wch: 16 },
      { wch: 16 }, { wch: 16 }, { wch: 18 },
    ];
    ws1['!rows'] = [{ hpt: 36 }, { hpt: 48 }, { hpt: 60 }];

    const titleText1 = `BẢNG KÊ NHẬP SẤY CƠ SỞ II XNK CHƠN CHÍNH ĐỘI DƯƠNG T${mm}/${yyyy}`;
    setCell(ws1, 'A1', 's', titleText1, {
      font: { name: FONT_NAME, bold: true, sz: 14, color: { rgb: '1F3864' } },
      alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
      fill: { fgColor: { rgb: 'BDD7EE' }, patternType: 'solid' },
      border: BORDER_THIN,
    });
    for (const c of ['B','C','D','E','F','G','H','I','J','K','L','M']) {
      setCell(ws1, `${c}1`, 's', '', { fill: { fgColor: { rgb: 'BDD7EE' }, patternType: 'solid' }, border: BORDER_THIN });
    }

    const totStyle1 = styleTitle(true);
    setCell(ws1, 'A2', 's', 'TỔNG CỘNG', totStyle1);
    for (const c of ['B','C','D','E','F']) setCell(ws1, `${c}2`, 's', '', totStyle1);
    setCell(ws1, 'G2', 'n', totalNhapKg,          { ...totStyle1, numFmt: FMT_NUMBER });
    setCell(ws1, 'H2', 'n', totalNhapTons,        { ...totStyle1, numFmt: FMT_NUMBER });
    setCell(ws1, 'I2', 's', '', totStyle1);
    setCell(ws1, 'J2', 'n', totalThanhTienNhap,   { ...totStyle1, numFmt: FMT_MONEY });
    setCell(ws1, 'K2', 's', '', totStyle1);
    setCell(ws1, 'L2', 'n', totalThanhTienChumLo, { ...totStyle1, numFmt: FMT_MONEY });
    setCell(ws1, 'M2', 'n', totalTongTienNhap,    { ...totStyle1, numFmt: FMT_MONEY });

    const headers1: [string, string][] = [
      ['A3', 'ĐỢI NHẬP'],
      ['B3', 'KHÁCH HÀNG'],
      ['C3', 'LOẠI LÚA'],
      ['D3', 'PHƯƠNG TIỆN TĂNG BO\nLÚA TƯƠI NHẬP SẤY'],
      ['E3', 'NGÀY NHẬP\nSẤY'],
      ['F3', 'ĐỊA ĐIỂM SẤY\n(CƠ SỞ SẤY)'],
      ['G3', 'CÂN NHẬP\nSẤY (KG)'],
      ['H3', 'CÂN NHẬP\nSẤY (TẤN)'],
      ['I3', 'ĐƠN GIÁ NHẬP\nSẤY (VNĐ)'],
      ['J3', 'THÀNH TIỀN\nNHẬP SẤY (VNĐ)'],
      ['K3', `ĐƠN GIÁ CHỤM LÒ\n(${chumLoUnitPrice.toLocaleString('vi-VN')}Đ/TẤN)\nÁp dụng cho tất cả các loại lúa`],
      ['L3', 'THÀNH TIỀN\nCHỤM LÒ'],
      ['M3', 'TỔNG CỘNG\nTHÀNH TIỀN (VNĐ)'],
    ];
    for (const [addr, text] of headers1) setCell(ws1, addr, 's', text, styleHeader());

    sortedNhap.forEach((batch, idx) => {
      const row = idx + 4;
      const tongTien = batch.thanhTienNhap + batch.thanhTienChumLo;
      ws1['!rows']!.push({ hpt: 20 });
      setCell(ws1, `A${row}`, 's', batch.doiNhap || 'DƯƠNG', styleData('center'));
      setCell(ws1, `B${row}`, 's', batch.customerName,    styleData('left'));
      setCell(ws1, `C${row}`, 's', batch.riceType,        styleData('center'));
      setCell(ws1, `D${row}`, 's', batch.freshBoVehicle,  styleData('center'));
      setCell(ws1, `E${row}`, 's', batch.dryDate,         styleData('center'));
      setCell(ws1, `F${row}`, 's', batch.dryFacility || 'CƠ SỞ II', styleData('center'));
      setCell(ws1, `G${row}`, 'n', batch.dryWeightKg,     { ...styleData('right'), numFmt: FMT_NUMBER });
      setCell(ws1, `H${row}`, 'n', batch.roundedTons,     styleTons());
      setCell(ws1, `I${row}`, 'n', batch.pricePerTon,     { ...styleMoney(), numFmt: FMT_MONEY });
      setCell(ws1, `J${row}`, 'n', batch.thanhTienNhap,   { ...styleMoney(), numFmt: FMT_MONEY });
      setCell(ws1, `K${row}`, 'n', batch.chumLoUnitPrice, { ...styleMoney(), numFmt: FMT_MONEY });
      setCell(ws1, `L${row}`, 'n', batch.thanhTienChumLo, { ...styleMoney(), numFmt: FMT_MONEY });
      setCell(ws1, `M${row}`, 'n', tongTien,              { ...styleMoney(true), numFmt: FMT_MONEY });
    });

    const lastRowNhap = sortedNhap.length + 3;
    const signRowNhap1 = lastRowNhap + 3;
    const signRowNhap2 = signRowNhap1 + 3;
    setCell(ws1, `B${signRowNhap1}`, 's', 'Người lập bảng', { font: { name: FONT_NAME, bold: true, sz: 11 }, alignment: { horizontal: 'center' } });
    setCell(ws1, `K${signRowNhap1}`, 's', 'Xác nhận', { font: { name: FONT_NAME, bold: true, sz: 11 }, alignment: { horizontal: 'center' } });
    setCell(ws1, `B${signRowNhap2}`, 's', 'Võ Hoàng Cẩm Tiên', { font: { name: FONT_NAME, bold: true, sz: 11 }, alignment: { horizontal: 'center' } });
    setCell(ws1, `K${signRowNhap2}`, 's', 'Huỳnh Hải Long Hồ', { font: { name: FONT_NAME, bold: true, sz: 11 }, alignment: { horizontal: 'center' } });

    ws1['!merges'] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: 12 } },
      { s: { r: 1, c: 0 }, e: { r: 1, c: 5 } },
    ];
    ws1['!ref'] = `A1:M${signRowNhap2 + 2}`;
    XLSX.utils.book_append_sheet(wb, ws1, 'Nhap lua CS2');

    // =========================================================================
    // SHEET 2: XUẤT LÚA
    // =========================================================================
    const ws2: XLSX.WorkSheet = {};
    ws2['!type'] = 'sheet';
    ws2['!cols'] = [
      { wch: 12 }, { wch: 18 }, { wch: 18 }, { wch: 20 }, { wch: 14 },
      { wch: 13 }, { wch: 20 }, { wch: 13 }, { wch: 14 }, { wch: 13 },
      { wch: 11 }, { wch: 14 }, { wch: 20 }, { wch: 12 }, { wch: 13 },
      { wch: 14 }, { wch: 16 }, { wch: 14 }, { wch: 16 }, { wch: 18 },
    ];
    ws2['!rows'] = [{ hpt: 36 }, { hpt: 12 }, { hpt: 32 }, { hpt: 55 }];

    const titleText2 = `BẢNG KÊ XUẤT LÚA  CƠ SỞ II XNK CHƠN CHÍNH ĐỘI DƯƠNG T${mm}/${yyyy}`;
    setCell(ws2, 'A1', 's', titleText2, {
      font: { name: FONT_NAME, bold: true, sz: 14, color: { rgb: '1F3864' } },
      alignment: { horizontal: 'center', vertical: 'center' },
      fill: { fgColor: { rgb: 'BDD7EE' }, patternType: 'solid' },
      border: BORDER_THIN,
    });
    for (const c of ['B','C','D','E','F','G','H','I','J','K','L','M','N','O','P','Q','R','S','T']) {
      setCell(ws2, `${c}1`, 's', '', { fill: { fgColor: { rgb: 'BDD7EE' }, patternType: 'solid' }, border: BORDER_THIN });
    }

    // Row 3: TỔNG CỘNG XUẤT
    const totStyle2 = styleTitle(true);
    setCell(ws2, 'A3', 's', 'TỔNG CỘNG', totStyle2);
    for (const c of ['B','C','D','E']) setCell(ws2, `${c}3`, 's', '', totStyle2);
    setCell(ws2, 'F3', 'n', totalXuatKg,       { ...totStyle2, numFmt: FMT_NUMBER });
    for (const c of ['G','H','I']) setCell(ws2, `${c}3`, 's', '', totStyle2);
    setCell(ws2, 'J3', 'n', totalXuatKg,       { ...totStyle2, numFmt: FMT_NUMBER });
    setCell(ws2, 'K3', 'n', totalXuatTons,     { ...totStyle2, numFmt: FMT_NUMBER });
    for (const c of ['L','M','N','O','P']) setCell(ws2, `${c}3`, 's', '', totStyle2);
    setCell(ws2, 'Q3', 'n', moneyCoTro,        { ...totStyle2, numFmt: FMT_MONEY });
    setCell(ws2, 'R3', 's', '', totStyle2);
    setCell(ws2, 'S3', 'n', moneyKhongTro,     { ...totStyle2, numFmt: FMT_MONEY });
    setCell(ws2, 'T3', 'n', totalXuatMoney,    { ...totStyle2, numFmt: FMT_MONEY });

    // Row 4: Headers Xuất
    const headers2: [string, string][] = [
      ['A4', 'NGÀY \nCÂN'],
      ['B4', 'NHÂN VIÊN \nTHU MUA'],
      ['C4', 'KHÁCH HÀNG'],
      ['D4', 'PHƯƠNG TIỆN'],
      ['E4', 'LOẠI LÚA'],
      ['F4', 'SỐ LƯỢNG\n(KG)'],
      ['G4', 'PHƯƠNG TIỆN TĂNG BO\nLÚA TƯƠI NHẬP SẤY'],
      ['H4', 'NGÀY NHẬP SẤY'],
      ['I4', 'ĐỊA ĐIỂM SẤY\n(CƠ SỞ SẤY)'],
      ['J4', 'CÂN NHẬP SẤY\n(KG)'],
      ['K4', 'CÂN NHẬP SẤY\n(TẤN)'],
      ['L4', 'NGÀY\nXUỐNG LÚA KHÔ\n(NHẬN XUẤT TRẢ)'],
      ['M4', 'PHƯƠNG TIỆN CHỞ LÚA KHÔ\n(TĂNG BO SAU SẤY)'],
      ['N4', 'TRỞ MẺ\n6.000/TẤN'],
      ['O4', 'THÀNH TIỀN'],
      ['P4', 'ĐƠN GIÁ \nXUẤT+TRỞ\n(20.000đ/TẤN)'],
      ['Q4', 'THÀNH TIỀN XUẤT+TRỞ\n'],
      ['R4', 'XUẤT KHÔNG TRỞ\n16.000/TẤN'],
      ['S4', 'THÀNH TIỀN\nXUẤT KHÔNG TRỞ'],
      ['T4', 'TỔNG\nTHÀNH TIỀN'],
    ];
    for (const [addr, text] of headers2) setCell(ws2, addr, 's', text, styleHeader());

    sortedXuat.forEach((batch, idx) => {
      const row = idx + 5;
      ws2['!rows']!.push({ hpt: 20 });
      const isCo = (batch as unknown as { customIsCoTro?: boolean }).customIsCoTro !== undefined
        ? Boolean((batch as unknown as { customIsCoTro?: boolean }).customIsCoTro)
        : getDefaultClassification(batch);
      const tons = (batch as unknown as { customTons?: number }).customTons !== undefined
        ? Number((batch as unknown as { customTons?: number }).customTons)
        : getDefaultTons(batch);
      const kg = batch.dryWeightKg || 0;
      const thanhTien = isCo ? tons * 20_000 : tons * 16_000;

      setCell(ws2, `A${row}`, 's', batch.weighDate || '',       styleData('center'));
      setCell(ws2, `B${row}`, 's', batch.purchaser || batch.customerName || '', styleData('left'));
      setCell(ws2, `C${row}`, 's', batch.customerName || '',    styleData('left'));
      setCell(ws2, `D${row}`, 's', batch.vehicleName || '',     styleData('center'));
      setCell(ws2, `E${row}`, 's', batch.riceType || '',        styleData('center'));
      setCell(ws2, `F${row}`, 'n', batch.freshWeightKg || kg,   { ...styleData('right'), numFmt: FMT_NUMBER });
      setCell(ws2, `G${row}`, 's', batch.freshBoVehicle || '',  styleData('center'));
      setCell(ws2, `H${row}`, 's', batch.dryDate || '',         styleData('center'));
      setCell(ws2, `I${row}`, 's', batch.dryFacility || 'CƠ SỞ II', styleData('center'));
      setCell(ws2, `J${row}`, 'n', kg,                          { ...styleData('right'), numFmt: FMT_NUMBER });
      setCell(ws2, `K${row}`, 'n', tons,                        styleTons());
      setCell(ws2, `L${row}`, 's', batch.dischargeDate || '',   styleData('center'));
      setCell(ws2, `M${row}`, 's', batch.dryVehicle || '',      styleData('center'));
      setCell(ws2, `N${row}`, 's', '',                          styleData('center'));
      setCell(ws2, `O${row}`, 's', '',                          styleData('center'));
      setCell(ws2, `P${row}`, 'n', isCo ? 20000 : 0,            { ...styleMoney(), numFmt: FMT_MONEY });
      setCell(ws2, `Q${row}`, 'n', isCo ? tons * 20000 : 0,     { ...styleMoney(), numFmt: FMT_MONEY });
      setCell(ws2, `R${row}`, 'n', !isCo ? 16000 : 0,           { ...styleMoney(), numFmt: FMT_MONEY });
      setCell(ws2, `S${row}`, 'n', !isCo ? tons * 16000 : 0,    { ...styleMoney(), numFmt: FMT_MONEY });
      setCell(ws2, `T${row}`, 'n', thanhTien,                   { ...styleMoney(true), numFmt: FMT_MONEY });
    });

    const lastRowXuat = sortedXuat.length + 4;
    const signRowXuat1 = lastRowXuat + 3;
    const signRowXuat2 = signRowXuat1 + 3;
    setCell(ws2, `C${signRowXuat1}`, 's', 'Người lập bảng', { font: { name: FONT_NAME, bold: true, sz: 11 }, alignment: { horizontal: 'center' } });
    setCell(ws2, `M${signRowXuat1}`, 's', 'Xác nhận', { font: { name: FONT_NAME, bold: true, sz: 11 }, alignment: { horizontal: 'center' } });
    setCell(ws2, `C${signRowXuat2}`, 's', 'Võ Hoàng Cẩm Tiên', { font: { name: FONT_NAME, bold: true, sz: 11 }, alignment: { horizontal: 'center' } });
    setCell(ws2, `M${signRowXuat2}`, 's', 'Huỳnh Hải Long Hồ', { font: { name: FONT_NAME, bold: true, sz: 11 }, alignment: { horizontal: 'center' } });

    ws2['!merges'] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: 19 } },
      { s: { r: 2, c: 0 }, e: { r: 2, c: 4 } },
    ];
    ws2['!ref'] = `A1:T${signRowXuat2 + 2}`;
    XLSX.utils.book_append_sheet(wb, ws2, 'XUẤT LÚA');

    // =========================================================================
    // SHEET 3: Nhập Trấu
    // =========================================================================
    const ws3: XLSX.WorkSheet = {};
    ws3['!type'] = 'sheet';
    ws3['!cols'] = [{ wch: 14 }, { wch: 14 }, { wch: 22 }, { wch: 14 }, { wch: 14 }, { wch: 18 }];
    ws3['!rows'] = [{ hpt: 32 }, { hpt: 10 }, { hpt: 26 }, { hpt: 26 }];

    const titleText3 = `NHẬP TRẤU ĐỘI DƯƠNG CS2 ${yyyy}`;
    setCell(ws3, 'A1', 's', titleText3, {
      font: { name: FONT_NAME, bold: true, sz: 13, color: { rgb: '1F3864' } },
      alignment: { horizontal: 'left', vertical: 'center' },
    });

    const totStyle3 = styleTitle(true);
    setCell(ws3, 'A3', 's', 'TỔNG CỘNG :', totStyle3);
    for (const c of ['B','C']) setCell(ws3, `${c}3`, 's', '', totStyle3);
    setCell(ws3, 'D3', 'n', totalTrauTons,  { ...totStyle3, numFmt: FMT_NUMBER });
    setCell(ws3, 'E3', 's', '', totStyle3);
    setCell(ws3, 'F3', 'n', totalTrauMoney, { ...totStyle3, numFmt: FMT_MONEY });

    const headers3 = ['NGÀY', 'ĐỘI NHẬP', 'PHƯƠNG TIỆN', 'SỐ LƯỢNG (TẤN)', 'ĐƠN GIÁ', 'THÀNH TIỀN'];
    headers3.forEach((h, idx) => {
      const col = XLSX.utils.encode_col(idx);
      setCell(ws3, `${col}4`, 's', h, styleHeader());
    });

    trauItems.forEach((t, idx) => {
      const row = idx + 5;
      ws3['!rows']!.push({ hpt: 20 });
      setCell(ws3, `A${row}`, 's', t.date || (t as unknown as { ngay?: string }).ngay || '', styleData('center'));
      setCell(ws3, `B${row}`, 's', t.doiNhap || 'DƯƠNG', styleData('center'));
      setCell(ws3, `C${row}`, 's', t.phuongTien,   styleData('center'));
      setCell(ws3, `D${row}`, 'n', t.soLuong,      styleTons());
      setCell(ws3, `E${row}`, 'n', t.donGia,       { ...styleMoney(), numFmt: FMT_MONEY });
      setCell(ws3, `F${row}`, 'n', t.thanhTien,    { ...styleMoney(true), numFmt: FMT_MONEY });
    });

    ws3['!ref'] = `A1:F${trauItems.length + 8}`;
    XLSX.utils.book_append_sheet(wb, ws3, 'Nhập Trấu');

    // =========================================================================
    // SHEET 4: ỨL ĐỘI DƯƠNG-CS2-T{mm}.{yy}
    // =========================================================================
    const sheetNameUL = `ỨL ĐỘI DƯƠNG-CS2-T${mm}.${yy}`;
    const ws4: XLSX.WorkSheet = {};
    ws4['!type'] = 'sheet';
    ws4['!cols'] = [
      { wch: 6 }, { wch: 24 }, { wch: 18 }, { wch: 18 }, { wch: 18 }, { wch: 24 },
    ];
    ws4['!rows'] = [{ hpt: 32 }, { hpt: 28 }];

    const ulTitleText = `DANH SÁCH ỨNG LƯƠNG ĐỘI DƯƠNG NHẬP+XUẤT CƠ SỞ 2 THÁNG ${mm}/${yyyy}`;
    setCell(ws4, 'A1', 's', ulTitleText, {
      font: { name: FONT_NAME, bold: true, sz: 13, color: { rgb: '1F3864' } },
      alignment: { horizontal: 'center', vertical: 'center' },
      fill: { fgColor: { rgb: 'BDD7EE' }, patternType: 'solid' },
      border: BORDER_THIN,
    });
    for (const c of ['B','C','D','E','F']) {
      setCell(ws4, `${c}1`, 's', '', { fill: { fgColor: { rgb: 'BDD7EE' }, patternType: 'solid' }, border: BORDER_THIN });
    }

    const ulHeaders = ['STT', 'HỌ & TÊN', 'SỐ TIỀN\nTẠM ỨNG', 'SỐ TÀI KHOẢN', 'NGÂN HÀNG', 'CHỦ TÀI KHOẢN'];
    ulHeaders.forEach((h, idx) => {
      const col = XLSX.utils.encode_col(idx);
      setCell(ws4, `${col}2`, 's', h, styleHeader());
    });

    workers.forEach((w, idx) => {
      const row = idx + 3;
      const adv = workerAdvances[w.name] !== undefined
        ? workerAdvances[w.name]
        : (isOct2026 ? (w.sampleOctoberAdvance ?? 0) : 0);

      setCell(ws4, `A${row}`, 'n', w.stt,           styleData('center'));
      setCell(ws4, `B${row}`, 's', w.name,          styleData('left', true));
      setCell(ws4, `C${row}`, 'n', adv,             { ...styleMoney(adv > 0), numFmt: FMT_MONEY });
      setCell(ws4, `D${row}`, 's', w.stk,           styleData('center'));
      setCell(ws4, `E${row}`, 's', w.bank,          styleData('center'));
      setCell(ws4, `F${row}`, 's', w.accountHolder, styleData('center'));
    });

    const ulSumRow = workers.length + 3;
    const ulSumStyle = styleTitle(true);
    setCell(ws4, `A${ulSumRow}`, 's', '', ulSumStyle);
    setCell(ws4, `B${ulSumRow}`, 's', 'TỔNG CỘNG : ', ulSumStyle);
    setCell(ws4, `C${ulSumRow}`, 'n', totalAdvanceMoney, { ...ulSumStyle, numFmt: FMT_MONEY });
    setCell(ws4, `D${ulSumRow}`, 's', '', ulSumStyle);
    setCell(ws4, `E${ulSumRow}`, 's', '', ulSumStyle);
    setCell(ws4, `F${ulSumRow}`, 's', '', ulSumStyle);

    const clSignStyle: XLSX.CellStyle = {
      font: { name: FONT_NAME, bold: true, sz: 11 },
      alignment: { horizontal: 'center', vertical: 'center' },
    };
    setCell(ws4, `B${ulSumRow + 2}`, 's', 'Người lập bảng', clSignStyle);
    setCell(ws4, `E${ulSumRow + 2}`, 's', 'Xác nhận', clSignStyle);
    setCell(ws4, `B${ulSumRow + 5}`, 's', 'Võ Hoàng Cẩm Tiên', clSignStyle);
    setCell(ws4, `E${ulSumRow + 5}`, 's', 'Huỳnh Hải Long Hồ', clSignStyle);

    ws4['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 5 } }];
    ws4['!ref'] = `A1:F${ulSumRow + 7}`;
    XLSX.utils.book_append_sheet(wb, ws4, sheetNameUL);

    // =========================================================================
    // SHEET 5: CL ĐỘI DƯƠNG-CS2-{mm}.{yy} (CHI LƯƠNG & QUYẾT TOÁN GỘP ĐẦY ĐỦ)
    // =========================================================================
    const sheetNameCL = `CL ĐỘI DƯƠNG-CS2-${mm}.${yy}`;
    const ws5: XLSX.WorkSheet = {};
    ws5['!type'] = 'sheet';
    ws5['!cols'] = [
      { wch: 6 }, { wch: 24 }, { wch: 18 }, { wch: 18 }, { wch: 18 }, { wch: 18 }, { wch: 18 }, { wch: 24 },
    ];
    ws5['!rows'] = [{ hpt: 32 }, { hpt: 28 }];

    const clTitleText = `DANH SÁCH CHI LƯƠNG ĐỘI DƯƠNG NHẬP+XUẤT CƠ SỞ 2 THÁNG ${mm}/${yyyy}`;
    setCell(ws5, 'A1', 's', clTitleText, {
      font: { name: FONT_NAME, bold: true, sz: 13, color: { rgb: '1F3864' } },
      alignment: { horizontal: 'center', vertical: 'center' },
      fill: { fgColor: { rgb: 'BDD7EE' }, patternType: 'solid' },
      border: BORDER_THIN,
    });
    for (const c of ['B','C','D','E','F','G','H']) {
      setCell(ws5, `${c}1`, 's', '', { fill: { fgColor: { rgb: 'BDD7EE' }, patternType: 'solid' }, border: BORDER_THIN });
    }

    const clHeaders = ['STT', 'HỌ & TÊN', 'SỐ TIỀN', 'SỐ TIỀN\nTẠM ỨNG', 'SỐ TIỀN\nTHỰC LÃNH', 'SỐ TÀI KHOẢN', 'NGÂN HÀNG', 'CHỦ TÀI KHOẢN'];
    clHeaders.forEach((h, idx) => {
      const col = XLSX.utils.encode_col(idx);
      setCell(ws5, `${col}2`, 's', h, styleHeader());
    });

    let totalSalaryCalculated = 0;
    let totalThucLanhCalculated = 0;

    workers.forEach((w, idx) => {
      const row = idx + 3;
      const adv = workerAdvances[w.name] !== undefined
        ? workerAdvances[w.name]
        : (isOct2026 ? (w.sampleOctoberAdvance ?? 0) : 0);

      // Nếu có custom salary (ví dụ tháng 10 chuẩn = sampleOctoberSalary, các tháng khác tính theo tỉ lệ)
      let sal = customWorkerSalaries[w.name];
      if (sal === undefined) {
        if (isOct2026) {
          sal = w.sampleOctoberSalary ?? 0;
        } else {
          // Phân bổ đều hoặc theo trọng số nếu tháng khác
          sal = w.sampleOctoberSalary && totalTienCanChi > 0
            ? Math.round((w.sampleOctoberSalary / 85_864_000) * totalTienCanChi)
            : 0;
        }
      }
      const thucLanh = sal - adv;
      totalSalaryCalculated += sal;
      totalThucLanhCalculated += thucLanh;

      setCell(ws5, `A${row}`, 'n', w.stt,           styleData('center'));
      setCell(ws5, `B${row}`, 's', w.name,          styleData('left', true));
      setCell(ws5, `C${row}`, 'n', sal,             { ...styleMoney(), numFmt: FMT_MONEY });
      setCell(ws5, `D${row}`, 'n', adv,             { ...styleMoney(), numFmt: FMT_MONEY });
      setCell(ws5, `E${row}`, 'n', thucLanh,        { ...styleMoney(true), numFmt: FMT_MONEY });
      setCell(ws5, `F${row}`, 's', w.stk,           styleData('center'));
      setCell(ws5, `G${row}`, 's', w.bank,          styleData('center'));
      setCell(ws5, `H${row}`, 's', w.accountHolder, styleData('center'));
    });

    const clSumRow = workers.length + 3; // Hàng 23
    const clSumStyle = styleTitle(true);
    setCell(ws5, `A${clSumRow}`, 's', '', clSumStyle);
    setCell(ws5, `B${clSumRow}`, 's', 'TỔNG CỘNG : ', clSumStyle);
    setCell(ws5, `C${clSumRow}`, 'n', totalSalaryCalculated,   { ...clSumStyle, numFmt: FMT_MONEY });
    setCell(ws5, `D${clSumRow}`, 'n', totalAdvanceMoney,      { ...clSumStyle, numFmt: FMT_MONEY });
    setCell(ws5, `E${clSumRow}`, 'n', totalThucLanhCalculated, { ...clSumStyle, numFmt: FMT_MONEY });
    setCell(ws5, `F${clSumRow}`, 's', '', clSumStyle);
    setCell(ws5, `G${clSumRow}`, 's', '', clSumStyle);
    setCell(ws5, `H${clSumRow}`, 's', '', clSumStyle);

    setCell(ws5, `B${clSumRow + 2}`, 's', 'Người lập bảng', clSignStyle);
    setCell(ws5, `F${clSumRow + 2}`, 's', 'Xác nhận', clSignStyle);
    setCell(ws5, `B${clSumRow + 5}`, 's', 'Võ Hoàng Cẩm Tiên', clSignStyle);
    setCell(ws5, `F${clSumRow + 5}`, 's', 'Huỳnh Hải Long Hồ', clSignStyle);

    // ── BẢNG KÊ QUYẾT TOÁN NHẬP + XUẤT (Hàng 30-49 chuẩn 100% theo mẫu) ───────
    // Row 30: Tiêu đề
    setCell(ws5, 'B30', 's', `BẢNG KÊ LƯƠNG ĐỘI DƯƠNG NHẬP+XUẤT CƠ SỞ 2 THÁNG ${month}/${year}`, {
      font: { name: FONT_NAME, bold: true, sz: 12, color: { rgb: '1F3864' } },
      alignment: { horizontal: 'center', vertical: 'center' },
      fill: { fgColor: { rgb: 'BDD7EE' }, patternType: 'solid' },
      border: BORDER_THIN,
    });
    for (const c of ['C','D','E']) {
      setCell(ws5, `${c}30`, 's', '', { fill: { fgColor: { rgb: 'BDD7EE' }, patternType: 'solid' }, border: BORDER_THIN });
    }

    // Row 31: Header
    setCell(ws5, 'B31', 's', 'NHẬP+XUẤT', styleHeader());
    setCell(ws5, 'C31', 's', 'SỐ LƯỢNG', styleHeader());
    setCell(ws5, 'D31', 's', 'ĐƠN GIÁ ', styleHeader());
    setCell(ws5, 'E31', 's', 'THÀNH TIỀN', styleHeader());

    // Row 32: NHẬP LÚA OM18 + THƠM LÀI + JAPO
    setCell(ws5, 'B32', 's', 'NHẬP LÚA OM18+\r\nTHƠM LÀI+JAPO', styleData('left'));
    setCell(ws5, 'C32', 'n', tonsPhothong,      { ...styleData('center'), numFmt: FMT_NUMBER });
    setCell(ws5, 'D32', 'n', unitPricePhothong, { ...styleMoney(), numFmt: FMT_MONEY });
    setCell(ws5, 'E32', 'n', moneyPhothong,     { ...styleMoney(), numFmt: FMT_MONEY });

    // Row 33: NHẬP LÚA ST25 ĐL, ST25 KDM
    setCell(ws5, 'B33', 's', 'NHẬP LÚA ST25 ĐL,\r\nST25 KDM', styleData('left'));
    setCell(ws5, 'C33', 'n', tonsST25,      { ...styleData('center'), numFmt: FMT_NUMBER });
    setCell(ws5, 'D33', 'n', unitPriceST25, { ...styleMoney(), numFmt: FMT_MONEY });
    setCell(ws5, 'E33', 'n', moneyST25,     { ...styleMoney(), numFmt: FMT_MONEY });

    // Row 34: NHẬP TRẤU GHE ÔNG 5
    setCell(ws5, 'B34', 's', 'NHẬP TRẤU GHE ÔNG 5', styleData('left'));
    setCell(ws5, 'C34', 'n', tonsTrauOng5,      { ...styleData('center'), numFmt: FMT_NUMBER });
    setCell(ws5, 'D34', 'n', 27273,             { ...styleMoney(), numFmt: FMT_MONEY });
    setCell(ws5, 'E34', 'n', moneyTrauOng5,     { ...styleMoney(), numFmt: FMT_MONEY });

    // Row 35: NHẬP TRẤU GHE NGOÀI
    setCell(ws5, 'B35', 's', 'NHẬP TRẤU GHE NGOÀI', styleData('left'));
    setCell(ws5, 'C35', 'n', tonsTrauNgoai,     { ...styleData('center'), numFmt: FMT_NUMBER });
    setCell(ws5, 'D35', 'n', 27000,             { ...styleMoney(), numFmt: FMT_MONEY });
    setCell(ws5, 'E35', 'n', moneyTrauNgoai,    { ...styleMoney(), numFmt: FMT_MONEY });

    // Row 36: XUẤT CÓ TRỞ
    setCell(ws5, 'B36', 's', 'XUẤT CÓ TRỞ', styleData('left'));
    setCell(ws5, 'C36', 'n', tonsCoTro,         { ...styleData('center'), numFmt: FMT_NUMBER });
    setCell(ws5, 'D36', 'n', 20000,             { ...styleMoney(), numFmt: FMT_MONEY });
    setCell(ws5, 'E36', 'n', moneyCoTro,        { ...styleMoney(), numFmt: FMT_MONEY });

    // Row 37: XUẤT KHÔNG TRỞ
    setCell(ws5, 'B37', 's', 'XUẤT KHÔNG TRỞ', styleData('left'));
    setCell(ws5, 'C37', 'n', tonsKhongTro,      { ...styleData('center'), numFmt: FMT_NUMBER });
    setCell(ws5, 'D37', 'n', 16000,             { ...styleMoney(), numFmt: FMT_MONEY });
    setCell(ws5, 'E37', 'n', moneyKhongTro,     { ...styleMoney(), numFmt: FMT_MONEY });

    // Row 38: TỔNG CỘNG NHẬP+XUẤT
    setCell(ws5, 'B38', 's', 'TỔNG CỘNG ', clSumStyle);
    setCell(ws5, 'C38', 's', '', clSumStyle);
    setCell(ws5, 'D38', 's', '', clSumStyle);
    setCell(ws5, 'E38', 'n', totalNhapVaXuatMoney, { ...clSumStyle, numFmt: FMT_MONEY });

    // Row 39: CHỤM LÒ Header
    setCell(ws5, 'B39', 's', 'CHỤM LÒ', { ...styleHeader(), alignment: { horizontal: 'left', vertical: 'center' } });
    for (const c of ['C','D','E']) setCell(ws5, `${c}39`, 's', '', styleHeader());

    // Row 40: CHỤM LÒ LÚA
    setCell(ws5, 'B40', 's', 'CHỤM LÒ LÚA', styleData('left'));
    setCell(ws5, 'C40', 'n', totalNhapTons,        { ...styleData('center'), numFmt: FMT_NUMBER });
    setCell(ws5, 'D40', 'n', chumLoUnitPrice,      { ...styleMoney(), numFmt: FMT_MONEY });
    setCell(ws5, 'E40', 'n', totalThanhTienChumLo, { ...styleMoney(), numFmt: FMT_MONEY });

    // Row 41: TỔNG CỘNG CHỤM LÒ
    setCell(ws5, 'B41', 's', 'TỔNG CỘNG ', clSumStyle);
    setCell(ws5, 'C41', 's', '', clSumStyle);
    setCell(ws5, 'D41', 's', '', clSumStyle);
    setCell(ws5, 'E41', 'n', totalThanhTienChumLo, { ...clSumStyle, numFmt: FMT_MONEY });

    // Row 42: TỔNG TIỀN CẦN CHI Header
    setCell(ws5, 'B42', 's', 'TỔNG TIỀN CẦN CHI', { ...styleHeader(), alignment: { horizontal: 'left', vertical: 'center' } });
    for (const c of ['C','D','E']) setCell(ws5, `${c}42`, 's', '', styleHeader());

    // Row 43: NHẬP+XUẤT
    setCell(ws5, 'B43', 's', 'NHẬP+XUẤT', styleData('left'));
    setCell(ws5, 'C43', 'n', totalNhapVaXuatMoney, { ...styleMoney(), numFmt: FMT_MONEY });

    // Row 44: CHỤM LÒ
    setCell(ws5, 'B44', 's', 'CHỤM LÒ', styleData('left'));
    setCell(ws5, 'C44', 'n', totalThanhTienChumLo, { ...styleMoney(), numFmt: FMT_MONEY });

    // Row 45: LƯƠNG QUẢN LÝ (DƯƠNG)
    setCell(ws5, 'B45', 's', 'LƯƠNG QUẢN LÝ (DƯƠNG)', styleData('left'));
    setCell(ws5, 'C45', 'n', managementSalary, { ...styleMoney(), numFmt: FMT_MONEY });

    // Row 46: NƯỚC ĐÁ
    setCell(ws5, 'B46', 's', 'NƯỚC ĐÁ \r\n(10.000Đ/ngày làm việc)', styleData('left'));
    setCell(ws5, 'C46', 'n', totalTienNuocDa, { ...styleMoney(), numFmt: FMT_MONEY });

    // Row 47: TỔNG CỘNG TIỀN LƯƠNG
    setCell(ws5, 'B47', 's', 'TỔNG CỘNG ', clSumStyle);
    setCell(ws5, 'C47', 'n', totalTienCanChi, { ...clSumStyle, numFmt: FMT_MONEY });

    // Row 48: TRỪ TẠM ỨNG
    setCell(ws5, 'B48', 's', 'TRỪ TẠM ỨNG', clSumStyle);
    setCell(ws5, 'C48', 'n', totalAdvanceMoney, { ...clSumStyle, numFmt: FMT_MONEY });

    // Row 49: CÒN LẠI (THỰC LÃNH)
    const remainMoney = totalTienCanChi - totalAdvanceMoney;
    setCell(ws5, 'B49', 's', 'CÒN LẠI', { ...clSumStyle, font: { ...clSumStyle.font, sz: 12, color: { rgb: '006100' } }, fill: { fgColor: { rgb: 'C6EFCE' }, patternType: 'solid' } });
    setCell(ws5, 'C49', 'n', remainMoney, { ...clSumStyle, font: { ...clSumStyle.font, sz: 12, color: { rgb: '006100' } }, fill: { fgColor: { rgb: 'C6EFCE' }, patternType: 'solid' }, numFmt: FMT_MONEY });

    ws5['!merges'] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: 7 } },
      { s: { r: 29, c: 1 }, e: { r: 29, c: 4 } },
    ];
    ws5['!ref'] = 'A1:H55';
    XLSX.utils.book_append_sheet(wb, ws5, sheetNameCL);

    // Chuẩn hóa in ấn khổ A4 ngang & vừa khít trang
    finalizeWorkbookWithPrintSetup(wb);

    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    const fileName = `TONG_HOP_DOI_DUONG_CS2_T${mm}_${yyyy}.xlsx`;

    return new NextResponse(buf, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${fileName}"`,
      },
    });
  } catch (error) {
    console.error('Lỗi xuất Excel CS2 Unified:', error);
    return NextResponse.json(
      { error: 'Lỗi xuất Excel CS2: ' + (error instanceof Error ? error.message : String(error)) },
      { status: 500 }
    );
  }
}
