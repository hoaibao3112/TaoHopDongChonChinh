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

/** Danh sách giá mặc định theo loại lúa (T10 & T11/2026) */
export const DEFAULT_RICE_PRICES: RiceTypePrice[] = [
  { riceType: 'ST25 KDM',       pricePerTon: 23_000 },
  { riceType: 'ST25 ĐL',        pricePerTon: 23_000 },
  { riceType: 'L5451',          pricePerTon: 20_000 },
  { riceType: 'OM5451',         pricePerTon: 20_000 },
  { riceType: 'OM18',           pricePerTon: 20_000 },
  { riceType: 'JAPONICA-DS1',   pricePerTon: 20_000 },
  { riceType: 'TL4T-Loại 1',    pricePerTon: 20_000 },
  { riceType: 'TL4T-Loại 2',    pricePerTon: 20_000 },
  { riceType: 'TL6T-Loại 2',    pricePerTon: 20_000 },
  { riceType: 'ĐÀI THƠM 8',     pricePerTon: 20_000 },
  { riceType: 'OM380',          pricePerTon: 20_000 },
  { riceType: 'ST24',           pricePerTon: 20_000 },
];

/**
 * Tra giá nhập sấy theo tên loại lúa.
 * 1. So sánh chính xác không phân biệt hoa thường & khoảng trắng.
 * 2. Nếu chưa có tên chính xác, tự động nhận diện theo nhóm giống lúa (5451, ST25, OM, TL...).
 * 3. Nếu hoàn toàn không xác định được → trả về 0 để người dùng đặt giá.
 */
export function getPriceForRiceType(
  riceType: string,
  prices: RiceTypePrice[],
): number {
  if (!riceType) return 0;
  const norm = (s: string) => s.trim().toUpperCase().replace(/\s+/g, ' ');
  const target = norm(riceType);

  // 1. So khớp chính xác
  const found = prices.find((p) => norm(p.riceType) === target);
  if (found) return found.pricePerTon;

  // 2. Tự động nhận diện thông minh theo nhóm giống lúa
  // Nhóm lúa cao cấp ST25 / HP1
  if (target.includes('ST25') || target.includes('HP1')) {
    const pSt25 = prices.find((p) => norm(p.riceType).includes('ST25'))?.pricePerTon;
    return pSt25 ?? 23_000;
  }

  // Nhóm lúa 5451 (L5451, OM5451, 5451, LÚA 5451...)
  if (target.includes('5451')) {
    const p5451 = prices.find((p) => norm(p.riceType).includes('5451'))?.pricePerTon;
    return p5451 ?? 20_000;
  }

  // Nhóm lúa OM (OM18, OM380, OM4900, OM...)
  if (target.includes('OM')) {
    const pOm = prices.find((p) => norm(p.riceType).includes('OM'))?.pricePerTon;
    return pOm ?? 20_000;
  }

  // Nhóm Japonica / DS1
  if (target.includes('JAPONICA') || target.includes('DS1') || target.includes('DS-1')) {
    const pJapo = prices.find((p) => norm(p.riceType).includes('JAPONICA') || norm(p.riceType).includes('DS1'))?.pricePerTon;
    return pJapo ?? 20_000;
  }

  // Nhóm TL (TL4T, TL6T...)
  if (target.startsWith('TL') || target.includes('TL4T') || target.includes('TL6T')) {
    const pTl = prices.find((p) => norm(p.riceType).startsWith('TL'))?.pricePerTon;
    return pTl ?? 20_000;
  }

  // Nhóm Đài Thơm / ST24 / Nếp
  if (target.includes('ĐÀI THƠM') || target.includes('DAI THOM') || target.includes('DT8') || target.includes('ST24') || target.includes('NẾP') || target.includes('NEP')) {
    return 20_000;
  }

  return 0;
}

