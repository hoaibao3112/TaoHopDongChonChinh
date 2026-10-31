import { describe, it, expect } from 'vitest';
import { renderContractDocx } from '../lib/render-contract';
import { moneyToVietnameseWords, formatVND } from '../lib/number-to-vi-words';
import { COMPANY_A } from '../lib/company-config';
import PizZip from 'pizzip';
import fs from 'fs';
import path from 'path';

describe('Kiểm tra xuất hợp đồng với 2 mặt hàng (theo yêu cầu công việc)', () => {
  it('Xuất file Word chứa đầy đủ 2 mặt hàng, tính đúng tổng tiền và chữ số', () => {
    const itemsInput = [
      { name: 'Trấu xay', quantity: 200000, unit: 'kg', unitPrice: 1800 },
      { name: 'Cám mịn', quantity: 50000, unit: 'kg', unitPrice: 3200 },
    ];

    let grandTotal = 0;
    const itemsFormatted = itemsInput.map((item, idx) => {
      const lineTotal = item.quantity * item.unitPrice;
      grandTotal += lineTotal;
      return {
        stt: idx + 1,
        name: item.name,
        quantity: formatVND(item.quantity),
        unit_price: formatVND(item.unitPrice),
        total: formatVND(lineTotal),
      };
    });

    // 200.000 * 1.800 = 360.000.000
    // 50.000 * 3.200 = 160.000.000
    // Grand Total = 520.000.000
    expect(grandTotal).toBe(520000000);

    const totalWords = moneyToVietnameseWords(grandTotal);
    expect(totalWords).toBe('Năm trăm hai mươi triệu đồng');

    const mockData = {
      contract_no: '250926/CC-TP',
      sign_day: '25',
      sign_month: '09',
      sign_year: '2026',

      a_name: COMPANY_A.name,
      a_address: COMPANY_A.address,
      a_phone: COMPANY_A.phone,
      a_mst: COMPANY_A.mst,
      a_representative: COMPANY_A.representative,
      a_title: COMPANY_A.title,
      a_authorization: COMPANY_A.authorizationNote,
      a_bank_account: COMPANY_A.bankAccount,
      a_bank_name: COMPANY_A.bankName,
      a_signer_name: COMPANY_A.signerName,

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

      items: itemsFormatted,
      total_amount: formatVND(grandTotal),
      total_words: totalWords,
    };

    const docxBuffer = renderContractDocx(mockData);

    // Lưu file ra đĩa để nghiệm thu
    const outPath = path.resolve('templates/test-hop-dong-2-mat-hang.docx');
    fs.writeFileSync(outPath, docxBuffer);

    // Đọc lại nội dung docx
    const zip = new PizZip(docxBuffer);
    const documentXml = zip.file('word/document.xml')?.asText();

    expect(documentXml).toBeDefined();

    // 1. Bên A không đổi
    expect(documentXml).toContain(COMPANY_A.name);
    expect(documentXml).toContain(COMPANY_A.representative);
    expect(documentXml).toContain(COMPANY_A.bankAccount);

    // 2. Bên B đúng
    expect(documentXml).toContain('THÀNH PHÁT TG');
    expect(documentXml).toContain('MAI TRẦN ĐĂNG GIANG');

    // 3. Đầy đủ cả 2 mặt hàng trong bảng
    expect(documentXml).toContain('Trấu xay');
    expect(documentXml).toContain('Cám mịn');
    expect(documentXml).toContain('200.000');
    expect(documentXml).toContain('50.000');
    expect(documentXml).toContain('1.800');
    expect(documentXml).toContain('3.200');
    expect(documentXml).toContain('360.000.000');
    expect(documentXml).toContain('160.000.000');

    // 4. Tổng và số tiền bằng chữ đúng
    expect(documentXml).toContain('520.000.000');
    expect(documentXml).toContain('Năm trăm hai mươi triệu đồng');
  });
});

