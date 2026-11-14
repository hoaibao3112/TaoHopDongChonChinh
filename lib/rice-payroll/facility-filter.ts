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

/**
 * Bộ lọc địa điểm sấy cho Đội Dương (Cơ sở II)
 */
export function isCoSo2(facility?: string | null): boolean {
  if (!facility) return false;
  const f = facility.toUpperCase().trim();
  return (
    f.includes('CƠ SỞ II') ||
    f.includes('CƠ SỞ 2') ||
    f.includes('CSII') ||
    f.includes('CS II') ||
    f.includes('CS2') ||
    f.includes('CS 2')
  );
}

/**
 * Bộ lọc địa điểm sấy cho Đội Nam (Nhà máy NSX Tân Mỹ / ĐTM)
 */
export function isNSXTM(facility?: string | null): boolean {
  if (!facility) return false;
  const f = facility.toUpperCase().trim();
  return (
    f.includes('NSX TM') ||
    f.includes('NSX ĐTM') ||
    f.includes('CCĐTM') ||
    f.includes('TÂN MỸ') ||
    f.includes('TM')
  );
}

/**
 * Bộ lọc theo cơ sở được chọn (CS1, CS2 hoặc NSX TM)
 */
export function isFacilityMatch(
  facility?: string | null,
  facilityKey: 'CS1' | 'CS2' | 'NSX_TM' = 'CS1'
): boolean {
  if (facilityKey === 'NSX_TM') return isNSXTM(facility);
  return facilityKey === 'CS2' ? isCoSo2(facility) : isCoSo1(facility);
}

