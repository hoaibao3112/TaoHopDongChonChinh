/**
 * Quy tắc làm tròn số tấn của công ty:
 * - Cân lúa tính bằng kg. 1 tấn = 1000 kg.
 * - Nếu phần dư >= 333 kg (tức >= 0.333 tấn): Làm tròn LÊN 1 tấn.
 * - Nếu phần dư < 333 kg (tức < 0.333 tấn): Làm tròn XUỐNG.
 * 
 * Ví dụ:
 * - 50.332 kg -> 50 tấn
 * - 50.333 kg -> 51 tấn
 * - 75.125 kg -> 75 tấn
 * - 110.278 kg -> 110 tấn
 * - 112.670 kg -> 113 tấn
 */
export function roundRiceTons(weightKg: number): number {
  if (!weightKg || isNaN(weightKg) || weightKg <= 0) {
    return 0;
  }

  // Làm tròn kg tới số nguyên gần nhất trước để loại bỏ sai số dấu phẩy động
  const totalKg = Math.round(weightKg);
  const wholeTons = Math.floor(totalKg / 1000);
  const remainderKg = totalKg % 1000;

  return remainderKg >= 333 ? wholeTons + 1 : wholeTons;
}
