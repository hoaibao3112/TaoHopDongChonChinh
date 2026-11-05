import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import { NextRequest } from 'next/server';
import { POST } from '@/app/api/rice-payroll/export-monthly/route';
import { SESSION_COOKIE_NAME, ROLE_COOKIE_NAME } from '@/lib/auth';

describe('Export Monthly Excel - Kiểm tra định dạng đầu ra chuẩn theo mẫu DOI_THANH-XUAT_CS1_T10_2026', () => {
  it('xuất file Excel có Sheet BK với dòng tổng cộng trên đầu và công thức SUBTOTAL', async () => {
    const mockRequest = new NextRequest('http://localhost:3000/api/rice-payroll/export-monthly', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        cookie: `${SESSION_COOKIE_NAME}=authenticated; ${ROLE_COOKIE_NAME}=payroll`,
      },
      body: JSON.stringify({
        month: 10,
        year: 2026,
        teamName: 'ĐỘI THANH - XUẤT CƠ SỞ I',
        dailyLogs: [
          {
            date: '01/10/2026',
            expectedTonsCoTro: 168,
            expectedTonsKhongTro: 253,
            unitPriceCoTro: 20000,
            unitPriceKhongTro: 16000,
            amountCoTro: 168 * 20000,
            amountKhongTro: 253 * 16000,
            totalAmount: 168 * 20000 + 253 * 16000,
            isMatched: true,
            batchesCoTro: [
              {
                id: 'b1',
                batchCode: 'LÔ-1',
                customerName: 'VINH MỸ ĐÔNG',
                vehicleName: 'GHE TUYẾT',
                riceType: 'OM18',
                dryFacility: 'CƠ SỞ I',
                dryDate: '30/09/2026',
                dischargeDate: '01/10/2026',
                dryVehicle: 'NGUYÊN NGUYÊN 04',
                dryWeightKg: 59372,
                roundedTons: 59,
                weighDate: '29/09/2026',
                purchaser: 'VINH MỸ ĐÔNG',
                freshWeightKg: 59411,
              },
            ],
            batchesKhongTro: [
              {
                id: 'b2',
                batchCode: 'LÔ-2',
                customerName: 'VINH MỸ ĐÔNG',
                vehicleName: 'GHE HẢO',
                riceType: 'OM18',
                dryFacility: 'CƠ SỞ I',
                dryDate: '30/09/2026',
                dischargeDate: '01/10/2026',
                dryVehicle: 'NGUYÊN NGUYÊN 04',
                dryWeightKg: 118006,
                roundedTons: 118,
                weighDate: '29/09/2026',
                purchaser: 'VINH MỸ ĐÔNG',
                freshWeightKg: 118345,
              },
            ],
            unmatchedBatches: [],
            message: 'Đã khớp 2 mẻ',
          },
        ],
      }),
    });

    const response = await POST(mockRequest);
    expect(response.status).toBe(200);

    const blob = await response.arrayBuffer();
    expect(blob.byteLength).toBeGreaterThan(1000);

    const wb = XLSX.read(blob, { type: 'buffer', cellStyles: true, cellFormula: true });
    expect(wb.SheetNames).toContain('BK');
    expect(wb.SheetNames).toContain('CL ĐỘI THANH T10.2026');

    const wsBK = wb.Sheets['BK'];
    // 1. Kiểm tra Tiêu đề Hàng 1
    expect(wsBK['D1'].v).toContain('BẢNG KÊ ĐỘI THANH - XUẤT CƠ SỞ I THÁNG 10/2026');

    // 2. Kiểm tra Dòng Tổng cộng Hàng 3
    expect(wsBK['D3'].v).toBe('TỔNG CỘNG');
    expect(wsBK['J3'].f).toContain('SUBTOTAL(109,J5:J6)');
    expect(wsBK['K3'].f).toContain('SUBTOTAL(109,K5:K6)');
    expect(wsBK['Q3'].f).toContain('SUBTOTAL(109,Q5:Q6)');
    expect(wsBK['S3'].f).toContain('SUBTOTAL(109,S5:S6)');
    expect(wsBK['T3'].f).toBe('Q3+S3');

    // 3. Kiểm tra Header Hàng 4
    expect(wsBK['A4'].v).toContain('NGÀY');
    expect(wsBK['C4'].v).toBe('KHÁCH HÀNG');
    expect(wsBK['D4'].v).toContain('PHƯƠNG TIỆN');
    expect(wsBK['L4'].v).toContain('NGÀY\r\nXUỐNG LÚA KHÔ');
    expect(wsBK['P4'].v).toContain('ĐƠN GIÁ \r\nXUẤT+TRỞ');
    expect(wsBK['Q4'].v).toContain('THÀNH TIỀN XUẤT+TRỞ');
    expect(wsBK['R4'].v).toContain('XUẤT KHÔNG TRỞ');
    expect(wsBK['S4'].v).toContain('THÀNH TIỀN\r\nXUẤT KHÔNG TRỞ');

    // 4. Kiểm tra dòng mẻ lúa Hàng 5 (mẻ có trở)
    expect(wsBK['A5'].v).toBe('29/09/2026');
    expect(wsBK['C5'].v).toBe('VINH MỸ ĐÔNG');
    expect(wsBK['D5'].v).toBe('GHE TUYẾT');
    expect(wsBK['K5'].v).toBe(59);
    expect(wsBK['L5'].v).toBe('01/10/2026');
    expect(wsBK['P5'].v).toBe(20000);
    expect(wsBK['Q5'].f).toBe('K5*P5');

    // 5. Kiểm tra dòng mẻ lúa Hàng 6 (mẻ không trở)
    expect(wsBK['A6'].v).toBe('29/09/2026');
    expect(wsBK['C6'].v).toBe('VINH MỸ ĐÔNG');
    expect(wsBK['D6'].v).toBe('GHE HẢO');
    expect(wsBK['K6'].v).toBe(118);
    expect(wsBK['L6'].v).toBe('01/10/2026');
    expect(wsBK['R6'].v).toBe(16000);
    expect(wsBK['S6'].f).toBe('K6*R6');
  });
});

