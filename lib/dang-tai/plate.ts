/**
 * Chuẩn hóa biển số xe để so sánh chính xác:
 * - Chuyển sang chữ hoa
 * - Loại bỏ toàn bộ khoảng trắng, dấu gạch nối, dấu chấm, ký tự đặc biệt
 * Ví dụ:
 *   "70H-03268" -> "70H03268"
 *   "70H - 032.68" -> "70H03268"
 *   "70h03268" -> "70H03268"
 */
export function normalizePlate(plate: string | undefined | null): string {
  if (!plate) return '';
  return plate.toString().replace(/[^a-zA-Z0-9]/g, '').toUpperCase().trim();
}

/**
 * So sánh 2 biển số xe có trùng nhau hay không (chấp nhận sai khác về dấu, hoa/thường)
 */
export function arePlatesMatching(plate1: string | undefined | null, plate2: string | undefined | null): boolean {
  const p1 = normalizePlate(plate1);
  const p2 = normalizePlate(plate2);
  if (!p1 || !p2) return false;
  return p1 === p2;
}

/**
 * Định dạng hiển thị biển số xe đẹp mắt, tiêu chuẩn Việt Nam:
 * Ví dụ: "70H03268" -> "70H-03268"
 *        "66C12345" -> "66C-12345"
 *        "66C1234"  -> "66C-1234"
 */
export function formatPlateDisplay(plate: string | undefined | null): string {
  if (!plate) return '';
  const clean = normalizePlate(plate);
  
  // Mẫu biển số xe tải: 2 số + 1 chữ cái + 4-5 số (ví dụ 70H03268)
  const truckMatch = clean.match(/^([0-9]{2}[A-Z]{1,2})([0-9]{4,5})$/);
  if (truckMatch) {
    const prefix = truckMatch[1];
    const num = truckMatch[2];
    if (num.length === 5) {
      // 70H-032.68 hoặc 70H-03268
      return `${prefix}-${num}`;
    }
    return `${prefix}-${num}`;
  }

  return plate.trim().toUpperCase();
}

/**
 * Kiểm tra định dạng biển số xe Việt Nam bằng Regex:
 * Mẫu xe tải/ô tô chuẩn: 2 số mã tỉnh + 1-2 chữ cái sê-ri + 4-5 chữ số thứ tự
 * Ví dụ hợp lệ:
 *   70H-03268 -> 70H03268 (khớp)
 *   66C-12345 -> 66C12345 (khớp)
 *   63LD-01234 -> 63LD01234 (khớp)
 *   50H-12017 -> 50H12017 (khớp)
 *   60C-00463 -> 60C00463 (khớp)
 * Ví dụ SAI (cần tô đỏ):
 *   00463 (thiếu mã tỉnh / chữ cái)
 *   70-03268 (thiếu chữ cái)
 *   70H (thiếu số)
 */
export function isValidPlateFormat(plate: string | undefined | null): boolean {
  if (!plate) return false;
  const clean = normalizePlate(plate);
  // 2 số tỉnh + 1-2 chữ cái (A-Z) + 4-5 số
  return /^[0-9]{2}[A-Z]{1,2}[0-9]{4,5}$/.test(clean);
}

/**
 * Chuẩn hóa khối lượng ước tính:
 * - 34T, 34t, 34 tấn, 34.5T -> 34000 hoặc 34500 (kg)
 * - 34 (số nguyên trong khoảng 10-99 tấn) -> 34000 (kg)
 * - 34000, 34.000 -> 34000 (kg)
 */
export function normalizeEstimatedWeight(raw: string | number | undefined | null): number {
  if (raw === undefined || raw === null) return 0;
  if (typeof raw === 'number') {
    if (raw > 0 && raw < 100) {
      // Số dưới 100 trong ngữ cảnh xe lúa là tấn -> đổi sang kg
      return Math.round(raw * 1000);
    }
    return Math.round(raw);
  }

  const str = String(raw).trim().toLowerCase();
  if (!str) return 0;

  // Nếu có chữ "t", "tấn"
  if (str.includes('t') || str.includes('tấn')) {
    const cleaned = str.replace(/[tấn\s]/gi, '').replace(',', '.');
    const num = parseFloat(cleaned);
    if (!isNaN(num)) {
      return Math.round(num * 1000);
    }
  }

  // Nếu là số thuần túy (có thể có dấu chấm/phẩy phân cách hàng nghìn)
  const digitsOnly = str.replace(/[^0-9]/g, '');
  const parsed = parseInt(digitsOnly, 10);
  if (isNaN(parsed)) return 0;

  // Nếu người dùng nhập 32 hoặc 34
  if (parsed > 0 && parsed < 100) {
    return parsed * 1000;
  }

  return parsed;
}

