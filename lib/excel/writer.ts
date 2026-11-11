import ExcelJS from 'exceljs';
import { ScannedSlipItem, HuskSettings, DEFAULT_HUSK_SETTINGS } from '../husk/types';
import { formatExcelCellDateToDDMMYYYY } from './readExisting';

export interface WriteHuskResult {
  updatedBuffer: Buffer;
  insertedCount: number;
  startStt: number;
  endStt: number;
  totalKg: number;
  totalTons: number;
  totalAmount: number;
}

interface SnapshotCell {
  kind: 'value' | 'formula';
  value?: ExcelJS.CellValue;
  formula?: string;
  result?: unknown;
  style: Partial<ExcelJS.Style>;
}

interface SnapshotRow {
  oldRowNumber: number;
  stt: number;
  height?: number;
  dateKey: number;
  dateVal: ExcelJS.CellValue;
  team: string;
  description: string;
  hasHuskHint: boolean;
  cells: Map<number, SnapshotCell>;
}

type MergedEntry =
  | { type: 'existing'; snapshot: SnapshotRow }
  | { type: 'new'; slip: ScannedSlipItem; dateKey: number };

/**
 * Phân tích ngày "DD/MM/YYYY" (hoặc "D/M/YYYY") sang Date UTC 00:00 (tránh lệch ngày theo múi giờ server).
 */
function parseDateStringToDate(dateStr: string): Date {
  const parts = (dateStr || '').trim().split(/[/-]/).map(Number);
  if (parts.length === 3 && parts[0] > 0 && parts[1] > 0 && parts[2] > 1900) {
    return new Date(Date.UTC(parts[2], parts[1] - 1, parts[0], 0, 0, 0));
  }
  const now = new Date();
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0));
}

/**
 * Chuyển giá trị ngày ô Excel hoặc chuỗi "DD/MM/YYYY" thành khóa số YYYYMMDD để so sánh thứ tự ngày.
 */
function toDateSortKey(raw: unknown): number {
  if (raw instanceof Date && !isNaN(raw.getTime())) {
    return raw.getUTCFullYear() * 10000 + (raw.getUTCMonth() + 1) * 100 + raw.getUTCDate();
  }
  const ddmm = typeof raw === 'string' ? raw : formatExcelCellDateToDDMMYYYY(raw);
  const parts = (ddmm || '').trim().split(/[/-]/).map(Number);
  if (parts.length === 3 && parts[0] > 0 && parts[1] > 0 && parts[2] > 1900) {
    return parts[2] * 10000 + parts[1] * 100 + parts[0];
  }
  return Number.MAX_SAFE_INTEGER;
}

function cloneStyle(style?: Partial<ExcelJS.Style>): Partial<ExcelJS.Style> {
  if (!style) return {};
  return JSON.parse(JSON.stringify(style)) as Partial<ExcelJS.Style>;
}

function cloneCellValue(val: ExcelJS.CellValue): ExcelJS.CellValue {
  if (val instanceof Date) return new Date(val.getTime());
  if (val && typeof val === 'object') {
    return JSON.parse(JSON.stringify(val)) as ExcelJS.CellValue;
  }
  return val;
}

/**
 * Cập nhật số dòng trong công thức cùng dòng khi dòng dữ liệu dịch từ oldRow sang newRow.
 * Không đụng vào tham chiếu cố định có `$` hoặc tham chiếu sang sheet/workbook khác (có `!`).
 */
function shiftFormulaRowRefs(formula: string, oldRow: number, newRow: number): string {
  if (!formula || oldRow === newRow) return formula;
  const regex = new RegExp(`(?<![A-Z0-9_$!])([A-Z]{1,3})${oldRow}(?![0-9])`, 'g');
  return formula.replace(regex, `$1${newRow}`);
}

function parseRangeString(range: string): {
  sCol: string;
  sRow: number;
  eCol: string;
  eRow: number;
} | null {
  const m = range.match(/^([A-Z]+)(\d+):([A-Z]+)(\d+)$/i);
  if (!m) return null;
  return {
    sCol: m[1].toUpperCase(),
    sRow: parseInt(m[2], 10),
    eCol: m[3].toUpperCase(),
    eRow: parseInt(m[4], 10),
  };
}

/**
 * Ghi các dòng xuất trấu vào file Excel lương:
 * - Chèn phiếu trấu theo ĐÚNG THỨ TỰ NGÀY (từ 1 đến 30/31) xen kẽ vào dữ liệu có sẵn
 * - Nếu trùng ngày với dữ liệu có sẵn: chèn phiếu trấu TRƯỚC dòng đầu tiên của ngày đó
 * - Đánh lại STT liên tục từ 1..N ở cột A
 * - Tách sharedFormula của các dòng sẵn có thành công thức từng dòng và cập nhật đúng số dòng mới
 * - Giữ nguyên công thức liên kết ngoài (như J8 = [1]QUÝ!$L$9)
 * - Tự động dời phần chữ ký và các ô gộp (merge) xuống dưới
 * - Cập nhật dải SUBTOTAL và AutoFilter, đặt fullCalcOnLoad = true
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

  const dataStartRow = 8;
  const maxCol = Math.max(19, worksheet.columnCount || 19);

  // 1. Quét toàn bộ sheet để tìm vùng dữ liệu hiện có (từ dòng 8 trở đi) & vị trí chữ ký
  let lastDataRowNumber = 7;
  let signatureStartRowNumber = Number.MAX_SAFE_INTEGER;
  const existingRowNumbers: number[] = [];

  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber < dataStartRow) return;

    const textRow = row.values ? String(row.values) : '';
    if (textRow.includes('Người lập bảng') || textRow.includes('Xác nhận')) {
      if (rowNumber < signatureStartRowNumber) {
        signatureStartRowNumber = rowNumber;
      }
      return;
    }

    const cellA = row.getCell(1).value;
    const sttNum = typeof cellA === 'number' ? cellA : parseInt(String(cellA || ''), 10);
    if (!isNaN(sttNum) && sttNum > 0) {
      existingRowNumbers.push(rowNumber);
      lastDataRowNumber = Math.max(lastDataRowNumber, rowNumber);
    }
  });

  const hasSignature = signatureStartRowNumber !== Number.MAX_SAFE_INTEGER;
  if (!hasSignature) {
    signatureStartRowNumber = Math.max(lastDataRowNumber + 2, 53);
  }

  // 2. Snapshot toàn bộ dòng dữ liệu có sẵn TRƯỚC khi sửa worksheet (để ExcelJS giải mã chuẩn sharedFormula)
  const existingSnapshots: SnapshotRow[] = [];
  const teamCounts = new Map<string, number>();

  for (const r of existingRowNumbers) {
    const row = worksheet.getRow(r);
    const cells = new Map<number, SnapshotCell>();

    for (let c = 1; c <= maxCol; c++) {
      const cell = row.getCell(c);
      const style = cloneStyle(cell.style);
      const resolvedFormula = cell.formula;

      if (resolvedFormula) {
        cells.set(c, {
          kind: 'formula',
          formula: resolvedFormula,
          result: cell.result,
          style,
        });
      } else {
        cells.set(c, {
          kind: 'value',
          value: cloneCellValue(cell.value),
          style,
        });
      }
    }

    const dateVal = cloneCellValue(row.getCell(2).value);
    const dateKey = toDateSortKey(dateVal);
    const team = String(row.getCell(3).value || '').trim();
    const description = String(row.getCell(4).value || '').trim();
    const qVal = row.getCell(17).value;
    const hasHuskHint =
      description.toLowerCase().includes('trấu') ||
      (typeof qVal === 'number' && qVal > 0);

    if (team) {
      teamCounts.set(team, (teamCounts.get(team) || 0) + 1);
    }

    const cellAVal = row.getCell(1).value;
    const sttVal = typeof cellAVal === 'number' ? cellAVal : parseInt(String(cellAVal || ''), 10);

    existingSnapshots.push({
      oldRowNumber: r,
      stt: !isNaN(sttVal) && sttVal > 0 ? sttVal : existingSnapshots.length + 1,
      height: row.height,
      dateKey,
      dateVal,
      team,
      description,
      hasHuskHint,
      cells,
    });
  }

  // Xác định tên đội dùng ghi cột C (ưu tiên settings.defaultTeam nếu được truyền, dự phòng nhận diện từ file)
  let detectedTeam = '';
  let maxTeamCount = 0;
  teamCounts.forEach((count, t) => {
    if (count > maxTeamCount) {
      maxTeamCount = count;
      detectedTeam = t;
    }
  });
  const effectiveTeam = (settings.defaultTeam || '').trim() || detectedTeam || 'ĐỨC';

  // Chọn dòng mẫu cho style dòng trấu mới (ưu tiên dòng trấu có sẵn trong sheet)
  const huskTemplateSnapshot =
    existingSnapshots.find((s) => s.hasHuskHint) ||
    existingSnapshots[existingSnapshots.length - 1];

  const fallbackSampleStyles = new Map<number, Partial<ExcelJS.Style>>();
  for (let c = 1; c <= 19; c++) {
    const snapStyle = huskTemplateSnapshot?.cells.get(c)?.style;
    fallbackSampleStyles.set(
      c,
      snapStyle ? cloneStyle(snapStyle) : { font: { name: 'Times New Roman', size: 12 } }
    );
  }

  // Kiểm tra công thức cột S mẫu (file mẫu dùng tổng J+L+N+P+R hay chỉ R)
  const templateSFormula = huskTemplateSnapshot?.cells.get(19)?.formula || '';
  const useMultiColSumS =
    templateSFormula.includes('J') &&
    templateSFormula.includes('L') &&
    templateSFormula.includes('R');

  // 3. Sắp xếp phiếu trấu mới tăng dần theo ngày & chèn TRƯỚC dòng cùng ngày đã có
  const sortedNewSlips = slipsToWrite
    .map((slip, idx) => ({ slip, idx, dateKey: toDateSortKey(slip.date) }))
    .sort((a, b) => (a.dateKey !== b.dateKey ? a.dateKey - b.dateKey : a.idx - b.idx));

  const mergedList: MergedEntry[] = existingSnapshots.map((snapshot) => ({
    type: 'existing',
    snapshot,
  }));

  for (const item of sortedNewSlips) {
    const insertIdx = mergedList.findIndex(
      (entry) => entry.type === 'existing' && entry.snapshot.dateKey >= item.dateKey
    );
    const newEntry: MergedEntry = {
      type: 'new',
      slip: item.slip,
      dateKey: item.dateKey,
    };
    if (insertIdx === -1) {
      mergedList.push(newEntry);
    } else {
      mergedList.splice(insertIdx, 0, newEntry);
    }
  }

  const newLastDataRow =
    mergedList.length > 0 ? dataStartRow + mergedList.length - 1 : dataStartRow - 1;

  // 4. Dời phần chữ ký & cập nhật lại các ô merge của chữ ký nếu bảng dữ liệu mở rộng chạm tới
  if (hasSignature && mergedList.length > 0) {
    const originalSpacer =
      existingSnapshots.length > 0
        ? Math.max(1, signatureStartRowNumber - lastDataRowNumber - 1)
        : 2;
    const desiredSigStart = newLastDataRow + originalSpacer + 1;
    const shiftCount = desiredSigStart - signatureStartRowNumber;

    if (shiftCount > 0) {
      const existingMerges = [...(worksheet.model.merges || [])];
      const sigMergesToShift: Array<{
        range: string;
        sCol: string;
        sRow: number;
        eCol: string;
        eRow: number;
      }> = [];

      for (const mRange of existingMerges) {
        const parsed = parseRangeString(mRange);
        if (parsed && parsed.sRow >= signatureStartRowNumber) {
          sigMergesToShift.push({ range: mRange, ...parsed });
        }
      }

      for (const m of sigMergesToShift) {
        worksheet.unMergeCells(m.range);
      }

      worksheet.spliceRows(signatureStartRowNumber, 0, ...new Array(shiftCount).fill([]));

      for (const m of sigMergesToShift) {
        worksheet.mergeCells(
          `${m.sCol}${m.sRow + shiftCount}:${m.eCol}${m.eRow + shiftCount}`
        );
      }
    }
  }

  // 5. Xóa sạch giá trị/sharedFormula cũ trên vùng data mới trước khi ghi lại toàn bộ
  const clearEndRow = Math.max(lastDataRowNumber, newLastDataRow);
  for (let r = dataStartRow; r <= clearEndRow; r++) {
    const row = worksheet.getRow(r);
    for (let c = 1; c <= maxCol; c++) {
      row.getCell(c).value = null;
    }
  }

  // 6. Ghi toàn bộ bảng theo thứ tự ngày mới & đánh lại STT liên tục từ STT đầu tiên của bảng (thường là 1)
  const baseStartStt = existingSnapshots.length > 0 ? existingSnapshots[0].stt : 1;
  let minInsertedStt = Number.MAX_SAFE_INTEGER;
  let maxInsertedStt = 0;
  let totalKg = 0;
  let totalTons = 0;
  let totalAmount = 0;
  const unitPrice = settings.unitPrice || 11000;

  mergedList.forEach((entry, idx) => {
    const targetRowNumber = dataStartRow + idx;
    const newStt = baseStartStt + idx;
    const targetRow = worksheet.getRow(targetRowNumber);

    if (entry.type === 'existing') {
      const snap = entry.snapshot;
      if (snap.height) {
        targetRow.height = snap.height;
      }

      for (let c = 1; c <= maxCol; c++) {
        const cellSnap = snap.cells.get(c);
        const targetCell = targetRow.getCell(c);
        if (!cellSnap) continue;

        targetCell.style = cloneStyle(cellSnap.style);

        if (c === 1) {
          targetCell.value = newStt;
        } else if (cellSnap.kind === 'formula' && cellSnap.formula) {
          const shiftedFormula = shiftFormulaRowRefs(
            cellSnap.formula,
            snap.oldRowNumber,
            targetRowNumber
          );
          targetCell.value = {
            formula: shiftedFormula,
            ...(cellSnap.result !== undefined ? { result: cellSnap.result as number | string } : {}),
          };
        } else {
          targetCell.value = cloneCellValue(cellSnap.value ?? null);
        }
      }

      targetRow.commit();
      return;
    }

    // Dòng trấu mới chèn
    const slip = entry.slip;
    minInsertedStt = Math.min(minInsertedStt, newStt);
    maxInsertedStt = Math.max(maxInsertedStt, newStt);

    totalKg += slip.weightNetKg;
    totalTons += slip.tons;
    totalAmount += slip.amount;

    if (huskTemplateSnapshot?.height) {
      targetRow.height = huskTemplateSnapshot.height;
    }

    for (let c = 1; c <= 19; c++) {
      const targetCell = targetRow.getCell(c);
      const baseStyle = fallbackSampleStyles.get(c);
      if (baseStyle) {
        targetCell.style = cloneStyle(baseStyle);
        if (!targetCell.font || !targetCell.font.name) {
          targetCell.font = { name: 'Times New Roman', size: 12 };
        }
      }
    }

    // A: STT
    const cellA = targetRow.getCell(1);
    cellA.value = newStt;
    cellA.alignment = { horizontal: 'center', vertical: 'middle' };

    // B: NGÀY NHẬP/XUẤT (dd/mm/yyyy)
    const cellB = targetRow.getCell(2);
    cellB.value = parseDateStringToDate(slip.date);
    cellB.numFmt = 'dd/mm/yyyy';
    cellB.alignment = { horizontal: 'center', vertical: 'middle' };

    // C: ĐỘI
    const cellC = targetRow.getCell(3);
    cellC.value = effectiveTeam;
    cellC.alignment = { horizontal: 'center', vertical: 'middle' };

    // D: CÔNG VIỆC
    const cellD = targetRow.getCell(4);
    cellD.value = slip.description;
    cellD.alignment = { horizontal: 'left', vertical: 'middle' };

    // E: SỐ LƯỢNG KG
    const cellE = targetRow.getCell(5);
    cellE.value = Math.round(slip.weightNetKg);
    cellE.numFmt = '#,##0';
    cellE.alignment = { horizontal: 'right', vertical: 'middle' };

    // F: SỐ LƯỢNG TẤN
    const cellF = targetRow.getCell(6);
    cellF.value = slip.tons;
    cellF.numFmt = '#,##0.0';
    cellF.alignment = { horizontal: 'right', vertical: 'middle' };

    // G..P: xóa giá trị công việc khác (giữ nguyên viền/font)
    for (let c = 7; c <= 16; c++) {
      targetRow.getCell(c).value = null;
    }

    // Q: ĐƠN GIÁ XUẤT TRẤU
    const cellQ = targetRow.getCell(17);
    cellQ.value = unitPrice;
    cellQ.numFmt = '#,##0';
    cellQ.alignment = { horizontal: 'right', vertical: 'middle' };

    // R: THÀNH TIỀN XUẤT TRẤU (=Q{r}*F{r})
    const cellR = targetRow.getCell(18);
    cellR.value = {
      formula: `Q${targetRowNumber}*F${targetRowNumber}`,
      result: slip.amount,
    };
    cellR.numFmt = '#,##0';
    cellR.alignment = { horizontal: 'right', vertical: 'middle' };

    // S: TỔNG CỘNG
    const cellS = targetRow.getCell(19);
    cellS.value = {
      formula: useMultiColSumS
        ? `J${targetRowNumber}+L${targetRowNumber}+N${targetRowNumber}+P${targetRowNumber}+R${targetRowNumber}`
        : `R${targetRowNumber}`,
      result: slip.amount,
    };
    cellS.numFmt = '#,##0';

    targetRow.commit();
  });

  // 7. Nới dải SUBTOTAL ở hàng tổng trên đầu (hàng 1..7) nếu dòng cuối mới vượt quá dải cũ
  for (let r = 1; r < dataStartRow; r++) {
    const headerRow = worksheet.getRow(r);
    for (let c = 1; c <= maxCol; c++) {
      const cell = headerRow.getCell(c);
      const f = cell.formula;
      if (f && /SUBTOTAL\s*\(/i.test(f)) {
        const updatedF = f.replace(
          /(\b[A-Z]{1,3})(\d+):([A-Z]{1,3})(\d+)\b/gi,
          (match, c1: string, r1Str: string, c2: string, r2Str: string) => {
            const r2 = parseInt(r2Str, 10);
            if (r2 < newLastDataRow) {
              return `${c1}${r1Str}:${c2}${newLastDataRow}`;
            }
            return match;
          }
        );
        if (updatedF !== f) {
          cell.value = {
            formula: updatedF,
            ...(cell.result !== undefined ? { result: cell.result as number | string } : {}),
          };
        }
      }
    }
  }

  // 8. Mở rộng AutoFilter nếu có
  if (worksheet.autoFilter) {
    const finalRowNumber = Math.max(newLastDataRow, 50);
    worksheet.autoFilter = `A7:S${finalRowNumber}`;
  }

  // 9. Đặt fullCalcOnLoad để Excel tự tính lại mọi công thức khi mở
  workbook.calcProperties.fullCalcOnLoad = true;

  const updatedBuffer = (await workbook.xlsx.writeBuffer()) as unknown as Buffer;

  return {
    updatedBuffer: Buffer.from(updatedBuffer),
    insertedCount: slipsToWrite.length,
    startStt: slipsToWrite.length > 0 ? minInsertedStt : 0,
    endStt: slipsToWrite.length > 0 ? maxInsertedStt : 0,
    totalKg,
    totalTons,
    totalAmount,
  };
}
