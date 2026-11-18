import * as XLSX from 'xlsx';
import { roundRiceTons } from './rounding';

export interface UngroundKhoBatch {
  id: string;
  ngayCan: string;
  khachHang?: string;
  xe?: string;
  loaiLua: string;
  slKg: number;
}

export interface UngroundTuoiBatch {
  id: string;
  ngayCan: string;
  ngayNhapSay: string;
  khachHang?: string;
  xe?: string;
  loaiLua: string;
  slKg: number;
  kcsPercent: number;
  kcsRaw?: string;
}

export interface UngroundSummaryItem {
  loaiLua: string;
  khoKg: number;
  khoTons: number;
  tuoiKg: number;
  kcsLossPercent: number;
  lossKg: number;
  convertedDryKg: number;
  convertedDryTons: number;
  totalDryHeadKg: number;
  totalDryHeadTons: number;
}

export interface UngroundReportResult {
  reportDate: string;
  totalDryHeadKg: number;
  totalDryHeadTons: number;
  totalKhoKg: number;
  totalKhoTons: number;
  totalTuoiKg: number;
  totalTuoiConvertedKg: number;
  totalTuoiConvertedTons: number;
  items: UngroundSummaryItem[];
  zaloText: string;
}

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
  const isoMatch = str.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (isoMatch) {
    const [, y, m, d] = isoMatch;
    return `${d.padStart(2, '0')}/${m.padStart(2, '0')}/${y}`;
  }
  const dmyMatch = str.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
  if (dmyMatch) {
    const [, d, m, y] = dmyMatch;
    return `${d.padStart(2, '0')}/${m.padStart(2, '0')}/${y}`;
  }
  return str;
}

/**
 * Trích xuất % hao hụt KCS lớn nhất từ ô ghi chú/đánh giá
 * Ví dụ: '17' -> 17, 0.17 -> 17, '14-15' -> 15, '15-17%' -> 17
 */
export function parseKcsMaxLossPercent(raw: unknown): number {
  if (raw === null || raw === undefined || raw === '') return 0;
  if (typeof raw === 'number') {
    return raw > 0 && raw <= 1 ? raw * 100 : raw;
  }
  const str = String(raw).trim().replace(/%/g, '');
  const matches = str.match(/\d+(\.\d+)?/g);
  if (!matches || matches.length === 0) return 0;
  const numbers = matches.map(Number);
  const max = Math.max(...numbers);
  return max > 0 && max <= 1 ? max * 100 : max;
}

/**
 * Trích xuất danh sách mẻ lúa khô CHƯA XAY (cột Ngày xay là blank)
 */
export function parseUngroundKhoExcel(fileData: ArrayBuffer | Uint8Array | Buffer): UngroundKhoBatch[] {
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

  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1 });
  if (rows.length < 6) return [];

  // Tìm cột từ header row 5 (index 5)
  let colWeighDate = 1;
  let colCustomer = 3;
  let colVehicle = 4;
  let colRiceType = 5;
  let colQty = 7;
  let colMillingDate = 19;

  const header = rows[5] || [];
  header.forEach((cell, idx) => {
    const txt = String(cell || '').toLowerCase().replace(/\s+/g, ' ').trim();
    if (txt.includes('ngày') && txt.includes('cân')) colWeighDate = idx;
    if (txt.includes('nhà cung cấp') || txt.includes('khách hàng')) colCustomer = idx;
    if (txt.includes('phương tiện')) colVehicle = idx;
    if (txt.includes('loại lúa')) colRiceType = idx;
    if (txt.includes('số lượng') && txt.includes('lúa khô')) colQty = idx;
    if (txt.includes('ngày xay')) colMillingDate = idx;
  });

  const batches: UngroundKhoBatch[] = [];
  for (let i = 6; i < rows.length; i++) {
    const r = rows[i];
    if (!r) continue;
    const riceType = String(r[colRiceType] || '').trim().toUpperCase();
    const sl = parseFloat(String(r[colQty])) || 0;
    const ngayXay = r[colMillingDate];
    const isBlank = !ngayXay || String(ngayXay).trim() === '' || String(ngayXay).trim() === '-';

    if (riceType && sl > 0 && isBlank) {
      batches.push({
        id: `kho-${i}`,
        ngayCan: formatExcelDate(r[colWeighDate]),
        khachHang: String(r[colCustomer] || '').trim(),
        xe: String(r[colVehicle] || '').trim(),
        loaiLua: riceType,
        slKg: sl,
      });
    }
  }

  return batches;
}

/**
 * Trích xuất danh sách mẻ lúa tươi CHƯA XAY (cột Ngày xay máy 1, máy 2, ở NSX đều là blank)
 */
export function parseUngroundTuoiExcel(fileData: ArrayBuffer | Uint8Array | Buffer): UngroundTuoiBatch[] {
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

  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1 });
  if (rows.length < 3) return [];

  // Tìm cột từ header row 2 (index 2)
  let colWeighDate = 1;
  let colCustomer = 3;
  let colVehicle = 4;
  let colRiceType = 5;
  let colQty = 7;
  let colDryDate = 24;
  let colDryWeight = 27;
  let colM1 = 33;
  let colM2 = 34;
  let colNSX = 35;
  let colKcs = 37;

  const header = rows[2] || [];
  header.forEach((cell, idx) => {
    const txt = String(cell || '').toLowerCase().replace(/\s+/g, ' ').trim();
    if (txt.includes('ngày') && txt.includes('cân')) colWeighDate = idx;
    if (txt.includes('khách hàng')) colCustomer = idx;
    if (txt === 'phương tiện') colVehicle = idx;
    if (txt.includes('loại lúa')) colRiceType = idx;
    if (txt.includes('số lượng') && txt.includes('kg')) colQty = idx;
    if (txt.includes('ngày') && txt.includes('nhập sấy')) colDryDate = idx;
    if (txt.includes('cân nhập sấy')) colDryWeight = idx;
    if (txt.includes('xay máy 1')) colM1 = idx;
    if (txt.includes('xay máy 2')) colM2 = idx;
    if (txt.includes('xay ở nsx') || txt.includes('xay nsx')) colNSX = idx;
    if (txt.includes('kcs') && txt.includes('mất')) colKcs = idx;
  });

  const batches: UngroundTuoiBatch[] = [];
  const isBlank = (v: unknown) =>
    !v || String(v).trim() === '' || String(v).trim() === '-' || String(v).trim() === '0';

  for (let i = 3; i < rows.length; i++) {
    const r = rows[i];
    if (!r) continue;
    const riceType = String(r[colRiceType] || '').trim().toUpperCase();
    const sl = parseFloat(String(r[colQty])) || parseFloat(String(r[colDryWeight])) || 0;
    const m1 = r[colM1];
    const m2 = r[colM2];
    const nsx = r[colNSX];

    if (riceType && sl > 0 && isBlank(m1) && isBlank(m2) && isBlank(nsx)) {
      const kcsRaw = r[colKcs];
      const kcsPercent = parseKcsMaxLossPercent(kcsRaw);

      batches.push({
        id: `tuoi-${i}`,
        ngayCan: formatExcelDate(r[colWeighDate]),
        ngayNhapSay: formatExcelDate(r[colDryDate]),
        khachHang: String(r[colCustomer] || '').trim(),
        xe: String(r[colVehicle] || '').trim(),
        loaiLua: riceType,
        slKg: sl,
        kcsPercent,
        kcsRaw: kcsRaw !== undefined && kcsRaw !== null ? String(kcsRaw) : '',
      });
    }
  }

  return batches;
}

/**
 * Xây dựng báo cáo tổng hợp Lúa Khô Chưa Xay
 * @param khoBatches Danh sách mẻ lúa khô chưa xay
 * @param tuoiBatches Danh sách mẻ lúa tươi chưa xay (sau khi lọc tháng hoặc khoảng ngày)
 * @param reportDate Ngày gửi báo cáo (vd: 16/11/2026)
 * @param customLossMap Tùy chỉnh % hao hụt theo loại lúa (nếu người dùng sửa trên giao diện)
 */
export function buildUngroundReport(
  khoBatches: UngroundKhoBatch[],
  tuoiBatches: UngroundTuoiBatch[],
  reportDate: string,
  customLossMap?: Record<string, number>
): UngroundReportResult {
  // Lấy tất cả loại lúa có trong cả 2 nguồn
  const riceTypeSet = new Set<string>();
  khoBatches.forEach((b) => riceTypeSet.add(b.loaiLua));
  tuoiBatches.forEach((b) => riceTypeSet.add(b.loaiLua));

  const items: UngroundSummaryItem[] = [];

  Array.from(riceTypeSet).sort().forEach((loaiLua) => {
    // 1. Lúa khô nằm tài
    const khoList = khoBatches.filter((b) => b.loaiLua === loaiLua);
    const khoKg = khoList.reduce((s, b) => s + b.slKg, 0);
    const khoTons = roundRiceTons(khoKg);

    // 2. Lúa tươi chờ sấy
    const tuoiList = tuoiBatches.filter((b) => b.loaiLua === loaiLua);
    const tuoiKg = tuoiList.reduce((s, b) => s + b.slKg, 0);

    // Xác định % hao hụt KCS: nếu người dùng chỉnh tay -> lấy custom, ngược lại lấy max từ các mẻ, fallback 17%
    let kcsLossPercent = 17;
    if (customLossMap && customLossMap[loaiLua] !== undefined) {
      kcsLossPercent = customLossMap[loaiLua];
    } else {
      const maxKcsInBatches = Math.max(...tuoiList.map((b) => b.kcsPercent).filter((p) => p > 0), 0);
      kcsLossPercent = maxKcsInBatches > 0 ? maxKcsInBatches : 17;
    }

    // 3. Quy đổi đầu lúa khô từ lúa tươi:
    // Hao hụt = tuoiKg * (kcsLossPercent / 100)
    // Đầu lúa khô = tuoiKg - Hao hụt
    const lossKg = Math.round(tuoiKg * (kcsLossPercent / 100));
    const convertedDryKg = Math.max(0, tuoiKg - lossKg);
    const convertedDryTons = roundRiceTons(convertedDryKg);

    // 4. Tổng đầu lúa khô
    const totalDryHeadKg = khoKg + convertedDryKg;
    const totalDryHeadTons = roundRiceTons(totalDryHeadKg);

    items.push({
      loaiLua,
      khoKg,
      khoTons,
      tuoiKg,
      kcsLossPercent,
      lossKg,
      convertedDryKg,
      convertedDryTons,
      totalDryHeadKg,
      totalDryHeadTons,
    });
  });

  const totalKhoKg = items.reduce((s, it) => s + it.khoKg, 0);
  const totalKhoTons = items.reduce((s, it) => s + it.khoTons, 0);
  const totalTuoiKg = items.reduce((s, it) => s + it.tuoiKg, 0);
  const totalTuoiConvertedKg = items.reduce((s, it) => s + it.convertedDryKg, 0);
  const totalTuoiConvertedTons = items.reduce((s, it) => s + it.convertedDryTons, 0);
  const totalDryHeadKg = totalKhoKg + totalTuoiConvertedKg;
  const totalDryHeadTons = items.reduce((s, it) => s + it.totalDryHeadTons, 0);

  // Tạo mẫu văn bản gửi Zalo đúng 100% định dạng yêu cầu của người dùng
  const lines: string[] = [
    `Dạ, e gửi Báo cáo Lượng Lúa khô CHƯA XAY đến ngày ${reportDate}`,
    `Tổng lượng: ${totalDryHeadTons} tấn (ước tính theo đầu lúa khô). 🌾 🌾 🌾`,
    `Trong đó:`,
  ];

  items
    .filter((it) => it.totalDryHeadTons > 0)
    .forEach((it) => {
      lines.push(`- Lúa ${it.loaiLua}: ${it.totalDryHeadTons} tấn`);
    });

  lines.push(`Ghi chú: Số lượng trên là bao gồm lúa khô đang nằm tài và lúa tươi đang nhập sấy, chờ sấy`);

  const zaloText = lines.join('\n');

  return {
    reportDate,
    totalDryHeadKg,
    totalDryHeadTons,
    totalKhoKg,
    totalKhoTons,
    totalTuoiKg,
    totalTuoiConvertedKg,
    totalTuoiConvertedTons,
    items,
    zaloText,
  };
}
