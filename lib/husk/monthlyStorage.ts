import fs from 'fs';
import path from 'path';
import { roundRiceTons } from '@/lib/rice-payroll/rounding';
import { NSXTMEntry, NSXTMTeamKey } from '@/lib/rice-payroll/nsx-tm-types';
import { getHuskMonthlyFromDb, saveHuskMonthlyToDb } from '@/lib/db';
import { extractMonthKey, HuskMonthlyRecord } from './monthlyTypes';

export { extractMonthKey };
export type { HuskMonthlyRecord };

/**
 * Chuyển đổi danh sách mẻ trấu thành các dòng công việc NSXTMEntry
 * để điền trực tiếp vào phân hệ Nhập Sấy NSX TM (Đội Đức & Đội Quý)
 */
export function convertHuskRecordsToNSXTM(records: HuskMonthlyRecord[]): NSXTMEntry[] {
  return records.map((r) => {
    let displayDate = r.date;
    if (r.date.includes('-')) {
      const parts = r.date.split('-');
      if (parts.length === 3) {
        displayDate = `${parts[2].padStart(2, '0')}/${parts[1].padStart(2, '0')}/${parts[0]}`;
      }
    }

    const tons = r.tons || roundRiceTons(r.weightKg);
    const unitPrice = r.unitPrice || 11000;
    const amount = r.amount || Math.round(tons * unitPrice);
    const team: NSXTMTeamKey = r.team === 'QUÝ' ? 'QUÝ' : 'ĐỨC';
    const vType = r.type === 'GHE' ? 'GHE' : 'XE';
    const desc =
      r.description ||
      (vType === 'GHE'
        ? `Xuất trấu ghe ${r.customer}`
        : `Xuất một xe trấu ${r.vehicle || ''} của ${r.customer}`.replace(/\s+/g, ' ').trim());

    return {
      id: `husk-db-${r.id}`,
      source: 'MANUAL',
      date: displayDate,
      team,
      customerName: r.customer,
      riceType: 'Trấu',
      vehicleName: r.vehicle,
      vehicleType: vType,
      jobDescription: desc,
      weightKg: r.weightKg,
      roundedTons: tons,
      unitPriceXuatTrau: unitPrice,
      thanhTienXuatTrau: amount,
      thanhTienSay: 0,
      thanhTienLuaKho: 0,
      tongThanhTien: amount,
      facility: 'NSX TM',
      note: r.note || 'Xuất trấu từ phân hệ Xuất Trấu',
    };
  });
}

function getDataDir(): string {
  try {
    const dir = path.join(process.cwd(), 'data', 'husk');
    if (!fs.existsSync(dir)) {
      try {
        fs.mkdirSync(dir, { recursive: true });
      } catch { }
    }
    return dir;
  } catch {
    return '/tmp';
  }
}

function getMonthlyFilePath(monthKey: string): string {
  const cleanKey = monthKey.replace(/[^0-9]/g, '_');
  return path.join(getDataDir(), `monthly-${cleanKey}.json`);
}

function getRedisConfig(): { url: string; token: string } | null {
  const url = process.env.UPSTASH_REDIS_REST_URL?.replace(/\/$/, '');
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  return { url, token };
}

/**
 * Đọc toàn bộ danh sách mẻ xuất trấu của tháng (PostgreSQL -> Redis -> File)
 */
export async function getHuskRecordsByMonth(monthKey: string): Promise<HuskMonthlyRecord[]> {
  const cleanKey = monthKey.trim();
  if (!cleanKey) return [];

  // 1. Thử đọc từ Supabase Postgres
  try {
    const dbRows = await getHuskMonthlyFromDb(cleanKey);
    if (dbRows && Array.isArray(dbRows) && dbRows.length > 0) {
      return dbRows as HuskMonthlyRecord[];
    }
  } catch (err) {
    console.warn(`[HuskStorage] DB get warning for ${cleanKey}:`, err);
  }

  // 2. Thử đọc từ Redis
  const redis = getRedisConfig();
  if (redis) {
    try {
      const res = await fetch(`${redis.url}/get/husk:monthly:${cleanKey}`, {
        headers: { Authorization: `Bearer ${redis.token}` },
        cache: 'no-store',
      });
      if (res.ok) {
        const data = await res.json();
        if (data.result && typeof data.result === 'string') {
          const list = JSON.parse(data.result);
          if (Array.isArray(list) && list.length > 0) {
            return list as HuskMonthlyRecord[];
          }
        }
      }
    } catch (err) {
      console.warn(`[HuskStorage] Redis get warning for ${cleanKey}:`, err);
    }
  }

  // 3. Fallback đọc từ file JSON cục bộ
  try {
    const filePath = getMonthlyFilePath(cleanKey);
    if (fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, 'utf-8');
      const list = JSON.parse(raw);
      if (Array.isArray(list)) return list as HuskMonthlyRecord[];
    }
  } catch (err) {
    console.warn(`[HuskStorage] File read warning for ${cleanKey}:`, err);
  }

  return [];
}

/**
 * Lưu danh sách mẻ xuất trấu của tháng vào CSDL (PostgreSQL -> File -> Redis)
 */
export async function saveHuskRecordsByMonth(
  monthKey: string,
  items: HuskMonthlyRecord[]
): Promise<boolean> {
  const cleanKey = monthKey.trim();
  if (!cleanKey) return false;

  // 1. Lưu vào Supabase Postgres
  try {
    await saveHuskMonthlyToDb(cleanKey, items);
  } catch (err) {
    console.warn(`[HuskStorage] DB save warning for ${cleanKey}:`, err);
  }

  // 2. Lưu vào file JSON cục bộ
  try {
    const filePath = getMonthlyFilePath(cleanKey);
    fs.writeFileSync(filePath, JSON.stringify(items, null, 2), 'utf-8');
  } catch (err) {
    console.warn(`[HuskStorage] File write warning for ${cleanKey}:`, err);
  }

  // 3. Đồng bộ lên Redis
  const redis = getRedisConfig();
  if (redis) {
    try {
      await fetch(`${redis.url}/set/husk:monthly:${cleanKey}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${redis.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(JSON.stringify(items)),
      });
    } catch (err) {
      console.warn(`[HuskStorage] Redis set warning for ${cleanKey}:`, err);
    }
  }

  return true;
}

/**
 * Cập nhật nhiều mẻ xuất trấu, tự động gom nhóm theo tháng và lưu vào đúng tháng tương ứng trong CSDL
 */
export async function upsertHuskBatch(
  newItems: HuskMonthlyRecord[]
): Promise<{ savedMonths: string[]; count: number }> {
  if (!newItems || newItems.length === 0) {
    return { savedMonths: [], count: 0 };
  }

  // Gom nhóm theo monthKey
  const groups: Record<string, HuskMonthlyRecord[]> = {};

  for (const item of newItems) {
    const mKey = item.monthKey || extractMonthKey(item.date) || '10/2026';
    if (!groups[mKey]) groups[mKey] = [];
    groups[mKey].push({
      ...item,
      monthKey: mKey,
      updatedAt: new Date().toISOString(),
    });
  }

  const savedMonths: string[] = [];

  for (const [mKey, incoming] of Object.entries(groups)) {
    // Đọc các mẻ đã có của tháng đó
    const existing = await getHuskRecordsByMonth(mKey);
    const existingMap = new Map(existing.map((e) => [e.id, e]));

    // Cập nhật hoặc thêm mới
    for (const inc of incoming) {
      existingMap.set(inc.id, inc);
    }

    const merged = Array.from(existingMap.values());
    await saveHuskRecordsByMonth(mKey, merged);
    savedMonths.push(mKey);
  }

  return { savedMonths, count: newItems.length };
}

/**
 * Xóa 1 mẻ xuất trấu khỏi CSDL tháng
 */
export async function deleteHuskRecord(
  monthKey: string,
  recordId: string
): Promise<{ success: boolean; items: HuskMonthlyRecord[] }> {
  const cleanKey = monthKey.trim();
  const existing = await getHuskRecordsByMonth(cleanKey);
  const remaining = existing.filter((item) => item.id !== recordId);

  if (remaining.length === existing.length) {
    return { success: false, items: existing };
  }

  await saveHuskRecordsByMonth(cleanKey, remaining);
  return { success: true, items: remaining };
}

/**
 * Cập nhật thông tin 1 mẻ xuất trấu trong CSDL tháng (vd: đổi đội Đức/Quý, sửa biển số, đơn giá...)
 */
export async function updateHuskRecord(
  monthKey: string,
  updated: Partial<HuskMonthlyRecord> & { id: string }
): Promise<{ success: boolean; items: HuskMonthlyRecord[] }> {
  const cleanKey = monthKey.trim();
  const existing = await getHuskRecordsByMonth(cleanKey);

  let found = false;
  const updatedList = existing.map((item) => {
    if (item.id === updated.id) {
      found = true;
      const mergedItem = { ...item, ...updated, updatedAt: new Date().toISOString() };
      // Tự tính lại tiền nếu tấn hoặc đơn giá thay đổi
      if (updated.tons !== undefined || updated.unitPrice !== undefined) {
        const tons = updated.tons !== undefined ? updated.tons : item.tons;
        const unitPrice = updated.unitPrice !== undefined ? updated.unitPrice : item.unitPrice;
        mergedItem.amount = Math.round(tons * unitPrice);
      }
      return mergedItem;
    }
    return item;
  });

  if (!found) {
    return { success: false, items: existing };
  }

  await saveHuskRecordsByMonth(cleanKey, updatedList);
  return { success: true, items: updatedList };
}

/**
 * Xóa toàn bộ số liệu xuất trấu của một tháng
 */
export async function clearHuskRecordsByMonth(monthKey: string): Promise<boolean> {
  const cleanKey = monthKey.trim();
  return await saveHuskRecordsByMonth(cleanKey, []);
}
