import { renderContractDocx } from '../lib/render-contract.ts';
import { moneyToVietnameseWords, formatVND } from '../lib/number-to-vi-words.ts';
import { COMPANY_A } from '../lib/company-config.ts';
import PizZip from 'pizzip';
import fs from 'fs';
import path from 'path';

console.log('--- KIỂM TRA XUẤT HỢP ĐỒNG 2 MẶT HÀNG ---');

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
    unit: item.unit,
    unit_price: formatVND(item.unitPrice),
    total: formatVND(lineTotal),
  };
});

// Grand total: 200.000 * 1.800 = 360.000.000
// + 50.000 * 3.200 = 160.000.000
// Total = 520.000.000

const mockData = {
  contract_no: '250926/CC-TP',
  sign_day: '25',
  sign_month: '09',
  sign_year: '2026',

  // Bên A (Cố định)
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

  // Bên B
  b_name: 'CÔNG TY TNHH SẢN XUẤT - THƯƠNG MẠI - DỊCH VỤ THÀNH PHÁT TG',
  b_address: '135 Trần Ngọc Giải, Phường Thới Sơn, Tỉnh Đồng Tháp',
  b_phone: '0902 589 705',
  b_mst: '1201695642',
  b_representative: 'MAI TRẦN ĐĂNG GIANG',
  b_title: 'Phó Giám đốc',
  b_bank_account: '',
  b_bank_name: '',
  b_signer_name: 'MAI TRẦN ĐĂNG GIANG',

  delivery_start_date: '25/09/2026',
  delivery_end_date: '25/10/2026',
  delivery_location: 'Giao hàng tại kho Bên A.',
  payment_method: 'Chuyển khoản 100% giá trị đơn hàng.',

  items: itemsFormatted,
  total_amount: formatVND(grandTotal),
  total_words: moneyToVietnameseWords(grandTotal),
};

console.log('Tổng tiền tính tại Server:', mockData.total_amount, 'VNĐ');
console.log('Bằng chữ:', mockData.total_words);

const docxBuffer = renderContractDocx(mockData);

// Lưu file ra thư mục kiểm tra
const outPath = path.resolve('templates/test-xuat-hop-dong-2-mat-hang.docx');
fs.writeFileSync(outPath, docxBuffer);
console.log('✅ Đã xuất file thành công tại:', outPath);
console.log('   Kích thước file:', docxBuffer.length, 'bytes');

// Đọc lại nội dung OOXML
const zip = new PizZip(docxBuffer);
const documentXml = zip.file('word/document.xml').asText();

// Kiểm tra assertions
const checks = [
  { name: 'Bên A cố định CHƠN CHÍNH', pass: documentXml.includes('CHƠN CHÍNH') },
  { name: 'Đại diện Bên A NGUYỄN THỊ DIỄM', pass: documentXml.includes('NGUYỄN THỊ DIỄM') },
  { name: 'Bên B THÀNH PHÁT TG', pass: documentXml.includes('THÀNH PHÁT TG') },
  { name: 'Mặt hàng 1: Trấu xay', pass: documentXml.includes('Trấu xay') },
  { name: 'Mặt hàng 2: Cám mịn', pass: documentXml.includes('Cám mịn') },
  { name: 'Số lượng mặt hàng 1: 200.000', pass: documentXml.includes('200.000') },
  { name: 'Số lượng mặt hàng 2: 50.000', pass: documentXml.includes('50.000') },
  { name: 'Tổng số tiền: 520.000.000', pass: documentXml.includes('520.000.000') },
  { name: 'Số tiền bằng chữ đúng', pass: documentXml.includes(mockData.total_words) },
];

console.log('\n--- KẾT QUẢ KIỂM THỬ NỘI DUNG FILE DOCX ---');
let allPass = true;
for (const c of checks) {
  console.log(`${c.pass ? '✅' : '❌'} ${c.name}`);
  if (!c.pass) allPass = false;
}

if (!allPass) {
  process.exit(1);
} else {
  console.log('\n🎉 TẤT CẢ TIÊU CHÍ ĐỀU CHÍNH XÁC 100%!');
}

