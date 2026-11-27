import * as XLSX from 'xlsx';
import {
  AuditCategory,
  AuditSeverity,
  AvailableAuditMonth,
  CustomerPrefixMapping,
  RiceAuditIssue,
  RiceAuditResult,
  RiceFileSource,
} from './types';

export interface AnalyzeAuditOptions {
  freshBuffer?: Uint8Array | Buffer | null;
  dryBuffer?: Uint8Array | Buffer | null;
  priceDeviationPct?: number; // Mặc định 6%
}

interface ParsedRow {
  rowNumber: number;
  dateSerial: number | null;
  dateStr: string;
  monthKey: string;
  dmy: string | null;
  buyer: string;
  customerRaw: string;
  customerNorm: string;
  customerToneNorm: string;
  riceType: string;
  lotCode: string;
  quantityKg: number | null;
  price: number | null;
  extraSale: number;
  totalAmount: number | null;
  advance: number;
  depositDeduct: number;
  paymentAmount: number | null;
  bank: string;
  payDate: string;
  hasFormulaError: boolean;
  formulaErrorCol: string;
  totalHardcoded: boolean;
  paymentHardcoded: boolean;
}

function normHeader(v: unknown): string {
  return String(v ?? '')
    .replace(/\r?\n/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

function excelSerialToDate(serial: unknown): Date | null {
  if (typeof serial !== 'number' || isNaN(serial) || serial < 20000 || serial > 80000) return null;
  const utcDays = Math.floor(serial - 25569);
  return new Date(utcDays * 86400 * 1000);
}

function formatDateVN(d: Date | null): string {
  if (!d) return '';
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const yyyy = d.getUTCFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

function formatDMY(d: Date | null): string | null {
  if (!d) return null;
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const yy = String(d.getUTCFullYear()).slice(-2);
  return `${dd}${mm}${yy}`;
}

function formatMonthKey(d: Date | null): string {
  if (!d) return '';
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const yyyy = d.getUTCFullYear();
  return `${yyyy}-${mm}`;
}

function toNumberOrNull(v: unknown): number | null {
  if (typeof v === 'number' && !isNaN(v)) return v;
  if (typeof v === 'string') {
    const s = v.trim().replace(/,/g, '');
    if (!s) return null;
    const n = Number(s);
    return isNaN(n) ? null : n;
  }
  return null;
}

function normalizeSpaceUpper(s: string): string {
  return s.trim().replace(/\s+/g, ' ').toUpperCase();
}

/**
 * Chuẩn hóa tiếng Việt để phát hiện biến thể gõ dấu khác nhau (vd: THỦY vs THUỶ, HÒA vs HOÀ)
 */
function normalizeToneAndCase(s: string): string {
  return normalizeSpaceUpper(s)
    .normalize('NFC')
    .replace(/UỶ/g, 'ỦY')
    .replace(/UỸ/g, 'ŨY')
    .replace(/UỲ/g, 'ÙY')
    .replace(/UÝ/g, 'ÚY')
    .replace(/UỴ/g, 'ỤY')
    .replace(/OÀ/g, 'ÒA')
    .replace(/OÁ/g, 'ÓA')
    .replace(/OẢ/g, 'ỎA')
    .replace(/OÃ/g, 'ÕA')
    .replace(/OẠ/g, 'ỌA')
    .replace(/OÈ/g, 'ÒE')
    .replace(/OÉ/g, 'ÓE')
    .replace(/OẺ/g, 'ỎE')
    .replace(/OẼ/g, 'ÕE')
    .replace(/OẸ/g, 'ỌE');
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > 2) return 3;
  const m = a.length;
  const n = b.length;
  const dp: number[] = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const temp = dp[j];
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + cost);
      prev = temp;
    }
  }
  return dp[n];
}

function median(nums: number[]): number {
  if (nums.length === 0) return 0;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function findHeaderRowAndSheet(
  wb: XLSX.WorkBook,
  preferredNames: string[]
): { sheetName: string; ws: XLSX.WorkSheet; headerIdx: number; headers: string[] } | null {
  const candidates = [
    ...preferredNames.filter((n) => wb.SheetNames.includes(n)),
    ...wb.SheetNames.filter((n) => !preferredNames.includes(n)),
  ];

  for (const sheetName of candidates) {
    const ws = wb.Sheets[sheetName];
    if (!ws) continue;
    const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' });
    for (let r = 0; r < Math.min(15, rows.length); r++) {
      const headers = (rows[r] || []).map(normHeader);
      const hasLot = headers.some((h) => h.includes('MÃ LÔ'));
      const hasCust = headers.some((h) => h.includes('KHÁCH HÀNG') || h.includes('NHÀ CUNG CẤP'));
      if (hasLot && hasCust) {
        return { sheetName, ws, headerIdx: r, headers };
      }
    }
  }
  return null;
}

function findCol(headers: string[], includesAny: string[], fallback: number): number {
  const idx = headers.findIndex((h) => includesAny.some((kw) => h.includes(kw)));
  return idx >= 0 ? idx : fallback;
}

function parseRowsFromWorkbook(
  buffer: Uint8Array | Buffer,
  source: RiceFileSource
): { sheetName: string; rows: ParsedRow[] } {
  const wb = XLSX.read(buffer, { type: 'array', cellFormula: true });
  const preferred = source === 'fresh' ? ['LUA TUOI (2)', 'LUA TUOI'] : ['LUA KHÔ 2026', 'LUA KHO 2026'];
  const found = findHeaderRowAndSheet(wb, preferred);
  if (!found) {
    throw new Error(
      source === 'fresh'
        ? 'Không tìm thấy sheet Lúa Tươi hợp lệ (cần có cột MÃ LÔ và KHÁCH HÀNG).'
        : 'Không tìm thấy sheet Lúa Khô hợp lệ (cần có cột MÃ LÔ và NHÀ CUNG CẤP).'
    );
  }

  const { sheetName, ws, headerIdx, headers } = found;
  const rawRows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' });

  const dateCol = findCol(headers, ['NGÀY CÂN'], 1);
  const buyerCol = findCol(headers, ['NHÂN VIÊN THU MUA'], 2);
  const custCol = findCol(headers, ['KHÁCH HÀNG', 'NHÀ CUNG CẤP'], 3);
  const typeCol = findCol(headers, ['LOẠI LÚA'], 5);
  const lotCol = findCol(headers, ['MÃ LÔ'], 6);
  const qtyCol = findCol(headers, ['SỐ LƯỢNG'], 7);
  const priceCol = findCol(
    headers,
    source === 'fresh' ? ['GIÁ HẾT PHÍ', 'GIÁ LÚA'] : ['GIÁ LÚA'],
    8
  );
  const extraCol = source === 'fresh' ? findCol(headers, ['SANG LÚA'], 9) : -1;
  const totalCol = findCol(
    headers,
    source === 'fresh' ? ['THÀNH TIỀN LỌT LÒNG', 'THÀNH TIỀN'] : ['THÀNH TIỀN LÚA', 'THÀNH TIỀN'],
    source === 'fresh' ? 10 : 9
  );
  const advanceCol = findCol(headers, ['TẠM ỨNG'], source === 'fresh' ? 12 : 10);
  const depositCol = findCol(headers, ['TRỪ CỌC'], source === 'fresh' ? 11 : 11);
  const paymentCol = findCol(headers, ['THANH TOÁN'], source === 'fresh' ? 13 : 12);
  const bankCol = findCol(headers, ['NGÂN HÀNG'], source === 'fresh' ? 14 : 13);
  const payDateCol = findCol(headers, ['NGÀY THANH TOÁN'], source === 'fresh' ? 15 : 14);

  const parsed: ParsedRow[] = [];
  const formulaErrRegex = /^#(REF|VALUE|NAME|DIV\/0|N\/A|NUM)!?\??$/i;

  for (let r = headerIdx + 1; r < rawRows.length; r++) {
    const row = rawRows[r] || [];
    const dateVal = row[dateCol];
    const custRaw = String(row[custCol] ?? '');
    const lotRaw = String(row[lotCol] ?? '').trim();
    const qtyVal = toNumberOrNull(row[qtyCol]);

    const hasCore =
      String(dateVal ?? '').trim() !== '' ||
      custRaw.trim() !== '' ||
      lotRaw !== '' ||
      (qtyVal !== null && qtyVal > 0);
    if (!hasCore) continue;

    let hasFormulaError = false;
    let formulaErrorCol = '';
    const checkLimit = Math.min(35, row.length);
    for (let c = 0; c < checkLimit; c++) {
      const s = String(row[c] ?? '').trim();
      if (formulaErrRegex.test(s)) {
        hasFormulaError = true;
        formulaErrorCol = headers[c] || XLSX.utils.encode_col(c);
        break;
      }
    }

    const dObj = excelSerialToDate(typeof dateVal === 'number' ? dateVal : Number(dateVal));
    const dateSerial = dObj ? Number(dateVal) : null;

    const totalAddr = XLSX.utils.encode_col(totalCol) + (r + 1);
    const payAddr = XLSX.utils.encode_col(paymentCol) + (r + 1);
    const totalCell = ws[totalAddr] as XLSX.CellObject | undefined;
    const payCell = ws[payAddr] as XLSX.CellObject | undefined;

    const priceVal = toNumberOrNull(row[priceCol]);
    const totalVal = toNumberOrNull(row[totalCol]);
    const payVal = toNumberOrNull(row[paymentCol]);

    parsed.push({
      rowNumber: r + 1,
      dateSerial,
      dateStr: dObj ? formatDateVN(dObj) : String(dateVal ?? '').trim(),
      monthKey: formatMonthKey(dObj),
      dmy: formatDMY(dObj),
      buyer: String(row[buyerCol] ?? '').trim(),
      customerRaw: custRaw,
      customerNorm: normalizeSpaceUpper(custRaw),
      customerToneNorm: normalizeToneAndCase(custRaw),
      riceType: String(row[typeCol] ?? '').trim().toUpperCase(),
      lotCode: lotRaw,
      quantityKg: qtyVal,
      price: priceVal,
      extraSale: extraCol >= 0 ? toNumberOrNull(row[extraCol]) ?? 0 : 0,
      totalAmount: totalVal,
      advance: toNumberOrNull(row[advanceCol]) ?? 0,
      depositDeduct: toNumberOrNull(row[depositCol]) ?? 0,
      paymentAmount: payVal,
      bank: String(row[bankCol] ?? '').trim(),
      payDate: String(row[payDateCol] ?? '').trim(),
      hasFormulaError,
      formulaErrorCol,
      totalHardcoded: Boolean(totalCell && !totalCell.f && qtyVal && qtyVal > 0 && priceVal && priceVal > 0),
      paymentHardcoded: Boolean(payCell && !payCell.f && totalVal && totalVal > 0),
    });
  }

  return { sheetName, rows: parsed };
}

function auditSingleSheet(
  source: RiceFileSource,
  sheetName: string,
  rows: ParsedRow[],
  priceDeviationPct: number
): { issues: RiceAuditIssue[]; mappings: CustomerPrefixMapping[] } {
  const sourceLabel = source === 'fresh' ? 'Lúa Tươi' : 'Lúa Khô';
  const issues: RiceAuditIssue[] = [];
  let issueSeq = 0;

  const pushIssue = (
    row: ParsedRow,
    category: AuditCategory,
    severity: AuditSeverity,
    code: string,
    title: string,
    detail: string,
    suggestion: string,
    expectedPrice?: number | null
  ) => {
    issueSeq++;
    issues.push({
      id: `${source}-${row.rowNumber}-${code}-${issueSeq}`,
      source,
      sourceLabel,
      sheetName,
      rowNumber: row.rowNumber,
      category,
      severity,
      code,
      title,
      detail,
      suggestion,
      dateStr: row.dateStr,
      monthKey: row.monthKey,
      buyer: row.buyer,
      customer: row.customerRaw.trim(),
      riceType: row.riceType,
      lotCode: row.lotCode,
      quantityKg: row.quantityKg,
      price: row.price,
      expectedPrice,
      totalAmount: row.totalAmount,
      paymentAmount: row.paymentAmount,
    });
  };

  // Chỉ số thống kê toàn sheet
  const lotCount = new Map<string, number[]>();
  const custVariants = new Map<string, Set<string>>();
  const custToneCount = new Map<string, number>();
  const custPrefixCounts = new Map<string, Map<string, number>>();
  const prefixCustCounts = new Map<string, Map<string, number>>();
  const pricePointsByType = new Map<string, { dateSerial: number | null; price: number }[]>();

  const lotRegex = /^([A-ZÀ-ỸĐ0-9]+?)(\d{6})(\d{2,3})$/i;

  for (const row of rows) {
    if (row.lotCode) {
      if (!lotCount.has(row.lotCode)) lotCount.set(row.lotCode, []);
      lotCount.get(row.lotCode)!.push(row.rowNumber);

      const m = row.lotCode.match(lotRegex);
      if (m && row.customerToneNorm) {
        const prefix = m[1].toUpperCase();
        if (!custPrefixCounts.has(row.customerToneNorm)) {
          custPrefixCounts.set(row.customerToneNorm, new Map());
        }
        const pm = custPrefixCounts.get(row.customerToneNorm)!;
        pm.set(prefix, (pm.get(prefix) || 0) + 1);

        if (!prefixCustCounts.has(prefix)) {
          prefixCustCounts.set(prefix, new Map());
        }
        const cm = prefixCustCounts.get(prefix)!;
        cm.set(row.customerToneNorm, (cm.get(row.customerToneNorm) || 0) + 1);
      }
    }

    if (row.customerToneNorm) {
      if (!custVariants.has(row.customerToneNorm)) {
        custVariants.set(row.customerToneNorm, new Set());
      }
      custVariants.get(row.customerToneNorm)!.add(row.customerRaw);
      custToneCount.set(row.customerToneNorm, (custToneCount.get(row.customerToneNorm) || 0) + 1);
    }

    if (row.riceType && row.price !== null && row.price >= 1000 && row.price <= 20000) {
      if (!pricePointsByType.has(row.riceType)) pricePointsByType.set(row.riceType, []);
      pricePointsByType.get(row.riceType)!.push({ dateSerial: row.dateSerial, price: row.price });
    }
  }

  // Xác định tiền tố chính (dominant) cho từng khách hàng
  const dominantPrefixByCust = new Map<string, string>();
  const mappings: CustomerPrefixMapping[] = [];

  for (const [custTone, rowCount] of custToneCount.entries()) {
    const pm = custPrefixCounts.get(custTone) || new Map<string, number>();
    const prefixes = [...pm.entries()]
      .map(([prefix, count]) => ({ prefix, count }))
      .sort((a, b) => b.count - a.count);
    const dominantPrefix = prefixes[0]?.prefix || '';
    if (dominantPrefix) dominantPrefixByCust.set(custTone, dominantPrefix);

    mappings.push({
      customerNormalized: custTone,
      variants: [...(custVariants.get(custTone) || [])],
      prefixes,
      dominantPrefix,
      rowCount,
    });
  }

  // Danh sách khách hàng lớn (>= 5 dòng) để bắt lỗi gõ nhầm chính tả cho khách nhỏ (1-2 dòng)
  const majorCustomers = [...custToneCount.entries()]
    .filter(([, cnt]) => cnt >= 5)
    .map(([name]) => name);

  const typoMatchCache = new Map<string, string | null>();
  for (const [custTone, cnt] of custToneCount.entries()) {
    if (cnt > 2) continue;
    let bestMatch: string | null = null;
    let bestDist = 3;
    for (const major of majorCustomers) {
      if (major === custTone) continue;
      const d = levenshtein(custTone, major);
      if (d > 0 && d < bestDist) {
        bestDist = d;
        bestMatch = major;
      }
    }
    typoMatchCache.set(custTone, bestMatch);
  }

  // Kiểm tra từng dòng
  for (const row of rows) {
    // 1. MÃ LÔ
    if (!row.lotCode) {
      pushIssue(
        row,
        'lot_code',
        'error',
        'LOT_EMPTY',
        'Thiếu Mã Lô',
        `Dòng ${row.rowNumber} đã có thông tin nhưng để trống cột MÃ LÔ.`,
        'Bổ sung Mã Lô theo quy tắc [Viết tắt KH][DDMMYY][STT].'
      );
    } else {
      const dupRows = lotCount.get(row.lotCode) || [];
      if (dupRows.length > 1) {
        const others = dupRows.filter((r) => r !== row.rowNumber).join(', ');
        pushIssue(
          row,
          'lot_code',
          'error',
          'LOT_DUPLICATE',
          'Trùng Mã Lô',
          `Mã lô "${row.lotCode}" bị trùng với dòng ${others}.`,
          'Kiểm tra xem có copy nhầm dòng không và tăng số thứ tự cuối (01, 02...).'
        );
      }

      const m = row.lotCode.match(lotRegex);
      if (!m) {
        pushIssue(
          row,
          'lot_code',
          'warning',
          'LOT_BAD_FORMAT',
          'Sai định dạng Mã Lô',
          `Mã lô "${row.lotCode}" không đúng chuẩn [Chữ cái][6 số DDMMYY][2-3 số STT].`,
          row.dmy
            ? `Kiểm tra lại phần ngày (${row.dmy}) hoặc khoảng trắng/ký tự thừa trong mã lô.`
            : 'Kiểm tra lại cấu trúc mã lô.'
        );
      } else {
        const prefix = m[1].toUpperCase();
        const lotDmy = m[2];
        if (row.dmy && lotDmy !== row.dmy) {
          pushIssue(
            row,
            'lot_code',
            'error',
            'LOT_DATE_MISMATCH',
            'Mã Lô lệch Ngày Cân',
            `Ngày trong mã lô là "${lotDmy}" nhưng NGÀY CÂN là "${row.dateStr}" (${row.dmy}).`,
            `Đổi phần ngày trong mã lô thành ${row.dmy} (hoặc sửa lại NGÀY CÂN nếu nhập nhầm).`
          );
        }

        if (row.customerToneNorm) {
          const dom = dominantPrefixByCust.get(row.customerToneNorm);
          const pm = custPrefixCounts.get(row.customerToneNorm);
          const thisCount = pm?.get(prefix) || 0;
          const domCount = dom ? pm?.get(dom) || 0 : 0;

          if (dom && prefix !== dom && domCount >= 2 && thisCount < domCount) {
            pushIssue(
              row,
              'lot_code',
              'warning',
              'LOT_PREFIX_MISMATCH',
              'Tiền tố Mã Lô không khớp Khách Hàng',
              `Khách "${row.customerRaw.trim()}" thường dùng mã "${dom}" (${domCount} lần), nhưng dòng này dùng "${prefix}".`,
              `Kiểm tra xem có copy nhầm mã lô của khách khác không; nếu đúng khách này thì đổi thành "${dom}...".`
            );
          } else {
            const custsForPrefix = prefixCustCounts.get(prefix);
            if (custsForPrefix && custsForPrefix.size > 1) {
              const sortedCusts = [...custsForPrefix.entries()].sort((a, b) => b[1] - a[1]);
              const topCust = sortedCusts[0];
              if (topCust && topCust[0] !== row.customerToneNorm && topCust[1] >= 3) {
                pushIssue(
                  row,
                  'lot_code',
                  'warning',
                  'LOT_PREFIX_SHARED',
                  'Dùng nhầm Mã Lô của Khách khác',
                  `Tiền tố "${prefix}" chủ yếu là của "${topCust[0]}" (${topCust[1]} lần), không phải "${row.customerRaw.trim()}".`,
                  'Kiểm tra lại tên Khách Hàng hoặc sửa lại tiền tố Mã Lô cho đúng.'
                );
              }
            }
          }
        }
      }
    }

    // 2. KHÁCH HÀNG
    if (!row.customerRaw.trim()) {
      pushIssue(
        row,
        'customer',
        'error',
        'CUST_EMPTY',
        'Thiếu tên Khách Hàng / NCC',
        `Dòng ${row.rowNumber} đang để trống cột Khách hàng / Nhà cung cấp.`,
        'Điền đầy đủ tên Khách hàng / Nhà cung cấp.'
      );
    } else {
      if (row.customerRaw !== row.customerRaw.trim() || /\s{2,}/.test(row.customerRaw)) {
        pushIssue(
          row,
          'customer',
          'info',
          'CUST_WHITESPACE',
          'Tên Khách Hàng thừa khoảng trắng',
          `Tên "${row.customerRaw}" bị thừa dấu cách đầu/cuối hoặc có 2 dấu cách liên tiếp.`,
          `Chuẩn hóa thành "${row.customerRaw.trim().replace(/\s+/g, ' ')}" để không bị tách nhóm khi lọc.`
        );
      }

      const variants = custVariants.get(row.customerToneNorm);
      if (variants && variants.size > 1) {
        const normalizedVariants = new Set([...variants].map((v) => normalizeSpaceUpper(v)));
        if (normalizedVariants.size > 1 && row.customerNorm !== row.customerToneNorm) {
          pushIssue(
            row,
            'customer',
            'warning',
            'CUST_UNICODE_VARIANT',
            'Khác kiểu bỏ dấu tiếng Việt',
            `Tên "${row.customerRaw.trim()}" bị khác vị trí dấu thanh so với chuẩn "${row.customerToneNorm}".`,
            `Thống nhất 1 kiểu gõ dấu tiếng Việt ("${row.customerToneNorm}") để tổng hợp công nợ chính xác.`
          );
        }
      }

      const typoSuggestion = typoMatchCache.get(row.customerToneNorm);
      if (typoSuggestion) {
        pushIssue(
          row,
          'customer',
          'warning',
          'CUST_FUZZY_TYPO',
          'Nghi ngờ gõ sai chính tả Khách Hàng',
          `Tên "${row.customerRaw.trim()}" chỉ xuất hiện ít và rất giống khách quen "${typoSuggestion}".`,
          `Kiểm tra lại xem có phải gõ nhầm chính tả của "${typoSuggestion}" không.`
        );
      }
    }

    // 3. GIÁ TIỀN
    if (row.quantityKg !== null && row.quantityKg > 0) {
      if (row.price === null || row.price <= 0) {
        pushIssue(
          row,
          'price',
          'error',
          'PRICE_EMPTY_OR_ZERO',
          'Thiếu Giá Lúa hoặc Giá = 0',
          `Dòng ${row.rowNumber} có số lượng ${row.quantityKg.toLocaleString('vi-VN')} kg nhưng Giá đang trống hoặc <= 0.`,
          'Bổ sung đơn giá lúa chính xác.'
        );
      } else if (row.price < 1000 || row.price > 20000) {
        pushIssue(
          row,
          'price',
          'error',
          'PRICE_UNIT_SUSPECT',
          'Giá Lúa bất thường (nghi nhầm số 0)',
          `Giá ${row.price.toLocaleString('vi-VN')} đ/kg nằm ngoài ngưỡng thông thường (1.000 – 20.000 đ/kg).`,
          'Kiểm tra xem có gõ thiếu hoặc thừa chữ số 0 không.'
        );
      } else if (row.riceType) {
        const points = pricePointsByType.get(row.riceType) || [];
        let windowPrices =
          row.dateSerial !== null
            ? points
                .filter((p) => p.dateSerial !== null && Math.abs(p.dateSerial - row.dateSerial!) <= 14)
                .map((p) => p.price)
            : [];
        if (windowPrices.length < 3) {
          windowPrices = points.map((p) => p.price);
        }
        if (windowPrices.length >= 3) {
          const med = median(windowPrices);
          if (med > 0) {
            const diffPct = (Math.abs(row.price - med) / med) * 100;
            if (diffPct > priceDeviationPct) {
              const sign = row.price > med ? 'cao hơn' : 'thấp hơn';
              pushIssue(
                row,
                'price',
                'warning',
                'PRICE_OUTLIER',
                `Giá ${sign} mặt bằng ${diffPct.toFixed(1)}%`,
                `Giá ${row.price.toLocaleString('vi-VN')} đ/kg của giống "${row.riceType}" ${sign} trung vị cùng kỳ (${Math.round(med).toLocaleString('vi-VN')} đ/kg).`,
                `Đối chiếu lại phiếu cân/hợp đồng (ngưỡng cảnh báo hiện tại: ±${priceDeviationPct}%).`,
                Math.round(med)
              );
            }
          }
        }
      }
    }

    // 4. CÔNG THỨC & THANH TOÁN
    if (row.hasFormulaError) {
      pushIssue(
        row,
        'formula_payment',
        'error',
        'FORMULA_ERROR',
        'Lỗi công thức Excel',
        `Ô tại cột "${row.formulaErrorCol}" đang hiển thị mã lỗi công thức (#REF!, #VALUE!, #N/A...).`,
        'Mở file Excel tại dòng này để sửa lại công thức bị lỗi.'
      );
    }

    if (row.totalHardcoded) {
      pushIssue(
        row,
        'formula_payment',
        'warning',
        'FORMULA_HARDCODED',
        'Cột Thành Tiền bị mất công thức',
        `Ô Thành Tiền ở dòng ${row.rowNumber} đang là số gõ tay cứng, không phải công thức nhân.`,
        'Kéo lại công thức từ dòng trên xuống để tránh sai lệch khi sửa Số lượng hoặc Giá.'
      );
    }

    if (
      row.quantityKg !== null &&
      row.quantityKg > 0 &&
      row.price !== null &&
      row.price > 0 &&
      row.totalAmount !== null
    ) {
      const expectedTotal = row.quantityKg * row.price + row.extraSale;
      if (Math.abs(expectedTotal - row.totalAmount) > 500) {
        pushIssue(
          row,
          'formula_payment',
          'error',
          'TOTAL_MISMATCH',
          'Thành Tiền không khớp SL × Giá',
          `SL × Giá = ${Math.round(expectedTotal).toLocaleString('vi-VN')} đ nhưng cột Thành Tiền ghi ${Math.round(row.totalAmount).toLocaleString('vi-VN')} đ.`,
          'Kiểm tra lại công thức cột Thành Tiền.'
        );
      }
    }

    if (row.paymentAmount !== null && row.paymentAmount < 0) {
      pushIssue(
        row,
        'formula_payment',
        'info',
        'PAYMENT_NEGATIVE',
        'Số tiền Thanh Toán bị âm',
        `Cột Thanh Toán đang âm (${Math.round(row.paymentAmount).toLocaleString('vi-VN')} đ) do Tạm ứng + Trừ cọc lớn hơn Thành tiền.`,
        'Xác nhận lại tiền tạm ứng/trừ cọc hoặc phần hoàn tiền từ khách.'
      );
    }

    if (
      row.bank &&
      !/CHƯA\s*TT/i.test(row.bank) &&
      row.totalAmount !== null &&
      row.totalAmount > 0 &&
      (row.paymentAmount === null || row.paymentAmount === 0)
    ) {
      pushIssue(
        row,
        'formula_payment',
        'warning',
        'BANK_WITHOUT_PAYMENT',
        'Có Ngân Hàng nhưng Thanh Toán = 0',
        `Đã ghi ngân hàng "${row.bank}" nhưng số tiền Thanh Toán đang bằng 0.`,
        'Kiểm tra lại tiền Tạm ứng, Trừ cọc hoặc cột Thành Tiền.'
      );
    }
  }

  return { issues, mappings };
}

export function analyzeRiceAudit(options: AnalyzeAuditOptions): RiceAuditResult {
  const priceDeviationPct = options.priceDeviationPct ?? 6;
  const allIssues: RiceAuditIssue[] = [];
  const allMappings: CustomerPrefixMapping[] = [];
  let totalFreshRows = 0;
  let totalDryRows = 0;
  const monthStatsMap = new Map<string, { freshRows: number; dryRows: number }>();

  const trackMonthRows = (rows: ParsedRow[], source: RiceFileSource) => {
    for (const r of rows) {
      if (!r.monthKey) continue;
      if (!monthStatsMap.has(r.monthKey)) {
        monthStatsMap.set(r.monthKey, { freshRows: 0, dryRows: 0 });
      }
      const stat = monthStatsMap.get(r.monthKey)!;
      if (source === 'fresh') stat.freshRows++;
      else stat.dryRows++;
    }
  };

  if (options.freshBuffer) {
    const { sheetName, rows } = parseRowsFromWorkbook(options.freshBuffer, 'fresh');
    totalFreshRows = rows.length;
    trackMonthRows(rows, 'fresh');
    const res = auditSingleSheet('fresh', sheetName, rows, priceDeviationPct);
    allIssues.push(...res.issues);
    allMappings.push(...res.mappings);
  }

  if (options.dryBuffer) {
    const { sheetName, rows } = parseRowsFromWorkbook(options.dryBuffer, 'dry');
    totalDryRows = rows.length;
    trackMonthRows(rows, 'dry');
    const res = auditSingleSheet('dry', sheetName, rows, priceDeviationPct);
    allIssues.push(...res.issues);
    allMappings.push(...res.mappings);
  }

  const availableMonths: AvailableAuditMonth[] = [...monthStatsMap.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([key, counts]) => {
      const [yyyy, mm] = key.split('-');
      return {
        key,
        label: `Tháng ${mm}/${yyyy}`,
        freshRows: counts.freshRows,
        dryRows: counts.dryRows,
      };
    });

  // Sắp xếp: Lỗi nghiêm trọng (error) -> Cảnh báo (warning) -> Lưu ý (info), sau đó theo dòng
  const sevRank: Record<AuditSeverity, number> = { error: 0, warning: 1, info: 2 };
  allIssues.sort((a, b) => {
    if (sevRank[a.severity] !== sevRank[b.severity]) {
      return sevRank[a.severity] - sevRank[b.severity];
    }
    if (a.source !== b.source) return a.source === 'fresh' ? -1 : 1;
    return a.rowNumber - b.rowNumber;
  });

  const bySeverity: Record<AuditSeverity, number> = { error: 0, warning: 0, info: 0 };
  const byCategory: Record<AuditCategory, number> = {
    lot_code: 0,
    customer: 0,
    price: 0,
    formula_payment: 0,
  };
  const bySource: Record<RiceFileSource, number> = { fresh: 0, dry: 0 };

  for (const iss of allIssues) {
    bySeverity[iss.severity]++;
    byCategory[iss.category]++;
    bySource[iss.source]++;
  }

  // Gộp mapping theo khách hàng (lấy những khách hàng có > 1 biến thể hoặc > 1 prefix lên đầu)
  const mergedMap = new Map<string, CustomerPrefixMapping>();
  for (const m of allMappings) {
    const existing = mergedMap.get(m.customerNormalized);
    if (!existing) {
      mergedMap.set(m.customerNormalized, {
        ...m,
        variants: [...m.variants],
        prefixes: m.prefixes.map((p) => ({ ...p })),
      });
    } else {
      existing.rowCount += m.rowCount;
      for (const v of m.variants) {
        if (!existing.variants.includes(v)) existing.variants.push(v);
      }
      for (const p of m.prefixes) {
        const ep = existing.prefixes.find((x) => x.prefix === p.prefix);
        if (ep) ep.count += p.count;
        else existing.prefixes.push({ ...p });
      }
      existing.prefixes.sort((a, b) => b.count - a.count);
      existing.dominantPrefix = existing.prefixes[0]?.prefix || '';
    }
  }

  const customerMappings = [...mergedMap.values()].sort((a, b) => {
    const aDirty = a.prefixes.length > 1 || a.variants.length > 1 ? 1 : 0;
    const bDirty = b.prefixes.length > 1 || b.variants.length > 1 ? 1 : 0;
    if (aDirty !== bDirty) return bDirty - aDirty;
    return b.rowCount - a.rowCount;
  });

  return {
    summary: {
      totalFreshRows,
      totalDryRows,
      totalIssues: allIssues.length,
      bySeverity,
      byCategory,
      bySource,
      priceDeviationPct,
      analyzedAt: new Date().toISOString(),
    },
    availableMonths,
    issues: allIssues,
    customerMappings,
  };
}
