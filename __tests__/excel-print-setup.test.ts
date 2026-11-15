import { describe, it, expect } from 'vitest';
import XLSX from 'xlsx-js-style';
import ExcelJS from 'exceljs';
import PizZip from 'pizzip';
import { finalizeWorkbookWithPrintSetup } from '@/lib/excel/excelPrintHelper';

describe('Excel Print Setup Helper - Chuẩn hóa giao diện in ấn OpenXML', () => {
  it('tự động cấu hình fitToPage, fitToWidth: 1, fitToHeight: 0, A4 và căn giữa trang cho nhiều sheet', async () => {
    const wb = XLSX.utils.book_new();

    // Sheet 1: Bảng kê nhiều cột (15 cột) -> tự động nhận diện Landscape
    const ws1 = XLSX.utils.aoa_to_sheet([
      ['C1', 'C2', 'C3', 'C4', 'C5', 'C6', 'C7', 'C8', 'C9', 'C10', 'C11', 'C12', 'C13', 'C14', 'C15'],
      [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
    ]);
    ws1['!cols'] = Array(15).fill({ wch: 12 });
    XLSX.utils.book_append_sheet(wb, ws1, 'BangKeNhieuCot');

    // Sheet 2: Danh sách chi lương ít cột (6 cột) -> tự động nhận diện Portrait
    const ws2 = XLSX.utils.aoa_to_sheet([
      ['STT', 'Họ tên', 'Lương', 'Tạm ứng', 'Còn lại', 'Số TK'],
      [1, 'Nguyễn Văn A', 10000000, 2000000, 8000000, '0123456789'],
    ]);
    ws2['!cols'] = Array(6).fill({ wch: 15 });
    XLSX.utils.book_append_sheet(wb, ws2, 'BangLuongItCot');

    // Kết xuất buffer với finalizeWorkbookWithPrintSetup
    const buffer = finalizeWorkbookWithPrintSetup(wb, {
      BangKeNhieuCot: { orientation: 'landscape', fitToWidth: 1, fitToHeight: 0 },
      BangLuongItCot: { orientation: 'portrait', fitToWidth: 1, fitToHeight: 0 },
    });

    expect(buffer).toBeDefined();
    expect(buffer.length).toBeGreaterThan(1000);

    // Dùng ExcelJS để load lại buffer và kiểm tra các thông số OpenXML được nhúng
    const ejWb = new ExcelJS.Workbook();
    await ejWb.xlsx.load(buffer as unknown as ExcelJS.Buffer);

    // 1. Kiểm tra calcPr fullCalcOnLoad="1" trong xl/workbook.xml để Excel tự động tính toán lại
    const zip = new PizZip(buffer);
    const wbXml = zip.file('xl/workbook.xml')?.asText();
    expect(wbXml).toContain('<calcPr fullCalcOnLoad="1"/>');

    // 2. Kiểm tra Sheet 1 (Bảng kê nhiều cột): Khổ ngang, vừa khít 1 trang ngang, A4
    const ejWs1 = ejWb.getWorksheet('BangKeNhieuCot');
    expect(ejWs1).toBeDefined();
    expect(ejWs1?.pageSetup.paperSize).toBe(9); // A4
    expect(ejWs1?.pageSetup.orientation).toBe('landscape');
    expect(ejWs1?.pageSetup.fitToPage).toBe(true);
    expect(ejWs1?.pageSetup.fitToWidth).toBe(1);
    expect(ejWs1?.pageSetup.fitToHeight).toBe(0);
    expect(ejWs1?.pageSetup.horizontalCentered).toBe(true);
    expect(ejWs1?.pageSetup.margins?.left).toBe(0.35);
    expect(ejWs1?.pageSetup.margins?.right).toBe(0.35);

    // 3. Kiểm tra Sheet 2 (Bảng lương ít cột): Khổ đứng, vừa khít 1 trang ngang, A4
    const ejWs2 = ejWb.getWorksheet('BangLuongItCot');
    expect(ejWs2).toBeDefined();
    expect(ejWs2?.pageSetup.paperSize).toBe(9); // A4
    expect(ejWs2?.pageSetup.orientation).toBe('portrait');
    expect(ejWs2?.pageSetup.fitToPage).toBe(true);
    expect(ejWs2?.pageSetup.fitToWidth).toBe(1);
    expect(ejWs2?.pageSetup.fitToHeight).toBe(0);
    expect(ejWs2?.pageSetup.horizontalCentered).toBe(true);
  });
});
