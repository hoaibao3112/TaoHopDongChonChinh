import * as XLSX from 'xlsx';
import {
  ContractDepositAlert,
  ContractForecastPoint,
  ContractKcsStat,
  ContractMonthlyStats,
  ContractPriceCompareItem,
  ContractSupplierStat,
  RiceVarietyStat,
} from './types';

function normText(val: unknown): string {
  return String(val ?? '')
    .replace(/\r?\n/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normHeader(val: unknown): string {
  return normText(val).toUpperCase();
}

function toNum(val: unknown): number {
  if (typeof val === 'number') return Number.isFinite(val) ? val : 0;
  const s = String(val ?? '').trim();
  if (!s) return 0;
  const cleaned = s.replace(/,/g, '').replace(/[^\d.-]/g, '');
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

function parseDateInfo(val: unknown): {
  dateStr: string;
  monthKey: string;
  timestamp: number;
} | null {
  if (val === null || val === undefined || val === '') return null;
  if (typeof val === 'number' && Number.isFinite(val) && val > 20000 && val < 90000) {
    const d = new Date(Math.floor(val - 25569) * 86400 * 1000);
    if (!Number.isNaN(d.getTime())) {
      const dd = d.getUTCDate();
      const mm = d.getUTCMonth() + 1;
      const yyyy = d.getUTCFullYear();
      return {
        dateStr: `${String(dd).padStart(2, '0')}/${String(mm).padStart(2, '0')}/${yyyy}`,
        monthKey: `${String(mm).padStart(2, '0')}/${yyyy}`,
        timestamp: d.getTime(),
      };
    }
  }
  const s = normText(val);
  const dmy = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
  if (dmy) {
    const dd = Number(dmy[1]);
    const mm = Number(dmy[2]);
    let yyyy = Number(dmy[3]);
    if (yyyy < 100) yyyy += 2000;
    if (mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31) {
      return {
        dateStr: `${String(dd).padStart(2, '0')}/${String(mm).padStart(2, '0')}/${yyyy}`,
        monthKey: `${String(mm).padStart(2, '0')}/${yyyy}`,
        timestamp: Date.UTC(yyyy, mm - 1, dd),
      };
    }
  }
  return null;
}

export interface ParsedContractRow {
  kcs: string;
  signDate: string;
  signMonthKey: string;
  contractNo: string;
  priceType: string;
  supplier: string;
  riceForm: string;
  variety: string;
  expectedDate: string;
  expectedMonthKey: string;
  expectedTs: number | null;
  contractKg: number;
  unitPrice: number;
  contractAmount: number;
  deposit: number;
  depositBank: string;
  depositDeducted: number;
  depositRemaining: number;
  receivedKg: number;
  remainingKg: number;
  status: string;
}

export function parseContractWorkbook(buffer: Buffer): ParsedContractRow[] {
  const wb = XLSX.read(buffer, { type: 'buffer' });
  const sheetName =
    wb.SheetNames.find((n) => normHeader(n).includes('CHI TIẾT HĐ 2026')) ||
    wb.SheetNames.find((n) => normHeader(n).includes('CHI TIẾT HĐ')) ||
    wb.SheetNames[0];
  if (!sheetName) return [];

  const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[sheetName], {
    header: 1,
    defval: '',
  });

  let headerIdx = -1;
  for (let i = 0; i < Math.min(10, rows.length); i++) {
    const joined = (rows[i] || []).map(normHeader).join(' | ');
    if (joined.includes('SỐ HĐ') && joined.includes('NHÀ CUNG CẤP')) {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx === -1) return [];

  const headers = (rows[headerIdx] || []).map(normHeader);
  const findCol = (patterns: string[], fallback: number): number => {
    for (const p of patterns) {
      const idx = headers.findIndex((h) => h.includes(p));
      if (idx !== -1) return idx;
    }
    return fallback;
  };

  const cKcs = findCol(['KCS KÝ HĐ', 'KCS'], 0);
  const cSignDate = findCol(['NGÀY KÝ'], 1);
  const cContractNo = findCol(['SỐ HĐ'], 2);
  const cPriceType = findCol(['LOẠI HỢP ĐỒNG (GIÁ)', 'LOẠI HỢP ĐỒNG'], 3);
  const cSupplier = findCol(['NHÀ CUNG CẤP'], 4);
  const cRiceForm = findCol(['LOẠI HỢP ĐỒNG (LÚA)'], 5);
  const cVariety = findCol(['LOẠI LÚA'], 6);
  const cExpected = findCol(['NGÀY NHẬN HÀNG DỰ KIẾN', 'NGÀY NHẬN HÀNG', 'NGÀY THU HOẠCH'], 7);
  const cContractKg = findCol(['SỐ LƯỢNG HĐ KG', 'SỐ LƯỢNG HĐ'], 8);
  const cUnitPrice = findCol(['ĐƠN GIÁ'], 9);
  const cAmount = findCol(['THÀNH TIỀN LÚA'], 10);
  const cDeposit = findCol(['TIỀN CỌC'], 13);
  const cBank = findCol(['NGÂN HÀNG CHUYỂN', 'NGÂN HÀNG'], 15);
  const cDeducted = findCol(['TRỪ CỌC'], 16);
  const cDepositRem = findCol(['TIỀN CỌC CÒN LẠI', 'CÒN LẠI'], 19);
  const cReceivedKg = findCol(['SỐ LƯỢNG THỰC TẾ NHẬN'], 20);
  const cRemainingKg = findCol(['SỐ LƯỢNG CÒN LẠI'], 21);
  const cStatus = findCol(['TRẠNG THÁI HĐ'], 22);

  const result: ParsedContractRow[] = [];
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const r = rows[i] || [];
    const supplier = normText(r[cSupplier]);
    const contractNo = normText(r[cContractNo]);
    const contractKg = toNum(r[cContractKg]);
    if (!supplier && !contractNo && contractKg <= 0) continue;

    const signInfo = parseDateInfo(r[cSignDate]);
    const expInfo = parseDateInfo(r[cExpected]);
    const receivedKg = toNum(r[cReceivedKg]);
    const rawRemKg = toNum(r[cRemainingKg]);
    const remainingKg = rawRemKg !== 0 ? rawRemKg : Math.max(0, contractKg - receivedKg);
    const deposit = toNum(r[cDeposit]);
    const depositDeducted = toNum(r[cDeducted]);
    const rawDepRem = toNum(r[cDepositRem]);
    const depositRemaining = rawDepRem !== 0 ? rawDepRem : Math.max(0, deposit - depositDeducted);

    result.push({
      kcs: normText(r[cKcs]) || 'Chưa rõ',
      signDate: signInfo?.dateStr || normText(r[cSignDate]) || '-',
      signMonthKey: signInfo?.monthKey || '',
      contractNo: contractNo || '-',
      priceType: normText(r[cPriceType]) || 'Chưa phân loại',
      supplier: supplier || 'Chưa rõ',
      riceForm: normText(r[cRiceForm]) || 'LÚA TƯƠI',
      variety: normText(r[cVariety]) || 'Chưa rõ',
      expectedDate: expInfo?.dateStr || normText(r[cExpected]) || '-',
      expectedMonthKey: expInfo?.monthKey || '',
      expectedTs: expInfo?.timestamp ?? null,
      contractKg,
      unitPrice: toNum(r[cUnitPrice]),
      contractAmount: toNum(r[cAmount]),
      deposit,
      depositBank: normText(r[cBank]) || 'Chưa rõ',
      depositDeducted,
      depositRemaining,
      receivedKg,
      remainingKg,
      status: normText(r[cStatus]) || (remainingKg <= 0 && contractKg > 0 ? 'HẾT HĐ' : 'ĐANG THỰC HIỆN'),
    });
  }
  return result;
}

export function buildContractMonthlyStats(params: {
  allRows: ParsedContractRow[];
  monthKey: string;
  inContractKg: number;
  outsideContractKg: number;
  actualVarieties: RiceVarietyStat[];
}): ContractMonthlyStats {
  const { allRows, monthKey, inContractKg, outsideContractKg, actualVarieties } = params;

  const rows =
    monthKey === 'ALL'
      ? allRows
      : allRows.filter(
          (r) => r.expectedMonthKey === monthKey || (!r.expectedMonthKey && r.signMonthKey === monthKey)
        );

  const totalContractKg = rows.reduce((s, r) => s + r.contractKg, 0);
  const totalReceivedKg = rows.reduce((s, r) => s + r.receivedKg, 0);
  const totalRemainingKg = rows.reduce((s, r) => s + r.remainingKg, 0);
  const totalContractAmount = rows.reduce((s, r) => s + r.contractAmount, 0);
  const totalDeposit = rows.reduce((s, r) => s + r.deposit, 0);
  const totalDepositDeducted = rows.reduce((s, r) => s + r.depositDeducted, 0);
  const totalDepositRemaining = rows.reduce((s, r) => s + r.depositRemaining, 0);

  const priceTypeMap = new Map<string, { count: number; contractKg: number }>();
  const riceFormMap = new Map<string, { count: number; contractKg: number }>();
  const statusMap = new Map<string, { count: number; contractKg: number }>();
  const bankMap = new Map<string, { count: number; totalDeposit: number }>();
  const kcsMap = new Map<string, ContractKcsStat>();
  const supMap = new Map<string, ContractSupplierStat>();
  const forecastMap = new Map<string, ContractForecastPoint>();
  const varietyPriceMap = new Map<string, { kg: number; weightedPriceSum: number }>();
  const depositAlerts: ContractDepositAlert[] = [];

  const todayTs = Date.now();

  for (const r of rows) {
    const pt = priceTypeMap.get(r.priceType) || { count: 0, contractKg: 0 };
    pt.count += 1;
    pt.contractKg += r.contractKg;
    priceTypeMap.set(r.priceType, pt);

    const rf = riceFormMap.get(r.riceForm) || { count: 0, contractKg: 0 };
    rf.count += 1;
    rf.contractKg += r.contractKg;
    riceFormMap.set(r.riceForm, rf);

    const st = statusMap.get(r.status) || { count: 0, contractKg: 0 };
    st.count += 1;
    st.contractKg += r.contractKg;
    statusMap.set(r.status, st);

    if (r.deposit > 0) {
      const bk = bankMap.get(r.depositBank) || { count: 0, totalDeposit: 0 };
      bk.count += 1;
      bk.totalDeposit += r.deposit;
      bankMap.set(r.depositBank, bk);
    }

    const k = kcsMap.get(r.kcs) || {
      kcs: r.kcs,
      contractCount: 0,
      totalContractKg: 0,
      totalReceivedKg: 0,
      totalRemainingKg: 0,
      completionPercent: 0,
      totalDeposit: 0,
      totalDepositRemaining: 0,
    };
    k.contractCount += 1;
    k.totalContractKg += r.contractKg;
    k.totalReceivedKg += r.receivedKg;
    k.totalRemainingKg += r.remainingKg;
    k.totalDeposit += r.deposit;
    k.totalDepositRemaining += r.depositRemaining;
    kcsMap.set(r.kcs, k);

    const sup = supMap.get(r.supplier) || {
      supplier: r.supplier,
      contractCount: 0,
      totalContractKg: 0,
      totalReceivedKg: 0,
      totalRemainingKg: 0,
      completionPercent: 0,
      totalDeposit: 0,
      totalDepositRemaining: 0,
    };
    sup.contractCount += 1;
    sup.totalContractKg += r.contractKg;
    sup.totalReceivedKg += r.receivedKg;
    sup.totalRemainingKg += r.remainingKg;
    sup.totalDeposit += r.deposit;
    sup.totalDepositRemaining += r.depositRemaining;
    supMap.set(r.supplier, sup);

    if (r.expectedDate !== '-' && r.expectedTs) {
      const fc = forecastMap.get(r.expectedDate) || {
        date: r.expectedDate,
        expectedKg: 0,
        remainingKg: 0,
        contractCount: 0,
      };
      fc.expectedKg += r.contractKg;
      fc.remainingKg += r.remainingKg;
      fc.contractCount += 1;
      forecastMap.set(r.expectedDate, fc);
    }

    if (r.unitPrice > 0 && r.contractKg > 0) {
      const vp = varietyPriceMap.get(r.variety) || { kg: 0, weightedPriceSum: 0 };
      vp.kg += r.contractKg;
      vp.weightedPriceSum += r.contractKg * r.unitPrice;
      varietyPriceMap.set(r.variety, vp);
    }

    const isOverdue = Boolean(r.expectedTs && r.expectedTs < todayTs && r.remainingKg > 0);
    if (r.depositRemaining > 0 || isOverdue) {
      depositAlerts.push({
        contractNo: r.contractNo,
        signDate: r.signDate,
        expectedDate: r.expectedDate,
        supplier: r.supplier,
        kcs: r.kcs,
        variety: r.variety,
        contractKg: r.contractKg,
        remainingKg: r.remainingKg,
        deposit: r.deposit,
        depositDeducted: r.depositDeducted,
        depositRemaining: r.depositRemaining,
        status: r.status,
        alertReason: isOverdue ? 'Quá ngày dự kiến vẫn còn hàng/cọc' : 'Còn tiền cọc chưa trừ hết',
      });
    }
  }

  const kcsRanking = Array.from(kcsMap.values())
    .map((k) => ({
      ...k,
      completionPercent:
        k.totalContractKg > 0 ? Number(((k.totalReceivedKg / k.totalContractKg) * 100).toFixed(1)) : 0,
    }))
    .sort((a, b) => b.totalContractKg - a.totalContractKg);

  const supplierRanking = Array.from(supMap.values())
    .map((s) => ({
      ...s,
      completionPercent:
        s.totalContractKg > 0 ? Number(((s.totalReceivedKg / s.totalContractKg) * 100).toFixed(1)) : 0,
    }))
    .sort((a, b) => b.totalContractKg - a.totalContractKg);

  const forecastByDate = Array.from(forecastMap.values()).sort((a, b) => {
    const [da, ma, ya] = a.date.split('/').map(Number);
    const [db, mb, yb] = b.date.split('/').map(Number);
    return Date.UTC(ya, ma - 1, da) - Date.UTC(yb, mb - 1, db);
  });

  depositAlerts.sort((a, b) => b.depositRemaining - a.depositRemaining);

  const priceComparison: ContractPriceCompareItem[] = [];
  const actualMap = new Map(actualVarieties.map((v) => [normHeader(v.variety), v]));
  for (const [variety, vp] of varietyPriceMap.entries()) {
    const avgContractPrice = vp.kg > 0 ? Math.round(vp.weightedPriceSum / vp.kg) : 0;
    const act = actualMap.get(normHeader(variety));
    const avgActualPrice = act?.avgPrice || 0;
    priceComparison.push({
      variety,
      contractKg: vp.kg,
      avgContractPrice,
      actualKg: act?.totalKg || 0,
      avgActualPrice,
      priceDiff: avgActualPrice > 0 && avgContractPrice > 0 ? avgActualPrice - avgContractPrice : 0,
    });
  }
  priceComparison.sort((a, b) => b.contractKg - a.contractKg);

  const totalActualIntake = inContractKg + outsideContractKg;

  return {
    totalContracts: rows.length,
    totalContractKg,
    totalReceivedKg,
    totalRemainingKg,
    completionPercent:
      totalContractKg > 0 ? Number(((totalReceivedKg / totalContractKg) * 100).toFixed(1)) : 0,
    totalContractAmount,
    totalDeposit,
    totalDepositDeducted,
    totalDepositRemaining,
    depositRecoveryPercent:
      totalDeposit > 0 ? Number(((totalDepositDeducted / totalDeposit) * 100).toFixed(1)) : 0,
    byPriceType: Array.from(priceTypeMap.entries())
      .map(([label, v]) => ({ label, ...v }))
      .sort((a, b) => b.contractKg - a.contractKg),
    byRiceForm: Array.from(riceFormMap.entries())
      .map(([label, v]) => ({ label, ...v }))
      .sort((a, b) => b.contractKg - a.contractKg),
    byStatus: Array.from(statusMap.entries())
      .map(([label, v]) => ({ label, ...v }))
      .sort((a, b) => b.contractKg - a.contractKg),
    depositBanks: Array.from(bankMap.entries())
      .map(([bank, v]) => ({ bank, ...v }))
      .sort((a, b) => b.totalDeposit - a.totalDeposit),
    kcsRanking,
    supplierRanking,
    forecastByDate,
    depositAlerts: depositAlerts.slice(0, 120),
    crossCheck: {
      inContractKg,
      outsideContractKg,
      inContractPercent:
        totalActualIntake > 0 ? Number(((inContractKg / totalActualIntake) * 100).toFixed(1)) : 0,
      priceComparison: priceComparison.slice(0, 15),
    },
  };
}
