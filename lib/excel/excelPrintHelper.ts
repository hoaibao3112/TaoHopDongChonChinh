import PizZip from 'pizzip';
import XLSX from 'xlsx-js-style';

export interface SheetPrintConfig {
  /**
   * Khổ in: 'landscape' (khổ ngang - thích hợp cho bảng nhiều cột) hoặc 'portrait' (khổ dọc)
   * Mặc định: 'landscape' nếu bảng có > 8 cột, 'portrait' nếu <= 8 cột.
   */
  orientation?: 'landscape' | 'portrait';
  /**
   * Số trang ngang tối đa: Mặc định là 1 để tất cả các cột vừa khít 1 trang ngang, không bị lấn trang.
   */
  fitToWidth?: number;
  /**
   * Số trang dọc tối đa: 0 hoặc undefined để số hàng tự động chảy xuống các trang tiếp theo.
   */
  fitToHeight?: number;
  /**
   * Khổ giấy: 9 = A4 (tiêu chuẩn Việt Nam)
   */
  paperSize?: number;
  /**
   * Tự động căn giữa nội dung theo chiều ngang khi in
   */
  horizontalCentered?: boolean;
}

const DEFAULT_MARGINS: XLSX.MarginInfo = {
  left: 0.35,
  right: 0.35,
  top: 0.45,
  bottom: 0.45,
  header: 0.2,
  footer: 0.2,
};

/**
 * Xử lý hoàn thiện Workbook Excel:
 * 1. Thiết lập lề in chuẩn (margins) cho từng sheet.
 * 2. Xuất buffer ban đầu bằng xlsx-js-style.
 * 3. Hậu xử lý OpenXML qua PizZip:
 *    - Thêm <calcPr fullCalcOnLoad="1"/> vào workbook.xml để Excel tự động tính toán lại công thức sạch sẽ ngay khi mở.
 *    - Thêm <sheetPr><pageSetUpPr fitToPage="1"/></sheetPr> vào từng sheet.
 *    - Thêm <printOptions horizontalCentered="1"/> để căn giữa trang.
 *    - Thêm <pageSetup paperSize="9" orientation="..." fitToWidth="1" fitToHeight="0"/> để chống 100% việc lấn trang in.
 */
export function finalizeWorkbookWithPrintSetup(
  wb: XLSX.WorkBook,
  sheetConfigs?: Record<string | number, SheetPrintConfig>
): Buffer {
  const sheetNames = wb.SheetNames;

  // 1. Áp dụng lề in mặc định cho tất cả các sheet nếu chưa có
  sheetNames.forEach((name) => {
    const ws = wb.Sheets[name];
    if (ws && !ws['!margins']) {
      ws['!margins'] = { ...DEFAULT_MARGINS };
    }
  });

  // 2. Xuất buffer bằng xlsx-js-style
  const rawBuffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

  // 3. Xử lý OpenXML zip archive bằng PizZip
  const zip = new PizZip(rawBuffer);

  // 3.1. Kích hoạt tính toán công thức khi mở file (xl/workbook.xml)
  const wbXmlPath = 'xl/workbook.xml';
  const wbFile = zip.file(wbXmlPath);
  if (wbFile) {
    let wbXml = wbFile.asText();
    if (!wbXml.includes('<calcPr')) {
      wbXml = wbXml.replace('</workbook>', '<calcPr fullCalcOnLoad="1"/></workbook>');
      zip.file(wbXmlPath, wbXml);
    }
  }

  // 3.2. Cấu hình in ấn và fitToPage cho từng sheet
  sheetNames.forEach((sheetName, index) => {
    const sheetFileIdx = index + 1;
    const sheetPath = `xl/worksheets/sheet${sheetFileIdx}.xml`;
    const sheetFile = zip.file(sheetPath);
    if (!sheetFile) return;

    let xml = sheetFile.asText();

    // Xác định cấu hình in cho sheet này (theo tên sheet hoặc theo chỉ số index)
    const customConfig =
      (sheetConfigs && (sheetConfigs[sheetName] || sheetConfigs[index])) || {};

    const ws = wb.Sheets[sheetName];
    const colsCount = Array.isArray(ws?.['!cols']) ? ws['!cols'].length : 10;
    const defaultOrientation: 'landscape' | 'portrait' = colsCount > 8 ? 'landscape' : 'portrait';

    const orientation = customConfig.orientation || defaultOrientation;
    const fitToWidth = customConfig.fitToWidth ?? 1;
    const fitToHeight = customConfig.fitToHeight ?? 0;
    const paperSize = customConfig.paperSize ?? 9; // A4
    const horizontalCentered = customConfig.horizontalCentered ?? true;

    // A. Chèn <sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>
    if (!xml.includes('<sheetPr')) {
      if (xml.includes('<dimension')) {
        xml = xml.replace('<dimension', '<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr><dimension');
      } else if (xml.includes('<sheetViews')) {
        xml = xml.replace('<sheetViews', '<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr><sheetViews');
      } else {
        xml = xml.replace(/(<worksheet[^>]*>)/, '$1<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>');
      }
    } else if (!xml.includes('fitToPage')) {
      xml = xml.replace(/<sheetPr([^>]*)>/, '<sheetPr$1><pageSetUpPr fitToPage="1"/>');
    }

    // B. Chèn <printOptions horizontalCentered="1"/>
    if (horizontalCentered && !xml.includes('<printOptions')) {
      if (xml.includes('<pageMargins')) {
        xml = xml.replace('<pageMargins', '<printOptions horizontalCentered="1"/><pageMargins');
      }
    }

    // C. Chèn <pageSetup paperSize="9" orientation="..." fitToWidth="1" fitToHeight="0"/>
    const pageSetupTag = `<pageSetup paperSize="${paperSize}" orientation="${orientation}" fitToWidth="${fitToWidth}" fitToHeight="${fitToHeight}"/>`;
    if (!xml.includes('<pageSetup')) {
      if (xml.includes('<pageMargins')) {
        xml = xml.replace(/(<pageMargins[^>]*\/>)/, `$1${pageSetupTag}`);
      } else {
        xml = xml.replace('</worksheet>', `${pageSetupTag}</worksheet>`);
      }
    } else {
      // Nếu đã có tag pageSetup nhưng chưa đủ thuộc tính
      xml = xml.replace(
        /<pageSetup[^>]*\/>/,
        pageSetupTag
      );
    }

    zip.file(sheetPath, xml);
  });

  return zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' }) as Buffer;
}
