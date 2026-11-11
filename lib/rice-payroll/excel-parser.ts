import * as XLSX from 'xlsx';
import { RiceBatch } from './types';
import { roundRiceTons } from './rounding';

/**
 * Chuẩn hóa giá trị ngày từ ô Excel (có thể là số serial, Date, hoặc string)
 */
export function formatExcelDate(raw: unknown): string {
  if (raw === null || raw === undefined || raw === '') return '';

  if (typeof raw === 'number') {
    try {
      return XLSX.SSF.format('dd/mm/yyyy', raw);
    } catch {
      return String(raw);
    }
  }

  if (raw instanceof Date) {
    const d = String(raw.getDate()).padStart(2, '0');
    const m = String(raw.getMonth() + 1).padStart(2, '0');
    const y = raw.getFullYear();
    return `${d}/${m}/${y}`;
  }

  const str = String(raw).trim();
  if (/^\d{5}(\.\d+)?$/.test(str)) {
    try {
      return XLSX.SSF.format('dd/mm/yyyy', Number(str));
    } catch {
      return str;
    }
  }

  // Nếu định dạng YYYY-MM-DD hoặc YYYY/MM/DD -> chuyển về DD/MM/YYYY
  const isoMatch = str.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (isoMatch) {
    const [, y, m, d] = isoMatch;
    return `${d.padStart(2, '0')}/${m.padStart(2, '0')}/${y}`;
  }

  // Nếu định dạng D/M/YYYY hoặc D-M-YYYY -> chuẩn hóa về DD/MM/YYYY
  const dmyMatch = str.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
  if (dmyMatch) {
    const [, d, m, y] = dmyMatch;
    return `${d.padStart(2, '0')}/${m.padStart(2, '0')}/${y}`;
  }

  return str;
}

/**
 * Tìm chỉ mục các cột quan trọng từ hàng tiêu đề
 */
function findColumnIndexes(headerRow: unknown[]) {
  const norm = (val: unknown) =>
    String(val ?? '')
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim();

  let colWeighDate = 1;      // Cột B: NGÀY CÂN
  let colPurchaser = 2;      // Cột C: NHÂN VIÊN THU MUA
  let colCustomer = 3;       // Cột D: KHÁCH HÀNG
  let colVehicle = 4;        // Cột E: PHƯƠNG TIỆN
  let colRiceType = 5;       // Cột F: LOẠI LÚA
  let colBatchCode = 6;      // Cột G: MÃ LÔ
  let colFreshWeight = 7;    // Cột H: SỐ LƯỢNG (KG)
  let colFreshBoVehicle = 18;// Cột S: PHƯƠNG TIỆN TĂNG BO LÚA TƯƠI
  let colDryDate = 24;       // Cột Y: NGÀY NHẬP SẤY
  let colDryFacility = 25;   // Cột Z: CƠ SỞ SẤY
  let colDryWeight = 27;     // Cột AB: CÂN NHẬP SẤY (KG)
  let colDischargeDate = 30; // Cột AE: NGÀY XUỐNG LÚA KHÔ
  let colDryVehicle = 32;    // Cột AG: PHƯƠNG TIỆN CHỞ LÚA KHÔ

  headerRow.forEach((cell, idx) => {
    const text = norm(cell);
    if (text.includes('ngày') && text.includes('cân')) colWeighDate = idx;
    if (text.includes('nhân viên') && text.includes('thu mua')) colPurchaser = idx;
    if (text.includes('khách hàng')) colCustomer = idx;
    if (text === 'phương tiện') colVehicle = idx;
    if (text.includes('loại lúa')) colRiceType = idx;
    if (text.includes('mã lô')) colBatchCode = idx;
    if (text.includes('số lượng') && text.includes('kg')) colFreshWeight = idx;
    if (text.includes('tăng bo') && text.includes('lúa tươi')) colFreshBoVehicle = idx;
    if (text.includes('ngày') && text.includes('nhập sấy')) colDryDate = idx;
    if (text.includes('cơ sở sấy') || text.includes('địa điểm sấy')) colDryFacility = idx;
    if (text.includes('cân nhập sấy')) colDryWeight = idx;
    // Cột AE: NGÀY XUỐNG LÚA KHÔ (NHẬN XUẤT TRẢ) - Trường quan trọng nhất của Chú 6 Thanh
    if (text.includes('xuống lúa khô') || (text.includes('ngày') && text.includes('xuống lúa'))) {
      colDischargeDate = idx;
    }
    if (text.includes('chở lúa khô') || text.includes('tăng bo sau sấy')) colDryVehicle = idx;
  });

  return {
    colWeighDate,
    colPurchaser,
    colCustomer,
    colVehicle,
    colRiceType,
    colBatchCode,
    colFreshWeight,
    colFreshBoVehicle,
    colDryDate,
    colDryFacility,
    colDryWeight,
    colDischargeDate,
    colDryVehicle,
  };
}

/**
 * Đọc File / Buffer Excel Master và trích xuất danh sách các mẻ sấy an toàn
 */
export function parseRiceMasterExcel(
  fileData: ArrayBuffer | Uint8Array | Buffer,
  options?: { sheetRows?: number }
): {
  batches: RiceBatch[];
  totalRows: number;
  dates: string[];
  facilities: string[];
} {
  const wb = XLSX.read(fileData, {
    type: 'buffer',
    dense: true,
    cellFormula: false,
    cellHTML: false,
    cellText: false,
    sheetRows: options?.sheetRows,
  });
  const sheetName =
    wb.SheetNames.find((s) => s.toUpperCase().includes('LUA')) || wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];

  if (!ws) {
    throw new Error(`Không tìm thấy sheet dữ liệu lúa trong file Excel.`);
  }

  const rawRows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1 });
  if (rawRows.length < 3) {
    throw new Error('File Excel không đủ dữ liệu (ít hơn 3 dòng).');
  }

  // Hàng 2 là hàng tiêu đề (index = 2)
  const headerRow = rawRows[2] || [];
  const cols = findColumnIndexes(headerRow);

  const batches: RiceBatch[] = [];
  const dateSet = new Set<string>();
  const facilitySet = new Set<string>();

  for (let r = 3; r < rawRows.length; r++) {
    const row = rawRows[r];
    if (!row || row.length === 0) continue;

    // Lấy cân nhập sấy (kg)
    const dryWeightRaw = Number(row[cols.colDryWeight]);
    if (!dryWeightRaw || isNaN(dryWeightRaw) || dryWeightRaw <= 0) {
      continue;
    }

    const batchCode = String(row[cols.colBatchCode] ?? '').trim() || `LÔ-${r + 1}`;
    const customerName = String(row[cols.colCustomer] ?? '').trim();
    const vehicleName = String(row[cols.colVehicle] ?? '').trim();
    const riceType = String(row[cols.colRiceType] ?? '').trim();
    const dryFacility = String(row[cols.colDryFacility] ?? '').trim() || 'Cơ sở 1';
    const dryDate = formatExcelDate(row[cols.colDryDate]);
    const dischargeDate = formatExcelDate(row[cols.colDischargeDate]);
    const dryVehicle = String(row[cols.colDryVehicle] ?? '').trim();

    // Áp dụng quy tắc làm tròn chuẩn: >= 0.333 tấn làm tròn lên
    const roundedTons = roundRiceTons(dryWeightRaw);

    const weighDate = formatExcelDate(row[cols.colWeighDate]);
    const purchaser = String(row[cols.colPurchaser] ?? '').trim();
    const freshWeightRaw = Number(row[cols.colFreshWeight]);
    const freshWeightKg = !isNaN(freshWeightRaw) && freshWeightRaw > 0 ? freshWeightRaw : undefined;
    const freshBoVehicle = String(row[cols.colFreshBoVehicle] ?? '').trim() || undefined;

    const batch: RiceBatch = {
      id: `batch-${r}-${batchCode}`,
      batchCode,
      customerName,
      vehicleName,
      riceType,
      dryFacility,
      dryDate,
      dischargeDate,
      dryVehicle,
      dryWeightKg: dryWeightRaw,
      roundedTons,
      weighDate,
      purchaser,
      freshWeightKg,
      freshBoVehicle,
    };

    batches.push(batch);

    if (dischargeDate) dateSet.add(dischargeDate);
    if (dryDate) dateSet.add(dryDate);
    if (dryFacility) facilitySet.add(dryFacility);
  }

  const sortedDates = Array.from(dateSet).sort((a, b) => {
    const [d1, m1, y1] = a.split('/').map(Number);
    const [d2, m2, y2] = b.split('/').map(Number);
    return new Date(y1, m1 - 1, d1).getTime() - new Date(y2, m2 - 1, d2).getTime();
  });

  return {
    batches,
    totalRows: batches.length,
    dates: sortedDates,
    facilities: Array.from(facilitySet).sort(),
  };
}
