import { describe, it, expect } from 'vitest';
import { renderContractDocx } from '../lib/render-contract';
import type { ContractTemplateData } from '../lib/contract-schema';
import PizZip from 'pizzip';

describe('Render File Hợp Đồng .docx (renderContractDocx)', () => {
  it('Xuất file docx hợp lệ chứa đúng tên Bên B, Bên A, và số tiền bằng chữ', () => {
    const mockData: ContractTemplateData = {
      contract_no: '250926/CC-TP',
      sign_day: '25',
      sign_month: '09',
      sign_year: '2026',

      a_name: 'CÔNG TY TNHH XUẤT NHẬP KHẨU CHƠN CHÍNH (BÊN BÁN)',
      a_address: 'Đường ĐT 846, Ấp 5, Xã Đốc Binh Kiều, Tỉnh Đồng Tháp, Việt Nam',
      a_phone: '0977 789 777',
      a_mst: '1402017541',
      a_representative: 'NGUYỄN THỊ DIỄM',
      a_title: 'Phó giám đốc',
      a_authorization: '(Theo giấy ủy quyền số: 15.09/UQ-CC)',
      a_bank_account: '070977789777',
      a_bank_name: 'TMCP Quân Đôi MB bank -CN ĐỒNG THÁP',
      a_signer_name: 'NGUYỄN THỊ DIỄM',

      b_name: 'CÔNG TY TNHH SẢN XUẤT - THƯƠNG MẠI - DỊCH VỤ THÀNH PHÁT TG',
      b_address: '135 Trần Ngọc Giải, Phường Thới Sơn, Tỉnh Đồng Tháp',
      b_phone: '0902 589 705',
      b_mst: '1201695642',
      b_representative: 'MAI TRẦN ĐĂNG GIANG',
      b_title: 'Phó Giám đốc',
      b_signer_name: 'MAI TRẦN ĐĂNG GIANG',

      delivery_start_date: '25/09/2026',
      delivery_end_date: '25/10/2026',
      delivery_location: 'Giao hàng tại kho Bên A.',
      payment_method: 'Chuyển khoản 100% giá trị đơn hàng.',

      items: [
        {
          stt: 1,
          name: 'Trấu xay',
          quantity: '200.000',
          unit_price: '1.800',
          total: '360.000.000',
        },
      ],
      total_amount: '360.000.000',
      total_words: 'Ba trăm sáu mươi triệu đồng',
    };

    // 1. Gọi hàm render
    const buffer = renderContractDocx(mockData);

    // 2. Kiểm tra Buffer trả về
    expect(Buffer.isBuffer(buffer)).toBe(true);
    expect(buffer.length).toBeGreaterThan(1000);

    // 3. Giải nén OOXML và đọc document.xml để verify nội dung
    const zip = new PizZip(buffer);
    const documentXml = zip.file('word/document.xml')?.asText();

    expect(documentXml).toBeDefined();
    // Phải chứa đúng tên Bên B
    expect(documentXml).toContain('THÀNH PHÁT TG');
    // Phải chứa đúng Bên A cố định
    expect(documentXml).toContain('CHƠN CHÍNH');
    expect(documentXml).toContain('NGUYỄN THỊ DIỄM');
    // Phải chứa đúng số tiền bằng chữ
    expect(documentXml).toContain('Ba trăm sáu mươi triệu đồng');
    // Phải chứa tổng số tiền dạng số
    expect(documentXml).toContain('360.000.000');
    // Phải chứa mặt hàng
    expect(documentXml).toContain('Trấu xay');

    // Phải có giãn dòng 1.5 (w:line="360")
    expect(documentXml).toContain('w:line="360"');

    // Đại diện 2 bên phải in đậm và màu đen
    expect(documentXml).toContain('w:b/>');
    expect(documentXml).toContain('w:color w:val="000000"');
    expect(documentXml).toContain('NGUYỄN THỊ DIỄM');
    expect(documentXml).toContain('MAI TRẦN ĐĂNG GIANG');

    // 1. Thời gian giao hàng: và 2. Địa điểm giao hàng: phải in đậm màu đen
    expect(documentXml).toContain('1. Thời gian giao hàng: </w:t>');
    expect(documentXml).toContain('2. Địa điểm giao hàng: </w:t>');
  });
});

