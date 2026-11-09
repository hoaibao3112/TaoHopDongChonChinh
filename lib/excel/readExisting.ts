import ExcelJS from 'exceljs';
import { ExistingExcelRow } from '../husk/types';

export interface ExistingSheetAnalysis {
  sheetName: string;
  hasTargetSheet: boolean;
  existingRows: ExistingExcelRow[];
  lastDataRowNumber: number;
  maxStt: number;
  sampleFormattingRowNumber: number;
  signatureStartRowNumber: number;
  allSheetNames: string[];
}

/**
 * Đọc file Excel lương hiện có để phân tích cấu trúc sheet "QUÝ":
 * - Tìm các dòng dữ liệu hiện tại
 * - Tìm STT lớn nhất
 * - Tìm vị trí dòng dữ liệu cuối (để nối tiếp STT)
 * - Lấy danh sách các dòng trấu đã có để đối chiếu kiểm tra trùng
 */
export async function readExistingPayrollExcel(
  fileBuffer: Buffer | ArrayBuffer,
  targetSheetName: string = 'QUÝ'
): Promise<ExistingSheetAnalysis> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(fileBuffer as any);

  const allSheetNames = workbook.worksheets.map((ws) => ws.name);
  const worksheet = workbook.getWorksheet(targetSheetName) || workbook.worksheets[0];

  if (!worksheet) {
    return {
      sheetName: targetSheetName,
      hasTargetSheet: false,
      existingRows: [],
      lastDataRowNumber: 7,
      maxStt: 0,
      sampleFormattingRowNumber: 8,
      signatureStartRowNumber: 53,
      allSheetNames,
    };
  }

  const existingRows: ExistingExcelRow[] = [];
  let maxStt = 0;
  let lastDataRowNumber = 7;
  let sampleFormattingRowNumber = 8;
  let signatureStartRowNumber = 53;

  worksheet.eachRow((row, rowNumber) => {
    // Dòng dữ liệu bắt đầu từ dòng 8 trở đi
    if (rowNumber >= 8) {
      const cellA = row.getCell(1).value; // STT
      const cellB = row.getCell(2).value; // NGÀY
      const cellC = row.getCell(3).value; // ĐỘI
      const cellD = row.getCell(4).value; // CÔNG VIỆC
      const cellE = row.getCell(5).value; // KG

      // Kiểm tra xem có phải dòng chữ ký không (ví dụ chứa chữ "Người lập bảng", "Xác nhận")
      const textRow = row.values ? String(row.values) : '';
      if (textRow.includes('Người lập bảng') || textRow.includes('Xác nhận')) {
        if (signatureStartRowNumber === 53 || rowNumber < signatureStartRowNumber) {
          signatureStartRowNumber = rowNumber;
        }
        return;
      }

      // Kiểm tra STT hợp lệ
      const sttNum = typeof cellA === 'number' ? cellA : parseInt(String(cellA || ''), 10);
      if (!isNaN(sttNum) && sttNum > 0) {
        if (sttNum > maxStt) {
          maxStt = sttNum;
        }
        lastDataRowNumber = Math.max(lastDataRowNumber, rowNumber);
        sampleFormattingRowNumber = rowNumber;

        // Trích xuất ngày
        let dateStr = '';
        if (cellB instanceof Date) {
          const d = String(cellB.getDate()).padStart(2, '0');
          const m = String(cellB.getMonth() + 1).padStart(2, '0');
          const y = cellB.getFullYear();
          dateStr = `${d}/${m}/${y}`;
        } else if (typeof cellB === 'string') {
          dateStr = cellB.trim();
        }

        const desc = typeof cellD === 'string' ? cellD.trim() : cellD ? String(cellD) : '';
        const kgVal = typeof cellE === 'number' ? cellE : parseFloat(String(cellE || '0')) || 0;

        existingRows.push({
          stt: sttNum,
          rowNumber,
          dateStr,
          team: cellC ? String(cellC) : '',
          description: desc,
          weightKg: kgVal,
        });
      }
    }
  });

  return {
    sheetName: worksheet.name,
    hasTargetSheet: true,
    existingRows,
    lastDataRowNumber,
    maxStt,
    sampleFormattingRowNumber,
    signatureStartRowNumber,
    allSheetNames,
  };
}
