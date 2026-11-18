/**
 * Bảo vệ chống Formula Injection trong Excel (CWE-1236)
 *
 * Nếu giá trị bắt đầu bằng các ký tự đặc biệt như =, +, -, @, |, %
 * Excel sẽ diễn giải chúng như công thức/lệnh, tạo ra lỗ hổng bảo mật.
 *
 * Giải pháp: Thêm dấu nháy đơn (') ở đầu để buộc Excel đọc là text thuần.
 */

// Các ký tự bắt đầu nguy hiểm theo CWE-1236
const FORMULA_CHARS_REGEX = /^[=+\-@\t\r|%]/;

/**
 * Sanitize giá trị cell Excel để chống Formula Injection
 * @param value - Giá trị cần kiểm tra
 * @returns Giá trị an toàn để ghi vào Excel
 */
export function sanitizeExcelCell(value: string | undefined | null): string {
  if (value == null) return '';
  const str = String(value).trim();
  if (str === '') return str;

  // Nếu bắt đầu bằng ký tự nguy hiểm, prefix bằng apostrophe
  if (FORMULA_CHARS_REGEX.test(str)) {
    return `'${str}`;
  }
  return str;
}

/**
 * Sanitize nhiều giá trị cùng lúc
 */
export function sanitizeExcelCells<T extends Record<string, unknown>>(
  obj: T,
  fields: (keyof T)[]
): T {
  const result = { ...obj };
  for (const field of fields) {
    if (typeof result[field] === 'string') {
      (result as Record<string, unknown>)[field as string] = sanitizeExcelCell(
        result[field] as string
      );
    }
  }
  return result;
}
