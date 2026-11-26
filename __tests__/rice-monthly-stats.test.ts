import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import * as XLSX from 'xlsx';
import { analyzeRiceMonthlyStats } from '../lib/rice-stats/monthly-stats-parser';
import { buildRiceStatsExcelBuffer } from '../lib/rice-stats/excel-exporter';

describe('Thống Kê Tổng Hợp Lúa Tươi, Lúa Khô & Hợp Đồng 2026 (7 Nhóm)', () => {
  const freshPath = path.join(process.cwd(), 'THỊNH_TỔNG SỐ LIỆU NHẬP LÚA TƯƠI 2026.xlsx');
  const dryPath = path.join(process.cwd(), 'THỊNH_TỔNG NHẬP LÚA KHÔ NĂM 2026.xlsx');
  const contractPath = path.join(process.cwd(), 'HỢP ĐỒNG LÚA NĂM 2026.xlsx');

  it('Phân tích đầy đủ 7 nhóm thống kê từ 3 file Excel thật và xuất ra 7 sheets hợp lệ', async () => {
    const freshExists = fs.existsSync(freshPath);
    const dryExists = fs.existsSync(dryPath);
    const contractExists = fs.existsSync(contractPath);
    expect(freshExists).toBe(true);
    expect(dryExists).toBe(true);
    expect(contractExists).toBe(true);

    const freshBuffer = fs.readFileSync(freshPath);
    const dryBuffer = fs.readFileSync(dryPath);
    const contractBuffer = fs.readFileSync(contractPath);

    const stats = analyzeRiceMonthlyStats({
      freshBuffer,
      dryBuffer,
      contractBuffer,
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

    // Nhóm 7: Hợp đồng & Tiền cọc + Đối chiếu 3 file
    expect(stats.hasContractFile).toBe(true);
    expect(stats.contracts).toBeDefined();
    expect(stats.contracts!.totalContracts).toBeGreaterThan(100);
    expect(stats.contracts!.totalContractKg).toBeGreaterThan(0);
    expect(stats.contracts!.kcsRanking.length).toBeGreaterThan(0);

    // Kiểm tra lọc riêng 1 tháng (tháng mới nhất)
    const latestMonth = stats.availableMonths[0];
    const monthlyStats = analyzeRiceMonthlyStats({
      freshBuffer,
      dryBuffer,
      contractBuffer,
      monthKey: latestMonth,
    });
    expect(monthlyStats.monthKey).toBe(latestMonth);
    expect(monthlyStats.overview.combinedTotalLots).toBeGreaterThanOrEqual(0);

    // Kiểm tra xuất Excel 7 sheets (có biểu đồ nhúng qua ExcelJS)
    const excelBuf = await buildRiceStatsExcelBuffer(monthlyStats);
    expect(excelBuf.length).toBeGreaterThan(20000);
    const outWb = XLSX.read(excelBuf, { type: 'buffer' });
    expect(outWb.SheetNames).toHaveLength(7);
  });
});
