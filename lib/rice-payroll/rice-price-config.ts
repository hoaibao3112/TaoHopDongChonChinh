/**
 * Cấu hình giá nhập sấy theo loại lúa — Đội Dương Cơ Sở II
 *
 * Nguồn dữ liệu: file mẫu TONG_HOP_DOI_DƯƠNG_CS2_NHẬP_T10_2026
 * ST25 (cao cấp) = 23,000đ/tấn
 * OM18, TL, JAPONICA (phổ thông) = 20,000đ/tấn
 * Chụm lò = 11,000đ/tấn (áp dụng đồng nhất cho tất cả loại lúa)
 */

import { RiceTypePrice } from './nhap-types';

/** Giá chụm lò mặc định (đ/tấn) — áp dụng mọi loại lúa */
export const DEFAULT_CHUM_LO_PRICE = 11_000;

/** Danh sách giá mặc định theo loại lúa (T10/2026) */
export const DEFAULT_RICE_PRICES: RiceTypePrice[] = [
  { riceType: 'ST25 KDM',       pricePerTon: 23_000 },
  { riceType: 'ST25 ĐL',        pricePerTon: 23_000 },
  { riceType: 'OM18',           pricePerTon: 20_000 },
  { riceType: 'JAPONICA-DS1',   pricePerTon: 20_000 },
  { riceType: 'TL4T-Loại 1',    pricePerTon: 20_000 },
  { riceType: 'TL4T-Loại 2',    pricePerTon: 20_000 },
  { riceType: 'TL6T-Loại 2',    pricePerTon: 20_000 },
];

/**
 * Tra giá nhập sấy theo tên loại lúa.
 * So sánh không phân biệt hoa thường & whitespace.
 * Nếu không tìm thấy → trả về 0 (sẽ cần người dùng thêm vào config).
 */
export function getPriceForRiceType(
  riceType: string,
  prices: RiceTypePrice[],
): number {
  const norm = (s: string) => s.trim().toUpperCase().replace(/\s+/g, ' ');
  const target = norm(riceType);
  const found = prices.find((p) => norm(p.riceType) === target);
  return found?.pricePerTon ?? 0;
}

