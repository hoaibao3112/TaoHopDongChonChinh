import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { isCoSo1 } from '../lib/rice-payroll/facility-filter';
import { getDefaultClassification, getDefaultTons } from '../lib/rice-payroll/sample-classification';
import { RiceBatch } from '../lib/rice-payroll/types';

describe('Rice Payroll: Lọc đúng Cơ Sở I và trích xuất đúng 52 mẻ Tháng 10', () => {
  it('loại trừ triệt để Cơ Sở II (không bị nhầm lẫn vì substring)', () => {
    expect(isCoSo1('CƠ SỞ I')).toBe(true);
    expect(isCoSo1('CƠ SỞ 1')).toBe(true);
    expect(isCoSo1('CS1')).toBe(true);
    expect(isCoSo1('CS 1')).toBe(true);

    // Không được nhận Cơ Sở II
    expect(isCoSo1('CƠ SỞ II')).toBe(false);
    expect(isCoSo1('CƠ SỞ 2')).toBe(false);
    expect(isCoSo1('CS2')).toBe(false);
    expect(isCoSo1('CS 2')).toBe(false);
    expect(isCoSo1('CÔNG TY')).toBe(false);
  });

  it('lọc đúng 52 mẻ lúa thực tế của Tháng 10/2026 tại Cơ Sở I', () => {
    const jsonPath = path.join(__dirname, '../data/sample-batches.json');
    if (!fs.existsSync(jsonPath)) return;

    const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    const octBatches: RiceBatch[] = data.batches.filter(
      (b: RiceBatch) => isCoSo1(b.dryFacility) && (b.dischargeDate || '').includes('/10/2026')
    );

    // Đúng 52 mẻ khớp 100% với 52 dòng mẻ lúa trong file mẫu DOI_THANH-XUAT_CS1_T10_2026_HOAN_CHINH_DA_CHINH_IN.xlsx
    expect(octBatches.length).toBe(52);

    // Kiểm tra có đủ 23 ngày xuất lúa
    const uniqueDates = Array.from(new Set(octBatches.map((b) => b.dischargeDate)));
    expect(uniqueDates.length).toBe(23);

    // Kiểm tra các trường dữ liệu quan trọng không bị rỗng
    const b0 = octBatches[0];
    expect(b0.customerName).toBe('VINH MỸ ĐÔNG');
    expect(b0.vehicleName).toBe('GHE TUYẾT');
    expect(b0.riceType).toBe('OM18');
    expect(b0.dryWeightKg).toBe(59372);
    expect(b0.dischargeDate).toBe('01/10/2026');
    expect(getDefaultClassification(b0)).toBe(true); // Có trở (20.000)
    expect(getDefaultTons(b0)).toBe(59);
  });

  it('xuất Excel không có bất kỳ lỗi #VALUE! nào trong toàn bộ bảng kê', async () => {
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
        teamName: 'ĐỘI CHÚ 6 THANH - XUẤT CS1',
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);

    const buf = await res.arrayBuffer();
    const wb = XLSX.read(Buffer.from(buf), { type: 'buffer' });
    const ws = wb.Sheets['BK'];
    expect(ws).toBeDefined();

    // Duyệt qua tất cả các ô trong Sheet, đảm bảo không có ô nào chứa chuỗi "#VALUE!"
    for (const cellKey of Object.keys(ws)) {
      if (cellKey.startsWith('!')) continue;
      const cell = ws[cellKey];
      if (cell && cell.v !== undefined) {
        expect(String(cell.v)).not.toContain('#VALUE!');
      }
      if (cell && cell.f) {
        expect(cell.f).not.toContain('#VALUE!');
      }
    }

    // Kiểm tra dòng 5: Có trở
    expect(ws['P5'].v).toBe(20000);
    expect(ws['Q5'].v).toBe(ws['K5'].v * 20000);
    expect(ws['Q5'].f).toBe('K5*P5');
    expect(ws['S5'].v).toBe(0);
    expect(ws['S5'].f).toBeUndefined(); // Không có formula nhân ô rỗng gây #VALUE!

    // Kiểm tra tổng cộng ở hàng 3
    expect(ws['Q3'].f).toBe('SUBTOTAL(109,Q5:Q56)');
    expect(ws['S3'].f).toBe('SUBTOTAL(109,S5:S56)');
    expect(ws['T3'].f).toBe('Q3+S3');
    expect(ws['T3'].v).toBe(ws['Q3'].v + ws['S3'].v);
  });
});

