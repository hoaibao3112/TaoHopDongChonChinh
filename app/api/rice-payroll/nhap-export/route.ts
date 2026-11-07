import { NextRequest, NextResponse } from 'next/server';
import XLSX from 'xlsx-js-style';
import { isRequestAuthenticated } from '@/lib/auth';
import { NhapBatch, NhapExportPayload, NhapTrauItem } from '@/lib/rice-payroll/nhap-types';
import { DOI_DUONG_WORKERS } from '@/lib/rice-payroll/team-duong-workers';
import { DEFAULT_OCTOBER_TRAU_ITEMS } from '@/lib/rice-payroll/nhap-trau-config';

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

// ─── Style helpers ───────────────────────────────────────────────────────────
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

// ─── Cell setter helper ──────────────────────────────────────────────────────
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

// ─── POST handler: Xuất file Excel Nhập Sấy CS2 gồm đúng 4 Sheets ──────────────
export async function POST(req: NextRequest) {
  if (!isRequestAuthenticated(req)) {
    return NextResponse.json({ error: 'Chưa xác thực phiên đăng nhập' }, { status: 401 });
  }

  try {
    const body: NhapExportPayload = await req.json();
    const {
      month = 10,
      year = 2026,
      batches = [],
      chumLoUnitPrice = 11_000,
      trauItems = DEFAULT_OCTOBER_TRAU_ITEMS,
      managementSalary = 6_000_000,
      iceUnitPricePerDay = 10_000,
    } = body;

    const mm   = String(month).padStart(2, '0');
    const yy   = String(year).slice(-2);
    const yyyy = String(year);

    // Sắp xếp các mẻ lúa theo ngày nhập sấy
    const sortedBatches = [...batches].sort((a, b) => {
      const parseDate = (s: string) => {
        const [d, m, y] = s.split('/').map(Number);
        return new Date(y, m - 1, d).getTime();
      };
      return parseDate(a.dryDate) - parseDate(b.dryDate);
    });

    // Tính tổng lúa nhập
    const totalKg            = sortedBatches.reduce((s, b) => s + b.dryWeightKg, 0);
    const totalTons          = sortedBatches.reduce((s, b) => s + b.roundedTons, 0);
    const totalThanhTienNhap   = sortedBatches.reduce((s, b) => s + b.thanhTienNhap, 0);
    const totalThanhTienChumLo = sortedBatches.reduce((s, b) => s + b.thanhTienChumLo, 0);

    // Tính số ngày làm việc
    const uniqueDates = Array.from(new Set(sortedBatches.map((b) => b.dryDate).filter(Boolean)));
    const workDays = body.workDaysCount ?? (uniqueDates.length > 0 ? uniqueDates.length : 15);
    const totalTienNuocDa = workDays * iceUnitPricePerDay;

    // Tổng trấu
    const totalTrauTons = trauItems.reduce((s, t) => s + t.soLuong, 0);
    const totalTrauMoney = trauItems.reduce((s, t) => s + t.thanhTien, 0);

    // Phân nhóm lúa để đưa vào bảng quyết toán
    // Nhóm 1: ST25 (đơn giá 23.000)
    // Nhóm 2: OM18 + Thơm Lài + JAPO (đơn giá 20.000)
    let tonsST25 = 0;
    let tonsPhothong = 0;
    sortedBatches.forEach((b) => {
      const type = (b.riceType || '').toUpperCase();
      if (type.includes('ST25')) {
        tonsST25 += b.roundedTons;
      } else {
        tonsPhothong += b.roundedTons;
      }
    });

    const moneyST25 = tonsST25 * 23_000;
    const moneyPhothong = tonsPhothong * 20_000;

    // Trấu theo phương tiện
    const trauOng5 = trauItems.filter((t) => t.phuongTien.toUpperCase().includes('ÔNG 5'));
    const tonsTrauOng5 = trauOng5.reduce((s, t) => s + t.soLuong, 0);
    const moneyTrauOng5 = trauOng5.reduce((s, t) => s + t.thanhTien, 0);

    const trauNgoai = trauItems.filter((t) => !t.phuongTien.toUpperCase().includes('ÔNG 5'));
    const tonsTrauNgoai = trauNgoai.reduce((s, t) => s + t.soLuong, 0);
    const moneyTrauNgoai = trauNgoai.reduce((s, t) => s + t.thanhTien, 0);

    const totalTienNhapTongHop = moneyPhothong + moneyST25 + moneyTrauOng5 + moneyTrauNgoai;
    const totalTienCanChi = totalTienNhapTongHop + totalThanhTienChumLo + managementSalary + totalTienNuocDa;

    // Tạo WorkBook mới
    const wb = XLSX.utils.book_new();

    // =========================================================================
    // SHEET 1: Nhap lua CS2 (Bảng kê nhập lúa CS2)
    // =========================================================================
    const ws1: XLSX.WorkSheet = {};
    ws1['!type'] = 'sheet';
    ws1['!cols'] = [
      { wch: 10 },  // A: ĐỢI NHẬP
      { wch: 18 },  // B: KHÁCH HÀNG
      { wch: 16 },  // C: LOẠI LÚA
      { wch: 22 },  // D: PHƯƠNG TIỆN TĂNG BO
      { wch: 13 },  // E: NGÀY NHẬP SẤY
      { wch: 12 },  // F: ĐỊA ĐIỂM SẤY
      { wch: 13 },  // G: CÂN KG
      { wch: 11 },  // H: CÂN TẤN
      { wch: 13 },  // I: ĐƠN GIÁ NHẬP
      { wch: 16 },  // J: THÀNH TIỀN NHẬP
      { wch: 16 },  // K: ĐƠN GIÁ CHỤM LÒ
      { wch: 16 },  // L: THÀNH TIỀN CHỤM LÒ
    ];
    ws1['!rows'] = [{ hpt: 36 }, { hpt: 48 }, { hpt: 60 }];

    // Row 1: Title merge A1:L1
    const titleText1 = `BẢNG KÊ NHẬP SẤY CƠ SỞ II XNK CHƠN CHÍNH ĐỘI DƯƠNG T${mm}/${yyyy}`;
    setCell(ws1, 'A1', 's', titleText1, {
      font: { name: FONT_NAME, bold: true, sz: 14, color: { rgb: '1F3864' } },
      alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
      fill: { fgColor: { rgb: 'BDD7EE' }, patternType: 'solid' },
      border: BORDER_THIN,
    });
    for (const c of ['B','C','D','E','F','G','H','I','J','K','L']) {
      setCell(ws1, `${c}1`, 's', '', { fill: { fgColor: { rgb: 'BDD7EE' }, patternType: 'solid' }, border: BORDER_THIN });
    }

    // Row 2: TỔNG CỘNG
    const totStyle1 = styleTitle(true);
    setCell(ws1, 'A2', 's', 'TỔNG CỘNG', totStyle1);
    for (const c of ['B','C','D','E','F']) setCell(ws1, `${c}2`, 's', '', totStyle1);
    setCell(ws1, 'G2', 'n', totalKg,              { ...totStyle1, numFmt: FMT_NUMBER });
    setCell(ws1, 'H2', 'n', totalTons,            { ...totStyle1, numFmt: FMT_NUMBER });
    setCell(ws1, 'I2', 's', '', totStyle1);
    setCell(ws1, 'J2', 'n', totalThanhTienNhap,   { ...totStyle1, numFmt: FMT_MONEY });
    setCell(ws1, 'K2', 's', '', totStyle1);
    setCell(ws1, 'L2', 'n', totalThanhTienChumLo, { ...totStyle1, numFmt: FMT_MONEY });

    // Row 3: Headers
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
    ];
    for (const [addr, text] of headers1) {
      setCell(ws1, addr, 's', text, styleHeader());
    }

    // Rows 4+: Data
    sortedBatches.forEach((batch, idx) => {
      const row = idx + 4;
      ws1['!rows']!.push({ hpt: 20 });
      setCell(ws1, `A${row}`, 's', batch.doiNhap,         styleData('center'));
      setCell(ws1, `B${row}`, 's', batch.customerName,    styleData('left'));
      setCell(ws1, `C${row}`, 's', batch.riceType,        styleData('center'));
      setCell(ws1, `D${row}`, 's', batch.freshBoVehicle,  styleData('center'));
      setCell(ws1, `E${row}`, 's', batch.dryDate,         styleData('center'));
      setCell(ws1, `F${row}`, 's', batch.dryFacility,     styleData('center'));
      setCell(ws1, `G${row}`, 'n', batch.dryWeightKg,     { ...styleData('right'), numFmt: FMT_NUMBER });
      setCell(ws1, `H${row}`, 'n', batch.roundedTons,     styleTons());
      setCell(ws1, `I${row}`, 'n', batch.pricePerTon,     { ...styleMoney(), numFmt: FMT_MONEY });
      setCell(ws1, `J${row}`, 'n', batch.thanhTienNhap,   { ...styleMoney(), numFmt: FMT_MONEY });
      setCell(ws1, `K${row}`, 'n', batch.chumLoUnitPrice, { ...styleMoney(), numFmt: FMT_MONEY });
      setCell(ws1, `L${row}`, 'n', batch.thanhTienChumLo, { ...styleMoney(), numFmt: FMT_MONEY });
    });

    // Row Tổng cuối bảng
    const sumRow1 = sortedBatches.length + 4;
    ws1['!rows']!.push({ hpt: 24 });
    const sumStyle1: XLSX.CellStyle = {
      font: { name: FONT_NAME, bold: true, sz: 11, color: { rgb: 'CC0000' } },
      alignment: { horizontal: 'center', vertical: 'center' },
      fill: { fgColor: { rgb: 'FFF2CC' }, patternType: 'solid' },
      border: BORDER_THIN,
    };
    setCell(ws1, `A${sumRow1}`, 's', 'TỔNG CỘNG', sumStyle1);
    for (const c of ['B','C','D','E','F']) setCell(ws1, `${c}${sumRow1}`, 's', '', sumStyle1);
    setCell(ws1, `G${sumRow1}`, 'n', totalKg,              { ...sumStyle1, numFmt: FMT_NUMBER });
    setCell(ws1, `H${sumRow1}`, 'n', totalTons,            { ...sumStyle1, numFmt: FMT_NUMBER });
    setCell(ws1, `I${sumRow1}`, 's', '', sumStyle1);
    setCell(ws1, `J${sumRow1}`, 'n', totalThanhTienNhap,   { ...sumStyle1, numFmt: FMT_MONEY });
    setCell(ws1, `K${sumRow1}`, 's', '', sumStyle1);
    setCell(ws1, `L${sumRow1}`, 'n', totalThanhTienChumLo, { ...sumStyle1, numFmt: FMT_MONEY });

    ws1['!merges'] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: 11 } },
      { s: { r: 1, c: 0 }, e: { r: 1, c: 5 } },
      { s: { r: sumRow1 - 1, c: 0 }, e: { r: sumRow1 - 1, c: 5 } },
    ];
    ws1['!ref'] = `A1:${XLSX.utils.encode_cell({ r: sumRow1 - 1, c: 11 })}`;
    XLSX.utils.book_append_sheet(wb, ws1, 'Nhap lua CS2');

    // =========================================================================
    // SHEET 2: Nhập Trấu (Bảng kê nhập trấu Đội Dương CS2)
    // =========================================================================
    const ws2: XLSX.WorkSheet = {};
    ws2['!type'] = 'sheet';
    ws2['!cols'] = [
      { wch: 14 }, // A: NGÀY
      { wch: 12 }, // B: ĐỘI NHẬP
      { wch: 22 }, // C: PHƯƠNG TIỆN
      { wch: 12 }, // D: SỐ LƯỢNG
      { wch: 14 }, // E: ĐƠN GIÁ
      { wch: 16 }, // F: THÀNH TIỀN
    ];

    // Row 1: Title
    setCell(ws2, 'A1', 's', `NHẬP TRẤU ĐỘI DƯƠNG CS2 ${yyyy}`, {
      font: { name: FONT_NAME, bold: true, sz: 14, color: { rgb: '1F3864' } },
      alignment: { horizontal: 'center', vertical: 'center' },
      fill: { fgColor: { rgb: 'D9E1F2' }, patternType: 'solid' },
      border: BORDER_THIN,
    });
    for (const c of ['B','C','D','E','F']) {
      setCell(ws2, `${c}1`, 's', '', { fill: { fgColor: { rgb: 'D9E1F2' }, patternType: 'solid' }, border: BORDER_THIN });
    }

    // Row 3: TỔNG CỘNG
    const sumStyle2 = styleTitle(true);
    setCell(ws2, 'A3', 's', 'TỔNG CỘNG :', sumStyle2);
    setCell(ws2, 'B3', 's', '', sumStyle2);
    setCell(ws2, 'C3', 's', '', sumStyle2);
    setCell(ws2, 'D3', 'n', totalTrauTons,  { ...sumStyle2, numFmt: FMT_NUMBER });
    setCell(ws2, 'E3', 's', '', sumStyle2);
    setCell(ws2, 'F3', 'n', totalTrauMoney, { ...sumStyle2, numFmt: FMT_MONEY });

    // Row 4: Headers
    const headers2 = ['NGÀY', 'ĐỘI NHẬP', 'PHƯƠNG TIỆN', 'SỐ LƯỢNG', 'ĐƠN GIÁ', 'THÀNH TIỀN'];
    headers2.forEach((h, idx) => {
      const col = XLSX.utils.encode_col(idx);
      setCell(ws2, `${col}4`, 's', h, styleHeader());
    });

    // Rows 5+: Data Trấu
    trauItems.forEach((t, idx) => {
      const row = idx + 5;
      setCell(ws2, `A${row}`, 's', t.date,       styleData('center'));
      setCell(ws2, `B${row}`, 's', t.doiNhap,    styleData('center'));
      setCell(ws2, `C${row}`, 's', t.phuongTien, styleData('left'));
      setCell(ws2, `D${row}`, 'n', t.soLuong,    { ...styleData('center'), numFmt: FMT_NUMBER });
      setCell(ws2, `E${row}`, 'n', t.donGia,     { ...styleMoney(), numFmt: FMT_MONEY });
      setCell(ws2, `F${row}`, 'n', t.thanhTien,  { ...styleMoney(), numFmt: FMT_MONEY });
    });

    // Chữ ký sheet Trấu
    const sigRow1 = trauItems.length + 8;
    const sigRow2 = sigRow1 + 5;
    const clSignStyle: XLSX.CellStyle = { font: { name: FONT_NAME, bold: true, sz: 10 }, alignment: { horizontal: 'center', vertical: 'center' } };
    setCell(ws2, `A${sigRow1}`, 's', 'Người lập bảng', clSignStyle);
    setCell(ws2, `D${sigRow1}`, 's', 'Xác nhận', clSignStyle);
    setCell(ws2, `A${sigRow2}`, 's', 'Võ Hoàng Cẩm Tiên', clSignStyle);
    setCell(ws2, `D${sigRow2}`, 's', 'Huỳnh Hải Long Hồ', clSignStyle);

    ws2['!merges'] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: 5 } },
      { s: { r: 2, c: 0 }, e: { r: 2, c: 2 } },
      { s: { r: sigRow1 - 1, c: 0 }, e: { r: sigRow1 - 1, c: 2 } },
      { s: { r: sigRow1 - 1, c: 3 }, e: { r: sigRow1 - 1, c: 5 } },
      { s: { r: sigRow2 - 1, c: 0 }, e: { r: sigRow2 - 1, c: 2 } },
      { s: { r: sigRow2 - 1, c: 3 }, e: { r: sigRow2 - 1, c: 5 } },
    ];
    ws2['!ref'] = `A1:${XLSX.utils.encode_cell({ r: sigRow2 - 1, c: 5 })}`;
    XLSX.utils.book_append_sheet(wb, ws2, 'Nhập Trấu');

    // =========================================================================
    // SHEET 3: ỨL ĐỘI DƯƠNG-CS2-T{mm}.{yy} (Bảng tạm ứng lương 20 công nhân)
    // =========================================================================
    const ws3: XLSX.WorkSheet = {};
    ws3['!type'] = 'sheet';
    ws3['!cols'] = [
      { wch: 6 },  // A: STT
      { wch: 22 }, // B: HỌ & TÊN
      { wch: 18 }, // C: SỐ TIỀN TẠM ỨNG
      { wch: 18 }, // D: SỐ TÀI KHOẢN
      { wch: 16 }, // E: NGÂN HÀNG
      { wch: 20 }, // F: CHỦ TÀI KHOẢN
    ];

    // Row 2: Title (file gốc đặt ở hàng 2)
    setCell(ws3, 'A2', 's', `DANH SÁCH ỨNG LƯƠNG ĐỘI DƯƠNG NHẬP CƠ SỞ 2 THÁNG ${month}/${year}`, {
      font: { name: FONT_NAME, bold: true, sz: 13, color: { rgb: '1F3864' } },
      alignment: { horizontal: 'center', vertical: 'center' },
      fill: { fgColor: { rgb: 'BDD7EE' }, patternType: 'solid' },
      border: BORDER_THIN,
    });
    for (const c of ['B','C','D','E','F']) {
      setCell(ws3, `${c}2`, 's', '', { fill: { fgColor: { rgb: 'BDD7EE' }, patternType: 'solid' }, border: BORDER_THIN });
    }

    // Row 3: Headers
    const headers3 = ['STT', 'HỌ & TÊN', 'SỐ TIỀN\nTẠM ỨNG', 'SỐ TÀI KHOẢN', 'NGÂN HÀNG', 'CHỦ TÀI KHOẢN'];
    headers3.forEach((h, idx) => {
      const col = XLSX.utils.encode_col(idx);
      setCell(ws3, `${col}3`, 's', h, styleHeader());
    });

    // Rows 4..23: 20 workers
    let totalAdvanceMoney = 0;
    DOI_DUONG_WORKERS.forEach((w, idx) => {
      const row = idx + 4;
      const adv = w.sampleOctoberAdvance ?? 0;
      totalAdvanceMoney += adv;
      setCell(ws3, `A${row}`, 'n', w.stt,           styleData('center'));
      setCell(ws3, `B${row}`, 's', w.name,          styleData('left', true));
      setCell(ws3, `C${row}`, 'n', adv,             { ...styleMoney(true), numFmt: FMT_MONEY });
      setCell(ws3, `D${row}`, 's', w.stk,           styleData('center'));
      setCell(ws3, `E${row}`, 's', w.bank,          styleData('center'));
      setCell(ws3, `F${row}`, 's', w.accountHolder, styleData('center'));
    });

    // Row 24: TỔNG CỘNG :
    const sumStyle3 = styleTitle(true);
    setCell(ws3, 'A24', 's', '', sumStyle3);
    setCell(ws3, 'B24', 's', 'TỔNG CỘNG : ', sumStyle3);
    setCell(ws3, 'C24', 'n', totalAdvanceMoney, { ...sumStyle3, numFmt: FMT_MONEY });
    setCell(ws3, 'D24', 's', '', sumStyle3);
    setCell(ws3, 'E24', 's', '', sumStyle3);
    setCell(ws3, 'F24', 's', '', sumStyle3);

    // Chữ ký sheet ỨL
    setCell(ws3, 'B26', 's', 'Người lập bảng', clSignStyle);
    setCell(ws3, 'E26', 's', 'Xác nhận', clSignStyle);
    setCell(ws3, 'B30', 's', 'Võ Hoàng Cẩm Tiên', clSignStyle);
    setCell(ws3, 'E30', 's', 'Huỳnh Hải Long Hồ', clSignStyle);

    ws3['!merges'] = [
      { s: { r: 1, c: 0 }, e: { r: 1, c: 5 } },
      { s: { r: 25, c: 1 }, e: { r: 25, c: 2 } },
      { s: { r: 25, c: 4 }, e: { r: 25, c: 5 } },
      { s: { r: 29, c: 1 }, e: { r: 29, c: 2 } },
      { s: { r: 29, c: 4 }, e: { r: 29, c: 5 } },
    ];
    ws3['!ref'] = 'A1:F31';
    const ulSheetName = `ỨL ĐỘI DƯƠNG-CS2-T${mm}.${yy}`;
    XLSX.utils.book_append_sheet(wb, ws3, ulSheetName);

    // =========================================================================
    // SHEET 4: CL ĐỘI DƯƠNG-CS2-{mm}.{yy} (Bảng chi lương + Quyết toán Đội Dương)
    // =========================================================================
    const ws4: XLSX.WorkSheet = {};
    ws4['!type'] = 'sheet';
    ws4['!cols'] = [
      { wch: 6 },  // A: STT
      { wch: 22 }, // B: HỌ & TÊN
      { wch: 16 }, // C: SỐ TIỀN
      { wch: 16 }, // D: SỐ TIỀN TẠM ỨNG
      { wch: 16 }, // E: THỰC LÃNH
      { wch: 18 }, // F: SỐ TÀI KHOẢN
      { wch: 16 }, // G: NGÂN HÀNG
      { wch: 20 }, // H: CHỦ TÀI KHOẢN
    ];

    // Row 1: Title
    setCell(ws4, 'A1', 's', `DANH SÁCH CHI LƯƠNG ĐỘI DƯƠNG NHẬP CƠ SỞ 2 THÁNG ${month}/${year}`, {
      font: { name: FONT_NAME, bold: true, sz: 13, color: { rgb: '1F3864' } },
      alignment: { horizontal: 'center', vertical: 'center' },
      fill: { fgColor: { rgb: 'BDD7EE' }, patternType: 'solid' },
      border: BORDER_THIN,
    });
    for (const c of ['B','C','D','E','F','G','H']) {
      setCell(ws4, `${c}1`, 's', '', { fill: { fgColor: { rgb: 'BDD7EE' }, patternType: 'solid' }, border: BORDER_THIN });
    }

    // Row 2: Headers
    const headers4 = ['STT', 'HỌ & TÊN', 'SỐ TIỀN', 'SỐ TIỀN\nTẠM ỨNG', 'SỐ TIỀN\nTHỰC LÃNH', 'SỐ TÀI KHOẢN', 'NGÂN HÀNG', 'CHỦ TÀI KHOẢN'];
    headers4.forEach((h, idx) => {
      const col = XLSX.utils.encode_col(idx);
      setCell(ws4, `${col}2`, 's', h, styleHeader());
    });

    // Rows 3..22: 20 workers
    let totalSalaryMoney = 0;
    let totalThucLanhMoney = 0;
    DOI_DUONG_WORKERS.forEach((w, idx) => {
      const row = idx + 3;
      const sal = w.sampleOctoberSalary ?? 0;
      const adv = w.sampleOctoberAdvance ?? 0;
      const thucLanh = sal - adv;
      totalSalaryMoney += sal;
      totalThucLanhMoney += thucLanh;

      setCell(ws4, `A${row}`, 'n', w.stt,           styleData('center'));
      setCell(ws4, `B${row}`, 's', w.name,          styleData('left', true));
      setCell(ws4, `C${row}`, 'n', sal,             { ...styleMoney(), numFmt: FMT_MONEY });
      setCell(ws4, `D${row}`, 'n', adv,             { ...styleMoney(), numFmt: FMT_MONEY });
      setCell(ws4, `E${row}`, 'n', thucLanh,        { ...styleMoney(true), numFmt: FMT_MONEY });
      setCell(ws4, `F${row}`, 's', w.stk,           styleData('center'));
      setCell(ws4, `G${row}`, 's', w.bank,          styleData('center'));
      setCell(ws4, `H${row}`, 's', w.accountHolder, styleData('center'));
    });

    // Row 23: TỔNG CỘNG công nhân
    const sumStyle4 = styleTitle(true);
    setCell(ws4, 'A23', 's', '', sumStyle4);
    setCell(ws4, 'B23', 's', 'TỔNG CỘNG : ', sumStyle4);
    setCell(ws4, 'C23', 'n', totalSalaryMoney,    { ...sumStyle4, numFmt: FMT_MONEY });
    setCell(ws4, 'D23', 'n', totalAdvanceMoney,   { ...sumStyle4, numFmt: FMT_MONEY });
    setCell(ws4, 'E23', 'n', totalThucLanhMoney,  { ...sumStyle4, numFmt: FMT_MONEY });
    setCell(ws4, 'F23', 's', '', sumStyle4);
    setCell(ws4, 'G23', 's', '', sumStyle4);
    setCell(ws4, 'H23', 's', '', sumStyle4);

    // Chữ ký
    setCell(ws4, 'B25', 's', 'Người lập bảng', clSignStyle);
    setCell(ws4, 'F25', 's', 'Xác nhận', clSignStyle);
    setCell(ws4, 'B28', 's', 'Võ Hoàng Cẩm Tiên', clSignStyle);
    setCell(ws4, 'F28', 's', 'Huỳnh Hải Long Hồ', clSignStyle);

    // ── BẢNG KÊ QUYẾT TOÁN NHẬP (từ hàng 30) ──────────────────────────────────
    // Row 30: Tiêu đề quyết toán
    setCell(ws4, 'B30', 's', `BẢNG KÊ LƯƠNG ĐỘI DƯƠNG NHẬP CƠ SỞ 2 THÁNG ${month}/${year}`, {
      font: { name: FONT_NAME, bold: true, sz: 12, color: { rgb: '1F3864' } },
      alignment: { horizontal: 'center', vertical: 'center' },
      fill: { fgColor: { rgb: 'BDD7EE' }, patternType: 'solid' },
      border: BORDER_THIN,
    });
    for (const c of ['C','D','E']) {
      setCell(ws4, `${c}30`, 's', '', { fill: { fgColor: { rgb: 'BDD7EE' }, patternType: 'solid' }, border: BORDER_THIN });
    }

    // Row 31: Header quyết toán
    setCell(ws4, 'B31', 's', 'NHẬP', styleHeader());
    setCell(ws4, 'C31', 's', 'SỐ LƯỢNG', styleHeader());
    setCell(ws4, 'D31', 's', 'ĐƠN GIÁ ', styleHeader());
    setCell(ws4, 'E31', 's', 'THÀNH TIỀN', styleHeader());

    // Row 32: NHẬP LÚA OM18 + THƠM LÀI + JAPO
    setCell(ws4, 'B32', 's', 'NHẬP LÚA OM18+\r\nTHƠM LÀI+JAPO', styleData('left'));
    setCell(ws4, 'C32', 'n', tonsPhothong, { ...styleData('center'), numFmt: FMT_NUMBER });
    setCell(ws4, 'D32', 'n', 20000,        { ...styleMoney(), numFmt: FMT_MONEY });
    setCell(ws4, 'E32', 'n', moneyPhothong, { ...styleMoney(), numFmt: FMT_MONEY });

    // Row 33: NHẬP LÚA ST25 ĐL, ST25 KDM
    setCell(ws4, 'B33', 's', 'NHẬP LÚA ST25 ĐL,\r\nST25 KDM', styleData('left'));
    setCell(ws4, 'C33', 'n', tonsST25, { ...styleData('center'), numFmt: FMT_NUMBER });
    setCell(ws4, 'D33', 'n', 23000,    { ...styleMoney(), numFmt: FMT_MONEY });
    setCell(ws4, 'E33', 'n', moneyST25, { ...styleMoney(), numFmt: FMT_MONEY });

    // Row 34: NHẬP TRẤU GHE ÔNG 5
    setCell(ws4, 'B34', 's', 'NHẬP TRẤU GHE ÔNG 5', styleData('left'));
    setCell(ws4, 'C34', 'n', tonsTrauOng5, { ...styleData('center'), numFmt: FMT_NUMBER });
    setCell(ws4, 'D34', 'n', 27273,        { ...styleMoney(), numFmt: FMT_MONEY });
    setCell(ws4, 'E34', 'n', moneyTrauOng5, { ...styleMoney(), numFmt: FMT_MONEY });

    // Row 35: NHẬP TRẤU GHE NGOÀI
    setCell(ws4, 'B35', 's', 'NHẬP TRẤU GHE NGOÀI', styleData('left'));
    setCell(ws4, 'C35', 'n', tonsTrauNgoai, { ...styleData('center'), numFmt: FMT_NUMBER });
    setCell(ws4, 'D35', 'n', 27000,         { ...styleMoney(), numFmt: FMT_MONEY });
    setCell(ws4, 'E35', 'n', moneyTrauNgoai, { ...styleMoney(), numFmt: FMT_MONEY });

    // Row 36: TỔNG CỘNG TIỀN NHẬP
    setCell(ws4, 'B36', 's', 'TỔNG CỘNG ', sumStyle4);
    setCell(ws4, 'C36', 's', '', sumStyle4);
    setCell(ws4, 'D36', 's', '', sumStyle4);
    setCell(ws4, 'E36', 'n', totalTienNhapTongHop, { ...sumStyle4, numFmt: FMT_MONEY });

    // Row 37: CHỤM LÒ Header
    setCell(ws4, 'B37', 's', 'CHỤM LÒ', { ...styleHeader(), alignment: { horizontal: 'left', vertical: 'center' } });
    for (const c of ['C','D','E']) setCell(ws4, `${c}37`, 's', '', styleHeader());

    // Row 38: CHỤM LÒ LÚA
    setCell(ws4, 'B38', 's', 'CHỤM LÒ LÚA', styleData('left'));
    setCell(ws4, 'C38', 'n', totalTons,            { ...styleData('center'), numFmt: FMT_NUMBER });
    setCell(ws4, 'D38', 'n', chumLoUnitPrice,      { ...styleMoney(), numFmt: FMT_MONEY });
    setCell(ws4, 'E38', 'n', totalThanhTienChumLo, { ...styleMoney(), numFmt: FMT_MONEY });

    // Row 39: TỔNG CỘNG CHỤM LÒ
    setCell(ws4, 'B39', 's', 'TỔNG CỘNG ', sumStyle4);
    setCell(ws4, 'C39', 's', '', sumStyle4);
    setCell(ws4, 'D39', 's', '', sumStyle4);
    setCell(ws4, 'E39', 'n', totalThanhTienChumLo, { ...sumStyle4, numFmt: FMT_MONEY });

    // Row 40: TỔNG TIỀN CẦN CHI Header
    setCell(ws4, 'B40', 's', 'TỔNG TIỀN CẦN CHI', { ...styleHeader(), alignment: { horizontal: 'left', vertical: 'center' } });
    for (const c of ['C','D','E']) setCell(ws4, `${c}40`, 's', '', styleHeader());

    // Row 41: TIỀN NHẬP
    setCell(ws4, 'B41', 's', 'TIỀN NHẬP (LÚA + TRẤU)', styleData('left'));
    setCell(ws4, 'C41', 'n', totalTienNhapTongHop, { ...styleMoney(), numFmt: FMT_MONEY });
    setCell(ws4, 'D41', 's', '', styleData());
    setCell(ws4, 'E41', 's', '', styleData());

    // Row 42: CHỤM LÒ
    setCell(ws4, 'B42', 's', 'CHỤM LÒ', styleData('left'));
    setCell(ws4, 'C42', 'n', totalThanhTienChumLo, { ...styleMoney(), numFmt: FMT_MONEY });
    setCell(ws4, 'D42', 's', '', styleData());
    setCell(ws4, 'E42', 's', '', styleData());

    // Row 43: LƯƠNG QUẢN LÝ (DƯƠNG)
    setCell(ws4, 'B43', 's', 'LƯƠNG QUẢN LÝ (DƯƠNG)', styleData('left'));
    setCell(ws4, 'C43', 'n', managementSalary, { ...styleMoney(), numFmt: FMT_MONEY });
    setCell(ws4, 'D43', 's', '', styleData());
    setCell(ws4, 'E43', 's', '', styleData());

    // Row 44: NƯỚC ĐÁ
    setCell(ws4, 'B44', 's', `NƯỚC ĐÁ (${iceUnitPricePerDay.toLocaleString('vi-VN')}Đ/ngày làm việc: ${workDays} ngày)`, styleData('left'));
    setCell(ws4, 'C44', 'n', totalTienNuocDa, { ...styleMoney(), numFmt: FMT_MONEY });
    setCell(ws4, 'D44', 's', '', styleData());
    setCell(ws4, 'E44', 's', '', styleData());

    // Row 45: TỔNG CỘNG
    setCell(ws4, 'B45', 's', 'TỔNG CỘNG ', sumStyle4);
    setCell(ws4, 'C45', 'n', totalTienCanChi, { ...sumStyle4, numFmt: FMT_MONEY });
    setCell(ws4, 'D45', 's', '', sumStyle4);
    setCell(ws4, 'E45', 's', '', sumStyle4);

    // Row 46: TRỪ TẠM ỨNG
    setCell(ws4, 'B46', 's', 'TRỪ TẠM ỨNG', styleData('left', true));
    setCell(ws4, 'C46', 'n', totalAdvanceMoney, { ...styleMoney(true), numFmt: FMT_MONEY });
    setCell(ws4, 'D46', 's', '', styleData());
    setCell(ws4, 'E46', 's', '', styleData());

    // Row 47: CÒN LẠI
    const conLaiMoney = totalTienCanChi - totalAdvanceMoney;
    const conLaiStyle: XLSX.CellStyle = {
      font: { name: FONT_NAME, bold: true, sz: 11, color: { rgb: 'CC0000' } },
      alignment: { horizontal: 'left', vertical: 'center' },
      fill: { fgColor: { rgb: 'FFFF00' }, patternType: 'solid' },
      border: BORDER_THIN,
    };
    setCell(ws4, 'B47', 's', 'CÒN LẠI', conLaiStyle);
    setCell(ws4, 'C47', 'n', conLaiMoney, { ...conLaiStyle, alignment: { horizontal: 'right', vertical: 'center' }, numFmt: FMT_MONEY });
    setCell(ws4, 'D47', 's', '', conLaiStyle);
    setCell(ws4, 'E47', 's', '', conLaiStyle);

    ws4['!merges'] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: 7 } },
      { s: { r: 24, c: 1 }, e: { r: 24, c: 2 } },
      { s: { r: 24, c: 5 }, e: { r: 24, c: 6 } },
      { s: { r: 27, c: 1 }, e: { r: 27, c: 2 } },
      { s: { r: 27, c: 5 }, e: { r: 27, c: 6 } },
      // Merge quyết toán
      { s: { r: 29, c: 1 }, e: { r: 29, c: 4 } }, // B30:E30
      { s: { r: 35, c: 2 }, e: { r: 35, c: 3 } }, // C36:D36
      { s: { r: 36, c: 1 }, e: { r: 36, c: 4 } }, // B37:E37
      { s: { r: 38, c: 2 }, e: { r: 38, c: 3 } }, // C39:D39
      { s: { r: 39, c: 1 }, e: { r: 39, c: 4 } }, // B40:E40
      { s: { r: 40, c: 2 }, e: { r: 40, c: 4 } }, // C41:E41
      { s: { r: 41, c: 2 }, e: { r: 41, c: 4 } }, // C42:E42
      { s: { r: 42, c: 2 }, e: { r: 42, c: 4 } }, // C43:E43
      { s: { r: 43, c: 2 }, e: { r: 43, c: 4 } }, // C44:E44
      { s: { r: 44, c: 2 }, e: { r: 44, c: 4 } }, // C45:E45
      { s: { r: 45, c: 2 }, e: { r: 45, c: 4 } }, // C46:E46
      { s: { r: 46, c: 2 }, e: { r: 46, c: 4 } }, // C47:E47
    ];

    ws4['!ref'] = 'A1:H50';
    const clSheetName = `CL ĐỘI DƯƠNG-CS2-${mm}.${yy}`;
    XLSX.utils.book_append_sheet(wb, ws4, clSheetName);

    // ─── Xuất buffer ─────────────────────────────────────────────────────────
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    const fileName = `TONG_HOP_DOI_DUONG_CS2_NHAP_T${mm}_${yyyy}_HOAN_CHINH.xlsx`;

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      },
    });
  } catch (err) {
    console.error('[nhap-export] Lỗi xuất Excel:', err);
    return NextResponse.json(
      { error: 'Xuất Excel thất bại', detail: String(err) },
      { status: 500 },
    );
  }
}
