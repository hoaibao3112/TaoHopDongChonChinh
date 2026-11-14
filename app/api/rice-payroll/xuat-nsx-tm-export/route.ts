import { NextRequest, NextResponse } from 'next/server';
import XLSX from 'xlsx-js-style';
import { isRequestAuthenticated } from '@/lib/auth';
import { XuatNSXTMEntry, XuatNSXTMExportPayload } from '@/lib/rice-payroll/xuat-nsx-tm-types';

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

function styleTitle(): XLSX.CellStyle {
  return {
    font: { name: FONT_NAME, bold: true, sz: 14, color: { rgb: '000000' } },
    alignment: { horizontal: 'center', vertical: 'center' },
  };
}

function styleHeaderTotal(): XLSX.CellStyle {
  return {
    font: { name: FONT_NAME, bold: true, sz: 10, color: { rgb: 'CC0000' } },
    alignment: { horizontal: 'center', vertical: 'center' },
    fill: { fgColor: { rgb: 'FFF2CC' }, patternType: 'solid' },
    border: BORDER_THIN,
  };
}

function styleTotalNumber(): XLSX.CellStyle {
  return {
    font: { name: FONT_NAME, bold: true, sz: 10, color: { rgb: 'CC0000' } },
    alignment: { horizontal: 'right', vertical: 'center' },
    fill: { fgColor: { rgb: 'FFF2CC' }, patternType: 'solid' },
    border: BORDER_THIN,
    numFmt: FMT_NUMBER,
  };
}

function styleColHeader(): XLSX.CellStyle {
  return {
    font: { name: FONT_NAME, bold: true, sz: 9, color: { rgb: '000000' } },
    alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
    fill: { fgColor: { rgb: 'D9E1F2' }, patternType: 'solid' },
    border: BORDER_THIN,
  };
}

function styleData(align: 'left' | 'center' | 'right' = 'center', bold = false): XLSX.CellStyle {
  return {
    font: { name: FONT_NAME, bold, sz: 9 },
    alignment: { horizontal: align, vertical: 'center', wrapText: true },
    border: BORDER_THIN,
  };
}

function styleMoney(bold = false): XLSX.CellStyle {
  return {
    font: { name: FONT_NAME, bold, sz: 9, color: { rgb: bold ? 'CC0000' : '000000' } },
    alignment: { horizontal: 'right', vertical: 'center' },
    numFmt: FMT_MONEY,
    border: BORDER_THIN,
  };
}

function styleNumber(bold = false): XLSX.CellStyle {
  return {
    font: { name: FONT_NAME, bold, sz: 9 },
    alignment: { horizontal: 'right', vertical: 'center' },
    numFmt: FMT_NUMBER,
    border: BORDER_THIN,
  };
}

export async function POST(req: NextRequest) {
  try {
    const isAuth = await isRequestAuthenticated(req);
    if (!isAuth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const payload: XuatNSXTMExportPayload = await req.json();
    const { monthKey = '10/2026', entries = [], summary, nguoiLapBang = 'Võ Hoàng Cẩm Tiên', nguoiXacNhan = 'Huỳnh Anh Phát Thịnh', tamUng = 0 } = payload;

    const [month, year] = monthKey.includes('/') ? monthKey.split('/') : ['10', '2026'];
    const safeMonth = month.padStart(2, '0');

    const wb = XLSX.utils.book_new();

    // ─────────────────────────────────────────────────────────────────────────
    // SHEET 1: BK XUẤT ĐỌI NAM-T{mm}.{yyyy}
    // ─────────────────────────────────────────────────────────────────────────
    const ws1: XLSX.WorkSheet = {};
    const sheet1Name = `BK XUẤT ĐỌI NAM-T${safeMonth}.${year}`;

    // Hàng 1: Tiêu đề lớn
    const titleText = `BẢNG KÊ TÍNH LƯƠNG THÁNG ${safeMonth}/${year} ĐỘI NAM-XUẤT-NSX TM`;
    setCell(ws1, 'B1', 's', titleText, styleTitle());

    const numRows = entries.length;
    const startDataRow = 4;
    const endDataRow = startDataRow + numRows - 1;

    // Hàng 2: Hàng Tổng cộng (SUBTOTAL)
    setCell(ws1, 'D2', 's', 'TỔNG CỘNG: ', styleHeaderTotal());
    setCell(ws1, 'G2', 'n', 0, styleTotalNumber(), FMT_NUMBER, numRows > 0 ? `SUBTOTAL(109,G${startDataRow}:G${endDataRow})` : undefined);
    setCell(ws1, 'K2', 'n', 0, styleTotalNumber(), FMT_NUMBER, numRows > 0 ? `SUBTOTAL(109,K${startDataRow}:K${endDataRow})` : undefined);
    setCell(ws1, 'L2', 'n', summary?.totalKg ?? 0, styleTotalNumber(), FMT_NUMBER, numRows > 0 ? `SUBTOTAL(109,L${startDataRow}:L${endDataRow})` : undefined);
    setCell(ws1, 'N2', 'n', 0, styleTotalNumber(), FMT_NUMBER, numRows > 0 ? `SUBTOTAL(109,N${startDataRow}:N${endDataRow})` : undefined);
    setCell(ws1, 'P2', 'n', summary?.totalTons ?? 0, styleTotalNumber(), FMT_NUMBER, numRows > 0 ? `SUBTOTAL(109,P${startDataRow}:P${endDataRow})` : undefined);
    setCell(ws1, 'R2', 'n', summary?.thanhTienCoTro ?? 0, styleTotalNumber(), FMT_MONEY, numRows > 0 ? `SUBTOTAL(109,R${startDataRow}:R${endDataRow})` : undefined);
    setCell(ws1, 'T2', 'n', summary?.thanhTienKhongTro ?? 0, styleTotalNumber(), FMT_MONEY, numRows > 0 ? `SUBTOTAL(109,T${startDataRow}:T${endDataRow})` : undefined);
    setCell(ws1, 'W2', 'n', (summary?.thanhTienChumLua ?? 0) + (summary?.thanhTienChumNep ?? 0), styleTotalNumber(), FMT_MONEY, numRows > 0 ? `SUBTOTAL(109,W${startDataRow}:W${endDataRow})` : undefined);
    setCell(ws1, 'Y2', 'n', summary?.thanhTienVoBon ?? 0, styleTotalNumber(), FMT_MONEY, numRows > 0 ? `SUBTOTAL(109,Y${startDataRow}:Y${endDataRow})` : undefined);
    setCell(ws1, 'Z2', 'n', summary?.tongCong ?? 0, styleTotalNumber(), FMT_MONEY, numRows > 0 ? `R2+T2+W2+Y2` : undefined);

    // Hàng 3: Tiêu đề cột
    const colHeaders = [
      'SỐ HĐ',
      'NGÀY \r\nCÂN',
      'NHÂN VIÊN \r\nTHU MUA',
      'KHÁCH HÀNG',
      'LOẠI LÚA',
      'MÃ LÔ',
      'SỐ LƯỢNG\r\n(KG)',
      'PHƯƠNG TIỆN TĂNG BO\r\nLÚA TƯƠI NHẬP SẤY',
      'NGÀY NHẬP SẤY',
      'ĐỊA ĐIỂM SẤY\r\n(CƠ SỞ SẤY)',
      'GHI CHÚ CÂN NHẬP\r\n(TÌNH TRẠNG CÂN)',
      'CÂN NHẬP SẤY\r\n(KG)',
      'NGÀY\r\nXUỐNG LÚA KHÔ\r\n(NHẬN XUẤT TRẢ)',
      'SỐ LIỆU LÚA KHÔ SAU SẤY\r\n(CÂN LÒ SẤY)\r\n(KG)',
      'PHƯƠNG TIỆN CHỞ LÚA KHÔ\r\n(TĂNG BO SAU SẤY)',
      'SỐ LƯỢNG \r\nLÚA TƯƠI\r\n(TẤN)',
      'ĐƠN GIÁ \r\nXUẤT\r\n CÓ TRỞ (17.000Đ/Tấn)',
      'THÀNH TIỀN GIÁ \r\nXUẤT\r\n CÓ TRỞ',
      'ĐƠN GIÁ \r\nXUẤT\r\n KHÔNG TRỞ (11.000Đ/Tấn)',
      'THÀNH TIỀN XUẤT\r\n KHÔNG TRỞ',
      `ĐƠN GIÁ \r\nCHỤM LÒ \r\n8.000Đ/Tấn\r\n(Áp dụng cho Lúa Trong Tháng ${safeMonth}/${year})`,
      `ĐƠN GIÁ \r\nCHỤM LÒ 11.000Đ/Tấn\r\n(Áp dụng cho Nếp Trong Tháng ${safeMonth}/${year})`,
      'THÀNH TIỀN CHỤM LÒ',
      'ĐƠN GIÁ \r\nVÔ BỒN\r\n(3.000Đ/Tấn)',
      'THÀNH TIỀN VÔ BỒN',
      'GHI CHÚ',
    ];

    colHeaders.forEach((hdr, idx) => {
      const colLetter = XLSX.utils.encode_col(idx);
      setCell(ws1, `${colLetter}3`, 's', hdr, styleColHeader());
    });

    // Dữ liệu từng dòng
    entries.forEach((row, i) => {
      const r = startDataRow + i;

      setCell(ws1, `A${r}`, 's', row.soHD || '', styleData('center'));
      setCell(ws1, `B${r}`, 's', row.ngayCan || '', styleData('center'));
      setCell(ws1, `C${r}`, 's', row.nhanVienThuMua || '', styleData('left'));
      setCell(ws1, `D${r}`, 's', row.khachHang || '', styleData('left', true));
      setCell(ws1, `E${r}`, 's', row.loaiLua || '', styleData('left'));
      setCell(ws1, `F${r}`, 's', row.maLo || '', styleData('center'));
      setCell(ws1, `G${r}`, 'n', row.soLuongKg || 0, styleNumber());
      setCell(ws1, `H${r}`, 's', row.phuongTienTangBo || '', styleData('left'));
      setCell(ws1, `I${r}`, 's', row.ngayNhapSay || '', styleData('center'));
      setCell(ws1, `J${r}`, 's', row.diaDiemSay || 'NSX TM', styleData('center'));
      setCell(ws1, `K${r}`, 's', row.ghiChuCanNhap || '', styleData('left'));
      setCell(ws1, `L${r}`, 'n', row.canNhapSayKg || 0, styleNumber(true));
      setCell(ws1, `M${r}`, 's', row.ngayXuongLuaKho || '', styleData('center', true));
      setCell(ws1, `N${r}`, 'n', row.soLieuLuaKhoKg || 0, styleNumber());
      setCell(ws1, `O${r}`, 's', row.phuongTienChoLuaKho || 'VÔ BỒN', styleData('center'));
      setCell(ws1, `P${r}`, 'n', row.soLuongTan || 0, styleNumber(true));

      // Q: Đơn giá xuất có trở
      if (row.donGiaCoTro > 0) {
        setCell(ws1, `Q${r}`, 'n', row.donGiaCoTro, styleMoney());
      } else {
        setCell(ws1, `Q${r}`, 's', '', styleData('center'));
      }
      // R: Thành tiền xuất có trở = P * Q
      setCell(ws1, `R${r}`, 'n', row.thanhTienCoTro || 0, styleMoney(), FMT_MONEY, `P${r}*Q${r}`);

      // S: Đơn giá xuất không trở
      if (row.donGiaKhongTro > 0) {
        setCell(ws1, `S${r}`, 'n', row.donGiaKhongTro, styleMoney());
      } else {
        setCell(ws1, `S${r}`, 's', '', styleData('center'));
      }
      // T: Thành tiền xuất không trở = P * S
      setCell(ws1, `T${r}`, 'n', row.thanhTienKhongTro || 0, styleMoney(), FMT_MONEY, `P${r}*S${r}`);

      // U: Chụm lò lúa 8k
      if (row.donGiaChumLua > 0) {
        setCell(ws1, `U${r}`, 'n', row.donGiaChumLua, styleMoney());
      } else {
        setCell(ws1, `U${r}`, 's', '', styleData('center'));
      }
      // V: Chụm lò nếp 11k
      if (row.donGiaChumNep > 0) {
        setCell(ws1, `V${r}`, 'n', row.donGiaChumNep, styleMoney());
      } else {
        setCell(ws1, `V${r}`, 's', '', styleData('center'));
      }
      // W: Thành tiền chụm lò = U*P + V*P
      setCell(ws1, `W${r}`, 'n', row.thanhTienChum || 0, styleMoney(), FMT_MONEY, `U${r}*P${r}+V${r}*P${r}`);

      // X: Đơn giá vô bồn 3k
      setCell(ws1, `X${r}`, 'n', row.donGiaVoBon || 3000, styleMoney());
      // Y: Thành tiền vô bồn = X * P
      setCell(ws1, `Y${r}`, 'n', row.thanhTienVoBon || 0, styleMoney(), FMT_MONEY, `X${r}*P${r}`);

      // Z: Ghi chú
      setCell(ws1, `Z${r}`, 's', row.ghiChu || '', styleData('left'));
    });

    // Phần Chữ ký ở cuối Sheet 1
    const sigRowTitle = Math.max(endDataRow + 3, 38);
    const sigRowName = sigRowTitle + 6;

    setCell(ws1, `C${sigRowTitle}`, 's', 'Người lập bảng', {
      font: { name: FONT_NAME, bold: true, sz: 11 },
      alignment: { horizontal: 'center', vertical: 'center' },
    });
    setCell(ws1, `O${sigRowTitle}`, 's', 'Xác nhận', {
      font: { name: FONT_NAME, bold: true, sz: 11 },
      alignment: { horizontal: 'center', vertical: 'center' },
    });

    setCell(ws1, `C${sigRowName}`, 's', nguoiLapBang, {
      font: { name: FONT_NAME, bold: true, sz: 11 },
      alignment: { horizontal: 'center', vertical: 'center' },
    });
    setCell(ws1, `O${sigRowName}`, 's', nguoiXacNhan, {
      font: { name: FONT_NAME, bold: true, sz: 11 },
      alignment: { horizontal: 'center', vertical: 'center' },
    });

    // Merges cho Sheet 1
    ws1['!merges'] = [
      { s: { c: 1, r: 0 }, e: { c: 25, r: 0 } }, // B1:Z1 (Tiêu đề)
      { s: { c: 4, r: 1 }, e: { c: 5, r: 1 } },  // E2:F2
      { s: { c: 2, r: sigRowTitle - 1 }, e: { c: 7, r: sigRowTitle - 1 } }, // C:H Người lập bảng
      { s: { c: 14, r: sigRowTitle - 1 }, e: { c: 21, r: sigRowTitle - 1 } }, // O:V Xác nhận
      { s: { c: 2, r: sigRowName - 1 }, e: { c: 7, r: sigRowName - 1 } }, // C:H Tên người lập
      { s: { c: 14, r: sigRowName - 1 }, e: { c: 21, r: sigRowName - 1 } }, // O:V Tên người duyệt
    ];

    // Độ rộng cột Sheet 1
    ws1['!cols'] = [
      { wch: 8 },  // A: SỐ HĐ
      { wch: 12 }, // B: NGÀY CÂN
      { wch: 18 }, // C: NV THU MUA
      { wch: 22 }, // D: KHÁCH HÀNG
      { wch: 16 }, // E: LOẠI LÚA
      { wch: 10 }, // F: MÃ LÔ
      { wch: 12 }, // G: SỐ LƯỢNG KG
      { wch: 18 }, // H: PT TĂNG BO
      { wch: 13 }, // I: NGÀY NHẬP SẤY
      { wch: 14 }, // J: ĐỊA ĐIỂM SẤY
      { wch: 16 }, // K: GHI CHÚ CÂN NHẬP
      { wch: 14 }, // L: CÂN NHẬP SẤY
      { wch: 14 }, // M: NGÀY XUỐNG LÚA KHÔ
      { wch: 14 }, // N: SỐ LIỆU LÚA KHÔ
      { wch: 16 }, // O: PT CHỞ LÚA KHÔ
      { wch: 12 }, // P: SỐ LƯỢNG TẤN
      { wch: 14 }, // Q: ĐƠN GIÁ CÓ TRỞ
      { wch: 15 }, // R: THÀNH TIỀN CÓ TRỞ
      { wch: 14 }, // S: ĐƠN GIÁ KHÔNG TRỞ
      { wch: 15 }, // T: THÀNH TIỀN KHÔNG TRỞ
      { wch: 16 }, // U: ĐƠN GIÁ CHỤM LÒ LÚA
      { wch: 16 }, // V: ĐƠN GIÁ CHỤM LÒ NẾP
      { wch: 15 }, // W: THÀNH TIỀN CHỤM LÒ
      { wch: 14 }, // X: ĐƠN GIÁ VÔ BỒN
      { wch: 15 }, // Y: THÀNH TIỀN VÔ BỒN
      { wch: 20 }, // Z: GHI CHÚ
    ];

    ws1['!ref'] = `A1:Z${sigRowName + 1}`;
    XLSX.utils.book_append_sheet(wb, ws1, sheet1Name);

    // ─────────────────────────────────────────────────────────────────────────
    // SHEET 2: CHI LƯƠNG ĐỘI NAM-XUẤT T{mm}.{yyyy}
    // ─────────────────────────────────────────────────────────────────────────
    const ws2: XLSX.WorkSheet = {};
    const sheet2Name = `CHI LƯƠNG ĐỘI NAM-XUẤT T${safeMonth}.${year}`;

    // Hàng 5: Tiêu đề Sheet 2
    const s2Title = `BẢNG KÊ ĐỘI NAM - XUẤT CTY NSX TM THÁNG ${safeMonth}/${year}`;
    setCell(ws2, 'B5', 's', s2Title, {
      font: { name: FONT_NAME, bold: true, sz: 12, color: { rgb: '000000' } },
      alignment: { horizontal: 'center', vertical: 'center' },
    });

    // Hàng 6: Tiêu đề cột Sheet 2
    const s2Headers = ['XUẤT LÚA KHÔ', 'SỐ LƯỢNG (TẤN)', 'ĐƠN GIÁ (ĐỒNG/TẤN)', 'THÀNH TIỀN'];
    setCell(ws2, 'B6', 's', s2Headers[0], styleColHeader());
    setCell(ws2, 'C6', 's', s2Headers[1], styleColHeader());
    setCell(ws2, 'D6', 's', s2Headers[2], styleColHeader());
    setCell(ws2, 'E6', 's', s2Headers[3], styleColHeader());

    // Row 7: TỔNG XUẤT CÓ TRỞ (JAPONICA)
    setCell(ws2, 'B7', 's', 'TỔNG XUẤT CÓ TRỞ\r\n(JAPONICA)', styleData('left', true));
    setCell(ws2, 'C7', 'n', summary?.tonsCoTro ?? 0, styleNumber());
    setCell(ws2, 'D7', 'n', 17000, styleMoney());
    setCell(ws2, 'E7', 'n', summary?.thanhTienCoTro ?? 0, styleMoney(true), FMT_MONEY, 'C7*D7');

    // Row 8: TỔNG XUẤT KHÔNG TRỞ (NẾP/ NẾP CPC, ST25 ĐL)
    setCell(ws2, 'B8', 's', 'TỔNG XUẤT KHÔNG TRỞ\r\n(NẾP/ NẾP CPC, ST25 ĐL)', styleData('left', true));
    setCell(ws2, 'C8', 'n', summary?.tonsKhongTro ?? 0, styleNumber());
    setCell(ws2, 'D8', 'n', 11000, styleMoney());
    setCell(ws2, 'E8', 'n', summary?.thanhTienKhongTro ?? 0, styleMoney(true), FMT_MONEY, 'C8*D8');

    // Row 9: CHỤM LÒ (Áp dụng với Lúa)
    setCell(ws2, 'B9', 's', 'CHỤM LÒ \r\n(Áp dụng với Lúa)', styleData('left', true));
    setCell(ws2, 'C9', 'n', summary?.tonsChumLua ?? 0, styleNumber());
    setCell(ws2, 'D9', 'n', 8000, styleMoney());
    setCell(ws2, 'E9', 'n', summary?.thanhTienChumLua ?? 0, styleMoney(true), FMT_MONEY, 'C9*D9');

    // Row 10: CHỤM LÒ (Áp dụng với Nếp/ Nếp CPC)
    setCell(ws2, 'B10', 's', 'CHỤM LÒ \r\n(Áp dụng với Nếp/ Nếp CPC)', styleData('left', true));
    setCell(ws2, 'C10', 'n', summary?.tonsChumNep ?? 0, styleNumber());
    setCell(ws2, 'D10', 'n', 11000, styleMoney());
    setCell(ws2, 'E10', 'n', summary?.thanhTienChumNep ?? 0, styleMoney(true), FMT_MONEY, 'C10*D10');

    // Row 11: VÔ BỒN
    setCell(ws2, 'B11', 's', 'VÔ BỒN', styleData('left', true));
    setCell(ws2, 'C11', 'n', summary?.tonsVoBon ?? 0, styleNumber());
    setCell(ws2, 'D11', 'n', 3000, styleMoney());
    setCell(ws2, 'E11', 'n', summary?.thanhTienVoBon ?? 0, styleMoney(true), FMT_MONEY, 'C11*D11');

    // Row 12: TỔNG CỘNG :
    setCell(ws2, 'B12', 's', 'TỔNG CỘNG :', styleData('center', true));
    setCell(ws2, 'C12', 's', '', styleData('center'));
    setCell(ws2, 'D12', 's', '', styleData('center'));
    setCell(ws2, 'E12', 'n', summary?.tongCong ?? 0, {
      font: { name: FONT_NAME, bold: true, sz: 11, color: { rgb: 'CC0000' } },
      alignment: { horizontal: 'right', vertical: 'center' },
      numFmt: FMT_MONEY,
      border: BORDER_THIN,
    }, FMT_MONEY, 'SUM(E7:E11)');

    // Row 13: TRỪ TẠM ỨNG :
    setCell(ws2, 'B13', 's', 'TRỪ TẠM ỨNG :', styleData('center', true));
    setCell(ws2, 'C13', 's', '', styleData('center'));
    setCell(ws2, 'D13', 's', '', styleData('center'));
    setCell(ws2, 'E13', 'n', tamUng || 0, styleMoney(true));

    // Row 14: CÒN LẠI :
    setCell(ws2, 'B14', 's', 'CÒN LẠI :', styleData('center', true));
    setCell(ws2, 'C14', 's', '', styleData('center'));
    setCell(ws2, 'D14', 's', '', styleData('center'));
    const conLaiVal = Math.max(0, (summary?.tongCong ?? 0) - (tamUng || 0));
    setCell(ws2, 'E14', 'n', conLaiVal, {
      font: { name: FONT_NAME, bold: true, sz: 11, color: { rgb: '006100' } },
      alignment: { horizontal: 'right', vertical: 'center' },
      numFmt: FMT_MONEY,
      fill: { fgColor: { rgb: 'C6EFCE' }, patternType: 'solid' },
      border: BORDER_MEDIUM_BOTTOM,
    }, FMT_MONEY, 'E12-E13');

    // Merges cho Sheet 2
    ws2['!merges'] = [
      { s: { c: 1, r: 4 }, e: { c: 4, r: 4 } },   // B5:E5
      { s: { c: 2, r: 11 }, e: { c: 3, r: 11 } }, // C12:D12
      { s: { c: 2, r: 12 }, e: { c: 3, r: 12 } }, // C13:D13
      { s: { c: 2, r: 13 }, e: { c: 3, r: 13 } }, // C14:D14
    ];

    ws2['!cols'] = [
      { wch: 4 },  // A
      { wch: 34 }, // B: XUẤT LÚA KHÔ
      { wch: 18 }, // C: SỐ LƯỢNG (TẤN)
      { wch: 22 }, // D: ĐƠN GIÁ (ĐỒNG/TẤN)
      { wch: 20 }, // E: THÀNH TIỀN
    ];

    ws2['!ref'] = 'A1:E16';
    XLSX.utils.book_append_sheet(wb, ws2, sheet2Name);

    // Xuất Buffer Excel
    const wbBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' });
    const filename = `LUONG_DOI_NAM-XUAT_NSX_DTM_T${safeMonth}_${year}.xlsx`;

    return new NextResponse(wbBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (error: any) {
    console.error('Lỗi xuất Excel Xuất NSX TM:', error);
    return NextResponse.json({ error: error?.message || 'Lỗi xuất file Excel' }, { status: 500 });
  }
}
