import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import * as XLSX from 'xlsx';
import { analyzeRiceMonthlyStats } from '../lib/rice-stats/monthly-stats-parser';
import { buildRiceStatsExcelBuffer } from '../lib/rice-stats/excel-exporter';

describe('Thống Kê Tổng Hợp Lúa Tươi & Lúa Khô 2026 (6 Nhóm)', () => {
  const freshPath = path.join(process.cwd(), 'THỊNH_TỔNG SỐ LIỆU NHẬP LÚA TƯƠI 2026.xlsx');
  const dryPath = path.join(process.cwd(), 'THỊNH_TỔNG NHẬP LÚA KHÔ NĂM 2026.xlsx');

  it('Phân tích đầy đủ 6 nhóm thống kê từ 2 file Excel thật và xuất ra 6 sheets hợp lệ', async () => {
    const freshExists = fs.existsSync(freshPath);
    const dryExists = fs.existsSync(dryPath);
    expect(freshExists).toBe(true);
    expect(dryExists).toBe(true);

    const freshBuffer = fs.readFileSync(freshPath);
    const dryBuffer = fs.readFileSync(dryPath);

    const stats = analyzeRiceMonthlyStats({
      freshBuffer,
      dryBuffer,
      monthKey: 'ALL',
    });

    // Nhóm 1: Sản lượng & Cơ cấu lúa
    expect(stats.availableMonths.length).toBeGreaterThan(0);
    expect(stats.overview.freshLots).toBeGreaterThan(100);
    expect(stats.overview.dryLots).toBeGreaterThan(50);
    expect(stats.overview.combinedTotalKg).toBeGreaterThan(0);
    expect(stats.varieties.length).toBeGreaterThan(0);
    expect(stats.dailyTrend.length).toBeGreaterThan(0);

    // Nhóm 2: Nhân viên thu mua, NCC & Vùng
    expect(stats.buyers.length).toBeGreaterThan(0);
    expect(stats.suppliers.length).toBeGreaterThan(0);
    expect(stats.regions.length).toBeGreaterThan(0);

    // Nhóm 3: Chi phí & Giá thành thực tế
    expect(stats.costBreakdown.grandTotalCost).toBeGreaterThan(0);
    expect(stats.costBreakdown.fresh.realUnitCostPerKg).toBeGreaterThan(0);
    expect(stats.costBreakdown.dry.realUnitCostPerKg).toBeGreaterThan(0);

    // Nhóm 4: Hao hụt, Cơ sở sấy & KCS
    expect(stats.facilities.length).toBeGreaterThan(0);
    expect(stats.kcsByVariety.length).toBeGreaterThan(0);

    // Nhóm 5: Tiến độ xay sát
    expect(stats.milling.totalLots).toBe(stats.overview.combinedTotalLots);
    expect(stats.milling.milledLots + stats.milling.unmilledLots).toBe(stats.milling.totalLots);

    // Nhóm 6: Tài chính & Công nợ
    expect(stats.financial.totalAmount).toBeGreaterThan(0);
    expect(stats.financial.banks.length).toBeGreaterThan(0);

    // Kiểm tra lọc riêng 1 tháng (tháng mới nhất)
    const latestMonth = stats.availableMonths[0];
    const monthlyStats = analyzeRiceMonthlyStats({
      freshBuffer,
      dryBuffer,
      monthKey: latestMonth,
    });
    expect(monthlyStats.monthKey).toBe(latestMonth);
    expect(monthlyStats.overview.combinedTotalLots).toBeGreaterThan(0);
    expect(monthlyStats.overview.combinedTotalLots).toBeLessThanOrEqual(stats.overview.combinedTotalLots);

    // Kiểm tra xuất Excel 6 sheets (có biểu đồ nhúng qua ExcelJS)
    const excelBuf = await buildRiceStatsExcelBuffer(monthlyStats);
    expect(excelBuf.length).toBeGreaterThan(20000);
    const outWb = XLSX.read(excelBuf, { type: 'buffer' });
    expect(outWb.SheetNames).toHaveLength(6);
  });
});
