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
});

