import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { checkPassword } from '../lib/auth';
import { analyzeRiceAudit } from '../lib/rice-audit/audit-engine';
import { buildAuditReportWorkbookBuffer } from '../lib/rice-audit/export-excel';

describe('Rice Audit Tab & Engine', () => {
  it('authenticates KIEMTRA password into kiemtra role', () => {
    const res = checkPassword('KIEMTRA');
    expect(res.isAuthenticated).toBe(true);
    expect(res.role).toBe('kiemtra');
    expect(res.redirectUrl).toBe('/kiem-tra-lua');

    const bad = checkPassword('kiemtra');
    expect(bad.isAuthenticated).toBe(false);
  });

  it('analyzes real fresh and dry rice Excel files and exports report', () => {
    const freshPath = path.join(process.cwd(), 'THỊNH_TỔNG SỐ LIỆU NHẬP LÚA TƯƠI 2026.xlsx');
    const dryPath = path.join(process.cwd(), 'THỊNH_TỔNG NHẬP LÚA KHÔ NĂM 2026.xlsx');
    const contractPath = path.join(process.cwd(), 'HỢP ĐỒNG LÚA NĂM 2026.xlsx');

    const freshBuffer = fs.readFileSync(freshPath);
    const dryBuffer = fs.readFileSync(dryPath);
    const contractBuffer = fs.readFileSync(contractPath);

    const result = analyzeRiceAudit({
      freshBuffer,
      dryBuffer,
      contractBuffer,
      priceDeviationPct: 6,
    });

    expect(result.summary.totalFreshRows).toBe(3043);
    expect(result.summary.totalDryRows).toBe(423);
    expect(result.summary.totalContractRows).toBeGreaterThan(2000);
    expect(result.summary.totalIssues).toBeGreaterThan(0);
    expect(result.summary.byCategory.lot_code).toBeGreaterThan(0);
    expect(result.summary.byCategory.customer).toBeGreaterThan(0);
    expect(result.summary.byCategory.contract).toBeGreaterThan(0);
    expect(result.availableMonths.length).toBeGreaterThan(0);
    expect(result.availableMonths[0].key).toMatch(/^\d{4}-\d{2}$/);
    expect(result.issues.some((i) => i.monthKey === result.availableMonths[0].key)).toBe(true);

    const exported = buildAuditReportWorkbookBuffer(result, result.issues, result.availableMonths[0].label);
    expect(exported.byteLength).toBeGreaterThan(1000);
  });
});
