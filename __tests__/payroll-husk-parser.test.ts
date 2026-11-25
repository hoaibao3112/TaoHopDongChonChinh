import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import {
  extractVehicleAndCustomer,
  parseHuskFromPayrollExcel,
} from '../lib/husk/payrollHuskParser';

describe('Payroll Husk Parser (Bóc tách Xuất Trấu từ file Bảng Lương)', () => {
  it('extractVehicleAndCustomer should parse plate and customer correctly', () => {
    expect(
      extractVehicleAndCustomer('Xuất một xe trấu 50H 65334 của trang bến tre', 'XE')
    ).toEqual({
      vehicle: '50H 65334',
      customer: 'TRANG BẾN TRE',
    });

    expect(
      extractVehicleAndCustomer('Xuất một 63H 01162 của trang bến tre', 'XE')
    ).toEqual({
      vehicle: '63H 01162',
      customer: 'TRANG BẾN TRE',
    });

    expect(
      extractVehicleAndCustomer('Xuất trấu ghe Cô Liễu', 'GHE')
    ).toEqual({
      vehicle: 'Ghe Cô Liễu',
      customer: 'CÔ LIỄU',
    });
  });

  it('should extract all 23 husk export rows for 11/2026 from LUONG_DOI_DUC_T11_2026_DA_CHINH.xlsx', () => {
    const filePath = path.join(process.cwd(), 'LUONG_DOI_DUC_T11_2026_DA_CHINH.xlsx');
    if (!fs.existsSync(filePath)) return;

    const buf = fs.readFileSync(filePath);
    const records = parseHuskFromPayrollExcel(buf);

    expect(records).toHaveLength(23);
    expect(records.every((r) => r.monthKey === '11/2026')).toBe(true);
    expect(records.every((r) => r.team === 'ĐỨC')).toBe(true);

    // Kiểm tra dòng đầu tiên
    expect(records[0].date).toBe('03/11/2026');
    expect(records[0].vehicle).toBe('50H 65334');
    expect(records[0].customer).toBe('TRANG BẾN TRE');
    expect(records[0].weightKg).toBe(7930);
    expect(records[0].tons).toBe(8);
    expect(records[0].unitPrice).toBe(11000);
    expect(records[0].amount).toBe(88000);

    // Kiểm tra dòng không có chữ "trấu" nhưng có cột đơn giá xuất trấu (R6)
    expect(records[1].vehicle).toBe('63H 01162');
    expect(records[1].customer).toBe('TRANG BẾN TRE');
    expect(records[1].amount).toBe(88000);
  });
});
