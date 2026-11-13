import * as XLSX from 'xlsx';
import { NSXTMEntry } from './nsx-tm-types';
import { roundRiceTons } from './rounding';
import {
  detectVehicleType,
  formatToDateStr,
  autoAssignAlternating2Days,
  autoAssignAlternating1Day,
  parseVnDate,
} from './nsx-tm-utils';

export {
  detectVehicleType,
  formatToDateStr,
  autoAssignAlternating2Days,
  autoAssignAlternating1Day,
  parseVnDate,
};

/**
 * Parse File Lúa Tươi (THỊNH_TỔNG SỐ LIỆU NHẬP LÚA TƯƠI 2026.xlsx)
 * Header ở hàng 3 (index 2):
 *  - Cột D (index 3): KHÁCH HÀNG
 *  - Cột E (index 4): PHƯƠNG TIỆN
 *  - Cột F (index 5): LOẠI LÚA
 *  - Cột Y (index 24): NGÀY NHẬP SẤY
 *  - Cột Z (index 25): ĐỊA ĐIỂM SẤY (CƠ SỞ SẤY)
 *  - Cột AB (index 27): CÂN NHẬP SẤY (KG)
 */
export function parseLuaTuoiWorkbook(wb: XLSX.WorkBook): NSXTMEntry[] {
  const sheetName =
    wb.SheetNames.find((n) => n.toUpperCase().includes('LUA TUOI') || n.toUpperCase().includes('LÚA TƯƠI')) ||
    wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  if (!ws) return [];

  const rawData: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  const entries: NSXTMEntry[] = [];

  // Dữ liệu bắt đầu từ hàng 4 (index 3)
  for (let r = 3; r < rawData.length; r++) {
    const row = rawData[r];
    if (!row || row.length === 0) continue;

    const fac = String(row[25] || '').trim().toUpperCase(); // Cột Z: ĐỊA ĐIỂM SẤY
    // Lọc các mẻ tại NSX TM / NSX ĐTM / CCĐTM / TÂN MỸ
    const isNSXTM =
      fac.includes('NSX TM') ||
      fac.includes('NSX ĐTM') ||
      fac.includes('CCĐTM') ||
      fac.includes('TÂN MỸ') ||
      fac.includes('TM');
    if (!isNSXTM) continue;

    // Cột Y: NGÀY NHẬP SẤY (index 24), fallback Cột B: NGÀY CÂN (index 1)
    const dateRaw = row[24] || row[1];
    const dateStr = formatToDateStr(dateRaw);
    if (!dateStr) continue;

    const customer = String(row[3] || '').trim(); // Cột D: KHÁCH HÀNG (index 3)
    const vehicle = String(row[4] || '').trim();  // Cột E: PHƯƠNG TIỆN (index 4)
    const riceType = String(row[5] || '').trim(); // Cột F: LOẠI LÚA (index 5)

    // Cột AB: CÂN NHẬP SẤY (KG) (index 27), fallback Cột H (index 7)
    const kgRaw = row[27] || row[7] || 0;
    const kg = typeof kgRaw === 'number' ? kgRaw : parseFloat(String(kgRaw).replace(/[^\d.-]/g, '')) || 0;
    if (kg <= 0) continue;

    const vType = detectVehicleType(vehicle);

    // Đơn giá: Xe = 25.000 đ/tấn, Ghe = 15.000 đ/tấn
    const pricePerTon = vType === 'XE' ? 25000 : 15000;

    // Tấn quy đổi làm tròn theo nguyên tắc: >= 500kg làm tròn lên 1 tấn, < 500kg làm tròn xuống
    const tons = roundRiceTons(kg);
    const amount = tons * pricePerTon;

    // Câu mô tả công việc tự động:
    // Phương tiện ghi Y CHANG nguyên văn theo Excel, không viết tắt; Ghi rõ từ "lúa tươi" vào công việc
    const vUpper = vehicle.toUpperCase();
    let ptText = vehicle;
    if (vUpper.startsWith('TÀU') || vUpper.startsWith('GHE') || vUpper.startsWith('SALAN') || vUpper.startsWith('SÀ LAN') || vUpper.startsWith('XE')) {
      ptText = vehicle;
    } else if (vType === 'XE') {
      ptText = `1 xe ${vehicle}`;
    } else {
      ptText = `ghe ${vehicle}`;
    }

    const cleanRiceType = riceType.replace(/^lúa\s+/i, '').trim();
    const workDesc = `Nhập ${ptText} lúa tươi ${cleanRiceType} của ${customer}`.replace(/\s+/g, ' ').trim();

    entries.push({
      id: `tuoi-${r}-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      source: 'LUA_TUOI',
      date: dateStr,
      team: 'ĐỨC', // Mặc định, sau đó hàm autoAssign sẽ chia xen kẽ
      customerName: customer,
      riceType,
      vehicleName: vehicle,
      vehicleType: vType,
      jobDescription: workDesc,
      weightKg: kg,
      roundedTons: tons,
      unitPriceSayXe: vType === 'XE' ? 25000 : 0,
      unitPriceSayGhe: vType === 'GHE' ? 15000 : 0,
      thanhTienSay: amount,
      thanhTienLuaKho: 0,
      tongThanhTien: amount,
      facility: fac || 'NSX TM',
    });
  }

  return entries;
}

/**
 * Parse File Lúa Khô (THỊNH_TỔNG NHẬP LÚA KHÔ NĂM 2026.xlsx)
 * Header ở hàng 6 (index 5):
 *  - Cột D (index 3): NHÀ CUNG CẤP / KHÁCH HÀNG
 *  - Cột E (index 4): PHƯƠNG TIỆN
 *  - Cột F (index 5): LOẠI LÚA
 *  - Cột AD (index 29): NHẬP NSX TM (NGÀY)
 *  - Cột AE (index 30): CÂN CTY/ NSX (KG)
 */
export function parseLuaKhoWorkbook(wb: XLSX.WorkBook): NSXTMEntry[] {
  const sheetName =
    wb.SheetNames.find((n) => n.toUpperCase().includes('LUA KHÔ') || n.toUpperCase().includes('LÚA KHÔ') || n.toUpperCase().includes('TỔNG HỢP')) ||
    wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  if (!ws) return [];

  const rawData: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  const entries: NSXTMEntry[] = [];

  // Dữ liệu bắt đầu từ dòng 7 (index 6)
  for (let r = 6; r < rawData.length; r++) {
    const row = rawData[r];
    if (!row || row.length === 0) continue;

    // Cột AD: NGÀY NHẬP NSX TM (index 29)
    const dateRaw = row[29];
    // Cột AE: CÂN CTY/ NSX (KG) (index 30)
    const kgRaw = row[30];

    const kg = typeof kgRaw === 'number' ? kgRaw : parseFloat(String(kgRaw).replace(/[^\d.-]/g, '')) || 0;
    if (kg <= 0) continue; // Không nhập NSX TM hoặc không có số lượng

    const dateStr = formatToDateStr(dateRaw);
    if (!dateStr) continue;

    const customer = String(row[3] || '').trim(); // Cột D: NHÀ CUNG CẤP (index 3)
    const vehicle = String(row[4] || '').trim();  // Cột E: PHƯƠNG TIỆN (index 4)
    const riceType = String(row[5] || '').trim(); // Cột F: LOẠI LÚA (index 5)

    const vType = detectVehicleType(vehicle);

    // Đơn giá lúa khô NSX TM: 20.000 đ/tấn
    const pricePerTon = 20000;
    const tons = roundRiceTons(kg);
    const amount = tons * pricePerTon;

    // Mô tả công việc: "Nhập {ghe} {phương tiện} Lúa khô {loại lúa} của {nhà cung cấp}"
    // Phương tiện ghi Y CHANG nguyên văn, không viết tắt; lấy tên Nhà Cung Cấp, không lấy mã lô
    const vUpper = vehicle.toUpperCase();
    let ptText = vehicle;
    if (vUpper.startsWith('TÀU') || vUpper.startsWith('GHE') || vUpper.startsWith('SALAN') || vUpper.startsWith('SÀ LAN') || vUpper.startsWith('XE')) {
      ptText = vehicle;
    } else if (vType === 'XE') {
      ptText = `1 xe ${vehicle}`;
    } else {
      ptText = `ghe ${vehicle}`;
    }

    const cleanRiceType = riceType.replace(/^lúa\s+/i, '').trim();
    const workDesc = `Nhập ${ptText} lúa khô ${cleanRiceType} của ${customer}`.replace(/\s+/g, ' ').trim();

    entries.push({
      id: `kho-${r}-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      source: 'LUA_KHO',
      date: dateStr,
      team: 'ĐỨC',
      customerName: customer,
      riceType,
      vehicleName: vehicle,
      vehicleType: vType,
      jobDescription: workDesc,
      weightKg: kg,
      roundedTons: tons,
      unitPriceLuaKho: 20000,
      thanhTienSay: 0,
      thanhTienLuaKho: amount,
      tongThanhTien: amount,
      facility: 'NSX TM',
    });
  }

  return entries;
}
