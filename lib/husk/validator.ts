import { ScannedSlipItem, ExistingExcelRow } from './types';
import { parseVehicle } from './plate';

/**
 * Kiểm tra cảnh báo hợp lệ cho từng phiếu cân:
 * 1. Thiếu số cân hoặc xe + hàng - xe !== hàng
 * 2. Loại hàng không phải "Trấu"
 * 3. Hướng cân không phải "Xuất"
 * 4. Thiếu hoặc sai định dạng ngày (DD/MM/YYYY)
 * 5. Trùng với dòng đã có trong Excel
 * 6. Trùng với phiếu khác trong cùng lô quét
 */
export function validateSlipItem(
  slip: Omit<ScannedSlipItem, 'warnings' | 'selected' | 'isDuplicateExisting' | 'isDuplicateInBatch'>,
  existingRows: ExistingExcelRow[] = [],
  allSlipsInBatch: Array<{ id: string; date: string; vehicle: string; weightNetKg: number }> = []
): {
  warnings: string[];
  isDuplicateExisting: boolean;
  isDuplicateInBatch: boolean;
  selected: boolean;
} {
  const warnings: string[] = [];

  // 1. Kiểm tra số cân
  if (!slip.weightNetKg || slip.weightNetKg <= 0) {
    warnings.push('Thiếu trọng lượng hàng (kg)');
  }

  if (slip.weightGrossKg > 0 && slip.weightTareKg > 0) {
    const calculatedNet = slip.weightGrossKg - slip.weightTareKg;
    if (Math.abs(calculatedNet - slip.weightNetKg) > 1) {
      warnings.push(`Cân lệch: ${slip.weightGrossKg} - ${slip.weightTareKg} = ${calculatedNet} ≠ ${slip.weightNetKg}`);
    }
  }

  // 2. Kiểm tra loại hàng
  const pType = (slip.productType || '').trim().toLowerCase();
  if (!pType.includes('trấu')) {
    warnings.push(`Loại hàng không phải trấu: "${slip.productType || 'trống'}"`);
  }

  // 3. Kiểm tra Xuất / Nhập
  const dir = (slip.direction || '').trim().toLowerCase();
  if (dir && !dir.includes('xuất')) {
    warnings.push(`Không phải phiếu xuất: "${slip.direction}"`);
  }

  // 4. Kiểm tra ngày
  if (!slip.date || !/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(slip.date)) {
    warnings.push(`Ngày cân không hợp lệ: "${slip.date || 'trống'}"`);
  }

  // 5. Kiểm tra trùng với dữ liệu đã có trong Excel
  const vInfo = parseVehicle(slip.vehicle);
  const normPlate = vInfo.normalized.toLowerCase();

  const isDuplicateExisting = existingRows.some((row) => {
    // Trùng nếu cùng ngày, cùng kg và mô tả chứa biển số/tên xe
    const sameWeight = Math.abs(row.weightKg - slip.weightNetKg) < 1;
    const sameDate = row.dateStr === slip.date;
    const descLower = row.description.toLowerCase();
    const hasPlate = normPlate && descLower.includes(normPlate);
    return sameWeight && sameDate && hasPlate;
  });

  if (isDuplicateExisting) {
    warnings.push('ĐÃ CÓ TRONG EXCEL (trùng ngày, số xe, trọng lượng)');
  }

  // 6. Kiểm tra trùng trong cùng lô quét
  const isDuplicateInBatch = allSlipsInBatch.some((other) => {
    if (other.id === slip.id) return false;
    const otherNorm = parseVehicle(other.vehicle).normalized.toLowerCase();
    return (
      other.date === slip.date &&
      Math.abs(other.weightNetKg - slip.weightNetKg) < 1 &&
      Boolean(otherNorm && normPlate && otherNorm === normPlate)
    );
  });

  if (isDuplicateInBatch) {
    warnings.push('Trùng với phiếu khác trong cùng lượt quét');
  }

  // Quy tắc: Chỉ phiếu không có bất kỳ cảnh báo nào mới được tick sẵn "Ghi?"
  const selected = warnings.length === 0;

  return {
    warnings,
    isDuplicateExisting,
    isDuplicateInBatch,
    selected,
  };
}

