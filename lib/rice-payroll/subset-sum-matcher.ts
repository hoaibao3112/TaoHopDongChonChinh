import { RiceBatch, DailyWorkReportInput, DailyReconciliationResult } from './types';

/**
 * Tìm tất cả các tổ hợp mẻ lúa có tổng số tấn bằng đúng targetTons.
 */
export function findAllSubsetsForTarget(
  batches: RiceBatch[],
  targetTons: number,
  maxResults = 10
): RiceBatch[][] {
  if (targetTons <= 0 || !batches || batches.length === 0) return [];

  const results: RiceBatch[][] = [];
  const sorted = [...batches].sort((a, b) => b.roundedTons - a.roundedTons);

  function backtrack(index: number, currentSum: number, chosen: RiceBatch[]) {
    if (results.length >= maxResults) return;

    if (currentSum === targetTons) {
      results.push([...chosen]);
      return;
    }
    if (currentSum > targetTons || index >= sorted.length) {
      return;
    }

    for (let i = index; i < sorted.length; i++) {
      // Nhánh chọn
      chosen.push(sorted[i]);
      backtrack(i + 1, currentSum + sorted[i].roundedTons, chosen);
      chosen.pop();
    }
  }

  backtrack(0, 0, []);
  return results;
}

/**
 * Thuật toán đối soát và tự động phân loại mẻ lúa "Có trở" vs "Không trở"
 */
export function reconcileDailyBatches(
  batches: RiceBatch[],
  report: DailyWorkReportInput
): DailyReconciliationResult {
  const amountCoTro = report.tonsCoTro * report.unitPriceCoTro;
  const amountKhongTro = report.tonsKhongTro * report.unitPriceKhongTro;
  const totalAmount = amountCoTro + amountKhongTro;

  const totalActualTons = batches.reduce((sum, b) => sum + b.roundedTons, 0);
  const totalReportedTons = report.tonsCoTro + report.tonsKhongTro;

  // 1. Tìm các tổ hợp mẻ lúa khớp đúng số tấn "Có trở"
  const candidates = findAllSubsetsForTarget(batches, report.tonsCoTro);

  // Tìm tổ hợp nào mà các mẻ còn lại cũng khớp đúng số tấn "Không trở"
  for (const candidate of candidates) {
    const coTroIds = new Set(candidate.map((b) => b.id));
    const candidateKhongTro = batches.filter((b) => !coTroIds.has(b.id));
    const actualKhongTroTons = candidateKhongTro.reduce((sum, b) => sum + b.roundedTons, 0);

    if (actualKhongTroTons === report.tonsKhongTro) {
      const batchesCoTro = candidate.map((b) => ({ ...b, workType: 'co_tro' as const }));
      const batchesKhongTro = candidateKhongTro.map((b) => ({ ...b, workType: 'khong_tro' as const }));

      return {
        date: report.date,
        expectedTonsCoTro: report.tonsCoTro,
        expectedTonsKhongTro: report.tonsKhongTro,
        unitPriceCoTro: report.unitPriceCoTro,
        unitPriceKhongTro: report.unitPriceKhongTro,
        amountCoTro,
        amountKhongTro,
        totalAmount,
        isMatched: true,
        batchesCoTro,
        batchesKhongTro,
        unmatchedBatches: [],
        message: `Khớp hoàn hảo 100%! Có trở ${report.tonsCoTro} tấn (${batchesCoTro.length} mẻ) và Không trở ${report.tonsKhongTro} tấn (${batchesKhongTro.length} mẻ).`,
      };
    }
  }

  // 2. Nếu có tổ hợp khớp có trở nhưng phần còn lại chưa khớp
  if (candidates.length > 0) {
    const bestCandidate = candidates[0];
    const coTroIds = new Set(bestCandidate.map((b) => b.id));
    const batchesCoTro = bestCandidate.map((b) => ({ ...b, workType: 'co_tro' as const }));
    const batchesKhongTro = batches
      .filter((b) => !coTroIds.has(b.id))
      .map((b) => ({ ...b, workType: 'khong_tro' as const }));
    const actualKhongTroTons = batchesKhongTro.reduce((sum, b) => sum + b.roundedTons, 0);

    return {
      date: report.date,
      expectedTonsCoTro: report.tonsCoTro,
      expectedTonsKhongTro: report.tonsKhongTro,
      unitPriceCoTro: report.unitPriceCoTro,
      unitPriceKhongTro: report.unitPriceKhongTro,
      amountCoTro,
      amountKhongTro,
      totalAmount,
      isMatched: false,
      batchesCoTro,
      batchesKhongTro,
      unmatchedBatches: [],
      message: `Tìm thấy ${report.tonsCoTro} tấn có trở, nhưng phần không trở thực tế (${actualKhongTroTons} tấn) lệch so với sổ báo (${report.tonsKhongTro} tấn).`,
    };
  }

  // 3. Không tìm được tổ hợp nào khớp số tấn có trở
  return {
    date: report.date,
    expectedTonsCoTro: report.tonsCoTro,
    expectedTonsKhongTro: report.tonsKhongTro,
    unitPriceCoTro: report.unitPriceCoTro,
    unitPriceKhongTro: report.unitPriceKhongTro,
    amountCoTro,
    amountKhongTro,
    totalAmount,
    isMatched: false,
    batchesCoTro: [],
    batchesKhongTro: [],
    unmatchedBatches: [...batches],
    message: `Không tìm thấy tổ hợp mẻ lúa cộng lại đúng bằng ${report.tonsCoTro} tấn có trở. Tổng sản lượng thực tế ngày này là ${totalActualTons} tấn (sổ báo ${totalReportedTons} tấn).`,
  };
}
