import fs from 'fs';
import path from 'path';
import { XeDangTai } from './types';
import { getDangTaiListFromDb, saveDangTaiListToDb } from '@/lib/db';

function getRedisConfig(): { url: string; token: string } | null {
  const url = process.env.UPSTASH_REDIS_REST_URL?.replace(/\/$/, '');
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  return { url, token };
}

function getLocalFilePath(dateStr: string): string {
  const dir = path.join(process.cwd(), 'data', 'dang-tai');
  if (!fs.existsSync(dir)) {
    try {
      fs.mkdirSync(dir, { recursive: true });
    } catch {
      // Ignore if read-only on serverless
    }
  }
  const cleanDate = dateStr.replace(/[^0-9-]/g, '') || 'default';
  return path.join(dir, `${cleanDate}.json`);
}

/**
 * Đọc danh sách xe đăng tài của một ngày (ưu tiên Supabase Postgres -> Redis -> Local File)
 */
export async function getDangTaiList(dateStr: string): Promise<XeDangTai[]> {
  // 1. ƯU TIÊN HÀNG ĐẦU: Đọc từ Supabase PostgreSQL
  try {
    const dbList = await getDangTaiListFromDb(dateStr);
    if (dbList && Array.isArray(dbList)) {
      return dbList;
    }
  } catch (err) {
    console.warn('[Storage] Lỗi đọc Supabase DB, chuyển sang fallback:', err);
  }

  // 2. Thử đọc từ Upstash Redis nếu có
  const redisConfig = getRedisConfig();
  if (redisConfig) {
    try {
      const res = await fetch(`${redisConfig.url}/get/dangtai:${encodeURIComponent(dateStr)}`, {
        headers: { Authorization: `Bearer ${redisConfig.token}` },
        cache: 'no-store',
      });
      if (res.ok) {
        const data = await res.json();
        if (data.result && typeof data.result === 'string') {
          const list = JSON.parse(data.result);
          if (Array.isArray(list)) {
            return list;
          }
        }
      }
    } catch (err) {
      console.warn('[Storage] Lỗi đọc Redis, chuyển sang file cục bộ:', err);
    }
  }

  // 3. Fallback sang file cục bộ (khi chạy offline / dev local)
  try {
    const filePath = getLocalFilePath(dateStr);
    if (fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, 'utf-8');
      const list = JSON.parse(raw);
      if (Array.isArray(list)) {
        return list;
      }
    }
  } catch (err) {
    console.error('[Storage] Lỗi đọc file cục bộ:', err);
  }

  return [];
}

/**
 * Lưu danh sách xe đăng tài của một ngày (đồng bộ Supabase Postgres, Redis và file cục bộ)
 */
export async function saveDangTaiList(dateStr: string, list: XeDangTai[]): Promise<boolean> {
  const jsonStr = JSON.stringify(list, null, 2);

  // 1. ƯU TIÊN HÀNG ĐẦU: Lưu vào Supabase PostgreSQL
  try {
    await saveDangTaiListToDb(dateStr, list);
  } catch (err) {
    console.warn('[Storage] Lỗi lưu Supabase DB:', err);
  }

  // 2. Lưu file cục bộ nếu có quyền ghi (dev local)
  try {
    const filePath = getLocalFilePath(dateStr);
    fs.writeFileSync(filePath, jsonStr, 'utf-8');
  } catch (err) {
    // Có thể là môi trường read-only trên Vercel, bỏ qua
  }

  // 3. Ghi lên Upstash Redis nếu có
  const redisConfig = getRedisConfig();
  if (redisConfig) {
    try {
      await fetch(redisConfig.url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${redisConfig.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(['SET', `dangtai:${dateStr}`, jsonStr]),
      });
    } catch (err) {
      console.warn('[Storage] Lỗi ghi Redis:', err);
    }
  }

  return true;
}
