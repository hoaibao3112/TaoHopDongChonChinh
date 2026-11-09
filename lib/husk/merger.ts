import { ScannedSlipItem } from './types';
import { calculateHuskTons } from './tonnage';
import { formatWorkDescription, parseVehicle } from './plate';

/**
 * Tùy chọn gộp phiếu: "Gộp phiếu cùng ngày + cùng xe/ghe + cùng khách thành 1 dòng"
 * - Cộng kg
 * - Tính lại tấn: calculateHuskTons(tổng kg)
 * - Mô tả: "Xuất {n} chuyến trấu {xe} của {khách}"
 */
export function groupSlipsIfEnabled(
  slips: ScannedSlipItem[],
  enableMerge: boolean,
  unitPrice: number = 11000
): ScannedSlipItem[] {
  if (!enableMerge) {
    return slips;
  }

  const groups = new Map<string, ScannedSlipItem[]>();

  slips.forEach((slip) => {
    const vNorm = parseVehicle(slip.vehicle).normalized.toLowerCase();
    const custNorm = (slip.customer || '').trim().toLowerCase();
    const key = `${slip.date}__${vNorm}__${custNorm}`;

    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key)!.push(slip);
  });

  const mergedList: ScannedSlipItem[] = [];

  groups.forEach((items) => {
    if (items.length === 1) {
      mergedList.push(items[0]);
      return;
    }

    // Nhiều phiếu cùng ngày, xe, khách -> Gộp lại
    const first = items[0];
    const totalGross = items.reduce((sum, i) => sum + (i.weightGrossKg || 0), 0);
    const totalTare = items.reduce((sum, i) => sum + (i.weightTareKg || 0), 0);
    const totalNet = items.reduce((sum, i) => sum + (i.weightNetKg || 0), 0);

    const mergedTons = calculateHuskTons(totalNet);
    const mergedAmount = mergedTons * unitPrice;
    const mergedDesc = formatWorkDescription(first.vehicle, first.customer, items.length);

    // Gộp cảnh báo
    const allWarnings = Array.from(new Set(items.flatMap((i) => i.warnings)));
    const allSelected = items.every((i) => i.selected);

    mergedList.push({
      ...first,
      id: `merged-${items.map((i) => i.id).join('-')}`,
      weightGrossKg: totalGross,
      weightTareKg: totalTare,
      weightNetKg: totalNet,
      tons: mergedTons,
      amount: mergedAmount,
      description: mergedDesc,
      selected: allSelected && allWarnings.length === 0,
      warnings: allWarnings,
    });
  });

  return mergedList;
}

