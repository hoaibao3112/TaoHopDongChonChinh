/**
 * Bỏ dấu tiếng Việt phục vụ tìm kiếm không dấu
 * Ví dụ: "Nguyễn Văn A" -> "nguyen van a", "Đặng Thị Thúy" -> "dang thi thuy"
 */
export function removeVietnameseTones(str: string | undefined | null): string {
  if (!str) return '';
  let clean = str.toString().trim().toLowerCase();

  clean = clean.replace(/à|á|ạ|ả|ã|â|ầ|ấ|ậ|ẩ|ẫ|ă|ằ|ắ|ặ|ẳ|ẵ/g, 'a');
  clean = clean.replace(/è|é|ẹ|ẻ|ẽ|ê|ề|ế|ệ|ể|ễ/g, 'e');
  clean = clean.replace(/ì|í|ị|ỉ|ĩ/g, 'i');
  clean = clean.replace(/ò|ó|ọ|ỏ|õ|ô|ồ|ố|ộ|ổ|ỗ|ơ|ờ|ớ|ợ|ở|ỡ/g, 'o');
  clean = clean.replace(/ù|ú|ụ|ủ|ũ|ư|ừ|ứ|ự|ử|ữ/g, 'u');
  clean = clean.replace(/ỳ|ý|ỵ|ỷ|ỹ/g, 'y');
  clean = clean.replace(/đ/g, 'd');

  // Loại bỏ các dấu kết hợp (combining diacritical marks)
  clean = clean.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  return clean;
}

/**
 * Kiểm tra chuỗi nguồn có chứa chuỗi tìm kiếm (không phân biệt hoa thường và không phân biệt dấu)
 */
export function matchUnaccent(source: string | undefined | null, query: string | undefined | null): boolean {
  if (!query) return true;
  if (!source) return false;
  const s = removeVietnameseTones(source);
  const q = removeVietnameseTones(query);
  return s.includes(q);
}
