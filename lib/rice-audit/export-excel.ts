import * as XLSX from 'xlsx';
import { RiceAuditIssue, RiceAuditResult } from './types';

const CATEGORY_LABEL: Record<RiceAuditIssue['category'], string> = {
  lot_code: 'Mã Lô',
  customer: 'Khách Hàng',
  price: 'Giá Tiền',
  formula_payment: 'Công Thức & Thanh Toán',
  contract: 'Đối Chiếu Hợp Đồng',
};

const SEVERITY_LABEL: Record<RiceAuditIssue['severity'], string> = {
  error: 'Nghiêm trọng',
  warning: 'Cảnh báo',
  info: 'Lưu ý',
};

export function buildAuditReportWorkbookBuffer(
  result: RiceAuditResult,
  filteredIssues?: RiceAuditIssue[],
  monthLabel?: string
): Uint8Array {
  const wb = XLSX.utils.book_new();
  const issues = filteredIssues ?? result.issues;

  // Sheet 1: Tổng quan
  const summaryRows = [
    ['BÁO CÁO KIỂM TRA LỖI NHẬP LIỆU LÚA TƯƠI & LÚA KHÔ'],
    ['Phạm vi kiểm tra', monthLabel || 'Tất cả các tháng'],
    ['Thời điểm kiểm tra', new Date(result.summary.analyzedAt).toLocaleString('vi-VN')],
    ['Ngưỡng cảnh báo lệch giá', `±${result.summary.priceDeviationPct}% so với trung vị cùng loại lúa (±14 ngày)`],
    [],
    ['CHỈ SỐ', 'SỐ LƯỢNG'],
    ['Tổng dòng dữ liệu Lúa Tươi', result.summary.totalFreshRows],
    ['Tổng dòng dữ liệu Lúa Khô', result.summary.totalDryRows],
    ['Tổng dòng Hợp Đồng (nếu có)', result.summary.totalContractRows],
    ['Tổng số lỗi / cảnh báo phát hiện', issues.length],
    ['Mức Nghiêm trọng', issues.filter((i) => i.severity === 'error').length],
    ['Mức Cảnh báo', issues.filter((i) => i.severity === 'warning').length],
    ['Mức Lưu ý', issues.filter((i) => i.severity === 'info').length],
    [],
    ['PHÂN LOẠI THEO NHÓM', 'SỐ LƯỢNG'],
    ['Lỗi Mã Lô', issues.filter((i) => i.category === 'lot_code').length],
    ['Lỗi Khách Hàng / NCC', issues.filter((i) => i.category === 'customer').length],
    ['Lỗi Giá Tiền', issues.filter((i) => i.category === 'price').length],
    ['Lỗi Công Thức & Thanh Toán', issues.filter((i) => i.category === 'formula_payment').length],
    ['Lỗi Đối Chiếu Hợp Đồng', issues.filter((i) => i.category === 'contract').length],
  ];
  const wsSummary = XLSX.utils.aoa_to_sheet(summaryRows);
  wsSummary['!cols'] = [{ wch: 42 }, { wch: 40 }];
  XLSX.utils.book_append_sheet(wb, wsSummary, 'TongQuan');

  // Sheet 2: Chi tiết lỗi
  const detailHeader = [
    'STT',
    'File',
    'Sheet',
    'Dòng Excel',
    'Mức Độ',
    'Nhóm Lỗi',
    'Tiêu Đề Lỗi',
    'Ngày Cân',
    'Nhân Viên',
    'Khách Hàng / NCC',
    'Loại Lúa',
    'Mã Lô',
    'Số Lượng (kg)',
    'Giá Hiện Tại',
    'Giá Tham Chiếu',
    'Chi Tiết Vấn Đề',
    'Gợi Ý Sửa',
  ];
  const detailRows = issues.map((iss, idx) => [
    idx + 1,
    iss.sourceLabel,
    iss.sheetName,
    iss.rowNumber,
    SEVERITY_LABEL[iss.severity],
    CATEGORY_LABEL[iss.category],
    iss.title,
    iss.dateStr,
    iss.buyer,
    iss.customer,
    iss.riceType,
    iss.lotCode,
    iss.quantityKg ?? '',
    iss.price ?? '',
    iss.expectedPrice ?? '',
    iss.detail,
    iss.suggestion,
  ]);
  const wsDetail = XLSX.utils.aoa_to_sheet([detailHeader, ...detailRows]);
  wsDetail['!cols'] = [
    { wch: 6 },
    { wch: 11 },
    { wch: 14 },
    { wch: 10 },
    { wch: 14 },
    { wch: 20 },
    { wch: 26 },
    { wch: 12 },
    { wch: 14 },
    { wch: 24 },
    { wch: 14 },
    { wch: 18 },
    { wch: 14 },
    { wch: 13 },
    { wch: 14 },
    { wch: 48 },
    { wch: 48 },
  ];
  XLSX.utils.book_append_sheet(wb, wsDetail, 'ChiTietLoi');

  // Sheet 3: Bảng đối chiếu Khách hàng & Tiền tố Mã lô
  const mapHeader = [
    'Khách Hàng Chuẩn',
    'Tổng Số Dòng',
    'Tiền Tố Chính',
    'Các Tiền Tố Đang Dùng',
    'Các Biến Thể Tên Đang Gõ',
  ];
  const mapRows = result.customerMappings.map((m) => [
    m.customerNormalized,
    m.rowCount,
    m.dominantPrefix,
    m.prefixes.map((p) => `${p.prefix} (${p.count})`).join(', '),
    m.variants.map((v) => `"${v}"`).join(' | '),
  ]);
  const wsMap = XLSX.utils.aoa_to_sheet([mapHeader, ...mapRows]);
  wsMap['!cols'] = [{ wch: 28 }, { wch: 14 }, { wch: 14 }, { wch: 28 }, { wch: 45 }];
  XLSX.utils.book_append_sheet(wb, wsMap, 'DoiChieuKhachHang');

  const out = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
  return new Uint8Array(out);
}
