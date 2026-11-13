import { NextRequest, NextResponse } from 'next/server';
import XLSX from 'xlsx-js-style';
import { isRequestAuthenticated } from '@/lib/auth';
import { NSXTMEntry, NSXTMPayload } from '@/lib/rice-payroll/nsx-tm-types';

export const runtime = 'nodejs';

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

function setCell(
  ws: XLSX.WorkSheet,
  addr: string,
  type: XLSX.ExcelDataType,
  value: any,
  style?: XLSX.CellStyle,
  numFmt?: string,
  formula?: string
) {
  ws[addr] = {
    t: type,
    v: value,
    s: style,
    ...(numFmt ? { z: numFmt } : {}),
    ...(formula ? { f: formula } : {}),
  };
}

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
    border: BORDER_THIN,
  };
}

function styleMoney(bold = false): XLSX.CellStyle {
  return {
    font: { name: FONT_NAME, bold, sz: 10 },
    alignment: { horizontal: 'right', vertical: 'center' },
    numFmt: FMT_MONEY,
    border: BORDER_THIN,
  };
}

function styleNumber(bold = false): XLSX.CellStyle {
  return {
    font: { name: FONT_NAME, bold, sz: 10 },
    alignment: { horizontal: 'right', vertical: 'center' },
    numFmt: FMT_NUMBER,
    border: BORDER_THIN,
  };
}

// ─── TẠO SHEET ĐỘI QUÝ (Mẫu LƯƠNG ĐỘI QUÝ-T10.2026.xlsx) ────────────────────
function buildSheetQuy(
  wb: XLSX.WorkBook,
  month: number,
  year: number,
  entries: NSXTMEntry[],
  preparerName = 'Võ Hoàng Cẩm Tiên',
  approverName = 'Huỳnh Anh Phát Thịnh'
) {
  const mm = String(month).padStart(2, '0');
  const yyyy = String(year);
  const ws: XLSX.WorkSheet = {};
  ws['!type'] = 'sheet';

  // Cột A đến S
  ws['!cols'] = [
    { wch: 6 },  // A: STT
    { wch: 13 }, // B: NGÀY NHẬP/ XUẤT
    { wch: 10 }, // C: ĐỘI
    { wch: 45 }, // D: CÔNG VIỆC
    { wch: 14 }, // E: SỐ LƯỢNG (KG)
    { wch: 12 }, // F: SỐ LƯỢNG (TẤN)
    { wch: 10 }, // G: SỐ LƯỢNG (BAO)
    { wch: 14 }, // H: ĐƠN GIÁ SẤY XE
    { wch: 14 }, // I: ĐƠN GIÁ SẤY GHE
    { wch: 16 }, // J: THÀNH TIỀN SẤY
    { wch: 18 }, // K: ĐƠN GIÁ LÚA KHÔ
    { wch: 18 }, // L: THÀNH TIỀN LÚA KHÔ
    { wch: 16 }, // M: ĐƠN GIÁ VÔ BỒN
    { wch: 16 }, // N: THÀNH TIỀN VÔ BỒN
    { wch: 16 }, // O: ĐƠN GIÁ XUẤT GẠO
    { wch: 16 }, // P: THÀNH TIỀN XUẤT GẠO
    { wch: 16 }, // Q: ĐƠN GIÁ XUẤT TRẤU
    { wch: 16 }, // R: THÀNH TIỀN XUẤT TRẤU
    { wch: 18 }, // S: TỔNG CỘNG
  ];

  ws['!rows'] = [
    { hpt: 15 },
    { hpt: 15 },
    { hpt: 32 }, // R3: Tiêu đề
    { hpt: 15 },
    { hpt: 26 }, // R5: Tổng cộng
    { hpt: 28 }, // R6: Header 1
    { hpt: 28 }, // R7: Header 2
  ];

  // R3: Tiêu đề
  const title = `BẢNG KÊ TÍNH LƯƠNG ĐỘI QUÝ THÁNG ${mm}/${yyyy} - NSX TM`;
  setCell(ws, 'A3', 's', title, {
    font: { name: FONT_NAME, bold: true, sz: 14, color: { rgb: '1F3864' } },
    alignment: { horizontal: 'center', vertical: 'center' },
  });

  // R6 & R7: Header
  setCell(ws, 'A6', 's', 'STT', styleHeader());
  setCell(ws, 'B6', 's', 'NGÀY NHẬP/ XUẤT', styleHeader());
  setCell(ws, 'C6', 's', 'ĐỘI', styleHeader());
  setCell(ws, 'D6', 's', 'CÔNG VIỆC', styleHeader());
  setCell(ws, 'E6', 's', 'SỐ LƯỢNG', styleHeader());
  setCell(ws, 'F6', 's', '', styleHeader());
  setCell(ws, 'G6', 's', '', styleHeader());
  setCell(ws, 'H6', 's', 'ĐƠN GIÁ NHẬP SẤY', styleHeader());
  setCell(ws, 'I6', 's', '', styleHeader());
  setCell(ws, 'J6', 's', 'THÀNH TIỀN SẤY', styleHeader());
  setCell(ws, 'K6', 's', 'ĐƠN GIÁ\nNHẬP LÚA KHÔ\n(20.000đ/tấn)', styleHeader());
  setCell(ws, 'L6', 's', 'THÀNH TIỀN NHẬP LÚA KHÔ', styleHeader());
  setCell(ws, 'M6', 's', 'ĐƠN GIÁ\nLÚA NỀN VÔ BỒN\n(50.000Đ/TẤN)', styleHeader());
  setCell(ws, 'N6', 's', 'THÀNH TIỀN VÔ BỒN', styleHeader());
  setCell(ws, 'O6', 's', 'ĐƠN GIÁ\nXUẤT GẠO LỨC\n(1.650Đ/BAO)', styleHeader());
  setCell(ws, 'P6', 's', 'THÀNH TIỀN XUẤT GẠO LỨC', styleHeader());
  setCell(ws, 'Q6', 's', 'ĐƠN GIÁ XUẤT TRẤU\n(11.000Đ/TẤN)', styleHeader());
  setCell(ws, 'R6', 's', 'THÀNH TIỀN XUẤT TRẤU', styleHeader());
  setCell(ws, 'S6', 's', 'TỔNG CỘNG:', styleHeader());

  setCell(ws, 'A7', 's', '', styleHeader());
  setCell(ws, 'B7', 's', '', styleHeader());
  setCell(ws, 'C7', 's', '', styleHeader());
  setCell(ws, 'D7', 's', '', styleHeader());
  setCell(ws, 'E7', 's', 'KG', styleHeader());
  setCell(ws, 'F7', 's', 'TẤN', styleHeader());
  setCell(ws, 'G7', 's', 'BAO', styleHeader());
  setCell(ws, 'H7', 's', 'XE\n(25.000Đ/TẤN)', styleHeader());
  setCell(ws, 'I7', 's', 'GHE\n(15.000Đ/TẤN)', styleHeader());
  for (const c of ['J','K','L','M','N','O','P','Q','R','S']) setCell(ws, `${c}7`, 's', '', styleHeader());

  // Data rows
  const startRow = 8;
  const endRow = startRow + Math.max(entries.length, 1) - 1;

  let totKg = 0;
  let totTons = 0;
  let totBao = 0;
  let totSay = 0;
  let totKho = 0;
  let totVoBon = 0;
  let totGao = 0;
  let totTrau = 0;
  let grandTotal = 0;

  entries.forEach((e, idx) => {
    const r = startRow + idx;
    ws['!rows']!.push({ hpt: 22 });

    setCell(ws, `A${r}`, 'n', idx + 1, styleData('center'));
    setCell(ws, `B${r}`, 's', e.date, styleData('center'));
    setCell(ws, `C${r}`, 's', 'QUÝ', styleData('center', true));
    setCell(ws, `D${r}`, 's', e.jobDescription, styleData('left'));

    // Số lượng
    setCell(ws, `E${r}`, 'n', e.weightKg, styleNumber());
    setCell(ws, `F${r}`, 'n', e.roundedTons, styleNumber(true));
    setCell(ws, `G${r}`, 'n', e.bagCount || 0, styleNumber());

    // Sấy Xe / Ghe
    setCell(ws, `H${r}`, 'n', e.unitPriceSayXe || 0, styleMoney());
    setCell(ws, `I${r}`, 'n', e.unitPriceSayGhe || 0, styleMoney());
    setCell(ws, `J${r}`, 'n', e.thanhTienSay || 0, styleMoney(true), undefined, `(F${r}*H${r})+(F${r}*I${r})`);

    // Lúa khô
    setCell(ws, `K${r}`, 'n', e.unitPriceLuaKho || 0, styleMoney());
    setCell(ws, `L${r}`, 'n', e.thanhTienLuaKho || 0, styleMoney(true), undefined, `F${r}*K${r}`);

    // Vô bồn
    setCell(ws, `M${r}`, 'n', e.unitPriceVoBon || 0, styleMoney());
    setCell(ws, `N${r}`, 'n', e.thanhTienVoBon || 0, styleMoney(), undefined, `F${r}*M${r}`);

    // Xuất gạo
    setCell(ws, `O${r}`, 'n', e.unitPriceXuatGao || 0, styleMoney());
    setCell(ws, `P${r}`, 'n', e.thanhTienXuatGao || 0, styleMoney(), undefined, `G${r}*O${r}`);

    // Xuất trấu
    setCell(ws, `Q${r}`, 'n', e.unitPriceXuatTrau || 0, styleMoney());
    setCell(ws, `R${r}`, 'n', e.thanhTienXuatTrau || 0, styleMoney(), undefined, `F${r}*Q${r}`);

    // Tổng dòng
    const rowTotal = (e.thanhTienSay || 0) + (e.thanhTienLuaKho || 0) + (e.thanhTienVoBon || 0) + (e.thanhTienXuatGao || 0) + (e.thanhTienXuatTrau || 0);
    setCell(ws, `S${r}`, 'n', rowTotal, styleMoney(true), undefined, `J${r}+L${r}+N${r}+P${r}+R${r}`);

    totKg += e.weightKg;
    totTons += e.roundedTons;
    totBao += (e.bagCount || 0);
    totSay += (e.thanhTienSay || 0);
    totKho += (e.thanhTienLuaKho || 0);
    totVoBon += (e.thanhTienVoBon || 0);
    totGao += (e.thanhTienXuatGao || 0);
    totTrau += (e.thanhTienXuatTrau || 0);
    grandTotal += rowTotal;
  });

  // R5: Dòng TỔNG CỘNG
  const totStyle = styleTitle(true);
  for (const c of ['A','C','D','H','I','K','M','O','Q']) setCell(ws, `${c}5`, 's', '', totStyle);
  setCell(ws, 'B5', 's', 'TỔNG CỘNG:', totStyle);
  setCell(ws, 'E5', 'n', totKg, { ...totStyle, numFmt: FMT_NUMBER }, undefined, `SUBTOTAL(109,E8:E${endRow})`);
  setCell(ws, 'F5', 'n', totTons, { ...totStyle, numFmt: FMT_NUMBER }, undefined, `SUBTOTAL(109,F8:F${endRow})`);
  setCell(ws, 'G5', 'n', totBao, { ...totStyle, numFmt: FMT_NUMBER }, undefined, `SUBTOTAL(109,G8:G${endRow})`);
  setCell(ws, 'J5', 'n', totSay, { ...totStyle, numFmt: FMT_MONEY }, undefined, `SUBTOTAL(109,J8:J${endRow})`);
  setCell(ws, 'L5', 'n', totKho, { ...totStyle, numFmt: FMT_MONEY }, undefined, `SUBTOTAL(109,L8:L${endRow})`);
  setCell(ws, 'N5', 'n', totVoBon, { ...totStyle, numFmt: FMT_MONEY }, undefined, `SUBTOTAL(109,N8:N${endRow})`);
  setCell(ws, 'P5', 'n', totGao, { ...totStyle, numFmt: FMT_MONEY }, undefined, `SUBTOTAL(109,P8:P${endRow})`);
  setCell(ws, 'R5', 'n', totTrau, { ...totStyle, numFmt: FMT_MONEY }, undefined, `SUBTOTAL(109,R8:R${endRow})`);
  setCell(ws, 'S5', 'n', grandTotal, { ...totStyle, numFmt: FMT_MONEY }, undefined, `ROUNDUP(J5+L5+N5+P5+R5,-3)`);

  // Chữ ký cuối bảng
  const signRow = endRow + 4;
  const nameRow = signRow + 4;
  setCell(ws, `B${signRow}`, 's', 'Người lập bảng', { font: { name: FONT_NAME, bold: true, sz: 11 }, alignment: { horizontal: 'center' } });
  setCell(ws, `E${signRow}`, 's', 'Xác nhận', { font: { name: FONT_NAME, bold: true, sz: 11 }, alignment: { horizontal: 'center' } });
  setCell(ws, `B${nameRow}`, 's', preparerName, { font: { name: FONT_NAME, bold: true, sz: 11 }, alignment: { horizontal: 'center' } });
  setCell(ws, `E${nameRow}`, 's', approverName, { font: { name: FONT_NAME, bold: true, sz: 11 }, alignment: { horizontal: 'center' } });

  ws['!merges'] = [
    { s: { r: 2, c: 0 }, e: { r: 2, c: 18 } }, // Title
    { s: { r: 5, c: 0 }, e: { r: 6, c: 0 } },  // STT
    { s: { r: 5, c: 1 }, e: { r: 6, c: 1 } },  // Ngày
    { s: { r: 5, c: 2 }, e: { r: 6, c: 2 } },  // Đội
    { s: { r: 5, c: 3 }, e: { r: 6, c: 3 } },  // Công việc
    { s: { r: 5, c: 4 }, e: { r: 5, c: 6 } },  // Số lượng (kg, tấn, bao)
    { s: { r: 5, c: 7 }, e: { r: 5, c: 8 } },  // Đơn giá sấy (xe, ghe)
    { s: { r: 5, c: 9 }, e: { r: 6, c: 9 } },  // Thành tiền sấy
    { s: { r: 5, c: 10 }, e: { r: 6, c: 10 } },// Đơn giá lúa khô
    { s: { r: 5, c: 11 }, e: { r: 6, c: 11 } },// Thành tiền lúa khô
    { s: { r: 5, c: 12 }, e: { r: 6, c: 12 } },// Đơn giá vô bồn
    { s: { r: 5, c: 13 }, e: { r: 6, c: 13 } },// Thành tiền vô bồn
    { s: { r: 5, c: 14 }, e: { r: 6, c: 14 } },// Đơn giá xuất gạo
    { s: { r: 5, c: 15 }, e: { r: 6, c: 15 } },// Thành tiền xuất gạo
    { s: { r: 5, c: 16 }, e: { r: 6, c: 16 } },// Đơn giá xuất trấu
    { s: { r: 5, c: 17 }, e: { r: 6, c: 17 } },// Thành tiền xuất trấu
    { s: { r: 5, c: 18 }, e: { r: 6, c: 18 } },// Tổng cộng
  ];

  ws['!ref'] = `A1:S${nameRow + 2}`;
  XLSX.utils.book_append_sheet(wb, ws, 'QUÝ');
}

// ─── TẠO SHEET ĐỘI ĐỨC (Mẫu LƯƠNG ĐỘI ĐỨC-T010.2026.xlsx) ────────────────────
function buildSheetDuc(
  wb: XLSX.WorkBook,
  month: number,
  year: number,
  entries: NSXTMEntry[],
  preparerName = 'Võ Hoàng Cẩm Tiên',
  approverName = 'Huỳnh Anh Phát Thịnh'
) {
  const mm = String(month).padStart(2, '0');
  const yyyy = String(year);
  const ws: XLSX.WorkSheet = {};
  ws['!type'] = 'sheet';

  // Cột A đến V (Đức có thêm D: Khách hàng, E: Loại lúa, F: Phương tiện, G: Công việc)
  ws['!cols'] = [
    { wch: 6 },  // A: STT
    { wch: 13 }, // B: NGÀY NHẬP/ XUẤT
    { wch: 10 }, // C: ĐỘI
    { wch: 22 }, // D: KHÁCH HÀNG
    { wch: 14 }, // E: LOẠI LÚA
    { wch: 16 }, // F: PHƯƠNG TIỆN
    { wch: 42 }, // G: CÔNG VIỆC
    { wch: 14 }, // H: KG
    { wch: 12 }, // I: TẤN
    { wch: 10 }, // J: BAO
    { wch: 14 }, // K: XE (25.000Đ/TẤN)
    { wch: 14 }, // L: GHE (15.000Đ/TẤN)
    { wch: 16 }, // M: THÀNH TIỀN SẤY
    { wch: 18 }, // N: ĐƠN GIÁ LÚA KHÔ
    { wch: 18 }, // O: THÀNH TIỀN LÚA KHÔ
    { wch: 16 }, // P: ĐƠN GIÁ VÔ BỒN
    { wch: 16 }, // Q: THÀNH TIỀN VÔ BỒN
    { wch: 16 }, // R: ĐƠN GIÁ XUẤT GẠO
    { wch: 16 }, // S: THÀNH TIỀN XUẤT GẠO
    { wch: 16 }, // T: ĐƠN GIÁ XUẤT TRẤU
    { wch: 16 }, // U: THÀNH TIỀN XUẤT TRẤU
    { wch: 18 }, // V: GHI CHÚ / TỔNG
  ];

  ws['!rows'] = [
    { hpt: 15 },
    { hpt: 15 },
    { hpt: 32 }, // R3: Tiêu đề
    { hpt: 15 },
    { hpt: 26 }, // R5: Tổng cộng
    { hpt: 28 }, // R6: Header 1
    { hpt: 28 }, // R7: Header 2
  ];

  // R3: Tiêu đề
  const title = `BẢNG KÊ TÍNH LƯƠNG ĐỘI ĐỨC THÁNG ${mm}/${yyyy} - NHẬP NSX ĐTM`;
  setCell(ws, 'A3', 's', title, {
    font: { name: FONT_NAME, bold: true, sz: 14, color: { rgb: '1F3864' } },
    alignment: { horizontal: 'center', vertical: 'center' },
  });

  // R6 & R7: Header
  setCell(ws, 'A6', 's', 'STT', styleHeader());
  setCell(ws, 'B6', 's', 'NGÀY NHẬP/ XUẤT', styleHeader());
  setCell(ws, 'C6', 's', 'ĐỘI', styleHeader());
  setCell(ws, 'D6', 's', '', styleHeader());
  setCell(ws, 'E6', 's', '', styleHeader());
  setCell(ws, 'F6', 's', '', styleHeader());
  setCell(ws, 'G6', 's', 'CÔNG VIỆC', styleHeader());
  setCell(ws, 'H6', 's', 'SỐ LƯỢNG', styleHeader());
  setCell(ws, 'I6', 's', '', styleHeader());
  setCell(ws, 'J6', 's', '', styleHeader());
  setCell(ws, 'K6', 's', 'ĐƠN GIÁ NHẬP SẤY', styleHeader());
  setCell(ws, 'L6', 's', '', styleHeader());
  setCell(ws, 'M6', 's', 'THÀNH TIỀN SẤY', styleHeader());
  setCell(ws, 'N6', 's', 'NHẬP LÚA KHÔ\n(20.000đ/tấn)', styleHeader());
  setCell(ws, 'O6', 's', 'THÀNH TIỀN NHẬP LÚA KHÔ', styleHeader());
  setCell(ws, 'P6', 's', 'ĐƠN GIÁ\nLÚA NỀN VÔ BỒN\n(50.000Đ/TẤN)', styleHeader());
  setCell(ws, 'Q6', 's', 'THÀNH TIỀN VÔ BỒN', styleHeader());
  setCell(ws, 'R6', 's', 'ĐƠN GIÁ\nXUẤT GẠO LỨC+TẤM\n(1.650Đ/BAO)', styleHeader());
  setCell(ws, 'S6', 's', 'THÀNH TIỀN XUẤT GẠO LỨC+TẤM', styleHeader());
  setCell(ws, 'T6', 's', 'ĐƠN GIÁ XUẤT TRẤU\n(11.000Đ/TẤN)', styleHeader());
  setCell(ws, 'U6', 's', 'THÀNH TIỀN XUẤT TRẤU', styleHeader());
  setCell(ws, 'V6', 's', 'TỔNG CỘNG', styleHeader());

  setCell(ws, 'A7', 's', '', styleHeader());
  setCell(ws, 'B7', 's', '', styleHeader());
  setCell(ws, 'C7', 's', '', styleHeader());
  setCell(ws, 'D7', 's', 'KHÁCH HÀNG', styleHeader());
  setCell(ws, 'E7', 's', 'LOẠI LÚA', styleHeader());
  setCell(ws, 'F7', 's', 'PHƯƠNG TIỆN', styleHeader());
  setCell(ws, 'G7', 's', '', styleHeader());
  setCell(ws, 'H7', 's', 'KG', styleHeader());
  setCell(ws, 'I7', 's', 'TẤN', styleHeader());
  setCell(ws, 'J7', 's', 'BAO', styleHeader());
  setCell(ws, 'K7', 's', 'XE\n(25.000Đ/TẤN)', styleHeader());
  setCell(ws, 'L7', 's', 'GHE\n(15.000Đ/TẤN)', styleHeader());
  for (const c of ['M','N','O','P','Q','R','S','T','U','V']) setCell(ws, `${c}7`, 's', '', styleHeader());

  // Data rows
  const startRow = 8;
  const endRow = startRow + Math.max(entries.length, 1) - 1;

  let totKg = 0;
  let totTons = 0;
  let totBao = 0;
  let totSay = 0;
  let totKho = 0;
  let totVoBon = 0;
  let totGao = 0;
  let totTrau = 0;
  let grandTotal = 0;

  entries.forEach((e, idx) => {
    const r = startRow + idx;
    ws['!rows']!.push({ hpt: 22 });

    setCell(ws, `A${r}`, 'n', idx + 1, styleData('center'));
    setCell(ws, `B${r}`, 's', e.date, styleData('center'));
    setCell(ws, `C${r}`, 's', 'ĐỨC', styleData('center', true));
    setCell(ws, `D${r}`, 's', e.customerName, styleData('left'));
    setCell(ws, `E${r}`, 's', e.riceType, styleData('center'));
    setCell(ws, `F${r}`, 's', e.vehicleName, styleData('center'));
    setCell(ws, `G${r}`, 's', e.jobDescription, styleData('left'));

    // Số lượng
    setCell(ws, `H${r}`, 'n', e.weightKg, styleNumber());
    setCell(ws, `I${r}`, 'n', e.roundedTons, styleNumber(true));
    setCell(ws, `J${r}`, 'n', e.bagCount || 0, styleNumber());

    // Sấy Xe / Ghe
    setCell(ws, `K${r}`, 'n', e.unitPriceSayXe || 0, styleMoney());
    setCell(ws, `L${r}`, 'n', e.unitPriceSayGhe || 0, styleMoney());
    setCell(ws, `M${r}`, 'n', e.thanhTienSay || 0, styleMoney(true), undefined, `(I${r}*K${r})+(I${r}*L${r})`);

    // Lúa khô
    setCell(ws, `N${r}`, 'n', e.unitPriceLuaKho || 0, styleMoney());
    setCell(ws, `O${r}`, 'n', e.thanhTienLuaKho || 0, styleMoney(true), undefined, `I${r}*N${r}`);

    // Vô bồn
    setCell(ws, `P${r}`, 'n', e.unitPriceVoBon || 0, styleMoney());
    setCell(ws, `Q${r}`, 'n', e.thanhTienVoBon || 0, styleMoney(), undefined, `I${r}*P${r}`);

    // Xuất gạo
    setCell(ws, `R${r}`, 'n', e.unitPriceXuatGao || 0, styleMoney());
    setCell(ws, `S${r}`, 'n', e.thanhTienXuatGao || 0, styleMoney(), undefined, `J${r}*R${r}`);

    // Xuất trấu
    setCell(ws, `T${r}`, 'n', e.unitPriceXuatTrau || 0, styleMoney());
    setCell(ws, `U${r}`, 'n', e.thanhTienXuatTrau || 0, styleMoney(), undefined, `I${r}*T${r}`);

    // Tổng dòng
    const rowTotal = (e.thanhTienSay || 0) + (e.thanhTienLuaKho || 0) + (e.thanhTienVoBon || 0) + (e.thanhTienXuatGao || 0) + (e.thanhTienXuatTrau || 0);
    setCell(ws, `V${r}`, 'n', rowTotal, styleMoney(true), undefined, `M${r}+O${r}+Q${r}+S${r}+U${r}`);

    totKg += e.weightKg;
    totTons += e.roundedTons;
    totBao += (e.bagCount || 0);
    totSay += (e.thanhTienSay || 0);
    totKho += (e.thanhTienLuaKho || 0);
    totVoBon += (e.thanhTienVoBon || 0);
    totGao += (e.thanhTienXuatGao || 0);
    totTrau += (e.thanhTienXuatTrau || 0);
    grandTotal += rowTotal;
  });

  // R5: Dòng TỔNG CỘNG
  const totStyle = styleTitle(true);
  for (const c of ['A','C','D','E','F','G','K','L','N','P','R','T']) setCell(ws, `${c}5`, 's', '', totStyle);
  setCell(ws, 'B5', 's', 'TỔNG CỘNG:', totStyle);
  setCell(ws, 'H5', 'n', totKg, { ...totStyle, numFmt: FMT_NUMBER }, undefined, `SUBTOTAL(109,H8:H${endRow})`);
  setCell(ws, 'I5', 'n', totTons, { ...totStyle, numFmt: FMT_NUMBER }, undefined, `SUBTOTAL(109,I8:I${endRow})`);
  setCell(ws, 'J5', 'n', totBao, { ...totStyle, numFmt: FMT_NUMBER }, undefined, `SUBTOTAL(109,J8:J${endRow})`);
  setCell(ws, 'M5', 'n', totSay, { ...totStyle, numFmt: FMT_MONEY }, undefined, `SUBTOTAL(109,M8:M${endRow})`);
  setCell(ws, 'O5', 'n', totKho, { ...totStyle, numFmt: FMT_MONEY }, undefined, `SUBTOTAL(109,O8:O${endRow})`);
  setCell(ws, 'Q5', 'n', totVoBon, { ...totStyle, numFmt: FMT_MONEY }, undefined, `SUBTOTAL(109,Q8:Q${endRow})`);
  setCell(ws, 'S5', 'n', totGao, { ...totStyle, numFmt: FMT_MONEY }, undefined, `SUBTOTAL(109,S8:S${endRow})`);
  setCell(ws, 'U5', 'n', totTrau, { ...totStyle, numFmt: FMT_MONEY }, undefined, `SUBTOTAL(109,U8:U${endRow})`);
  setCell(ws, 'V5', 'n', grandTotal, { ...totStyle, numFmt: FMT_MONEY }, undefined, `M5+O5+Q5+S5+U5`);

  // Chữ ký cuối bảng
  const signRow = endRow + 4;
  const nameRow = signRow + 4;
  setCell(ws, `B${signRow}`, 's', 'Người lập bảng', { font: { name: FONT_NAME, bold: true, sz: 11 }, alignment: { horizontal: 'center' } });
  setCell(ws, `G${signRow}`, 's', 'Xác nhận', { font: { name: FONT_NAME, bold: true, sz: 11 }, alignment: { horizontal: 'center' } });
  setCell(ws, `B${nameRow}`, 's', preparerName, { font: { name: FONT_NAME, bold: true, sz: 11 }, alignment: { horizontal: 'center' } });
  setCell(ws, `G${nameRow}`, 's', approverName, { font: { name: FONT_NAME, bold: true, sz: 11 }, alignment: { horizontal: 'center' } });

  ws['!merges'] = [
    { s: { r: 2, c: 0 }, e: { r: 2, c: 21 } }, // Title
    { s: { r: 5, c: 0 }, e: { r: 6, c: 0 } },  // STT
    { s: { r: 5, c: 1 }, e: { r: 6, c: 1 } },  // Ngày
    { s: { r: 5, c: 2 }, e: { r: 6, c: 2 } },  // Đội
    { s: { r: 6, c: 3 }, e: { r: 6, c: 3 } },  // Khách hàng
    { s: { r: 6, c: 4 }, e: { r: 6, c: 4 } },  // Loại lúa
    { s: { r: 6, c: 5 }, e: { r: 6, c: 5 } },  // Phương tiện
    { s: { r: 5, c: 6 }, e: { r: 6, c: 6 } },  // Công việc
    { s: { r: 5, c: 7 }, e: { r: 5, c: 9 } },  // Số lượng (kg, tấn, bao)
    { s: { r: 5, c: 10 }, e: { r: 5, c: 11 } },// Đơn giá sấy (xe, ghe)
    { s: { r: 5, c: 12 }, e: { r: 6, c: 12 } },// Thành tiền sấy
    { s: { r: 5, c: 13 }, e: { r: 6, c: 13 } },// Đơn giá lúa khô
    { s: { r: 5, c: 14 }, e: { r: 6, c: 14 } },// Thành tiền lúa khô
    { s: { r: 5, c: 15 }, e: { r: 6, c: 15 } },// Đơn giá vô bồn
    { s: { r: 5, c: 16 }, e: { r: 6, c: 16 } },// Thành tiền vô bồn
    { s: { r: 5, c: 17 }, e: { r: 6, c: 17 } },// Đơn giá xuất gạo
    { s: { r: 5, c: 18 }, e: { r: 6, c: 18 } },// Thành tiền xuất gạo
    { s: { r: 5, c: 19 }, e: { r: 6, c: 19 } },// Đơn giá xuất trấu
    { s: { r: 5, c: 20 }, e: { r: 6, c: 20 } },// Thành tiền xuất trấu
    { s: { r: 5, c: 21 }, e: { r: 6, c: 21 } },// Ghi chú / Tổng cộng
  ];

  ws['!ref'] = `A1:V${nameRow + 2}`;
  XLSX.utils.book_append_sheet(wb, ws, 'ĐỨC');
}

// ─── POST HANDLER ────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  if (!isRequestAuthenticated(req)) {
    return NextResponse.json({ error: 'Chưa xác thực phiên đăng nhập' }, { status: 401 });
  }

  try {
    const body: NSXTMPayload = await req.json();
    const {
      month = 10,
      year = 2026,
      targetTeam = 'QUÝ',
      entries = [],
      preparerName = 'Võ Hoàng Cẩm Tiên',
      approverName = 'Huỳnh Anh Phát Thịnh',
    } = body;

    const mm = String(month).padStart(2, '0');
    const yyyy = String(year);
    const wb = XLSX.utils.book_new();

    const entriesDuc = entries.filter((e) => e.team === 'ĐỨC');
    const entriesQuy = entries.filter((e) => e.team === 'QUÝ');

    let fileName = '';

    if (targetTeam === 'ĐỨC') {
      buildSheetDuc(wb, month, year, entriesDuc, preparerName, approverName);
      fileName = `LUONG_THANG_DOI_DUC_T${mm}_${yyyy}.xlsx`;
    } else if (targetTeam === 'QUÝ') {
      buildSheetQuy(wb, month, year, entriesQuy, preparerName, approverName);
      fileName = `LUONG_THANG_DOI_QUY_T${mm}_${yyyy}.xlsx`;
    } else {
      // Trường hợp ALL: tạo cả 2 sheet trong 1 file tổng
      buildSheetDuc(wb, month, year, entriesDuc, preparerName, approverName);
      buildSheetQuy(wb, month, year, entriesQuy, preparerName, approverName);
      fileName = `TONG_HOP_LUONG_NSX_TM_T${mm}_${yyyy}.xlsx`;
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
    console.error('Lỗi xuất Excel NSX TM:', error);
    return NextResponse.json(
      { error: (error as Error).message || 'Không thể tạo file Excel NSX TM' },
      { status: 500 }
    );
  }
}

