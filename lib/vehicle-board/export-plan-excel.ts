import ExcelJS from 'exceljs';
import { DailyIntakePlan, VehicleItem } from './types';

function formatVietnamesePlanTitle(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const dow = dt.getUTCDay();
  const dayNames = ['CHỦ NHẬT', 'THỨ 2', 'THỨ 3', 'THỨ 4', 'THỨ 5', 'THỨ 6', 'THỨ 7'];
  const thu = dayNames[dow] || '';
  return `KẾ HOẠCH NHẬN HÀNG ${thu} NGÀY ${String(d).padStart(2, '0')} THÁNG ${String(m).padStart(2, '0')} NĂM ${y}`;
}

export async function buildDailyPlanExcelBuffer(
  plan: DailyIntakePlan,
  vehicles: VehicleItem[]
): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('KeHoachNhanHang', {
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 1 },
  });

  const vehicleMap = new Map(vehicles.map((v) => [v.id, v]));

  // Dòng 1: Tiêu đề xanh lá giống ảnh mẫu
  ws.mergeCells(1, 1, 1, 12);
  const titleCell = ws.getCell(1, 1);
  titleCell.value = formatVietnamesePlanTitle(plan.date);
  titleCell.font = { name: 'Times New Roman', size: 14, bold: true, color: { argb: 'FF008000' } };
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(1).height = 30;

  // Dòng 2: Header 12 cột
  const headers = [
    'STT',
    'KCS',
    'NHÀ CUNG CẤP',
    'SỐ HĐ',
    'LOẠI LÚA',
    'SỐ LƯỢNG (KG)',
    'GIÁ HẾT PHÍ',
    'THÀNH TIỀN',
    'ĐỊA ĐIỂM',
    'GHI CHÚ',
    'PHƯƠNG TIỆN NHẬN HÀNG',
    'GHI CHÚ NHẬN HÀNG',
  ];
  const headerRow = ws.getRow(2);
  headerRow.height = 32;
  headers.forEach((h, idx) => {
    const cell = headerRow.getCell(idx + 1);
    cell.value = h;
    const isYellow = idx === 10 || idx === 11;
    const isPrice = idx === 6;
    cell.font = {
      name: 'Times New Roman',
      size: 11,
      bold: true,
      color: { argb: isPrice ? 'FFC00000' : 'FF000000' },
    };
    if (isYellow) {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFF00' } };
    }
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.border = {
      top: { style: 'thin', color: { argb: 'FF000000' } },
      left: { style: 'thin', color: { argb: 'FF000000' } },
      bottom: { style: 'thin', color: { argb: 'FF000000' } },
      right: { style: 'thin', color: { argb: 'FF000000' } },
    };
  });

  // Dòng dữ liệu
  let totalKg = 0;
  let totalMoney = 0;

  plan.rows.forEach((row, idx) => {
    const excelRow = ws.getRow(3 + idx);
    const amount = row.quantityKg * row.pricePerKg;
    totalKg += row.quantityKg;
    totalMoney += amount;

    const ptLines = row.vehicleIds
      .map((vid, vIdx) => {
        const v = vehicleMap.get(vid);
        return v ? `${vIdx + 1}. ${v.name}` : null;
      })
      .filter(Boolean)
      .join('\n');

    excelRow.height = Math.max(24, row.vehicleIds.length * 16 + 6);

    const vals: (string | number)[] = [
      idx + 1,
      row.kcs,
      row.supplier,
      row.contractNo,
      row.riceType,
      row.quantityKg > 0 ? row.quantityKg : '',
      row.pricePerKg > 0 ? row.pricePerKg : '',
      amount > 0 ? amount : '',
      row.location,
      row.note,
      ptLines,
      row.receiveNote || '',
    ];

    vals.forEach((val, cIdx) => {
      const cell = excelRow.getCell(cIdx + 1);
      cell.value = val;
      const isNumRed = cIdx === 5 || cIdx === 6;
      cell.font = {
        name: 'Times New Roman',
        size: 11,
        bold: cIdx === 0 || cIdx === 1 || cIdx === 10,
        color: { argb: isNumRed ? 'FFFF0000' : cIdx === 9 && row.note ? 'FFFF0000' : 'FF000000' },
      };
      if (typeof val === 'number') {
        cell.numFmt = '#,##0';
      }
      cell.alignment = {
        horizontal:
          cIdx === 0 || cIdx === 1 || cIdx === 3 || cIdx === 4 || cIdx === 10
            ? 'center'
            : cIdx === 5 || cIdx === 6 || cIdx === 7
            ? 'right'
            : 'left',
        vertical: 'middle',
        wrapText: true,
      };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FF000000' } },
        left: { style: 'thin', color: { argb: 'FF000000' } },
        bottom: { style: 'thin', color: { argb: 'FF000000' } },
        right: { style: 'thin', color: { argb: 'FF000000' } },
      };
    });
  });

  // Dòng TỔNG CỘNG
  const totalRow = ws.getRow(3 + plan.rows.length);
  totalRow.height = 26;
  ws.mergeCells(3 + plan.rows.length, 1, 3 + plan.rows.length, 5);
  totalRow.getCell(1).value = 'TỔNG CỘNG:';
  totalRow.getCell(6).value = totalKg;
  totalRow.getCell(6).numFmt = '#,##0';
  totalRow.getCell(8).value = totalMoney;
  totalRow.getCell(8).numFmt = '#,##0';

  for (let c = 1; c <= 12; c++) {
    const cell = totalRow.getCell(c);
    cell.font = {
      name: 'Times New Roman',
      size: 12,
      bold: true,
      color: { argb: c === 6 || c === 8 ? 'FFFF0000' : 'FF000000' },
    };
    cell.alignment = {
      horizontal: c === 1 ? 'center' : c === 6 || c === 8 ? 'right' : 'center',
      vertical: 'middle',
    };
    cell.border = {
      top: { style: 'thin', color: { argb: 'FF000000' } },
      left: { style: 'thin', color: { argb: 'FF000000' } },
      bottom: { style: 'thin', color: { argb: 'FF000000' } },
      right: { style: 'thin', color: { argb: 'FF000000' } },
    };
  }

  const widths = [6, 11, 22, 14, 18, 15, 13, 17, 36, 20, 28, 26];
  widths.forEach((w, idx) => {
    ws.getColumn(idx + 1).width = w;
  });

  const buffer = await wb.xlsx.writeBuffer();
  return new Uint8Array(buffer as ArrayBuffer);
}
