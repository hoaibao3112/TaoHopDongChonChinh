import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { NextRequest } from 'next/server';
import { SESSION_COOKIE_NAME } from '../lib/auth';
import XLSX from 'xlsx';
import { POST } from '../app/api/rice-payroll/cs2-unified-export/route';
import { isCoSo2 } from '../lib/rice-payroll/facility-filter';
import { RiceBatch } from '../lib/rice-payroll/types';
import { NhapBatch, NhapTrauItem } from '../lib/rice-payroll/nhap-types';
import { DEFAULT_RICE_PRICES, getPriceForRiceType } from '../lib/rice-payroll/rice-price-config';
import { roundRiceTons } from '../lib/rice-payroll/rounding';
import { DEFAULT_OCTOBER_TRAU_ITEMS } from '../lib/rice-payroll/nhap-trau-config';
import { DOI_DUONG_WORKERS } from '../lib/rice-payroll/team-duong-workers';

describe('Rice Payroll CS2: Phân Hệ Gộp Nhập & Xuất Đội Dương (Cơ Sở II)', () => {
  const jsonPath = path.join(__dirname, '../data/sample-batches.json');
  const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  const allBatches: RiceBatch[] = data.batches || [];

  const octNhapBatches = allBatches.filter(
    (b) => isCoSo2(b.dryFacility) && (b.dryDate || '').endsWith('/10/2026')
  );

  const nhapList: NhapBatch[] = octNhapBatches.map((b, idx) => {
    const roundedTons = b.riceType?.includes('TL6T') ? 117 : roundRiceTons(b.dryWeightKg);
    const pricePerTon = getPriceForRiceType(b.riceType, DEFAULT_RICE_PRICES);
    const thanhTienNhap = roundedTons * pricePerTon;
    const chumLoUnitPrice = 11000;
    const thanhTienChumLo = roundedTons * chumLoUnitPrice;
    return {
      id: b.id || `batch-${idx}`,
      doiNhap: 'DƯƠNG',
      customerName: b.customerName,
      riceType: b.riceType,
      freshBoVehicle: b.freshBoVehicle || '',
      dryDate: b.dryDate || '',
      dryFacility: b.dryFacility || 'CƠ SỞ II',
      dryWeightKg: b.dryWeightKg,
      roundedTons,
      pricePerTon,
      thanhTienNhap,
      chumLoUnitPrice,
      thanhTienChumLo,
      tongThanhTien: thanhTienNhap + thanhTienChumLo,
    };
  });

  const octXuatBatches = allBatches.filter(
    (b) => isCoSo2(b.dryFacility) && (b.dischargeDate || '').endsWith('/10/2026')
  );

  // ── TEST 1: Xuất Excel chuẩn 5 Sheets khớp 100% file mẫu tháng 10 ─────────
  it('1. Xuất file Excel tổng hợp duy nhất gồm đúng 5 sheets chuẩn mẫu công ty', async () => {
    const req = new NextRequest('http://localhost:3000/api/rice-payroll/cs2-unified-export', {
      method: 'POST',
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=authenticated`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        month: 10,
        year: 2026,
        nhapBatches: nhapList,
        xuatBatches: octXuatBatches,
        trauItems: DEFAULT_OCTOBER_TRAU_ITEMS,
        chumLoUnitPrice: 11000,
        managementSalary: 6000000,
        iceUnitPricePerDay: 10000,
        workDaysCount: 22,
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);

    const buf = await res.arrayBuffer();
    const wb = XLSX.read(Buffer.from(buf), { type: 'buffer' });

    // Kiểm tra đúng 5 sheets
    expect(wb.SheetNames).toEqual([
      'Nhap lua CS2',
      'XUẤT LÚA',
      'Nhập Trấu',
      'ỨL ĐỘI DƯƠNG-CS2-T10.26',
      'CL ĐỘI DƯƠNG-CS2-10.26',
    ]);

    // Không có ô nào bị lỗi #VALUE!
    for (const sheetName of wb.SheetNames) {
      const sheet = wb.Sheets[sheetName];
      for (const key of Object.keys(sheet)) {
        if (key.startsWith('!')) continue;
        const c = sheet[key];
        if (c && c.v !== undefined) {
          expect(String(c.v)).not.toContain('#VALUE!');
        }
      }
    }

    // Sheet 1: Nhap lua CS2
    const ws1 = wb.Sheets['Nhap lua CS2'];
    expect(ws1['A1'].v).toContain('BẢNG KÊ NHẬP SẤY CƠ SỞ II XNK CHƠN CHÍNH ĐỘI DƯƠNG T10/2026');
    expect(ws1['A2'].v).toBe('TỔNG CỘNG');

    // Sheet 2: XUẤT LÚA
    const ws2 = wb.Sheets['XUẤT LÚA'];
    expect(ws2['A1'].v).toContain('BẢNG KÊ XUẤT LÚA  CƠ SỞ II XNK CHƠN CHÍNH ĐỘI DƯƠNG T10/2026');
    expect(ws2['A3'].v).toBe('TỔNG CỘNG');
    expect(ws2['K3'].v).toBe(1716); // 1716 tấn xuất lúa
    expect(ws2['T3'].v).toBe(32748000); // 32.748.000 đ tiền xuất

    // Sheet 3: Nhập Trấu
    const ws3 = wb.Sheets['Nhập Trấu'];
    expect(ws3['A1'].v).toContain('NHẬP TRẤU ĐỘI DƯƠNG CS2 2026');
    expect(ws3['D3'].v).toBe(75); // 75 tấn trấu
    expect(ws3['F3'].v).toBe(2040000); // 2.040.000 đ
    // Kiểm tra đơn giá từng dòng: Xe Ông 5 đơn giá là 27.273, còn Ghe ngoài (Nguyên Nguyên 18) là 27.000, không bị cào bằng!
    expect(ws3['E5'].v).toBe(27273); // Ông 5
    expect(ws3['E6'].v).toBe(27273); // Ông 5
    expect(ws3['E7'].v).toBe(27273); // Ông 5
    expect(ws3['E8'].v).toBe(27000); // Nguyên Nguyên 18 (20t * 27.000 = 540.000đ)

    // Sheet 4: Ứng lương (20 công nhân)
    const ws4 = wb.Sheets['ỨL ĐỘI DƯƠNG-CS2-T10.26'];
    expect(ws4['C23'].v).toBe(29000000); // 29 triệu tạm ứng

    // Sheet 5: Chi lương & Quyết toán (10 mục)
    const ws5 = wb.Sheets['CL ĐỘI DƯƠNG-CS2-10.26'];
    expect(ws5['B30'].v).toContain('BẢNG KÊ LƯƠNG ĐỘI DƯƠNG NHẬP+XUẤT CƠ SỞ 2 THÁNG 10/2026');
    expect(ws5['C47'].v).toBe(85864000); // Tổng tiền lương 85.864.000 đ
    expect(ws5['C48'].v).toBe(29000000); // Trừ tạm ứng 29.000.000 đ
    expect(ws5['C49'].v).toBe(56864000); // Thực lãnh 56.864.000 đ
  });

  // ── TEST 2: Kiểm tra chức năng chuyển đổi (Toggle) Có trở / Không trở ───────
  it('2. Kiểm tra tính năng toggle Có trở (20k) / Không trở (16k) trên từng mẻ xuất', async () => {
    // Lấy mẻ đầu tiên của Xuất lúa và ép customIsCoTro = false (không trở)
    const modifiedXuat = octXuatBatches.map((b, idx) => {
      if (idx === 0) {
        return { ...b, customIsCoTro: false };
      }
      return b;
    });

    const req = new NextRequest('http://localhost:3000/api/rice-payroll/cs2-unified-export', {
      method: 'POST',
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=authenticated`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        month: 10,
        year: 2026,
        nhapBatches: nhapList,
        xuatBatches: modifiedXuat,
        trauItems: DEFAULT_OCTOBER_TRAU_ITEMS,
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);

    const buf = await res.arrayBuffer();
    const wb = XLSX.read(Buffer.from(buf), { type: 'buffer' });
    const ws2 = wb.Sheets['XUẤT LÚA'];

    // Mẻ đầu tiên (hàng 5) phải có đơn giá không trở ở cột R (16.000) và Q = 0
    expect(ws2['R5'].v).toBe(16000);
    expect(ws2['Q5'].v).toBe(0);
  });

  // ── TEST 3: Kiểm tra chức năng chỉnh sửa Tạm Ứng và Lương 20 công nhân ─────
  it('3. Kiểm tra tính năng tùy chỉnh tạm ứng & lương từng công nhân Đội Dương', async () => {
    const customAdvances: Record<string, number> = {};
    DOI_DUONG_WORKERS.forEach((w) => {
      customAdvances[w.name] = 1500000; // Mỗi người ứng 1.500.000 đ
    });

    const req = new NextRequest('http://localhost:3000/api/rice-payroll/cs2-unified-export', {
      method: 'POST',
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=authenticated`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        month: 10,
        year: 2026,
        nhapBatches: nhapList,
        xuatBatches: octXuatBatches,
        trauItems: DEFAULT_OCTOBER_TRAU_ITEMS,
        workerAdvances: customAdvances,
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);

    const buf = await res.arrayBuffer();
    const wb = XLSX.read(Buffer.from(buf), { type: 'buffer' });

    // Sheet 4: 20 công nhân x 1.5 triệu = 30.000.000 đ
    const ws4 = wb.Sheets['ỨL ĐỘI DƯƠNG-CS2-T10.26'];
    expect(ws4['C23'].v).toBe(30000000);

    // Sheet 5: Trừ tạm ứng phải là 30.000.000 đ
    const ws5 = wb.Sheets['CL ĐỘI DƯƠNG-CS2-10.26'];
    expect(ws5['C48'].v).toBe(30000000);
    expect(ws5['C49'].v).toBe(85864000 - 30000000); // 55.864.000 đ
  });

  // ── TEST 4: Kiểm tra tính độc lập theo tháng (Tháng 11 không dính tạm ứng/trấu T10) ───
  it('4. Kiểm tra dữ liệu tháng khác (Tháng 11/2026) độc lập, không lẫn trấu và tạm ứng T10', async () => {
    const novBatches = allBatches.filter(
      (b) => isCoSo2(b.dryFacility) && (b.dryDate || '').endsWith('/11/2026')
    );

    const novNhapList: NhapBatch[] = novBatches.map((b, idx) => ({
      id: `nov-${idx}`,
      doiNhap: 'DƯƠNG',
      customerName: b.customerName,
      riceType: b.riceType,
      freshBoVehicle: b.freshBoVehicle || '',
      dryDate: b.dryDate || '',
      dryFacility: b.dryFacility || 'CƠ SỞ II',
      dryWeightKg: b.dryWeightKg,
      roundedTons: roundRiceTons(b.dryWeightKg),
      pricePerTon: 20000,
      thanhTienNhap: roundRiceTons(b.dryWeightKg) * 20000,
      chumLoUnitPrice: 11000,
      thanhTienChumLo: roundRiceTons(b.dryWeightKg) * 11000,
      tongThanhTien: roundRiceTons(b.dryWeightKg) * 31000,
    }));

    const req = new NextRequest('http://localhost:3000/api/rice-payroll/cs2-unified-export', {
      method: 'POST',
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=authenticated`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        month: 11,
        year: 2026,
        nhapBatches: novNhapList,
        xuatBatches: [],
        trauItems: [], // Tháng 11 không có trấu
        workDaysCount: 5,
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);

    const buf = await res.arrayBuffer();
    const wb = XLSX.read(Buffer.from(buf), { type: 'buffer' });

    expect(wb.SheetNames).toContain('ỨL ĐỘI DƯƠNG-CS2-T11.26');
    expect(wb.SheetNames).toContain('CL ĐỘI DƯƠNG-CS2-11.26');

    // Tạm ứng tháng 11 mặc định là 0 (không mang 29 triệu của T10 sang)
    const ws4 = wb.Sheets['ỨL ĐỘI DƯƠNG-CS2-T11.26'];
    expect(ws4['C23'].v).toBe(0);
  });

  // ── TEST 5: Kiểm tra tùy chỉnh đơn giá Có Trở & Không Trở động ────────────
  it('5. Kiểm tra tùy chỉnh đơn giá Có Trở & Không Trở linh hoạt (điền nhanh & tính chuẩn)', async () => {
    const customPriceCo = 22000;
    const customPriceKhong = 17000;

    const req = new NextRequest('http://localhost:3000/api/rice-payroll/cs2-unified-export', {
      method: 'POST',
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=authenticated`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        month: 10,
        year: 2026,
        nhapBatches: nhapList,
        xuatBatches: octXuatBatches,
        trauItems: DEFAULT_OCTOBER_TRAU_ITEMS,
        priceCoTro: customPriceCo,
        priceKhongTro: customPriceKhong,
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);

    const buf = await res.arrayBuffer();
    const wb = XLSX.read(Buffer.from(buf), { type: 'buffer' });

    // Sheet 2: Header phản ánh giá mới
    const ws2 = wb.Sheets['XUẤT LÚA'];
    expect(ws2['P4'].v).toContain('22.000');
    expect(ws2['R4'].v).toContain('17.000');

    // 1323 tấn có trở * 22.000 = 29.106.000 đ
    // 393 tấn ko trở * 17.000 = 6.681.000 đ
    // Tổng tiền xuất = 35.787.000 đ
    expect(ws2['Q3'].v).toBe(1323 * customPriceCo);
    expect(ws2['S3'].v).toBe(393 * customPriceKhong);
    expect(ws2['T3'].v).toBe(1323 * customPriceCo + 393 * customPriceKhong);

    // Sheet 5: Bảng kê quyết toán 10 mục
    const ws5 = wb.Sheets['CL ĐỘI DƯƠNG-CS2-10.26'];
    expect(ws5['D36'].v).toBe(customPriceCo);
    expect(ws5['E36'].v).toBe(1323 * customPriceCo);
    expect(ws5['D37'].v).toBe(customPriceKhong);
    expect(ws5['E37'].v).toBe(393 * customPriceKhong);
  });
});
