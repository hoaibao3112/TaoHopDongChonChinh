import ExcelJS from 'exceljs';
import { ScannedSlipItem, HuskSettings, DEFAULT_HUSK_SETTINGS } from '../husk/types';

export interface WriteHuskResult {
  updatedBuffer: Buffer;
  insertedCount: number;
  startStt: number;
  endStt: number;
  totalKg: number;
  totalTons: number;
  totalAmount: number;
}

/**
 * Hàm phân tích ngày chuỗi "DD/MM/YYYY" sang Date object của JS (local timezone)
 */
function parseDateStringToDate(dateStr: string): Date {
  const parts = (dateStr || '').split('/').map(Number);
  if (parts.length === 3 && parts[0] > 0 && parts[1] > 0 && parts[2] > 2000) {
    return new Date(parts[2], parts[1] - 1, parts[0], 12, 0, 0);
  }
  return new Date();
}

/**
 * Ghi các dòng xuất trấu vào file Excel lương:
 * - Giữ nguyên công thức liên kết (như J8 = [1]QUÝ!$L$9)
 * - Tự động dời phần chữ ký xuống nếu cần thiết
 * - Sao chép format (font Times New Roman, viền, căn lề, format ngày) từ dòng mẫu
 * - Đặt công thức R = =Q{r}*F{r}
 * - Đặt fullCalcOnLoad để Excel tự động tính toán lại khi mở file
 */
export async function writeHuskRowsToExcel(
  templateBuffer: Buffer | ArrayBuffer,
  slipsToWrite: ScannedSlipItem[],
  settings: HuskSettings = DEFAULT_HUSK_SETTINGS
): Promise<WriteHuskResult> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(templateBuffer as any);

  const targetSheetName = settings.sheetName || 'QUÝ';
  const worksheet = workbook.getWorksheet(targetSheetName) || workbook.worksheets[0];

  if (!worksheet) {
    throw new Error(`Không tìm thấy sheet "${targetSheetName}" trong file Excel.`);
  }

  // 1. Phân tích sheet để tìm dòng dữ liệu cuối, STT lớn nhất và vị trí chữ ký
  let maxStt = 0;
  let lastDataRowNumber = 7;
  let sampleFormattingRowNumber = 8;
  let signatureStartRowNumber = 53;

  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber >= 8) {
      const cellA = row.getCell(1).value;
      const sttNum = typeof cellA === 'number' ? cellA : parseInt(String(cellA || ''), 10);

      const textRow = row.values ? String(row.values) : '';
      if (textRow.includes('Người lập bảng') || textRow.includes('Xác nhận')) {
        if (signatureStartRowNumber === 53 || rowNumber < signatureStartRowNumber) {
          signatureStartRowNumber = rowNumber;
        }
        return;
      }

      if (!isNaN(sttNum) && sttNum > 0) {
        if (sttNum > maxStt) {
          maxStt = sttNum;
        }
        lastDataRowNumber = Math.max(lastDataRowNumber, rowNumber);
        sampleFormattingRowNumber = rowNumber;
      }
    }
  });

  const sampleRow = worksheet.getRow(sampleFormattingRowNumber);

  // 2. Kiểm tra nếu chèn các dòng mới có đè lên phần chữ ký không
  const rowsToInsertCount = slipsToWrite.length;
  const insertStartRowNumber = lastDataRowNumber + 1;
  const neededRowsEnd = insertStartRowNumber + rowsToInsertCount - 1;

  if (neededRowsEnd >= signatureStartRowNumber) {
    // Dời phần chữ ký xuống bằng cách chèn thêm dòng trống
    const shiftCount = neededRowsEnd - signatureStartRowNumber + 3;
    worksheet.spliceRows(signatureStartRowNumber, 0, ...new Array(shiftCount).fill([]));
  }

  let currentStt = maxStt;
  let totalKg = 0;
  let totalTons = 0;
  let totalAmount = 0;

  // 3. Ghi từng dòng trấu
  slipsToWrite.forEach((slip, index) => {
    currentStt += 1;
    const targetRowNumber = insertStartRowNumber + index;
    const targetRow = worksheet.getRow(targetRowNumber);

    totalKg += slip.weightNetKg;
    totalTons += slip.tons;
    totalAmount += slip.amount;

    // Sao chép định dạng ô từ sampleRow (từ cột A đến S)
    for (let c = 1; c <= 19; c++) {
      const sampleCell = sampleRow.getCell(c);
      const targetCell = targetRow.getCell(c);

      targetCell.style = JSON.parse(JSON.stringify(sampleCell.style || {}));
      targetCell.border = sampleCell.border ? JSON.parse(JSON.stringify(sampleCell.border)) : undefined;
      targetCell.font = sampleCell.font ? JSON.parse(JSON.stringify(sampleCell.font)) : { name: 'Times New Roman', size: 12 };
      targetCell.alignment = sampleCell.alignment ? JSON.parse(JSON.stringify(sampleCell.alignment)) : undefined;
    }

    // A: STT
    const cellA = targetRow.getCell(1);
    cellA.value = currentStt;
    cellA.alignment = { horizontal: 'center', vertical: 'middle' };

    // B: NGÀY NHẬP/XUẤT (ngày, định dạng dd/mm/yyyy)
    const cellB = targetRow.getCell(2);
    cellB.value = parseDateStringToDate(slip.date);
    cellB.numFmt = 'dd/mm/yyyy';
    cellB.alignment = { horizontal: 'center', vertical: 'middle' };

    // C: ĐỘI (mặc định "ĐỨC")
    const cellC = targetRow.getCell(3);
    cellC.value = settings.defaultTeam || 'ĐỨC';
    cellC.alignment = { horizontal: 'center', vertical: 'middle' };

    // D: CÔNG VIỆC (Mô tả)
    const cellD = targetRow.getCell(4);
    cellD.value = slip.description;
    cellD.alignment = { horizontal: 'left', vertical: 'middle' };

    // E: SỐ LƯỢNG KG (số nguyên)
    const cellE = targetRow.getCell(5);
    cellE.value = Math.round(slip.weightNetKg);
    cellE.numFmt = '#,##0';
    cellE.alignment = { horizontal: 'right', vertical: 'middle' };

    // F: SỐ LƯỢNG TẤN (số thực 1 chữ số thập phân, không phải công thức)
    const cellF = targetRow.getCell(6);
    cellF.value = slip.tons;
    cellF.numFmt = '#,##0.0';
    cellF.alignment = { horizontal: 'right', vertical: 'middle' };

    // Q: ĐƠN GIÁ XUẤT TRẤU (cột 17)
    const cellQ = targetRow.getCell(17);
    cellQ.value = settings.unitPrice || 11000;
    cellQ.numFmt = '#,##0';
    cellQ.alignment = { horizontal: 'right', vertical: 'middle' };

    // R: THÀNH TIỀN XUẤT TRẤU (cột 18, công thức =Q{r}*F{r})
    const cellR = targetRow.getCell(18);
    cellR.value = {
      formula: `Q${targetRowNumber}*F${targetRowNumber}`,
      result: slip.amount,
    };
    cellR.numFmt = '#,##0';
    cellR.alignment = { horizontal: 'right', vertical: 'middle' };

    // S: TỔNG CỘNG (cột 19, nếu dòng mẫu có công thức thì để tương tự)
    const sampleCellS = sampleRow.getCell(19);
    if (sampleCellS && sampleCellS.formula) {
      // Thay số dòng trong công thức dòng mẫu sang dòng hiện tại
      const newFormula = sampleCellS.formula.replace(new RegExp(`${sampleFormattingRowNumber}`, 'g'), `${targetRowNumber}`);
      targetRow.getCell(19).value = {
        formula: newFormula,
        result: slip.amount,
      };
    } else {
      targetRow.getCell(19).value = {
        formula: `R${targetRowNumber}`,
        result: slip.amount,
      };
    }
    targetRow.getCell(19).numFmt = '#,##0';

    targetRow.commit();
  });

  // 4. Mở rộng AutoFilter nếu có
  if (worksheet.autoFilter) {
    const finalRowNumber = Math.max(neededRowsEnd, 50);
    worksheet.autoFilter = `A7:S${finalRowNumber}`;
  }

  // 5. Đặt fullCalcOnLoad để Excel tự tính lại mọi công thức khi mở
  workbook.calcProperties.fullCalcOnLoad = true;

  const updatedBuffer = (await workbook.xlsx.writeBuffer()) as unknown as Buffer;

  return {
    updatedBuffer: Buffer.from(updatedBuffer),
    insertedCount: slipsToWrite.length,
    startStt: maxStt + 1,
    endStt: currentStt,
    totalKg,
    totalTons,
    totalAmount,
  };
}
