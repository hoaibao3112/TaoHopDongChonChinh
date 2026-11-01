import PizZip from 'pizzip';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const templatePath = path.join(__dirname, '../templates/hop-dong-mua-ban.docx');

const content = fs.readFileSync(templatePath, 'binary');
const zip = new PizZip(content);
let xml = zip.file('word/document.xml').asText();

// 1. Cập nhật lề trang chuẩn Nghị định 30/2020/NĐ-CP (Top: 20mm=1134, Bottom: 20mm=1134, Left: 30mm=1701, Right: 20mm=1134)
xml = xml.replace(
  /<w:pgMar[^>]*\/>/,
  '<w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1701" w:header="720" w:footer="720" w:gutter="0"/>'
);

// 2. Chỉnh Quốc hiệu & Tiêu ngữ, Căn cứ thành single line spacing (240) để đúng chuẩn hành chính và tiết kiệm diện tích đầu trang
// P1: CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM
xml = xml.replace(
  /(<w:p>[\s\S]*?<w:t>CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM<\/w:t>[\s\S]*?<\/w:p>)/,
  (m) => m.replace(/<w:spacing[^>]*\/>/g, '<w:spacing w:line="240" w:lineRule="auto" w:before="0" w:after="0"/>')
);

// P2: Độc lập – Tự do – Hạnh phúc
xml = xml.replace(
  /(<w:p>[\s\S]*?<w:t>Độc lập – Tự do – Hạnh phúc<\/w:t>[\s\S]*?<\/w:p>)/,
  (m) => m.replace(/<w:spacing[^>]*\/>/g, '<w:spacing w:line="240" w:lineRule="auto" w:before="0" w:after="0"/>')
);

// P3: ------------------------
xml = xml.replace(
  /(<w:p>[\s\S]*?<w:t>------------------------<\/w:t>[\s\S]*?<\/w:p>)/,
  (m) => m.replace(/<w:spacing[^>]*\/>/g, '<w:spacing w:line="240" w:lineRule="auto" w:before="0" w:after="60"/>')
);

// Tiêu đề & Số Hợp đồng
xml = xml.replace(
  /(<w:p>[\s\S]*?<w:t>HỢP ĐỒNG MUA BÁN HÀNG HÓA<\/w:t>[\s\S]*?<\/w:p>)/,
  (m) => m.replace(/<w:spacing[^>]*\/>/g, '<w:spacing w:before="100" w:after="40" w:line="300" w:lineRule="auto"/>')
);
xml = xml.replace(
  /(<w:p>[\s\S]*?<w:t>Số: \{contract_no\}<\/w:t>[\s\S]*?<\/w:p>)/,
  (m) => m.replace(/<w:spacing[^>]*\/>/g, '<w:spacing w:line="240" w:lineRule="auto" w:before="0" w:after="80"/>')
);

// 3 dòng căn cứ: single line spacing (240)
xml = xml.replace(
  /(<w:p>[\s\S]*?<w:t>- Căn cứ Bộ luật dân sự[\s\S]*?<\/w:p>)/,
  (m) => m.replace(/<w:spacing[^>]*\/>/g, '<w:spacing w:line="240" w:lineRule="auto" w:before="40" w:after="0"/>')
);
xml = xml.replace(
  /(<w:p>[\s\S]*?<w:t>- Căn cứ luật thương mại[\s\S]*?<\/w:p>)/,
  (m) => m.replace(/<w:spacing[^>]*\/>/g, '<w:spacing w:line="240" w:lineRule="auto" w:before="0" w:after="0"/>')
);
xml = xml.replace(
  /(<w:p>[\s\S]*?<w:t>- Căn cứ vào nhu cầu và khả năng[\s\S]*?<\/w:p>)/,
  (m) => m.replace(/<w:spacing[^>]*\/>/g, '<w:spacing w:line="240" w:lineRule="auto" w:before="0" w:after="60"/>')
);

// Giảm bớt khoảng cách before/after thừa trước Bảng hàng hóa
xml = xml.replace(
  /(<w:p>[\s\S]*?<w:t>Hôm nay, ngày \{sign_day\}[\s\S]*?<\/w:p>)/,
  (m) => m.replace(/<w:spacing[^>]*\/>/g, '<w:spacing w:before="60" w:after="40" w:line="360" w:lineRule="auto"/>')
);
xml = xml.replace(
  /(<w:p>[\s\S]*?<w:t>Ngân hàng: \{a_bank_name\}<\/w:t>[\s\S]*?<\/w:p>)/,
  (m) => m.replace(/<w:spacing[^>]*\/>/g, '<w:spacing w:before="0" w:after="60" w:line="360" w:lineRule="auto"/>')
);
xml = xml.replace(
  /(<w:p>[\s\S]*?<w:t xml:space="preserve">Người đại diện: <\/w:t>[\s\S]*?\{b_representative\}[\s\S]*?<\/w:p>)/,
  (m) => m.replace(/<w:spacing[^>]*\/>/g, '<w:spacing w:before="0" w:after="40" w:line="360" w:lineRule="auto"/>')
);
xml = xml.replace(
  /(<w:p>[\s\S]*?<w:t>Sau khi trao đổi, hai bên thống nhất các điều khoản sau:<\/w:t>[\s\S]*?<\/w:p>)/,
  (m) => m.replace(/<w:spacing[^>]*\/>/g, '<w:spacing w:before="40" w:after="40" w:line="360" w:lineRule="auto"/>')
);

// Điều 1: thêm w:keepWithNext để luôn dính với bảng hàng hóa
xml = xml.replace(
  /<w:p>\s*(<w:pPr><w:spacing[^>]*\/>)([\s\S]*?<w:t>Điều 1: Tên hàng – Số lượng – Đơn giá:<\/w:t>[\s\S]*?<\/w:p>)/,
  '<w:p><w:pPr><w:spacing w:before="40" w:after="40" w:line="360" w:lineRule="auto"/><w:keepWithNext/>$2'
);

// 3. XÂY DỰNG LẠI BẢNG HÀNG HÓA GỌN ĐẸP, CHUẨN XÁC THEO HÌNH 2
// Cột:
// - Số TT: 700 dxa (center)
// - Tên hàng: 2700 dxa (left)
// - Số lượng (kg): 1600 dxa (center header, right data)
// - Đơn giá (đồng/kg): 1770 dxa (center header, right data)
// - Thành tiền (đồng): 2300 dxa (center header, right data)
// Tổng width: 9070 dxa (khớp vừa vặn lề trang A4)

const compactTableXml = `<w:tbl>
    <w:tblPr>
      <w:tblStyle w:val="TableGrid"/>
      <w:tblW w:w="9070" w:type="dxa"/>
      <w:jc w:val="center"/>
      <w:tblBorders>
        <w:top w:val="single" w:sz="6" w:space="0" w:color="000000"/>
        <w:left w:val="single" w:sz="6" w:space="0" w:color="000000"/>
        <w:bottom w:val="single" w:sz="6" w:space="0" w:color="000000"/>
        <w:right w:val="single" w:sz="6" w:space="0" w:color="000000"/>
        <w:insideH w:val="single" w:sz="4" w:space="0" w:color="000000"/>
        <w:insideV w:val="single" w:sz="4" w:space="0" w:color="000000"/>
      </w:tblBorders>
      <w:tblCellMar>
        <w:top w:w="60" w:type="dxa"/>
        <w:left w:w="120" w:type="dxa"/>
        <w:bottom w:w="60" w:type="dxa"/>
        <w:right w:w="120" w:type="dxa"/>
      </w:tblCellMar>
    </w:tblPr>
    <!-- Header row -->
    <w:tr>
      <w:trPr>
        <w:tblHeader/>
        <w:cantSplit/>
        <w:trHeight w:val="320" w:hRule="atLeast"/>
      </w:trPr>
      <w:tc>
        <w:tcPr><w:tcW w:w="700" w:type="dxa"/><w:vAlign w:val="center"/></w:tcPr>
        <w:p><w:pPr><w:spacing w:line="240" w:lineRule="auto" w:before="0" w:after="0"/><w:jc w:val="center"/><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:b/><w:sz w:val="24"/></w:rPr></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:b/><w:sz w:val="24"/></w:rPr><w:t>Số TT</w:t></w:r></w:p>
      </w:tc>
      <w:tc>
        <w:tcPr><w:tcW w:w="2700" w:type="dxa"/><w:vAlign w:val="center"/></w:tcPr>
        <w:p><w:pPr><w:spacing w:line="240" w:lineRule="auto" w:before="0" w:after="0"/><w:jc w:val="center"/><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:b/><w:sz w:val="24"/></w:rPr></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:b/><w:sz w:val="24"/></w:rPr><w:t>Tên hàng</w:t></w:r></w:p>
      </w:tc>
      <w:tc>
        <w:tcPr><w:tcW w:w="1600" w:type="dxa"/><w:vAlign w:val="center"/></w:tcPr>
        <w:p><w:pPr><w:spacing w:line="240" w:lineRule="auto" w:before="0" w:after="0"/><w:jc w:val="center"/><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:b/><w:sz w:val="24"/></w:rPr></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:b/><w:sz w:val="24"/></w:rPr><w:t>Số lượng (kg)</w:t></w:r></w:p>
      </w:tc>
      <w:tc>
        <w:tcPr><w:tcW w:w="1770" w:type="dxa"/><w:vAlign w:val="center"/></w:tcPr>
        <w:p><w:pPr><w:spacing w:line="240" w:lineRule="auto" w:before="0" w:after="0"/><w:jc w:val="center"/><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:b/><w:sz w:val="24"/></w:rPr></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:b/><w:sz w:val="24"/></w:rPr><w:t>Đơn giá (đồng/kg)</w:t></w:r></w:p>
      </w:tc>
      <w:tc>
        <w:tcPr><w:tcW w:w="2300" w:type="dxa"/><w:vAlign w:val="center"/></w:tcPr>
        <w:p><w:pPr><w:spacing w:line="240" w:lineRule="auto" w:before="0" w:after="0"/><w:jc w:val="center"/><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:b/><w:sz w:val="24"/></w:rPr></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:b/><w:sz w:val="24"/></w:rPr><w:t>Thành tiền (đồng)</w:t></w:r></w:p>
      </w:tc>
    </w:tr>
    <!-- Repeating items row -->
    <w:tr>
      <w:trPr>
        <w:cantSplit/>
        <w:trHeight w:val="300" w:hRule="atLeast"/>
      </w:trPr>
      <w:tc>
        <w:tcPr><w:tcW w:w="700" w:type="dxa"/><w:vAlign w:val="center"/></w:tcPr>
        <w:p><w:pPr><w:spacing w:line="240" w:lineRule="auto" w:before="0" w:after="0"/><w:jc w:val="center"/><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:sz w:val="24"/></w:rPr></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:sz w:val="24"/></w:rPr><w:t>{#items}{stt}</w:t></w:r></w:p>
      </w:tc>
      <w:tc>
        <w:tcPr><w:tcW w:w="2700" w:type="dxa"/><w:vAlign w:val="center"/></w:tcPr>
        <w:p><w:pPr><w:spacing w:line="240" w:lineRule="auto" w:before="0" w:after="0"/><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:sz w:val="24"/></w:rPr></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:sz w:val="24"/></w:rPr><w:t>{name}</w:t></w:r></w:p>
      </w:tc>
      <w:tc>
        <w:tcPr><w:tcW w:w="1600" w:type="dxa"/><w:vAlign w:val="center"/></w:tcPr>
        <w:p><w:pPr><w:spacing w:line="240" w:lineRule="auto" w:before="0" w:after="0"/><w:jc w:val="right"/><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:sz w:val="24"/></w:rPr></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:sz w:val="24"/></w:rPr><w:t>{quantity}</w:t></w:r></w:p>
      </w:tc>
      <w:tc>
        <w:tcPr><w:tcW w:w="1770" w:type="dxa"/><w:vAlign w:val="center"/></w:tcPr>
        <w:p><w:pPr><w:spacing w:line="240" w:lineRule="auto" w:before="0" w:after="0"/><w:jc w:val="right"/><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:sz w:val="24"/></w:rPr></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:sz w:val="24"/></w:rPr><w:t>{unit_price}</w:t></w:r></w:p>
      </w:tc>
      <w:tc>
        <w:tcPr><w:tcW w:w="2300" w:type="dxa"/><w:vAlign w:val="center"/></w:tcPr>
        <w:p><w:pPr><w:spacing w:line="240" w:lineRule="auto" w:before="0" w:after="0"/><w:jc w:val="right"/><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:sz w:val="24"/></w:rPr></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:sz w:val="24"/></w:rPr><w:t>{total}{/items}</w:t></w:r></w:p>
      </w:tc>
    </w:tr>
    <!-- Total Row -->
    <w:tr>
      <w:trPr>
        <w:cantSplit/>
        <w:trHeight w:val="300" w:hRule="atLeast"/>
      </w:trPr>
      <w:tc>
        <w:tcPr><w:tcW w:w="700" w:type="dxa"/><w:vAlign w:val="center"/></w:tcPr>
        <w:p><w:pPr><w:spacing w:line="240" w:lineRule="auto" w:before="0" w:after="0"/></w:pPr><w:r><w:t></w:t></w:r></w:p>
      </w:tc>
      <w:tc>
        <w:tcPr><w:tcW w:w="2700" w:type="dxa"/><w:vAlign w:val="center"/></w:tcPr>
        <w:p><w:pPr><w:spacing w:line="240" w:lineRule="auto" w:before="0" w:after="0"/></w:pPr><w:r><w:t></w:t></w:r></w:p>
      </w:tc>
      <w:tc>
        <w:tcPr><w:tcW w:w="1600" w:type="dxa"/><w:vAlign w:val="center"/></w:tcPr>
        <w:p><w:pPr><w:spacing w:line="240" w:lineRule="auto" w:before="0" w:after="0"/></w:pPr><w:r><w:t></w:t></w:r></w:p>
      </w:tc>
      <w:tc>
        <w:tcPr><w:tcW w:w="1770" w:type="dxa"/><w:vAlign w:val="center"/></w:tcPr>
        <w:p><w:pPr><w:spacing w:line="240" w:lineRule="auto" w:before="0" w:after="0"/><w:jc w:val="center"/><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:b/><w:sz w:val="24"/></w:rPr></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:b/><w:sz w:val="24"/></w:rPr><w:t>TỔNG</w:t></w:r></w:p>
      </w:tc>
      <w:tc>
        <w:tcPr><w:tcW w:w="2300" w:type="dxa"/><w:vAlign w:val="center"/></w:tcPr>
        <w:p><w:pPr><w:spacing w:line="240" w:lineRule="auto" w:before="0" w:after="0"/><w:jc w:val="right"/><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:b/><w:sz w:val="24"/></w:rPr></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:b/><w:sz w:val="24"/></w:rPr><w:t>{total_amount}</w:t></w:r></w:p>
      </w:tc>
    </w:tr>
  </w:tbl>`;

xml = xml.replace(/<w:tbl>[\s\S]*?<\/w:tbl>/, compactTableXml);

// 4. Đoạn chữ sau bảng: "(Giá trị hợp đồng bằng chữ: ...)"
xml = xml.replace(
  /(<w:p>[\s\S]*?<w:t>\(Giá trị hợp đồng bằng chữ: \{total_words\}\)\.<\/w:t>[\s\S]*?<\/w:p>)/,
  (m) => m.replace(/<w:spacing[^>]*\/>/g, '<w:spacing w:before="60" w:after="60" w:line="360" w:lineRule="auto"/>')
);

// Ghi lại template
zip.file('word/document.xml', xml);
const buf = zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' });
fs.writeFileSync(templatePath, buf);
console.log('✅ Đã cập nhật template thành công với bảng gọn gàng chuẩn Hình 2!');
