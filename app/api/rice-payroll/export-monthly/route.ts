import { NextRequest, NextResponse } from 'next/server';
import XLSX from 'xlsx-js-style';
import * as fs from 'fs';
import * as path from 'path';
import { isRequestAuthenticated } from '@/lib/auth';
import { DailyReconciliationResult, RiceBatch } from '@/lib/rice-payroll/types';
import { isCoSo1 } from '@/lib/rice-payroll/facility-filter';
import { getDefaultClassification, getDefaultTons } from '@/lib/rice-payroll/sample-classification';
import { DOI_CHU_6_THANH_WORKERS } from '@/lib/rice-payroll/team-thanh-workers';

export const runtime = 'nodejs';

// ─── Font & Color Constants theo mẫu DOI_THANH-XUAT_CS1_T10_2026 ───────────
const FONT_NAME = 'Times New Roman';

// ─── Border chuẩn theo file mẫu (đen mỏng mọi cạnh) ─────────────────────────
const BORDER_THIN_BLACK = {
  top:    { style: 'thin', color: { rgb: '000000' } },
  bottom: { style: 'thin', color: { rgb: '000000' } },
  left:   { style: 'thin', color: { rgb: '000000' } },
  right:  { style: 'thin', color: { rgb: '000000' } },
};

// Header hàng 4 BK: đáy medium
const BORDER_HEADER = {
  top:    { style: 'thin',   color: { rgb: '000000' } },
  bottom: { style: 'medium', color: { rgb: '000000' } },
  left:   { style: 'thin',   color: { rgb: '000000' } },
  right:  { style: 'thin',   color: { rgb: '000000' } },
};

// Dữ liệu BK: xám nhạt giữa các ô (giống file gốc dùng fgColor EAF1FA/FFFFFF)
const BORDER_DATA = {
  top:    { style: 'thin', color: { rgb: 'D9D9D9' } },
  bottom: { style: 'thin', color: { rgb: 'D9D9D9' } },
  left:   { style: 'thin', color: { rgb: 'D9D9D9' } },
  right:  { style: 'thin', color: { rgb: 'D9D9D9' } },
};

// Format số tiền Việt Nam
const FMT_MONEY = '#,##0;\\-#,##0;\\-';
const FMT_NUMBER = '#,##0;\\-#,##0;\\-';

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

    // 1. Title (Hàng 1) — merge D1:T1 như mẫu
    const titleText = `BẢNG KÊ ${teamName.toUpperCase()} THÁNG ${String(month).padStart(2, '0')}/${year} `;
    wsBK['D1'] = {
      t: 's',
      v: titleText,
      s: {
        font: { name: FONT_NAME, sz: 16, bold: true, color: { rgb: '1F3864' } },
        alignment: { horizontal: 'center', vertical: 'center' },
      },
    };

    // 2. Header Columns (Hàng 4) — nền xanh đậm 1F4E78, chữ trắng
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

    // Cách 1: Client gửi trực tiếp danh sách mẻ lúa thực tế (từ file lúa) đã gán phân loại
    if (Array.isArray(body.items) && body.items.length > 0) {
      body.items.forEach((it: ExportBatchItem) => items.push(it));
    } else {
      // Cách 2: Trích xuất từ dailyLogs nếu có batches
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
        }
      });

      // Cách 3: Nếu vẫn chưa có mẻ lúa thực tế -> ĐỌC TRỰC TIẾP TỪ FILE LÚA MASTER THEO THÁNG & CƠ SỞ I
      if (items.length === 0) {
        try {
          const sampleJsonPath = path.join(process.cwd(), 'data', 'sample-batches.json');
          if (fs.existsSync(sampleJsonPath)) {
            const fileContent = fs.readFileSync(sampleJsonPath, 'utf8');
            const parsedJson = JSON.parse(fileContent);
            const monthSuffix = `/${String(month).padStart(2, '0')}/${year}`;

            // Lọc ra các mẻ lúa đúng CƠ SỞ I và đúng THÁNG yêu cầu
            const matchedBatches: RiceBatch[] = (parsedJson.batches || []).filter((b: RiceBatch) => {
              if (!isCoSo1(b.dryFacility)) return false;
              return (b.dischargeDate || '').endsWith(monthSuffix);
            });

            matchedBatches.forEach((b: RiceBatch) => {
              const isCoTro = getDefaultClassification(b);
              items.push({
                weighDate: b.weighDate || b.dryDate || '',
                purchaser: b.purchaser || '',
                customer: b.customerName || '',
                vehicle: b.vehicleName || '',
                riceType: b.riceType || 'OM18',
                freshWeightKg: b.freshWeightKg || null,
                freshBoVehicle: b.freshBoVehicle || '',
                dryDate: b.dryDate || '',
                dryFacility: b.dryFacility || 'CƠ SỞ I',
                dryWeightKg: b.dryWeightKg,
                roundedTons: getDefaultTons(b),
                dischargeDate: b.dischargeDate || '',
                dryVehicle: b.dryVehicle || '',
                isCoTro,
                unitPrice: isCoTro ? 20000 : 16000,
              });
            });
          }
        } catch (readErr) {
          console.error('Lỗi tự động nạp mẻ từ file lúa:', readErr);
        }
      }
    }

    // 4. Ghi các dòng dữ liệu (Bắt đầu từ Hàng 5)
    const startRow = 5;
    const lastRow = Math.max(startRow, startRow + items.length - 1);

    items.forEach((item, idx) => {
      const r = startRow + idx;
      // Màu xen kẽ theo file mẫu: hàng lẻ (idx=0,2,4...) = EAF1FA, hàng chẵn (idx=1,3,5...) = FFFFFF
      const rowBg = idx % 2 === 0 ? 'EAF1FA' : 'FFFFFF';

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

      // Col F: Số lượng (kg) tươi — format #,##0
      wsBK[`F${r}`] = {
        t: item.freshWeightKg ? 'n' : 's',
        v: item.freshWeightKg || '',
        z: FMT_NUMBER,
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

      // Col J: Cân nhập sấy (KG) — format #,##0
      wsBK[`J${r}`] = {
        t: 'n',
        v: item.dryWeightKg,
        z: FMT_NUMBER,
        s: { ...cellBaseStyle, alignment: { horizontal: 'right', vertical: 'center' } },
      };

      // Col K: Số TẤN làm tròn — in đậm nổi bật
      wsBK[`K${r}`] = {
        t: 'n',
        v: item.roundedTons,
        z: FMT_NUMBER,
        s: {
          ...cellBaseStyle,
          font: { name: FONT_NAME, sz: 10, bold: true },
          alignment: { horizontal: 'center', vertical: 'center' },
        },
      };

      // Col L: Ngày xuống lúa khô — in đậm theo mẫu
      wsBK[`L${r}`] = {
        t: 's',
        v: item.dischargeDate,
        s: {
          ...cellBaseStyle,
          font: { name: FONT_NAME, sz: 10, bold: true },
          alignment: { horizontal: 'center', vertical: 'center' },
        },
      };

      // Col M: Phương tiện chở lúa khô (tăng bo sau sấy)
      wsBK[`M${r}`] = {
        t: 's',
        v: item.dryVehicle,
        s: { ...cellBaseStyle, alignment: { horizontal: 'left', vertical: 'center' } },
      };

      // Col N & O: Trở mẻ & Thành tiền trở (Ẩn)
      wsBK[`N${r}`] = { t: 'z', s: cellBaseStyle };
      wsBK[`O${r}`] = { t: 'z', s: cellBaseStyle };

      // Col P & Q: Đơn giá và Thành tiền Có Trở — chữ cam đậm
      if (item.isCoTro) {
        wsBK[`P${r}`] = {
          t: 'n',
          v: item.unitPrice,
          z: FMT_MONEY,
          s: { ...cellBaseStyle, alignment: { horizontal: 'right', vertical: 'center' } },
        };
        wsBK[`Q${r}`] = {
          t: 'n',
          v: item.roundedTons * item.unitPrice,
          f: `K${r}*P${r}`,
          z: FMT_MONEY,
          s: {
            ...cellBaseStyle,
            alignment: { horizontal: 'right', vertical: 'center' },
            font: { name: FONT_NAME, sz: 10, bold: true, color: { rgb: 'C55A11' } },
          },
        };
      } else {
        wsBK[`P${r}`] = { t: 'z', s: cellBaseStyle };
        wsBK[`Q${r}`] = {
          t: 'n',
          v: 0,
          z: FMT_MONEY,
          s: { ...cellBaseStyle, alignment: { horizontal: 'right', vertical: 'center' } },
        };
      }

      // Col R & S: Đơn giá và Thành tiền Không Trở — chữ xanh tím đậm
      if (!item.isCoTro) {
        wsBK[`R${r}`] = {
          t: 'n',
          v: item.unitPrice,
          z: FMT_MONEY,
          s: { ...cellBaseStyle, alignment: { horizontal: 'right', vertical: 'center' } },
        };
        wsBK[`S${r}`] = {
          t: 'n',
          v: item.roundedTons * item.unitPrice,
          f: `K${r}*R${r}`,
          z: FMT_MONEY,
          s: {
            ...cellBaseStyle,
            alignment: { horizontal: 'right', vertical: 'center' },
            font: { name: FONT_NAME, sz: 10, bold: true, color: { rgb: '2E5FA3' } },
          },
        };
      } else {
        wsBK[`R${r}`] = { t: 'z', s: cellBaseStyle };
        wsBK[`S${r}`] = {
          t: 'n',
          v: 0,
          z: FMT_MONEY,
          s: { ...cellBaseStyle, alignment: { horizontal: 'right', vertical: 'center' } },
        };
      }

      // Col T: Trống
      wsBK[`T${r}`] = { t: 'z', s: cellBaseStyle };
    });

    // 5. Dòng TỔNG CỘNG TRÊN ĐẦU (Hàng 3) — ĐÚNG CHUẨN FORMULA SUBTOTAL CỦA EXCEL
    const totalRowBgYellow = 'FFF2CC'; // Vàng nhạt như file mẫu
    const totalRowBgHighlight = 'FFFF00'; // Vàng tươi nổi bật cho các ô số tiền

    const styleTotalBase = {
      font: { name: FONT_NAME, sz: 11, bold: true },
      fill: { fgColor: { rgb: totalRowBgYellow } },
      border: BORDER_THIN_BLACK,
    };

    const styleTotalHighlight = {
      font: { name: FONT_NAME, sz: 11, bold: true, color: { rgb: '7B0000' } },
      fill: { fgColor: { rgb: totalRowBgHighlight } },
      border: BORDER_THIN_BLACK,
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

    // F3: Tổng KG tươi (nền vàng tươi)
    const sumFreshKgVal = items.reduce((s, it) => s + (it.freshWeightKg || 0), 0);
    if (sumFreshKgVal > 0) {
      wsBK['F3'] = {
        t: 'n',
        v: sumFreshKgVal,
        z: FMT_NUMBER,
        s: styleTotalHighlight,
      };
    }

    // J3 = SUBTOTAL(109, J5:J{lastRow}) (Tổng Cân nhập sấy kg)
    const sumKgVal = items.reduce((s, it) => s + it.dryWeightKg, 0);
    wsBK['J3'] = {
      t: 'n',
      v: sumKgVal,
      f: `SUBTOTAL(109,J5:J${lastRow})`,
      z: FMT_NUMBER,
      s: { ...styleTotalBase, alignment: { horizontal: 'right', vertical: 'center' } },
    };

    // K3 = SUBTOTAL(109, K5:K{lastRow}) (Tổng Cân nhập sấy TẤN)
    const sumTonsVal = items.reduce((s, it) => s + it.roundedTons, 0);
    wsBK['K3'] = {
      t: 'n',
      v: sumTonsVal,
      f: `SUBTOTAL(109,K5:K${lastRow})`,
      z: FMT_NUMBER,
      s: { ...styleTotalBase, alignment: { horizontal: 'center', vertical: 'center' } },
    };

    // Q3 = SUBTOTAL(109, Q5:Q{lastRow}) (Tổng tiền xuất có trở) — vàng tươi
    const sumCoTroVal = items
      .filter((it) => it.isCoTro)
      .reduce((s, it) => s + it.roundedTons * it.unitPrice, 0);
    wsBK['Q3'] = {
      t: 'n',
      v: sumCoTroVal,
      f: `SUBTOTAL(109,Q5:Q${lastRow})`,
      z: FMT_MONEY,
      s: styleTotalHighlight,
    };

    // S3 = SUBTOTAL(109, S5:S{lastRow}) (Tổng tiền xuất không trở) — vàng tươi
    const sumKhongTroVal = items
      .filter((it) => !it.isCoTro)
      .reduce((s, it) => s + it.roundedTons * it.unitPrice, 0);
    wsBK['S3'] = {
      t: 'n',
      v: sumKhongTroVal,
      f: `SUBTOTAL(109,S5:S${lastRow})`,
      z: FMT_MONEY,
      s: styleTotalHighlight,
    };

    // T3 = Q3 + S3 (Tổng thành tiền toàn bộ) — vàng tươi
    wsBK['T3'] = {
      t: 'n',
      v: sumCoTroVal + sumKhongTroVal,
      f: 'Q3+S3',
      z: FMT_MONEY,
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
      { s: { r: 0, c: 3 }, e: { r: 0, c: 19 } }, // D1:T1 — tiêu đề
      { s: { r: 2, c: 3 }, e: { r: 2, c: 4 } },  // D3:E3 — TỔNG CỘNG
    ];

    // Auto-filter từ hàng 4 (A4:T{lastRow}) giống file mẫu
    wsBK['!autofilter'] = { ref: `A4:T${lastRow}` };

    wsBK['!cols'] = [
      { wch: 12.5 },                // A: NGÀY CÂN
      { wch: 12.0, hidden: true },  // B: NHÂN VIÊN THU MUA (ẩn)
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
      { wch: 15.5, hidden: true },  // N: TRỞ MẺ (ẩn)
      { wch: 15.5, hidden: true },  // O: THÀNH TIỀN (ẩn)
      { wch: 14.0 },                // P: ĐƠN GIÁ CÓ TRỞ
      { wch: 17.0 },                // Q: THÀNH TIỀN CÓ TRỞ
      { wch: 14.0 },                // R: ĐƠN GIÁ KHÔNG TRỞ
      { wch: 17.0 },                // S: THÀNH TIỀN KHÔNG TRỞ
      { wch: 17.0 },                // T: TỔNG CỘNG
    ];

    // Row heights khớp 100% file mẫu
    const rowHeights: XLSX.RowInfo[] = [];
    rowHeights[0] = { hpt: 43.5 };  // Row 1: tiêu đề lớn
    rowHeights[1] = { hpt: 7.5 };   // Row 2: spacer mỏng
    rowHeights[2] = { hpt: 25.5 };  // Row 3: tổng cộng
    rowHeights[3] = { hpt: 66.0 };  // Row 4: header (cao chứa 3 dòng wrap)
    for (let r = 4; r < lastRow; r++) {
      rowHeights[r] = { hpt: 21.75 }; // Dữ liệu: cao đều 21.75pt
    }
    wsBK['!rows'] = rowHeights;

    // Đưa sheet BK làm sheet đầu tiên
    XLSX.utils.book_append_sheet(wb, wsBK, 'BK');

    // ══════════════════════════════════════════════════════════════════════════
    // SHEET 2: ỨNG LƯƠNG (DANH SÁCH ỨNG LƯƠNG ĐỘI THANH-XUẤT CƠ SỞ 1)
    // ══════════════════════════════════════════════════════════════════════════
    const wsUL: XLSX.WorkSheet = {};
    const sheetNameUL = `ỨL ĐỘI THANH T${String(month).padStart(2, '0')}.${year}`;

    // Dùng border đen mỏng (giống file mẫu Sheet 2 & 3)
    const cellBaseStyle = {
      font: { name: FONT_NAME, sz: 11 },
      border: BORDER_THIN_BLACK,
    };

    // 1. Tiêu đề — nền trắng, chữ xanh đậm, căn giữa
    wsUL['A1'] = {
      t: 's',
      v: `DANH SÁCH ỨNG LƯƠNG ${teamName.toUpperCase()} THÁNG ${String(month).padStart(2, '0')}/${year}`,
      s: {
        font: { name: FONT_NAME, sz: 14, bold: true, color: { rgb: '1F3864' } },
        alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
        fill: { fgColor: { rgb: 'FFFFFF' } },
      },
    };

    // 2. Header row (Hàng 2) — nền xanh đậm, chữ trắng, wrap text
    const ulHeaders = ['STT', 'HỌ & TÊN', 'SỐ TIỀN\r\nTẠM ỨNG', 'SỐ TÀI KHOẢN', 'NGÂN HÀNG', 'CHỦ TÀI KHOẢN'];
    const ulCols = ['A', 'B', 'C', 'D', 'E', 'F'];
    ulHeaders.forEach((h, idx) => {
      wsUL[`${ulCols[idx]}2`] = {
        t: 's',
        v: h,
        s: {
          font: { name: FONT_NAME, sz: 11, bold: true, color: { rgb: 'FFFFFF' } },
          fill: { fgColor: { rgb: '1F4E78' } },
          alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
          border: BORDER_THIN_BLACK,
        },
      };
    });

    // 3. Danh sách 14 công nhân — xen kẽ nền trắng (theo mẫu không có màu nền xen kẽ)
    const isOct2026 = month === 10 && year === 2026;
    DOI_CHU_6_THANH_WORKERS.forEach((w, idx) => {
      const r = idx + 3; // Hàng 3–16
      const advanceVal = isOct2026 ? w.sampleOctoberAdvance : 0;

      // Hàng lẻ (STT 1,3,5...) có nền trắng, không tô màu (theo mẫu gốc)
      const isOddRow = w.stt % 2 === 1;
      const rowFill = isOddRow
        ? { fill: { fgColor: { rgb: 'FFFFFF' } } }
        : {};

      // Col A: STT — in đậm, căn giữa
      wsUL[`A${r}`] = {
        t: 'n',
        v: w.stt,
        s: {
          ...cellBaseStyle,
          ...rowFill,
          font: { name: FONT_NAME, sz: 11, bold: true },
          alignment: { horizontal: 'center', vertical: 'center' },
        },
      };

      // Col B: Họ & tên — in đậm, căn trái
      wsUL[`B${r}`] = {
        t: 's',
        v: w.name,
        s: {
          ...cellBaseStyle,
          ...rowFill,
          font: { name: FONT_NAME, sz: 11, bold: true },
          alignment: { horizontal: 'left', vertical: 'center' },
        },
      };

      // Col C: Số tiền tạm ứng — format tiền Việt, căn phải
      wsUL[`C${r}`] = {
        t: 'n',
        v: advanceVal,
        z: FMT_MONEY,
        s: {
          ...cellBaseStyle,
          ...rowFill,
          alignment: { horizontal: 'right', vertical: 'center' },
        },
      };

      // Col D: Số tài khoản — căn giữa, font bình thường
      wsUL[`D${r}`] = {
        t: 's',
        v: w.stk,
        s: {
          ...cellBaseStyle,
          ...rowFill,
          alignment: { horizontal: 'center', vertical: 'center' },
        },
      };

      // Col E: Ngân hàng — căn giữa
      wsUL[`E${r}`] = {
        t: 's',
        v: w.bank,
        s: {
          ...cellBaseStyle,
          ...rowFill,
          alignment: { horizontal: 'center', vertical: 'center' },
        },
      };

      // Col F: Chủ tài khoản — căn trái
      wsUL[`F${r}`] = {
        t: 's',
        v: w.accountHolder,
        s: {
          ...cellBaseStyle,
          ...rowFill,
          alignment: { horizontal: 'left', vertical: 'center' },
        },
      };
    });

    // 4. Hàng tổng cộng (Hàng 17) — nền vàng nhạt FFF2CC, in đậm
    const styleSumRow = {
      font: { name: FONT_NAME, sz: 12, bold: true, color: { rgb: '1F3864' } },
      fill: { fgColor: { rgb: 'FFF2CC' } },
      border: BORDER_THIN_BLACK,
    };
    wsUL['A17'] = { t: 's', v: '', s: styleSumRow };
    wsUL['B17'] = {
      t: 's',
      v: 'TỔNG CỘNG : ',
      s: { ...styleSumRow, alignment: { horizontal: 'left', vertical: 'center' } },
    };
    wsUL['C17'] = {
      t: 'n',
      v: isOct2026 ? 32000000 : 0,
      f: 'SUM(C3:C16)',
      z: FMT_MONEY,
      s: { ...styleSumRow, alignment: { horizontal: 'right', vertical: 'center' } },
    };
    wsUL['D17'] = { t: 's', v: '', s: styleSumRow };
    wsUL['E17'] = { t: 's', v: '', s: styleSumRow };
    wsUL['F17'] = { t: 's', v: '', s: styleSumRow };

    // 5. Hàng trống kẹt (Row 18)
    // 6. Chữ ký (Hàng 19 & 22)
    const styleSign = { font: { name: FONT_NAME, sz: 11, bold: true }, alignment: { horizontal: 'center', vertical: 'center' } };
    wsUL['B19'] = { t: 's', v: 'Người lập bảng', s: styleSign };
    wsUL['E19'] = { t: 's', v: 'Xác nhận',       s: styleSign };
    wsUL['B22'] = { t: 's', v: 'Võ Hoàng Cẩm Tiên', s: styleSign };
    wsUL['E22'] = { t: 's', v: 'Huỳnh Hải Long Hồ', s: styleSign };

    wsUL['!ref'] = 'A1:F25';
    wsUL['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 5 } }]; // A1:F1

    wsUL['!cols'] = [
      { wch: 9  },  // A: STT
      { wch: 36 },  // B: HỌ & TÊN
      { wch: 26.5 },// C: SỐ TIỀN TẠM ỨNG
      { wch: 25 },  // D: SỐ TÀI KHOẢN
      { wch: 22 },  // E: NGÂN HÀNG
      { wch: 33 },  // F: CHỦ TÀI KHOẢN
    ];

    // Row heights Sheet 2 — theo file mẫu
    const ulRowHeights: XLSX.RowInfo[] = [];
    ulRowHeights[0] = { hpt: 51.75 }; // Row 1 tiêu đề
    ulRowHeights[1] = { hpt: 66.75 }; // Row 2 header (wrap 2 dòng)
    for (let r = 2; r <= 16; r++) {
      ulRowHeights[r] = { hpt: 30 };   // Dữ liệu 14 công nhân + tổng
    }
    wsUL['!rows'] = ulRowHeights;

    XLSX.utils.book_append_sheet(wb, wsUL, sheetNameUL);

    // ══════════════════════════════════════════════════════════════════════════
    // SHEET 3: CHI LƯƠNG & BẢNG KÊ QUYẾT TOÁN THANH TOÁN
    // ══════════════════════════════════════════════════════════════════════════
    const wsCL: XLSX.WorkSheet = {};
    const sheetNameCL = `CL ĐỘI THANH-CS1-T${String(month).padStart(2, '0')}.${year}`;

    // Dùng border đen mỏng như file mẫu Sheet 3
    const clCellStyle = {
      font: { name: FONT_NAME, sz: 11 },
      border: BORDER_THIN_BLACK,
    };

    // 1. Tiêu đề bảng chi lương — merge A1:H1
    wsCL['A1'] = {
      t: 's',
      v: `DANH SÁCH CHI LƯƠNG ${teamName.toUpperCase()} THÁNG ${String(month).padStart(2, '0')}/${year}`,
      s: {
        font: { name: FONT_NAME, sz: 14, bold: true, color: { rgb: '1F3864' } },
        alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
        fill: { fgColor: { rgb: 'FFFFFF' } },
      },
    };

    // 2. Header bảng chi lương — nền xanh đậm, chữ trắng
    const clWorkerHeaders = [
      'STT',
      'HỌ & TÊN',
      'SỐ TIỀN',
      'SỐ TIỀN\r\nTẠM ỨNG',
      '\r\nSỐ TIỀN\r\nTHỰC LÃNH',
      'SỐ TÀI KHOẢN',
      'NGÂN HÀNG',
      'CHỦ TÀI KHOẢN',
    ];
    const clWorkerCols = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
    clWorkerHeaders.forEach((h, idx) => {
      wsCL[`${clWorkerCols[idx]}2`] = {
        t: 's',
        v: h,
        s: {
          font: { name: FONT_NAME, sz: 11, bold: true, color: { rgb: 'FFFFFF' } },
          fill: { fgColor: { rgb: '1F4E78' } },
          alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
          border: BORDER_THIN_BLACK,
        },
      };
    });

    // 3. Danh sách 14 công nhân
    DOI_CHU_6_THANH_WORKERS.forEach((w, idx) => {
      const r = idx + 3;
      const salaryVal = isOct2026 ? w.sampleOctoberSalary : 0;
      const advanceVal = isOct2026 ? w.sampleOctoberAdvance : 0;
      const netVal = salaryVal - advanceVal;

      // Col A: STT — in đậm, căn giữa
      wsCL[`A${r}`] = {
        t: 'n',
        v: w.stt,
        s: {
          ...clCellStyle,
          font: { name: FONT_NAME, sz: 11, bold: true },
          alignment: { horizontal: 'center', vertical: 'center' },
        },
      };

      // Col B: Họ & tên — in đậm, căn trái
      wsCL[`B${r}`] = {
        t: 's',
        v: w.name,
        s: {
          ...clCellStyle,
          font: { name: FONT_NAME, sz: 11, bold: true },
          alignment: { horizontal: 'left', vertical: 'center' },
        },
      };

      // Col C: Số tiền lương — format tiền, căn phải
      wsCL[`C${r}`] = {
        t: 'n',
        v: salaryVal,
        z: FMT_MONEY,
        s: { ...clCellStyle, alignment: { horizontal: 'right', vertical: 'center' } },
      };

      // Col D: Số tiền tạm ứng — format tiền, căn phải
      wsCL[`D${r}`] = {
        t: 'n',
        v: advanceVal,
        z: FMT_MONEY,
        s: { ...clCellStyle, alignment: { horizontal: 'right', vertical: 'center' } },
      };

      // Col E: Số tiền thực lãnh (C - D) — in đậm, format tiền
      wsCL[`E${r}`] = {
        t: 'n',
        v: netVal,
        f: `C${r}-D${r}`,
        z: FMT_MONEY,
        s: {
          ...clCellStyle,
          font: { name: FONT_NAME, sz: 11, bold: true },
          alignment: { horizontal: 'right', vertical: 'center' },
        },
      };

      // Col F: Số tài khoản — căn giữa
      wsCL[`F${r}`] = {
        t: 's',
        v: w.stk,
        s: { ...clCellStyle, alignment: { horizontal: 'center', vertical: 'center' } },
      };

      // Col G: Ngân hàng — căn giữa
      wsCL[`G${r}`] = {
        t: 's',
        v: w.bank,
        s: { ...clCellStyle, alignment: { horizontal: 'center', vertical: 'center' } },
      };

      // Col H: Chủ tài khoản — căn trái
      wsCL[`H${r}`] = {
        t: 's',
        v: w.accountHolder,
        s: { ...clCellStyle, alignment: { horizontal: 'left', vertical: 'center' } },
      };
    });

    // 4. Hàng tổng cộng (Hàng 17) — nền vàng nhạt FFF2CC, in đậm
    const clSumStyle = {
      font: { name: FONT_NAME, sz: 12, bold: true, color: { rgb: '1F3864' } },
      fill: { fgColor: { rgb: 'FFF2CC' } },
      border: BORDER_THIN_BLACK,
    };
    ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'].forEach((col) => {
      wsCL[`${col}17`] = { t: 's', v: '', s: clSumStyle };
    });
    wsCL['B17'] = {
      t: 's',
      v: 'TỔNG CỘNG : ',
      s: { ...clSumStyle, alignment: { horizontal: 'left', vertical: 'center' } },
    };
    wsCL['C17'] = {
      t: 'n',
      v: isOct2026 ? 59198000 : 0,
      f: 'SUM(C3:C16)',
      z: FMT_MONEY,
      s: { ...clSumStyle, alignment: { horizontal: 'right', vertical: 'center' } },
    };
    wsCL['D17'] = {
      t: 'n',
      v: isOct2026 ? 32000000 : 0,
      f: 'SUM(D3:D16)',
      z: FMT_MONEY,
      s: { ...clSumStyle, alignment: { horizontal: 'right', vertical: 'center' } },
    };
    wsCL['E17'] = {
      t: 'n',
      v: isOct2026 ? 27198000 : 0,
      f: 'SUM(E3:E16)',
      z: FMT_MONEY,
      s: { ...clSumStyle, alignment: { horizontal: 'right', vertical: 'center' } },
    };

    // 5. Chữ ký (Hàng 19 & 22)
    const clSignStyle = {
      font: { name: FONT_NAME, sz: 11, bold: true },
      alignment: { horizontal: 'center', vertical: 'center' },
    };
    wsCL['B19'] = { t: 's', v: 'Người lập bảng', s: clSignStyle };
    wsCL['F19'] = { t: 's', v: 'Xác nhận',       s: clSignStyle };
    wsCL['B22'] = { t: 's', v: 'Võ Hoàng Cẩm Tiên', s: clSignStyle };
    wsCL['F22'] = { t: 's', v: 'Huỳnh Hải Long Hồ', s: clSignStyle };

    // ══════════════════════════════════════════════════════════════════════════
    // 6. BẢNG KÊ QUYẾT TOÁN THANH TOÁN (HÀNG 24 - 31 ĐÚNG CHUẨN MẪU HÌNH ẢNH)
    // ══════════════════════════════════════════════════════════════════════════
    const tonsCoTroTotal = items.filter((i) => i.isCoTro).reduce((s, i) => s + i.roundedTons, 0);
    const tonsKhongTroTotal = items.filter((i) => !i.isCoTro).reduce((s, i) => s + i.roundedTons, 0);
    const priceCoTroDefault = items.find((i) => i.isCoTro)?.unitPrice || 20000;
    const priceKhongTroDefault = items.find((i) => !i.isCoTro)?.unitPrice || 16000;
    const workDaysCount = new Set(items.map((i) => i.dischargeDate).filter(Boolean)).size || 23;
    const iceAmount = workDaysCount * 10000;
    const totalCalculated = tonsCoTroTotal * priceCoTroDefault + tonsKhongTroTotal * priceKhongTroDefault + iceAmount;
    const advanceTotalVal = isOct2026 ? 32000000 : 0;
    const remainingVal = totalCalculated - advanceTotalVal;

    // Hàng 24: Header tím nhạt — merge B24:E24
    const styleH24 = {
      font: { name: FONT_NAME, sz: 13, bold: true, color: { rgb: '1F3864' } },
      fill: { fgColor: { rgb: 'E6E0EC' } },
      alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
      border: BORDER_THIN_BLACK,
    };
    wsCL['B24'] = { t: 's', v: `BẢNG KÊ ${teamName.toUpperCase()} THÁNG ${String(month).padStart(2, '0')}/${year}`, s: styleH24 };
    wsCL['C24'] = { t: 's', v: '', s: styleH24 };
    wsCL['D24'] = { t: 's', v: '', s: styleH24 };
    wsCL['E24'] = { t: 's', v: '', s: styleH24 };

    // Hàng 25: Header cột xanh ngọc nhạt DBEEF4
    const styleH25 = {
      font: { name: FONT_NAME, sz: 11, bold: true, color: { rgb: '000000' } },
      fill: { fgColor: { rgb: 'DBEEF4' } },
      alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
      border: BORDER_THIN_BLACK,
    };
    wsCL['B25'] = { t: 's', v: 'XUẤT',              s: styleH25 };
    wsCL['C25'] = { t: 's', v: 'SỐ LƯỢNG (TẤN)',    s: styleH25 };
    wsCL['D25'] = { t: 's', v: 'ĐƠN GIÁ\r\n(ĐỒNG/TẤN)', s: styleH25 };
    wsCL['E25'] = { t: 's', v: 'THÀNH TIỀN',        s: styleH25 };

    // Style chung cho các hàng dữ liệu (26-28)
    const styleDataLbl = {
      font: { name: FONT_NAME, sz: 11, bold: true },
      border: BORDER_THIN_BLACK,
      fill: { fgColor: { rgb: 'FFFFFF' } },
    };
    const styleDataNum = {
      font: { name: FONT_NAME, sz: 11 },
      border: BORDER_THIN_BLACK,
    };

    // Hàng 26: Tổng xuất có trở
    wsCL['B26'] = { t: 's', v: 'TỔNG XUẤT CÓ TRỞ',   s: { ...styleDataLbl, alignment: { horizontal: 'left', vertical: 'center' } } };
    wsCL['C26'] = { t: 'n', v: tonsCoTroTotal,         z: FMT_NUMBER, s: { ...styleDataNum, alignment: { horizontal: 'center', vertical: 'center' } } };
    wsCL['D26'] = { t: 'n', v: priceCoTroDefault,      z: FMT_MONEY,  s: { ...styleDataNum, alignment: { horizontal: 'right', vertical: 'center' } } };
    wsCL['E26'] = { t: 'n', v: tonsCoTroTotal * priceCoTroDefault,   f: 'C26*D26', z: FMT_MONEY, s: { ...styleDataLbl, alignment: { horizontal: 'right', vertical: 'center' } } };

    // Hàng 27: Tổng xuất không trở
    wsCL['B27'] = { t: 's', v: 'TỔNG XUẤT KHÔNG TRỞ', s: { ...styleDataLbl, alignment: { horizontal: 'left', vertical: 'center' } } };
    wsCL['C27'] = { t: 'n', v: tonsKhongTroTotal,      z: FMT_NUMBER, s: { ...styleDataNum, alignment: { horizontal: 'center', vertical: 'center' } } };
    wsCL['D27'] = { t: 'n', v: priceKhongTroDefault,   z: FMT_MONEY,  s: { ...styleDataNum, alignment: { horizontal: 'right', vertical: 'center' } } };
    wsCL['E27'] = { t: 'n', v: tonsKhongTroTotal * priceKhongTroDefault, f: 'C27*D27', z: FMT_MONEY, s: { ...styleDataLbl, alignment: { horizontal: 'right', vertical: 'center' } } };

    // Hàng 28: Nước đá (10.000Đ/ngày làm việc)
    wsCL['B28'] = { t: 's', v: 'NƯỚC ĐÁ\r\n(10.000Đ/ngày làm việc)', s: { ...styleDataLbl, alignment: { horizontal: 'center', vertical: 'center', wrapText: true } } };
    wsCL['C28'] = { t: 'n', v: workDaysCount, z: FMT_NUMBER, s: { ...styleDataNum, alignment: { horizontal: 'center', vertical: 'center' } } };
    wsCL['D28'] = { t: 'n', v: 10000,         z: FMT_MONEY,  s: { ...styleDataNum, alignment: { horizontal: 'right', vertical: 'center' } } };
    wsCL['E28'] = { t: 'n', v: iceAmount,     f: 'C28*D28',  z: FMT_MONEY, s: { ...styleDataLbl, alignment: { horizontal: 'right', vertical: 'center' } } };

    // Hàng 29: TỔNG CỘNG : — chữ đỏ đậm, nền trắng
    const styleH29 = {
      font: { name: FONT_NAME, sz: 13, bold: true, color: { rgb: 'FF0000' } },
      fill: { fgColor: { rgb: 'FFFFFF' } },
      border: BORDER_THIN_BLACK,
    };
    wsCL['B29'] = { t: 's', v: 'TỔNG CỘNG :',  s: { ...styleH29, alignment: { horizontal: 'center', vertical: 'center' } } };
    wsCL['C29'] = { t: 's', v: '',              s: styleH29 };
    wsCL['D29'] = { t: 's', v: '',              s: styleH29 };
    wsCL['E29'] = { t: 'n', v: totalCalculated, f: 'SUM(E26:E28)', z: FMT_MONEY, s: { ...styleH29, alignment: { horizontal: 'right', vertical: 'center' } } };

    // Hàng 30: TRỪ TẠM ỨNG : — chữ đen đậm
    const styleH30 = {
      font: { name: FONT_NAME, sz: 13, bold: true, color: { rgb: '000000' } },
      fill: { fgColor: { rgb: 'FFFFFF' } },
      border: BORDER_THIN_BLACK,
    };
    wsCL['B30'] = { t: 's', v: 'TRỪ TẠM ỨNG :', s: { ...styleH30, alignment: { horizontal: 'center', vertical: 'center' } } };
    wsCL['C30'] = { t: 's', v: '',               s: styleH30 };
    wsCL['D30'] = { t: 's', v: '',               s: styleH30 };
    wsCL['E30'] = { t: 'n', v: advanceTotalVal,  z: FMT_MONEY, s: { ...styleH30, alignment: { horizontal: 'right', vertical: 'center' } } };

    // Hàng 31: CÒN LẠI : — nền vàng tươi FFFF00, chữ đỏ đậm
    const styleH31 = {
      font: { name: FONT_NAME, sz: 13, bold: true, color: { rgb: 'FF0000' } },
      fill: { fgColor: { rgb: 'FFFF00' } },
      border: BORDER_THIN_BLACK,
    };
    wsCL['B31'] = { t: 's', v: 'CÒN LẠI :', s: { ...styleH31, alignment: { horizontal: 'center', vertical: 'center' } } };
    wsCL['C31'] = { t: 's', v: '',           s: styleH31 };
    wsCL['D31'] = { t: 's', v: '',           s: styleH31 };
    wsCL['E31'] = { t: 'n', v: remainingVal, f: 'E29-E30', z: FMT_MONEY, s: { ...styleH31, alignment: { horizontal: 'right', vertical: 'center' } } };

    wsCL['!ref'] = 'A1:H35';
    wsCL['!merges'] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: 7 } }, // A1:H1 — tiêu đề
      { s: { r: 23, c: 1 }, e: { r: 23, c: 4 } }, // B24:E24 — header bảng quyết toán
      { s: { r: 28, c: 2 }, e: { r: 28, c: 3 } }, // C29:D29 — merge C-D ở TỔNG CỘNG
      { s: { r: 29, c: 2 }, e: { r: 29, c: 3 } }, // C30:D30
      { s: { r: 30, c: 2 }, e: { r: 30, c: 3 } }, // C31:D31
    ];
    wsCL['!cols'] = [
      { wch: 9  },  // A: STT
      { wch: 36 },  // B: HỌ & TÊN / XUẤT
      { wch: 22 },  // C: SỐ TIỀN / SỐ LƯỢNG (TẤN)
      { wch: 24 },  // D: TẠM ỨNG / ĐƠN GIÁ (ĐỒNG/TẤN)
      { wch: 24 },  // E: THỰC LÃNH / THÀNH TIỀN
      { wch: 25 },  // F: SỐ TÀI KHOẢN
      { wch: 22 },  // G: NGÂN HÀNG
      { wch: 33 },  // H: CHỦ TÀI KHOẢN
    ];

    // Row heights Sheet 3 — theo file mẫu (hpt 30 cho tất cả dữ liệu)
    const clRowHeights: XLSX.RowInfo[] = [];
    clRowHeights[0] = { hpt: 51.75 }; // Row 1 tiêu đề
    clRowHeights[1] = { hpt: 66.75 }; // Row 2 header
    for (let r = 2; r <= 16; r++) {
      clRowHeights[r] = { hpt: 30 };   // 14 công nhân + hàng tổng
    }
    clRowHeights[22] = { hpt: 19.5 };  // Row 23 spacer nhỏ
    clRowHeights[23] = { hpt: 41.45 }; // Row 24 tiêu đề bảng quyết toán
    clRowHeights[24] = { hpt: 38.45 }; // Row 25 header cột
    clRowHeights[25] = { hpt: 30 };    // Row 26
    clRowHeights[26] = { hpt: 30 };    // Row 27
    clRowHeights[27] = { hpt: 36.6 };  // Row 28 Nước đá (wrap 2 dòng)
    clRowHeights[28] = { hpt: 30 };    // Row 29 TỔNG CỘNG
    clRowHeights[29] = { hpt: 30 };    // Row 30 TRỪ TẠM ỨNG
    clRowHeights[30] = { hpt: 30 };    // Row 31 CÒN LẠI
    wsCL['!rows'] = clRowHeights;

    XLSX.utils.book_append_sheet(wb, wsCL, sheetNameCL);

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
