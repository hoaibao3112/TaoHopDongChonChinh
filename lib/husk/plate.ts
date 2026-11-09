/**
 * Module xử lý biển số xe và phân biệt Xe tải vs Ghe chở trấu
 *
 * Quy tắc:
 * - Biển số xe Việt Nam chuẩn: 2 số + 1 hoặc 2 chữ cái + dấu gạch/khoảng trắng + 4-6 số.
 *   Ví dụ: "63H-02309" -> chuẩn hóa thành "63H 02309"
 * - Regex: /^\d{2}[A-Z]{1,2}[\s-]?\d{4,6}$/i
 * - Nếu khớp -> coi là xe tải.
 * - Ngược lại -> coi là Ghe (ví dụ: "Được Phường", "Ghe Út", "Tàu Lợi").
 */

export interface VehicleInfo {
  isTruck: boolean;
  raw: string;
  normalized: string;
}

export function parseVehicle(rawVehicle: string): VehicleInfo {
  const clean = (rawVehicle || '').trim();
  if (!clean) {
    return {
      isTruck: false,
      raw: '',
      normalized: '',
    };
  }

  // Loại bỏ khoảng trắng thừa giữa các ký tự
  const upper = clean.toUpperCase();

  // Pattern biển số: ví dụ "63H-02309", "63H02309", "63H 02309", "63C-12345", "63AA-12345"
  const truckRegex = /^(\d{2}[A-Z]{1,2})[\s-]?(\d{4,6})$/i;
  const match = upper.match(truckRegex);

  if (match) {
    const series = match[1];
    const number = match[2];
    return {
      isTruck: true,
      raw: clean,
      normalized: `${series} ${number}`,
    };
  }

  // Không phải format biển số -> coi là Ghe
  return {
    isTruck: false,
    raw: clean,
    normalized: clean,
  };
}

/**
 * Định dạng mô tả công việc (Cột D) theo quy tắc:
 * - Nếu là xe: "Xuất một xe trấu 63H 02309 của chị 7" (tên khách viết thường, biển số có khoảng trắng)
 * - Nếu là ghe: "Xuất một ghe trấu Được Phường của chị 7"
 * - Nếu gộp n chuyến: "Xuất {n} chuyến trấu 63H 02309 của chị 7"
 */
export function formatWorkDescription(
  vehicle: string,
  customer: string,
  tripCount: number = 1
): string {
  const vInfo = parseVehicle(vehicle);
  const vName = vInfo.normalized;
  const custLower = (customer || '').trim().toLowerCase();

  if (tripCount > 1) {
    return `Xuất ${tripCount} chuyến trấu ${vName} của ${custLower}`;
  }

  if (vInfo.isTruck) {
    return `Xuất một xe trấu ${vName} của ${custLower}`;
  } else {
    return `Xuất một ghe trấu ${vName} của ${custLower}`;
  }
}

