import ExcelJS from 'exceljs';
import { VEHICLE_COLUMNS } from './defaults';
import { VehicleBoardState, VehicleColumnId } from './types';

const NAVY_BG = 'FF1B365D';
const SUBHEADER_BG = 'FFD9E2F3';
const BORDER_COLOR = 'FF8EA9DB';

const LEGEND_ROWS: { colId: VehicleColumnId; label: string; desc: string }[] = [
  {
    colId: 'pt_trong',
    label: 'PT TRỐNG',
    desc: 'PHƯƠNG TIỆN KHÔNG CÓ LỊCH NHẬN HÀNG VÀ CŨNG KHÔNG CÓ LỊCH GỌI NHẬN HÀNG',
  },
  {
    colId: 'pt_cho',
    label: 'PT CHỜ',
    desc: 'PHƯƠNG TIỆN CÓ LỊCH GỌI NHẬN HÀNG HOẶC ĐANG ĐI NHẬN HÀNG',
  },
  {
    colId: 'pt_nhan_lua_kho',
    label: 'PT NHẬN LÚA KHÔ',
    desc: 'PHƯƠNG TIỆN ĐANG NHẬN LÚA KHÔ',
  },
  {
    colId: 'pt_nhan_lua_tuoi',
    label: 'PT NHẬN LÚA TƯƠI',
    desc: 'PHƯƠNG TIỆN ĐANG NHẬN LÚA TƯƠI',
  },
  {
    colId: 'pt_tang_bo',
    label: 'PT TĂNG BO',
    desc: 'PHƯƠNG TIỆN ĐANG TĂNG BO',
  },
  {
    colId: 'pt_nhan_gao',
    label: 'PT NHẬN GẠO',
    desc: 'PHƯƠNG TIỆN ĐANG NHẬN GẠO',
  },
];

function formatDateVN(isoStr: string): string {
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

  // Dòng 1: DANH SÁCH PHƯƠNG TIỆN NGÀY DD/MM/YYYY (Nền xanh navy đậm, chữ trắng)
  ws.mergeCells(1, 1, 1, VEHICLE_COLUMNS.length);
  const titleCell = ws.getCell(1, 1);
  titleCell.value = `DANH SÁCH PHƯƠNG TIỆN NGÀY ${formatDateVN(state.updatedAt)}`;
  titleCell.font = { name: 'Arial', size: 13, bold: true, color: { argb: 'FFFFFFFF' } };
  titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY_BG } };
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(1).height = 30;

  // Dòng 2: Header 6 cột nền xanh nhạt, chữ đen đậm
  const headerRow = ws.getRow(2);
  headerRow.height = 26;
  VEHICLE_COLUMNS.forEach((col, idx) => {
    const cell = headerRow.getCell(idx + 1);
    cell.value = col.label;
    cell.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FF000000' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: SUBHEADER_BG } };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.border = thinBorder;
  });

  // Dữ liệu các cột
  const colLists = VEHICLE_COLUMNS.map((col) =>
    state.vehicles
      .filter((v) => v.columnId === col.id)
      .sort((a, b) => a.order - b.order)
  );
  const maxRows = Math.max(1, ...colLists.map((l) => l.length));

  for (let r = 0; r < maxRows; r++) {
    const excelRow = ws.getRow(3 + r);
    let rowHasNote = false;

    colLists.forEach((list, cIdx) => {
      const item = list[r];
      const cell = excelRow.getCell(cIdx + 1);

      if (item) {
        if (item.note) {
          rowHasNote = true;
          cell.value = {
            richText: [
              {
                text: `${r + 1}. ${item.name}\n`,
                font: { name: 'Arial', size: 10, bold: false, color: { argb: 'FF000000' } },
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
          cell.value = `${r + 1}. ${item.name}`;
          cell.font = { name: 'Arial', size: 10, bold: false, color: { argb: 'FF000000' } };
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

  // Dòng TỔNG: X PT (nền xanh navy đậm, chữ trắng)
  const totalRowIdx = 3 + maxRows;
  const totalRow = ws.getRow(totalRowIdx);
  totalRow.height = 24;
  colLists.forEach((list, idx) => {
    const cell = totalRow.getCell(idx + 1);
    cell.value = `TỔNG: ${list.length} PT`;
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
  legendHeader.font = { name: 'Arial', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
  legendHeader.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY_BG } };
  legendHeader.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(legendTitleIdx).height = 24;

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
    descCell.value = lr.desc;
    descCell.font = { name: 'Arial', size: 10, bold: false, color: { argb: 'FF000000' } };
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
  const colWidths = [28, 25, 27, 27, 25, 25];
  colWidths.forEach((w, idx) => {
    ws.getColumn(idx + 1).width = w;
  });

  const buffer = await wb.xlsx.writeBuffer();
  return new Uint8Array(buffer as ArrayBuffer);
}
