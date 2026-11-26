import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import {
  getYesterdayDateStr,
  isOutsideContract,
  parseDailyIntakeKhoExcel,
  parseDailyIntakeTuoiExcel,
  buildDailyIntakeReport,
} from '../lib/rice-payroll/daily-intake-report';

describe('Daily Intake Report (Báo cáo Lúa tươi & Lúa khô nhập ngày)', () => {
  it('getYesterdayDateStr should subtract 1 day in VN timezone', () => {
    // 2026-11-25T04:00:00Z = 2026-11-25 11:00 VN -> yesterday is 24/11/2026
    const d = new Date('2026-11-25T04:00:00.000Z');
    expect(getYesterdayDateStr(d)).toBe('24/11/2026');
  });

  it('isOutsideContract should identify 00, 0, empty as outside contract', () => {
    expect(isOutsideContract('00')).toBe(true);
    expect(isOutsideContract("'00")).toBe(true);
    expect(isOutsideContract('0')).toBe(true);
    expect(isOutsideContract('')).toBe(true);
    expect(isOutsideContract('01')).toBe(false);
    expect(isOutsideContract('01/HT')).toBe(false);
    expect(isOutsideContract('05')).toBe(false);
  });

  it('should parse real Excel files and generate accurate report for 24/11/2026', () => {
    const khoPath = path.join(process.cwd(), 'THỊNH_TỔNG NHẬP LÚA KHÔ NĂM 2026.xlsx');
    const tuoiPath = path.join(process.cwd(), 'THỊNH_TỔNG SỐ LIỆU NHẬP LÚA TƯƠI 2026.xlsx');

    if (!fs.existsSync(khoPath) || !fs.existsSync(tuoiPath)) {
      return;
    }

    const khoRows = parseDailyIntakeKhoExcel(fs.readFileSync(khoPath));
    const tuoiRows = parseDailyIntakeTuoiExcel(fs.readFileSync(tuoiPath));

    const report = buildDailyIntakeReport(khoRows, tuoiRows, '24/11/2026');

    expect(report.reportDate).toBe('24/11/2026');
    expect(report.totalKg).toBe(1072620);
    expect(report.tuoiTotalKg).toBe(804491);
    expect(report.khoTotalKg).toBe(268129);
    expect(report.contractKg + report.outsideContractKg).toBe(report.totalKg);

    // Kiểm tra phân loại theo loại lúa tươi
    const om18 = report.tuoiByType.find((t) => t.key === 'OM18');
    const tl6t = report.tuoiByType.find((t) => t.key.includes('TL6T'));
    expect(om18?.kg).toBe(337581);
    expect(tl6t?.kg).toBe(466910);

    // Kiểm tra phân loại theo cơ sở sấy
    const facMap = Object.fromEntries(report.tuoiByFacility.map((f) => [f.key, f.kg]));
    expect(facMap['CS1']).toBe(225388);
    expect(facMap['CS2']).toBe(188370);
    expect(facMap['NSX TM']).toBe(242643);
    expect(facMap['Toàn Vinh']).toBe(148090);

    // Kiểm tra phương tiện chưa về chờ thanh toán
    expect(report.pendingVehicles.count).toBe(6);
    expect(report.pendingVehicles.minDate).toBe('18/11/2026');
    expect(report.pendingVehicles.maxDate).toBe('24/11/2026');

    expect(report.zaloText).toContain('Dạ, e gửi Báo cáo Lúa tươi và Lúa khô nhập ngày 24/11/2026:');
    expect(report.zaloText).toContain('Tổng lượng: 1.072.620 kg');
    expect(report.zaloText).toContain('Tổng lượng Lúa khô Nếp: 268.129 kg');
    expect(report.zaloText).toContain('Từ ngày 18/11/2026 - 24/11/2026: còn tổng cộng 06 phương tiện lúa khô chưa về, chờ thanh toán');
  });
});
