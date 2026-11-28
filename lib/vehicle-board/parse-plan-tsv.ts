import { DailyPlanRow } from './types';

/**
 * Parse chuỗi TSV (copy từ Excel / Google Sheets) có hỗ trợ ô chứa xuống dòng trong dấu ngoặc kép "..."
 */
export function parseTsvMatrix(rawText: string): string[][] {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentCell = '';
  let inQuotes = false;

  const text = rawText.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        currentCell += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        currentCell += ch;
      }
      continue;
    }

    if (ch === '"' && currentCell === '') {
      inQuotes = true;
    } else if (ch === '\t') {
      currentRow.push(currentCell);
      currentCell = '';
    } else if (ch === '\n') {
      currentRow.push(currentCell);
      rows.push(currentRow);
      currentRow = [];
      currentCell = '';
    } else {
      currentCell += ch;
    }
  }

  if (currentCell.length > 0 || currentRow.length > 0) {
    currentRow.push(currentCell);
    rows.push(currentRow);
  }

  return rows;
}

function parseVnNumber(raw: string | undefined): number {
  if (!raw) return 0;
  const cleaned = raw.trim();
  if (!cleaned || cleaned === '-') return 0;
  // Loại bỏ dấu chấm ngăn cách hàng nghìn và khoảng trắng (vd: "220.000" -> "220000")
  const digits = cleaned.replace(/[.\s]/g, '').replace(/,/g, '');
  const n = Number(digits);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

function cleanCellText(raw: string | undefined): string {
  if (!raw) return '';
  return raw.replace(/\s*\n\s*/g, ' ').replace(/\s+/g, ' ').trim();
}

export function parseDailyPlanFromExcelPaste(rawText: string, dateKey: string): DailyPlanRow[] {
  const matrix = parseTsvMatrix(rawText);
  const result: DailyPlanRow[] = [];

  matrix.forEach((cols, idx) => {
    const joined = cols.map((c) => c.trim()).join('');
    if (!joined) return;

    const firstCol = cleanCellText(cols[0]).toUpperCase();
    const secondCol = cleanCellText(cols[1]).toUpperCase();

    // Bỏ qua dòng header và dòng TỔNG CỘNG
    if (firstCol === 'STT' || secondCol === 'KCS') return;
    if (firstCol.startsWith('TỔNG') || firstCol.startsWith('TONG')) return;

    // Nếu cột 0 là số STT -> theo đúng thứ tự: STT(0), KCS(1), NCC(2), SỐ HĐ(3), LOẠI LÚA(4), SL(5), GIÁ(6), THÀNH TIỀN(7), ĐỊA ĐIỂM(8), GHI CHÚ(9)
    // Nếu người dùng copy thiếu cột STT (bắt đầu từ KCS) -> dịch sang 1 cột
    const hasStt = /^\d+$/.test(firstCol);
    const offset = hasStt ? 0 : -1;

    const kcs = cleanCellText(cols[1 + offset]);
    const supplier = cleanCellText(cols[2 + offset]);
    const contractNo = cleanCellText(cols[3 + offset]);
    const riceType = cleanCellText(cols[4 + offset]);
    const quantityKg = parseVnNumber(cols[5 + offset]);
    const pricePerKg = parseVnNumber(cols[6 + offset]);
    const location = cleanCellText(cols[8 + offset]);
    const note = cleanCellText(cols[9 + offset]);

    if (!kcs && !supplier && !riceType && quantityKg === 0 && !note) return;

    result.push({
      id: `plan-${dateKey}-paste-${idx + 1}`,
      kcs,
      supplier,
      contractNo,
      riceType,
      quantityKg,
      pricePerKg,
      location,
      note,
      vehicleIds: [],
      receiveNote: '',
    });
  });

  return result;
}
