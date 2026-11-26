import * as XLSX from 'xlsx';
import { formatExcelDate } from './unground-report-parser';

export interface DailyIntakeKhoRow {
  id: string;
  hd: string;
  ngayCan: string;
  loaiLua: string;
  slKg: number;
  phuongTien: string;
  isPendingVehicle: boolean; // PT CHƯA VỀ, CHỜ TT
}

export interface DailyIntakeTuoiRow {
  id: string;
  hd: string;
  ngayCan: string;
  loaiLua: string;
  slKg: number;
  diaDiemSay: string;
}

export interface DailyIntakeBreakdownItem {
  key: string;
  label: string;
  kg: number;
}

export interface DailyIntakePendingVehicle {
  ngayCan: string;
  phuongTien: string;
  loaiLua: string;
  slKg: number;
}

export interface DailyIntakeReportResult {
  reportDate: string;
  totalKg: number;
  contractKg: number;
  outsideContractKg: number;
  tuoiTotalKg: number;
  tuoiByType: DailyIntakeBreakdownItem[];
  tuoiByFacility: DailyIntakeBreakdownItem[];
  khoTotalKg: number;
  khoByType: DailyIntakeBreakdownItem[];
  pendingVehicles: {
    count: number;
    minDate: string;
    maxDate: string;
    vehicles: DailyIntakePendingVehicle[];
  };
  zaloText: string;
}

function safeClampWorksheet(ws: XLSX.WorkSheet, maxRows = 20000, maxCols = 50): void {
  if (!ws || !ws['!ref']) return;
  try {
    const range = XLSX.utils.decode_range(ws['!ref']);
    if (range.e.r > maxRows) range.e.r = maxRows;
    if (range.e.c > maxCols) range.e.c = maxCols;
    ws['!ref'] = XLSX.utils.encode_range(range);
  } catch (e) {
    console.warn('safeClampWorksheet error:', e);
  }
}

export function formatKgVN(num: number): string {
  return new Intl.NumberFormat('vi-VN').format(Math.round(num));
}

/**
 * Lấy ngày hôm qua (lùi 1 ngày) theo múi giờ Việt Nam (DD/MM/YYYY)
 */
export function getYesterdayDateStr(baseDate: Date = new Date()): string {
  // Chuyển sang giờ VN (UTC+7)
  const vnNow = new Date(baseDate.getTime() + 7 * 60 * 60 * 1000);
  vnNow.setUTCDate(vnNow.getUTCDate() - 1);
  const d = String(vnNow.getUTCDate()).padStart(2, '0');
  const m = String(vnNow.getUTCMonth() + 1).padStart(2, '0');
  const y = vnNow.getUTCFullYear();
  return `${d}/${m}/${y}`;
}

/**
 * Chuẩn hóa số hợp đồng: '00', '0', '' -> ngoài hợp đồng; còn lại -> theo hợp đồng
 */
export function isOutsideContract(hdRaw: string): boolean {
  const clean = String(hdRaw || '')
    .trim()
    .replace(/^'+/, '');
  return clean === '' || clean === '0' || clean === '00';
}

function parseDateValue(dStr: string): number {
  const m = dStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return 0;
  return Date.UTC(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
}

function normalizePendingStatus(cells: unknown[]): boolean {
  const joined = cells
    .map((c) => String(c || '').toUpperCase().replace(/\s+/g, ' ').trim())
    .join(' | ');
  return joined.includes('PT CHƯA VỀ') || (joined.includes('CHƯA VỀ') && joined.includes('CHỜ TT'));
}

function formatTuoiRiceLabel(rawType: string): string {
  const clean = rawType.trim();
  const upper = clean.toUpperCase();
  if (!upper) return 'Lúa tươi khác';
  if (upper.includes('TL6T') && (upper.includes('LOẠI 2') || upper.includes('LOAI 2'))) {
    return 'Lúa tươi TL6T Loại 2';
  }
  if (upper.includes('TL6T')) {
    return `Lúa tươi ${upper}`;
  }
  if (upper.startsWith('LÚA TƯƠI')) {
    return clean;
  }
  const withoutLua = clean.replace(/^lúa\s+/i, '').trim();
  return `Lúa tươi ${withoutLua}`;
}

function formatKhoRiceLabel(rawType: string): string {
  const clean = rawType.trim();
  const upper = clean.toUpperCase();
  if (!upper) return 'Lúa khô khác';
  if (upper === 'NẾP' || upper === 'NEP') return 'Lúa Nếp Khô';
  if (upper.startsWith('LÚA KHÔ')) return clean;
  const normalized = clean
    .replace(/^lúa\s+khô\s+/i, '')
    .replace(/^lúa\s+/i, '')
    .replace(/\s+khô$/i, '')
    .trim();
  return `Lúa khô ${normalized}`;
}

function normalizeFacilityLabel(rawFacility: string): string {
  const upper = rawFacility.trim().toUpperCase().replace(/\s+/g, ' ');
  if (!upper) return 'Chưa rõ';
  if (upper === 'CƠ SỞ I' || upper === 'CƠ SỞ 1' || upper === 'CS1') return 'CS1';
  if (upper === 'CƠ SỞ II' || upper === 'CƠ SỞ 2' || upper === 'CS2') return 'CS2';
  if (upper === 'NSX TM' || upper === 'NSX') return 'NSX TM';
  if (upper === 'TOÀN VINH') return 'Toàn Vinh';
  if (upper === 'THUẬN THÀNH') return 'Thuận Thành';
  return rawFacility.trim();
}

/**
 * Đọc toàn bộ các dòng hợp lệ từ file Lúa Khô (bao gồm cả đã xay, chưa xay và PT chưa về chờ TT)
 */
export function parseDailyIntakeKhoExcel(
  fileData: ArrayBuffer | Uint8Array | Buffer
): DailyIntakeKhoRow[] {
  const wb = XLSX.read(fileData, {
    type: 'buffer',
    dense: true,
    cellFormula: false,
    cellHTML: false,
    cellText: false,
  });
  const sheetName = wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  if (!ws) return [];

  safeClampWorksheet(ws, 15000, 40);

  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1 });
  if (rows.length < 6) return [];

  let colHd = 0;
  let colWeighDate = 1;
  let colVehicle = 4;
  let colRiceType = 5;
  let colQty = 7;
  let colNhapCty = 28;
  let colNhapNsx = 29;
  let colCanCtyNsx = 30;
  let colNote = 33;

  const header = rows[5] || [];
  header.forEach((cell, idx) => {
    const txt = String(cell || '').toLowerCase().replace(/\s+/g, ' ').trim();
    if (txt === 'hđ' || txt === 'số hđ') colHd = idx;
    if (txt.includes('ngày') && txt.includes('cân')) colWeighDate = idx;
    if (txt.includes('phương tiện')) colVehicle = idx;
    if (txt.includes('loại lúa')) colRiceType = idx;
    if (txt.includes('số lượng') && txt.includes('lúa khô')) colQty = idx;
    if (txt === 'nhập cty') colNhapCty = idx;
    if (txt === 'nhập nsx tm') colNhapNsx = idx;
    if (txt.includes('cân cty')) colCanCtyNsx = idx;
    if (txt === 'ghi chú') colNote = idx;
  });

  const result: DailyIntakeKhoRow[] = [];
  let consecutiveEmpty = 0;

  for (let i = 6; i < rows.length; i++) {
    const r = rows[i];
    if (!r || r.length === 0) {
      consecutiveEmpty++;
      if (consecutiveEmpty > 50) break;
      continue;
    }

    const riceType = String(r[colRiceType] || '').trim().toUpperCase();
    const sl = parseFloat(String(r[colQty])) || 0;
    const ngayCan = formatExcelDate(r[colWeighDate]);

    if (riceType && sl > 0 && ngayCan) {
      consecutiveEmpty = 0;
      const isPendingVehicle = normalizePendingStatus([
        r[colNhapCty],
        r[colNhapNsx],
        r[colCanCtyNsx],
        r[colNote],
      ]);

      result.push({
        id: `dk-${i}`,
        hd: String(r[colHd] ?? '').trim(),
        ngayCan,
        loaiLua: riceType,
        slKg: sl,
        phuongTien: String(r[colVehicle] || '').trim(),
        isPendingVehicle,
      });
    } else {
      consecutiveEmpty++;
      if (consecutiveEmpty > 50) break;
    }
  }

  return result;
}

/**
 * Đọc toàn bộ các dòng hợp lệ từ file Lúa Tươi theo ngày cân
 */
export function parseDailyIntakeTuoiExcel(
  fileData: ArrayBuffer | Uint8Array | Buffer
): DailyIntakeTuoiRow[] {
  const wb = XLSX.read(fileData, {
    type: 'buffer',
    dense: true,
    cellFormula: false,
    cellHTML: false,
    cellText: false,
  });
  const sheetName = wb.SheetNames.find((s) => s.toUpperCase().includes('LUA')) || wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  if (!ws) return [];

  safeClampWorksheet(ws, 20000, 45);

  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1 });
  if (rows.length < 3) return [];

  let colHd = 0;
  let colWeighDate = 1;
  let colRiceType = 5;
  let colQty = 7;
  let colFacility = 25;
  let colDryWeight = 27;

  const header = rows[2] || [];
  header.forEach((cell, idx) => {
    const txt = String(cell || '').toLowerCase().replace(/\s+/g, ' ').trim();
    if (txt === 'số hđ' || txt === 'hđ') colHd = idx;
    if (txt.includes('ngày') && txt.includes('cân')) colWeighDate = idx;
    if (txt.includes('loại lúa')) colRiceType = idx;
    if (txt.includes('số lượng') && txt.includes('kg')) colQty = idx;
    if (txt.includes('địa điểm sấy') || txt.includes('cơ sở sấy')) colFacility = idx;
    if (txt.includes('cân nhập sấy')) colDryWeight = idx;
  });

  const result: DailyIntakeTuoiRow[] = [];
  let consecutiveEmpty = 0;

  for (let i = 3; i < rows.length; i++) {
    const r = rows[i];
    if (!r || r.length === 0) {
      consecutiveEmpty++;
      if (consecutiveEmpty > 50) break;
      continue;
    }

    const riceType = String(r[colRiceType] || '').trim().toUpperCase();
    const sl = parseFloat(String(r[colQty])) || parseFloat(String(r[colDryWeight])) || 0;
    const ngayCan = formatExcelDate(r[colWeighDate]);

    if (riceType && sl > 0 && ngayCan) {
      consecutiveEmpty = 0;
      result.push({
        id: `dt-${i}`,
        hd: String(r[colHd] ?? '').trim(),
        ngayCan,
        loaiLua: riceType,
        slKg: sl,
        diaDiemSay: String(r[colFacility] || '').trim(),
      });
    } else {
      consecutiveEmpty++;
      if (consecutiveEmpty > 50) break;
    }
  }

  return result;
}

const FACILITY_ORDER = ['CS1', 'CS2', 'NSX TM', 'Toàn Vinh', 'Thuận Thành'];

/**
 * Tổng hợp Báo cáo Lúa Tươi & Lúa Khô nhập trong 1 ngày cụ thể
 */
export function buildDailyIntakeReport(
  khoRows: DailyIntakeKhoRow[],
  tuoiRows: DailyIntakeTuoiRow[],
  targetDate: string
): DailyIntakeReportResult {
  const cleanDate = targetDate.trim();
  const dayKho = khoRows.filter((r) => r.ngayCan === cleanDate);
  const dayTuoi = tuoiRows.filter((r) => r.ngayCan === cleanDate);

  let contractKg = 0;
  let outsideContractKg = 0;

  for (const r of dayTuoi) {
    if (isOutsideContract(r.hd)) outsideContractKg += r.slKg;
    else contractKg += r.slKg;
  }
  for (const r of dayKho) {
    if (isOutsideContract(r.hd)) outsideContractKg += r.slKg;
    else contractKg += r.slKg;
  }

  // Lúa tươi theo loại & cơ sở sấy
  let tuoiTotalKg = 0;
  const tuoiTypeMap = new Map<string, number>();
  const tuoiFacMap = new Map<string, number>();

  for (const r of dayTuoi) {
    tuoiTotalKg += r.slKg;
    tuoiTypeMap.set(r.loaiLua, (tuoiTypeMap.get(r.loaiLua) || 0) + r.slKg);

    const facLabel = normalizeFacilityLabel(r.diaDiemSay);
    tuoiFacMap.set(facLabel, (tuoiFacMap.get(facLabel) || 0) + r.slKg);
  }

  const tuoiByType: DailyIntakeBreakdownItem[] = Array.from(tuoiTypeMap.entries()).map(
    ([key, kg]) => ({
      key,
      label: formatTuoiRiceLabel(key),
      kg,
    })
  );

  const tuoiByFacility: DailyIntakeBreakdownItem[] = Array.from(tuoiFacMap.entries())
    .sort((a, b) => {
      const ia = FACILITY_ORDER.indexOf(a[0]);
      const ib = FACILITY_ORDER.indexOf(b[0]);
      if (ia !== -1 && ib !== -1) return ia - ib;
      if (ia !== -1) return -1;
      if (ib !== -1) return 1;
      return a[0].localeCompare(b[0], 'vi');
    })
    .map(([key, kg]) => ({
      key,
      label: `Nhập sấy ${key}`,
      kg,
    }));

  // Lúa khô theo loại
  let khoTotalKg = 0;
  const khoTypeMap = new Map<string, number>();
  for (const r of dayKho) {
    khoTotalKg += r.slKg;
    khoTypeMap.set(r.loaiLua, (khoTypeMap.get(r.loaiLua) || 0) + r.slKg);
  }

  const khoByType: DailyIntakeBreakdownItem[] = Array.from(khoTypeMap.entries()).map(
    ([key, kg]) => ({
      key,
      label: formatKhoRiceLabel(key),
      kg,
    })
  );

  const totalKg = tuoiTotalKg + khoTotalKg;

  // Quét toàn bộ file Lúa Khô tìm các phương tiện PT CHƯA VỀ, CHỜ TT
  const pendingRows = khoRows.filter((r) => r.isPendingVehicle);
  const uniqueVehicles = new Set<string>();
  const vehiclesList: DailyIntakePendingVehicle[] = [];
  let minDate = '';
  let maxDate = '';
  let minTs = Infinity;
  let maxTs = -Infinity;

  for (const r of pendingRows) {
    const vKey = (r.phuongTien || r.id).trim().toUpperCase();
    uniqueVehicles.add(vKey);
    vehiclesList.push({
      ngayCan: r.ngayCan,
      phuongTien: r.phuongTien,
      loaiLua: r.loaiLua,
      slKg: r.slKg,
    });
    const ts = parseDateValue(r.ngayCan);
    if (ts > 0) {
      if (ts < minTs) {
        minTs = ts;
        minDate = r.ngayCan;
      }
      if (ts > maxTs) {
        maxTs = ts;
        maxDate = r.ngayCan;
      }
    }
  }

  const pendingCount = uniqueVehicles.size;

  // Tạo văn bản Zalo chuẩn
  const lines: string[] = [];
  lines.push(`Dạ, e gửi Báo cáo Lúa tươi và Lúa khô nhập ngày ${cleanDate}:`);
  lines.push(`Tổng lượng: ${formatKgVN(totalKg)} kg`);
  lines.push(`- Nhận theo hợp đồng: ${formatKgVN(contractKg)} kg`);
  lines.push(`- Nhận ngoài hợp đồng: ${formatKgVN(outsideContractKg)} kg`);
  lines.push('');

  lines.push(`* Tổng lượng lúa tươi: ${formatKgVN(tuoiTotalKg)} kg`);
  for (const t of tuoiByType) {
    lines.push(`- ${t.label}: ${formatKgVN(t.kg)} kg`);
  }
  for (const f of tuoiByFacility) {
    lines.push(`+ ${f.label}: ${formatKgVN(f.kg)} kg`);
  }
  lines.push('');

  if (khoByType.length === 1) {
    lines.push(`* Tổng lượng ${khoByType[0].label}: ${formatKgVN(khoTotalKg)} kg`);
  } else {
    lines.push(`* Tổng lượng lúa khô: ${formatKgVN(khoTotalKg)} kg`);
    for (const k of khoByType) {
      lines.push(`- ${k.label}: ${formatKgVN(k.kg)} kg`);
    }
  }
  lines.push('');

  lines.push('* Ghi chú:');
  if (pendingCount > 0) {
    const countStr = String(pendingCount).padStart(2, '0');
    const dateRange =
      minDate && maxDate && minDate !== maxDate
        ? `Từ ngày ${minDate} - ${maxDate}`
        : `Ngày ${minDate || cleanDate}`;
    lines.push(
      `${dateRange}: còn tổng cộng ${countStr} phương tiện lúa khô chưa về, chờ thanh toán`
    );
  } else {
    lines.push('Không có phương tiện lúa khô chưa về, chờ thanh toán.');
  }

  return {
    reportDate: cleanDate,
    totalKg,
    contractKg,
    outsideContractKg,
    tuoiTotalKg,
    tuoiByType,
    tuoiByFacility,
    khoTotalKg,
    khoByType,
    pendingVehicles: {
      count: pendingCount,
      minDate,
      maxDate,
      vehicles: vehiclesList,
    },
    zaloText: lines.join('\n'),
  };
}
