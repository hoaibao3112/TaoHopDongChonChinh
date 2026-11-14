import { describe, it, expect } from 'vitest';
import XLSX from 'xlsx-js-style';
import sampleOctoberDataRaw from '@/lib/rice-payroll/sample-october-xuat-nsx-tm.json';
import { XuatNSXTMEntry, NSXTMUnitPrices } from '@/lib/rice-payroll/xuat-nsx-tm-types';
import { calculateXuatNSXTMTotal } from '@/lib/rice-payroll/xuat-nsx-tm-parser';

const sampleOctoberData = sampleOctoberDataRaw as XuatNSXTMEntry[];

describe('Xuất NSX TM - Kiểm tra định dạng 19 Cột chuẩn theo mẫu ảnh', () => {
  it('File xuất chỉ gồm 19 cột từ A đến S khớp 100% với ảnh yêu cầu của người dùng', async () => {
    // Giả lập logic sinh Sheet 1 trong export route
    const customPrices: NSXTMUnitPrices = {
      priceCoTro: 17000,
      priceKhongTro: 11000,
      priceChumLua: 8500,  // test giá chỉnh
      priceChumNep: 11500, // test giá chỉnh
      priceVoBon: 3500,    // test giá chỉnh
    };

    const summary = calculateXuatNSXTMTotal(sampleOctoberData, '10/2026', 1000000);

    // Call POST function from route
    const { POST } = await import('@/app/api/rice-payroll/xuat-nsx-tm-export/route');
    const { NextRequest } = await import('next/server');

    const req = new NextRequest('http://localhost:3000/api/rice-payroll/xuat-nsx-tm-export', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: 'auth_contract_session=authenticated',
      },
      body: JSON.stringify({
        monthKey: '10/2026',
        entries: sampleOctoberData,
        summary,
        unitPrices: customPrices,
        tamUng: 1000000,
        nguoiLapBang: 'Võ Hoàng Cẩm Tiên',
        nguoiXacNhan: 'Huỳnh Anh Phát Thịnh',
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);

    const arrayBuffer = await res.arrayBuffer();
    const wb = XLSX.read(Buffer.from(arrayBuffer), { type: 'buffer', cellStyles: true });

    expect(wb.SheetNames.length).toBe(2);
    const sheet1Name = wb.SheetNames[0];
    expect(sheet1Name).toBe('BK XUẤT ĐỌI NAM-T10.2026');

    const ws1 = wb.Sheets[sheet1Name];

    // Kiểm tra hàng 3: Đúng 19 cột
    const expectedHeaders = [
      'NGÀY\r\nCÂN',                                          // A
      'KHÁCH HÀNG',                                           // B
      'LOẠI LÚA',                                             // C
      'NGÀY\r\nNHẬP SẤY',                                     // D
      'ĐỊA ĐIỂM SẤY\r\n(CƠ SỞ SẤY)',                          // E
      'CÂN NHẬP SẤY\r\n(KG)',                                 // F
      'NGÀY XUỐNG LÚA KHÔ\r\n(NHẬN XUẤT TRẢ)',                // G
      'PHƯƠNG TIỆN CHỞ LÚA KHÔ\r\n(TĂNG BO SAU SẤY)',         // H
      'SỐ LƯỢNG LÚA TƯƠI\r\n(TẤN)',                           // I
      'ĐƠN GIÁ\r\nXUẤT CÓ TRỞ\r\n(17.000Đ/Tấn)',              // J
      'THÀNH TIỀN\r\nGIÁ XUẤT\r\nCÓ TRỞ',                     // K
      'ĐƠN GIÁ\r\nXUẤT KHÔNG TRỞ\r\n(11.000Đ/Tấn)',           // L
      'THÀNH TIỀN\r\nXUẤT KHÔNG TRỞ',                         // M
      'ĐƠN GIÁ CHỤM LÒ\r\n8.500Đ/Tấn\r\n(Áp dụng cho Lúa Trong Tháng 10/2026)', // N (đã nhận 8.500)
      'ĐƠN GIÁ CHỤM LÒ\r\n11.500Đ/Tấn\r\n(Áp dụng cho Nếp Trong Tháng 10/2026)', // O (đã nhận 11.500)
      'THÀNH TIỀN\r\nCHỤM LÒ',                                // P
      'ĐƠN GIÁ\r\nVÔ BỒN\r\n(3.500Đ/Tấn)',                    // Q (đã nhận 3.500)
      'THÀNH TIỀN\r\nVÔ BỒN',                                 // R
      'GHI CHÚ',                                              // S
    ];

    expectedHeaders.forEach((hdr, idx) => {
      const colLetter = XLSX.utils.encode_col(idx);
      expect(ws1[`${colLetter}3`]?.v).toBe(hdr);
    });

    // Cột T (cột thứ 20) không tồn tại vì chỉ có 19 cột A-S
    expect(ws1['T3']).toBeUndefined();

    // Hàng 2: TỔNG CỘNG và các công thức SUBTOTAL
    expect(ws1['A2']?.v).toBe('TỔNG CỘNG:');
    expect(ws1['F2']?.f).toBe('SUBTOTAL(109,F4:F35)');
    expect(ws1['I2']?.f).toBe('SUBTOTAL(109,I4:I35)');
    expect(ws1['K2']?.f).toBe('SUBTOTAL(109,K4:K35)');
    expect(ws1['M2']?.f).toBe('SUBTOTAL(109,M4:M35)');
    expect(ws1['P2']?.f).toBe('SUBTOTAL(109,P4:P35)');
    expect(ws1['R2']?.f).toBe('SUBTOTAL(109,R4:R35)');

    // Kiểm tra Sheet 2: Phiếu thanh toán
    const sheet2Name = wb.SheetNames[1];
    expect(sheet2Name).toBe('CHI LƯƠNG ĐỘI NAM-XUẤT T10.2026');
    const ws2 = wb.Sheets[sheet2Name];

    // Đơn giá trong Sheet 2 phải đúng đơn giá điều chỉnh
    expect(ws2['D9']?.v).toBe(8500);  // Chụm lò lúa
    expect(ws2['D10']?.v).toBe(11500); // Chụm lò nếp
    expect(ws2['D11']?.v).toBe(3500);  // Vô bồn
  });
});
