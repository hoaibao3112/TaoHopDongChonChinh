/**
 * Tiện ích chuẩn hóa & sắp xếp tháng/năm (định dạng MM/YYYY) cho hệ thống tính lương lúa.
 */

export interface ParsedMonthKey {
  month: number;
  year: number;
}

/**
 * Tách chuỗi "MM/YYYY" (hoặc "M/YYYY") thành { month, year }.
 */
export function parseMonthKey(monthKey: string): ParsedMonthKey | null {
  if (!monthKey) return null;
  const match = monthKey.trim().match(/^(\d{1,2})\/(\d{4})$/);
  if (!match) return null;
  const month = parseInt(match[1], 10);
  const year = parseInt(match[2], 10);
  if (isNaN(month) || isNaN(year) || month < 1 || month > 12) return null;
  return { month, year };
}

/**
 * Chuẩn hóa tháng về dạng "MM/YYYY" (vd: "1/2027" -> "01/2027").
 */
export function normalizeMonthKey(monthKey: string): string {
  const parsed = parseMonthKey(monthKey);
  if (!parsed) return monthKey.trim();
  return `${String(parsed.month).padStart(2, '0')}/${parsed.year}`;
}

/**
 * So sánh 2 chuỗi tháng "MM/YYYY" theo thứ tự thời gian GIẢM DẦN (mới nhất lên đầu).
 * Ví dụ: 01/2027 > 12/2026 > 11/2026 > 10/2026.
 */
export function compareMonthKeysDesc(a: string, b: string): number {
  const pa = parseMonthKey(a);
  const pb = parseMonthKey(b);
  if (!pa && !pb) return b.localeCompare(a);
  if (!pa) return 1;
  if (!pb) return -1;
  if (pa.year !== pb.year) return pb.year - pa.year;
  return pb.month - pa.month;
}

/**
 * Trích xuất "MM/YYYY" chuẩn 2 chữ số từ chuỗi ngày "dd/MM/yyyy" hoặc "d/M/yyyy".
 */
export function getMonthKeyFromDate(dateStr?: string | null): string {
  if (!dateStr) return '';
  const parts = dateStr.trim().split('/');
  if (parts.length !== 3) return '';
  const month = parseInt(parts[1], 10);
  const year = parseInt(parts[2], 10);
  if (isNaN(month) || isNaN(year) || month < 1 || month > 12 || year < 1900) return '';
  return `${String(month).padStart(2, '0')}/${year}`;
}

/**
 * Lấy danh sách các tháng duy nhất từ mảng ngày, sắp xếp mới nhất lên đầu.
 */
export function getSortedMonthKeysFromDates(dates: Array<string | null | undefined>): string[] {
  const set = new Set<string>();
  dates.forEach((d) => {
    const mk = getMonthKeyFromDate(d);
    if (mk) set.add(mk);
  });
  return Array.from(set).sort(compareMonthKeysDesc);
}

/**
 * Chuyển "MM/YYYY" -> "YYYY-MM" cho thẻ <input type="month">.
 */
export function toHtmlMonthValue(monthKey: string): string {
  const parsed = parseMonthKey(monthKey);
  if (!parsed) return '';
  return `${parsed.year}-${String(parsed.month).padStart(2, '0')}`;
}

/**
 * Chuyển "YYYY-MM" từ <input type="month"> -> "MM/YYYY".
 */
export function fromHtmlMonthValue(htmlVal: string): string {
  const match = (htmlVal || '').trim().match(/^(\d{4})-(\d{1,2})$/);
  if (!match) return '';
  const year = parseInt(match[1], 10);
  const month = parseInt(match[2], 10);
  if (isNaN(month) || isNaN(year) || month < 1 || month > 12) return '';
  return `${String(month).padStart(2, '0')}/${year}`;
}

