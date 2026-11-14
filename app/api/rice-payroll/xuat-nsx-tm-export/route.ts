import { NextRequest, NextResponse } from 'next/server';
import XLSX from 'xlsx-js-style';
import { isRequestAuthenticated } from '@/lib/auth';
import { XuatNSXTMExportPayload } from '@/lib/rice-payroll/xuat-nsx-tm-types';

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
  value: unknown,
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

function styleHeaderTotal(align: 'center' | 'right' | 'left' = 'center'): XLSX.CellStyle {
  return {
    font: { name: FONT_NAME, bold: true, sz: 10, color: { rgb: 'CC0000' } },
    alignment: { horizontal: align, vertical: 'center' },
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

function styleColHeaderBlue(): XLSX.CellStyle {
  return {
    font: { name: FONT_NAME, bold: true, sz: 9, color: { rgb: 'FFFFFF' } },
    alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
    fill: { fgColor: { rgb: '203764' }, patternType: 'solid' },
    border: BORDER_THIN,
  };
}

function styleColHeaderGreen(): XLSX.CellStyle {
  return {
    font: { name: FONT_NAME, bold: true, sz: 9, color: { rgb: 'FFFFFF' } },
    alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
    fill: { fgColor: { rgb: '385723' }, patternType: 'solid' },
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
    const {
      monthKey = '10/2026',
      entries = [],
      summary,
      nguoiLapBang = 'Võ Hoàng Cẩm Tiên',
      nguoiXacNhan = 'Huỳnh Anh Phát Thịnh',
      tamUng = 0,
      unitPrices = {
        priceCoTro: 17000,
        priceKhongTro: 11000,
        priceChumLua: 8000,
        priceChumNep: 11000,
        priceVoBon: 3000,
      },
    } = payload;

    const [month, year] = monthKey.includes('/') ? monthKey.split('/') : ['10', '2026'];
    const safeMonth = month.padStart(2, '0');

    const pCoTro = unitPrices?.priceCoTro ?? 17000;
    const pKhongTro = unitPrices?.priceKhongTro ?? 11000;
    const pChumLua = unitPrices?.priceChumLua ?? 8000;
    const pChumNep = unitPrices?.priceChumNep ?? 11000;
    const pVoBon = unitPrices?.priceVoBon ?? 3000;

    const wb = XLSX.utils.book_new();

    // ─────────────────────────────────────────────────────────────────────────
    // SHEET 1: BK XUẤT ĐỌI NAM-T{mm}.{yyyy} (ĐÚNG 19 CỘT THEO ẢNH YÊU CẦU)
    // ─────────────────────────────────────────────────────────────────────────
    const ws1: XLSX.WorkSheet = {};
    const sheet1Name = `BK XUẤT ĐỌI NAM-T${safeMonth}.${year}`;

    // Hàng 1: Tiêu đề lớn
    const titleText = `BẢNG KÊ TÍNH LƯƠNG THÁNG ${safeMonth}/${year} ĐỘI NAM-XUẤT-NSX TM`;
    setCell(ws1, 'A1', 's', titleText, styleTitle());

    const numRows = entries.length;
    const startDataRow = 4;
    const endDataRow = numRows > 0 ? startDataRow + numRows - 1 : startDataRow;

    // Hàng 2: Hàng Tổng cộng (SUBTOTAL)
    // Cột A..E: TỔNG CỘNG:
    for (const c of ['A', 'B', 'C', 'D', 'E']) {
      setCell(ws1, `${c}2`, 's', c === 'A' ? 'TỔNG CỘNG:' : '', styleHeaderTotal('center'));
    }

    // F2: CÂN NHẬP SẤY (KG)
    setCell(
      ws1,
      'F2',
      'n',
      summary?.totalKg ?? 0,
      styleTotalNumber(),
      FMT_NUMBER,
      numRows > 0 ? `SUBTOTAL(109,F${startDataRow}:F${endDataRow})` : undefined
    );

    // G2, H2: trống
    setCell(ws1, 'G2', 's', '', styleHeaderTotal());
    setCell(ws1, 'H2', 's', '', styleHeaderTotal());

    // I2: SỐ LƯỢNG LÚA TƯƠI (TẤN)
    setCell(
      ws1,
      'I2',
      'n',
      summary?.totalTons ?? 0,
      styleTotalNumber(),
      FMT_NUMBER,
      numRows > 0 ? `SUBTOTAL(109,I${startDataRow}:I${endDataRow})` : undefined
    );

    // J2: trống
    setCell(ws1, 'J2', 's', '', styleHeaderTotal());

    // K2: THÀNH TIỀN GIÁ XUẤT CÓ TRỞ
    setCell(
      ws1,
      'K2',
      'n',
      summary?.thanhTienCoTro ?? 0,
      styleTotalNumber(),
      FMT_MONEY,
      numRows > 0 ? `SUBTOTAL(109,K${startDataRow}:K${endDataRow})` : undefined
    );

    // L2: trống
    setCell(ws1, 'L2', 's', '', styleHeaderTotal());

    // M2: THÀNH TIỀN XUẤT KHÔNG TRỞ
    setCell(
      ws1,
      'M2',
      'n',
      summary?.thanhTienKhongTro ?? 0,
      styleTotalNumber(),
      FMT_MONEY,
      numRows > 0 ? `SUBTOTAL(109,M${startDataRow}:M${endDataRow})` : undefined
    );

    // N2, O2: trống
    setCell(ws1, 'N2', 's', '', styleHeaderTotal());
    setCell(ws1, 'O2', 's', '', styleHeaderTotal());

    // P2: THÀNH TIỀN CHỤM LÒ
    const totalTienChum = (summary?.thanhTienChumLua ?? 0) + (summary?.thanhTienChumNep ?? 0);
    setCell(
      ws1,
      'P2',
      'n',
      totalTienChum,
      styleTotalNumber(),
      FMT_MONEY,
      numRows > 0 ? `SUBTOTAL(109,P${startDataRow}:P${endDataRow})` : undefined
    );

    // Q2: trống
    setCell(ws1, 'Q2', 's', '', styleHeaderTotal());

    // R2: THÀNH TIỀN VÔ BỒN
    setCell(
      ws1,
      'R2',
      'n',
      summary?.thanhTienVoBon ?? 0,
      styleTotalNumber(),
      FMT_MONEY,
      numRows > 0 ? `SUBTOTAL(109,R${startDataRow}:R${endDataRow})` : undefined
    );

    // S2: trống
    setCell(ws1, 'S2', 's', '', styleHeaderTotal());

    // Hàng 3: Tiêu đề 19 cột chuẩn theo đúng ảnh người dùng
    const colHeaders = [
      { text: 'NGÀY\r\nCÂN', isBlue: true },                                                         // A (0)
      { text: 'KHÁCH HÀNG', isBlue: true },                                                          // B (1)
      { text: 'LOẠI LÚA', isBlue: true },                                                            // C (2)
      { text: 'NGÀY\r\nNHẬP SẤY', isBlue: true },                                                    // D (3)
      { text: 'ĐỊA ĐIỂM SẤY\r\n(CƠ SỞ SẤY)', isBlue: true },                                         // E (4)
      { text: 'CÂN NHẬP SẤY\r\n(KG)', isBlue: true },                                                // F (5)
      { text: 'NGÀY XUỐNG LÚA KHÔ\r\n(NHẬN XUẤT TRẢ)', isBlue: true },                               // G (6)
      { text: 'PHƯƠNG TIỆN CHỞ LÚA KHÔ\r\n(TĂNG BO SAU SẤY)', isBlue: true },                        // H (7)
      { text: 'SỐ LƯỢNG LÚA TƯƠI\r\n(TẤN)', isBlue: true },                                          // I (8)
      { text: `ĐƠN GIÁ\r\nXUẤT CÓ TRỞ\r\n(${pCoTro.toLocaleString('vi-VN')}Đ/Tấn)`, isBlue: false }, // J (9)
      { text: 'THÀNH TIỀN\r\nGIÁ XUẤT\r\nCÓ TRỞ', isBlue: false },                                   // K (10)
      { text: `ĐƠN GIÁ\r\nXUẤT KHÔNG TRỞ\r\n(${pKhongTro.toLocaleString('vi-VN')}Đ/Tấn)`, isBlue: false }, // L (11)
      { text: 'THÀNH TIỀN\r\nXUẤT KHÔNG TRỞ', isBlue: false },                                       // M (12)
      { text: `ĐƠN GIÁ CHỤM LÒ\r\n${pChumLua.toLocaleString('vi-VN')}Đ/Tấn\r\n(Áp dụng cho Lúa Trong Tháng ${safeMonth}/${year})`, isBlue: false }, // N (13)
      { text: `ĐƠN GIÁ CHỤM LÒ\r\n${pChumNep.toLocaleString('vi-VN')}Đ/Tấn\r\n(Áp dụng cho Nếp Trong Tháng ${safeMonth}/${year})`, isBlue: false }, // O (14)
      { text: 'THÀNH TIỀN\r\nCHỤM LÒ', isBlue: false },                                              // P (15)
      { text: `ĐƠN GIÁ\r\nVÔ BỒN\r\n(${pVoBon.toLocaleString('vi-VN')}Đ/Tấn)`, isBlue: false },      // Q (16)
      { text: 'THÀNH TIỀN\r\nVÔ BỒN', isBlue: false },                                               // R (17)
      { text: 'GHI CHÚ', isBlue: false },                                                            // S (18)
    ];

    colHeaders.forEach((hdr, idx) => {
      const colLetter = XLSX.utils.encode_col(idx);
      setCell(
        ws1,
        `${colLetter}3`,
        's',
        hdr.text,
        hdr.isBlue ? styleColHeaderBlue() : styleColHeaderGreen()
      );
    });

    // Dữ liệu từng dòng mẻ lúa (Bắt đầu từ Hàng 4)
    entries.forEach((row, i) => {
      const r = startDataRow + i;

      // Col A: NGÀY CÂN
      setCell(ws1, `A${r}`, 's', row.ngayCan || '', styleData('center'));
      // Col B: KHÁCH HÀNG
      setCell(ws1, `B${r}`, 's', row.khachHang || '', styleData('left', true));
      // Col C: LOẠI LÚA
      setCell(ws1, `C${r}`, 's', row.loaiLua || '', styleData('left'));
      // Col D: NGÀY NHẬP SẤY
      setCell(ws1, `D${r}`, 's', row.ngayNhapSay || '', styleData('center'));
      // Col E: ĐỊA ĐIỂM SẤY (CƠ SỞ SẤY)
      setCell(ws1, `E${r}`, 's', row.diaDiemSay || 'NSX TM', styleData('center'));
      // Col F: CÂN NHẬP SẤY (KG)
      setCell(ws1, `F${r}`, 'n', row.canNhapSayKg || 0, styleNumber(true));
      // Col G: NGÀY XUỐNG LÚA KHÔ (NHẬN XUẤT TRẢ)
      setCell(ws1, `G${r}`, 's', row.ngayXuongLuaKho || '', styleData('center'));
      // Col H: PHƯƠNG TIỆN CHỞ LÚA KHÔ (TĂNG BO SAU SẤY)
      setCell(ws1, `H${r}`, 's', row.phuongTienChoLuaKho || 'VÔ BỒN', styleData('center'));
      // Col I: SỐ LƯỢNG LÚA TƯƠI (TẤN)
      setCell(ws1, `I${r}`, 'n', row.soLuongTan || 0, styleNumber(true));

      // Col J: ĐƠN GIÁ XUẤT CÓ TRỞ
      if (row.donGiaCoTro > 0) {
        setCell(ws1, `J${r}`, 'n', row.donGiaCoTro, styleMoney());
      } else {
        setCell(ws1, `J${r}`, 's', '', styleData('center'));
      }
      // Col K: THÀNH TIỀN GIÁ XUẤT CÓ TRỞ = I * J
      setCell(ws1, `K${r}`, 'n', row.thanhTienCoTro || 0, styleMoney(), FMT_MONEY, `I${r}*J${r}`);

      // Col L: ĐƠN GIÁ XUẤT KHÔNG TRỞ
      if (row.donGiaKhongTro > 0) {
        setCell(ws1, `L${r}`, 'n', row.donGiaKhongTro, styleMoney());
      } else {
        setCell(ws1, `L${r}`, 's', '', styleData('center'));
      }
      // Col M: THÀNH TIỀN XUẤT KHÔNG TRỞ = I * L
      setCell(ws1, `M${r}`, 'n', row.thanhTienKhongTro || 0, styleMoney(), FMT_MONEY, `I${r}*L${r}`);

      // Col N: ĐƠN GIÁ CHỤM LÒ LÚA
      if (row.donGiaChumLua > 0) {
        setCell(ws1, `N${r}`, 'n', row.donGiaChumLua, styleMoney());
      } else {
        setCell(ws1, `N${r}`, 's', '', styleData('center'));
      }

      // Col O: ĐƠN GIÁ CHỤM LÒ NẾP
      if (row.donGiaChumNep > 0) {
        setCell(ws1, `O${r}`, 'n', row.donGiaChumNep, styleMoney());
      } else {
        setCell(ws1, `O${r}`, 's', '', styleData('center'));
      }

      // Col P: THÀNH TIỀN CHỤM LÒ
      const chumForm = `IF(N${r}>0,I${r}*N${r},IF(O${r}>0,I${r}*O${r},0))`;
      setCell(ws1, `P${r}`, 'n', row.thanhTienChum || 0, styleMoney(), FMT_MONEY, chumForm);

      // Col Q: ĐƠN GIÁ VÔ BỒN
      if (row.donGiaVoBon > 0) {
        setCell(ws1, `Q${r}`, 'n', row.donGiaVoBon, styleMoney());
      } else {
        setCell(ws1, `Q${r}`, 's', '', styleData('center'));
      }

      // Col R: THÀNH TIỀN VÔ BỒN = I * Q
      setCell(ws1, `R${r}`, 'n', row.thanhTienVoBon || 0, styleMoney(), FMT_MONEY, `I${r}*Q${r}`);

      // Col S: GHI CHÚ
      setCell(ws1, `S${r}`, 's', row.ghiChu || '', styleData('left'));
    });

    // Phần Chữ ký ở cuối Sheet 1
    const sigRowTitle = Math.max(endDataRow + 3, 20);
    const sigRowName = sigRowTitle + 6;

    setCell(ws1, `B${sigRowTitle}`, 's', 'Người lập bảng', {
      font: { name: FONT_NAME, bold: true, sz: 11 },
      alignment: { horizontal: 'center', vertical: 'center' },
    });
    setCell(ws1, `L${sigRowTitle}`, 's', 'Xác nhận', {
      font: { name: FONT_NAME, bold: true, sz: 11 },
      alignment: { horizontal: 'center', vertical: 'center' },
    });

    setCell(ws1, `B${sigRowName}`, 's', nguoiLapBang, {
      font: { name: FONT_NAME, bold: true, sz: 11 },
      alignment: { horizontal: 'center', vertical: 'center' },
    });
    setCell(ws1, `L${sigRowName}`, 's', nguoiXacNhan, {
      font: { name: FONT_NAME, bold: true, sz: 11 },
      alignment: { horizontal: 'center', vertical: 'center' },
    });

    // Merges cho Sheet 1
    ws1['!merges'] = [
      { s: { c: 0, r: 0 }, e: { c: 18, r: 0 } }, // A1:S1 (Tiêu đề lớn)
      { s: { c: 0, r: 1 }, e: { c: 4, r: 1 } },  // A2:E2 (TỔNG CỘNG:)
      { s: { c: 1, r: sigRowTitle - 1 }, e: { c: 3, r: sigRowTitle - 1 } }, // B:D Người lập bảng
      { s: { c: 11, r: sigRowTitle - 1 }, e: { c: 14, r: sigRowTitle - 1 } }, // L:O Xác nhận
      { s: { c: 1, r: sigRowName - 1 }, e: { c: 3, r: sigRowName - 1 } }, // B:D Tên người lập
      { s: { c: 11, r: sigRowName - 1 }, e: { c: 14, r: sigRowName - 1 } }, // L:O Tên người duyệt
    ];

    // Độ rộng cột Sheet 1 (19 cột: A -> S)
    ws1['!cols'] = [
      { wch: 13 }, // A: NGÀY CÂN
      { wch: 24 }, // B: KHÁCH HÀNG
      { wch: 15 }, // C: LOẠI LÚA
      { wch: 13 }, // D: NGÀY NHẬP SẤY
      { wch: 14 }, // E: ĐỊA ĐIỂM SẤY
      { wch: 16 }, // F: CÂN NHẬP SẤY (KG)
      { wch: 15 }, // G: NGÀY XUỐNG LÚA KHÔ
      { wch: 16 }, // H: PHƯƠNG TIỆN CHỞ LÚA KHÔ
      { wch: 12 }, // I: SỐ LƯỢNG LÚA TƯƠI (TẤN)
      { wch: 14 }, // J: ĐƠN GIÁ CÓ TRỞ
      { wch: 16 }, // K: THÀNH TIỀN CÓ TRỞ
      { wch: 14 }, // L: ĐƠN GIÁ KHÔNG TRỞ
      { wch: 16 }, // M: THÀNH TIỀN KHÔNG TRỞ
      { wch: 16 }, // N: ĐƠN GIÁ CHỤM LÒ LÚA
      { wch: 16 }, // O: ĐƠN GIÁ CHỤM LÒ NẾP
      { wch: 16 }, // P: THÀNH TIỀN CHỤM LÒ
      { wch: 14 }, // Q: ĐƠN GIÁ VÔ BỒN
      { wch: 16 }, // R: THÀNH TIỀN VÔ BỒN
      { wch: 16 }, // S: GHI CHÚ
    ];

    ws1['!ref'] = `A1:S${sigRowName + 1}`;
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
    setCell(ws2, 'B6', 's', s2Headers[0], styleColHeaderBlue());
    setCell(ws2, 'C6', 's', s2Headers[1], styleColHeaderBlue());
    setCell(ws2, 'D6', 's', s2Headers[2], styleColHeaderBlue());
    setCell(ws2, 'E6', 's', s2Headers[3], styleColHeaderBlue());

    // Row 7: TỔNG XUẤT CÓ TRỞ (JAPONICA)
    setCell(ws2, 'B7', 's', 'TỔNG XUẤT CÓ TRỞ\r\n(JAPONICA)', styleData('left', true));
    setCell(ws2, 'C7', 'n', summary?.tonsCoTro ?? 0, styleNumber());
    setCell(ws2, 'D7', 'n', pCoTro, styleMoney());
    setCell(ws2, 'E7', 'n', (summary?.tonsCoTro ?? 0) * pCoTro, styleMoney(true), FMT_MONEY, 'C7*D7');

    // Row 8: TỔNG XUẤT KHÔNG TRỞ (NẾP/ NẾP CPC, ST25 ĐL)
    setCell(ws2, 'B8', 's', 'TỔNG XUẤT KHÔNG TRỞ\r\n(NẾP/ NẾP CPC, ST25 ĐL)', styleData('left', true));
    setCell(ws2, 'C8', 'n', summary?.tonsKhongTro ?? 0, styleNumber());
    setCell(ws2, 'D8', 'n', pKhongTro, styleMoney());
    setCell(ws2, 'E8', 'n', (summary?.tonsKhongTro ?? 0) * pKhongTro, styleMoney(true), FMT_MONEY, 'C8*D8');

    // Row 9: CHỤM LÒ (Áp dụng với Lúa)
    setCell(ws2, 'B9', 's', 'CHỤM LÒ \r\n(Áp dụng với Lúa)', styleData('left', true));
    setCell(ws2, 'C9', 'n', summary?.tonsChumLua ?? 0, styleNumber());
    setCell(ws2, 'D9', 'n', pChumLua, styleMoney());
    setCell(ws2, 'E9', 'n', (summary?.tonsChumLua ?? 0) * pChumLua, styleMoney(true), FMT_MONEY, 'C9*D9');

    // Row 10: CHỤM LÒ (Áp dụng với Nếp/ Nếp CPC)
    setCell(ws2, 'B10', 's', 'CHỤM LÒ \r\n(Áp dụng với Nếp/ Nếp CPC)', styleData('left', true));
    setCell(ws2, 'C10', 'n', summary?.tonsChumNep ?? 0, styleNumber());
    setCell(ws2, 'D10', 'n', pChumNep, styleMoney());
    setCell(ws2, 'E10', 'n', (summary?.tonsChumNep ?? 0) * pChumNep, styleMoney(true), FMT_MONEY, 'C10*D10');

    // Row 11: VÔ BỒN
    setCell(ws2, 'B11', 's', 'VÔ BỒN', styleData('left', true));
    setCell(ws2, 'C11', 'n', summary?.tonsVoBon ?? 0, styleNumber());
    setCell(ws2, 'D11', 'n', pVoBon, styleMoney());
    setCell(ws2, 'E11', 'n', (summary?.tonsVoBon ?? 0) * pVoBon, styleMoney(true), FMT_MONEY, 'C11*D11');

    // Row 12: TỔNG CỘNG :
    setCell(ws2, 'B12', 's', 'TỔNG CỘNG :', styleData('center', true));
    setCell(ws2, 'C12', 's', '', styleData('center'));
    setCell(ws2, 'D12', 's', '', styleData('center'));
    setCell(
      ws2,
      'E12',
      'n',
      summary?.tongCong ?? 0,
      {
        font: { name: FONT_NAME, bold: true, sz: 11, color: { rgb: 'CC0000' } },
        alignment: { horizontal: 'right', vertical: 'center' },
        numFmt: FMT_MONEY,
        border: BORDER_THIN,
      },
      FMT_MONEY,
      'SUM(E7:E11)'
    );

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
    setCell(
      ws2,
      'E14',
      'n',
      conLaiVal,
      {
        font: { name: FONT_NAME, bold: true, sz: 11, color: { rgb: '006100' } },
        alignment: { horizontal: 'right', vertical: 'center' },
        numFmt: FMT_MONEY,
        fill: { fgColor: { rgb: 'C6EFCE' }, patternType: 'solid' },
        border: BORDER_MEDIUM_BOTTOM,
      },
      FMT_MONEY,
      'E12-E13'
    );

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
  } catch (error: unknown) {
    console.error('Lỗi xuất Excel Xuất NSX TM:', error);
    return NextResponse.json({ error: (error as Error)?.message || 'Lỗi xuất file Excel' }, { status: 500 });
  }
}
