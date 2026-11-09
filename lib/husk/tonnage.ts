/**
 * Module tính toán số tấn trấu theo quy tắc:
 * kg / 1000 CẮT XUỐNG 1 chữ số thập phân (truncate, KHÔNG làm tròn).
 * Ví dụ:
 * - 6840 kg -> 6.8
 * - 7670 kg -> 7.6
 * - 6510 kg -> 6.5
 * - 6590 kg -> 6.5
 * - 6599 kg -> 6.5
 * - 7000 kg -> 7.0 (trả về 7)
 */
export function calculateHuskTons(weightKg: number): number {
  if (!weightKg || isNaN(weightKg) || weightKg <= 0) {
    return 0;
  }
  // Math.floor(kg / 100) / 10 sẽ cắt xuống 1 chữ số thập phân
  const truncated = Math.floor(Math.round(weightKg) / 100) / 10;
  return Number(truncated.toFixed(1));
}

