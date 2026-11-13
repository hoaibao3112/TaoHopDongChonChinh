import { NextRequest, NextResponse } from 'next/server';
import XLSX from 'xlsx-js-style';
import { isRequestAuthenticated } from '@/lib/auth';
import { ChumLoExportPayload } from '@/lib/rice-payroll/chum-lo-types';
import { DEFAULT_CHUM_LO_WORKERS } from '@/lib/rice-payroll/team-chum-lo-workers';

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

export async function POST(req: NextRequest) {
  if (!isRequestAuthenticated(req)) {
    return NextResponse.json({ error: 'Chưa xác thực phiên đăng nhập' }, { status: 401 });
  }

  try {
    const body: ChumLoExportPayload = await req.json();
    const {
      month = 10,
      year = 2026,
      batches = [],
      workers = DEFAULT_CHUM_LO_WORKERS,
      unitPrice = 5000,
      preparerName = 'Võ Hoàng Cẩm Tiên',
      approverName = 'Huỳnh Hải Long Hồ',
    } = body;

    const mm = String(month).padStart(2, '0');
    const yyyy = String(year);

    // Tính toán tổng số liệu
    const totalKg = batches.reduce((sum, b) => sum + (b.dryWeightKg || 0), 0);
    const totalTons = batches.reduce((sum, b) => sum + (b.roundedTons || 0), 0);
    const totalThanhTien = batches.reduce((sum, b) => sum + (b.thanhTien || 0), 0);
    const totalFreshKg = batches.reduce((sum, b) => sum + (b.freshWeightKg || 0), 0);
    const totalAdvance = workers.reduce((sum, w) => sum + (w.advanceSalary || 0), 0);
    const remainingSalary = totalThanhTien - totalAdvance;

    const wb = XLSX.utils.book_new();

    // =========================================================================
    // SHEET 1: Chụm Lò (Bảng kê nhập sấy chụm lò Cơ Sở 1)
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
      { wch: 16 }, // M: ĐƠN GIÁ CHỤM LÒ
      { wch: 18 }, // N: THÀNH TIỀN CHỤM LÒ
    ];
    ws1['!rows'] = [{ hpt: 36 }, { hpt: 26 }, { hpt: 45 }];

    // Row 1: Title
    const titleText1 = `NHẬP SẤY CƠ SỞ I XNK ĐỘI NHẬP ANH NGHỊ VÀ ANH NGUYÊN   T${mm}/${yyyy}`;
    setCell(ws1, 'A1', 's', titleText1, {
      font: { name: FONT_NAME, bold: true, sz: 13, color: { rgb: '1F3864' } },
      alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
      fill: { fgColor: { rgb: 'BDD7EE' }, patternType: 'solid' },
      border: BORDER_THIN,
    });
    for (const c of ['B','C','D','E','F','G','H','I','J','K','L','M','N']) {
      setCell(ws1, `${c}1`, 's', '', { fill: { fgColor: { rgb: 'BDD7EE' }, patternType: 'solid' }, border: BORDER_THIN });
    }

    // Row 2: TỔNG CỘNG
    const totStyle1 = styleTitle(true);
    setCell(ws1, 'A2', 's', '', totStyle1);
    setCell(ws1, 'B2', 's', '', totStyle1);
    setCell(ws1, 'C2', 's', '', totStyle1);
    setCell(ws1, 'D2', 's', '', totStyle1);
    setCell(ws1, 'E2', 's', 'TỔNG CỘNG', totStyle1);
    setCell(ws1, 'F2', 's', '', totStyle1);
    setCell(ws1, 'G2', 'n', totalFreshKg > 0 ? totalFreshKg : 0, { ...totStyle1, numFmt: FMT_NUMBER });
    setCell(ws1, 'H2', 's', '', totStyle1);
    setCell(ws1, 'I2', 's', '', totStyle1);
    setCell(ws1, 'J2', 's', '', totStyle1);
    setCell(ws1, 'K2', 'n', totalKg, { ...totStyle1, numFmt: FMT_NUMBER });
    setCell(ws1, 'L2', 'n', totalTons, { ...totStyle1, numFmt: FMT_NUMBER });
    setCell(ws1, 'M2', 's', '', totStyle1);
    setCell(ws1, 'N2', 'n', totalThanhTien, { ...totStyle1, numFmt: FMT_MONEY });

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
      ['M3', `ĐƠN GIÁ\nCHỤM LÒ\n(${unitPrice.toLocaleString('vi-VN')}Đ/TẤN)`],
      ['N3', 'THÀNH TIỀN CHỤM LÒ'],
    ];
    for (const [addr, text] of headers1) {
      setCell(ws1, addr, 's', text, styleHeader());
    }

    // Rows 4+: Dữ liệu mẻ
    batches.forEach((b, idx) => {
      const r = idx + 4;
      ws1['!rows']!.push({ hpt: 20 });
      setCell(ws1, `A${r}`, 's', b.contractNo || String(idx + 1).padStart(2, '0'), styleData('center'));
      setCell(ws1, `B${r}`, 's', b.weighDate || '', styleData('center'));
      setCell(ws1, `C${r}`, 's', b.doiNhap || '', styleData('center'));
      setCell(ws1, `D${r}`, 's', b.customerName || '', styleData('left'));
      setCell(ws1, `E${r}`, 's', b.vehicleName || '', styleData('center'));
      setCell(ws1, `F${r}`, 's', b.riceType || '', styleData('center'));
      setCell(ws1, `G${r}`, 'n', b.freshWeightKg || 0, styleNumber());
      setCell(ws1, `H${r}`, 's', b.freshBoVehicle || '', styleData('center'));
      setCell(ws1, `I${r}`, 's', b.dryDate || '', styleData('center'));
      setCell(ws1, `J${r}`, 's', b.dryFacility || 'CƠ SỞ I', styleData('center'));
      setCell(ws1, `K${r}`, 'n', b.dryWeightKg, styleNumber());
      setCell(ws1, `L${r}`, 'n', b.roundedTons, styleNumber(true));
      setCell(ws1, `M${r}`, 'n', b.unitPrice || unitPrice, styleMoney());
      setCell(ws1, `N${r}`, 'n', b.thanhTien, styleMoney(true));
    });

    const lastDataRow1 = batches.length + 3;
    const signRow1 = lastDataRow1 + 3;
    const nameRow1 = signRow1 + 4;

    setCell(ws1, `D${signRow1}`, 's', 'Người lập bảng', {
      font: { name: FONT_NAME, bold: true, sz: 11 },
      alignment: { horizontal: 'center' },
    });
    setCell(ws1, `J${signRow1}`, 's', 'Xác nhận', {
      font: { name: FONT_NAME, bold: true, sz: 11 },
      alignment: { horizontal: 'center' },
    });

    setCell(ws1, `D${nameRow1}`, 's', preparerName, {
      font: { name: FONT_NAME, bold: true, sz: 11 },
      alignment: { horizontal: 'center' },
    });
    setCell(ws1, `J${nameRow1}`, 's', approverName, {
      font: { name: FONT_NAME, bold: true, sz: 11 },
      alignment: { horizontal: 'center' },
    });

    ws1['!merges'] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: 13 } }, // A1:N1
    ];
    ws1['!ref'] = `A1:N${nameRow1 + 1}`;
    XLSX.utils.book_append_sheet(wb, ws1, 'Chụm Lò');

    // =========================================================================
    // SHEET 2: ỨL ĐỘI NGUYÊN (Danh sách chi lương & bảng kê quyết toán)
    // =========================================================================
    const ws2: XLSX.WorkSheet = {};
    ws2['!type'] = 'sheet';
    ws2['!cols'] = [
      { wch: 6 },  // A: STT
      { wch: 28 }, // B: HỌ & TÊN
      { wch: 16 }, // C: SỐ TIỀN
      { wch: 18 }, // D: SỐ TIỀN TẠM ỨNG
      { wch: 16 }, // E: CÒN LẠI
      { wch: 18 }, // F: SỐ TÀI KHOẢN
      { wch: 26 }, // G: NGÂN HÀNG
      { wch: 26 }, // H: CHỦ TÀI KHOẢN
    ];
    ws2['!rows'] = [{ hpt: 30 }, { hpt: 30 }];

    // Row 1: Title
    const titleText2 = `DANH SÁCH CHI LƯƠNG CHỤM LÒ CƠ SỞ 1 THÁNG ${mm}/${yyyy}`;
    setCell(ws2, 'A1', 's', titleText2, {
      font: { name: FONT_NAME, bold: true, sz: 13, color: { rgb: '1F3864' } },
      alignment: { horizontal: 'center', vertical: 'center' },
      fill: { fgColor: { rgb: 'BDD7EE' }, patternType: 'solid' },
      border: BORDER_THIN,
    });
    for (const c of ['B','C','D','E','F','G','H']) {
      setCell(ws2, `${c}1`, 's', '', { fill: { fgColor: { rgb: 'BDD7EE' }, patternType: 'solid' }, border: BORDER_THIN });
    }

    // Row 2: Headers
    const headers2: [string, string][] = [
      ['A2', 'STT'],
      ['B2', 'HỌ & TÊN'],
      ['C2', 'SỐ TIỀN'],
      ['D2', 'SỐ TIỀN\nTẠM ỨNG'],
      ['E2', 'CÒN LẠI'],
      ['F2', 'SỐ TÀI KHOẢN'],
      ['G2', 'NGÂN HÀNG'],
      ['H2', 'CHỦ TÀI KHOẢN'],
    ];
    for (const [addr, text] of headers2) {
      setCell(ws2, addr, 's', text, styleHeader());
    }

    // Rows 3.. : Workers
    workers.forEach((w, idx) => {
      const r = idx + 3;
      ws2['!rows']!.push({ hpt: 22 });
      setCell(ws2, `A${r}`, 'n', idx + 1, styleData('center'));
      setCell(ws2, `B${r}`, 's', w.name, styleData('left', true));
      setCell(ws2, `C${r}`, 's', '', styleMoney());
      setCell(ws2, `D${r}`, 'n', w.advanceSalary, styleMoney());
      setCell(ws2, `E${r}`, 'n', -w.advanceSalary, styleMoney(true));
      setCell(ws2, `F${r}`, 's', w.accountNumber, styleData('center'));
      setCell(ws2, `G${r}`, 's', w.bankName, styleData('left'));
      setCell(ws2, `H${r}`, 's', w.accountHolder, styleData('left'));
    });

    const totWorkerRow = workers.length + 3;
    ws2['!rows']!.push({ hpt: 24 });
    setCell(ws2, `A${totWorkerRow}`, 's', '', styleTitle(true));
    setCell(ws2, `B${totWorkerRow}`, 's', 'TỔNG CỘNG', styleTitle(true));
    setCell(ws2, `C${totWorkerRow}`, 'n', 0, { ...styleTitle(true), numFmt: FMT_MONEY });
    setCell(ws2, `D${totWorkerRow}`, 'n', totalAdvance, { ...styleTitle(true), numFmt: FMT_MONEY });
    setCell(ws2, `E${totWorkerRow}`, 'n', -totalAdvance, { ...styleTitle(true), numFmt: FMT_MONEY });
    setCell(ws2, `F${totWorkerRow}`, 's', '', styleTitle(true));
    setCell(ws2, `G${totWorkerRow}`, 's', '', styleTitle(true));
    setCell(ws2, `H${totWorkerRow}`, 's', '', styleTitle(true));

    // Signatures
    const signRow2 = totWorkerRow + 3;
    const nameRow2 = signRow2 + 4;
    setCell(ws2, `B${signRow2}`, 's', 'Người lập bảng', {
      font: { name: FONT_NAME, bold: true, sz: 11 },
      alignment: { horizontal: 'center' },
    });
    setCell(ws2, `E${signRow2}`, 's', 'Xác nhận', {
      font: { name: FONT_NAME, bold: true, sz: 11 },
      alignment: { horizontal: 'center' },
    });

    setCell(ws2, `B${nameRow2}`, 's', preparerName, {
      font: { name: FONT_NAME, bold: true, sz: 11 },
      alignment: { horizontal: 'center' },
    });
    setCell(ws2, `E${nameRow2}`, 's', approverName, {
      font: { name: FONT_NAME, bold: true, sz: 11 },
      alignment: { horizontal: 'center' },
    });

    // Bảng kê quyết toán chụm lò phía dưới
    const summaryHeaderRow = nameRow2 + 2;
    const sumTableTitle = `BẢNG KÊ CHỤM LÒ CƠ SỞ 1 THÁNG ${mm}/${yyyy}`;
    setCell(ws2, `B${summaryHeaderRow}`, 's', sumTableTitle, {
      font: { name: FONT_NAME, bold: true, sz: 12, color: { rgb: '1F3864' } },
      alignment: { horizontal: 'center', vertical: 'center' },
      fill: { fgColor: { rgb: 'BDD7EE' }, patternType: 'solid' },
      border: BORDER_THIN,
    });
    for (const c of ['C','D','E']) {
      setCell(ws2, `${c}${summaryHeaderRow}`, 's', '', { fill: { fgColor: { rgb: 'BDD7EE' }, patternType: 'solid' }, border: BORDER_THIN });
    }

    const sumHeaderColsRow = summaryHeaderRow + 1;
    setCell(ws2, `B${sumHeaderColsRow}`, 's', 'CHỤM LÒ', styleHeader());
    setCell(ws2, `C${sumHeaderColsRow}`, 's', 'SỐ LƯỢNG (TẤN)', styleHeader());
    setCell(ws2, `D${sumHeaderColsRow}`, 's', 'ĐƠN GIÁ (ĐỒNG/TẤN)', styleHeader());
    setCell(ws2, `E${sumHeaderColsRow}`, 's', 'THÀNH TIỀN', styleHeader());

    const sumDataRow = sumHeaderColsRow + 1;
    setCell(ws2, `B${sumDataRow}`, 's', 'Chụm lò Cơ sở 1', styleData('left'));
    setCell(ws2, `C${sumDataRow}`, 'n', totalTons, styleNumber(true));
    setCell(ws2, `D${sumDataRow}`, 'n', unitPrice, styleMoney());
    setCell(ws2, `E${sumDataRow}`, 'n', totalThanhTien, styleMoney(true));

    const rTot = sumDataRow + 1;
    setCell(ws2, `B${rTot}`, 's', 'TỔNG CỘNG :', styleData('left', true));
    setCell(ws2, `C${rTot}`, 's', '', styleData());
    setCell(ws2, `D${rTot}`, 's', '', styleData());
    setCell(ws2, `E${rTot}`, 'n', totalThanhTien, styleMoney(true));

    const rAdv = rTot + 1;
    setCell(ws2, `B${rAdv}`, 's', 'TRỪ TẠM ỨNG :', styleData('left', true));
    setCell(ws2, `C${rAdv}`, 's', '', styleData());
    setCell(ws2, `D${rAdv}`, 's', '', styleData());
    setCell(ws2, `E${rAdv}`, 'n', totalAdvance, styleMoney());

    const rRem = rAdv + 1;
    setCell(ws2, `B${rRem}`, 's', 'CÒN LẠI :', {
      ...styleData('left', true),
      font: { name: FONT_NAME, bold: true, sz: 11, color: { rgb: 'CC0000' } },
      fill: { fgColor: { rgb: 'FFF2CC' }, patternType: 'solid' },
    });
    setCell(ws2, `C${rRem}`, 's', '', { fill: { fgColor: { rgb: 'FFF2CC' }, patternType: 'solid' }, border: BORDER_THIN });
    setCell(ws2, `D${rRem}`, 's', '', { fill: { fgColor: { rgb: 'FFF2CC' }, patternType: 'solid' }, border: BORDER_THIN });
    setCell(ws2, `E${rRem}`, 'n', remainingSalary, {
      ...styleMoney(true),
      font: { name: FONT_NAME, bold: true, sz: 11, color: { rgb: 'CC0000' } },
      fill: { fgColor: { rgb: 'FFF2CC' }, patternType: 'solid' },
    });

    ws2['!merges'] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: 7 } }, // A1:H1
      { s: { r: summaryHeaderRow - 1, c: 1 }, e: { r: summaryHeaderRow - 1, c: 4 } }, // B:E
    ];
    ws2['!ref'] = `A1:H${rRem + 1}`;

    const sheet2Name = `ỨL ĐỘI NGUYÊN T0${mm}.${yyyy}`;
    XLSX.utils.book_append_sheet(wb, ws2, sheet2Name);

    // Xuất Buffer Excel
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    const fileName = `TONG_HOP_DOI_CHUM_LO_T${mm}_${yyyy}.xlsx`;

    return new NextResponse(buf, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${fileName}"`,
      },
    });
  } catch (error) {
    console.error('Lỗi xuất Excel Chụm Lò:', error);
    return NextResponse.json(
      { error: (error as Error).message || 'Không thể tạo file Excel Chụm Lò' },
      { status: 500 }
    );
  }
}

