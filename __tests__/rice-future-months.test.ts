import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import { NextRequest } from 'next/server';
import { SESSION_COOKIE_NAME } from '@/lib/auth';
import { formatExcelDate } from '@/lib/rice-payroll/excel-parser';
import { getDefaultClassification, getSampleDetail } from '@/lib/rice-payroll/sample-classification';
import {
  compareMonthKeysDesc,
  fromHtmlMonthValue,
  getMonthKeyFromDate,
  getSortedMonthKeysFromDates,
  toHtmlMonthValue,
} from '@/lib/rice-payroll/month-utils';
import { RiceBatch } from '@/lib/rice-payroll/types';
import { NhapBatch } from '@/lib/rice-payroll/nhap-types';

describe('Rice Payroll: Tính lương giữa tháng (Tháng 11) & các tháng tương lai (CS1 & CS2)', () => {
  it('month-utils sắp xếp đúng thứ tự thời gian giảm dần kể cả qua năm 2027', () => {
    const sorted = ['10/2026', '01/2027', '11/2026', '12/2026', '02/2027'].sort(compareMonthKeysDesc);
    expect(sorted).toEqual(['02/2027', '01/2027', '12/2026', '11/2026', '10/2026']);

    expect(getMonthKeyFromDate('5/11/2026')).toBe('11/2026');
    expect(getMonthKeyFromDate('1/1/2027')).toBe('01/2027');
    expect(getSortedMonthKeysFromDates(['05/10/2026', '11/11/2026', '02/01/2027'])).toEqual([
      '01/2027',
      '11/2026',
      '10/2026',
    ]);

    expect(toHtmlMonthValue('11/2026')).toBe('2026-11');
    expect(fromHtmlMonthValue('2027-01')).toBe('01/2027');
  });

  it('formatExcelDate chuẩn hóa ngày tháng không có số 0 đầu và serial thập phân', () => {
    expect(formatExcelDate('1/11/2026')).toBe('01/11/2026');
    expect(formatExcelDate('5-1-2027')).toBe('05/01/2027');
    expect(formatExcelDate('2026-11-09')).toBe('09/11/2026');
    expect(formatExcelDate('46023.5')).toBe('01/01/2026');
  });

  it('sample-classification không áp nhầm dữ liệu mẫu T10/2026 sang T11/2026 hoặc tháng tương lai', () => {
    // Trùng tên xe & số kg với mẫu T10 CS2 nhưng thuộc tháng 11/2026
    const novCs2Batch: RiceBatch = {
      id: 'nov-cs2-1',
      batchCode: 'L-NOV-1',
      customerName: 'KHÁCH A',
      vehicleName: 'GHE NHƠN-GHE NGOÀI',
      riceType: 'OM18',
      dryFacility: 'CƠ SỞ II',
      dryDate: '10/11/2026',
      dischargeDate: '20/11/2026',
      dryVehicle: 'SALAN',
      dryWeightKg: 138084,
      roundedTons: 138,
    };

    expect(getSampleDetail(novCs2Batch)).toBeNull();
    // Sau ngày 14 ở tháng 11 vẫn mặc định Có trở (true), đồng nhất với bảng công nhật
    expect(getDefaultClassification(novCs2Batch)).toBe(true);
  });

  it('xuất Excel Xuất Lúa CS2 giữa tháng 11/2026 (dữ liệu chưa hết tháng) tính chuẩn xác và không trừ tạm ứng T10', async () => {
    const { POST } = await import('../app/api/rice-payroll/export-monthly/route');

    const req = new NextRequest('http://localhost:3000/api/rice-payroll/export-monthly', {
      method: 'POST',
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=authenticated`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        month: 11,
        year: 2026,
        facility: 'CS2',
        teamName: 'ĐỘI DƯƠNG - XUẤT CƠ SỞ II',
        items: [
          {
            weighDate: '02/11/2026',
            purchaser: '',
            customer: 'KHÁCH T11',
            vehicle: 'GHE 01',
            riceType: 'OM18',
            freshWeightKg: 52000,
            freshBoVehicle: '',
            dryDate: '02/11/2026',
            dryFacility: 'CƠ SỞ II',
            dryWeightKg: 50500,
            roundedTons: 51,
            dischargeDate: '03/11/2026',
            dryVehicle: 'GHE XUẤT 01',
            isCoTro: true,
            unitPrice: 20000,
          },
          {
            weighDate: '08/11/2026',
            purchaser: '',
            customer: 'KHÁCH T11 B',
            vehicle: 'GHE 02',
            riceType: 'ST25',
            freshWeightKg: 40000,
            freshBoVehicle: '',
            dryDate: '08/11/2026',
            dryFacility: 'CƠ SỞ II',
            dryWeightKg: 39100,
            roundedTons: 39,
            dischargeDate: '10/11/2026',
            dryVehicle: 'GHE XUẤT 02',
            isCoTro: false,
            unitPrice: 16000,
          },
        ],
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);

    const buf = await res.arrayBuffer();
    const wb = XLSX.read(Buffer.from(buf), { type: 'buffer' });
    const wsBK = wb.Sheets['XUẤT LÚA'];
    expect(wsBK['A1'].v).toContain('T11/2026');
    expect(wsBK['K3'].v).toBe(51 + 39); // 90 tấn
    expect(wsBK['Q3'].v).toBe(51 * 20000); // 1.020.000
    expect(wsBK['S3'].v).toBe(39 * 16000); // 624.000
    expect(wsBK['T3'].v).toBe(1644000);

    const clSheetName = wb.SheetNames[2];
    const wsCL = wb.Sheets[clSheetName];
    // Nước đá đúng 2 ngày thực tế (không mặc định 15 ngày)
    expect(wsCL['C34'].v).toBe(2);
    expect(wsCL['E34'].v).toBe(20000);
    // Không mang tạm ứng T10 (29.000.000) sang T11
    expect(wsCL['E36'].v).toBe(0);
    expect(wsCL['E35'].v).toBe(1644000 + 20000); // 1.664.000
    expect(wsCL['E37'].v).toBe(1664000);
  });

  it('xuất Excel Xuất Lúa khi nhập tay công nhật tháng tương lai (01/2027) không cần chờ file master', async () => {
    const { POST } = await import('../app/api/rice-payroll/export-monthly/route');

    const req = new NextRequest('http://localhost:3000/api/rice-payroll/export-monthly', {
      method: 'POST',
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=authenticated`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        month: 1,
        year: 2027,
        facility: 'CS1',
        teamName: 'ĐỘI CHÚ 6 THANH - XUẤT CS1',
        items: [],
        dailyLogs: [
          {
            date: '05/01/2027',
            expectedTonsCoTro: 100,
            expectedTonsKhongTro: 50,
            unitPriceCoTro: 20000,
            unitPriceKhongTro: 16000,
            amountCoTro: 2000000,
            amountKhongTro: 800000,
            totalAmount: 2800000,
            isMatched: false,
            batchesCoTro: [],
            batchesKhongTro: [],
            unmatchedBatches: [],
            message: 'Nhập tay',
          },
        ],
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const buf = await res.arrayBuffer();
    const wb = XLSX.read(Buffer.from(buf), { type: 'buffer' });
    const wsBK = wb.Sheets['BK'];
    expect(wsBK['K3'].v).toBe(150);
    expect(wsBK['Q3'].v).toBe(2000000);
    expect(wsBK['S3'].v).toBe(800000);
    expect(wsBK['T3'].v).toBe(2800000);

    const wsCL = wb.Sheets[wb.SheetNames[2]];
    expect(wsCL['C28'].v).toBe(1); // 1 ngày làm việc
    expect(wsCL['E30'].v).toBe(0); // Không trừ tạm ứng T10
    expect(wsCL['E31'].v).toBe(2810000);
  });

  it('xuất Excel Nhập Sấy CS2 tháng 11/2026 không dính tạm ứng/trấu tháng 10 và giữ đúng đơn giá mới', async () => {
    const { POST } = await import('../app/api/rice-payroll/nhap-export/route');

    const novBatches: NhapBatch[] = [
      {
        id: 'nov-1',
        doiNhap: 'DƯƠNG',
        customerName: 'KHÁCH T11',
        riceType: 'OM18',
        freshBoVehicle: 'GHE A',
        dryDate: '05/11/2026',
        dryFacility: 'CƠ SỞ II',
        dryWeightKg: 49500,
        roundedTons: 50,
        pricePerTon: 21000,
        thanhTienNhap: 50 * 21000,
        chumLoUnitPrice: 11000,
        thanhTienChumLo: 50 * 11000,
        tongThanhTien: 50 * 32000,
      },
    ];

    const req = new NextRequest('http://localhost:3000/api/rice-payroll/nhap-export', {
      method: 'POST',
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=authenticated`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        month: 11,
        year: 2026,
        batches: novBatches,
        chumLoUnitPrice: 11000,
        managementSalary: 6000000,
        iceUnitPricePerDay: 10000,
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const buf = await res.arrayBuffer();
    const wb = XLSX.read(Buffer.from(buf), { type: 'buffer' });

    const ws2 = wb.Sheets['Nhập Trấu'];
    expect(ws2['D3'].v).toBe(0); // Không mang trấu T10 sang T11
    expect(ws2['F3'].v).toBe(0);

    const ws3 = wb.Sheets['ỨL ĐỘI DƯƠNG-CS2-T11.26'];
    expect(ws3['C24'].v).toBe(0); // Không mang tạm ứng T10 sang T11

    const ws4 = wb.Sheets['CL ĐỘI DƯƠNG-CS2-11.26'];
    expect(ws4['C23'].v).toBe(0);
    expect(ws4['D23'].v).toBe(0);
    expect(ws4['C32'].v).toBe(50);
    expect(ws4['D32'].v).toBe(21000);
    expect(ws4['E32'].v).toBe(1050000);
    expect(ws4['C46'].v).toBe(0); // TRỪ TẠM ỨNG = 0
  });
});

