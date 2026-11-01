import fs from 'fs';
import path from 'path';
import PizZip from 'pizzip';

const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:wpc="http://schemas.microsoft.com/office/word/2010/wordprocessingCanvas"
  xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006"
  xmlns:o="urn:schemas-microsoft-com:office:office"
  xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
  xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math"
  xmlns:v="urn:schemas-microsoft-com:vml"
  xmlns:wp14="http://schemas.microsoft.com/office/word/2010/wordprocessingDrawing"
  xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"
  xmlns:w10="urn:schemas-microsoft-com:office:word"
  xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
  xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml"
  xmlns:wpg="http://schemas.microsoft.com/office/word/2010/wordprocessingGroup"
  xmlns:wpi="http://schemas.microsoft.com/office/word/2010/wordprocessingInk"
  xmlns:wne="http://schemas.microsoft.com/office/word/2006/wordml"
  xmlns:wps="http://schemas.microsoft.com/office/word/2010/wordprocessingShape"
  mc:Ignorable="w14 wp14">
<w:body>

  <!-- Quốc hiệu & Tiêu ngữ -->
  <w:p>
    <w:pPr><w:jc w:val="center"/><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:b/><w:sz w:val="26"/><w:szCs w:val="26"/></w:rPr></w:pPr>
    <w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:b/><w:sz w:val="26"/><w:szCs w:val="26"/></w:rPr><w:t>CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM</w:t></w:r>
  </w:p>
  <w:p>
    <w:pPr><w:jc w:val="center"/><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:b/><w:sz w:val="26"/><w:szCs w:val="26"/></w:rPr></w:pPr>
    <w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:b/><w:sz w:val="26"/><w:szCs w:val="26"/></w:rPr><w:t>Độc lập – Tự do – Hạnh phúc</w:t></w:r>
  </w:p>
  <w:p>
    <w:pPr><w:jc w:val="center"/><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:sz w:val="26"/></w:rPr></w:pPr>
    <w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:sz w:val="26"/></w:rPr><w:t>------------------------</w:t></w:r>
  </w:p>

  <!-- Tiêu đề Hợp đồng -->
  <w:p>
    <w:pPr><w:spacing w:before="120" w:after="60"/><w:jc w:val="center"/><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:b/><w:sz w:val="32"/><w:szCs w:val="32"/></w:rPr></w:pPr>
    <w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:b/><w:sz w:val="32"/><w:szCs w:val="32"/></w:rPr><w:t>HỢP ĐỒNG MUA BÁN HÀNG HÓA</w:t></w:r>
  </w:p>
  <w:p>
    <w:pPr><w:jc w:val="center"/><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:b/><w:bCs/><w:sz w:val="26"/></w:rPr></w:pPr>
    <w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:b/><w:bCs/><w:sz w:val="26"/></w:rPr><w:t>Số: {contract_no}</w:t></w:r>
  </w:p>

  <!-- Căn cứ -->
  <w:p>
    <w:pPr><w:spacing w:before="100"/><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:i/><w:sz w:val="24"/></w:rPr></w:pPr>
    <w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:i/><w:sz w:val="24"/></w:rPr><w:t>- Căn cứ Bộ luật dân sự số: 91/2015/QH 13 ngày 24/11/2015;</w:t></w:r>
  </w:p>
  <w:p>
    <w:pPr><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:i/><w:sz w:val="24"/></w:rPr></w:pPr>
    <w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:i/><w:sz w:val="24"/></w:rPr><w:t>- Căn cứ luật thương mại số: 36/2005QH11 ngày 14/06/2005;</w:t></w:r>
  </w:p>
  <w:p>
    <w:pPr><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:i/><w:sz w:val="24"/></w:rPr></w:pPr>
    <w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:i/><w:sz w:val="24"/></w:rPr><w:t>- Căn cứ vào nhu cầu và khả năng của 2 bên:</w:t></w:r>
  </w:p>

  <!-- Khởi đầu -->
  <w:p>
    <w:pPr><w:spacing w:before="120" w:after="80"/><w:ind w:firstLine="480"/><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:sz w:val="26"/></w:rPr></w:pPr>
    <w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:sz w:val="26"/></w:rPr><w:t>Hôm nay, ngày {sign_day} tháng {sign_month} năm {sign_year} tại {a_name} chúng tôi gồm:</w:t></w:r>
  </w:p>

  <!-- BÊN A -->
  <w:p>
    <w:pPr><w:spacing w:before="60"/><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:b/><w:sz w:val="26"/></w:rPr></w:pPr>
    <w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:b/><w:sz w:val="26"/></w:rPr><w:t>BÊN A:  {a_name}</w:t></w:r>
  </w:p>
  <w:p>
    <w:pPr><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:sz w:val="26"/></w:rPr></w:pPr>
    <w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:sz w:val="26"/></w:rPr><w:t>Địa chỉ: {a_address}</w:t></w:r>
  </w:p>
  <w:p>
    <w:pPr><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:sz w:val="26"/></w:rPr></w:pPr>
    <w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:sz w:val="26"/></w:rPr><w:t>Điện thoại: {a_phone}</w:t></w:r>
  </w:p>
  <w:p>
    <w:pPr><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:sz w:val="26"/></w:rPr></w:pPr>
    <w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:sz w:val="26"/></w:rPr><w:t>Mã số thuế: {a_mst}</w:t></w:r>
  </w:p>
  <w:p>
    <w:pPr><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:sz w:val="26"/></w:rPr></w:pPr>
    <w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:sz w:val="26"/></w:rPr><w:t>Người đại diện: {a_representative}                     Chức vụ: {a_title}</w:t></w:r>
  </w:p>
  <w:p>
    <w:pPr><w:ind w:left="480"/><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:i/><w:sz w:val="24"/></w:rPr></w:pPr>
    <w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:i/><w:sz w:val="24"/></w:rPr><w:t>{a_authorization}</w:t></w:r>
  </w:p>
  <w:p>
    <w:pPr><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:sz w:val="26"/></w:rPr></w:pPr>
    <w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:sz w:val="26"/></w:rPr><w:t>Tài khoản: {a_bank_account}</w:t></w:r>
  </w:p>
  <w:p>
    <w:pPr><w:spacing w:after="120"/><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:sz w:val="26"/></w:rPr></w:pPr>
    <w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:sz w:val="26"/></w:rPr><w:t>Ngân hàng: {a_bank_name}</w:t></w:r>
  </w:p>

  <!-- BÊN B -->
  <w:p>
    <w:pPr><w:spacing w:before="60"/><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:b/><w:sz w:val="26"/></w:rPr></w:pPr>
    <w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:b/><w:sz w:val="26"/></w:rPr><w:t>BÊN B:  {b_name}</w:t></w:r>
  </w:p>
  <w:p>
    <w:pPr><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:sz w:val="26"/></w:rPr></w:pPr>
    <w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:sz w:val="26"/></w:rPr><w:t>Địa chỉ: {b_address}</w:t></w:r>
  </w:p>
  <w:p>
    <w:pPr><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:sz w:val="26"/></w:rPr></w:pPr>
    <w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:sz w:val="26"/></w:rPr><w:t>Điện thoại: {b_phone}</w:t></w:r>
  </w:p>
  <w:p>
    <w:pPr><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:sz w:val="26"/></w:rPr></w:pPr>
    <w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:sz w:val="26"/></w:rPr><w:t>Mã số thuế: {b_mst}</w:t></w:r>
  </w:p>
  <w:p>
    <w:pPr><w:spacing w:after="80"/><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:sz w:val="26"/></w:rPr></w:pPr>
    <w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:sz w:val="26"/></w:rPr><w:t>Người đại diện: {b_representative}                     Chức vụ: {b_title}</w:t></w:r>
  </w:p>
  <w:p>
    <w:pPr><w:spacing w:after="120"/><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:sz w:val="26"/></w:rPr></w:pPr>
    <w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:sz w:val="26"/></w:rPr><w:t>Sau khi trao đổi, hai bên thống nhất các điều khoản sau:</w:t></w:r>
  </w:p>

  <!-- ĐIỀU 1 -->
  <w:p>
    <w:pPr><w:spacing w:before="80" w:after="80"/><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:b/><w:sz w:val="26"/></w:rPr></w:pPr>
    <w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:b/><w:sz w:val="26"/></w:rPr><w:t>Điều 1: Tên hàng – Số lượng – Đơn giá:</w:t></w:r>
  </w:p>

  <!-- BẢNG HÀNG HÓA -->
  <w:tbl>
    <w:tblPr>
      <w:tblStyle w:val="TableGrid"/>
      <w:tblW w:w="9360" w:type="dxa"/>
      <w:tblBorders>
        <w:top w:val="single" w:sz="6" w:space="0" w:color="000000"/>
        <w:left w:val="single" w:sz="6" w:space="0" w:color="000000"/>
        <w:bottom w:val="single" w:sz="6" w:space="0" w:color="000000"/>
        <w:right w:val="single" w:sz="6" w:space="0" w:color="000000"/>
        <w:insideH w:val="single" w:sz="4" w:space="0" w:color="000000"/>
        <w:insideV w:val="single" w:sz="4" w:space="0" w:color="000000"/>
      </w:tblBorders>
      <w:tblCellMar>
        <w:top w:w="100" w:type="dxa"/>
        <w:left w:w="120" w:type="dxa"/>
        <w:bottom w:w="100" w:type="dxa"/>
        <w:right w:w="120" w:type="dxa"/>
      </w:tblCellMar>
    </w:tblPr>
    <!-- Header row -->
    <w:tr>
      <w:tc><w:tcPr><w:tcW w:w="700" w:type="dxa"/></w:tcPr><w:p><w:pPr><w:jc w:val="center"/><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:b/><w:sz w:val="24"/></w:rPr></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:b/><w:sz w:val="24"/></w:rPr><w:t>Số TT</w:t></w:r></w:p></w:tc>
      <w:tc><w:tcPr><w:tcW w:w="2800" w:type="dxa"/></w:tcPr><w:p><w:pPr><w:jc w:val="center"/><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:b/><w:sz w:val="24"/></w:rPr></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:b/><w:sz w:val="24"/></w:rPr><w:t>Tên hàng</w:t></w:r></w:p></w:tc>
      <w:tc><w:tcPr><w:tcW w:w="1600" w:type="dxa"/></w:tcPr><w:p><w:pPr><w:jc w:val="center"/><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:b/><w:sz w:val="24"/></w:rPr></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:b/><w:sz w:val="24"/></w:rPr><w:t>Số lượng (kg)</w:t></w:r></w:p></w:tc>
      <w:tc><w:tcPr><w:tcW w:w="1900" w:type="dxa"/></w:tcPr><w:p><w:pPr><w:jc w:val="center"/><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:b/><w:sz w:val="24"/></w:rPr></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:b/><w:sz w:val="24"/></w:rPr><w:t>Đơn giá (đồng/kg)</w:t></w:r></w:p></w:tc>
      <w:tc><w:tcPr><w:tcW w:w="2360" w:type="dxa"/></w:tcPr><w:p><w:pPr><w:jc w:val="center"/><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:b/><w:sz w:val="24"/></w:rPr></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:b/><w:sz w:val="24"/></w:rPr><w:t>Thành tiền (đồng)</w:t></w:r></w:p></w:tc>
    </w:tr>
    <!-- Repeating items row -->
    <w:tr>
      <w:tc><w:tcPr><w:tcW w:w="700" w:type="dxa"/></w:tcPr><w:p><w:pPr><w:jc w:val="center"/><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:sz w:val="24"/></w:rPr></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:sz w:val="24"/></w:rPr><w:t>{#items}{stt}</w:t></w:r></w:p></w:tc>
      <w:tc><w:tcPr><w:tcW w:w="2800" w:type="dxa"/></w:tcPr><w:p><w:pPr><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:sz w:val="24"/></w:rPr></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:sz w:val="24"/></w:rPr><w:t>{name}</w:t></w:r></w:p></w:tc>
      <w:tc><w:tcPr><w:tcW w:w="1600" w:type="dxa"/></w:tcPr><w:p><w:pPr><w:jc w:val="right"/><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:sz w:val="24"/></w:rPr></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:sz w:val="24"/></w:rPr><w:t>{quantity}</w:t></w:r></w:p></w:tc>
      <w:tc><w:tcPr><w:tcW w:w="1900" w:type="dxa"/></w:tcPr><w:p><w:pPr><w:jc w:val="right"/><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:sz w:val="24"/></w:rPr></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:sz w:val="24"/></w:rPr><w:t>{unit_price}</w:t></w:r></w:p></w:tc>
      <w:tc><w:tcPr><w:tcW w:w="2360" w:type="dxa"/></w:tcPr><w:p><w:pPr><w:jc w:val="right"/><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:sz w:val="24"/></w:rPr></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:sz w:val="24"/></w:rPr><w:t>{total}{/items}</w:t></w:r></w:p></w:tc>
    </w:tr>
    <!-- Total Row -->
    <w:tr>
      <w:tc><w:tcPr><w:tcW w:w="700" w:type="dxa"/></w:tcPr><w:p><w:r><w:t></w:t></w:r></w:p></w:tc>
      <w:tc><w:tcPr><w:tcW w:w="2800" w:type="dxa"/></w:tcPr><w:p><w:r><w:t></w:t></w:r></w:p></w:tc>
      <w:tc><w:tcPr><w:tcW w:w="1600" w:type="dxa"/></w:tcPr><w:p><w:r><w:t></w:t></w:r></w:p></w:tc>
      <w:tc><w:tcPr><w:tcW w:w="1900" w:type="dxa"/></w:tcPr><w:p><w:pPr><w:jc w:val="center"/><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:b/><w:sz w:val="24"/></w:rPr></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:b/><w:sz w:val="24"/></w:rPr><w:t>TỔNG</w:t></w:r></w:p></w:tc>
      <w:tc><w:tcPr><w:tcW w:w="2360" w:type="dxa"/></w:tcPr><w:p><w:pPr><w:jc w:val="right"/><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:b/><w:sz w:val="24"/></w:rPr></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:b/><w:sz w:val="24"/></w:rPr><w:t>{total_amount}</w:t></w:r></w:p></w:tc>
    </w:tr>
  </w:tbl>

  <w:p>
    <w:pPr><w:spacing w:before="120" w:after="120"/><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:i/><w:sz w:val="24"/></w:rPr></w:pPr>
    <w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:i/><w:sz w:val="24"/></w:rPr><w:t>(Giá trị hợp đồng bằng chữ: {total_words}).</w:t></w:r>
  </w:p>

  <!-- ĐIỀU 2 -->
  <w:p>
    <w:pPr><w:spacing w:before="60"/><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:b/><w:sz w:val="26"/></w:rPr></w:pPr>
    <w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:b/><w:sz w:val="26"/></w:rPr><w:t>Điều 2: Chất lượng hàng hoá:</w:t></w:r>
  </w:p>
  <w:p>
    <w:pPr><w:spacing w:after="80"/><w:ind w:left="480"/><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:sz w:val="26"/></w:rPr></w:pPr>
    <w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:sz w:val="26"/></w:rPr><w:t>Theo hình ảnh hàng hóa và thông tin đã thống nhất giữa hai bên.</w:t></w:r>
  </w:p>

  <!-- ĐIỀU 3 -->
  <w:p>
    <w:pPr><w:spacing w:before="60"/><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:b/><w:sz w:val="26"/></w:rPr></w:pPr>
    <w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:b/><w:sz w:val="26"/></w:rPr><w:t>Điều 3: Thời gian – Địa điểm giao hàng:</w:t></w:r>
  </w:p>
  <w:p>
    <w:pPr><w:ind w:left="480"/><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:sz w:val="26"/></w:rPr></w:pPr>
    <w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:sz w:val="26"/></w:rPr><w:t>1. Thời gian giao hàng: Bắt đầu từ ngày {delivery_start_date} đến ngày {delivery_end_date}.</w:t></w:r>
  </w:p>
  <w:p>
    <w:pPr><w:spacing w:after="80"/><w:ind w:left="480"/><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:sz w:val="26"/></w:rPr></w:pPr>
    <w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:sz w:val="26"/></w:rPr><w:t>2. Địa điểm giao hàng: {delivery_location}</w:t></w:r>
  </w:p>

  <!-- ĐIỀU 4 -->
  <w:p>
    <w:pPr><w:spacing w:before="60"/><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:b/><w:sz w:val="26"/></w:rPr></w:pPr>
    <w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:b/><w:sz w:val="26"/></w:rPr><w:t>Điều 4: Phương thức thanh toán:</w:t></w:r>
  </w:p>
  <w:p>
    <w:pPr><w:spacing w:after="80"/><w:ind w:left="480"/><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:sz w:val="26"/></w:rPr></w:pPr>
    <w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:sz w:val="26"/></w:rPr><w:t>Phương thức thanh toán: {payment_method}</w:t></w:r>
  </w:p>

  <!-- ĐIỀU 5 -->
  <w:p>
    <w:pPr><w:spacing w:before="60"/><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:b/><w:sz w:val="26"/></w:rPr></w:pPr>
    <w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:b/><w:sz w:val="26"/></w:rPr><w:t>Điều 5: Trách nhiệm Bên mua:</w:t></w:r>
  </w:p>
  <w:p>
    <w:pPr><w:ind w:left="480"/><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:sz w:val="26"/></w:rPr></w:pPr>
    <w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:sz w:val="26"/></w:rPr><w:t>Thanh toán cho Bên A theo đúng điều 4 của hợp đồng này.</w:t></w:r>
  </w:p>
  <w:p>
    <w:pPr><w:spacing w:after="80"/><w:ind w:left="480"/><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:sz w:val="26"/></w:rPr></w:pPr>
    <w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:sz w:val="26"/></w:rPr><w:t>Thông báo cho Bên A ngày và số lượng nhận hàng theo từng đợt.</w:t></w:r>
  </w:p>

  <!-- ĐIỀU 6 -->
  <w:p>
    <w:pPr><w:spacing w:before="60"/><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:b/><w:sz w:val="26"/></w:rPr></w:pPr>
    <w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:b/><w:sz w:val="26"/></w:rPr><w:t>Điều 6: Trách nhiệm Bên bán:</w:t></w:r>
  </w:p>
  <w:p>
    <w:pPr><w:spacing w:after="80"/><w:ind w:left="480"/><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:sz w:val="26"/></w:rPr></w:pPr>
    <w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:sz w:val="26"/></w:rPr><w:t>Giao hàng đúng số lượng, chất lượng theo điều 1 và điều 2 của hợp đồng.</w:t></w:r>
  </w:p>

  <!-- ĐIỀU 7 -->
  <w:p>
    <w:pPr><w:spacing w:before="60"/><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:b/><w:sz w:val="26"/></w:rPr></w:pPr>
    <w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:b/><w:sz w:val="26"/></w:rPr><w:t>Điều 7: Cam kết chung:</w:t></w:r>
  </w:p>
  <w:p>
    <w:pPr><w:ind w:left="480"/><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:sz w:val="26"/></w:rPr></w:pPr>
    <w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:sz w:val="26"/></w:rPr><w:t>Trường hợp đến thời điểm giao hàng nếu giá thị trường chênh lệch tăng hoặc giảm so với đơn giá đã thống nhất tại điều 1 của hợp đồng này. Thì đơn giá thực tế tại thời điểm giao hàng sẽ tăng hoặc giảm theo nguyên tắc chia đôi (±50/50) chia đôi phần giá chênh lệch giữa đơn giá hợp đồng và giá thị trường.</w:t></w:r>
  </w:p>
  <w:p>
    <w:pPr><w:ind w:left="480"/><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:sz w:val="26"/></w:rPr></w:pPr>
    <w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:sz w:val="26"/></w:rPr><w:t>Hai bên cam kết thực hiện đầy đủ các điều khoản đã ghi trong hợp đồng này, nếu có gì khó khăn vướng mắc, hai bên sẽ gặp nhau giải quyết và ký phụ lục bổ sung hợp đồng.</w:t></w:r>
  </w:p>
  <w:p>
    <w:pPr><w:ind w:left="480"/><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:sz w:val="26"/></w:rPr></w:pPr>
    <w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:sz w:val="26"/></w:rPr><w:t>Bên mua thanh toán trong vòng 03 ngày, nếu bên mua hoặc bên bán huỷ ngang không làm theo thoả thuận hợp đồng đã ký, thì sẽ bồi thường theo thoả thuận của hai bên đi đến thống nhất.</w:t></w:r>
  </w:p>
  <w:p>
    <w:pPr><w:ind w:left="480"/><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:sz w:val="26"/></w:rPr></w:pPr>
    <w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:sz w:val="26"/></w:rPr><w:t>Trường hợp không thương lượng được, hai bên phải chấp hành theo quyết định của Tòa án Kinh tế tỉnh Đồng Tháp.</w:t></w:r>
  </w:p>
  <w:p>
    <w:pPr><w:ind w:left="480"/><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:sz w:val="26"/></w:rPr></w:pPr>
    <w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:sz w:val="26"/></w:rPr><w:t>Hợp đồng có hiệu lực kể từ ngày ký. Hợp đồng này vẫn có giá trị sau khi hai bên ký kết qua fax hoặc email.</w:t></w:r>
  </w:p>
  <w:p>
    <w:pPr><w:ind w:left="480"/><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:sz w:val="26"/></w:rPr></w:pPr>
    <w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:sz w:val="26"/></w:rPr><w:t>Hợp đồng này sẽ tự động thanh lý và hết hiệu lực sau khi hai bên hoàn thành mọi nghĩa vụ và trách nhiệm của mình đã được quy định như trong hợp đồng này.</w:t></w:r>
  </w:p>
  <w:p>
    <w:pPr><w:spacing w:after="160"/><w:ind w:left="480"/><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:sz w:val="26"/></w:rPr></w:pPr>
    <w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:sz w:val="26"/></w:rPr><w:t>Hợp đồng này lập thành 2 bản, mỗi bên giữ 1 bản có giá trị như nhau làm căn cứ thực hiện.</w:t></w:r>
  </w:p>

  <!-- CHỮ KÝ -->
  <w:tbl>
    <w:tblPr>
      <w:tblW w:w="9360" w:type="dxa"/>
      <w:tblBorders>
        <w:top w:val="none"/>
        <w:left w:val="none"/>
        <w:bottom w:val="none"/>
        <w:right w:val="none"/>
        <w:insideH w:val="none"/>
        <w:insideV w:val="none"/>
      </w:tblBorders>
    </w:tblPr>
    <w:tr>
      <w:tc>
        <w:tcPr><w:tcW w:w="4680" w:type="dxa"/></w:tcPr>
        <w:p><w:pPr><w:jc w:val="center"/><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:b/><w:sz w:val="26"/></w:rPr></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:b/><w:sz w:val="26"/></w:rPr><w:t>ĐẠI DIỆN BÊN A</w:t></w:r></w:p>
        <w:p><w:pPr><w:jc w:val="center"/><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:i/><w:sz w:val="24"/></w:rPr></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:i/><w:sz w:val="24"/></w:rPr><w:t>(Ký, ghi rõ họ tên)</w:t></w:r></w:p>
        <w:p><w:pPr><w:spacing w:before="900"/><w:jc w:val="center"/><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:b/><w:sz w:val="26"/></w:rPr></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:b/><w:sz w:val="26"/></w:rPr><w:t>{a_signer_name}</w:t></w:r></w:p>
      </w:tc>
      <w:tc>
        <w:tcPr><w:tcW w:w="4680" w:type="dxa"/></w:tcPr>
        <w:p><w:pPr><w:jc w:val="center"/><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:b/><w:sz w:val="26"/></w:rPr></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:b/><w:sz w:val="26"/></w:rPr><w:t>ĐẠI DIỆN BÊN B</w:t></w:r></w:p>
        <w:p><w:pPr><w:jc w:val="center"/><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:i/><w:sz w:val="24"/></w:rPr></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:i/><w:sz w:val="24"/></w:rPr><w:t>(Ký, ghi rõ họ tên)</w:t></w:r></w:p>
        <w:p><w:pPr><w:spacing w:before="900"/><w:jc w:val="center"/><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:b/><w:sz w:val="26"/></w:rPr></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:b/><w:sz w:val="26"/></w:rPr><w:t>{b_signer_name}</w:t></w:r></w:p>
      </w:tc>
    </w:tr>
  </w:tbl>

  <w:sectPr>
    <w:pgSz w:w="11906" w:h="16838"/>
    <w:pgMar w:top="1440" w:right="1134" w:bottom="1440" w:left="1701" w:header="720" w:footer="720" w:gutter="0"/>
  </w:sectPr>
</w:body>
</w:document>`;

const zip = new PizZip();

zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/>
</Types>`);

zip.file('_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`);

zip.file('word/document.xml', documentXml);

zip.file('word/_rels/document.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings" Target="settings.xml"/>
</Relationships>`);

zip.file('word/settings.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:settings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:defaultTabStop w:val="708"/>
</w:settings>`);

const outDir = path.resolve('templates');
if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

const outPath = path.join(outDir, 'hop-dong-mua-ban.docx');
const buffer = zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' });
fs.writeFileSync(outPath, buffer);

console.log('✅ Đã cập nhật template tại:', outPath);
