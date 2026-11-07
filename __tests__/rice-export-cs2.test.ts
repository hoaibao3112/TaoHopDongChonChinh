import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { isCoSo2 } from '../lib/rice-payroll/facility-filter';
import { getDefaultClassification, getDefaultTons } from '../lib/rice-payroll/sample-classification';
import { RiceBatch } from '../lib/rice-payroll/types';

describe('Rice Payroll CS2: Đội Dương - Cơ Sở II', () => {
  it('isCoSo2 lọc đúng CƠ SỞ II, không nhầm CƠ SỞ I', () => {
    // Nhận CS2
    expect(isCoSo2('CƠ SỞ II')).toBe(true);
    expect(isCoSo2('CƠ SỞ 2')).toBe(true);
    expect(isCoSo2('CS2')).toBe(true);
    expect(isCoSo2('CS 2')).toBe(true);
    expect(isCoSo2('CSII')).toBe(true);

    // Từ chối CS1 và các giá trị khác
    expect(isCoSo2('CƠ SỞ I')).toBe(false);
    expect(isCoSo2('CƠ SỞ 1')).toBe(false);
    expect(isCoSo2('CS1')).toBe(false);
    expect(isCoSo2('CÔNG TY')).toBe(false);
    expect(isCoSo2(null)).toBe(false);
    expect(isCoSo2('')).toBe(false);
  });

  it('lọc đúng 22 mẻ lúa thực tế Tháng 10/2026 tại Cơ Sở II', () => {
    const jsonPath = path.join(__dirname, '../data/sample-batches.json');
    if (!fs.existsSync(jsonPath)) return;

    const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    const oct2Batches: RiceBatch[] = data.batches.filter(
      (b: RiceBatch) => isCoSo2(b.dryFacility) && (b.dischargeDate || '').endsWith('/10/2026')
    );

    // Đúng 22 mẻ theo file mẫu TONG_HOP_DOI_DƯƠNG_CS2_NHẬP_T10_2026_DA_CHINH_IN.xlsx
    expect(oct2Batches.length).toBe(22);

    // 15 ngày xuất lúa thực tế (CS2)
    const uniqueDates = Array.from(new Set(oct2Batches.map((b) => b.dischargeDate)));
    expect(uniqueDates.length).toBe(15);

    // Tổng Có trở = 1323 tấn, Không trở = 393 tấn
    let totalCo = 0;
    let totalKhong = 0;
    oct2Batches.forEach((b) => {
      const isCo = getDefaultClassification(b);
      const t = getDefaultTons(b);
      if (isCo) totalCo += t;
      else totalKhong += t;
    });
    expect(totalCo).toBe(1323);
    expect(totalKhong).toBe(393);
    expect(totalCo + totalKhong).toBe(1716);
  });

  it('xuất Excel CS2 không có lỗi #VALUE! và đúng 3 sheets', async () => {
    const { POST } = await import('../app/api/rice-payroll/export-monthly/route');
    const { NextRequest } = await import('next/server');
    const { SESSION_COOKIE_NAME } = await import('../lib/auth');
    const XLSX = await import('xlsx');

    const req = new NextRequest('http://localhost:3000/api/rice-payroll/export-monthly', {
      method: 'POST',
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=authenticated`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        month: 10,
        year: 2026,
        facility: 'CS2',
        teamName: 'ĐỘI DƯƠNG - XUẤT CƠ SỞ II',
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);

    const buf = await res.arrayBuffer();
    const wb = XLSX.read(Buffer.from(buf), { type: 'buffer' });

    // Kiểm tra đúng 3 sheets theo chuẩn file mẫu CS2
    expect(wb.SheetNames[0]).toBe('XUẤT LÚA');
    expect(wb.SheetNames).toHaveLength(3);

    // Sheet 1: XUẤT LÚA — không có #VALUE!
    const ws = wb.Sheets['XUẤT LÚA'];
    expect(ws).toBeDefined();
    for (const cellKey of Object.keys(ws)) {
      if (cellKey.startsWith('!')) continue;
      const cell = ws[cellKey];
      if (cell && cell.v !== undefined) {
        expect(String(cell.v)).not.toContain('#VALUE!');
      }
    }

    // Title row 1 đúng định dạng CS2
    expect(ws['A1'].v).toContain('BẢNG KÊ XUẤT LÚA');
    expect(ws['A1'].v).toContain('CƠ SỞ II');

    // Tổng hàng 3: đúng 1716 tấn
    expect(ws['K3'].v).toBe(1716);

    // Có trở total = 1323 × 20000 = 26.460.000
    expect(ws['Q3'].v).toBe(26460000);
    // Không trở total = 393 × 16000 = 6.288.000
    expect(ws['S3'].v).toBe(6288000);
    // Tổng = 32.748.000
    expect(ws['T3'].v).toBe(32748000);

    // Sheet 2: Ứng lương — 20 công nhân Đội Dương
    const ulSheetName = wb.SheetNames[1];
    expect(ulSheetName).toContain('ĐỘI DƯƠNG');
    const wsUL = wb.Sheets[ulSheetName];
    expect(wsUL['A1'].v).toContain('DANH SÁCH ỨNG LƯƠNG');
    expect(wsUL['A1'].v).toContain('ĐỘI DƯƠNG');
    expect(wsUL['B3'].v).toBe('LÊ VĂN DƯƠNG'); // Công nhân đầu tiên
    // 20 công nhân → tổng ứng = 29.000.000
    expect(wsUL['C23'].v).toBe(29000000);

    // Sheet 3: Chi lương
    const clSheetName = wb.SheetNames[2];
    expect(clSheetName).toContain('ĐỘI DƯƠNG');
    const wsCL = wb.Sheets[clSheetName];
    expect(wsCL['A1'].v).toContain('DANH SÁCH CHI LƯƠNG');
    expect(wsCL['A1'].v).toContain('ĐỘI DƯƠNG');

    // Bảng quyết toán CS2 — XUẤT CÓ TRỞ = 1323t × 20000 = 26.460.000
    expect(wsCL['B32'].v).toBe('TỔNG XUẤT CÓ TRỞ');
    expect(wsCL['C32'].v).toBe(1323);
    expect(wsCL['D32'].v).toBe(20000);
    expect(wsCL['E32'].v).toBe(26460000);

    // XUẤT KHÔNG TRỞ = 393t × 16000 = 6.288.000
    expect(wsCL['B33'].v).toBe('TỔNG XUẤT KHÔNG TRỞ');
    expect(wsCL['C33'].v).toBe(393);
    expect(wsCL['D33'].v).toBe(16000);
    expect(wsCL['E33'].v).toBe(6288000);

    // TRỪ TẠM ỨNG = 29.000.000 (row 36 = rTruUng: 20 workers + header/sum/sig rows)
    // Tính: clLastWorkerRow=22, clSumRow=23, clSig1=25, clSig2=28, rHeader=30,
    //        rColHeader=31, rCoTro=32, rKhongTro=33, rNuocDa=34, rTong=35, rTruUng=36, rConLai=37
    expect(wsCL['B36'].v).toBe('TRỪ TẠM ỨNG :');
    expect(wsCL['E36'].v).toBe(29000000);
  });
});
