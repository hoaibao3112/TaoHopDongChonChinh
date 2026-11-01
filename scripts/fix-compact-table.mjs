import PizZip from 'pizzip';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const templatePath = path.join(__dirname, '../templates/hop-dong-mua-ban.docx');

const content = fs.readFileSync(templatePath, 'binary');
const zip = new PizZip(content);
let xml = zip.file('word/document.xml').asText();

// 1. Chuẩn hóa lề trang A4 theo Nghị định 30/2020/NĐ-CP (Top 20mm=1134, Bottom 20mm=1134, Left 30mm=1701, Right 20mm=1134)
xml = xml.replace(
  /<w:pgMar[^>]*\/>/,
  '<w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1701" w:header="720" w:footer="720" w:gutter="0"/>'
);

const tableStartIdx = xml.indexOf('<w:tbl>');
const tableEndIdx = xml.indexOf('</w:tbl>') + 8;
let beforeTable = xml.substring(0, tableStartIdx);
let afterTable = xml.substring(tableEndIdx);

// Lấy danh sách paragraphs trước bảng
const paras = beforeTable.match(/<w:p[\s\S]*?<\/w:p>/g);
console.log('Số đoạn trước bảng:', paras.length);

const cleanedParas = paras.map((p, idx) => {
  const text = [...p.matchAll(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g)].map(m => m[1]).join('');
  
  // Quốc hiệu, Tiêu ngữ (đoạn 1, 2, 3)
  if (text.includes('CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM') || text.includes('Độc lập – Tự do – Hạnh phúc')) {
    return p.replace(/<w:spacing[^>]*\/>/g, '<w:spacing w:line="240" w:lineRule="auto" w:before="0" w:after="0"/>');
  }
  if (text.includes('------------------------')) {
    return p.replace(/<w:spacing[^>]*\/>/g, '<w:spacing w:line="240" w:lineRule="auto" w:before="0" w:after="40"/>');
  }
  
  // Tiêu đề & số hợp đồng
  if (text.includes('HỢP ĐỒNG MUA BÁN HÀNG HÓA')) {
    return p.replace(/<w:spacing[^>]*\/>/g, '<w:spacing w:line="240" w:lineRule="auto" w:before="60" w:after="20"/>');
  }
  if (text.includes('Số: {contract_no}')) {
    return `<w:p>
    <w:pPr><w:spacing w:line="240" w:lineRule="auto" w:before="0" w:after="40"/><w:jc w:val="center"/><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:b/><w:bCs/><w:sz w:val="26"/><w:szCs w:val="26"/></w:rPr></w:pPr>
    <w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:b/><w:bCs/><w:sz w:val="26"/><w:szCs w:val="26"/></w:rPr><w:t>Số: {contract_no}</w:t></w:r>
  </w:p>`;
  }
  
  // 3 dòng căn cứ: xóa bỏ bất kỳ căn giữa nào (w:jc) để cả 3 dòng căn trái thẳng hàng
  if (text.startsWith('- Căn cứ')) {
    const after = text.includes('nhu cầu') ? '40' : '0';
    let res = p.replace(/<w:jc[^>]*\/>/g, '');
    return res.replace(/<w:spacing[^>]*\/>/g, `<w:spacing w:line="240" w:lineRule="auto" w:before="0" w:after="${after}"/>`);
  }

  // Tự động bổ sung " (BÊN MUA)." vào sau tên Bên B theo đúng yêu cầu
  if (text.includes('BÊN B:')) {
    return `<w:p>
    <w:pPr><w:spacing w:line="360" w:lineRule="auto"/><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:b/><w:sz w:val="26"/></w:rPr></w:pPr>
    <w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:b/><w:sz w:val="26"/></w:rPr><w:t xml:space="preserve">BÊN B:  {b_name}  (BÊN MUA).</w:t></w:r>
  </w:p>`;
  }
  
  // Dòng Điều 1: Tiêu đề bảng
  if (text.includes('Điều 1: Tên hàng')) {
    let res = p.replace(/<w:spacing[^>]*\/>/g, '<w:spacing w:line="360" w:lineRule="auto" w:before="20" w:after="20"/>');
    if (!res.includes('<w:keepWithNext/>')) {
      res = res.replace(/<w:pPr>/, '<w:pPr><w:keepWithNext/>');
    }
    return res;
  }
  
  // Tất cả các đoạn văn thân hợp đồng (Bên A, Bên B, ngày tháng, sau khi trao đổi):
  // Giãn dòng 1.5 chuẩn (line="360"), không thêm before/after thừa
  return p.replace(/<w:spacing[^>]*\/>/g, '<w:spacing w:line="360" w:lineRule="auto"/>');
});

// Nối lại phần trước bảng
const newBeforeTable = beforeTable.substring(0, beforeTable.indexOf('<w:p>')) + cleanedParas.join('\n  ') + '\n\n  ';

// BẢNG HÀNG HÓA CHUẨN XÁC 100% THEO HÌNH ẢNH MẪU CỦA USER:
// - Header: KHÔNG CÓ w:tblHeader (để không bị lặp lại tiêu đề khi qua trang)
// - Row 1: lặp qua các items
// - Row 2: TỔNG gộp cột 1 + 2 thành 1 ô (gridSpan="2") với chữ TỔNG ở giữa in đậm
//   Cột 3, 4 để trống, cột 5 là {total_amount} in đậm canh phải
const tableXml = `<w:tbl>
    <w:tblPr>
      <w:tblStyle w:val="TableGrid"/>
      <w:tblW w:w="9360" w:type="dxa"/>
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
    <!-- Header row: TUYỆT ĐỐI KHÔNG có w:tblHeader -->
    <w:tr>
      <w:trPr>
        <w:cantSplit/>
        <w:trHeight w:val="320" w:hRule="atLeast"/>
      </w:trPr>
      <w:tc>
        <w:tcPr><w:tcW w:w="700" w:type="dxa"/><w:vAlign w:val="center"/></w:tcPr>
        <w:p><w:pPr><w:spacing w:line="240" w:lineRule="auto" w:before="0" w:after="0"/><w:jc w:val="center"/><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:b/><w:sz w:val="24"/></w:rPr></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:b/><w:sz w:val="24"/></w:rPr><w:t>Số TT</w:t></w:r></w:p>
      </w:tc>
      <w:tc>
        <w:tcPr><w:tcW w:w="2800" w:type="dxa"/><w:vAlign w:val="center"/></w:tcPr>
        <w:p><w:pPr><w:spacing w:line="240" w:lineRule="auto" w:before="0" w:after="0"/><w:jc w:val="center"/><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:b/><w:sz w:val="24"/></w:rPr></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:b/><w:sz w:val="24"/></w:rPr><w:t>Tên hàng</w:t></w:r></w:p>
      </w:tc>
      <w:tc>
        <w:tcPr><w:tcW w:w="1600" w:type="dxa"/><w:vAlign w:val="center"/></w:tcPr>
        <w:p><w:pPr><w:spacing w:line="240" w:lineRule="auto" w:before="0" w:after="0"/><w:jc w:val="center"/><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:b/><w:sz w:val="24"/></w:rPr></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:b/><w:sz w:val="24"/></w:rPr><w:t>Số lượng (kg)</w:t></w:r></w:p>
      </w:tc>
      <w:tc>
        <w:tcPr><w:tcW w:w="1800" w:type="dxa"/><w:vAlign w:val="center"/></w:tcPr>
        <w:p><w:pPr><w:spacing w:line="240" w:lineRule="auto" w:before="0" w:after="0"/><w:jc w:val="center"/><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:b/><w:sz w:val="24"/></w:rPr></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:b/><w:sz w:val="24"/></w:rPr><w:t>Đơn giá (đồng/kg)</w:t></w:r></w:p>
      </w:tc>
      <w:tc>
        <w:tcPr><w:tcW w:w="2460" w:type="dxa"/><w:vAlign w:val="center"/></w:tcPr>
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
        <w:tcPr><w:tcW w:w="2800" w:type="dxa"/><w:vAlign w:val="center"/></w:tcPr>
        <w:p><w:pPr><w:spacing w:line="240" w:lineRule="auto" w:before="0" w:after="0"/><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:sz w:val="24"/></w:rPr></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:sz w:val="24"/></w:rPr><w:t>{name}</w:t></w:r></w:p>
      </w:tc>
      <w:tc>
        <w:tcPr><w:tcW w:w="1600" w:type="dxa"/><w:vAlign w:val="center"/></w:tcPr>
        <w:p><w:pPr><w:spacing w:line="240" w:lineRule="auto" w:before="0" w:after="0"/><w:jc w:val="right"/><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:sz w:val="24"/></w:rPr></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:sz w:val="24"/></w:rPr><w:t>{quantity}</w:t></w:r></w:p>
      </w:tc>
      <w:tc>
        <w:tcPr><w:tcW w:w="1800" w:type="dxa"/><w:vAlign w:val="center"/></w:tcPr>
        <w:p><w:pPr><w:spacing w:line="240" w:lineRule="auto" w:before="0" w:after="0"/><w:jc w:val="right"/><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:sz w:val="24"/></w:rPr></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:sz w:val="24"/></w:rPr><w:t>{unit_price}</w:t></w:r></w:p>
      </w:tc>
      <w:tc>
        <w:tcPr><w:tcW w:w="2460" w:type="dxa"/><w:vAlign w:val="center"/></w:tcPr>
        <w:p><w:pPr><w:spacing w:line="240" w:lineRule="auto" w:before="0" w:after="0"/><w:jc w:val="right"/><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:sz w:val="24"/></w:rPr></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:sz w:val="24"/></w:rPr><w:t>{total}{/items}</w:t></w:r></w:p>
      </w:tc>
    </w:tr>
    <!-- Total Row: Gộp cột 1 & 2 thành 1 ô có chữ TỔNG ở giữa theo đúng mẫu -->
    <w:tr>
      <w:trPr>
        <w:cantSplit/>
        <w:trHeight w:val="300" w:hRule="atLeast"/>
      </w:trPr>
      <w:tc>
        <w:tcPr>
          <w:tcW w:w="3500" w:type="dxa"/>
          <w:gridSpan w:val="2"/>
          <w:vAlign w:val="center"/>
        </w:tcPr>
        <w:p><w:pPr><w:spacing w:line="240" w:lineRule="auto" w:before="0" w:after="0"/><w:jc w:val="center"/><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:b/><w:sz w:val="24"/></w:rPr></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:b/><w:sz w:val="24"/></w:rPr><w:t>TỔNG</w:t></w:r></w:p>
      </w:tc>
      <w:tc>
        <w:tcPr><w:tcW w:w="1600" w:type="dxa"/><w:vAlign w:val="center"/></w:tcPr>
        <w:p><w:pPr><w:spacing w:line="240" w:lineRule="auto" w:before="0" w:after="0"/></w:pPr><w:r><w:t></w:t></w:r></w:p>
      </w:tc>
      <w:tc>
        <w:tcPr><w:tcW w:w="1800" w:type="dxa"/><w:vAlign w:val="center"/></w:tcPr>
        <w:p><w:pPr><w:spacing w:line="240" w:lineRule="auto" w:before="0" w:after="0"/></w:pPr><w:r><w:t></w:t></w:r></w:p>
      </w:tc>
      <w:tc>
        <w:tcPr><w:tcW w:w="2460" w:type="dxa"/><w:vAlign w:val="center"/></w:tcPr>
        <w:p><w:pPr><w:spacing w:line="240" w:lineRule="auto" w:before="0" w:after="0"/><w:jc w:val="right"/><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:b/><w:sz w:val="24"/></w:rPr></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:b/><w:sz w:val="24"/></w:rPr><w:t>{total_amount}</w:t></w:r></w:p>
      </w:tc>
    </w:tr>
  </w:tbl>`;

// Đoạn "(Giá trị hợp đồng bằng chữ: ...)" ngay sau bảng
afterTable = afterTable.replace(
  /(<w:p>[\s\S]*?<w:t>\(Giá trị hợp đồng bằng chữ: \{total_words\}\)\.<\/w:t>[\s\S]*?<w:pPr>)[\s\S]*?(<\/w:pPr>)/,
  '$1<w:spacing w:before="30" w:after="30" w:line="360" w:lineRule="auto"/><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:i/><w:sz w:val="24"/></w:rPr>$2'
);

const fullXml = newBeforeTable + tableXml + afterTable;

// Ghi lại template
zip.file('word/document.xml', fullXml);
const buf = zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' });
fs.writeFileSync(templatePath, buf);
console.log('✅ Đã cập nhật template thành công!');
