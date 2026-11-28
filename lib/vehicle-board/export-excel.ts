import ExcelJS from 'exceljs';
import { VEHICLE_COLUMNS } from './defaults';
import { VehicleBoardState, VehicleColumnId } from './types';

const NAVY_BG = 'FF1B365D';
const BORDER_COLOR = 'FF8EA9DB';

const COLUMN_HEADER_STYLE: Record<
  VehicleColumnId,
  { label: string; fillHex: string }
> = {
  pt_trong: { label: 'PT TRỐNG', fillHex: 'FFFFFF00' }, // Vàng tươi
  pt_cho: { label: 'PT CHỜ', fillHex: 'FFB497D6' }, // Tím nhạt
  pt_nhan_lua_kho: { label: 'PT NHẬN LÚA KHÔ', fillHex: 'FFFF9900' }, // Cam tươi
  pt_nhan_lua_tuoi: { label: 'PT NHẬN LÚA TƯƠI', fillHex: 'FF00FF00' }, // Xanh lá sáng
  pt_tang_bo: { label: 'PT TĂNG BO', fillHex: 'FF2E6B80' }, // Xanh cổ vịt đậm
  pt_nhan_gao: { label: 'PT NHẬN GẠO/TẤM/CÁM', fillHex: 'FFFFFFFF' }, // Trắng
};

const LEGEND_ROWS: { colId: VehicleColumnId; label: string; redDesc: string }[] = [
  {
    colId: 'pt_trong',
    label: 'PT TRỐNG',
    redDesc: 'KHÔNG CÓ LỊCH NHẬN HÀNG, NGHỈ PHÉP, BẢO TRÌ...',
  },
  {
    colId: 'pt_cho',
    label: 'PT CHỜ',
    redDesc: 'CÓ LỊCH GỌI NHẬN HÀNG, ĐANG ĐI NHẬN HÀNG HOẶC CHỜ NHẬN',
  },
  {
    colId: 'pt_nhan_lua_kho',
    label: 'PT NHẬN LÚA KHÔ',
    redDesc: 'ĐANG NHẬN LÚA KHÔ',
  },
  {
    colId: 'pt_nhan_lua_tuoi',
    label: 'PT NHẬN LÚA TƯƠI',
    redDesc: 'ĐANG NHẬN LÚA TƯƠI',
  },
  {
    colId: 'pt_tang_bo',
    label: 'PT TĂNG BO',
    redDesc: 'ĐANG TĂNG BO',
  },
  {
    colId: 'pt_nhan_gao',
    label: 'PT NHẬN GẠO/TẤM/CÁM',
    redDesc: 'ĐANG NHẬN GẠO, TẤM, CÁM',
  },
];

function formatDateVN(dateStr?: string, isoStr?: string): string {
  if (dateStr && /^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    const [yyyy, mm, dd] = dateStr.split('-');
    return `${dd}/${mm}/${yyyy}`;
  }
  const dt = isoStr ? new Date(isoStr) : new Date();
  const safeDt = Number.isNaN(dt.getTime()) ? new Date() : dt;
  const vn = new Date(safeDt.getTime() + 7 * 60 * 60 * 1000);
  const dd = String(vn.getUTCDate()).padStart(2, '0');
  const mm = String(vn.getUTCMonth() + 1).padStart(2, '0');
  const yyyy = vn.getUTCFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

export async function buildVehicleBoardExcelBuffer(state: VehicleBoardState): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('DanhSachPhuongTien', {
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 1 },
  });

  const thinBorder: Partial<ExcelJS.Borders> = {
    top: { style: 'thin', color: { argb: BORDER_COLOR } },
    left: { style: 'thin', color: { argb: BORDER_COLOR } },
    bottom: { style: 'thin', color: { argb: BORDER_COLOR } },
    right: { style: 'thin', color: { argb: BORDER_COLOR } },
  };

  // Dòng 1: DANH SÁCH TÌNH TRẠNG PHƯƠNG TIỆN NGÀY DD/MM/YYYY (Nền xanh navy đậm, chữ ĐỎ to rõ)
  ws.mergeCells(1, 1, 1, VEHICLE_COLUMNS.length);
  const titleCell = ws.getCell(1, 1);
  titleCell.value = `DANH SÁCH TÌNH TRẠNG PHƯƠNG TIỆN NGÀY ${formatDateVN(state.date, state.updatedAt)}`;
  titleCell.font = { name: 'Arial', size: 16, bold: true, color: { argb: 'FFFF0000' } };
  titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY_BG } };
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(1).height = 38;

  // Dòng 2: Header 6 cột với 6 màu chuẩn theo ảnh mẫu & cỡ chữ to hơn nội dung (13pt vs 10pt)
  const headerRow = ws.getRow(2);
  headerRow.height = 36;
  VEHICLE_COLUMNS.forEach((col, idx) => {
    const style = COLUMN_HEADER_STYLE[col.id];
    const cell = headerRow.getCell(idx + 1);
    cell.value = style.label;
    cell.font = { name: 'Arial', size: 13, bold: true, color: { argb: 'FF000000' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: style.fillHex } };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.border = thinBorder;
  });

  // Dữ liệu các cột (cỡ chữ nội dung 10pt nhỏ hơn tiêu đề) — xếp Nguyên Nguyên lên trên, PT Ngoài ở dưới
  const colListsRaw = VEHICLE_COLUMNS.map((col) => {
    const items = state.vehicles
      .filter((v) => v.columnId === col.id)
      .sort((a, b) => a.order - b.order);
    const nn = items.filter((v) => v.group === 'nguyen_nguyen');
    const ext = items.filter((v) => v.group === 'external');
    return { nn, ext, all: [...nn, ...ext] };
  });
  const maxRows = Math.max(1, ...colListsRaw.map((l) => l.all.length));

  for (let r = 0; r < maxRows; r++) {
    const excelRow = ws.getRow(3 + r);
    let rowHasNote = false;

    colListsRaw.forEach((colData, cIdx) => {
      const item = colData.all[r];
      const cell = excelRow.getCell(cIdx + 1);

      if (item) {
        const isNN = item.group === 'nguyen_nguyen';
        const displayIdx = isNN ? r + 1 : r - colData.nn.length + 1;
        const nameColor = isNN ? 'FFC00000' : 'FF000000';
        if (item.note) {
          rowHasNote = true;
          cell.value = {
            richText: [
              {
                text: `${displayIdx}. ${item.name}\n`,
                font: { name: 'Arial', size: 10, bold: isNN, color: { argb: nameColor } },
              },
              {
                text: `(${item.note.toUpperCase()})`,
                font: {
                  name: 'Arial',
                  size: 9,
                  bold: true,
                  italic: true,
                  color: { argb: 'FFC00000' },
                },
              },
            ],
          };
        } else {
          cell.value = `${displayIdx}. ${item.name}`;
          cell.font = { name: 'Arial', size: 10, bold: isNN, color: { argb: nameColor } };
        }
      } else {
        cell.value = '';
      }

      if (r % 2 === 1) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF9FAFB' } };
      }
      cell.alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };
      cell.border = thinBorder;
    });

    excelRow.height = rowHasNote ? 36 : 20;
  }

  // Dòng TỔNG: X PT (Y NN · Z NGOÀI) (nền xanh navy đậm, chữ trắng)
  const totalRowIdx = 3 + maxRows;
  const totalRow = ws.getRow(totalRowIdx);
  totalRow.height = 25;
  colListsRaw.forEach((colData, idx) => {
    const cell = totalRow.getCell(idx + 1);
    cell.value = `TỔNG: ${colData.all.length} PT (${colData.nn.length} NN · ${colData.ext.length} NGOÀI)`;
    cell.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY_BG } };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.border = thinBorder;
  });

  // Dòng trống ngăn cách
  ws.getRow(totalRowIdx + 1).height = 12;

  // Bảng CHÚ THÍCH
  const legendTitleIdx = totalRowIdx + 2;
  ws.mergeCells(legendTitleIdx, 1, legendTitleIdx, VEHICLE_COLUMNS.length);
  const legendHeader = ws.getCell(legendTitleIdx, 1);
  legendHeader.value = 'CHÚ THÍCH';
  legendHeader.font = { name: 'Arial', size: 12, bold: true, color: { argb: 'FFFFFFFF' } };
  legendHeader.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY_BG } };
  legendHeader.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(legendTitleIdx).height = 26;

  LEGEND_ROWS.forEach((lr, idx) => {
    const rIdx = legendTitleIdx + 1 + idx;
    const row = ws.getRow(rIdx);
    row.height = 22;

    const labelCell = row.getCell(1);
    labelCell.value = lr.label;
    labelCell.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FF000000' } };
    labelCell.alignment = { horizontal: 'left', vertical: 'middle' };
    labelCell.border = thinBorder;

    ws.mergeCells(rIdx, 2, rIdx, VEHICLE_COLUMNS.length);
    const descCell = row.getCell(2);
    descCell.value = {
      richText: [
        {
          text: 'PHƯƠNG TIỆN ',
          font: { name: 'Arial', size: 10, bold: false, color: { argb: 'FF000000' } },
        },
        {
          text: lr.redDesc,
          font: { name: 'Arial', size: 10, bold: false, color: { argb: 'FFFF0000' } },
        },
      ],
    };
    descCell.alignment = { horizontal: 'left', vertical: 'middle' };
    for (let c = 2; c <= VEHICLE_COLUMNS.length; c++) {
      row.getCell(c).border = thinBorder;
    }

    if (idx % 2 === 1) {
      labelCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F4F8' } };
      descCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F4F8' } };
    }
  });

  // Độ rộng 6 cột
  const colWidths = [28, 25, 29, 29, 25, 28];
  colWidths.forEach((w, idx) => {
    ws.getColumn(idx + 1).width = w;
  });

  const buffer = await wb.xlsx.writeBuffer();
  return new Uint8Array(buffer as ArrayBuffer);
}
