import { describe, it, expect } from 'vitest';
import { checkPassword } from '../lib/auth';
import {
  parseKcsMaxLossPercent,
  buildUngroundReport,
  floorRiceTons,
  UngroundKhoBatch,
  UngroundTuoiBatch,
} from '../lib/rice-payroll/unground-report-parser';

describe('Báo Cáo Lúa Khô Chưa Xay (Theo Đầu Lúa Khô)', () => {
  it('xác thực mật khẩu baocao phân quyền đúng vai trò và chuyển hướng đến /bao-cao-chua-xay', () => {
    const res = checkPassword('baocao');
    expect(res.isAuthenticated).toBe(true);
    expect(res.role).toBe('baocao');
    expect(res.redirectUrl).toBe('/bao-cao-chua-xay');

    // Mật khẩu hoaibao không dẫn đến bao-cao-chua-xay
    const resHoaibao = checkPassword('hoaibao');
    expect(resHoaibao.role).toBe('payroll');
    expect(resHoaibao.redirectUrl).toBe('/tinh-luong');
  });

  it('trích xuất % hao hụt KCS lớn nhất chính xác từ nhiều định dạng khác nhau', () => {
    expect(parseKcsMaxLossPercent(17)).toBe(17);
    expect(parseKcsMaxLossPercent(0.17)).toBe(17);
    expect(parseKcsMaxLossPercent('17%')).toBe(17);
    expect(parseKcsMaxLossPercent('14-15')).toBe(15);
    expect(parseKcsMaxLossPercent('14-15%')).toBe(15);
    expect(parseKcsMaxLossPercent('15-17')).toBe(17);
    expect(parseKcsMaxLossPercent('12')).toBe(12);
    expect(parseKcsMaxLossPercent('')).toBe(0);
    expect(parseKcsMaxLossPercent(null)).toBe(0);
  });

  it('tính toán quy đổi đầu lúa khô và sinh mẫu tin nhắn Zalo chuẩn xác 100%', () => {
    // 1. Lúa khô nằm tài: OM18 170.150 kg (làm tròn 170 tấn)
    const mockKho: UngroundKhoBatch[] = [
      {
        id: 'kho-1',
        ngayCan: '12/11/2026',
        loaiLua: 'OM18',
        slKg: 170150,
      },
    ];

    // 2. Lúa tươi chờ sấy:
    // - OM18: 360.000 kg tươi, KCS hao hụt 15% -> hao hụt 54.000 kg -> khô quy đổi 306.000 kg (306 tấn)
    //   -> Tổng OM18 = 170 + 306 = 476 tấn
    // - L5451: 300.000 kg tươi, KCS hao hụt 17% -> hao hụt 51.000 kg -> khô quy đổi 249.000 kg (249 tấn)
    const mockTuoi: UngroundTuoiBatch[] = [
      {
        id: 'tuoi-1',
        ngayCan: '15/11/2026',
        ngayNhapSay: '15/11/2026',
        loaiLua: 'OM18',
        slKg: 360000,
        kcsPercent: 15,
      },
      {
        id: 'tuoi-2',
        ngayCan: '16/11/2026',
        ngayNhapSay: '16/11/2026',
        loaiLua: 'L5451',
        slKg: 300000,
        kcsPercent: 17,
      },
    ];

    const report = buildUngroundReport(mockKho, mockTuoi, '16/11/2026');

    // Kiểm tra tính toán từng loại lúa
    const itemL5451 = report.items.find((i) => i.loaiLua === 'L5451');
    expect(itemL5451).toBeDefined();
    expect(itemL5451!.tuoiKg).toBe(300000);
    expect(itemL5451!.kcsLossPercent).toBe(17);
    expect(itemL5451!.lossKg).toBe(51000);
    expect(itemL5451!.convertedDryKg).toBe(249000);
    expect(itemL5451!.totalDryHeadTons).toBe(249);

    const itemOM18 = report.items.find((i) => i.loaiLua === 'OM18');
    expect(itemOM18).toBeDefined();
    expect(itemOM18!.khoKg).toBe(170150);
    expect(itemOM18!.tuoiKg).toBe(360000);
    expect(itemOM18!.totalDryHeadTons).toBe(476);

    // Tổng cộng
    expect(report.totalDryHeadTons).toBe(476 + 249); // 725 tấn

    // Kiểm tra định dạng tin nhắn Zalo
    expect(report.zaloText).toContain('Dạ, e gửi Báo cáo Lượng Lúa khô CHƯA XAY đến ngày 16/11/2026');
    expect(report.zaloText).toContain('Tổng lượng: 725 tấn (ước tính theo đầu lúa khô). 🌾 🌾 🌾');
    expect(report.zaloText).toContain('- Lúa L5451: 249 tấn');
    expect(report.zaloText).toContain('- Lúa OM18: 476 tấn');
    expect(report.zaloText).toContain(
      'Ghi chú: Số lượng trên là bao gồm lúa khô đang nằm tài và lúa tươi đang nhập sấy, chờ sấy'
    );
  });

  it('luôn làm tròn xuống số tấn cho Báo Cáo Chưa Xay (ví dụ 78.800 kg làm tròn xuống 78 tấn)', () => {
    expect(floorRiceTons(78800)).toBe(78);
    expect(floorRiceTons(78100)).toBe(78);
    expect(floorRiceTons(78999)).toBe(78);
    expect(floorRiceTons(125400)).toBe(125);
    expect(floorRiceTons(0)).toBe(0);

    // Kiểm tra trong buildUngroundReport với lô 78.800 kg
    const mockKho78k: UngroundKhoBatch[] = [
      {
        id: 'kho-78',
        ngayCan: '20/11/2026',
        loaiLua: 'Đài Thơm 8',
        slKg: 78800,
      },
    ];

    const report = buildUngroundReport(mockKho78k, [], '20/11/2026');
    const dt8 = report.items.find((i) => i.loaiLua === 'Đài Thơm 8');
    expect(dt8).toBeDefined();
    expect(dt8?.khoKg).toBe(78800);
    expect(dt8?.khoTons).toBe(78); // 78.800 kg làm tròn xuống 78 tấn
    expect(dt8?.totalDryHeadTons).toBe(78);
    expect(report.totalDryHeadTons).toBe(78);
    expect(report.zaloText).toContain('- Lúa Đài Thơm 8: 78 tấn');
  });

  it('xuất file Excel báo cáo đúng 3 sheets: TỔNG HỢP CHƯA XAY, LÚA KHÔ NẰM TÀI, LÚA TƯƠI CHỜ SẤY', async () => {
    const { POST } = await import('../app/api/rice-payroll/unground-report/route');
    const { NextRequest } = await import('next/server');
    const { SESSION_COOKIE_NAME } = await import('../lib/auth');
    const XLSX = await import('xlsx');

    const req = new NextRequest('http://localhost:3000/api/rice-payroll/unground-report', {
      method: 'POST',
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=authenticated`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        khoBatches: [{ id: 'k1', ngayCan: '12/11/2026', loaiLua: 'OM18', slKg: 100000 }],
        tuoiBatches: [
          {
            id: 't1',
            ngayCan: '16/11/2026',
            ngayNhapSay: '16/11/2026',
            loaiLua: 'L5451',
            slKg: 300000,
            kcsPercent: 17,
          },
        ],
        reportDate: '16/11/2026',
        exportExcel: true,
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);

    const buf = await res.arrayBuffer();
    const wb = XLSX.read(Buffer.from(buf), { type: 'buffer' });
    expect(wb.SheetNames).toEqual(['TỔNG HỢP CHƯA XAY', 'LÚA KHÔ NẰM TÀI', 'LÚA TƯƠI CHỜ SẤY']);
  });
});
