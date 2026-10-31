/**
 * Script sửa template hop-dong-mua-ban.docx:
 * 1. Thêm cột {unit} vào bảng hàng hóa (giữa {quantity} và {unit_price})
 * 2. Thêm {b_bank_account} và {b_bank_name} vào phần Bên B (sau {b_title})
 * 3. Thêm header "ĐVT" vào header row của bảng
 */

import PizZip from 'pizzip';
import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const TEMPLATE_PATH = join(ROOT, 'templates', 'hop-dong-mua-ban.docx');

console.log('📂 Đọc template:', TEMPLATE_PATH);
const content = readFileSync(TEMPLATE_PATH);
const zip = new PizZip(content);
let xml = zip.files['word/document.xml'].asText();

// ─────────────────────────────────────────────────────────────────────────────
// FIX 1: Thêm cột {unit} vào data row (sau ô {quantity}, trước ô {unit_price})
// ─────────────────────────────────────────────────────────────────────────────
// Cấu trúc hiện tại: <w:tc>..{quantity}..</w:tc> <w:tc>..{unit_price}..</w:tc>
// Cần chèn thêm: <w:tc>..{unit}..</w:tc> ở giữa

const QUANTITY_TC_PATTERN = `<w:tc><w:tcPr><w:tcW w:w="1600" w:type="dxa"/></w:tcPr><w:p><w:pPr><w:jc w:val="right"/><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:sz w:val="24"/></w:rPr></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:sz w:val="24"/></w:rPr><w:t>{quantity}</w:t></w:r></w:p></w:tc>`;

// Ô {unit} — canh giữa, cùng font Times New Roman sz 24, width 900
const UNIT_TC_NEW = `<w:tc><w:tcPr><w:tcW w:w="900" w:type="dxa"/></w:tcPr><w:p><w:pPr><w:jc w:val="center"/><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:sz w:val="24"/></w:rPr></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:sz w:val="24"/></w:rPr><w:t>{unit}</w:t></w:r></w:p></w:tc>`;

if (!xml.includes(QUANTITY_TC_PATTERN)) {
  console.error('❌ Không tìm thấy pattern ô {quantity} — kiểm tra lại XML!');
  process.exit(1);
}

xml = xml.replace(QUANTITY_TC_PATTERN, QUANTITY_TC_PATTERN + '\n      ' + UNIT_TC_NEW);
console.log('✅ Fix 1: Đã thêm cột {unit} vào data row bảng hàng hóa');

// ─────────────────────────────────────────────────────────────────────────────
// FIX 2: Thêm header "ĐVT" vào header row của bảng hàng hóa
// Tìm header row bằng cách tìm pattern header "Số lượng" và chèn "ĐVT" sau đó
// ─────────────────────────────────────────────────────────────────────────────
// Header row có cấu trúc w:sz="24" w:b cho bold, tìm ô "Số lượng"
// Header ĐVT — bold, canh giữa, width 900 (khớp với data row)
const DVT_HEADER_NEW = `<w:tc><w:tcPr><w:tcW w:w="900" w:type="dxa"/></w:tcPr><w:p><w:pPr><w:jc w:val="center"/><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:b/><w:sz w:val="24"/></w:rPr></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:b/><w:sz w:val="24"/></w:rPr><w:t>&#x110;VT</w:t></w:r></w:p></w:tc>`;

// Fallback: Tìm ô header w:w="1600" trong header row (ngay trước <!-- Repeating items row -->)
// Text bị encode lạ (Windows-1252) nên dùng pattern XML structure thay vì text
const REPEAT_COMMENT = '<!-- Repeating items row -->';
const repeatCommentIdx = xml.indexOf(REPEAT_COMMENT);
if (repeatCommentIdx === -1) {
  console.error('❌ Không tìm thấy comment "Repeating items row"!');
  process.exit(1);
}
// Header row là <w:tr>...</w:tr> ngay trước comment này
// Tìm ô w:w="1600" trong header row: đây là ô "Số lượng"
const headerSection = xml.substring(0, repeatCommentIdx);
// Ô header w:w="1600" có w:b/ (bold) — khác với data row không có w:b/
const HEADER_1600_CLOSE = '<w:tcPr><w:tcW w:w="1600" w:type="dxa"/></w:tcPr>';
const h1600Idx = headerSection.lastIndexOf(HEADER_1600_CLOSE);
if (h1600Idx === -1) {
  console.warn('⚠️  Không tìm thấy header ô 1600 — bỏ qua Fix 2');
} else {
  // Tìm </w:tc> kế tiếp sau ô này
  const closeTcIdx = xml.indexOf('</w:tc>', h1600Idx);
  if (closeTcIdx > -1) {
    xml = xml.slice(0, closeTcIdx + 7) + '\n      ' + DVT_HEADER_NEW + xml.slice(closeTcIdx + 7);
    console.log('✅ Fix 2: Đã thêm header "ĐVT" vào header row (position:', closeTcIdx, ')');
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// FIX 3: Thêm {b_bank_account} và {b_bank_name} vào phần Bên B
// Chèn 2 paragraph mới sau paragraph chứa {b_title}
// ─────────────────────────────────────────────────────────────────────────────
// Pattern paragraph chứa {b_title} — kết thúc bằng </w:p>
const B_TITLE_PARA_END = `Chức vụ: {b_title}</w:t></w:r>\n  </w:p>`;

// 2 paragraph mới: "Tài khoản: {b_bank_account}" và "Ngân hàng: {b_bank_name}"
// Dùng cùng style paragraph w:spacing after="80", font Times New Roman sz 26
// Wrap bằng điều kiện {#b_bank_account}...{/b_bank_account} để ẩn khi rỗng
const BANK_B_PARAS = `
  <w:p>
    <w:pPr><w:spacing w:after="80"/><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:sz w:val="26"/></w:rPr></w:pPr>
    <w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:sz w:val="26"/></w:rPr><w:t>{b_bank_account}</w:t></w:r>
  </w:p>
  <w:p>
    <w:pPr><w:spacing w:after="120"/><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:sz w:val="26"/></w:rPr></w:pPr>
    <w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:sz w:val="26"/></w:rPr><w:t>{b_bank_name}</w:t></w:r>
  </w:p>`;

if (!xml.includes(B_TITLE_PARA_END)) {
  console.error('❌ Không tìm thấy pattern {b_title} paragraph end!');
  process.exit(1);
}

xml = xml.replace(B_TITLE_PARA_END, B_TITLE_PARA_END + BANK_B_PARAS);
console.log('✅ Fix 3: Đã thêm {b_bank_account} và {b_bank_name} vào phần Bên B');

// ─────────────────────────────────────────────────────────────────────────────
// Ghi lại file — dùng zip.file() để PizZip encode UTF-8 đúng cách
// KHÔNG dùng Object.assign trực tiếp vì sẽ làm hỏng encoding Vietnamese
// ─────────────────────────────────────────────────────────────────────────────
zip.file('word/document.xml', xml);

const output = zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' });
writeFileSync(TEMPLATE_PATH, output);
console.log('\n🎉 Template đã được cập nhật thành công:', TEMPLATE_PATH);

// ─────────────────────────────────────────────────────────────────────────────
// Verify: đọc lại và in ra tất cả placeholder
// ─────────────────────────────────────────────────────────────────────────────
const verifyContent = readFileSync(TEMPLATE_PATH);
const verifyZip = new PizZip(verifyContent);
const verifyXml = verifyZip.files['word/document.xml'].asText();
const matches = [...verifyXml.matchAll(/\{([^}]+)\}/g)].map((m) => m[0]);
const unique = [...new Set(matches)];
console.log('\n📋 Tất cả placeholder trong template sau khi fix:');
console.log(unique.join(', '));

const required = ['{unit}', '{b_bank_account}', '{b_bank_name}'];
const missing = required.filter((p) => !unique.includes(p));
if (missing.length > 0) {
  console.error('\n❌ VẪN THIẾU placeholder:', missing.join(', '));
  process.exit(1);
} else {
  console.log('\n✅ Tất cả placeholder bắt buộc đã có!');
}
