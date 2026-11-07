import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { isCoSo2 } from '../lib/rice-payroll/facility-filter';
import { RiceBatch } from '../lib/rice-payroll/types';
import {
  DEFAULT_CHUM_LO_PRICE,
  DEFAULT_RICE_PRICES,
  getPriceForRiceType,
} from '../lib/rice-payroll/rice-price-config';
import { roundRiceTons } from '../lib/rice-payroll/rounding';
import { NhapBatch } from '../lib/rice-payroll/nhap-types';
import { DEFAULT_OCTOBER_TRAU_ITEMS } from '../lib/rice-payroll/nhap-trau-config';

describe('Rice Nhập Sấy CS2: Đội Dương - Cơ Sở II', () => {
  it('getPriceForRiceType tra đúng giá loại lúa theo file mẫu', () => {
    // ST25 các loại = 23.000
    expect(getPriceForRiceType('ST25 KDM', DEFAULT_RICE_PRICES)).toBe(23_000);
    expect(getPriceForRiceType('st25 kdm', DEFAULT_RICE_PRICES)).toBe(23_000);
    expect(getPriceForRiceType('ST25 ĐL', DEFAULT_RICE_PRICES)).toBe(23_000);

    // OM18, JAPONICA, TL các loại = 20.000
    expect(getPriceForRiceType('OM18', DEFAULT_RICE_PRICES)).toBe(20_000);
    expect(getPriceForRiceType('JAPONICA-DS1', DEFAULT_RICE_PRICES)).toBe(20_000);
    expect(getPriceForRiceType('TL4T-Loại 1', DEFAULT_RICE_PRICES)).toBe(20_000);
    expect(getPriceForRiceType('TL4T-Loại 2', DEFAULT_RICE_PRICES)).toBe(20_000);
    expect(getPriceForRiceType('TL6T-Loại 2', DEFAULT_RICE_PRICES)).toBe(20_000);

    // Chưa có trong cấu hình -> trả về 0
    expect(getPriceForRiceType('GẠO LỨT HUYẾT RỒNG', DEFAULT_RICE_PRICES)).toBe(0);
  });

  it('lọc các mẻ nhập sấy CS2 theo NGÀY NHẬP SẤY (dryDate) và tính toán đúng số tấn & thành tiền', () => {
    const jsonPath = path.join(__dirname, '../data/sample-batches.json');
    if (!fs.existsSync(jsonPath)) return;

    const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    // Lọc theo NGÀY NHẬP SẤY (dryDate) tại CƠ SỞ II trong tháng 10/2026
    const octBatches: RiceBatch[] = data.batches.filter(
      (b: RiceBatch) => isCoSo2(b.dryFacility) && (b.dryDate || '').endsWith('/10/2026')
    );

    expect(octBatches.length).toBeGreaterThan(0);

    let totalKg = 0;
    let totalTons = 0;
    let totalThanhTienNhap = 0;
    let totalThanhTienChumLo = 0;

    octBatches.forEach((b) => {
      totalKg += b.dryWeightKg;
      const tons = roundRiceTons(b.dryWeightKg);
      totalTons += tons;
      const price = getPriceForRiceType(b.riceType, DEFAULT_RICE_PRICES);
      totalThanhTienNhap += tons * price;
      totalThanhTienChumLo += tons * DEFAULT_CHUM_LO_PRICE;
    });

    expect(totalKg).toBeGreaterThan(0);
    expect(totalTons).toBeGreaterThan(0);
    expect(totalThanhTienNhap).toBeGreaterThan(0);
    expect(totalThanhTienChumLo).toBeGreaterThan(0);
  });

  it('xuất Excel Nhập Sấy CS2 đúng 4 sheets (tasks), không có lỗi #VALUE!', async () => {
    const { POST } = await import('../app/api/rice-payroll/nhap-export/route');
    const { NextRequest } = await import('next/server');
    const { SESSION_COOKIE_NAME } = await import('../lib/auth');
    const XLSX = await import('xlsx');

    // Giả lập danh sách mẻ nhập sấy chuẩn như trong hình mẫu
    const mockBatches: NhapBatch[] = [
      {
        id: 'batch-1',
        doiNhap: 'DƯƠNG',
        customerName: '63C 06291',
        riceType: 'ST25 KDM',
        freshBoVehicle: 'GHE HẢO',
        dryDate: '01/10/2026',
        dryFacility: 'CƠ SỞ II',
        dryWeightKg: 22710,
        roundedTons: 23,
        pricePerTon: 23000,
        thanhTienNhap: 23 * 23000, // 529.000
        chumLoUnitPrice: 11000,
        thanhTienChumLo: 23 * 11000, // 253.000
        tongThanhTien: 23 * 23000 + 23 * 11000, // 782.000
      },
      {
        id: 'batch-2',
        doiNhap: 'DƯƠNG',
        customerName: 'SALAN ĐÔ',
        riceType: 'OM18',
        freshBoVehicle: '',
        dryDate: '02/10/2026',
        dryFacility: 'CƠ SỞ II',
        dryWeightKg: 58788,
        roundedTons: 59,
        pricePerTon: 20000,
        thanhTienNhap: 59 * 20000, // 1.180.000
        chumLoUnitPrice: 11000,
        thanhTienChumLo: 59 * 11000, // 649.000
        tongThanhTien: 59 * 20000 + 59 * 11000, // 1.829.000
      },
    ];

    const req = new NextRequest('http://localhost:3000/api/rice-payroll/nhap-export', {
      method: 'POST',
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=authenticated`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        month: 10,
        year: 2026,
        batches: mockBatches,
        chumLoUnitPrice: 11000,
        trauItems: DEFAULT_OCTOBER_TRAU_ITEMS,
        managementSalary: 6000000,
        iceUnitPricePerDay: 10000,
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);

    const buf = await res.arrayBuffer();
    const wb = XLSX.read(Buffer.from(buf), { type: 'buffer' });

    // Output PHẢI GỒM ĐÚNG 4 SHEETS theo yêu cầu của người dùng
    expect(wb.SheetNames).toHaveLength(4);
    expect(wb.SheetNames[0]).toBe('Nhap lua CS2');
    expect(wb.SheetNames[1]).toBe('Nhập Trấu');
    expect(wb.SheetNames[2]).toBe('ỨL ĐỘI DƯƠNG-CS2-T10.26');
    expect(wb.SheetNames[3]).toBe('CL ĐỘI DƯƠNG-CS2-10.26');

    // Kiểm tra không có ô nào trên cả 4 sheets bị lỗi #VALUE!
    for (const sheetName of wb.SheetNames) {
      const sheet = wb.Sheets[sheetName];
      for (const cellKey of Object.keys(sheet)) {
        if (cellKey.startsWith('!')) continue;
        const cell = sheet[cellKey];
        if (cell && cell.v !== undefined) {
          expect(String(cell.v)).not.toContain('#VALUE!');
        }
      }
    }

    // ─── 1. SHEET Nhap lua CS2 ──────────────────────────────────────────────
    const ws1 = wb.Sheets['Nhap lua CS2'];
    expect(ws1['A1'].v).toContain('BẢNG KÊ NHẬP SẤY CƠ SỞ II XNK CHƠN CHÍNH ĐỘI DƯƠNG');
    expect(ws1['A2'].v).toBe('TỔNG CỘNG');
    expect(ws1['G2'].v).toBe(22710 + 58788); // 81.498 kg
    expect(ws1['H2'].v).toBe(23 + 59);       // 82 tấn
    expect(ws1['J2'].v).toBe(529000 + 1180000); // 1.709.000
    expect(ws1['L2'].v).toBe(253000 + 649000);  // 902.000
    // Cột M2: Tổng cộng thành tiền (Nhập sấy + Chụm lò)
    expect(ws1['M2'].v).toBe(1709000 + 902000); // 2.611.000

    expect(ws1['A3'].v).toContain('ĐỢI NHẬP');
    expect(ws1['K3'].v).toContain('CHỤM LÒ');
    expect(ws1['M3'].v).toContain('TỔNG CỘNG'); // Cột M3 Header

    // Dữ liệu từng mẻ ở cột M
    expect(ws1['M4'].v).toBe(529000 + 253000);   // Mẻ 1 = 782.000
    expect(ws1['M5'].v).toBe(1180000 + 649000);  // Mẻ 2 = 1.829.000
    expect(ws1['M6'].v).toBe(2611000);           // Tổng hàng cuối = 2.611.000

    // Chữ ký xác nhận sheet 1
    expect(ws1['C9'].v).toBe('Người lập bảng');
    expect(ws1['K9'].v).toBe('Xác nhận');
    expect(ws1['C15'].v).toBe('Võ Hoàng Cẩm Tiên');
    expect(ws1['K15'].v).toBe('Huỳnh Hải Long Hồ');

    // ─── 2. SHEET Nhập Trấu ─────────────────────────────────────────────────
    const ws2 = wb.Sheets['Nhập Trấu'];
    expect(ws2['A1'].v).toContain('NHẬP TRẤU ĐỘI DƯƠNG CS2');
    expect(ws2['A3'].v).toContain('TỔNG CỘNG');
    expect(ws2['D3'].v).toBe(75);       // 75 tấn trấu
    expect(ws2['F3'].v).toBe(2040000);  // 2.040.000đ
    expect(ws2['A4'].v).toBe('NGÀY');
    expect(ws2['C4'].v).toBe('PHƯƠNG TIỆN');

    // ─── 3. SHEET ỨL ĐỘI DƯƠNG ──────────────────────────────────────────────
    const ws3 = wb.Sheets['ỨL ĐỘI DƯƠNG-CS2-T10.26'];
    expect(ws3['A2'].v).toContain('DANH SÁCH ỨNG LƯƠNG ĐỘI DƯƠNG');
    expect(ws3['B4'].v).toBe('LÊ VĂN DƯƠNG');
    expect(ws3['C4'].v).toBe(2000000); // Tạm ứng 2.000.000
    expect(ws3['B24'].v).toContain('TỔNG CỘNG');
    expect(ws3['C24'].v).toBe(29000000); // Tổng tạm ứng 29.000.000

    // ─── 4. SHEET CL ĐỘI DƯƠNG ──────────────────────────────────────────────
    const ws4 = wb.Sheets['CL ĐỘI DƯƠNG-CS2-10.26'];
    expect(ws4['A1'].v).toContain('DANH SÁCH CHI LƯƠNG ĐỘI DƯƠNG');
    expect(ws4['B3'].v).toBe('LÊ VĂN DƯƠNG');
    expect(ws4['D3'].v).toBe(2000000);
    expect(ws4['B23'].v).toContain('TỔNG CỘNG');
    expect(ws4['D23'].v).toBe(29000000);

    // Bảng quyết toán phía dưới
    expect(ws4['B30'].v).toContain('BẢNG KÊ LƯƠNG ĐỘI DƯƠNG NHẬP CƠ SỞ 2');
    expect(ws4['B31'].v).toBe('NHẬP');
    expect(ws4['B38'].v).toBe('CHỤM LÒ LÚA');
    expect(ws4['B43'].v).toBe('LƯƠNG QUẢN LÝ (DƯƠNG)');
    expect(ws4['C43'].v).toBe(6000000);
    expect(ws4['B46'].v).toBe('TRỪ TẠM ỨNG');
    expect(ws4['C46'].v).toBe(29000000);
    expect(ws4['B47'].v).toBe('CÒN LẠI');
  });
});
