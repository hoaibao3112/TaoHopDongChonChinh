import { NextRequest, NextResponse } from 'next/server';
import XLSX from 'xlsx-js-style';
import { isRequestAuthenticated } from '@/lib/auth';
import { DailyReconciliationResult, RiceBatch } from '@/lib/rice-payroll/types';

export const runtime = 'nodejs';

// ─── Font & Color Constants theo mẫu DOI_THANH-XUAT_CS1_T10_2026 ───────────
const FONT_NAME = 'Times New Roman';

const BORDER_HEADER = {
  top: { style: 'thin', color: { rgb: '000000' } },
  bottom: { style: 'medium', color: { rgb: '000000' } },
  left: { style: 'thin', color: { rgb: '000000' } },
  right: { style: 'thin', color: { rgb: '000000' } },
};

const BORDER_DATA = {
  top: { style: 'thin', color: { rgb: 'D9D9D9' } },
  bottom: { style: 'thin', color: { rgb: 'D9D9D9' } },
  left: { style: 'thin', color: { rgb: 'D9D9D9' } },
  right: { style: 'thin', color: { rgb: 'D9D9D9' } },
};

export async function POST(req: NextRequest) {
  if (!isRequestAuthenticated(req)) {
    return NextResponse.json({ error: 'Chưa xác thực phiên đăng nhập' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const {
      month = 10,
      year = 2026,
      teamName = 'ĐỘI THANH - XUẤT CƠ SỞ I',
      dailyLogs = [],
    }: {
      month: number;
      year: number;
      teamName: string;
      dailyLogs: DailyReconciliationResult[];
    } = body;

    const wb = XLSX.utils.book_new();

    // ══════════════════════════════════════════════════════════════════════════
    // SHEET 1: BK (BẢNG KÊ CHI TIẾT TỪNG MẺ LÚA XUẤT CƠ SỞ I)
    // ══════════════════════════════════════════════════════════════════════════
    const wsBK: XLSX.WorkSheet = {};

    // 1. Title (Hàng 1)
    const titleText = `BẢNG KÊ ${teamName.toUpperCase()} THÁNG ${String(month).padStart(2, '0')}/${year} `;
    wsBK['D1'] = {
      t: 's',
      v: titleText,
      s: {
        font: { name: FONT_NAME, sz: 15, bold: true, color: { rgb: '1F3864' } },
        alignment: { horizontal: 'center', vertical: 'center' },
      },
    };

    // 2. Header Columns (Hàng 4)
    const headers = [
      'NGÀY \r\nCÂN',                             // A (0)
      'NHÂN VIÊN \r\nTHU MUA',                    // B (1) - Ẩn
      'KHÁCH HÀNG',                               // C (2)
      ' PHƯƠNG TIỆN ',                            // D (3)
      'LOẠI LÚA',                                 // E (4)
      ' SỐ LƯỢNG\r\n(KG) ',                       // F (5)
      'PHƯƠNG TIỆN TĂNG BO\r\nLÚA TƯƠI NHẬP SẤY', // G (6)
      'NGÀY NHẬP SẤY',                            // H (7)
      'ĐỊA ĐIỂM SẤY\r\n(CƠ SỞ SẤY)',              // I (8)
      ' CÂN NHẬP SẤY\r\n(KG) ',                   // J (9)
      ' CÂN NHẬP SẤY\r\n(KG) ',                   // K (10) - Số TẤN làm tròn
      'NGÀY\r\nXUỐNG LÚA KHÔ\r\n(NHẬN XUẤT TRẢ)', // L (11)
      'PHƯƠNG TIỆN CHỞ LÚA KHÔ\r\n(TĂNG BO SAU SẤY)', // M (12)
      ' TRỞ MẺ\r\n6.000/TẤN ',                    // N (13) - Ẩn
      ' THÀNH TIỀN ',                             // O (14) - Ẩn
      ' ĐƠN GIÁ \r\nXUẤT+TRỞ\r\n(20.000đ/TẤN) ',  // P (15)
      ' THÀNH TIỀN XUẤT+TRỞ\r\n ',                // Q (16)
      ' XUẤT KHÔNG TRỞ\r\n16.000/TẤN ',           // R (17)
      ' THÀNH TIỀN\r\nXUẤT KHÔNG TRỞ ',           // S (18)
      '',                                         // T (19)
    ];

    for (let c = 0; c < headers.length; c++) {
      const colLetter = XLSX.utils.encode_col(c);
      wsBK[`${colLetter}4`] = {
        t: 's',
        v: headers[c],
        s: {
          font: { name: FONT_NAME, sz: 10, bold: true, color: { rgb: 'FFFFFF' } },
          fill: { fgColor: { rgb: '1F4E78' } },
          alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
          border: BORDER_HEADER,
        },
      };
    }

    // 3. Chuẩn bị danh sách mẻ lúa từ dailyLogs
    interface ExportBatchItem {
      weighDate: string;
      purchaser: string;
      customer: string;
      vehicle: string;
      riceType: string;
      freshWeightKg: number | null;
      freshBoVehicle: string;
      dryDate: string;
      dryFacility: string;
      dryWeightKg: number;
      roundedTons: number;
      dischargeDate: string;
      dryVehicle: string;
      isCoTro: boolean;
      unitPrice: number;
    }

    const items: ExportBatchItem[] = [];

    dailyLogs.forEach((log) => {
      const hasBatches =
        (log.batchesCoTro && log.batchesCoTro.length > 0) ||
        (log.batchesKhongTro && log.batchesKhongTro.length > 0);

      if (hasBatches) {
        log.batchesCoTro.forEach((b: RiceBatch) => {
          items.push({
            weighDate: b.weighDate || b.dryDate || log.date,
            purchaser: b.purchaser || '',
            customer: b.customerName || 'VINH MỸ ĐÔNG',
            vehicle: b.vehicleName || '',
            riceType: b.riceType || 'OM18',
            freshWeightKg: b.freshWeightKg || null,
            freshBoVehicle: b.freshBoVehicle || '',
            dryDate: b.dryDate || log.date,
            dryFacility: b.dryFacility || 'CƠ SỞ I',
            dryWeightKg: b.dryWeightKg,
            roundedTons: b.roundedTons,
            dischargeDate: b.dischargeDate || log.date,
            dryVehicle: b.dryVehicle || '',
            isCoTro: true,
            unitPrice: log.unitPriceCoTro || 20000,
          });
        });

        log.batchesKhongTro.forEach((b: RiceBatch) => {
          items.push({
            weighDate: b.weighDate || b.dryDate || log.date,
            purchaser: b.purchaser || '',
            customer: b.customerName || 'VINH MỸ ĐÔNG',
            vehicle: b.vehicleName || '',
            riceType: b.riceType || 'OM18',
            freshWeightKg: b.freshWeightKg || null,
            freshBoVehicle: b.freshBoVehicle || '',
            dryDate: b.dryDate || log.date,
            dryFacility: b.dryFacility || 'CƠ SỞ I',
            dryWeightKg: b.dryWeightKg,
            roundedTons: b.roundedTons,
            dischargeDate: b.dischargeDate || log.date,
            dryVehicle: b.dryVehicle || '',
            isCoTro: false,
            unitPrice: log.unitPriceKhongTro || 16000,
          });
        });
      } else {
        // Trường hợp nhập sổ tay trực tiếp
        if (log.expectedTonsCoTro > 0) {
          items.push({
            weighDate: log.date,
            purchaser: '',
            customer: 'ĐỘI CHÚ 6 THANH',
            vehicle: 'XUẤT CƠ SỞ I',
            riceType: 'LÚA KHÔ',
            freshWeightKg: null,
            freshBoVehicle: '',
            dryDate: log.date,
            dryFacility: 'CƠ SỞ I',
            dryWeightKg: log.expectedTonsCoTro * 1000,
            roundedTons: log.expectedTonsCoTro,
            dischargeDate: log.date,
            dryVehicle: 'XUẤT LÒ',
            isCoTro: true,
            unitPrice: log.unitPriceCoTro || 20000,
          });
        }

        if (log.expectedTonsKhongTro > 0) {
          items.push({
            weighDate: log.date,
            purchaser: '',
            customer: 'ĐỘI CHÚ 6 THANH',
            vehicle: 'XUẤT CƠ SỞ I',
            riceType: 'LÚA KHÔ',
            freshWeightKg: null,
            freshBoVehicle: '',
            dryDate: log.date,
            dryFacility: 'CƠ SỞ I',
            dryWeightKg: log.expectedTonsKhongTro * 1000,
            roundedTons: log.expectedTonsKhongTro,
            dischargeDate: log.date,
            dryVehicle: 'XUẤT LÒ',
            isCoTro: false,
            unitPrice: log.unitPriceKhongTro || 16000,
          });
        }
      }
    });

    // 4. Ghi các dòng dữ liệu (Bắt đầu từ Hàng 5)
    const startRow = 5;
    const lastRow = Math.max(startRow, startRow + items.length - 1);

    items.forEach((item, idx) => {
      const r = startRow + idx;
      const isEven = idx % 2 === 1;
      const rowBg = isEven ? 'F9FAFB' : 'FFFFFF';

      const cellBaseStyle = {
        font: { name: FONT_NAME, sz: 10 },
        border: BORDER_DATA,
        fill: { fgColor: { rgb: rowBg } },
      };

      // Col A: Ngày cân
      wsBK[`A${r}`] = {
        t: 's',
        v: item.weighDate,
        s: { ...cellBaseStyle, alignment: { horizontal: 'center', vertical: 'center' } },
      };

      // Col B: Nhân viên thu mua (Ẩn)
      wsBK[`B${r}`] = {
        t: 's',
        v: item.purchaser,
        s: { ...cellBaseStyle, alignment: { horizontal: 'left', vertical: 'center' } },
      };

      // Col C: Khách hàng
      wsBK[`C${r}`] = {
        t: 's',
        v: item.customer,
        s: { ...cellBaseStyle, alignment: { horizontal: 'left', vertical: 'center' } },
      };

      // Col D: Phương tiện
      wsBK[`D${r}`] = {
        t: 's',
        v: item.vehicle,
        s: { ...cellBaseStyle, alignment: { horizontal: 'left', vertical: 'center' } },
      };

      // Col E: Loại lúa
      wsBK[`E${r}`] = {
        t: 's',
        v: item.riceType,
        s: { ...cellBaseStyle, alignment: { horizontal: 'center', vertical: 'center' } },
      };

      // Col F: Số lượng (kg) tươi
      wsBK[`F${r}`] = {
        t: item.freshWeightKg ? 'n' : 's',
        v: item.freshWeightKg || '',
        z: '#,##0;\\-#,##0;\\-',
        s: { ...cellBaseStyle, alignment: { horizontal: 'right', vertical: 'center' } },
      };

      // Col G: Phương tiện tăng bo tươi
      wsBK[`G${r}`] = {
        t: 's',
        v: item.freshBoVehicle,
        s: { ...cellBaseStyle, alignment: { horizontal: 'left', vertical: 'center' } },
      };

      // Col H: Ngày nhập sấy
      wsBK[`H${r}`] = {
        t: 's',
        v: item.dryDate,
        s: { ...cellBaseStyle, alignment: { horizontal: 'center', vertical: 'center' } },
      };

      // Col I: Địa điểm sấy (CƠ SỞ I)
      wsBK[`I${r}`] = {
        t: 's',
        v: item.dryFacility || 'CƠ SỞ I',
        s: { ...cellBaseStyle, alignment: { horizontal: 'center', vertical: 'center' } },
      };

      // Col J: Cân nhập sấy (KG)
      wsBK[`J${r}`] = {
        t: 'n',
        v: item.dryWeightKg,
        z: '#,##0;\\-#,##0;\\-',
        s: { ...cellBaseStyle, alignment: { horizontal: 'right', vertical: 'center' } },
      };

      // Col K: Cân nhập sấy (TẤN)
      wsBK[`K${r}`] = {
        t: 'n',
        v: item.roundedTons,
        z: '#,##0;\\-#,##0;\\-',
        s: { ...cellBaseStyle, alignment: { horizontal: 'center', vertical: 'center', bold: true } },
      };

      // Col L: Ngày xuống lúa khô (Trường lọc khớp của Chú 6 Thanh)
      wsBK[`L${r}`] = {
        t: 's',
        v: item.dischargeDate,
        s: { ...cellBaseStyle, alignment: { horizontal: 'center', vertical: 'center', bold: true } },
      };

      // Col M: Phương tiện chở lúa khô (tăng bo sau sấy)
      wsBK[`M${r}`] = {
        t: 's',
        v: item.dryVehicle,
        s: { ...cellBaseStyle, alignment: { horizontal: 'left', vertical: 'center' } },
      };

      // Col N & O: Trở mẻ & Thành tiền trở (Ẩn)
      wsBK[`N${r}`] = { t: 's', v: '', s: cellBaseStyle };
      wsBK[`O${r}`] = { t: 's', v: '', s: cellBaseStyle };

      // Col P & Q: Đơn giá và Thành tiền Có Trở
      if (item.isCoTro) {
        wsBK[`P${r}`] = {
          t: 'n',
          v: item.unitPrice,
          z: '#,##0;\\-#,##0;\\-',
          s: { ...cellBaseStyle, alignment: { horizontal: 'right', vertical: 'center' } },
        };
        wsBK[`Q${r}`] = {
          t: 'n',
          v: item.roundedTons * item.unitPrice,
          f: `K${r}*P${r}`,
          z: '#,##0;\\-#,##0;\\-',
          s: {
            ...cellBaseStyle,
            alignment: { horizontal: 'right', vertical: 'center' },
            font: { name: FONT_NAME, sz: 10, bold: true, color: { rgb: 'B45309' } },
          },
        };
      } else {
        wsBK[`P${r}`] = { t: 's', v: '', s: cellBaseStyle };
        wsBK[`Q${r}`] = {
          t: 'n',
          v: 0,
          f: `K${r}*P${r}`,
          z: '#,##0;\\-#,##0;\\-',
          s: { ...cellBaseStyle, alignment: { horizontal: 'right', vertical: 'center' } },
        };
      }

      // Col R & S: Đơn giá và Thành tiền Không Trở
      if (!item.isCoTro) {
        wsBK[`R${r}`] = {
          t: 'n',
          v: item.unitPrice,
          z: '#,##0;\\-#,##0;\\-',
          s: { ...cellBaseStyle, alignment: { horizontal: 'right', vertical: 'center' } },
        };
        wsBK[`S${r}`] = {
          t: 'n',
          v: item.roundedTons * item.unitPrice,
          f: `K${r}*R${r}`,
          z: '#,##0;\\-#,##0;\\-',
          s: {
            ...cellBaseStyle,
            alignment: { horizontal: 'right', vertical: 'center' },
            font: { name: FONT_NAME, sz: 10, bold: true, color: { rgb: '4338CA' } },
          },
        };
      } else {
        wsBK[`R${r}`] = { t: 's', v: '', s: cellBaseStyle };
        wsBK[`S${r}`] = {
          t: 'n',
          v: 0,
          f: `K${r}*R${r}`,
          z: '#,##0;\\-#,##0;\\-',
          s: { ...cellBaseStyle, alignment: { horizontal: 'right', vertical: 'center' } },
        };
      }

      // Col T: Trống
      wsBK[`T${r}`] = { t: 's', v: '', s: cellBaseStyle };
    });

    // 5. Dòng TỔNG CỘNG TRÊN ĐẦU (Hàng 3) — ĐÚNG CHUẨN FORMULA SUBTOTAL CỦA EXCEL
    const totalRowBgYellow = 'FFF2CC'; // Vàng nhạt
    const totalRowBgHighlight = 'FFFF00'; // Vàng tươi nổi bật

    const styleTotalBase = {
      font: { name: FONT_NAME, sz: 11, bold: true },
      fill: { fgColor: { rgb: totalRowBgYellow } },
      border: BORDER_HEADER,
    };

    const styleTotalHighlight = {
      font: { name: FONT_NAME, sz: 11, bold: true, color: { rgb: '991B1B' } },
      fill: { fgColor: { rgb: totalRowBgHighlight } },
      border: BORDER_HEADER,
      alignment: { horizontal: 'right', vertical: 'center' },
    };

    // Điền nền cho các ô trống hàng 3
    for (let c = 0; c < 20; c++) {
      const colLetter = XLSX.utils.encode_col(c);
      wsBK[`${colLetter}3`] = { t: 's', v: '', s: styleTotalBase };
    }

    // D3:E3 (merged) = TỔNG CỘNG
    wsBK['D3'] = {
      t: 's',
      v: 'TỔNG CỘNG',
      s: { ...styleTotalBase, alignment: { horizontal: 'center', vertical: 'center' } },
    };

    // J3 = SUBTOTAL(109, J5:J{lastRow}) (Tổng Cân nhập sấy kg)
    const sumKgVal = items.reduce((s, it) => s + it.dryWeightKg, 0);
    wsBK['J3'] = {
      t: 'n',
      v: sumKgVal,
      f: `SUBTOTAL(109,J5:J${lastRow})`,
      z: '#,##0;\\-#,##0;\\-',
      s: { ...styleTotalBase, alignment: { horizontal: 'right', vertical: 'center' } },
    };

    // K3 = SUBTOTAL(109, K5:K{lastRow}) (Tổng Cân nhập sấy TẤN)
    const sumTonsVal = items.reduce((s, it) => s + it.roundedTons, 0);
    wsBK['K3'] = {
      t: 'n',
      v: sumTonsVal,
      f: `SUBTOTAL(109,K5:K${lastRow})`,
      z: '#,##0;\\-#,##0;\\-',
      s: { ...styleTotalBase, alignment: { horizontal: 'center', vertical: 'center' } },
    };

    // Q3 = SUBTOTAL(109, Q5:Q{lastRow}) (Tổng tiền xuất có trở)
    const sumCoTroVal = items
      .filter((it) => it.isCoTro)
      .reduce((s, it) => s + it.roundedTons * it.unitPrice, 0);
    wsBK['Q3'] = {
      t: 'n',
      v: sumCoTroVal,
      f: `SUBTOTAL(109,Q5:Q${lastRow})`,
      z: '#,##0;\\-#,##0;\\-',
      s: styleTotalHighlight,
    };

    // S3 = SUBTOTAL(109, S5:S{lastRow}) (Tổng tiền xuất không trở)
    const sumKhongTroVal = items
      .filter((it) => !it.isCoTro)
      .reduce((s, it) => s + it.roundedTons * it.unitPrice, 0);
    wsBK['S3'] = {
      t: 'n',
      v: sumKhongTroVal,
      f: `SUBTOTAL(109,S5:S${lastRow})`,
      z: '#,##0;\\-#,##0;\\-',
      s: styleTotalHighlight,
    };

    // T3 = Q3 + S3 (Tổng thành tiền toàn bộ)
    wsBK['T3'] = {
      t: 'n',
      v: sumCoTroVal + sumKhongTroVal,
      f: 'Q3+S3',
      z: '#,##0;\\-#,##0;\\-',
      s: styleTotalHighlight,
    };

    // 6. Khối chữ ký cuối bảng
    const sigTitleRow = lastRow + 5;
    const sigNameRow = sigTitleRow + 6;

    wsBK[`D${sigTitleRow}`] = {
      t: 's',
      v: 'Người lập bảng',
      s: {
        font: { name: FONT_NAME, sz: 11, bold: true },
        alignment: { horizontal: 'center', vertical: 'center' },
      },
    };

    wsBK[`J${sigTitleRow}`] = {
      t: 's',
      v: 'Xác nhận',
      s: {
        font: { name: FONT_NAME, sz: 11, bold: true },
        alignment: { horizontal: 'center', vertical: 'center' },
      },
    };

    wsBK[`D${sigNameRow}`] = {
      t: 's',
      v: 'Võ Hoàng Cẩm Tiên',
      s: {
        font: { name: FONT_NAME, sz: 11, bold: true },
        alignment: { horizontal: 'center', vertical: 'center' },
      },
    };

    wsBK[`J${sigNameRow}`] = {
      t: 's',
      v: 'Huỳnh Hải Long Hồ',
      s: {
        font: { name: FONT_NAME, sz: 11, bold: true },
        alignment: { horizontal: 'center', vertical: 'center' },
      },
    };

    // 7. Cấu hình Range, Merges, Cols & Row Heights cho Sheet BK
    wsBK['!ref'] = `A1:T${sigNameRow + 1}`;

    wsBK['!merges'] = [
      { s: { r: 0, c: 3 }, e: { r: 0, c: 19 } }, // D1:T1
      { s: { r: 2, c: 3 }, e: { r: 2, c: 4 } },  // D3:E3
    ];

    wsBK['!cols'] = [
      { wch: 12.5 },                // A: NGÀY CÂN
      { wch: 12.0, hidden: true },  // B: NHÂN VIÊN THU MUA
      { wch: 27.0 },                // C: KHÁCH HÀNG
      { wch: 29.0 },                // D: PHƯƠNG TIỆN
      { wch: 17.5 },                // E: LOẠI LÚA
      { wch: 13.0 },                // F: SỐ LƯỢNG (KG)
      { wch: 27.0 },                // G: PHƯƠNG TIỆN TĂNG BO LÚA TƯƠI
      { wch: 13.0 },                // H: NGÀY NHẬP SẤY
      { wch: 12.5 },                // I: ĐỊA ĐIỂM SẤY
      { wch: 13.5 },                // J: CÂN NHẬP SẤY (KG)
      { wch: 11.5 },                // K: CÂN NHẬP SẤY (TẤN)
      { wch: 16.0 },                // L: NGÀY XUỐNG LÚA KHÔ
      { wch: 26.0 },                // M: PHƯƠNG TIỆN CHỞ LÚA KHÔ
      { wch: 15.5, hidden: true },  // N: TRỞ MẺ (Ẩn)
      { wch: 15.5, hidden: true },  // O: THÀNH TIỀN (Ẩn)
      { wch: 14.0 },                // P: ĐƠN GIÁ CÓ TRỞ
      { wch: 17.0 },                // Q: THÀNH TIỀN CÓ TRỞ
      { wch: 14.0 },                // R: ĐƠN GIÁ KHÔNG TRỞ
      { wch: 17.0 },                // S: THÀNH TIỀN KHÔNG TRỞ
      { wch: 17.0 },                // T: TỔNG CỘNG
    ];

    const rowHeights: XLSX.RowInfo[] = [];
    rowHeights[0] = { hpt: 43.5 }; // Row 1
    rowHeights[1] = { hpt: 7.5 };  // Row 2
    rowHeights[2] = { hpt: 25.5 }; // Row 3
    rowHeights[3] = { hpt: 66.0 }; // Row 4 (Header)
    for (let r = 4; r < lastRow; r++) {
      rowHeights[r] = { hpt: 21.75 };
    }
    wsBK['!rows'] = rowHeights;

    // Đưa sheet BK làm sheet đầu tiên
    XLSX.utils.book_append_sheet(wb, wsBK, 'BK');

    // ══════════════════════════════════════════════════════════════════════════
    // SHEET 2: CHI LƯƠNG (BẢNG TỔNG HỢP CHI LƯƠNG ĐỘI CHÚ 6 THANH)
    // ══════════════════════════════════════════════════════════════════════════
    const wsCL: XLSX.WorkSheet = {};
    wsCL['A1'] = {
      t: 's',
      v: `DANH SÁCH CHI LƯƠNG ${teamName.toUpperCase()} THÁNG ${String(month).padStart(2, '0')}/${year}`,
      s: {
        font: { name: FONT_NAME, sz: 14, bold: true, color: { rgb: '1F3864' } },
        alignment: { horizontal: 'center', vertical: 'center' },
      },
    };

    // Bảng quyết toán ở phần dưới Sheet CL
    wsCL['B24'] = {
      t: 's',
      v: `BẢNG KÊ ${teamName.toUpperCase()} THÁNG ${String(month).padStart(2, '0')}/${year}`,
      s: { font: { name: FONT_NAME, sz: 12, bold: true } },
    };

    const clHeaders = ['XUẤT', 'SỐ LƯỢNG (TẤN)', 'ĐƠN GIÁ (ĐỒNG/TẤN)', 'THÀNH TIỀN'];
    const clCols = ['B', 'C', 'D', 'E'];
    clHeaders.forEach((h, idx) => {
      wsCL[`${clCols[idx]}25`] = {
        t: 's',
        v: h,
        s: {
          font: { name: FONT_NAME, sz: 10, bold: true, color: { rgb: 'FFFFFF' } },
          fill: { fgColor: { rgb: '1F4E78' } },
          alignment: { horizontal: 'center', vertical: 'center' },
          border: BORDER_HEADER,
        },
      };
    });

    const tonsCoTroTotal = items.filter((i) => i.isCoTro).reduce((s, i) => s + i.roundedTons, 0);
    const tonsKhongTroTotal = items.filter((i) => !i.isCoTro).reduce((s, i) => s + i.roundedTons, 0);
    const priceCoTroDefault = items.find((i) => i.isCoTro)?.unitPrice || 20000;
    const priceKhongTroDefault = items.find((i) => !i.isCoTro)?.unitPrice || 16000;

    // Dòng 26: Tổng xuất có trở
    wsCL['B26'] = { t: 's', v: 'TỔNG XUẤT CÓ TRỞ', s: { font: { name: FONT_NAME, bold: true }, border: BORDER_DATA } };
    wsCL['C26'] = { t: 'n', v: tonsCoTroTotal, z: '#,##0', s: { alignment: { horizontal: 'center' }, border: BORDER_DATA } };
    wsCL['D26'] = { t: 'n', v: priceCoTroDefault, z: '#,##0', s: { alignment: { horizontal: 'right' }, border: BORDER_DATA } };
    wsCL['E26'] = { t: 'n', v: tonsCoTroTotal * priceCoTroDefault, f: 'C26*D26', z: '#,##0', s: { font: { bold: true }, alignment: { horizontal: 'right' }, border: BORDER_DATA } };

    // Dòng 27: Tổng xuất không trở
    wsCL['B27'] = { t: 's', v: 'TỔNG XUẤT KHÔNG TRỞ', s: { font: { name: FONT_NAME, bold: true }, border: BORDER_DATA } };
    wsCL['C27'] = { t: 'n', v: tonsKhongTroTotal, z: '#,##0', s: { alignment: { horizontal: 'center' }, border: BORDER_DATA } };
    wsCL['D27'] = { t: 'n', v: priceKhongTroDefault, z: '#,##0', s: { alignment: { horizontal: 'right' }, border: BORDER_DATA } };
    wsCL['E27'] = { t: 'n', v: tonsKhongTroTotal * priceKhongTroDefault, f: 'C27*D27', z: '#,##0', s: { font: { bold: true }, alignment: { horizontal: 'right' }, border: BORDER_DATA } };

    // Dòng 28: Nước đá
    const workDaysCount = new Set(items.map((i) => i.dischargeDate)).size;
    wsCL['B28'] = { t: 's', v: 'NƯỚC ĐÁ\r\n(10.000Đ/ngày làm việc)', s: { font: { name: FONT_NAME }, border: BORDER_DATA } };
    wsCL['C28'] = { t: 'n', v: workDaysCount, z: '#,##0', s: { alignment: { horizontal: 'center' }, border: BORDER_DATA } };
    wsCL['D28'] = { t: 'n', v: 10000, z: '#,##0', s: { alignment: { horizontal: 'right' }, border: BORDER_DATA } };
    wsCL['E28'] = { t: 'n', v: workDaysCount * 10000, f: 'C28*D28', z: '#,##0', s: { alignment: { horizontal: 'right' }, border: BORDER_DATA } };

    // Dòng 29: Tổng cộng
    wsCL['B29'] = { t: 's', v: 'TỔNG CỘNG :', s: { font: { name: FONT_NAME, bold: true }, border: BORDER_DATA } };
    wsCL['C29'] = { t: 's', v: '', s: { border: BORDER_DATA } };
    wsCL['D29'] = { t: 's', v: '', s: { border: BORDER_DATA } };
    wsCL['E29'] = {
      t: 'n',
      v: tonsCoTroTotal * priceCoTroDefault + tonsKhongTroTotal * priceKhongTroDefault + workDaysCount * 10000,
      f: 'SUM(E26:E28)',
      z: '#,##0',
      s: { font: { name: FONT_NAME, sz: 11, bold: true, color: { rgb: '991B1B' } }, fill: { fgColor: { rgb: 'FFFF00' } }, alignment: { horizontal: 'right' }, border: BORDER_DATA },
    };

    wsCL['!ref'] = 'A1:H35';
    wsCL['!merges'] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: 7 } }, // A1:H1
      { s: { r: 23, c: 1 }, e: { r: 23, c: 4 } }, // B24:E24
    ];
    wsCL['!cols'] = [
      { wch: 8 },  // A
      { wch: 28 }, // B
      { wch: 18 }, // C
      { wch: 22 }, // D
      { wch: 20 }, // E
      { wch: 18 }, // F
      { wch: 18 }, // G
      { wch: 22 }, // H
    ];

    XLSX.utils.book_append_sheet(wb, wsCL, `CL ĐỘI THANH T${month}.${year}`);

    // Kết xuất Buffer Excel
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    const safeFileName = `DOI_THANH-XUAT_CS1_T${String(month).padStart(2, '0')}_${year}_HOAN_CHINH.xlsx`;

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${encodeURIComponent(safeFileName)}"`,
      },
    });
  } catch (error) {
    console.error('Lỗi khi xuất bảng lương Excel:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Lỗi khi xuất bảng lương' },
      { status: 500 }
    );
  }
}
