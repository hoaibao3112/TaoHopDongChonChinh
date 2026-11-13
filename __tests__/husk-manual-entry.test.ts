import { describe, it, expect } from 'vitest';
import { calculateHuskTons } from '../lib/husk/tonnage';
import { parseVehicle, formatWorkDescription } from '../lib/husk/plate';
import { ScannedSlipItem, DEFAULT_HUSK_SETTINGS } from '../lib/husk/types';
import { writeHuskRowsToExcel } from '../lib/excel/writer';
import ExcelJS from 'exceljs';
import { formatExcelCellDateToDDMMYYYY } from '../lib/excel/readExisting';
import * as path from 'path';
import * as fs from 'fs';

describe('Phiếu cân xuất trấu nhập tay (Thủ công / Ghe & Xe)', () => {
  it('tạo phiếu ghe nhập tay: tính đúng tấn, thành tiền và câu mô tả', () => {
    const rawVehicle = 'Ghe Út Em';
    const customer = 'Cô Liễu';
    const kg = 25480;
    const unitPrice = 11000;

    const vInfo = parseVehicle(rawVehicle);
    expect(vInfo.isTruck).toBe(false);

    const tons = calculateHuskTons(kg);
    expect(tons).toBe(25.4); // 25.480 kg cắt xuống 1 số lẻ = 25.4 tấn

    const amount = Math.round(tons * unitPrice);
    expect(amount).toBe(279400); // 25.4 * 11000 = 279.400đ

    const desc = formatWorkDescription(rawVehicle, customer);
    expect(desc).toBe('Xuất một ghe trấu Ghe Út Em của cô liễu');

    const manualSlip: ScannedSlipItem = {
      id: 'manual-1',
      fileName: 'Nhập tay (Ghe)',
      selected: true,
      customer,
      vehicle: rawVehicle,
      productType: 'Trấu',
      direction: 'Xuất',
      date: '10/11/2026',
      weightGrossKg: kg,
      weightTareKg: 0,
      weightNetKg: kg,
      tons,
      unitPrice,
      amount,
      description: desc,
      targetTeam: 'ĐỨC',
      warnings: [],
      isDuplicateExisting: false,
      isDuplicateInBatch: false,
    };

    expect(manualSlip.thumbnailBase64).toBeUndefined();
    expect(manualSlip.tons).toBe(25.4);
    expect(manualSlip.targetTeam).toBe('ĐỨC');
  });

  it('tạo phiếu xe tải nhập tay: chuẩn hóa biển số và câu mô tả xe', () => {
    const rawVehicle = '62H 01966';
    const customer = 'Trang Bến Tre';
    const kg = 6960;
    const unitPrice = 11000;

    const vInfo = parseVehicle(rawVehicle);
    expect(vInfo.isTruck).toBe(true);
    expect(vInfo.normalized).toBe('62H 01966');

    const tons = calculateHuskTons(kg);
    expect(tons).toBe(6.9);

    const desc = formatWorkDescription(rawVehicle, customer);
    expect(desc).toBe('Xuất một xe trấu 62H 01966 của trang bến tre');
  });

  it('ghi phiếu nhập tay (không có ảnh) vào file Excel lương thực tế thành công', async () => {
    const samplePath = path.resolve(process.cwd(), 'LƯƠNG ĐỘI QUÝ-T10.2026.xlsx');
    if (!fs.existsSync(samplePath)) return;

    const buffer = fs.readFileSync(samplePath);
    const manualGheSlip: ScannedSlipItem = {
      id: 'manual-ghe-1',
      fileName: 'Nhập tay (Ghe)',
      selected: true,
      customer: 'CÔ LIỄU',
      vehicle: 'Ghe An Giang',
      productType: 'Trấu',
      direction: 'Xuất',
      date: '08/10/2026',
      weightGrossKg: 30000,
      weightTareKg: 0,
      weightNetKg: 30000,
      tons: 30.0,
      unitPrice: 11000,
      amount: 330000,
      description: 'Xuất một ghe trấu Ghe An Giang của cô liễu',
      targetTeam: 'QUÝ',
      warnings: [],
      isDuplicateExisting: false,
      isDuplicateInBatch: false,
    };

    const res = await writeHuskRowsToExcel(buffer, [manualGheSlip], {
      ...DEFAULT_HUSK_SETTINGS,
      sheetName: 'QUÝ',
      defaultTeam: 'QUÝ',
    });

    expect(res.insertedCount).toBe(1);
    expect(res.totalAmount).toBe(330000);

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(res.updatedBuffer as any);
    const ws = wb.getWorksheet('QUÝ')!;

    // Tìm dòng đã chèn
    let found = false;
    ws.eachRow((row) => {
      const desc = String(row.getCell(4).value || '');
      if (desc.includes('Ghe An Giang')) {
        found = true;
        expect(formatExcelCellDateToDDMMYYYY(row.getCell(2).value)).toBe('08/10/2026');
        expect(row.getCell(3).value).toBe('QUÝ');
        expect(Number(row.getCell(6).value)).toBe(30);
      }
    });
    expect(found).toBe(true);
  });
});
