export interface HuskMonthlyRecord {
  id: string;
  date: string;              // DD/MM/YYYY hoặc YYYY-MM-DD
  monthKey: string;          // MM/YYYY (vd: "10/2026")
  team: 'ĐỨC' | 'QUÝ';       // Đội phụ trách ('ĐỨC' hoặc 'QUÝ')
  customer: string;          // Khách hàng / Tên ghe
  vehicle: string;           // Biển số xe / Tên ghe
  type: 'XE' | 'GHE';        // Loại phương tiện
  weightKg: number;          // Trọng lượng Kg
  tons: number;              // Số tấn (làm tròn)
  unitPrice: number;         // Đơn giá (mặc định 11.000đ/tấn)
  amount: number;            // Thành tiền
  note?: string;             // Ghi chú
  description?: string;      // Câu mô tả công việc
  sourceTab?: 'NHAP_MOI' | 'QUET_AI';
  updatedAt?: string;
}

/**
 * Trích xuất chuẩn "MM/YYYY" từ chuỗi ngày (hỗ trợ cả YYYY-MM-DD và DD/MM/YYYY)
 */
export function extractMonthKey(dateStr?: string | null): string {
  if (!dateStr) return '';
  const trimmed = dateStr.trim();

  // YYYY-MM-DD
  const isoMatch = trimmed.match(/^(\d{4})-(\d{1,2})/);
  if (isoMatch) {
    const y = isoMatch[1];
    const m = String(parseInt(isoMatch[2], 10)).padStart(2, '0');
    return `${m}/${y}`;
  }

  // DD/MM/YYYY
  const viMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (viMatch) {
    const m = String(parseInt(viMatch[2], 10)).padStart(2, '0');
    const y = viMatch[3];
    return `${m}/${y}`;
  }

  return '';
}
