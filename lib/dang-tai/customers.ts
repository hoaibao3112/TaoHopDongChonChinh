import { removeVietnameseTones, matchUnaccent } from './unaccent';
import masterCustomersData from '@/data/dang-tai/master-customers.json';

export interface MasterCustomer {
  name: string;       // Tên chuẩn in hoa, vd: "LÂM TÂY NINH"
  count: number;      // Số chuyến đã nhập trong năm 2026
  nameSearch: string; // Chuỗi tìm kiếm không dấu
}

export interface CustomerAlias {
  alias: string;        // Tên xuất hiện trên phiếu hoặc gõ tay, vd: "A KHU B"
  targetName: string;   // Tên nhóm khách hàng chuẩn đích, vd: "A KHU E" hoặc "KHU E"
  aliasSearch: string;  // Chuỗi không dấu của alias, vd: "a khu b"
  updatedAt?: string;
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
  [/(^|[\s._-])(tg|t\.giang|t-giang)(?=[\s._-]|$)/gi, '$1TIỀN GIANG'],
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
 * Hỗ trợ:
 * 1. Ánh xạ bí danh (Aliases): "A KHU B" -> "A KHU E"
 * 2. Bỏ tiền tố xưng hô: "a lâm tây ninh" -> "LÂM TÂY NINH"
 * 3. Mở rộng viết tắt: "anh lâm tn" -> "LÂM TÂY NINH"
 * 4. Khớp danh mục mở rộng từ DB (customCustomers)
 */
export function normalizeCustomerName(
  raw: string | null | undefined,
  customAliases: CustomerAlias[] = [],
  customCustomers: MasterCustomer[] = []
): string {
  if (!raw) return '';
  const trimmed = raw.trim();
  if (!trimmed) return '';

  const cleanUpper = trimmed.toUpperCase().replace(/\s+/g, ' ');
  const cleanUnaccent = removeVietnameseTones(trimmed);
  const stripped = stripVietnameseHonorifics(trimmed) || trimmed;
  const strippedUnaccent = removeVietnameseTones(stripped);
  const strippedUpper = stripped.toUpperCase().replace(/\s+/g, ' ');

  // 1. ƯU TIÊN HÀNG ĐẦU: Kiểm tra bảng Ánh Xạ Bí Danh (Customer Aliases)
  // Ví dụ: Người dùng lưu quy tắc "A KHU B" -> "A KHU E"
  if (customAliases && customAliases.length > 0) {
    const matchedAlias = customAliases.find((a) => {
      const aUpper = a.alias.trim().toUpperCase();
      const aSearch = a.aliasSearch || removeVietnameseTones(a.alias);
      const aStripped = stripVietnameseHonorifics(a.alias) || a.alias;
      const aStrippedSearch = removeVietnameseTones(aStripped);
      const aStrippedUpper = aStripped.toUpperCase().replace(/\s+/g, ' ');

      return (
        aUpper === cleanUpper ||
        aUpper === strippedUpper ||
        aStrippedUpper === cleanUpper ||
        aStrippedUpper === strippedUpper ||
        aSearch === cleanUnaccent ||
        aSearch === strippedUnaccent ||
        aStrippedSearch === strippedUnaccent ||
        aStrippedSearch === cleanUnaccent
      );
    });

    if (matchedAlias) {
      return matchedAlias.targetName.trim().toUpperCase();
    }
  }

  // Danh mục đầy đủ: Khách hàng tự thêm trong DB + 119 Master
  const allCustomers: MasterCustomer[] =
    customCustomers && customCustomers.length > 0
      ? [...customCustomers, ...MASTER_CUSTOMERS]
      : MASTER_CUSTOMERS;

  // 2. Mở rộng viết tắt địa phương nếu có
  let expanded = stripped;
  for (const [regex, replacement] of ABBREVIATIONS) {
    if (regex.test(expanded)) {
      expanded = expanded.replace(regex, replacement).trim();
    }
  }

  const expandedUpper = expanded.toUpperCase().replace(/\s+/g, ' ').trim();
  const expandedUnaccent = removeVietnameseTones(expanded);

  // 3. Khớp chính xác với tên chuẩn trong danh mục
  const exactMatch = allCustomers.find(
    (c) => c.name === cleanUpper || c.name === strippedUpper || c.name === expandedUpper
  );
  if (exactMatch) return exactMatch.name;

  // 4. Khớp không dấu (Unaccented match)
  const unaccentMatch = allCustomers.find(
    (c) =>
      c.nameSearch === cleanUnaccent ||
      c.nameSearch === strippedUnaccent ||
      c.nameSearch === expandedUnaccent
  );
  if (unaccentMatch) return unaccentMatch.name;

  // 5. Khớp từ khóa bao hàm (Fuzzy substring match)
  if (expandedUnaccent.length >= 3) {
    const candidates = allCustomers.filter(
      (c) => c.nameSearch.includes(expandedUnaccent) || expandedUnaccent.includes(c.nameSearch)
    );

    if (candidates.length > 0) {
      candidates.sort((a, b) => b.count - a.count);
      return candidates[0].name;
    }
  }

  // 6. Nếu không khớp danh mục, trả về tên đã chuẩn hóa viết IN HOA
  return expandedUpper || cleanUpper;
}

/**
 * Tìm kiếm gợi ý Nhà Cung Cấp / Nhóm Khách Hàng theo từ khóa
 * Hỗ trợ gõ không dấu, tiền tố xưng hô, viết tắt, và danh mục mở rộng từ DB
 */
export function searchMasterCustomers(
  query: string,
  limit = 15,
  customCustomers: MasterCustomer[] = [],
  customAliases: CustomerAlias[] = []
): MasterCustomer[] {
  const allCustomers: MasterCustomer[] =
    customCustomers && customCustomers.length > 0
      ? [...customCustomers, ...MASTER_CUSTOMERS]
      : MASTER_CUSTOMERS;

  if (!query || !query.trim()) {
    return allCustomers.slice(0, limit);
  }

  const trimmed = query.trim();

  // Kiểm tra nếu query khớp với 1 alias
  if (customAliases && customAliases.length > 0) {
    const unaccentQuery = removeVietnameseTones(trimmed);
    const matchedAlias = customAliases.find(
      (a) =>
        a.alias.toLowerCase() === trimmed.toLowerCase() ||
        a.aliasSearch === unaccentQuery ||
        removeVietnameseTones(stripVietnameseHonorifics(a.alias)) === unaccentQuery
    );
    if (matchedAlias) {
      const targetCustomer = allCustomers.find((c) => c.name === matchedAlias.targetName);
      if (targetCustomer) {
        const others = allCustomers.filter((c) => c.name !== matchedAlias.targetName);
        return [targetCustomer, ...others.slice(0, limit - 1)];
      }
    }
  }

  const stripped = stripVietnameseHonorifics(trimmed);
  const cleanUnaccent = removeVietnameseTones(stripped || trimmed);

  // Mở rộng viết tắt nếu có
  let expandedUnaccent = cleanUnaccent;
  for (const [regex, replacement] of ABBREVIATIONS) {
    if (regex.test(expandedUnaccent)) {
      expandedUnaccent = removeVietnameseTones(expandedUnaccent.replace(regex, replacement).trim());
    }
  }

  const scored = allCustomers
    .map((c) => {
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

      // Khách hàng tự thêm (có count = 0 hoặc ít chuyến) vẫn được ưu tiên hiển thị nếu khớp
      if (score > 0) {
        score += Math.min(100, Math.log10((c.count || 0) + 1) * 30);
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
