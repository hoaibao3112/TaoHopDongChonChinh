import { removeVietnameseTones, matchUnaccent } from './unaccent';
import masterCustomersData from '@/data/dang-tai/master-customers.json';

export interface MasterCustomer {
  name: string;       // Tên chuẩn in hoa, vd: "LÂM TÂY NINH"
  count: number;      // Số chuyến đã nhập trong năm 2026
  nameSearch: string; // Chuỗi tìm kiếm không dấu
}

/**
 * Danh sách 119 Nhà Cung Cấp / Nhóm Khách Hàng thực tế từ File Master:
 * THỊNH_TỔNG SỐ LIỆU NHẬP LÚA TƯƠI 2026.xlsx
 */
export const MASTER_CUSTOMERS: MasterCustomer[] = (masterCustomersData as { name: string; count: number }[]).map(
  (item) => ({
    name: item.name.trim().toUpperCase(),
    count: item.count || 0,
    nameSearch: removeVietnameseTones(item.name.trim()),
  })
);

/**
 * Bản đồ viết tắt địa danh phổ biến ở Miền Tây và vùng nguyên liệu lúa
 * Dùng boundary tùy biến hỗ trợ Unicode (đ, ô, ư...)
 */
const ABBREVIATIONS: [RegExp, string][] = [
  [/(^|[\s._-])(tn|t\.ninh|t-ninh)(?=[\s._-]|$)/gi, '$1TÂY NINH'],
  [/(^|[\s._-])(cm|c\.mau|c-mau)(?=[\s._-]|$)/gi, '$1CÀ MAU'],
  [/(^|[\s._-])(đl|dl|daklak|dak lak|đak lak|đăklăk)(?=[\s._-]|$)/gi, '$1ĐĂK LĂK'],
  [/(^|[\s._-])(kg|k\.giang|k-giang)(?=[\s._-]|$)/gi, '$1KIÊN GIANG'],
  [/(^|[\s._-])(st|s\.trang|s-trang)(?=[\s._-]|$)/gi, '$1SÓC TRĂNG'],
  [/(^|[\s._-])(ag|a\.giang|a-giang)(?=[\s._-]|$)/gi, '$1AN GIANG'],
  [/(^|[\s._-])(đt|dt|d\.thap|d-thap)(?=[\s._-]|$)/gi, '$1ĐỒNG THÁP'],
  [/(^|[\s._-])(la|l\.an|l-an)(?=[\s._-]|$)/gi, '$1LONG AN'],
  [/(^|[\s._-])(mh|m\.hoa|m-hoa)(?=[\s._-]|$)/gi, '$1MỘC HÓA'],
  [/(^|[\s._-])(umt|u\.m\.thuong)(?=[\s._-]|$)/gi, '$1U MINH THƯỢNG'],
];

/**
 * Xóa bỏ tiền tố xưng hô tiếng Việt ở đầu tên khách hàng:
 * vd: "a lâm", "a. lâm", "anh lâm", "chị hằng", "c hằng", "chú út", "bác thái", "ông dốn"...
 * Lưu ý: Các chữ đơn như "c", "a", "e" bắt buộc phải đi kèm dấu chấm hoặc khoảng trắng
 * để không làm mất chữ đầu của "công ty", "an giang",...
 */
export function stripVietnameseHonorifics(raw: string): string {
  if (!raw) return '';
  let str = raw.trim();

  // Pattern phân cách rõ ràng chữ xưng hô nhiều ký tự và chữ xưng hô 1 ký tự
  const prefixRegex =
    /^(?:(anh|chị|chi|chú|chu|bác|bac|ông|ong|cô|co|em|thím|thim|dì|di|bà|ba)|(a\.|a|c\.|c|e\.))(?=[\s._-]+|$)/i;

  const match = str.match(prefixRegex);
  if (match) {
    str = str.slice(match[0].length).replace(/^[\s._-]+/, '');
  }

  return str.trim();
}

/**
 * Chuẩn hóa tên khách hàng từ phiếu cân hoặc chữ gõ tay thành TÊN CHUẨN IN HOA
 * từ danh mục Khách hàng thực tế của Chơn Chính.
 *
 * Ví dụ:
 *  - "a lâm tây ninh" -> "LÂM TÂY NINH"
 *  - "a. lâm tây ninh" -> "LÂM TÂY NINH"
 *  - "A LAM TAY NINH" -> "LÂM TÂY NINH"
 *  - "anh lâm tn" -> "LÂM TÂY NINH"
 *  - "c hằng kiên giang" -> "HẰNG KIÊN GIANG"
 *  - "chú út mỹ quý" -> "ÚT MỸ QUÝ"
 *  - "thái đăk lăk" -> "THÁI ĐĂK LĂK"
 *  - "anh thái đl" -> "THÁI ĐĂK LĂK"
 */
export function normalizeCustomerName(raw: string | null | undefined): string {
  if (!raw) return '';
  const trimmed = raw.trim();
  if (!trimmed) return '';

  // 1. Bỏ tiền tố xưng hô (a, anh, chị, c, chú...)
  let stripped = stripVietnameseHonorifics(trimmed);
  if (!stripped) stripped = trimmed;

  // 2. Mở rộng viết tắt địa phương nếu có
  let expanded = stripped;
  for (const [regex, replacement] of ABBREVIATIONS) {
    if (regex.test(expanded)) {
      expanded = expanded.replace(regex, replacement).trim();
    }
  }

  const cleanUpper = expanded.toUpperCase().replace(/\s+/g, ' ').trim();
  const cleanUnaccent = removeVietnameseTones(expanded);

  // 3. Khớp chính xác với tên chuẩn trong Master List
  const exactMatch = MASTER_CUSTOMERS.find((c) => c.name === cleanUpper);
  if (exactMatch) return exactMatch.name;

  // 4. Khớp không dấu (Unaccented match)
  const unaccentMatch = MASTER_CUSTOMERS.find((c) => c.nameSearch === cleanUnaccent);
  if (unaccentMatch) return unaccentMatch.name;

  // 5. Thử khớp không dấu với chuỗi gốc (trước khi mở rộng viết tắt)
  const origUnaccent = removeVietnameseTones(stripped);
  const origMatch = MASTER_CUSTOMERS.find((c) => c.nameSearch === origUnaccent);
  if (origMatch) return origMatch.name;

  // 6. Khớp từ khóa bao hàm (Fuzzy substring match)
  // Nếu chuỗi tìm kiếm đủ dài (>= 3 ký tự)
  if (cleanUnaccent.length >= 3) {
    // Tìm các ứng viên có chứa chuỗi tìm kiếm hoặc ngược lại
    const candidates = MASTER_CUSTOMERS.filter(
      (c) => c.nameSearch.includes(cleanUnaccent) || cleanUnaccent.includes(c.nameSearch)
    );

    if (candidates.length > 0) {
      // Ưu tiên ứng viên có số chuyến nhiều nhất trong năm 2026
      candidates.sort((a, b) => b.count - a.count);
      return candidates[0].name;
    }
  }

  // 7. Nếu không tìm thấy trong danh mục master, trả về tên đã làm sạch viết IN HOA
  return cleanUpper;
}

/**
 * Tìm kiếm gợi ý Nhà Cung Cấp / Nhóm Khách Hàng theo từ khóa
 * Hỗ trợ gõ không dấu, gõ có tiền tố "a lâm", gõ viết tắt "tn", "cm", "đl"...
 */
export function searchMasterCustomers(query: string, limit = 15): MasterCustomer[] {
  if (!query || !query.trim()) {
    // Trả về các khách hàng có số chuyến nhiều nhất làm mặc định
    return MASTER_CUSTOMERS.slice(0, limit);
  }

  const trimmed = query.trim();
  const stripped = stripVietnameseHonorifics(trimmed);
  const cleanUnaccent = removeVietnameseTones(stripped || trimmed);

  // Mở rộng viết tắt nếu có
  let expandedUnaccent = cleanUnaccent;
  for (const [regex, replacement] of ABBREVIATIONS) {
    if (regex.test(expandedUnaccent)) {
      expandedUnaccent = removeVietnameseTones(expandedUnaccent.replace(regex, replacement).trim());
    }
  }

  // Điểm số phù hợp:
  // - Khớp bắt đầu: điểm cao nhất
  // - Khớp toàn bộ từ: điểm cao
  // - Khớp chứa từ: điểm vừa
  // - Ưu tiên số chuyến count
  const scored = MASTER_CUSTOMERS.map((c) => {
    let score = 0;
    if (c.nameSearch === cleanUnaccent || c.nameSearch === expandedUnaccent) {
      score += 1000;
    } else if (c.nameSearch.startsWith(cleanUnaccent) || c.nameSearch.startsWith(expandedUnaccent)) {
      score += 500;
    } else if (c.nameSearch.includes(cleanUnaccent) || c.nameSearch.includes(expandedUnaccent)) {
      score += 200;
    } else if (cleanUnaccent.includes(c.nameSearch)) {
      score += 100;
    }

    // Cộng thêm điểm tần suất (log scale nhẹ)
    if (score > 0) {
      score += Math.min(100, Math.log10(c.count + 1) * 30);
    }

    return { customer: c, score };
  })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);

  return scored.slice(0, limit).map((s) => s.customer);
}

/**
 * Danh sách Top 10 Nhà Cung Cấp nhập nhiều nhất làm phím bấm chọn nhanh (Pills)
 */
export const TOP_POPULAR_SUPPLIERS = MASTER_CUSTOMERS.slice(0, 12).map((c) => c.name);
