/**
 * Bộ lọc địa điểm sấy cho Đội Chú 6 Thanh (Cơ sở I)
 * QUAN TRỌNG: Phải loại trừ tuyệt đối "CƠ SỞ II" (Cơ sở 2).
 */
export function isCoSo1(facility?: string | null): boolean {
  if (!facility) return false;
  const f = facility.toUpperCase().trim();
  if (
    f.includes('CƠ SỞ II') ||
    f.includes('CƠ SỞ 2') ||
    f.includes('CSII') ||
    f.includes('CS II') ||
    f.includes('CS2') ||
    f.includes('CS 2')
  ) {
    return false;
  }
  return (
    f === 'CƠ SỞ I' ||
    f === 'CƠ SỞ 1' ||
    f === 'CS1' ||
    f === 'CS 1' ||
    f.includes('CƠ SỞ I') ||
    f.includes('CƠ SỞ 1') ||
    f.includes('CS1')
  );
}
