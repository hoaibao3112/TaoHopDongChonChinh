import { RiceBatch } from './types';
import { roundRiceTons } from './rounding';

export interface BatchTonsAdjustment {
  batchId: string;
  originalTons: number;
  adjustedTons: number;
  diff: number; // +1, -1, 0...
  dryWeightKg: number;
  remainderKg: number;
  wasOriginallyRoundedUp: boolean;
  reason: string;
}

export interface DayAllocationResult {
  targetTotalTons: number;
  originalTotalTons: number;
  delta: number;
  batchAdjustments: Record<string, BatchTonsAdjustment>;
  batchOverrides: Record<string, { tons: number }>;
}

/**
 * Thuật toán phân bổ làm tròn thông minh theo quy ước thực tế ("vi vu" với Chú 6):
 * 
 * Quy tắc gốc:
 * - 1 tấn = 1000 kg.
 * - Phần dư >= 333 kg: Làm tròn LÊN (+1 tấn).
 * - Phần dư < 333 kg: Làm tròn XUỐNG.
 * 
 * Khi người dùng điều chỉnh tổng số tấn của ngày (targetTotal):
 * - Delta = targetTotal - originalTotal
 * 
 * 1. TRƯỜNG HỢP TĂNG (Delta > 0, ví dụ từ 223t lên 225t -> Delta = +2t):
 *    - Cần tìm Delta mẻ để LÀM TRÒN LÊN (+1 tấn).
 *    - Ưu tiên 1: Các mẻ đang bị làm tròn XUỐNG (dư < 333 kg).
 *      Sắp xếp theo số dư GIẢM DẦN (mẻ nào có số dư cao nhất, gần ngưỡng 333 kg nhất như 53.324kg -> dư 324kg, chỉ thiếu 9kg để lên tròn)
 *      sẽ được chọn làm tròn lên trước!
 *    - Ưu tiên 2 (nếu Delta vượt quá số mẻ làm tròn xuống): Các mẻ còn lại theo số dư giảm dần.
 * 
 * 2. TRƯỜNG HỢP GIẢM (Delta < 0, ví dụ từ 223t xuống 221t -> Delta = -2t):
 *    - Cần tìm |Delta| mẻ để LÀM TRÒN XUỐNG (-1 tấn).
 *    - Ưu tiên 1: Các mẻ đang được làm tròn LÊN (dư >= 333 kg).
 *      Sắp xếp theo số dư TĂNG DẦN (mẻ nào có số dư THẤP NHẤT trong nhóm làm tròn lên như 54.542kg -> dư 542kg thấp hơn 54.800kg)
 *      sẽ được chọn làm tròn xuống trước!
 *    - Ưu tiên 2 (nếu |Delta| vượt quá số mẻ làm tròn lên): Các mẻ còn lại theo số dư tăng dần.
 * 
 * 3. TRƯỜNG HỢP KHÔNG ĐỔI (Delta = 0):
 *    - Giữ nguyên số tấn tiêu chuẩn của từng mẻ.
 */
export function allocateSmartRiceTons(
  dayBatches: RiceBatch[],
  targetTotalTons: number
): DayAllocationResult {
  if (!dayBatches || dayBatches.length === 0) {
    return {
      targetTotalTons,
      originalTotalTons: 0,
      delta: 0,
      batchAdjustments: {},
      batchOverrides: {},
    };
  }

  // 1. Phân tích từng mẻ theo số dư thực tế
  interface BatchAnalysis {
    batch: RiceBatch;
    dryKg: number;
    wholeTons: number;
    remainderKg: number;
    originalTons: number;
    wasRoundedUp: boolean;
    adjustedTons: number;
    diff: number;
    reason: string;
  }

  const list: BatchAnalysis[] = dayBatches.map((b) => {
    const dryKg = Math.max(0, Math.round(b.dryWeightKg || 0));
    const wholeTons = Math.floor(dryKg / 1000);
    const remainderKg = dryKg % 1000;
    const baseTons = b.roundedTons || roundRiceTons(dryKg);
    const wasRoundedUp = remainderKg >= 333;

    return {
      batch: b,
      dryKg,
      wholeTons,
      remainderKg,
      originalTons: baseTons,
      wasRoundedUp,
      adjustedTons: baseTons,
      diff: 0,
      reason: `Gốc file: ${baseTons}t (Cân sấy ${dryKg.toLocaleString()}kg, dư ${remainderKg}kg)`,
    };
  });

  const originalTotalTons = list.reduce((s, it) => s + it.originalTons, 0);
  const delta = targetTotalTons - originalTotalTons;

  if (delta > 0) {
    // ══════════════════════════════════════════════════════════════════════════
    // ĐIỀU CHỈNH TĂNG (+Delta tấn): Tìm các mẻ gần ngưỡng làm tròn lên nhất
    // ══════════════════════════════════════════════════════════════════════════
    let remainingToAdd = delta;

    // Phân nhóm: Nhóm 1 là mẻ bị làm tròn xuống (dư < 333 kg), sắp xếp dư GIẢM DẦN
    // Nhóm 2 là mẻ đã làm tròn lên (dư >= 333 kg), sắp xếp dư GIẢM DẦN
    const sortedForUp = [...list].sort((a, b) => {
      // Ưu tiên mẻ chưa làm tròn lên (wasRoundedUp === false)
      if (!a.wasRoundedUp && b.wasRoundedUp) return -1;
      if (a.wasRoundedUp && !b.wasRoundedUp) return 1;
      // Trong cùng nhóm: mẻ có số dư cao hơn thì ưu tiên lên trước (gần 333kg hơn)
      return b.remainderKg - a.remainderKg;
    });

    for (const item of sortedForUp) {
      if (remainingToAdd <= 0) break;
      item.adjustedTons += 1;
      item.diff += 1;
      item.reason = `Tự động làm tròn LÊN: Dư ${item.remainderKg}kg (gần ngưỡng làm tròn nhất)`;
      remainingToAdd -= 1;
    }

    // Nếu số tấn cần tăng vượt quá số mẻ (hiếm khi xảy ra), tiếp tục cộng vào mẻ có số dư cao nhất
    let idx = 0;
    while (remainingToAdd > 0) {
      sortedForUp[idx % sortedForUp.length].adjustedTons += 1;
      sortedForUp[idx % sortedForUp.length].diff += 1;
      remainingToAdd -= 1;
      idx++;
    }
  } else if (delta < 0) {
    // ══════════════════════════════════════════════════════════════════════════
    // ĐIỀU CHỈNH GIẢM (-|Delta| tấn): Tìm các mẻ làm tròn lên có số dư THẤP NHẤT
    // ══════════════════════════════════════════════════════════════════════════
    let remainingToSubtract = Math.abs(delta);

    // Phân nhóm: Nhóm 1 là mẻ đã làm tròn lên (dư >= 333 kg), sắp xếp dư TĂNG DẦN (thấp nhất ưu tiên giảm)
    // Nhóm 2 là mẻ đã làm tròn xuống, sắp xếp dư TĂNG DẦN
    const sortedForDown = [...list].sort((a, b) => {
      // Ưu tiên mẻ đã làm tròn lên (wasRoundedUp === true)
      if (a.wasRoundedUp && !b.wasRoundedUp) return -1;
      if (!a.wasRoundedUp && b.wasRoundedUp) return 1;
      // Trong cùng nhóm: mẻ có số dư thấp nhất thì ưu tiên giảm xuống trước (ví dụ 54.542kg -> dư 542kg)
      return a.remainderKg - b.remainderKg;
    });

    for (const item of sortedForDown) {
      if (remainingToSubtract <= 0) break;
      if (item.adjustedTons > 0) {
        item.adjustedTons -= 1;
        item.diff -= 1;
        item.reason = `Tự động làm tròn XUỐNG: Dư ${item.remainderKg}kg (thấp nhất trong nhóm làm tròn lên)`;
        remainingToSubtract -= 1;
      }
    }

    // Nếu cần trừ tiếp mà các mẻ ưu tiên đã hết
    let idx = 0;
    while (remainingToSubtract > 0 && sortedForDown.some((it) => it.adjustedTons > 0)) {
      const item = sortedForDown[idx % sortedForDown.length];
      if (item.adjustedTons > 0) {
        item.adjustedTons -= 1;
        item.diff -= 1;
        remainingToSubtract -= 1;
      }
      idx++;
    }
  }

  // 3. Đóng gói kết quả
  const batchAdjustments: Record<string, BatchTonsAdjustment> = {};
  const batchOverrides: Record<string, { tons: number }> = {};

  list.forEach((it) => {
    batchAdjustments[it.batch.id] = {
      batchId: it.batch.id,
      originalTons: it.originalTons,
      adjustedTons: it.adjustedTons,
      diff: it.diff,
      dryWeightKg: it.dryKg,
      remainderKg: it.remainderKg,
      wasOriginallyRoundedUp: it.wasRoundedUp,
      reason: it.reason,
    };
    batchOverrides[it.batch.id] = {
      tons: it.adjustedTons,
    };
  });

  return {
    targetTotalTons,
    originalTotalTons,
    delta,
    batchAdjustments,
    batchOverrides,
  };
}

