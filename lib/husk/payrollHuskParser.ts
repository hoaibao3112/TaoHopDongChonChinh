import * as XLSX from 'xlsx';
import { HuskMonthlyRecord, extractMonthKey } from './monthlyTypes';

function formatExcelDate(raw: unknown): string {
  if (raw === null || raw === undefined || raw === '') return '';
  if (typeof raw === 'number') {
    try {
      const dt = new Date(Math.round((raw - 25569) * 86400 * 1000));
      const d = String(dt.getUTCDate()).padStart(2, '0');
      const m = String(dt.getUTCMonth() + 1).padStart(2, '0');
      const y = dt.getUTCFullYear();
      return `${d}/${m}/${y}`;
    } catch {
      return String(raw);
    }
  }
  const str = String(raw).trim();
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
 * Tách tên khách hàng và phương tiện (biển số xe / tên ghe) từ câu diễn giải công việc
 * Ví dụ:
 * - "Xuất một xe trấu 50H 65334 của trang bến tre" -> vehicle: "50H 65334", customer: "TRANG BẾN TRE"
 * - "Xuất một 63H 01162 của trang bến tre" -> vehicle: "63H 01162", customer: "TRANG BẾN TRE"
 * - "Xuất trấu ghe Cô Liễu" -> vehicle: "Ghe Cô Liễu", customer: "CÔ LIỄU"
 */
export function extractVehicleAndCustomer(jobDesc: string, type: 'XE' | 'GHE'): {
  vehicle: string;
  customer: string;
} {
  const clean = jobDesc.replace(/\s+/g, ' ').trim();

  // Tách khách hàng sau chữ "của "
  let customer = '';
  let beforeCua = clean;
  const cuaMatch = clean.match(/\bcủa\s+(.+)$/i);
  if (cuaMatch) {
    customer = cuaMatch[1].trim().toUpperCase();
    beforeCua = clean.slice(0, cuaMatch.index).trim();
  }

  // Tách biển số xe (vd: 50H 65334, 63C-23620, 62H 03271)
  let vehicle = '';
  const plateMatch = beforeCua.match(/\b(\d{2}[A-Z]{1,2}\s*[-.]?\s*\d{4,5})\b/i);
  if (plateMatch) {
    vehicle = plateMatch[1].replace(/\s+/g, ' ').trim().toUpperCase();
  } else {
    // Bỏ các từ khóa đầu câu: xuất, một, xe, trấu, ghe, tàu
    const stripped = beforeCua
      .replace(/^(xuất|nhập)\s+/i, '')
      .replace(/^(một|1)\s+/i, '')
      .replace(/^(xe|ghe|tàu)\s+/i, '')
      .replace(/^trấu\s+/i, '')
      .replace(/^(xe|ghe|tàu)\s+/i, '')
      .trim();

    if (type === 'GHE') {
      vehicle = stripped ? `Ghe ${stripped}` : customer ? `Ghe ${customer}` : 'Ghe';
      if (!customer && stripped) {
        customer = stripped.toUpperCase();
      }
    } else {
      vehicle = stripped ? stripped.toUpperCase() : 'Xe';
    }
  }

  if (!customer) {
    customer = 'KHÁCH LẺ';
  }

  return { vehicle, customer };
}

/**
 * Đọc file Excel tính lương (Đội Đức / Đội Quý - NSX TM) và bóc tách toàn bộ dòng Xuất Trấu
 */
export function parseHuskFromPayrollExcel(
  fileData: ArrayBuffer | Uint8Array | Buffer
): HuskMonthlyRecord[] {
  const wb = XLSX.read(fileData, {
    type: 'buffer',
    dense: true,
    cellFormula: false,
    cellHTML: false,
    cellText: false,
  });

  // Ưu tiên sheet QUÝ, ĐỨC hoặc sheet đầu tiên
  const targetSheetName =
    wb.SheetNames.find((s) => s.toUpperCase().includes('QUÝ') || s.toUpperCase().includes('ĐỨC')) ||
    wb.SheetNames[0];
  const ws = wb.Sheets[targetSheetName];
  if (!ws) return [];

  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1 });
  if (rows.length < 5) return [];

  // Tìm dòng header chính (chứa CÔNG VIỆC hoặc NGÀY NHẬP)
  let headerRowIdx = -1;
  for (let i = 0; i < Math.min(12, rows.length); i++) {
    const r = rows[i] || [];
    const joined = r.map((c) => String(c || '').toUpperCase()).join(' ');
    if (joined.includes('CÔNG VIỆC') || joined.includes('NGÀY NHẬP')) {
      headerRowIdx = i;
      break;
    }
  }
  if (headerRowIdx === -1) return [];

  const mainHeader = rows[headerRowIdx] || [];
  const subHeader = rows[headerRowIdx + 1] || [];

  let colDate = 1;
  let colTeam = 2;
  let colJob = 3;
  let colKg = 4;
  let colTons = 5;
  let colUnitPriceTrau = -1;
  let colAmountTrau = -1;

  mainHeader.forEach((cell, idx) => {
    const txt = String(cell || '').toLowerCase().replace(/\s+/g, ' ').trim();
    if (txt.includes('ngày nhập') || txt === 'ngày') colDate = idx;
    if (txt === 'đội' || txt.includes('đội')) colTeam = idx;
    if (txt.includes('công việc') || txt.includes('diễn giải')) colJob = idx;
    if (txt.includes('đơn giá') && txt.includes('trấu')) colUnitPriceTrau = idx;
    if (txt.includes('thành tiền') && txt.includes('trấu')) colAmountTrau = idx;
  });

  subHeader.forEach((cell, idx) => {
    const txt = String(cell || '').toLowerCase().replace(/\s+/g, ' ').trim();
    if (txt === 'kg') colKg = idx;
    if (txt === 'tấn') colTons = idx;
  });

  // Bắt đầu đọc dữ liệu sau subHeader (nếu dòng tiếp theo là subHeader KG/TẤN)
  const startRow =
    String(subHeader[colKg] || '').toUpperCase().includes('KG')
      ? headerRowIdx + 2
      : headerRowIdx + 1;

  const records: HuskMonthlyRecord[] = [];

  for (let i = startRow; i < rows.length; i++) {
    const r = rows[i];
    if (!r || r.length === 0) continue;

    const job = String(r[colJob] || '').trim();
    const dateStr = formatExcelDate(r[colDate]);
    if (!job || !dateStr) continue;

    const upperJob = job.toUpperCase();
    const unitPriceVal = colUnitPriceTrau >= 0 ? parseFloat(String(r[colUnitPriceTrau])) || 0 : 0;
    const amountVal = colAmountTrau >= 0 ? parseFloat(String(r[colAmountTrau])) || 0 : 0;

    // Nhận diện dòng xuất trấu: có đơn giá/thành tiền xuất trấu HOẶC nội dung công việc chứa "TRẤU"
    const isHuskRow = unitPriceVal > 0 || amountVal > 0 || upperJob.includes('TRẤU');
    if (!isHuskRow) continue;

    const weightKg = parseFloat(String(r[colKg])) || 0;
    const rawTons = parseFloat(String(r[colTons])) || 0;
    const tons = rawTons > 0 ? rawTons : Math.round((weightKg / 1000) * 10) / 10;
    if (weightKg <= 0 && tons <= 0) continue;

    const monthKey = extractMonthKey(dateStr);
    if (!monthKey) continue;

    const rawTeam = String(r[colTeam] || '').trim().toUpperCase();
    const team: 'ĐỨC' | 'QUÝ' = rawTeam.includes('QUÝ') ? 'QUÝ' : 'ĐỨC';

    const type: 'XE' | 'GHE' =
      upperJob.includes('GHE') || upperJob.includes('TÀU') || upperJob.includes('SALAN')
        ? 'GHE'
        : 'XE';

    const { vehicle, customer } = extractVehicleAndCustomer(job, type);
    const unitPrice = unitPriceVal > 0 ? unitPriceVal : 11000;
    const amount = amountVal > 0 ? Math.round(amountVal) : Math.round(tons * unitPrice);

    records.push({
      id: `payroll-${monthKey.replace('/', '')}-${dateStr.replace(/\//g, '')}-${i}`,
      date: dateStr,
      monthKey,
      team,
      customer,
      vehicle,
      type,
      weightKg,
      tons,
      unitPrice,
      amount,
      description: job,
      note: 'Tách từ file bảng kê tính lương',
      sourceTab: 'NHAP_MOI',
    });
  }

  return records;
}
