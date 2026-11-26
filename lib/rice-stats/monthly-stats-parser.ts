import * as XLSX from 'xlsx';
import { buildContractMonthlyStats, parseContractWorkbook } from './contract-stats-parser';
import {
  BuyerStat,
  CostBreakdownStat,
  DailyIntakePoint,
  DebtAlertItem,
  FacilityDryStat,
  LossAlertItem,
  RegionStat,
  RiceMonthlyStatsResult,
  RiceVarietyStat,
  SupplierStat,
  UnmilledLotItem,
} from './types';

function normalizeText(val: unknown): string {
  return String(val ?? '')
    .replace(/\r?\n/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeHeader(val: unknown): string {
  return normalizeText(val).toUpperCase();
}

function toNumber(val: unknown): number {
  if (typeof val === 'number') {
    return Number.isFinite(val) ? val : 0;
  }
  const s = String(val ?? '').trim();
  if (!s) return 0;
  const cleaned = s.replace(/,/g, '').replace(/[^\d.-]/g, '');
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

function parsePercentValue(val: unknown): number {
  if (typeof val === 'number' && Number.isFinite(val)) {
    // Trong Excel, 12.5% đôi khi lưu dạng 0.125 hoặc 12.5
    return Math.abs(val) < 1 ? val * 100 : val;
  }
  const s = String(val ?? '').trim();
  if (!s) return 0;
  const nums = s.match(/-?\d+(?:[.,]\d+)?/g);
  if (!nums || nums.length === 0) return 0;
  if (nums.length >= 2 && s.includes('-')) {
    const a = Number(nums[0].replace(',', '.'));
    const b = Number(nums[1].replace(',', '.'));
    if (Number.isFinite(a) && Number.isFinite(b)) return (a + b) / 2;
  }
  const n = Number(nums[0].replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}

function parseExcelDateInfo(val: unknown): {
  dateStr: string;
  monthKey: string;
  day: number;
  timestamp: number;
} | null {
  if (val === null || val === undefined || val === '') return null;

  if (typeof val === 'number' && Number.isFinite(val) && val > 20000 && val < 90000) {
    const utcDays = Math.floor(val - 25569);
    const d = new Date(utcDays * 86400 * 1000);
    if (!Number.isNaN(d.getTime())) {
      const dd = d.getUTCDate();
      const mm = d.getUTCMonth() + 1;
      const yyyy = d.getUTCFullYear();
      return {
        dateStr: `${String(dd).padStart(2, '0')}/${String(mm).padStart(2, '0')}/${yyyy}`,
        monthKey: `${String(mm).padStart(2, '0')}/${yyyy}`,
        day: dd,
        timestamp: d.getTime(),
      };
    }
  }

  const s = normalizeText(val);
  const dmy = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
  if (dmy) {
    const dd = Number(dmy[1]);
    const mm = Number(dmy[2]);
    let yyyy = Number(dmy[3]);
    if (yyyy < 100) yyyy += 2000;
    if (mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31) {
      const ts = Date.UTC(yyyy, mm - 1, dd);
      return {
        dateStr: `${String(dd).padStart(2, '0')}/${String(mm).padStart(2, '0')}/${yyyy}`,
        monthKey: `${String(mm).padStart(2, '0')}/${yyyy}`,
        day: dd,
        timestamp: ts,
      };
    }
  }

  const ymd = s.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
  if (ymd) {
    const yyyy = Number(ymd[1]);
    const mm = Number(ymd[2]);
    const dd = Number(ymd[3]);
    if (mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31) {
      const ts = Date.UTC(yyyy, mm - 1, dd);
      return {
        dateStr: `${String(dd).padStart(2, '0')}/${String(mm).padStart(2, '0')}/${yyyy}`,
        monthKey: `${String(mm).padStart(2, '0')}/${yyyy}`,
        day: dd,
        timestamp: ts,
      };
    }
  }

  return null;
}

function findHeaderRowIndex(rows: unknown[][], keywords: string[]): number {
  for (let i = 0; i < Math.min(15, rows.length); i++) {
    const row = rows[i] || [];
    const joined = row.map(normalizeHeader).join(' | ');
    if (keywords.every((kw) => joined.includes(kw))) {
      return i;
    }
  }
  return -1;
}

function findCol(headers: string[], patterns: string[], fallbackIndex: number): number {
  for (const pat of patterns) {
    const idx = headers.findIndex((h) => h.includes(pat));
    if (idx !== -1) return idx;
  }
  return fallbackIndex;
}

function isSummaryOrEmptyRow(row: unknown[], dateCol: number, weightCol: number): boolean {
  const rowText = row.slice(0, 6).map(normalizeHeader).join(' ');
  if (rowText.includes('TỔNG CỘNG') || rowText.includes('TONG CONG')) return true;
  const dateInfo = parseExcelDateInfo(row[dateCol]);
  const weight = toNumber(row[weightCol]);
  return !dateInfo && weight === 0;
}

interface FreshNormalizedRow {
  contractNo: string;
  dateStr: string;
  monthKey: string;
  day: number;
  timestamp: number;
  buyer: string;
  supplier: string;
  vehicle: string;
  variety: string;
  lotCode: string;
  weightKg: number;
  price: number;
  riceAmount: number;
  depositDeducted: number;
  advance: number;
  payable: number;
  bank: string;
  paymentDate: string;
  inboundFreight: number;
  transshipmentFreight: number;
  laborUnionCost: number;
  facility: string;
  scaleNote: string;
  scaleDryInputKg: number;
  lossKg: number;
  lossPercent: number;
  outputDryKg: number;
  milledMay1: string;
  milledMay2: string;
  milledNsx: string;
  milledTimestamp: number | null;
  kcsLossPercent: number;
  kcsTotalYield: number;
  kcsHeadRice: number;
  region: string;
  recoveryPercent: number;
  dryingCostVat5: number;
  exportReturnCostVat8: number;
}

interface DryNormalizedRow {
  contractNo: string;
  dateStr: string;
  monthKey: string;
  day: number;
  timestamp: number;
  buyer: string;
  supplier: string;
  vehicle: string;
  variety: string;
  lotCode: string;
  weightKg: number;
  price: number;
  riceAmount: number;
  advance: number;
  depositDeducted: number;
  payable: number;
  bank: string;
  paymentDate: string;
  dryFreight: number;
  otherCosts: number;
  totalFactoryCost: number;
  milledDate: string;
  milledTimestamp: number | null;
  region: string;
  lossKg: number;
  facility: string;
}

function parseFreshWorkbook(data: Uint8Array): FreshNormalizedRow[] {
  const metaWb = XLSX.read(data, { type: 'array', bookSheets: true });
  const sheetName =
    metaWb.SheetNames.find((n) => normalizeHeader(n).includes('LUA TUOI')) || metaWb.SheetNames[0];
  if (!sheetName) return [];

  const wb = XLSX.read(data, { type: 'array', sheets: [sheetName] });

  const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[sheetName], {
    header: 1,
    defval: '',
  });
  const headerIdx = findHeaderRowIndex(rows, ['NGÀY CÂN', 'KHÁCH HÀNG']);
  if (headerIdx === -1) return [];

  const headers = (rows[headerIdx] || []).map(normalizeHeader);
  const cContractNo = findCol(headers, ['SỐ HĐ', 'HĐ'], 0);
  const cDate = findCol(headers, ['NGÀY CÂN'], 1);
  const cBuyer = findCol(headers, ['NHÂN VIÊN THU MUA'], 2);
  const cSupplier = findCol(headers, ['KHÁCH HÀNG'], 3);
  const cVehicle = findCol(headers, ['PHƯƠNG TIỆN'], 4);
  const cVariety = findCol(headers, ['LOẠI LÚA'], 5);
  const cLot = findCol(headers, ['MÃ LÔ'], 6);
  const cWeight = findCol(headers, ['SỐ LƯỢNG (KG)'], 7);
  const cPrice = findCol(headers, ['GIÁ HẾT PHÍ'], 8);
  const cAmount = findCol(headers, ['THÀNH TIỀN LỌT LÒNG'], 10);
  const cDeposit = findCol(headers, ['TRỪ CỌC'], 11);
  const cAdvance = findCol(headers, ['TẠM ỨNG'], 12);
  const cPayable = findCol(headers, ['THANH TOÁN (VNĐ)', 'THANH TOÁN'], 13);
  const cBank = findCol(headers, ['NGÂN HÀNG'], 14);
  const cPayDate = findCol(headers, ['NGÀY THANH TOÁN'], 15);
  const cInboundFreight = findCol(headers, ['THÀNH TIỀN VẬN CHUYỂN MUA VÀO'], 17);
  const cTransFreight = findCol(headers, ['THÀNH TIỀN (TĂNG BO LÚA TƯƠI)'], 20);
  const cLaborCost = findCol(headers, ['THÀNH TIỀN CÔNG ĐOÀN TĂNG BO'], 23);
  const cFacility = findCol(headers, ['ĐỊA ĐIỂM SẤY'], 25);
  const cScaleNote = findCol(headers, ['GHI CHÚ CÂN NHẬP'], 26);
  const cScaleInput = findCol(headers, ['CÂN NHẬP SẤY'], 27);
  const cLossKg = findCol(headers, ['HAO HỤT (KG)'], 28);
  const cLossPct = findCol(headers, ['HAO HỤT (%)'], 29);
  const cDryAfter = findCol(headers, ['SỐ LIỆU LÚA KHÔ SAU SẤY'], 31);
  const cMay1 = findCol(headers, ['NGÀY XAY MÁY 1'], 33);
  const cMay2 = findCol(headers, ['NGÀY XAY MÁY 2'], 34);
  const cNsx = findCol(headers, ['NGÀY XAY Ở NSX'], 35);
  const cKcsLoss = findCol(headers, ['KCS ĐÁNH GIÁ (MẤT %)'], 37);
  const cKcsYield = findCol(headers, ['KCS ĐÁNH GIÁ TỔNG THU'], 38);
  const cKcsHead = findCol(headers, ['KCS ĐÁNH GIÁ ĐẦU GẠO'], 39);
  const cRegion = findCol(headers, ['ĐỊA ĐIỂM CÂN'], 40);
  const cRecovery = findCol(headers, ['% THU HỒI SAU SẤY'], 43);
  const cDryVat5 = findCol(headers, ['THÀNH TIỀN SẤY'], 49);
  const cReturnVat8 = findCol(headers, ['THÀNH TIỀN XUẤT TRẢ'], 51);

  const result: FreshNormalizedRow[] = [];
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const r = rows[i] || [];
    if (isSummaryOrEmptyRow(r, cDate, cWeight)) continue;
    const dateInfo = parseExcelDateInfo(r[cDate]);
    if (!dateInfo) continue;

    const weightKg = toNumber(r[cWeight]);
    if (weightKg <= 0) continue;

    const m1 = parseExcelDateInfo(r[cMay1]);
    const m2 = parseExcelDateInfo(r[cMay2]);
    const nsx = parseExcelDateInfo(r[cNsx]);
    const milledTs = m1?.timestamp ?? m2?.timestamp ?? nsx?.timestamp ?? null;

    const lossKg = toNumber(r[cLossKg]);
    let lossPercent = parsePercentValue(r[cLossPct]);
    if (lossPercent === 0 && lossKg !== 0 && weightKg > 0) {
      lossPercent = (lossKg / weightKg) * 100;
    }

    const payDateInfo = parseExcelDateInfo(r[cPayDate]);
    const paymentDate = payDateInfo ? payDateInfo.dateStr : normalizeText(r[cPayDate]);

    result.push({
      contractNo: normalizeText(r[cContractNo]),
      dateStr: dateInfo.dateStr,
      monthKey: dateInfo.monthKey,
      day: dateInfo.day,
      timestamp: dateInfo.timestamp,
      buyer: normalizeText(r[cBuyer]) || 'Chưa rõ',
      supplier: normalizeText(r[cSupplier]) || 'Chưa rõ',
      vehicle: normalizeText(r[cVehicle]) || '-',
      variety: normalizeText(r[cVariety]) || 'Chưa phân loại',
      lotCode: normalizeText(r[cLot]) || '-',
      weightKg,
      price: toNumber(r[cPrice]),
      riceAmount: toNumber(r[cAmount]),
      depositDeducted: toNumber(r[cDeposit]),
      advance: toNumber(r[cAdvance]),
      payable: toNumber(r[cPayable]),
      bank: normalizeText(r[cBank]) || 'Chưa rõ',
      paymentDate,
      inboundFreight: toNumber(r[cInboundFreight]),
      transshipmentFreight: toNumber(r[cTransFreight]),
      laborUnionCost: toNumber(r[cLaborCost]),
      facility: normalizeText(r[cFacility]) || 'Chưa phân bổ',
      scaleNote: normalizeText(r[cScaleNote]),
      scaleDryInputKg: toNumber(r[cScaleInput]),
      lossKg,
      lossPercent,
      outputDryKg: toNumber(r[cDryAfter]),
      milledMay1: m1 ? m1.dateStr : normalizeText(r[cMay1]),
      milledMay2: m2 ? m2.dateStr : normalizeText(r[cMay2]),
      milledNsx: nsx ? nsx.dateStr : normalizeText(r[cNsx]),
      milledTimestamp: milledTs,
      kcsLossPercent: parsePercentValue(r[cKcsLoss]),
      kcsTotalYield: toNumber(r[cKcsYield]),
      kcsHeadRice: toNumber(r[cKcsHead]),
      region: normalizeText(r[cRegion]) || 'Chưa rõ',
      recoveryPercent: parsePercentValue(r[cRecovery]),
      dryingCostVat5: toNumber(r[cDryVat5]),
      exportReturnCostVat8: toNumber(r[cReturnVat8]),
    });
  }
  return result;
}

function parseDryWorkbook(data: Uint8Array): DryNormalizedRow[] {
  const metaWb = XLSX.read(data, { type: 'array', bookSheets: true });
  const sheetName =
    metaWb.SheetNames.find(
      (n) => normalizeHeader(n).includes('LUA KHÔ') || normalizeHeader(n).includes('LUA KHO')
    ) || metaWb.SheetNames[0];
  if (!sheetName) return [];

  const wb = XLSX.read(data, { type: 'array', sheets: [sheetName] });

  const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[sheetName], {
    header: 1,
    defval: '',
  });
  const headerIdx = findHeaderRowIndex(rows, ['NGÀY CÂN', 'NHÀ CUNG CẤP']);
  if (headerIdx === -1) return [];

  const headers = (rows[headerIdx] || []).map(normalizeHeader);
  const cContractNo = findCol(headers, ['SỐ HĐ', 'HĐ'], 0);
  const cDate = findCol(headers, ['NGÀY CÂN'], 1);
  const cBuyer = findCol(headers, ['NHÂN VIÊN THU MUA'], 2);
  const cSupplier = findCol(headers, ['NHÀ CUNG CẤP'], 3);
  const cVehicle = findCol(headers, ['PHƯƠNG TIỆN'], 4);
  const cVariety = findCol(headers, ['LOẠI LÚA'], 5);
  const cLot = findCol(headers, ['MÃ LÔ'], 6);
  const cWeight = findCol(headers, ['SỐ LƯỢNG LÚA KHÔ', 'SỐ LƯỢNG'], 7);
  const cPrice = findCol(headers, ['GIÁ LÚA'], 8);
  const cAmount = findCol(headers, ['THÀNH TIỀN LÚA'], 9);
  const cAdvance = findCol(headers, ['TẠM ỨNG'], 10);
  const cDeposit = findCol(headers, ['TRỪ CỌC'], 11);
  const cPayable = findCol(headers, ['THANH TOÁN'], 12);
  const cBank = findCol(headers, ['NGÂN HÀNG'], 13);
  const cPayDate = findCol(headers, ['NGÀY THANH TOÁN'], 14);
  const cDryFreight = findCol(headers, ['CƯỚC VẬN CHUYỂN'], 15);
  const cOtherCost = findCol(headers, ['CHI PHÍ KHÁC'], 16);
  const cTotalFactory = findCol(headers, ['TỔNG CHI PHÍ LÚA TỚI NHÀ MÁY'], 17);
  const cMilledDate = findCol(headers, ['NGÀY XAY'], 19);
  const cRegion = findCol(headers, ['ĐỊA ĐIỂM CÂN'], 23);
  const cLossKg = findCol(headers, ['HAO HỤT LÚA KHÔ'], 31);
  const cTeam = findCol(headers, ['ĐỘI NHẬP'], 32);

  const result: DryNormalizedRow[] = [];
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const r = rows[i] || [];
    if (isSummaryOrEmptyRow(r, cDate, cWeight)) continue;
    const dateInfo = parseExcelDateInfo(r[cDate]);
    if (!dateInfo) continue;

    const weightKg = toNumber(r[cWeight]);
    if (weightKg <= 0) continue;

    const milledInfo = parseExcelDateInfo(r[cMilledDate]);
    const payDateInfo = parseExcelDateInfo(r[cPayDate]);

    result.push({
      contractNo: normalizeText(r[cContractNo]),
      dateStr: dateInfo.dateStr,
      monthKey: dateInfo.monthKey,
      day: dateInfo.day,
      timestamp: dateInfo.timestamp,
      buyer: normalizeText(r[cBuyer]) || 'Chưa rõ',
      supplier: normalizeText(r[cSupplier]) || 'Chưa rõ',
      vehicle: normalizeText(r[cVehicle]) || '-',
      variety: normalizeText(r[cVariety]) || 'Chưa phân loại',
      lotCode: normalizeText(r[cLot]) || '-',
      weightKg,
      price: toNumber(r[cPrice]),
      riceAmount: toNumber(r[cAmount]),
      advance: toNumber(r[cAdvance]),
      depositDeducted: toNumber(r[cDeposit]),
      payable: toNumber(r[cPayable]),
      bank: normalizeText(r[cBank]) || 'Chưa rõ',
      paymentDate: payDateInfo ? payDateInfo.dateStr : normalizeText(r[cPayDate]),
      dryFreight: toNumber(r[cDryFreight]),
      otherCosts: toNumber(r[cOtherCost]),
      totalFactoryCost: toNumber(r[cTotalFactory]),
      milledDate: milledInfo ? milledInfo.dateStr : normalizeText(r[cMilledDate]),
      milledTimestamp: milledInfo ? milledInfo.timestamp : null,
      region: normalizeText(r[cRegion]) || 'Chưa rõ',
      lossKg: toNumber(r[cLossKg]),
      facility: normalizeText(r[cTeam]) || 'Kho Lúa Khô',
    });
  }
  return result;
}

function sortMonthKeysDesc(months: Set<string>): string[] {
  return Array.from(months).sort((a, b) => {
    const [ma, ya] = a.split('/').map(Number);
    const [mb, yb] = b.split('/').map(Number);
    if (ya !== yb) return yb - ya;
    return mb - ma;
  });
}

function isOutsideContractCode(code: string): boolean {
  const c = code.trim().replace(/^'+/, '').toUpperCase();
  return !c || c === '0' || c === '00' || c === '-' || c.includes('NGOÀI');
}

export function analyzeRiceMonthlyStats(params: {
  freshBuffer?: Uint8Array | null;
  dryBuffer?: Uint8Array | null;
  contractBuffer?: Uint8Array | null;
  monthKey?: string;
}): RiceMonthlyStatsResult {
  const allFresh = params.freshBuffer ? parseFreshWorkbook(params.freshBuffer) : [];
  const allDry = params.dryBuffer ? parseDryWorkbook(params.dryBuffer) : [];
  const allContracts = params.contractBuffer ? parseContractWorkbook(params.contractBuffer) : [];

  const monthSet = new Set<string>();
  for (const r of allFresh) monthSet.add(r.monthKey);
  for (const r of allDry) monthSet.add(r.monthKey);
  for (const c of allContracts) {
    if (c.expectedMonthKey) monthSet.add(c.expectedMonthKey);
    else if (c.signMonthKey) monthSet.add(c.signMonthKey);
  }

  const availableMonths = sortMonthKeysDesc(monthSet);
  const selectedMonth =
    params.monthKey && (params.monthKey === 'ALL' || monthSet.has(params.monthKey))
      ? params.monthKey
      : availableMonths[0] || 'ALL';

  const freshRows =
    selectedMonth === 'ALL' ? allFresh : allFresh.filter((r) => r.monthKey === selectedMonth);
  const dryRows =
    selectedMonth === 'ALL' ? allDry : allDry.filter((r) => r.monthKey === selectedMonth);

  // 1. Overview
  const freshTotalKg = freshRows.reduce((s, r) => s + r.weightKg, 0);
  const freshTotalAmount = freshRows.reduce((s, r) => s + r.riceAmount, 0);
  const dryTotalKg = dryRows.reduce((s, r) => s + r.weightKg, 0);
  const dryTotalAmount = dryRows.reduce((s, r) => s + r.riceAmount, 0);
  const combinedTotalKg = freshTotalKg + dryTotalKg;

  // Varieties + Daily Trend
  const varietyMap = new Map<
    string,
    {
      freshKg: number;
      dryKg: number;
      lots: number;
      totalAmount: number;
      prices: number[];
    }
  >();
  const dailyMap = new Map<string, DailyIntakePoint>();

  for (const r of freshRows) {
    const v = varietyMap.get(r.variety) || {
      freshKg: 0,
      dryKg: 0,
      lots: 0,
      totalAmount: 0,
      prices: [],
    };
    v.freshKg += r.weightKg;
    v.lots += 1;
    v.totalAmount += r.riceAmount;
    if (r.price > 0) v.prices.push(r.price);
    varietyMap.set(r.variety, v);

    const d = dailyMap.get(r.dateStr) || {
      date: r.dateStr,
      dayOfMonth: r.day,
      freshKg: 0,
      dryKg: 0,
      totalKg: 0,
      lots: 0,
    };
    d.freshKg += r.weightKg;
    d.totalKg += r.weightKg;
    d.lots += 1;
    dailyMap.set(r.dateStr, d);
  }

  for (const r of dryRows) {
    const v = varietyMap.get(r.variety) || {
      freshKg: 0,
      dryKg: 0,
      lots: 0,
      totalAmount: 0,
      prices: [],
    };
    v.dryKg += r.weightKg;
    v.lots += 1;
    v.totalAmount += r.riceAmount;
    if (r.price > 0) v.prices.push(r.price);
    varietyMap.set(r.variety, v);

    const d = dailyMap.get(r.dateStr) || {
      date: r.dateStr,
      dayOfMonth: r.day,
      freshKg: 0,
      dryKg: 0,
      totalKg: 0,
      lots: 0,
    };
    d.dryKg += r.weightKg;
    d.totalKg += r.weightKg;
    d.lots += 1;
    dailyMap.set(r.dateStr, d);
  }

  const varieties: RiceVarietyStat[] = Array.from(varietyMap.entries())
    .map(([variety, v]) => {
      const totalKg = v.freshKg + v.dryKg;
      return {
        variety,
        source: (v.freshKg > 0 && v.dryKg > 0 ? 'Cả hai' : v.freshKg > 0 ? 'Tươi' : 'Khô') as
          | 'Tươi'
          | 'Khô'
          | 'Cả hai',
        freshKg: v.freshKg,
        dryKg: v.dryKg,
        totalKg,
        lots: v.lots,
        totalAmount: v.totalAmount,
        avgPrice: totalKg > 0 ? Math.round(v.totalAmount / totalKg) : 0,
        minPrice: v.prices.length > 0 ? Math.min(...v.prices) : 0,
        maxPrice: v.prices.length > 0 ? Math.max(...v.prices) : 0,
        sharePercent: combinedTotalKg > 0 ? Number(((totalKg / combinedTotalKg) * 100).toFixed(2)) : 0,
      };
    })
    .sort((a, b) => b.totalKg - a.totalKg);

  const dailyTrend: DailyIntakePoint[] = Array.from(dailyMap.values()).sort((a, b) => {
    const [da, ma, ya] = a.date.split('/').map(Number);
    const [db, mb, yb] = b.date.split('/').map(Number);
    return Date.UTC(ya, ma - 1, da) - Date.UTC(yb, mb - 1, db);
  });

  // 2. Buyers, Suppliers & Regions
  const buyerMap = new Map<
    string,
    {
      freshLots: number;
      freshKg: number;
      dryLots: number;
      dryKg: number;
      totalAmount: number;
      lossKgSum: number;
      lossBaseKgSum: number;
    }
  >();
  const supplierMap = new Map<
    string,
    { freshKg: number; dryKg: number; lots: number; totalAmount: number }
  >();
  const regionMap = new Map<
    string,
    { lots: number; freshKg: number; dryKg: number; totalFreight: number }
  >();

  for (const r of freshRows) {
    const b = buyerMap.get(r.buyer) || {
      freshLots: 0,
      freshKg: 0,
      dryLots: 0,
      dryKg: 0,
      totalAmount: 0,
      lossKgSum: 0,
      lossBaseKgSum: 0,
    };
    b.freshLots += 1;
    b.freshKg += r.weightKg;
    b.totalAmount += r.riceAmount;
    b.lossKgSum += r.lossKg;
    b.lossBaseKgSum += r.weightKg;
    buyerMap.set(r.buyer, b);

    const sup = supplierMap.get(r.supplier) || {
      freshKg: 0,
      dryKg: 0,
      lots: 0,
      totalAmount: 0,
    };
    sup.freshKg += r.weightKg;
    sup.lots += 1;
    sup.totalAmount += r.riceAmount;
    supplierMap.set(r.supplier, sup);

    const reg = regionMap.get(r.region) || {
      lots: 0,
      freshKg: 0,
      dryKg: 0,
      totalFreight: 0,
    };
    reg.lots += 1;
    reg.freshKg += r.weightKg;
    reg.totalFreight += r.inboundFreight;
    regionMap.set(r.region, reg);
  }

  for (const r of dryRows) {
    const b = buyerMap.get(r.buyer) || {
      freshLots: 0,
      freshKg: 0,
      dryLots: 0,
      dryKg: 0,
      totalAmount: 0,
      lossKgSum: 0,
      lossBaseKgSum: 0,
    };
    b.dryLots += 1;
    b.dryKg += r.weightKg;
    b.totalAmount += r.riceAmount;
    b.lossKgSum += r.lossKg;
    b.lossBaseKgSum += r.weightKg;
    buyerMap.set(r.buyer, b);

    const sup = supplierMap.get(r.supplier) || {
      freshKg: 0,
      dryKg: 0,
      lots: 0,
      totalAmount: 0,
    };
    sup.dryKg += r.weightKg;
    sup.lots += 1;
    sup.totalAmount += r.riceAmount;
    supplierMap.set(r.supplier, sup);

    const reg = regionMap.get(r.region) || {
      lots: 0,
      freshKg: 0,
      dryKg: 0,
      totalFreight: 0,
    };
    reg.lots += 1;
    reg.dryKg += r.weightKg;
    reg.totalFreight += r.dryFreight;
    regionMap.set(r.region, reg);
  }

  const buyers: BuyerStat[] = Array.from(buyerMap.entries())
    .map(([buyer, b]) => {
      const totalKg = b.freshKg + b.dryKg;
      return {
        buyer,
        freshLots: b.freshLots,
        freshKg: b.freshKg,
        dryLots: b.dryLots,
        dryKg: b.dryKg,
        totalKg,
        totalAmount: b.totalAmount,
        avgPrice: totalKg > 0 ? Math.round(b.totalAmount / totalKg) : 0,
        avgLossPercent:
          b.lossBaseKgSum > 0 ? Number(((b.lossKgSum / b.lossBaseKgSum) * 100).toFixed(3)) : 0,
      };
    })
    .sort((a, b) => b.totalKg - a.totalKg);

  const suppliers: SupplierStat[] = Array.from(supplierMap.entries())
    .map(([supplier, s]) => {
      const totalKg = s.freshKg + s.dryKg;
      return {
        supplier,
        source: (s.freshKg > 0 && s.dryKg > 0 ? 'Cả hai' : s.freshKg > 0 ? 'Tươi' : 'Khô') as
          | 'Tươi'
          | 'Khô'
          | 'Cả hai',
        lots: s.lots,
        totalKg,
        totalAmount: s.totalAmount,
        avgPrice: totalKg > 0 ? Math.round(s.totalAmount / totalKg) : 0,
      };
    })
    .sort((a, b) => b.totalKg - a.totalKg);

  const regions: RegionStat[] = Array.from(regionMap.entries())
    .map(([region, r]) => {
      const totalKg = r.freshKg + r.dryKg;
      return {
        region,
        lots: r.lots,
        freshKg: r.freshKg,
        dryKg: r.dryKg,
        totalKg,
        totalFreight: r.totalFreight,
        avgFreightPerKg: totalKg > 0 ? Math.round(r.totalFreight / totalKg) : 0,
      };
    })
    .sort((a, b) => b.totalKg - a.totalKg);

  // 3. Cost Breakdown
  const freshInboundFreight = freshRows.reduce((s, r) => s + r.inboundFreight, 0);
  const freshTransFreight = freshRows.reduce((s, r) => s + r.transshipmentFreight, 0);
  const freshLaborUnion = freshRows.reduce((s, r) => s + r.laborUnionCost, 0);
  const freshDryVat5 = freshRows.reduce((s, r) => s + r.dryingCostVat5, 0);
  const freshReturnVat8 = freshRows.reduce((s, r) => s + r.exportReturnCostVat8, 0);
  const freshAllCost =
    freshTotalAmount +
    freshInboundFreight +
    freshTransFreight +
    freshLaborUnion +
    freshDryVat5 +
    freshReturnVat8;

  const dryFreight = dryRows.reduce((s, r) => s + r.dryFreight, 0);
  const dryOther = dryRows.reduce((s, r) => s + r.otherCosts, 0);
  const dryFactorySum = dryRows.reduce(
    (s, r) => s + (r.totalFactoryCost > 0 ? r.totalFactoryCost : r.riceAmount + r.dryFreight + r.otherCosts),
    0
  );

  const costBreakdown: CostBreakdownStat = {
    fresh: {
      riceAmount: freshTotalAmount,
      inboundFreight: freshInboundFreight,
      transshipmentFreight: freshTransFreight,
      laborUnionCost: freshLaborUnion,
      dryingCostVat5: freshDryVat5,
      exportReturnCostVat8: freshReturnVat8,
      totalAllCosts: freshAllCost,
      totalKg: freshTotalKg,
      realUnitCostPerKg: freshTotalKg > 0 ? Math.round(freshAllCost / freshTotalKg) : 0,
    },
    dry: {
      riceAmount: dryTotalAmount,
      dryFreight,
      otherCosts: dryOther,
      totalFactoryCost: dryFactorySum,
      totalKg: dryTotalKg,
      realUnitCostPerKg: dryTotalKg > 0 ? Math.round(dryFactorySum / dryTotalKg) : 0,
    },
    grandTotalCost: freshAllCost + dryFactorySum,
  };

  // 4. Facilities, Loss Alerts, KCS
  const facilityMap = new Map<
    string,
    {
      lots: number;
      inputFreshKg: number;
      scaleDryInputKg: number;
      lossKg: number;
      outputDryKg: number;
      recoverySum: number;
      recoveryCount: number;
    }
  >();
  const kcsMap = new Map<
    string,
    { count: number; lossSum: number; yieldSum: number; headSum: number }
  >();
  const lossAlerts: LossAlertItem[] = [];

  let totalFreshLossKg = 0;
  for (const r of freshRows) {
    totalFreshLossKg += r.lossKg;
    const fac = facilityMap.get(r.facility) || {
      lots: 0,
      inputFreshKg: 0,
      scaleDryInputKg: 0,
      lossKg: 0,
      outputDryKg: 0,
      recoverySum: 0,
      recoveryCount: 0,
    };
    fac.lots += 1;
    fac.inputFreshKg += r.weightKg;
    fac.scaleDryInputKg += r.scaleDryInputKg;
    fac.lossKg += r.lossKg;
    fac.outputDryKg += r.outputDryKg;
    if (r.recoveryPercent > 0) {
      fac.recoverySum += r.recoveryPercent;
      fac.recoveryCount += 1;
    }
    facilityMap.set(r.facility, fac);

    if (r.kcsTotalYield > 0 || r.kcsHeadRice > 0 || r.kcsLossPercent > 0) {
      const k = kcsMap.get(r.variety) || { count: 0, lossSum: 0, yieldSum: 0, headSum: 0 };
      k.count += 1;
      k.lossSum += r.kcsLossPercent;
      k.yieldSum += r.kcsTotalYield;
      k.headSum += r.kcsHeadRice;
      kcsMap.set(r.variety, k);
    }

    const isScaleErr = normalizeHeader(r.scaleNote).includes('LỖI');
    const isHighLoss = Math.abs(r.lossKg) > 200 || Math.abs(r.lossPercent) > 0.5;
    if (isScaleErr || isHighLoss) {
      lossAlerts.push({
        source: 'Lúa Tươi',
        date: r.dateStr,
        lotCode: r.lotCode,
        supplier: r.supplier,
        vehicle: r.vehicle,
        buyer: r.buyer,
        variety: r.variety,
        weightKg: r.weightKg,
        lossKg: r.lossKg,
        lossPercent: Number(r.lossPercent.toFixed(3)),
        note: r.scaleNote || '-',
        reason: isScaleErr ? 'Cân lỗi / Chênh lệch' : 'Hao hụt cao (>0.5% hoặc >200kg)',
      });
    }
  }

  let totalDryLossKg = 0;
  for (const r of dryRows) {
    totalDryLossKg += r.lossKg;
    const lossPct = r.weightKg > 0 ? (r.lossKg / r.weightKg) * 100 : 0;
    if (Math.abs(r.lossKg) > 200 || Math.abs(lossPct) > 0.5) {
      lossAlerts.push({
        source: 'Lúa Khô',
        date: r.dateStr,
        lotCode: r.lotCode,
        supplier: r.supplier,
        vehicle: r.vehicle,
        buyer: r.buyer,
        variety: r.variety,
        weightKg: r.weightKg,
        lossKg: r.lossKg,
        lossPercent: Number(lossPct.toFixed(3)),
        note: '-',
        reason: 'Hao hụt lúa khô cao',
      });
    }
  }

  lossAlerts.sort((a, b) => Math.abs(b.lossKg) - Math.abs(a.lossKg));

  const facilities: FacilityDryStat[] = Array.from(facilityMap.entries())
    .map(([facility, f]) => ({
      facility,
      lots: f.lots,
      inputFreshKg: f.inputFreshKg,
      scaleDryInputKg: f.scaleDryInputKg,
      lossKg: f.lossKg,
      lossPercent:
        f.inputFreshKg > 0 ? Number(((f.lossKg / f.inputFreshKg) * 100).toFixed(3)) : 0,
      outputDryKg: f.outputDryKg,
      avgRecoveryPercent:
        f.recoveryCount > 0 ? Number((f.recoverySum / f.recoveryCount).toFixed(2)) : 0,
    }))
    .sort((a, b) => b.inputFreshKg - a.inputFreshKg);

  const kcsByVariety = Array.from(kcsMap.entries())
    .map(([variety, k]) => ({
      variety,
      sampleCount: k.count,
      avgLossPercent: k.count > 0 ? Number((k.lossSum / k.count).toFixed(2)) : 0,
      avgTotalYieldKg: k.count > 0 ? Number((k.yieldSum / k.count).toFixed(2)) : 0,
      avgHeadRiceKg: k.count > 0 ? Number((k.headSum / k.count).toFixed(2)) : 0,
    }))
    .sort((a, b) => b.sampleCount - a.sampleCount);

  // 5. Milling Progress
  let milledLots = 0;
  let unmilledLots = 0;
  let milledWeight = 0;
  let freshMilledMay1Kg = 0;
  let freshMilledMay2Kg = 0;
  let freshMilledNsxKg = 0;
  let dryMilledKg = 0;
  let unmilledFreshKg = 0;
  let unmilledDryKg = 0;
  let storageDaysSum = 0;
  let storageDaysCount = 0;
  const unmilledItems: UnmilledLotItem[] = [];

  for (const r of freshRows) {
    const isMilled = Boolean(r.milledMay1 || r.milledMay2 || r.milledNsx);
    if (isMilled) {
      milledLots += 1;
      milledWeight += r.weightKg;
      if (r.milledMay1) freshMilledMay1Kg += r.weightKg;
      else if (r.milledMay2) freshMilledMay2Kg += r.weightKg;
      else if (r.milledNsx) freshMilledNsxKg += r.weightKg;

      if (r.milledTimestamp && r.milledTimestamp >= r.timestamp) {
        storageDaysSum += (r.milledTimestamp - r.timestamp) / 86400000;
        storageDaysCount += 1;
      }
    } else {
      unmilledLots += 1;
      unmilledFreshKg += r.weightKg;
      unmilledItems.push({
        source: 'Lúa Tươi',
        date: r.dateStr,
        lotCode: r.lotCode,
        supplier: r.supplier,
        variety: r.variety,
        weightKg: r.weightKg,
        buyer: r.buyer,
        facility: r.facility,
      });
    }
  }

  for (const r of dryRows) {
    const isMilled = Boolean(r.milledDate);
    if (isMilled) {
      milledLots += 1;
      milledWeight += r.weightKg;
      dryMilledKg += r.weightKg;
      if (r.milledTimestamp && r.milledTimestamp >= r.timestamp) {
        storageDaysSum += (r.milledTimestamp - r.timestamp) / 86400000;
        storageDaysCount += 1;
      }
    } else {
      unmilledLots += 1;
      unmilledDryKg += r.weightKg;
      unmilledItems.push({
        source: 'Lúa Khô',
        date: r.dateStr,
        lotCode: r.lotCode,
        supplier: r.supplier,
        variety: r.variety,
        weightKg: r.weightKg,
        buyer: r.buyer,
        facility: r.facility,
      });
    }
  }

  // 6. Financial & Debt
  let totalAdvance = 0;
  let totalDepositDeducted = 0;
  let totalPayable = 0;
  let paidCount = 0;
  let unpaidCount = 0;
  let unpaidAmount = 0;
  let refundCount = 0;
  let refundAmount = 0;
  const bankMap = new Map<string, { count: number; totalPaid: number }>();
  const debtAlerts: DebtAlertItem[] = [];

  const processFinRow = (
    source: 'Lúa Tươi' | 'Lúa Khô',
    r: {
      dateStr: string;
      lotCode: string;
      supplier: string;
      buyer: string;
      riceAmount: number;
      advance: number;
      depositDeducted: number;
      payable: number;
      bank: string;
      paymentDate: string;
    }
  ) => {
    totalAdvance += r.advance;
    totalDepositDeducted += r.depositDeducted;
    totalPayable += r.payable;

    const b = bankMap.get(r.bank) || { count: 0, totalPaid: 0 };
    b.count += 1;
    b.totalPaid += r.payable;
    bankMap.set(r.bank, b);

    const hasPayDate = Boolean(r.paymentDate && r.paymentDate !== '-');
    if (r.payable < 0) {
      refundCount += 1;
      refundAmount += Math.abs(r.payable);
      debtAlerts.push({
        source,
        date: r.dateStr,
        lotCode: r.lotCode,
        supplier: r.supplier,
        buyer: r.buyer,
        amount: r.riceAmount,
        advance: r.advance,
        depositDeducted: r.depositDeducted,
        payable: r.payable,
        bank: r.bank,
        paymentDate: r.paymentDate || '-',
        alertType: 'Số tiền âm / Hoàn tiền',
      });
    } else if (!hasPayDate && r.payable > 0) {
      unpaidCount += 1;
      unpaidAmount += r.payable;
      debtAlerts.push({
        source,
        date: r.dateStr,
        lotCode: r.lotCode,
        supplier: r.supplier,
        buyer: r.buyer,
        amount: r.riceAmount,
        advance: r.advance,
        depositDeducted: r.depositDeducted,
        payable: r.payable,
        bank: r.bank,
        paymentDate: '-',
        alertType: 'Chưa thanh toán',
      });
    } else {
      paidCount += 1;
    }
  };

  for (const r of freshRows) processFinRow('Lúa Tươi', r);
  for (const r of dryRows) processFinRow('Lúa Khô', r);

  const banks = Array.from(bankMap.entries())
    .map(([bank, v]) => ({ bank, count: v.count, totalPaid: v.totalPaid }))
    .sort((a, b) => b.totalPaid - a.totalPaid);

  let inContractKg = 0;
  let outsideContractKg = 0;
  for (const r of freshRows) {
    if (isOutsideContractCode(r.contractNo)) outsideContractKg += r.weightKg;
    else inContractKg += r.weightKg;
  }
  for (const r of dryRows) {
    if (isOutsideContractCode(r.contractNo)) outsideContractKg += r.weightKg;
    else inContractKg += r.weightKg;
  }

  const contractsStats =
    allContracts.length > 0
      ? buildContractMonthlyStats({
          allRows: allContracts,
          monthKey: selectedMonth,
          inContractKg,
          outsideContractKg,
          actualVarieties: varieties,
        })
      : undefined;

  return {
    monthKey: selectedMonth,
    availableMonths,
    hasFreshFile: freshRows.length > 0 || allFresh.length > 0,
    hasDryFile: dryRows.length > 0 || allDry.length > 0,
    hasContractFile: allContracts.length > 0,
    contracts: contractsStats,
    overview: {
      monthKey: selectedMonth,
      freshLots: freshRows.length,
      freshTotalKg,
      freshTotalAmount,
      freshAvgPrice: freshTotalKg > 0 ? Math.round(freshTotalAmount / freshTotalKg) : 0,
      dryLots: dryRows.length,
      dryTotalKg,
      dryTotalAmount,
      dryAvgPrice: dryTotalKg > 0 ? Math.round(dryTotalAmount / dryTotalKg) : 0,
      combinedTotalKg,
      combinedTotalLots: freshRows.length + dryRows.length,
      combinedTotalAmount: freshTotalAmount + dryTotalAmount,
    },
    varieties,
    dailyTrend,
    buyers,
    suppliers,
    regions,
    costBreakdown,
    facilities,
    kcsByVariety,
    lossAlerts: lossAlerts.slice(0, 150),
    totalFreshLossKg,
    totalFreshLossPercent:
      freshTotalKg > 0 ? Number(((totalFreshLossKg / freshTotalKg) * 100).toFixed(3)) : 0,
    totalDryLossKg,
    totalDryLossPercent:
      dryTotalKg > 0 ? Number(((totalDryLossKg / dryTotalKg) * 100).toFixed(3)) : 0,
    milling: {
      totalLots: freshRows.length + dryRows.length,
      milledLots,
      unmilledLots,
      milledPercentByWeight:
        combinedTotalKg > 0 ? Number(((milledWeight / combinedTotalKg) * 100).toFixed(2)) : 0,
      freshMilledMay1Kg,
      freshMilledMay2Kg,
      freshMilledNsxKg,
      dryMilledKg,
      unmilledFreshKg,
      unmilledDryKg,
      avgStorageDays:
        storageDaysCount > 0 ? Number((storageDaysSum / storageDaysCount).toFixed(1)) : 0,
      unmilledItems: unmilledItems.slice(0, 200),
    },
    financial: {
      totalAmount: freshTotalAmount + dryTotalAmount,
      totalAdvance,
      totalDepositDeducted,
      totalPayable,
      paidCount,
      unpaidCount,
      unpaidAmount,
      refundCount,
      refundAmount,
      banks,
      debtAlerts: debtAlerts.slice(0, 150),
    },
  };
}
