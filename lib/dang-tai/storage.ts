import fs from 'fs';
import path from 'path';
import { XeDangTai } from './types';

function getRedisConfig(): { url: string; token: string } | null {
  const url = process.env.UPSTASH_REDIS_REST_URL?.replace(/\/$/, '');
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  return { url, token };
}

function getLocalFilePath(dateStr: string): string {
  const dir = path.join(process.cwd(), 'data', 'dang-tai');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  // dateStr sanitized: YYYY-MM-DD
  const cleanDate = dateStr.replace(/[^0-9-]/g, '') || 'default';
  return path.join(dir, `${cleanDate}.json`);
}

/**
 * Đọc danh sách xe đăng tài của một ngày
 */
export async function getDangTaiList(dateStr: string): Promise<XeDangTai[]> {
  // 1. Thử đọc từ Upstash Redis nếu có
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
            return list.sort((a, b) => a.stt - b.stt);
          }
        }
      }
    } catch (err) {
      console.warn('[Storage] Lỗi đọc Redis, chuyển sang file cục bộ:', err);
    }
  }

  // 2. Fallback sang file cục bộ
  try {
    const filePath = getLocalFilePath(dateStr);
    if (fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, 'utf-8');
      const list = JSON.parse(raw);
      if (Array.isArray(list)) {
        return list.sort((a, b) => a.stt - b.stt);
      }
    }
  } catch (err) {
    console.error('[Storage] Lỗi đọc file cục bộ:', err);
  }

  return [];
}

/**
 * Lưu danh sách xe đăng tài của một ngày (đồng bộ cả Redis và file cục bộ)
 */
export async function saveDangTaiList(dateStr: string, list: XeDangTai[]): Promise<boolean> {
  const sorted = [...list].sort((a, b) => a.stt - b.stt);
  const jsonStr = JSON.stringify(sorted, null, 2);

  // 1. Lưu file cục bộ trước để luôn có bản lưu an toàn
  try {
    const filePath = getLocalFilePath(dateStr);
    fs.writeFileSync(filePath, jsonStr, 'utf-8');
  } catch (err) {
    console.error('[Storage] Lỗi ghi file cục bộ:', err);
  }

  // 2. Ghi lên Upstash Redis nếu có
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
