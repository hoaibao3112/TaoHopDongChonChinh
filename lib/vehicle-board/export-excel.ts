import ExcelJS from 'exceljs';
import { VEHICLE_COLUMNS } from './defaults';
import { VehicleBoardState } from './types';

export async function buildVehicleBoardExcelBuffer(state: VehicleBoardState): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('DieuPhoiPhuongTien', {
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 1 },
  });

  // Dòng 1: Tiêu đề chung
  ws.mergeCells(1, 1, 1, VEHICLE_COLUMNS.length);
  const titleCell = ws.getCell(1, 1);
  titleCell.value = `BẢNG SẮP XẾP & ĐIỀU PHỐI PHƯƠNG TIỆN — ${new Date(state.updatedAt).toLocaleString('vi-VN')}`;
  titleCell.font = { name: 'Times New Roman', size: 13, bold: true };
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(1).height = 28;

  // Dòng 2: Header 6 cột màu vàng giống ảnh mẫu
  const headerRow = ws.getRow(2);
  headerRow.height = 30;
  VEHICLE_COLUMNS.forEach((col, idx) => {
    const cell = headerRow.getCell(idx + 1);
    const count = state.vehicles.filter((v) => v.columnId === col.id).length;
    cell.value = `${col.label} (${count})`;
    cell.font = { name: 'Times New Roman', size: 11, bold: true, color: { argb: 'FF000000' } };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFFFFF00' },
    };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.border = {
      top: { style: 'thin', color: { argb: 'FF000000' } },
      left: { style: 'thin', color: { argb: 'FF000000' } },
      bottom: { style: 'thin', color: { argb: 'FF000000' } },
      right: { style: 'thin', color: { argb: 'FF000000' } },
    };
  });

  // Dòng 3: Danh sách phương tiện trong từng cột (xếp dọc trong 1 ô lớn hoặc từng dòng — từng dòng sẽ dễ đọc & lọc hơn)
  const colLists = VEHICLE_COLUMNS.map((col) =>
    state.vehicles
      .filter((v) => v.columnId === col.id)
      .sort((a, b) => a.order - b.order)
  );
  const maxRows = Math.max(1, ...colLists.map((l) => l.length));

  for (let r = 0; r < maxRows; r++) {
    const excelRow = ws.getRow(3 + r);
    excelRow.height = 22;
    colLists.forEach((list, cIdx) => {
      const item = list[r];
      const cell = excelRow.getCell(cIdx + 1);
      if (item) {
        cell.value = item.note ? `${r + 1}. ${item.name} (${item.note})` : `${r + 1}. ${item.name}`;
      } else {
        cell.value = '';
      }
      cell.font = { name: 'Times New Roman', size: 11, bold: Boolean(item) };
      cell.alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };
      cell.border = {
        top: { style: 'hair', color: { argb: 'FFCCCCCC' } },
        left: { style: 'thin', color: { argb: 'FF000000' } },
        bottom: { style: 'hair', color: { argb: 'FFCCCCCC' } },
        right: { style: 'thin', color: { argb: 'FF000000' } },
      };
    });
  }

  // Viền dưới cho dòng cuối cùng
  const lastRow = ws.getRow(2 + maxRows);
  for (let c = 1; c <= VEHICLE_COLUMNS.length; c++) {
    const cell = lastRow.getCell(c);
    cell.border = {
      ...cell.border,
      bottom: { style: 'thin', color: { argb: 'FF000000' } },
    };
  }

  VEHICLE_COLUMNS.forEach((_, idx) => {
    ws.getColumn(idx + 1).width = 28;
  });

  const buffer = await wb.xlsx.writeBuffer();
  return new Uint8Array(buffer as ArrayBuffer);
}
