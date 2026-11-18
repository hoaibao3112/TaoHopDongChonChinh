import { NSXTMEntry, NSXTMVehicleType } from './nsx-tm-types';

/**
 * Kiểm tra phương tiện là Xe hay Ghe
 */
export function detectVehicleType(vehicleName: string): NSXTMVehicleType {
  const v = (vehicleName || '').trim().toUpperCase();
  if (!v) return 'GHE';

  // Nếu có chữ XE, XE TẢI, TẢI, ĐẦU KÉO
  if (v.includes('XE') || v.includes('TẢI') || v.includes('ĐẦU KÉO') || v.includes('CONTAINER')) {
    return 'XE';
  }

  // Nếu có chữ GHE, TÀU, SALAN, SÀ LAN, VỎ, XUỒNG, NN (Nguyên Nguyên)
  if (v.includes('GHE') || v.includes('TÀU') || v.includes('SALAN') || v.includes('SÀ LAN') || v.startsWith('NN')) {
    return 'GHE';
  }

  // Kiểm tra biển số xe Việt Nam: VD 62H 00596, 66A 47312, 36H-13062, 54Y 7029, 63C 13680, 47H 03528...
  const licensePlateRegex = /\b\d{2}[A-Z]\s*[-]?\s*\d{3,5}\b/i;
  if (licensePlateRegex.test(v)) {
    return 'XE';
  }

  // Mặc định sông nước miền Tây là Ghe nếu không phải biển số xe
  return 'GHE';
}

/**
 * Chuyển số serial Excel hoặc chuỗi ngày thành DD/MM/YYYY
 */
export function formatToDateStr(val: unknown): string {
  if (val === undefined || val === null || val === '') return '';

  if (typeof val === 'number') {
    // Excel serial date (Windows 1900 system)
    const utcDays = Math.floor(val - 25569);
    const dateObj = new Date(utcDays * 86400 * 1000);
    const d = String(dateObj.getUTCDate()).padStart(2, '0');
    const m = String(dateObj.getUTCMonth() + 1).padStart(2, '0');
    const y = dateObj.getUTCFullYear();
    return `${d}/${m}/${y}`;
  }

  const str = String(val).trim();
  if (!str) return '';

  // Đã có dạng DD/MM/YYYY
  const dmYMatch = str.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
  if (dmYMatch) {
    const d = dmYMatch[1].padStart(2, '0');
    const m = dmYMatch[2].padStart(2, '0');
    const y = dmYMatch[3];
    return `${d}/${m}/${y}`;
  }

  // Dạng ISO YYYY-MM-DD
  const isoMatch = str.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})/);
  if (isoMatch) {
    const y = isoMatch[1];
    const m = isoMatch[2].padStart(2, '0');
    const d = isoMatch[3].padStart(2, '0');
    return `${d}/${m}/${y}`;
  }

  return str;
}

/**
 * Parse chuỗi DD/MM/YYYY thành timestamp để sắp xếp
 */
export function parseVnDate(str: string): number {
  if (!str) return 0;
  const match = str.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
  if (match) {
    const d = parseInt(match[1], 10);
    const m = parseInt(match[2], 10) - 1;
    const y = parseInt(match[3], 10);
    return new Date(y, m, d).getTime();
  }
  return 0;
}

/**
 * Tự động phân chia ĐỘI xen kẽ 2 ngày (2 ngày Đức - 2 ngày Quý):
 * Nhóm theo ngày tăng dần.
 * Ngày 1 & 2 -> ĐỨC
 * Ngày 3 & 4 -> QUÝ
 * Ngày 5 & 6 -> ĐỨC
 * ...
 */
export function autoAssignAlternating2Days(entries: NSXTMEntry[]): NSXTMEntry[] {
  // Lấy danh sách các ngày duy nhất có trong dữ liệu và sắp xếp theo thứ tự thời gian
  const uniqueDates = Array.from(new Set(entries.map((e) => e.date).filter(Boolean)));
  uniqueDates.sort((a, b) => parseVnDate(a) - parseVnDate(b));

  // Gán đội cho từng ngày theo chu kỳ 2 ngày: 0,1 -> ĐỨC; 2,3 -> QUÝ; 4,5 -> ĐỨC...
  const dateToTeamMap = new Map<string, 'ĐỨC' | 'QUÝ'>();
  uniqueDates.forEach((dateStr, index) => {
    const cycle = Math.floor(index / 2) % 2;
    dateToTeamMap.set(dateStr, cycle === 0 ? 'ĐỨC' : 'QUÝ');
  });

  return entries.map((e) => {
    const assignedTeam = dateToTeamMap.get(e.date) || 'ĐỨC';
    return {
      ...e,
      team: assignedTeam,
    };
  });
}

/**
 * Tự động phân chia ĐỘI xen kẽ 1 ngày (Chẵn / Lẻ)
 */
export function autoAssignAlternating1Day(entries: NSXTMEntry[]): NSXTMEntry[] {
  return entries.map((e) => {
    const day = parseInt(e.date.split('/')[0] || '1', 10);
    return {
      ...e,
      team: day % 2 !== 0 ? 'ĐỨC' : 'QUÝ', // Ngày lẻ: ĐỨC, Ngày chẵn: QUÝ
    };
  });
}

/**
 * Chuyển đổi chuỗi ngày thành khóa sắp xếp số (dd/mm/yyyy -> yyyymmdd)
 */
export function parseDateSortKey(dateVal?: any): number {
  if (!dateVal) return 0;
  if (typeof dateVal === 'number') return dateVal;
  const str = String(dateVal).trim();
  if (str.includes('/')) {
    const parts = str.split('/');
    if (parts.length >= 3) {
      const d = parseInt(parts[0], 10) || 0;
      const m = parseInt(parts[1], 10) || 0;
      let y = parseInt(parts[2], 10) || 0;
      if (y < 100) y += 2000;
      return y * 10000 + m * 100 + d;
    }
  } else if (str.includes('-')) {
    const parts = str.split('-');
    if (parts.length >= 3) {
      if (parts[0].length === 4) {
        const y = parseInt(parts[0], 10) || 0;
        const m = parseInt(parts[1], 10) || 0;
        const d = parseInt(parts[2], 10) || 0;
        return y * 10000 + m * 100 + d;
      } else {
        const d = parseInt(parts[0], 10) || 0;
        const m = parseInt(parts[1], 10) || 0;
        let y = parseInt(parts[2], 10) || 0;
        if (y < 100) y += 2000;
        return y * 10000 + m * 100 + d;
      }
    }
  }
  return 0;
}

/**
 * Sắp xếp danh sách mẻ nhập sấy NSX TM theo thứ tự ngày tăng dần từ 1 đến 30/31
 */
export function sortEntriesByDate(list: NSXTMEntry[]): NSXTMEntry[] {
  return list
    .map((item, originalIndex) => ({ item, originalIndex }))
    .sort((a, b) => {
      const kA = parseDateSortKey(a.item.date);
      const kB = parseDateSortKey(b.item.date);
      if (kA !== kB) return kA - kB;
      return a.originalIndex - b.originalIndex;
    })
    .map(({ item }) => item);
}


